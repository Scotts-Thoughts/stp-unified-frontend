import type { GameModule } from "~/core/game/GameModule";
import { moduleBase } from "~/core/game/ModuleManifest";
import { gen3Manifest } from "./manifest";
import { autosplitter } from "./data/autosplitter.js";
import { gen3ControlRoutes } from "./control";
import Overlay from "./Overlay.vue";
import { loadGen3StyleDefaults } from "./storage";

/**
 * Generation 3: Emerald, FireRed & LeafGreen (plan 2.4, lifted 2026-09-11).
 *
 * A lifted module, like gen2, gen4 and gen5: `Overlay.vue` is the legacy component
 * with its infrastructure swapped for core (see its header), so the run hooks, state
 * machine and hotkeys live inside it -- `hooks` and `hotkeys` here are the no-ops that
 * say so. What the shell needs before the component exists is here: the profiles, the
 * editions, the stylesheet, the class gen3 keeps on `#app` itself, and the control
 * routes. gen3's legacy client debounced nothing and its `index.html` had no
 * fit-to-window script, so neither is set.
 *
 * Split folders are the game names gen3's `game_data.gameName` passes (`Emerald`,
 * `FireRed and LeafGreen`); the file prefix is the split file name itself (species or
 * evolution family), so `splitPrefix` is empty. Ruby & Sapphire have data but no
 * mapper (`docs/mapper-matrix.md`), so they are not an edition.
 */
export const gen3: GameModule = {
    ...moduleBase(gen3Manifest),
    features: {
        abilities:            true,
        natures:              true,
        physicalSpecialSplit: false,
        doubleBattles:        false,
        badgeBoosts:          true,
        expBar:               true,
        repelCounter:         true,
        bonkCounter:          false,
        voltorbFlip:          false,
        fling:                false,
        inventorySprites:     false,
        romPatching:          true,
        evolutionSplits:      true,
        forms:                false,
        secondScreen:         false,
        shuckieTimer:         false,
        styleMode:            true,
        backportImporter:     false,
        rngHelper:            false,
        vitamins:             true,
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
    // Bound from Overlay.vue's `mounted`, see games/gen3/hotkeys.ts.
    hotkeys: () => ({}),
    control: (ctx) => gen3ControlRoutes(ctx.overlay),
    chapterMarkers: {
        battleIn: (trainerName) => "IN - " + trainerName,
        battleOut: (trainerName) => "OUT - " + trainerName,
        reset: () => "RESET",
        blackout: () => "BLACKOUT",
        mapChange: (map) => `Map Change - ${map}`,
        textBox: (open) => `Text Box - ${open}`,
        newMove: (name) => "New Move - " + name,
        moveChange: () => "Move Change",
        item: (name) => "Item - " + name,
        label: (kind) => "LABEL - " + kind,
        nextPokemon: () => "Next Pokemon",
    },
    overlay: Overlay,
    cssClass: "gen-3",
    // The legacy `<div id="app" class="mainContainer">`: #app is the overlay grid.
    appClass: "mainContainer",
    styles: () => import("./style.css?inline").then((m) => m.default),
    assetPrefix: "images/gen3/",
    prepare: async () => {
        await loadGen3StyleDefaults();
    },
    persistence: { legacyAppName: "stp-generation3-overlay" },
    logCopyVariant: "gen3",
};
