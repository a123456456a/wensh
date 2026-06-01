import { afterEach, describe, expect, it } from "vitest";
import { HttpDomainAdapter } from "../src/adapters/httpDomainAdapter.js";
import { startMockDomainApiServer } from "./fixtures/mockDomainApiServer.js";

describe("mock domain API integration", () => {
  let mock: Awaited<ReturnType<typeof startMockDomainApiServer>> | null = null;

  afterEach(async () => {
    await mock?.close();
    mock = null;
  });

  it("domain=mes HttpDomainAdapter works against mock URL", async () => {
    mock = await startMockDomainApiServer({ token: "test-token" });
    const adapter = new HttpDomainAdapter({
      domain: "mes",
      label: "制造执行",
      baseUrl: mock.baseUrl,
      token: "test-token",
      timeoutMs: 5000,
    });

    expect(await adapter.ping()).toBe(true);

    const schema = await adapter.getSchema({ question: "工单数量" });
    expect(schema.dialect).toBe("mysql");
    expect(schema.promptSchema).toContain("CREATE TABLE");
    expect(schema.tablesMeta.length).toBeGreaterThan(0);

    const result = await adapter.executeQuery({ sql: "SELECT 1" });
    expect(result.rowCount).toBe(1);
    expect(result.columns).toEqual(["result"]);
    expect(result.rows[0]).toEqual({ result: 1 });
  });
});
