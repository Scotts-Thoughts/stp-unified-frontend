/**
 * Build-time environment flags.
 *
 * gen1 asks `process.env.NODE_ENV !== "development"` in three components and
 * `import.meta.env.DEV` in a fourth. `process` only exists in the renderer because
 * `nodeIntegration` is on, so plan 1.6 replaces the reads with one build define that
 * Vite substitutes statically: `import.meta.env.DEV` is `true` under `electron-vite dev`
 * and `false` in every build, which is exactly what the old comparison resolved to.
 *
 * The `try` is for the parity harness and any non-Vite context (unit runs, `tsx`), where
 * `import.meta.env` is undefined; those are release-like, matching the legacy default.
 */
export const IS_DEV: boolean = (() => {
    try {
        return !!(import.meta as any).env?.DEV;
    } catch (e) {
        return false;
    }
})();

/** The inverse, under the name the gen1 templates already bind to. */
export const IS_RELEASE: boolean = !IS_DEV;

/**
 * Whether the app runs from a packaged build, as the main process reports it.
 *
 * This is a *different* question from {@link IS_DEV}. gen2-5's style managers decide
 * "write style edits back into the source tree, or keep them as user overrides" by
 * `!app.isPackaged` -- so an unpackaged build launched by `electron.exe <dir>` (the
 * harness, and the queuer's `npm run dev`) writes back, and only a real package does
 * not. `import.meta.env.DEV` would say "production" for the harness's built app and
 * make it persist differently from the legacy app it is compared against.
 *
 * Read once by {@link initEnv} before anything decides; `isPackaged()` is synchronous
 * after that, which is what the legacy managers' constructors were.
 */
let packaged: boolean | null = null;

export async function initEnv(): Promise<void> {
    if (packaged !== null) return;
    try {
        packaged = await window.api.is_packaged();
    } catch {
        packaged = !IS_DEV;
    }
}

export function isPackaged(): boolean {
    if (packaged === null) throw new Error("initEnv() has not run");
    return packaged;
}
