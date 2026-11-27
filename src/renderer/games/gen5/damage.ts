/**
 * gen5's inputs to the damage calculator (core/damage/calc.ts), read from the mapper. The player is
 * `battle.player.active_pokemon` (raw stats, stages in `modifiers`, the ability in force in `ability_temp`); its
 * status and IVs are the party leader's, because the battler record has neither. Each enemy is its party slot's
 * battle record (`battle.opponent.pkmn_ram.pokemon_N_ram`) with the party member's status and IVs.
 * The gen 5 mapper has no Reflect / Light Screen flags, so screens are never counted here.
 */
import { moveDamages, type FieldInput, type MonInput, type MoveDamage } from "~/core/damage/calc";
import { damageData } from "~/core/damage/data";
import { DS_MON, readMon, val, type MonPaths } from "~/core/damage/mapperMon";

/** gen 5's battle records: the ability in force is `ability_temp` (Skill Swap, Role Play, ...). */
const BATTLER: MonPaths = { ...DS_MON, ability: "ability_temp", status: undefined, ivs: undefined };

function field(vm: any): FieldInput {
    const props = vm.game.properties;
    const suppressed = vm.weatherSuppressed?.() == true;
    return { game: String(val(props.meta.game_name) ?? "Black"), gen: 5, weather: suppressed ? null : val(props.battle.field?.weather) };
}

/** IVs and status of a party member (`player.team.0`, `battle.opponent.team.N`). */
function partyExtras(member: any): Partial<MonInput> {
    const iv = (k: string) => Number(val(member?.ivs?.[k]));
    const ivs = { hp: iv("hp"), attack: iv("attack"), defense: iv("defense"), spattack: iv("special_attack"), spdefense: iv("special_defense"), speed: iv("speed") };
    return {
        status: val(member?.status_condition) ?? null,
        ...(Object.values(ivs).every(Number.isFinite) ? { ivs } : {}),
    };
}

export function damageShown(vm: any): boolean {
    return val(vm.game.properties.meta.state) == "Battle";
}

function withAbility(mon: MonInput | null, node: any): MonInput | null {
    // `ability_temp` is empty until the battle sets it; the base ability stands in.
    if (mon && !mon.ability) mon.ability = val(node?.ability) ?? null;
    return mon;
}

function player(vm: any): MonInput | null {
    const node = vm.game.properties.battle.player.active_pokemon;
    return withAbility(readMon(node, BATTLER, true, partyExtras(vm.game.properties.player.team[0])), node);
}

function enemy(vm: any, x: number): MonInput | null {
    const opponent = vm.game.properties.battle.opponent;
    const ram = opponent.pkmn_ram?.[`pokemon_${x}_ram`];
    return withAbility(readMon(ram, BATTLER, false, partyExtras(opponent.team?.[x])), ram)
        ?? readMon(opponent.team?.[x], { ...DS_MON, ivs: undefined }, false, partyExtras(opponent.team?.[x]));
}

/** The player's moves against the enemy out, slots 1-4. */
export function playerMoveDamage(vm: any, moves: readonly (string | null | undefined)[]): (MoveDamage | null)[] | null {
    if (!damageShown(vm)) return null;
    const f = field(vm);
    const data = damageData(f.game);
    const me = player(vm);
    const them = enemy(vm, Number(val(vm.game.properties.battle.opponent.party_position)) || 0);
    if (!data || !me || !them) return null;
    return moveDamages(data, f, me, them, moves);
}

/** Party slot `x`'s moves against the player's Pokémon out (the enemy panel). */
export function enemyMoveDamage(vm: any, x: number, moves: readonly (string | null | undefined)[]): (MoveDamage | null)[] | null {
    if (!damageShown(vm)) return null;
    const f = field(vm);
    const data = damageData(f.game);
    const me = player(vm);
    const them = enemy(vm, x);
    if (!data || !me || !them) return null;
    return moveDamages(data, f, them, me, moves);
}
