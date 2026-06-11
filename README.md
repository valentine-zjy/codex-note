# Codex Notes

一个面向 Codex Desktop 使用技巧文档的在线 Markdown 阅读器。

## 功能

- 递归识别 `public/notes` 下所有 `.md` 文件。
- 按文件夹层级生成左侧目录树。
- 支持中文路径、嵌套文件夹、相对图片和相对 Markdown 链接。
- 支持标题 / 路径 / 摘要搜索。
- 支持右侧当前文档目录。
- 只读浏览，不在网页中编辑文件。
- 适配桌面端和移动端。

## 本地开发

```bash
npm install
npm run dev
```

默认访问：

```text
http://localhost:5173
```

如果端口被占用，Vite 会提示新的端口。

## 更新 Markdown 内容

所有文档都放在：

```text
public/notes
```

新增、删除或修改 Markdown 文件后，重新执行：

```bash
npm run generate
```

构建时也会自动执行索引生成：

```bash
npm run build
```

部署到 Vercel 后，内容更新方式是修改仓库里的 Markdown 文件并重新部署。网页本身不提供编辑入口。

## Vercel 部署

项目使用 Vite，已包含 `vercel.json`：

- Framework Preset: `vite`
- Build Command: `npm run build`
- Output Directory: `dist`

Vercel 官方文档说明，Vite 项目会构建为静态资源并输出到 `dist`，Vercel 只会部署 Output Directory 中的内容。

## 项目结构

```text
public/
  notes/               Markdown 文档和图片资源
  notes-index.json     构建脚本生成的文档索引
scripts/
  generate-notes-index.mjs
src/
  App.tsx
  markdown.ts
  path-utils.ts
  styles.css
```

## 验证

```bash
npm run build
```

当前构建会生成 23 篇 Markdown 文档索引。
