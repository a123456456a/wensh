# 问数 · 接入真实场景（分步指南）

> 适用：demo 已跑通，准备接入真实业务数据  
> 前置阅读：[getting-started-beginner.md](./getting-started-beginner.md)

---

## 先理解：真实场景 ≠ 问数直连你的数据库

问数 **不会** 直接连你的 MySQL/ERP 库，中间必须有一层 **域 Data API**：

```
用户 → 问数 Web → 问数 Server → 【你的域 Data API】→ 业务数据库（只读）
```

**你要做的事分两块：**

| 谁做 | 做什么 |
|------|--------|
| 问数（已有） | 自然语言 → SQL → 调 API → 展示结果 |
| 你 / 业务团队 | 实现域 Data API（3 个接口）+ 连真实库 |

`mes` / `mro` 只是问数里预置的**两个域槽位**，你的真实场景可以是制造、设备、销售、库存等，先占一个槽位接入，后续可扩展新域。

---

## 路线图总览

```
阶段 0  确认你的真实数据源
阶段 1  用 Mock API 验证问数侧配置（不用真实库）
阶段 2  实现域 Data API（连真实库）
阶段 3  问数 .env 指向真实 API
阶段 4  网页验收第一次真实查数
阶段 5  开启登录 + 签名 + 权限（上线前）
```

**建议严格按顺序做**，不要跳过阶段 1。

---

## 阶段 0：确认你的真实数据源

填下这张表（心里清楚即可）：

| 项目 | 你的情况 |
|------|----------|
| 业务场景 | 例如：ERP 销售 / MES 工单 / WMS 库存 |
| 数据库类型 | MySQL / SQL Server / … |
| 只读账号 | 有 / 没有（需要 DBA 开） |
| 核心表（2～5 张） | 例如：orders, customers |
| 用哪个域槽位 | 建议先用 `mes`（配置最简单） |

**最小可行范围（MVP）：** 先只接 **1 个域 + 2～3 张核心表**，跑通一个问题即可，不要一上来接全库。

---

## 阶段 1：Mock API 联调（约 15 分钟）

目的：**在不碰真实数据库的情况下**，验证问数能切换到 HTTP 域。

### 1.1 启动 Mock 域 API

开 **终端 1**：

```bash
pnpm mock:domain
```

看到类似输出：

```
Mock 域 Data API 已启动
  域标识:   mes
  基址:     http://127.0.0.1:18080
  Token:    test-token
```

### 1.2 修改问数 `.env`

```env
# 指向 Mock（阶段 1）
MES_DATA_API_URL=http://127.0.0.1:18080
MES_DATA_API_TOKEN=test-token

# 阶段 1 建议先关登录，减少变量
AUTH_ENABLED=false

# 默认选中 mes
DEFAULT_DOMAIN=mes
```

### 1.3 启动问数

开 **终端 2**：

```bash
pnpm dev
```

### 1.4 验收 checklist

- [ ] 打开 http://localhost:5173/api/health  
      `domains` 里 `mes` 的 `api_available` 为 **true**
- [ ] 网页左侧「制造执行」旁绿点
- [ ] 选「制造执行」，提问：`工单有多少`  
      能返回结果（Mock 返回固定数据也算通过）

**阶段 1 通过标准：** 左侧 mes 连通 + 能完成一次查询（哪怕结果是 Mock 的）。

---

## 阶段 2：实现域 Data API（连真实库）

这是**工作量最大**的一步。你需要一个 HTTP 服务，实现 3 个接口。

### 2.1 必须实现的接口

| 方法 | 路径 | 作用 |
|------|------|------|
| GET | `/api/v1/health` | 健康检查 |
| GET | `/api/v1/schema` | 返回表结构 + 指标口径 |
| POST | `/api/v1/query/execute` | 执行 SELECT，返回表格 |

完整契约：[domain-data-api.openapi.yaml](./superpowers/specs/domain-data-api.openapi.yaml)

给业务同事的简版：[domain-api-one-pager-for-domain-teams.md](./domain-api-one-pager-for-domain-teams.md)

### 2.2 参考实现

问数仓库自带 Mock，可当模板：

```
packages/server/tests/fixtures/mockDomainApiServer.ts
```

### 2.3 `/schema` 返回什么？

问数会把这里的内容塞给 AI，**直接决定 SQL 生成质量**。

```json
{
  "dialect": "mysql",
  "prompt_schema": "CREATE TABLE orders (\n  id INT PRIMARY KEY,\n  customer_name VARCHAR(100),\n  amount DECIMAL(10,2),\n  created_at DATE\n);",
  "metrics_prompt": "- 销售额 = SUM(amount)\n- 订单数 = COUNT(*)",
  "tables_meta": [
    {
      "name": "orders",
      "label": "销售订单",
      "tier": "large",
      "keywords": ["订单", "销售", "成交额"]
    }
  ]
}
```

| 字段 | 要点 |
|------|------|
| `prompt_schema` | 真实表的 CREATE TABLE（含字段注释更好） |
| `metrics_prompt` | 你们业务的指标口径（AI 按这个算） |
| `tables_meta.keywords` | 中文关键词，用于模型路由 |
| `tables_meta.tier` | `large` 倾向云端模型，`small` 倾向本地 |

### 2.4 `/query/execute` 安全要求（必做）

域 API **不能信任** AI 生成的 SQL，必须：

1. 只允许单条 `SELECT`
2. 拒绝 `DELETE` / `UPDATE` / `DROP` 等
3. 强制 `LIMIT`（建议 max 1000）
4. 用**只读数据库账号**
5. （上线）按用户权限过滤行/表

### 2.5 技术选型建议（小白友好）

| 你会什么 | 建议 |
|----------|------|
| C# / .NET | ASP.NET Core 最小 API（你可能有 Admin.NET 经验） |
| Node.js | Express / Fastify |
| Java | Spring Boot |
| Python | FastAPI |

**第一步：** 先写死 1 张表、1 条 `SELECT 1`，能返回 JSON 即可。

---

## 阶段 3：问数指向真实 API

真实域 API 部署好后（例如 `https://data-api.your-company.com`）：

### 3.1 更新 `.env`

```env
MES_DATA_API_URL=https://data-api.your-company.com
MES_DATA_API_TOKEN=与域API约定的一致密钥

DEFAULT_DOMAIN=mes
AUTH_ENABLED=false   # 阶段 3 仍可先关登录
```

### 3.2 重启问数

```bash
# 停掉 pnpm dev 后重新启动
pnpm dev
```

### 3.3 命令行快速验连通

```bash
curl -H "Authorization: Bearer 你的Token" \
  https://data-api.your-company.com/api/v1/health
```

应返回 200 和 JSON。

再测 schema：

```bash
curl -H "Authorization: Bearer 你的Token" \
  "https://data-api.your-company.com/api/v1/schema"
```

---

## 阶段 4：网页第一次真实查数

1. 打开 http://localhost:5173
2. 左侧选 **制造执行**（或你配置的域标签）
3. 确认绿点 + health 里 `api_available: true`
4. 问一个**简单、明确**的问题，例如：
   - `查询订单表前 10 条`
   - `今天有多少条订单`
5. 检查：
   - [ ] 展开 SQL，表名/字段是否来自你的真实库
   - [ ] 表格数据是否合理（不是 Mock 的 `{result:1}`）
   - [ ] 模型标签有 `route_reason`

### 问题不好使时排查顺序

```
1. /api/health 里 mes.api_available 是否为 true？
2. curl schema 能否返回你的表结构？
3. curl execute 手动 POST 一条 SELECT 能否返回数据？
4. 问数 .env 的 URL / Token 是否与域 API 一致？
5. 云端 API Key 是否配置？（生成 SQL 仍需要 LLM）
```

---

## 阶段 5：上线前——登录与权限

开发联调稳定后，生产建议开启：

```env
AUTH_ENABLED=true
WENSH_DOMAIN_SIGNING_SECRET=与域API共享的随机密钥
```

问数登录后，调用域 API 时会额外带 `X-Wensh-*` 签名 Header。  
域 API 需校验签名，防止伪造用户身份。

签名算法见：[domain-api-integration-guide.md](./domain-api-integration-guide.md) 第 4.2 节

参考代码：`packages/server/tests/fixtures/verifyWenshSignature.ts`

---

## 接入第二个场景（例如 MRO / 库存）

1. 再实现一套域 Data API（或同一服务不同库）
2. 配置：

```env
MRO_DATA_API_URL=https://mro-api.your-company.com
MRO_DATA_API_TOKEN=另一套Token
```

3. 前端会出现第二个域选项，示例问题在 `packages/web/src/config/domains.ts` 修改

---

## 接入全新业务域（不限 mes/mro）

当前代码写死了 `demo | mes | mro` 三个域。要加 `erp`、`sales` 等需要小改代码：

1. `packages/shared/src/types.ts` — 扩展 `BusinessDomain`
2. `packages/server/src/adapters/registry.ts` — 注册新域
3. `packages/web/src/config/domains.ts` — 前端选项与示例问题
4. `.env` — 新增 `ERP_DATA_API_URL` 等

**建议：** 第一个真实场景先用 `mes` 槽位跑通，再扩展新域。

---

## 环境变量对照表

| 变量 | 谁配 | 说明 |
|------|------|------|
| `MES_DATA_API_URL` | 问数 | 域 API 基址 |
| `MES_DATA_API_TOKEN` | 双方约定 | Bearer Token |
| `MES_DOMAIN_LABEL` | 问数 | 前端显示名，可改成「销售数据」 |
| `WENSH_DOMAIN_SIGNING_SECRET` | 双方约定 | 上线后 HMAC 密钥 |
| `DEFAULT_DOMAIN` | 问数 | 默认选中哪个域 |
| MySQL 连接串 | **仅域 API** | 问数永远看不到 |

---

## 你现在的下一步（行动清单）

按顺序打勾：

- [ ] **今天**：跑 `pnpm mock:domain`，完成阶段 1
- [ ] **本周**：确定 2～3 张核心表，实现域 API 的 health + schema
- [ ] **本周**：实现 execute，能 `SELECT` 真实数据
- [ ] **下周**：问数 `.env` 指向真实 API，网页验收
- [ ] **上线前**：开启 AUTH + 签名校验 + SQL 安全

---

## 相关文档

| 文档 | 用途 |
|------|------|
| [domain-api-integration-guide.md](./domain-api-integration-guide.md) | 完整对接规范 |
| [domain-api-one-pager-for-domain-teams.md](./domain-api-one-pager-for-domain-teams.md) | 给业务/后端同事的一页纸 |
| [model-routing.md](./model-routing.md) | 本地/云端模型路由 |
| [domain-data-api.openapi.yaml](./superpowers/specs/domain-data-api.openapi.yaml) | OpenAPI 契约 |

---

## 常见问题

**Q：我没有 MySQL，是 SQL Server / PostgreSQL 怎么办？**  
域 API 内部用什么库都行，只要 `/schema` 里 `dialect` 与 Prompt 一致，execute 能跑 SELECT 即可。

**Q：能不能问数直连我的 ERP 数据库？**  
架构上不建议，也不符合当前设计；安全、权限、审计都应放在域 API。

**Q：域 API 必须单独部署吗？**  
建议独立服务；也可以先作为现有后端项目里的一个 Controller/路由组。

**Q：Mock 和真实 API 怎么切换？**  
只改 `.env` 里的 `MES_DATA_API_URL`，重启 `pnpm dev`。
