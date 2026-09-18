/**
 * Cross-generation drift check for the lifted overlays (gens 2-5).
 *
 *   npx tsx tools/parity/drift-check.ts             check; exit 1 on unexplained drift
 *   npx tsx tools/parity/drift-check.ts --report    print every differing member as a diff
 *   npx tsx tools/parity/drift-check.ts --report <name>
 *   npx tsx tools/parity/drift-check.ts --update    rewrite the allowlist's fingerprints (keeps reasons)
 *   npx tsx tools/parity/drift-check.ts --strict    also fail while any allowlist entry is still UNREVIEWED
 *
 * The four `games/genN/Overlay.vue` files are Options-API components lifted verbatim
 * from four legacy apps that started as copies of one another. A change that belongs
 * in every generation is applied by hand to each file, and the one that is forgotten
 * looks exactly like the ones that were done: the method is still there, still under
 * the same name, and the harness only sees the states its fixture reaches. This check
 * makes the omission visible at the source level.
 *
 * Every `methods`, `computed` and `watch` member of each overlay is extracted by name.
 * A name that appears in two or more generations is compared body-for-body (comments
 * and whitespace ignored). Bodies that agree need nothing. Bodies that differ must be
 * listed in `drift-allowlist.json` with a reason -- "gen2's SpDef badge boost follows
 * the unboosted SpAtk (pokecrystal BadgeStatBoosts)" is a quirk, "gen5 stops polling a
 * dead Super Shuckie after ten failures" is a fix the other three are still owed -- and
 * the entry pins a fingerprint of every generation's body, so editing one copy of an
 * allowlisted member fails the check again until the edit reaches the others or the
 * entry is re-reviewed (`--update`). An entry whose bodies have become identical is
 * stale and fails too, so the allowlist is always the current inventory of intentional
 * differences and nothing else.
 *
 * Members that were identical everywhere live in the shared mixins under
 * `core/overlay/` (`mixins: [...]` in each overlay). An overlay that defines a member one
 * of its mixins also provides overrides it silently -- Vue takes the component's own --
 * so that is checked too: every override must be listed under `overrides` with a reason
 * and is pinned the same way.
 *
 * Not covered: `data()` defaults (they differ everywhere and rarely carry logic), the
 * lifecycle hooks (`created`/`mounted`/`unmounted` are each generation's own), and gen1,
 * whose overlay is the decomposed shape the others are meant to reach.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { undeclaredNames } from "../port/check-undefined";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const GENS = ["gen2", "gen3", "gen4", "gen5"] as const;
const SECTIONS = ["methods", "computed", "watch"] as const;
const ALLOWLIST_PATH = join(HERE, "drift-allowlist.json");

type Gen = (typeof GENS)[number];
type Section = (typeof SECTIONS)[number];

export interface Member {
  section: Section;
  name: string;
  /**
   * The member's source text, from its signature to just before the next member; for a
   * shorthand member that lists an imported function, that function's text.
   */
  source: string;
  /** The body alone -- name and spelling stripped (see `comparable`), comments removed, whitespace collapsed. */
  normalized: string;
  /** Twelve hex digits of the normalized body's SHA-1: what the allowlist pins. */
  fingerprint: string;
}

export interface AllowlistEntry {
  section: Section;
  name: string;
  /** One line: which generations agree, and why the odd one out is allowed to differ. */
  reason: string;
  /** Fingerprint per generation the member exists in, at the time the entry was reviewed. */
  bodies: Partial<Record<Gen, string>>;
}

/** An overlay's own definition of a member one of its mixins also provides; the overlay's wins. */
export interface OverrideEntry {
  gen: Gen;
  section: Section;
  name: string;
  mixin: string;
  reason: string;
  /** Fingerprint of the overlay's body at review time. */
  body: string;
}

interface Allowlist {
  $comment: string;
  entries: AllowlistEntry[];
  overrides?: OverrideEntry[];
}

// ---------------------------------------------------------------------------
// Extraction

/**
 * Classifies every character of `src`: 1 for code, 2 for the text of a string or
 * template literal (delimiters included; a `${...}` substitution is code again), 0 for a
 * line or block comment. Braces are counted only in code and comments are dropped
 * from what is compared, while strings are kept verbatim. Regex literals are not
 * recognised (a `/` outside a string is treated as division), so a regex containing a
 * quote or an unbalanced brace would mislead the walk; the per-generation member counts
 * printed by the check are the guard (they match a hand count of the sections).
 */
export function codeMask(src: string): Uint8Array {
  const mask = new Uint8Array(src.length);
  const n = src.length;
  /**
   * Scans code from `i`. With `stopAtBrace`, returns at the `}` that closes a template
   * substitution (`${ ... }`), whose inside is code again -- and may itself hold
   * another template literal, hence the recursion.
   */
  function scan(i: number, stopAtBrace: boolean): number {
    let depth = 0;
    while (i < n) {
      const c = src[i];
      const next = src[i + 1];
      if (c === "/" && next === "/") {
        const end = src.indexOf("\n", i);
        if (end < 0) return n;
        i = end;
        continue;
      }
      if (c === "/" && next === "*") {
        const end = src.indexOf("*/", i + 2);
        i = end < 0 ? n : end + 2;
        continue;
      }
      if (c === '"' || c === "'") {
        const start = i;
        i++;
        while (i < n && src[i] !== c && src[i] !== "\n") {
          if (src[i] === "\\") i++;
          i++;
        }
        i++;
        mask.fill(2, start, Math.min(i, n));
        continue;
      }
      if (c === "`") {
        mask[i] = 2;
        i++;
        while (i < n) {
          if (src[i] === "\\") { mask.fill(2, i, Math.min(i + 2, n)); i += 2; continue; }
          if (src[i] === "`") { mask[i] = 2; i++; break; }
          if (src[i] === "$" && src[i + 1] === "{") {
            mask[i] = 2;
            mask[i + 1] = 2;
            i = scan(i + 2, true);
            if (i < n) mask[i] = 2;
            i++;
            continue;
          }
          mask[i] = 2;
          i++;
        }
        continue;
      }
      if (stopAtBrace) {
        if (c === "{") depth++;
        else if (c === "}") {
          if (depth === 0) return i;
          depth--;
        }
      }
      mask[i] = 1;
      i++;
    }
    return n;
  }
  scan(0, false);
  return mask;
}

/** Drops comments (strings kept verbatim) and collapses whitespace. */
function normalize(src: string): string {
  const mask = codeMask(src);
  let out = "";
  for (let i = 0; i < src.length; i++) if (mask[i] !== 0) out += src[i];
  return out.replace(/\s+/g, " ").trim();
}

function fingerprint(normalized: string): string {
  return createHash("sha1").update(normalized).digest("hex").slice(0, 12);
}

/** The `<script>` block of an SFC, or the whole text when there is none. */
function scriptOf(sfc: string): string {
  // Line-anchored: the script itself mentions `<script src>` in a comment.
  const open = sfc.match(/^<script[^>]*>/m);
  if (!open || open.index === undefined) return sfc;
  const start = open.index + open[0].length;
  const end = sfc.search(/^<\/script>/m);
  return sfc.slice(start, end < 0 ? undefined : end);
}

/**
 * The text of a top-level option block (`    methods: {` at four spaces) up to but not
 * including its closing brace, found by brace-walking the code mask.
 */
function sectionBody(script: string, mask: Uint8Array, section: Section, indent = 4): string | null {
  const re = new RegExp(`^ {${indent}}${section}\\s*:\\s*\\{`, "m");
  let m: RegExpExecArray | null;
  let from = 0;
  while ((m = re.exec(script.slice(from))) !== null) {
    const at = from + m.index;
    if (mask[at] === 1) {
      const open = at + m[0].length - 1;
      let depth = 0;
      for (let i = open; i < script.length; i++) {
        if (mask[i] !== 1) continue;
        if (script[i] === "{") depth++;
        else if (script[i] === "}" && --depth === 0) return script.slice(open + 1, i);
      }
      return null;
    }
    from = at + m[0].length;
  }
  return null;
}

// A member's signature at eight spaces: `name(`, `async name(`, `name:`, `'a.b'(`, `"a.b":`, and
// the shorthand `name,` (a module-level function listed as a method).
const MEMBER_RE = /^ {8}(?:async\s+)?(['"]?)([\w$.\-]+)\1\s*(?:\(|:|,\s*$)/;

/**
 * The import map of an SFC's script: local name -> module specifier, for the shorthand
 * members (`padTime,`) that list an imported function as a method.
 */
function importsOf(script: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of script.matchAll(/^import\s+\{([^}]*)\}\s+from\s+["']([^"']+)["']/gm)) {
    for (const part of m[1].split(",")) {
      const [imported, local] = part.trim().split(/\s+as\s+/);
      if (imported) map.set((local ?? imported).trim(), m[2]);
    }
  }
  return map;
}

/** `export function <name>(...) {...}` in a module, from `(` to the closing brace, or null. */
function exportedFunction(modulePath: string, name: string): string | null {
  if (!existsSync(modulePath)) return null;
  const src = readFileSync(modulePath, "utf8");
  const m = new RegExp(`^export\\s+(?:async\\s+)?function\\s+${name.replace(/\$/g, "\\$")}\\s*\\(`, "m").exec(src);
  if (!m) return null;
  const mask = codeMask(src);
  const from = m.index + m[0].length - 1;
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    if (mask[i] !== 1) continue;
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(from, i + 1);
  }
  return null;
}

/**
 * What is compared: the member with its own name and spelling removed, so `padTime(t) {..}`,
 * `padTime: function (t) {..}` and a shorthand `padTime,` that lists `export function
 * padTime(t) {..}` from a module all read `(t) {..}`. A watcher's object form
 * (`x: { handler() {..}, deep: true }`) keeps its braces.
 */
function comparable(name: string, source: string, imports: Map<string, string>, sfcDir: string): { text: string; resolved: string } {
  const shorthand = /^\s*['"]?[\w$.\-]+['"]?\s*,?\s*$/.test(source);
  if (shorthand) {
    const specifier = imports.get(name);
    if (specifier && specifier.startsWith(".")) {
      const fn = exportedFunction(resolve(sfcDir, specifier), name);
      if (fn) return { text: normalize(fn), resolved: `${name}${fn}  // ${specifier}` };
    }
    return { text: normalize(source), resolved: source };
  }
  const quoted = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const text = normalize(source)
    .replace(new RegExp(`^(?:async\\s+)?['"]?${quoted}['"]?\\s*:?\\s*(?:async\\s+)?(?:function\\s*)?`), "")
    .replace(/,$/, "");
  return { text, resolved: source };
}

/**
 * Every member of every section of one overlay, in source order. `indent` is where the
 * option blocks sit: 4 in an overlay (`    methods: {`), 8 inside a factory mixin's
 * `return {`; members sit four deeper.
 */
export function extractMembers(sfc: string, sfcDir = ROOT, indent = 4): Member[] {
  const script = scriptOf(sfc);
  const mask = codeMask(script);
  const imports = importsOf(script);
  const members: Member[] = [];
  const memberRe = new RegExp(MEMBER_RE.source.replace("{8}", `{${indent + 4}}`));
  for (const section of SECTIONS) {
    const body = sectionBody(script, mask, section, indent);
    if (body === null) continue;
    const bodyMask = codeMask(body);
    const lines = body.split("\n");
    const starts: { name: string; offset: number }[] = [];
    let offset = 0;
    for (const line of lines) {
      const m = memberRe.exec(line);
      // The signature has to be code, not a line of a block comment or template literal.
      if (m && bodyMask[offset + indent + 4] === 1) starts.push({ name: m[2], offset });
      offset += line.length + 1;
    }
    starts.forEach((s, i) => {
      const end = i + 1 < starts.length ? starts[i + 1].offset : body.length;
      // Trailing blank and comment-only lines belong to the next member (its doc block).
      const source = body
        .slice(s.offset, end)
        .replace(/(\n[ \t]*(\/\/.*|\/\*.*|\*.*)?)+$/, "");
      const { text: normalized, resolved } = comparable(s.name, source, imports, sfcDir);
      members.push({ section, name: s.name, source: resolved, normalized, fingerprint: fingerprint(normalized) });
    });
  }
  return members;
}

function overlayPath(gen: Gen): string {
  return join(ROOT, "src", "renderer", "games", gen, "Overlay.vue");
}

/**
 * The members of a shared mixin module (`core/overlay/<name>Mixin.ts`): a `const` mixin
 * has its option blocks at four spaces, a factory mixin's `return {` at eight.
 */
function mixinMembers(modulePath: string): Map<string, Member> {
  const src = readFileSync(modulePath, "utf8");
  const indent = /^export function /m.test(src) ? 8 : 4;
  return new Map(extractMembers(src, dirname(modulePath), indent).map((m) => [`${m.section}.${m.name}`, m]));
}

/**
 * The mixins an overlay lists (`mixins: [enemySpriteStyleMixin({...}), formattersMixin]`),
 * resolved through its `~/core/overlay/...` imports: mixin name -> its members.
 */
function mixinsOf(script: string, paths: Map<string, string>): Map<string, Map<string, Member>> {
  const out = new Map<string, Map<string, Member>>();
  const list = /^ {4}mixins\s*:\s*\[([^\]]*)\]/m.exec(script);
  if (!list) return out;
  const imports = importsOf(script);
  for (const call of list[1].split(",")) {
    const name = call.trim().replace(/\(.*$/s, "");
    const specifier = name && imports.get(name);
    if (!specifier || !specifier.startsWith("~/core/overlay/")) continue;
    const path = join(ROOT, "src", "renderer", specifier.slice(2) + ".ts");
    paths.set(name, path);
    out.set(name, mixinMembers(path));
  }
  return out;
}

export interface Overlays {
  members: Record<Gen, Map<string, Member>>;
  /** A member defined twice in one overlay (the later one wins at runtime). */
  duplicates: string[];
  /** A member an overlay defines that one of its mixins also defines (the overlay's wins). */
  overrides: { gen: Gen; key: string; mixin: string; member: Member }[];
  /**
   * A name a mixin uses but never declares. A member moved out of an overlay leaves the
   * module-level `let`s the lift declared for its sloppy-mode globals behind; in the mixin
   * module the same assignment is a ReferenceError (tools/port/check-undefined.ts).
   */
  undeclared: string[];
}

export function loadOverlays(): Overlays {
  const members = {} as Record<Gen, Map<string, Member>>;
  const duplicates: string[] = [];
  const overrides: Overlays["overrides"] = [];
  const mixinPaths = new Map<string, string>();
  for (const gen of GENS) {
    const sfc = readFileSync(overlayPath(gen), "utf8");
    const byKey = new Map<string, Member>();
    for (const m of extractMembers(sfc, dirname(overlayPath(gen)))) {
      const key = `${m.section}.${m.name}`;
      if (byKey.has(key)) {
        const same = byKey.get(key)!.fingerprint === m.fingerprint;
        duplicates.push(`${gen}: ${key} is defined twice (${same ? "identical" : "different"} bodies; the later one wins)`);
      }
      byKey.set(key, m);
    }
    for (const [mixin, provided] of mixinsOf(scriptOf(sfc), mixinPaths)) {
      for (const key of provided.keys()) {
        const member = byKey.get(key);
        if (member) overrides.push({ gen, key, mixin, member });
      }
    }
    members[gen] = byKey;
  }
  const undeclared: string[] = [];
  for (const [mixin, path] of mixinPaths) {
    for (const [name, lines] of undeclaredNames(path)) {
      undeclared.push(`${mixin}: '${name}' is never declared (${lines.length} use(s); first at line ${lines[0]}) -- declare it in the mixin module or move the member back`);
    }
  }
  return { members, duplicates, overrides, undeclared };
}

// ---------------------------------------------------------------------------
// Comparison

export interface Comparison {
  section: Section;
  name: string;
  /** The generations the member exists in, with their members. */
  present: Partial<Record<Gen, Member>>;
  /** Groups of generations whose bodies agree, largest first: [["gen2","gen3","gen4"],["gen5"]]. */
  groups: Gen[][];
  identical: boolean;
}

export function compare(overlays: Record<Gen, Map<string, Member>>): Comparison[] {
  const keys = new Set<string>();
  for (const gen of GENS) for (const key of overlays[gen].keys()) keys.add(key);
  const out: Comparison[] = [];
  for (const key of [...keys].sort()) {
    const present: Partial<Record<Gen, Member>> = {};
    for (const gen of GENS) {
      const m = overlays[gen].get(key);
      if (m) present[gen] = m;
    }
    const gens = Object.keys(present) as Gen[];
    if (gens.length < 2) continue;
    const byBody = new Map<string, Gen[]>();
    for (const gen of gens) {
      const fp = present[gen]!.fingerprint;
      byBody.set(fp, [...(byBody.get(fp) ?? []), gen]);
    }
    const groups = [...byBody.values()].sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
    const { section, name } = present[gens[0]]!;
    out.push({ section, name, present, groups, identical: groups.length === 1 });
  }
  return out;
}

export function describeGroups(c: Comparison): string {
  return c.groups.map((g) => g.join("=")).join(" | ");
}

function bodiesOf(c: Comparison): Partial<Record<Gen, string>> {
  const bodies: Partial<Record<Gen, string>> = {};
  for (const gen of GENS) if (c.present[gen]) bodies[gen] = c.present[gen]!.fingerprint;
  return bodies;
}

function sameBodies(a: Partial<Record<Gen, string>>, b: Partial<Record<Gen, string>>): boolean {
  return GENS.every((gen) => a[gen] === b[gen]);
}

// ---------------------------------------------------------------------------
// Allowlist

function loadAllowlist(): Allowlist {
  if (!existsSync(ALLOWLIST_PATH)) return { $comment: "", entries: [] };
  return JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8")) as Allowlist;
}

const ALLOWLIST_COMMENT =
  "Members of games/gen{2,3,4,5}/Overlay.vue that share a name but not a body, each with the reason " +
  "the difference is intended, and a fingerprint of every generation's body at review time. " +
  "tools/parity/drift-check.ts fails on any difference not listed here, on a listed member whose " +
  "bodies have changed since review, and on a listed member whose bodies now agree. A reason that " +
  "starts with UNREVIEWED was written by --update and is still to be adjudicated: quirk (keep, say " +
  "why) or omission (port the change to the other generations, then --update drops the entry).";

/** What --update writes for an entry no reviewer has looked at yet. */
function autoReason(c: Comparison): string {
  const sizes = (Object.keys(c.present) as Gen[])
    .map((gen) => `${gen} ${c.present[gen]!.source.split("\n").length}L`)
    .join(", ");
  return `UNREVIEWED: ${describeGroups(c)} (${sizes})`;
}

function overrideKey(o: { gen: Gen; section: Section; name: string }): string {
  return `${o.gen}:${o.section}.${o.name}`;
}

function writeAllowlist(comparisons: Comparison[], found: Overlays["overrides"], previous: Allowlist): Allowlist {
  const reasons = new Map(previous.entries.map((e) => [`${e.section}.${e.name}`, e.reason]));
  const entries: AllowlistEntry[] = comparisons
    .filter((c) => !c.identical)
    .map((c) => {
      const key = `${c.section}.${c.name}`;
      return { section: c.section, name: c.name, reason: reasons.get(key) ?? autoReason(c), bodies: bodiesOf(c) };
    });
  const overrideReasons = new Map((previous.overrides ?? []).map((o) => [overrideKey(o), o.reason]));
  const overrides: OverrideEntry[] = found.map((o) => {
    const entry = { gen: o.gen, section: o.member.section, name: o.member.name, mixin: o.mixin };
    return {
      ...entry,
      reason: overrideReasons.get(overrideKey(entry)) ?? `UNREVIEWED: ${o.gen} overrides ${o.mixin}'s ${o.key}`,
      body: o.member.fingerprint,
    };
  });
  const next: Allowlist = { $comment: ALLOWLIST_COMMENT, entries, ...(overrides.length ? { overrides } : {}) };
  writeFileSync(ALLOWLIST_PATH, JSON.stringify(next, null, 2) + "\n");
  return next;
}

// ---------------------------------------------------------------------------
// Check

export interface CheckResult {
  compared: number;
  identical: number;
  allowed: number;
  unreviewed: number;
  failures: string[];
}

export function check(comparisons: Comparison[], overrides: Overlays["overrides"], allowlist: Allowlist): CheckResult {
  const entries = new Map(allowlist.entries.map((e) => [`${e.section}.${e.name}`, e]));
  const seen = new Set<string>();
  const failures: string[] = [];
  let identical = 0;
  let allowed = 0;
  let unreviewed = 0;
  for (const c of comparisons) {
    const key = `${c.section}.${c.name}`;
    const entry = entries.get(key);
    if (entry) seen.add(key);
    if (c.identical) {
      identical++;
      if (entry) failures.push(`${key}: allowlisted, but the bodies now agree -- drop the entry (--update)`);
      continue;
    }
    if (!entry) {
      failures.push(`${key}: bodies differ and no allowlist entry explains it [${describeGroups(c)}]`);
      continue;
    }
    if (!sameBodies(entry.bodies, bodiesOf(c))) {
      const changed = GENS.filter((gen) => entry.bodies[gen] !== c.present[gen]?.fingerprint);
      failures.push(
        `${key}: allowlisted difference has changed in ${changed.join(", ")} since review ` +
          `[now ${describeGroups(c)}] -- port the edit or re-review (--update)`,
      );
      continue;
    }
    allowed++;
    if (entry.reason.startsWith("UNREVIEWED")) unreviewed++;
  }
  for (const key of entries.keys()) {
    if (!seen.has(key)) failures.push(`${key}: allowlisted, but no overlay defines it in two generations any more`);
  }
  // An overlay's own copy of a mixin member is a difference too: the overlay's wins, silently.
  const allowedOverrides = new Map((allowlist.overrides ?? []).map((o) => [overrideKey(o), o]));
  const seenOverrides = new Set<string>();
  for (const o of overrides) {
    const key = overrideKey({ gen: o.gen, section: o.member.section, name: o.member.name });
    seenOverrides.add(key);
    const entry = allowedOverrides.get(key);
    if (!entry) {
      failures.push(
        `${o.gen} defines ${o.key}, which ${o.mixin} also provides (the overlay's wins) -- drop it or allowlist the override with a reason`,
      );
    } else if (entry.body !== o.member.fingerprint) {
      failures.push(`${o.gen}'s override of ${o.mixin}'s ${o.key} has changed since review -- re-review (--update)`);
    } else {
      allowed++;
      if (entry.reason.startsWith("UNREVIEWED")) unreviewed++;
    }
  }
  for (const key of allowedOverrides.keys()) {
    if (!seenOverrides.has(key)) failures.push(`${key}: allowlisted override, but the overlay no longer defines it`);
  }
  return { compared: comparisons.length, identical, allowed, unreviewed, failures };
}

// ---------------------------------------------------------------------------
// Report

/** A minimal line diff (LCS), enough to read what one generation did that the others did not. */
function lineDiff(a: string[], b: string[]): string[] {
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push(`  ${a[i]}`); i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { out.push(`- ${a[i]}`); i++; }
    else { out.push(`+ ${b[j]}`); j++; }
  }
  while (i < n) out.push(`- ${a[i++]}`);
  while (j < m) out.push(`+ ${b[j++]}`);
  // Keep one line of context around each change.
  const keep = new Set<number>();
  out.forEach((line, k) => {
    if (line[0] !== " ") for (let d = -1; d <= 1; d++) keep.add(k + d);
  });
  const shown: string[] = [];
  let gap = false;
  out.forEach((line, k) => {
    if (keep.has(k)) { shown.push(line); gap = false; }
    else if (!gap) { shown.push("  ..."); gap = true; }
  });
  return shown;
}

function dedent(source: string): string[] {
  const lines = source.split("\n");
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)![0].length));
  return lines.map((l) => l.slice(indent).replace(/\s+$/, ""));
}

export function report(comparisons: Comparison[], allowlist: Allowlist, only?: string): string {
  const entries = new Map(allowlist.entries.map((e) => [`${e.section}.${e.name}`, e]));
  const lines: string[] = [];
  for (const c of comparisons) {
    if (c.identical) continue;
    if (only && c.name !== only && `${c.section}.${c.name}` !== only) continue;
    const key = `${c.section}.${c.name}`;
    const entry = entries.get(key);
    lines.push(`## ${key}`);
    lines.push("");
    lines.push(`Groups: ${describeGroups(c)}`);
    lines.push(`Reason: ${entry ? entry.reason : "(not allowlisted)"}`);
    lines.push("");
    // Diff every minority group against the majority.
    const base = c.groups[0][0];
    const baseLines = dedent(c.present[base]!.source);
    for (const group of c.groups.slice(1)) {
      const other = group[0];
      lines.push("```diff");
      lines.push(`--- ${base}${c.groups[0].length > 1 ? ` (=${c.groups[0].slice(1).join("=")})` : ""}`);
      lines.push(`+++ ${other}${group.length > 1 ? ` (=${group.slice(1).join("=")})` : ""}`);
      lines.push(...lineDiff(baseLines, dedent(c.present[other]!.source)));
      lines.push("```");
      lines.push("");
    }
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CLI

function main(argv: string[]): number {
  const { members: overlays, duplicates, overrides, undeclared } = loadOverlays();
  const comparisons = compare(overlays);
  let allowlist = loadAllowlist();

  if (argv.includes("--update")) {
    allowlist = writeAllowlist(comparisons, overrides, allowlist);
    const unreviewed = allowlist.entries.filter((e) => e.reason.startsWith("UNREVIEWED")).length;
    console.log(`wrote ${allowlist.entries.length} entries to ${ALLOWLIST_PATH} (${unreviewed} unreviewed)`);
  }

  const reportAt = argv.indexOf("--report");
  if (reportAt >= 0) {
    const only = argv[reportAt + 1] && !argv[reportAt + 1].startsWith("--") ? argv[reportAt + 1] : undefined;
    console.log(report(comparisons, allowlist, only));
    return 0;
  }

  for (const gen of GENS) {
    const counts = SECTIONS.map((s) => `${s} ${[...overlays[gen].values()].filter((m) => m.section === s).length}`);
    console.log(`${gen}: ${counts.join(", ")}`);
  }
  const result = check(comparisons, overrides, allowlist);
  result.failures.unshift(...duplicates, ...undeclared);
  console.log(
    `${result.compared} members shared by two or more generations: ${result.identical} identical, ` +
      `${result.allowed} allowlisted differences (${result.unreviewed} unreviewed)`,
  );
  // An UNREVIEWED entry is pinned, so the check is green on it while nobody has said
  // whether the difference is a quirk or an omission. The ones a reviewer already
  // flagged with a reading (`UNREVIEWED (omission?)`, `(console only)`) are printed by
  // name every run; `--strict` fails on every UNREVIEWED entry, for a CI that wants the
  // allowlist fully adjudicated.
  const unreviewedEntries = [
    ...allowlist.entries.map((e) => ({ key: `${e.section}.${e.name}`, reason: e.reason })),
    ...(allowlist.overrides ?? []).map((o) => ({ key: `${o.gen}:${o.section}.${o.name}`, reason: o.reason })),
  ].filter((e) => e.reason.startsWith("UNREVIEWED"));
  for (const e of unreviewedEntries.filter((e) => e.reason.startsWith("UNREVIEWED ("))) {
    console.log(`flagged ${e.key}: ${e.reason}`);
  }
  if (argv.includes("--strict")) {
    for (const e of unreviewedEntries) result.failures.push(`${e.key}: UNREVIEWED (--strict)`);
  }
  for (const f of result.failures) console.log(`FAIL ${f}`);
  console.log(result.failures.length ? `drift check FAILED (${result.failures.length})` : "drift check passed");
  return result.failures.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
