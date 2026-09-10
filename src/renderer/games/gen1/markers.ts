/**
 * The OBS chapter-marker names gen1 writes (plan 1.9).
 *
 * Every generation hand-rolls the same obs-websocket v5 call but names its chapters
 * differently -- gen2 alone has fifteen kinds (`Item - X`, `New Move - X`, ...). The
 * client is shared (`core/logic/obs.ts`); the names are data, and become
 * `GameModule.hooks`'s marker table in plan 1.4.
 *
 * gen1 writes exactly four: the two battle transitions, plus RESET and BLACKOUT from
 * `left_panel/faults.vue`. The strings are byte-for-byte what the overlay sends today --
 * the harness's marker oracle compares them -- so the spacing around the dash matters.
 */
export const gen1ChapterMarkers = {
    /** A trainer battle starting, from Overworld. */
    battleIn: (trainerClass: string) => "IN - " + trainerClass,
    /** Returning to the overworld after that battle. */
    battleOut: (trainerClass: string) => "OUT - " + trainerClass,
    /** The player reset the game. */
    reset: () => "RESET",
    /** The player blacked out and the run counts it. */
    blackout: () => "BLACKOUT",
};
