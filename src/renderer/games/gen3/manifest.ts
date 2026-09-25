import type { ModuleManifest } from "~/core/game/ModuleManifest";
import { emeraldNe } from "./mappers/emerald-ne";
import { fireRedLeafGreenNe } from "./mappers/firered-leafgreen-ne";

/**
 * gen3's manifest (plan 3.1): the shell's view of the generation before it is loaded.
 * The edition is the lifted component's `gameSelection` key (its own box-art toggle
 * wrote the same one). Ruby & Sapphire have data but no mapper
 * (`docs/mapper-matrix.md`), so they are not an edition.
 */
export const gen3Manifest: ModuleManifest = {
    id: "gen3",
    generation: 3,
    mappers: [emeraldNe, fireRedLeafGreenNe],
    games: ["Emerald", "FireRed and LeafGreen"],
    editions: [
        { name: "Emerald", game: "Emerald", boxArt: "3-Emerald.webp", splitFolder: "Emerald", splitPrefix: "", icon: "gen3/icon-emerald.ico" },
        { name: "FireRed and LeafGreen", game: "FireRed and LeafGreen", boxArt: "3-FireRedLeafGreen.webp", splitFolder: "FireRed and LeafGreen", splitPrefix: "", icon: "gen3/icon-firered.ico" },
    ],
    editionKey: "gameSelection",
    load: () => import("./index").then((m) => m.gen3),
};
