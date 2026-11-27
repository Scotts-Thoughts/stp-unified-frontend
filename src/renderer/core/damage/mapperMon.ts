import type { StatStages } from "@stp/damage-calc";
import type { MonInput } from "./calc";

/** A mapper property's value (`node.value`), or undefined. */
export const val = (node: any): any => node?.value;
const num = (node: any): number | undefined => {
    const n = Number(val(node));
    return Number.isFinite(n) ? n : undefined;
};

/**
 * A battler or party member of the gen 3-5 mappers (`battle.player.active_pokemon`, `battle.opponent.team.N`, gen 3's
 * `battle.yourPokemon`): the names differ, so `names` says which to read. Stats are raw in these games (the stat
 * stages sit apart in `modifiers` / `modStage*`). Null when the species, level or max HP isn't there yet.
 */
export interface MonPaths {
    species: string;
    level: string;
    hp: string;
    maxHp: string;
    attack: string;
    defense: string;
    spattack: string;
    spdefense: string;
    speed: string;
    type1?: string;
    type2?: string;
    item?: string;
    ability?: string;
    status?: string;
    friendship?: string;
    /** Stage values, signed (0 = no change). */
    stages?: Partial<Record<keyof StatStages, string>>;
    ivs?: { hp: string; attack: string; defense: string; spattack: string; spdefense: string; speed: string };
}

/** `a.b.c` under `node`. */
export function at(node: any, path: string): any {
    let n = node;
    for (const part of path.split(".")) n = n?.[part];
    return n;
}

export function readMon(node: any, paths: MonPaths, isPlayer: boolean, extra?: Partial<MonInput>): MonInput | null {
    if (!node) return null;
    const species = val(at(node, paths.species));
    const level = num(at(node, paths.level));
    const maxHp = num(at(node, paths.maxHp));
    if (!species || !level || !maxHp) return null;
    const stages: Partial<StatStages> = {};
    for (const [k, p] of Object.entries(paths.stages ?? {})) {
        const v = num(at(node, p!));
        if (v !== undefined) stages[k as keyof StatStages] = v;
    }
    const ivs = paths.ivs && Object.fromEntries(Object.entries(paths.ivs).map(([k, p]) => [k, num(at(node, p))]));
    return {
        isPlayer,
        species: String(species),
        level,
        stats: {
            hp: maxHp,
            attack: num(at(node, paths.attack)) ?? 1,
            defense: num(at(node, paths.defense)) ?? 1,
            spattack: num(at(node, paths.spattack)) ?? 1,
            spdefense: num(at(node, paths.spdefense)) ?? 1,
            speed: num(at(node, paths.speed)) ?? 1,
        },
        hp: num(at(node, paths.hp)),
        types: paths.type1 ? [val(at(node, paths.type1)), paths.type2 ? val(at(node, paths.type2)) : undefined] : null,
        stages,
        item: paths.item ? val(at(node, paths.item)) ?? null : null,
        ability: paths.ability ? val(at(node, paths.ability)) ?? null : null,
        status: paths.status ? val(at(node, paths.status)) ?? null : null,
        friendship: paths.friendship ? num(at(node, paths.friendship)) ?? null : null,
        ivs: ivs && Object.values(ivs).every((v) => v !== undefined) ? ivs as any : undefined,
        ...extra,
    };
}

/** gens 4-5's battler / party member (`battle.player.active_pokemon`, `battle.opponent.team.N`). */
export const DS_MON: MonPaths = {
    species: "species", level: "level", hp: "stats.hp", maxHp: "stats.hp_max",
    attack: "stats.attack", defense: "stats.defense", spattack: "stats.special_attack", spdefense: "stats.special_defense", speed: "stats.speed",
    type1: "type_1", type2: "type_2", item: "held_item", ability: "ability", status: "status_condition", friendship: "friendship",
    stages: {
        attack: "modifiers.attack", defense: "modifiers.defense", spattack: "modifiers.special_attack",
        spdefense: "modifiers.special_defense", speed: "modifiers.speed", accuracy: "modifiers.accuracy", evasion: "modifiers.evasion",
    },
    ivs: { hp: "ivs.hp", attack: "ivs.attack", defense: "ivs.defense", spattack: "ivs.special_attack", spdefense: "ivs.special_defense", speed: "ivs.speed" },
};

/** A trainer table Pokémon (`enemy_mon_static` and the previews: plain values, `stats.{hp,attack,...}`). */
export function readTableMon(mon: any, isPlayer = false): MonInput | null {
    const s = mon?.stats ?? mon;
    const species = mon?.species?.value ?? mon?.species;
    const level = Number(mon?.level);
    if (!species || !level || !s) return null;
    const stat = (...keys: string[]) => { for (const k of keys) { const n = Number(s[k]); if (Number.isFinite(n) && n > 0) return n; } return 1; };
    return {
        isPlayer,
        species: String(species),
        level,
        stats: {
            hp: stat("hp", "hp_max"), attack: stat("attack", "atk"), defense: stat("defense", "def"),
            spattack: stat("special_attack", "spa", "special"), spdefense: stat("special_defense", "spd", "special"), speed: stat("speed", "spe"),
        },
        item: mon?.held_item ?? mon?.item ?? null,
        ability: mon?.ability ?? null,
    };
}
