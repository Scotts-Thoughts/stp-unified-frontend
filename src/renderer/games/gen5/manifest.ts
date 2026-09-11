import type { ModuleManifest } from "~/core/game/ModuleManifest";
import { black2Standard } from "./mappers/black-2";
import { blackStandard } from "./mappers/black";
import { white2Standard } from "./mappers/white-2";
import { whiteStandard } from "./mappers/white";

/**
 * gen5's manifest (plan 3.1): the shell's view of the generation before it is loaded.
 * The edition is the lifted component's `selected_game` key, in its own vocabulary.
 */
export const gen5Manifest: ModuleManifest = {
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
    editionKey: "selected_game",
    load: () => import("./index").then((m) => m.gen5),
};
