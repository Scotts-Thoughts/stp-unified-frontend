import type { GameModule } from "~/core/game/GameModule";
import { moduleBase } from "~/core/game/ModuleManifest";
import { gen5Manifest } from "./manifest";
import { autosplitter } from "./data/autosplitter.js";
import { gen5ControlRoutes } from "./control";
import Overlay from "./Overlay.vue";
import { loadGen5StyleDefaults } from "./storage";

/**
 * Generation 5: Black & White, Black 2 & White 2 (plan 2.4, lifted 2026-09-11).
 *
 * A lifted module, like gen2 and gen4: `Overlay.vue` is the legacy component with its
 * infrastructure swapped for core (see its header), so the run hooks, state machine
 * and hotkeys live inside it -- `hooks` and `hotkeys` here are the no-ops that say
 * so. What the shell needs before the component exists is here: the profiles, the
 * editions, the stylesheet, the fit-to-window flag, the control routes, and the four
 * mapper paths the legacy client debounced for fifteen frames.
 *
 * Split folders are the game names gen5's `current_game_folder` passes (`Black`...);
 * the file prefix is the split file name itself (species or evolution family), not a
 * game letter, so `splitPrefix` is empty.
 */
export const gen5: GameModule = {
    ...moduleBase(gen5Manifest),
    features: {
        abilities:            true,
        natures:              true,
        physicalSpecialSplit: true,
        doubleBattles:        true,
        badgeBoosts:          false,
        expBar:               true,
        repelCounter:         false,
        bonkCounter:          false,
        voltorbFlip:          false,
        fling:                true,
        inventorySprites:     false,
        romPatching:          false,
        evolutionSplits:      true,
        forms:                true,
        secondScreen:         true,
        shuckieTimer:         true,
        styleMode:            true,
        backportImporter:     false,
        rngHelper:            true,
        vitamins:             false,
        encounterFlags:       true,
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
    // Bound from Overlay.vue's `mounted`, see games/gen5/hotkeys.ts.
    hotkeys: () => ({}),
    control: (ctx) => gen5ControlRoutes(ctx.overlay),
    chapterMarkers: {
        battleIn: (trainerClass) => "IN - " + trainerClass,
        battleOut: (trainerClass) => "OUT - " + trainerClass,
        reset: () => "RESET",
        blackout: () => "BLACKOUT",
        rareCandy: () => "Rare Candy Used",
        nextPokemon: () => "Next Pokemon",
        enemyFainted: () => "Enemy Fainted",
    },
    overlay: Overlay,
    cssClass: "gen-5",
    styles: () => import("./style.css?inline").then((m) => m.default),
    assetPrefix: "images/gen5/",
    // The 16:9 fit-to-window script at the bottom of the legacy index.html.
    scaleToFit: true,
    // The legacy `mounted` set `_debouceTimeout = 15` and called `deboucePath` for
    // these four before connecting (`battle.player.active_pokemon.modifiers` was
    // commented out there too).
    debouncePaths: [
        "battle.opponent.pkmn_ram",
        "battle.opponent.team",
        "battle.opponent.team_count",
        "player.team.0",
    ],
    debounceFrames: 15,
    prepare: async () => {
        await loadGen5StyleDefaults();
    },
    persistence: { legacyAppName: "gen5-overlay-app" },
    logCopyVariant: "gen5",
};
