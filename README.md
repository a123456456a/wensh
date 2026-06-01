# 问数（WenShu）

MES 自然语言查数 Demo：LangChain.js + Vue3 + SQLite，支持本地/远端模型自动路由。

## 快速开始

```bash
pnpm install
cp .env.example .env   # 填写 REMOTE_PROVIDER 与对应 API Key
pnpm seed              # 生成 mes.db（SEED_SCALE 可调）
pnpm dev               # 启动 server:3000 + web:5173
pnpm test              # 运行单元测试
```

## 技术栈

- **后端**：Express + LangChain.js + node:sqlite（Node 22 内置）
- **前端**：Vue3 + Element Plus + Tailwind CSS v4 + ECharts
- **模型**：本地 Qwen3.5-27B (vLLM) / 远端 Qwen · DeepSeek · OpenAI · 自定义 OpenAI 兼容 API（页面可切换，选择会保存在浏览器 localStorage）

详细设计见 [wensh-plan.md](./wensh-plan.md)。
