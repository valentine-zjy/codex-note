# Valentin 的个人网站

这是一个 Vite + React 项目。当前站点是 **Valentin 的个人网站**，包含受保护的 Codex Desktop 文档阅读器、知识星球、个人简历、Todo List 和管理员管理平台。

## 功能

- 访问网站前必须登录。
- 用户名和密码来自本地配置文件，不开放注册。
- 支持角色权限：`admin` 可以在线编辑 Markdown，`viewer` 只能阅读。
- 登录后进入网站首页，可以选择进入不同组件。
- 支持整站风格切换：清爽、夜间、暖光。
- 支持 Markdown 展示风格切换：经典阅读、纸张排版、紧凑扫描、长文衬线。
- 内置个人简历展示组件，不同用户可以展示不同简历。
- 简历支持 HTML / Markdown / PDF 文件上传审核，也支持外部跳转链接审核；上传会校验扩展名、MIME、大小和内容格式。
- 内置 Todo List 组件，支持日视图、周视图、月视图，周视图和月视图包含日历表，数据保存在当前浏览器的 `localStorage`。
- 内置知识星球组件，支持新建知识库、创建文件夹、上传 Markdown 文档。
- 非管理员上传知识库文件或创建文件夹后进入审核；管理员可以直接写入知识库。
- 管理员平台支持用户增删改查、简历文件审核、简历跳转链接审核和知识库提交审核。
- 用户可以点击头像进入用户中心，维护头像、昵称、职业/身份、邮箱、电话、所在地、个人网站、简介，并修改密码。
- Markdown 文档放在 `content/knowledge-planet/Valentin/codex-desktop-guide`，不再放在 `public` 目录中。
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

## 数据存储位置

- 用户信息：本地开发写入 `config/users.local.json`；如果部署时使用 `VALENTIN_USERS_JSON`，则用户配置来自环境变量，线上页面只能读取，不能持久改写这条环境变量。
- Todo List：保存在访问者当前浏览器的 `localStorage`，键名为 `valentin.todos.<用户名>`。换浏览器、清理浏览器数据或换设备后不会自动同步。
- 简历、审核状态、知识库列表、知识库审核记录、用户中心资料和头像：保存在 `data/site-state.json`。
- Markdown 文档：保存在 `content/knowledge-planet/Valentin/codex-desktop-guide` 等知识库目录，管理员在线编辑或上传时会写入对应 Markdown 文件。

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
content/knowledge-planet/Valentin/codex-desktop-guide
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

## 简历与审核数据

默认站点数据位于：

```text
data/site-state.json
```

其中包含已审核简历和待审核记录。当前默认给 `admin` 和 `Valentin` 配置了测试链接：

```text
https://simplewebsitetest1.vercel.app/
```

用户提交 HTML / Markdown / PDF 文件或外部链接后，会进入待审核列表。管理员在“管理平台 > 简历审核”通过后，用户简历页才会展示文件内容或允许跳转链接。

简历文件上传规则：

- 仅支持 `.html`、`.htm`、`.md`、`.markdown`、`.pdf`。
- 文件必须是文本内容，不能包含二进制空字节。
- HTML / Markdown / PDF 单个文件不能超过 4MB。
- HTML 文件会检查是否包含基本 HTML 标签结构。
- PDF 文件会检查 `application/pdf` data URL、base64 内容和 `%PDF-` 文件头。
- 前端会先校验一次，后端 API 会再次校验一次。

## 知识星球与审核

默认 Codex Desktop 文档已经移动到 Valentin 的知识星球：

```text
content/knowledge-planet/Valentin/codex-desktop-guide
```

知识库配置和审核记录保存在：

```text
data/site-state.json
```

知识星球上传规则：

- 仅支持 `.md`、`.markdown` 格式的 Markdown 文档。
- 单个 Markdown 文档不能超过 2MB。
- 文件名不能包含路径分隔符或 Windows 非法字符。
- 文件夹路径不能包含 `..` 越界、隐藏目录或非法字符。
- 管理员上传会直接写入对应知识库目录。
- 非管理员上传文档或创建文件夹，会进入“管理平台 > 知识审核”。
- 审核通过后才会真正写入 `content/knowledge-planet/...` 下的知识库目录。

用户中心上传规则：

- 头像仅支持 PNG、JPG、WebP。
- 头像不能超过 512KB。
- 修改密码需要输入当前密码，新密码至少 8 位。

## 管理员编辑与管理

管理员登录后：

- 文档右上角会出现“编辑”按钮，可以在线修改当前 Markdown 文件并保存。
- 侧边栏会出现“管理平台”，可以管理用户、审核简历提交和知识库提交。

注意：Vercel Serverless 运行时文件系统通常不可持久写入。也就是说：

- 本地开发环境可以直接保存到服务器文件。
- 普通可写 Node 服务器可以直接保存到服务器文件。
- Vercel 部署后，读取没有问题，但在线保存、用户管理、审核写入、知识库上传通常不会持久生效。

如果希望在 Vercel 上也能持久编辑或审核，需要后续接入 GitHub API、数据库或对象存储。

## Vercel 部署

项目已经包含 `vercel.json`：

- Framework Preset: `vite`
- Build Command: `npm run build`
- Output Directory: `dist`
- API Functions: `api/**/*.mjs`
- 受保护内容通过 `includeFiles` 打包 `content/**`、`data/**` 和用户示例配置

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
  admin/                      管理员用户管理和审核入口
config/
  users.example.json          用户配置示例
content/
  knowledge-planet/
    Valentin/
      codex-desktop-guide/    Valentin 知识星球中的 Codex Desktop 文档和图片资源
data/
  site-state.json             简历资料、知识库、审核状态和用户中心资料
server/
  notes-core.mjs              登录、权限、索引、读取、保存核心逻辑
scripts/
  generate-diagrams.mjs       生成文档流程图 SVG
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
3. 首页可以进入 Codex 文档、知识星球、个人简历、Todo List 和管理平台。
4. 使用 `reader` 登录，只能阅读 Markdown，没有编辑按钮。
5. 使用 `admin` 登录，可以编辑并保存 Markdown。
6. 管理员可以看到用户管理、简历审核和知识审核入口。
7. Todo List 可以在日视图、周视图、月视图之间切换；周视图和月视图应出现日历/周历表。
8. 直接访问旧路径 `/notes/...` 应不可用。
