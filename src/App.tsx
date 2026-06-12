import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, MouseEvent } from "react";
import {
  Ban,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  ClipboardList,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  FileCheck,
  FileText,
  Folder,
  Home,
  LayoutDashboard,
  Link2,
  ListTodo,
  LogOut,
  Menu,
  Moon,
  Palette,
  Plus,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  SunMedium,
  Trash2,
  Upload,
  User,
  UserCircle,
  Users,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { renderMarkdown } from "./markdown";
import { formatBytes, noteUrl, pageRoute, parseRoute, routeFor } from "./path-utils";
import type {
  AdminUser,
  AuthUser,
  Heading,
  KnowledgeBase,
  KnowledgeRequest,
  NoteFile,
  NoteFolder,
  NoteNode,
  NotesIndex,
  ResumeFileType,
  ResumeProfile,
  ResumeRequest,
  TodoItem,
  TodoScope,
  UserProfile,
  UserRole
} from "./types";

type NotesIndexPayload = NotesIndex & {
  user?: AuthUser;
};

type ViewName = "home" | "notes" | "resume" | "todo" | "planet" | "admin";
type SiteTheme = "clean" | "night" | "sunrise";
type MarkdownTheme = "classic" | "paper" | "compact" | "serif";

type PlanetDirectoryFileNode = {
  type: "file";
  name: string;
  path: string;
  title: string;
  file: NoteFile;
};

type PlanetDirectoryFolderNode = {
  type: "folder";
  name: string;
  path: string;
  title: string;
  children: PlanetDirectoryNode[];
};

type PlanetDirectoryNode = PlanetDirectoryFileNode | PlanetDirectoryFolderNode;

type ResumePayload = {
  profile: ResumeProfile | null;
  requests: ResumeRequest[];
};

type AdminUsersPayload = {
  users: AdminUser[];
  source: string;
  readOnly?: boolean;
};

type AdminResumePayload = {
  requests: ResumeRequest[];
  profiles: Record<string, ResumeProfile>;
};

type ProfilePayload = {
  user: AuthUser;
  profile: UserProfile;
};

type KnowledgePayload = {
  bases: KnowledgeBase[];
  requests: KnowledgeRequest[];
};

type AdminKnowledgePayload = {
  bases: KnowledgeBase[];
  requests: KnowledgeRequest[];
};

const siteThemes: Array<{ id: SiteTheme; label: string; icon: LucideIcon }> = [
  { id: "clean", label: "清爽", icon: SunMedium },
  { id: "night", label: "夜间", icon: Moon },
  { id: "sunrise", label: "暖光", icon: Sparkles }
];

const markdownThemes: Array<{ id: MarkdownTheme; label: string }> = [
  { id: "classic", label: "经典阅读" },
  { id: "paper", label: "纸张排版" },
  { id: "compact", label: "紧凑扫描" },
  { id: "serif", label: "长文衬线" }
];

const todoScopes: Array<{
  id: TodoScope;
  title: string;
  shortTitle: string;
  addLabel: string;
  icon: LucideIcon;
}> = [
  { id: "day", title: "日视图", shortTitle: "日", addLabel: "今日事项", icon: SunMedium },
  { id: "week", title: "周视图", shortTitle: "周", addLabel: "本周事项", icon: CalendarDays },
  { id: "month", title: "月视图", shortTitle: "月", addLabel: "本月事项", icon: ClipboardList }
];

const resumeMaxBytes = 4 * 1024 * 1024;
const knowledgeMarkdownMaxBytes = 2 * 1024 * 1024;
const avatarMaxBytes = 512 * 1024;
const htmlExtensions = new Set(["html", "htm"]);
const markdownExtensions = new Set(["md", "markdown"]);
const avatarMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

function findFile(files: NoteFile[], path: string) {
  return files.find((file) => file.path === path);
}

function isFolderActive(folder: NoteFolder, currentPath: string) {
  return currentPath.startsWith(`${folder.path}/`);
}

function normalizeView(view: string, path: string): { view: ViewName; path: string } {
  if (
    view === "notes" ||
    view === "resume" ||
    view === "todo" ||
    view === "planet" ||
    view === "admin" ||
    view === "home"
  ) {
    return { view, path };
  }
  if (!view) {
    return { view: "home", path: "" };
  }
  return { view: "notes", path };
}

function searchTerms(query: string) {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function searchSnippet(file: NoteFile, terms: string[]) {
  if (terms.length === 0) {
    return file.excerpt;
  }

  const hitIndex = terms.reduce((best, term) => {
    const index = file.searchText.indexOf(term);
    if (index === -1) {
      return best;
    }
    return Math.min(best, index);
  }, Number.POSITIVE_INFINITY);

  if (!Number.isFinite(hitIndex)) {
    return file.excerpt;
  }

  const start = Math.max(0, hitIndex - 42);
  const end = Math.min(file.searchText.length, hitIndex + 118);
  const prefix = start > 0 ? "... " : "";
  const suffix = end < file.searchText.length ? " ..." : "";

  return `${prefix}${file.searchText.slice(start, end)}${suffix}`;
}

async function readApiError(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? `请求失败：${response.status}`;
  } catch {
    return `请求失败：${response.status}`;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers
    }
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return response.json() as Promise<T>;
}

function randomId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function endOfWeek(date = new Date()) {
  const result = new Date(date);
  const day = result.getDay() || 7;
  result.setDate(result.getDate() + (7 - day));
  return result;
}

function startOfWeek(date = new Date()) {
  const result = new Date(date);
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - (day - 1));
  return result;
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function defaultDueDate(scope: TodoScope) {
  if (scope === "week") {
    return toIsoDate(endOfWeek());
  }
  if (scope === "month") {
    return toIsoDate(endOfMonth());
  }
  return toIsoDate(new Date());
}

function todoRange(scope: TodoScope) {
  const today = new Date();
  const start =
    scope === "month" ? startOfMonth(today) : scope === "week" ? startOfWeek(today) : today;
  const end =
    scope === "month" ? endOfMonth(today) : scope === "week" ? endOfWeek(today) : today;
  const startIso = toIsoDate(start);
  const endIso = toIsoDate(end);
  const label =
    startIso === endIso ? formatDate(startIso) : `${formatDate(startIso)} - ${formatDate(endIso)}`;
  return { startIso, endIso, label };
}

function isDateInRange(value: string, startIso: string, endIso: string) {
  return value >= startIso && value <= endIso;
}

function formatDateTime(value?: string | number) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatDate(value?: string) {
  if (!value) {
    return "";
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  }).format(date);
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function calendarCells(scope: TodoScope) {
  const todayIso = toIsoDate(new Date());
  const current = new Date();
  const periodStart = scope === "month" ? startOfMonth(current) : startOfWeek(current);
  const periodEnd = scope === "month" ? endOfMonth(current) : endOfWeek(current);
  const gridStart = scope === "month" ? startOfWeek(periodStart) : periodStart;
  const gridEnd = scope === "month" ? endOfWeek(periodEnd) : periodEnd;
  const cells: Array<{ iso: string; day: number; inPeriod: boolean; today: boolean }> = [];

  for (let date = gridStart; date <= gridEnd; date = addDays(date, 1)) {
    const iso = toIsoDate(date);
    cells.push({
      iso,
      day: date.getDate(),
      inPeriod: iso >= toIsoDate(periodStart) && iso <= toIsoDate(periodEnd),
      today: iso === todayIso
    });
  }

  return cells;
}

const weekDayLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function fileExtension(fileName: string) {
  return fileName.toLowerCase().split(".").pop() ?? "";
}

function validateResumeFileName(fileName: string) {
  const name = fileName.trim();
  if (!name) {
    throw new Error("请选择要上传的简历文件");
  }
  if (/[\\/]/.test(name)) {
    throw new Error("文件名不能包含路径分隔符");
  }
  if (name.length > 120) {
    throw new Error("文件名过长，请控制在 120 个字符内");
  }
  const extension = fileExtension(name);
  if (htmlExtensions.has(extension)) {
    return "html";
  }
  if (markdownExtensions.has(extension)) {
    return "markdown";
  }
  if (extension === "pdf") {
    return "pdf";
  }
  throw new Error("只支持 .html、.htm、.md、.markdown、.pdf 格式的简历文件");
}

function validateResumeMime(file: File, fileType: ResumeFileType) {
  if (!file.type) {
    return;
  }
  const normalized = file.type.toLowerCase();
  const validHtml = ["text/html", "application/xhtml+xml"].includes(normalized);
  const validMarkdown = [
    "text/markdown",
    "text/x-markdown",
    "text/plain",
    "application/octet-stream"
  ].includes(normalized);
  const validPdf = normalized === "application/pdf";

  if (fileType === "html" && !validHtml) {
    throw new Error("HTML 简历文件的 MIME 类型不正确");
  }
  if (fileType === "markdown" && !validMarkdown) {
    throw new Error("Markdown 简历文件的 MIME 类型不正确");
  }
  if (fileType === "pdf" && !validPdf) {
    throw new Error("PDF 简历文件的 MIME 类型不正确");
  }
}

function validateResumeContent(content: string, fileType: ResumeFileType) {
  if (fileType === "pdf") {
    validatePdfDataUrl(content);
    return;
  }
  if (!content.trim()) {
    throw new Error("简历文件内容为空");
  }
  if (content.includes("\u0000")) {
    throw new Error("简历文件必须是文本文件，不能包含二进制内容");
  }
  if (new Blob([content]).size > resumeMaxBytes) {
    throw new Error("简历文件不能超过 4MB");
  }
  if (fileType === "html" && !/(<!doctype\s+html|<html[\s>]|<body[\s>]|<[a-z][\w:-]*(\s|>))/i.test(content)) {
    throw new Error("HTML 简历文件内容不符合 HTML 格式");
  }
}

function parseDataUrl(value: string, expectedTypes: Set<string>, label: string) {
  const match = value.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) {
    throw new Error(`${label}必须是 base64 data URL`);
  }
  const mimeType = match[1].toLowerCase();
  if (!expectedTypes.has(mimeType)) {
    throw new Error(`${label}MIME 类型不正确`);
  }
  const raw = atob(match[2].replace(/\s/g, ""));
  return { mimeType, raw };
}

function validatePdfDataUrl(value: string) {
  const { raw } = parseDataUrl(value, new Set(["application/pdf"]), "PDF 简历文件");
  if (!raw) {
    throw new Error("PDF 简历文件内容为空");
  }
  if (raw.length > resumeMaxBytes) {
    throw new Error("PDF 简历文件不能超过 4MB");
  }
  if (raw.slice(0, 5) !== "%PDF-") {
    throw new Error("PDF 简历文件头不正确");
  }
}

function validateAvatarDataUrl(value: string) {
  if (!value) {
    return "";
  }
  const { raw } = parseDataUrl(value, avatarMimeTypes, "头像文件");
  if (raw.length > avatarMaxBytes) {
    throw new Error("头像文件不能超过 512KB");
  }
  return value;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

function migrateTodoItem(item: Partial<TodoItem>): TodoItem | null {
  const text = String(item.text ?? "").trim();
  if (!text) {
    return null;
  }
  const scope: TodoScope =
    item.scope === "week" || item.scope === "month" || item.scope === "day"
      ? item.scope
      : "day";

  return {
    id: String(item.id ?? randomId()),
    text,
    note: String(item.note ?? ""),
    done: Boolean(item.done),
    createdAt: Number(item.createdAt ?? Date.now()),
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(item.dueDate ?? ""))
      ? String(item.dueDate)
      : defaultDueDate(scope),
    scope
  };
}

function readTodoItems(username: string) {
  try {
    const raw = JSON.parse(localStorage.getItem(`valentin.todos.${username}`) ?? "[]");
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.map(migrateTodoItem).filter((item): item is TodoItem => Boolean(item));
  } catch {
    return [];
  }
}

function roleLabel(role: UserRole) {
  return role === "admin" ? "管理员" : "查看用户";
}

function reviewStatusLabel(status: "pending" | "approved" | "rejected") {
  if (status === "pending") {
    return "待审核";
  }
  return status === "approved" ? "已通过" : "已拒绝";
}

function isReadonlyStateError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /不可写|Vercel|持久|read.?only|EROFS|EPERM/i.test(message);
}

function localResumeKey(username: string) {
  return `valentin.resumeRequests.local.${username}`;
}

function readLocalResumeRequests(username: string) {
  try {
    const raw = JSON.parse(localStorage.getItem(localResumeKey(username)) ?? "[]");
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw
      .map((item): ResumeRequest | null => {
        const title = String(item.title ?? "").trim();
        if (!title) {
          return null;
        }
        return {
          id: String(item.id ?? `local-${randomId()}`),
          username,
          displayName: String(item.displayName ?? username),
          mode: item.mode === "link" ? "link" : "file",
          status: "pending",
          title,
          submittedAt: String(item.submittedAt ?? new Date().toISOString()),
          comment: "local-only",
          fileName: item.fileName ? String(item.fileName) : undefined,
          fileType:
            item.fileType === "html" || item.fileType === "pdf"
              ? item.fileType
              : item.fileType === "markdown"
                ? "markdown"
                : undefined,
          url: item.url ? String(item.url) : undefined
        };
      })
      .filter((item): item is ResumeRequest => Boolean(item));
  } catch {
    return [];
  }
}

function saveLocalResumeRequest(username: string, request: ResumeRequest) {
  const records = readLocalResumeRequests(username).filter((item) => item.id !== request.id);
  localStorage.setItem(localResumeKey(username), JSON.stringify([request, ...records].slice(0, 20)));
}

function requestTypeLabel(type: "folder" | "document") {
  return type === "folder" ? "文件夹" : "Markdown 文档";
}

function normalizeClientFolder(value: string) {
  const raw = value.replace(/\\/g, "/").trim();
  if (!raw) {
    return "";
  }
  const segments = raw.split("/").filter((segment) => segment && segment !== ".");
  const stack: string[] = [];
  for (const segment of segments) {
    if (segment === "..") {
      stack.pop();
      continue;
    }
    if (segment.startsWith(".") || segment.length > 80 || /[<>:"|?*\u0000-\u001f]/.test(segment)) {
      throw new Error("文件夹路径格式不合规");
    }
    stack.push(segment);
  }
  return stack.join("/");
}

function validateKnowledgeMarkdownName(fileName: string) {
  const name = fileName.trim();
  if (!name) {
    throw new Error("请填写 Markdown 文件名");
  }
  if (name.length > 120 || name.startsWith(".") || /[\\/<>:"|?*\u0000-\u001f]/.test(name)) {
    throw new Error("Markdown 文件名格式不合规");
  }
  const extension = fileExtension(name);
  if (!markdownExtensions.has(extension)) {
    throw new Error("知识库文档只支持 .md 或 .markdown 格式");
  }
  return name;
}

function validateKnowledgeMarkdownContent(content: string) {
  if (!content.trim()) {
    throw new Error("Markdown 内容不能为空");
  }
  if (content.includes("\u0000")) {
    throw new Error("Markdown 内容不能包含二进制字符");
  }
  if (new Blob([content]).size > knowledgeMarkdownMaxBytes) {
    throw new Error("Markdown 文档不能超过 2MB");
  }
  return content;
}

function TreeNode({
  node,
  activePath,
  expanded,
  onToggle,
  onOpen
}: {
  node: NoteNode;
  activePath: string;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
}) {
  if (node.type === "file") {
    const active = node.path === activePath;
    return (
      <button
        className={`tree-row file-row ${active ? "active" : ""}`}
        onClick={() => onOpen(node.path)}
        title={node.path}
      >
        <FileText size={15} />
        <span>{node.title}</span>
      </button>
    );
  }

  const open = expanded.has(node.path) || isFolderActive(node, activePath);

  return (
    <div className="tree-folder">
      <button
        className={`tree-row folder-row ${open ? "open" : ""}`}
        onClick={() => onToggle(node.path)}
        title={node.path}
      >
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <Folder size={15} />
        <span>{node.title}</span>
      </button>
      {open ? (
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              activePath={activePath}
              expanded={expanded}
              onToggle={onToggle}
              onOpen={onOpen}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function sortPlanetDirectoryNodes(a: PlanetDirectoryNode, b: PlanetDirectoryNode) {
  if (a.type !== b.type) {
    return a.type === "folder" ? -1 : 1;
  }
  return a.title.localeCompare(b.title, "zh-CN");
}

function buildPlanetDirectoryTree(base: KnowledgeBase, files: NoteFile[]): PlanetDirectoryNode[] {
  type MutableFolderNode = PlanetDirectoryFolderNode & {
    childFolders: Map<string, MutableFolderNode>;
  };

  function createFolder(name: string, path: string): MutableFolderNode {
    return {
      type: "folder",
      name,
      path,
      title: name,
      children: [],
      childFolders: new Map()
    };
  }

  const root = createFolder("", "");
  const folderMap = new Map<string, MutableFolderNode>([["", root]]);

  function ensureFolder(folderPath: string) {
    const parts = folderPath.split("/").filter(Boolean);
    let currentPath = "";
    let parent = root;

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      let folder = folderMap.get(currentPath);
      if (!folder) {
        folder = createFolder(part, currentPath);
        folderMap.set(currentPath, folder);
        parent.childFolders.set(part, folder);
        parent.children.push(folder);
      }
      parent = folder;
    }

    return parent;
  }

  for (const folder of base.folders ?? []) {
    ensureFolder(folder);
  }

  const prefix = `${base.rootPath}/`;
  for (const file of files) {
    const relativePath = file.path.startsWith(prefix) ? file.path.slice(prefix.length) : file.name;
    const parts = relativePath.split("/").filter(Boolean);
    const fileName = parts.pop() ?? file.name;
    const parent = ensureFolder(parts.join("/"));
    parent.children.push({
      type: "file",
      name: fileName,
      path: file.path,
      title: file.title,
      file
    });
  }

  function finalize(node: MutableFolderNode): PlanetDirectoryFolderNode {
    return {
      type: "folder",
      name: node.name,
      path: node.path,
      title: node.title,
      children: node.children
        .map((child) => (child.type === "folder" ? finalize(child as MutableFolderNode) : child))
        .sort(sortPlanetDirectoryNodes)
    };
  }

  return finalize(root).children;
}

function selectedPlanetFolderPaths(base: KnowledgeBase | null, selectedDocPath: string) {
  if (!base || !selectedDocPath.startsWith(`${base.rootPath}/`)) {
    return [];
  }
  const relativePath = selectedDocPath.slice(`${base.rootPath}/`.length);
  const parts = relativePath.split("/").filter(Boolean);
  parts.pop();

  const paths: string[] = [];
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    paths.push(current);
  }
  return paths;
}

function PlanetDirectoryNodeView({
  node,
  selectedDocPath,
  expandedFolders,
  onToggleFolder,
  onOpenFile
}: {
  node: PlanetDirectoryNode;
  selectedDocPath: string;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onOpenFile: (path: string) => void;
}) {
  if (node.type === "file") {
    const active = node.path === selectedDocPath;
    return (
      <button
        className={`planet-directory-row file ${active ? "active" : ""}`}
        onClick={() => onOpenFile(node.path)}
        title={node.path}
        type="button"
      >
        <FileText size={14} />
        <span>{node.title}</span>
      </button>
    );
  }

  const open = expandedFolders.has(node.path);

  return (
    <div className="planet-directory-node">
      <button
        aria-expanded={open}
        className={`planet-directory-row folder ${open ? "open" : ""}`}
        onClick={() => onToggleFolder(node.path)}
        title={node.path}
        type="button"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Folder size={14} />
        <span>{node.title}</span>
      </button>
      {open ? (
        <div className="planet-directory-children">
          {node.children.length === 0 ? (
            <span className="planet-directory-empty">暂无文档</span>
          ) : (
            node.children.map((child) => (
              <PlanetDirectoryNodeView
                key={child.path}
                node={child}
                selectedDocPath={selectedDocPath}
                expandedFolders={expandedFolders}
                onToggleFolder={onToggleFolder}
                onOpenFile={onOpenFile}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function SearchResults({
  results,
  terms,
  onOpen
}: {
  results: NoteFile[];
  terms: string[];
  onOpen: (path: string) => void;
}) {
  if (results.length === 0) {
    return <div className="empty-state">没有匹配的 Markdown 文档</div>;
  }

  return (
    <div className="search-results">
      {results.map((file) => (
        <button
          key={file.path}
          className="search-result"
          onClick={() => onOpen(file.path)}
        >
          <span>{file.title}</span>
          <small>{file.path}</small>
          <em>{searchSnippet(file, terms)}</em>
        </button>
      ))}
    </div>
  );
}

function TableOfContents({
  headings,
  activePath
}: {
  headings: Heading[];
  activePath: string;
}) {
  if (headings.length === 0) {
    return <div className="toc-empty">当前文档没有标题层级</div>;
  }

  return (
    <nav className="toc-list" aria-label="当前文档目录">
      {headings.map((heading) => (
        <a
          key={heading.id}
          className={`toc-item level-${heading.level}`}
          href={`#${heading.id}`}
          onClick={(event) => {
            event.preventDefault();
            document.getElementById(heading.id)?.scrollIntoView({
              behavior: "smooth",
              block: "start"
            });
            history.replaceState(null, "", routeFor(activePath, `#${heading.id}`));
          }}
        >
          {heading.text}
        </a>
      ))}
    </nav>
  );
}

function LoginScreen({
  onLogin
}: {
  onLogin: (user: AuthUser) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const payload = await requestJson<{ user: AuthUser }>("/api/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });
      onLogin(payload.user);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-mark">
          <ShieldCheck size={28} />
        </div>
        <p className="auth-eyebrow">Valentin 的个人网站</p>
        <h1>访问受保护内容</h1>
        <p className="auth-copy">
          登录后进入个人工作台，选择文档、简历、Todo 或管理平台。
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            用户名
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="请输入用户名"
            />
          </label>
          <label>
            密码
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
            />
          </label>
          {error ? <div className="form-error">{error}</div> : null}
          <button className="primary-button" disabled={submitting}>
            {submitting ? "正在登录..." : "登录"}
          </button>
        </form>
      </section>
    </main>
  );
}

function ComponentCard({
  icon: Icon,
  title,
  meta,
  body,
  onOpen
}: {
  icon: LucideIcon;
  title: string;
  meta: string;
  body: string;
  onOpen: () => void;
}) {
  return (
    <button className="component-card" onClick={onOpen}>
      <span className="component-card-icon">
        <Icon size={20} />
      </span>
      <span className="component-card-title">{title}</span>
      <span className="component-card-meta">{meta}</span>
      <span className="component-card-body">{body}</span>
    </button>
  );
}

function HomeView({
  user,
  todoCount,
  onOpen
}: {
  user: AuthUser;
  todoCount: number;
  onOpen: (view: ViewName) => void;
}) {
  return (
    <section className="home-view">
      <div className="page-heading">
        <h1>{user.displayName} 的工作台</h1>
      </div>

      <div className="component-grid">
        <ComponentCard
          icon={BriefcaseBusiness}
          title="个人简历"
          meta="Profile"
          body="按账号展示简历，支持文件和审核后的外部链接。"
          onOpen={() => onOpen("resume")}
        />
        <ComponentCard
          icon={ListTodo}
          title="Todo List"
          meta={`${todoCount} 个待办`}
          body="按今日、本周、本月组织个人事项。"
          onOpen={() => onOpen("todo")}
        />
        <ComponentCard
          icon={Sparkles}
          title="知识星球"
          meta="Knowledge"
          body="按知识库沉淀 Markdown 文档，支持上传、建文件夹和审核流。"
          onOpen={() => onOpen("planet")}
        />
        {user.role === "admin" ? (
          <ComponentCard
            icon={ShieldCheck}
            title="管理平台"
            meta="Admin"
            body="管理用户、审核简历文件和跳转链接。"
            onOpen={() => onOpen("admin")}
          />
        ) : null}
      </div>
    </section>
  );
}

function KnowledgePlanetView({
  user,
  index,
  onOpenNote,
  onRefreshIndex,
  onBackHome,
  siteTheme,
  markdownTheme,
  onSiteThemeChange,
  onMarkdownThemeChange
}: {
  user: AuthUser;
  index: NotesIndex | null;
  onOpenNote: (path: string, hash?: string) => void;
  onRefreshIndex: () => Promise<NotesIndexPayload>;
  onBackHome: () => void;
  siteTheme: SiteTheme;
  markdownTheme: MarkdownTheme;
  onSiteThemeChange: (theme: SiteTheme) => void;
  onMarkdownThemeChange: (theme: MarkdownTheme) => void;
}) {
  const [bases, setBases] = useState<KnowledgeBase[]>([]);
  const [requests, setRequests] = useState<KnowledgeRequest[]>([]);
  const [selectedBaseId, setSelectedBaseId] = useState("");
  const [selectedDocPath, setSelectedDocPath] = useState("");
  const [selectedDocSource, setSelectedDocSource] = useState("");
  const [docLoading, setDocLoading] = useState(false);
  const [newBase, setNewBase] = useState({ title: "", description: "" });
  const [folderPath, setFolderPath] = useState("");
  const [docFolder, setDocFolder] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [docFileName, setDocFileName] = useState("");
  const [docContent, setDocContent] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [expandedPlanetFolders, setExpandedPlanetFolders] = useState<Set<string>>(new Set());

  async function loadKnowledge() {
    setLoading(true);
    try {
      const payload = await requestJson<KnowledgePayload>("/api/knowledge-bases");
      setBases(payload.bases);
      setRequests(payload.requests);
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "知识星球加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadKnowledge();
  }, []);

  useEffect(() => {
    if (bases.length === 0) {
      setSelectedBaseId("");
      return;
    }
    if (!selectedBaseId || !bases.some((base) => base.id === selectedBaseId)) {
      setSelectedBaseId(bases[0].id);
    }
  }, [bases, selectedBaseId]);

  const selectedBase = bases.find((base) => base.id === selectedBaseId) ?? null;
  const baseFiles = useMemo(() => {
    if (!selectedBase) {
      return [];
    }
    const prefix = `${selectedBase.rootPath}/`;
    return (index?.files ?? [])
      .filter((file) => !file.hidden && file.path.startsWith(prefix))
      .sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
  }, [index, selectedBase]);
  const selectedFile = baseFiles.find((file) => file.path === selectedDocPath) ?? null;
  const renderedDoc = useMemo(() => {
    if (!selectedDocPath) {
      return { html: "", headings: [] };
    }
    return renderMarkdown(selectedDocSource, selectedDocPath);
  }, [selectedDocPath, selectedDocSource]);

  const folderOptions = useMemo(() => {
    if (!selectedBase) {
      return [""];
    }
    const folders = new Set<string>(["", ...(selectedBase.folders ?? [])]);
    const prefix = `${selectedBase.rootPath}/`;
    for (const file of baseFiles) {
      const relative = file.path.slice(prefix.length);
      const parts = relative.split("/");
      parts.pop();
      let current = "";
      for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        folders.add(current);
      }
    }
    return [...folders].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [baseFiles, selectedBase]);
  const directoryTree = useMemo(() => {
    if (!selectedBase) {
      return [];
    }
    return buildPlanetDirectoryTree(selectedBase, baseFiles);
  }, [baseFiles, selectedBase]);

  useEffect(() => {
    if (baseFiles.length === 0) {
      setSelectedDocPath("");
      return;
    }
    if (!selectedDocPath || !baseFiles.some((file) => file.path === selectedDocPath)) {
      setSelectedDocPath(baseFiles[0].path);
    }
  }, [baseFiles, selectedDocPath]);

  useEffect(() => {
    setExpandedPlanetFolders(new Set());
  }, [selectedBaseId]);

  useEffect(() => {
    const parentFolders = selectedPlanetFolderPaths(selectedBase, selectedDocPath);
    if (parentFolders.length === 0) {
      return;
    }
    setExpandedPlanetFolders((current) => {
      const next = new Set(current);
      let changed = false;
      for (const folder of parentFolders) {
        if (!next.has(folder)) {
          next.add(folder);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [selectedBase, selectedDocPath]);

  useEffect(() => {
    if (!selectedDocPath) {
      setSelectedDocSource("");
      return;
    }
    setDocLoading(true);
    fetch(noteUrl(selectedDocPath))
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await readApiError(response));
        }
        return response.text();
      })
      .then((text) => {
        setSelectedDocSource(text);
      })
      .catch((error) => {
        setSelectedDocSource(`# 文档加载失败\n\n${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => setDocLoading(false));
  }, [selectedDocPath]);

  async function createBase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setSubmitting(true);
    try {
      const title = newBase.title.trim();
      if (!title) {
        throw new Error("知识库名称不能为空");
      }
      const payload = await requestJson<{ base: KnowledgeBase; bases: KnowledgeBase[] }>("/api/knowledge-bases", {
        method: "POST",
        body: JSON.stringify({
          title,
          description: newBase.description
        })
      });
      setBases(payload.bases);
      setSelectedBaseId(payload.base.id);
      setNewBase({ title: "", description: "" });
      setNotice("知识库已创建");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "创建知识库失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedBase) {
      return;
    }
    setNotice("");
    setSubmitting(true);
    try {
      const cleanFolder = normalizeClientFolder(folderPath);
      if (!cleanFolder) {
        throw new Error("请填写要创建的文件夹路径");
      }
      const payload = await requestJson<{ status: "approved" | "pending"; request?: KnowledgeRequest }>("/api/knowledge-upload", {
        method: "POST",
        body: JSON.stringify({
          baseId: selectedBase.id,
          type: "folder",
          folderPath: cleanFolder
        })
      });
      setFolderPath("");
      await loadKnowledge();
      if (payload.status === "approved") {
        await onRefreshIndex();
        setNotice("文件夹已直接创建");
      } else {
        setNotice("文件夹创建申请已提交管理员审核");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "创建文件夹失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedBase) {
      return;
    }
    setNotice("");
    setSubmitting(true);
    try {
      const cleanFolder = normalizeClientFolder(docFolder);
      const fileName = validateKnowledgeMarkdownName(docFileName);
      const content = validateKnowledgeMarkdownContent(docContent);
      const payload = await requestJson<{ status: "approved" | "pending"; request?: KnowledgeRequest }>("/api/knowledge-upload", {
        method: "POST",
        body: JSON.stringify({
          baseId: selectedBase.id,
          type: "document",
          targetFolder: cleanFolder,
          title: docTitle,
          fileName,
          content
        })
      });
      setDocTitle("");
      setDocFileName("");
      setDocContent("");
      setDocFolder("");
      await loadKnowledge();
      if (payload.status === "approved") {
        await onRefreshIndex();
        setNotice("Markdown 文档已直接写入知识库");
      } else {
        setNotice("Markdown 文档已提交管理员审核");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "上传 Markdown 失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMarkdownFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      validateKnowledgeMarkdownName(file.name);
      if (file.size > knowledgeMarkdownMaxBytes) {
        throw new Error("Markdown 文档不能超过 2MB");
      }
      const text = await file.text();
      validateKnowledgeMarkdownContent(text);
      setDocFileName(file.name);
      setDocContent(text);
      setDocTitle((current) => current || file.name.replace(/\.(md|markdown)$/i, ""));
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "读取 Markdown 文件失败");
      event.target.value = "";
    }
  }

  function handlePlanetContentClick(event: MouseEvent<HTMLDivElement>) {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[data-note-path]");
    if (!link) {
      return;
    }
    event.preventDefault();
    const targetPath = link.dataset.notePath ?? "";
    if (baseFiles.some((file) => file.path === targetPath)) {
      setSelectedDocPath(targetPath);
      return;
    }
    onOpenNote(targetPath, link.dataset.noteHash ? `#${link.dataset.noteHash}` : "");
  }

  function togglePlanetFolder(path: string) {
    setExpandedPlanetFolders((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  return (
    <section className="planet-shell">
      <header className="planet-topbar">
        <button className="planet-brand" onClick={onBackHome} type="button">
          <span className="brand-mark">
            <LayoutDashboard size={22} />
          </span>
          <span>
            <strong>Valentin</strong>
            <small>返回主页</small>
          </span>
        </button>
        <div className="planet-command-center">
          <span>Knowledge Planet</span>
          <strong>{selectedBase?.title ?? "知识星球"}</strong>
        </div>
        <div className="planet-top-actions">
          <label>
            <Palette size={14} />
            <select
              aria-label="网站风格"
              value={siteTheme}
              onChange={(event) => onSiteThemeChange(event.target.value as SiteTheme)}
            >
              {siteThemes.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <FileText size={14} />
            <select
              aria-label="文档风格"
              value={markdownTheme}
              onChange={(event) => onMarkdownThemeChange(event.target.value as MarkdownTheme)}
            >
              {markdownThemes.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.label}
                </option>
              ))}
            </select>
          </label>
          <button className="toolbar-button primary" type="button" onClick={() => setInspectorOpen(true)}>
            <Upload size={15} />
            上传与审核
          </button>
          <div className="planet-user-chip">
            <User size={15} />
            <span>{user.displayName}</span>
          </div>
        </div>
      </header>

      <div className="planet-workbench">
        <aside className="planet-ribbon" aria-label="知识星球快捷操作">
          <button className="active" type="button" title="知识库">
            <BookOpen size={18} />
          </button>
          <button type="button" title="刷新" onClick={() => void loadKnowledge()}>
            <Search size={18} />
          </button>
          <button type="button" title="返回主页" onClick={onBackHome}>
            <Home size={18} />
          </button>
        </aside>

        <aside className="planet-vault-panel">
          <div className="planet-panel-heading">
            <span>Vaults</span>
            <strong>知识库</strong>
          </div>
          <div className="knowledge-base-list">
            {bases.map((base) => (
              <button
                className={base.id === selectedBaseId ? "active" : ""}
                key={base.id}
                onClick={() => setSelectedBaseId(base.id)}
              >
                <strong>{base.title}</strong>
                <span>{base.ownerDisplayName} · {baseFilesForBase(index, base).length} 篇</span>
              </button>
            ))}
          </div>

          <form className="planet-form" onSubmit={createBase}>
            <h3>新建知识库</h3>
            <input
              value={newBase.title}
              onChange={(event) => setNewBase({ ...newBase, title: event.target.value })}
              placeholder="知识库名称"
            />
            <textarea
              value={newBase.description}
              onChange={(event) => setNewBase({ ...newBase, description: event.target.value })}
              placeholder="一句话说明"
              rows={3}
            />
            <button className="primary-button" disabled={submitting}>
              <Plus size={16} />
              新建
            </button>
          </form>

          <div className="planet-tree">
            <div className="planet-panel-heading">
              <span>Files</span>
              <strong>目录</strong>
            </div>
            {selectedBase ? (
              <div className="planet-directory-tree">
                {directoryTree.length === 0 ? (
                  <div className="empty-state">暂无 Markdown 文档</div>
                ) : (
                  directoryTree.map((node) => (
                    <PlanetDirectoryNodeView
                      key={node.path}
                      node={node}
                      selectedDocPath={selectedDocPath}
                      expandedFolders={expandedPlanetFolders}
                      onToggleFolder={togglePlanetFolder}
                      onOpenFile={setSelectedDocPath}
                    />
                  ))
                )}
              </div>
            ) : (
              <div className="empty-state">暂无知识库</div>
            )}
          </div>
        </aside>

        <main className="planet-editor">
          <div className="planet-tabbar">
            <div>
              <span>{selectedBase?.ownerDisplayName ?? "Vault"}</span>
              <strong>{selectedFile?.title ?? selectedBase?.title ?? "知识星球"}</strong>
            </div>
            <div className="planet-tab-actions">
              <span>{markdownThemes.find((theme) => theme.id === markdownTheme)?.label ?? "经典阅读"}</span>
            </div>
          </div>

          {notice ? <div className="notice-line">{notice}</div> : null}
          {loading ? <div className="loading-state">正在加载知识库...</div> : null}

          {selectedBase ? (
            <article className="planet-document-panel">
              <div className="document-meta">
                <span>{selectedFile ? formatBytes(selectedFile.size) : `${baseFiles.length} 篇文档`}</span>
                <span>{selectedBase.rootPath}</span>
                <span>{user.role === "admin" ? "管理员直接写入" : "上传需要审核"}</span>
              </div>
              {docLoading ? (
                <div className="loading-state">正在加载 Markdown...</div>
              ) : selectedDocPath ? (
                <div
                  className="markdown-body"
                  dangerouslySetInnerHTML={{ __html: renderedDoc.html }}
                  onClick={handlePlanetContentClick}
                />
              ) : (
                <div className="planet-empty-document">
                  <BookOpen size={30} />
                  <strong>{selectedBase.title}</strong>
                  <span>{selectedBase.description || "选择左侧 Markdown 文档开始阅读。"}</span>
                </div>
              )}
            </article>
          ) : (
            <div className="planet-empty-document">
              <Sparkles size={30} />
              <strong>暂无知识库</strong>
              <span>先在左侧新建一个知识库。</span>
            </div>
          )}
        </main>

        <div
          className={`planet-inspector-backdrop ${inspectorOpen ? "show" : ""}`}
          onClick={() => setInspectorOpen(false)}
        />
        <aside className={`planet-inspector ${inspectorOpen ? "open" : ""}`}>
          <div className="planet-panel-heading">
            <span>Actions</span>
            <strong>上传与审核</strong>
            <button className="icon-button" type="button" onClick={() => setInspectorOpen(false)} aria-label="关闭上传与审核">
              <X size={16} />
            </button>
          </div>

          {selectedBase ? (
            <>
              <div className="planet-mini-stats">
                <div>
                  <strong>{baseFiles.length}</strong>
                  <span>文档</span>
                </div>
                <div>
                  <strong>{selectedBase.folders?.length ?? 0}</strong>
                  <span>文件夹</span>
                </div>
              </div>

              <form className="planet-form" onSubmit={submitFolder}>
                <h3>新建文件夹</h3>
                <input
                  value={folderPath}
                  onChange={(event) => setFolderPath(event.target.value)}
                  placeholder="例如 workflows/review"
                />
                <button className="toolbar-button primary" disabled={submitting}>
                  <Folder size={15} />
                  直接创建
                </button>
              </form>

              <form className="planet-form" onSubmit={submitDocument}>
                <h3>上传 Markdown</h3>
                <input
                  value={docTitle}
                  onChange={(event) => setDocTitle(event.target.value)}
                  placeholder="文档标题，可选"
                />
                <input
                  value={docFolder}
                  onChange={(event) => setDocFolder(event.target.value)}
                  placeholder="目标文件夹，可留空"
                  list="knowledge-folder-options"
                />
                <datalist id="knowledge-folder-options">
                  {folderOptions.map((folder) => (
                    <option key={folder || "root"} value={folder} />
                  ))}
                </datalist>
                <input
                  value={docFileName}
                  onChange={(event) => setDocFileName(event.target.value)}
                  placeholder="文件名，例如 note.md"
                />
                <input type="file" accept=".md,.markdown,text/markdown,text/plain" onChange={handleMarkdownFile} />
                <textarea
                  value={docContent}
                  onChange={(event) => setDocContent(event.target.value)}
                  placeholder="# Markdown 内容"
                  rows={7}
                />
                <button className="toolbar-button primary" disabled={submitting}>
                  <Upload size={15} />
                  {user.role === "admin" ? "直接上传" : "提交审核"}
                </button>
              </form>
            </>
          ) : null}

          <div className="planet-section">
            <div className="section-heading">
              <h2>我的提交</h2>
              <span>{requests.length} 条</span>
            </div>
            <div className="planet-request-list">
              {requests.length === 0 ? (
                <div className="empty-state">暂无上传或建文件夹申请</div>
              ) : (
                requests.map((request) => (
                  <article className={`review-card status-${request.status}`} key={request.id}>
                    <div className="review-card-head">
                      <div>
                        <strong>{request.fileName ?? request.targetFolder}</strong>
                        <span>
                          {request.baseTitle} · {requestTypeLabel(request.type)} · {formatDateTime(request.submittedAt)}
                        </span>
                      </div>
                      <em>{reviewStatusLabel(request.status)}</em>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function baseFilesForBase(index: NotesIndex | null, base: KnowledgeBase) {
  const prefix = `${base.rootPath}/`;
  return (index?.files ?? []).filter((file) => !file.hidden && file.path.startsWith(prefix));
}

function MarkdownPreview({
  source,
  currentPath = "resume.md"
}: {
  source: string;
  currentPath?: string;
}) {
  const rendered = useMemo(() => renderMarkdown(source, currentPath), [source, currentPath]);
  return (
    <div
      className="markdown-body resume-markdown"
      dangerouslySetInnerHTML={{ __html: rendered.html }}
    />
  );
}

function ResumeProfilePanel({ profile }: { profile: ResumeProfile | null }) {
  if (!profile) {
    return (
      <div className="resume-empty">
        <BriefcaseBusiness size={28} />
        <strong>暂无已审核简历</strong>
        <span>提交 HTML、Markdown、PDF 或在线链接后，等待管理员审核。</span>
      </div>
    );
  }

  if (profile.type === "link") {
    return (
      <div className="resume-link-card">
        <div>
          <span>已审核链接</span>
          <h2>{profile.title}</h2>
          <p>{profile.url}</p>
          <small>更新时间：{formatDateTime(profile.updatedAt)}</small>
        </div>
        <a className="primary-button link-button" href={profile.url} target="_blank" rel="noreferrer">
          <ExternalLink size={16} />
          打开简历
        </a>
      </div>
    );
  }

  return (
    <div className="resume-document">
      <div className="section-heading">
        <h2>{profile.title}</h2>
        <span>{profile.fileName}</span>
      </div>
      {profile.type === "html" ? (
        <iframe
          title={profile.title}
          className="resume-frame"
          sandbox=""
          srcDoc={profile.content}
        />
      ) : profile.type === "pdf" ? (
        <iframe
          title={profile.title}
          className="resume-frame"
          src={profile.content}
        />
      ) : (
        <MarkdownPreview source={profile.content} currentPath={profile.fileName} />
      )}
    </div>
  );
}

function ResumeView({ user }: { user: AuthUser }) {
  const [profile, setProfile] = useState<ResumeProfile | null>(null);
  const [requests, setRequests] = useState<ResumeRequest[]>([]);
  const [mode, setMode] = useState<"file" | "link">("file");
  const [title, setTitle] = useState(`${user.displayName} 的简历`);
  const [url, setUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileType, setFileType] = useState<ResumeFileType>("markdown");
  const [fileContent, setFileContent] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function loadResume() {
    setLoading(true);
    try {
      const payload = await requestJson<ResumePayload>("/api/resume");
      setProfile(payload.profile);
      setRequests([...readLocalResumeRequests(user.username), ...payload.requests]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "简历加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadResume();
  }, [user.username]);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      if (file.size > resumeMaxBytes) {
        throw new Error("简历文件不能超过 4MB");
      }
      const nextType = validateResumeFileName(file.name);
      validateResumeMime(file, nextType);
      const content =
        nextType === "pdf" ? await readFileAsDataUrl(file) : await file.text();
      validateResumeContent(content, nextType);
      setFileName(file.name);
      setFileType(nextType);
      setTitle((current) => current || file.name.replace(/\.(html?|md|markdown|pdf)$/i, ""));
      setFileContent(content);
      setNotice("");
    } catch (error) {
      event.target.value = "";
      setFileName("");
      setFileContent("");
      setNotice(error instanceof Error ? error.message : "文件格式校验失败");
    }
  }

  async function submitResume(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setSubmitting(true);

    try {
      if (mode === "file") {
        const detectedType = validateResumeFileName(fileName);
        if (detectedType !== fileType) {
          throw new Error("文件扩展名与识别到的文件类型不一致");
        }
        validateResumeContent(fileContent, fileType);
      }
      await requestJson<{ request: ResumeRequest }>("/api/resume-requests", {
        method: "POST",
        body: JSON.stringify(
          mode === "link"
            ? { mode, title, url }
            : { mode, title, fileName, fileType, content: fileContent }
        )
      });
      setNotice("已提交审核");
      setUrl("");
      setFileName("");
      setFileContent("");
      await loadResume();
    } catch (error) {
      if (isReadonlyStateError(error)) {
        const localRequest: ResumeRequest = {
          id: `local-${randomId()}`,
          username: user.username,
          displayName: user.displayName,
          mode,
          status: "pending",
          title: title.trim() || `${user.displayName} 的简历`,
          submittedAt: new Date().toISOString(),
          comment: "local-only",
          fileName: mode === "file" ? fileName : undefined,
          fileType: mode === "file" ? fileType : undefined,
          url: mode === "link" ? url : undefined
        };
        saveLocalResumeRequest(user.username, localRequest);
        setRequests((current) => [localRequest, ...current]);
        setNotice("当前部署环境暂时无法写入审核数据，已在本浏览器保留提交记录；管理员需要接入数据库或 GitHub API 后才能在线审核。");
      } else {
        setNotice(error instanceof Error ? error.message : "提交失败");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="resume-view">
      <div className="page-heading">
        <p>Resume</p>
        <h1>{user.displayName} 的个人简历</h1>
      </div>

      <div className="resume-workspace">
        <section className="resume-main">
          {loading ? <div className="loading-state">正在加载简历...</div> : <ResumeProfilePanel profile={profile} />}
        </section>

        <aside className="resume-side">
          <h2>提交简历</h2>
          <div className="segmented-control">
            <button className={mode === "file" ? "active" : ""} onClick={() => setMode("file")}>
              <Upload size={15} />
              文件
            </button>
            <button className={mode === "link" ? "active" : ""} onClick={() => setMode("link")}>
              <Link2 size={15} />
              链接
            </button>
          </div>

          <form className="stack-form" onSubmit={submitResume}>
            <label>
              标题
              <input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            {mode === "file" ? (
              <>
                <label>
                  HTML / Markdown / PDF 文件
                  <input accept=".html,.htm,.md,.markdown,.pdf,text/html,text/markdown,application/pdf" type="file" onChange={handleFile} />
                </label>
                {fileName ? (
                  <div className="inline-note">
                    <FileText size={15} />
                    <span>
                      {fileName} · {fileType === "html" ? "HTML" : fileType === "pdf" ? "PDF" : "Markdown"}
                    </span>
                  </div>
                ) : null}
              </>
            ) : (
              <label>
                跳转链接
                <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/resume" />
              </label>
            )}
            {notice ? <div className="notice-line">{notice}</div> : null}
            <button className="primary-button" disabled={submitting}>
              {submitting ? "提交中..." : "提交审核"}
            </button>
          </form>

          <h2>审核记录</h2>
          <div className="review-history">
            {requests.length === 0 ? (
              <div className="empty-state">暂无提交记录</div>
            ) : (
              requests.map((request) => (
                <div className={`review-item status-${request.status}`} key={request.id}>
                  <strong>{request.title}</strong>
                  <span>{request.mode === "link" ? "链接" : request.fileName}</span>
                  <small>
                    {request.status === "pending"
                      ? "待审核"
                      : request.status === "approved"
                        ? "已通过"
                        : "已拒绝"}
                    {request.comment === "local-only" ? " · 本地保留" : ""} · {formatDateTime(request.submittedAt)}
                  </small>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

function TodoView({ user }: { user: AuthUser }) {
  const storageKey = `valentin.todos.${user.username}`;
  const [items, setItems] = useState<TodoItem[]>(() => readTodoItems(user.username));
  const [activeScope, setActiveScope] = useState<TodoScope>("day");
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDate("day"));

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(items));
  }, [items, storageKey]);

  useEffect(() => {
    setDueDate(defaultDueDate(activeScope));
  }, [activeScope]);

  function addTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = text.trim();
    if (!value) {
      return;
    }
    const nextDueDate = /^\d{4}-\d{2}-\d{2}$/.test(dueDate)
      ? dueDate
      : defaultDueDate(activeScope);

    setItems((current) => [
      {
        id: randomId(),
        text: value,
        note: note.trim(),
        done: false,
        createdAt: Date.now(),
        dueDate: nextDueDate,
        scope: activeScope
      },
      ...current
    ]);
    setText("");
    setNote("");
  }

  const stats = todoScopes.map((scope) => {
    const range = todoRange(scope.id);
    const scoped = items.filter((item) =>
      isDateInRange(item.dueDate, range.startIso, range.endIso)
    );
    return {
      ...scope,
      rangeLabel: range.label,
      open: scoped.filter((item) => !item.done).length,
      total: scoped.length
    };
  });
  const activeRange = todoRange(activeScope);
  const visibleItems = items
    .filter((item) => isDateInRange(item.dueDate, activeRange.startIso, activeRange.endIso))
    .sort((a, b) => Number(a.done) - Number(b.done) || a.dueDate.localeCompare(b.dueDate));
  const activeMeta = todoScopes.find((scope) => scope.id === activeScope) ?? todoScopes[0];
  const groupedItems = Object.entries(
    visibleItems.reduce<Record<string, TodoItem[]>>((groups, item) => {
      groups[item.dueDate] = groups[item.dueDate] ?? [];
      groups[item.dueDate].push(item);
      return groups;
    }, {})
  );
  const itemsByDate = items.reduce<Record<string, TodoItem[]>>((groups, item) => {
    groups[item.dueDate] = groups[item.dueDate] ?? [];
    groups[item.dueDate].push(item);
    return groups;
  }, {});
  const calendarDays = activeScope === "day" ? [] : calendarCells(activeScope);

  function updateItem(id: string, patch: Partial<TodoItem>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  return (
    <section className="todo-view">
      <div className="page-heading">
        <p>Todo List</p>
        <h1>{activeMeta.title}</h1>
      </div>

      <div className="todo-board">
        <div className="todo-scope-grid">
          {stats.map(({ id, title, shortTitle, icon: Icon, open, total, rangeLabel }) => (
            <button
              className={`todo-scope-card ${activeScope === id ? "active" : ""}`}
              key={id}
              onClick={() => setActiveScope(id)}
            >
              <Icon size={18} />
              <span>{shortTitle}</span>
              <strong>{open}</strong>
              <small>{title} · {rangeLabel} · {total} 项</small>
            </button>
          ))}
        </div>

        <div className="todo-range-line">
          <span>{activeMeta.title}</span>
          <strong>{activeRange.label}</strong>
        </div>

        {activeScope !== "day" ? (
          <div className={`todo-calendar ${activeScope === "week" ? "week-calendar" : "month-calendar"}`}>
            <div className="calendar-weekdays">
              {weekDayLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <div className="calendar-grid">
              {calendarDays.map((cell) => {
                const dayItems = itemsByDate[cell.iso] ?? [];
                const openItems = dayItems.filter((item) => !item.done);
                return (
                  <button
                    className={`calendar-cell ${cell.inPeriod ? "" : "muted"} ${cell.today ? "today" : ""} ${dueDate === cell.iso ? "selected" : ""}`}
                    key={cell.iso}
                    onClick={() => setDueDate(cell.iso)}
                    type="button"
                  >
                    <span>{cell.day}</span>
                    <small>{openItems.length ? `${openItems.length} 待办` : " "}</small>
                    {activeScope === "week" ? (
                      <em>
                        {dayItems.slice(0, 2).map((item) => (
                          <i key={item.id}>{item.text}</i>
                        ))}
                      </em>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <form className="todo-form expanded" onSubmit={addTodo}>
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={`新增${activeMeta.addLabel}`}
          />
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="备注"
          />
          <input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
          <button className="primary-button">
            <Plus size={16} />
            添加
          </button>
        </form>

        <div className="todo-list">
          {visibleItems.length === 0 ? (
            <div className="empty-state">暂无{activeMeta.addLabel}</div>
          ) : (
            groupedItems.map(([date, group]) => (
              <section className="todo-date-group" key={date}>
                <div className="todo-date-heading">
                  <strong>{formatDate(date)}</strong>
                  <span>{group.filter((item) => !item.done).length} 个进行中</span>
                </div>
                {group.map((item) => (
                  <div className={`todo-item ${item.done ? "done" : ""}`} key={item.id}>
                    <button
                      className="todo-check"
                      onClick={() => updateItem(item.id, { done: !item.done })}
                      aria-label={item.done ? "标记为未完成" : "标记为已完成"}
                    >
                      {item.done ? <Check size={16} /> : <Circle size={16} />}
                    </button>
                    <div className="todo-text">
                      <strong>{item.text}</strong>
                      <span>{item.note || "无备注"}</span>
                    </div>
                    <time>{formatDate(item.dueDate)}</time>
                    <button
                      className="icon-button"
                      onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}
                      aria-label="删除待办"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </section>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function UserCenterModal({
  user,
  onClose,
  onUserUpdate
}: {
  user: AuthUser;
  onClose: () => void;
  onUserUpdate: (user: AuthUser) => void;
}) {
  const emptyProfile: UserProfile = {
    username: user.username,
    displayName: user.displayName,
    title: "",
    email: "",
    phone: "",
    location: "",
    website: "",
    bio: ""
  };
  const [tab, setTab] = useState<"profile" | "security">("profile");
  const [profile, setProfile] = useState<UserProfile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });

  useEffect(() => {
    setLoading(true);
    requestJson<ProfilePayload>("/api/profile")
      .then((payload) => {
        setProfile(payload.profile);
        onUserUpdate(payload.user);
      })
      .catch((error) => {
        setNotice(error instanceof Error ? error.message : "用户资料加载失败");
      })
      .finally(() => setLoading(false));
  }, [user.username]);

  function updateProfile(patch: Partial<UserProfile>) {
    setProfile((current) => ({
      ...current,
      ...patch
    }));
  }

  async function handleAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      if (!avatarMimeTypes.has(file.type.toLowerCase())) {
        throw new Error("头像只支持 PNG、JPG 或 WebP");
      }
      if (file.size > avatarMaxBytes) {
        throw new Error("头像文件不能超过 512KB");
      }
      const dataUrl = await readFileAsDataUrl(file);
      updateProfile({ avatarDataUrl: validateAvatarDataUrl(dataUrl) });
      setNotice("");
    } catch (error) {
      event.target.value = "";
      setNotice(error instanceof Error ? error.message : "头像格式校验失败");
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setSaving(true);

    try {
      if (profile.avatarDataUrl) {
        validateAvatarDataUrl(profile.avatarDataUrl);
      }
      const payload = await requestJson<{ profile: UserProfile }>("/api/profile", {
        method: "PATCH",
        body: JSON.stringify(profile)
      });
      setProfile(payload.profile);
      onUserUpdate({ ...user, displayName: payload.profile.displayName });
      setNotice("资料已保存");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "资料保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    if (passwords.newPassword !== passwords.confirmPassword) {
      setNotice("两次输入的新密码不一致");
      return;
    }
    setSaving(true);

    try {
      await requestJson<{ ok: boolean }>("/api/profile-password", {
        method: "PATCH",
        body: JSON.stringify({
          currentPassword: passwords.currentPassword,
          newPassword: passwords.newPassword
        })
      });
      setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setNotice("密码已更新");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "密码修改失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="user-center-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <span>用户中心</span>
            <h2>{profile.displayName || user.displayName}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭用户中心">
            <X size={17} />
          </button>
        </div>

        <div className="segmented-control">
          <button className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>
            <UserCircle size={15} />
            个人资料
          </button>
          <button className={tab === "security" ? "active" : ""} onClick={() => setTab("security")}>
            <ShieldCheck size={15} />
            账号安全
          </button>
        </div>

        {notice ? <div className="notice-line">{notice}</div> : null}
        {loading ? <div className="loading-state">正在加载用户资料...</div> : null}

        {tab === "profile" ? (
          <form className="profile-form" onSubmit={saveProfile}>
            <div className="avatar-uploader">
              <div className="profile-avatar">
                {profile.avatarDataUrl ? (
                  <img src={profile.avatarDataUrl} alt="用户头像" />
                ) : (
                  <User size={24} />
                )}
              </div>
              <label>
                上传头像
                <input accept="image/png,image/jpeg,image/webp" type="file" onChange={handleAvatar} />
              </label>
              {profile.avatarDataUrl ? (
                <button className="toolbar-button" type="button" onClick={() => updateProfile({ avatarDataUrl: "" })}>
                  清除头像
                </button>
              ) : null}
            </div>

            <div className="profile-grid">
              <label>
                昵称
                <input value={profile.displayName} onChange={(event) => updateProfile({ displayName: event.target.value })} />
              </label>
              <label>
                职业/身份
                <input value={profile.title} onChange={(event) => updateProfile({ title: event.target.value })} placeholder="例如 AI Workflow Builder" />
              </label>
              <label>
                邮箱
                <input value={profile.email} onChange={(event) => updateProfile({ email: event.target.value })} placeholder="name@example.com" />
              </label>
              <label>
                电话
                <input value={profile.phone} onChange={(event) => updateProfile({ phone: event.target.value })} />
              </label>
              <label>
                所在地
                <input value={profile.location} onChange={(event) => updateProfile({ location: event.target.value })} />
              </label>
              <label>
                个人网站
                <input value={profile.website} onChange={(event) => updateProfile({ website: event.target.value })} placeholder="https://example.com" />
              </label>
            </div>

            <label className="bio-field">
              个人简介
              <textarea value={profile.bio} onChange={(event) => updateProfile({ bio: event.target.value })} rows={4} />
            </label>

            <button className="primary-button" disabled={saving}>
              {saving ? "保存中..." : "保存资料"}
            </button>
          </form>
        ) : (
          <form className="profile-form" onSubmit={changePassword}>
            <label>
              当前密码
              <input
                type="password"
                value={passwords.currentPassword}
                onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })}
              />
            </label>
            <label>
              新密码
              <input
                type="password"
                value={passwords.newPassword}
                onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })}
              />
            </label>
            <label>
              确认新密码
              <input
                type="password"
                value={passwords.confirmPassword}
                onChange={(event) => setPasswords({ ...passwords, confirmPassword: event.target.value })}
              />
            </label>
            <button className="primary-button" disabled={saving}>
              {saving ? "更新中..." : "更新密码"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

function AdminView({ user }: { user: AuthUser }) {
  const [tab, setTab] = useState<"users" | "reviews" | "knowledge">("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [requests, setRequests] = useState<ResumeRequest[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ResumeProfile>>({});
  const [knowledgeRequests, setKnowledgeRequests] = useState<KnowledgeRequest[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [userSource, setUserSource] = useState("");
  const [readOnlyUsers, setReadOnlyUsers] = useState(false);
  const [userDrafts, setUserDrafts] = useState<Record<string, { displayName: string; role: UserRole; priority: number; password: string }>>({});
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    displayName: "",
    role: "viewer" as UserRole,
    priority: 10
  });
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadAdmin() {
    setLoading(true);
    try {
      const [usersPayload, resumePayload, knowledgePayload] = await Promise.all([
        requestJson<AdminUsersPayload>("/api/admin/users"),
        requestJson<AdminResumePayload>("/api/admin/resume-requests"),
        requestJson<AdminKnowledgePayload>("/api/admin/knowledge-requests")
      ]);
      setUsers(usersPayload.users);
      setUserSource(usersPayload.source);
      setReadOnlyUsers(Boolean(usersPayload.readOnly));
      setRequests(resumePayload.requests);
      setProfiles(resumePayload.profiles);
      setKnowledgeRequests(knowledgePayload.requests);
      setKnowledgeBases(knowledgePayload.bases);
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "管理数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAdmin();
  }, []);

  useEffect(() => {
    setUserDrafts(
      Object.fromEntries(
        users.map((entry) => [
          entry.username,
          {
            displayName: entry.displayName,
            role: entry.role,
            priority: entry.priority,
            password: ""
          }
        ])
      )
    );
  }, [users]);

  if (user.role !== "admin") {
    return (
      <section className="admin-view">
        <div className="empty-state">当前账号没有管理员权限</div>
      </section>
    );
  }

  const pendingCount = requests.filter((request) => request.status === "pending").length;
  const knowledgePendingCount = knowledgeRequests.filter((request) => request.status === "pending").length;
  const approvedProfiles = Object.keys(profiles).length;

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    try {
      const payload = await requestJson<AdminUsersPayload>("/api/admin/users", {
        method: "POST",
        body: JSON.stringify(newUser)
      });
      setUsers(payload.users);
      setNewUser({
        username: "",
        password: "",
        displayName: "",
        role: "viewer",
        priority: 10
      });
      setNotice("用户已创建");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "创建用户失败");
    }
  }

  async function saveUser(username: string) {
    setNotice("");
    try {
      const draft = userDrafts[username];
      const payload = await requestJson<AdminUsersPayload>("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({ username, ...draft })
      });
      setUsers(payload.users);
      setNotice("用户信息已保存");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存用户失败");
    }
  }

  async function deleteUser(username: string) {
    if (!window.confirm(`确认删除用户 ${username}？`)) {
      return;
    }
    setNotice("");
    try {
      const payload = await requestJson<AdminUsersPayload>("/api/admin/users", {
        method: "DELETE",
        body: JSON.stringify({ username })
      });
      setUsers(payload.users);
      setNotice("用户已删除");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "删除用户失败");
    }
  }

  function updateDraft(username: string, patch: Partial<{ displayName: string; role: UserRole; priority: number; password: string }>) {
    setUserDrafts((current) => ({
      ...current,
      [username]: {
        ...current[username],
        ...patch
      }
    }));
  }

  async function reviewRequest(id: string, action: "approve" | "reject") {
    setNotice("");
    try {
      await requestJson<{ request: ResumeRequest; profile: ResumeProfile | null }>("/api/admin/resume-requests", {
        method: "PATCH",
        body: JSON.stringify({ id, action })
      });
      await loadAdmin();
      setNotice(action === "approve" ? "审核已通过" : "审核已拒绝");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "审核失败");
    }
  }

  async function reviewKnowledgeRequest(id: string, action: "approve" | "reject") {
    setNotice("");
    try {
      await requestJson<{ request: KnowledgeRequest; bases: KnowledgeBase[] }>("/api/admin/knowledge-requests", {
        method: "PATCH",
        body: JSON.stringify({ id, action })
      });
      await loadAdmin();
      setNotice(action === "approve" ? "知识库提交已通过" : "知识库提交已拒绝");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "知识库审核失败");
    }
  }

  return (
    <section className="admin-view">
      <div className="page-heading">
        <p>Admin</p>
        <h1>管理平台</h1>
      </div>

      <div className="admin-metrics">
        <div>
          <span>用户</span>
          <strong>{users.length}</strong>
        </div>
        <div>
          <span>待审核</span>
          <strong>{pendingCount + knowledgePendingCount}</strong>
        </div>
        <div>
          <span>已发布简历</span>
          <strong>{approvedProfiles}</strong>
        </div>
        <div>
          <span>知识库</span>
          <strong>{knowledgeBases.length}</strong>
        </div>
      </div>

      <div className="admin-tabs">
        <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>
          <Users size={16} />
          用户管理
        </button>
        <button className={tab === "reviews" ? "active" : ""} onClick={() => setTab("reviews")}>
          <FileCheck size={16} />
          简历审核
        </button>
        <button className={tab === "knowledge" ? "active" : ""} onClick={() => setTab("knowledge")}>
          <BookOpen size={16} />
          知识审核
        </button>
      </div>

      {notice ? <div className="notice-line">{notice}</div> : null}
      {loading ? <div className="loading-state">正在加载管理数据...</div> : null}

      {tab === "users" ? (
        <div className="admin-panel">
          <div className="section-heading">
            <h2>用户配置</h2>
          </div>

          <form className="user-create-form" onSubmit={createUser}>
            <input value={newUser.username} onChange={(event) => setNewUser({ ...newUser, username: event.target.value })} placeholder="用户名" />
            <input value={newUser.displayName} onChange={(event) => setNewUser({ ...newUser, displayName: event.target.value })} placeholder="显示名" />
            <input type="password" value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} placeholder="密码" />
            <select value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value as UserRole, priority: event.target.value === "admin" ? 100 : 10 })}>
              <option value="viewer">查看用户</option>
              <option value="admin">管理员</option>
            </select>
            <input type="number" value={newUser.priority} onChange={(event) => setNewUser({ ...newUser, priority: Number(event.target.value) })} min={0} max={100} />
            <button className="primary-button" disabled={readOnlyUsers}>
              <Plus size={16} />
              新增
            </button>
          </form>

          <div className="user-table">
            {users.map((entry) => {
              const draft = userDrafts[entry.username] ?? {
                displayName: entry.displayName,
                role: entry.role,
                priority: entry.priority,
                password: ""
              };
              return (
                <div className="user-row" key={entry.username}>
                  <strong>{entry.username}</strong>
                  <input value={draft.displayName} onChange={(event) => updateDraft(entry.username, { displayName: event.target.value })} />
                  <select value={draft.role} onChange={(event) => updateDraft(entry.username, { role: event.target.value as UserRole })}>
                    <option value="viewer">查看用户</option>
                    <option value="admin">管理员</option>
                  </select>
                  <input type="number" value={draft.priority} onChange={(event) => updateDraft(entry.username, { priority: Number(event.target.value) })} min={0} max={100} />
                  <input type="password" value={draft.password} onChange={(event) => updateDraft(entry.username, { password: event.target.value })} placeholder={entry.hasPassword ? "留空不改密码" : "设置密码"} />
                  <button className="toolbar-button" onClick={() => saveUser(entry.username)} disabled={readOnlyUsers}>
                    <Save size={15} />
                    保存
                  </button>
                  <button className="icon-button" onClick={() => deleteUser(entry.username)} disabled={readOnlyUsers || entry.username === user.username} aria-label="删除用户">
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : tab === "reviews" ? (
        <div className="admin-panel">
          <div className="section-heading">
            <h2>简历提交审核</h2>
            <span>{pendingCount} 条待处理</span>
          </div>

          <div className="review-admin-list">
            {requests.length === 0 ? (
              <div className="empty-state">暂无审核记录</div>
            ) : (
              requests.map((request) => (
                <article className={`review-card status-${request.status}`} key={request.id}>
                  <div className="review-card-head">
                    <div>
                      <strong>{request.title}</strong>
                      <span>{request.displayName} · {request.username} · {formatDateTime(request.submittedAt)}</span>
                    </div>
                    <em>
                      {request.status === "pending"
                        ? "待审核"
                        : request.status === "approved"
                          ? "已通过"
                          : "已拒绝"}
                    </em>
                  </div>

                  {request.mode === "link" ? (
                    <a className="review-link" href={request.url} target="_blank" rel="noreferrer">
                      <ExternalLink size={15} />
                      {request.url}
                    </a>
                  ) : (
                    <div className="review-preview">
                      <span>
                        {request.fileName} · {request.fileType === "html" ? "HTML" : request.fileType === "pdf" ? "PDF" : "Markdown"}
                      </span>
                      {request.fileType === "html" ? (
                        <iframe title={request.title} sandbox="" srcDoc={request.content ?? ""} />
                      ) : request.fileType === "pdf" ? (
                        <iframe title={request.title} src={request.content ?? ""} />
                      ) : (
                        <MarkdownPreview source={request.content ?? ""} currentPath={request.fileName ?? "resume.md"} />
                      )}
                    </div>
                  )}

                  {request.status === "pending" ? (
                    <div className="review-actions">
                      <button className="toolbar-button primary" onClick={() => reviewRequest(request.id, "approve")}>
                        <Check size={15} />
                        通过
                      </button>
                      <button className="toolbar-button danger" onClick={() => reviewRequest(request.id, "reject")}>
                        <Ban size={15} />
                        拒绝
                      </button>
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="admin-panel">
          <div className="section-heading">
            <h2>知识库提交审核</h2>
            <span>{knowledgePendingCount} 条待处理</span>
          </div>

          <div className="review-admin-list">
            {knowledgeRequests.length === 0 ? (
              <div className="empty-state">暂无知识库审核记录</div>
            ) : (
              knowledgeRequests.map((request) => (
                <article className={`review-card status-${request.status}`} key={request.id}>
                  <div className="review-card-head">
                    <div>
                      <strong>{request.fileName ?? request.targetFolder}</strong>
                      <span>
                        {request.displayName} · {request.username} · {request.baseTitle} · {formatDateTime(request.submittedAt)}
                      </span>
                    </div>
                    <em>{reviewStatusLabel(request.status)}</em>
                  </div>

                  <div className="review-preview">
                    <span>
                      {requestTypeLabel(request.type)} · {request.targetFolder || "根目录"}
                    </span>
                    {request.type === "document" ? (
                      <MarkdownPreview source={request.content ?? ""} currentPath={request.fileName ?? "knowledge.md"} />
                    ) : null}
                  </div>

                  {request.status === "pending" ? (
                    <div className="review-actions">
                      <button className="toolbar-button primary" onClick={() => reviewKnowledgeRequest(request.id, "approve")}>
                        <Check size={15} />
                        通过
                      </button>
                      <button className="toolbar-button danger" onClick={() => reviewKnowledgeRequest(request.id, "reject")}>
                        <Ban size={15} />
                        拒绝
                      </button>
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function App() {
  const [siteTheme, setSiteTheme] = useState<SiteTheme>(() => {
    return (localStorage.getItem("valentin.siteTheme") as SiteTheme | null) ?? "clean";
  });
  const [markdownTheme, setMarkdownTheme] = useState<MarkdownTheme>(() => {
    return (
      (localStorage.getItem("valentin.markdownTheme") as MarkdownTheme | null) ??
      "classic"
    );
  });
  const [view, setView] = useState<ViewName>("home");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [index, setIndex] = useState<NotesIndex | null>(null);
  const [activePath, setActivePath] = useState("");
  const [routeAnchor, setRouteAnchor] = useState("");
  const [markdownSource, setMarkdownSource] = useState("");
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userCenterOpen, setUserCenterOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [appError, setAppError] = useState("");
  const contentRef = useRef<HTMLDivElement | null>(null);

  const allFiles = useMemo(() => index?.files ?? [], [index]);
  const searchableFiles = useMemo(
    () => allFiles.filter((file) => !file.hidden),
    [allFiles]
  );
  const activeFile = useMemo(
    () => findFile(allFiles, activePath),
    [allFiles, activePath]
  );
  const currentSearchTerms = useMemo(() => searchTerms(query), [query]);

  const rendered = useMemo(() => {
    if (!activePath) {
      return { html: "", headings: [] };
    }
    return renderMarkdown(markdownSource, activePath);
  }, [activePath, markdownSource]);

  const searchResults = useMemo(() => {
    if (currentSearchTerms.length === 0) {
      return [];
    }

    return searchableFiles.filter((file) => {
      const haystack = `${file.title} ${file.path} ${file.searchText}`.toLowerCase();
      return currentSearchTerms.every((term) => haystack.includes(term));
    });
  }, [searchableFiles, currentSearchTerms]);

  const todoCount = useMemo(() => {
    if (!user) {
      return 0;
    }
    return readTodoItems(user.username).filter((item) => !item.done).length;
  }, [user, view]);

  useEffect(() => {
    document.documentElement.dataset.siteTheme = siteTheme;
    localStorage.setItem("valentin.siteTheme", siteTheme);
  }, [siteTheme]);

  useEffect(() => {
    localStorage.setItem("valentin.markdownTheme", markdownTheme);
  }, [markdownTheme]);

  async function refreshIndex() {
    const payload = await requestJson<NotesIndexPayload>("/api/notes-index");
    setIndex(payload);
    if (payload.user) {
      setUser(payload.user);
    }
    return payload;
  }

  async function openNotesRoute(path = "", anchor = "") {
    const payload = await refreshIndex();
    const nextPath =
      path && payload.files.some((file) => file.path === path)
        ? path
        : payload.defaultPath;
    setActivePath(nextPath);
    setRouteAnchor(anchor);
    setView("notes");
    if (!path || path !== nextPath) {
      history.replaceState(null, "", routeFor(nextPath));
    }
  }

  function applyCurrentRoute() {
    const parsed = parseRoute();
    const normalized = normalizeView(parsed.view, parsed.path);
    setView(normalized.view);
    setSidebarOpen(false);
    if (normalized.view === "notes") {
      openNotesRoute(normalized.path, parsed.anchor).catch((error) => {
        setAppError(error instanceof Error ? error.message : "无法加载文档索引");
      });
    } else if (user) {
      refreshIndex().catch(() => null);
    }
  }

  function navigate(viewName: ViewName) {
    window.location.hash = pageRoute(viewName);
  }

  function openNote(path: string, hash = "") {
    window.location.hash = routeFor(path, hash);
  }

  async function logout() {
    if (!window.confirm("确认退出当前账号？")) {
      return;
    }
    await fetch("/api/logout", { method: "POST" });
    setUser(null);
    setIndex(null);
    setMarkdownSource("");
    setActivePath("");
    setEditing(false);
    setNotice("");
    setView("home");
    history.replaceState(null, "", "#/");
  }

  async function saveDraft() {
    if (!activePath || !user?.canEdit) {
      return;
    }

    setSaving(true);
    setNotice("");

    try {
      await requestJson<{ ok: boolean; file: NoteFile }>(noteUrl(activePath), {
        method: "PUT",
        body: JSON.stringify({ content: draft })
      });
      setMarkdownSource(draft);
      setEditing(false);
      setNotice("已保存到服务器文件");
      await openNotesRoute(activePath);
    } catch (saveError) {
      setNotice(saveError instanceof Error ? saveError.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  function copyPath() {
    if (!activePath) {
      return;
    }
    void navigator.clipboard?.writeText(activePath);
    setNotice("路径已复制");
  }

  function toggleFolder(path: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  function startEditing() {
    setDraft(markdownSource);
    setEditing(true);
    setNotice("");
  }

  useEffect(() => {
    requestJson<{ user: AuthUser }>("/api/session")
      .then((payload) => {
        setUser(payload.user);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        setAuthChecking(false);
      });
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    applyCurrentRoute();
    window.addEventListener("hashchange", applyCurrentRoute);
    return () => window.removeEventListener("hashchange", applyCurrentRoute);
  }, [user?.username]);

  useEffect(() => {
    if (view !== "notes" || !activePath || !user) {
      return;
    }

    setLoading(true);
    setEditing(false);
    setDraft("");
    setNotice("");

    fetch(noteUrl(activePath))
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await readApiError(response));
        }
        return response.text();
      })
      .then((text) => {
        setMarkdownSource(text);
        setLoading(false);
        contentRef.current?.scrollTo({ top: 0 });
      })
      .catch((error) => {
        setMarkdownSource(`# 文档加载失败\n\n${String(error)}`);
        setLoading(false);
      });
  }, [activePath, user, view]);

  useEffect(() => {
    if (!routeAnchor) {
      return;
    }

    window.requestAnimationFrame(() => {
      document.getElementById(routeAnchor)?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }, [routeAnchor, rendered.html]);

  function handleContentClick(event: MouseEvent<HTMLDivElement>) {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>(
      "a[data-note-path]"
    );

    if (!link) {
      return;
    }

    event.preventDefault();
    openNote(
      link.dataset.notePath ?? "",
      link.dataset.noteHash ? `#${link.dataset.noteHash}` : ""
    );
  }

  const updatedText = activeFile
    ? new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(new Date(activeFile.updatedAt))
    : "";

  const headerSubtitle =
    view === "home"
      ? "Dashboard"
      : view === "notes"
        ? activeFile?.path ?? "Markdown 文档"
        : view === "resume"
          ? "Resume"
          : view === "todo"
            ? "Todo List"
            : view === "planet"
              ? "Knowledge Planet"
              : "";

  const headerTitle =
    view === "home"
      ? "首页"
      : view === "notes"
        ? activeFile?.title ?? "知识文档"
        : view === "resume"
          ? "个人简历"
          : view === "todo"
            ? "Todo List"
            : view === "planet"
              ? "知识星球"
              : "管理平台";

  if (authChecking) {
    return (
      <main className="auth-page">
        <section className="auth-panel compact">
          <div className="auth-mark">
            <ShieldCheck size={26} />
          </div>
          <h1>正在验证访问权限</h1>
        </section>
      </main>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={setUser} />;
  }

  if (view === "planet") {
    return (
      <div className={`planet-app-host markdown-theme-${markdownTheme}`}>
        <KnowledgePlanetView
          user={user}
          index={index}
          onOpenNote={openNote}
          onRefreshIndex={refreshIndex}
          onBackHome={() => navigate("home")}
          siteTheme={siteTheme}
          markdownTheme={markdownTheme}
          onSiteThemeChange={setSiteTheme}
          onMarkdownThemeChange={setMarkdownTheme}
        />
      </div>
    );
  }

  return (
    <div className={`site-shell markdown-theme-${markdownTheme}`}>
      <aside className={`site-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand">
          <button className="brand-link" type="button" onClick={() => navigate("home")}>
            <span className="brand-mark">
              <LayoutDashboard size={22} />
            </span>
            <span>
              <strong>Valentin</strong>
              <small>个人网站</small>
            </span>
          </button>
          <button
            className="icon-button mobile-only"
            onClick={() => setSidebarOpen(false)}
            aria-label="关闭导航"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="site-nav" aria-label="站点组件">
          <button className={view === "home" ? "active" : ""} onClick={() => navigate("home")}>
            <Home size={17} />
            <span>首页</span>
          </button>
          <button className={view === "resume" ? "active" : ""} onClick={() => navigate("resume")}>
            <BriefcaseBusiness size={17} />
            <span>个人简历</span>
          </button>
          <button className={view === "todo" ? "active" : ""} onClick={() => navigate("todo")}>
            <ListTodo size={17} />
            <span>Todo List</span>
          </button>
          <button onClick={() => navigate("planet")}>
            <Sparkles size={17} />
            <span>知识星球</span>
          </button>
          {user.role === "admin" ? (
            <button className={view === "admin" ? "active" : ""} onClick={() => navigate("admin")}>
              <ShieldCheck size={17} />
              <span>管理平台</span>
            </button>
          ) : null}
        </nav>

        <div className="preference-panel">
          <label>
            <Palette size={15} />
            <span>网站风格</span>
            <select
              value={siteTheme}
              onChange={(event) => setSiteTheme(event.target.value as SiteTheme)}
            >
              {siteThemes.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {view === "notes" ? (
          <div className="notes-explorer">
            <label className="search-box">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索全文、标题或路径"
              />
            </label>

            <div className="sidebar-meta">
              <span>{index?.count ?? 0} 篇文档</span>
              <span>{user.canEdit ? "管理员可编辑" : "只读浏览"}</span>
            </div>

            <div className="tree-scroll">
              {appError ? <div className="empty-state">{appError}</div> : null}
              {query.trim() ? (
                <SearchResults
                  results={searchResults}
                  terms={currentSearchTerms}
                  onOpen={openNote}
                />
              ) : (
                index?.tree.map((node) => (
                  <TreeNode
                    key={node.path}
                    node={node}
                    activePath={activePath}
                    expanded={expanded}
                    onToggle={toggleFolder}
                    onOpen={openNote}
                  />
                ))
              )}
            </div>
          </div>
        ) : null}

        <div className="user-panel">
          <button className="user-avatar" onClick={() => setUserCenterOpen(true)} aria-label="打开用户中心">
            <User size={16} />
          </button>
          <div>
            <strong>{user.displayName}</strong>
            <span>
              {roleLabel(user.role)} · 优先级 {user.priority}
            </span>
          </div>
          <button className="icon-button" onClick={() => setUserCenterOpen(true)} aria-label="用户中心">
            <Settings size={16} />
          </button>
          <button className="icon-button" onClick={logout} aria-label="退出登录">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <div
        className={`sidebar-backdrop ${sidebarOpen ? "show" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      <main className="site-main">
        <header className="site-header">
          <button
            className="icon-button mobile-only"
            onClick={() => setSidebarOpen(true)}
            aria-label="打开导航"
          >
            <Menu size={19} />
          </button>
          <div className="reader-title">
            {headerSubtitle ? <span>{headerSubtitle}</span> : null}
            <strong>{headerTitle}</strong>
          </div>
          {view === "notes" ? (
            <div className="reader-actions">
              {user.canEdit ? (
                editing ? (
                  <>
                    <button className="toolbar-button" onClick={() => setEditing(false)}>
                      <Eye size={15} />
                      <span>预览</span>
                    </button>
                    <button
                      className="toolbar-button primary"
                      onClick={saveDraft}
                      disabled={saving}
                    >
                      <Save size={15} />
                      <span>{saving ? "保存中" : "保存"}</span>
                    </button>
                  </>
                ) : (
                  <button className="toolbar-button" onClick={startEditing}>
                    <Edit3 size={15} />
                    <span>编辑</span>
                  </button>
                )
              ) : null}
              <button className="toolbar-button" onClick={copyPath}>
                <Copy size={15} />
                <span>复制路径</span>
              </button>
              {activeFile ? (
                <a
                  className="toolbar-button"
                  href={noteUrl(activeFile.path)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={15} />
                  <span>原文</span>
                </a>
              ) : null}
            </div>
          ) : null}
        </header>

        {view === "home" ? (
          <HomeView user={user} todoCount={todoCount} onOpen={navigate} />
        ) : null}

        {view === "resume" ? <ResumeView user={user} /> : null}

        {view === "todo" ? <TodoView user={user} /> : null}

        {view === "admin" ? <AdminView user={user} /> : null}

        {view === "notes" ? (
          <div className="reader-layout">
            <article className="document-panel" ref={contentRef}>
              <div className="document-meta">
                <span>{activeFile ? formatBytes(activeFile.size) : "..."}</span>
                <span>{updatedText}</span>
                <span>{user.canEdit ? "服务器文件可编辑" : "服务器文件只读"}</span>
              </div>
              {notice ? <div className="notice-line">{notice}</div> : null}
              {loading ? (
                <div className="loading-state">正在加载 Markdown...</div>
              ) : editing ? (
                <textarea
                  className="markdown-editor"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  spellCheck={false}
                />
              ) : (
                <div
                  className="markdown-body"
                  dangerouslySetInnerHTML={{ __html: rendered.html }}
                  onClick={handleContentClick}
                />
              )}
            </article>

            <aside className="toc-panel">
              <div className="toc-title">本页目录</div>
              <TableOfContents headings={rendered.headings} activePath={activePath} />
            </aside>
          </div>
        ) : null}
      </main>

      {userCenterOpen ? (
        <UserCenterModal
          user={user}
          onClose={() => setUserCenterOpen(false)}
          onUserUpdate={setUser}
        />
      ) : null}
    </div>
  );
}

export default App;
