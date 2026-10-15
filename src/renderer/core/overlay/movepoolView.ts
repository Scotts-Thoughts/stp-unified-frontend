import type { MovepoolFit } from "../logic/movepoolFit";

/**
 * What `Movepool.vue` draws: one plain object per generation, built by one computed in that
 * generation (gen1's `components/right_panel/move_pool.vue`, gens 2-5's `movepoolView` in
 * `games/genN/Overlay.vue`). Every game rule (Hidden Power's type, Return's power, Curse's
 * "???", backports, forms) is applied there; the component only lays the values out, fits the
 * rows to the panel (`core/logic/movepoolFit.ts`) and crosses out the rows its group's set names
 * (`core/logic/unobtainableMoves.ts`), so it re-renders only when the view changes.
 *
 * Cell values are shown the way the old templates interpolated them (`{{ value }}`), so
 * `undefined` still prints nothing and the accuracy cell still appends "%".
 */
export interface MovepoolRow {
    /** "Way" cell: the level, "TM12"/"HM05", "Tutor", "Form". */
    way: unknown;
    move: unknown;
    /** The name looked up in the group's struck set, when it differs from `move`. */
    name?: string;
    /** Type cell text. */
    type: unknown;
    /** Extra class on the type cell (gen1: `background-<type>`). */
    typeClass?: string;
    /** The type cell's `background-color` (gens 2-5: `var(--current_fire)` and so on). */
    typeColor?: string;
    /** Damage-class cell text and colour, read only when the view's `dc` is on. */
    dc?: unknown;
    dcColor?: string;
    power: unknown;
    /** Shown followed by "%". */
    accuracy: unknown;
    pp: unknown;
    /** Adds the `first-row` class (the first level-up row). */
    first?: boolean;
}

export interface MovepoolGroup {
    rows: MovepoolRow[];
    /** Move names crossed out in this group (`StruckMoves.everywhere` or `.machines`). */
    struck: ReadonlySet<string>;
}

export interface MovepoolView {
    title: string;
    /** `movepoolLabel`, `movepoolTitle`, `posAbs movepoolLabel`. */
    titleClass: string;
    /** The title before the table (gens 3-5) or after the art (gens 1-2). */
    titleFirst: boolean;
    /** The damage-class column (gens 4-5: the physical/special split is a gen4 change). */
    dc: boolean;
    /** Classes on the header row (gen1: `movepool_header background-<type>`). */
    headerClass?: string;
    /** The header row's `background-color` (gens 2-5). */
    headerColor?: string;
    /** The generation's normal row size and panel height. */
    fit: MovepoolFit;
    /** Row groups in display order (level, form, TM/HM, tutor). */
    groups: MovepoolGroup[];
}
