/**
 * Base power of moves whose power the game works out in battle, shared by the overlays.
 *
 * Flail and Reversal scale with the user's HP, through a table of HP fractions:
 *
 * - Gen 2 (pokecrystal `BattleCommand_ConstantDamage` `.reversal`, data/moves/flail_reversal_power.asm):
 *   `x = floor(48 * HP / maxHP)`, where both are first divided by 4 when max HP is over 255
 *   (the routine only divides by one byte); x <= 1/4/9/16/32 gives 200/150/100/80/40, else 20.
 * - Gen 3 (pokeemerald `Cmd_scaledamagebyhealthratio` / `GetScaledHPFraction`): the same table on
 *   `floor(48 * HP / maxHP)`, at least 1 while HP is above 0.
 * - Gen 4 (pokeplatinum `BtlCmd_CalcFlailPower`, `sHPPixelsToFlailPower`): the pixels of a 64-pixel
 *   HP bar, `floor(64 * HP / maxHP)` and at least 1 (`App_PixelCount`); x <= 1/5/12/21/42 gives
 *   200/150/100/80/40, else 20.
 * - Gen 5 has no decompilation here; it is known to go back to the 48ths of gen 3.
 */

function toNumber(value: unknown): number | null {
    const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
}

const TIERS_48: readonly [number, number][] = [[1, 200], [4, 150], [9, 100], [16, 80], [32, 40], [48, 20]];
const TIERS_64: readonly [number, number][] = [[1, 200], [5, 150], [12, 100], [21, 80], [42, 40], [64, 20]];

/** Flail / Reversal base power, or `null` when either HP value is unreadable or max HP is 0. */
export function flailReversalPower(gen: 2 | 3 | 4 | 5, hp: unknown, maxHp: unknown): number | null {
    let cur = toNumber(hp);
    let max = toNumber(maxHp);
    if (cur === null || max === null || max <= 0) return null;
    cur = Math.max(0, Math.min(cur, max));
    let x: number;
    if (gen === 2) {
        if (max > 255) {
            x = Math.floor(Math.floor((cur * 48) / 4) / Math.floor(max / 4));
        } else {
            x = Math.floor((cur * 48) / max);
        }
    } else {
        const scale = gen === 4 ? 64 : 48;
        x = Math.floor((cur * scale) / max);
        if (x === 0 && cur > 0) x = 1;
    }
    const tiers = gen === 4 ? TIERS_64 : TIERS_48;
    for (const [limit, power] of tiers) {
        if (x <= limit) return power;
    }
    return 20;
}

/**
 * Gyro Ball (gen4 pokeplatinum `BtlCmd_CalcGyroBallPower`; gen5 the same, from knowledge):
 * `1 + floor(25 * targetSpeed / userSpeed)`, at most 150. Both Speeds are the turn-order Speeds
 * (`monSpeedValues`, see `battleSpeed.ts`), not the raw stats.
 */
export function gyroBallPower(userSpeed: unknown, targetSpeed: unknown): number | null {
    const user = toNumber(userSpeed);
    const target = toNumber(targetSpeed);
    if (user === null || target === null || user <= 0) return null;
    return Math.min(150, 1 + Math.floor((25 * target) / user));
}

/**
 * Wring Out / Crush Grip, from the target's HP. Gen4 (pokeplatinum `BtlCmd_CalcWringOutPower`):
 * `1 + floor(120 * HP / maxHP)`. Gen5 (no decompilation; from knowledge): `floor(120 * HP / maxHP)`,
 * at least 1.
 */
export function wringOutPower(gen: 4 | 5, targetHp: unknown, targetMaxHp: unknown): number | null {
    const hp = toNumber(targetHp);
    const max = toNumber(targetMaxHp);
    if (hp === null || max === null || max <= 0) return null;
    const scaled = Math.floor((120 * Math.max(0, Math.min(hp, max))) / max);
    return gen === 4 ? 1 + scaled : Math.max(1, scaled);
}

/**
 * Trump Card (pokeplatinum `BtlCmd_CalcTrumpCardPower`, gen5 the same): the PP left *after* this
 * use has been paid (one PP, two against Pressure) picks 200 / 80 / 60 / 50 / 40.
 */
export function trumpCardPower(ppAfterUse: unknown): number | null {
    const pp = toNumber(ppAfterUse);
    if (pp === null) return null;
    return [200, 80, 60, 50, 40][Math.max(0, Math.min(4, Math.trunc(pp)))];
}

/** Sum of the target's raised stat stages (stages given as -6..6 or as the game's 0..12 with 6 neutral). */
function positiveStages(stages: readonly unknown[], neutral: 0 | 6): number {
    let sum = 0;
    for (const s of stages) {
        const n = toNumber(s);
        if (n !== null && n > neutral) sum += n - neutral;
    }
    return sum;
}

/**
 * Punishment (pokeplatinum `BtlCmd_CalcPunishmentPower`, gen5 the same): 60 + 20 for each stage the
 * target has raised (all seven stats), at most 200.
 */
export function punishmentPower(targetStages: readonly unknown[], neutral: 0 | 6 = 0): number {
    return Math.min(200, 60 + 20 * positiveStages(targetStages, neutral));
}

/** Stored Power (gen5, from knowledge): 20 + 20 for each stage the user has raised. */
export function storedPowerPower(userStages: readonly unknown[], neutral: 0 | 6 = 0): number {
    return 20 + 20 * positiveStages(userStages, neutral);
}

/**
 * Electro Ball (gen5, from knowledge): from `floor(userSpeed / targetSpeed)`: 4+ gives 150, 3 gives 120,
 * 2 gives 80, 1 gives 60, 0 gives 40. Turn-order Speeds, as for Gyro Ball.
 */
export function electroBallPower(userSpeed: unknown, targetSpeed: unknown): number | null {
    const user = toNumber(userSpeed);
    const target = toNumber(targetSpeed);
    if (user === null || target === null) return null;
    if (target <= 0) return 150;
    const ratio = Math.floor(user / target);
    return ratio >= 4 ? 150 : ratio === 3 ? 120 : ratio === 2 ? 80 : ratio === 1 ? 60 : 40;
}

/**
 * Heavy Slam / Heat Crash (gen5, from knowledge): from `floor(userWeight / targetWeight)`: 5+ gives
 * 120, 4 gives 100, 3 gives 80, 2 gives 60, less gives 40. Any weight unit, as long as both match
 * (the dex weights in kg are fine: the tiny tolerance keeps 0.3 / 0.1 at 3).
 */
export function heavySlamPower(userWeight: unknown, targetWeight: unknown): number | null {
    const user = toNumber(userWeight);
    const target = toNumber(targetWeight);
    if (user === null || target === null || target <= 0) return null;
    const ratio = Math.floor(user / target + 1e-9);
    return ratio >= 5 ? 120 : ratio === 4 ? 100 : ratio === 3 ? 80 : ratio === 2 ? 60 : 40;
}
