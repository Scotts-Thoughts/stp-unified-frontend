import type { StyleValue } from "vue";

/**
 * What `SplitsPanel.vue` draws: one plain object per generation, built by one computed in that
 * generation (gen1's `components/right_panel.vue`, gens 2-5's `splitsView` in
 * `games/genN/Overlay.vue`). The rows (which trainers, in what order, their names, icons and
 * times) are each generation's own; the look is the component's, the same in all five
 * (docs/ui-uniformity-plan.md decision 29), so it re-renders only when the view changes.
 *
 * Cell values are shown the way the old templates interpolated them (`{{ value }}`), so
 * `undefined` still prints nothing.
 */

/** A generation's classes on a splits table (each `style.css` places and sizes the table and its icons). */
export interface SplitsTable {
    /** `splits_table`, `splits_table_old` or `second_screen_splits_table`. */
    class: string;
    /** The table has a trainer-icon column first: the class on its cell (gens 1-2: `scaled_icon`) and on its image. */
    icon?: { cellClass?: string; imgClass?: string };
    /** Class on every header cell (gen4: `movepool_header`). */
    headClass?: string;
}

export interface SplitsRow {
    /** The icon's `src`, when the table has an icon column. */
    icon?: string;
    /** The name, then the time columns. */
    cells: unknown[];
    /** Extra inline style on the last cell: the difference's colour (`splitDiffColor`). */
    diffStyle?: string;
}

/** A summary row: a metric (its label split into lines) or a section heading. */
export type SplitsSummaryRow = { label: string[]; value: unknown } | { section: string };

/** The battle summary (Followup + Summary; only gens 1-2 record the battle statistics it shows). */
export interface SplitsSummary {
    /** The label's text ("Battle Summary", or "<Trainer> Summary" after a battle). */
    header: string;
    /** The summary's label comes before the splits table (gen1) or between the two tables (gen2). Both are placed by
     * `style.css`, so the order only matters to the element tree. */
    labelFirst: boolean;
    /** The section rows' class (gen1: `background-<type>`) or `background-color` (gen2). */
    sectionClass?: string;
    sectionColor?: string;
    rows: SplitsSummaryRow[];
}

export interface SplitsView {
    /** A title drawn inside the panel (gens 3-4). The other generations draw theirs in the overlay, before the panel. */
    title?: { class: string; text: string };
    table: SplitsTable;
    /** Header cell texts, one per column (the icon column's is "Split"). */
    head: unknown[];
    /** The header rows' `background-color` (the starter's second type). */
    headerColor: string;
    rows: SplitsRow[];
    /** The battle summary, in Followup + Summary. */
    summary?: SplitsSummary;
    /** The panel art after the tables. */
    art: { class: string; style: StyleValue };
}

/** The difference cell's colour: black for none, red behind, green ahead. */
export function splitDiffColor(difference: string): string | undefined {
    if (difference === "-") return "color: black";
    if (difference === "+0:00") return "color: black";
    if (difference.charAt(0) == "+") return "color: red";
    if (difference.charAt(0) == "-") return "color: green";
    return undefined;
}

/** The head row for each mode, with the comparison's column labels. */
export function splitsHead(mode: "First" | "Followup" | "Followup + Summary", previous: unknown, current: unknown): unknown[] {
    if (mode === "First") return ["Split", "", "", "", "Time"];
    if (mode === "Followup") return ["Split", "", previous, current, "Diff"];
    return ["Split", previous, current, "Diff"];
}
