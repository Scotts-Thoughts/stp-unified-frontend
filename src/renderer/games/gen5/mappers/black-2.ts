import { identityReads, identityWrites, type MapperProfile } from "../../../core/mapper/MapperProfile";
import { GEN5_STANDARD_READS, GEN5_STANDARD_WRITES } from "./standard-paths";

/**
 * `STANDARD/gen5/pokemon_black_2.xml` -- the mapper gen5 runs on today
 * (`docs/mapper-matrix.md`). Identity profile: gen5's vocabulary is the STANDARD
 * family's, so every canonical key is the mapper path. The four gen5 profiles differ
 * only in identity.
 */
export const black2Standard: MapperProfile = {
    id: "gen5/black-2",
    pathPatterns: [/^STANDARD\/gen5\/pokemon_black_2\.xml$/],
    identity: { source: "property", path: "meta.game_name", values: ["Black 2"] },
    reads: identityReads(GEN5_STANDARD_READS),
    writes: identityWrites(GEN5_STANDARD_WRITES),
};
