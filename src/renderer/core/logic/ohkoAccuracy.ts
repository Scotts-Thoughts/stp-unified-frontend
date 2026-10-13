/**
 * Hit chance of the one-hit KO moves -- Horn Drill, Guillotine, Fissure and (from gen 3)
 * Sheer Cold -- which no generation runs through the ordinary accuracy formula the
 * overlays model. Each rule below is read from the decompilations (2026-10-02):
 *
 * - Gen 1 (pokered `engine/battle/move_effects/one_hit_ko.asm`): the move misses outright
 *   when the user's current in-battle Speed is lower than the target's (a tie hits). If
 *   it passes, `MoveHitTest` runs as for any other move: the listed 30% with accuracy and
 *   evasion stages. Level plays no part.
 * - Gen 2 (pokecrystal `BattleCommand_OHKO`): the move fails when the user's level is
 *   lower than the target's. Otherwise the move's accuracy, on the game's 0-255 scale,
 *   gains 2 per level of difference (capped at 255), and `BattleCommand_CheckHit` then
 *   runs on that value, accuracy and evasion stages included.
 * - Gen 3 (pokeemerald/pokefirered `Cmd_tryKO`): the accuracy check is skipped
 *   (`NO_ACC_CALC_CHECK_LOCK_ON`), so stages do not apply. Sturdy blocks the move, and it
 *   fails when the user's level is lower; otherwise `chance = accuracy + level difference`
 *   and it hits when `Random() % 100 + 1 < chance` -- on `chance - 1` of the 100 rolls,
 *   one fewer than gens 4 and 5 (a game quirk, kept).
 * - Gen 4 (pokeplatinum `BtlCmd_TryOHKOMove`): as gen 3, but it hits when
 *   `Random() % 100 < chance` (`chance` of 100), Mold Breaker ignores Sturdy, and No Guard
 *   on either side makes it always hit when the level requirement is met. Gen 5 has no
 *   decompilation here; it keeps gen 4's rule, with Teravolt and Turboblaze also ignoring
 *   Sturdy.
 *
 * Lock-On and Mind Reader are not modelled: no overlay reads them.
 */

const OHKO_MOVES = new Set(["horn drill", "guillotine", "fissure", "sheer cold"]);

/** Whether `move` is a one-hit KO move, in any of the overlays' spellings ("HORN DRILL", "Sheer Cold", "horn_drill"). */
export function isOhkoMove(move: string | null | undefined): boolean {
    if (!move) return false;
    return OHKO_MOVES.has(move.toLowerCase().replace(/[\s_-]+/g, " ").trim());
}

/**
 * What the power column shows for a one-hit KO move: "KO" (Scott's rule, 2026-10-13). gen1's data gives these
 * moves power 1, which is the game's own placeholder (pokered data/moves/moves.asm); gens 2-5's tables say "-".
 * In battle, pass the product of the type chart entries against the target: the move does nothing to a target
 * the chart makes immune in every generation (pokered AdjustDamageForMoveType, pokecrystal BattleCommand_OHKO,
 * pokeemerald BattleScript_EffectOHKO's typecalc), so that shows 0, as any other move's power does.
 */
export function ohkoPowerText(typeMultiplier?: number | null): "KO" | 0 {
    return typeMultiplier === 0 ? 0 : "KO";
}

function sameAbility(ability: string | null | undefined, name: string): boolean {
    return (ability ?? "").toLowerCase().replace(/[\s_-]+/g, "") === name.toLowerCase().replace(/\s+/g, "");
}

/** A mapper value or data-table field as a number; the gen3 tables keep accuracy as a string ("30"). */
function toNumber(value: unknown): number | null {
    const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
}

type Numeric = number | string | null | undefined;

/** Gen 1: the move misses before the accuracy check when the user is slower than the target. */
export function gen1OhkoFails(userSpeed: Numeric, targetSpeed: Numeric): boolean {
    const user = toNumber(userSpeed), target = toNumber(targetSpeed);
    if (user === null || target === null) return false;
    return user < target;
}

/**
 * Gen 2: the accuracy the ordinary stage calculation should start from, as a percentage
 * on the same footing as the move's listed accuracy (30 at equal levels), or 0 when the
 * user is below the target's level. The 2-per-level bonus is on the 0-255 scale, so each
 * level adds 2/255 of 100%. `null` when the accuracy or either level is unreadable.
 */
export function gen2OhkoAccuracy(accuracy: Numeric, userLevel: Numeric, targetLevel: Numeric): number | null {
    const acc = toNumber(accuracy), user = toNumber(userLevel), target = toNumber(targetLevel);
    if (acc === null || user === null || target === null) return null;
    if (user < target) return 0;
    const base = Math.floor((acc * 255) / 100);
    const boosted = Math.min(255, base + 2 * (user - target));
    return acc + ((boosted - base) * 100) / 255;
}

/** Gen 3: the percentage chance to hit, or `null` when the accuracy or either level is unreadable. */
export function gen3OhkoAccuracy(accuracy: Numeric, userLevel: Numeric, targetLevel: Numeric, targetAbility: string | null | undefined): number | null {
    if (sameAbility(targetAbility, "Sturdy")) return 0;
    const acc = toNumber(accuracy), user = toNumber(userLevel), target = toNumber(targetLevel);
    if (acc === null || user === null || target === null) return null;
    if (user < target) return 0;
    return Math.min(100, Math.max(0, acc + (user - target) - 1));
}

const STURDY_IGNORED_BY: Record<4 | 5, readonly string[]> = {
    4: ["Mold Breaker"],
    5: ["Mold Breaker", "Teravolt", "Turboblaze"],
};

/** Gens 4 and 5: the percentage chance to hit, or `null` when the accuracy or either level is unreadable. */
export function gen45OhkoAccuracy(
    gen: 4 | 5,
    accuracy: Numeric,
    userLevel: Numeric,
    targetLevel: Numeric,
    userAbility: string | null | undefined,
    targetAbility: string | null | undefined,
): number | null {
    if (sameAbility(targetAbility, "Sturdy") && !STURDY_IGNORED_BY[gen].some((a) => sameAbility(userAbility, a))) return 0;
    const acc = toNumber(accuracy), user = toNumber(userLevel), target = toNumber(targetLevel);
    if (acc === null || user === null || target === null) return null;
    if (user < target) return 0;
    if (sameAbility(userAbility, "No Guard") || sameAbility(targetAbility, "No Guard")) return 100;
    return Math.min(100, Math.max(0, acc + (user - target)));
}
