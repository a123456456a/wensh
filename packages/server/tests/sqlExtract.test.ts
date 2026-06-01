import { describe, expect, it } from "vitest";
import { extractSql, extractChartHint, stripThinkingTags } from "../src/utils/sqlExtract.js";

/** 构造带 thinking 标签的测试文本 */
function withThinkBlock(body: string, suffix: string): string {
  const open = "<" + "think>";
  const close = "</" + "think>";
  return `${open}${body}${close}\n${suffix}`;
}

describe("sqlExtract", () => {
  it("extracts fenced sql block", () => {
    const raw = "Here is the query:\n```sql\nSELECT * FROM production_line\n```";
    expect(extractSql(raw)).toBe("SELECT * FROM production_line");
  });

  it("strips thinking tags", () => {
    const raw = withThinkBlock("reasoning", "```sql\nSELECT 1\n```");
    expect(extractSql(raw)).toBe("SELECT 1");
  });

  it("fallback to SELECT match", () => {
    const raw = "SELECT id, name FROM production_line LIMIT 5";
    expect(extractSql(raw)).toContain("SELECT id, name");
  });

  it("extracts chart hint", () => {
    expect(extractChartHint("结果如下 [chart:bar]")).toBe("bar");
    expect(extractChartHint("趋势 [chart:line]")).toBe("line");
  });

  it("stripThinkingTags removes think block", () => {
    const raw = withThinkBlock("long reasoning", "SELECT 1");
    expect(stripThinkingTags(raw)).toBe("SELECT 1");
  });
});
