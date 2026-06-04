# 问数（WenShu）公司演示文稿

基于 [Slidev](https://sli.dev/) 制作，面向公司内部汇报、方案评审与产品宣讲。

## 使用方式

```bash
# 在仓库根目录
pnpm install
pnpm slides:dev

# 或在本目录
pnpm dev
```

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
