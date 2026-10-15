/**
 * Finds, and with --write removes, CSS in `games/genN/style.css` that can never apply:
 *
 * 1. **Dead selectors**: a selector naming a class or id that appears nowhere in the generation's source (its
 *    `games/genN/**` including data, `core/**`, the shell, and for gen1 its top-level folders). A rule loses its dead
 *    selectors; a rule with none left is removed.
 * 2. **Overridden declarations**: a declaration whose property is set again by a later rule with the identical
 *    selector in the same @media/@supports context (same elements, same specificity, later wins). A declaration is
 *    removed only when every selector of its rule is overridden that way, the later value parses as a plausible value,
 *    and `!important` doesn't reverse the order.
 * 3. With --comments: commented-out CSS (a comment holding `{`, `}` and `prop: value;`).
 *
 * Heuristics stay on the safe side: any word in the source counts as a used class, class names assembled at run time
 * count as used through their literal prefix (`ePkmn${n}`, `'background-' + t`) or suffix, and Vue transition classes
 * count through their transition name. The harness is the proof: after --write, pixels, layout and rects must show
 * no difference (docs/ui-uniformity-plan.md stage 2).
 *
 *   npx tsx tools/css/dead-css.ts                  report for every generation
 *   npx tsx tools/css/dead-css.ts --gen=2 --write  rewrite gen2's sheet
 *   add --comments to also drop commented-out CSS, --list to print every removal
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import postcss, { type AtRule, type ChildNode, type Declaration, type Rule } from "postcss";

const REPO = join(import.meta.dirname, "..", "..");
const R = join(REPO, "src", "renderer");

const argv = process.argv.slice(2);
const flag = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const WRITE = argv.includes("--write");
const COMMENTS = argv.includes("--comments");
const LIST = argv.includes("--list");
const GENS = (flag("gen") ?? "1,2,3,4,5").split(",").map(Number);

function walk(dir: string, out: string[] = []): string[] {
    if (!existsSync(dir)) return out;
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
            if (name !== "node_modules") walk(p, out);
        } else if (/\.(vue|ts|js|mjs|html|json)$/.test(name)) out.push(p);
    }
    return out;
}

/** Every source file whose markup or code can put a class or id into generation `g`'s page. */
function sourcesFor(g: number): string[] {
    const files = [...walk(join(R, "games", `gen${g}`)), ...walk(join(R, "core")), ...walk(join(R, "packages"))];
    for (const f of ["main.ts", "index.html", "shortcuts.html", "App.vue"]) if (existsSync(join(R, f))) files.push(join(R, f));
    // The shell's own components render into every generation's page.
    files.push(join(R, "components", "GameSelect.vue"));
    if (g === 1) for (const d of ["components", "stores", "logic", "autosplitter", "methods", "utils", "data"]) walk(join(R, d), files);
    return [...new Set(files)];
}

interface Usage {
    words: Set<string>;
    prefixes: string[];
    suffixes: string[];
    /** Literal pieces between two interpolations (`${a}mod_${b}`): a class containing one is used. */
    infixes: string[];
}

function usageFor(g: number): Usage {
    const words = new Set<string>();
    const prefixes = new Set<string>();
    const suffixes = new Set<string>();
    const infixes = new Set<string>();
    for (const f of sourcesFor(g)) {
        const txt = readFileSync(f, "utf8");
        for (const m of txt.matchAll(/[A-Za-z_][\w-]*/g)) words.add(m[0]);
        for (const m of txt.matchAll(/([A-Za-z_][\w-]*)\$\{/g)) prefixes.add(m[1]);
        // 'ePkmnMoveStyle ePkmnMove' + n: the last word before the closing quote is a prefix
        // (a string of several classes counted as one word once, and their rules were wrongly removed)
        for (const m of txt.matchAll(/(['"`])([^'"`\n]*?)([A-Za-z_][\w-]*)\1\s*\+/g)) prefixes.add(m[3]);
        for (const m of txt.matchAll(/\}([A-Za-z_][\w-]*)/g)) suffixes.add(m[1]);
        for (const m of txt.matchAll(/\}([\w-]+)\$\{/g)) infixes.add(m[1]);
        // n + 'suffix other': the first word after the opening quote is a suffix
        for (const m of txt.matchAll(/\+\s*(['"`])([\w-]+)/g)) suffixes.add(m[2]);
    }
    return {
        words,
        prefixes: [...prefixes].filter((p) => p.length >= 2),
        suffixes: [...suffixes].filter((s) => s.length >= 3),
        infixes: [...infixes].filter((s) => s.length >= 3),
    };
}

const TRANSITION_SUFFIX = /-(enter|leave|appear)(-(active|from|to))?$|-move$/;

function nameUsed(name: string, u: Usage): boolean {
    if (u.words.has(name)) return true;
    const t = name.replace(TRANSITION_SUFFIX, "");
    if (t !== name && (u.words.has(t) || t === "v")) return true;
    if (u.prefixes.some((p) => name.startsWith(p))) return true;
    if (u.suffixes.some((s) => name.endsWith(s))) return true;
    if (u.infixes.some((s) => name.includes(s))) return true;
    return false;
}

/** Classes and ids a selector requires, ignoring anything inside :not()/:is()/:where()/:has() and attribute brackets. */
function requiredNames(selector: string): string[] {
    let s = selector;
    // Strip functional pseudo-classes (possibly nested) and attribute selectors.
    for (let i = 0; i < 5; i++) s = s.replace(/:(not|is|where|has|matches)\((?:[^()]|\([^()]*\))*\)/g, "");
    s = s.replace(/\[[^\]]*\]/g, "");
    const names: string[] = [];
    for (const m of s.matchAll(/[.#](-?[A-Za-z_][\w-]*)/g)) names.push(m[1]);
    return names.filter((n) => !/^gen-\d$/.test(n));
}

function context(node: ChildNode): string {
    const c: string[] = [];
    let p = node.parent;
    while (p && p.type !== "root") {
        if (p.type === "atrule") c.unshift(`@${(p as AtRule).name} ${(p as AtRule).params.replace(/\s+/g, " ")}`);
        p = p.parent as typeof p;
    }
    return c.join(" | ");
}

function inKeyframesOrFontFace(rule: Rule): boolean {
    let p = rule.parent;
    while (p && p.type !== "root") {
        if (p.type === "atrule" && /keyframes|font-face|page/.test((p as AtRule).name)) return true;
        p = p.parent as typeof p;
    }
    return false;
}

/** A value the browser would plausibly accept. Rejects the typos the audit found (`13x`, `0 0x`). */
function plausible(d: Declaration): boolean {
    const v = d.value.trim();
    if (!v) return false;
    if (/var\(/.test(v)) return true;
    const okUnit = /^(px|em|rem|vh|vw|vmin|vmax|ms|s|deg|rad|turn|fr|ch|ex|pt|pc|in|cm|mm|dpi|dppx|grad|q|%)$/i;
    for (const m of v.matchAll(/(?<![\w#.-])-?\d*\.?\d+([a-z%]+)/gi)) {
        const unit = m[1];
        // `x` is a unit only inside image-set() and resolution queries; elsewhere (`13x`, `0x`) it's a typo
        if (unit.toLowerCase() === "x") {
            if (!/image-set|resolution/.test(v)) return false;
            continue;
        }
        if (!okUnit.test(unit) && !/^e\d/i.test(unit)) return false;
    }
    return true;
}

interface Result {
    gen: number;
    before: number;
    after: number;
    deadRules: number;
    deadSelectors: number;
    overriddenDecls: number;
    emptiedRules: number;
    comments: number;
    removals: string[];
}

function processGen(g: number): Result {
    const file = join(R, "games", `gen${g}`, "style.css");
    const css = readFileSync(file, "utf8");
    const root = postcss.parse(css, { from: file });
    const u = usageFor(g);
    const res: Result = { gen: g, before: css.split("\n").length, after: 0, deadRules: 0, deadSelectors: 0, overriddenDecls: 0, emptiedRules: 0, comments: 0, removals: [] };

    // 1. dead selectors
    root.walkRules((rule) => {
        if (inKeyframesOrFontFace(rule)) return;
        const keep: string[] = [];
        const drop: string[] = [];
        for (const sel of rule.selectors) {
            const dead = requiredNames(sel).find((n) => !nameUsed(n, u));
            (dead ? drop : keep).push(sel);
        }
        if (drop.length === 0) return;
        const line = rule.source?.start?.line;
        if (keep.length === 0) {
            res.deadRules++;
            res.removals.push(`:${line} dead rule  ${rule.selector.replace(/\s+/g, " ").slice(0, 120)}`);
            rule.remove();
        } else {
            res.deadSelectors += drop.length;
            res.removals.push(`:${line} dead selector(s)  ${drop.join(", ").replace(/\s+/g, " ").slice(0, 120)}`);
            rule.selectors = keep;
        }
    });

    // 2. overridden declarations: walk rules in order, remember for each (ctx, selector, prop) the last plausible setter
    const rules: Rule[] = [];
    root.walkRules((r) => {
        if (!inKeyframesOrFontFace(r)) rules.push(r);
    });
    // later setters: key -> list of {index, important}
    const setters = new Map<string, { idx: number; important: boolean }[]>();
    rules.forEach((r, idx) => {
        const ctx = context(r);
        for (const sel of r.selectors) {
            const s = sel.replace(/\s+/g, " ").trim();
            for (const n of r.nodes) {
                if (n.type !== "decl" || !plausible(n)) continue;
                const key = `${ctx}##${s}##${n.prop.toLowerCase()}`;
                if (!setters.has(key)) setters.set(key, []);
                setters.get(key)!.push({ idx, important: !!n.important });
            }
        }
    });
    rules.forEach((r, idx) => {
        const ctx = context(r);
        const sels = r.selectors.map((s) => s.replace(/\s+/g, " ").trim());
        const decls = r.nodes.filter((n): n is Declaration => n.type === "decl");
        // within the same rule, an earlier declaration of the same property is overridden by a later one
        const lastInRule = new Map<string, number>();
        decls.forEach((d, i) => {
            if (plausible(d)) lastInRule.set(d.prop.toLowerCase(), i);
        });
        decls.forEach((d, i) => {
            const prop = d.prop.toLowerCase();
            const later = lastInRule.get(prop);
            const sameRule = later !== undefined && later > i && !(d.important && !decls[later].important);
            const byLaterRule = sels.every((s) =>
                (setters.get(`${ctx}##${s}##${prop}`) ?? []).some((x) => x.idx > idx && !(d.important && !x.important)),
            );
            // A fallback pair (`display: -webkit-box; display: flex`) is intentional; only same-value or plain repeats.
            const fallbackPair = sameRule && /^-/.test(d.value) !== /^-/.test(decls[later!].value);
            if ((sameRule && !fallbackPair) || byLaterRule) {
                res.overriddenDecls++;
                if (LIST) res.removals.push(`:${d.source?.start?.line} overridden  ${sels[0].slice(0, 80)} { ${prop}: ${d.value} }`);
                d.remove();
            }
        });
        if (r.nodes.filter((n) => n.type === "decl").length === 0 && r.nodes.every((n) => n.type !== "rule" && n.type !== "atrule")) {
            res.emptiedRules++;
            res.removals.push(`:${r.source?.start?.line} emptied rule  ${sels.join(", ").slice(0, 120)}`);
            r.remove();
        }
    });

    // 3. commented-out CSS
    if (COMMENTS) {
        root.walkComments((c) => {
            if (/[{}]/.test(c.text) && /[\w-]+\s*:\s*[^;]+;/.test(c.text)) {
                res.comments++;
                if (LIST) res.removals.push(`:${c.source?.start?.line} commented-out CSS  ${c.text.replace(/\s+/g, " ").slice(0, 100)}`);
                c.remove();
            }
        });
    }

    // empty at-rules left behind
    root.walkAtRules((a) => {
        if (/media|supports/.test(a.name) && (!a.nodes || a.nodes.length === 0)) a.remove();
    });

    let out = root.toString().replace(/\n[ \t]*\n([ \t]*\n)+/g, "\n\n");
    res.after = out.split("\n").length;
    if (WRITE) writeFileSync(file, out);
    return res;
}

const results = GENS.map(processGen);
for (const r of results) {
    console.log(
        `gen${r.gen}: ${r.before} -> ${r.after} lines  (dead rules ${r.deadRules}, dead selectors ${r.deadSelectors}, ` +
            `overridden declarations ${r.overriddenDecls}, emptied rules ${r.emptiedRules}, comments ${r.comments})${WRITE ? "  WRITTEN" : ""}`,
    );
    if (LIST) for (const l of r.removals) console.log(`    gen${r.gen}${l}`);
}
