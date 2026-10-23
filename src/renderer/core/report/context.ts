/**
 * What the Report button (ReportButton.vue) asks the shell for. `core/` never imports the
 * shell or a generation, so main.ts registers these once at boot.
 *
 * - `describe`: plain facts for `report.txt` (generation, game, mapper, edition...).
 * - `flush`: writes any settings still waiting in a debounce, so the zip's copy of the
 *   settings folder is the current one.
 */
export interface ReportContext {
    describe: () => Record<string, unknown>;
    flush: () => Promise<unknown>;
}

let context: ReportContext | null = null;

export function setReportContext(value: ReportContext): void {
    context = value;
}

export function describeForReport(): Record<string, unknown> {
    try {
        return context?.describe() ?? {};
    } catch (error) {
        return { context_error: error instanceof Error ? error.message : String(error) };
    }
}

export async function flushForReport(): Promise<void> {
    try {
        await context?.flush();
    } catch {
        // A settings file that will not write is no reason to lose the report.
    }
}
