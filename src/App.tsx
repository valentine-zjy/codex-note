import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, MouseEvent } from "react";
import {
  BookOpen,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  Folder,
  Home,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Menu,
  Moon,
  Palette,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  SunMedium,
  Trash2,
  User,
  X
} from "lucide-react";
import { renderMarkdown } from "./markdown";
import { formatBytes, noteUrl, pageRoute, parseRoute, routeFor } from "./path-utils";
import type {
  AuthUser,
  Heading,
  NoteFile,
  NoteFolder,
  NoteNode,
  NotesIndex
} from "./types";

type NotesIndexPayload = NotesIndex & {
  user?: AuthUser;
};

type ViewName = "home" | "notes" | "resume" | "todo";
type SiteTheme = "clean" | "night" | "sunrise";
type MarkdownTheme = "classic" | "paper" | "compact" | "serif";

type TodoItem = {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
};

const siteThemes: Array<{ id: SiteTheme; label: string; icon: typeof SunMedium }> = [
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

function findFile(files: NoteFile[], path: string) {
  return files.find((file) => file.path === path);
}

function isFolderActive(folder: NoteFolder, currentPath: string) {
  return currentPath.startsWith(`${folder.path}/`);
}

function normalizeView(view: string, path: string): { view: ViewName; path: string } {
  if (view === "notes" || view === "resume" || view === "todo" || view === "home") {
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
          登录后进入个人工作台，选择文档、简历或 Todo 组件。
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
  icon: typeof BookOpen;
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
  index,
  todoCount,
  onOpen
}: {
  user: AuthUser;
  index: NotesIndex | null;
  todoCount: number;
  onOpen: (view: ViewName) => void;
}) {
  const recentFiles = index?.files.filter((file) => !file.hidden).slice(0, 5) ?? [];

  return (
    <section className="home-view">
      <div className="page-heading">
        <p>Valentin 的个人网站</p>
        <h1>{user.displayName} 的工作台</h1>
      </div>

      <div className="component-grid">
        <ComponentCard
          icon={BookOpen}
          title="Codex Desktop 使用技巧"
          meta={`${index?.count ?? 0} 篇文档`}
          body="阅读、搜索、按目录访问 Markdown 知识库。"
          onOpen={() => onOpen("notes")}
        />
        <ComponentCard
          icon={BriefcaseBusiness}
          title="个人简历"
          meta="Profile"
          body="个人简介、技能栈、项目经历和联系方式。"
          onOpen={() => onOpen("resume")}
        />
        <ComponentCard
          icon={ListTodo}
          title="Todo List"
          meta={`${todoCount} 个待办`}
          body="记录当前浏览器中的个人待办事项。"
          onOpen={() => onOpen("todo")}
        />
      </div>

      <div className="home-section">
        <div className="section-heading">
          <h2>最近文档</h2>
          <span>Codex Desktop</span>
        </div>
        <div className="quick-list">
          {recentFiles.map((file) => (
            <button key={file.path} onClick={() => (window.location.hash = routeFor(file.path))}>
              <FileText size={16} />
              <span>{file.title}</span>
              <small>{file.path}</small>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function ResumeView() {
  return (
    <section className="resume-view">
      <div className="page-heading">
        <p>Resume</p>
        <h1>Valentin</h1>
      </div>

      <div className="resume-layout">
        <section className="resume-main">
          <h2>个人简介</h2>
          <p>
            关注 AI 工具、自动化工作流、前端体验和知识管理。擅长把复杂信息整理成结构清晰、可持续维护的系统。
          </p>

          <h2>项目经历</h2>
          <div className="timeline">
            <div>
              <strong>Valentin 的个人网站</strong>
              <span>受保护的个人知识站点，包含 Markdown 阅读器、简历展示和 Todo 管理。</span>
            </div>
            <div>
              <strong>Codex Desktop 使用技巧文档</strong>
              <span>系统整理 Codex Desktop 设置、计费、MCP、Skills、插件和实操流程。</span>
            </div>
            <div>
              <strong>Markdown 知识库阅读器</strong>
              <span>支持嵌套目录、全文搜索、相对资源、受保护访问和管理员编辑。</span>
            </div>
          </div>
        </section>

        <aside className="resume-side">
          <h2>技能方向</h2>
          <div className="tag-list">
            <span>React</span>
            <span>TypeScript</span>
            <span>Vite</span>
            <span>Markdown</span>
            <span>AI Workflow</span>
            <span>Vercel</span>
          </div>

          <h2>联系方式</h2>
          <p>GitHub: valentine-zjy</p>
          <p>Website: valentin-site1.vercel.app</p>
        </aside>
      </div>
    </section>
  );
}

function TodoView({
  user
}: {
  user: AuthUser;
}) {
  const storageKey = `valentin.todos.${user.username}`;
  const [items, setItems] = useState<TodoItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? "[]") as TodoItem[];
    } catch {
      return [];
    }
  });
  const [text, setText] = useState("");

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(items));
  }, [items, storageKey]);

  function addTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = text.trim();
    if (!value) {
      return;
    }
    setItems((current) => [
      {
        id: crypto.randomUUID(),
        text: value,
        done: false,
        createdAt: Date.now()
      },
      ...current
    ]);
    setText("");
  }

  const openCount = items.filter((item) => !item.done).length;
  const doneCount = items.length - openCount;

  return (
    <section className="todo-view">
      <div className="page-heading">
        <p>Todo List</p>
        <h1>今日事项</h1>
      </div>

      <form className="todo-form" onSubmit={addTodo}>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="新增待办事项"
        />
        <button className="primary-button">添加</button>
      </form>

      <div className="todo-stats">
        <span>{openCount} 个进行中</span>
        <span>{doneCount} 个已完成</span>
      </div>

      <div className="todo-list">
        {items.length === 0 ? (
          <div className="empty-state">暂无待办事项</div>
        ) : (
          items.map((item) => (
            <div className={`todo-item ${item.done ? "done" : ""}`} key={item.id}>
              <button
                className="todo-check"
                onClick={() =>
                  setItems((current) =>
                    current.map((entry) =>
                      entry.id === item.id ? { ...entry, done: !entry.done } : entry
                    )
                  )
                }
                aria-label={item.done ? "标记为未完成" : "标记为已完成"}
              >
                {item.done ? <Check size={16} /> : <Circle size={16} />}
              </button>
              <span>{item.text}</span>
              <button
                className="icon-button"
                onClick={() =>
                  setItems((current) => current.filter((entry) => entry.id !== item.id))
                }
                aria-label="删除待办"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>
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
    try {
      const items = JSON.parse(
        localStorage.getItem(`valentin.todos.${user.username}`) ?? "[]"
      ) as TodoItem[];
      return items.filter((item) => !item.done).length;
    } catch {
      return 0;
    }
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

  return (
    <div className={`site-shell markdown-theme-${markdownTheme}`}>
      <aside className={`site-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <LayoutDashboard size={22} />
          </div>
          <div>
            <strong>Valentin</strong>
            <span>个人网站</span>
          </div>
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
          <button className={view === "notes" ? "active" : ""} onClick={() => navigate("notes")}>
            <BookOpen size={17} />
            <span>Codex 文档</span>
          </button>
          <button className={view === "resume" ? "active" : ""} onClick={() => navigate("resume")}>
            <BriefcaseBusiness size={17} />
            <span>个人简历</span>
          </button>
          <button className={view === "todo" ? "active" : ""} onClick={() => navigate("todo")}>
            <ListTodo size={17} />
            <span>Todo List</span>
          </button>
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
          <label>
            <FileText size={15} />
            <span>文档风格</span>
            <select
              value={markdownTheme}
              onChange={(event) => setMarkdownTheme(event.target.value as MarkdownTheme)}
            >
              {markdownThemes.map((theme) => (
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
          <div className="user-avatar">
            <User size={16} />
          </div>
          <div>
            <strong>{user.displayName}</strong>
            <span>
              {user.role === "admin" ? "管理员" : "查看用户"} · 优先级 {user.priority}
            </span>
          </div>
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
            <span>
              {view === "home"
                ? "Dashboard"
                : view === "notes"
                  ? activeFile?.path ?? "Codex 文档"
                  : view === "resume"
                    ? "Resume"
                    : "Todo List"}
            </span>
            <strong>
              {view === "home"
                ? "首页"
                : view === "notes"
                  ? activeFile?.title ?? "Codex Desktop 使用技巧"
                  : view === "resume"
                    ? "个人简历"
                    : "Todo List"}
            </strong>
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
          <HomeView user={user} index={index} todoCount={todoCount} onOpen={navigate} />
        ) : null}

        {view === "resume" ? <ResumeView /> : null}

        {view === "todo" ? <TodoView user={user} /> : null}

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
    </div>
  );
}

export default App;
