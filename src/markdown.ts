import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import type { Heading } from "./types";
import {
  encodePath,
  noteUrl,
  resolveRelativePath,
  routeFor
} from "./path-utils";

const markdown = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true
});

const defaultImageRule =
  markdown.renderer.rules.image ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

const defaultLinkOpenRule =
  markdown.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

function attrSet(token: Token, name: string, value: string) {
  token.attrSet(name, value);
}

markdown.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const src = token.attrGet("src") ?? "";
  const currentPath = String(env.currentPath ?? "");
  const resolved = resolveRelativePath(src, currentPath);

  if (resolved) {
    attrSet(token, "src", `/notes/${encodePath(resolved.path)}${resolved.hash}`);
  }

  attrSet(token, "loading", "lazy");
  attrSet(token, "decoding", "async");
  return defaultImageRule(tokens, idx, options, env, self);
};

markdown.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const href = token.attrGet("href") ?? "";
  const currentPath = String(env.currentPath ?? "");
  const resolved = resolveRelativePath(href, currentPath);

  if (resolved && resolved.path.toLowerCase().endsWith(".md")) {
    attrSet(token, "href", routeFor(resolved.path, resolved.hash));
    attrSet(token, "data-note-path", resolved.path);
    if (resolved.hash) {
      attrSet(token, "data-note-hash", resolved.hash.slice(1));
    }
  } else if (/^https?:\/\//i.test(href)) {
    attrSet(token, "target", "_blank");
    attrSet(token, "rel", "noreferrer");
  } else if (resolved && !resolved.path.toLowerCase().endsWith(".md")) {
    attrSet(token, "href", noteUrl(resolved.path));
    attrSet(token, "target", "_blank");
    attrSet(token, "rel", "noreferrer");
  }

  return defaultLinkOpenRule(tokens, idx, options, env, self);
};

function slugify(text: string, fallback: string) {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return slug || fallback;
}

export function renderMarkdown(source: string, currentPath: string) {
  const rawHtml = markdown.render(source, { currentPath });
  const parser = new DOMParser();
  const document = parser.parseFromString(rawHtml, "text/html");
  const headings: Heading[] = [];
  const seen = new Map<string, number>();

  document.querySelectorAll("h1, h2, h3").forEach((heading, index) => {
    const text = heading.textContent?.trim() ?? "";
    if (!text) {
      return;
    }

    const base = slugify(text, `heading-${index + 1}`);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);

    const id = count === 0 ? base : `${base}-${count + 1}`;
    heading.setAttribute("id", id);
    headings.push({
      id,
      text,
      level: Number(heading.tagName.slice(1))
    });
  });

  const clean = DOMPurify.sanitize(document.body.innerHTML, {
    ADD_ATTR: [
      "target",
      "rel",
      "loading",
      "decoding",
      "data-note-path",
      "data-note-hash"
    ]
  });

  return {
    html: clean,
    headings
  };
}
