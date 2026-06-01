# 问数（WenShu）

MES 自然语言查数 Demo：LangChain.js + Vue3 + SQLite，支持本地/远端模型自动路由。

## 快速开始

```bash
pnpm install
cp .env.example .env   # 填写 QWEN_API_KEY 等
pnpm seed              # 生成 mes.db（SEED_SCALE 可调）
pnpm dev               # 启动 server:3000 + web:5173
pnpm test              # 运行单元测试
```

## 技术栈

- **后端**：Express + LangChain.js + node:sqlite（Node 22 内置）
- **前端**：Vue3 + Element Plus + Tailwind CSS v4 + ECharts
- **模型**：本地 Qwen3.5-27B (vLLM) / 远端 qwen-max

详细设计见 [wensh-plan.md](./wensh-plan.md)。
