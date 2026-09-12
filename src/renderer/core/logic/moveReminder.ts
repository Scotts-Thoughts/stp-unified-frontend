/**
 * Level-1 moves a Pokémon cannot actually start with.
 *
 * A freshly generated Pokémon only keeps the *last* four moves of its level-up
 * learnset at or below its level (gen 3+: `GiveMonInitialMoveset` shifts the oldest
 * move out once the four slots are full). So when a learnset lists five or more
 * level-1 moves, the earlier ones are only obtainable from the Move Reminder --
 * the movepool table marks those `Rem` instead of `1`, the way solodex does.
 *
 * Rows are relabelled in place order: the first `n - 4` level-1 rows become `Rem`,
 * the rest stay `1`. The list is not re-sorted -- the relabelled rows are already
 * the earliest level-1 entries, so they sit ahead of the ones that remain `1`.
 */
export const REMINDER_LEVEL = "Rem";

/** How many moves a Pokémon can hold; only this many level-1 moves are learned on generation. */
const MOVE_SLOTS = 4;

/** Rows are the movepool table's shape: the level (or a label) plus the move data. */
export type LevelRow = { Level?: number | string };

/** Number of level-1 rows that are only obtainable from the Move Reminder. */
export function reminderCount(rows: readonly LevelRow[]): number {
    const levelOne = rows.filter(row => Number(row.Level) === 1).length;
    return Math.max(0, levelOne - MOVE_SLOTS);
}

/**
 * Returns a copy of `rows` with the first `n - 4` level-1 rows relabelled `Rem`
 * (untouched when there are four or fewer). Other rows are passed through.
 */
export function markReminderMoves<T extends LevelRow>(rows: T[]): T[] {
    let remaining = reminderCount(rows);
    if (remaining === 0) return rows;
    return rows.map(row => {
        if (remaining > 0 && Number(row.Level) === 1) {
            remaining--;
            return { ...row, Level: REMINDER_LEVEL };
        }
        return row;
    });
}
