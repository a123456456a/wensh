# 问数平台多业务域 API 对接 — 需求与设计规格

> 文档版本：2026-06-01  
> 状态：**已评审（A1 已确认）**  
> 关联项目：wensh（问数 NL2SQL Demo → 生产化演进）  
> 域 API OpenAPI 契约：`domain-data-api.openapi.yaml`（交付 MES/MRO 团队）

---

## 1. 背景与目标

### 1.1 背景

当前 wensh 是一个 **MES 自然语言查数 Demo**：

- 前端：Vue3 + Element Plus + ECharts
- 后端：Express + LangChain.js
- 数据：本地 SQLite（`mes.db`）+ seed 假数据
- 模型：本地 vLLM / 远端 OpenAI 兼容 API 自动路由

业务方后续需求：

1. 真实数据在 **MySQL**，且 **MES、MRO 等业务域使用完全独立的数据库**
2. 问数平台 **不直连业务库**，通过各域提供的 **Data API** 访问 Schema 与执行只读查询
3. 同一套问数能力可复用到 MES、MRO 等域，而非绑定单一 MES 场景

### 1.2 目标（Success Criteria）

| # | 目标 | 验收标准 |
|---|------|----------|
| G1 | 多业务域 | 用户可在前端选择 `mes` / `mro`，问数结果来自对应域 API |
| G2 | API 解耦 | wensh server 无 MySQL 连接串；仅持有各域 API 基址与服务间 Token |
| G3 | 能力保留 | 现有 NL→SQL→执行→解读→图表/SSE 流式能力不退化 |
| G4 | Demo 可继续运行 | 本地开发仍可用 SQLite Adapter，无需真实域 API |
| G5 | 可扩展 | 新增业务域 = 新增配置 + 域侧实现 API，问数核心链不改 |

### 1.3 非目标（YAGNI — 本阶段不做）

- 用户 SSO / 完整 RBAC（预留透传字段，不实现登录 UI）
- Schema 向量检索（Milvus/BGE-M3）
- 会话持久化到服务端
- CSV/Excel 导出
- 域侧 Data API 的完整生产实现（本规格定义契约与 wensh 侧适配；域 API 提供参考模板规格）

---

## 2. 总体架构

### 2.1 系统边界

```
┌─────────────────────────────────────────────────────────────┐
│  问数平台 (wensh)                                            │
│  ┌─────────┐   ┌──────────────┐   ┌─────────────────────┐  │
│  │ Web UI  │──▶│ Express BFF  │──▶│ LangChain 查询链     │  │
│  │ domain  │   │              │   │ SQL生成/解读/路由    │  │
│  └─────────┘   └──────────────┘   └──────────┬──────────┘  │
│                                               │             │
│                                    DomainDataAdapter        │
└───────────────────────────────────────────────┼─────────────┘
                                                │ HTTPS
              ┌─────────────────────────────────┼─────────────────────────┐
              ▼                                 ▼                         ▼
     ┌─────────────────┐              ┌─────────────────┐       ┌─────────────────┐
     │ MES Data API    │              │ MRO Data API    │       │ (future domains)│
     │ SQL校验+权限     │              │ SQL校验+权限     │       │                 │
     └────────┬────────┘              └────────┬────────┘       └─────────────────┘
              ▼                                 ▼
     ┌─────────────────┐              ┌─────────────────┐
     │ mes_mysql       │              │ mro_mysql       │
     └─────────────────┘              └─────────────────┘
```

### 2.2 核心设计原则

1. **Adapter 模式**：`DomainDataAdapter` 抽象数据访问；SQLite（Demo）与 HTTP（生产）两种实现
2. **域 API 统一契约**：MES/MRO 实现相同 REST 接口，问数平台零业务库知识
3. **配置驱动**：域列表、API 基址、默认域来自环境变量 / 配置文件
4. **SQL 仍由问数平台 LLM 生成**，域 API 负责二次校验、权限注入、MySQL 执行

### 2.3 方案对比（Brainstorming 结论）

| 方案 | 描述 | 结论 |
|------|------|------|
| A. 问数直连 MySQL | 各域连接串配在 wensh | ❌ 拒绝：多独立库、凭证分散、安全边界差 |
| B. 语义 API | 每问题一个 REST 接口 | ❌ 拒绝：非通用问数，维护成本极高 |
| **C. SQL 执行网关 API** | LLM 生成 SQL → 域 API 执行 | ✅ **采用** |
| D. C + 语义 API 混合 | 简单走 API、复杂走 SQL | ⏸ 后续可选 |

---

## 3. 域 Data API 契约（OpenAPI 摘要）

基路径：`{DOMAIN_API_BASE}/api/v1`  
认证：`Authorization: Bearer {SERVICE_TOKEN}`  
追踪：建议 `X-Trace-Id` 贯穿问数平台 ↔ 域 API

### 3.1 GET /health

**响应：**

```json
{
  "domain": "mes",
  "label": "制造执行",
  "database": {
    "available": true,
    "dialect": "mysql",
    "version": "8.0.36"
  }
}
```

### 3.2 GET /schema

**Query：**

| 参数 | 必填 | 说明 |
|------|------|------|
| `question` | 否 | 有问题时域侧可返回相关表子集 |
| `tables` | 否 | 逗号分隔表名，精确指定 |

**响应：**

```json
{
  "dialect": "mysql",
  "prompt_schema": "CREATE TABLE work_order (...);\n\nCREATE TABLE ...",
  "metrics_prompt": "- 良率：AVG(yield_rate) ...",
  "tables_meta": [
    {
      "name": "work_order",
      "label": "生产工单",
      "tier": "large",
      "keywords": ["工单", "在制", "订单"]
    }
  ]
}
```

**约定：**

- `prompt_schema`：可直接拼入 LLM Prompt 的 DDL 文本（含字段 COMMENT 更佳）
- `metrics_prompt`：该域指标口径，替代现有 `getMetricsPrompt()` 硬编码
- `tables_meta`：供 modelRouter 做关键词匹配与 tier 路由（**禁止** wensh 侧 `COUNT(*)`）

### 3.3 POST /query/execute

**Headers（可选，本阶段预留）：**

- `X-User-Id`：终端用户 ID
- `X-Data-Scope`：JSON，如 `{"factory_ids":["F01"]}`

**Body：**

```json
{
  "sql": "SELECT ... LIMIT 100",
  "timeout_ms": 30000,
  "max_rows": 1000
}
```

**响应：**

```json
{
  "columns": ["产线", "平均良率"],
  "rows": [{ "产线": "C线", "平均良率": 0.872 }],
  "row_count": 5,
  "exec_ms": 42
}
```

**域 API 必须实现：**

- 仅允许单条 `SELECT`
- 拒绝 DML/DDL 及 MySQL 危险语句（`INTO OUTFILE`、`LOAD DATA` 等）
- 强制 `LIMIT`（服务端补全或截断）
- 查询超时
- 审计日志（question 由 wensh 在 separate 字段传入，见 3.4）

**Body 扩展（推荐）：**

```json
{
  "sql": "SELECT ...",
  "trace_id": "uuid",
  "source_question": "上个月哪条产线良率最低？"
}
```

### 3.4 错误响应（统一）

```json
{
  "error": "SQL执行失败：Unknown column 'xxx'",
  "code": "SQL_EXEC_ERROR",
  "trace_id": "uuid"
}
```

HTTP 状态码：`400` 参数/SQL 校验失败，`502` 数据库不可用，`504` 超时。

---

## 4. 问数平台改造设计

### 4.1 新增共享类型（`@wensh/shared`）

```typescript
/** 业务域标识 */
export type BusinessDomain = "mes" | "mro" | "demo";

/** QueryRequest 扩展 */
export interface QueryRequest {
  question: string;
  domain: BusinessDomain;           // 新增，必填
  interpret?: boolean;
  history?: HistoryItem[];
  remote_provider?: RemoteProvider;
  // user_id / data_scope 不在此定义 — 由服务端 Session 注入，禁止客户端传入
}
```

`HealthResponse` 扩展：

```typescript
domains: Array<{
  domain: BusinessDomain;
  label: string;
  api_available: boolean;
  api_base_url: string;
}>;
```

### 4.2 DomainDataAdapter 接口

路径：`packages/server/src/adapters/types.ts`

```typescript
export interface SchemaBundle {
  dialect: "mysql" | "sqlite";
  promptSchema: string;
  metricsPrompt: string;
  tablesMeta: Array<{
    name: string;
    label: string;
    tier: "small" | "large";
    keywords: string[];
  }>;
}

export interface ExecuteQueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  execMs: number;
}

export interface DomainDataAdapter {
  readonly domain: BusinessDomain;
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

### 4.3 两种 Adapter 实现

| Adapter | 用途 | 配置 |
|---------|------|------|
| `SqliteDemoAdapter` | 本地 Demo | 现有 `mes.db`，包装现有 `schema.ts` / `client.ts` |
| `HttpDomainAdapter` | 生产域 | `MES_DATA_API_URL` + `DOMAIN_API_TOKEN` |

`DomainAdapterRegistry`：根据 `request.domain` 返回对应 Adapter。

### 4.4 查询链改造点

**`buildChain.ts`：**

- 移除对 `getDb()` / `getSchemaPrompt()` / `getMetricsPrompt()` 的直接依赖
- 流程：`registry.get(domain)` → `adapter.getSchema({ question })` → 构建 Prompt（MySQL 方言）→ `adapter.executeQuery({ sql })`

**`modelRouter.ts`：**

- 移除 `getRowCount()` / `ALL_TABLES` 硬编码
- 从 `adapter.getSchema({ question }).tablesMeta` 做关键词匹配
- 路由规则：`matched` 中任一 `tier === "large"` → `remote`，否则 `local`

**Prompt 方言：**

- `domain === "demo"`：保留 SQLite 提示
- 其他域：使用 `schema.dialect`，Prompt 写「标准 MySQL 查询语句」

### 4.5 配置（`.env`）

```env
# 默认业务域（前端初始选中）
DEFAULT_DOMAIN=demo

# Demo SQLite（现有）
# 无需新增

# MES 域 API
MES_DATA_API_URL=https://mes-api.internal.example.com
MES_DOMAIN_LABEL=制造执行

# MRO 域 API
MRO_DATA_API_URL=https://mro-api.internal.example.com
MRO_DOMAIN_LABEL=设备维护

# 问数平台调用域 API
DOMAIN_API_TOKEN=your-service-token
DOMAIN_API_TIMEOUT_MS=30000
```

未配置 API URL 的域在前端/health 中标记为 `available: false`。

### 4.6 前端改造

**`App.vue`：**

- 顶部增加业务域下拉（demo / mes / mro）
- 示例问题按域切换（配置文件或常量 map）
- 请求体携带 `domain`
- Health 展示各域 API 连通性

**`remoteProviderStorage.ts`：** 不变；域选择与模型选择独立 storage key。

### 4.7 错误处理

| 场景 | 行为 |
|------|------|
| 域 API 不可达 | `QueryChainError`：「MES 数据服务不可用」 |
| 域 API 返回 400 | 透传 `error` 消息；若有 SQL 则展示 |
| SQL 生成失败重试 | 保持现有 1 次重试逻辑 |
| Schema 缓存 | 可选：内存缓存 5 分钟（同 domain + question 前缀）— **V1 不实现** |

### 4.8 测试策略

| 层级 | 内容 |
|------|------|
| 单元 | `HttpDomainAdapter` mock fetch；`modelRouter` 用 fake tablesMeta |
| 集成 | 本地 mock Domain API（Express 最小 stub） |
| 冒烟 | `domain=demo` 现有 smoke test 保持通过 |
| 契约 | 可选：域 API OpenAPI schema 校验（后续） |

### 4.9 认证与 Token 权限（自建账号 → 企业 SSO）

#### 4.9.1 两层凭证，不可混用

| 层级 | 凭证 | 持有方 | 作用 |
|------|------|--------|------|
| **服务层** | `DOMAIN_API_TOKEN`（建议每域独立） | 问数 BFF（`.env`，不下发前端） | 证明「问数服务有权调用该域 Data API」 |
| **用户层** | 问数 Session / JWT | 登录用户 | 证明「谁在查」；决定 `data_scope`（工厂/车间/角色） |

**原则：** `DOMAIN_API_TOKEN` 只管接口调用权；**数据行级权限必须在域 API 基于用户身份 enforcement**。

#### 4.9.2 问数平台认证演进（AuthProvider 可插拔）

采用 **AuthProvider 抽象**，避免后期接 SSO 时大改：

```typescript
/** 统一用户上下文（自建账号与 SSO 输出相同结构） */
interface AuthUser {
  user_id: string;
  username: string;
  roles: string[];
  data_scope: {
    factory_ids?: string[];
    workshop_ids?: string[];
    line_ids?: string[];
  };
}

/** 认证提供者 */
interface AuthProvider {
  /** 从请求中解析并验证用户；失败抛 401 */
  authenticate(req: Request): Promise<AuthUser>;
}
```

| 阶段 | 实现 | 说明 |
|------|------|------|
| **V1 自建账号** | `LocalAuthProvider` | 用户名密码登录；BFF 签发 **HttpOnly Cookie Session** 或短期 **JWT** |
| **V2 企业 SSO** | `OidcAuthProvider` | OIDC 授权码流程；BFF 换 token 后仍映射为同一 `AuthUser` 结构 |

**迁移策略：**

- 查询链、`HttpDomainAdapter`、域 API 契约 **只依赖 `AuthUser`**，不依赖登录方式
- 接 SSO 时仅替换 `AuthProvider` + 前端登录页，**域 API Header 契约不变**
- 用户表保留 `external_id` 字段，SSO 接入时按 `sub` 关联，支持账号绑定

#### 4.9.3 V1 自建账号（推荐落地细节）

**登录流程：**

```
用户 → POST /api/auth/login { username, password }
     → BFF 校验（bcrypt）→ 写 Session Cookie（HttpOnly, Secure, SameSite=Lax）
     → 后续 /api/query 自动带 Cookie
```

**用户与权限存储（问数平台 SQLite/PostgreSQL，与业务库无关）：**

| 表 | 用途 |
|----|------|
| `users` | id, username, password_hash, status |
| `user_roles` | user_id, role（如 mes_viewer, mro_admin） |
| `user_data_scope` | user_id, scope_type, scope_id（factory/workshop/line） |

**BFF 中间件：**

- 未登录访问 `/api/query` → `401`
- 登录后从 Session 加载 `AuthUser`，注入 `req.user`

**前端：**

- 登录页 + 路由守卫；`DOMAIN_API_TOKEN` **永不进浏览器**

#### 4.9.4 问数 BFF → 域 Data API 的 Header 契约

V1（自建账号）推荐使用 **服务 Token + 签名用户上下文**，防止伪造 `X-User-Id`：

| Header | 必填 | 说明 |
|--------|------|------|
| `Authorization` | 是 | `Bearer {DOMAIN_API_TOKEN}` |
| `X-Wensh-User-Id` | 是 | 问数平台内部 user_id |
| `X-Wensh-User-Roles` | 是 | 逗号分隔，如 `mes_viewer,mro_viewer` |
| `X-Wensh-Data-Scope` | 是 | JSON：`{"factory_ids":["F01"]}` |
| `X-Wensh-User-Signature` | 是（V1） | HMAC-SHA256(user_id + roles + data_scope + timestamp, WENSH_DOMAIN_SIGNING_SECRET) |
| `X-Wensh-Timestamp` | 是（V1） | Unix 秒；域 API 拒绝 ±5 分钟外的请求 |
| `X-Wensh-User-Token` | 否（V2 SSO） | 接 SSO 后可改为转发 OIDC access_token，域 API 用 IAM 公钥验签 |

**域 API（MES/MRO 团队）必须：**

1. 校验 `Authorization` 服务 Token
2. 校验 `X-Wensh-User-Signature` + 时间戳（V1），或校验 `X-Wensh-User-Token`（V2）
3. 按 `data_scope` 改写 SQL 或限制可访问表（`/schema` 同样按权限过滤）
4. 审计：记录 user_id、roles、sql、source_question、trace_id

#### 4.9.5 V2 企业 SSO（后期，接口不变）

```
用户 → 企业 IdP 登录 → 回调问数 BFF /api/auth/oidc/callback
     → BFF 建立 Session，AuthUser 从 OIDC claims 映射：
        user_id  ← sub 或映射表
        roles    ← groups / roles claim
        data_scope ← 自定义 claim 或问数库配置
```

**域 API 升级路径（二选一，由域团队决定）：**

- **继续 HMAC 方案**：问数 BFF 仍签 `X-Wensh-User-Signature`（域 API 零改动）
- **JWT 转发方案**：域 API 验 OIDC JWT，自行解析权限（需域 API 接 IAM）

**推荐：** 短期内 V2 仍用 HMAC，域 API 无感知；待 IAM 统一后再切 JWT 转发。

#### 4.9.6 Token 配置（`.env` 补充）

```env
# 问数 Session（V1 自建账号）
SESSION_SECRET=change-me-in-production
SESSION_MAX_AGE_MS=86400000

# 问数 → 域 API 服务 Token（建议分域）
MES_DATA_API_TOKEN=mes-service-token-xxx
MRO_DATA_API_TOKEN=mro-service-token-xxx

# 用户上下文 HMAC 签名（问数 BFF 与域 API 共享）
WENSH_DOMAIN_SIGNING_SECRET=shared-hmac-secret-xxx

# V2 SSO（后期启用）
# OIDC_ISSUER=https://sso.company.com
# OIDC_CLIENT_ID=...
# OIDC_CLIENT_SECRET=...
# AUTH_PROVIDER=local | oidc
```

#### 4.9.7 分阶段与问数 Implementation Plan 关系

| 阶段 | 认证范围 |
|------|----------|
| P0~P1（当前计划） | 无登录；`domain=demo` 可用；mes/mro 联调可跳过用户 Header |
| **P4-auth** | `LocalAuthProvider` + 登录 API + 中间件 + Header 签名透传 |
| **P5-sso** | `OidcAuthProvider`；`AUTH_PROVIDER` 环境变量切换 |

---

## 5. 业务域差异配置（示例）

### 5.1 MES（由 MES Data API 返回）

- 关键词：工单、良率、OEE、产线、班次
- 指标：良率、完成率、OEE、停机时长
- 示例问题：「上个月哪条产线良率最低？」

### 5.2 MRO（由 MRO Data API 返回）

- 关键词：设备、故障、维保、备件、MTBF、MTTR
- 指标：设备完好率、计划完成率、平均修复时间
- 示例问题：「本月故障次数最多的设备 TOP5」
- **Prompt 需强调**：「维修工单」≠「生产工单」（由 metrics_prompt 说明）

---

## 6. 分阶段交付

| 阶段 | 范围 | 产出 |
|------|------|------|
| **P0** | 契约 + wensh Adapter 抽象 | 本规格 + SqliteDemoAdapter 重构 |
| **P1** | HttpDomainAdapter + 前端 domain | 可对接 mock 域 API |
| **P2** | MES Data API 首个真实域 | MES 团队按契约实现 |
| **P3** | MRO 复制 | 同契约，换 Schema/指标 |
| **P4** | 权限透传 + 自建账号 | LocalAuthProvider、HMAC 用户上下文 Header |
| **P5** | 企业 SSO | OidcAuthProvider；AuthProvider 可切换 |
| **P6** | 审计/缓存 | Schema 缓存、完整审计查询 |

---

## 7. 已确认决策与剩余假设

### 7.1 已确认

| # | 项 | 决策 |
|---|-----|------|
| **A1** | **域 API 由谁开发** | ✅ **方案 A：各业务系统团队各自实现**；wensh **不提供**统一 domain-api 模板包，仅交付 OpenAPI 契约 + 联调 mock |
| **A7** | **用户认证** | ✅ **V1 问数自建账号（Session/JWT）**；**V2 企业 SSO（OIDC）**；通过 `AuthProvider` 抽象切换，域 API Header 契约保持稳定 |

**职责划分：**

| 负责方 | 交付物 |
|--------|--------|
| **问数团队（wensh）** | `DomainDataAdapter`、`HttpDomainAdapter`、前端域切换、OpenAPI 契约、联调 mock server |
| **MES 团队** | MES Data API 实现 + MySQL 只读连接 + Schema/指标配置 + 权限/审计 |
| **MRO 团队** | MRO Data API 实现（同契约，独立部署） |

### 7.2 剩余假设（待后续确认）

| # | 项 | 当前假设 |
|---|-----|----------|
| A2 | Schema 策略 | 域 API 根据 `question` 返回相关表；全量表 <30 时可全返回 |
| A3 | 权限 | 域 API 基于 `X-Wensh-Data-Scope` + 签名验证做 SQL 行级过滤 |
| A4 | 认证 | 服务 Token 分域；用户层 V1 HMAC 签名，V2 可选 OIDC JWT 转发 |
| A5 | demo 域 | 保留 SQLite，默认域为 `demo`，便于本地开发 |
| A6 | 指标口径 | 全部由域 API 的 `metrics_prompt` 返回（wensh 不再硬编码 MES 指标） |

---

## 8. 评审检查清单

- [x] 域 API 由谁开发 → **A：各域团队自行实现**
- [ ] 域 API 契约是否满足 MES/MRO 团队接入？
- [ ] `BusinessDomain` 枚举是否需增加其他域（WMS/QMS）？
- [ ] 默认域生产环境是 `mes` 还是仍 `demo`？
- [x] wensh 是否附带 mock Domain API 供联调 → **是**（仅用于 wensh 开发与联调，非生产模板）
- [x] 指标口径是否全部由域 API 返回 → **是**
- [x] 用户认证方案 → **V1 自建账号，V2 企业 SSO（AuthProvider 可插拔）**

---

**规格已就绪。Implementation Plan 见 `docs/superpowers/plans/2026-06-01-domain-api-wensh.md`。**
