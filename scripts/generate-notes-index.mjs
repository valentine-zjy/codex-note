import fs from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const notesDir = path.join(rootDir, "public", "notes");
const outputFile = path.join(rootDir, "public", "notes-index.json");

const collator = new Intl.Collator("zh-CN", {
  numeric: true,
  sensitivity: "base"
});

const hiddenDirectoryNames = new Set(["assets"]);
const allFiles = [];

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

async function walkDirectory(dir, relativeDir = "", hidden = false) {
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
      const folderChildren = await walkDirectory(absolute, relativePath, nextHidden);
      if (!nextHidden && folderChildren.length > 0) {
        children.push({
          type: "folder",
          name: entry.name,
          title: entry.name,
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
    const file = {
      type: "file",
      name: entry.name,
      title: readTitle(content, entry.name),
      path: relativePath,
      excerpt: excerpt(content),
      searchText: toSearchText(`${readTitle(content, entry.name)} ${relativePath} ${content}`),
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

function latestTimestamp(files) {
  const latest = files
    .map((file) => new Date(file.updatedAt).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];

  return new Date(latest || 0).toISOString();
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

async function main() {
  await fs.access(notesDir);
  const tree = await walkDirectory(notesDir);
  const visibleFiles = flattenFiles(tree);
  const files = [...allFiles].sort((a, b) => collator.compare(a.path, b.path));

  const payload = {
    generatedAt: latestTimestamp(files),
    root: "notes",
    count: visibleFiles.length,
    hiddenCount: files.length - visibleFiles.length,
    defaultPath:
      visibleFiles.find((file) => file.path.toLowerCase() === "readme.md")?.path ??
      visibleFiles[0]?.path ??
      "",
    tree,
    files
  };

  await fs.writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Generated ${files.length} markdown entries at ${outputFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
