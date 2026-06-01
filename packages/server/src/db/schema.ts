import { getDb } from "./client.js";

/** MES 数据库表名列表 */
export const ALL_TABLES = [
  "production_line",
  "work_order",
  "quality_record",
  "shift_log",
] as const;

export type MesTable = (typeof ALL_TABLES)[number];

/**
 * 从 SQLite 提取全部表的 CREATE TABLE 语句，供 LLM Prompt 注入
 */
export function getSchemaPrompt(): string {
  const db = getDb();
  const parts: string[] = [];

  for (const table of ALL_TABLES) {
    const row = db
      .prepare(
        `SELECT sql FROM sqlite_master WHERE type='table' AND name=?`,
      )
      .get(table) as { sql: string } | undefined;

    if (row?.sql) {
      parts.push(row.sql + ";");
    }
  }

  return parts.join("\n\n");
}

/**
 * 获取指定表的行数
 * @param table - 表名
 */
export function getRowCount(table: MesTable): number {
  const db = getDb();
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
    .get() as { count: number };
  return row.count;
}

/**
 * MES 业务指标口径说明（注入 Prompt）
 */
export function getMetricsPrompt(): string {
  return `- 良率：AVG(yield_rate)，或 1 - SUM(defect_qty)/SUM(inspect_qty)
- 工单完成率（默认）：SUM(actual_qty)/SUM(planned_qty)，仅 status='done' 且 planned_qty>0
- OEE：AVG(oee)
- 停机时长：SUM(downtime_min)
- 产线名称字段：production_line.name（A线、B线、C线、D线、E线）`;
}
