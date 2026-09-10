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
