import { identityReads, identityWrites, type MapperProfile } from "../../../core/mapper/MapperProfile";
import { GEN4_STANDARD_READS, GEN4_STANDARD_WRITES } from "./standard-paths";

/**
 * `ST/gen4/pokemon_heartgold_soulsilver_ne.xml` -- the mapper gen4 runs on today
 * (`docs/mapper-matrix.md`), and `STANDARD/gen4/pokemon_heartgold_soulsilver.xml`, which shares
 * the property names (the `_ne` variant adds the `patch.*` / encounter properties the
 * overlay writes). Identity profile: gen4's vocabulary is the STANDARD family's
 * (`meta.game_name`, `battle.opponent.team.N`, `player.team.N.species`...), so every
 * canonical key is the mapper path. The three gen4 profiles differ only in identity.
 */
export const heartGoldSoulSilverStandard: MapperProfile = {
    id: "gen4/heartgold-soulsilver",
    pathPatterns: [/^ST\/gen4\/pokemon_heartgold_soulsilver_ne\.xml$/, /^STANDARD\/gen4\/pokemon_heartgold_soulsilver\.xml$/],
    identity: { source: "property", path: "meta.game_name", values: ["HeartGold and SoulSilver"] },
    reads: identityReads(GEN4_STANDARD_READS),
    writes: identityWrites(GEN4_STANDARD_WRITES),
};
