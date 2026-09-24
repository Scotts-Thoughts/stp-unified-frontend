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
