import type { AuthUser, BusinessDomain } from "@wensh/shared";
import { buildUserContextHeaders } from "../auth/signing.js";
import { isAuthEnabled } from "../auth/providers.js";
import type {
  DomainDataAdapter,
  ExecuteQueryResult,
  SchemaBundle,
} from "./types.js";

/** HttpDomainAdapter 构造参数 */
export interface HttpDomainAdapterConfig {
  domain: BusinessDomain;
  label: string;
  baseUrl: string;
  token: string;
  timeoutMs: number;
}

/** HTTP 域 Data API 适配器 */
export class HttpDomainAdapter implements DomainDataAdapter {
  readonly domain: BusinessDomain;
  readonly label: string;
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  /**
   * @param config - 域标识、API 基址与超时配置
   */
  constructor(config: HttpDomainAdapterConfig) {
    this.domain = config.domain;
    this.label = config.label;
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.token = config.token;
    this.timeoutMs = config.timeoutMs;
  }

  /**
   * 合并用户上下文 Header（启用认证且传入 authUser 时）
   * @param authUser - 已登录用户
   */
  private buildUserHeaders(authUser?: AuthUser): Record<string, string> {
    if (!isAuthEnabled() || !authUser) return {};
    if (!process.env.WENSH_DOMAIN_SIGNING_SECRET?.trim()) return {};
    return buildUserContextHeaders(authUser);
  }

  /**
   * 发起域 API 请求
   * @param path - API 路径（含 query string）
   * @param init - fetch 额外选项
   * @param authUser - 已登录用户（透传签名 Header）
   */
  private async request<T>(
    path: string,
    init?: RequestInit,
    authUser?: AuthUser,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
          ...this.buildUserHeaders(authUser),
          ...(init?.headers ?? {}),
        },
      });
      const body = (await res.json()) as T & { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? `域 API 请求失败: ${res.status}`);
      }
      return body;
    } finally {
      clearTimeout(timer);
    }
  }

  /** @inheritdoc */
  async ping(): Promise<boolean> {
    try {
      await this.request("/api/v1/health");
      return true;
    } catch {
      return false;
    }
  }

  /** @inheritdoc */
  async getSchema(options?: {
    question?: string;
    tables?: string[];
    authUser?: AuthUser;
  }): Promise<SchemaBundle> {
    const params = new URLSearchParams();
    if (options?.question) params.set("question", options.question);
    if (options?.tables?.length) {
      params.set("tables", options.tables.join(","));
    }
    const qs = params.toString();
    const data = await this.request<{
      dialect: "mysql";
      prompt_schema: string;
      metrics_prompt: string;
      tables_meta: SchemaBundle["tablesMeta"];
    }>(`/api/v1/schema${qs ? `?${qs}` : ""}`, undefined, options?.authUser);

    return {
      dialect: data.dialect,
      promptSchema: data.prompt_schema,
      metricsPrompt: data.metrics_prompt,
      tablesMeta: data.tables_meta,
    };
  }

  /** @inheritdoc */
  async executeQuery(params: {
    sql: string;
    sourceQuestion?: string;
    traceId?: string;
    authUser?: AuthUser;
  }): Promise<ExecuteQueryResult> {
    const data = await this.request<{
      columns: string[];
      rows: Record<string, unknown>[];
      row_count: number;
      exec_ms: number;
    }>(
      "/api/v1/query/execute",
      {
        method: "POST",
        body: JSON.stringify({
          sql: params.sql,
          timeout_ms: this.timeoutMs,
          max_rows: 1000,
          source_question: params.sourceQuestion,
          trace_id: params.traceId,
        }),
      },
      params.authUser,
    );

    return {
      columns: data.columns,
      rows: data.rows,
      rowCount: data.row_count,
      execMs: data.exec_ms,
    };
  }
}
