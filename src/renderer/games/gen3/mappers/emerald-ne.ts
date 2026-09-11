import { identityReads, identityWrites, type MapperProfile } from "../../../core/mapper/MapperProfile";
import { GEN3_NE_READS, GEN3_NE_WRITES } from "./ne-paths";

/**
 * `ST/gen3/pokemon_emerald_ne.xml` and its two `_deprecated_ne` variants -- the
 * mappers gen3 runs Emerald on today (`docs/mapper-matrix.md`). None of the three has
 * a `<meta>` block, so the identity is the `/mapper` response's own `gameName`
 * (known-legacy-bugs.md #12: the legacy app reads its game from three places; the
 * lifted component still does, this is only what the shell detects on). Identity
 * profile: gen3's vocabulary is the ST family's, so every canonical key is the mapper
 * path; the FRLG profile shares the table and skips the paths its mapper lacks.
 */
export const emeraldNe: MapperProfile = {
    id: "gen3/emerald-ne",
    pathPatterns: [
        /^ST\/gen3\/pokemon_emerald_ne\.xml$/,
        /^ST\/gen3\/pokemon_emerald_deprecated_ne\.xml$/,
        /^ST\/gen3\/pokemon_emerald_deprecated_ne_new\.xml$/,
    ],
    identity: { source: "mapperMeta", path: "gameName", values: ["STP Pokemon Emerald", "Pokemon Emerald - Deprecated Mapper"] },
    reads: identityReads(GEN3_NE_READS),
    writes: identityWrites(GEN3_NE_WRITES),
};
