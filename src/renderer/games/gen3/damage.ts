/**
 * gen3's inputs to the damage calculator (core/damage/calc.ts), read from the mapper. The battle structs
 * (`battle.yourPokemon`, `battle.enemyPokemon`) hold raw stats with the stages apart (`modStage*`, signed); the
 * player's badges boost its stats in the engine (the engine's `badges.ts`).
 * An enemy that isn't out is the trainer table's Pokémon (`enemyTrainer`, the panel's own data) with its HP now.
 */
import { badgeIds, moveDamages, type FieldInput, type MonInput, type MoveDamage } from "~/core/damage/calc";
import { damageData } from "~/core/damage/data";
import { readMon, readTableMon, val, type MonPaths } from "~/core/damage/mapperMon";

const GEN3_MON: MonPaths = {
    species: "species", level: "level", hp: "hp", maxHp: "maxHp",
    attack: "attack", defense: "defense", spattack: "specialAttack", spdefense: "specialDefense", speed: "speed",
    type1: "type1", type2: "type2", item: "heldItem", ability: "ability", status: "status1", friendship: "friendship",
    stages: {
        attack: "modStageAttack", defense: "modStageDefense", spattack: "modStageSpecialAttack", spdefense: "modStageSpecialDefense",
        speed: "modStageSpeed", accuracy: "modStageAccuracy", evasion: "modStageEvasion",
    },
    ivs: { hp: "ivHp", attack: "ivAttack", defense: "ivDefense", spattack: "ivSpecialAttack", spdefense: "ivSpecialDefense", speed: "ivSpeed" },
};

function field(vm: any): FieldInput {
    // `weatherDenial` is a computed (Cloud Nine / Air Lock out), not a method.
    const weather = vm.weatherDenial == true ? null : val(vm.game.properties.battle.field?.weather);
    return { game: String(vm.gameSelection ?? "Emerald"), gen: 3, weather };
}

function side(vm: any, who: "player" | "enemy") {
    const f = vm.game.properties.battle.field?.[who];
    return { reflect: val(f?.statusReflect) == true, lightScreen: val(f?.statusLightScreen) == true };
}

export function damageShown(vm: any): boolean {
    return vm.g3stateVariable == "Battle";
}

function player(vm: any): MonInput | null {
    const props = vm.game.properties;
    const badges = badgeIds(field(vm).game, [1, 2, 3, 4, 5, 6, 7, 8].map((n) => val(props.player.badges?.[`badge${n}`]) == true));
    return readMon(props.battle.yourPokemon, GEN3_MON, true, { ...side(vm, "player"), badges });
}

/** Party slot `x`: the one out (live), else the trainer table's Pokémon at its HP now. */
function enemy(vm: any, x: number, table?: any): MonInput | null {
    const batt = vm.game.properties.battle;
    const flags = side(vm, "enemy");
    if (val(batt.enemyPokemon?.partyPos) == x) {
        const live = readMon(batt.enemyPokemon, GEN3_MON, false, flags);
        if (live) return live;
    }
    const fromTable = readTableMon(table);
    if (!fromTable) return null;
    const hp = Number(val(batt.trainer?.team?.[x]?.hp));
    return { ...fromTable, ...flags, hp: Number.isFinite(hp) ? hp : null };
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

/** Party slot `x`'s moves against the player's Pokémon out (the enemy panel); `table` is its trainer table entry. */
export function enemyMoveDamage(vm: any, x: number, table: any, moves: readonly (string | null | undefined)[]): (MoveDamage | null)[] | null {
    if (!damageShown(vm)) return null;
    const f = field(vm);
    const data = damageData(f.game);
    const me = player(vm);
    const them = enemy(vm, x, table);
    if (!data || !me || !them) return null;
    return moveDamages(data, f, them, me, moves);
}
