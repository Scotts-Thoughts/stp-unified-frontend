import { identityReads, identityWrites, type MapperProfile } from "../../../core/mapper/MapperProfile";
import { GEN5_STANDARD_READS, GEN5_STANDARD_WRITES } from "./standard-paths";

/**
 * `STANDARD/gen5/pokemon_white.xml` -- the mapper gen5 runs on today
 * (`docs/mapper-matrix.md`). Identity profile: gen5's vocabulary is the STANDARD
 * family's, so every canonical key is the mapper path. The four gen5 profiles differ
 * only in identity.
 */
export const whiteStandard: MapperProfile = {
    id: "gen5/white",
    pathPatterns: [/^STANDARD\/gen5\/pokemon_white\.xml$/],
    identity: { source: "property", path: "meta.game_name", values: ["White"] },
    reads: identityReads(GEN5_STANDARD_READS),
    writes: identityWrites(GEN5_STANDARD_WRITES),
};
