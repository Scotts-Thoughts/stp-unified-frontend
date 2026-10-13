import type { ModuleManifest } from "~/core/game/ModuleManifest";
import { crystalDeprecated } from "./mappers/crystal-deprecated";
import { goldSilverDeprecated } from "./mappers/gold-silver-deprecated";

/**
 * gen2's manifest (plan 3.1): the shell's view of the generation before it is loaded.
 * The edition is the lifted component's `game_selection` key. The box art is Crystal's
 * front and the Gold and Silver boxes side by side (`images/box_art/`, from Scott's
 * library, 2026-09-11). The window icons are the cartridge photos from that library,
 * resized to 256 px. Gold stands for the Gold & Silver pair, the way FireRed stands
 * for FireRed and LeafGreen; the mapper cannot tell Gold from Silver.
 */
export const gen2Manifest: ModuleManifest = {
    id: "gen2",
    generation: 2,
    mappers: [crystalDeprecated, goldSilverDeprecated],
    games: ["Crystal", "Gold and Silver"],
    editions: [
        { name: "Gold & Silver", game: "Gold and Silver", boxArt: "2-GoldSilver.webp", splitFolder: "Gold & Silver", splitPrefix: "c", icon: "gen2/icon-gold.png" },
        { name: "Crystal", game: "Crystal", boxArt: "2-Crystal.webp", splitFolder: "Crystal", splitPrefix: "c", icon: "gen2/icon-crystal.png" },
    ],
    editionKey: "game_selection",
    load: () => import("./index").then((m) => m.gen2),
};
