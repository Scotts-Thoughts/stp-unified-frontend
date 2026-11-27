import { gen3HiddenPower, type Ivs } from "~/core/logic/starterIvs";
import { isOhkoMove, ohkoPowerText } from "~/core/logic/ohkoAccuracy";
import type { GameData, MoveEntry } from "../data";

/**
 * Battle arithmetic of gens 6 and 7 as the overlay shows it. There is no decompilation of these games, so each rule
 * here is the long-documented mechanic (and unchanged from gen 5 unless said): stat stages, the type chart with
 * Fairy, same-type attack bonus, Hidden Power.
 */

export const STAT_KEYS = ["hp", "attack", "defense", "special_attack", "special_defense", "speed"] as const;
export type StatKey = (typeof STAT_KEYS)[number];

/** A stat stage (-6..6) as the game's ratio: (2 + n) / 2 raised, 2 / (2 - n) lowered. */
export function stageRatio(stage: unknown): [number, number] {
    const n = Math.max(-6, Math.min(6, Math.trunc(Number(stage)) || 0));
    return n >= 0 ? [2 + n, 2] : [2, 2 - n];
}

/** A stat after its stage, rounded down as the games do. */
export function withStage(stat: unknown, stage: unknown): number {
    const [num, den] = stageRatio(stage);
    return Math.floor(((Number(stat) || 0) * num) / den);
}

/** The type chart's multiplier of a move type against a defender's one or two types. */
export function typeMultiplier(chart: GameData["typeChart"], moveType: string | null | undefined, defenderTypes: readonly (string | null | undefined)[]): number {
    const row = moveType ? chart[moveType] : undefined;
    if (!row) return 1;
    const types = [...new Set(defenderTypes.filter((t): t is string => !!t))];
    return types.reduce((product, type) => product * (row[type] ?? 1), 1);
}

/** Hidden Power's type from the six IVs. Its power is 60 from gen 6 on, whatever the IVs. */
export function hiddenPowerType(ivs: Partial<Record<StatKey, unknown>>): string {
    const n = (v: unknown) => Math.max(0, Math.min(31, Number(v) || 0));
    const spread: Ivs = { hp: n(ivs.hp), atk: n(ivs.attack), def: n(ivs.defense), spa: n(ivs.special_attack), spd: n(ivs.special_defense), spe: n(ivs.speed) };
    return gen3HiddenPower(spread).type;
}
export const HIDDEN_POWER_POWER = 60;

/** Return and Frustration from friendship (0..255): at least 1, at most 102. */
export function friendshipPower(move: string, friendship: unknown): number | null {
    const f = Math.max(0, Math.min(255, Number(friendship) || 0));
    if (move === "Return") return Math.max(1, Math.floor((f * 2) / 5));
    if (move === "Frustration") return Math.max(1, Math.floor(((255 - f) * 2) / 5));
    return null;
}

export interface MoveUser {
    types: readonly (string | null | undefined)[];
    ability?: string | null;
    friendship?: unknown;
    ivs?: Partial<Record<StatKey, unknown>>;
}

/** The move's type as the user's Pokemon uses it (Hidden Power takes its type from the IVs). */
export function moveTypeFor(move: MoveEntry | undefined, user: MoveUser): string | null {
    if (!move) return null;
    if (move.move === "Hidden Power" && user.ivs) return hiddenPowerType(user.ivs);
    return move.type;
}

/** The move's base power before any target: the table's, or Hidden Power / Return / Frustration worked out. */
export function basePower(move: MoveEntry | undefined, user: MoveUser): number | null {
    if (!move) return null;
    if (move.move === "Hidden Power") return HIDDEN_POWER_POWER;
    return friendshipPower(move.move, user.friendship) ?? move.power;
}

/**
 * What the power column shows. Outside battle (`target` null): the base power, "KO" for a one-hit KO move, "-" for a
 * move with none. In battle: the base power times the same-type bonus (1.5, or 2 with Adaptability) and the type chart
 * against the target, rounded down; 0 when the chart leaves it no effect.
 */
export function shownPower(data: GameData, moveKey: string | null, user: MoveUser, target: { types: readonly (string | null | undefined)[] } | null): number | string {
    const move = moveKey ? data.moves[moveKey] : undefined;
    if (!move) return "-";
    const type = moveTypeFor(move, user);
    const chart = target ? typeMultiplier(data.typeChart, type, target.types) : null;
    if (isOhkoMove(move.move)) return ohkoPowerText(chart);
    const power = basePower(move, user);
    if (move.category === "Status" || power === null || power === 0) return "-";
    if (chart === null) return power;
    const stab = type && user.types.includes(type) ? (user.ability === "Adaptability" ? 2 : 1.5) : 1;
    return Math.floor(power * stab * chart);
}

/** A nature's multiplier for each stat, from `data/natures.js`. */
export function natureMultipliers(natures: Record<string, any>, nature: unknown): Record<Exclude<StatKey, "hp">, number> {
    const entry = typeof nature === "string" ? natures[nature] : undefined;
    return {
        attack: entry?.nature_attack ?? 1,
        defense: entry?.nature_defense ?? 1,
        special_attack: entry?.nature_specialAttack ?? 1,
        special_defense: entry?.nature_specialDefense ?? 1,
        speed: entry?.nature_speed ?? 1,
    };
}
