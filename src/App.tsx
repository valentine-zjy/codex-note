import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  Folder,
  Menu,
  PanelLeftClose,
  Search,
  X
} from "lucide-react";
import { renderMarkdown } from "./markdown";
import {
  formatBytes,
  noteUrl,
  parseRoute,
  routeFor
} from "./path-utils";
import type { Heading, NoteFile, NoteFolder, NoteNode, NotesIndex } from "./types";

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
    return <div className="empty-state">没有匹配的 Markdown 文件</div>;
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

function App() {
  const [index, setIndex] = useState<NotesIndex | null>(null);
  const [activePath, setActivePath] = useState("");
  const [routeAnchor, setRouteAnchor] = useState("");
  const [markdownSource, setMarkdownSource] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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

  function openNote(path: string, hash = "") {
    window.location.hash = routeFor(path, hash);
    setSidebarOpen(false);
  }

  useEffect(() => {
    fetch("/notes-index.json")
      .then((response) => {
        if (!response.ok) {
          throw new Error("无法加载 Markdown 索引");
        }
        return response.json() as Promise<NotesIndex>;
      })
      .then((payload) => {
        setIndex(payload);
        const route = parseRoute();
        const nextPath = route.path || payload.defaultPath;
        setActivePath(nextPath);
        setRouteAnchor(route.anchor);

        if (!route.path && nextPath) {
          history.replaceState(null, "", routeFor(nextPath));
        }
      })
      .catch((error) => {
        console.error(error);
      });
  }, []);

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
    if (!activePath) {
      return;
    }

    setLoading(true);
    fetch(noteUrl(activePath))
      .then((response) => {
        if (!response.ok) {
          throw new Error(`无法加载 ${activePath}`);
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
  }, [activePath]);

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

  function handleContentClick(event: React.MouseEvent<HTMLDivElement>) {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>(
      "a[data-note-path]"
    );

    if (!link) {
      return;
    }

    event.preventDefault();
    openNote(link.dataset.notePath ?? "", link.dataset.noteHash ? `#${link.dataset.noteHash}` : "");
  }

  function copyPath() {
    if (!activePath) {
      return;
    }
    void navigator.clipboard?.writeText(activePath);
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

  const updatedText = activeFile
    ? new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(new Date(activeFile.updatedAt))
    : "";

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <BookOpen size={22} />
          </div>
          <div>
            <strong>Codex Notes</strong>
            <span>Markdown 阅读器</span>
          </div>
          <button
            className="icon-button mobile-only"
            onClick={() => setSidebarOpen(false)}
            aria-label="关闭目录"
          >
            <X size={18} />
          </button>
        </div>

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
          <span>只读浏览</span>
        </div>

        <div className="tree-scroll">
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
            <strong>{activeFile?.title ?? "Codex Notes"}</strong>
          </div>
          <div className="reader-actions">
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
              <span>服务器文件驱动</span>
            </div>
            {loading ? (
              <div className="loading-state">正在加载 Markdown...</div>
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
