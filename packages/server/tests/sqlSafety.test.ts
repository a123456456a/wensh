import { describe, expect, it } from "vitest";
import { isSqlSafe, assertSqlSafe } from "../src/utils/sqlSafety.js";

describe("sqlSafety", () => {
  it("allows SELECT statements", () => {
    expect(isSqlSafe("SELECT * FROM production_line")).toBe(true);
    expect(isSqlSafe("  select id from work_order limit 10")).toBe(true);
  });

  it("rejects non-SELECT statements", () => {
    expect(isSqlSafe("INSERT INTO production_line VALUES (1)")).toBe(false);
    expect(isSqlSafe("UPDATE work_order SET status='done'")).toBe(false);
    expect(isSqlSafe("DELETE FROM work_order")).toBe(false);
    expect(isSqlSafe("DROP TABLE work_order")).toBe(false);
  });

  it("rejects multiple statements", () => {
    expect(isSqlSafe("SELECT 1; SELECT 2")).toBe(false);
  });

  it("assertSqlSafe throws on unsafe SQL", () => {
    expect(() => assertSqlSafe("DELETE FROM x")).toThrow();
  });
});
