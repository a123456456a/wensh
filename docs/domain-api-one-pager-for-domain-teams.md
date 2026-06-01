# 问数平台 · 域 Data API 一页纸（给 MES / MRO 团队）

> **你们要实现什么：** 一个连本域 MySQL 只读库的 HTTP 服务（3 个接口）  
> **你们不用做什么：** 自然语言转 SQL、LLM、问数前端  
> **完整契约：** [domain-data-api.openapi.yaml](./superpowers/specs/domain-data-api.openapi.yaml)

---

## 1. 数据流（30 秒看懂）

```
用户提问 → 问数平台（LLM 生成 SQL）→ 你们的 Data API → MySQL 只读库
                ↑                              ↓
           GET /schema（要表结构）         POST /query/execute（执行 SQL，返回表格）
```

**重点：SQL 是问数平台生成后 POST 给你们的，不是你们返回 SQL。**

| 接口 | 方向 | 内容 |
|------|------|------|
| `GET /schema` | 你们 → 问数 | 表结构 DDL 文本 + 指标口径（给 LLM 看） |
| `POST /query/execute` | 问数 → 你们 | 请求体里带 `SELECT` SQL |
| `POST /query/execute` | 你们 → 问数 | 响应里是 `columns` + `rows`（查询结果） |

---

## 2. 必须实现的 3 个接口

基路径示例：`https://mes-api.your-company.com`

| 方法 | 路径 | 作用 |
|------|------|------|
| GET | `/api/v1/health` | 健康检查 |
| GET | `/api/v1/schema` | 返回表结构 + 指标口径 |
| POST | `/api/v1/query/execute` | 执行单条只读 SELECT，返回结果 |

---

## 3. 接口示例

### 3.1 健康检查

```http
GET /api/v1/health
Authorization: Bearer {MES_DATA_API_TOKEN}
```

```json
{
  "domain": "mes",
  "label": "制造执行",
  "database": { "available": true, "dialect": "mysql", "version": "8.0.36" }
}
```

---

### 3.2 获取 Schema（你们返回「表结构」，不是查询 SQL）

```http
GET /api/v1/schema?question=上个月哪条产线良率最低
Authorization: Bearer {MES_DATA_API_TOKEN}
X-Wensh-User-Id: u123
X-Wensh-User-Roles: mes_viewer
X-Wensh-Data-Scope: {"factory_ids":["F01"]}
X-Wensh-Timestamp: 1717234567
X-Wensh-User-Signature: {hmac_hex}
```

```json
{
  "dialect": "mysql",
  "prompt_schema": "CREATE TABLE work_order (id INT, factory_id VARCHAR(20), ...);",
  "metrics_prompt": "- 平均良率 = SUM(good_qty)/SUM(total_qty)\n- 工单完成率 = ...",
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
| `prompt_schema` | 建表/字段说明（DDL 文本），供 LLM 生成 SELECT |
| `metrics_prompt` | 本域指标怎么算（MES / MRO 各自维护） |
| `tables_meta` | 表元数据；`tier: large` 时问数走远端大模型 |

**只返回该用户有权访问的表。**

---

### 3.3 执行 SQL（问数 POST SQL 给你们，你们返回结果）

**请求（问数 → 你们）：**

```http
POST /api/v1/query/execute
Authorization: Bearer {MES_DATA_API_TOKEN}
X-Wensh-User-Id: u123
...（同上签名 Header）
Content-Type: application/json
```

```json
{
  "sql": "SELECT line_name AS 产线, AVG(yield_rate) AS 平均良率 FROM production_yield WHERE factory_id IN ('F01') GROUP BY line_name ORDER BY 平均良率 ASC LIMIT 1",
  "timeout_ms": 30000,
  "max_rows": 1000,
  "source_question": "上个月哪条产线良率最低？",
  "trace_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**成功响应（你们 → 问数）：**

```json
{
  "columns": ["产线", "平均良率"],
  "rows": [{ "产线": "C线", "平均良率": 0.872 }],
  "row_count": 1,
  "exec_ms": 42
}
```

**失败响应示例：**

```json
{
  "error": "仅允许 SELECT",
  "code": "SQL_VALIDATION_ERROR",
  "trace_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

错误码：`UNAUTHORIZED` · `FORBIDDEN` · `SQL_VALIDATION_ERROR` · `SQL_EXEC_ERROR` · `TIMEOUT`

---

## 4. 认证（两层都要验）

### 4.1 服务层 — 证明「问数服务有权调你们 API」

```http
Authorization: Bearer {MES_DATA_API_TOKEN}
```

- 由运维/平台分配，**不下发浏览器**
- MES 与 MRO 建议用 **不同 Token**

### 4.2 用户层 — 证明「是哪个用户在查、能看哪些数据」

问数启用登录后，除 Bearer 外还会带：

| Header | 示例 |
|--------|------|
| `X-Wensh-User-Id` | `u123` |
| `X-Wensh-User-Roles` | `mes_viewer` |
| `X-Wensh-Data-Scope` | `{"factory_ids":["F01"]}` |
| `X-Wensh-Timestamp` | Unix 秒 |
| `X-Wensh-User-Signature` | HMAC-SHA256 十六进制 |

**签名算法：**

```
payload = user_id + roles + data_scope_json + timestamp   // 直接拼接，无分隔符
signature = HMAC-SHA256(payload, WENSH_DOMAIN_SIGNING_SECRET).hex()
```

- 拒绝 `|now - timestamp| > 300` 秒（防重放）
- 参考实现：`packages/server/tests/fixtures/verifyWenshSignature.ts`

---

## 5. 你们必须做的安全与权限

LLM 生成的 SQL **不可直接信任**，域 API 负责最后一道关：

1. **仅允许单条 SELECT** — 拒绝 INSERT/UPDATE/DELETE/DDL 等
2. **强制 LIMIT** — 服务端补全或截断（建议 max 1000）
3. **行级过滤** — 按 `X-Wensh-Data-Scope` 注入 `WHERE`（如 `factory_id IN (...)`）
4. **`/schema` 按权限过滤** — 无权表不出现在 `prompt_schema`
5. **审计日志** — 记录 user_id、source_question、sql、trace_id、耗时

---

## 6. 联调 checklist

**问数侧配置（`.env`）：**

```env
MES_DATA_API_URL=https://your-mes-api-host
MES_DATA_API_TOKEN=与你们约定一致
WENSH_DOMAIN_SIGNING_SECRET=与你们共享的 HMAC 密钥
AUTH_ENABLED=true
```

**你们侧：**

- [ ] 3 个 REST 端点符合 OpenAPI
- [ ] 校验 Bearer Token
- [ ] 校验 X-Wensh-* 签名
- [ ] MySQL 只读账号 + 连接池
- [ ] SQL 白名单 + 权限改写 + 审计

**本地 Mock 参考：** `packages/server/tests/fixtures/mockDomainApiServer.ts`

---

## 7. 职责边界（避免扯皮）

| 问数平台 | 域团队（你们） |
|----------|----------------|
| 自然语言 → SQL（LLM） | 表结构 / 指标口径维护 |
| 前端、登录、Session | Data API 三接口实现 |
| 调你们 API、展示结果 | MySQL 只读连接、执行 SQL |
| 生成 SQL 前的 Prompt 组装 | SQL 安全校验、行级权限、审计 |

---

## 8. MES vs MRO 提示

| 域 | 典型表/词 | 指标示例 |
|----|-----------|----------|
| MES | 工单、产线、良率、OEE | 完成率、平均良率 |
| MRO | 设备、故障、维保、备件 | MTBF、MTTR、完好率 |

**「生产工单」与「维修工单」要在 `metrics_prompt` 里写清楚，避免 LLM 混表。**

---

**契约版本：** 1.0.1 · **详细说明：** [domain-api-integration-guide.md](./domain-api-integration-guide.md)
