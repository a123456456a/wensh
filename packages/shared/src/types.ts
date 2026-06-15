/** 业务域标识 */
export type BusinessDomain = "demo" | "mes" | "mro";

/** 模型路由类型 */
export type ModelType = "local" | "remote";

/** 远端 LLM 提供商（OpenAI 兼容 API） */
export type RemoteProvider = "qwen" | "deepseek" | "openai" | "custom";

/** 本地不可达时的降级原因 */
export type FallbackReason = "local_unavailable" | "no_model_available";

/** 问数响应模式：query=SQL查数，chat=无模型时的对话回复 */
export type QueryResponseMode = "query" | "chat";

/** 模型路由决策来源 */
export type RouteSource = "rule" | "llm" | "rule_fallback";

/** 模型路由模式（服务端 ROUTER_MODE） */
export type RouterMode = "rule" | "llm" | "hybrid";

/** GET /api/health 返回的路由配置摘要 */
export interface RouterConfig {
  mode: RouterMode;
  row_threshold: number;
  split_model_interpret: boolean;
  router_use_local: boolean;
  local_model_name: string;
  router_timeout_ms: number;
}

/** 图表类型提示 */
export type ChartHint = "bar" | "line" | "table";

/** 轻量多轮历史条目 */
export interface HistoryItem {
  question: string;
  sql: string;
}

/** POST /api/query 请求体 */
export interface QueryRequest {
  question: string;
  /** 业务域（demo=本地 SQLite，mes/mro=域 Data API） */
  domain: BusinessDomain;
  interpret?: boolean;
  history?: HistoryItem[];
  /** 远端 LLM 提供商（不传则使用 .env 默认 REMOTE_PROVIDER） */
  remote_provider?: RemoteProvider;
}

/** health 接口返回的远端提供商选项 */
export interface RemoteProviderOption {
  provider: RemoteProvider;
  label: string;
  model_name: string;
  available: boolean;
}

/** 分阶段耗时（毫秒） */
export interface QueryTiming {
  route_ms: number;
  sql_gen_ms: number;
  exec_ms: number;
  interpret_ms: number;
}

/** 单次 LLM 调用的 Token 用量 */
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

/** 查询链 Token 汇总（按本地/远端分别统计） */
export interface QueryTokenUsage {
  local: TokenUsage;
  remote: TokenUsage;
}

/** 创建空的 Token 用量对象 */
export function emptyTokenUsage(): TokenUsage {
  return { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
}

/** 创建空的查询 Token 汇总 */
export function emptyQueryTokenUsage(): QueryTokenUsage {
  return { local: emptyTokenUsage(), remote: emptyTokenUsage() };
}

/** 流式阶段标识 */
export type StreamPhase =
  | "routing"
  | "sql_generating"
  | "executing"
  | "interpreting";

/** SSE 流式事件 */
export type StreamEvent =
  | { type: "phase"; phase: StreamPhase; message: string }
  | { type: "sql_delta"; delta: string }
  | { type: "sql"; sql: string }
  | { type: "data"; columns: string[]; rows: Record<string, unknown>[]; row_count: number }
  | { type: "interpret_delta"; delta: string }
  | { type: "tokens"; model_used: ModelType; usage: TokenUsage }
  | { type: "done"; result: QuerySuccessResponse }
  | { type: "error"; error: QueryErrorResponse };

/** POST /api/query 成功响应 */
export interface QuerySuccessResponse {
  sql: string;
  columns: string[];
  rows: Record<string, unknown>[];
  model_used: ModelType;
  model_name: string;
  /** 解读阶段使用的模型类型（split 模式下与 model_used 不同） */
  interpret_model_used?: ModelType;
  /** 解读阶段模型名称 */
  interpret_model_name?: string;
  fallback_reason: FallbackReason | null;
  /** 路由决策来源（hybrid 模式下可见） */
  route_source: RouteSource | null;
  /** LLM 路由理由（route_source=llm 时有值） */
  route_reason?: string | null;
  /** 响应模式，默认 query */
  response_mode?: QueryResponseMode;
  row_count: number;
  elapsed_ms: number;
  timing: QueryTiming;
  token_usage: QueryTokenUsage;
  interpretation?: string;
  chart_hint?: ChartHint;
}

/** POST /api/query 错误响应 */
export interface QueryErrorResponse {
  error: string;
  sql?: string;
  model_used?: ModelType;
  model_name?: string;
}

/** 前端会话中的一条问答记录 */
export interface ChatMessage {
  id: string;
  question: string;
  response?: QuerySuccessResponse;
  error?: QueryErrorResponse;
  loading?: boolean;
  /** 流式阶段文案 */
  streamPhase?: string;
  /** 流式 SQL 生成片段 */
  streamSql?: string;
  /** 流式解读片段 */
  streamInterpretation?: string;
  /** 流式阶段已返回的列名 */
  streamColumns?: string[];
  /** 流式阶段已返回的行数据 */
  streamRows?: Record<string, unknown>[];
}

/** 业务域健康状态 */
export interface DomainHealthItem {
  domain: BusinessDomain;
  label: string;
  api_available: boolean;
  api_base_url: string;
}

/** GET /api/health 响应 */
export interface HealthResponse {
  local_model: {
    available: boolean;
    base_url: string;
  };
  remote_model: {
    available: boolean;
    provider: RemoteProvider;
    provider_label: string;
    model_name: string;
    /** .env 中的默认远端提供商 */
    default_provider: RemoteProvider;
    /** 所有内置提供商及其配置状态 */
    providers: RemoteProviderOption[];
  };
  database: {
    available: boolean;
    path: string;
  };
  /** 各业务域 Data API 连通状态 */
  domains: DomainHealthItem[];
  /** 本地/云端模型路由配置（只读，供前端展示） */
  router: RouterConfig;
  /** 认证配置 */
  auth: {
    enabled: boolean;
  };
}
