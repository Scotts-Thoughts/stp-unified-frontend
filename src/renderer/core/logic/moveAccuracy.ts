/**
 * The ordinary accuracy check of gens 3-5, as the overlays show it: the move's accuracy after
 * the user's accuracy stage, the target's evasion stage and the abilities, items and field
 * effects that scale it. One-hit KO moves have their own rules (`ohkoAccuracy.ts`), and the
 * "always hits" cases (No Guard, Thunder in rain, Blizzard in hail, Lock-On) stay in the
 * overlays, which show a dash for them.
 *
 * The games add the two stages into one index and look up one ratio -- they do not multiply
 * an accuracy ratio by an evasion ratio, which gives other numbers (+2 accuracy against -1
 * evasion is 2x, not 20/9x) and no clamp:
 *
 * - Gen 3 (pokeemerald/pokefirered `Cmd_accuracycheck`): `buff = acc + 6 - eva`, or just
 *   `acc` when the target is under Foresight; clamped to 0..12; `sAccuracyStageRatios`.
 *   Then Compound Eyes x130/100, the target's Sand Veil in a sandstorm x80/100, Hustle on a
 *   physical-type move x80/100, the target's BrightPowder (10) / Lax Incense (5)
 *   x(100 - param)/100. Thunder starts at 50 in sun.
 * - Gen 4 (pokeplatinum `BattleControllerPlayer_CheckMoveHitAccuracy`): Simple doubles a
 *   stage, Unaware zeroes the other side's, Foresight and Miracle Eye ignore a *raised*
 *   evasion; the sum is clamped to -6..6 (`HitRateByStage`, the same table). Then Compound
 *   Eyes x130/100, Sand Veil (sand) / Snow Cloak (hail) x80/100, fog x6/10, Hustle (physical)
 *   x80/100, Tangled Feet while confused x50/100, the target's BrightPowder / Lax Incense
 *   x90/100, Wide Lens x110/100, Zoom Lens x120/100 if the target already moved, Micle Berry
 *   x120/100, Gravity x10/6. Abilities of the target are ignored under Mold Breaker.
 * - Gen 5 has no decompilation here. It keeps gen 4's stage rule and modifier list and
 *   chains the modifiers in 4096ths (Compound Eyes 5325, Sand Veil/Snow Cloak/Hustle 3277,
 *   BrightPowder/Lax Incense 3686, Wide Lens 4505, Zoom Lens 4915, Victory Star 4506), the
 *   values the gen5 overlay already used. Fog does not exist in gen 5.
 *
 * Every step floors, as the games' integer arithmetic does; the result is capped at 100.
 */

/** Gens 1-3 decide physical or special by the move's type (pokeemerald `IS_TYPE_PHYSICAL`: below Mystery). */
const GEN3_PHYSICAL_TYPES = new Set(["normal", "fighting", "flying", "poison", "ground", "rock", "bug", "ghost", "steel"]);
export function gen3IsPhysicalType(type: string | null | undefined): boolean {
    return GEN3_PHYSICAL_TYPES.has(norm(type));
}

const STAGE_RATIO: readonly [number, number][] = [
    [33, 100], [36, 100], [43, 100], [50, 100], [60, 100], [75, 100], [1, 1],
    [133, 100], [166, 100], [2, 1], [233, 100], [133, 50], [3, 1],
];

function norm(value: unknown): string {
    return typeof value === "string" ? value.toLowerCase().replace(/[^a-z]/g, "") : "";
}

function toNumber(value: unknown): number {
    const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
    return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

export interface AccuracyInput {
    /** The move's listed accuracy (a string such as "70" is accepted). */
    accuracy: unknown;
    /** The user's accuracy stage and the target's evasion stage, -6..6. */
    accuracyStage?: unknown;
    evasionStage?: unknown;
    /** Physical or special (gen3: from the move's type). */
    physical?: boolean;
    /** The move is Thunder (50 in sun). */
    thunder?: boolean;
    userAbility?: string | null;
    targetAbility?: string | null;
    userItem?: string | null;
    targetItem?: string | null;
    /** "Rain", "Sun", "Sandstorm", "Hail" (gen3/gen4 "Fog" too), as the mappers spell them. */
    weather?: string | null;
    weatherSuppressed?: boolean;
    /** Foresight / Odor Sleuth on the target (gen4+: or Miracle Eye). */
    targetIdentified?: boolean;
    targetConfused?: boolean;
    /** The target has already moved this turn (Zoom Lens). */
    targetMovedFirst?: boolean;
    micleBerry?: boolean;
    gravity?: boolean;
    fog?: boolean;
}

/** The stage index 0..12 the game looks up. */
export function accuracyStageIndex(gen: 3 | 4 | 5, input: AccuracyInput): number {
    const acc = Math.trunc(toNumber(input.accuracyStage));
    const eva = Math.trunc(toNumber(input.evasionStage));
    if (gen === 3) {
        const buff = input.targetIdentified ? acc + 6 : acc + 6 - eva;
        return Math.max(0, Math.min(12, buff));
    }
    const user = norm(input.userAbility);
    const moldBreaker = user === "moldbreaker" || (gen === 5 && (user === "teravolt" || user === "turboblaze"));
    const target = moldBreaker ? "" : norm(input.targetAbility);
    let accStages = acc;
    let evaStages = -eva;
    // Gen5 doubles a Simple battler's stage changes as they are applied, so only gen4 doubles here.
    if (user === "simple" && gen === 4) accStages *= 2;
    if (target === "simple" && gen === 4) evaStages *= 2;
    if (target === "unaware") accStages = 0;
    if (user === "unaware") evaStages = 0;
    if (input.targetIdentified && evaStages < 0) evaStages = 0;
    return Math.max(0, Math.min(12, 6 + accStages + evaStages));
}

/** The shown hit chance, 0..100. `null` when the accuracy is not a number (a "-" move). */
export function moveAccuracy(gen: 3 | 4 | 5, input: AccuracyInput): number | null {
    let accuracy = toNumber(input.accuracy);
    if (typeof input.accuracy === "string" ? !/^\s*\d/.test(input.accuracy) : typeof input.accuracy !== "number") return null;
    const user = norm(input.userAbility);
    const moldBreaker = gen >= 4 && (user === "moldbreaker" || (gen === 5 && (user === "teravolt" || user === "turboblaze")));
    const target = moldBreaker ? "" : norm(input.targetAbility);
    const userItem = norm(input.userItem);
    const targetItem = norm(input.targetItem);
    const weather = input.weatherSuppressed ? "" : norm(input.weather);
    if (input.thunder && weather === "sun") accuracy = 50;

    const [num, den] = STAGE_RATIO[accuracyStageIndex(gen, input)];
    let hit = Math.floor((accuracy * num) / den);

    if (gen === 3) {
        if (user === "compoundeyes") hit = Math.floor((hit * 130) / 100);
        if (target === "sandveil" && weather === "sandstorm") hit = Math.floor((hit * 80) / 100);
        if (user === "hustle" && input.physical) hit = Math.floor((hit * 80) / 100);
        if (targetItem === "brightpowder") hit = Math.floor((hit * 90) / 100);
        if (targetItem === "laxincense") hit = Math.floor((hit * 95) / 100);
        return Math.min(100, hit);
    }
    if (gen === 4) {
        if (user === "compoundeyes") hit = Math.floor((hit * 130) / 100);
        if ((target === "sandveil" && weather === "sandstorm") || (target === "snowcloak" && weather === "hail")) hit = Math.floor((hit * 80) / 100);
        if (input.fog && !input.weatherSuppressed) hit = Math.floor((hit * 6) / 10);
        if (user === "hustle" && input.physical) hit = Math.floor((hit * 80) / 100);
        if (target === "tangledfeet" && input.targetConfused) hit = Math.floor((hit * 50) / 100);
        if (targetItem === "brightpowder" || targetItem === "laxincense") hit = Math.floor((hit * 90) / 100);
        if (userItem === "widelens") hit = Math.floor((hit * 110) / 100);
        if (userItem === "zoomlens" && input.targetMovedFirst) hit = Math.floor((hit * 120) / 100);
        if (input.micleBerry) hit = Math.floor((hit * 120) / 100);
        if (input.gravity) hit = Math.floor((hit * 10) / 6);
        return Math.min(100, hit);
    }
    // gen 5: the modifiers chained in 4096ths, applied once
    let chain = 4096;
    const mul = (m: number) => { chain = Math.round((chain * m) / 4096); };
    if (user === "compoundeyes") mul(5325);
    if (user === "victorystar") mul(4506);
    if ((target === "sandveil" && weather === "sandstorm") || (target === "snowcloak" && weather === "hail")) mul(3277);
    if (user === "hustle" && input.physical) mul(3277);
    if (target === "tangledfeet" && input.targetConfused) mul(2048);
    if (targetItem === "brightpowder" || targetItem === "laxincense") mul(3686);
    if (userItem === "widelens") mul(4505);
    if (userItem === "zoomlens" && input.targetMovedFirst) mul(4915);
    if (input.micleBerry) mul(4915);
    hit = Math.floor((hit * chain) / 4096);
    if (input.gravity) hit = Math.floor((hit * 5) / 3);
    return Math.min(100, hit);
}
