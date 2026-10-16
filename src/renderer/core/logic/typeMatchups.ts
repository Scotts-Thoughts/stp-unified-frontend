/**
 * The games' own type chart, gens 2-5, as the battle engines walk it: one entry per (attacking type, defending type)
 * that is not neutral, in the ROM's order. pokeemerald `gTypeEffectiveness` (src/battle_main.c) and pokeplatinum
 * `sTypeMatchupMultipliers` (src/battle/battle_lib.c) list the same entries in the same order; gens 2 and 5 have the
 * same chart. The order matters where the engines multiply integers entry by entry (each step truncates).
 *
 * Multipliers are tenths, as in the ROM: 0 no effect, 5 not very effective, 20 super effective. The Ghost immunities
 * to Normal and Fighting come after the `FORESIGHT` marker, so Foresight / Scrappy can skip them as a batch.
 *
 * The overlays' own charts (`games/genN/data/type-effectiveness.js`) are for display; this one is for code that must
 * reproduce the engine's arithmetic (`sendOutOrder.ts`).
 */

export const FORESIGHT = "(foresight)";

type Entry = readonly [attack: string, defend: string, multiplier: 0 | 5 | 20];

export const TYPE_MATCHUPS: readonly Entry[] = [
    ["Normal", "Rock", 5], ["Normal", "Steel", 5],
    ["Fire", "Fire", 5], ["Fire", "Water", 5], ["Fire", "Grass", 20], ["Fire", "Ice", 20], ["Fire", "Bug", 20],
    ["Fire", "Rock", 5], ["Fire", "Dragon", 5], ["Fire", "Steel", 20],
    ["Water", "Fire", 20], ["Water", "Water", 5], ["Water", "Grass", 5], ["Water", "Ground", 20], ["Water", "Rock", 20],
    ["Water", "Dragon", 5],
    ["Electric", "Water", 20], ["Electric", "Electric", 5], ["Electric", "Grass", 5], ["Electric", "Ground", 0],
    ["Electric", "Flying", 20], ["Electric", "Dragon", 5],
    ["Grass", "Fire", 5], ["Grass", "Water", 20], ["Grass", "Grass", 5], ["Grass", "Poison", 5], ["Grass", "Ground", 20],
    ["Grass", "Flying", 5], ["Grass", "Bug", 5], ["Grass", "Rock", 20], ["Grass", "Dragon", 5], ["Grass", "Steel", 5],
    ["Ice", "Water", 5], ["Ice", "Grass", 20], ["Ice", "Ice", 5], ["Ice", "Ground", 20], ["Ice", "Flying", 20],
    ["Ice", "Dragon", 20], ["Ice", "Steel", 5], ["Ice", "Fire", 5],
    ["Fighting", "Normal", 20], ["Fighting", "Ice", 20], ["Fighting", "Poison", 5], ["Fighting", "Flying", 5],
    ["Fighting", "Psychic", 5], ["Fighting", "Bug", 5], ["Fighting", "Rock", 20], ["Fighting", "Dark", 20],
    ["Fighting", "Steel", 20],
    ["Poison", "Grass", 20], ["Poison", "Poison", 5], ["Poison", "Ground", 5], ["Poison", "Rock", 5], ["Poison", "Ghost", 5],
    ["Poison", "Steel", 0],
    ["Ground", "Fire", 20], ["Ground", "Electric", 20], ["Ground", "Grass", 5], ["Ground", "Poison", 20],
    ["Ground", "Flying", 0], ["Ground", "Bug", 5], ["Ground", "Rock", 20], ["Ground", "Steel", 20],
    ["Flying", "Electric", 5], ["Flying", "Grass", 20], ["Flying", "Fighting", 20], ["Flying", "Bug", 20],
    ["Flying", "Rock", 5], ["Flying", "Steel", 5],
    ["Psychic", "Fighting", 20], ["Psychic", "Poison", 20], ["Psychic", "Psychic", 5], ["Psychic", "Dark", 0],
    ["Psychic", "Steel", 5],
    ["Bug", "Fire", 5], ["Bug", "Grass", 20], ["Bug", "Fighting", 5], ["Bug", "Poison", 5], ["Bug", "Flying", 5],
    ["Bug", "Psychic", 20], ["Bug", "Ghost", 5], ["Bug", "Dark", 20], ["Bug", "Steel", 5],
    ["Rock", "Fire", 20], ["Rock", "Ice", 20], ["Rock", "Fighting", 5], ["Rock", "Ground", 5], ["Rock", "Flying", 20],
    ["Rock", "Bug", 20], ["Rock", "Steel", 5],
    ["Ghost", "Normal", 0], ["Ghost", "Psychic", 20], ["Ghost", "Dark", 5], ["Ghost", "Steel", 5], ["Ghost", "Ghost", 20],
    ["Dragon", "Dragon", 20], ["Dragon", "Steel", 5],
    ["Dark", "Fighting", 5], ["Dark", "Psychic", 20], ["Dark", "Ghost", 20], ["Dark", "Dark", 5], ["Dark", "Steel", 5],
    ["Steel", "Fire", 5], ["Steel", "Water", 5], ["Steel", "Electric", 5], ["Steel", "Ice", 20], ["Steel", "Rock", 20],
    ["Steel", "Steel", 5],
    [FORESIGHT, FORESIGHT, 0],
    ["Normal", "Ghost", 0], ["Fighting", "Ghost", 0],
];

/** A type name as the charts key it: "FIRE", "fire" and "Fire" are all "Fire". */
export function normalType(type: unknown): string {
    const s = String(type ?? "").trim().toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The plain product of the chart against a defender's two types (the second skipped when it repeats the first):
 * 4, 2, 1, 0.5, 0.25 or 0. No integer steps, so only for rules that compare the result (gens 2 and 5).
 */
export function typeProduct(attack: string, defend1: string, defend2: string): number {
    let product = 1;
    for (const [a, d, m] of TYPE_MATCHUPS) {
        if (a !== attack) continue;
        if (d === defend1) product *= m / 10;
        if (d === defend2 && defend1 !== defend2) product *= m / 10;
    }
    return product;
}
