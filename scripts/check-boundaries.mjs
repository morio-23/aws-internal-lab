import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const roots = ["apps", "packages"];
const violations = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if ([".ts", ".tsx", ".js", ".mjs"].includes(extname(entry.name))) files.push(path);
  }
  return files;
}

for (const root of roots) {
  for (const file of await walk(root)) {
    const text = await readFile(file, "utf8");
    const normalized = relative(".", file).replaceAll("\\", "/");
    if (normalized.startsWith("packages/") && /from\s+["'][^"']*apps\//.test(text)) {
      violations.push(`${normalized}: package must not import app code`);
    }
    if (normalized.startsWith("apps/web/") && /from\s+["'][^"']*runtime\//.test(text)) {
      violations.push(`${normalized}: web must not import runtime implementation directly`);
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log("architecture boundaries: ok");
