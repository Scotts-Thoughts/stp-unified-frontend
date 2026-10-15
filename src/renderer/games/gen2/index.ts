import type { GameModule } from "~/core/game/GameModule";
import { moduleBase } from "~/core/game/ModuleManifest";
import { gen2Manifest } from "./manifest";
import { autosplitter } from "./data/autosplitter.js";
import { split_trainers } from "./data/autosplitter/split_trainers.js";
import { trainer_name_lookup } from "./data/autosplitter/trainer_name_lookup.js";
import { gen2ControlRoutes } from "./control";
import Overlay from "./Overlay.vue";
import { loadGen2StyleDefaults } from "./storage";
import { applyBackportOverrides, loadBackportOverrides } from "./backportOverrides";
import { backportMoveMap } from "./data/backport_move_map.js";
import { g2MoveData } from "./data/g2MoveData.js";
import { gen2moves } from "./data/gen2moves.js";
import { dexDataCrystal } from "./data/pokemon_crystal.js";

/**
 * Generation 2: Crystal, and Gold & Silver (plan 2.4, lifted 2026-09-10).
 *
 * A lifted module: `Overlay.vue` is the legacy component with its infrastructure
 * swapped for core (see its header), so the run hooks, state machine and shortcuts
 * live inside it rather than in module fields -- `hooks` here (and the absent `shortcuts`) are the
 * no-ops that say so. The fields that *are* data are the ones the shell needs before
 * the component exists: the profiles, the editions, the stylesheet, the asset base
 * and the control routes.
 *
 * gen2's game logic is hardcoded to Crystal (known-legacy-bugs.md #1, #3): the edition
 * dropdown changes split paths and nothing else, which is why both editions share one
 * split-folder rule and why the prefix letter is "c" for both today.
 */
export const gen2: GameModule = {
    ...moduleBase(gen2Manifest),
    features: {
        abilities:            false,
        natures:              false,
        physicalSpecialSplit: false,
        doubleBattles:        false,
        badgeBoosts:          true,
        expBar:               true,
        repelCounter:         true,
        bonkCounter:          true,
        voltorbFlip:          false,
        fling:                false,
        inventorySprites:     false,
        romPatching:          true,
        evolutionSplits:      false,
        forms:                false,
        secondScreen:         false,
        shuckieTimer:         true,
        styleMode:            true,
        backportImporter:     true,
        rngHelper:            false,
        vitamins:             false,
        encounterFlags:       true,
    },
    hooks: {
        // Inside Overlay.vue's `mounted` -- the legacy `.change()` subscriptions and
        // the state variables (`g2stateVariable`, `enemyState`...) are component state.
        installRunHooks: () => {},
        installStateSync: () => {},
    },
    data: {
        splits: { autosplitter, split_trainers, trainer_name_lookup },
    },
    // No `shortcuts`: the overlay binds games/gen2/actions.ts from its `mounted`.
    control: (ctx) => gen2ControlRoutes(ctx.overlay),
    chapterMarkers: {
        battleIn: (trainerClass) => "IN - " + trainerClass,
        battleOut: (trainerClass) => "OUT - " + trainerClass,
        reset: () => "RESET",
        blackout: () => "BLACKOUT",
        mapChange: (map) => `Map Change - ${map}`,
        textBox: (state) => `Text Box - ${state}`,
        levelUp: (level) => `Level Up - ${level}`,
        battleLevelUp: () => "Battle Level Up",
        rareCandy: () => "Rare Candy Used",
        special: (name) => `Special - ${name}`,
        item: (name) => `Item - ${name}`,
        newMove: (name) => `New Move - ${name}`,
    },
    overlay: Overlay,
    cssClass: "gen-2",
    styles: () => import("./style.css?inline").then((m) => m.default),
    assetPrefix: "images/gen2/",
    // The 16:9 fit-to-window script at the bottom of the legacy index.html.
    scaleToFit: true,
    prepare: async () => {
        await loadGen2StyleDefaults();
        // The backports imported so far (decision 15): into the tables before the overlay
        // mounts, which is the state the legacy's rewritten data files loaded into.
        applyBackportOverrides(await loadBackportOverrides(), { g2MoveData, gen2moves, dexDataCrystal, backportMoveMap });
    },
    persistence: { legacyAppName: "stp-generation2-overlay" },
    logCopyVariant: "gen2",
};
