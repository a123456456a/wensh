import type { FallbackReason, ModelType, RemoteProvider, RouteSource } from "@wensh/shared";
import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import type { TableMeta } from "../adapters/types.js";
import {
  ALL_TABLES,
  getRowCount,
  type MesTable,
} from "../db/schema.js";
import {
  getRemoteProvider,
  isRemoteConfigured,
  listRemoteProviderOptions,
  resolveRemoteModelConfig,
  isProviderConfigured,
} from "./remoteProvider.js";

/** 关键词 → 表名映射 */
const KEYWORD_TABLE_MAP: Array<{ keywords: string[]; table: MesTable }> = [
  { keywords: ["工单", "订单", "在制"], table: "work_order" },
  { keywords: ["良率", "质量", "不良", "抽检"], table: "quality_record" },
  { keywords: ["班次", "oee", "停机"], table: "shift_log" },
  { keywords: ["产线", "车间", "产能"], table: "production_line" },
];

/**
 * 从用户问题中解析可能涉及的表
 * @param question - 用户自然语言问题
 */
export function extractTableNames(question: string): MesTable[] {
  const lower = question.toLowerCase();
  const matched = new Set<MesTable>();

  for (const { keywords, table } of KEYWORD_TABLE_MAP) {
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      matched.add(table);
    }
  }

  if (matched.size === 0) {
    return [...ALL_TABLES];
  }

  return [...matched];
}

/**
 * 根据问题涉及表的最大行数决定首选模型类型
 */
export function getPreferredModelType(question: string): ModelType {
  const tables = extractTableNames(question);
  const threshold = Number(process.env.ROW_THRESHOLD ?? "10000");
  const maxCount = Math.max(...tables.map((t) => getRowCount(t)));
  return maxCount > threshold ? "remote" : "local";
}

/** 模型路由模式（env: ROUTER_MODE） */
export type RouterMode = "rule" | "llm" | "hybrid";

export type { RouteSource };

/** 关键词匹配分析结果 */
export interface TableMatchAnalysis {
  /** 用于 tier 判定的表集合（无关键词命中时为全量） */
  tables: TableMeta[];
  /** 关键词显式命中的表 */
  keywordMatched: TableMeta[];
  /** 是否未命中任何关键词 */
  noKeywordMatch: boolean;
}

/**
 * 读取模型路由模式，非法值回退 hybrid
 */
export function getRouterMode(): RouterMode {
  const mode = process.env.ROUTER_MODE ?? "hybrid";
  if (mode === "rule" || mode === "llm" || mode === "hybrid") {
    return mode;
  }
  return "hybrid";
}

/**
 * 分析用户问题与 tablesMeta 的关键词匹配情况
 * @param question - 用户问题
 * @param tablesMeta - 域表元数据
 */
export function analyzeTableMatch(
  question: string,
  tablesMeta: TableMeta[],
): TableMatchAnalysis {
  const lower = question.toLowerCase();
  const keywordMatched = tablesMeta.filter((t) =>
    t.keywords.some((kw) => lower.includes(kw.toLowerCase())),
  );
  const noKeywordMatch = keywordMatched.length === 0;
  return {
    tables: noKeywordMatch ? tablesMeta : keywordMatched,
    keywordMatched,
    noKeywordMatch,
  };
}

/**
 * 方案 B：仅当显式命中单表时规则路由置信度高
 * @param analysis - 关键词匹配分析
 */
export function isHighConfidenceRuleRoute(analysis: TableMatchAnalysis): boolean {
  return analysis.keywordMatched.length === 1;
}

/**
 * 从 tablesMeta 匹配问题涉及的表
 * @param question - 用户问题
 * @param tablesMeta - 域表元数据
 */
export function matchTablesFromQuestion(
  question: string,
  tablesMeta: TableMeta[],
): TableMeta[] {
  return analyzeTableMatch(question, tablesMeta).tables;
}

/**
 * 根据表 tier 决定首选模型（任一 large 表 → remote）
 * @param tables - 匹配到的表元数据
 */
export function getPreferredModelTypeFromTables(tables: TableMeta[]): ModelType {
  const hasLarge = tables.some((t) => t.tier === "large");
  return hasLarge ? "remote" : "local";
}

/**
 * 按首选模型类型路由，并在 local 不可达时降级 remote
 * @param preferred - 规则或 LLM 给出的首选模型
 * @param meta - 附加路由元信息
 */
async function applyModelRoute(
  preferred: ModelType,
  meta?: Pick<RouteResult, "routeSource" | "routeReason" | "fallbackReason">,
): Promise<RouteResult> {
  if (preferred === "local") {
    const available = await isLocalModelAvailable();
    if (!available) {
      return {
        type: "remote",
        fallbackReason: "local_unavailable",
        ...meta,
      };
    }
    return { type: "local", ...meta };
  }

  return { type: "remote", ...meta };
}

/**
 * 构建 Router LLM 分类 Prompt（仅 local/remote 二选一）
 * @param question - 用户问题
 * @param tablesMeta - 域表元数据
 */
export function buildRouterPrompt(question: string, tablesMeta: TableMeta[]): string {
  const tableLines = tablesMeta
    .map(
      (t) =>
        `- ${t.name} (${t.tier}, ${t.label}): 关键词 ${t.keywords.join("、") || "无"}`,
    )
    .join("\n");

  return `你是问数系统的模型路由器。根据用户问题和表信息，选择 SQL 生成使用 local 还是 remote。

选择规则：
- 简单单表、small 表、明细少 → local
- 多表 JOIN、复杂聚合、large 表、指标口径复杂 → remote
- 不确定 → remote

表信息：
${tableLines || "- （无表元数据）"}

用户问题：${question}

只输出 JSON，不要解释：
{"model":"local"|"remote","reason":"一句话"}`;
}

/**
 * 解析 Router LLM 返回的 JSON 决策
 * @param raw - 模型原始输出
 */
export function parseLlmRouterDecision(
  raw: string,
): { model: ModelType; reason?: string } | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }

  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as {
      model?: string;
      reason?: string;
    };
    const model = parsed.model?.toLowerCase();
    if (model !== "local" && model !== "remote") {
      return null;
    }
    return {
      model,
      reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * 创建 Router LLM 实例（本地可达时优先本地，否则走远端默认提供商）
 */
export async function getRouterModel(): Promise<ChatOpenAI> {
  const timeout = Number(process.env.ROUTER_TIMEOUT_MS ?? "15000");
  const preferLocal = process.env.ROUTER_USE_LOCAL !== "false";

  if (
    preferLocal &&
    process.env.LOCAL_BASE_URL &&
    (await isLocalModelAvailable())
  ) {
    return new ChatOpenAI({
      model:
        process.env.ROUTER_LOCAL_MODEL_NAME ??
        process.env.LOCAL_MODEL_NAME ??
        "Qwen3.5-27B",
      apiKey: "",
      configuration: {
        baseURL: process.env.LOCAL_BASE_URL,
      },
      timeout,
      modelKwargs: {
        enable_thinking: false,
      },
    });
  }

  const provider = process.env.ROUTER_REMOTE_PROVIDER as RemoteProvider | undefined;
  return getModel("remote", provider ?? getRemoteProvider());
}

/**
 * 为 Promise 附加超时，超时后 reject
 * @param promise - 待执行异步任务
 * @param ms - 超时毫秒数
 * @param label - 错误信息前缀
 */
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/** Router LLM 工厂（运行时引用，便于单测 mock） */
export const routerModelResolver = {
  getRouterModel,
};

/**
 * 使用 Router LLM 选择 local / remote
 * @param question - 用户问题
 * @param tablesMeta - 域表元数据
 */
export async function routeModelWithLlm(
  question: string,
  tablesMeta: TableMeta[],
): Promise<RouteResult> {
  const router = await routerModelResolver.getRouterModel();
  const prompt = buildRouterPrompt(question, tablesMeta);
  const timeoutMs = Number(process.env.ROUTER_TIMEOUT_MS ?? "15000");
  const response = await withTimeout(
    router.invoke([new HumanMessage(prompt)]),
    timeoutMs,
    "Router LLM",
  );
  const content =
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);
  const decision = parseLlmRouterDecision(content);
  if (!decision) {
    throw new Error("LLM router returned unparseable response");
  }

  return applyModelRoute(decision.model, {
    routeSource: "llm",
    routeReason: decision.reason,
  });
}

/**
 * 基于 tablesMeta 的规则路由：tier + 本地不可达降级
 * @param question - 用户问题
 * @param tablesMeta - 域表元数据
 */
export async function routeModelWithMeta(
  question: string,
  tablesMeta: TableMeta[],
): Promise<RouteResult> {
  const analysis = analyzeTableMatch(question, tablesMeta);
  const preferred = getPreferredModelTypeFromTables(analysis.tables);
  return applyModelRoute(preferred, { routeSource: "rule" });
}

/**
 * 查询链入口：按 ROUTER_MODE 选择 rule / llm / hybrid（方案 B）
 * @param question - 用户问题
 * @param tablesMeta - 域表元数据
 */
export async function routeModelForQuery(
  question: string,
  tablesMeta: TableMeta[],
): Promise<RouteResult> {
  const mode = getRouterMode();

  if (mode === "rule") {
    return routeModelWithMeta(question, tablesMeta);
  }

  if (mode === "llm") {
    try {
      return await routeModelWithLlm(question, tablesMeta);
    } catch {
      const analysis = analyzeTableMatch(question, tablesMeta);
      const preferred = getPreferredModelTypeFromTables(analysis.tables);
      return applyModelRoute(preferred, { routeSource: "rule_fallback" });
    }
  }

  const analysis = analyzeTableMatch(question, tablesMeta);
  if (isHighConfidenceRuleRoute(analysis)) {
    const preferred = getPreferredModelTypeFromTables(analysis.tables);
    return applyModelRoute(preferred, { routeSource: "rule" });
  }

  try {
    return await routeModelWithLlm(question, tablesMeta);
  } catch {
    const preferred = getPreferredModelTypeFromTables(analysis.tables);
    return applyModelRoute(preferred, { routeSource: "rule_fallback" });
  }
}

/**
 * 探测本地 vLLM 是否可达
 */
export async function isLocalModelAvailable(): Promise<boolean> {
  const baseUrl = process.env.LOCAL_BASE_URL;
  if (!baseUrl) {
    return false;
  }

  const url = baseUrl.replace(/\/$/, "") + "/models";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export interface RouteResult {
  type: ModelType;
  fallbackReason?: FallbackReason;
  /** 路由决策来源（rule / llm / rule_fallback） */
  routeSource?: RouteSource;
  /** LLM 路由理由（调试/日志） */
  routeReason?: string;
}

/** 解析后可实际调用的模型 */
export interface ResolvedModel {
  type: ModelType;
  remoteProvider?: RemoteProvider;
  modelName: string;
  fallbackReason?: FallbackReason;
  routeSource?: RouteSource;
  routeReason?: string;
}

/**
 * 在路由结果基础上解析首个可用模型（本地/云端/切换提供商）
 * @param route - 路由决策
 * @param preferredRemoteProvider - 用户选择的远端提供商
 */
export async function resolveQueryModel(
  route: RouteResult,
  preferredRemoteProvider?: RemoteProvider,
): Promise<ResolvedModel | null> {
  const tried = new Set<string>();
  const queue: Array<{
    type: ModelType;
    provider?: RemoteProvider;
    fallbackReason?: FallbackReason;
  }> = [];

  /**
   * 将候选模型加入解析队列（去重）
   */
  const enqueue = (
    type: ModelType,
    provider?: RemoteProvider,
    fallbackReason?: FallbackReason,
  ) => {
    const key = type === "local" ? "local" : `remote:${provider ?? "default"}`;
    if (tried.has(key)) {
      return;
    }
    tried.add(key);
    queue.push({ type, provider, fallbackReason });
  };

  const defaultRemote = preferredRemoteProvider ?? getRemoteProvider();

  enqueue(route.type, route.type === "remote" ? defaultRemote : undefined, route.fallbackReason);

  if (route.type === "local") {
    enqueue("remote", defaultRemote, "local_unavailable");
  } else {
    enqueue("local", undefined, route.fallbackReason);
  }

  for (const opt of listRemoteProviderOptions()) {
    if (opt.available) {
      enqueue("remote", opt.provider);
    }
  }

  for (const item of queue) {
    if (item.type === "local") {
      if (await isLocalModelAvailable()) {
        return {
          type: "local",
          modelName: getModelName("local"),
          fallbackReason: item.fallbackReason,
          routeSource: route.routeSource,
          routeReason: route.routeReason,
        };
      }
      continue;
    }

    if (item.provider && isProviderConfigured(item.provider)) {
      return {
        type: "remote",
        remoteProvider: item.provider,
        modelName: getModelName("remote", item.provider),
        fallbackReason: item.fallbackReason ?? route.fallbackReason,
        routeSource: route.routeSource,
        routeReason: route.routeReason,
      };
    }
  }

  return null;
}

/**
 * 路由模型：行数阈值 + 本地不可达降级
 */
export async function routeModel(question: string): Promise<RouteResult> {
  const preferred = getPreferredModelType(question);
  return applyModelRoute(preferred, { routeSource: "rule" });
}

/**
 * 创建 ChatOpenAI 实例
 * @param type - local 或 remote
 * @param remoteProvider - 远端提供商覆盖（仅 type=remote 时生效）
 */
export function getModel(type: ModelType, remoteProvider?: RemoteProvider): ChatOpenAI {
  const timeout = Number(process.env.LLM_TIMEOUT_MS ?? "60000");

  if (type === "local") {
    return new ChatOpenAI({
      model: process.env.LOCAL_MODEL_NAME ?? "Qwen3.5-27B",
      apiKey: "local",
      configuration: {
        baseURL: process.env.LOCAL_BASE_URL,
      },
      timeout,
      modelKwargs: {
        enable_thinking: false,
      },
    });
  }

  const remote = resolveRemoteModelConfig(remoteProvider);
  return new ChatOpenAI({
    model: remote.modelName,
    apiKey: remote.apiKey,
    configuration: {
      baseURL: remote.baseURL,
    },
    timeout,
  });
}

/**
 * 获取当前路由对应的模型名称
 * @param type - local 或 remote
 * @param remoteProvider - 远端提供商覆盖（仅 type=remote 时生效）
 */
export function getModelName(type: ModelType, remoteProvider?: RemoteProvider): string {
  if (type === "local") {
    return process.env.LOCAL_MODEL_NAME ?? "Qwen3.5-27B";
  }
  return resolveRemoteModelConfig(remoteProvider).modelName;
}

export {
  isProviderConfigured,
  isRemoteConfigured,
  listRemoteProviderOptions,
  resolveRemoteModelConfig,
} from "./remoteProvider.js";
