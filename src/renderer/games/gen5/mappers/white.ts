import { identityReads, identityWrites, type MapperProfile } from "../../../core/mapper/MapperProfile";
import { GEN5_STANDARD_READS, GEN5_STANDARD_WRITES } from "./standard-paths";

/**
 * `STANDARD/gen5/pokemon_white.xml` -- the mapper gen5 runs on, with the fixes `tools/mappers/make-gen5-st.py`
 * patches in (`docs/mapper-matrix.md`; unpatched, it reads the wrong battle records with an ally). The old
 * `ST/gen5/pokemon_white_ne.xml` copy still matches, for older fixtures. Identity profile: gen5's vocabulary is the STANDARD
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
