# 问数 · 从零开始（小白版）

> 本文假设你第一次接触问数，按顺序做即可在本地跑起来并完成第一次提问。

---

## 第 0 步：问数到底在干什么？

一句话：**你在网页里用中文提问，系统自动查数据库，把结果用表格/图表展示出来。**

你不需要会 SQL，但需要：

1. 把项目跑起来
2. 配好至少一个 AI 模型（云端 API Key 或本地 vLLM）
3. 准备好演示数据（`pnpm seed` 一键生成）

---

## 第 1 步：安装环境

| 工具 | 版本要求 | 检查命令 |
|------|----------|----------|
| Node.js | **22+**（项目用内置 SQLite） | `node -v` |
| pnpm | 8+ | `pnpm -v` |

没有 pnpm 时安装：

```bash
npm install -g pnpm
```

---

## 第 2 步：获取代码并安装依赖

```bash
# 进入项目根目录（包含 package.json 和 packages/ 文件夹）
cd wensh

pnpm install
```

安装完成后，项目结构大致是：

```
wensh/
├── packages/
│   ├── web/      # 前端网页（你看到的界面）
│   ├── server/   # 后端服务（处理问题、调 AI、查数据）
│   └── shared/   # 前后端共用的类型定义
├── .env.example  # 配置模板
└── package.json  # 根命令：dev / seed / test
```

---

## 第 3 步：创建配置文件 `.env`

```bash
cp .env.example .env
```

用记事本或 VS Code 打开 `.env`，**至少改下面几项**。

### 方案 A：最简单上手（推荐小白）

适合：没有本地 GPU / vLLM，但有云端 API Key。

```env
# 选一个你有的云端 Key（二选一或都配）
DEEPSEEK_API_KEY=你的真实Key
REMOTE_PROVIDER=deepseek

# 开发时建议关闭登录，少一步操作
AUTH_ENABLED=false

# 数据量先缩小，seed 更快
SEED_SCALE=0.1
```

### 方案 B：公司有本地 vLLM

```env
LOCAL_BASE_URL=http://你的vLLM地址:8000/v1
LOCAL_MODEL_NAME=Qwen3.5-27B
AUTH_ENABLED=false
SEED_SCALE=0.1
```

### 方案 C：保留登录（默认）

不改 `AUTH_ENABLED`（保持 `true`），登录账号：

- 用户名：`demo`
- 密码：`demo123`

---

## 第 4 步：生成演示数据

```bash
pnpm seed
```

会在 `packages/server/data/mes.db` 生成 SQLite 演示库，包含 4 张表：

| 表 | 内容 | 规模 |
|----|------|------|
| production_line | 产线 | 小表 |
| work_order | 工单 | 大表 |
| quality_record | 良率记录 | 大表 |
| shift_log | 班次/OEE | 大表 |

> 这些数据是**演示用假数据**，用来体验问数流程，不代表真实工厂数据。

---

## 第 5 步：启动项目

```bash
pnpm dev
```

成功后会同时启动：

| 服务 | 地址 | 作用 |
|------|------|------|
| 前端 | http://localhost:5173 | 网页界面 |
| 后端 | http://localhost:3000 | API（前端自动代理 `/api`） |

浏览器打开：**http://localhost:5173**

---

## 第 6 步：第一次提问（实操）

### 6.1 看左侧边栏

| 区域 | 含义 |
|------|------|
| **数据源** | 选 `本地演示`（demo）即可，走本地 SQLite |
| **云端模型** | 选你已配置 Key 的提供商（如 DeepSeek） |
| **系统状态** | 绿点 = 可用；本地模型需要 vLLM 才亮 |
| **模型路由** | 显示当前自动切换本地/云端的规则 |

> `制造执行` / `设备维护` 需要对接真实域 API，初学阶段先用 **本地演示**。

### 6.2 输入示例问题

在底部输入框试试：

```
列出所有产线
```

或：

```
上个月哪条产线良率最低？
```

点 **发送**。

### 6.3 观察返回过程

页面会依次出现：

1. **进度提示**：正在路由模型 → 正在生成 SQL → 正在执行查询
2. **模型标签**：显示用了本地还是云端、路由理由
3. **SQL**：可展开查看系统生成的查询语句
4. **图表 + 表格**：查询结果
5. **AI 解读**（开关打开时）：一句话总结

---

## 第 7 步：理解页面上的关键概念

### 业务域 ≠ 问数本身

- **问数**是通用能力（自然语言查数）
- **业务域**是「查哪套数据」
  - `demo` = 本地演示库
  - `mes` / `mro` = 示例业务场景，可扩展为财务、销售等

### 本地模型 vs 云端模型

| | 本地 | 云端 |
|--|------|------|
| 需要什么 | 公司部署的 vLLM | API Key（DeepSeek/Qwen 等） |
| 优点 | 数据不出内网 | 配置简单、能力强 |
| 小白建议 | 有运维支持再用 | **先用这个** |

### AI 解读开关

- **开**：多一步 AI 总结 + 推荐图表类型
- **关**：只返回 SQL + 数据，更快、更省 Token

---

## 第 8 步：验证环境是否正常

浏览器访问（或用 curl）：

```
http://localhost:5173/api/health
```

关注返回 JSON 里：

```json
{
  "local_model": { "available": false },   // 没配 vLLM 时为 false，正常
  "remote_model": { "available": true },   // 配好 Key 后应为 true
  "database": { "available": true },       // seed 成功后应为 true
  "domains": [ ... ]
}
```

`remote_model.available = false` 说明 API Key 没配对，查数会失败。

---

## 第 9 步：常见问题

### Q1：提示「没有可用的 AI 模型」

**原因**：本地 vLLM 没启动，云端 Key 也没配。

**解决**：在 `.env` 里配置 `DEEPSEEK_API_KEY` 或 `QWEN_API_KEY`，重启 `pnpm dev`。

### Q2：登录失败

**解决**：

- 确认账号 `demo` / `demo123`
- 或设 `AUTH_ENABLED=false` 跳过登录

### Q3：`pnpm seed` 报错

**解决**：

- 确认 Node 版本 ≥ 22
- 删除 `packages/server/data/mes.db` 后重新 `pnpm seed`

### Q4：制造执行 / 设备维护显示未连通

**正常**。初学只用 `本地演示`，不需要配 `MES_DATA_API_URL`。

### Q5：端口被占用

改 `.env` 中 `SERVER_PORT`，或关闭占用 3000/5173 的程序。

---

## 第 10 步：下一步学什么

按难度递增：

| 顺序 | 主题 | 文档/位置 |
|------|------|-----------|
| 1 | 本地/云端路由规则 | [model-routing.md](./model-routing.md) |
| 2 | 整体实现计划 | [wensh-plan.md](../wensh-plan.md) |
| 3 | 接入新业务域 | [domain-api-integration-guide.md](./domain-api-integration-guide.md) |
| 4 | 改示例问题 | `packages/web/src/config/domains.ts` |
| 5 | 改演示数据表 | `packages/server/src/db/seed.ts` |

---

## 最小命令速查

```bash
pnpm install    # 安装依赖（首次）
cp .env.example .env   # 创建配置（首次）
pnpm seed       # 生成演示数据（首次或重置数据时）
pnpm dev        # 启动开发环境
pnpm test       # 运行后端测试
```

---

## 一张图记住全流程

```
你输入中文问题
      ↓
前端 (web:5173)  →  后端 (server:3000)
      ↓
选业务域 → 读表结构 → 路由选 AI 模型
      ↓
AI 生成 SQL → 安全检查 → 执行查询 (demo=SQLite)
      ↓
返回表格/图表/解读 → 前端展示
```

到这里，你已经完成问数的「从零到第一次查数」。接下来可以根据你的业务场景，替换演示数据或接入真实 API。
