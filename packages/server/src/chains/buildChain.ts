import type {
  ChartHint,
  HistoryItem,
  QueryRequest,
  QuerySuccessResponse,
  QueryTiming,
} from "@wensh/shared";
import { HumanMessage } from "@langchain/core/messages";
import { getDb } from "../db/client.js";
import { getMetricsPrompt, getSchemaPrompt } from "../db/schema.js";
import {
  extractChartHint,
  extractSql,
  stripChartTag,
} from "../utils/sqlExtract.js";
import { assertSqlSafe } from "../utils/sqlSafety.js";
import {
  getModel,
  getModelName,
  routeModel,
} from "./modelRouter.js";

/**
 * 构建 history 上下文 Prompt 片段
 */
function buildHistoryContext(history?: HistoryItem[]): string {
  if (!history || history.length === 0) {
    return "";
  }

  const recent = history.slice(-2);
  const lines = recent.map((item, idx) => {
    return `- 第${idx + 1}轮问题：${item.question} | 生成的SQL：${item.sql}`;
  });

  return `以下是最近对话，当前问题可能是追问，请结合上下文理解：\n${lines.join("\n")}\n`;
}

/**
 * 构建 SQL 生成 Prompt
 */
function buildSqlPrompt(
  question: string,
  history?: HistoryItem[],
  errorFeedback?: string,
): string {
  const schema = getSchemaPrompt();
  const metrics = getMetricsPrompt();
  const historyContext = buildHistoryContext(history);

  let prompt = `你是一个专业的数据库查询助手，帮助用户查询制造执行系统（MES）数据库。

数据库表结构如下：
${schema}

业务指标口径：
${metrics}

${historyContext}
用户问题：${question}

请生成一条标准 SQLite 查询语句，要求：
1. 只生成 SELECT，不生成任何修改性 SQL
2. 用 \`\`\`sql ... \`\`\` 包裹 SQL
3. 列名使用中文别名（如 yield_rate AS 良率）
4. 日期过滤使用 DATE() 函数
5. 结果行数可能很大时请加 LIMIT 1000
6. 不要解释，只输出 SQL`;

  if (errorFeedback) {
    prompt += `\n\n上次生成的 SQL 执行失败，错误信息：${errorFeedback}\n请修正后重新生成。`;
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
 * 执行 SQL 并返回列名与行数据
 */
function executeSql(sql: string): {
  columns: string[];
  rows: Record<string, unknown>[];
} {
  const db = getDb();
  const stmt = db.prepare(sql);
  const rows = stmt.all() as Record<string, unknown>[];
  const columns =
    rows.length > 0
      ? Object.keys(rows[0])
      : stmt.columns().map((c) => c.name);
  return { columns, rows };
}

/**
 * 调用 LLM 生成并校验 SQL
 */
async function invokeSqlGeneration(
  model: ReturnType<typeof getModel>,
  question: string,
  history?: HistoryItem[],
  errorFeedback?: string,
): Promise<string> {
  const prompt = buildSqlPrompt(question, history, errorFeedback);
  const response = await model.invoke([new HumanMessage(prompt)]);
  const content =
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

  const sql = extractSql(content);
  if (!sql) {
    throw new Error("未能从模型输出中提取 SQL");
  }

  assertSqlSafe(sql);
  return sql;
}

/**
 * 生成 SQL 并执行（含一次重试）
 */
async function generateAndExecuteSql(
  model: ReturnType<typeof getModel>,
  question: string,
  history?: HistoryItem[],
): Promise<{ sql: string; columns: string[]; rows: Record<string, unknown>[]; sqlGenMs: number; execMs: number }> {
  const genStart = Date.now();
  let sql = await invokeSqlGeneration(model, question, history);
  let sqlGenMs = Date.now() - genStart;

  const execStart = Date.now();
  try {
    const result = executeSql(sql);
    return { sql, ...result, sqlGenMs, execMs: Date.now() - execStart };
  } catch (firstErr) {
    const errMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
    const retryStart = Date.now();
    sql = await invokeSqlGeneration(model, question, history, errMsg);
    sqlGenMs += Date.now() - retryStart;
    const result = executeSql(sql);
    return { sql, ...result, sqlGenMs, execMs: Date.now() - execStart };
  }
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
 * 执行查询链主入口
 * @param request - 查询请求
 */
export async function runQueryChain(
  request: QueryRequest,
): Promise<QuerySuccessResponse> {
  const totalStart = Date.now();
  const interpret = request.interpret !== false;
  const history = request.history?.slice(-2);

  const routeStart = Date.now();
  const route = await routeModel(request.question);
  const model = getModel(route.type);
  const modelName = getModelName(route.type);
  const routeMs = Date.now() - routeStart;

  const { sql, columns, rows, sqlGenMs, execMs } = await generateAndExecuteSql(
    model,
    request.question,
    history,
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
    model_used: route.type,
    model_name: modelName,
    fallback_reason: route.fallbackReason ?? null,
    row_count: rows.length,
    elapsed_ms: Date.now() - totalStart,
    timing,
  };

  if (interpret && rows.length > 0) {
    const interpretStart = Date.now();
    const interpretPrompt = buildInterpretPrompt(request.question, rows);
    const interpretResponse = await model.invoke([
      new HumanMessage(interpretPrompt),
    ]);
    const interpretText =
      typeof interpretResponse.content === "string"
        ? interpretResponse.content
        : JSON.stringify(interpretResponse.content);

    const chartHint = extractChartHint(interpretText) ?? inferChartHint(columns, rows);
    response.interpretation = stripChartTag(interpretText);
    response.chart_hint = chartHint;
    timing.interpret_ms = Date.now() - interpretStart;
    response.elapsed_ms = Date.now() - totalStart;
  }

  return response;
}
