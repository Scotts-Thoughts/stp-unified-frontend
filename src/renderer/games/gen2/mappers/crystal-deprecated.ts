import { identityReads, identityWrites, type MapperProfile } from "../../../core/mapper/MapperProfile";
import { GEN2_DEPRECATED_READS, GEN2_DEPRECATED_WRITES } from "./deprecated-paths";

/**
 * `DEPRECATED/gen2/pokemon_crystal_deprecated.xml` -- the mapper gen2 runs on today
 * (`docs/mapper-matrix.md`; the recorded Crystal fixture uses it). Identity profile:
 * gen2 shares gen1's vocabulary where the meaning is the same and adds its own paths
 * (natures do not exist yet, but `time.*`, `player.pokeBalls`, `squidgyExtras`...).
 */
export const crystalDeprecated: MapperProfile = {
    id: "gen2/crystal-deprecated",
    pathPatterns: [/^DEPRECATED\/gen2\/pokemon_crystal_deprecated\.xml$/],
    identity: { source: "property", path: "meta.gameName", values: ["Crystal"] },
    reads: identityReads(GEN2_DEPRECATED_READS),
    writes: identityWrites(GEN2_DEPRECATED_WRITES),
};
