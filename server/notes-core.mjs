import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contentRoot = path.resolve(
  repoRoot,
  process.env.NOTES_CONTENT_ROOT ?? "content"
);
const siteStatePath = path.resolve(
  repoRoot,
  process.env.VALENTIN_SITE_STATE_PATH ?? "data/site-state.json"
);
const cookieName = "valentin_session";
const sessionMaxAgeSeconds = 60 * 60 * 24 * 7;

const collator = new Intl.Collator("zh-CN", {
  numeric: true,
  sensitivity: "base"
});

const hiddenDirectoryNames = new Set(["assets"]);
const folderTitleMap = new Map([
  ["knowledge-planet", "知识星球"],
  ["Valentin", "Valentin"],
  ["codex-desktop-guide", "Codex Desktop 使用技巧"]
]);

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".webp", "image/webp"]
]);

const defaultResumeProfiles = {
  admin: {
    type: "link",
    title: "Valentin 的在线简历",
    url: "https://simplewebsitetest1.vercel.app/",
    updatedAt: "2026-06-11T00:00:00.000Z",
    reviewedBy: "system"
  },
  Valentin: {
    type: "link",
    title: "Valentin 的在线简历",
    url: "https://simplewebsitetest1.vercel.app/",
    updatedAt: "2026-06-11T00:00:00.000Z",
    reviewedBy: "system"
  }
};

const resumeMaxBytes = 4 * 1024 * 1024;
const knowledgeMarkdownMaxBytes = 2 * 1024 * 1024;
const avatarMaxBytes = 512 * 1024;
const htmlExtensions = new Set(["html", "htm"]);
const markdownExtensions = new Set(["md", "markdown"]);
const avatarMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

const defaultKnowledgeBases = [
  {
    id: "valentin-codex-desktop",
    ownerUsername: "Valentin",
    ownerDisplayName: "Valentin",
    title: "Codex Desktop 使用技巧",
    description: "管理员 Valentin 的 Codex Desktop 知识库，收纳桌面端使用技巧、设置、计费与推荐清单。",
    rootPath: "knowledge-planet/Valentin/codex-desktop-guide",
    createdAt: "2026-06-12T00:00:00.000Z",
    updatedAt: "2026-06-12T00:00:00.000Z"
  }
];

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function cleanTitleFromName(fileName) {
  return fileName
    .replace(/\.md$/i, "")
    .replace(/^\d+[-_]/, "")
    .replace(/-/g, " ")
    .trim();
}

function readTitle(markdown, fileName) {
  const match = markdown.match(/^#\s+(.+)$/m);
  if (match?.[1]) {
    return match[1].trim();
  }
  return cleanTitleFromName(fileName);
}

function toSearchText(markdown) {
  return markdown
    .replace(/```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[[^\]]+]\([^)]*\)/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_`|~\-:[\](){}.!?,，。；;、]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function excerpt(markdown) {
  return toSearchText(markdown).slice(0, 160);
}

function normalizeContentPath(value) {
  if (!value || typeof value !== "string") {
    throw new HttpError(400, "缺少文件路径");
  }

  const normalized = value
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment && segment !== ".")
    .reduce((segments, segment) => {
      if (segment === "..") {
        segments.pop();
      } else {
        segments.push(segment);
      }
      return segments;
    }, [])
    .join("/");

  if (!normalized) {
    throw new HttpError(400, "文件路径无效");
  }

  return normalized;
}

function resolveContentPath(value) {
  const normalized = normalizeContentPath(value);
  const absolute = path.resolve(contentRoot, ...normalized.split("/"));
  const relative = path.relative(contentRoot, absolute);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new HttpError(400, "文件路径越界");
  }

  return {
    normalized,
    absolute
  };
}

async function walkDirectory(dir, relativeDir = "", hidden = false, allFiles = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const children = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const absolute = path.join(dir, entry.name);
    const relativePath = toPosix(path.join(relativeDir, entry.name));

    if (entry.isDirectory()) {
      const nextHidden = hidden || hiddenDirectoryNames.has(entry.name);
      const folderChildren = await walkDirectory(
        absolute,
        relativePath,
        nextHidden,
        allFiles
      );

      if (!nextHidden && folderChildren.length > 0) {
        children.push({
          type: "folder",
          name: entry.name,
          title: folderTitleMap.get(entry.name) ?? entry.name,
          path: relativePath,
          children: folderChildren
        });
      }
      continue;
    }

    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) {
      continue;
    }

    const content = await fs.readFile(absolute, "utf8");
    const stat = await fs.stat(absolute);
    const title = readTitle(content, entry.name);
    const file = {
      type: "file",
      name: entry.name,
      title,
      path: relativePath,
      excerpt: excerpt(content),
      searchText: toSearchText(`${title} ${relativePath} ${content}`),
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
      hidden
    };

    allFiles.push(file);

    if (!hidden) {
      children.push(file);
    }
  }

  children.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "folder" ? -1 : 1;
    }
    return collator.compare(a.name, b.name);
  });

  return children;
}

function flattenFiles(nodes, result = []) {
  for (const node of nodes) {
    if (node.type === "file") {
      result.push(node);
    } else {
      flattenFiles(node.children, result);
    }
  }
  return result;
}

function latestTimestamp(files) {
  const latest = files
    .map((file) => new Date(file.updatedAt).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];

  return new Date(latest || 0).toISOString();
}

export async function buildNotesIndex() {
  await fs.access(contentRoot);
  const allFiles = [];
  const tree = await walkDirectory(contentRoot, "", false, allFiles);
  const visibleFiles = flattenFiles(tree);
  const files = [...allFiles].sort((a, b) => collator.compare(a.path, b.path));

  return {
    generatedAt: latestTimestamp(files),
    root: "content",
    count: visibleFiles.length,
    hiddenCount: files.length - visibleFiles.length,
    defaultPath:
      visibleFiles.find(
        (file) =>
          file.path.toLowerCase() ===
          "knowledge-planet/valentin/codex-desktop-guide/readme.md"
      )?.path ??
      visibleFiles.find(
        (file) => file.path.toLowerCase() === "codex-desktop-guide/readme.md"
      )?.path ??
      visibleFiles.find(
        (file) =>
          file.path.toLowerCase().endsWith("/readme.md") &&
          file.path.split("/").length <= 4
      )
        ?.path ??
      visibleFiles.find((file) => file.path.toLowerCase() === "readme.md")
        ?.path ??
      visibleFiles[0]?.path ??
      "",
    tree,
    files
  };
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function safeCompare(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));

  if (left.length !== right.length) {
    crypto.timingSafeEqual(left, left);
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function signSession(payload, secret) {
  const data = base64UrlJson(payload);
  const signature = crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest("base64url");

  return `${data}.${signature}`;
}

function verifySessionToken(token, secret) {
  const [data, signature] = String(token ?? "").split(".");
  if (!data || !signature) {
    return null;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest("base64url");

  if (!safeCompare(signature, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers?.cookie ?? "";
  return Object.fromEntries(
    header
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const separator = cookie.indexOf("=");
        if (separator === -1) {
          return [cookie, ""];
        }
        return [
          decodeURIComponent(cookie.slice(0, separator)),
          decodeURIComponent(cookie.slice(separator + 1))
        ];
      })
  );
}

function serializeCookie(name, value, req, options = {}) {
  const secure =
    process.env.VERCEL === "1" ||
    req.headers?.["x-forwarded-proto"] === "https";
  const parts = [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax"
  ];

  if (secure) {
    parts.push("Secure");
  }

  if (typeof options.maxAge === "number") {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  return parts.join("; ");
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    return JSON.parse(req.body || "{}");
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function publicUser(user) {
  const role = user.role === "admin" ? "admin" : "viewer";
  return {
    username: String(user.username),
    displayName: String(user.displayName ?? user.username),
    role,
    priority: Number(user.priority ?? (role === "admin" ? 100 : 10)),
    canEdit: role === "admin"
  };
}

function adminUser(user) {
  return {
    ...publicUser(user),
    hasPassword:
      typeof user.password === "string" ||
      typeof user.passwordSha256 === "string"
  };
}

function normalizeRole(value) {
  return value === "admin" ? "admin" : "viewer";
}

function cleanUsername(value) {
  return String(value ?? "").trim();
}

function cleanDisplayName(value, fallback) {
  return String(value ?? fallback).trim() || fallback;
}

function parsePriority(value, fallback = 10) {
  const priority = Number(value);
  if (!Number.isFinite(priority)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(priority)));
}

async function pathExists(filePath) {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}

async function loadUsersConfig() {
  if (process.env.VALENTIN_USERS_JSON) {
    let config;
    try {
      config = JSON.parse(process.env.VALENTIN_USERS_JSON);
    } catch {
      throw new HttpError(
        503,
        "VALENTIN_USERS_JSON 不是合法 JSON，请检查 Vercel 环境变量"
      );
    }
    return {
      ...config,
      source: "VALENTIN_USERS_JSON",
      writePath: null,
      readOnly: true
    };
  }

  const configuredPath = process.env.VALENTIN_USERS_CONFIG
    ? path.resolve(repoRoot, process.env.VALENTIN_USERS_CONFIG)
    : null;
  const localPath = path.resolve(repoRoot, "config", "users.local.json");
  const examplePath = path.resolve(repoRoot, "config", "users.example.json");

  const configPath =
    configuredPath ??
    ((await pathExists(localPath))
      ? localPath
      : process.env.NODE_ENV === "production"
        ? null
        : examplePath);

  if (!configPath) {
    throw new HttpError(
      503,
      "服务端缺少用户配置，请在 Vercel 环境变量中设置 VALENTIN_USERS_JSON"
    );
  }

  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  return {
    ...config,
    source: path.relative(repoRoot, configPath),
    writePath:
      configuredPath ?? (configPath === examplePath ? localPath : configPath),
    readOnly: false
  };
}

function passwordMatches(user, password) {
  if (typeof user.password === "string") {
    return safeCompare(user.password, password);
  }

  if (typeof user.passwordSha256 === "string") {
    const hash = crypto.createHash("sha256").update(password).digest("hex");
    return safeCompare(user.passwordSha256, hash);
  }

  return false;
}

async function getUserConfig() {
  const config = await loadUsersConfig();
  if (!Array.isArray(config.users) || config.users.length === 0) {
    throw new HttpError(503, "用户配置为空，请至少配置一个用户");
  }

  const sessionSecret =
    process.env.VALENTIN_SESSION_SECRET ??
    config.sessionSecret ??
    "local-development-session-secret";

  if (
    process.env.NODE_ENV === "production" &&
    !process.env.VALENTIN_SESSION_SECRET &&
    !config.sessionSecret
  ) {
    throw new HttpError(
      503,
      "生产环境缺少会话密钥，请设置 VALENTIN_SESSION_SECRET 或在用户配置中提供 sessionSecret"
    );
  }

  return {
    users: config.users,
    sessionSecret,
    source: config.source,
    writePath: config.writePath,
    readOnly: config.readOnly
  };
}

async function authenticateRequest(req) {
  const { users, sessionSecret } = await getUserConfig();
  const cookies = parseCookies(req);
  const payload = verifySessionToken(cookies[cookieName], sessionSecret);
  if (!payload?.username) {
    return null;
  }

  const user = users.find((item) => item.username === payload.username);
  if (!user) {
    return null;
  }

  const currentUser = publicUser(user);
  const state = await loadSiteState().catch(() => null);
  const storedProfile = state?.userProfiles?.[currentUser.username];
  if (storedProfile?.displayName) {
    currentUser.displayName = String(storedProfile.displayName);
  }
  return currentUser;
}

async function requireUser(req) {
  const user = await authenticateRequest(req);
  if (!user) {
    throw new HttpError(401, "请先登录");
  }
  return user;
}

async function requireAdmin(req) {
  const user = await requireUser(req);
  if (user.role !== "admin") {
    throw new HttpError(403, "当前用户不是管理员");
  }
  return user;
}

function readonlyWriteError(target) {
  return new HttpError(
    409,
    `${target} 当前不可写。Vercel 环境请接入数据库或在本地修改后重新部署。`
  );
}

async function writeUsersConfig(writePath, config) {
  if (!writePath) {
    throw readonlyWriteError("用户配置");
  }

  await fs.mkdir(path.dirname(writePath), { recursive: true });
  await fs
    .writeFile(
      writePath,
      `${JSON.stringify(
        {
          sessionSecret: config.sessionSecret,
          users: config.users
        },
        null,
        2
      )}\n`,
      "utf8"
    )
    .catch((error) => {
      if (error.code === "EROFS" || error.code === "EPERM") {
        throw readonlyWriteError("用户配置");
      }
      throw error;
    });
}

function normalizeSiteState(state = {}) {
  const customKnowledgeBases = Array.isArray(state.knowledgeBases)
    ? state.knowledgeBases
    : [];
  const knowledgeBaseMap = new Map(
    defaultKnowledgeBases.map((base) => [base.id, { ...base }])
  );
  for (const base of customKnowledgeBases) {
    if (base?.id) {
      knowledgeBaseMap.set(base.id, {
        ...(knowledgeBaseMap.get(base.id) ?? {}),
        ...base
      });
    }
  }
  const knowledgeBases = [...knowledgeBaseMap.values()];

  return {
    resumes: {
      ...defaultResumeProfiles,
      ...(state.resumes && typeof state.resumes === "object" ? state.resumes : {})
    },
    userProfiles:
      state.userProfiles && typeof state.userProfiles === "object"
        ? state.userProfiles
        : {},
    resumeRequests: Array.isArray(state.resumeRequests)
      ? state.resumeRequests
      : [],
    knowledgeBases,
    knowledgeRequests: Array.isArray(state.knowledgeRequests)
      ? state.knowledgeRequests
      : []
  };
}

async function loadSiteState() {
  const state = await fs
    .readFile(siteStatePath, "utf8")
    .then((text) => JSON.parse(text))
    .catch((error) => {
      if (error.code === "ENOENT") {
        return {};
      }
      throw error;
    });
  return normalizeSiteState(state);
}

async function writeSiteState(state) {
  const relative = path.relative(repoRoot, siteStatePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new HttpError(400, "站点数据路径越界");
  }

  await fs.mkdir(path.dirname(siteStatePath), { recursive: true });
  await fs
    .writeFile(siteStatePath, `${JSON.stringify(normalizeSiteState(state), null, 2)}\n`, "utf8")
    .catch((error) => {
      if (error.code === "EROFS" || error.code === "EPERM") {
        throw readonlyWriteError("站点审核数据");
      }
      throw error;
    });
}

function sanitizeUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value ?? "").trim());
  } catch {
    throw new HttpError(400, "链接格式无效");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new HttpError(400, "链接只能使用 http 或 https");
  }

  return parsed.toString();
}

function resumeFileExtension(fileName) {
  return String(fileName).toLowerCase().split(".").pop() ?? "";
}

function validateResumeFileName(fileName) {
  const name = String(fileName ?? "").trim();
  if (!name) {
    throw new HttpError(400, "请选择要上传的简历文件");
  }
  if (/[\\/]/.test(name)) {
    throw new HttpError(400, "文件名不能包含路径分隔符");
  }
  if (name.length > 120) {
    throw new HttpError(400, "文件名过长，请控制在 120 个字符内");
  }

  const extension = resumeFileExtension(name);
  if (htmlExtensions.has(extension)) {
    return "html";
  }
  if (markdownExtensions.has(extension)) {
    return "markdown";
  }
  if (extension === "pdf") {
    return "pdf";
  }

  throw new HttpError(400, "只支持 .html、.htm、.md、.markdown、.pdf 格式的简历文件");
}

function validateResumeContent(content, fileType) {
  if (!content.trim()) {
    throw new HttpError(400, "简历文件内容为空");
  }
  if (content.includes("\u0000")) {
    throw new HttpError(400, "简历文件必须是文本文件，不能包含二进制内容");
  }
  if (fileType === "pdf") {
    validatePdfDataUrl(content);
    return;
  }
  if (Buffer.byteLength(content, "utf8") > resumeMaxBytes) {
    throw new HttpError(400, "简历文件不能超过 4MB");
  }
  if (
    fileType === "html" &&
    !/(<!doctype\s+html|<html[\s>]|<body[\s>]|<[a-z][\w:-]*(\s|>))/i.test(content)
  ) {
    throw new HttpError(400, "HTML 简历文件内容不符合 HTML 格式");
  }
}

function parseDataUrl(value, expectedTypes, label) {
  const match = String(value ?? "").match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) {
    throw new HttpError(400, `${label} 必须是 base64 data URL`);
  }

  const mimeType = match[1].toLowerCase();
  if (!expectedTypes.has(mimeType)) {
    throw new HttpError(400, `${label} MIME 类型不正确`);
  }

  let buffer;
  try {
    buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  } catch {
    throw new HttpError(400, `${label} base64 内容无效`);
  }

  return { mimeType, buffer };
}

function validatePdfDataUrl(value) {
  const { buffer } = parseDataUrl(value, new Set(["application/pdf"]), "PDF 简历文件");
  if (buffer.length === 0) {
    throw new HttpError(400, "PDF 简历文件内容为空");
  }
  if (buffer.length > resumeMaxBytes) {
    throw new HttpError(400, "PDF 简历文件不能超过 4MB");
  }
  if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new HttpError(400, "PDF 简历文件头不正确");
  }
}

function validateAvatarDataUrl(value) {
  if (!value) {
    return "";
  }
  const { buffer } = parseDataUrl(value, avatarMimeTypes, "头像文件");
  if (buffer.length > avatarMaxBytes) {
    throw new HttpError(400, "头像文件不能超过 512KB");
  }
  return String(value);
}

function profileForUser(user, state) {
  const stored = state.userProfiles?.[user.username] ?? {};
  return {
    username: user.username,
    displayName: String(stored.displayName ?? user.displayName),
    title: String(stored.title ?? ""),
    email: String(stored.email ?? ""),
    phone: String(stored.phone ?? ""),
    location: String(stored.location ?? ""),
    website: String(stored.website ?? ""),
    bio: String(stored.bio ?? ""),
    avatarDataUrl: stored.avatarDataUrl ? String(stored.avatarDataUrl) : undefined,
    updatedAt: stored.updatedAt
  };
}

function sanitizeProfileBody(body, user, state) {
  const current = profileForUser(user, state);
  const website = String(body.website ?? current.website).trim();
  if (website) {
    sanitizeUrl(website);
  }

  return {
    username: user.username,
    displayName: cleanDisplayName(body.displayName, current.displayName || user.username),
    title: String(body.title ?? current.title).trim().slice(0, 80),
    email: String(body.email ?? current.email).trim().slice(0, 120),
    phone: String(body.phone ?? current.phone).trim().slice(0, 40),
    location: String(body.location ?? current.location).trim().slice(0, 80),
    website,
    bio: String(body.bio ?? current.bio).trim().slice(0, 500),
    avatarDataUrl:
      body.avatarDataUrl === ""
        ? ""
        : validateAvatarDataUrl(body.avatarDataUrl ?? current.avatarDataUrl ?? ""),
    updatedAt: new Date().toISOString()
  };
}

function publicResumeRequest(request, includeContent = false) {
  const base = {
    id: request.id,
    username: request.username,
    displayName: request.displayName,
    mode: request.mode,
    status: request.status,
    title: request.title,
    submittedAt: request.submittedAt,
    reviewedAt: request.reviewedAt,
    reviewedBy: request.reviewedBy,
    comment: request.comment,
    fileName: request.fileName,
    fileType: request.fileType,
    url: request.url
  };

  if (includeContent) {
    base.content = request.content;
  }

  return base;
}

function safePathSegment(value, fallback = "knowledge-base") {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return normalized || fallback;
}

function normalizeKnowledgeFolder(value = "") {
  const raw = String(value ?? "").replace(/\\/g, "/").trim();
  if (!raw) {
    return "";
  }

  const segments = raw.split("/").filter((segment) => segment && segment !== ".");
  const stack = [];

  for (const segment of segments) {
    if (segment === "..") {
      stack.pop();
      continue;
    }
    if (
      segment.startsWith(".") ||
      segment.length > 80 ||
      /[<>:"|?*\u0000-\u001f]/.test(segment)
    ) {
      throw new HttpError(400, "文件夹名称格式不合规");
    }
    stack.push(segment);
  }

  return stack.join("/");
}

function validateMarkdownFileName(fileName) {
  const name = String(fileName ?? "").trim();
  if (!name) {
    throw new HttpError(400, "请提供 Markdown 文件名");
  }
  if (name.length > 120 || /[\\/<>:"|?*\u0000-\u001f]/.test(name) || name.startsWith(".")) {
    throw new HttpError(400, "Markdown 文件名格式不合规");
  }
  const extension = name.toLowerCase().split(".").pop() ?? "";
  if (!markdownExtensions.has(extension)) {
    throw new HttpError(400, "知识库文档只支持 .md 或 .markdown 格式");
  }
  return name;
}

function validateMarkdownContent(content) {
  if (typeof content !== "string") {
    throw new HttpError(400, "缺少 Markdown 内容");
  }
  if (!content.trim()) {
    throw new HttpError(400, "Markdown 内容不能为空");
  }
  if (content.includes("\u0000")) {
    throw new HttpError(400, "Markdown 内容不能包含二进制字符");
  }
  if (Buffer.byteLength(content, "utf8") > knowledgeMarkdownMaxBytes) {
    throw new HttpError(400, "Markdown 文档不能超过 2MB");
  }
  return content;
}

function findKnowledgeBase(state, baseId) {
  const base = state.knowledgeBases.find((item) => item.id === baseId);
  if (!base) {
    throw new HttpError(404, "知识库不存在");
  }
  return base;
}

function resolveKnowledgePath(base, targetFolder = "", fileName = "") {
  const folder = normalizeKnowledgeFolder(targetFolder);
  const parts = [base.rootPath, folder, fileName].filter(Boolean).join("/");
  const resolved = resolveContentPath(parts);
  const root = normalizeContentPath(base.rootPath);
  if (resolved.normalized !== root && !resolved.normalized.startsWith(`${root}/`)) {
    throw new HttpError(400, "知识库路径越界");
  }
  return {
    ...resolved,
    folder
  };
}

async function ensureKnowledgeRoot(base) {
  const { absolute } = resolveKnowledgePath(base);
  await fs.mkdir(absolute, { recursive: true }).catch((error) => {
    if (error.code === "EROFS" || error.code === "EPERM") {
      throw readonlyWriteError("知识库文件");
    }
    throw error;
  });
}

async function writeKnowledgeDocument(base, targetFolder, fileName, content) {
  const safeFileName = validateMarkdownFileName(fileName);
  const safeContent = validateMarkdownContent(content);
  const { absolute, normalized, folder } = resolveKnowledgePath(base, targetFolder, safeFileName);
  const exists = await pathExists(absolute);
  if (exists) {
    throw new HttpError(409, "同名 Markdown 文档已经存在");
  }
  await fs.mkdir(path.dirname(absolute), { recursive: true }).catch((error) => {
    if (error.code === "EROFS" || error.code === "EPERM") {
      throw readonlyWriteError("知识库文件夹");
    }
    throw error;
  });
  await fs.writeFile(absolute, safeContent, "utf8").catch((error) => {
    if (error.code === "EROFS" || error.code === "EPERM") {
      throw readonlyWriteError("知识库文件");
    }
    throw error;
  });
  return {
    path: normalized,
    folder
  };
}

async function createKnowledgeFolder(base, targetFolder) {
  const { absolute, normalized, folder } = resolveKnowledgePath(base, targetFolder);
  if (!folder) {
    throw new HttpError(400, "请填写要创建的文件夹路径");
  }
  await fs.mkdir(absolute, { recursive: true }).catch((error) => {
    if (error.code === "EROFS" || error.code === "EPERM") {
      throw readonlyWriteError("知识库文件夹");
    }
    throw error;
  });
  return {
    path: normalized,
    folder
  };
}

async function listKnowledgeFolders(base) {
  const { absolute } = resolveKnowledgePath(base);
  const folders = [];

  async function walk(dir, relativeDir = "") {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (
        !entry.isDirectory() ||
        entry.name.startsWith(".") ||
        hiddenDirectoryNames.has(entry.name)
      ) {
        continue;
      }
      const relativePath = toPosix(path.join(relativeDir, entry.name));
      folders.push(relativePath);
      await walk(path.join(dir, entry.name), relativePath);
    }
  }

  await walk(absolute).catch((error) => {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  });

  return folders.sort((a, b) => collator.compare(a, b));
}

async function enrichKnowledgeBases(bases) {
  return Promise.all(
    bases.map(async (base) => ({
      ...base,
      folders: await listKnowledgeFolders(base).catch(() => [])
    }))
  );
}

function publicKnowledgeRequest(request, includeContent = false) {
  const base = {
    id: request.id,
    type: request.type,
    status: request.status,
    baseId: request.baseId,
    baseTitle: request.baseTitle,
    username: request.username,
    displayName: request.displayName,
    targetFolder: request.targetFolder,
    title: request.title,
    fileName: request.fileName,
    submittedAt: request.submittedAt,
    reviewedAt: request.reviewedAt,
    reviewedBy: request.reviewedBy,
    comment: request.comment
  };

  if (includeContent) {
    base.content = request.content;
  }

  return base;
}

function setHeader(res, name, value) {
  if (typeof res.setHeader === "function") {
    res.setHeader(name, value);
  }
}

function sendJson(res, statusCode, data, headers = {}) {
  for (const [name, value] of Object.entries(headers)) {
    setHeader(res, name, value);
  }
  setHeader(res, "Content-Type", "application/json; charset=utf-8");
  res.statusCode = statusCode;
  res.end(JSON.stringify(data));
}

function sendText(res, statusCode, text, headers = {}) {
  for (const [name, value] of Object.entries(headers)) {
    setHeader(res, name, value);
  }
  setHeader(res, "Content-Type", "text/plain; charset=utf-8");
  res.statusCode = statusCode;
  res.end(text);
}

function sendBuffer(res, statusCode, buffer, headers = {}) {
  for (const [name, value] of Object.entries(headers)) {
    setHeader(res, name, value);
  }
  res.statusCode = statusCode;
  res.end(buffer);
}

function routeUrl(req) {
  return new URL(req.url ?? "/", "http://localhost");
}

async function handleLogin(req, res) {
  const { username, password } = await readJsonBody(req);
  const { users, sessionSecret } = await getUserConfig();
  const user = users.find((item) => item.username === username);

  if (!user || !passwordMatches(user, String(password ?? ""))) {
    throw new HttpError(401, "用户名或密码错误");
  }

  const currentUser = publicUser(user);
  const token = signSession(
    {
      username: currentUser.username,
      exp: Date.now() + sessionMaxAgeSeconds * 1000
    },
    sessionSecret
  );

  setHeader(
    res,
    "Set-Cookie",
    serializeCookie(cookieName, token, req, { maxAge: sessionMaxAgeSeconds })
  );
  sendJson(res, 200, { user: currentUser });
}

async function handleLogout(req, res) {
  setHeader(
    res,
    "Set-Cookie",
    serializeCookie(cookieName, "", req, {
      maxAge: 0,
      expires: new Date(0)
    })
  );
  sendJson(res, 200, { ok: true });
}

async function handleSession(req, res) {
  const user = await authenticateRequest(req);
  if (!user) {
    throw new HttpError(401, "未登录");
  }
  sendJson(res, 200, { user });
}

async function handleGetProfile(req, res) {
  const user = await requireUser(req);
  const state = await loadSiteState();
  sendJson(res, 200, {
    user,
    profile: profileForUser(user, state)
  });
}

async function handlePatchProfile(req, res) {
  const user = await requireUser(req);
  const body = await readJsonBody(req);
  const state = await loadSiteState();
  const profile = sanitizeProfileBody(body, user, state);

  state.userProfiles[user.username] = profile;
  await writeSiteState(state);
  sendJson(res, 200, { profile });
}

async function handleChangePassword(req, res) {
  const user = await requireUser(req);
  const { currentPassword, newPassword } = await readJsonBody(req);
  const config = await getUserConfig();

  if (config.readOnly) {
    throw readonlyWriteError("用户密码");
  }

  const users = [...config.users];
  const index = users.findIndex((entry) => entry.username === user.username);
  if (index === -1) {
    throw new HttpError(404, "用户不存在");
  }
  if (!passwordMatches(users[index], String(currentPassword ?? ""))) {
    throw new HttpError(400, "当前密码不正确");
  }

  const password = String(newPassword ?? "");
  if (password.length < 8) {
    throw new HttpError(400, "新密码至少需要 8 位");
  }

  users[index] = {
    ...users[index],
    password
  };
  delete users[index].passwordSha256;
  await writeUsersConfig(config.writePath, {
    sessionSecret: config.sessionSecret,
    users
  });

  sendJson(res, 200, { ok: true });
}

async function handleGetResume(req, res) {
  const user = await requireUser(req);
  const state = await loadSiteState();
  const ownRequests = state.resumeRequests
    .filter((request) => request.username === user.username)
    .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)))
    .slice(0, 12)
    .map((request) => publicResumeRequest(request));

  sendJson(res, 200, {
    profile: state.resumes[user.username] ?? null,
    requests: ownRequests
  });
}

async function handleCreateResumeRequest(req, res) {
  const user = await requireUser(req);
  const body = await readJsonBody(req);
  const mode = body.mode === "link" ? "link" : "file";
  const title =
    String(body.title ?? "").trim() ||
    (mode === "link" ? "在线简历链接" : "简历文件");

  const request = {
    id: crypto.randomUUID(),
    username: user.username,
    displayName: user.displayName,
    mode,
    status: "pending",
    title,
    submittedAt: new Date().toISOString()
  };

  if (mode === "link") {
    request.url = sanitizeUrl(body.url);
  } else {
    const fileName = String(body.fileName ?? "").trim();
    const detectedType = validateResumeFileName(fileName);
    const fileType =
      body.fileType === "html" || body.fileType === "pdf" ? body.fileType : "markdown";
    if (fileType !== detectedType) {
      throw new HttpError(400, "文件扩展名与声明的文件类型不一致");
    }
    const content = String(body.content ?? "");
    validateResumeContent(content, fileType);
    request.fileType = fileType;
    request.fileName = fileName;
    request.content = content;
  }

  const state = await loadSiteState();
  state.resumeRequests.unshift(request);
  await writeSiteState(state);
  sendJson(res, 201, { request: publicResumeRequest(request) });
}

async function handleKnowledgeBases(req, res, method) {
  const user = await requireUser(req);
  const state = await loadSiteState();

  if (method === "GET") {
    const ownRequests = state.knowledgeRequests
      .filter((request) => request.username === user.username)
      .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)))
      .slice(0, 20)
      .map((request) => publicKnowledgeRequest(request));
    const bases = await enrichKnowledgeBases(state.knowledgeBases);
    sendJson(res, 200, {
      bases,
      requests: ownRequests
    });
    return;
  }

  if (method !== "POST") {
    throw new HttpError(405, "不支持的知识库操作");
  }

  const body = await readJsonBody(req);
  const title = String(body.title ?? "").trim();
  if (!title) {
    throw new HttpError(400, "知识库名称不能为空");
  }
  if (title.length > 80) {
    throw new HttpError(400, "知识库名称不能超过 80 个字符");
  }

  const now = new Date().toISOString();
  const slug = safePathSegment(body.slug ?? title);
  const ownerSlug = safePathSegment(user.username, "user");
  let id = `${ownerSlug}-${slug}`;
  let index = 2;
  while (state.knowledgeBases.some((base) => base.id === id)) {
    id = `${ownerSlug}-${slug}-${index}`;
    index += 1;
  }

  const base = {
    id,
    ownerUsername: user.username,
    ownerDisplayName: user.displayName,
    title,
    description: String(body.description ?? "").trim().slice(0, 240),
    rootPath: `knowledge-planet/${ownerSlug}/${slug}`,
    createdAt: now,
    updatedAt: now
  };

  state.knowledgeBases.push(base);
  await ensureKnowledgeRoot(base);
  await writeSiteState(state);
  const bases = await enrichKnowledgeBases(state.knowledgeBases);
  sendJson(res, 201, {
    base,
    bases
  });
}

async function handleKnowledgeUpload(req, res) {
  const user = await requireUser(req);
  const body = await readJsonBody(req);
  const state = await loadSiteState();
  const base = findKnowledgeBase(state, String(body.baseId ?? ""));
  const type = body.type === "folder" ? "folder" : "document";
  const targetFolder =
    type === "folder"
      ? normalizeKnowledgeFolder(body.folderPath)
      : normalizeKnowledgeFolder(body.targetFolder);

  if (type === "folder") {
    if (!targetFolder) {
      throw new HttpError(400, "请填写要创建的文件夹路径");
    }
  } else {
    validateMarkdownFileName(body.fileName);
    validateMarkdownContent(body.content);
  }

  const now = new Date().toISOString();

  if (type === "folder") {
    const result = await createKnowledgeFolder(base, targetFolder);
    base.updatedAt = now;
    await writeSiteState(state);
    sendJson(res, 201, {
      status: "approved",
      path: result.path,
      base
    });
    return;
  }

  if (user.role === "admin") {
    let result;
    result = await writeKnowledgeDocument(base, targetFolder, body.fileName, body.content);
    base.updatedAt = now;
    await writeSiteState(state);
    sendJson(res, 201, {
      status: "approved",
      path: result.path,
      base
    });
    return;
  }

  const request = {
    id: crypto.randomUUID(),
    type,
    status: "pending",
    baseId: base.id,
    baseTitle: base.title,
    username: user.username,
    displayName: user.displayName,
    targetFolder,
    submittedAt: now
  };

  request.title = String(body.title ?? "").trim().slice(0, 100);
  request.fileName = validateMarkdownFileName(body.fileName);
  request.content = validateMarkdownContent(body.content);

  state.knowledgeRequests.unshift(request);
  await writeSiteState(state);
  sendJson(res, 201, {
    status: "pending",
    request: publicKnowledgeRequest(request)
  });
}

async function handleAdminUsers(req, res, method) {
  const admin = await requireAdmin(req);
  const config = await getUserConfig();

  if (method === "GET") {
    sendJson(res, 200, {
      users: config.users.map(adminUser),
      source: config.source,
      readOnly: config.readOnly
    });
    return;
  }

  if (config.readOnly) {
    throw readonlyWriteError("用户配置");
  }

  const body = await readJsonBody(req);
  const users = [...config.users];

  if (method === "POST") {
    const username = cleanUsername(body.username);
    if (!username) {
      throw new HttpError(400, "用户名不能为空");
    }
    if (users.some((user) => user.username === username)) {
      throw new HttpError(409, "用户名已存在");
    }
    if (!String(body.password ?? "").trim()) {
      throw new HttpError(400, "新用户必须设置密码");
    }

    users.push({
      username,
      password: String(body.password),
      displayName: cleanDisplayName(body.displayName, username),
      role: normalizeRole(body.role),
      priority: parsePriority(body.priority, normalizeRole(body.role) === "admin" ? 100 : 10)
    });
  } else if (method === "PATCH") {
    const username = cleanUsername(body.username);
    const index = users.findIndex((user) => user.username === username);
    if (index === -1) {
      throw new HttpError(404, "用户不存在");
    }

    const current = users[index];
    const nextRole = normalizeRole(body.role ?? current.role);
    const next = {
      ...current,
      displayName: cleanDisplayName(body.displayName, current.displayName ?? current.username),
      role: nextRole,
      priority: parsePriority(body.priority, current.priority ?? (nextRole === "admin" ? 100 : 10))
    };

    if (String(body.password ?? "").trim()) {
      next.password = String(body.password);
      delete next.passwordSha256;
    }

    users[index] = next;
  } else if (method === "DELETE") {
    const username = cleanUsername(body.username);
    if (username === admin.username) {
      throw new HttpError(400, "不能删除当前登录的管理员账号");
    }
    const nextUsers = users.filter((user) => user.username !== username);
    if (nextUsers.length === users.length) {
      throw new HttpError(404, "用户不存在");
    }
    users.length = 0;
    users.push(...nextUsers);
  } else {
    throw new HttpError(405, "不支持的用户管理操作");
  }

  await writeUsersConfig(config.writePath, {
    sessionSecret: config.sessionSecret,
    users
  });
  sendJson(res, 200, {
    users: users.map(adminUser),
    source: path.relative(repoRoot, config.writePath)
  });
}

async function handleAdminResumeRequests(req, res, method) {
  const admin = await requireAdmin(req);
  const state = await loadSiteState();

  if (method === "GET") {
    sendJson(res, 200, {
      requests: state.resumeRequests
        .slice()
        .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)))
        .map((request) => publicResumeRequest(request, true)),
      profiles: state.resumes
    });
    return;
  }

  if (method !== "PATCH") {
    throw new HttpError(405, "不支持的审核操作");
  }

  const body = await readJsonBody(req);
  const request = state.resumeRequests.find((item) => item.id === body.id);
  if (!request) {
    throw new HttpError(404, "审核记录不存在");
  }

  const action = body.action === "approve" ? "approve" : "reject";
  const now = new Date().toISOString();
  request.status = action === "approve" ? "approved" : "rejected";
  request.reviewedAt = now;
  request.reviewedBy = admin.username;
  request.comment = String(body.comment ?? "").trim();

  if (action === "approve") {
    if (request.mode === "link") {
      state.resumes[request.username] = {
        type: "link",
        title: request.title,
        url: request.url,
        updatedAt: now,
        reviewedBy: admin.username
      };
    } else {
      state.resumes[request.username] = {
        type:
          request.fileType === "html" || request.fileType === "pdf"
            ? request.fileType
            : "markdown",
        title: request.title,
        fileName: request.fileName ?? "resume",
        content: request.content ?? "",
        updatedAt: now,
        reviewedBy: admin.username
      };
    }
  }

  await writeSiteState(state);
  sendJson(res, 200, {
    request: publicResumeRequest(request, true),
    profile: state.resumes[request.username] ?? null
  });
}

async function handleAdminKnowledgeRequests(req, res, method) {
  const admin = await requireAdmin(req);
  const state = await loadSiteState();

  if (method === "GET") {
    const bases = await enrichKnowledgeBases(state.knowledgeBases);
    sendJson(res, 200, {
      requests: state.knowledgeRequests
        .slice()
        .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)))
        .map((request) => publicKnowledgeRequest(request, true)),
      bases
    });
    return;
  }

  if (method !== "PATCH") {
    throw new HttpError(405, "不支持的知识库审核操作");
  }

  const body = await readJsonBody(req);
  const request = state.knowledgeRequests.find((item) => item.id === body.id);
  if (!request) {
    throw new HttpError(404, "知识库审核记录不存在");
  }
  if (request.status !== "pending") {
    throw new HttpError(409, "该审核记录已经处理过");
  }

  const action = body.action === "approve" ? "approve" : "reject";
  const now = new Date().toISOString();
  request.status = action === "approve" ? "approved" : "rejected";
  request.reviewedAt = now;
  request.reviewedBy = admin.username;
  request.comment = String(body.comment ?? "").trim();

  if (action === "approve") {
    const base = findKnowledgeBase(state, request.baseId);
    if (request.type === "folder") {
      await createKnowledgeFolder(base, request.targetFolder);
    } else {
      await writeKnowledgeDocument(
        base,
        request.targetFolder,
        request.fileName,
        request.content
      );
    }
    base.updatedAt = now;
  }

  await writeSiteState(state);
  const bases = await enrichKnowledgeBases(state.knowledgeBases);
  sendJson(res, 200, {
    request: publicKnowledgeRequest(request, true),
    bases
  });
}

async function handleIndex(req, res) {
  const user = await requireUser(req);
  const index = await buildNotesIndex();
  sendJson(res, 200, {
    ...index,
    user
  });
}

async function handleGetNote(req, res, url) {
  await requireUser(req);
  const notePath = url.searchParams.get("path");
  const { normalized, absolute } = resolveContentPath(notePath);

  if (!normalized.toLowerCase().endsWith(".md")) {
    throw new HttpError(400, "只能读取 Markdown 文件");
  }

  const content = await fs.readFile(absolute, "utf8").catch((error) => {
    if (error.code === "ENOENT") {
      throw new HttpError(404, "文档不存在");
    }
    throw error;
  });

  sendText(res, 200, content, {
    "Cache-Control": "private, max-age=0, must-revalidate"
  });
}

async function handlePutNote(req, res, url) {
  const user = await requireUser(req);
  if (!user.canEdit) {
    throw new HttpError(403, "当前用户没有编辑权限");
  }

  const notePath = url.searchParams.get("path");
  const { normalized, absolute } = resolveContentPath(notePath);
  if (!normalized.toLowerCase().endsWith(".md")) {
    throw new HttpError(400, "只能保存 Markdown 文件");
  }

  const { content } = await readJsonBody(req);
  if (typeof content !== "string") {
    throw new HttpError(400, "缺少 Markdown 内容");
  }

  await fs.writeFile(absolute, content, "utf8").catch((error) => {
    if (error.code === "EROFS" || error.code === "EPERM") {
      throw new HttpError(
        409,
        "当前部署环境不支持持久写入，请在本地或接入 GitHub API 后编辑"
      );
    }
    throw error;
  });

  const stat = await fs.stat(absolute);
  const title = readTitle(content, path.basename(normalized));
  sendJson(res, 200, {
    ok: true,
    file: {
      type: "file",
      name: path.basename(normalized),
      title,
      path: normalized,
      excerpt: excerpt(content),
      searchText: toSearchText(`${title} ${normalized} ${content}`),
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
      hidden: normalized.split("/").includes("assets")
    }
  });
}

async function handleAsset(req, res, url) {
  await requireUser(req);
  const assetPath = url.searchParams.get("path");
  const { absolute } = resolveContentPath(assetPath);
  const stat = await fs.stat(absolute).catch((error) => {
    if (error.code === "ENOENT") {
      throw new HttpError(404, "资源不存在");
    }
    throw error;
  });

  if (!stat.isFile()) {
    throw new HttpError(404, "资源不存在");
  }

  const buffer = await fs.readFile(absolute);
  const extension = path.extname(absolute).toLowerCase();
  sendBuffer(res, 200, buffer, {
    "Content-Type": mimeTypes.get(extension) ?? "application/octet-stream",
    "Cache-Control": "private, max-age=300"
  });
}

export async function handleApiRequest(req, res) {
  const url = routeUrl(req);
  const method = String(req.method ?? "GET").toUpperCase();

  try {
    if (url.pathname === "/api/login" && method === "POST") {
      await handleLogin(req, res);
      return;
    }
    if (url.pathname === "/api/logout" && method === "POST") {
      await handleLogout(req, res);
      return;
    }
    if (url.pathname === "/api/session" && method === "GET") {
      await handleSession(req, res);
      return;
    }
    if (url.pathname === "/api/profile" && method === "GET") {
      await handleGetProfile(req, res);
      return;
    }
    if (url.pathname === "/api/profile" && method === "PATCH") {
      await handlePatchProfile(req, res);
      return;
    }
    if (url.pathname === "/api/profile-password" && method === "PATCH") {
      await handleChangePassword(req, res);
      return;
    }
    if (url.pathname === "/api/resume" && method === "GET") {
      await handleGetResume(req, res);
      return;
    }
    if (url.pathname === "/api/resume-requests" && method === "POST") {
      await handleCreateResumeRequest(req, res);
      return;
    }
    if (url.pathname === "/api/knowledge-bases") {
      await handleKnowledgeBases(req, res, method);
      return;
    }
    if (url.pathname === "/api/knowledge-upload" && method === "POST") {
      await handleKnowledgeUpload(req, res);
      return;
    }
    if (url.pathname === "/api/admin/users") {
      await handleAdminUsers(req, res, method);
      return;
    }
    if (url.pathname === "/api/admin/resume-requests") {
      await handleAdminResumeRequests(req, res, method);
      return;
    }
    if (url.pathname === "/api/admin/knowledge-requests") {
      await handleAdminKnowledgeRequests(req, res, method);
      return;
    }
    if (url.pathname === "/api/notes-index" && method === "GET") {
      await handleIndex(req, res);
      return;
    }
    if (url.pathname === "/api/note" && method === "GET") {
      await handleGetNote(req, res, url);
      return;
    }
    if (url.pathname === "/api/note" && method === "PUT") {
      await handlePutNote(req, res, url);
      return;
    }
    if (url.pathname === "/api/asset" && method === "GET") {
      await handleAsset(req, res, url);
      return;
    }

    throw new HttpError(404, "API 不存在");
  } catch (error) {
    const statusCode = error.statusCode ?? 500;
    sendJson(res, statusCode, {
      error:
        statusCode === 500
          ? "服务器内部错误"
          : error.message ?? "请求失败"
    });
  }
}
