export function encodePath(path: string) {
  return path
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export function normalizeNotePath(path: string) {
  const segments = path.split("/");
  const stack: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      stack.pop();
      continue;
    }
    stack.push(segment);
  }

  return stack.join("/");
}

export function dirname(path: string) {
  const index = path.lastIndexOf("/");
  return index >= 0 ? path.slice(0, index + 1) : "";
}

export function resolveRelativePath(target: string, currentPath: string) {
  if (/^(https?:|mailto:|tel:|#|codex:)/i.test(target)) {
    return null;
  }

  const [pathPart, hashPart] = target.split("#");
  if (!pathPart) {
    return null;
  }

  const resolved = normalizeNotePath(`${dirname(currentPath)}${pathPart}`);
  return {
    path: resolved,
    hash: hashPart ? `#${hashPart}` : ""
  };
}

export function noteUrl(path: string) {
  return `/api/note?path=${encodeURIComponent(path)}`;
}

export function assetUrl(path: string) {
  return `/api/asset?path=${encodeURIComponent(path)}`;
}

export function routeFor(path: string, hash = "") {
  return `#/${encodePath(path)}${hash}`;
}

export function parseRoute() {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const hashIndex = raw.indexOf("#");
  const encodedPath = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const anchor = hashIndex >= 0 ? raw.slice(hashIndex + 1) : "";

  return {
    path: encodedPath ? decodeURIComponent(encodedPath) : "",
    anchor
  };
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
