import { describe, expect, it, vi, beforeEach } from "vitest";
import { extractTableNames, getPreferredModelType } from "../src/chains/modelRouter.js";

vi.mock("../src/db/schema.js", () => ({
  ALL_TABLES: ["production_line", "work_order", "quality_record", "shift_log"],
  getRowCount: (table: string) => {
    const counts: Record<string, number> = {
      production_line: 50,
      work_order: 50000,
      quality_record: 50000,
      shift_log: 30000,
    };
    return counts[table] ?? 0;
  },
}));

describe("modelRouter", () => {
  beforeEach(() => {
    process.env.ROW_THRESHOLD = "10000";
  });

  it("maps keywords to tables", () => {
    expect(extractTableNames("查询工单数量")).toContain("work_order");
    expect(extractTableNames("良率最低")).toContain("quality_record");
    expect(extractTableNames("平均OEE")).toContain("shift_log");
    expect(extractTableNames("产线列表")).toContain("production_line");
  });

  it("returns all tables when no keyword matches", () => {
    const tables = extractTableNames("随便问问");
    expect(tables).toHaveLength(4);
  });

  it("routes to local for small tables only", () => {
    expect(getPreferredModelType("列出所有产线")).toBe("local");
  });

  it("routes to remote for large tables", () => {
    expect(getPreferredModelType("统计工单完成率")).toBe("remote");
  });
});
