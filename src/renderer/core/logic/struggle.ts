/**
 * When the player's move list shows Struggle instead of the moves (decision 19 of docs/ui-uniformity-plan.md).
 *
 * The game makes a Pokemon use Struggle when none of its moves has PP left (pokered `AnyMoveToSelect`, pokecrystal
 * `CheckPlayerHasUsableMoves`, pokeemerald `AreAllMovesUnusable` / `CheckMoveLimitations`, pokeplatinum
 * `BattleSystem_CheckInvalidMoves` == `STRUGGLING_ALL`). gen1 and gen3 already showed the row on that
 * rule (all PP at 0); gens 2, 4 and 5 use this helper for the same rule. Disabled / Taunted / Tormented moves, which
 * also force Struggle in the game, are not read by the overlay.
 *
 * `pps`: the PP of each move the Pokemon has (empty slots left out), read where the list reads them (the battle copy
 * in battle, the party otherwise). A PP that can't be read (null, empty) never counts as 0.
 */
export function allMovesOutOfPp(pps: readonly unknown[]): boolean {
    return pps.length > 0 && pps.every((pp) => pp !== null && pp !== undefined && pp !== "" && Number(pp) === 0);
}
