/**
 * Which movepool rows are crossed out, in all five generations (audit D5, docs/ui-uniformity-plan.md step
 * 5.1). The "Unobtainable Moves" setting picks when; each generation's lists say what:
 *
 * - `everywhere`: moves Scott's run rules ban (Double Team, Minimize) and the first-run Hidden Power ban.
 *   Crossed out in every row group: level-up, form, TM/HM and tutor.
 * - `machines`: the edition's TMs/HMs and tutor moves a solo run can't get. Crossed out in the TM/HM and
 *   tutor rows only, since the same move learned by level is obtainable.
 *
 * The sets are built once per change of the setting, the run state or the lists (a computed in each
 * generation), and `Movepool.vue` looks each row up in its group's set.
 */

/** The four values of the "Unobtainable Moves" setting, as saved. */
export const UNOBTAINABLE_MOVE_MODES = [
    "Never Cross Out",
    "Cross Out When Starter is Obtained",
    "Cross Out After First Badge",
    "Always Cross Out",
] as const;

/** Whether the setting crosses anything out now. An unknown value crosses nothing out. */
export function crossOutActive(mode: string, state: { starterObtained: boolean; firstBadge: boolean }): boolean {
    switch (mode) {
        case "Cross Out When Starter is Obtained": return state.starterObtained;
        case "Cross Out After First Badge": return state.firstBadge;
        case "Always Cross Out": return true;
        default: return false;
    }
}

export interface StruckMoves {
    /** For level-up and form rows. */
    everywhere: ReadonlySet<string>;
    /** For TM/HM and tutor rows: `everywhere` plus the edition's machine list. */
    machines: ReadonlySet<string>;
}

const NONE: StruckMoves = { everywhere: new Set(), machines: new Set() };

/**
 * The struck move names. A list that is missing (an edition without one, gen2's Gold & Silver) crosses
 * nothing out.
 */
export function struckMoves(
    active: boolean,
    lists: { everywhere?: readonly string[] | null; machines?: readonly string[] | null },
): StruckMoves {
    if (!active) return NONE;
    const everywhere = new Set(lists.everywhere ?? []);
    return { everywhere, machines: new Set([...everywhere, ...(lists.machines ?? [])]) };
}
