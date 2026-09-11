import type { GameModule } from "~/core/game/GameModule";
import { moduleBase } from "~/core/game/ModuleManifest";
import { gen4Manifest } from "./manifest";
import { autosplitter } from "./data/autosplitter.js";
import { gen4ControlRoutes } from "./control";
import Overlay from "./Overlay.vue";
import { loadGen4StyleDefaults } from "./storage";

/**
 * Generation 4: Platinum, Diamond & Pearl, HeartGold & SoulSilver (plan 2.4, lifted
 * 2026-09-11).
 *
 * A lifted module, like gen2: `Overlay.vue` is the legacy component with its
 * infrastructure swapped for core (see its header), so the run hooks, state machine
 * and hotkeys live inside it -- `hooks` and `hotkeys` here are the no-ops that say
 * so. What the shell needs before the component exists is here: the profiles, the
 * editions, the stylesheet, the asset base, the control routes, and the four mapper
 * paths the legacy client debounced.
 *
 * Split folders are the short names gen4's own `logData` callers pass (`Platinum`,
 * `HGSS`, `DP`); the file prefix is the split file name itself (species or
 * evolution family), not a game letter, so `splitPrefix` is empty.
 */
export const gen4: GameModule = {
    ...moduleBase(gen4Manifest),
    features: {
        abilities: true,
        natures: true,
        physicalSpecialSplit: true,
        doubleBattles: true,
        expBar: true,
        bonkCounter: true,
        voltorbFlip: true,
        fling: true,
        shuckieTimer: true,
        encounterFlags: true,
        evolutionSplits: true,
        rngHelper: true,
        styleMode: true,
    },
    hooks: {
        // Inside Overlay.vue's `mounted` -- the legacy `.change()` subscriptions and
        // the state variables are component state.
        installRunHooks: () => {},
        installStateSync: () => {},
    },
    data: {
        splits: { autosplitter },
    },
    // Bound from Overlay.vue's `mounted`, see games/gen4/hotkeys.ts.
    hotkeys: () => ({}),
    control: (ctx) => gen4ControlRoutes(ctx.overlay),
    chapterMarkers: {
        battleIn: (trainerClass) => "IN - " + trainerClass,
        battleOut: (trainerClass) => "OUT - " + trainerClass,
        reset: () => "RESET",
        blackout: () => "BLACKOUT",
        mapChange: (map) => `Map Change - ${map}`,
        menu: (menu) => "MENU - " + menu,
        rareCandy: () => "Rare Candy Used",
        newMove: (name) => "New Move - " + name,
        nextPokemon: () => "Next Pokemon",
        enemyFainted: () => "Enemy Fainted",
    },
    overlay: Overlay,
    cssClass: "gen-4",
    styles: () => import("./style.css?inline").then((m) => m.default),
    assetPrefix: "images/gen4/",
    // The 16:9 fit-to-window script at the bottom of the legacy index.html.
    scaleToFit: true,
    // The legacy `mounted` called `deboucePath` for these four before connecting
    // (`battle.player.active_pokemon.modifiers` was commented out there too).
    debouncePaths: [
        "battle.opponent.active_pokemon",
        "battle.opponent.team",
        "player.team.0.species",
        "meta.global_pointer",
    ],
    prepare: async () => {
        await loadGen4StyleDefaults();
    },
    persistence: { legacyAppName: "gen4-overlay-app" },
    logCopyVariant: "gen4",
};
