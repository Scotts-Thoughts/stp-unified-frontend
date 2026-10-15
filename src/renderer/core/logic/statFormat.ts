/**
 * Formatting shared by every generation's stat panels.
 */

/**
 * A stat stage as the stat tiles and the enemy panel show it: "+2", "-1", or `empty` for 0 or a value that
 * can't be read (null before a battle structure exists). gen1 and gen2 pass `" "` for `empty`, which keeps
 * their stage cell one space wide as it always was; gens 3-5 pass nothing.
 */
export function formatStage(value: number | string | null | undefined, empty = ""): string {
    if (value === null || value === undefined || value === "") return empty;
    const n = typeof value === "number" ? value : parseInt(value, 10);
    if (!Number.isFinite(n) || n === 0) return empty;
    return n > 0 ? `+${n}` : `${n}`;
}

/**
 * The stats header's names for the modes every generation shares (decision 21 of docs/ui-uniformity-plan.md): one
 * wording in all five, with each game's own name for individual values and effort (gens 1-2: DVs and Stat
 * Experience; gens 3-5: IVs and EVs).
 */
export function statsHeaderNames(individual: "DVs" | "IVs", effort: "Stat Experience" | "EVs") {
    return { averages: "Base Stat Averages", medians: "Base Stat Medians", individual, effort } as const;
}
