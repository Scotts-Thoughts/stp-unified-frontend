/**
 * The speed label on the enemy team panel ("Outsped", "Speed-tie", "Outspeeds") and the colour
 * of the speed picture behind each slot, in all five generations (D2 of
 * docs/ui-audit/D-onstream-right-battle.md). What decides who is faster stays in each
 * generation (gens 1-3 compare the two Speeds, gens 4-5 use `gen45TurnOrder` in battleSpeed.ts);
 * this file only turns that answer into words and a colour class.
 */

/** Who moves first: 1 the player, 0 a Speed tie, -1 the enemy (the same sign as `gen45TurnOrder`). */
export type SpeedOrder = -1 | 0 | 1;

/**
 * Whose side the label is told from:
 * - "enemy" (gens 1, 2, 3 and 5): the enemy is "Outsped" by a faster player, "Outspeeds" a slower one;
 * - "player" (gen4): the player's Pokémon "Outspeeds" a slower enemy, "Underspeeds" a faster one.
 */
export type SpeedWording = "enemy" | "player";

const WORDS: Record<SpeedWording, Record<SpeedOrder, string>> = {
    enemy: { 1: "Outsped", 0: "Speed-tie", [-1]: "Outspeeds" },
    player: { 1: "Outspeeds", 0: "Speed-Tied", [-1]: "Underspeeds" },
};

/** The order from two Speeds: the higher moves first. Anything that is neither higher nor equal (NaN, a missing value) counts as the enemy first. */
export function speedOrder(playerSpeed: unknown, enemySpeed: unknown): SpeedOrder {
    // Loose comparison on purpose: the overlays compare mapper values that may be strings or null.
    if ((playerSpeed as number) > (enemySpeed as number)) return 1;
    if (playerSpeed == enemySpeed) return 0;
    return -1;
}

/** The label for an order (any number: its sign counts). */
export function speedLabel(order: number, wording: SpeedWording): string {
    return WORDS[wording][order > 0 ? 1 : order == 0 ? 0 : -1];
}

/** The order a label stands for in a wording, or undefined for any other text. */
export function speedLabelOrder(label: unknown, wording: SpeedWording): SpeedOrder | undefined {
    const words = WORDS[wording];
    if (label === words[1]) return 1;
    if (label === words[0]) return 0;
    if (label === words[-1]) return -1;
    return undefined;
}

/**
 * The speed picture's colour class (each `style.css` colours them): grey for a fainted Pokémon or an unknown
 * order, blue when the player moves first, yellow for a tie, red when the enemy does.
 */
export function speedColorClass(order: SpeedOrder | undefined, fainted: boolean): "grey-svg" | "blue-svg" | "yellow-svg" | "red-svg" {
    if (fainted || order === undefined) return "grey-svg";
    if (order === 1) return "blue-svg";
    if (order === 0) return "yellow-svg";
    return "red-svg";
}
