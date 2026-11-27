/**
 * gen2's inputs to the damage calculator (core/damage/calc.ts), read from the mapper.
 *
 * Trap: the battle structs (`battle.yourPokemon`, `battle.enemyPokemon`, pokecrystal wBattleMon / wEnemyMon) hold
 * stats with the stat stages, badge boosts and burn/paralysis already applied (effect_commands.asm `CalcPlayerStats`
 * writes them there), and the engine applies all of those itself. So the stats come from the party structs
 * (`player.team.0`, `battle.trainer.team.N`), which are raw, and only the stages, types and HP from the battle struct.
 * A wild Pokémon has no party struct in the mapper: its battle stats stand in with no stages (they are already in).
 */
import { badgeIds, moveDamages, type FieldInput, type MonInput, type MoveDamage } from "~/core/damage/calc";
import { damageData } from "~/core/damage/data";
import { readMon, val, type MonPaths } from "~/core/damage/mapperMon";

/** A party struct (`player.team.N`, `battle.trainer.team.N`). */
const PARTY: MonPaths = {
    species: "species", level: "level", hp: "hp", maxHp: "maxHp",
    attack: "attack", defense: "defense", spattack: "specialAttack", spdefense: "specialDefense", speed: "speed",
    item: "heldItem", status: "statusCondition", friendship: "friendship",
};
/** The battle struct's stages (signed). */
const STAGES = {
    attack: "modStageAttack", defense: "modStageDefense", spattack: "modStageSpecialAttack", spdefense: "modStageSpecialDefense",
    speed: "modStageSpeed", accuracy: "modStageAccuracy", evasion: "modStageEvasion",
};

function dvs(member: any) {
    const d = (k: string) => Number(val(member?.[k]));
    const out = { attack: d("dvAttack"), defense: d("dvDefense"), speed: d("dvSpeed"), special: d("dvSpecial") };
    return Object.values(out).every(Number.isFinite) ? out : undefined;
}

function battleExtras(battler: any): Partial<MonInput> {
    const stages: Record<string, number> = {};
    for (const [k, p] of Object.entries(STAGES)) {
        const v = Number(val(battler?.[p]));
        if (Number.isFinite(v)) stages[k] = v;
    }
    return { stages, types: [val(battler?.type1), val(battler?.type2)], hp: Number(val(battler?.hp)) };
}

function field(vm: any): FieldInput {
    return { game: String(val(vm.game.properties.meta.gameName) ?? "Crystal"), gen: 2, weather: val(vm.game.properties.battle.field?.weather) };
}

function side(vm: any, who: "player" | "enemy") {
    const f = vm.game.properties.battle.field?.[who];
    return { reflect: val(f?.statusReflect) == true, lightScreen: val(f?.statusLightScreen) == true };
}

export function damageShown(vm: any): boolean {
    return vm.g2stateVariable == "Battle";
}

function player(vm: any): MonInput | null {
    const props = vm.game.properties;
    const member = props.player.team[0];
    const badges = badgeIds(field(vm).game, Array.from({ length: 16 }, (_, i) => val(props.player.badges?.[`badge${i + 1}`]) == true));
    return readMon(member, PARTY, true, { ...battleExtras(props.battle.yourPokemon), ...side(vm, "player"), badges, dvs: dvs(member) });
}

/** Party slot `x`: its party struct, with the stages, types, HP and item of the one out. */
function enemy(vm: any, x: number): MonInput | null {
    const batt = vm.game.properties.battle;
    const battler = batt.enemyPokemon;
    const member = batt.trainer?.team?.[x];
    const flags = side(vm, "enemy");
    const out = val(battler?.partyPos) == x;
    const mon = readMon(member, PARTY, false, { ...flags, dvs: dvs(member) });
    if (mon && (!out || val(member.species) == val(battler.species))) {
        if (!out) return mon;
        return { ...mon, ...battleExtras(battler), item: val(battler.heldItem) ?? null };
    }
    // A wild Pokémon: the battle stats, which already carry its stages.
    if (!out) return null;
    return readMon(battler, { ...PARTY, item: "heldItem", status: undefined }, false, { ...flags, types: [val(battler.type1), val(battler.type2)] });
}

/** The player's moves against the enemy out, slots 1-4. */
export function playerMoveDamage(vm: any, moves: readonly (string | null | undefined)[]): (MoveDamage | null)[] | null {
    if (!damageShown(vm)) return null;
    const f = field(vm);
    const data = damageData(f.game);
    const me = player(vm);
    const them = enemy(vm, Number(val(vm.game.properties.battle.enemyPokemon?.partyPos)) || 0);
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
