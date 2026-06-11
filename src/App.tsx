import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, MouseEvent } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  Folder,
  LogOut,
  Menu,
  PanelLeftClose,
  Save,
  Search,
  ShieldCheck,
  User,
  X
} from "lucide-react";
import { renderMarkdown } from "./markdown";
import { formatBytes, noteUrl, parseRoute, routeFor } from "./path-utils";
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

function findFile(files: NoteFile[], path: string) {
  return files.find((file) => file.path === path);
}

function isFolderActive(folder: NoteFolder, currentPath: string) {
  return currentPath.startsWith(`${folder.path}/`);
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
          <BookOpen size={28} />
        </div>
        <p className="auth-eyebrow">Valentin 的个人网站</p>
        <h1>访问受保护内容</h1>
        <p className="auth-copy">
          Codex Desktop 使用技巧是站内组件，需要使用本地配置中的账号登录。
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

function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [index, setIndex] = useState<NotesIndex | null>(null);
  const [activePath, setActivePath] = useState("");
  const [routeAnchor, setRouteAnchor] = useState("");
  const [markdownSource, setMarkdownSource] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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

  async function loadIndex(preferredPath?: string) {
    const payload = await requestJson<NotesIndexPayload>("/api/notes-index");
    setIndex(payload);
    if (payload.user) {
      setUser(payload.user);
    }

    const route = parseRoute();
    const requestedPath = preferredPath ?? route.path;
    const nextPath =
      requestedPath && payload.files.some((file) => file.path === requestedPath)
        ? requestedPath
        : payload.defaultPath;

    setActivePath(nextPath);
    setRouteAnchor(route.anchor);

    if (nextPath && route.path !== nextPath) {
      history.replaceState(null, "", routeFor(nextPath));
    }
  }

  function openNote(path: string, hash = "") {
    window.location.hash = routeFor(path, hash);
    setSidebarOpen(false);
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    setUser(null);
    setIndex(null);
    setMarkdownSource("");
    setActivePath("");
    setEditing(false);
    setNotice("");
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
      await loadIndex(activePath);
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

    setAppError("");
    loadIndex().catch((error) => {
      setAppError(error instanceof Error ? error.message : "无法加载文档索引");
    });
  }, [user?.username]);

  useEffect(() => {
    function handleHashChange() {
      const route = parseRoute();
      setActivePath(route.path || index?.defaultPath || "");
      setRouteAnchor(route.anchor);
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [index]);

  useEffect(() => {
    if (!activePath || !user) {
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
  }, [activePath, user]);

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
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <BookOpen size={22} />
          </div>
          <div>
            <strong>Valentin</strong>
            <span>个人网站</span>
          </div>
          <button
            className="icon-button mobile-only"
            onClick={() => setSidebarOpen(false)}
            aria-label="关闭目录"
          >
            <X size={18} />
          </button>
        </div>

        <div className="component-label">Codex Desktop 使用技巧</div>

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
      </aside>

      <div
        className={`sidebar-backdrop ${sidebarOpen ? "show" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      <main className="reader">
        <header className="reader-header">
          <button
            className="icon-button mobile-only"
            onClick={() => setSidebarOpen(true)}
            aria-label="打开目录"
          >
            <Menu size={19} />
          </button>
          <button
            className="icon-button desktop-only"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            aria-label="折叠目录"
          >
            <PanelLeftClose size={18} />
          </button>
          <div className="reader-title">
            <span>{activeFile?.path ?? "正在加载"}</span>
            <strong>{activeFile?.title ?? "Codex Desktop 使用技巧"}</strong>
          </div>
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
        </header>

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
      </main>
    </div>
  );
}

export default App;
