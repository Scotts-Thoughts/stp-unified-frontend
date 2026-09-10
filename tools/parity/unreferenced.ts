/**
 * Lists source files nothing else in the tree names.
 *
 *   npx tsx tools/parity/unreferenced.ts <source-dir> [--entry=a,b]
 *
 * Phase 1.3 and every Phase 2.1 inventory need a do-not-copy list, and the plan's list
 * was assembled by hand. This checks it: a file counts as referenced if any *other*
 * file mentions its basename inside a quoted string, which is deliberately generous --
 * a false "referenced" is safe, a false "unreferenced" would delete live code.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { pathToFileURL } from "node:url";

const SOURCE_EXTENSIONS = new Set([".ts", ".js", ".vue", ".mjs", ".cjs", ".html", ".css"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "out", "dist", "public", "fonts", "images"]);
const DEFAULT_ENTRIES = ["main.ts", "index.html", "index.d.ts", "env.d.ts"];

export function unreferenced(root: string, entries = DEFAULT_ENTRIES): { file: string; bytes: number }[] {
  const files: string[] = [];
  (function walk(dir: string) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(p);
      } else if (SOURCE_EXTENSIONS.has(extname(e.name)) || !extname(e.name)) {
        files.push(p.replaceAll("\\", "/"));
      }
    }
  })(root);

  const texts = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));
  const out: { file: string; bytes: number }[] = [];

  for (const file of files) {
    const name = basename(file);
    if (entries.includes(name)) continue;
    const stem = name.replace(/\.(ts|js|vue|mjs|cjs|html|css)$/, "");
    // ["']  optional directory prefix  stem  optional extension  ["']
    // The prefix has to be spelled out rather than anchored with ^, which would only
    // ever match at position 0 of the whole file (that hid index.html's stylesheet link).
    const quoted = new RegExp(`["'\`](?:[^"'\`]*/)?${escapeRegExp(stem)}(?:\\.(?:ts|js|vue|mjs|cjs|html|css))?["'\`]`);
    let referenced = false;
    for (const [other, text] of texts) {
      if (other === file) continue;
      if (quoted.test(text)) {
        referenced = true;
        break;
      }
    }
    if (!referenced) out.push({ file, bytes: statSync(file).size });
  }
  return out.sort((a, b) => b.bytes - a.bytes);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const root = argv.find((a) => !a.startsWith("--")) ?? "src/renderer";
  const entries = argv.find((a) => a.startsWith("--entry="))?.split("=")[1]?.split(",") ?? DEFAULT_ENTRIES;
  const found = unreferenced(root, entries);
  console.log(`${found.length} unreferenced file(s) under ${root} (entry points: ${entries.join(", ")})`);
  let total = 0;
  for (const f of found) {
    total += f.bytes;
    console.log(`  ${String(f.bytes).padStart(9)}  ${f.file}`);
  }
  console.log(`  ${String(total).padStart(9)}  total`);
}
