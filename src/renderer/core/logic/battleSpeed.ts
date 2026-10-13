/**
 * The Speed the gen4 and gen5 games use for turn order, and who moves first.
 *
 * Read from pokeplatinum `BattleSystem_CompareBattlerSpeed` (src/battle/battle_lib.c), applied
 * in the game's order with its integer rounding:
 *
 *   1. the speed stage (`sStatStageBoosts`, 10/40 .. 40/10), doubled and clamped by Simple in gen4
 *      (gen5 doubles the change when it is applied, so its stored stage already counts it);
 *   2. Swift Swim in rain / Chlorophyll in sun x2 (gen5 adds Sand Rush in a sandstorm),
 *      unless Cloud Nine or Air Lock is on the field;
 *   3. Macho Brace, Iron Ball and the six Power items halve it -- not ignored by Klutz;
 *   4. Choice Scarf x1.5; 5. Quick Powder x2 for Ditto (both ignored by Klutz);
 *   6. Quick Feet x1.5 with any status, otherwise paralysis /4;
 *   7. Slow Start /2 while it lasts; 8. Unburden x2 once its item is gone; 9. Tailwind x2.
 *
 * pokeheartgold's copy is the same. Gen5 has no decompilation: it keeps this order, adds
 * Sand Rush, and chains the multipliers in 4096ths, which can differ by 1 from this.
 *
 * The comparison then follows the same function: Lagging Tail / Full Incense and Stall make
 * a battler move last, and Trick Room makes the slower battler move first. Priority and
 * Quick Claw are per-turn and random, so they are left out.
 */

const STAGE_RATIO: Readonly<Record<number, [number, number]>> = {
    [-6]: [10, 40], [-5]: [10, 35], [-4]: [10, 30], [-3]: [10, 25], [-2]: [10, 20], [-1]: [10, 15],
    [0]: [10, 10], [1]: [15, 10], [2]: [20, 10], [3]: [25, 10], [4]: [30, 10], [5]: [35, 10], [6]: [40, 10],
};

const SPEED_HALVING_ITEMS = new Set([
    "macho brace", "iron ball",
    "power weight", "power bracer", "power belt", "power lens", "power band", "power anklet",
]);
const MOVES_LAST_ITEMS = new Set(["lagging tail", "full incense"]);

/** Lower-case, single-spaced: the overlays' spellings of abilities, items and statuses vary. */
function norm(value: unknown): string {
    return typeof value === "string" ? value.toLowerCase().replace(/[\s_-]+/g, " ").trim() : "";
}

function toNumber(value: unknown): number {
    const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
    return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

export interface TurnOrderSpeedInput {
    /** The battle Speed stat, before stages. */
    speed: unknown;
    /** The speed stage, -6..6 (a string from the mapper is fine). */
    stage?: unknown;
    ability?: string | null;
    /** The held item the battler has *now* (the battle copy, which empties when the item is used up). */
    item?: string | null;
    species?: string | null;
    status?: string | null;
    /** "Rain", "Sun", "Sandstorm", "Hail" as the mappers spell them. */
    weather?: string | null;
    /** Cloud Nine or Air Lock on the field. */
    weatherSuppressed?: boolean;
    /** The game's "can unburden" flag (Platinum `can_unburden`, HG/SS `knock_off_flag`): it held an item when it came in. */
    canUnburden?: boolean;
    /** Tailwind on this battler's side. */
    tailwind?: boolean;
    /** Slow Start still in effect (true when unknown: it lasts the first five turns). */
    slowStartActive?: boolean;
}

/** The Speed `BattleSystem_CompareBattlerSpeed` compares, for a gen4 or gen5 battler. */
export function gen45TurnOrderSpeed(gen: 4 | 5, input: TurnOrderSpeedInput): number {
    const ability = norm(input.ability);
    const item = norm(input.item);
    const status = norm(input.status);
    const weather = norm(input.weather);
    const klutz = ability === "klutz";

    let stage = Math.trunc(toNumber(input.stage));
    // Gen4 doubles the stored stage when it is used; gen5 doubles the change when it is applied, so the
    // stored stage already counts it (no decompilation; from knowledge).
    if (ability === "simple" && gen === 4) stage *= 2;
    stage = Math.max(-6, Math.min(6, stage));
    const [num, den] = STAGE_RATIO[stage];
    let speed = Math.floor((toNumber(input.speed) * num) / den);

    if (!input.weatherSuppressed) {
        if ((ability === "swift swim" && weather === "rain")
            || (ability === "chlorophyll" && weather === "sun")
            || (gen === 5 && ability === "sand rush" && weather === "sandstorm")) {
            speed *= 2;
        }
    }
    if (SPEED_HALVING_ITEMS.has(item)) speed = Math.floor(speed / 2);
    if (!klutz && item === "choice scarf") speed = Math.floor((speed * 15) / 10);
    if (!klutz && item === "quick powder" && norm(input.species) === "ditto") speed *= 2;
    if (ability === "quick feet" && status !== "") speed = Math.floor((speed * 15) / 10);
    else if (status === "paralyzed") speed = Math.floor(speed / 4);
    if (ability === "slow start" && input.slowStartActive !== false) speed = Math.floor(speed / 2);
    if (ability === "unburden" && input.canUnburden && item === "") speed *= 2;
    if (input.tailwind) speed *= 2;
    return speed;
}

export interface TurnOrderSide {
    speed: number;
    ability?: string | null;
    item?: string | null;
}

/**
 * Who moves first between two battlers using moves of the same priority: 1 the player,
 * -1 the enemy, 0 a speed tie (the game breaks it at random). `trickRoom` is the field flag.
 */
export function gen45TurnOrder(player: TurnOrderSide, enemy: TurnOrderSide, trickRoom: boolean): -1 | 0 | 1 {
    const playerLast = MOVES_LAST_ITEMS.has(norm(player.item)) && norm(player.ability) !== "klutz";
    const enemyLast = MOVES_LAST_ITEMS.has(norm(enemy.item)) && norm(enemy.ability) !== "klutz";
    const faster = (a: number, b: number): -1 | 0 | 1 => (a > b ? 1 : a < b ? -1 : 0);
    const slower = (a: number, b: number): -1 | 0 | 1 => (a < b ? 1 : a > b ? -1 : 0);

    if (playerLast && enemyLast) return slower(player.speed, enemy.speed);
    if (playerLast) return -1;
    if (enemyLast) return 1;
    const playerStall = norm(player.ability) === "stall";
    const enemyStall = norm(enemy.ability) === "stall";
    if (playerStall && enemyStall) return slower(player.speed, enemy.speed);
    if (playerStall) return -1;
    if (enemyStall) return 1;
    return trickRoom ? slower(player.speed, enemy.speed) : faster(player.speed, enemy.speed);
}
