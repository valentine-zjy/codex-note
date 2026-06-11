# Valentin 的个人网站

这是一个 Vite + React 项目。当前站点包含一个受保护的组件：**Codex Desktop 使用技巧** Markdown 阅读器。

## 功能

- 访问网站前必须登录。
- 用户名和密码来自本地配置文件，不开放注册。
- 支持角色权限：`admin` 可以在线编辑 Markdown，`viewer` 只能阅读。
- 登录后进入网站首页，可以选择进入不同组件。
- 支持整站风格切换：清爽、夜间、暖光。
- 支持 Markdown 展示风格切换：经典阅读、纸张排版、紧凑扫描、长文衬线。
- 内置个人简历展示组件。
- 内置 Todo List 组件，数据保存在当前浏览器的 `localStorage`。
- Markdown 文档放在 `content/codex-desktop-guide`，不再放在 `public` 目录中。
- 支持多层文件夹、全文搜索、右侧目录、相对图片、相对 Markdown 链接。
- 图片和附件通过 `/api/asset` 返回，需要登录 cookie。

## 本地开发

```bash
npm install
npm run dev -- --port 5174
```

访问：

```text
http://localhost:5174
```

本地测试账号写在 `config/users.local.json` 中。这个文件已被 `.gitignore` 忽略，不会提交到 GitHub。

默认测试账号：

```text
管理员：admin / Valentin@admin123
查看用户：reader / Valentin@reader123
```

上线前请修改密码和 `sessionSecret`。

## 用户配置

推荐本地使用：

```text
config/users.local.json
```

格式参考：

```json
{
  "sessionSecret": "replace-this-with-a-long-random-secret",
  "users": [
    {
      "username": "admin",
      "password": "change-admin-password",
      "displayName": "Valentin Admin",
      "role": "admin",
      "priority": 100
    },
    {
      "username": "reader",
      "password": "change-reader-password",
      "displayName": "Reader",
      "role": "viewer",
      "priority": 10
    }
  ]
}
```

生产环境不要把真实密码提交到公开仓库。部署到 Vercel 时，建议配置环境变量：

```text
VALENTIN_USERS_JSON
VALENTIN_SESSION_SECRET
```

`VALENTIN_USERS_JSON` 的内容与上面的 JSON 结构一致。

## 更新 Markdown 内容

网页读取的内容目录：

```text
content/codex-desktop-guide
```

如果你继续在原始目录维护文档，可以同步到网页项目：

```bash
npm run sync-notes
```

默认同步来源：

```text
../codex使用技巧
```

也可以显式指定来源：

```bash
npm run sync-notes -- "C:\Users\diva\Valentin\codex使用技巧"
```

校验索引与构建：

```bash
npm run generate
npm run build
```

## 管理员编辑

管理员登录后，文档右上角会出现“编辑”按钮，可以在线修改当前 Markdown 文件并保存。

注意：Vercel Serverless 运行时文件系统通常不可持久写入。也就是说：

- 本地开发环境可以直接保存到服务器文件。
- 普通可写 Node 服务器可以直接保存到服务器文件。
- Vercel 部署后，读取没有问题，但在线保存通常不会持久生效。

如果希望在 Vercel 上也能持久编辑，需要后续接入 GitHub API、数据库或对象存储。

## Vercel 部署

项目已经包含 `vercel.json`：

- Framework Preset: `vite`
- Build Command: `npm run build`
- Output Directory: `dist`
- API Functions: `api/*.mjs`
- 受保护内容通过 `includeFiles` 打包 `content/**`

部署前需要在 Vercel 中配置用户 JSON 和会话密钥环境变量。

如果部署后登录时报错，优先检查这两个环境变量：

```text
VALENTIN_USERS_JSON
VALENTIN_SESSION_SECRET
```

`VALENTIN_USERS_JSON` 示例：

```json
{
  "users": [
    {
      "username": "admin",
      "password": "your-admin-password",
      "displayName": "Valentin Admin",
      "role": "admin",
      "priority": 100
    },
    {
      "username": "reader",
      "password": "your-reader-password",
      "displayName": "Reader",
      "role": "viewer",
      "priority": 10
    }
  ]
}
```

`VALENTIN_SESSION_SECRET` 建议使用一段较长的随机字符串。环境变量修改后，需要在 Vercel 重新部署。

## 项目结构

```text
api/                         Vercel API 入口
config/
  users.example.json          用户配置示例
content/
  codex-desktop-guide/        Markdown 文档和图片资源
server/
  notes-core.mjs              登录、权限、索引、读取、保存核心逻辑
scripts/
  generate-notes-index.mjs    校验内容索引
  sync-notes.mjs              从原始文档目录同步
src/
  App.tsx                     前端应用
  markdown.ts                 Markdown 渲染与相对路径处理
  path-utils.ts               路由和 API 路径工具
  styles.css                  页面样式
```

## 验证

```bash
npm run build
```

本地浏览器验证建议：

1. 未登录访问首页，应看到登录页。
2. 登录后进入首页，不应直接进入文章。
3. 首页可以进入 Codex 文档、个人简历和 Todo List。
4. 使用 `reader` 登录，只能阅读 Markdown，没有编辑按钮。
5. 使用 `admin` 登录，可以编辑并保存 Markdown。
6. 直接访问旧路径 `/notes/...` 应不可用。
