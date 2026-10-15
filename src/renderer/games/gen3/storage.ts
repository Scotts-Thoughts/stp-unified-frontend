import { isPackaged } from "~/core/env";
import { getUserState, setUserState, userStateKeys } from "~/core/persistence/userState";
import { createDebouncedStyleWriter, writeStyleDefaultsFile } from "~/core/persistence/styleSettings";

/**
 * gen3's `MyStorage` and `StyleSettingsUtils` (the first 200 lines of its
 * `scripts/frontend.js`), on the file-backed user state (plan 2.6).
 *
 * gen3's `lib/style_settings_manager.js` is an earlier model than gen2/4/5's and has
 * no `user_` overrides: a style key (`<Game>_<Species>`, `..._<Family>-line`,
 * `..._<Family>-line-<Species>`, for the six gen3 game names) reads as the bare key
 * merged over the shipped default, else the default; a write always lands on the bare
 * key and, in dev mode, *replaces* the shipped default (not merges) and rewrites the
 * file; a null write removes the key (and the default, in dev mode). The file rewrite
 * is debounced per key, 500 ms after the last edit and flushed on unload, as gen4's is
 * (the legacy wrote on every slider step; known-legacy-bugs);
 * `resetToDefaults` removes the bare key; `exportCurrentAsDefaults` folds every bare
 * style key into the defaults. Plain keys are plain values. Kept as its own store
 * because those are different rules, not a different configuration of the shared one.
 *
 * `MyStorage`'s own `set` decides style-or-plain before it calls the manager, as the
 * legacy proxy did, and its `has` is the legacy's inverted one (`getItem === null`).
 */

const GAME_PATTERNS = ['Emerald', 'Ruby', 'Sapphire', 'FireRed', 'LeafGreen', 'FireRed and LeafGreen'];

export function isGen3StyleKey(key: unknown): boolean {
    if (!key || typeof key !== 'string') return false;
    return GAME_PATTERNS.some((game) => key.startsWith(`${game}_`));
}

/** One JSON file per game+species; `index.json` lists the keys (tools/port/port-style-defaults.ts). */
const styleFiles = import.meta.glob("./data/style/*.json", { import: "default" }) as Record<string, () => Promise<unknown>>;

let defaults: Record<string, Record<string, unknown>> | null = null;
const SOURCE_DIR = "games/gen3/data/style";
// gen3 logs nothing from its manager (DEBUG_LOGGING is false; the write's own log lines are commented out).
const TAG = "[StyleSettingsManager]";

/** Reads every species file. Idempotent; the module's `prepare()`. */
export async function loadGen3StyleDefaults(): Promise<void> {
    if (defaults) return;
    const loaded: Record<string, Record<string, unknown>> = {};
    for (const [path, load] of Object.entries(styleFiles)) {
        const name = path.slice(path.lastIndexOf("/") + 1, -".json".length);
        if (name === "index") continue;
        const value = await load();
        if (value && typeof value === "object") loaded[name] = value as Record<string, unknown>;
    }
    defaults = loaded;
}

function table(): Record<string, Record<string, unknown>> {
    if (!defaults) throw new Error("gen3 style defaults are not loaded; the module's prepare() must run first");
    return defaults;
}

// The legacy rule: dev mode is "not packaged", not "Vite dev server" (core/env.ts).
const isDev = () => !isPackaged();

// A slider drag sets a style key on every input event; the file is rewritten once the key has been
// still for 500 ms (gen4's value), with whatever the table holds then (null once removed).
let debouncedWrite: ((key: string) => void) | null = null;
function writeDefaultsFile(key: string): void {
    debouncedWrite ??= createDebouncedStyleWriter((k) => writeStyleDefaultsFile(SOURCE_DIR, k, table()[k], TAG, false), 500, true);
    debouncedWrite(key);
}

const styleSettingsManager = {
    isStyleSettingsKey: isGen3StyleKey,
    get(key: string): unknown {
        if (isGen3StyleKey(key)) {
            const localValue = getUserState<Record<string, unknown> | null>(key, null);
            if (localValue !== null && localValue !== undefined) {
                const defaultValue = table()[key] || {};
                return { ...defaultValue, ...localValue };
            }
            if (table()[key]) return table()[key];
        }
        const value = getUserState<unknown>(key, null);
        return value === undefined ? null : value;
    },
    set(key: string, value: unknown): void {
        if (value === undefined || value === null) {
            this.remove(key);
            return;
        }
        if (isGen3StyleKey(key) && isDev()) {
            table()[key] = value as Record<string, unknown>;
            writeDefaultsFile(key);
        }
        setUserState(key, value);
    },
    remove(key: string): void {
        setUserState(key, null);
        if (isGen3StyleKey(key) && isDev()) {
            delete table()[key];
            writeDefaultsFile(key);
        }
    },
    resetToDefaults(key: string): void {
        setUserState(key, null);
    },
    resetAllToDefaults(): void {
        for (const key of userStateKeys()) if (isGen3StyleKey(key)) setUserState(key, null);
    },
    exportCurrentAsDefaults(): boolean {
        if (!isDev()) return false;
        const exported: Record<string, Record<string, unknown>> = {};
        for (const key of userStateKeys()) {
            if (!isGen3StyleKey(key)) continue;
            const value = getUserState<unknown>(key, null);
            if (value && typeof value === "object") exported[key] = value as Record<string, unknown>;
        }
        Object.assign(table(), exported);
        for (const key of Object.keys(exported)) writeStyleDefaultsFile(SOURCE_DIR, key, table()[key], TAG, false);
        return true;
    },
    getDefaultSettingsKeys(): string[] {
        return Object.keys(table());
    },
    isDevMode(): boolean {
        return isDev();
    },
};

export const MyStorage: Record<string, any> = new Proxy({} as Record<string, any>, {
    set: (_, prop: string, value) => {
        // Use the style settings manager for style-related keys
        if (styleSettingsManager.isStyleSettingsKey(prop)) {
            styleSettingsManager.set(prop, value);
        } else {
            setUserState(prop, value === undefined ? null : value);
        }
        return true;
    },
    get: (_, prop: string) => {
        if (prop === "clear") return () => { /* localStorage.clear(): nothing to clear in the file store's cache-by-key model */ };
        if (prop === "entries") return () => [];
        if (prop === "keys") return () => [];
        if (prop === "has") return (key: string) => getUserState<unknown>(key, null) === null;
        if (styleSettingsManager.isStyleSettingsKey(prop)) return styleSettingsManager.get(prop);
        const value = getUserState<unknown>(prop, null);
        return value === undefined ? null : value;
    },
});

/** gen3's `StyleSettingsUtils`, verbatim in behaviour. */
export const StyleSettingsUtils = {
    exportCurrentAsDefaults: () => styleSettingsManager.exportCurrentAsDefaults(),
    resetToDefaults: (key: string) => { styleSettingsManager.resetToDefaults(key); },
    resetAllToDefaults: () => { styleSettingsManager.resetAllToDefaults(); },
    isDevMode: () => styleSettingsManager.isDevMode(),
    getDefaultSettingsKeys: () => styleSettingsManager.getDefaultSettingsKeys(),
};
