/**
 * The lifted overlays' `dataSearch` (gens 2-5) resolves a species or move name against
 * a data table case-insensitively: `Object.keys(table).find(k => k.toLowerCase() ==
 * name.toLowerCase())`. The movepool table calls it once per learnset entry, from the
 * template, on every render -- 12,000-18,000 lower-cased key comparisons per
 * `getMovepool()` on the Platinum tables (docs/performance-followups.md, third pass).
 *
 * This is the same lookup with the lower-cased keys indexed once per table. What it
 * returns is what `find` returned: the *first* key in the table's key order whose
 * lower-cased spelling matches, or `undefined`.
 *
 * Two of the tables grow after the index is built -- gen4's `applySpeciesAliases()`
 * mirrors alias keys onto the pokedexes from `mounted()`, gen2's backport importer adds
 * species to the Crystal dex -- so a miss re-checks the table's key count and rebuilds
 * when it moved. A hit cannot go stale: keys are only ever appended, and an appended key
 * can never come before an existing match in key order.
 */
interface Index {
    keys: Map<string, string>;
    size: number;
}

const indexes = new WeakMap<object, Index>();

function build(table: Record<string, unknown>): Index {
    const names = Object.keys(table);
    const keys = new Map<string, string>();
    for (const key of names) {
        const lower = key.toLowerCase();
        if (!keys.has(lower)) keys.set(lower, key);
    }
    const index = { keys, size: names.length };
    indexes.set(table, index);
    return index;
}

export function findKeyIgnoringCase(table: Record<string, unknown>, name: string): string | undefined {
    const lower = name.toLowerCase();
    let index = indexes.get(table) ?? build(table);
    let key = index.keys.get(lower);
    if (key === undefined && Object.keys(table).length !== index.size) {
        index = build(table);
        key = index.keys.get(lower);
    }
    return key;
}
