import { identityReads, identityWrites, type MapperProfile } from "../../../core/mapper/MapperProfile";
import { GEN1_DEPRECATED_READS, GEN1_DEPRECATED_WRITES } from "./deprecated-paths";

/**
 * `DEPRECATED/gen1/pokemon_red_blue_deprecated.xml` -- one mapper for both Red and
 * Blue, whose game name is the single string "Red and Blue". The Red/Blue *edition* is
 * a user choice on top of it (`settings.edition`), not something the mapper knows.
 */
export const redBlueDeprecated: MapperProfile = {
    id: "gen1/red-blue-deprecated",
    pathPatterns: [/^DEPRECATED\/gen1\/pokemon_red_blue_deprecated\.xml$/],
    identity: { source: "property", path: "meta.gameName", values: ["Red and Blue"] },
    reads: identityReads(GEN1_DEPRECATED_READS),
    writes: identityWrites(GEN1_DEPRECATED_WRITES),
};
