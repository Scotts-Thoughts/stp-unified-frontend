import { isPackaged } from "~/core/env";
import { getUserState, setUserState } from "./userState";

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
     * gen4's debounced defaults write (500 ms after the last edit, flushed on
     * `beforeunload`); gen2 writes on every edit. Omitted means immediate.
     */
    writeDebounceMs?: number;
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

export function createStyleSettingsStore(options: StyleSettingsOptions): StyleSettingsStore {
    const tag = options.tag ?? "[StyleSettingsManager]";
    const defaults = options.defaults;
    // The legacy rule: dev mode is "not packaged", not "Vite dev server" (core/env.ts).
    const isDev = !isPackaged();
    console.log(`${tag} Initialized in ${isDev ? "DEVELOPMENT" : "PRODUCTION"} mode`);

    const writeDefaultsFileNow = (key: string): void => {
        const value = defaults[key];
        const name = key.replace(/[<>:"/\|?*]/g, "_");
        const relative = `${options.sourceDir}/${name}.json`;
        const promise =
            value === undefined
                ? window.api.source.write(relative, "null\n")
                : window.api.source.write(relative, JSON.stringify(value, null, 2) + "\n");
        promise
            .then(() => console.log(`${tag} Saved default settings to file`))
            .catch((e) => console.error(`${tag} Failed to write default settings file:`, e?.message ?? e));
    };

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
    if (options.writeDebounceMs) window.addEventListener("beforeunload", flushPendingWrites);
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
            // use"; nothing reads a bare style key back, but the write is kept so the
            // persisted state matches what the legacy app left behind.
            setUserState(key, defaults[key] ?? null);
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

        resetAllToDefaults() {
            for (const key of Object.keys(defaults)) store.resetToDefaults(key);
        },

        exportCurrentAsDefaults() {
            const exported: Record<string, unknown> = {};
            for (const key of Object.keys(defaults)) {
                const current = store.get(key);
                if (current === null) continue;
                // gen4 also drops a species whose value has no style field at all.
                const value = styleOnly(current as Record<string, unknown>);
                if (!options.styleProperties || Object.keys(value).length > 0) exported[key] = value;
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
