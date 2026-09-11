import { identityReads, identityWrites, type MapperProfile } from "../../../core/mapper/MapperProfile";
import { GEN3_NE_READS, GEN3_NE_WRITES } from "./ne-paths";

/**
 * `ST/gen3/pokemon_firered_leafgreen_ne.xml` and its `_deprecated_ne` variant. These
 * two do carry a `<meta>` block (`meta.gameName` = "Pokemon FireRed and LeafGreen"),
 * which is what the identity reads. Same vocabulary table as Emerald's profile.
 */
export const fireRedLeafGreenNe: MapperProfile = {
    id: "gen3/firered-leafgreen-ne",
    pathPatterns: [/^ST\/gen3\/pokemon_firered_leafgreen_ne\.xml$/, /^ST\/gen3\/pokemon_firered_leafgreen_deprecated_ne\.xml$/],
    identity: { source: "property", path: "meta.gameName", values: ["Pokemon FireRed and LeafGreen"] },
    reads: identityReads(GEN3_NE_READS),
    writes: identityWrites(GEN3_NE_WRITES),
};
