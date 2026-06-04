# 问数（WenShu）公司演示文稿

基于 [Slidev](https://sli.dev/) 制作，面向公司内部汇报、方案评审与产品宣讲。

## 使用方式

**请在仓库根目录安装依赖并启动**（不要在 `packages/slides` 内单独 `pnpm install`，否则 Windows 下易出现主题路径解析错误）：

```bash
# 仓库根目录
pnpm install
pnpm slides:dev
```

若曾在 `packages/slides` 下单独安装过，请先删除该目录下的 `node_modules`，再在根目录重新 `pnpm install`。

## 导出

```bash
pnpm slides:export      # 导出 PNG 等
pnpm slides:export-pdf  # 导出 PDF（需 Chromium）
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `slides.md` | 演示主内容（Markdown + Slidev 语法） |
| `styles/index.css` | 企业风格样式覆盖 |

可根据实际汇报对象，在 `slides.md` 中调整「演进路线」「演示账号」等章节。

## Windows 常见问题

若出现 `@slidev/conditional-styles` 路径含 `D:/...` 与 `../...` 拼接的错误：

1. 确认在**仓库根目录**执行 `pnpm install`（依赖由 monorepo 统一提升）
2. 删除 `packages/slides/node_modules`（若存在）
3. 不要在 `slides.md` frontmatter 中使用 `css:` 字段；自定义样式放在 `styles/index.css`（Slidev 会自动加载）
