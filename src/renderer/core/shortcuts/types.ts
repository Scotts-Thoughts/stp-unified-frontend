/**
 * One thing a keyboard shortcut can do (docs/shortcuts-menu-plan.md): every settings
 * control of a generation, and the F-keys it shipped with, as a named action.
 *
 * Each generation lists its own in `games/genN/actions.ts`; core never imports them.
 */
export interface ShortcutAction {
    /**
     * Stable and persisted: `user_state.json` keeps bindings by this id, so renaming one
     * silently drops a user's key. Dotted, lower-case: "stats.set.base_stats".
     */
    id: string;
    /** What the menu shows, worded as the settings UI words the control. */
    label: string;
    /** The settings section the control sits in ("Run", "Display", "Encounters"...). */
    group: string;
    run(): unknown;
    /**
     * False when the control does nothing right now: an FRLG-only box in Emerald, Deoxys'
     * form for anything but Deoxys. A press is then ignored and the menu greys the row out.
     * "Show Advanced Settings" is not a gate: an advanced toggle works while it is hidden.
     */
    available?(): boolean;
    /** The accelerator it ships with ("F13"); everything but the legacy F-keys is unbound by default. */
    defaultShortcut?: string;
}
