# 团队计费、API Key 与管理员治理

本篇面向 Business、Enterprise、Edu 和使用 API Key 的团队。重点是 workspace credits、Codex seats、automatic reload、spend controls、API Key 和管理员应该如何治理成本。

![Business spend controls 官方截图](assets/screenshots/web/07-business-spend-controls.png)

## Business 的两种 seat

OpenAI Help Center 说明，从 2026-04-02 起，ChatGPT Business 支持：

- standard ChatGPT seats。
- usage-based Codex seats。
- 一个 workspace 可以混合两种 seat。

同一篇 flexible pricing 说明也提到，Codex-only seat 适用于 ChatGPT Business 和 ChatGPT Enterprise，不适用于 ChatGPT Edu、Teachers 或 Healthcare 计划；Edu 仍可按其合同和共享 credit pool 规则使用支持的高级功能。

Codex seats：

- 只提供 Codex access。
- 不包含 ChatGPT access。
- 没有固定每用户每月费用。
- 使用时需要 workspace credits。
- 受 workspace-level admin controls 管理。

适合：

- 团队里有成员只需要 Codex，不需要完整 ChatGPT。
- 希望按 Codex 实际使用付费。
- 希望单独管理 Codex 访问和成本。

## Workspace credits

Business workspace 可以购买 credits。官方说明：

- 如果 workspace credits 不足，usage-based feature 可能不可用。
- Codex seats require credits for activity。
- 首次添加 Codex user 到原本只有 standard ChatGPT seats 的 workspace 时，产品可能触发 credits flow。
- credits 有效期通常为 12 个月。

## 添加 credits

官方流程：

1. 使用有权限管理 billing 或 credits 的角色登录。
2. 进入 Workspace settings → Billing。
3. 选择 add credits。
4. 检查支付方式、credit amount、12 个月有效期说明。
5. 确认购买。

管理员建议：

- 首次购买不要过大。
- 先观察 1-2 周真实使用量。
- 结合团队人数、自动化数量、模型选择决定 target balance。

## Automatic reload

Automatic reload 用来避免 credits 用完导致中断。

关键字段：

| 字段 | 含义 |
| --- | --- |
| Minimum balance | 低于该余额时触发自动充值 |
| Target balance | 自动充值后回到的目标余额 |
| Monthly recharge limit | 每月自动充值上限 |
| Payment method | 扣款方式 |

注意：

- 如果开启时余额已经低于 Minimum balance，可能立即充值。
- Monthly recharge limit 留空意味着每月自动充值不设上限。
- 自动充值是便利功能，不是预算控制本身。

推荐：

- 小团队设置较低 target balance。
- 大团队先设置 monthly recharge limit。
- 每周查看 usage analytics。
- 对自动化任务单独做 spend review。

## Spend controls

Help Center 说明，Business 可以按 seat type 或 specific user 管理 monthly credit usage limits。

规则：

- 可以给 Codex seats 设置更高或无限制。
- 可以给 standard ChatGPT seats 设置不同限制。
- 可以设置 per-user override。
- per-user override 会覆盖 seat-specific limit。
- 默认所有 seats 和 users 都没有指定限制。

推荐治理方式：

| 用户类型 | 建议限制 |
| --- | --- |
| 普通开发者 | 中等额度，避免误用 |
| 核心维护者 | 较高额度 |
| 自动化账号 | 明确上限，必须审计 |
| 新用户 | 低额度试运行 |
| 安全审查负责人 | 视任务给予较高额度 |

## Enterprise / Edu flexible pricing

![Enterprise flexible pricing 官方截图](assets/screenshots/web/08-flexible-pricing-enterprise.png)

官方说明：

- Business 用户有 per-seat limits，超出后如果 workspace 有 credits，可从共享池继续使用。
- Enterprise / Edu 通常在合同层面购买 shared credit pool。
- Enterprise / Edu 默认没有 per-seat usage caps。
- owners / admins 可以用 RBAC 设置 spend controls by group。
- credits allocation 和 expiration 通常由 Order Form 定义。

当 credit pool 用完：

- Business：用户会看到 included usage exhausted 的提示；如果没有 workspace credits，功能会被阻止，用户可请求 admin 添加。
- Enterprise / Edu：advanced features 可能暂停，除非 Workspace Owners 启用 overages 或通过 account team 购买额外 credits。

## API Key 计费

API Key 模式适合：

- CI/CD。
- 脚本化任务。
- shared environments。
- Codex SDK。
- `codex exec`。

官方认证文档说明：

- API Key authentication 支持 local Codex workflows。
- 依赖 ChatGPT workspace access 或 cloud services 的功能可能受限或不可用。
- 使用 API Key 时，Codex 使用 standard API pricing，而不是 included ChatGPT plan credits。

团队建议：

- 不要在公开仓库、CI 日志、AGENTS.md 中写 API key。
- API Key 应使用最小权限。
- CI/CD key 单独命名、单独轮换。
- 对夜间任务和自动化设置预算。
- 把 API usage 和 ChatGPT workspace credits 分开核算。

## API Key 与 ChatGPT 登录怎么选

| 场景 | 推荐 |
| --- | --- |
| 本地桌面日常开发 | ChatGPT 登录 |
| 需要云端 PR / Slack / GitHub 集成 | ChatGPT 登录 |
| IDE Extension 日常使用 | ChatGPT 登录优先 |
| CI/CD | API Key |
| 批处理脚本 | API Key |
| 共享服务器自动化 | API Key |
| 需要团队统一 seats 和 credits | Business / Enterprise workspace |

## 管理员每周检查项

- Workspace credits 余额。
- automatic reload 是否触发过。
- monthly recharge limit 是否合适。
- 哪些 user 或 seat type 消耗最多。
- 自动化任务是否异常频繁运行。
- MCP / plugin 是否过多。
- 是否有人使用 full access 长时间运行。
- 是否有 API Key 出现在日志或代码中。
- 是否需要调整 per-user override。

## Privacy 说明

Help Center 明确说明，spend controls 是 operational tools，不替代 workspace 的 privacy 和 chat visibility rules。用户的 private chat history 仍然是分离的，除非用户选择分享特定 chat、GPT 或资源。

管理员不能因为看 usage analytics 就自动看到用户私聊内容。

## 官方参考

- [Managing credits and spend controls in ChatGPT Business](https://help.openai.com/en/articles/20001155-managing-credits-and-spend-controls-in-chatgpt-business)
- [Flexible pricing for Enterprise, Edu, and Business](https://help.openai.com/en/articles/11487671-flexible-pricing-for-the-enterprise-edu-and-business-plans)
- [What is ChatGPT Business?](https://help.openai.com/en/articles/8792828-what-is-chatgpt-business)
- [Authentication](https://developers.openai.com/codex/auth)
- [Codex Pricing](https://developers.openai.com/codex/pricing)
