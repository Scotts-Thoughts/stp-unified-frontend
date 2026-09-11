import type { GameModule } from "~/core/game/GameModule";
import { autosplitter } from "./data/autosplitter.js";
import { gen5ControlRoutes } from "./control";
import { black2Standard } from "./mappers/black-2";
import { blackStandard } from "./mappers/black";
import { white2Standard } from "./mappers/white-2";
import { whiteStandard } from "./mappers/white";
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
    id: "gen5",
    generation: 5,
    mappers: [blackStandard, whiteStandard, black2Standard, white2Standard],
    games: ["Black", "White", "Black 2", "White 2"],
    editions: [
        { name: "Black", game: "Black", boxArt: "5-Black.png", splitFolder: "Black", splitPrefix: "", icon: "gen5/icon-black.ico" },
        { name: "White", game: "White", boxArt: "5-White.png", splitFolder: "White", splitPrefix: "", icon: "gen5/icon-white.ico" },
        { name: "Black 2", game: "Black 2", boxArt: "5-Black2.png", splitFolder: "Black 2", splitPrefix: "", icon: "gen5/icon-black2.ico" },
        { name: "White 2", game: "White 2", boxArt: "5-White2.png", splitFolder: "White 2", splitPrefix: "", icon: "gen5/icon-white2.ico" },
    ],
    features: {
        abilities: true,
        natures: true,
        physicalSpecialSplit: true,
        doubleBattles: true,
        expBar: true,
        fling: true,
        shuckieTimer: true,
        encounterFlags: true,
        evolutionSplits: true,
        forms: true,
        secondScreen: true,
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
