# 问数平台 · 域 Data API 对接说明

> **读者：** MES / MRO 等业务系统团队（自行实现 Domain Data API）  
> **问数平台：** wensh（NL2SQL BFF，不直连业务 MySQL）  
> **OpenAPI 契约：** [domain-data-api.openapi.yaml](./superpowers/specs/domain-data-api.openapi.yaml)  
> **设计规格：** [2026-06-01-domain-api-wensh-design.md](./superpowers/specs/2026-06-01-domain-api-wensh-design.md)

---

## 1. 对接目标

各业务域部署 **独立的 Data API 服务**，连接本域 **MySQL 只读库**。问数平台通过 HTTP 调用该 API，完成：

1. 获取 Schema + 指标口径（供 LLM 生成 SQL）
2. 执行只读 SQL 并返回结果

问数平台 **不持有** 业务库连接串；用户数据权限由 **域 API**  enforcement。

---

## 2. 架构关系

```
用户 → 问数 Web → 问数 BFF → [你的 Domain Data API] → MySQL（只读）
                      │
                      └── LLM（生成 SQL / 解读结果）
```

**你需要实现：** 右侧 `[Domain Data API]`  
**问数团队已实现：** BFF、Adapter、登录、HMAC 签名透传

---

## 3. 必须实现的 API

基路径示例：`https://mes-api.your-company.com`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/health` | 健康检查 |
| GET | `/api/v1/schema` | 返回 Prompt 用 DDL + 指标口径 + 表元数据 |
| POST | `/api/v1/query/execute` | 执行单条 SELECT |

完整请求/响应字段见 OpenAPI 文件。

---

## 4. 认证（两层，必须同时校验）

### 4.1 服务层 — Bearer Token

问数 BFF 调用时携带：

```http
Authorization: Bearer {MES_DATA_API_TOKEN}
```

- Token 由运维/平台管理员分配，**不下发浏览器**
- MES 与 MRO 建议使用 **不同 Token**

### 4.2 用户层 — X-Wensh-* + HMAC 签名

当问数平台启用登录（`AUTH_ENABLED=true`）时，除 Bearer 外还会携带：

| Header | 说明 |
|--------|------|
| `X-Wensh-User-Id` | 问数平台内部用户 ID |
| `X-Wensh-User-Roles` | 逗号分隔，如 `mes_viewer,mro_viewer` |
| `X-Wensh-Data-Scope` | JSON，如 `{"factory_ids":["F01"]}` |
| `X-Wensh-Timestamp` | Unix 秒时间戳 |
| `X-Wensh-User-Signature` | HMAC-SHA256 十六进制签名 |

**签名算法（与问数 BFF 共享 `WENSH_DOMAIN_SIGNING_SECRET`）：**

```
payload = user_id + roles + data_scope_json + timestamp
signature = HMAC-SHA256(payload, WENSH_DOMAIN_SIGNING_SECRET).hex()
```

**校验要求：**

- 拒绝 `|now - timestamp| > 300` 秒的请求（防重放）
- 签名不匹配 → `401 UNAUTHORIZED`

**参考实现（Node.js）：**  
问数仓库 `packages/server/tests/fixtures/verifyWenshSignature.ts`

---

## 5. 数据权限（域 API 职责）

LLM 生成的 SQL **不可直接信任**。域 API 必须：

1. **SQL 白名单**：仅允许单条 `SELECT`；拒绝 DML/DDL 及 MySQL 危险语句
2. **强制 LIMIT**：服务端补全或截断（建议 max 1000）
3. **行级过滤**：按 `X-Wensh-Data-Scope` 注入 `WHERE`（如 `factory_id IN (...)`）
4. **`/schema` 按权限过滤**：只返回用户有权访问的表
5. **审计日志**：记录 user_id、roles、source_question、sql、trace_id、耗时

---

## 6. Schema 接口约定

### GET /api/v1/schema

**Query 参数（可选）：**

- `question` — 有问题时建议返回相关表子集，降低 Prompt 体积
- `tables` — 逗号分隔表名

**响应示例：**

```json
{
  "dialect": "mysql",
  "prompt_schema": "CREATE TABLE work_order (...);",
  "metrics_prompt": "- 工单完成率 = SUM(actual_qty)/SUM(planned_qty) ...",
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

| 字段 | 说明 |
|------|------|
| `prompt_schema` | 可直接拼入 LLM Prompt 的 DDL（含 COMMENT 更佳） |
| `metrics_prompt` | 本域指标口径（MES 与 MRO 各自维护） |
| `tables_meta.tier` | `large` 时问数平台走远端 LLM；`small` 可走本地模型 |

---

## 7. SQL 执行接口约定

### POST /api/v1/query/execute

**Body：**

```json
{
  "sql": "SELECT ... LIMIT 100",
  "timeout_ms": 30000,
  "max_rows": 1000,
  "source_question": "上个月哪条产线良率最低？",
  "trace_id": "uuid"
}
```

**成功响应：**

```json
{
  "columns": ["产线", "平均良率"],
  "rows": [{ "产线": "C线", "平均良率": 0.872 }],
  "row_count": 1,
  "exec_ms": 42
}
```

**错误码：** `UNAUTHORIZED` · `FORBIDDEN` · `SQL_VALIDATION_ERROR` · `SQL_EXEC_ERROR` · `TIMEOUT`

---

## 8. 联调步骤

### 8.1 问数侧配置（`.env`）

```env
MES_DATA_API_URL=https://your-mes-api-host
MES_DATA_API_TOKEN=与域 API 约定的一致
WENSH_DOMAIN_SIGNING_SECRET=与域 API 共享的 HMAC 密钥

AUTH_ENABLED=true   # 联调签名 Header 时需开启
```

### 8.2 域 API 侧 checklist

- [ ] 实现三个 REST 端点（符合 OpenAPI）
- [ ] 校验 Bearer Token
- [ ] 校验 X-Wensh-* 签名（联调/生产）
- [ ] MySQL 只读账号 + 连接池
- [ ] SQL 安全 + 权限改写 + 审计

### 8.3 本地 Mock 参考

问数仓库提供 Mock 服务（含可选签名校验）：

`packages/server/tests/fixtures/mockDomainApiServer.ts`

启动方式见集成测试：`packages/server/tests/mockDomainApi.integration.test.ts`

---

## 9. MES vs MRO 差异提示

| 域 | 典型关键词 | 指标示例 |
|----|-----------|----------|
| MES | 工单、良率、OEE、产线 | 完成率、平均良率、停机时长 |
| MRO | 设备、故障、维保、备件 | MTBF、MTTR、设备完好率 |

**注意：** MRO「维修工单」与 MES「生产工单」需在 `metrics_prompt` 中明确区分，避免 LLM 混淆。

---

## 10. 联系方式与变更

- API 契约版本：**1.0.1**（见 OpenAPI `info.version`）
- 契约变更需与问数团队同步，避免 BFF Adapter 解析失败
- 短期 SSO 接入后，域 API **仍可只验 HMAC**，无需改动

---

## 附录 A：环境变量对照

| 变量 | 配置方 | 说明 |
|------|--------|------|
| `MES_DATA_API_URL` | 问数 | MES API 基址 |
| `MES_DATA_API_TOKEN` | 双方约定 | 问数 BFF → MES API |
| `WENSH_DOMAIN_SIGNING_SECRET` | 双方约定 | HMAC 签名密钥 |
| MySQL 只读连接串 | 域团队 | **仅域 API 持有** |
