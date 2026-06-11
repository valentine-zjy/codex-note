import fs from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const notesDir = path.join(rootDir, "public", "notes");
const outputFile = path.join(rootDir, "public", "notes-index.json");

const collator = new Intl.Collator("zh-CN", {
  numeric: true,
  sensitivity: "base"
});

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

function excerpt(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[[^\]]+]\([^)]*\)/g, " ")
    .replace(/[#>*_`|~\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

async function walkDirectory(dir, relativeDir = "") {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const children = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const absolute = path.join(dir, entry.name);
    const relativePath = toPosix(path.join(relativeDir, entry.name));

    if (entry.isDirectory()) {
      const folderChildren = await walkDirectory(absolute, relativePath);
      if (folderChildren.length > 0) {
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
    children.push({
      type: "file",
      name: entry.name,
      title: readTitle(content, entry.name),
      path: relativePath,
      excerpt: excerpt(content),
      size: stat.size,
      updatedAt: stat.mtime.toISOString()
    });
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

async function main() {
  await fs.access(notesDir);
  const tree = await walkDirectory(notesDir);
  const files = flattenFiles(tree);

  const payload = {
    generatedAt: new Date().toISOString(),
    root: "notes",
    count: files.length,
    defaultPath:
      files.find((file) => file.path.toLowerCase() === "readme.md")?.path ??
      files[0]?.path ??
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
