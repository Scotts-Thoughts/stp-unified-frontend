import type { SplitComparison } from "../../../main/splitComparison";

/**
 * The "load a replay / split file to compare" button, every generation (2026-09-23).
 *
 * The file dialog and the parsing run in the main process
 * (`src/main/splitComparison.ts`): a `.replay` gives that run's SPLIT bookmarks as the
 * rows, a `.csv` the legacy columns. This returns the comparison, or null when the
 * dialog was cancelled or the file could not be read -- the reason goes to the console,
 * which is where the legacy pickers' failures went too.
 */
export async function pickSplitComparison(): Promise<SplitComparison | null> {
	try {
		const comparison = await window.api.splits.pickComparison();
		if (!comparison) return null;
		console.log(`[splits] comparison loaded from ${comparison.name} (${comparison.source}): ${comparison.rows.length} split(s)`);
		return comparison;
	} catch (err) {
		console.error("[splits] could not load the comparison:", err instanceof Error ? err.message : err);
		return null;
	}
}

/**
 * Rows of a loaded comparison with one row per trainer: a trainer fought again after a reset is in the file twice, and
 * the win is the last one, so the first row keeps its place and takes the last row's time. `keepEveryRow` names the
 * trainers a file can legitimately hold more than once, such as gen4's Rival, which its panel numbers by counting
 * rows. gen5 has its own version of this because of N.
 */
export function latestTimePerTrainer<Row extends { readonly trainer: string; readonly time: unknown }>(
	rows: readonly Row[],
	keepEveryRow: (trainer: string) => boolean = () => false,
): Row[] {
	const result: Row[] = [];
	const indexByTrainer = new Map<string, number>();
	for (const row of rows) {
		if (keepEveryRow(row.trainer)) {
			result.push(row);
			continue;
		}
		const index = indexByTrainer.get(row.trainer);
		if (index === undefined) {
			indexByTrainer.set(row.trainer, result.length);
			result.push(row);
		} else {
			result[index] = { ...result[index], time: row.time };
		}
	}
	return result;
}
