import fs from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const defaultSource = path.resolve(rootDir, "..", "codex使用技巧");
const sourceDir = path.resolve(
  process.argv[2] ?? process.env.NOTES_SOURCE ?? defaultSource
);
const targetDir = path.resolve(
  rootDir,
  "content",
  "knowledge-planet",
  "Valentin",
  "codex-desktop-guide"
);
const contentDir = path.resolve(rootDir, "content");

const ignoredNames = new Set([".git", "node_modules", "dist", ".vercel"]);

function assertInside(parent, child, label) {
  const relative = path.relative(parent, child);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} must stay inside ${parent}`);
  }
}

async function copyRecursive(source, target) {
  const stat = await fs.stat(source);

  if (stat.isDirectory()) {
    await fs.mkdir(target, { recursive: true });
    const entries = await fs.readdir(source, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith(".") || ignoredNames.has(entry.name)) {
        continue;
      }

      await copyRecursive(
        path.join(source, entry.name),
        path.join(target, entry.name)
      );
    }
    return;
  }

  if (stat.isFile()) {
    await fs.copyFile(source, target);
    await fs.utimes(target, stat.atime, stat.mtime);
  }
}

async function main() {
  const sourceStat = await fs.stat(sourceDir).catch(() => null);
  if (!sourceStat?.isDirectory()) {
    throw new Error(`Source directory does not exist: ${sourceDir}`);
  }

  assertInside(contentDir, targetDir, "Target directory");

  if (path.normalize(sourceDir) === path.normalize(targetDir)) {
    throw new Error("Source and target directories must be different");
  }

  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });
  await copyRecursive(sourceDir, targetDir);

  console.log(`Synced notes from ${sourceDir}`);
  console.log(`Synced notes to   ${targetDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
