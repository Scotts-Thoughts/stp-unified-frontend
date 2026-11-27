import type { ModuleManifest } from "~/core/game/ModuleManifest";
import { orasStandard, xyStandard } from "./mappers/profiles";

/**
 * gen6's manifest: X/Y and Omega Ruby/Alpha Sapphire, on the 3DS overlay in this folder (`games/gen7/manifest.ts`
 * is the same overlay for Sun/Moon and Ultra Sun/Ultra Moon). A pair shares one mapper, so an edition is the pair,
 * as Diamond and Pearl or HeartGold and SoulSilver are. The edition key is `selected_game`, as in gens 4-5.
 */
export const gen6Manifest: ModuleManifest = {
    id: "gen6",
    generation: 6,
    mappers: [xyStandard, orasStandard],
    games: ["X and Y", "Omega Ruby and Alpha Sapphire"],
    editions: [
        { name: "X and Y", game: "X and Y", boxArt: "6-XY.webp", splitFolder: "X and Y", splitPrefix: "", icon: "gen6/icon-x.ico" },
        { name: "Omega Ruby and Alpha Sapphire", game: "Omega Ruby and Alpha Sapphire", boxArt: "6-OmegaRubyAlphaSapphire.webp", splitFolder: "Omega Ruby and Alpha Sapphire", splitPrefix: "", icon: "gen6/icon-omegaruby.ico" },
    ],
    editionKey: "selected_game",
    load: () => import("./index").then((m) => m.gen6),
};
