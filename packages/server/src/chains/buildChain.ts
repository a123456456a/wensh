import type { AIMessage } from "@langchain/core/messages";
import type {
  AuthUser,
  ChartHint,
  HistoryItem,
  ModelType,
  QueryRequest,
  QuerySuccessResponse,
  QueryTiming,
  QueryTokenUsage,
  RouteResult,
  StreamEvent,
} from "@wensh/shared";
import { HumanMessage } from "@langchain/core/messages";
import { getDomainAdapter } from "../adapters/registry.js";
import type { DomainDataAdapter, SchemaBundle } from "../adapters/types.js";
import {
  extractChartHint,
  extractSql,
  stripChartTag,
} from "../utils/sqlExtract.js";
import { assertSqlSafe } from "../utils/sqlSafety.js";
import {
  accumulateQueryTokens,
  createEmptyQueryTokenUsage,
  extractTokenUsage,
} from "../utils/tokenUsage.js";
import {
  getModel,
  getModelName,
  resolveQueryModel,
  routeModelForQuery,
} from "./modelRouter.js";
import { QueryChainError } from "./queryChainError.js";

/** SSE 事件发送器 */
export type StreamEmitter = (event: StreamEvent) => void;

/**
 * 从流式 chunk 提取文本增量
 */
function chunkToText(content: AIMessage["content"]): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "string" ? part : "text" in part ? String(part.text) : "",
      )
      .join("");
  }
  return "";
}

/**
 * 构建 history 上下文 Prompt 片段
 */
function buildHistoryContext(history?: HistoryItem[]): string {
  if (!history || history.length === 0) {
    return "";
  }

  const recent = history.slice(-2);
  const lines = recent.map((item, idx) => {
    const roundLabel =
      recent.length === 1 || idx === recent.length - 1 ? "上一轮" : "上两轮";
    return `- ${roundLabel}问题：${item.question} | 生成的SQL：${item.sql}`;
  });

  return `以下是最近对话，当前问题可能是追问，请结合上下文理解：\n${lines.join("\n")}\n`;
}

/**
 * 构建 SQL 生成 Prompt
 * @param question - 用户问题
 * @param schema - 域 Schema bundle
 * @param domainLabel - 业务域展示名
 * @param history - 多轮历史
 * @param errorFeedback - 上次失败信息
 */
function buildSqlPrompt(
  question: string,
  schema: SchemaBundle,
  domainLabel: string,
  history?: HistoryItem[],
  errorFeedback?: string,
): string {
  const dialectLabel = schema.dialect === "mysql" ? "MySQL" : "SQLite";
  const historyContext = buildHistoryContext(history);

  let prompt = `你是一个专业的数据库查询助手，帮助用户查询${domainLabel}业务数据库。

数据库表结构如下：
${schema.promptSchema}

业务指标口径：
${schema.metricsPrompt}

${historyContext}
用户问题：${question}

请生成一条标准 ${dialectLabel} 查询语句，要求：
1. 只生成 SELECT，不生成任何修改性 SQL
2. 用 \`\`\`sql ... \`\`\` 包裹 SQL
3. 列名使用中文别名（如 yield_rate AS 良率）
4. 日期过滤使用 DATE() 函数
5. 结果行数可能很大时请加 LIMIT 1000
6. 不要解释，只输出 SQL`;

  if (errorFeedback) {
    prompt += `\n\n上次生成失败，错误信息：${errorFeedback}\n请修正后重新生成。`;
  }

  return prompt;
}

/**
 * 构建结果解读 Prompt
 */
function buildInterpretPrompt(
  question: string,
  rows: Record<string, unknown>[],
): string {
  const summary = JSON.stringify(rows.slice(0, 10), null, 0);
  return `用户问题：${question}
查询结果（前10行）：${summary}

请用一句话解读查询结果，并在末尾用 [chart:bar]、[chart:line] 或 [chart:table] 标注最适合的可视化类型。
规则：时间序列为 line，分类对比为 bar，明细列过多或为单行多列时用 table。`;
}

/**
 * 调用 LLM 生成并校验 SQL（失败抛出 QueryChainError）
 */
async function invokeSqlGeneration(
  model: ReturnType<typeof getModel>,
  question: string,
  schema: SchemaBundle,
  domainLabel: string,
  history?: HistoryItem[],
  errorFeedback?: string,
  emit?: StreamEmitter,
  modelUsed?: ModelType,
): Promise<{ sql: string; tokens: ReturnType<typeof extractTokenUsage> }> {
  const prompt = buildSqlPrompt(question, schema, domainLabel, history, errorFeedback);

  if (emit && modelUsed) {
    return streamLlmCall(model, prompt, emit, modelUsed, "sql_delta");
  }

  const response = await model.invoke([new HumanMessage(prompt)]);
  const content =
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);
  const tokens = extractTokenUsage(response);

  const sql = extractSql(content);
  if (!sql) {
    throw new QueryChainError("未能从模型输出中提取 SQL");
  }

  try {
    assertSqlSafe(sql);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new QueryChainError(msg, { sql });
  }

  return { sql, tokens };
}

/**
 * 流式调用 LLM，完成后解析 SQL
 */
async function streamLlmCall(
  model: ReturnType<typeof getModel>,
  prompt: string,
  emit: StreamEmitter,
  modelUsed: ModelType,
  deltaType: "sql_delta" | "interpret_delta",
): Promise<{ sql: string; tokens: ReturnType<typeof extractTokenUsage> }> {
  let content = "";
  let tokens = createEmptyQueryTokenUsage().local;

  const stream = await model.stream([new HumanMessage(prompt)]);
  for await (const chunk of stream) {
    const delta = chunkToText(chunk.content);
    if (delta) {
      content += delta;
      emit({ type: deltaType, delta });
    }
    if (chunk.usage_metadata) {
      tokens = extractTokenUsage(chunk);
    }
  }

  emit({ type: "tokens", model_used: modelUsed, usage: tokens });

  const sql = extractSql(content);
  if (!sql) {
    throw new QueryChainError("未能从模型输出中提取 SQL");
  }

  try {
    assertSqlSafe(sql);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new QueryChainError(msg, { sql });
  }

  emit({ type: "sql", sql });
  return { sql, tokens };
}

/**
 * 流式解读结果
 */
async function streamInterpretation(
  model: ReturnType<typeof getModel>,
  modelUsed: ModelType,
  question: string,
  rows: Record<string, unknown>[],
  emit: StreamEmitter,
): Promise<{
  interpretation: string;
  chartHint: ChartHint;
  tokens: ReturnType<typeof extractTokenUsage>;
}> {
  const prompt = buildInterpretPrompt(question, rows);
  let content = "";
  let tokens = createEmptyQueryTokenUsage().local;

  const stream = await model.stream([new HumanMessage(prompt)]);
  for await (const chunk of stream) {
    const delta = chunkToText(chunk.content);
    if (delta) {
      content += delta;
      emit({ type: "interpret_delta", delta });
    }
    if (chunk.usage_metadata) {
      tokens = extractTokenUsage(chunk);
    }
  }

  emit({ type: "tokens", model_used: modelUsed, usage: tokens });

  const chartHint = extractChartHint(content) ?? inferChartHint(
    rows.length > 0 ? Object.keys(rows[0]) : [],
    rows,
  );

  return {
    interpretation: stripChartTag(content),
    chartHint,
    tokens,
  };
}

/**
 * 生成 SQL 并执行（提取失败或执行失败均可重试 1 次）
 */
async function generateAndExecuteSql(
  adapter: DomainDataAdapter,
  schema: SchemaBundle,
  model: ReturnType<typeof getModel>,
  modelUsed: ModelType,
  question: string,
  history?: HistoryItem[],
  chainContext?: {
    model_used: QuerySuccessResponse["model_used"];
    model_name: string;
    authUser?: AuthUser;
  },
  emit?: StreamEmitter,
  tokenBucket?: QueryTokenUsage,
): Promise<{ sql: string; columns: string[]; rows: Record<string, unknown>[]; sqlGenMs: number; execMs: number }> {
  const genStart = Date.now();
  let lastSql: string | undefined;
  let lastError = "SQL 生成或执行失败";

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (emit) {
        emit({
          type: "phase",
          phase: "sql_generating",
          message: attempt > 0 ? "SQL 修正中..." : "正在生成 SQL...",
        });
      }

      const { sql, tokens } = await invokeSqlGeneration(
        model,
        question,
        schema,
        adapter.label,
        history,
        attempt > 0 ? lastError : undefined,
        emit,
        modelUsed,
      );

      if (tokenBucket) {
        accumulateQueryTokens(tokenBucket, modelUsed, tokens);
      }

      lastSql = sql;

      if (emit) {
        emit({ type: "phase", phase: "executing", message: "正在执行查询..." });
      }

      const execStart = Date.now();
      const result = await adapter.executeQuery({
        sql,
        sourceQuestion: question,
        authUser: chainContext?.authUser,
      });

      if (emit) {
        emit({
          type: "data",
          columns: result.columns,
          rows: result.rows,
          row_count: result.rowCount,
        });
      }

      return {
        sql,
        columns: result.columns,
        rows: result.rows,
        sqlGenMs: Date.now() - genStart,
        execMs: Date.now() - execStart,
      };
    } catch (err) {
      if (err instanceof QueryChainError && err.context.sql) {
        lastSql = err.context.sql;
      }
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt === 1) {
        throw new QueryChainError(lastError, {
          sql: lastSql,
          model_used: chainContext?.model_used,
          model_name: chainContext?.model_name,
        });
      }
    }
  }

  throw new QueryChainError(lastError, {
    sql: lastSql,
    model_used: chainContext?.model_used,
    model_name: chainContext?.model_name,
  });
}

/**
 * 无 chart_hint 时根据列类型推断图表类型
 */
function inferChartHint(
  columns: string[],
  rows: Record<string, unknown>[],
): ChartHint {
  if (columns.length <= 1 || rows.length === 0) {
    return "table";
  }

  const firstCol = columns[0];
  const firstValues = rows.map((r) => String(r[firstCol] ?? ""));
  const looksLikeDate = firstValues.some((v) => /^\d{4}-\d{2}/.test(v));

  const numericCols = columns.slice(1).filter((col) =>
    rows.some((r) => typeof r[col] === "number"),
  );

  if (looksLikeDate && numericCols.length > 0) {
    return "line";
  }
  if (columns.length === 2 && numericCols.length === 1) {
    return "bar";
  }
  if (numericCols.length > 0) {
    return "bar";
  }
  return "table";
}

/**
 * 判断是否为无需查数的闲聊/问候类消息
 * @param question - 用户输入
 */
export function isChatOnlyQuestion(question: string): boolean {
  const trimmed = question.trim();
  return /^(你好|您好|hello|hi|hey|帮助|怎么用|如何使用)[!.?，。~\s]*$/i.test(
    trimmed,
  );
}

/**
 * 构建闲聊模式 Prompt
 * @param question - 用户消息
 * @param domainLabel - 业务域展示名
 */
function buildChatPrompt(question: string, domainLabel: string): string {
  return `你是「问数」助手，帮助用户用自然语言查询${domainLabel}业务数据。

用户消息：${question}

请友好、简洁地回复。若用户在打招呼或询问用法，介绍你能做什么并给出 1～2 个示例问题。
不要生成 SQL，不要编造查询结果。`;
}

/**
 * 流式输出 LLM 闲聊回复并完成 SSE
 */
async function streamChatResponse(
  request: QueryRequest,
  model: ReturnType<typeof getModel>,
  modelUsed: ModelType,
  modelName: string,
  domainLabel: string,
  emit: StreamEmitter,
  totalStart: number,
  routeMs: number,
): Promise<void> {
  emit({ type: "phase", phase: "routing", message: "正在回复..." });

  const prompt = buildChatPrompt(request.question, domainLabel);
  let content = "";
  const tokenUsage = createEmptyQueryTokenUsage();
  const interpretStart = Date.now();

  const stream = await model.stream([new HumanMessage(prompt)]);
  for await (const chunk of stream) {
    const delta = chunkToText(chunk.content);
    if (delta) {
      content += delta;
      emit({ type: "interpret_delta", delta });
    }
    if (chunk.usage_metadata) {
      accumulateQueryTokens(tokenUsage, modelUsed, extractTokenUsage(chunk));
    }
  }

  emit({
    type: "tokens",
    model_used: modelUsed,
    usage: tokenUsage[modelUsed === "local" ? "local" : "remote"],
  });

  const response: QuerySuccessResponse = {
    sql: "",
    columns: [],
    rows: [],
    model_used: modelUsed,
    model_name: modelName,
    fallback_reason: null,
    route_source: null,
    route_reason: null,
    response_mode: "chat",
    row_count: 0,
    elapsed_ms: Date.now() - totalStart,
    timing: {
      route_ms: routeMs,
      sql_gen_ms: 0,
      exec_ms: 0,
      interpret_ms: Date.now() - interpretStart,
    },
    token_usage: tokenUsage,
    interpretation: content.trim(),
  };

  emit({ type: "done", result: response });
}

/**
 * 无可用模型时的对话式回复文案
 * @param question - 用户问题
 */
export function buildNoModelChatMessage(question: string): string {
  const trimmed = question.trim();
  const isGreeting =
    /^(你好|您好|hello|hi|hey|帮助|怎么用|如何使用)/i.test(trimmed);

  if (isGreeting) {
    return [
      "您好！我是问数助手，可以用自然语言查询 MES / MRO 等业务数据。",
      "",
      "当前没有检测到可用的 AI 模型，我暂时无法为您生成 SQL 查数，但您可以继续在这里对话。",
      "",
      "请让管理员检查：",
      "• 本地 vLLM 是否已启动（LOCAL_BASE_URL）",
      "• 或至少配置一个云端 API Key（如 QWEN_API_KEY、DEEPSEEK_API_KEY）",
      "",
      "模型就绪后，直接再次提问即可查数。",
    ].join("\n");
  }

  return [
    "我理解您想查数，但当前没有可用的 AI 模型，暂时无法生成 SQL。",
    "",
    "您可以继续提问或稍后再试；配置好模型后我会正常为您查数。",
    "",
    "请检查：",
    "• 本地模型：vLLM 服务与 LOCAL_BASE_URL",
    "• 云端模型：.env 中的 QWEN_API_KEY / DEEPSEEK_API_KEY 等",
  ].join("\n");
}

/**
 * 无可用模型时以 chat 模式完成 SSE（不抛错，保持会话可继续）
 */
function emitChatFallbackResponse(
  request: QueryRequest,
  emit: StreamEmitter,
  route: RouteResult,
  totalStart: number,
): void {
  emit({ type: "phase", phase: "routing", message: "正在回复..." });

  const response: QuerySuccessResponse = {
    sql: "",
    columns: [],
    rows: [],
    model_used: "local",
    model_name: "无可用模型",
    fallback_reason: "no_model_available",
    route_source: route.routeSource ?? null,
    route_reason: route.routeReason ?? null,
    response_mode: "chat",
    row_count: 0,
    elapsed_ms: Date.now() - totalStart,
    timing: {
      route_ms: Date.now() - totalStart,
      sql_gen_ms: 0,
      exec_ms: 0,
      interpret_ms: 0,
    },
    token_usage: createEmptyQueryTokenUsage(),
    interpretation: buildNoModelChatMessage(request.question),
  };

  emit({ type: "done", result: response });
}

/**
 * 执行查询链主入口（非流式，内部复用流式管道）
 * @param request - 查询请求
 */
export async function runQueryChain(
  request: QueryRequest,
  authUser?: AuthUser,
): Promise<QuerySuccessResponse> {
  return new Promise((resolve, reject) => {
    void runQueryChainStream(request, (event) => {
      if (event.type === "done") {
        resolve(event.result);
      }
      if (event.type === "error") {
        reject(
          new QueryChainError(event.error.error, {
            sql: event.error.sql,
            model_used: event.error.model_used,
            model_name: event.error.model_name,
          }),
        );
      }
    }, authUser);
  });
}

/**
 * 流式执行查询链，通过 emit 推送 SSE 事件
 * @param request - 查询请求
 * @param emit - 事件发送器
 * @param authUser - 已登录用户（透传域 API）
 */
export async function runQueryChainStream(
  request: QueryRequest,
  emit: StreamEmitter,
  authUser?: AuthUser,
): Promise<void> {
  const totalStart = Date.now();
  const interpret = request.interpret !== false;
  const history = request.history?.slice(-2);
  const tokenUsage = createEmptyQueryTokenUsage();

  try {
    const adapter = getDomainAdapter(request.domain);
    const schemaBundle = await adapter.getSchema({
      question: request.question,
      authUser,
    });
    const remoteProvider = request.remote_provider;

    if (isChatOnlyQuestion(request.question)) {
      const routeStart = Date.now();
      const resolved = await resolveQueryModel(
        { type: "remote", routeSource: "rule" },
        remoteProvider,
      );
      const routeMs = Date.now() - routeStart;

      if (!resolved) {
        emitChatFallbackResponse(request, emit, { type: "remote" }, totalStart);
        return;
      }

      const model = getModel(resolved.type, resolved.remoteProvider);
      await streamChatResponse(
        request,
        model,
        resolved.type,
        resolved.modelName,
        adapter.label,
        emit,
        totalStart,
        routeMs,
      );
      return;
    }

    emit({ type: "phase", phase: "routing", message: "正在路由模型..." });

    const routeStart = Date.now();
    const route = await routeModelForQuery(request.question, schemaBundle.tablesMeta);
    const resolved = await resolveQueryModel(route, remoteProvider);

    if (!resolved) {
      emitChatFallbackResponse(request, emit, route, totalStart);
      return;
    }

    const model = getModel(resolved.type, resolved.remoteProvider);
    const modelName = resolved.modelName;
    const routeMs = Date.now() - routeStart;
    const chainContext = {
      model_used: resolved.type,
      model_name: modelName,
      authUser,
    };

    const { sql, columns, rows, sqlGenMs, execMs } = await generateAndExecuteSql(
      adapter,
      schemaBundle,
      model,
      resolved.type,
      request.question,
      history,
      chainContext,
      emit,
      tokenUsage,
    );

    const timing: QueryTiming = {
      route_ms: routeMs,
      sql_gen_ms: sqlGenMs,
      exec_ms: execMs,
      interpret_ms: 0,
    };

    const response: QuerySuccessResponse = {
      sql,
      columns,
      rows,
      model_used: resolved.type,
      model_name: modelName,
      fallback_reason: resolved.fallbackReason ?? null,
      route_source: resolved.routeSource ?? null,
      route_reason: resolved.routeReason ?? null,
      response_mode: "query",
      row_count: rows.length,
      elapsed_ms: Date.now() - totalStart,
      timing,
      token_usage: tokenUsage,
    };

    if (interpret && rows.length > 0) {
      emit({ type: "phase", phase: "interpreting", message: "正在解读结果..." });

      const interpretStart = Date.now();
      const { interpretation, chartHint, tokens } = await streamInterpretation(
        model,
        resolved.type,
        request.question,
        rows,
        emit,
      );

      accumulateQueryTokens(tokenUsage, resolved.type, tokens);
      response.interpretation = interpretation;
      response.chart_hint = chartHint;
      timing.interpret_ms = Date.now() - interpretStart;
      response.elapsed_ms = Date.now() - totalStart;
      response.token_usage = tokenUsage;
    }

    emit({ type: "done", result: response });
  } catch (err) {
    if (err instanceof QueryChainError) {
      emit({
        type: "error",
        error: {
          error: err.message,
          sql: err.context.sql,
          model_used: err.context.model_used,
          model_name: err.context.model_name,
        },
      });
      return;
    }
    emit({
      type: "error",
      error: {
        error: err instanceof Error ? err.message : "查询失败",
      },
    });
  }
}

export { QueryChainError } from "./queryChainError.js";
