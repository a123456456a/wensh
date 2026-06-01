import type { ModelType } from "@wensh/shared";

/** 查询链错误携带的上下文 */
export interface QueryChainErrorContext {
  sql?: string;
  model_used?: ModelType;
  model_name?: string;
}

/**
 * 查询链执行错误，携带 SQL 与模型路由信息供 API 返回
 */
export class QueryChainError extends Error {
  readonly context: QueryChainErrorContext;

  /**
   * @param message - 错误信息
   * @param context - 可选的 SQL / 模型上下文
   */
  constructor(message: string, context: QueryChainErrorContext = {}) {
    super(message);
    this.name = "QueryChainError";
    this.context = context;
  }
}
