import type { GameModule } from "~/core/game/GameModule";
import { autosplitter, deprecated_autosplitter, split_trainers } from "./data/splits";
import { gen1ControlRoutes } from "./control";
import { installGen1RunHooks } from "./hooks";
import { gen1Hotkeys } from "./hotkeys";
import { gen1ChapterMarkers } from "./markers";
import { redBlueDeprecated } from "./mappers/red-blue-deprecated";
import { yellowDeprecated } from "./mappers/yellow-deprecated";
import { useGameStateSync } from "./state";

/**
 * Generation 1: Yellow, and Red/Blue (plan 1.4).
 *
 * Every field points at something that already existed as a loose gen1 file; the
 * module is the index that lets `core/` reach them without importing `games/gen1/`.
 *
 * Editions: "Yellow Legacy" is listed because gen1's dropdown lists it in a dev build,
 * but no profile is registered for its hack mapper (decision 8), so selecting it and
 * loading that mapper lands on the unsupported-mapper state rather than the hang in
 * known-legacy-bugs.md #22. The split prefix letters and the folder (= the mapper game
 * name) are what `useOverlaySettingsStore.gameLetter` and `metaStore.game` compute
 * today; the store stays the source of truth until Phase 3 routes it through here.
 */
export const gen1: GameModule = {
    id: "gen1",
    generation: 1,
    mappers: [yellowDeprecated, redBlueDeprecated],
    games: ["Yellow", "Red and Blue"],
    editions: [
        { name: "Yellow", game: "Yellow", boxArt: "1-Yellow.png", splitFolder: "Yellow", splitPrefix: "Y", icon: "yellow.ico" },
        { name: "Yellow Legacy", game: "Yellow", boxArt: "1-Yellow.png", splitFolder: "Yellow", splitPrefix: "Y", icon: "yellow.ico", devOnly: true },
        { name: "Red", game: "Red and Blue", boxArt: "1-Red.png", splitFolder: "Red and Blue", splitPrefix: "R", icon: "red.ico" },
        { name: "Blue", game: "Red and Blue", boxArt: "1-Blue.png", splitFolder: "Red and Blue", splitPrefix: "B", icon: "blue.ico" },
    ],
    features: {
        badgeBoosts: true,
        expBar: true,
        repelCounter: true,
        bonkCounter: true,
        shuckieTimer: true,
        encounterFlags: true,
    },
    hooks: {
        installRunHooks: installGen1RunHooks,
        installStateSync: useGameStateSync,
    },
    data: {
        splits: { autosplitter, deprecated_autosplitter, split_trainers },
    },
    hotkeys: gen1Hotkeys,
    control: gen1ControlRoutes,
    chapterMarkers: gen1ChapterMarkers,
    // index.html still links the stylesheet statically (plan 1.5); Phase 3.1 switches
    // the boot flow to this import and drops the link.
    styles: () => import("./style.css"),
    persistence: { legacyAppName: "stp-generation1-overlay" },
    logCopyVariant: "gen1",
};
