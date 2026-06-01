import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpDomainAdapter } from "../src/adapters/httpDomainAdapter.js";

describe("HttpDomainAdapter", () => {
  afterEach(() => vi.restoreAllMocks());

  it("getSchema calls GET /api/v1/schema", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          dialect: "mysql",
          prompt_schema: "CREATE TABLE t1 (id INT);",
          metrics_prompt: "- 指标A",
          tables_meta: [
            { name: "t1", label: "T1", tier: "small", keywords: ["a"] },
          ],
        }),
      }),
    );

    const adapter = new HttpDomainAdapter({
      domain: "mes",
      label: "制造执行",
      baseUrl: "http://mock-mes",
      token: "test-token",
      timeoutMs: 5000,
    });

    const schema = await adapter.getSchema({ question: "test" });
    expect(schema.dialect).toBe("mysql");
    expect(schema.promptSchema).toContain("CREATE TABLE");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/schema"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      }),
    );
  });
});
