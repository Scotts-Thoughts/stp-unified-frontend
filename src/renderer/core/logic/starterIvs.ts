/**
 * The starter's DVs (gens 1-2) and IVs (gens 3-5): the two ways they are chosen, and
 * the Hidden Power each choice yields.
 *
 * Every generation lets the overlay pick the starter's genes before the game hands the
 * Pokémon over. **Automatic** is the mode each generation always had: a Hidden Power type
 * (and, from gen3 on, an index into the perfect-or-near-perfect spreads for that type)
 * decides the values. **Manual** is the mode added on 2026-09-17: one field per stat, so
 * a run can dial in exactly the spread it needs -- a speed tie, a damage roll, a gender.
 * The mode and the manual spread are kept where each generation keeps its Hidden Power
 * choice (gen1: the species file; gen2: once per install; gens 3-5: per starter, shared
 * across an evolution family), and Automatic stays the default so nothing changes for a
 * run that never opens the dropdown.
 *
 * The formulas are the games' own:
 *   - gen2 `HiddenPowerDamage` (pokecrystal engine/battle/hidden_power.asm): the type is
 *     `4 * (atk & 3) + (def & 3)`, the power `floor((5 * (8y + 4x + 2w + v) + (spc & 3)) / 2) + 31`
 *     with y/x/w/v the top bit of the Attack/Defense/Speed/Special DV. gen1 has no Hidden
 *     Power; its HP DV is the same derived nibble gen2 uses.
 *   - gen3+ `Cmd_hiddenpowercalc` (pokeemerald src/battle_script_commands.c): the low bit
 *     of each IV in HP/Atk/Def/Spe/SpA/SpD order makes a 6-bit number `t`, the type is
 *     `floor(15 * t / 63)`; bit 1 of each IV makes `p`, the power `floor(40 * p / 63) + 30`.
 *     Gen4 and gen5 keep both formulas (the power only changes in gen6).
 *   - gen2 gender (pokecrystal `GetGender`): female when `(atk << 4 | spe) <= ratio`, and
 *     every ratio is `16k + 15`, so only the Attack DV decides.
 */

export const IV_MODE = {
    automatic: "Automatic",
    manual: "Manual",
} as const;
export type IvMode = (typeof IV_MODE)[keyof typeof IV_MODE];

/** Hidden Power types by the index both formulas produce (Normal is skipped by the games). */
export const HIDDEN_POWER_TYPES = [
    "Fighting", "Flying", "Poison", "Ground", "Rock", "Bug", "Ghost", "Steel",
    "Fire", "Water", "Grass", "Electric", "Psychic", "Ice", "Dragon", "Dark",
] as const;

export const DV_MAX = 15;
export const IV_MAX = 31;

/** Gen1/gen2 determinant values; HP is derived from the other four and not stored. */
export interface Dvs {
    atk: number;
    def: number;
    spe: number;
    spc: number;
}

/** Gen3+ individual values. */
export interface Ivs {
    hp: number;
    atk: number;
    def: number;
    spa: number;
    spd: number;
    spe: number;
}

export const PERFECT_DVS: Readonly<Dvs> = Object.freeze({ atk: 15, def: 15, spe: 15, spc: 15 });
export const PERFECT_IVS: Readonly<Ivs> = Object.freeze({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 });

/**
 * A field's text as a stat value: whole, within `0..max`; anything unreadable becomes
 * `fallback` (the perfect value, so an emptied field does not silently write a 0).
 */
export function clampStat(value: unknown, max: number, fallback: number = max): number {
    const parsed = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(0, Math.trunc(parsed)));
}

export function clampDvs(dvs: Partial<Dvs> | null | undefined): Dvs {
    return {
        atk: clampStat(dvs?.atk, DV_MAX),
        def: clampStat(dvs?.def, DV_MAX),
        spe: clampStat(dvs?.spe, DV_MAX),
        spc: clampStat(dvs?.spc, DV_MAX),
    };
}

export function clampIvs(ivs: Partial<Ivs> | null | undefined): Ivs {
    return {
        hp: clampStat(ivs?.hp, IV_MAX),
        atk: clampStat(ivs?.atk, IV_MAX),
        def: clampStat(ivs?.def, IV_MAX),
        spa: clampStat(ivs?.spa, IV_MAX),
        spd: clampStat(ivs?.spd, IV_MAX),
        spe: clampStat(ivs?.spe, IV_MAX),
    };
}

/** The gen1/gen2 HP DV: the low bit of Attack, Defense, Speed and Special, in that order. */
export function hpDv(dvs: Dvs): number {
    return ((dvs.atk & 1) << 3) | ((dvs.def & 1) << 2) | ((dvs.spe & 1) << 1) | (dvs.spc & 1);
}

/**
 * The gen1/gen2 stat formula (pokered `CalcStat`, pokecrystal `CalcPkmnStatC`): stat
 * experience enters as `floor(ceil(sqrt(exp)) / 4)`. A freshly received starter has none.
 */
export function gen12Stat(base: number, dv: number, statExp: number, level: number, isHp: boolean): number {
    const bonus = Math.floor(Math.ceil(Math.sqrt(Math.max(0, statExp))) / 4);
    const core = Math.floor((((base + dv) * 2 + bonus) * level) / 100);
    return isHp ? core + level + 10 : core + 5;
}

/** The gen2 Hidden Power a DV spread yields. */
export function gen2HiddenPower(dvs: Dvs): { type: string; power: number } {
    const type = HIDDEN_POWER_TYPES[4 * (dvs.atk & 3) + (dvs.def & 3)];
    const topBits = ((dvs.atk >> 3) & 1) * 8 + ((dvs.def >> 3) & 1) * 4 + ((dvs.spe >> 3) & 1) * 2 + ((dvs.spc >> 3) & 1);
    const power = Math.floor((5 * topBits + (dvs.spc & 3)) / 2) + 31;
    return { type, power };
}

/** The gen3-5 Hidden Power an IV spread yields. */
export function gen3HiddenPower(ivs: Ivs): { type: string; power: number } {
    const order = [ivs.hp, ivs.atk, ivs.def, ivs.spe, ivs.spa, ivs.spd];
    let typeBits = 0;
    let powerBits = 0;
    order.forEach((iv, i) => {
        typeBits |= (iv & 1) << i;
        powerBits |= ((iv >> 1) & 1) << i;
    });
    return {
        type: HIDDEN_POWER_TYPES[Math.floor((15 * typeBits) / 63)],
        power: Math.floor((40 * powerBits) / 63) + 30,
    };
}

/**
 * gen3-5's `hiddenpowers` tables list each spread as `[HP, Atk, Def, Spe, SpA, SpD]`;
 * a missing row (a stale index after the type changed) reads as perfect.
 */
export function ivsFromHiddenPowerRow(row: readonly number[] | null | undefined): Ivs {
    if (!row || row.length < 6) return { ...PERFECT_IVS };
    return { hp: row[0], atk: row[1], def: row[2], spe: row[3], spa: row[4], spd: row[5] };
}

/**
 * gen2's gender from the Attack DV: the highest Attack DV that is still female for each
 * ratio (`GENDER_F50` is 127 = `7 << 4 | 15`). `null` when the ratio cannot be female
 * at all, and genderless species never reach this.
 */
export const GEN2_FEMALE_MAX_ATTACK_DV: Readonly<Record<string, number | null>> = Object.freeze({
    GENDER_F0: null,
    GENDER_F12_5: 1,
    GENDER_F25: 3,
    GENDER_F50: 7,
    GENDER_F75: 11,
    GENDER_F100: 15,
});

export function gen2Gender(atkDv: number, genderRatio: string | null | undefined): "Male" | "Female" | "Unknown" {
    if (!genderRatio || genderRatio === "GENDER_UNKNOWN") return "Unknown";
    const max = GEN2_FEMALE_MAX_ATTACK_DV[genderRatio];
    if (max === null || max === undefined) return "Male";
    return atkDv <= max ? "Female" : "Male";
}
