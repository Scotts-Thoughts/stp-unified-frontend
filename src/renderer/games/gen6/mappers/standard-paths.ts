import type { WriteKind } from "../../../core/mapper/MapperProfile";

/**
 * What the 3DS overlay reads from the `STANDARD/gen6` and `STANDARD/gen7` mappers (docs/gen6-inventory.md), as
 * mapper version 0.2.0 (`tools/mappers/make-3ds-mappers.py`).
 *
 * The four mappers share one vocabulary, so every canonical key is the mapper path and the four profiles differ
 * only in identity. The top-level containers are aliased whole: the overlay walks `player.team[n]`,
 * `battle.player_team[n]`, `battle.opponent_team[n]` and the bag pockets by index. The leaves listed under them are
 * the ones the overlay names in code; the list is what the profile claims to cover.
 *
 * Gen 7 has no `player.badges` (and a few more bag pockets); a key a mapper lacks leaves no trace in the view
 * (`buildCanonicalView`), and the overlay reads those with `?.`.
 */
const TEAM_LEAVES = [
    "species", "level", "exp", "nature", "ability", "held_item", "friendship", "pokerus", "status_condition", "nickname",
    "stats.hp", "stats.hp_max", "stats.attack", "stats.defense", "stats.special_attack", "stats.special_defense", "stats.speed",
    "ivs.hp", "ivs.attack", "ivs.defense", "ivs.special_attack", "ivs.special_defense", "ivs.speed",
    "evs.hp", "evs.attack", "evs.defense", "evs.special_attack", "evs.special_defense", "evs.speed",
    "moves.0.move", "moves.0.pp", "moves.1.move", "moves.1.pp", "moves.2.move", "moves.2.pp", "moves.3.move", "moves.3.pp",
    "internals.personality_value", "internals.encryption_constant", "flags.alternate_form",
];
const BATTLER_LEAVES = [
    "species", "hp", "hp_max", "held_item", "ability", "level",
    "stats.attack", "stats.defense", "stats.special_attack", "stats.special_defense", "stats.speed",
    "modifiers.attack", "modifiers.defense", "modifiers.special_attack", "modifiers.special_defense", "modifiers.speed",
    "modifiers.accuracy", "modifiers.evasion",
    "move_0.id", "move_0.pp", "move_0.pp_max", "move_1.id", "move_1.pp", "move_1.pp_max",
    "move_2.id", "move_2.pp", "move_2.pp_max", "move_3.id", "move_3.pp", "move_3.pp_max",
];

const slots = [0, 1, 2, 3, 4, 5];

export const THREE_DS_READS: readonly string[] = [
    "player", "bag", "battle", "overworld", "game_time", "meta", "options",
    "player.name", "player.tid", "player.team_count", "player.team", "player.badges",
    "player.encrypted_mon_0", "player.encrypted_mon_0_stats",
    ...slots.flatMap((n) => TEAM_LEAVES.map((leaf) => `player.team.${n}.${leaf}`)),
    "bag.money",
    "battle.in_battle", "battle.party_position",
    "battle.other.battle", "battle.other.battle_end", "battle.other.outcome", "battle.other.prize_money",
    "battle.player.party_position", "battle.player.team_count",
    "battle.opponent.id", "battle.opponent.trainer_class", "battle.opponent.trainer", "battle.opponent.trainer_name",
    "battle.opponent.trainer_class_name", "battle.opponent.team_count", "battle.opponent.party_position",
    "battle.player_team", "battle.opponent_team",
    ...slots.flatMap((n) => BATTLER_LEAVES.map((leaf) => `battle.player_team.${n}.${leaf}`)),
    ...slots.flatMap((n) => BATTLER_LEAVES.map((leaf) => `battle.opponent_team.${n}.${leaf}`)),
    "overworld.map_index", "overworld.map_name",
    "game_time.hours", "game_time.minutes", "game_time.seconds",
    "meta.generation", "meta.game_name", "meta.state", "meta.saves",
];

/**
 * The one write: the starter (games/gen6/starterWrite.ts). The lead's encrypted stored bytes and party-stat bytes,
 * each written whole (mapper 0.2.0).
 */
export const THREE_DS_WRITES: Readonly<Record<string, WriteKind[]>> = {
    "player.encrypted_mon_0": ["bytes"],
    "player.encrypted_mon_0_stats": ["bytes"],
};
