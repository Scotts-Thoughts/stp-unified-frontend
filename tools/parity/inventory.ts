/**
 * Static inventory of every mapper path a source tree touches, split into reads and
 * writes. This is the input to a generation's MapperProfile (plan sections 1.4 and 2.3)
 * and to the write-log oracle, and it is what docs/genN-inventory.md is generated from.
 *
 *   npx tsx tools/parity/inventory.ts <source-dir> [--gen=gen1] [--out=docs/gen1-inventory.md] [--json=<file>]
 *
 * It reads the code rather than a running app on purpose: a path that only a rare state
 * reaches would never show up in a fixture, but it still has to be in the profile.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { extname, join, relative, resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";

const SOURCE_EXTENSIONS = new Set([".js", ".ts", ".vue", ".html", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "out", "dist", "splits", "images", "fonts", "public"]);

/** Files whose paths are data, not behaviour (dex/trainer/move tables), plus the
 *  mapper client itself -- its own `mapper.properties.map(...)` is not a mapper path. */
const SKIP_FILE = /(pokedex|trainers?|moves|tmhm|default_style_settings|cross_generation|gameHookMapperClient)/i;

/**
 * Directories and files the plan deletes in Phase 1.3 because nothing imports them.
 * Paths that only appear here are reported separately: they do not belong in a
 * MapperProfile, and they must not be mistaken for coverage gaps.
 *
 * This is gen1's rule. gen3's `methods/` is live -- its functions are mixed into the
 * component's `methods` (tools/port/lift-gen3.py step 13) -- so for gen3 only the
 * files it has no equivalent of count as dead (`isDeadOnly` takes the generation).
 */
const DEAD_SOURCE = /^(methods\/|logic\/temp\/|settings\/pokemon_settings|createWatchedObject|data\/deprecated_autosplitter|data\/keyhook|battle_summaries\/)/;
const DEAD_SOURCE_GEN3 = /^(logic\/temp\/|createWatchedObject|data\/deprecated_autosplitter|data\/keyhook|battle_summaries\/)/;

export type Access = "read" | "write-value" | "write-bytes" | "write-bits" | "freeze" | "subscribe";

export interface PathUse {
  path: string;
  accesses: Set<Access>;
  sites: { file: string; line: number; access: Access }[];
}

/** True when every site is in a file the plan deletes. */
export function isDeadOnly(use: PathUse, gen = "gen1"): boolean {
  const rule = gen === "gen3" ? DEAD_SOURCE_GEN3 : DEAD_SOURCE;
  return use.sites.every((s) => rule.test(s.file));
}

export interface Inventory {
  root: string;
  files: number;
  paths: PathUse[];
  /** Paths built at runtime from a variable segment; they need a profile entry too. */
  dynamic: { file: string; line: number; expression: string }[];
}

/**
 * `<root>.a.b[0].c` and `<root>.a?.b?.c`, ending at the first non-path token. The
 * suffix (`.value`, `.set(`, ...) says what kind of access it is.
 *
 * Two roots reach the mapper tree in gen1: `mapper.properties`, and the
 * `game_properties` that `components/frontend.js` provides to every panel. Matching
 * only the first hides every write the settings panels make -- `\bproperties` cannot
 * match inside `game_properties`, because `_` is a word character.
 */
const CHAIN =
  /(?:\bgame_properties|\bproperties)\s*((?:\s*(?:\?\.|\.)\s*[A-Za-z_$][\w$]*|\s*\[\s*(?:\d+|["'][^"']+["'])\s*\])+)/g;
const SEGMENT = /(?:\?\.|\.)\s*([A-Za-z_$][\w$]*)|\[\s*(?:(\d+)|["']([^"']+)["'])\s*\]/g;

/** Terminal members that are the property API, not further path segments. */
const TERMINALS: Record<string, Access> = {
  value: "read",
  bytes: "read",
  address: "read",
  length: "read",
  type: "read",
  reference: "read",
  bits: "read",
  description: "read",
  isFrozen: "read",
  isReadOnly: "read",
  fieldsChanged: "read",
  memoryContainer: "read",
  size: "read",
  toString: "read",
  set: "write-value",
  setBytes: "write-bytes",
  freeze: "freeze",
  change: "subscribe",
  once: "subscribe",
};

export function inventory(root: string): Inventory {
  const byPath = new Map<string, PathUse>();
  const dynamic: Inventory["dynamic"] = [];
  let files = 0;

  for (const file of walk(root)) {
    if (SKIP_FILE.test(file)) continue;
    files++;
    const text = readFileSync(file, "utf8");
    const rel = relative(root, file).replaceAll("\\", "/");
    const lineStarts = lineIndex(text);

    for (const match of text.matchAll(CHAIN)) {
      const segments: string[] = [];
      let access: Access = "read";
      SEGMENT.lastIndex = 0;
      for (const seg of match[1].matchAll(SEGMENT)) {
        const name = seg[1] ?? seg[2] ?? seg[3];
        if (seg[1] && name in TERMINALS && segments.length > 0) {
          access = TERMINALS[name];
          break;
        }
        segments.push(name);
      }
      if (segments.length === 0) continue;
      const path = segments.join(".");
      record(byPath, path, { file: rel, line: lineAt(lineStarts, match.index ?? 0), access });
    }

    // setBits([{ path: "patch.x", ... }]) writes; the same `path:` key is also used by
    // plain data tables (battle_summary.ts, stats.vue), which only ever read. Only the
    // literals inside a setBits argument list count as writes.
    for (const call of text.matchAll(/setBits\s*\(/g)) {
      const block = balanced(text, (call.index ?? 0) + call[0].length - 1);
      for (const item of block.matchAll(/path\s*:\s*["'`]([A-Za-z_$][\w$.]*)["'`]/g)) {
        record(byPath, stripTerminal(item[1]), {
          file: rel,
          line: lineAt(lineStarts, (call.index ?? 0) + (item.index ?? 0)),
          access: "write-bits",
        });
      }
    }
    // Literal paths resolved at runtime (battle_summary's per-column `path`) are reads.
    for (const match of text.matchAll(/path\s*:\s*["'`]([A-Za-z_$][\w$]*(?:\.[\w$]+)+)["'`]/g)) {
      record(byPath, stripTerminal(match[1]), {
        file: rel,
        line: lineAt(lineStarts, match.index ?? 0),
        access: "read",
      });
    }
    for (const match of text.matchAll(/\.get\(\s*["'`]([A-Za-z_$][\w$.]*)["'`]\s*\)/g)) {
      record(byPath, match[1], { file: rel, line: lineAt(lineStarts, match.index ?? 0), access: "read" });
    }
    // A path assembled from a variable cannot be listed statically, but the profile
    // still needs to cover it, so report the site.
    for (const match of text.matchAll(/\bproperties\s*\[\s*[^\]"'\d][^\]]*\]/g)) {
      dynamic.push({
        file: rel,
        line: lineAt(lineStarts, match.index ?? 0),
        expression: match[0].replace(/\s+/g, " ").slice(0, 120),
      });
    }
    for (const match of text.matchAll(/\bproperties(?:\.[\w$]+)*\s*\[\s*(?![\d"'])[^\]]+\]/g)) {
      const expr = match[0].replace(/\s+/g, " ").slice(0, 120);
      if (!dynamic.some((d) => d.expression === expr && d.file === rel)) {
        dynamic.push({ file: rel, line: lineAt(lineStarts, match.index ?? 0), expression: expr });
      }
    }
  }

  return {
    root,
    files,
    paths: [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path)),
    dynamic,
  };
}

function record(into: Map<string, PathUse>, path: string, site: { file: string; line: number; access: Access }): void {
  let use = into.get(path);
  if (!use) {
    use = { path, accesses: new Set(), sites: [] };
    into.set(path, use);
  }
  use.accesses.add(site.access);
  use.sites.push(site);
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(join(dir, entry.name));
    } else if (SOURCE_EXTENSIONS.has(extname(entry.name)) && statSync(join(dir, entry.name)).isFile()) {
      yield join(dir, entry.name);
    }
  }
}

/** Trailing `.value`/`.bytes` on a literal path is the field, not a path segment. */
function stripTerminal(path: string): string {
  return path.replace(/\.(value|bytes|isFrozen|isReadOnly|address|length|type|reference|bits|description)$/, "");
}

/** Returns the source between a "(" or "[" at `open` and its matching close. */
function balanced(text: string, open: number): string {
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const close = pairs[text[open]];
  if (!close) return "";
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === text[open]) depth++;
    else if (text[i] === close && --depth === 0) return text.slice(open, i + 1);
  }
  return text.slice(open);
}

function lineIndex(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  return starts;
}

function lineAt(starts: number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

export function isWrite(use: PathUse): boolean {
  return [...use.accesses].some((a) => a.startsWith("write") || a === "freeze");
}

export function toMarkdown(inv: Inventory, gen: string): string {
  const live = inv.paths.filter((p) => !isDeadOnly(p, gen));
  const dead = inv.paths.filter((p) => isDeadOnly(p, gen));
  const reads = live.filter((p) => !isWrite(p));
  const writes = live.filter(isWrite);
  const subscriptions = live.filter((p) => p.accesses.has("subscribe"));
  const byNamespace = new Map<string, number>();
  for (const p of live) {
    const ns = p.path.split(".")[0];
    byNamespace.set(ns, (byNamespace.get(ns) ?? 0) + 1);
  }

  const lines: string[] = [];
  lines.push(`# ${gen} mapper inventory`);
  lines.push("");
  lines.push(
    `Generated by \`tools/parity/inventory.ts\` from \`${inv.root.replaceAll("\\", "/")}\` ` +
      `(${inv.files} source files). It is the source for ${gen}'s \`MapperProfile\` ` +
      "(plan section 1.4 / 2.3) and for the write-log oracle.",
  );
  lines.push("");
  lines.push(
    `**${live.length} live paths** — ${reads.length} read-only, ${writes.length} written, ` +
      `${subscriptions.length} with \`.change()\`/\`.once()\` subscriptions` +
      (dead.length ? `, plus ${dead.length} reached only from files the plan deletes (listed at the end).` : "."),
  );
  lines.push("");
  lines.push("| Namespace | Paths |");
  lines.push("|---|---|");
  for (const [ns, count] of [...byNamespace].sort((a, b) => b[1] - a[1])) lines.push(`| \`${ns}\` | ${count} |`);
  lines.push("");

  lines.push("## Writes");
  lines.push("");
  lines.push("Every one of these must appear in the profile's `writes` map; the harness compares the write log call for call.");
  lines.push("");
  lines.push("| Path | Kind | Site |");
  lines.push("|---|---|---|");
  for (const w of writes) {
    const kinds = [...w.accesses].filter((a) => a.startsWith("write") || a === "freeze").join(", ");
    const site = w.sites.find((s) => s.access.startsWith("write") || s.access === "freeze")!;
    lines.push(`| \`${w.path}\` | ${kinds} | \`${site.file}:${site.line}\` |`);
  }
  lines.push("");

  if (subscriptions.length) {
    lines.push("## Change subscriptions");
    lines.push("");
    lines.push("These drive the state machine; a fixture that never changes one leaves that branch unverified.");
    lines.push("");
    lines.push("| Path | Site |");
    lines.push("|---|---|");
    for (const s of subscriptions) {
      const site = s.sites.find((x) => x.access === "subscribe")!;
      lines.push(`| \`${s.path}\` | \`${site.file}:${site.line}\` |`);
    }
    lines.push("");
  }

  if (inv.dynamic.length) {
    lines.push("## Paths built at runtime");
    lines.push("");
    lines.push("Static extraction cannot name these; the profile must cover the whole subtree they index into.");
    lines.push("");
    lines.push("| Expression | Site |");
    lines.push("|---|---|");
    for (const d of inv.dynamic) lines.push(`| \`${d.expression}\` | \`${d.file}:${d.line}\` |`);
    lines.push("");
  }

  if (dead.length) {
    lines.push("## Paths only reached from dead code");
    lines.push("");
    lines.push("Phase 1.3 deletes these files, so these paths do **not** go into the profile.");
    lines.push("");
    lines.push("| Path | Site |");
    lines.push("|---|---|");
    for (const d of dead) lines.push(`| \`${d.path}\` | \`${d.sites[0].file}:${d.sites[0].line}\` |`);
    lines.push("");
  }

  lines.push("## Reads");
  lines.push("");
  lines.push("| Path | Sites |");
  lines.push("|---|---|");
  for (const r of reads) {
    const first = r.sites[0];
    const more = r.sites.length > 1 ? ` (+${r.sites.length - 1})` : "";
    lines.push(`| \`${r.path}\` | \`${first.file}:${first.line}\`${more} |`);
  }
  lines.push("");
  return lines.join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const root = argv.find((a) => !a.startsWith("--"));
  if (!root) {
    console.error("usage: inventory.ts <source-dir> [--gen=gen1] [--out=docs/gen1-inventory.md] [--json=file]");
    process.exit(2);
  }
  const flag = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
  const gen = flag("gen") ?? "gen1";
  const inv = inventory(resolve(root));
  const out = flag("out");
  if (out) {
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(resolve(out), toMarkdown(inv, gen));
    console.log(`wrote ${out}`);
  }
  const json = flag("json");
  if (json) {
    mkdirSync(dirname(resolve(json)), { recursive: true });
    writeFileSync(
      resolve(json),
      JSON.stringify(
        { root: inv.root, files: inv.files, dynamic: inv.dynamic, paths: inv.paths.map((p) => ({ path: p.path, accesses: [...p.accesses], sites: p.sites })) },
        null,
        1,
      ),
    );
    console.log(`wrote ${json}`);
  }
  console.log(
    `${gen}: ${inv.paths.length} paths (${inv.paths.filter((p) => !isWrite(p)).length} read, ` +
      `${inv.paths.filter(isWrite).length} written), ${inv.dynamic.length} dynamic, from ${inv.files} files`,
  );
}
