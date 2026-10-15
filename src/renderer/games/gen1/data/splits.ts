/**
 * gen1's split data, in one place (plan 1.2).
 *
 * The autosplitter *engine* (`autosplitter/autosplitter_functions.js`, later
 * `core/autosplitter`) is generation-agnostic; the trainer lists, the CSV name tables
 * and the column-property list are not. This module is what `GameModule.data.splits`
 * will resolve to in plan 1.4, so that the engine stops importing gen1 paths directly.
 *
 * The two tables are gen1's `data/autosplitter.js` and `autosplitter/split_trainers.js`
 * with a type annotation and a header added. The full and deprecated CSVs, and with them
 * `data/deprecated_autosplitter.js` and the autosplitter table's "Properties" list, were
 * removed on 2026-10-14: the autosplitter writes only the simple CSV.
 */
export { autosplitter, type AutosplitterTable, type SplitNames } from "./autosplitter";
export { split_trainers } from "./split_trainers";
