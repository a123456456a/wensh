import type { FallbackReason, ModelType, RemoteProvider } from "@wensh/shared";
import { ChatOpenAI } from "@langchain/openai";
import type { TableMeta } from "../adapters/types.js";
import {
  ALL_TABLES,
  getRowCount,
  type MesTable,
} from "../db/schema.js";
import {
  isRemoteConfigured,
  resolveRemoteModelConfig,
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

/**
 * 从 tablesMeta 匹配问题涉及的表
 * @param question - 用户问题
 * @param tablesMeta - 域表元数据
 */
export function matchTablesFromQuestion(
  question: string,
  tablesMeta: TableMeta[],
): TableMeta[] {
  const lower = question.toLowerCase();
  const matched = tablesMeta.filter((t) =>
    t.keywords.some((kw) => lower.includes(kw.toLowerCase())),
  );
  return matched.length > 0 ? matched : tablesMeta;
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
 * 基于 tablesMeta 路由模型：tier + 本地不可达降级
 * @param question - 用户问题
 * @param tablesMeta - 域表元数据
 */
export async function routeModelWithMeta(
  question: string,
  tablesMeta: TableMeta[],
): Promise<RouteResult> {
  const matched = matchTablesFromQuestion(question, tablesMeta);
  const preferred = getPreferredModelTypeFromTables(matched);

  if (preferred === "local") {
    const available = await isLocalModelAvailable();
    if (!available) {
      return { type: "remote", fallbackReason: "local_unavailable" };
    }
    return { type: "local" };
  }

  return { type: "remote" };
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
}

/**
 * 路由模型：行数阈值 + 本地不可达降级
 */
export async function routeModel(question: string): Promise<RouteResult> {
  const preferred = getPreferredModelType(question);

  if (preferred === "local") {
    const available = await isLocalModelAvailable();
    if (!available) {
      return { type: "remote", fallbackReason: "local_unavailable" };
    }
    return { type: "local" };
  }

  return { type: "remote" };
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
