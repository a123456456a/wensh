import { describe, expect, it, vi } from "vitest";

vi.mock("../src/adapters/registry.js", () => ({
  getDomainAdapter: () => ({
    domain: "demo",
    label: "本地演示",
    getSchema: vi.fn().mockResolvedValue({
      dialect: "sqlite",
      promptSchema: "",
      metricsPrompt: "",
      tablesMeta: [],
    }),
    executeQuery: vi.fn(),
    ping: vi.fn().mockResolvedValue(true),
  }),
}));

const mockResolveQueryModel = vi.fn();
const mockRouteModelForQuery = vi.fn();

vi.mock("../src/chains/modelRouter.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/chains/modelRouter.js")>();
  return {
    ...actual,
    routeModelForQuery: (...args: unknown[]) => mockRouteModelForQuery(...args),
    resolveQueryModel: (...args: unknown[]) => mockResolveQueryModel(...args),
  };
});

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class MockChatOpenAI {
    /** @param _opts - LangChain 构造参数 */
    constructor(_opts: unknown) {}

    stream = vi.fn().mockImplementation(async function* () {
      yield {
        content: "您好！我是问数助手。",
        usage_metadata: {
          input_tokens: 10,
          output_tokens: 8,
          total_tokens: 18,
        },
      };
    });
  },
}));

describe("chat fallback", () => {
  it("returns chat mode when no model is available", async () => {
    mockResolveQueryModel.mockResolvedValue(null);
    mockRouteModelForQuery.mockResolvedValue({
      type: "remote" as const,
      routeSource: "rule" as const,
    });

    const { runQueryChain, buildNoModelChatMessage } = await import(
      "../src/chains/buildChain.js"
    );

    const result = await runQueryChain({
      question: "你好",
      domain: "demo",
      interpret: false,
    });

    expect(result.response_mode).toBe("chat");
    expect(result.fallback_reason).toBe("no_model_available");
    expect(result.sql).toBe("");
    expect(result.interpretation).toBe(buildNoModelChatMessage("你好"));
    expect(mockResolveQueryModel).toHaveBeenCalled();
    expect(mockRouteModelForQuery).not.toHaveBeenCalled();
  });

  it("streams LLM chat for greetings when model is available", async () => {
    mockResolveQueryModel.mockResolvedValue({
      type: "remote" as const,
      modelName: "deepseek-v4-pro",
      remoteProvider: "deepseek" as const,
    });

    const { runQueryChain } = await import("../src/chains/buildChain.js");

    const result = await runQueryChain({
      question: "你好",
      domain: "demo",
      interpret: false,
    });

    expect(mockRouteModelForQuery).not.toHaveBeenCalled();
    expect(result.response_mode).toBe("chat");
    expect(result.interpretation).toContain("问数助手");
    expect(result.sql).toBe("");
  });
});

describe("isChatOnlyQuestion", () => {
  it("detects greetings and help messages", async () => {
    const { isChatOnlyQuestion } = await import("../src/chains/buildChain.js");
    expect(isChatOnlyQuestion("你好")).toBe(true);
    expect(isChatOnlyQuestion("Hello!")).toBe(true);
    expect(isChatOnlyQuestion("怎么用")).toBe(true);
    expect(isChatOnlyQuestion("统计工单数量")).toBe(false);
  });
});
