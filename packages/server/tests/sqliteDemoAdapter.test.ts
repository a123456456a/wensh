import { describe, expect, it } from "vitest";
import { SqliteDemoAdapter } from "../src/adapters/sqliteDemoAdapter.js";

describe("SqliteDemoAdapter", () => {
  it("ping returns true when mes.db exists", async () => {
    const adapter = new SqliteDemoAdapter();
    await expect(adapter.ping()).resolves.toBe(true);
  });

  it("getSchema returns sqlite dialect and tables", async () => {
    const adapter = new SqliteDemoAdapter();
    const schema = await adapter.getSchema();
    expect(schema.dialect).toBe("sqlite");
    expect(schema.promptSchema).toContain("CREATE TABLE");
    expect(schema.tablesMeta.length).toBe(4);
  });
});
