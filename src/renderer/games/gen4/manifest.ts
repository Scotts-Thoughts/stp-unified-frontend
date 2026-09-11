import type { ModuleManifest } from "~/core/game/ModuleManifest";
import { diamondPearlStandard } from "./mappers/diamond-pearl";
import { heartGoldSoulSilverStandard } from "./mappers/heartgold-soulsilver";
import { platinumStandard } from "./mappers/platinum";

/**
 * gen4's manifest (plan 3.1): the shell's view of the generation before it is loaded.
 * The edition is the lifted component's `selected_game` key, in its own vocabulary.
 */
export const gen4Manifest: ModuleManifest = {
    id: "gen4",
    generation: 4,
    mappers: [platinumStandard, diamondPearlStandard, heartGoldSoulSilverStandard],
    games: ["Platinum", "Diamond and Pearl", "HeartGold and SoulSilver"],
    editions: [
        { name: "Platinum", game: "Platinum", boxArt: "4-Platinum.png", splitFolder: "Platinum", splitPrefix: "", icon: "gen4/icon-platinum.ico" },
        { name: "Diamond and Pearl", game: "Diamond and Pearl", boxArt: "4-DiamondandPearl.jpg", splitFolder: "DP", splitPrefix: "", icon: "gen4/icon-diamond.ico" },
        { name: "HeartGold and SoulSilver", game: "HeartGold and SoulSilver", boxArt: "4-HeartGoldandSoulSilver.jpg", splitFolder: "HGSS", splitPrefix: "", icon: "gen4/icon-heartgold.ico" },
    ],
    editionKey: "selected_game",
    load: () => import("./index").then((m) => m.gen4),
};
