/**
 * The moves gen1's movepool crosses out under the "Unobtainable Moves" setting (decision 15d,
 * docs/ui-uniformity-plan.md §6.1). Every gen1 TM a solo run needs can be had, so the only entry is
 * the move Scott's run rules ban, crossed out wherever it is learned. Same shape as gens 2-5's lists.
 */
export const unobtainable_moves: { Banned: string[] } = {
    Banned: ["Double Team"],
};
