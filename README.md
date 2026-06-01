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

## 多业务域 API 对接

问数支持三个业务域：`demo`（本地 SQLite 演示）、`mes`（制造执行）、`mro`（设备维护）。`mes` / `mro` 通过 HTTP 对接各域 Data API，前端可在页头切换域并查看连通状态。

- **设计说明：** [docs/superpowers/specs/2026-06-01-domain-api-wensh-design.md](./docs/superpowers/specs/2026-06-01-domain-api-wensh-design.md)
- **域 API 契约：** [docs/superpowers/specs/domain-data-api.openapi.yaml](./docs/superpowers/specs/domain-data-api.openapi.yaml)
- **域团队对接说明：** [docs/domain-api-integration-guide.md](./docs/domain-api-integration-guide.md)
- **环境变量：** 复制 `.env.example` 中的 `MES_DATA_API_URL`、`MRO_DATA_API_URL`、`DOMAIN_API_TOKEN` 等配置项

## 认证（P4）

- **`AUTH_ENABLED=false`**（默认）：开发模式，无需登录即可问数
- **`AUTH_ENABLED=true`**：需先登录；默认演示账号 `demo` / `demo123`
- 调 mes/mro 域 API 时，BFF 自动附带 `X-Wensh-*` HMAC 签名（需与域 API 共享 `WENSH_DOMAIN_SIGNING_SECRET`）
- 后期企业 SSO：设置 `AUTH_PROVIDER=oidc`（见 `.env.example` 注释项）
