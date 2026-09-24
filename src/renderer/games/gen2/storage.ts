import { createStyleSettingsStore, type StyleSettingsStore } from "~/core/persistence/styleSettings";

/**
 * gen2's `MyStorage` and `StyleSettingsUtils` (the first 100 lines of its
 * `frontend.js`), on the shared layered store (plan 2.6).
 *
 * The overlay component reads and writes `MyStorage[key]` synchronously everywhere,
 * so the per-species defaults are loaded once by {@link loadGen2StyleDefaults} before
 * the component mounts -- the module's `prepare()` -- and the store is created then.
 *
 * `isStyleSettingsKey` is gen2's rule verbatim, exclusion list and all: a key is a
 * species' style entry if it is not in the list, does not start with `this.` or
 * `user_`, and either exists in the defaults or starts with an uppercase letter.
 */

// A Set: `isStyleSettingsKey` runs on every `MyStorage` read and write, including the
// timer text gen2 persists on every animation frame (docs/performance-followups.md D).
const NON_STYLE_KEYS = new Set([
    'starter', 'selected_game', 'game_selection', 'playerName', 'playerId', 'playerResets',
    'blackout_counter', 'simple_data_str', 'full_data_str', 'deprecated_data_str',
    'simple_data', 'timer_startTimeOffset', 'timer_startTime', 'timer_pause',
    'timer_formatted_time', 'timer_pause_time', 'time_h', 'time_m', 'time_s',
    'time_ms', 'time_split_start', 'battle_start', 'current_splits', 'previous_splits', 'previous_splits_source',
    'overlay_color', 'imageXOffset', 'imageYOffset', 'imageScale', 'imageFlip', 'imageSat',
    'backgroundBlur', 'backgroundScale', 'backgroundUrl', 'backgroundFlip', 'backgroundXFlip',
    'use_custom_background', 'backgroundXOffset', 'backgroundYOffset', 'backgroundTexture',
    'backgroundBrightness', 'backgroundContrast', 'backgroundSaturation', 'backgroundHue',
    'kanto_badges', 'pokeball_translateX', 'pokeball_translateY',
    'hpType', 'pokemon_gender', 'autosplitter_toggle', 'repel_counter',
    'ui_saturation', 'ui_type_colors', 'ui_type_color_modifier',
    'ui_type_icons', 'ui_type_icons_modifier', 'ui_stats_styling', 'ui_stats_styling_modifier',
    'ui_stat_arrangement', 'ui_stat_arrangement_modifier',
    'playerNameChoice', 'options', 'gametimeDisplay',
]);

/** gen2's `stylePropertyKeys`, verbatim and in order; its manager uses it in `exportCurrentAsDefaults` only. */
export const GEN2_STYLE_PROPERTIES: readonly string[] = [
    'overlay_color',
    'ui_saturation',
    'imageXOffset',
    'imageYOffset',
    'imageScale',
    'imageFlip',
    'imageSat',
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
];

export function isGen2StyleKey(key: string, defaults: Record<string, unknown>): boolean {
    if (NON_STYLE_KEYS.has(key)) return false;
    if (key.startsWith('this.')) return false;
    if (key.startsWith('user_')) return false;
    if (defaults[key]) return true;
    return /^[A-Z]/.test(key);
}

/** One JSON file per species; `index.json` lists the keys (tools/port/port-style-defaults.ts). */
const styleFiles = import.meta.glob("./data/style/*.json", { import: "default" }) as Record<string, () => Promise<unknown>>;

let styleSettingsManager: StyleSettingsStore | null = null;

/** Reads every species file and builds the store. Idempotent. */
export async function loadGen2StyleDefaults(): Promise<StyleSettingsStore> {
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
        isStyleKey: isGen2StyleKey,
        sourceDir: "games/gen2/data/style",
        exportProperties: GEN2_STYLE_PROPERTIES,
    });
    return styleSettingsManager;
}

function manager(): StyleSettingsStore {
    if (!styleSettingsManager) throw new Error("gen2 style defaults are not loaded; the module's prepare() must run first");
    return styleSettingsManager;
}

/**
 * gen2's `MyStorage`: every key goes through the style manager, which decides whether
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

/** gen2's `StyleSettingsUtils`, verbatim in behaviour. */
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
