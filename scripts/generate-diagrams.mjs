import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(
  repoRoot,
  "content",
  "knowledge-planet",
  "Valentin",
  "codex-desktop-guide",
  "assets",
  "diagrams"
);

const palette = {
  blue: ["#eaf1ff", "#2563eb"],
  violet: ["#f3ecff", "#7c3aed"],
  green: ["#eaf8ef", "#16a34a"],
  amber: ["#fff7e6", "#d97706"],
  rose: ["#fff0f3", "#e11d48"],
  cyan: ["#e8fbff", "#0891b2"],
  slate: ["#f1f5f9", "#475569"]
};

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapText(text, maxChars = 14) {
  const chunks = [];
  let line = "";

  for (const char of text) {
    line += char;
    if (line.length >= maxChars || /[，、；。]/.test(char)) {
      chunks.push(line.replace(/[，、；。]$/, ""));
      line = "";
    }
  }

  if (line) {
    chunks.push(line);
  }

  return chunks.slice(0, 4);
}

function textLines(lines, x, y, className, lineHeight = 26) {
  return `<text class="${className}">${lines
    .map(
      (line, index) =>
        `<tspan x="${x}" y="${y + index * lineHeight}">${escapeXml(line)}</tspan>`
    )
    .join("")}</text>`;
}

function card(node) {
  const [fill, stroke] = palette[node.color ?? "blue"];
  const lines = Array.isArray(node.body) ? node.body : wrapText(node.body ?? "");
  return `<g>
    <rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="18" fill="${fill}" stroke="${stroke}" stroke-width="2.4"/>
    <circle cx="${node.x + 28}" cy="${node.y + 32}" r="11" fill="${stroke}"/>
    <text x="${node.x + 52}" y="${node.y + 40}" class="card-title">${escapeXml(node.title)}</text>
    ${textLines(lines, node.x + 24, node.y + 82, "card-body", 28)}
  </g>`;
}

function edgePoint(node, side) {
  if (side === "left") return [node.x, node.y + node.h / 2];
  if (side === "right") return [node.x + node.w, node.y + node.h / 2];
  if (side === "top") return [node.x + node.w / 2, node.y];
  return [node.x + node.w / 2, node.y + node.h];
}

function arrow(def, nodesById) {
  const from = nodesById.get(def.from);
  const to = nodesById.get(def.to);
  const [sx, sy] = edgePoint(from, def.fromSide ?? "right");
  const [tx, ty] = edgePoint(to, def.toSide ?? "left");
  const midX = def.midX ?? (sx + tx) / 2;
  const midY = def.midY ?? (sy + ty) / 2;
  const pathData =
    def.shape === "curve"
      ? `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`
      : `M ${sx} ${sy} L ${midX} ${midY} L ${tx} ${ty}`;
  const label = def.label
    ? `<text x="${def.labelX ?? midX}" y="${def.labelY ?? midY - 12}" class="arrow-label">${escapeXml(def.label)}</text>`
    : "";

  return `<g>
    <path d="${pathData}" fill="none" stroke="#334155" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#arrow)"/>
    ${label}
  </g>`;
}

function diagram(definition) {
  const nodesById = new Map(definition.nodes.map((node) => [node.id, node]));
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="920" viewBox="0 0 1500 920" role="img" aria-label="${escapeXml(definition.title)}">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#0f172a" flood-opacity="0.14"/>
    </filter>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#334155"/>
    </marker>
    <style><![CDATA[
      text{font-family:"Microsoft YaHei","PingFang SC","Segoe UI",Arial,sans-serif;letter-spacing:0;}
      .title{font-size:36px;font-weight:800;fill:#172033}
      .subtitle{font-size:20px;fill:#64748b}
      .card-title{font-size:22px;font-weight:800;fill:#172033}
      .card-body{font-size:18px;fill:#334155}
      .arrow-label{font-size:17px;font-weight:700;fill:#64748b}
      .caption{font-size:18px;fill:#334155}
    ]]></style>
  </defs>
  <rect width="1500" height="920" fill="#f6f8fb"/>
  <text x="64" y="76" class="title">${escapeXml(definition.title)}</text>
  <text x="64" y="112" class="subtitle">${escapeXml(definition.subtitle)}</text>
  <g filter="url(#shadow)">
    <rect x="48" y="146" width="1404" height="708" rx="24" fill="#ffffff" stroke="#d8dee9"/>
    ${definition.arrows.map((item) => arrow(item, nodesById)).join("\n")}
    ${definition.nodes.map(card).join("\n")}
    ${
      definition.caption
        ? `<text x="80" y="820" class="caption">${escapeXml(definition.caption)}</text>`
        : ""
    }
  </g>
</svg>
`;
}

const diagrams = [
  {
    file: "workflow-codex-desktop.svg",
    title: "Codex Desktop 推荐工作流",
    subtitle: "从目标到验证，形成可审查、可回滚、可继续迭代的闭环",
    nodes: [
      { id: "goal", x: 96, y: 260, w: 250, h: 166, title: "明确目标", body: "说明范围、限制和验收标准", color: "blue" },
      { id: "context", x: 418, y: 260, w: 250, h: 166, title: "读取上下文", body: "先读项目结构、规则和相关文件", color: "violet" },
      { id: "edit", x: 740, y: 260, w: 250, h: 166, title: "小步修改", body: "一次解决一个清晰问题，保持变更可读", color: "green" },
      { id: "verify", x: 1062, y: 260, w: 250, h: 166, title: "运行验证", body: "测试、构建、浏览器检查或截图确认", color: "amber" },
      { id: "review", x: 570, y: 548, w: 320, h: 166, title: "审查与收尾", body: "看差异，说明风险，提交或继续迭代", color: "cyan" }
    ],
    arrows: [
      { from: "goal", to: "context" },
      { from: "context", to: "edit" },
      { from: "edit", to: "verify" },
      { from: "verify", to: "review", fromSide: "bottom", toSide: "right", shape: "curve" },
      { from: "review", to: "goal", fromSide: "left", toSide: "bottom", shape: "curve", label: "仍有问题就回到目标", labelX: 236, labelY: 620 }
    ]
  },
  {
    file: "thread-worktree-git.svg",
    title: "线程、Worktree 与 Git 的关系",
    subtitle: "把对话、文件修改、提交和远程同步拆成清楚的协作链路",
    nodes: [
      { id: "thread", x: 96, y: 300, w: 240, h: 160, title: "新建线程", body: "为任务保留完整上下文", color: "blue" },
      { id: "worktree", x: 398, y: 300, w: 250, h: 160, title: "独立工作区", body: "每条线程可以对应自己的文件状态", color: "violet" },
      { id: "change", x: 710, y: 300, w: 250, h: 160, title: "修改与验证", body: "运行测试、看 diff、确认体验", color: "green" },
      { id: "commit", x: 1022, y: 300, w: 250, h: 160, title: "提交或 PR", body: "commit、push，必要时创建 Pull Request", color: "amber" },
      { id: "main", x: 555, y: 574, w: 350, h: 160, title: "同步主线", body: "合并后归档线程，主分支保持清楚", color: "cyan" }
    ],
    arrows: [
      { from: "thread", to: "worktree" },
      { from: "worktree", to: "change" },
      { from: "change", to: "commit" },
      { from: "commit", to: "main", fromSide: "bottom", toSide: "right", shape: "curve" },
      { from: "main", to: "thread", fromSide: "left", toSide: "bottom", shape: "curve", label: "新需求再开新线程", labelX: 260, labelY: 662 }
    ]
  },
  {
    file: "skills-plugins-mcp.svg",
    title: "Skills、Plugins、MCP 怎么选",
    subtitle: "先判断问题类型，再选择知识、工具或外部系统连接能力",
    nodes: [
      { id: "skill", x: 110, y: 270, w: 280, h: 170, title: "Skill", body: "固定方法论、领域知识和操作流程", color: "blue" },
      { id: "plugin", x: 470, y: 270, w: 280, h: 170, title: "Plugin", body: "把 Skills、工具和应用能力打包启用", color: "violet" },
      { id: "mcp", x: 830, y: 270, w: 280, h: 170, title: "MCP Server", body: "连接仓库、设计稿、浏览器或业务系统", color: "green" },
      { id: "app", x: 470, y: 560, w: 280, h: 170, title: "App / Connector", body: "面向具体产品，提供稳定操作入口", color: "amber" },
      { id: "combo", x: 1140, y: 420, w: 260, h: 170, title: "推荐组合", body: "先选 Skill，再按需要补插件或 MCP", color: "cyan" }
    ],
    arrows: [
      { from: "skill", to: "plugin" },
      { from: "plugin", to: "mcp" },
      { from: "mcp", to: "combo" },
      { from: "plugin", to: "app", fromSide: "bottom", toSide: "top", shape: "curve" },
      { from: "app", to: "combo", fromSide: "right", toSide: "bottom", shape: "curve" }
    ]
  },
  {
    file: "security-model.svg",
    title: "权限、沙箱与批准模型",
    subtitle: "让 Codex 在明确边界里执行，需要越界时再由用户批准",
    nodes: [
      { id: "goal", x: 96, y: 294, w: 250, h: 166, title: "用户目标", body: "明确要改什么、不能碰什么", color: "blue" },
      { id: "policy", x: 418, y: 294, w: 250, h: 166, title: "执行策略", body: "读取指令、权限、沙箱和网络设置", color: "violet" },
      { id: "sandbox", x: 740, y: 294, w: 250, h: 166, title: "沙箱执行", body: "优先在允许范围内读取、编辑和测试", color: "green" },
      { id: "approval", x: 1062, y: 294, w: 250, h: 166, title: "请求批准", body: "涉及敏感操作时解释原因再执行", color: "rose" },
      { id: "audit", x: 570, y: 568, w: 320, h: 166, title: "审查结果", body: "汇报改动、验证结果和残余风险", color: "cyan" }
    ],
    arrows: [
      { from: "goal", to: "policy" },
      { from: "policy", to: "sandbox" },
      { from: "sandbox", to: "approval" },
      { from: "sandbox", to: "audit", fromSide: "bottom", toSide: "right", shape: "curve", label: "无需批准则直接验证", labelX: 830, labelY: 545 },
      { from: "approval", to: "audit", fromSide: "bottom", toSide: "right", shape: "curve" }
    ]
  },
  {
    file: "browser-debug-flow.svg",
    title: "内置浏览器调试闭环",
    subtitle: "把页面观察、代码修改和视觉验证串成一个短反馈循环",
    nodes: [
      { id: "open", x: 104, y: 296, w: 250, h: 166, title: "打开页面", body: "进入 localhost 或目标网页", color: "blue" },
      { id: "mark", x: 426, y: 296, w: 250, h: 166, title: "标注问题", body: "用截图或页面节点指出具体位置", color: "violet" },
      { id: "edit", x: 748, y: 296, w: 250, h: 166, title: "修改代码", body: "定位组件、样式或数据逻辑", color: "green" },
      { id: "reload", x: 1070, y: 296, w: 250, h: 166, title: "刷新验证", body: "检查 DOM、截图和交互状态", color: "amber" },
      { id: "ship", x: 588, y: 574, w: 320, h: 166, title: "确认交付", body: "说明变更范围，必要时提交推送", color: "cyan" }
    ],
    arrows: [
      { from: "open", to: "mark" },
      { from: "mark", to: "edit" },
      { from: "edit", to: "reload" },
      { from: "reload", to: "ship", fromSide: "bottom", toSide: "right", shape: "curve" },
      { from: "ship", to: "mark", fromSide: "left", toSide: "bottom", shape: "curve", label: "仍不理想就继续标注", labelX: 294, labelY: 662 }
    ]
  },
  {
    file: "automation-loop.svg",
    title: "自动化任务闭环",
    subtitle: "把一次性提醒、周期检查和长期跟进变成可维护的任务",
    nodes: [
      { id: "trigger", x: 120, y: 286, w: 260, h: 166, title: "定义触发", body: "时间、周期、事件或明确条件", color: "blue" },
      { id: "scope", x: 460, y: 286, w: 260, h: 166, title: "设定范围", body: "说明要查什么、输出什么、如何判断", color: "violet" },
      { id: "run", x: 800, y: 286, w: 260, h: 166, title: "自动运行", body: "到点执行检查、检索或整理", color: "green" },
      { id: "report", x: 1140, y: 286, w: 260, h: 166, title: "汇报结果", body: "只在需要时提醒，减少噪音", color: "amber" },
      { id: "tune", x: 590, y: 574, w: 320, h: 166, title: "调整规则", body: "根据反馈修改频率、口径和阈值", color: "cyan" }
    ],
    arrows: [
      { from: "trigger", to: "scope" },
      { from: "scope", to: "run" },
      { from: "run", to: "report" },
      { from: "report", to: "tune", fromSide: "bottom", toSide: "right", shape: "curve" },
      { from: "tune", to: "trigger", fromSide: "left", toSide: "bottom", shape: "curve", label: "沉淀成更好的任务", labelX: 286, labelY: 662 }
    ]
  },
  {
    file: "agents-md-scope.svg",
    title: "AGENTS.md 生效范围",
    subtitle: "越靠近文件的说明越具体，最终与用户请求共同决定执行方式",
    nodes: [
      { id: "global", x: 120, y: 250, w: 280, h: 166, title: "全局说明", body: "长期偏好、语言、通用工作习惯", color: "blue" },
      { id: "repo", x: 480, y: 250, w: 280, h: 166, title: "仓库说明", body: "项目结构、命令、测试和提交规则", color: "violet" },
      { id: "folder", x: 840, y: 250, w: 280, h: 166, title: "子目录说明", body: "特定模块的约定和边界", color: "green" },
      { id: "request", x: 480, y: 552, w: 280, h: 166, title: "用户请求", body: "本次任务的目标、限制和验收标准", color: "amber" },
      { id: "action", x: 1140, y: 410, w: 260, h: 166, title: "合成执行", body: "按优先级理解后再读文件和修改", color: "cyan" }
    ],
    arrows: [
      { from: "global", to: "repo" },
      { from: "repo", to: "folder" },
      { from: "folder", to: "action" },
      { from: "request", to: "action" },
      { from: "repo", to: "request", fromSide: "bottom", toSide: "top", shape: "curve", label: "请求可以补充更具体要求", labelX: 538, labelY: 498 }
    ]
  }
];

await fs.mkdir(outputDir, { recursive: true });
await Promise.all(
  diagrams.map((item) =>
    fs.writeFile(path.join(outputDir, item.file), diagram(item), "utf8")
  )
);

console.log(`Generated ${diagrams.length} diagram SVG files`);
