# 问数（WenShu）Demo 实现计划

> 技术栈：LangChain.js (TypeScript) + Vue3 + Node.js + SQLite  
> 模型：本地 Qwen3.5-27B (vLLM) + 远端 Qwen API（qwen-max）  
> UI：Element Plus + Tailwind CSS  
> 目标：自然语言提问 → 自动路由模型 → 生成SQL → 执行 → ECharts 可视化返回

---

## 一、工程结构

```
wensh/
├── packages/
│   ├── shared/                        # 前后端共享类型（strict TS）
│   │   ├── src/
│   │   │   ├── types.ts               # QueryRequest / QueryResponse / HistoryItem 等
│   │   │   └── index.ts
│   │   ├── tsconfig.json              # strict: true
│   │   └── package.json
│   ├── server/                        # Node.js + LangChain.js
│   │   ├── src/
│   │   │   ├── chains/
│   │   │   │   ├── buildChain.ts      # 主链构建（RunnableSequence）
│   │   │   │   └── modelRouter.ts     # 本地/远端路由 + 降级逻辑
│   │   │   ├── db/
│   │   │   │   ├── client.ts          # SQLite 连接（better-sqlite3）
│   │   │   │   ├── schema.ts          # 自动提取表结构 → prompt字符串
│   │   │   │   └── seed.ts            # 造假MES数据脚本（支持 SEED_SCALE）
│   │   │   ├── routes/
│   │   │   │   ├── query.ts           # POST /api/query
│   │   │   │   └── health.ts          # GET /api/health
│   │   │   ├── utils/
│   │   │   │   ├── sqlSafety.ts       # SQL 安全校验
│   │   │   │   └── sqlExtract.ts      # 从 LLM 输出提取 SQL
│   │   │   └── index.ts               # Express 入口
│   │   ├── tests/                     # vitest 单元测试 + smoke test
│   │   │   ├── sqlSafety.test.ts
│   │   │   ├── modelRouter.test.ts
│   │   │   └── chain.smoke.test.ts
│   │   ├── data/
│   │   │   └── mes.db                 # SQLite 文件（运行 seed 生成）
│   │   ├── tsconfig.json              # strict: true
│   │   └── package.json
│   └── web/                           # Vue3 前端
│       ├── src/
│       │   ├── components/
│       │   │   ├── ChatInput.vue      # 问题输入框
│       │   │   ├── ResultTable.vue    # 查询结果表格
│       │   │   ├── SqlViewer.vue      # SQL折叠展示（代码高亮）
│       │   │   ├── ModelBadge.vue     # 本地/远端标识 badge
│       │   │   ├── ResultChart.vue    # ECharts 图表（bar/line）
│       │   │   └── ErrorAlert.vue     # 错误态展示
│       │   ├── api/
│       │   │   └── query.ts           # axios 封装
│       │   ├── App.vue
│       │   └── main.ts
│       ├── vite.config.ts             # 代理 /api → localhost:3000
│       ├── tailwind.config.js
│       ├── postcss.config.js
│       ├── tsconfig.json              # strict: true
│       └── package.json
├── .env.example                       # 环境变量模板
├── pnpm-workspace.yaml
└── package.json                       # 根脚本：dev / seed / test / build
```

### 1.1 根目录脚本

| 脚本 | 说明 |
|------|------|
| `pnpm dev` | concurrently 同时启动 server + web |
| `pnpm seed` | 运行 seed.ts 生成/重建 mes.db |
| `pnpm test` | 运行 server 端 vitest |
| `pnpm build` | 编译 shared + server + web |

### 1.2 TypeScript 约定

- `packages/shared`、`packages/server`、`packages/web` 均开启 **`strict: true`**
- server / web 通过 `workspace:*` 引用 `@wensh/shared`
- 所有 API 请求/响应类型只定义在 shared，禁止 duplicated types

---

## 二、环境变量

`.env.example` 内容如下，复制为 `.env` 后填写：

```env
# 本地模型（vLLM OpenAI-compatible）
LOCAL_BASE_URL=http://your-vllm-host:8000/v1
LOCAL_MODEL_NAME=Qwen3.5-27B

# 远端模型（阿里云百炼 Qwen API）
QWEN_API_KEY=sk-xxxxxxxxxxxxxxxx
QWEN_MODEL_NAME=qwen-max

# 路由阈值：涉及表的行数超过此值则使用远端模型
ROW_THRESHOLD=10000

# seed 数据量缩放（1.0=全量，0.1=快速开发）
SEED_SCALE=1.0

# LLM 请求超时（毫秒）
LLM_TIMEOUT_MS=60000

# 服务端口
SERVER_PORT=3000
```

### 2.1 本地模型降级策略

- 路由判定为 `local` 时，先探测 `LOCAL_BASE_URL` 可达性（如 `GET /v1/models`，超时 3s）
- **不可达 → 自动降级为远端 qwen-max**，响应中 `model_used: "remote"` 且 `fallback_reason: "local_unavailable"`
- 路由判定为 `remote` 时，直接使用 qwen-max，不做本地探测

---

## 三、数据层设计

### 3.1 表结构（SQLite）

**production_line（产线，小表，基准 50 条 × SEED_SCALE）**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| name | TEXT | 产线名称，固定 seed：A线、B线、C线、D线、E线 |
| workshop | TEXT | 车间名称，如 冲压车间、装配车间 |
| capacity | INTEGER | 设计产能（件/班） |
| status | TEXT | active / inactive |

**work_order（工单，大表，基准 ~5万条 × SEED_SCALE）**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| order_no | TEXT | 工单编号，如 WO-20250301-001 |
| line_id | INTEGER FK | 关联产线 |
| product_code | TEXT | 产品型号 |
| planned_qty | INTEGER | 计划数量 |
| actual_qty | INTEGER | 实际产出 |
| status | TEXT | pending / running / done |
| created_at | TEXT | ISO 日期 |
| finished_at | TEXT | ISO 日期，可为空 |

**quality_record（良率记录，大表，基准 ~5万条 × SEED_SCALE）**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| order_id | INTEGER FK | 关联工单 |
| line_id | INTEGER FK | 关联产线 |
| inspect_qty | INTEGER | 抽检数量 |
| defect_qty | INTEGER | 不良数量 |
| yield_rate | REAL | 良率（0~1），seed 时写入，与 defect 一致 |
| recorded_at | TEXT | ISO 日期 |

**shift_log（班次日志，大表，基准 ~3万条 × SEED_SCALE）**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| line_id | INTEGER FK | 关联产线 |
| shift | TEXT | morning / afternoon / night |
| date | TEXT | 日期 YYYY-MM-DD |
| oee | REAL | OEE 值（0~1） |
| downtime_min | INTEGER | 停机时长（分钟） |

### 3.2 数据量与 seed 约定

- 各表行数 = 基准量 × `SEED_SCALE`（最小为 1）
- `SEED_SCALE=0.1` 时约 5k 行，适合本地快速迭代
- 启用 `PRAGMA foreign_keys = ON`
- 大表索引：`work_order(line_id, created_at)`、`quality_record(line_id, recorded_at)`、`shift_log(line_id, date)`
- **日期分布**：seed 必须覆盖最近 **12 个月**，保证「上个月」「近30天」「今年」等示例可查
- 产线名称固定 **A线～E线**，与 Demo 示例问题一致

### 3.3 Demo 级 MES 业务指标定义

以下口径写入 SQL 生成 Prompt，保证 LLM 生成一致：

| 指标 | 计算公式 / 规则 | 主要涉及表 |
|------|----------------|-----------|
| **良率** | `AVG(yield_rate)` 或 `1 - SUM(defect_qty)/SUM(inspect_qty)` | quality_record |
| **平均良率（产线维度）** | 按 `line_id` 分组后 `AVG(yield_rate)` | quality_record + production_line |
| **工单完成率（数量口径）** | `SUM(actual_qty) / SUM(planned_qty)`，仅统计 `status='done'` 且 `planned_qty > 0` | work_order |
| **工单完成率（工单数口径）** | `COUNT(CASE WHEN status='done' THEN 1 END) / COUNT(*)` | work_order |
| **在制工单数** | `COUNT(*) WHERE status='running'` | work_order |
| **OEE** | `AVG(oee)`，可按产线/班次/日期分组 | shift_log |
| **停机时长** | `SUM(downtime_min)`，按产线/日期范围聚合 | shift_log |
| **产能利用率** | `SUM(actual_qty) / capacity`（按产线、按班折算时除以班次数） | work_order + production_line |

> Prompt 中默认：**「完成率」无特别说明时，采用数量口径**（`SUM(actual_qty)/SUM(planned_qty)`）。

### 3.4 路由数据量说明

- `production_line`：小表 → 仅涉及此表时走本地
- `work_order`、`quality_record`、`shift_log`：大表 → 涉及则走远端
- 多表命中时取 `MAX(COUNT(*))` 与 `ROW_THRESHOLD` 比较
- 无法判断涉及哪些表时，查全部 4 表取最大行数（保守走远端）

---

## 四、LangChain 核心链设计

### 4.1 整体流程

```
用户问题 + 可选 history（最多2轮）
  ↓
[Step 0] 表名解析
  关键词匹配涉及表 → 查询各表行数 → 取最大值
  ↓
[Step 1] 模型路由
  行数 > ROW_THRESHOLD → 远端 qwen-max
  行数 ≤ ROW_THRESHOLD → 本地 Qwen3.5-27B
  本地不可达 → 降级远端 qwen-max
  ↓
[Step 2] Schema 注入 + SQL 生成
  注入 CREATE TABLE + MES 指标口径 + history 上下文
  LLM 生成 SQL → 提取 ```sql``` 块（失败则 fallback 匹配 SELECT 语句）
  ↓
[Step 3] SQL 安全校验
  只允许 SELECT；拒绝 DML/DDL；拒绝多语句；建议带 LIMIT
  ↓
[Step 4] 执行 SQL
  better-sqlite3 同步执行
  失败 → 错误信息拼回 prompt → 重试 1 次（执行失败或提取不到 SQL 均适用）
  ↓
[Step 5] 结果语言化（interpret !== false 时）
  复用 Step 1 选中的模型（降级后同为 qwen-max）
  生成 interpretation + chart_hint
  ↓
返回给前端
```

### 4.2 modelRouter.ts 核心逻辑

```typescript
// 伪代码，供 Agent 实现参考
async function routeModel(question: string): Promise<{
  type: "local" | "remote";
  fallbackReason?: "local_unavailable";
}> {
  const tables = extractTableNames(question);
  const maxCount = Math.max(...tables.map((t) => getRowCount(t)));
  const preferred = maxCount > ROW_THRESHOLD ? "remote" : "local";

  if (preferred === "local" && !(await isLocalModelAvailable())) {
    return { type: "remote", fallbackReason: "local_unavailable" };
  }
  return { type: preferred };
}

function getModel(type: "local" | "remote"): ChatOpenAI {
  if (type === "local") {
    return new ChatOpenAI({
      baseURL: process.env.LOCAL_BASE_URL,
      apiKey: "local",
      modelName: process.env.LOCAL_MODEL_NAME,
      timeout: Number(process.env.LLM_TIMEOUT_MS),
      extraBody: { enable_thinking: false }, // 主方案，见 7.2
    });
  }
  return new ChatOpenAI({
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKey: process.env.QWEN_API_KEY,
    modelName: process.env.QWEN_MODEL_NAME, // qwen-max
    timeout: Number(process.env.LLM_TIMEOUT_MS),
  });
}
```

### 4.3 SQL 生成 Prompt 模板

```
你是一个专业的数据库查询助手，帮助用户查询制造执行系统（MES）数据库。

数据库表结构如下：
{schema}

业务指标口径：
- 良率：AVG(yield_rate)，或 1 - SUM(defect_qty)/SUM(inspect_qty)
- 工单完成率（默认）：SUM(actual_qty)/SUM(planned_qty)，仅 status='done' 且 planned_qty>0
- OEE：AVG(oee)
- 停机时长：SUM(downtime_min)
- 产线名称字段：production_line.name（A线、B线、C线、D线、E线）

{history_context}

用户问题：{question}

请生成一条标准 SQLite 查询语句，要求：
1. 只生成 SELECT，不生成任何修改性 SQL
2. 用 ```sql ... ``` 包裹 SQL
3. 列名使用中文别名（如 yield_rate AS 良率）
4. 日期过滤使用 DATE() 函数
5. 结果行数可能很大时请加 LIMIT 1000
6. 不要解释，只输出 SQL
```

`history_context` 格式（有 history 时注入）：

```
以下是最近对话，当前问题可能是追问，请结合上下文理解：
- 上一轮问题：{q1} | 生成的SQL：{sql1}
- 上两轮问题：{q2} | 生成的SQL：{sql2}
```

### 4.4 结果语言化 Prompt 模板

```
用户问题：{question}
查询结果（前10行）：{rows_summary}

请用一句话解读查询结果，并在末尾用 [chart:bar]、[chart:line] 或 [chart:table] 标注最适合的可视化类型。
规则：时间序列为 line，分类对比为 bar，明细列过多或为单行多列时用 table。
```

---

## 五、多轮对话方案（V1 推荐）

采用 **轻量多轮**，不做 Agent 记忆库，Demo 可演示追问且实现成本低。

| 维度 | V1 方案 |
|------|---------|
| 前端 | 会话列表 UI；「新对话」按钮清空 history |
| 后端 | 请求体可选 `history`，**最多 2 轮**，每项含 `{ question, sql }` |
| 上下文用法 | 仅注入 SQL 生成 Prompt（见 4.3），不注入完整 rows |
| 不支持 | 跨会话记忆、Tool 调用、自动纠错上一轮结果 |
| 典型追问 | 「那 B 线呢？」「换成按周统计」——依赖 history 中的 SQL 改写 |

> 完整多轮 Agent（rows 摘要记忆、会话持久化）列入第九章后续扩展。

---

## 六、API 接口设计

### POST /api/query

**Request Body：**

```json
{
  "question": "上个月哪条产线的平均良率最低？",
  "interpret": true,
  "history": [
    {
      "question": "上个月哪条产线良率最低？",
      "sql": "SELECT l.name AS 产线, AVG(q.yield_rate) AS 平均良率 FROM ..."
    }
  ]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| question | string | 是 | 用户问题，1~500 字 |
| interpret | boolean | 否 | 默认 `true`；`false` 跳过 Step 5，不返回 interpretation/chart_hint |
| history | HistoryItem[] | 否 | 最多 2 条，用于轻量多轮 |

**Response（成功）：**

```json
{
  "sql": "SELECT l.name AS 产线, AVG(q.yield_rate) AS 平均良率 ...",
  "columns": ["产线", "平均良率"],
  "rows": [
    { "产线": "C线", "平均良率": 0.872 },
    { "产线": "A线", "平均良率": 0.901 }
  ],
  "model_used": "remote",
  "model_name": "qwen-max",
  "fallback_reason": null,
  "interpretation": "上个月C线平均良率最低，为87.2%，低于其他产线约3个百分点。",
  "chart_hint": "bar",
  "row_count": 5,
  "elapsed_ms": 1823,
  "timing": {
    "route_ms": 120,
    "sql_gen_ms": 980,
    "exec_ms": 45,
    "interpret_ms": 678
  }
}
```

**Response（interpret: false）：** 不含 `interpretation`、`chart_hint`，前端仅展示表格（仍可根据列类型渲染 ECharts，见 7.6）。

**Error Response：**

```json
{
  "error": "SQL执行失败：no such column: xxx",
  "sql": "SELECT xxx ...",
  "model_used": "remote",
  "model_name": "qwen-max"
}
```

### GET /api/health

```json
{
  "local_model": { "available": false, "base_url": "http://..." },
  "remote_model": { "available": true, "model_name": "qwen-max" },
  "database": { "available": true, "path": "./data/mes.db" }
}
```

供前端顶部「模型状态指示」使用。

---

## 七、前端组件设计

### 7.1 技术栈

- **Element Plus**：表格（el-table）、输入框、折叠面板、Alert
- **Tailwind CSS**：布局、间距、响应式；不与 Element 主题冲突的部分用 utility class
- **ECharts**：第一版必须实现，不可占位

### 7.2 页面结构

```
App.vue
├── 顶部：标题 + Health 状态（本地/远端/数据库）
├── 中间：会话历史列表（轻量多轮）
│   └── 每条问答：
│       ├── 用户问题气泡
│       ├── ModelBadge（含降级提示 fallback_reason）
│       ├── SqlViewer（折叠 SQL，highlight.js）
│       ├── ResultChart（ECharts，第一版必做）
│       ├── ResultTable（el-table 动态列）
│       ├── interpretation（interpret=false 时不展示）
│       └── ErrorAlert（失败时）
├── 「新对话」按钮（清空 history）
└── 底部：ChatInput + 示例问题快捷按钮
```

### 7.3 ECharts 列映射规则（第一版）

| chart_hint | 渲染方式 |
|------------|----------|
| `bar` | 第一列 → X 轴（category）；其余数值列 → series（多列则 grouped bar） |
| `line` | 第一列 → X 轴（时间或序号）；其余数值列 → line series |
| `table` | 不渲染图表，仅展示表格 |

**Fallback（interpret=false 或无 chart_hint）：**

- 2 列且第二列为数值 → 默认 bar
- 第一列像日期且含数值列 → 默认 line
- 否则仅表格

组件：`ResultChart.vue` 接收 `columns`、`rows`、`chartHint`。

### 7.4 示例问题（演示用，点击直接填入）

- 上个月哪条产线良率最低？
- 今年A线的工单完成率按月统计
- 统计各班次的平均OEE
- 查询所有状态为running的工单数量
- 近30天停机时间最长的产线是哪条？

### 7.5 ModelBadge 展示规则

| 条件 | badge 颜色 | 文字 |
|------|-----------|------|
| model_used === "local" | 绿色 | 本地 · Qwen3.5-27B |
| model_used === "remote" 且无降级 | 蓝色 | 远端 · qwen-max |
| fallback_reason === "local_unavailable" | 蓝色 + 警告图标 | 远端 · qwen-max（本地不可用） |

---

## 八、关键约定与注意事项

### 8.1 模型接口

- 统一使用 `ChatOpenAI`（OpenAI-compatible），远端指向阿里云 compatible endpoint
- 远端固定 **qwen-max**；不使用 `ChatAlibabaTongyi`

### 8.2 Qwen3.5 Thinking 模式

- **主方案**：本地模型请求必须带 `extraBody: { enable_thinking: false }`
- **兜底**：若仍出现 thinking 标签，在 `sqlExtract.ts` 中 strip `` 之后的内容
- 不以 thinking 模式作为正常使用路径

### 8.3 SQL 安全

- 只允许 `SELECT` 开头（忽略大小写和首尾空白）
- 拒绝 `INSERT` / `UPDATE` / `DELETE` / `DROP` / `ALTER` / `CREATE`
- 拒绝多语句（`;` 后还有有效 SQL）
- Prompt 要求加 `LIMIT 1000`；执行层可二次校验
- `better-sqlite3` 设置 `timeout`；可选 `PRAGMA query_only = ON`

### 8.4 Schema 注入策略

- 当前：全量注入 4 张表 CREATE TABLE + 业务指标口径（约 800 token）
- 后续：BGE-M3 + Milvus Schema 向量检索

### 8.5 表名解析（路由用）

| 关键词 | 表 |
|--------|-----|
| 工单、订单、在制 | work_order |
| 良率、质量、不良、抽检 | quality_record |
| 班次、OEE、停机 | shift_log |
| 产线、车间、产能 | production_line |

无法判断 → 查全部 4 表取最大行数。

### 8.6 Windows 开发注意

- `better-sqlite3` 为 native 模块，需安装 Visual Studio Build Tools 或使用预编译环境

---

## 九、测试策略

使用 **vitest**（server 包）。

| 测试文件 | 覆盖内容 |
|----------|----------|
| `sqlSafety.test.ts` | 允许 SELECT；拒绝 DML/DDL/多语句 |
| `modelRouter.test.ts` | 关键词 → 表映射；ROW_THRESHOLD 边界；本地不可达降级 |
| `sqlExtract.test.ts` | 提取 ```sql``` 块；thinking 标签 strip；SELECT fallback |
| `chain.smoke.test.ts` | seed 小数据集（SEED_SCALE=0.01）后，固定问题返回合法 SELECT 且 rows 非空 |

**运行：** `pnpm test`（CI 友好，不依赖真实 LLM 的测试需 mock ChatOpenAI；smoke test 可 `@vitest-environment node` + mock LLM 返回固定 SQL）。

---

## 十、实施阶段与预估时间

### Phase 1：工程初始化（0.5天）

- [ ] 创建 pnpm monorepo：shared + server + web
- [ ] shared：strict TS，定义 QueryRequest / QueryResponse / HistoryItem
- [ ] server 依赖：`express tsx dotenv cors better-sqlite3 langchain @langchain/openai zod vitest`
- [ ] web 依赖：`vue vite element-plus tailwindcss postcss autoprefixer axios echarts highlight.js`
- [ ] 根脚本 dev / seed / test / build；vite 代理；三端 tsconfig strict

### Phase 2：数据层（0.5天）

- [ ] 建表 SQL + 索引 + foreign_keys
- [ ] seed.ts（@faker-js/faker，SEED_SCALE，固定 A~E 线，12 个月日期分布）
- [ ] schema.ts 提取 CREATE TABLE
- [ ] 验证 mes.db 查询与示例问题数据覆盖

### Phase 3：LangChain 核心链（1.5天）

- [ ] modelRouter.ts（路由 + 本地探测 + 降级）
- [ ] buildChain.ts（含 history 注入、interpret 开关）
- [ ] sqlSafety.ts + sqlExtract.ts
- [ ] SQL 执行 + 错误/格式重试（最多 1 次）
- [ ] 结果语言化 + chart_hint 解析
- [ ] vitest 单元测试 + mock smoke test

### Phase 4：BFF 接口（0.5天）

- [ ] POST /api/query（zod 校验 question / interpret / history）
- [ ] GET /api/health
- [ ] 错误中间件；timing 分阶段耗时
- [ ] curl / Postman 验证

### Phase 5：Vue3 前端（1.5天）

- [ ] Tailwind + Element Plus 基础布局
- [ ] ChatInput、SqlViewer、ModelBadge、ResultTable、ErrorAlert
- [ ] **ResultChart.vue（ECharts bar/line，第一版必做）**
- [ ] App.vue 轻量多轮 history + 新对话 + 示例问题
- [ ] interpret=false 时隐藏解读，图表走 fallback 规则
- [ ] Health 状态展示

**总计预估：4.5天**

---

## 十一、可选后续扩展

- **流式输出**：SSE + 前端 ReadableStream
- **Schema 向量检索**：BGE-M3 + Milvus
- **完整多轮 Agent**：会话持久化、rows 摘要记忆、追问自动纠错
- **导出**：CSV / Excel
- **权限控制**：只读 DB 用户
