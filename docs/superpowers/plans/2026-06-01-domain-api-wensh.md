# 问数多业务域 API 对接 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 wensh 从 SQLite/MES 单体 Demo 演进为支持多业务域（demo/mes/mro）的 NL2SQL 平台，通过 `DomainDataAdapter` 对接各域 Data API，保留现有 LangChain 查询链与 SSE 流式能力。

**Architecture:** 引入 `DomainDataAdapter` 抽象层替换 `getDb()`/`getSchemaPrompt()`/`getRowCount()` 三处直连；`SqliteDemoAdapter` 包装现有 Demo；`HttpDomainAdapter` 调用域 REST API；`modelRouter` 与 `buildChain` 仅依赖 Adapter 接口。

**Tech Stack:** TypeScript strict, Express, LangChain.js, Vue3, vitest, node fetch

**Design Spec:** `docs/superpowers/specs/2026-06-01-domain-api-wensh-design.md`  
**域 API 契约:** `docs/superpowers/specs/domain-data-api.openapi.yaml`

**阶段划分：**

| 阶段 | Tasks | 说明 |
|------|-------|------|
| **P0~P1** | Task 1–11 | 多域 Adapter + 前端域切换（可无登录） |
| **P4-auth** | Task 12–19 | 自建账号 + Session + HMAC 透传域 API |
| **P5-sso** | Task 20 | OIDC 骨架（后期启用） |

---

## File Map

| 文件 | 职责 |
|------|------|
| `packages/shared/src/types.ts` | 新增 `BusinessDomain`、`QueryRequest.domain`、Health 域列表 |
| `packages/server/src/adapters/types.ts` | `DomainDataAdapter` 接口 |
| `packages/server/src/adapters/sqliteDemoAdapter.ts` | Demo SQLite 实现 |
| `packages/server/src/adapters/httpDomainAdapter.ts` | HTTP 域 API 实现 |
| `packages/server/src/adapters/registry.ts` | 域 → Adapter 注册与 env 解析 |
| `packages/server/src/chains/buildChain.ts` | 改用 Adapter |
| `packages/server/src/chains/modelRouter.ts` | 改用 tablesMeta 路由 |
| `packages/server/src/routes/health.ts` | 展示各域 API 状态 |
| `packages/server/src/routes/query.ts` | zod 增加 domain 校验 |
| `packages/server/tests/domainAdapter.test.ts` | Adapter 单元测试 |
| `packages/server/tests/mockDomainApi.ts` | 测试用 mock 域 API |
| `packages/web/src/config/domains.ts` | 域标签与示例问题 |
| `packages/web/src/App.vue` | 域选择器 + 请求携带 domain |
| `.env.example` | 域 API 配置项 |
| **P4 新增** | |
| `packages/shared/src/authTypes.ts` | `AuthUser`、登录请求/响应类型 |
| `packages/server/src/auth/types.ts` | `AuthProvider` 接口 |
| `packages/server/src/auth/localAuthProvider.ts` | 自建账号认证 |
| `packages/server/src/auth/userStore.ts` | 用户/角色/数据范围 SQLite |
| `packages/server/src/auth/session.ts` | Session 配置与 `req.user` 扩展 |
| `packages/server/src/auth/signing.ts` | HMAC 用户上下文签名 |
| `packages/server/src/middleware/requireAuth.ts` | 保护 `/api/query` |
| `packages/server/src/routes/auth.ts` | login / logout / me |
| `packages/web/src/views/LoginView.vue` | 登录页 |
| `packages/web/src/api/auth.ts` | 登录 API 封装 |
| `packages/web/src/router/index.ts` | 路由守卫 |

---

### Task 1: 扩展共享类型

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/index.ts`（若需 re-export）

- [ ] **Step 1: 在 types.ts 顶部新增 BusinessDomain**

```typescript
/** 业务域标识 */
export type BusinessDomain = "demo" | "mes" | "mro";
```

- [ ] **Step 2: 扩展 QueryRequest**

在 `QueryRequest` 中增加：

```typescript
/** 业务域（demo=本地SQLite，mes/mro=域Data API） */
domain: BusinessDomain;
```

> **注意：** `user_id` / `data_scope` **不要**放在 QueryRequest 中（P4-auth Task 12）；用户上下文从 Session 读取，仅服务端透传域 API。

- [ ] **Step 3: 扩展 HealthResponse**

```typescript
/** 业务域健康状态 */
export interface DomainHealthItem {
  domain: BusinessDomain;
  label: string;
  api_available: boolean;
  api_base_url: string;
}

// 在 HealthResponse 中增加：
domains: DomainHealthItem[];
```

- [ ] **Step 4: 编译 shared 包**

Run: `pnpm --filter @wensh/shared build`  
Expected: 编译成功，无 TS 错误

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat(shared): add BusinessDomain and domain-aware query types"
```

---

### Task 2: DomainDataAdapter 接口

**Files:**
- Create: `packages/server/src/adapters/types.ts`

- [ ] **Step 1: 创建接口文件**

```typescript
import type { BusinessDomain } from "@wensh/shared";

/** 表元数据（供路由与 Prompt） */
export interface TableMeta {
  name: string;
  label: string;
  tier: "small" | "large";
  keywords: string[];
}

/** Schema  bundle */
export interface SchemaBundle {
  dialect: "mysql" | "sqlite";
  promptSchema: string;
  metricsPrompt: string;
  tablesMeta: TableMeta[];
}

/** SQL 执行结果 */
export interface ExecuteQueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  execMs: number;
}

/** 域数据访问抽象 */
export interface DomainDataAdapter {
  readonly domain: BusinessDomain;
  readonly label: string;
  ping(): Promise<boolean>;
  getSchema(options?: { question?: string; tables?: string[] }): Promise<SchemaBundle>;
  executeQuery(params: {
    sql: string;
    sourceQuestion?: string;
    traceId?: string;
    userId?: string;
    dataScope?: Record<string, unknown>;
  }): Promise<ExecuteQueryResult>;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/adapters/types.ts
git commit -m "feat(server): add DomainDataAdapter interface"
```

---

### Task 3: SqliteDemoAdapter（包装现有 db 层）

**Files:**
- Create: `packages/server/src/adapters/sqliteDemoAdapter.ts`
- Modify: `packages/server/src/db/schema.ts`（导出 tablesMeta 常量或函数）

- [ ] **Step 1: 在 schema.ts 新增 getDemoTablesMeta**

```typescript
/** Demo 表元数据（供路由） */
export function getDemoTablesMeta(): TableMeta[] {
  return [
    { name: "production_line", label: "产线", tier: "small", keywords: ["产线", "车间", "产能"] },
    { name: "work_order", label: "工单", tier: "large", keywords: ["工单", "订单", "在制"] },
    { name: "quality_record", label: "质量记录", tier: "large", keywords: ["良率", "质量", "不良", "抽检"] },
    { name: "shift_log", label: "班次日志", tier: "large", keywords: ["班次", "oee", "停机"] },
  ];
}
```

需在 schema.ts 顶部 import `TableMeta` from adapters/types，或把 TableMeta 再 export 自 shared（推荐只在 adapters 层定义，schema 返回 inline 类型后 adapter 映射）。

- [ ] **Step 2: 实现 SqliteDemoAdapter**

```typescript
import type { BusinessDomain } from "@wensh/shared";
import { getDb } from "../db/client.js";
import { getMetricsPrompt, getSchemaPrompt, getDemoTablesMeta } from "../db/schema.js";
import type { DomainDataAdapter, ExecuteQueryResult, SchemaBundle } from "./types.js";

/** Demo 域：本地 SQLite */
export class SqliteDemoAdapter implements DomainDataAdapter {
  readonly domain: BusinessDomain = "demo";
  readonly label = "本地演示";

  async ping(): Promise<boolean> {
    try {
      getDb().prepare("SELECT 1").get();
      return true;
    } catch {
      return false;
    }
  }

  async getSchema(): Promise<SchemaBundle> {
    return {
      dialect: "sqlite",
      promptSchema: getSchemaPrompt(),
      metricsPrompt: getMetricsPrompt(),
      tablesMeta: getDemoTablesMeta(),
    };
  }

  async executeQuery(params: { sql: string }): Promise<ExecuteQueryResult> {
    const start = Date.now();
    const db = getDb();
    const stmt = db.prepare(params.sql);
    const rows = stmt.all() as Record<string, unknown>[];
    const columns =
      rows.length > 0 ? Object.keys(rows[0]) : stmt.columns().map((c) => c.name);
    return {
      columns,
      rows,
      rowCount: rows.length,
      execMs: Date.now() - start,
    };
  }
}
```

- [ ] **Step 3: 编写失败测试**

Create `packages/server/tests/sqliteDemoAdapter.test.ts`:

```typescript
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
```

- [ ] **Step 4: 运行测试**

Run: `pnpm --filter @wensh/server test sqliteDemoAdapter`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/adapters/sqliteDemoAdapter.ts packages/server/src/db/schema.ts packages/server/tests/sqliteDemoAdapter.test.ts
git commit -m "feat(server): add SqliteDemoAdapter wrapping existing SQLite layer"
```

---

### Task 4: HttpDomainAdapter

**Files:**
- Create: `packages/server/src/adapters/httpDomainAdapter.ts`
- Create: `packages/server/tests/httpDomainAdapter.test.ts`

- [ ] **Step 1: 编写失败测试（mock fetch）**

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpDomainAdapter } from "../src/adapters/httpDomainAdapter.js";

describe("HttpDomainAdapter", () => {
  afterEach(() => vi.restoreAllMocks());

  it("getSchema calls GET /api/v1/schema", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        dialect: "mysql",
        prompt_schema: "CREATE TABLE t1 (id INT);",
        metrics_prompt: "- 指标A",
        tables_meta: [{ name: "t1", label: "T1", tier: "small", keywords: ["a"] }],
      }),
    }));

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
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer test-token" }) }),
    );
  });
});
```

- [ ] **Step 2: 实现 HttpDomainAdapter**

```typescript
import type { BusinessDomain } from "@wensh/shared";
import type { DomainDataAdapter, ExecuteQueryResult, SchemaBundle } from "./types.js";

export interface HttpDomainAdapterConfig {
  domain: BusinessDomain;
  label: string;
  baseUrl: string;
  token: string;
  timeoutMs: number;
}

/** HTTP 域 Data API 适配器 */
export class HttpDomainAdapter implements DomainDataAdapter {
  readonly domain: BusinessDomain;
  readonly label: string;
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(config: HttpDomainAdapterConfig) {
    this.domain = config.domain;
    this.label = config.label;
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.token = config.token;
    this.timeoutMs = config.timeoutMs;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
      });
      const body = (await res.json()) as T & { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? `域 API 请求失败: ${res.status}`);
      }
      return body;
    } finally {
      clearTimeout(timer);
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.request("/api/v1/health");
      return true;
    } catch {
      return false;
    }
  }

  async getSchema(options?: { question?: string; tables?: string[] }): Promise<SchemaBundle> {
    const params = new URLSearchParams();
    if (options?.question) params.set("question", options.question);
    if (options?.tables?.length) params.set("tables", options.tables.join(","));
    const qs = params.toString();
    const data = await this.request<{
      dialect: "mysql";
      prompt_schema: string;
      metrics_prompt: string;
      tables_meta: SchemaBundle["tablesMeta"];
    }>(`/api/v1/schema${qs ? `?${qs}` : ""}`);

    return {
      dialect: data.dialect,
      promptSchema: data.prompt_schema,
      metricsPrompt: data.metrics_prompt,
      tablesMeta: data.tables_meta,
    };
  }

  async executeQuery(params: {
    sql: string;
    sourceQuestion?: string;
    traceId?: string;
    userId?: string;
    dataScope?: Record<string, unknown>;
  }): Promise<ExecuteQueryResult> {
    const headers: Record<string, string> = {};
    if (params.userId) headers["X-User-Id"] = params.userId;
    if (params.dataScope) headers["X-Data-Scope"] = JSON.stringify(params.dataScope);

    const data = await this.request<{
      columns: string[];
      rows: Record<string, unknown>[];
      row_count: number;
      exec_ms: number;
    }>("/api/v1/query/execute", {
      method: "POST",
      headers,
      body: JSON.stringify({
        sql: params.sql,
        timeout_ms: this.timeoutMs,
        max_rows: 1000,
        source_question: params.sourceQuestion,
        trace_id: params.traceId,
      }),
    });

    return {
      columns: data.columns,
      rows: data.rows,
      rowCount: data.row_count,
      execMs: data.exec_ms,
    };
  }
}
```

- [ ] **Step 3: 运行测试**

Run: `pnpm --filter @wensh/server test httpDomainAdapter`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/adapters/httpDomainAdapter.ts packages/server/tests/httpDomainAdapter.test.ts
git commit -m "feat(server): add HttpDomainAdapter for domain Data API"
```

---

### Task 5: DomainAdapterRegistry

**Files:**
- Create: `packages/server/src/adapters/registry.ts`

- [ ] **Step 1: 实现 registry**

```typescript
import type { BusinessDomain } from "@wensh/shared";
import { HttpDomainAdapter } from "./httpDomainAdapter.js";
import { SqliteDemoAdapter } from "./sqliteDemoAdapter.js";
import type { DomainDataAdapter } from "./types.js";

const demoAdapter = new SqliteDemoAdapter();

/** 从环境变量解析 HTTP 域 Adapter */
function createHttpAdapter(
  domain: BusinessDomain,
  label: string,
  urlEnv: string,
): DomainDataAdapter | null {
  const baseUrl = process.env[urlEnv]?.trim();
  if (!baseUrl) return null;
  const token = process.env.DOMAIN_API_TOKEN?.trim() ?? "";
  const timeoutMs = Number(process.env.DOMAIN_API_TIMEOUT_MS ?? "30000");
  return new HttpDomainAdapter({ domain, label, baseUrl, token, timeoutMs });
}

/** 获取指定域 Adapter；未配置 HTTP 域时 mes/mro 不可用 */
export function getDomainAdapter(domain: BusinessDomain): DomainDataAdapter {
  if (domain === "demo") return demoAdapter;

  if (domain === "mes") {
    const adapter = createHttpAdapter("mes", process.env.MES_DOMAIN_LABEL ?? "制造执行", "MES_DATA_API_URL");
    if (!adapter) throw new Error("MES 域 API 未配置，请设置 MES_DATA_API_URL");
    return adapter;
  }

  if (domain === "mro") {
    const adapter = createHttpAdapter("mro", process.env.MRO_DOMAIN_LABEL ?? "设备维护", "MRO_DATA_API_URL");
    if (!adapter) throw new Error("MRO 域 API 未配置，请设置 MRO_DATA_API_URL");
    return adapter;
  }

  throw new Error(`未知业务域: ${domain}`);
}

/** 列出所有域及其 Adapter（health 用） */
export async function listDomainHealth(): Promise<
  Array<{ domain: BusinessDomain; label: string; adapter: DomainDataAdapter | null; apiBaseUrl: string }>
> {
  const items: Array<{ domain: BusinessDomain; label: string; envKey: string; labelEnv: string }> = [
    { domain: "demo", label: "本地演示", envKey: "", labelEnv: "" },
    { domain: "mes", label: process.env.MES_DOMAIN_LABEL ?? "制造执行", envKey: "MES_DATA_API_URL", labelEnv: "MES_DOMAIN_LABEL" },
    { domain: "mro", label: process.env.MRO_DOMAIN_LABEL ?? "设备维护", envKey: "MRO_DATA_API_URL", labelEnv: "MRO_DOMAIN_LABEL" },
  ];

  return items.map((item) => {
    if (item.domain === "demo") {
      return { domain: item.domain, label: item.label, adapter: demoAdapter, apiBaseUrl: "sqlite://local" };
    }
    const baseUrl = process.env[item.envKey]?.trim() ?? "";
    const adapter = baseUrl
      ? createHttpAdapter(item.domain, item.label, item.envKey)
      : null;
    return { domain: item.domain, label: item.label, adapter, apiBaseUrl: baseUrl };
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/adapters/registry.ts
git commit -m "feat(server): add DomainAdapterRegistry with env-based domain resolution"
```

---

### Task 6: 重构 modelRouter

**Files:**
- Modify: `packages/server/src/chains/modelRouter.ts`
- Modify: `packages/server/tests/modelRouter.test.ts`

- [ ] **Step 1: 新增 routeModelWithSchema 函数**

```typescript
import type { TableMeta } from "../adapters/types.js";

/**
 * 根据表元数据决定首选模型（任一 large 表 → remote）
 */
export function getPreferredModelTypeFromTables(tables: TableMeta[]): ModelType {
  const threshold = Number(process.env.ROW_THRESHOLD ?? "10000");
  // tier 优先；demo 兼容可保留 getRowCount fallback
  const hasLarge = tables.some((t) => t.tier === "large");
  if (hasLarge) return "remote";
  return "local";
}

/**
 * 从 tablesMeta 匹配问题涉及的表
 */
export function matchTablesFromQuestion(question: string, tablesMeta: TableMeta[]): TableMeta[] {
  const lower = question.toLowerCase();
  const matched = tablesMeta.filter((t) =>
    t.keywords.some((kw) => lower.includes(kw.toLowerCase())),
  );
  return matched.length > 0 ? matched : tablesMeta;
}

export async function routeModelWithMeta(
  question: string,
  tablesMeta: TableMeta[],
): Promise<RouteResult> {
  const matched = matchTablesFromQuestion(question, tablesMeta);
  const preferred = getPreferredModelTypeFromTables(matched);
  if (preferred === "local") {
    const available = await isLocalModelAvailable();
    if (!available) return { type: "remote", fallbackReason: "local_unavailable" };
    return { type: "local" };
  }
  return { type: "remote" };
}
```

- [ ] **Step 2: 更新 modelRouter.test.ts 覆盖 matchTablesFromQuestion**

- [ ] **Step 3: 运行测试**

Run: `pnpm --filter @wensh/server test modelRouter`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/chains/modelRouter.ts packages/server/tests/modelRouter.test.ts
git commit -m "refactor(server): modelRouter uses tablesMeta instead of hardcoded MES tables"
```

---

### Task 7: 重构 buildChain

**Files:**
- Modify: `packages/server/src/chains/buildChain.ts`

- [ ] **Step 1: 替换 db 直接依赖为 adapter**

关键改动：

```typescript
import { getDomainAdapter } from "../adapters/registry.js";
import { routeModelWithMeta } from "./modelRouter.js";

// buildSqlPrompt 签名改为接收 SchemaBundle
function buildSqlPrompt(
  question: string,
  schema: SchemaBundle,
  history?: HistoryItem[],
  errorFeedback?: string,
): string {
  const dialectLabel = schema.dialect === "mysql" ? "MySQL" : "SQLite";
  // promptSchema / metricsPrompt 来自 schema
  // 最后一行改为：请生成一条标准 ${dialectLabel} 查询语句
}

// executeSql 改为 adapter.executeQuery
// runQueryChainStream 开头：
const adapter = getDomainAdapter(request.domain);
const schemaBundle = await adapter.getSchema({ question: request.question });
const route = await routeModelWithMeta(request.question, schemaBundle.tablesMeta);
```

- [ ] **Step 2: 更新 chain.smoke.test.ts 请求体增加 domain: "demo"**

- [ ] **Step 3: 运行全量测试**

Run: `pnpm test`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/chains/buildChain.ts packages/server/tests/chain.smoke.test.ts
git commit -m "refactor(server): buildChain uses DomainDataAdapter"
```

---

### Task 8: 更新 API 路由

**Files:**
- Modify: `packages/server/src/routes/query.ts`
- Modify: `packages/server/src/routes/health.ts`

- [ ] **Step 1: query.ts zod 增加 domain**

```typescript
const businessDomainSchema = z.enum(["demo", "mes", "mro"]) satisfies z.ZodType<BusinessDomain>;

const queryBodySchema = z.object({
  question: z.string().min(1).max(500),
  domain: businessDomainSchema,
  interpret: z.boolean().optional(),
  history: z.array(historyItemSchema).max(2).optional(),
  remote_provider: remoteProviderSchema.optional(),
});
```

- [ ] **Step 2: health.ts 增加 domains 列表**

```typescript
import { listDomainHealth } from "../adapters/registry.js";

// 在 handler 中：
const domainItems = await listDomainHealth();
const domains = await Promise.all(
  domainItems.map(async (item) => ({
    domain: item.domain,
    label: item.label,
    api_available: item.adapter ? await item.adapter.ping() : false,
    api_base_url: item.apiBaseUrl,
  })),
);
// body.domains = domains
```

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/routes/query.ts packages/server/src/routes/health.ts
git commit -m "feat(server): domain-aware query validation and health domains list"
```

---

### Task 9: Mock Domain API（联调与测试）

**Files:**
- Create: `packages/server/tests/fixtures/mockDomainApiServer.ts`

- [ ] **Step 1: 最小 mock Express 服务**

返回固定 schema + 对 `SELECT 1` 返回单行，供集成测试使用。

- [ ] **Step 2: 集成测试 domain=mes 走 mock URL**

Run: `pnpm --filter @wensh/server test`  
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/server/tests/fixtures/mockDomainApiServer.ts
git commit -m "test(server): add mock domain Data API for integration tests"
```

---

### Task 10: 前端域选择器

**Files:**
- Create: `packages/web/src/config/domains.ts`
- Modify: `packages/web/src/App.vue`
- Modify: `packages/web/src/api/queryStream.ts`（确保 body 含 domain）

- [ ] **Step 1: domains.ts**

```typescript
import type { BusinessDomain } from "@wensh/shared";

export const DOMAIN_SAMPLE_QUESTIONS: Record<BusinessDomain, string[]> = {
  demo: [
    "上个月哪条产线良率最低？",
    "今年A线的工单完成率按月统计",
    "统计各班次的平均OEE",
    "查询所有状态为running的工单数量",
    "近30天停机时间最长的产线是哪条？",
  ],
  mes: [
    "上个月哪条产线良率最低？",
    "各车间工单完成率对比",
    "近7天 OEE 趋势",
  ],
  mro: [
    "本月故障次数最多的设备 TOP5",
    "备件库存低于安全库存的清单",
    "维保计划完成率按车间统计",
  ],
};
```

- [ ] **Step 2: App.vue 增加 el-select domain，postQueryStream 传 domain**

- [ ] **Step 3: 本地验证**

Run: `pnpm dev`  
Expected: 默认 demo 域可用；切换 mes/mro 时若 API 未配置显示错误提示

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/config/domains.ts packages/web/src/App.vue packages/web/src/api/queryStream.ts
git commit -m "feat(web): add business domain selector and domain-specific sample questions"
```

---

### Task 11: 环境变量与文档

**Files:**
- Modify: `.env.example`
- Modify: `README.md`（简短增加域 API 说明）

- [ ] **Step 1: 更新 .env.example**（见 design spec 4.5）

- [ ] **Step 2: README 增加「多业务域 API 对接」章节链接到 design spec**

- [ ] **Step 3: Commit**

```bash
git add .env.example README.md
git commit -m "docs: document multi-domain API configuration"
```

---

**Which approach?**

---

# Phase P4-auth：自建账号 + HMAC 用户上下文

> **前置条件：** P0~P1（Task 1–11）已完成。  
> **Goal：** 问数平台自建账号登录；`/api/query` 需 Session；调域 API 时自动附带 `X-Wensh-*` + HMAC 签名。  
> **安全原则：** `user_id` / `data_scope` **禁止**由前端 QueryRequest 传入，一律从 `req.user` 读取。

**新增依赖（server）：** `bcryptjs`、`express-session`、`cookie-parser`  
Run: `pnpm --filter @wensh/server add bcryptjs express-session cookie-parser && pnpm --filter @wensh/server add -D @types/bcryptjs @types/express-session @types/cookie-parser`

---

### Task 12: 共享认证类型

**Files:**
- Create: `packages/shared/src/authTypes.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 定义 AuthUser 与 API 类型**

```typescript
/** 问数平台统一用户上下文（自建账号与 SSO 输出相同结构） */
export interface AuthUser {
  user_id: string;
  username: string;
  roles: string[];
  data_scope: {
    factory_ids?: string[];
    workshop_ids?: string[];
    line_ids?: string[];
  };
}

/** POST /api/auth/login */
export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: Pick<AuthUser, "user_id" | "username" | "roles">;
}

/** GET /api/auth/me */
export interface MeResponse {
  user: AuthUser;
}
```

- [ ] **Step 2: 从 QueryRequest 移除客户端 user_id/data_scope（若 P1 已加则删除）**

QueryRequest **不应**包含 `user_id`、`data_scope`；用户上下文仅服务端 Session 提供。

- [ ] **Step 3: 编译 shared**

Run: `pnpm --filter @wensh/shared build`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/authTypes.ts packages/shared/src/index.ts packages/shared/src/types.ts
git commit -m "feat(shared): add AuthUser and login API types"
```

---

### Task 13: 用户存储（问数专用 auth.db）

**Files:**
- Create: `packages/server/src/auth/userStore.ts`
- Create: `packages/server/src/auth/seedUsers.ts`
- Create: `packages/server/tests/userStore.test.ts`

- [ ] **Step 1: 编写失败测试**

```typescript
import { describe, expect, it, beforeAll } from "vitest";
import { UserStore } from "../src/auth/userStore.js";

describe("UserStore", () => {
  let store: UserStore;

  beforeAll(() => {
    store = new UserStore(":memory:");
    store.migrate();
    store.createUser({
      username: "demo",
      password: "demo123",
      roles: ["mes_viewer"],
      data_scope: { factory_ids: ["F01"] },
    });
  });

  it("verifyPassword succeeds for valid credentials", async () => {
    const user = await store.verifyPassword("demo", "demo123");
    expect(user).not.toBeNull();
    expect(user!.username).toBe("demo");
    expect(user!.roles).toContain("mes_viewer");
  });

  it("verifyPassword fails for wrong password", async () => {
    const user = await store.verifyPassword("demo", "wrong");
    expect(user).toBeNull();
  });
});
```

- [ ] **Step 2: 实现 UserStore（node:sqlite 可写）**

```typescript
import { DatabaseSync } from "node:sqlite";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import type { AuthUser } from "@wensh/shared";

/** 问数平台用户存储（与 mes.db 业务数据无关） */
export class UserStore {
  private db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
  }

  migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        external_id TEXT
      );
      CREATE TABLE IF NOT EXISTS user_roles (
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        PRIMARY KEY (user_id, role)
      );
      CREATE TABLE IF NOT EXISTS user_data_scope (
        user_id TEXT NOT NULL,
        scope_type TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        PRIMARY KEY (user_id, scope_type, scope_id)
      );
    `);
  }

  async createUser(input: {
    username: string;
    password: string;
    roles: string[];
    data_scope: AuthUser["data_scope"];
  }): Promise<void> {
    const id = randomUUID();
    const hash = await bcrypt.hash(input.password, 10);
    this.db.prepare(
      "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)",
    ).run(id, input.username, hash);
    for (const role of input.roles) {
      this.db.prepare("INSERT INTO user_roles (user_id, role) VALUES (?, ?)").run(id, role);
    }
    this.insertScope(id, input.data_scope);
  }

  private insertScope(userId: string, scope: AuthUser["data_scope"]): void {
    const entries: Array<[string, string]> = [];
    for (const fid of scope.factory_ids ?? []) entries.push(["factory", fid]);
    for (const wid of scope.workshop_ids ?? []) entries.push(["workshop", wid]);
    for (const lid of scope.line_ids ?? []) entries.push(["line", lid]);
    for (const [type, sid] of entries) {
      this.db.prepare(
        "INSERT INTO user_data_scope (user_id, scope_type, scope_id) VALUES (?, ?, ?)",
      ).run(userId, type, sid);
    }
  }

  async verifyPassword(username: string, password: string): Promise<AuthUser | null> {
    const row = this.db.prepare(
      "SELECT id, username FROM users WHERE username = ? AND status = 'active'",
    ).get(username) as { id: string; username: string } | undefined;
    if (!row) return null;

    const cred = this.db.prepare(
      "SELECT password_hash FROM users WHERE id = ?",
    ).get(row.id) as { password_hash: string };
    const ok = await bcrypt.compare(password, cred.password_hash);
    if (!ok) return null;

    return this.loadAuthUser(row.id);
  }

  loadAuthUser(userId: string): AuthUser {
    const user = this.db.prepare(
      "SELECT id, username FROM users WHERE id = ?",
    ).get(userId) as { id: string; username: string };

    const roles = this.db.prepare(
      "SELECT role FROM user_roles WHERE user_id = ?",
    ).all(userId) as Array<{ role: string }>;

    const scopes = this.db.prepare(
      "SELECT scope_type, scope_id FROM user_data_scope WHERE user_id = ?",
    ).all(userId) as Array<{ scope_type: string; scope_id: string }>;

    const data_scope: AuthUser["data_scope"] = {};
    for (const s of scopes) {
      if (s.scope_type === "factory") {
        data_scope.factory_ids = [...(data_scope.factory_ids ?? []), s.scope_id];
      }
      if (s.scope_type === "workshop") {
        data_scope.workshop_ids = [...(data_scope.workshop_ids ?? []), s.scope_id];
      }
      if (s.scope_type === "line") {
        data_scope.line_ids = [...(data_scope.line_ids ?? []), s.scope_id];
      }
    }

    return {
      user_id: user.id,
      username: user.username,
      roles: roles.map((r) => r.role),
      data_scope,
    };
  }
}
```

- [ ] **Step 3: seedUsers.ts 默认账号**

```typescript
/** 初始化默认演示账号 demo / demo123 */
export function seedDefaultUsers(store: UserStore): void {
  const exists = store["db"].prepare(
    "SELECT 1 FROM users WHERE username = 'demo'",
  ).get();
  if (exists) return;
  void store.createUser({
    username: "demo",
    password: "demo123",
    roles: ["mes_viewer", "mro_viewer"],
    data_scope: { factory_ids: ["F01"] },
  });
}
```

（生产环境 `seedDefaultUsers` 仅 dev 模式调用。）

- [ ] **Step 4: 运行测试**

Run: `pnpm --filter @wensh/server test userStore`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/auth/userStore.ts packages/server/src/auth/seedUsers.ts packages/server/tests/userStore.test.ts
git commit -m "feat(server): add UserStore for local account auth"
```

---

### Task 14: AuthProvider + Session

**Files:**
- Create: `packages/server/src/auth/types.ts`
- Create: `packages/server/src/auth/localAuthProvider.ts`
- Create: `packages/server/src/auth/session.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: AuthProvider 接口**

```typescript
import type { Request } from "express";
import type { AuthUser } from "@wensh/shared";

/** 认证提供者（V1 Local / V2 OIDC） */
export interface AuthProvider {
  authenticate(req: Request): Promise<AuthUser>;
}
```

- [ ] **Step 2: LocalAuthProvider**

```typescript
import type { Request } from "express";
import type { AuthUser } from "@wensh/shared";
import type { AuthProvider } from "./types.js";
import { getUserStore } from "./userStore.js";

/** 从 Session 解析自建账号用户 */
export class LocalAuthProvider implements AuthProvider {
  async authenticate(req: Request): Promise<AuthUser> {
    const userId = req.session?.userId;
    if (!userId) {
      throw new Error("UNAUTHORIZED");
    }
    return getUserStore().loadAuthUser(userId);
  }
}
```

- [ ] **Step 3: session.ts + Express 类型扩展**

```typescript
import session from "express-session";
import type { Express } from "express";

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

/** 挂载 Session 中间件 */
export function setupSession(app: Express): void {
  app.use(
    session({
      secret: process.env.SESSION_SECRET ?? "dev-insecure-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: Number(process.env.SESSION_MAX_AGE_MS ?? "86400000"),
      },
    }),
  );
}

/** 按环境变量选择 AuthProvider */
export function getAuthProvider(): AuthProvider {
  const mode = process.env.AUTH_PROVIDER ?? "local";
  if (mode === "local") {
    return new LocalAuthProvider();
  }
  throw new Error(`Unsupported AUTH_PROVIDER: ${mode}`);
}
```

- [ ] **Step 4: index.ts 挂载 cookie-parser + session**

```typescript
import cookieParser from "cookie-parser";
import { setupSession } from "./auth/session.js";

app.use(cookieParser());
setupSession(app);
```

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/auth/types.ts packages/server/src/auth/localAuthProvider.ts packages/server/src/auth/session.ts packages/server/src/index.ts
git commit -m "feat(server): add LocalAuthProvider and session middleware"
```

---

### Task 15: 认证路由 + requireAuth 中间件

**Files:**
- Create: `packages/server/src/routes/auth.ts`
- Create: `packages/server/src/middleware/requireAuth.ts`
- Modify: `packages/server/src/routes/query.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: auth 路由**

```typescript
import { Router } from "express";
import type { LoginRequest, LoginResponse, MeResponse } from "@wensh/shared";
import { z } from "zod";
import { getUserStore } from "../auth/userStore.js";
import { getAuthProvider } from "../auth/session.js";

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "用户名或密码无效" });
    return;
  }
  const user = await getUserStore().verifyPassword(
    parsed.data.username,
    parsed.data.password,
  );
  if (!user) {
    res.status(401).json({ error: "用户名或密码错误" });
    return;
  }
  req.session.userId = user.user_id;
  const body: LoginResponse = {
    user: { user_id: user.user_id, username: user.username, roles: user.roles },
  };
  res.json(body);
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

authRouter.get("/me", async (req, res, next) => {
  try {
    const user = await getAuthProvider().authenticate(req);
    const body: MeResponse = { user };
    res.json(body);
  } catch {
    res.status(401).json({ error: "未登录" });
  }
});
```

- [ ] **Step 2: requireAuth 中间件**

```typescript
import type { RequestHandler } from "express";
import type { AuthUser } from "@wensh/shared";
import { getAuthProvider } from "../auth/session.js";

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

/** 保护需登录的路由；AUTH_ENABLED=false 时跳过（便于 P1 开发） */
export const requireAuth: RequestHandler = async (req, res, next) => {
  if (process.env.AUTH_ENABLED !== "true") {
    return next();
  }
  try {
    req.user = await getAuthProvider().authenticate(req);
    next();
  } catch {
    res.status(401).json({ error: "未登录，请先登录" });
  }
};
```

- [ ] **Step 3: query 路由挂载 requireAuth**

```typescript
import { requireAuth } from "../middleware/requireAuth.js";

queryRouter.post("/", requireAuth, async (req, res, next) => { /* ... */ });
queryRouter.post("/stream", requireAuth, async (req, res) => { /* ... */ });
```

- [ ] **Step 4: index.ts 注册 `/api/auth`**

```typescript
import { authRouter } from "./routes/auth.js";
app.use("/api/auth", authRouter);
```

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/auth.ts packages/server/src/middleware/requireAuth.ts packages/server/src/routes/query.ts packages/server/src/index.ts
git commit -m "feat(server): add login/logout/me and requireAuth middleware"
```

---

### Task 16: HMAC 签名 + 升级 HttpDomainAdapter

**Files:**
- Create: `packages/server/src/auth/signing.ts`
- Modify: `packages/server/src/adapters/types.ts`
- Modify: `packages/server/src/adapters/httpDomainAdapter.ts`
- Modify: `packages/server/src/chains/buildChain.ts`
- Create: `packages/server/tests/signing.test.ts`

- [ ] **Step 1: signing.ts 失败测试**

```typescript
import { describe, expect, it } from "vitest";
import { buildUserContextHeaders } from "../src/auth/signing.js";

describe("buildUserContextHeaders", () => {
  it("produces stable HMAC headers", () => {
    process.env.WENSH_DOMAIN_SIGNING_SECRET = "test-secret";
    const headers = buildUserContextHeaders({
      user_id: "u1",
      username: "demo",
      roles: ["mes_viewer"],
      data_scope: { factory_ids: ["F01"] },
    }, 1717234567);

    expect(headers["X-Wensh-User-Id"]).toBe("u1");
    expect(headers["X-Wensh-User-Roles"]).toBe("mes_viewer");
    expect(headers["X-Wensh-Data-Scope"]).toBe('{"factory_ids":["F01"]}');
    expect(headers["X-Wensh-Timestamp"]).toBe("1717234567");
    expect(headers["X-Wensh-User-Signature"]).toMatch(/^[a-f0-9]{64}$/);
  });
});
```

- [ ] **Step 2: 实现 buildUserContextHeaders**

```typescript
import { createHmac } from "node:crypto";
import type { AuthUser } from "@wensh/shared";

/**
 * 生成域 API 所需的用户上下文 Header（含 HMAC 签名）
 * @param user - 已认证用户
 * @param timestampSec - Unix 秒时间戳
 */
export function buildUserContextHeaders(
  user: AuthUser,
  timestampSec: number = Math.floor(Date.now() / 1000),
): Record<string, string> {
  const roles = user.roles.join(",");
  const dataScopeJson = JSON.stringify(user.data_scope);
  const timestamp = String(timestampSec);
  const secret = process.env.WENSH_DOMAIN_SIGNING_SECRET ?? "";
  const payload = `${user.user_id}${roles}${dataScopeJson}${timestamp}`;
  const signature = createHmac("sha256", secret).update(payload).digest("hex");

  return {
    "X-Wensh-User-Id": user.user_id,
    "X-Wensh-User-Roles": roles,
    "X-Wensh-Data-Scope": dataScopeJson,
    "X-Wensh-Timestamp": timestamp,
    "X-Wensh-User-Signature": signature,
  };
}
```

- [ ] **Step 3: Adapter 接口增加 authUser 参数**

```typescript
// adapters/types.ts — getSchema 与 executeQuery 增加：
authUser?: AuthUser;
```

- [ ] **Step 4: HttpDomainAdapter 合并签名 Header**

```typescript
import type { AuthUser } from "@wensh/shared";
import { buildUserContextHeaders } from "../auth/signing.js";

private buildHeaders(authUser?: AuthUser): Record<string, string> {
  if (!authUser) return {};
  return buildUserContextHeaders(authUser);
}

// getSchema / executeQuery 的 request headers:
headers: {
  ...this.buildHeaders(options.authUser),
}
```

- [ ] **Step 5: buildChain 从 QueryRequest 改为接收 authUser**

```typescript
// runQueryChainStream 签名扩展：
export async function runQueryChainStream(
  request: QueryRequest,
  emit: StreamEmitter,
  authUser?: AuthUser,
): Promise<void> {
  // ...
  const schemaBundle = await adapter.getSchema({
    question: request.question,
    authUser,
  });
  // executeQuery 同样传入 authUser
}
```

- [ ] **Step 6: query 路由透传 req.user**

```typescript
await runQueryChain(parsed.data);           // 改为 runQueryChain(parsed.data, req.user)
await runQueryChainStream(parsed.data, emit, req.user);
```

- [ ] **Step 7: registry 分域 Token**

```typescript
// createHttpAdapter 使用分域 token：
const tokenEnv = domain === "mes" ? "MES_DATA_API_TOKEN" : "MRO_DATA_API_TOKEN";
const token = process.env[tokenEnv]?.trim() ?? process.env.DOMAIN_API_TOKEN?.trim() ?? "";
```

- [ ] **Step 8: 运行测试**

Run: `pnpm --filter @wensh/server test signing httpDomainAdapter`  
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add packages/server/src/auth/signing.ts packages/server/src/adapters/types.ts packages/server/src/adapters/httpDomainAdapter.ts packages/server/src/adapters/registry.ts packages/server/src/chains/buildChain.ts packages/server/src/routes/query.ts packages/server/tests/signing.test.ts packages/server/tests/httpDomainAdapter.test.ts
git commit -m "feat(server): HMAC user context headers for domain API calls"
```

---

### Task 17: Mock 域 API 验签（供联调参考）

**Files:**
- Modify: `packages/server/tests/fixtures/mockDomainApiServer.ts`
- Create: `packages/server/tests/fixtures/verifyWenshSignature.ts`

- [ ] **Step 1: 实现 verifyWenshSignature（与 OpenAPI 契约一致）**

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";

/** 校验问数 BFF 发来的用户上下文签名 */
export function verifyWenshSignature(headers: Record<string, string | undefined>, secret: string): boolean {
  const userId = headers["x-wensh-user-id"];
  const roles = headers["x-wensh-user-roles"];
  const scope = headers["x-wensh-data-scope"];
  const ts = headers["x-wensh-timestamp"];
  const sig = headers["x-wensh-user-signature"];
  if (!userId || !roles || !scope || !ts || !sig) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(ts)) > 300) return false;

  const expected = createHmac("sha256", secret)
    .update(`${userId}${roles}${scope}${ts}`)
    .digest("hex");

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: mock 域 API 拒绝无签名请求（AUTH_ENABLED=true 测试时）**

- [ ] **Step 3: Commit**

```bash
git add packages/server/tests/fixtures/verifyWenshSignature.ts packages/server/tests/fixtures/mockDomainApiServer.ts
git commit -m "test(server): mock domain API verifies X-Wensh-User-Signature"
```

> **交付 MES/MRO 团队：** 将 `verifyWenshSignature.ts` 逻辑作为参考实现附在 OpenAPI 文档旁（可复制到 Java/Go）。

---

### Task 18: 前端登录与路由守卫

**Files:**
- Create: `packages/web/src/api/auth.ts`
- Create: `packages/web/src/views/LoginView.vue`
- Create: `packages/web/src/router/index.ts`
- Modify: `packages/web/src/main.ts`
- Modify: `packages/web/src/App.vue`
- Modify: `packages/web/vite.config.ts`（axios/fetch credentials）

- [ ] **Step 1: auth.ts**

```typescript
import axios from "axios";
import type { LoginRequest, LoginResponse, MeResponse } from "@wensh/shared";

const client = axios.create({
  baseURL: "/api/auth",
  withCredentials: true,
});

export async function login(body: LoginRequest): Promise<LoginResponse> {
  const { data } = await client.post<LoginResponse>("/login", body);
  return data;
}

export async function logout(): Promise<void> {
  await client.post("/logout");
}

export async function fetchMe(): Promise<MeResponse | null> {
  try {
    const { data } = await client.get<MeResponse>("/me");
    return data;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: LoginView.vue（Element Plus 表单）**

- 用户名 / 密码
- 登录成功跳转 `/`
- 展示默认账号提示：`demo / demo123`（仅 dev）

- [ ] **Step 3: router 守卫**

```typescript
router.beforeEach(async (to, _from, next) => {
  if (to.meta.public) return next();
  const me = await fetchMe();
  if (!me) return next("/login");
  next();
});
```

- [ ] **Step 4: queryStream.ts 设置 `credentials: 'include'`**

- [ ] **Step 5: App.vue 顶栏增加用户名 + 退出**

- [ ] **Step 6: 本地验证**

```bash
# .env
AUTH_ENABLED=true
WENSH_DOMAIN_SIGNING_SECRET=dev-signing-secret
SESSION_SECRET=dev-session-secret

pnpm dev
```

Expected: 未登录访问问数页 → 跳转登录；登录后可提问；Network 请求带 Cookie

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/api/auth.ts packages/web/src/views/LoginView.vue packages/web/src/router/index.ts packages/web/src/main.ts packages/web/src/App.vue packages/web/vite.config.ts packages/web/src/api/queryStream.ts
git commit -m "feat(web): login page, session cookies, and route guard"
```

---

### Task 19: P4 环境变量与文档

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-06-01-domain-api-wensh-design.md`（可选交叉引用）

- [ ] **Step 1: .env.example 追加**

```env
# --- 认证（P4）---
AUTH_ENABLED=false
AUTH_PROVIDER=local
SESSION_SECRET=change-me-in-production
SESSION_MAX_AGE_MS=86400000
WENSH_DOMAIN_SIGNING_SECRET=shared-with-domain-api-teams

MES_DATA_API_TOKEN=mes-service-token
MRO_DATA_API_TOKEN=mro-service-token
```

- [ ] **Step 2: README 增加认证说明**

- `AUTH_ENABLED=false`：开发模式，无需登录（P1 兼容）
- `AUTH_ENABLED=true`：生产模式，需登录；域 API 需配置相同 `WENSH_DOMAIN_SIGNING_SECRET`

- [ ] **Step 3: Commit**

```bash
git add .env.example README.md
git commit -m "docs: document AUTH_ENABLED and HMAC signing configuration"
```

---

# Phase P5-sso：企业 SSO（后期骨架）

> **Goal：** 通过 `AUTH_PROVIDER=oidc` 切换企业 SSO，**域 API Header 契约不变**（仍用 HMAC）。

### Task 20: OidcAuthProvider 骨架（不默认启用）

**Files:**
- Create: `packages/server/src/auth/oidcAuthProvider.ts`
- Modify: `packages/server/src/auth/session.ts`
- Modify: `packages/server/src/routes/auth.ts`

- [ ] **Step 1: 安装依赖（暂不启用）**

Run: `pnpm --filter @wensh/server add openid-client`

- [ ] **Step 2: OidcAuthProvider 骨架**

```typescript
/** V2：OIDC 认证（后期实现 authorize/callback） */
export class OidcAuthProvider implements AuthProvider {
  async authenticate(req: Request): Promise<AuthUser> {
    // 与 LocalAuthProvider 相同：从 Session 读取 userId，loadAuthUser
    // SSO callback 负责 req.session.userId = mappedInternalId
    throw new Error("OIDC not implemented yet");
  }
}
```

- [ ] **Step 3: session.ts 增加 oidc 分支 + 占位路由注释**

- [ ] **Step 4: .env.example 追加 OIDC 占位项（注释状态）**

```env
# AUTH_PROVIDER=oidc
# OIDC_ISSUER=https://sso.company.com
# OIDC_CLIENT_ID=
# OIDC_CLIENT_SECRET=
# OIDC_REDIRECT_URI=http://localhost:5173/api/auth/oidc/callback
```

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/auth/oidcAuthProvider.ts packages/server/src/auth/session.ts packages/server/src/routes/auth.ts .env.example
git commit -m "chore(server): add OidcAuthProvider stub for future SSO"
```

---

## P4-auth Spec Coverage

| Spec §4.9 需求 | 对应 Task |
|----------------|-----------|
| AuthUser 统一结构 | Task 12 |
| LocalAuthProvider + Session | Task 13–15 |
| 两层 Token（服务 + 用户） | Task 16, registry 分域 Token |
| X-Wensh-* + HMAC | Task 16–17 |
| 前端登录，Token 不下发浏览器 | Task 18 |
| AUTH_ENABLED 开发开关 | Task 15, 19 |
| V2 SSO 可插拔 | Task 20 |
| user_id 禁止客户端传入 | Task 12（从 QueryRequest 移除） |

---

## 更新后的完整 Spec Coverage

| Spec 需求 | 对应 Task |
|-----------|-----------|
| G1 多业务域 | Task 1, 10 |
| G2 API 解耦 | Task 4, 5, 7 |
| G3 能力保留 | Task 7 |
| G4 Demo 可运行 | Task 3, 7；AUTH_ENABLED=false |
| G5 可扩展 | Task 5 |
| 域 API 契约 | Task 4, 16, 17 |
| §4.9 自建账号认证 | Task 12–19 |
| §4.9.5 后期 SSO | Task 20 |

---

## Execution Handoff（更新）

**推荐执行顺序：**

1. Task 1–11（P0~P1）→ 多域 Adapter 可用  
2. Task 12–19（P4-auth）→ 登录 + HMAC 透传  
3. Task 20（P5-sso）→ 仅骨架，等业务 SSO 就绪再实现

**Which approach for P0~P1?**

1. **Subagent-Driven** — 每 Task 独立 subagent  
2. **Inline Execution** — 本会话连续实现

**Which approach?**
