import type { ModuleManifest } from "~/core/game/ModuleManifest";
import { sunMoonStandard, ultraSunMoonStandard } from "../gen6/mappers/profiles";

/**
 * gen7's manifest: Sun/Moon and Ultra Sun/Ultra Moon. They are 3DS games with the same screens as gen 6's, so the
 * overlay is gen6's (`games/gen6/`); only the manifest, the user-state section ("gen7") and the game's tables differ.
 */
export const gen7Manifest: ModuleManifest = {
    id: "gen7",
    generation: 7,
    mappers: [sunMoonStandard, ultraSunMoonStandard],
    games: ["Sun and Moon", "Ultra Sun and Ultra Moon"],
    editions: [
        { name: "Sun and Moon", game: "Sun and Moon", boxArt: "7-SunMoon.webp", splitFolder: "Sun and Moon", splitPrefix: "", icon: "gen7/icon-sun.ico" },
        { name: "Ultra Sun and Ultra Moon", game: "Ultra Sun and Ultra Moon", boxArt: "7-UltraSunUltraMoon.webp", splitFolder: "Ultra Sun and Ultra Moon", splitPrefix: "", icon: "gen7/icon-ultrasun.ico" },
    ],
    editionKey: "selected_game",
    load: () => import("../gen6/index").then((m) => m.gen7),
};
