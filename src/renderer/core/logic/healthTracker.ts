/**
 * The game-area box's colour for the lead Pokemon's condition (the "HP tracker", gens 2-5).
 *
 * The box behind the game screen (`game_area.svg`, `gamearea.svg` in gen2) is tinted, through its
 * `--overlay-color`, by the first match of:
 *   1. Pokerus: the Pokemon is infected right now. Highest priority, so the player sees it the moment
 *      it is caught.
 *   2. Damaged: below full HP while in the overworld (in battle, damage is expected and not flagged).
 *   3. Status: it has a status condition.
 *   4. Healthy: green, the box's own colour in the SVG.
 *
 * The Pokerus byte is the same in gens 2-5: high nibble the strain, low nibble the days left
 * (pokecrystal `MON_PKRS`, pokeemerald `MON_DATA_POKERUS`, pokeplatinum `MON_DATA_POKERUS`). Days > 0 is an
 * infection; strain set with 0 days is cured. Only an infection counts here: that is when the summary screen
 * shows the "PKRS" label this colour copies (a cured Pokemon gets a smiley from gen3 on, nothing in gen2), and
 * a cured Pokemon would otherwise hold the box purple for the rest of the run. The EV/stat-exp boost itself
 * stays after the cure in every generation.
 */

/** The purple-pink of the summary screen's "PKRS" label. Approximate: not read from a game palette. */
export const POKERUS_COLOR = "rgb(216, 88, 216)";
export const STATUS_COLOR = "rgb(98, 192, 255)";
export const HEALTHY_COLOR = "#39b54a";
/** Gens 4-5's damaged colour; gen2 passes its own lighter one. */
export const DAMAGED_COLOR = "rgb(255, 98, 98)";

/** True while the Pokerus byte holds an infection (days left in the low nibble). */
export function hasActivePokerus(pokerus: unknown): boolean {
    const byte = Number(pokerus);
    return Number.isFinite(byte) && (byte & 0x0f) !== 0;
}

export interface HealthTrackerInput {
    /** The game state; damage only counts in "Overworld". */
    state: unknown;
    hp: unknown;
    maxHp: unknown;
    /** The status condition's name, or null when it has none. */
    status: unknown;
    /** The raw Pokerus byte. */
    pokerus: unknown;
    damagedColor?: string;
}

/** The colour for the box, as the inline style the templates bind (`--overlay-color: ...;`). */
export function healthTrackerStyle(input: HealthTrackerInput): string {
    return `--overlay-color: ${healthTrackerColor(input)};`;
}

export function healthTrackerColor({ state, hp, maxHp, status, pokerus, damagedColor = DAMAGED_COLOR }: HealthTrackerInput): string {
    if (hasActivePokerus(pokerus)) return POKERUS_COLOR;
    // Same test the legacy overlays made: hp / maxHp != 1 (a missing max HP reads as damaged, as it did).
    if (state == "Overworld" && Number(hp) / Number(maxHp) != 1) return damagedColor;
    if (status !== null && status !== undefined) return STATUS_COLOR;
    return HEALTHY_COLOR;
}
