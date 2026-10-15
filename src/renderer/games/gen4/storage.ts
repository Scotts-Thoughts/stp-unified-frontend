import { createStyleSettingsStore, type StyleSettingsStore } from "~/core/persistence/styleSettings";

/**
 * gen4's `MyStorage` and `StyleSettingsUtils` (the first 90 lines of its
 * `frontend.js`), on the shared layered store (plan 2.6) -- the same shape as gen2's
 * (`games/gen2/storage.ts`), with gen4's own rules from its
 * `lib/style_settings_manager.js`:
 *
 *   - a key is a species' style entry when it is `<Game>_<Species>` for one of the
 *     three gen4 games, or ends in `-line` (an evolution family); nothing else is,
 *     and the exclusion list is checked first;
 *   - only the listed style fields of a value reach the shipped defaults, and the
 *     dev-mode defaults write is debounced 500 ms (the whole-blob writes that
 *     bloated gen4's defaults file into the megabytes are what those two rules fix).
 */

// A Set: `isStyleSettingsKey` runs on every `MyStorage` read and write
// (docs/performance-followups.md D). The list is this generation's legacy one verbatim.
const NON_STYLE_KEYS = new Set([
    'starter', 'selected_game', 'playerName', 'playerId', 'playerResets',
    'blackout_counter', 'simple_data_str', 'full_data_str', 'deprecated_data_str',
    'simple_data', 'timer_startTimeOffset', 'timer_startTime', 'timer_pause',
    'timer_formatted_time', 'timer_pause_time', 'time_h', 'time_m', 'time_s',
    'time_ms', 'time_split_start', 'battle_start', 'current_splits', 'previous_splits', 'previous_splits_source'
]);

const GAME_PATTERN = /^(Platinum|HeartGold and SoulSilver|Diamond and Pearl)_/;
const LINE_PATTERN = /-line$/;

export function isGen4StyleKey(key: string): boolean {
    if (NON_STYLE_KEYS.has(key)) return false;
    return GAME_PATTERN.test(key) || LINE_PATTERN.test(key);
}

/** gen4's `stylePropertyKeys`, verbatim and in order. */
export const GEN4_STYLE_PROPERTIES: readonly string[] = [
    'overlay_color',
    'ui_saturation',
    'imageXOffset',
    'imageYOffset',
    'imageScale',
    'imageFlip',
    'imageSat',
    'imageRotation',
    'backgroundTexture',
    'backgroundBlur',
    'backgroundHue',
    'backgroundScale',
    'backgroundUrl',
    'backgroundFlip',
    'backgroundXFlip',
    'use_custom_background',
    'backgroundXOffset',
    'backgroundYOffset',
    'backgroundBrightness',
    'backgroundContrast',
    'backgroundSaturation',
    'pkmnNature',
    'pkmn_ability',
    'pkmn_gender',
    'hidden_power_type',
    'hidden_power_index',
    'frame'
];

/** One JSON file per game+species; `index.json` lists the keys (tools/port/port-style-defaults.ts). */
const styleFiles = import.meta.glob("./data/style/*.json", { import: "default" }) as Record<string, () => Promise<unknown>>;

let styleSettingsManager: StyleSettingsStore | null = null;

/** Reads every species file and builds the store. Idempotent. */
export async function loadGen4StyleDefaults(): Promise<StyleSettingsStore> {
    if (styleSettingsManager) return styleSettingsManager;
    const defaults: Record<string, Record<string, unknown>> = {};
    for (const [path, load] of Object.entries(styleFiles)) {
        const name = path.slice(path.lastIndexOf("/") + 1, -".json".length);
        if (name === "index") continue;
        const value = await load();
        if (value && typeof value === "object") defaults[name] = value as Record<string, unknown>;
    }
    styleSettingsManager = createStyleSettingsStore({
        defaults,
        isStyleKey: isGen4StyleKey,
        sourceDir: "games/gen4/data/style",
        styleProperties: GEN4_STYLE_PROPERTIES,
        writeDebounceMs: 500,
    });
    return styleSettingsManager;
}

function manager(): StyleSettingsStore {
    if (!styleSettingsManager) throw new Error("gen4 style defaults are not loaded; the module's prepare() must run first");
    return styleSettingsManager;
}

/**
 * gen4's `MyStorage`: every key goes through the style manager, which decides whether
 * it is a species' style entry or a plain value. `clear`/`entries`/`keys`/`has` are
 * kept for the `reset` paths that call them.
 */
export const MyStorage: Record<string, any> = new Proxy({} as Record<string, any>, {
    set: (_, prop: string, value) => {
        manager().set(prop, value);
        return true;
    },
    get: (_, prop: string) => {
        if (prop === "clear") return () => { /* localStorage.clear(): nothing to clear in the file store's cache-by-key model */ };
        if (prop === "entries") return () => [];
        if (prop === "keys") return () => [];
        if (prop === "has") return (key: string) => manager().get(key) === null;
        return manager().get(prop);
    },
});

/** gen4's `StyleSettingsUtils`, verbatim in behaviour. */
export const StyleSettingsUtils = {
    exportCurrentAsDefaults: () => {
        const m = manager();
        const exported = m.exportCurrentAsDefaults();
        console.log('[StyleSettings] Exported settings:', Object.keys(exported).length, 'entries');
        if (m.isDev) {
            Object.keys(exported).forEach((key) => m.saveToDefaults(key, exported[key]));
            console.log('[StyleSettings] Settings exported to defaults file');
        } else {
            console.log('[StyleSettings] Export only available in dev mode. Exported data:', exported);
        }
        return exported;
    },
    resetToDefaults: (key: string) => {
        manager().resetToDefaults(key);
        console.log(`[StyleSettings] Reset "${key}" to defaults`);
    },
    resetAllToDefaults: () => {
        manager().resetAllToDefaults();
        console.log('[StyleSettings] All style settings reset to defaults');
    },
    isDevMode: () => manager().isDev,
    getDefault: (key: string) => manager().getDefault(key),
    hasUserOverrides: (key: string) => manager().hasUserOverrides(key),
    getUserOverrides: (key: string) => manager().getUserOverrides(key),
};
