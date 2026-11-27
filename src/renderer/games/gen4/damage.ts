/**
 * gen4's inputs to the damage calculator (core/damage/calc.ts): the player's battler and the enemy's, read from
 * the mapper. The battle structs hold raw stats with the stat stages apart (`modifiers`), so they go in as they are.
 * Reflect / Light Screen are the side flags (`battle.flags.player_side` / `enemy_side`, pokeplatinum
 * SIDE_CONDITION_REFLECT / LIGHT_SCREEN).
 */
import { moveDamages, type FieldInput, type MonInput, type MoveDamage } from "~/core/damage/calc";
import { damageData } from "~/core/damage/data";
import { DS_MON, readMon, readTableMon, val } from "~/core/damage/mapperMon";

function field(vm: any): FieldInput {
    return { game: String(val(vm.game.properties.meta.game_name) ?? "Platinum"), gen: 4, weather: vm.effectiveWeather?.() ?? null };
}

function side(vm: any, group: "player_side" | "enemy_side") {
    const flags = vm.game.properties.battle?.flags?.[group];
    return { reflect: val(flags?.reflect) == true, lightScreen: val(flags?.light_screen) == true };
}

/** The damage is shown only in a battle that is still on. */
export function damageShown(vm: any): boolean {
    const meta = vm.game.properties.meta;
    return val(meta.state) == "Battle" && val(meta.state_enemy) != "Battle Finished";
}

function player(vm: any): MonInput | null {
    return readMon(vm.game.properties.battle.player.active_pokemon, DS_MON, true, side(vm, "player_side"));
}

/** The enemy in party slot `x`: the one out (its stages, status and HP now), else the party member, else the trainer table. */
function enemy(vm: any, x: number, table?: any): MonInput | null {
    const battle = vm.game.properties.battle;
    const flags = side(vm, "enemy_side");
    if (val(battle.opponent.party_position) == x) {
        const active = readMon(battle.opponent.active_pokemon, DS_MON, false, flags);
        if (active) return active;
    }
    const member = readMon(battle.opponent.team?.[x], DS_MON, false, flags);
    if (member && (!table || member.species == (table.species?.value ?? table.species))) return member;
    const fromTable = readTableMon(table);
    return fromTable && { ...fromTable, ...flags };
}

/** The player's moves against the enemy out, slots 1-4 (null: no move, or nothing to show). */
export function playerMoveDamage(vm: any, moves: readonly (string | null | undefined)[]): (MoveDamage | null)[] | null {
    if (!damageShown(vm)) return null;
    const data = damageData(field(vm).game);
    const me = player(vm);
    const them = enemy(vm, Number(val(vm.game.properties.battle.opponent.party_position)) || 0);
    if (!data || !me || !them) return null;
    return moveDamages(data, field(vm), me, them, moves);
}

/** Party slot `x`'s moves against the player's Pokémon out (the enemy panel). */
export function enemyMoveDamage(vm: any, x: number, table: any, moves: readonly (string | null | undefined)[]): (MoveDamage | null)[] | null {
    if (!damageShown(vm)) return null;
    const data = damageData(field(vm).game);
    const me = player(vm);
    const them = enemy(vm, x, table);
    if (!data || !me || !them) return null;
    return moveDamages(data, field(vm), them, me, moves);
}
