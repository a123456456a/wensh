import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  extractTableNames,
  getPreferredModelType,
  getPreferredModelTypeFromTables,
  matchTablesFromQuestion,
  routeModel,
  isLocalModelAvailable,
} from "../src/chains/modelRouter.js";

vi.mock("../src/db/schema.js", () => ({
  ALL_TABLES: ["production_line", "work_order", "quality_record", "shift_log"],
  getRowCount: (table: string) => {
    const counts: Record<string, number> = {
      production_line: 5,
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
    vi.restoreAllMocks();
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

  it("falls back to remote when local model unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    process.env.LOCAL_BASE_URL = "http://localhost:8000/v1";

    const result = await routeModel("列出所有产线");
    expect(result.type).toBe("remote");
    expect(result.fallbackReason).toBe("local_unavailable");
  });

  it("isLocalModelAvailable returns false without base URL", async () => {
    delete process.env.LOCAL_BASE_URL;
    await expect(isLocalModelAvailable()).resolves.toBe(false);
  });

  it("matchTablesFromQuestion uses keywords from tablesMeta", () => {
    const meta = [
      {
        name: "work_order",
        label: "工单",
        tier: "large" as const,
        keywords: ["工单", "在制"],
      },
      {
        name: "production_line",
        label: "产线",
        tier: "small" as const,
        keywords: ["产线"],
      },
    ];
    const matched = matchTablesFromQuestion("在制工单有多少", meta);
    expect(matched.map((t) => t.name)).toContain("work_order");
  });

  it("getPreferredModelTypeFromTables routes large tier to remote", () => {
    expect(
      getPreferredModelTypeFromTables([
        { name: "t1", label: "T1", tier: "small", keywords: [] },
      ]),
    ).toBe("local");
    expect(
      getPreferredModelTypeFromTables([
        { name: "t2", label: "T2", tier: "large", keywords: [] },
      ]),
    ).toBe("remote");
  });
});
