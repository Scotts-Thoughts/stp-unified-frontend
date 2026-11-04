/**
 * Reads a generation's per-species style default files (`games/genN/data/style/*.json`, one lazy
 * chunk each through `import.meta.glob`) into one table keyed by file name, `index` skipped,
 * in the glob's order.
 *
 * All the files are requested at once. Gens 2-5 used to await them one by one: 140-390 chunk
 * loads of ~7 ms each in a row, which was 2.5 s of the 2.9 s between the mapper loading and
 * gen4's overlay appearing (measured 2026-11-02). The table is the same: the same entries, in the
 * same insertion order, and a failed file still fails the load.
 */
export async function loadStyleFiles(
    files: Record<string, () => Promise<unknown>>,
): Promise<Record<string, Record<string, unknown>>> {
    const wanted = Object.entries(files)
        .map(([path, load]) => [path.slice(path.lastIndexOf("/") + 1, -".json".length), load] as const)
        .filter(([name]) => name !== "index");
    const values = await Promise.all(wanted.map(([, load]) => load()));
    const table: Record<string, Record<string, unknown>> = {};
    wanted.forEach(([name], i) => {
        const value = values[i];
        if (value && typeof value === "object") table[name] = value as Record<string, unknown>;
    });
    return table;
}
