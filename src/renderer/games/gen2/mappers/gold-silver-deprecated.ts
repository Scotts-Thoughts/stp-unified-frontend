import { identityReads, identityWrites, type MapperProfile } from "../../../core/mapper/MapperProfile";
import { GEN2_DEPRECATED_READS, GEN2_DEPRECATED_WRITES } from "./deprecated-paths";

/**
 * `DEPRECATED/gen2/pokemon_gold_silver_deprecated.xml`. gen2's game logic is
 * hardcoded to Crystal (known-legacy-bugs.md #1, #3) -- the edition dropdown only
 * changes split paths -- so this profile is the same vocabulary; what differs is the
 * identity string and, in Phase 3, the edition the registry validates.
 */
export const goldSilverDeprecated: MapperProfile = {
    id: "gen2/gold-silver-deprecated",
    pathPatterns: [/^DEPRECATED\/gen2\/pokemon_gold_silver_deprecated\.xml$/],
    identity: { source: "property", path: "meta.gameName", values: ["Gold and Silver"] },
    reads: identityReads(GEN2_DEPRECATED_READS),
    writes: identityWrites(GEN2_DEPRECATED_WRITES),
};
