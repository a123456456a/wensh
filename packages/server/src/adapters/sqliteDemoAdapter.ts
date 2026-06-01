import type { BusinessDomain } from "@wensh/shared";
import { getDb } from "../db/client.js";
import {
  getDemoTablesMeta,
  getMetricsPrompt,
  getSchemaPrompt,
} from "../db/schema.js";
import type {
  DomainDataAdapter,
  ExecuteQueryResult,
  SchemaBundle,
} from "./types.js";

/** Demo 域：本地 SQLite */
export class SqliteDemoAdapter implements DomainDataAdapter {
  readonly domain: BusinessDomain = "demo";
  readonly label = "本地演示";

  /** @inheritdoc */
  async ping(): Promise<boolean> {
    try {
      getDb().prepare("SELECT 1").get();
      return true;
    } catch {
      return false;
    }
  }

  /** @inheritdoc */
  async getSchema(): Promise<SchemaBundle> {
    return {
      dialect: "sqlite",
      promptSchema: getSchemaPrompt(),
      metricsPrompt: getMetricsPrompt(),
      tablesMeta: getDemoTablesMeta(),
    };
  }

  /** @inheritdoc */
  async executeQuery(params: { sql: string }): Promise<ExecuteQueryResult> {
    const start = Date.now();
    const db = getDb();
    const stmt = db.prepare(params.sql);
    const rows = stmt.all() as Record<string, unknown>[];
    const columns =
      rows.length > 0
        ? Object.keys(rows[0])
        : stmt.columns().map((c) => c.name);
    return {
      columns,
      rows,
      rowCount: rows.length,
      execMs: Date.now() - start,
    };
  }
}
