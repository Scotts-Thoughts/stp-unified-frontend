import { loadStyleFiles } from "../../core/persistence/styleFiles";
import { createStyleSettingsStore, type StyleSettingsStore } from "~/core/persistence/styleSettings";

/**
 * The 3DS overlay's `MyStorage` (gens 6 and 7), on the shared layered store exactly as gen5's is
 * (`games/gen5/storage.ts`): a key is a species' style entry when it is `<Game>_<Species>` for one of the four game
 * pairs, or ends in `-line`; anything else is a plain value in the active generation's section of `user_state.json`
 * (gen6 for X/Y and OR/AS, gen7 for Sun/Moon and Ultra Sun/Ultra Moon: `core/persistence/userState.ts`).
 *
 * One store serves both sections: the shipped style defaults (`data/style/*.json`) are keyed by game, and the
 * section a read or write goes to is the active one.
 */

const NON_STYLE_KEYS = new Set([
    "starter", "selected_game", "playerName", "playerId", "playerResets", "blackout_counter", "simple_data_str",
    "simple_data", "timer_startTimeOffset", "timer_startTime", "timer_pause", "timer_formatted_time", "timer_pause_time",
    "time_split_start", "battle_start", "current_splits", "previous_splits", "previous_splits_source",
]);

const GAME_PATTERN = /^(X and Y|Omega Ruby and Alpha Sapphire|Sun and Moon|Ultra Sun and Ultra Moon)_/;
const LINE_PATTERN = /-line$/;

export function isThreeDsStyleKey(key: string): boolean {
    if (NON_STYLE_KEYS.has(key)) return false;
    return GAME_PATTERN.test(key) || LINE_PATTERN.test(key);
}

/** The fields of a species value that reach the shipped defaults (gen5's list). */
export const THREE_DS_STYLE_PROPERTIES: readonly string[] = [
    "overlay_color", "ui_saturation", "imageXOffset", "imageYOffset", "imageScale", "imageFlip", "imageSat", "imageRotation",
    "backgroundTexture", "backgroundBlur", "backgroundHue", "backgroundScale", "backgroundUrl", "backgroundFlip",
    "backgroundXFlip", "use_custom_background", "backgroundXOffset", "backgroundYOffset", "backgroundBrightness",
    "backgroundContrast", "backgroundSaturation", "evolution", "selected_evolution_species", "evolution_splits_label",
];

/** The fields that are a species' look (the rest of a species entry is its run counters). */
export const VISUAL_STYLE_FIELDS: readonly string[] = [
    "overlay_color", "ui_saturation", "imageXOffset", "imageYOffset", "imageScale", "imageFlip", "imageSat", "imageRotation",
    "backgroundTexture", "backgroundBlur", "backgroundHue", "backgroundScale", "backgroundUrl", "backgroundFlip",
    "backgroundXFlip", "use_custom_background", "backgroundXOffset", "backgroundYOffset", "backgroundBrightness",
    "backgroundContrast", "backgroundSaturation",
];

const styleFiles = import.meta.glob("./data/style/*.json", { import: "default" }) as Record<string, () => Promise<unknown>>;

let styleSettingsManager: StyleSettingsStore | null = null;

/** Reads every species file and builds the store. Idempotent. */
export async function loadThreeDsStyleDefaults(): Promise<StyleSettingsStore> {
    if (styleSettingsManager) return styleSettingsManager;
    const defaults = await loadStyleFiles(styleFiles, "games/gen6/data/style");
    styleSettingsManager = createStyleSettingsStore({
        defaults,
        isStyleKey: isThreeDsStyleKey,
        sourceDir: "games/gen6/data/style",
        styleProperties: THREE_DS_STYLE_PROPERTIES,
        writeDebounceMs: 1000,
        threeLayer: true,
    });
    return styleSettingsManager;
}

function manager(): StyleSettingsStore {
    if (!styleSettingsManager) throw new Error("the 3DS style defaults are not loaded; the module's prepare() must run first");
    return styleSettingsManager;
}

/** Every key goes through the style manager, which decides whether it is a species' style entry or a plain value. */
export const MyStorage: Record<string, any> = new Proxy({} as Record<string, any>, {
    set: (_, prop: string, value) => {
        manager().set(prop, value);
        return true;
    },
    get: (_, prop: string | symbol) => {
        if (typeof prop !== "string") return undefined;
        return manager().get(prop);
    },
});

export const StyleSettingsUtils = {
    exportCurrentAsDefaults: () => {
        const m = manager();
        const exported = m.exportCurrentAsDefaults();
        if (m.isDev) Object.keys(exported).forEach((key) => m.saveToDefaults(key, exported[key]));
        console.log(`[StyleSettings] Exported ${Object.keys(exported).length} entries${m.isDev ? " to the defaults files" : " (dev mode only)"}`);
        return exported;
    },
    resetToDefaults: (key: string) => {
        manager().resetToDefaults(key);
        console.log(`[StyleSettings] Reset "${key}" to defaults`);
    },
    resetAllToDefaults: () => {
        manager().resetAllToDefaults();
        console.log("[StyleSettings] All style settings reset to defaults");
    },
    isDevMode: () => manager().isDev,
    getDefault: (key: string) => manager().getDefault(key),
    hasUserOverrides: (key: string) => manager().hasUserOverrides(key),
};
