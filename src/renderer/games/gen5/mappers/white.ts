import { identityReads, identityWrites, type MapperProfile } from "../../../core/mapper/MapperProfile";
import { GEN5_STANDARD_READS, GEN5_STANDARD_WRITES } from "./standard-paths";

/**
 * `ST/gen5/pokemon_white_ne.xml` -- the mapper gen5 runs on today (`docs/mapper-matrix.md`), and the upstream
 * `STANDARD/gen5/pokemon_white.xml` it is generated from, which reads the wrong battle records with an ally. Identity profile: gen5's vocabulary is the STANDARD
 * family's, so every canonical key is the mapper path. The four gen5 profiles differ
 * only in identity.
 */
export const whiteStandard: MapperProfile = {
    id: "gen5/white",
    pathPatterns: [/^ST\/gen5\/pokemon_white_ne\.xml$/, /^STANDARD\/gen5\/pokemon_white\.xml$/],
    identity: { source: "property", path: "meta.game_name", values: ["White"] },
    reads: identityReads(GEN5_STANDARD_READS),
    writes: identityWrites(GEN5_STANDARD_WRITES),
};
