/**
 * Copies a legacy app's `<script src="lib/...">` data files into
 * `src/renderer/games/genN/data/` as ES modules (plan 2.2).
 *
 *   npx tsx tools/port/port-data.ts <legacy-app-dir> <gen> [--only=a.js,b.js] [--skip=x.js] [--asset-gen=gen2]
 *
 * The legacy files are classic scripts that define globals (`const g2MoveData = {...}`)
 * and are loaded by `<script>` tags in the legacy index.html; the unified app imports
 * them. The transformation is exactly one thing: every top-level `const|let|var NAME`
 * and `function NAME(` gets `export ` in front of it. Bodies are untouched except for
 * one thing: with --asset-gen, a string starting `images/` becomes `images/<gen>/`,
 * because the generation's tree sits next to gen1's images until Phase 4 merges the
 * trees (tools/port/lift_assets.py). Otherwise the files are data,
 * ported verbatim (decision 14: per-gen data verbatim now, consolidation only after
 * parity).
 *
 * Files are written as `.js`, not `.ts`: they are tens of thousands of lines of
 * literal tables, `allowJs` lets Vite bundle them, and leaving them out of `vue-tsc`
 * keeps the typecheck at seconds instead of minutes. The list of globals each file
 * exports is printed, because that is what the ported `frontend.js` has to import.
 *
 * The script tags are read from the legacy index.html so nothing unreferenced is
 * copied (known-legacy-bugs.md #15, #20, #27, #28: the orphan twins stay behind).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

const argv = process.argv.slice(2);
const legacyDir = resolve(argv[0] ?? "");
const gen = argv[1] ?? "";
if (!legacyDir || !gen) {
  console.error("usage: port-data.ts <legacy-app-dir> <gen> [--only=...] [--skip=...]");
  process.exit(2);
}
const only = argv.find((a) => a.startsWith("--only="))?.slice(7).split(",").filter(Boolean) ?? null;
const skip = new Set(argv.find((a) => a.startsWith("--skip="))?.slice(7).split(",").filter(Boolean) ?? []);
const assetGen = argv.find((a) => a.startsWith("--asset-gen="))?.slice("--asset-gen=".length) ?? "";

const REPO = resolve(import.meta.dirname, "..", "..");
const outDir = join(REPO, "src", "renderer", "games", gen, "data");
mkdirSync(outDir, { recursive: true });

const html = readFileSync(join(legacyDir, "index.html"), "utf-8");
const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"[^>]*>/g)].map((m) => m[1]);
const dataScripts = scripts.filter((s) => !/^https?:/.test(s) && !/^packages\//.test(s) && !/frontend\.js$/.test(s));

const TOP_LEVEL = /^(const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
const TOP_FUNC = /^function\s+([A-Za-z_$][\w$]*)\s*\(/gm;

const manifest: { file: string; out: string; globals: string[]; lines: number; rebased: number; imports: string[] }[] = [];
const seen = new Map<string, string>();
for (const rel of dataScripts) {
  const name = basename(rel);
  if (only && !only.includes(name)) continue;
  if (skip.has(name)) continue;
  // The path under lib/ is kept: gen4 ships lib/pokedex/platinum.js *and*
  // lib/trainers/platinum.js, and flattening to the basename silently overwrote one
  // with the other (found when the pokedex export vanished from the manifest).
  const sub = rel.replace(/^lib\//, "");
  if (seen.has(sub)) throw new Error(`${rel} and ${seen.get(sub)} would both land at data/${sub}`);
  seen.set(sub, rel);
  const src = join(legacyDir, rel);
  if (!existsSync(src)) {
    console.warn(`missing: ${rel}`);
    continue;
  }
  let text = readFileSync(src, "utf-8");
  const globals: string[] = [];
  text = text.replace(TOP_LEVEL, (m, kw, id) => {
    globals.push(id);
    return `export ${kw} ${id}`;
  });
  text = text.replace(TOP_FUNC, (m, id) => {
    globals.push(id);
    return `export function ${id}(`;
  });
  let rebased = 0;
  if (assetGen) {
    // `images/` and gen2's `images\` (an escaped backslash in the source) alike.
    text = text.replace(/(["'`])images(?=\/|\\)/g, (_m, q) => {
      rebased++;
      return `${q}images/${assetGen}`;
    });
  }
  const out = join(outDir, sub);
  mkdirSync(join(out, ".."), { recursive: true });
  // A classic script sees every global the scripts before it defined; an ES module
  // sees only what it imports. gen4's game_variables.js reads `g4PokemonData` from
  // the file loaded six tags earlier, so a reference to another file's export (outside
  // a string literal) becomes an import of it -- in script order, which is the only
  // order the legacy page could have resolved it in.
  const withoutStrings = text.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""');
  const imports: string[] = [];
  for (const earlier of manifest) {
    const needed = earlier.globals.filter((g) => !globals.includes(g) && new RegExp(`\\b${g.replace(/\$/g, "\\$")}\\b`).test(withoutStrings));
    if (needed.length) {
      const from = relative(join(out, ".."), join(outDir, earlier.out.split("/data/")[1])).replace(/\\/g, "/");
      imports.push(`import { ${needed.join(", ")} } from "${from.startsWith(".") ? from : "./" + from}";`);
    }
  }
  if (imports.length) text = imports.join("\n") + "\n" + text;
  writeFileSync(out, text);
  manifest.push({ file: rel, out: `games/${gen}/data/${sub}`, globals, lines: text.split("\n").length, rebased, imports });
}

for (const m of manifest) {
  console.log(`${m.file.padEnd(40)} -> ${m.out.padEnd(44)} ${String(m.lines).padStart(8)} lines  exports: ${m.globals.join(", ") || "(none!)"}${m.rebased ? `  (${m.rebased} asset path(s) rebased)` : ""}${m.imports.length ? `  imports: ${m.imports.join(" ")}` : ""}`);
}
writeFileSync(join(outDir, "_manifest.json"), JSON.stringify(manifest, null, 1));
console.log(`\n${manifest.length} file(s) written to ${outDir}; manifest in _manifest.json`);
