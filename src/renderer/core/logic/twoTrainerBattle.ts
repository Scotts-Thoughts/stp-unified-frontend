/**
 * Battles against two trainers at once (gens 3-5): tag and multi battles such as Mars and Jupiter at Spear Pillar.
 * Each trainer has their own team in memory, drawn one after the other in the enemy panel. A double battle against
 * one trainer (twins, Alf & Fred) is not one of these: that trainer's single team already holds everyone.
 */

/** The enemy panel's rows. Gens 4-5 set no limit on two trainers' combined teams, so the second team is cut to fit. */
export const MAX_ENEMY_ROWS = 6;

/**
 * Two different trainers are being fought. The second id is 0 when there is no second trainer; the games also pass one
 * trainer's id twice for a double battle (pokeplatinum `Encounter_NewVsTrainer`), which builds its team a second time.
 * Emerald's second id stays in memory after the battle, so gen3 must also check the battle's two-opponents flag.
 */
export function isTwoTrainerBattle(firstId: unknown, secondId: unknown): boolean {
    const first = Number(firstId);
    const second = Number(secondId);
    return first > 0 && second > 0 && first !== second;
}

/** How many of the second trainer's Pokémon fit after the first trainer's. */
export function secondTeamRows(firstCount: unknown, secondCount: unknown): number {
    const first = Math.max(0, Number(firstCount) || 0);
    const second = Math.max(0, Number(secondCount) || 0);
    return Math.min(second, Math.max(0, MAX_ENEMY_ROWS - first));
}

const RANKS = /^(Commander|Executive|Leader|Elite Four|Champion|Galactic Boss|Magma Leader|Aqua Leader)\s+/i;

/** The panel's header for two trainers: "Mars and Jupiter", without their ranks, so it fits on one line. */
export function twoTrainerHeader(first: unknown, second: unknown): string {
    const short = (name: unknown) => String(name ?? "").replace(RANKS, "");
    return `${short(first)} and ${short(second)}`;
}

/**
 * The style that keeps a long two-trainer header on one line: past `chars` characters (what fits in the panel's header
 * at its normal size, about 24 in gens 4-5's 420px, 20 in gen3's 338px) its font shrinks from `size` px to fit.
 */
export function twoTrainerHeaderStyle(header: string, size: number, chars: number): string | undefined {
    if (header.length <= chars) return undefined;
    return `font-size: ${Math.floor(size * chars / header.length)}px; white-space: nowrap;`;
}
