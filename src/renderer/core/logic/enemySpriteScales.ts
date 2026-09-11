import { reactive } from "vue";
import { IS_DEV } from "~/core/env";
import { getUserState, setUserState } from "~/core/persistence/userState";

/**
 * The enemy-sprite scale manager gen1 and gen2 share (plan 2.4).
 *
 * Both legacy apps carry the same `enemy_sprite_scale_manager.js` -- per-species
 * `{ scale, xOffset, yOffset, flipped }` for the enemy team sprites, edited with the
 * Ctrl+Click resize tool, with a live user-state override, a bundled table, and a
 * dev-mode write-back to the table's source file. gen1's Phase 1 port of it is the
 * body below; the factory parameterises the two things that differ per generation:
 * the bundled table and the source file the dev-mode commit rewrites.
 *
 * The override key is still `enemyScale_<Species>`, shared across generations the way
 * the legacy `localStorage` key was -- a species name only collides across games when
 * it is the same species, and then the override *should* carry.
 */
export interface EnemySpriteScaleOptions {
    /** The bundled per-species table (gen1: enemy_sprite_scales.json; gen2: the same, converted from .js). */
    bundled: Record<string, unknown>;
    /** Relative to `src/renderer`, what the dev-mode commit rewrites over `source:write`. */
    sourceFile: string;
    /**
     * What "dev mode" means for this instance. gen1 asked Vite (`import.meta.env.DEV`);
     * gen2-5 asked Electron (`!app.isPackaged`, core/env.ts `isPackaged`). Defaults to
     * gen1's.
     */
    devMode?: () => boolean;
}

export interface EnemySpriteEntry {
    scale: number;
    xOffset: number;
    yOffset: number;
    flipped: boolean;
}

export interface EnemySpriteScaleManager {
    get(species: any): EnemySpriteEntry;
    getScale(species: any): number;
    getXOffset(species: any): number;
    getYOffset(species: any): number;
    getFlipped(species: any): boolean;
    setLive(species: any, partial: Partial<EnemySpriteEntry>): void;
    commit(species: any): void;
    clearOverride(species: any): void;
    readonly isDev: boolean;
    readonly version: number;
}

export function createEnemySpriteScaleManager(options: EnemySpriteScaleOptions): EnemySpriteScaleManager {
    const devMode = options.devMode ?? (() => IS_DEV);

    const DEFAULTS: EnemySpriteEntry = { scale: 1, xOffset: 0, yOffset: 0, flipped: false };

    function normalize(raw: any): EnemySpriteEntry {
        if (raw == null) return { ...DEFAULTS };
        if (typeof raw === "number") return { ...DEFAULTS, scale: raw };
        if (typeof raw === "object") {
            return {
                scale:   typeof raw.scale   === "number" && !Number.isNaN(raw.scale)   ? raw.scale   : 1,
                xOffset: typeof raw.xOffset === "number" && !Number.isNaN(raw.xOffset) ? raw.xOffset : 0,
                yOffset: typeof raw.yOffset === "number" && !Number.isNaN(raw.yOffset) ? raw.yOffset : 0,
                flipped: !!raw.flipped,
            };
        }
        return { ...DEFAULTS };
    }

    function speciesKey(species: any): string | null {
        if (species == null) return null;
        if (typeof species === "object" && "value" in species) {
            const v = (species as any).value;
            return v == null ? null : String(v);
        }
        const s = String(species);
        return s.length > 0 ? s : null;
    }

    /**
     * Reactive registry. Reading `version` inside a component forces re-evaluation
     * when scales/offsets/flip change live during dragging.
     */
    const state = reactive({
        scales: { ...(options.bundled as Record<string, any>) } as Record<string, EnemySpriteEntry>,
        version: 0,
    });

    // Normalize the bundled scales on first load.
    for (const key of Object.keys(state.scales)) {
        state.scales[key] = normalize(state.scales[key]);
    }

    /**
     * The per-species override, from the user-state file (plan 1.10).
     *
     * The key is still `enemyScale_<Species>`, and a value that was written as a JSON string
     * or as a bare number by the old local-storage version still parses -- the file may have
     * been migrated from one.
     */
    function readOverride(key: string): EnemySpriteEntry | null {
        const raw = getUserState<unknown>(`enemyScale_${key}`, null);
        if (raw == null || raw === "") return null;
        if (typeof raw === "object") return normalize(raw);
        if (typeof raw === "number") return { ...DEFAULTS, scale: raw };
        try {
            return normalize(JSON.parse(String(raw)));
        } catch (e) {
            const n = parseFloat(String(raw));
            if (!Number.isNaN(n)) return { ...DEFAULTS, scale: n };
            return null;
        }
    }

    function writeOverride(key: string, entry: EnemySpriteEntry | null): void {
        setUserState(`enemyScale_${key}`, entry);
    }

    function entryFor(species: any): EnemySpriteEntry {
        // Touch reactive version so consumers re-run when the version bumps.
        // eslint-disable-next-line no-unused-expressions
        state.version;
        const key = speciesKey(species);
        if (!key) return { ...DEFAULTS };
        const override = readOverride(key);
        if (override) return override;
        return state.scales[key] ?? { ...DEFAULTS };
    }

    const manager: EnemySpriteScaleManager = {
        get(species: any): EnemySpriteEntry { return entryFor(species); },
        getScale(species: any): number    { return entryFor(species).scale; },
        getXOffset(species: any): number  { return entryFor(species).xOffset; },
        getYOffset(species: any): number  { return entryFor(species).yOffset; },
        getFlipped(species: any): boolean { return entryFor(species).flipped; },

        /** Update the in-session entry (a user-state override). Does not touch the source JSON. */
        setLive(species: any, partial: Partial<EnemySpriteEntry>): void {
            const key = speciesKey(species);
            if (!key) return;
            const current = entryFor(species);
            const merged = normalize({ ...current, ...partial });
            writeOverride(key, merged);
            state.version++;
        },

        /**
         * Commit the current entry for a species: in dev, write to the source JSON;
         * in prod, keep the user-state override. Clears the live override on
         * dev success so the bundled value becomes authoritative.
         */
        commit(species: any): void {
            const key = speciesKey(species);
            if (!key) return;
            const current = entryFor(species);
            state.scales[key] = current;
            state.version++;

            if (devMode()) {
                // The write is async now that it crosses IPC, so the override is cleared in
                // the callback instead of on the next line. Nothing observable changes: the
                // override and `state.scales[key]` hold the same entry until it resolves.
                window.api.source
                    .write(options.sourceFile, JSON.stringify(state.scales, null, 4) + "\n")
                    .then(() => {
                        writeOverride(key, null);
                        state.version++;
                    })
                    .catch((e) => {
                        console.error("[enemySpriteScaleManager] dev-mode write failed:", e);
                        // Keep the value the user just set rather than losing the edit.
                        writeOverride(key, current);
                    });
            } else {
                // Packaged builds can't rewrite the bundled JSON — persist as override.
                writeOverride(key, current);
            }
        },

        /** Drop any live override for a species (used when canceling). */
        clearOverride(species: any): void {
            const key = speciesKey(species);
            if (!key) return;
            writeOverride(key, null);
            state.version++;
        },

        get isDev(): boolean { return devMode(); },

        /** Used by the resize handle to react to live drags. */
        get version(): number { return state.version; },
    };

    return manager;
}
