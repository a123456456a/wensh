/** 模型路由类型 */
export type ModelType = "local" | "remote";

/** 本地不可达时的降级原因 */
export type FallbackReason = "local_unavailable";

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
  interpret?: boolean;
  history?: HistoryItem[];
}

/** 分阶段耗时（毫秒） */
export interface QueryTiming {
  route_ms: number;
  sql_gen_ms: number;
  exec_ms: number;
  interpret_ms: number;
}

/** POST /api/query 成功响应 */
export interface QuerySuccessResponse {
  sql: string;
  columns: string[];
  rows: Record<string, unknown>[];
  model_used: ModelType;
  model_name: string;
  fallback_reason: FallbackReason | null;
  row_count: number;
  elapsed_ms: number;
  timing: QueryTiming;
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
}

/** GET /api/health 响应 */
export interface HealthResponse {
  local_model: {
    available: boolean;
    base_url: string;
  };
  remote_model: {
    available: boolean;
    model_name: string;
  };
  database: {
    available: boolean;
    path: string;
  };
}
