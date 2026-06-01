import type { AuthUser, BusinessDomain } from "@wensh/shared";

/** 表元数据（供路由与 Prompt） */
export interface TableMeta {
  name: string;
  label: string;
  tier: "small" | "large";
  keywords: string[];
}

/** Schema bundle */
export interface SchemaBundle {
  dialect: "mysql" | "sqlite";
  promptSchema: string;
  metricsPrompt: string;
  tablesMeta: TableMeta[];
}

/** SQL 执行结果 */
export interface ExecuteQueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  execMs: number;
}

/** 域数据访问抽象 */
export interface DomainDataAdapter {
  readonly domain: BusinessDomain;
  readonly label: string;
  ping(): Promise<boolean>;
  getSchema(options?: {
    question?: string;
    tables?: string[];
    authUser?: AuthUser;
  }): Promise<SchemaBundle>;
  executeQuery(params: {
    sql: string;
    sourceQuestion?: string;
    traceId?: string;
    authUser?: AuthUser;
  }): Promise<ExecuteQueryResult>;
}
