import type { FallbackReason, ModelType } from "@wensh/shared";
import { ChatOpenAI } from "@langchain/openai";
import {
  ALL_TABLES,
  getRowCount,
  type MesTable,
} from "../db/schema.js";

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
 */
export function getModel(type: ModelType): ChatOpenAI {
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

  return new ChatOpenAI({
    model: process.env.QWEN_MODEL_NAME ?? "qwen-max",
    apiKey: process.env.QWEN_API_KEY ?? "",
    configuration: {
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    },
    timeout,
  });
}

/**
 * 获取当前路由对应的模型名称
 */
export function getModelName(type: ModelType): string {
  if (type === "local") {
    return process.env.LOCAL_MODEL_NAME ?? "Qwen3.5-27B";
  }
  return process.env.QWEN_MODEL_NAME ?? "qwen-max";
}

/**
 * 探测远端 API 是否已配置
 */
export function isRemoteConfigured(): boolean {
  const key = process.env.QWEN_API_KEY ?? "";
  return key.length > 0 && key !== "sk-xxxxxxxxxxxxxxxx";
}
