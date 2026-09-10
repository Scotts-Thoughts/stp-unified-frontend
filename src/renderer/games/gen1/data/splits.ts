/**
 * gen1's split data, in one place (plan 1.2).
 *
 * The autosplitter *engine* (`autosplitter/autosplitter_functions.js`, later
 * `core/autosplitter`) is generation-agnostic; the trainer lists, the CSV name tables
 * and the column-property list are not. This module is what `GameModule.data.splits`
 * will resolve to in plan 1.4, so that the engine stops importing gen1 paths directly.
 *
 * Nothing here was edited in the move: the three tables are byte-for-byte gen1's
 * `data/autosplitter.js`, `data/deprecated_autosplitter.js` and
 * `autosplitter/split_trainers.js` with only a type annotation and a header added.
 */
export { autosplitter, type AutosplitterTable, type SplitColumn, type SplitNames } from "./autosplitter";
export { deprecated_autosplitter } from "./deprecated_autosplitter";
export { split_trainers } from "./split_trainers";
