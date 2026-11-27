import type { GameModule } from "~/core/game/GameModule";
import { moduleBase, type ModuleManifest } from "~/core/game/ModuleManifest";
import { gen6Manifest } from "./manifest";
import { gen7Manifest } from "../gen7/manifest";
import { threeDsControlRoutes } from "./control";
import { loadGameData } from "./data";
import { THREE_DS_GAMES } from "./games";
import { loadThreeDsStyleDefaults } from "./storage";
import Overlay from "./Overlay.vue";

/**
 * Generations 6 and 7, the 3DS games: X/Y and Omega Ruby/Alpha Sapphire (`gen6`), Sun/Moon and Ultra Sun/Ultra Moon
 * (`gen7`). One overlay (`Overlay.vue`) serves both: the games share the 3DS's screens and, in the mappers, one
 * property vocabulary, so a generation here is a manifest, a user-state section and a set of tables, not a component.
 *
 * Unlike gens 2-5 this is not a lifted legacy app (docs/gen6-3ds-overlay-plan.md §4): the overlay is built from the
 * shared pieces in `core/overlay/`, with gen 5's art, classes and stylesheet drawn in scaled zones (`layout.ts`), so
 * the two generations share one look and one sheet. What is here is what the shell needs before the component
 * exists: the profiles, the editions, the stylesheet, the control routes and the game's tables.
 *
 * The games are unpatched and the mappers map nothing to write, so the overlay never writes game memory: the solo
 * Pokemon's nature, ability and IVs are read from the party, not set from the settings panel as in gens 3-5.
 */

/**
 * The stylesheet: gen 5's whole look under this module's class (the shared gens 3-5 and 4-5 sheets, then gen 5's own
 * `style.css` with `.gen-5` swapped), then `style.css` here, which only places the zones and overrides the few rules
 * the 3DS layout changes.
 */
async function styles(cssClass: string): Promise<string> {
    const [shared345, shared45, gen5, own] = await Promise.all([
        import("~/core/styles/shared-gen345.css?inline"),
        import("~/core/styles/shared-gen45.css?inline"),
        import("../gen5/style.css?inline"),
        import("./style.css?inline"),
    ]);
    const forClass = (css: string, placeholder: RegExp) => css.replace(placeholder, `.${cssClass}`);
    return [
        forClass(shared345.default, /\.gen-N(?![\w-])/g),
        forClass(shared45.default, /\.gen-N(?![\w-])/g),
        forClass(gen5.default, /\.gen-5(?![\w-])/g),
        forClass(own.default, /\.gen-N(?![\w-])/g),
    ].join("\n");
}

function threeDsModule(manifest: ModuleManifest, cssClass: string): GameModule {
    return {
        ...moduleBase(manifest),
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
            fling:                false,
            inventorySprites:     false,
            romPatching:          false,
            evolutionSplits:      true,
            forms:                false,
            secondScreen:         true,
            shuckieTimer:         true,
            styleMode:            false,
            backportImporter:     false,
            rngHelper:            false,
            vitamins:             false,
            encounterFlags:       false,
        },
        hooks: {
            // Inside Overlay.vue's `mounted`, as in gens 2-5.
            installRunHooks: () => {},
            installStateSync: () => {},
        },
        data: {
            splits: Object.fromEntries(manifest.games.map((game) => [game, THREE_DS_GAMES[game as keyof typeof THREE_DS_GAMES].splits])),
        },
        // No `shortcuts`: the overlay binds games/gen6/actions.ts from its `mounted`.
        control: (ctx) => threeDsControlRoutes(ctx.overlay),
        chapterMarkers: {
            battleIn: (trainer) => "IN - " + trainer,
            battleOut: (trainer) => "OUT - " + trainer,
            reset: () => "RESET",
            blackout: () => "BLACKOUT",
            mapChange: (map) => `Map Change - ${map}`,
            wildIn: () => "IN - Wild",
            levelUp: (level) => `Level Up - ${level}`,
            battleLevelUp: () => "Battle Level Up",
            heldItem: (name) => `Held Item - ${name}`,
            newMove: (name) => `New Move - ${name}`,
            nextPokemon: () => "Next Pokemon",
            enemyFainted: () => "Enemy Fainted",
        },
        overlay: Overlay,
        cssClass,
        styles: () => styles(cssClass),
        assetPrefix: "images/gen6/",
        scaleToFit: true,
        prepare: async (game) => {
            await Promise.all([loadThreeDsStyleDefaults(), loadGameData(game)]);
        },
        persistence: { legacyAppName: "" },
        logCopyVariant: "gen6",
    };
}

export const gen6: GameModule = threeDsModule(gen6Manifest, "gen-6");
export const gen7: GameModule = threeDsModule(gen7Manifest, "gen-7");
