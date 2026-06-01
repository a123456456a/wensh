import type { AIMessage } from "@langchain/core/messages";
import type {
  ModelType,
  QueryTokenUsage,
  TokenUsage,
} from "@wensh/shared";

/** 空 Token 用量 */
const ZERO_USAGE: TokenUsage = {
  input_tokens: 0,
  output_tokens: 0,
  total_tokens: 0,
};

/**
 * 从 LangChain AIMessage 提取 Token 用量
 * @param message - LLM 响应消息
 */
export function extractTokenUsage(message: AIMessage): TokenUsage {
  const usage = message.usage_metadata;
  if (usage) {
    return {
      input_tokens: usage.input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0,
      total_tokens: usage.total_tokens ?? 0,
    };
  }

  const legacy = message.response_metadata?.tokenUsage as
    | { promptTokens?: number; completionTokens?: number; totalTokens?: number }
    | undefined;

  if (legacy) {
    const input = legacy.promptTokens ?? 0;
    const output = legacy.completionTokens ?? 0;
    return {
      input_tokens: input,
      output_tokens: output,
      total_tokens: legacy.totalTokens ?? input + output,
    };
  }

  return { ...ZERO_USAGE };
}

/**
 * 累加 Token 用量
 * @param target - 目标用量
 * @param delta - 增量
 */
export function addTokenUsage(target: TokenUsage, delta: TokenUsage): void {
  target.input_tokens += delta.input_tokens;
  target.output_tokens += delta.output_tokens;
  target.total_tokens += delta.total_tokens;
}

/**
 * 将单次 LLM 调用用量计入对应本地/远端桶
 * @param bucket - 查询 Token 汇总
 * @param modelUsed - 实际使用的模型类型
 * @param usage - 单次用量
 */
export function accumulateQueryTokens(
  bucket: QueryTokenUsage,
  modelUsed: ModelType,
  usage: TokenUsage,
): void {
  const target = modelUsed === "local" ? bucket.local : bucket.remote;
  addTokenUsage(target, usage);
}

/**
 * 创建空的查询 Token 汇总
 */
export function createEmptyQueryTokenUsage(): QueryTokenUsage {
  return {
    local: { ...ZERO_USAGE },
    remote: { ...ZERO_USAGE },
  };
}
