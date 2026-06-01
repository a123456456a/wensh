import axios from "axios";
import type {
  HealthResponse,
  QueryErrorResponse,
  QueryRequest,
  QuerySuccessResponse,
} from "@wensh/shared";

const client = axios.create({ baseURL: "/api", withCredentials: true });

/**
 * 提交自然语言查询
 */
export async function postQuery(
  body: QueryRequest,
): Promise<QuerySuccessResponse> {
  const { data } = await client.post<QuerySuccessResponse>("/query", body);
  return data;
}

/**
 * 获取服务健康状态
 */
export async function getHealth(): Promise<HealthResponse> {
  const { data } = await client.get<HealthResponse>("/health");
  return data;
}

export type { QueryErrorResponse };
