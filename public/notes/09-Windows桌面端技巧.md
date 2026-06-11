# Windows 桌面端技巧

Windows 版 Codex Desktop 可以在一个界面里处理项目、线程、worktree、Git、浏览器、插件和 Skills。Windows 用户最需要注意的是：项目到底在 PowerShell 原生环境还是 WSL2 环境中运行，工具链是否一致，Git 是否能被识别。

![Windows 版常用设置](assets/screenshots/09-windows/01-windows-settings.webp)

## 第一次配置建议

先检查这些项目：

- Preferred editor：点击文件时打开哪个编辑器。
- Default terminal：集成终端使用 PowerShell、Command Prompt、Git Bash 还是 WSL。
- Sandbox permissions：默认权限是否过宽。
- MCP servers：需要的外部工具是否已安装和授权。
- Git：项目是否是 Git 仓库，Codex 是否能显示 Review / diff。
- Node.js / Python / .NET SDK：项目所需工具是否可在当前环境运行。

完整 Settings 分区、快捷键、Local environments、Actions、Git prompt、Browser allowed / blocked websites 等内容见 [Codex 桌面端设置详解](11-Codex桌面端设置详解.md)。

## PowerShell 还是 WSL2

![PowerShell 与 WSL 的选择](assets/screenshots/09-windows/02-wsl-terminal.webp)

选择原则：

| 环境 | 适合项目 | 注意事项 |
| --- | --- | --- |
| PowerShell | Windows 原生项目、.NET、WinUI、普通前端项目 | 路径是 `C:\...`，命令行为 Windows 风格 |
| WSL2 | Linux 工具链、后端服务、接近生产环境的 Node/Python 项目 | 路径是 `/home/...` 或 WSL 文件系统 |

避免混用：

- 不要在 Windows 路径里用 WSL 工具生成依赖，又在 PowerShell 里运行项目。
- 不要在 WSL 项目里让 Windows 原生 Git 和 Linux Git 混着操作。
- 不要把 `node_modules`、虚拟环境、构建缓存跨环境复用。

推荐提示词：

```text
请先判断这个项目应该在 PowerShell 还是 WSL2 中运行。
请检查 package.json / pyproject.toml / README 中的命令。
不要修改文件，只告诉我推荐环境和理由。
```

## 常用开发工具

Codex 在本地执行任务时，会依赖你机器上的工具。建议安装并配置：

- Git：支持 diff、review、提交、worktree。
- Node.js：前端和许多工具链。
- Python：脚本、数据处理、文档工具、测试。
- .NET SDK：Windows 原生或 .NET 项目。
- GitHub CLI：需要 GitHub 工作流时很有用。
- 项目包管理器：npm、pnpm、yarn、uv、poetry 等。

让 Codex 检查工具链：

```text
请检查当前项目所需的本地开发工具是否可用。
只运行只读或版本检查命令，例如 git --version、node --version。
不要安装软件，不要修改文件。
```

## 执行策略与脚本问题

Windows PowerShell 可能因为 execution policy 阻止脚本运行。处理方式：

1. 先让 Codex 输出完整错误。
2. 判断是项目脚本问题，还是 PowerShell 策略问题。
3. 不要随意放宽全局安全策略。
4. 优先使用项目推荐的终端或命令。

提示词：

```text
PowerShell 阻止了脚本运行。
请先解释错误原因，并给出最小影响的解决方案。
不要直接修改系统安全设置。
```

## Git 功能不可用时

如果 Codex app 不能显示 Git diff 或 Review 面板，检查：

- 当前目录是不是 Git 仓库。
- 是否打开了仓库根目录。
- Git 是否安装并在 PATH 中。
- 项目是否位于特殊路径，例如 `\\wsl$`。
- 当前线程是否在 Worktree 或 Local 中。

提示词：

```text
Codex app 没有显示 Git diff。
请检查当前目录是否是 Git 仓库，以及 Git 是否可用。
只运行诊断命令，不要修改文件。
```

## 集成终端的使用建议

集成终端适合：

- 查看 `git status`。
- 运行项目测试。
- 启动 dev server。
- 检查构建和 lint。
- 执行项目文档中规定的命令。

不建议：

- 在不清楚影响范围时运行删除命令。
- 直接执行从网页复制来的脚本。
- 在权限过宽时运行未知安装命令。
- 用终端处理账号、密码、支付、验证码等敏感流程。

## Windows 上的 Worktree 注意点

- Worktree 需要 Git 仓库。
- 不要让多个 worktree 同时写同一个外部缓存目录。
- 注意路径长度和大小写差异。
- 依赖缓存可能占用大量磁盘空间。
- 自动化和多个线程会产生更多 worktree，需要定期清理。

## 常见错误

**错误：项目在 WSL2，但 Codex 用 PowerShell 跑 Linux 命令。**  
更好的做法：明确告诉 Codex 使用 WSL2 环境，或把项目放在一致的环境里。

**错误：Windows 和 WSL2 共用同一份依赖目录。**  
更好的做法：每个环境独立安装依赖。

**错误：为了解决脚本问题直接放开系统策略。**  
更好的做法：先找项目推荐命令或局部解决方案。

**错误：打开了父级目录导致 Codex 找不到 Git。**  
更好的做法：打开仓库根目录。

## 好物推荐：Windows 用户的效率插件

Windows 上最容易浪费时间的是环境切换、文件格式处理和桌面软件操作。推荐按需安装这些能力。

| 推荐 | 类型 | 提升点 | Windows 注意事项 |
| --- | --- | --- | --- |
| Browser / in-app browser | Plugin / 内置 | 本地 Web 项目预览、截图验证 | localhost 优先用它，不必动 Chrome |
| Chrome 插件 | Plugin | 登录态网页任务 | 注意 Chrome Profile 和网站授权 |
| Computer Use | Plugin | 操作没有 API 的 Windows 桌面应用 | 官方建议有专用插件/MCP 时优先用结构化集成 |
| Spreadsheets | Skill / Plugin | Excel、CSV、公式、图表 | 比手工改表更可审查 |
| Documents / PDF | Skill / Plugin | Word、PDF、报告视觉核查 | 适合办公交付和合同式文档 |
| Presentations | Skill / Plugin | PPTX 生成和修改 | 适合汇报材料 |
| Transcribe / Speech | Skill | 会议录音转写、语音稿 | 需注意音频隐私和 API key |
| OpenAI Docs MCP | MCP | 查官方文档 | 配置问题、模型/API 问题优先用 |

Computer Use 在 Windows 上运行于当前活动桌面；任务执行时可能移动鼠标、输入并接管前台。不要把它当作后台自动化工具。如果需要它长时间运行，优先考虑虚拟机或用另一台设备远程查看进度。

Windows 环境推荐组合：

- **前端开发**：PowerShell 或 WSL2 + Browser + Figma MCP。
- **.NET / Windows 原生开发**：PowerShell + GitHub MCP + test-plan skill。
- **办公文档自动化**：Documents + Spreadsheets + Presentations + PDF。
- **内部系统操作**：优先找插件/MCP；没有结构化接口时再考虑 Computer Use。

不建议：

- 用 Computer Use 操作终端或安全设置。
- PowerShell 和 WSL2 混着安装依赖。
- 为了跑一个脚本永久放宽系统执行策略。
- 在包含大量私人文件的父目录中打开 Codex 项目。

## 检查清单

- [ ] 项目路径和运行环境一致。
- [ ] Git、Node、Python 或 .NET 等工具可用。
- [ ] 打开的是仓库根目录。
- [ ] Preferred editor 和 terminal 设置正确。
- [ ] PowerShell / WSL2 没有混用依赖。
- [ ] 权限设置没有长期保持过宽。

## 官方参考

- [Codex app for Windows](https://developers.openai.com/codex/app/windows)
- [Windows platform](https://developers.openai.com/codex/windows)
- [Codex app settings](https://developers.openai.com/codex/app/settings)
- [Codex app worktrees](https://developers.openai.com/codex/app/worktrees)
