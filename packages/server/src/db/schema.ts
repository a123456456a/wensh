import type { TableMeta } from "../adapters/types.js";
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
 * Demo 表元数据（供路由）
 * @returns 四张 Demo 表的 tier 与关键词配置
 */
export function getDemoTablesMeta(): TableMeta[] {
  return [
    {
      name: "production_line",
      label: "产线",
      tier: "small",
      keywords: ["产线", "车间", "产能"],
    },
    {
      name: "work_order",
      label: "工单",
      tier: "large",
      keywords: ["工单", "订单", "在制"],
    },
    {
      name: "quality_record",
      label: "质量记录",
      tier: "large",
      keywords: ["良率", "质量", "不良", "抽检"],
    },
    {
      name: "shift_log",
      label: "班次日志",
      tier: "large",
      keywords: ["班次", "oee", "停机"],
    },
  ];
}

/**
 * MES 业务指标口径说明（注入 Prompt）
 */
export function getMetricsPrompt(): string {
  return `- 良率：AVG(yield_rate)，或 1 - SUM(defect_qty)/SUM(inspect_qty)
- 平均良率（产线维度）：按 line_id 分组后 AVG(yield_rate)，JOIN production_line 取 name
- 工单完成率（默认数量口径）：SUM(actual_qty)/SUM(planned_qty)，仅 status='done' 且 planned_qty>0
- 工单完成率（工单数口径）：COUNT(CASE WHEN status='done' THEN 1 END)/COUNT(*)
- 在制工单数：COUNT(*) WHERE status='running'
- OEE：AVG(oee)，可按产线/班次/日期分组
- 停机时长：SUM(downtime_min)，按产线/日期范围聚合
- 产能利用率：SUM(actual_qty)/capacity（按产线聚合）
- 产线名称字段：production_line.name（A线、B线、C线、D线、E线）`;
}
