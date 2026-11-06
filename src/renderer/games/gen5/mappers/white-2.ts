import { identityReads, identityWrites, type MapperProfile } from "../../../core/mapper/MapperProfile";
import { GEN5_STANDARD_READS, GEN5_STANDARD_WRITES } from "./standard-paths";

/**
 * `ST/gen5/pokemon_white_2_ne.xml` -- the mapper gen5 runs on today (`docs/mapper-matrix.md`), and the upstream
 * `STANDARD/gen5/pokemon_white_2.xml` it is generated from, which reads the wrong battle records with an ally. Identity profile: gen5's vocabulary is the STANDARD
 * family's, so every canonical key is the mapper path. The four gen5 profiles differ
 * only in identity.
 */
export const white2Standard: MapperProfile = {
    id: "gen5/white-2",
    pathPatterns: [/^ST\/gen5\/pokemon_white_2_ne\.xml$/, /^STANDARD\/gen5\/pokemon_white_2\.xml$/],
    identity: { source: "property", path: "meta.game_name", values: ["White 2"] },
    reads: identityReads(GEN5_STANDARD_READS),
    writes: identityWrites(GEN5_STANDARD_WRITES),
};
