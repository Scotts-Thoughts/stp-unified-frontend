import type { ModuleManifest } from "~/core/game/ModuleManifest";
import { redBlueDeprecated } from "./mappers/red-blue-deprecated";
import { yellowDeprecated } from "./mappers/yellow-deprecated";

/**
 * gen1's manifest (plan 3.1): what the shell needs without loading the module. gen1
 * is loaded eagerly anyway (it styles the pre-mapper screen), but its editions and
 * profiles sit here like every other generation's.
 *
 * Editions: no profile is registered for the "Yellow Legacy" hack mapper (decision 8),
 * so that edition was removed from the dropdown/grid; loading that mapper still lands
 * on the unsupported-mapper state rather than the hang in known-legacy-bugs.md #22.
 * The split prefix letters and the folder (= the mapper game name) are what
 * `useOverlaySettingsStore.gameLetter` and `metaStore.game` compute today. gen1's
 * edition lives in that store (no `editionKey`). The box art is the front of each box
 * (`images/box_art/`, from Scott's library, 2026-09-11). The window icons are the
 * cartridge photos from that same library, resized to 256 px (`resources/icons/gen1/`).
 * Red and Blue are one mapper, so the icon follows the edition.
 */
export const gen1Manifest: ModuleManifest = {
    id: "gen1",
    generation: 1,
    mappers: [yellowDeprecated, redBlueDeprecated],
    games: ["Yellow", "Red and Blue"],
    editions: [
        { name: "Red", game: "Red and Blue", boxArt: "1-Red.webp", splitFolder: "Red and Blue", splitPrefix: "R", icon: "gen1/icon-red.png" },
        { name: "Blue", game: "Red and Blue", boxArt: "1-Blue.webp", splitFolder: "Red and Blue", splitPrefix: "B", icon: "gen1/icon-blue.png" },
        { name: "Yellow", game: "Yellow", boxArt: "1-Yellow.webp", splitFolder: "Yellow", splitPrefix: "Y", icon: "gen1/icon-yellow.png" },
    ],
    load: () => import("./index").then((m) => m.gen1),
};
