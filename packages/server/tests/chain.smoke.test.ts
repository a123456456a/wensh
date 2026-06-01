import { describe, expect, it, vi, beforeAll } from "vitest";
import { closeDb } from "../src/db/client.js";

vi.mock("@langchain/openai", () => {
  const mockContent =
    "```sql\nSELECT name AS 产线 FROM production_line LIMIT 5\n```";

  const mockMessage = {
    content: mockContent,
    usage_metadata: {
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
    },
  };

  return {
    ChatOpenAI: class MockChatOpenAI {
      /** @param _opts - LangChain 构造参数 */
      constructor(_opts: unknown) {}

      invoke = vi.fn().mockResolvedValue(mockMessage);

      stream = vi.fn().mockImplementation(async function* () {
        yield mockMessage;
      });
    },
  };
});

vi.mock("../src/chains/modelRouter.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/chains/modelRouter.js")>();
  return {
    ...actual,
    routeModelWithMeta: vi.fn().mockResolvedValue({ type: "remote" as const }),
    isProviderConfigured: vi.fn().mockReturnValue(true),
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
      domain: "demo",
      interpret: false,
    });

    expect(result.sql.toUpperCase()).toContain("SELECT");
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.columns).toContain("产线");
    expect(result.token_usage).toBeDefined();
  });
});
