import { identityReads, identityWrites, type MapperProfile } from "../../../core/mapper/MapperProfile";
import { GEN1_DEPRECATED_READS, GEN1_DEPRECATED_WRITES } from "./deprecated-paths";

/**
 * `DEPRECATED/gen1/pokemon_yellow_deprecated.xml` -- the mapper gen1 runs Yellow on
 * today (`docs/mapper-matrix.md`). Identity profile: gen1's paths are the canonical
 * vocabulary (plan 2.3).
 *
 * The game name this yields, "Yellow", is also a *data key* -- `autosplitter["Yellow"]`,
 * the split folder, `PokeData.setGame` -- which is why it is the verbatim property
 * value and not something friendlier (plan section 1).
 */
export const yellowDeprecated: MapperProfile = {
    id: "gen1/yellow-deprecated",
    pathPatterns: [/^DEPRECATED\/gen1\/pokemon_yellow_deprecated\.xml$/],
    identity: { source: "property", path: "meta.gameName", values: ["Yellow"] },
    reads: identityReads(GEN1_DEPRECATED_READS),
    writes: identityWrites(GEN1_DEPRECATED_WRITES),
};
