import { describe, expect, it, vi, beforeAll } from "vitest";
import { closeDb } from "../src/db/client.js";

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: vi.fn().mockImplementation(() => ({
    invoke: vi.fn().mockResolvedValue({
      content: "```sql\nSELECT name AS 产线 FROM production_line LIMIT 5\n```",
    }),
  })),
}));

vi.mock("../src/chains/modelRouter.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/chains/modelRouter.js")>();
  return {
    ...actual,
    routeModel: vi.fn().mockResolvedValue({ type: "remote" as const }),
  };
});

describe("chain smoke", () => {
  beforeAll(async () => {
    process.env.SEED_SCALE = "0.01";
    closeDb();
    const { seedDatabase } = await import("../src/db/seed.js");
    seedDatabase();
    closeDb();
  }, 30000);

  it("runs query chain with mocked LLM", async () => {
    const { runQueryChain } = await import("../src/chains/buildChain.js");
    const result = await runQueryChain({
      question: "列出所有产线",
      interpret: false,
    });

    expect(result.sql.toUpperCase()).toContain("SELECT");
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.columns).toContain("产线");
  });
});
