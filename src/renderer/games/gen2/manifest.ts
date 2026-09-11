import type { ModuleManifest } from "~/core/game/ModuleManifest";
import { crystalDeprecated } from "./mappers/crystal-deprecated";
import { goldSilverDeprecated } from "./mappers/gold-silver-deprecated";

/**
 * gen2's manifest (plan 3.1): the shell's view of the generation before it is loaded.
 * The edition is the lifted component's `game_selection` key; the box art and the
 * window icon are the legacy `2-crystal.png` and `icon.png` until Scott supplies art
 * in the gen3-5 style (decision 16).
 */
export const gen2Manifest: ModuleManifest = {
    id: "gen2",
    generation: 2,
    mappers: [crystalDeprecated, goldSilverDeprecated],
    games: ["Crystal", "Gold and Silver"],
    editions: [
        { name: "Crystal", game: "Crystal", boxArt: "2-Crystal.png", splitFolder: "Crystal", splitPrefix: "c", icon: "gen2/icon.png" },
        { name: "Gold & Silver", game: "Gold and Silver", boxArt: "2-Crystal.png", splitFolder: "Gold & Silver", splitPrefix: "c", icon: "gen2/icon.png" },
    ],
    editionKey: "game_selection",
    load: () => import("./index").then((m) => m.gen2),
};
