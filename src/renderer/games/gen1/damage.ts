/**
 * gen1's inputs to the damage calculator (core/damage/calc.ts), read from the mapper.
 *
 * Trap: the battle structs (`battle.yourPokemon`, `battle.enemyPokemon`, pokered wBattleMon / wEnemyMon) hold stats
 * with the stat stages, badge boosts and burn/paralysis already applied, and the engine applies all of those itself.
 * So the stats come from the party structs (`player.team.0`, `battle.trainer.team.N`), which are raw, and only the
 * stages and HP from the battle struct. A wild Pokémon has no party struct: its stats are worked out from its base
 * stats, DVs and level with no stat experience (pokered `CalcStats`, as the game does for a wild encounter).
 */
import { calcGen12Stats } from "@stp/damage-calc/stats";
import { badgeIds, findSpecies, moveDamages, type FieldInput, type MonInput, type MoveDamage } from "~/core/damage/calc";
import { damageData } from "~/core/damage/data";
import { readMon, val, type MonPaths } from "~/core/damage/mapperMon";

/** A party struct (`player.team.0`, `battle.trainer.team.N`): one Special. */
const PARTY: MonPaths = {
    species: "species", level: "level", hp: "hp", maxHp: "maxHp",
    attack: "attack", defense: "defense", spattack: "special", spdefense: "special", speed: "speed",
    type1: "type1", type2: "type2", status: "statusCondition",
};

function dvs(member: any) {
    const d = (k: string) => Number(val(member?.[k]));
    const out = { attack: d("dvAttack"), defense: d("dvDefense"), speed: d("dvSpeed"), special: d("dvSpecial") };
    return Object.values(out).every(Number.isFinite) ? out : undefined;
}

/** The battle struct's stages (signed); the enemy's are named `modEnemyStage*`. */
function stages(battler: any, prefix: "modStage" | "modEnemyStage") {
    const out: Record<string, number> = {};
    for (const [k, p] of Object.entries({ attack: "Attack", defense: "Defense", spattack: "Special", speed: "Speed", accuracy: "Accuracy", evasion: "Evasion" })) {
        const v = Number(val(battler?.[prefix + p]));
        if (Number.isFinite(v)) out[k] = v;
    }
    return out;
}

const screens = (battler: any) => ({ reflect: val(battler?.effects?.reflect) == true, lightScreen: val(battler?.effects?.lightScreen) == true });

function field(props: any): FieldInput {
    return { game: String(val(props.meta?.gameName) ?? "Yellow"), gen: 1 };
}

export function damageShown(meta: any): boolean {
    return meta.gameState == "Battle";
}

function player(props: any): MonInput | null {
    const battler = props.battle.yourPokemon;
    const member = props.player.team[0];
    const badges = badgeIds(field(props).game, Array.from({ length: 8 }, (_, i) => val(props.player.badges?.[`badge${i + 1}`]) == true));
    return readMon(member, PARTY, true, {
        stages: stages(battler, "modStage"), hp: Number(val(battler?.hp)), ...screens(battler), badges, dvs: dvs(member),
        types: [val(battler?.type1), val(battler?.type2)],
    });
}

/** Party slot `x`: its party struct, with the stages and HP of the one out; a wild Pokémon from its DVs. */
function enemy(props: any, x: number): MonInput | null {
    const battler = props.battle.enemyPokemon;
    const member = props.battle.trainer?.team?.[x];
    const out = val(battler?.partyPos) == x;
    const mon = readMon(member, PARTY, false, { ...screens(battler), dvs: dvs(member) });
    if (mon && (!out || val(member.species) == val(battler.species))) {
        return out ? { ...mon, stages: stages(battler, "modEnemyStage"), hp: Number(val(battler.hp)), types: [val(battler.type1), val(battler.type2)] } : mon;
    }
    if (!out) return null;
    // Wild: base stats (the data's), DVs and level, no stat experience.
    const data = damageData(field(props).game);
    const species = val(battler?.species);
    const level = Number(val(battler?.level));
    const d = dvs(battler);
    const base = data && findSpecies(data, species)?.base;
    if (!base || !level || !d) return null;
    return {
        isPlayer: false, species: String(species), level, stats: calcGen12Stats(base, level, d), dvs: d,
        hp: Number(val(battler.hp)), types: [val(battler.type1), val(battler.type2)], status: val(battler.statusCondition) ?? null,
        stages: stages(battler, "modEnemyStage"), ...screens(battler),
    };
}

/** The player's moves against the enemy out, slots 1-4. `props` is the mapper tree, `meta` gen1's meta store. */
export function playerMoveDamage(props: any, meta: any, moves: readonly (string | null | undefined)[]): (MoveDamage | null)[] | null {
    if (!damageShown(meta)) return null;
    const f = field(props);
    const data = damageData(f.game);
    const me = player(props);
    const them = enemy(props, Number(val(props.battle.enemyPokemon?.partyPos)) || 0);
    if (!data || !me || !them) return null;
    return moveDamages(data, f, me, them, moves);
}

/** Party slot `x`'s moves against the player's Pokémon out (the enemy panel). */
export function enemyMoveDamage(props: any, meta: any, x: number, moves: readonly (string | null | undefined)[]): (MoveDamage | null)[] | null {
    if (!damageShown(meta)) return null;
    const f = field(props);
    const data = damageData(f.game);
    const me = player(props);
    const them = enemy(props, x);
    if (!data || !me || !them) return null;
    return moveDamages(data, f, them, me, moves);
}
