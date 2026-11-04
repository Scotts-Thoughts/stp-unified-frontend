/**
 * The OBS chapter-marker names gen1 writes (plan 1.9).
 *
 * Every generation hand-rolls the same obs-websocket v5 call but names its chapters
 * differently -- gen2 alone has fifteen kinds (`Item - X`, `New Move - X`, ...). The
 * client is shared (`core/logic/obs.ts`); the names are data, and become
 * `GameModule.hooks`'s marker table in plan 1.4.
 *
 * gen1 wrote exactly four until 2026-10-29: the two battle transitions, plus RESET and
 * BLACKOUT from `left_panel/faults.vue`. The strings are byte-for-byte what the overlay
 * sends -- the harness's marker oracle compares them -- so the spacing around the dash
 * matters. The rest (map, text box, items, level-ups, battle events) are gen2's names,
 * which Cutter reads; they are sent from `markerHooks.ts`. gen2 spells the same strings
 * inline in its `Overlay.vue`. gen1 has no held items, so no `Held Item - ...`, and no
 * `Special - ...` (gen2-scripted).
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
    /** A wild battle starting, from Overworld. There is no OUT for it, as in gen2. */
    wildIn: () => "IN - Wild",
    /** The overworld map changed; `map` is the mapper's map name. */
    mapChange: (map: string) => `Map Change - ${map}`,
    /** A dialogue text box opened (`"true"`) or closed (`"false"`). */
    textBox: (open: string) => `Text Box - ${open}`,
    /** A vitamin, Rare Candy, PP Up, TM or HM03 Surf entered the bag; TMs read `TM27 Fissure`. */
    item: (name: string) => `Item - ${name}`,
    /** The lead or the active battler learned a move. */
    newMove: (name: string) => `New Move - ${name}`,
    /** A Rare Candy was used on the lead in the overworld. */
    rareCandy: () => "Rare Candy Used",
    /** The active battler gained a level in or just after a battle. */
    levelUp: (level: string) => `Level Up - ${level}`,
    battleLevelUp: () => "Battle Level Up",
    turn: () => "Turn",
    nextPokemon: () => "Next Pokemon",
    enemyFainted: () => "Enemy Fainted",
};
