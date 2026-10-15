/**
 * What the overlay, the main process and the Keyboard Shortcuts window say to each other
 * (docs/shortcuts-menu-plan.md). Plain data only: these cross IPC.
 *
 * The overlay owns the bindings: it builds the catalog from the active generation's
 * actions, persists every edit in `user_state.json` (`shortcuts`, per generation) and
 * tells main which accelerators to listen for. Main watches every key press through a
 * keyboard hook, relays the catalog to the window (adding which keys it cannot listen
 * for) and relays the window's edits back to the overlay.
 */

/** One row of the menu. */
export interface ShortcutRow {
    id: string;
    label: string;
    group: string;
    /** The accelerator in effect ("Ctrl+Shift+F5"), or null when unbound. */
    binding: string | null;
    /** The accelerator the action ships with, or null when it is unbound by default. */
    defaultBinding: string | null;
    /** False when the control this action stands for does nothing right now (another game, another species). */
    available: boolean;
    /** Bound, but another action earlier in the list already holds the key, so this one is not registered. */
    conflict: boolean;
}

export interface ShortcutCatalog {
    /** "Generation 1", ... -- the window's heading. */
    title: string;
    /** The `user_state.json` section the bindings are stored in (`gen1`...). */
    namespace: string;
    /** False on the box-art screen: no game is loaded, and the rows are gen1's (which work there). */
    gameLoaded: boolean;
    rows: ShortcutRow[];
    /** Filled in by main: bound accelerators it cannot listen for (the keyboard hook would not start). */
    failed?: string[];
}

export type ShortcutEdit =
    /** Bind `accelerator` to `id`. With `steal`, an action already on that key is unbound first. */
    | { type: "set"; id: string; accelerator: string; steal?: boolean }
    /** Unbind `id`. */
    | { type: "clear"; id: string }
    /** Put `id` back on its default key (unbinding whatever else holds that key). */
    | { type: "reset"; id: string }
    /** Every action back on its default. */
    | { type: "reset-all" };
