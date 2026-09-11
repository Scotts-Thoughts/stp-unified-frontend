import type { Component } from "vue";
import type { MapperProfile } from "../mapper/MapperProfile";
import type { HotkeyTable } from "../hotkeys/KeyHook";
import type { ControlRoutes } from "../control/useControlServer";

/**
 * The contract every generation implements (plan section 2, "GameModule").
 *
 * A module is data plus a handful of install functions. `core/` never imports a
 * `games/genN/` file; it only ever holds a `GameModule` handed to it by
 * `games/registry.ts`, which is how five generations share one set of stores and
 * components.
 *
 * What is here is what gen1 implements today. Fields the plan lists that no module
 * yet needs (`features` beyond the ones gen1 exercises, `components` slots, the
 * `logCopy` variants) are typed but optional, and grow as each generation lands in
 * Phase 2 -- adding a field to the interface and to every module in the same commit,
 * never as an untyped side channel.
 */

/** A user-selectable edition: the queuer's `selected_game` vocabulary and the box-art grid. */
export interface Edition {
    /** Display name and `selected_game` value: "Yellow", "Red", "Gold & Silver"... */
    name: string;
    /** The mapper game (a data key) this edition plays on: "Yellow", "Red and Blue"... */
    game: string;
    /** Path under `images/box_art/`; gen1 and gen2 have placeholders (decision 16). */
    boxArt: string;
    /** Folder under `splits/` the autosplitter writes to. */
    splitFolder: string;
    /** File-name prefix of the split CSVs ("Y", "R", "B"). */
    splitPrefix: string;
    /** Icon under `resources/icons/` for the window and taskbar. */
    icon: string;
    /** Only listed in a dev build -- gen1's "Yellow Legacy" (known-legacy-bugs.md #22). */
    devOnly?: boolean;
}

/** Everything a generation can switch on. Absent means off. */
export type Feature =
    | "abilities" | "natures" | "physicalSpecialSplit" | "doubleBattles" | "badgeBoosts" | "expBar"
    | "repelCounter" | "bonkCounter" | "voltorbFlip" | "fling" | "inventorySprites" | "romPatching"
    | "evolutionSplits" | "forms" | "secondScreen" | "shuckieTimer" | "styleMode" | "backportImporter"
    | "rngHelper" | "vitamins" | "encounterFlags";

/**
 * The run hooks: reset / new-run / blackout / split-trigger / run-finished watchers and
 * the game-state machine. Both take what the overlay already has -- `installRunHooks`
 * the overlay component instance (its split-state fields and autosplitter methods are
 * the context, see `games/gen1/hooks.ts`), `installStateSync` the canonical view.
 */
export interface RunHooks {
    installRunHooks(vm: any): void;
    installStateSync(gameProperties: any): void;
}

/** The OBS chapter-marker names, per generation; the client is shared (`core/logic/obs.ts`). */
export interface ChapterMarkers {
    battleIn(trainerClass: string): string;
    battleOut(trainerClass: string): string;
    reset(): string;
    blackout(): string;
    [kind: string]: (...args: string[]) => string;
}

/** What a module's control-route table can reach. */
export interface ControlContext {
    isReady(): boolean;
    mapperPath(): string | null;
    /** The mounted overlay component instance, or null before it mounts. gen2-5's lifted routes drive it directly. */
    overlay(): any;
}

export interface GameModule {
    id: "gen1" | "gen2" | "gen3" | "gen4" | "gen5";
    generation: 1 | 2 | 3 | 4 | 5;
    /** The mapper profiles this module ships; today exactly the mappers in `docs/mapper-matrix.md`. */
    mappers: MapperProfile[];
    /** The mapper game-name strings this module accepts: the data keys. */
    games: string[];
    editions: Edition[];
    features: Partial<Record<Feature, boolean>>;
    hooks: RunHooks;
    /** Per-generation data. Typed loosely until Phase 2 settles the shared shapes. */
    data: {
        splits: Record<string, unknown>;
        [table: string]: unknown;
    };
    /**
     * The F-key table main.ts binds while this module is active. A lifted module
     * (gen2-5) binds its own table from its overlay's `mounted`, because the handlers
     * close over the component instance, and returns `{}` here.
     */
    hotkeys(): HotkeyTable;
    control(ctx: ControlContext): ControlRoutes;
    chapterMarkers: ChapterMarkers;
    /** The overlay component main.ts mounts once the mapper is detected. */
    overlay: Component;
    /** The class on `#app-container` while this module is active: `gen-N`. */
    cssClass: string;
    /**
     * The class the legacy page had on `#app` itself, if any. gen3's `#app` *is* its
     * `.mainContainer` -- the 3x30 CSS grid every overlay element is placed in -- where
     * gen2/4/5 nest that grid one level down. main.ts sets it with the stylesheet.
     */
    appClass?: string;
    /**
     * gen1's legacy keyhook was a Vue component that rendered an empty `<div>` as
     * `#app`'s first child, and the layout oracle sees it (core/hotkeys/Hotkeys.vue).
     * Only gen1 sets this: under gen3 that div would take the grid's first cell.
     */
    keyhookElement?: boolean;
    /** The generation's stylesheet text (`games/genN/style.css?inline`), applied by main.ts before the overlay mounts. */
    styles(): Promise<string>;
    /**
     * Where this module's images live under the renderer's `images/` root
     * (`images/gen2/`), or none when they are gen1's own. Informational: the references
     * inside a lifted module were rewritten at port time (tools/port/lift_assets.py,
     * which also says why a plain relative path and not a URL scheme).
     */
    assetPrefix?: string;
    /** Anything that must be in memory before the overlay mounts (gen2: the per-species style defaults). */
    prepare?(): Promise<void>;
    /**
     * Mapper paths (prefixes) whose updates the client debounces by ten animation
     * frames -- gen4's `this.mapper.deboucePath(...)` calls, which it made before
     * connecting. main.ts applies them once the mapper is detected as this module's.
     */
    debouncePaths?: readonly string[];
    /** How many frames the client holds a debounced update: gen4 left the client's 10, gen5 set 15. */
    debounceFrames?: number;
    /**
     * The 16:9 fit-to-window script gen1/gen2/gen4/gen5's index.html ran (`core/window/
     * scaleToFit.ts`); the shell installs it while the module is active. gen3 had none,
     * and for it `#app-container` carries no transform at all -- a `scale(1)` container
     * is a composited, pixel-snapped layer to Chromium, not "no transform".
     */
    scaleToFit?: boolean;
    /**
     * Shell services this module wants running while it is active, started right
     * before `ready` and stopped when the mapper unloads. gen1 starts its Super
     * Shuckie poll here; a lifted module polls from inside its own component and
     * leaves these unset.
     */
    activate?(game: string): void;
    deactivate?(): void;
    /** Generation-specific SFC variants, only where the DOM differs (Phase 2). */
    components?: Partial<Record<string, Component>>;
    persistence: {
        /** The legacy app's userData folder name, for the one-time import (Phase 2.6). */
        legacyAppName: string;
    };
    /** Which `logCopy` the autosplitter uses (known-legacy-bugs.md #21). */
    logCopyVariant: "gen1" | "gen2" | "gen3" | "gen4" | "gen5";
}
