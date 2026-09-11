import { identityReads, identityWrites, type MapperProfile } from "../../../core/mapper/MapperProfile";
import { GEN4_STANDARD_READS, GEN4_STANDARD_WRITES } from "./standard-paths";

/**
 * `ST/gen4/pokemon_diamond_pearl_ne.xml` -- the mapper gen4 runs on today
 * (`docs/mapper-matrix.md`), and `STANDARD/gen4/pokemon_diamond_pearl.xml`, which shares
 * the property names (the `_ne` variant adds the `patch.*` / encounter properties the
 * overlay writes). Identity profile: gen4's vocabulary is the STANDARD family's
 * (`meta.game_name`, `battle.opponent.team.N`, `player.team.N.species`...), so every
 * canonical key is the mapper path. The three gen4 profiles differ only in identity.
 */
export const diamondPearlStandard: MapperProfile = {
    id: "gen4/diamond-pearl",
    pathPatterns: [/^ST\/gen4\/pokemon_diamond_pearl_ne\.xml$/, /^STANDARD\/gen4\/pokemon_diamond_pearl\.xml$/],
    identity: { source: "property", path: "meta.game_name", values: ["Diamond and Pearl"] },
    reads: identityReads(GEN4_STANDARD_READS),
    writes: identityWrites(GEN4_STANDARD_WRITES),
};
