import { describe, expect, it, vi, beforeEach } from "vitest";
import * as modelRouter from "../src/chains/modelRouter.js";
import {
  analyzeTableMatch,
  buildRouterPrompt,
  extractTableNames,
  getPreferredModelType,
  getPreferredModelTypeFromTables,
  getRouterMode,
  isHighConfidenceRuleRoute,
  matchTablesFromQuestion,
  parseLlmRouterDecision,
  resolveQueryModel,
  routeModel,
  routeModelForQuery,
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
    process.env.ROUTER_MODE = "hybrid";
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

  it("analyzeTableMatch marks noKeywordMatch when nothing hits", () => {
    const meta = [
      {
        name: "work_order",
        label: "工单",
        tier: "large" as const,
        keywords: ["工单"],
      },
    ];
    const analysis = analyzeTableMatch("随便问问", meta);
    expect(analysis.noKeywordMatch).toBe(true);
    expect(analysis.tables).toHaveLength(1);
    expect(analysis.keywordMatched).toHaveLength(0);
  });

  it("isHighConfidenceRuleRoute is true only for single keyword match", () => {
    const meta = [
      {
        name: "work_order",
        label: "工单",
        tier: "large" as const,
        keywords: ["工单"],
      },
      {
        name: "production_line",
        label: "产线",
        tier: "small" as const,
        keywords: ["产线"],
      },
    ];
    expect(
      isHighConfidenceRuleRoute(analyzeTableMatch("在制工单", meta)),
    ).toBe(true);
    expect(
      isHighConfidenceRuleRoute(analyzeTableMatch("产线和工单", meta)),
    ).toBe(false);
    expect(
      isHighConfidenceRuleRoute(analyzeTableMatch("随便问问", meta)),
    ).toBe(false);
  });

  it("parseLlmRouterDecision parses fenced JSON", () => {
    const decision = parseLlmRouterDecision(
      '说明\n```json\n{"model":"remote","reason":"跨表聚合"}\n```',
    );
    expect(decision).toEqual({ model: "remote", reason: "跨表聚合" });
  });

  it("getRouterMode defaults to hybrid and rejects invalid values", () => {
    delete process.env.ROUTER_MODE;
    expect(getRouterMode()).toBe("hybrid");
    process.env.ROUTER_MODE = "rule";
    expect(getRouterMode()).toBe("rule");
    process.env.ROUTER_MODE = "invalid";
    expect(getRouterMode()).toBe("hybrid");
  });

  it("routeModelForQuery hybrid uses rule for single-table high confidence", async () => {
    process.env.ROUTER_MODE = "hybrid";
    process.env.LOCAL_BASE_URL = "http://localhost:8000/v1";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200 }),
    );

    const meta = [
      {
        name: "production_line",
        label: "产线",
        tier: "small" as const,
        keywords: ["产线"],
      },
      {
        name: "work_order",
        label: "工单",
        tier: "large" as const,
        keywords: ["工单"],
      },
    ];

    const result = await routeModelForQuery("列出所有产线", meta);
    expect(result.type).toBe("local");
    expect(result.routeSource).toBe("rule");
  });

  it("getRouterModel skips local when unreachable", async () => {
    process.env.LOCAL_BASE_URL = "http://localhost:8000/v1";
    process.env.DEEPSEEK_API_KEY = "sk-test";
    vi.spyOn(modelRouter, "isLocalModelAvailable").mockResolvedValue(false);

    const router = await modelRouter.getRouterModel();
    expect(router).toBeDefined();
  });

  it("routeModelForQuery hybrid calls LLM router when confidence is low", async () => {
    process.env.ROUTER_MODE = "hybrid";
    const mockInvoke = vi.fn().mockResolvedValue({
      content: '{"model":"remote","reason":"无关键词命中"}',
    });
    vi.spyOn(modelRouter.routerModelResolver, "getRouterModel").mockResolvedValue({
      invoke: mockInvoke,
    } as unknown as Awaited<ReturnType<typeof modelRouter.getRouterModel>>);

    const meta = [
      {
        name: "production_line",
        label: "产线",
        tier: "small" as const,
        keywords: ["产线"],
      },
    ];

    const result = await routeModelForQuery("随便问问", meta);
    expect(mockInvoke).toHaveBeenCalledOnce();
    expect(result.type).toBe("remote");
    expect(result.routeSource).toBe("llm");
    expect(result.routeReason).toBe("无关键词命中");
  });

  it("buildRouterPrompt includes table tier and keywords", () => {
    const prompt = buildRouterPrompt("测试", [
      {
        name: "work_order",
        label: "工单",
        tier: "large",
        keywords: ["工单", "在制"],
      },
    ]);
    expect(prompt).toContain("work_order");
    expect(prompt).toContain("large");
    expect(prompt).toContain("工单");
  });

  it("resolveQueryModel prefers routed local when available", async () => {
    process.env.LOCAL_BASE_URL = "http://localhost:8000/v1";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200 }),
    );

    const resolved = await resolveQueryModel(
      { type: "local", routeSource: "rule" },
      "qwen",
    );
    expect(resolved?.type).toBe("local");
  });

  it("resolveQueryModel falls back to remote when local unavailable", async () => {
    delete process.env.LOCAL_BASE_URL;
    vi.spyOn(modelRouter, "isLocalModelAvailable").mockResolvedValue(false);
    process.env.QWEN_API_KEY = "sk-test-key";

    const resolved = await resolveQueryModel(
      { type: "local", routeSource: "rule" },
      "qwen",
    );
    expect(resolved?.type).toBe("remote");
    expect(resolved?.fallbackReason).toBe("local_unavailable");
  });

  it("resolveQueryModel returns null when no model is available", async () => {
    delete process.env.LOCAL_BASE_URL;
    vi.spyOn(modelRouter, "isLocalModelAvailable").mockResolvedValue(false);
    delete process.env.QWEN_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.CUSTOM_API_KEY;

    const resolved = await resolveQueryModel(
      { type: "remote", routeSource: "rule" },
      "qwen",
    );
    expect(resolved).toBeNull();
  });
});
