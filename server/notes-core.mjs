import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contentRoot = path.resolve(
  repoRoot,
  process.env.NOTES_CONTENT_ROOT ?? "content"
);
const cookieName = "valentin_session";
const sessionMaxAgeSeconds = 60 * 60 * 24 * 7;

const collator = new Intl.Collator("zh-CN", {
  numeric: true,
  sensitivity: "base"
});

const hiddenDirectoryNames = new Set(["assets"]);
const folderTitleMap = new Map([
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
        (file) => file.path.toLowerCase() === "codex-desktop-guide/readme.md"
      )?.path ??
      visibleFiles.find(
        (file) =>
          file.path.toLowerCase().endsWith("/readme.md") &&
          file.path.split("/").length === 2
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
      source: "VALENTIN_USERS_JSON"
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
    source: path.relative(repoRoot, configPath)
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
    source: config.source
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
  return user ? publicUser(user) : null;
}

async function requireUser(req) {
  const user = await authenticateRequest(req);
  if (!user) {
    throw new HttpError(401, "请先登录");
  }
  return user;
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
