/** What the Report button sends the main process (src/main/report.ts, core/report/). */
export interface ReportPayload {
    title: string;
    description: string;
    /** The picture with the user's drawing on it, as a `data:image/png;base64,` URL; null when nothing was drawn. */
    annotated: string | null;
    /** What the overlay knows: generation, game, mapper, edition and so on. */
    context: Record<string, unknown>;
}
