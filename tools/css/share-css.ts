/**
 * Moves CSS that gens 3, 4 and 5 copy verbatim into shared sheets, without changing which declaration wins anywhere
 * (docs/ui-uniformity-plan.md step 5.6, audit finding B6).
 *
 *   core/styles/shared-gen345.css  rules identical in games/gen3, gen4 and gen5 `style.css`
 *   core/styles/shared-gen45.css   rules identical in gen4 and gen5 only
 *
 * Each module's `styles()` (core/styles/joinStyleSheets.ts) returns shared-gen345 + shared-gen45 (gens 4-5) + its own
 * sheet as one `<style>` text, with the shared sheets' `.gen-N` placeholder replaced by the generation's class. A moved
 * rule keeps its exact selector text, so only its position changes: it now comes *before* every rule left in the
 * generation's sheet.
 *
 * Before the move, each generation's own sheet loses its exact duplicates: an earlier rule whose selector list
 * reappears later with every one of its declarations (the later copy always wins), and every `@keyframes` but the
 * last of one name (the last one is the one the browser uses).
 *
 * Cascade safety. Rules are compared after whitespace normalisation, with `.gen-3/4/5` read as one placeholder. A rule
 * moves only when no pair of rules whose order the move flips could decide a different winner:
 *   - two style rules conflict when they set overlapping properties with the same `!important`ness (the same property
 *     with a different value, or a shorthand/longhand pair) AND have a selector pair of equal specificity that could
 *     match the same element. "Could not" needs proof: a different pseudo-element, tag, id or `:nth-child(k)`, or a
 *     class whose every element is known from the templates and carries no class of the other selector
 *     (`cooccurrence()`);
 *   - two `@keyframes` conflict when they share a name, two `@font-face` when they share a family.
 * A conflict puts the rule back in the generation sheets and the check runs again until nothing flips. Rules with a
 * relative `url()` other than `../../fonts/` stay (that path resolves to the same file from games/genN and
 * core/styles; others would not).
 *
 * The analysis reads the shared sheets too (as the start of each generation's cascade), so it can be re-run after
 * the generation sheets change; a shared rule that no longer qualifies goes back to the top of each generation sheet.
 *
 *   npx tsx tools/css/share-css.ts            report
 *   npx tsx tools/css/share-css.ts --write    rewrite the three generation sheets and the two shared sheets
 *   add --list to print every move and every conflict that kept a rule in place
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import postcss, { type AtRule, type ChildNode, type Comment, type Root, type Rule } from "postcss";

const REPO = join(import.meta.dirname, "..", "..");
const R = join(REPO, "src", "renderer");
const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const LIST = argv.includes("--list");

const GENS = [3, 4, 5] as const;
type Gen = (typeof GENS)[number];
const sheetPath = (g: Gen) => join(R, "games", `gen${g}`, "style.css");
const SHARED = {
    s345: { file: join(R, "core", "styles", "shared-gen345.css"), gens: [3, 4, 5] as Gen[] },
    s45: { file: join(R, "core", "styles", "shared-gen45.css"), gens: [4, 5] as Gen[] },
};
type SetName = keyof typeof SHARED;

// ---------- normalisation ----------

const genToken = (s: string) => s.replace(/\.gen-[345N](?![\w-])/g, ".gen-X");
const normSel = (s: string) =>
    genToken(s)
        .replace(/\s+/g, " ")
        .replace(/\s*([>+~,])\s*/g, "$1")
        .replace(/\(\s+/g, "(")
        .replace(/\s+\)/g, ")")
        .trim();
const normVal = (v: string) =>
    v
        .replace(/\s+/g, " ")
        .replace(/\s*,\s*/g, ",")
        .replace(/\(\s+/g, "(")
        .replace(/\s+\)/g, ")")
        .trim();

interface Decl {
    prop: string;
    value: string;
    important: boolean;
}
interface Item {
    node: Rule | AtRule;
    kind: "rule" | "keyframes" | "font-face" | "other";
    key: string;
    sels: string[]; // normalised
    decls: Decl[];
    name: string; // keyframes name / font family
    shareable: boolean;
    comment?: Comment; // the comment right before it
    from: "sheet" | SetName;
}

function declsOf(node: Rule | AtRule): Decl[] {
    const out: Decl[] = [];
    for (const n of node.nodes ?? []) if (n.type === "decl") out.push({ prop: n.prop.toLowerCase(), value: normVal(n.value), important: !!n.important });
    return out;
}
const declKey = (d: Decl) => `${d.prop}:${d.value}${d.important ? "!" : ""}`;

function toItem(node: ChildNode, from: Item["from"]): Item | null {
    if (node.type === "rule") {
        const sels = node.selectors.map(normSel);
        const decls = declsOf(node);
        const nested = (node.nodes ?? []).some((n) => n.type === "rule" || n.type === "atrule");
        return {
            node,
            kind: "rule",
            key: `R|${sels.join(",")}|${decls.map(declKey).join(";")}`,
            sels,
            decls,
            name: "",
            shareable: !nested && urlsOk(node.toString()),
            from,
        };
    }
    if (node.type === "atrule") {
        const name = node.name.toLowerCase();
        if (name === "keyframes" || name.endsWith("-keyframes")) {
            const inner = (node.nodes ?? [])
                .filter((n): n is Rule => n.type === "rule")
                .map((r) => `${normSel(r.selector)}{${declsOf(r).map(declKey).join(";")}}`)
                .join("");
            const kf = normVal(node.params);
            return { node, kind: "keyframes", key: `K|${name}|${kf}|${inner}`, sels: [], decls: [], name: kf, shareable: urlsOk(node.toString()), from };
        }
        if (name === "font-face") {
            const decls = declsOf(node);
            const fam = (decls.find((d) => d.prop === "font-family")?.value ?? "").replace(/["']/g, "").toLowerCase();
            return { node, kind: "font-face", key: `F|${decls.map(declKey).join(";")}`, sels: [], decls, name: fam, shareable: urlsOk(node.toString()), from };
        }
        return { node, kind: "other", key: `A|${node.toString()}`, sels: [], decls: [], name: "", shareable: false, from };
    }
    return null;
}

function urlsOk(text: string): boolean {
    for (const m of text.matchAll(/url\(\s*['"]?([^'")]*)/g)) {
        const u = m[1];
        if (/^(data:|https?:|\/|#)/.test(u)) continue;
        if (u.startsWith("../../fonts/")) continue;
        return false;
    }
    return true;
}

// ---------- selectors ----------

function splitTop(s: string, sep: (ch: string, i: number) => boolean): string[] {
    const out: string[] = [];
    let depth = 0;
    let cur = "";
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (ch === "(" || ch === "[") depth++;
        else if (ch === ")" || ch === "]") depth--;
        if (depth === 0 && sep(ch, i)) {
            out.push(cur);
            cur = "";
            continue;
        }
        cur += ch;
    }
    out.push(cur);
    return out;
}

type Spec = [number, number, number];
const LEGACY_PE = /^(before|after|first-line|first-letter)$/i;

const specCache = new Map<string, Spec>();
function specificity(sel: string): Spec {
    let c = specCache.get(sel);
    if (!c) specCache.set(sel, (c = computeSpec(sel)));
    return c;
}
function computeSpec(sel: string): Spec {
    const sp: Spec = [0, 0, 0];
    let i = 0;
    const s = sel;
    const add = (o: Spec) => {
        sp[0] += o[0];
        sp[1] += o[1];
        sp[2] += o[2];
    };
    const readParen = (): string => {
        // s[i] === "("
        let depth = 0;
        const start = i + 1;
        for (; i < s.length; i++) {
            if (s[i] === "(") depth++;
            else if (s[i] === ")" && --depth === 0) break;
        }
        const inner = s.slice(start, i);
        i++;
        return inner;
    };
    const ident = () => {
        const m = /^-?[\w-]+/.exec(s.slice(i));
        i += m ? m[0].length : 0;
        return m ? m[0] : "";
    };
    while (i < s.length) {
        const ch = s[i];
        if (ch === "#") {
            i++;
            ident();
            sp[0]++;
        } else if (ch === ".") {
            i++;
            ident();
            sp[1]++;
        } else if (ch === "[") {
            while (i < s.length && s[i] !== "]") i++;
            i++;
            sp[1]++;
        } else if (ch === ":") {
            if (s[i + 1] === ":") {
                i += 2;
                ident();
                if (s[i] === "(") readParen();
                sp[2]++;
                continue;
            }
            i++;
            const name = ident().toLowerCase();
            if (s[i] === "(") {
                const inner = readParen();
                if (name === "where") continue;
                if (["is", "not", "has", "matches", "-webkit-any"].includes(name)) {
                    const best = splitTop(inner, (c) => c === ",")
                        .map((x) => specificity(x.trim()))
                        .reduce<Spec>((a, b) => (cmpSpec(a, b) >= 0 ? a : b), [0, 0, 0]);
                    add(best);
                } else sp[1]++;
                continue;
            }
            if (LEGACY_PE.test(name)) sp[2]++;
            else sp[1]++;
        } else if (/[A-Za-z_-]/.test(ch)) {
            ident();
            sp[2]++;
        } else i++; // combinators, '*', spaces
    }
    return sp;
}
const cmpSpec = (a: Spec, b: Spec) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

interface Subject {
    pe: string;
    tag: string;
    ids: string[];
    classes: string[];
    nth: string; // a plain `:nth-child(<integer>)`
}
const subjectCache = new Map<string, Subject>();
function subject(sel: string): Subject {
    let hit = subjectCache.get(sel);
    if (!hit) subjectCache.set(sel, (hit = computeSubject(sel)));
    return hit;
}
function computeSubject(sel: string): Subject {
    const parts = splitTop(sel, (c) => c === " " || c === ">" || c === "+" || c === "~").filter((p) => p.length);
    const last = parts[parts.length - 1] ?? "";
    const nth = /:nth-child\(\s*(\d+)\s*\)/.exec(last)?.[1] ?? "";
    const flat = last.replace(/\([^()]*\)/g, "").replace(/\([^()]*\)/g, "");
    let pe = "";
    const m = /::?([\w-]+)/g;
    for (const x of flat.matchAll(m)) {
        if (x[0].startsWith("::") || LEGACY_PE.test(x[1])) pe = x[1].toLowerCase();
    }
    const tag = (/^[A-Za-z][\w-]*/.exec(flat)?.[0] ?? "").toLowerCase();
    const ids = [...flat.matchAll(/#([\w-]+)/g)].map((x) => x[1]);
    const classes = [...flat.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map((x) => x[1]);
    return { pe, tag, ids, classes, nth };
}
function couldMatchSame(g: Gen, a: string, b: string): boolean {
    const x = subject(a);
    const y = subject(b);
    if (x.pe !== y.pe) return false;
    if (x.tag && y.tag && x.tag !== y.tag) return false;
    if (x.ids.length && y.ids.length && x.ids.some((id) => !y.ids.includes(id))) return false;
    if (x.nth && y.nth && x.nth !== y.nth && x.pe === "" && !/[+~]/.test(a + b)) {
        // both subjects are `:nth-child(k)` of their own parent, different k: never the same element
        return false;
    }
    const co = cooccurrence(g);
    for (const c of x.classes) for (const d of y.classes) if (c !== d && !co.may(c, d)) return false;
    return true;
}

// ---------- which classes can sit on one element ----------

/**
 * Two classes can be on one element unless the source proves otherwise. A class is "tracked" only when every
 * occurrence of its name in the generation's sources (games/genN, core, the shell) is inside a static `class="..."`
 * on a native HTML/SVG element without a `:class`/`v-bind`, and no run-time class assembly (`'badge' + n`,
 * `` `ePkmn${n}` ``) could produce it. Two tracked classes can share an element only if some element lists both.
 * Anything else (a class in TS, a Vue transition class, a class on a component, which falls through to its root)
 * may share an element with anything.
 */
const NATIVE = new Set(
    ("a abbr b br button canvas caption circle col colgroup defs div em fieldset form g h1 h2 h3 h4 h5 h6 hr i img input " +
        "label legend li line ol option optgroup p path pre polygon polyline rect section select small span strong sub sup " +
        "svg table tbody td text textarea tfoot th thead tr u ul video audio source use image ellipse header footer main nav").split(" "),
);
interface Cooc {
    may(a: string, b: string): boolean;
}
const coocCache = new Map<Gen, Cooc>();
function sourcesFor(g: Gen): string[] {
    const walk = (dir: string, out: string[] = []): string[] => {
        if (!existsSync(dir)) return out;
        for (const name of readdirSync(dir)) {
            const p = join(dir, name);
            if (statSync(p).isDirectory()) {
                if (name !== "node_modules") walk(p, out);
            } else if (/\.(vue|ts|js|mjs|html|json)$/.test(name)) out.push(p);
        }
        return out;
    };
    const files = [...walk(join(R, "games", `gen${g}`)), ...walk(join(R, "core")), ...walk(join(R, "packages"))];
    for (const f of ["main.ts", "index.html", "shortcuts.html", "App.vue", join("components", "GameSelect.vue")]) if (existsSync(join(R, f))) files.push(join(R, f));
    return [...new Set(files)];
}
const VOID = new Set("area base br col embed hr img input link meta source track wbr".split(" "));
const TRANSPARENT = new Set(["template", "transition", "Transition", "transition-group", "TransitionGroup", "keep-alive", "KeepAlive", "Teleport", "teleport", "Suspense"]);
const TAG_OR_CLOSE = /<\/?([A-Za-z][\w-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/g;
/** Offsets (in `sfc`) of the opening tags at the top level of an SFC's `<template>`: they receive fallthrough attributes. */
function componentRoots(sfc: string): Set<number> {
    const roots = new Set<number>();
    const start = sfc.search(/^<template[\s>]/m);
    if (start < 0) return roots;
    const end = sfc.search(/^<\/template>/m);
    const body = sfc.slice(0, end > start ? end : sfc.length).replace(/<!--[\s\S]*?-->/g, (c) => " ".repeat(c.length));
    const re = new RegExp(TAG_OR_CLOSE.source, "g");
    re.lastIndex = body.indexOf(">", start) + 1; // past the SFC's own <template>
    let depth = 0;
    for (let m = re.exec(body); m; m = re.exec(body)) {
        const name = m[1];
        if (TRANSPARENT.has(name)) continue; // <template v-if>, <transition>: their children are the roots
        if (m[0].startsWith("</")) depth--;
        else {
            if (depth <= 0) roots.add(m.index);
            if (!m[3] && !VOID.has(name.toLowerCase())) depth++;
        }
    }
    return roots;
}

function cooccurrence(g: Gen): Cooc {
    const hit = coocCache.get(g);
    if (hit) return hit;
    const total = new Map<string, number>();
    const inStatic = new Map<string, number>();
    const together = new Map<string, Set<string>>();
    const open = new Set<string>();
    const prefixes = new Set<string>();
    const suffixes = new Set<string>();
    const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
    const TAG = /<([A-Za-z][\w-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*\/?>/g;
    const ATTR = /([^\s"'>/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;
    for (const f of sourcesFor(g)) {
        const txt = readFileSync(f, "utf8");
        // every word counts, including <style> blocks and comments: an occurrence not accounted for below untracks it
        for (const m of txt.matchAll(/(?<![\w-])[A-Za-z_][\w-]*/g)) bump(total, m[0]);
        for (const m of txt.matchAll(/([A-Za-z_][\w-]*)\$\{/g)) prefixes.add(m[1]);
        for (const m of txt.matchAll(/(['"`])([^'"`\n]*?)([A-Za-z_][\w-]*)\1\s*\+/g)) prefixes.add(m[3]);
        for (const m of txt.matchAll(/\}([A-Za-z_][\w-]*)/g)) suffixes.add(m[1]);
        for (const m of txt.matchAll(/\+\s*(['"`])([\w-]+)/g)) suffixes.add(m[2]);
        if (!f.endsWith(".vue") && !f.endsWith(".html")) continue;
        // index.html's elements get their class from main.ts; a component's root elements get its parent's class
        const roots = f.endsWith(".vue") ? componentRoots(txt) : null;
        for (const t of txt.matchAll(TAG)) {
            const tag = t[1];
            const attrs = [...t[2].matchAll(ATTR)].map((a) => ({ name: a[1], value: (a[2] ?? "").replace(/^["']|["']$/g, "") }));
            const native = NATIVE.has(tag);
            const dyn =
                !roots ||
                roots.has(t.index!) ||
                attrs.some((a) => /^(:|v-bind)/.test(a.name) && (/class$/i.test(a.name) || a.name === "v-bind"));
            const classes: string[] = [];
            for (const a of attrs) {
                const words = [...a.value.matchAll(/(?<![\w-])[A-Za-z_][\w-]*/g)].map((w) => w[0]);
                if (a.name === "class") {
                    classes.push(...words);
                    if (native && !dyn) for (const w of words) bump(inStatic, w);
                } else if (native && !/^(:|@|v-|#)/.test(a.name)) {
                    // a static attribute of a native element (id, ref, src, alt, ...) never becomes a class
                    for (const w of words) bump(inStatic, w);
                }
                // the attribute's name was counted in `total` too (`<td colspan>`)
                if (native) for (const w of a.name.matchAll(/(?<![\w-])[A-Za-z_][\w-]*/g)) bump(inStatic, w[0]);
            }
            if (native) bump(inStatic, tag);
            if (!native || dyn) for (const c of classes) open.add(c);
            else
                for (const c of classes) {
                    if (!together.has(c)) together.set(c, new Set());
                    for (const d of classes) together.get(c)!.add(d);
                }
        }
    }
    const pre = [...prefixes].filter((p) => p.length >= 2);
    const suf = [...suffixes].filter((s) => s.length >= 3);
    const tracked = (c: string) =>
        !open.has(c) &&
        (total.get(c) ?? 0) > 0 &&
        // every occurrence of the word is a static class (or another static attribute) of a native element
        (inStatic.get(c) ?? 0) >= (total.get(c) ?? 0) &&
        together.has(c) &&
        !pre.some((p) => c.startsWith(p)) &&
        !suf.some((s) => c.endsWith(s));
    const why = argv.find((a) => a.startsWith("--why="))?.slice(6);
    if (why)
        for (const c of why.split(","))
            console.log(
                `gen${g} .${c}: total ${total.get(c) ?? 0}, static ${inStatic.get(c) ?? 0}, open ${open.has(c)}, ` +
                    `prefix ${pre.filter((p) => c.startsWith(p))}, suffix ${suf.filter((x) => c.endsWith(x))}, with ${[...(together.get(c) ?? [])]}`,
            );
    const cooc: Cooc = {
        // a tracked class's elements carry exactly the classes listed with it, so one tracked side decides
        may(a, b) {
            if (tracked(a)) return together.get(a)!.has(b);
            if (tracked(b)) return together.get(b)!.has(a);
            return true;
        },
    };
    coocCache.set(g, cooc);
    return cooc;
}

// ---------- properties ----------

const FAMILIES: string[][] = [
    ["font", "line-height"],
    ["inset", "top", "right", "bottom", "left"],
    ["gap", "row-gap", "column-gap", "grid-gap", "grid-row-gap", "grid-column-gap"],
    ["place-content", "align-content", "justify-content"],
    ["place-items", "align-items", "justify-items"],
    ["place-self", "align-self", "justify-self"],
    ["flex-flow", "flex-direction", "flex-wrap"],
    ["columns", "column-width", "column-count"],
];
const unprefix = (p: string) => p.replace(/^-(webkit|moz|ms|o)-/, "");
function overlap(a0: string, b0: string): boolean {
    if (a0 === b0) return true;
    const a = unprefix(a0);
    const b = unprefix(b0);
    if (a.startsWith("--") || b.startsWith("--")) return a === b;
    if (a === b || a === "all" || b === "all") return true;
    if (a.startsWith(b + "-") || b.startsWith(a + "-")) return true;
    if (a.startsWith("border") && b.startsWith("border")) return true;
    if (a.startsWith("grid") && b.startsWith("grid")) return true;
    return FAMILIES.some((f) => f.includes(a) && f.includes(b));
}

/** Why the order of `p` and `q` could matter, or null. */
function conflict(g: Gen, p: Item, q: Item): string | null {
    if (p.kind !== q.kind) return null;
    if (p.kind === "keyframes" || p.kind === "font-face") return p.name === q.name ? `same ${p.kind} ${p.name}` : null;
    if (p.kind === "other") return "unknown at-rule";
    let props: string | null = null;
    for (const d of p.decls)
        for (const e of q.decls) {
            if (d.important !== e.important || !overlap(d.prop, e.prop)) continue;
            if (d.prop === e.prop && d.value === e.value) continue;
            props = `${d.prop}/${e.prop}`;
            break;
        }
    if (!props) return null;
    for (const a of p.sels)
        for (const b of q.sels) {
            if (cmpSpec(specificity(a), specificity(b)) === 0 && couldMatchSame(g, a, b)) return `${props} on ${a} vs ${b}`;
        }
    return null;
}

// ---------- one pass ----------

interface Texts {
    sheets: Map<Gen, string>;
    s345: string;
    s45: string;
}
interface PassResult {
    out: Texts;
    dedupe: Map<Gen, string[]>;
    moves: Record<SetName, string[]>;
    banned: Record<SetName, Map<string, string>>;
}

function itemsOf(root: Root | null, from: Item["from"]): Item[] {
    if (!root) return [];
    const out: Item[] = [];
    let prevComment: Comment | undefined;
    for (const n of root.nodes) {
        if (n.type === "comment") {
            // a shared sheet's header (written below) belongs to no rule
            if (from === "sheet" || n !== root.first) prevComment = n;
            continue;
        }
        const it = toItem(n, from);
        if (it) {
            it.comment = prevComment;
            out.push(it);
        }
        prevComment = undefined;
    }
    return out;
}

function pass(input: Texts): PassResult {
    const sheetRoots = new Map<Gen, Root>(GENS.map((g) => [g, postcss.parse(input.sheets.get(g)!, { from: sheetPath(g) })]));
    const sharedRoots = {
        s345: input.s345 ? postcss.parse(input.s345, { from: SHARED.s345.file }) : null,
        s45: input.s45 ? postcss.parse(input.s45, { from: SHARED.s45.file }) : null,
    };

    // 1. duplicates inside each generation sheet
    const dedupe = new Map<Gen, string[]>();
    for (const g of GENS) {
        const items = itemsOf(sheetRoots.get(g)!, "sheet");
        const removed: string[] = [];
        items.forEach((it, i) => {
            const later = items.slice(i + 1);
            let gone = false;
            if (it.kind === "keyframes") gone = later.some((l) => l.kind === "keyframes" && l.name === it.name);
            else if (it.kind === "rule") {
                const sk = it.sels.join(",");
                const mine = it.decls.map(declKey);
                gone = later.some((l) => l.kind === "rule" && l.sels.join(",") === sk && mine.every((k) => l.decls.some((d) => declKey(d) === k)));
            }
            if (gone) {
                removed.push(`:${it.node.source?.start?.line} ${it.kind === "keyframes" ? "@keyframes " + it.name : it.sels.join(", ")}`);
                it.node.remove();
            }
        });
        dedupe.set(g, removed);
    }

    // 2. sharing. Each generation's cascade: shared-gen345, shared-gen45 (gens 4-5), then its own sheet.
    const seq = new Map<Gen, Item[]>();
    for (const g of GENS) {
        const s: Item[] = [...itemsOf(sharedRoots.s345, "s345")];
        if (g !== 3) s.push(...itemsOf(sharedRoots.s45, "s45"));
        s.push(...itemsOf(sheetRoots.get(g)!, "sheet"));
        seq.set(g, s);
    }
    const byKey = new Map<Gen, Map<string, Item>>();
    for (const g of GENS) {
        const m = new Map<string, Item>();
        for (const it of seq.get(g)!) if (!m.has(it.key)) m.set(it.key, it);
        byKey.set(g, m);
    }
    // A key that appears twice in one cascade (a gen-sheet copy of a shared rule) is left alone.
    const dupInCascade = new Set<string>();
    for (const g of GENS) {
        const seen = new Set<string>();
        for (const it of seq.get(g)!) {
            if (seen.has(it.key)) dupInCascade.add(it.key);
            seen.add(it.key);
        }
    }

    const banned: Record<SetName, Map<string, string>> = { s345: new Map(), s45: new Map() };
    const eligible = (key: string, gens: Gen[]) => !dupInCascade.has(key) && gens.every((g) => byKey.get(g)!.get(key)?.shareable);
    const conflictMemo = new Map<Item, Map<Item, string | null>>();
    const conflictOf = (g: Gen, a: Item, b: Item): string | null => {
        let m = conflictMemo.get(a);
        if (!m) conflictMemo.set(a, (m = new Map()));
        if (!m.has(b)) m.set(b, conflict(g, a, b));
        return m.get(b)!;
    };

    let moves: Record<SetName, string[]> = { s345: [], s45: [] };
    for (let round = 0; round < 2000; round++) {
        const pos4 = new Map(seq.get(4)!.map((it, i) => [it.key, i]));
        // a rule already in shared-gen45 stays there (passes settle instead of trading rules between the two sheets)
        const s345 = [...byKey.get(4)!.keys()].filter((k) => eligible(k, [3, 4, 5]) && !banned.s345.has(k) && byKey.get(4)!.get(k)!.from !== "s45");
        const in345 = new Set(s345);
        const s45 = [...byKey.get(4)!.keys()].filter((k) => !in345.has(k) && eligible(k, [4, 5]) && !banned.s45.has(k));
        s345.sort((a, b) => pos4.get(a)! - pos4.get(b)!);
        s45.sort((a, b) => pos4.get(a)! - pos4.get(b)!);
        moves = { s345, s45 };
        const setOf = new Map<string, SetName>([...s345.map((k) => [k, "s345"] as const), ...s45.map((k) => [k, "s45"] as const)]);

        // A moved rule that flips with a rule left in the sheet must stay (all of those go at once); when two moved
        // rules flip (the shared order differs from one generation's), one goes back per round.
        const mustStay = new Map<string, string>();
        let movedPair: { key: string; why: string } | null = null;
        for (const g of GENS) {
            const orig = seq.get(g)!;
            const origIdx = new Map(orig.map((it, i) => [it, i]));
            const shared = [...s345.map((k) => byKey.get(g)!.get(k)!), ...(g === 3 ? [] : s45.map((k) => byKey.get(g)!.get(k)!))];
            // a key moves out of this generation only when its set covers it (gen3 keeps its copy of a gen4-5 rule)
            const movedHere = (k: string) => setOf.has(k) && SHARED[setOf.get(k)!].gens.includes(g);
            const final = [...shared, ...orig.filter((it) => !movedHere(it.key))];
            for (let j = 0; j < final.length; j++)
                for (let i = 0; i < j; i++) {
                    const a = final[i];
                    const b = final[j];
                    if (origIdx.get(a)! < origIdx.get(b)!) continue; // order unchanged
                    const why = conflictOf(g, a, b);
                    if (!why) continue;
                    if (!movedHere(b.key)) {
                        if (!mustStay.has(a.key)) mustStay.set(a.key, `gen${g}: ${why}`);
                    } else if (!movedPair) {
                        // keep what an earlier pass already shared, so passes settle
                        const back = a.from !== "sheet" && b.from === "sheet" ? b : b.from !== "sheet" && a.from === "sheet" ? a : b;
                        movedPair = { key: back.key, why: `gen${g}: ${why}` };
                    }
                }
        }
        if (mustStay.size) for (const [k, why] of mustStay) banned[setOf.get(k)!].set(k, why);
        else if (movedPair) banned[setOf.get(movedPair.key)!].set(movedPair.key, movedPair.why);
        else break;
    }

    // 3. the new texts
    const sharedSet = new Map<string, SetName>([...moves.s345.map((k) => [k, "s345"] as const), ...moves.s45.map((k) => [k, "s45"] as const)]);
    const sharedText = (set: SetName): string => {
        const { gens } = SHARED[set];
        const names = gens.map((g) => "gen" + g).join(", ");
        const head =
            `/**\n * CSS that ${names} had byte-identical in their games/genN/style.css, moved here by tools/css/share-css.ts\n` +
            ` * (re-run it after editing a generation sheet). Each module's styles() puts this text before its own sheet in one\n` +
            ` * <style>${set === "s345" ? "" : " (after shared-gen345.css)"}, with \`.gen-N\` replaced by the generation's class\n` +
            ` * (core/styles/joinStyleSheets.ts), so every selector is exactly the one it had there.\n` +
            ` * A rule here applies to all of ${names}: to change one generation only, override it in that sheet.\n */\n`;
        const out = postcss.root();
        for (const key of moves[set]) {
            const src = byKey.get(4)!.get(key)!;
            const sameComment = src.comment && gens.every((g) => byKey.get(g)!.get(key)!.comment?.text === src.comment!.text);
            if (sameComment) {
                const c = src.comment!.clone();
                c.raws.before = "\n\n";
                out.append(c);
            }
            const n = src.node.clone() as Rule | AtRule;
            n.raws.before = sameComment ? "\n" : "\n\n";
            if (n.type === "rule") n.selector = n.selector.replace(/\.gen-[345](?![\w-])/g, ".gen-N");
            out.append(n);
        }
        return (head + out.toString().replace(/^\s+/, "") + "\n").replace(/\n[ \t]*\n([ \t]*\n)+/g, "\n\n");
    };

    const sheets = new Map<Gen, string>();
    for (const g of GENS) {
        const root = sheetRoots.get(g)!;
        for (const it of seq.get(g)!) {
            const set = sharedSet.get(it.key);
            if (!set || !SHARED[set].gens.includes(g) || it.from !== "sheet") continue;
            if (it.comment && SHARED[set].gens.every((h) => byKey.get(h)!.get(it.key)!.comment?.text === it.comment!.text)) it.comment.remove();
            it.node.remove();
        }
        // shared rules that no longer qualify go back to the top of the sheet (where they took effect), after its header
        const back = seq.get(g)!.filter((it) => it.from !== "sheet" && !(sharedSet.has(it.key) && SHARED[sharedSet.get(it.key)!].gens.includes(g)));
        let anchor: ChildNode | undefined = root.first?.type === "comment" ? root.first : undefined;
        for (const it of back) {
            const n = it.node.clone() as Rule | AtRule;
            if (n.type === "rule") n.selector = n.selector.replace(/\.gen-N(?![\w-])/g, `.gen-${g}`);
            n.raws.before = "\n\n";
            if (anchor) anchor.after(n);
            else root.prepend(n);
            anchor = n;
        }
        sheets.set(g, root.toString().replace(/\n[ \t]*\n([ \t]*\n)+/g, "\n\n"));
    }
    return { out: { sheets, s345: sharedText("s345"), s45: sharedText("s45") }, dedupe, moves, banned };
}

// ---------- run passes until nothing changes ----------
// A pass judges every move against the cascade it is given, so each pass's output renders like its input, and the last
// like the original. A later pass only finds moves that an earlier pass's choice between two moved rules had blocked.

const read = (f: string) => (existsSync(f) ? readFileSync(f, "utf8") : "");
const start: Texts = { sheets: new Map(GENS.map((g) => [g, read(sheetPath(g))])), s345: read(SHARED.s345.file), s45: read(SHARED.s45.file) };
const same = (a: Texts, b: Texts) => a.s345 === b.s345 && a.s45 === b.s45 && GENS.every((g) => a.sheets.get(g) === b.sheets.get(g));
let cur = start;
let first: PassResult | null = null;
let last!: PassResult;
let passes = 0;
for (; passes < 20; passes++) {
    last = pass(cur);
    first ??= last;
    if (same(last.out, cur)) break;
    cur = last.out;
}

const files: [string, string, string][] = [
    ...GENS.map((g) => [sheetPath(g), start.sheets.get(g)!, cur.sheets.get(g)!] as [string, string, string]),
    [SHARED.s345.file, start.s345, cur.s345],
    [SHARED.s45.file, start.s45, cur.s45],
];
if (WRITE) for (const [f, before, now] of files) if (before !== now) writeFileSync(f, now);

// ---------- report ----------

const pretty = (k: string) => {
    const [kind, a, b] = k.split("|");
    return (kind === "R" ? a : kind === "K" ? `@keyframes ${b}` : kind === "F" ? `@font-face ${a}` : a).slice(0, 130);
};
for (const g of GENS) {
    const d = first!.dedupe.get(g)!;
    console.log(`gen${g}: ${d.length} duplicate(s) removed`);
    if (LIST) for (const l of d) console.log(`    gen${g}${l}`);
}
const { moves, banned } = last;
console.log(
    `shared-gen345: ${moves.s345.length} rules; shared-gen45: ${moves.s45.length} rules; kept in place by a cascade conflict: ` +
        `${banned.s345.size} (gen3-5), ${banned.s45.size} (gen4-5); ${passes} pass(es) changed something`,
);
if (LIST) {
    for (const set of ["s345", "s45"] as SetName[]) {
        for (const k of moves[set]) console.log(`    ${set} move  ${pretty(k)}`);
        for (const [k, why] of banned[set]) console.log(`    ${set} keep  ${pretty(k)}   <- ${why}`);
    }
}
const lines = (t: string) => (t ? t.split("\n").length - (t.endsWith("\n") ? 1 : 0) : 0);
for (const [f, before, now] of files)
    console.log(`${f.slice(REPO.length + 1).replace(/\\/g, "/")}: ${lines(before)} -> ${lines(now)} lines${WRITE && before !== now ? "  WRITTEN" : ""}`);
