/**
 * The EV gauge under each stat tile in the regular stats view (core/overlay/player/evGauge.ts draws it): ten pills,
 * one per vitamin, then a bar out to the stat's maximum, coloured by how much training room is left.
 *
 * The limits are the games' own:
 * - Gens 1-2 (stat experience, 0-65,535): a vitamin adds 2,560 and is refused once the high byte is 100 or more,
 *   i.e. at 25,600 (pokered engine/items/item_effects.asm, pokecrystal engine/items/item_effects.asm). The stat
 *   bonus is ceil(sqrt(stat exp)) / 4, with the root capped at 255 (pokered CalcStat, pokecrystal GetSquareRoot),
 *   so the bonus stops growing at a root of 252: 251² + 1 = 63,002 stat experience.
 * - Gens 3-5 (EVs, 0-255 each, 510 in all): a vitamin adds 10 and stops at 100 (pokeemerald EV_ITEM_RAISE_LIMIT);
 *   252 already gives the last stat point (EVs / 4).
 */

export type EvGaugeKind = "ev" | "statExp";
export type EvGaugeColour = "blue" | "green" | "yellow" | "red" | "grey";

export interface EvGaugeState {
    /** The ten pills' fills, 0 to 1 each. */
    pills: number[];
    /** The bar's fill after the pills, 0 to 1. */
    bar: number;
    colour: EvGaugeColour;
}

const LIMITS = {
    ev: { pill: 10, max: 255, maxed: 252 },
    statExp: { pill: 2_560, max: 65_535, maxed: 63_002 },
} as const;

/** Gens 3-5: the total EVs at which the gauges turn yellow, then red, then grey. */
export const EV_TOTAL_WARN = 400;
export const EV_TOTAL_DANGER = 490;
export const EV_TOTAL_MAX = 510;

const clamp01 = (x: number) => (x > 1 ? 1 : x > 0 ? x : 0);

/**
 * One tile's gauge. `value` is the stat's EVs (or stat experience); `total` is the Pokémon's six EVs added up (gens
 * 3-5 only: gens 1-2 have no total limit, so pass nothing).
 */
export function evGaugeState(value: unknown, kind: EvGaugeKind, total?: number): EvGaugeState {
    const { pill, max, maxed } = LIMITS[kind];
    const v = typeof value === "number" && Number.isFinite(value) ? value : 0;
    const pillsEnd = pill * 10;
    const pills = Array.from({ length: 10 }, (_, k) => clamp01((v - pill * k) / pill));
    const bar = clamp01((v - pillsEnd) / (max - pillsEnd));
    let colour: EvGaugeColour = "blue";
    const t = kind == "ev" && typeof total === "number" && Number.isFinite(total) ? total : 0;
    if (t >= EV_TOTAL_MAX) colour = "grey";
    else if (v >= maxed) colour = "green";
    else if (t >= EV_TOTAL_DANGER) colour = "red";
    else if (t >= EV_TOTAL_WARN) colour = "yellow";
    return { pills, bar, colour };
}

/** The six EVs added up, from whatever the generation reads them as (missing values count as 0). */
export function evTotal(values: readonly unknown[]): number {
    let sum = 0;
    for (const v of values) if (typeof v === "number" && Number.isFinite(v)) sum += v;
    return sum;
}
