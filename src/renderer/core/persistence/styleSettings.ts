import { isPackaged } from "~/core/env";
import { getUserState, setUserState, userStateKeys } from "./userState";

/**
 * The layered style store gen2-5 keep behind `MyStorage` (plan 2.6, decision 10;
 * known-legacy-bugs.md #25).
 *
 * Each legacy app has a `style_settings_manager.js` with the same shape: a value is
 * either a *style key* (a species name, holding that species' art and background
 * settings -- and, because MyStorage routes every species-keyed value here, its run
 * counters and split history too) or a plain key. Plain keys were `localStorage`
 * entries; style keys were `defaults[key]` merged with a `user_<key>` override. In dev
 * mode a style write went back into the shipped defaults file so it landed in git; in
 * a packaged build it became the override.
 *
 * This is that, with two substitutions and no rule changes:
 *   - plain keys and `user_<key>` overrides live in `data/user_state.json`, under the
 *     same names, through `core/persistence/userState.ts`;
 *   - the shipped defaults are per-species JSON files under
 *     `games/genN/data/style/`, and the dev-mode write-back rewrites one species
 *     file over `source:write` instead of a 26 MB blob (plan 2.2, 5.2).
 *
 * The rules that decide which keys are style keys differ per generation and are
 * passed in (`isStyleKey`); the code that applies them is shared.
 */
export interface StyleSettingsOptions {
    /** The per-species defaults, keyed exactly as the legacy blob was. */
    defaults: Record<string, Record<string, unknown>>;
    /** The generation's own `isStyleSettingsKey` rule, verbatim. */
    isStyleKey: (key: string, defaults: Record<string, unknown>) => boolean;
    /** Where a dev-mode write goes: `games/gen2/data/style` (relative to `src/renderer`). */
    sourceDir: string;
    /** Prefix for the log lines, `[StyleSettingsManager]` in every legacy app. */
    tag?: string;
    /**
     * gen4/gen5's `stylePropertyKeys`: only these fields of a species value reach the
     * shipped defaults (dev-mode write-back) and the export. gen2 has the list too but
     * never filters with it, so it passes nothing here and the whole value goes through.
     */
    styleProperties?: readonly string[];
    /**
     * The fields `exportCurrentAsDefaults` keeps of a species value. gen2's manager
     * has the same `stylePropertyKeys` list as gen4's but applies it *only* there --
     * its dev-mode write-back takes the whole value -- so gen2 passes this and not
     * `styleProperties`. Defaults to `styleProperties`.
     */
    exportProperties?: readonly string[];
    /**
     * gen4's debounced defaults write (500 ms after the last edit, flushed on
     * `beforeunload`); gen5's is 1 s with no flush; gen2 writes on every edit.
     * Omitted means immediate.
     */
    writeDebounceMs?: number;
    /** gen5 does not flush its pending write on unload (known-legacy-bugs.md #25). */
    noUnloadFlush?: boolean;
    /**
     * gen5's manager keeps a third layer: a style key reads as the defaults, then the
     * bare key, then the `user_` override, merged; and a dev-mode write stores the
     * *full* value under the bare key (gen2/gen4 store the filtered defaults there),
     * so run counters and split history round-trip while the defaults file stays
     * small. A null write deletes the bare key too.
     */
    threeLayer?: boolean;
}

export interface StyleSettingsStore {
    readonly isDev: boolean;
    isStyleSettingsKey(key: string): boolean;
    get(key: string): unknown;
    set(key: string, value: unknown): void;
    getDefault(key: string): unknown;
    hasUserOverrides(key: string): boolean;
    getUserOverrides(key: string): Record<string, unknown> | null;
    resetToDefaults(key: string): void;
    resetAllToDefaults(): void;
    exportCurrentAsDefaults(): Record<string, unknown>;
    /** The legacy `_saveToDefaults`, exposed because `StyleSettingsUtils` calls it. */
    saveToDefaults(key: string, value: unknown): void;
}

/**
 * Rewrites one species file under `sourceDir` (relative to `src/renderer`) over
 * `source:write`; `undefined` writes `null`, which the loaders skip. The dev-mode
 * write-back of this store and of gen3's own (`games/gen3/storage.ts`), and the
 * only place that knows the file naming.
 */
export function writeStyleDefaultsFile(sourceDir: string, key: string, value: unknown, tag = "[StyleSettingsManager]", log = true): void {
    const name = key.replace(/[<>:"/\|?*]/g, "_");
    const relative = `${sourceDir}/${name}.json`;
    const promise =
        value === undefined
            ? window.api.source.write(relative, "null\n")
            : window.api.source.write(relative, JSON.stringify(value, null, 2) + "\n");
    promise
        .then(() => { if (log) console.log(`${tag} Saved default settings to file`); })
        .catch((e) => { if (log) console.error(`${tag} Failed to write default settings file:`, e?.message ?? e); });
}

export function createStyleSettingsStore(options: StyleSettingsOptions): StyleSettingsStore {
    const tag = options.tag ?? "[StyleSettingsManager]";
    const defaults = options.defaults;
    // The legacy rule: dev mode is "not packaged", not "Vite dev server" (core/env.ts).
    const isDev = !isPackaged();
    console.log(`${tag} Initialized in ${isDev ? "DEVELOPMENT" : "PRODUCTION"} mode`);

    const writeDefaultsFileNow = (key: string): void => writeStyleDefaultsFile(options.sourceDir, key, defaults[key], tag);

    // gen4's `_scheduleWriteDefaultsFile`: one timer, reset by every edit, flushed on
    // unload. Per key here, because a key is a file; the legacy blob was one file.
    const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();
    const flushPendingWrites = (): void => {
        for (const [key, timer] of pendingWrites) {
            clearTimeout(timer);
            writeDefaultsFileNow(key);
        }
        pendingWrites.clear();
    };
    if (options.writeDebounceMs && !options.noUnloadFlush) window.addEventListener("beforeunload", flushPendingWrites);
    const writeDefaultsFile = (key: string): void => {
        const delay = options.writeDebounceMs;
        if (!delay) {
            writeDefaultsFileNow(key);
            return;
        }
        const pending = pendingWrites.get(key);
        if (pending) clearTimeout(pending);
        pendingWrites.set(key, setTimeout(() => {
            pendingWrites.delete(key);
            writeDefaultsFileNow(key);
        }, delay));
    };

    /** gen4's "only persist style fields": the listed properties of `value`, or all of it. */
    const styleOnly = (value: Record<string, unknown>): Record<string, unknown> => {
        const keys = options.styleProperties;
        if (!keys) return value;
        const out: Record<string, unknown> = {};
        for (const prop of keys) if (prop in value) out[prop] = value[prop];
        return out;
    };

    const store: StyleSettingsStore = {
        isDev,
        isStyleSettingsKey: (key) => options.isStyleKey(key, defaults),

        get(key) {
            if (!store.isStyleSettingsKey(key)) {
                // Plain key: the raw localStorage read was `raw ? JSON.parse(raw) : null`.
                const value = getUserState<unknown>(key, null);
                return value === undefined ? null : value;
            }
            const userValue = getUserState<Record<string, unknown> | null>(`user_${key}`, null);
            const defaultValue = (defaults[key] as Record<string, unknown> | undefined) || null;
            if (options.threeLayer) {
                const localValue = getUserState<Record<string, unknown> | null>(key, null);
                if (userValue === null && localValue === null && defaultValue === null) return null;
                return { ...(defaultValue || {}), ...(localValue || {}), ...(userValue || {}) };
            }
            if (userValue === null && defaultValue === null) return null;
            if (userValue === null) return defaultValue;
            if (defaultValue === null) return userValue;
            return { ...defaultValue, ...userValue };
        },

        set(key, value) {
            if (!store.isStyleSettingsKey(key)) {
                setUserState(key, value === undefined ? null : value);
                return;
            }
            if (isDev) store.saveToDefaults(key, value);
            else saveToUserStorage(key, value);
        },

        saveToDefaults(key, value) {
            if (value === undefined || value === null) {
                delete defaults[key];
            } else {
                defaults[key] = { ...(defaults[key] || {}), ...styleOnly(value as Record<string, unknown>) };
            }
            writeDefaultsFile(key);
            // The legacy manager also wrote the bare key to localStorage "for immediate
            // use" -- gen2/gen4 the filtered defaults, gen5 the full value (which its
            // three-layer `get` reads back). Kept so the persisted state matches what
            // the legacy app left behind.
            if (options.threeLayer) setUserState(key, value === undefined ? null : value);
            else setUserState(key, defaults[key] ?? null);
        },

        getDefault: (key) => defaults[key] ?? null,
        hasUserOverrides: (key) => getUserState<unknown>(`user_${key}`, null) !== null,
        getUserOverrides: (key) => getUserState<Record<string, unknown> | null>(`user_${key}`, null),

        resetToDefaults(key) {
            setUserState(`user_${key}`, null);
            const defaultValue = defaults[key];
            if (defaultValue) setUserState(key, defaultValue);
            else setUserState(key, null);
        },

        // The legacy manager swept `Object.keys(localStorage)`: every `user_` override
        // whose key is a style key goes, whether or not a shipped default exists for it,
        // and then every shipped default is restored to its bare key.
        resetAllToDefaults() {
            for (const key of userStateKeys()) {
                if (key.startsWith("user_") && store.isStyleSettingsKey(key.replace("user_", ""))) setUserState(key, null);
            }
            for (const key of Object.keys(defaults)) setUserState(key, defaults[key]);
        },

        // Also a sweep of the store, and of the *bare* keys -- what the last write
        // left there, not the merged view `get` returns -- keeping the listed style
        // fields and dropping a species that has none of them.
        exportCurrentAsDefaults() {
            const keep = options.exportProperties ?? options.styleProperties;
            const exported: Record<string, unknown> = {};
            for (const key of userStateKeys()) {
                if (!store.isStyleSettingsKey(key) || key.startsWith("user_")) continue;
                const value = getUserState<unknown>(key, null);
                if (!value || typeof value !== "object") continue;
                const styleValue: Record<string, unknown> = {};
                for (const prop of keep ?? Object.keys(value)) if (prop in (value as Record<string, unknown>)) styleValue[prop] = (value as Record<string, unknown>)[prop];
                if (Object.keys(styleValue).length > 0) exported[key] = styleValue;
            }
            return exported;
        },
    };

    function saveToUserStorage(key: string, value: unknown): void {
        if (value === undefined || value === null) {
            setUserState(`user_${key}`, null);
        } else {
            const defaultValue = (defaults[key] as Record<string, unknown>) || {};
            const overrides: Record<string, unknown> = {};
            for (const prop in value as Record<string, unknown>) {
                const v = (value as Record<string, unknown>)[prop];
                if (JSON.stringify(v) !== JSON.stringify(defaultValue[prop])) overrides[prop] = v;
            }
            setUserState(`user_${key}`, Object.keys(overrides).length ? overrides : null);
        }
        setUserState(key, value === undefined ? null : value);
    }

    return store;
}
