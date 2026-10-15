/**
 * Lists every generation's shortcut action ids (games/genN/actions.ts), so a change that rebuilds
 * the lists (the settings panel descriptors, docs/ui-uniformity-plan.md stage 4) can prove the
 * persisted ids survived: action ids are saved in user_state.json `shortcuts`, and a renamed id
 * silently drops a user's key (ARCHITECTURE §4 "Shortcuts").
 *
 *   npx tsx tools/parity/action-ids.ts --out=<file>          write "genN id | label | group" lines
 *   npx tsx tools/parity/action-ids.ts --compare=<file>      fail if an id from <file> is missing now
 *
 * The overlay instance is a stand-in that answers every property read with another stand-in, so
 * building the lists runs no real code. Labels and groups are listed for review; only ids must match.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createPinia, setActivePinia } from "pinia";

const argv = process.argv.slice(2);
const flag = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");

function standIn(): any {
    const fn = function () {
        return standIn();
    };
    return new Proxy(fn, {
        get: (_t, key) => {
            if (key === Symbol.toPrimitive) return () => "";
            if (key === Symbol.iterator) return function* () {};
            if (key === "length") return 0;
            if (key === "then") return undefined;
            return standIn();
        },
        apply: () => standIn(),
    });
}

setActivePinia(createPinia());

const lists: Record<string, any[]> = {};
const vm = standIn();
lists.gen1 = (await import("../../src/renderer/games/gen1/actions.ts")).gen1Actions?.() ?? [];
lists.gen2 = (await import("../../src/renderer/games/gen2/actions.ts")).gen2Actions(vm);
lists.gen3 = (await import("../../src/renderer/games/gen3/actions.ts")).gen3Actions(vm);
lists.gen4 = (await import("../../src/renderer/games/gen4/actions.ts")).gen4Actions(vm);
lists.gen5 = (await import("../../src/renderer/games/gen5/actions.ts")).gen5Actions(vm);

const lines: string[] = [];
for (const [gen, actions] of Object.entries(lists)) {
    const seen = new Set<string>();
    for (const a of actions) {
        if (seen.has(a.id)) console.error(`${gen}: duplicate action id ${a.id}`);
        seen.add(a.id);
        lines.push(`${gen} ${a.id} | ${a.label} | ${a.group}`);
    }
}

const out = flag("out");
if (out) {
    writeFileSync(out, lines.join("\n") + "\n");
    console.log(`${lines.length} actions written to ${out}`);
}

const compare = flag("compare");
if (compare) {
    const now = new Set(lines.map((l) => l.split(" | ")[0]));
    const before = readFileSync(compare, "utf8").split("\n").filter(Boolean).map((l) => l.split(" | ")[0]);
    const missing = before.filter((id) => !now.has(id));
    const added = [...now].filter((id) => !before.includes(id));
    for (const id of missing) console.log(`MISSING ${id}`);
    for (const id of added) console.log(`added   ${id}`);
    console.log(`${before.length} before, ${now.size} now: ${missing.length} missing, ${added.length} added`);
    if (missing.length) process.exit(1);
}
if (!out && !compare) console.log(lines.join("\n"));
