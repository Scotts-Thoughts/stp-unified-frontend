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
    sourceDir?: string,
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
    if (sourceDir) mergeLiveStyleFiles(table, await liveStyleFiles(sourceDir));
    return table;
}

/**
 * The style files as they are in the checkout's source now: what the user last styled on
 * their computer, which the build in use may predate. Gens 2-5 write a style edit back into
 * those files in any unpackaged run (dev mode, core/env.ts), but a built bundle holds them as
 * they were at build time, so without this a refresh of a built-from-source app lost every edit
 * since the build (gens 2 and 4 read only the bundled defaults and the `user_` overrides back),
 * and a species styled for the first time, with no file in the bundle at all, came back unstyled.
 * The Cutter editor asks its own handler (src/main/cutter.ts). Null in a packaged build, or
 * when the main process cannot say.
 */
async function liveStyleFiles(sourceDir: string): Promise<Record<string, unknown> | null> {
    type Ask = ((dir: string) => Promise<unknown>) | null | undefined;
    const api = (window as unknown as { api?: { cutter_style_files?: Ask; source_style_files?: Ask } }).api;
    const ask = api?.cutter_style_files ?? api?.source_style_files;
    if (!ask) return null;
    try {
        const live = await ask(sourceDir);
        return live && typeof live === "object" ? (live as Record<string, unknown>) : null;
    } catch (e) {
        console.error(`[styleFiles] could not read the live style files of ${sourceDir}:`, e);
        return null;
    }
}

/** The live files over the bundled ones: a file says `null` for a style removed. */
export function mergeLiveStyleFiles(table: Record<string, Record<string, unknown>>, live: Record<string, unknown> | null): void {
    if (!live) return;
    for (const [name, value] of Object.entries(live)) {
        if (value && typeof value === "object") table[name] = value as Record<string, unknown>;
        else if (value === null) delete table[name];
    }
}
