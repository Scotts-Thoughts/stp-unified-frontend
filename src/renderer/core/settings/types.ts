/**
 * The settings panel as data (docs/ui-uniformity-plan.md stage 3/4, audit A1/A2).
 *
 * Each generation describes its panel once, as four columns of groups of controls, in
 * `games/genN/settingsPanel.ts`. The same description renders the panel (`SettingsPanel.vue`)
 * and produces the controls' shortcut actions (`toActions.ts`), so a control can't be added
 * to one and forgotten in the other, and its label is the same in both.
 *
 * Every `get`/`set`/`run` closes over the generation's own state (the overlay instance for
 * gens 2-5, the stores for gen1) and does exactly what the old control did: it assigns the
 * same field or calls the same method, so watchers and saving behave as they always did.
 */
import type { Component } from "vue";

/**
 * When a control shows. "always": every session needs it. "advanced": only with Show Advanced
 * Settings ticked. "dev": development builds only. Shortcuts work whatever the tier: it
 * decides what the panel shows, not what a key can do.
 */
export type Tier = "always" | "advanced" | "dev";

export interface ControlBase {
    /**
     * The control's id. For controls with shortcut actions this is the action id (or the id
     * base for choice/cycle/counter), and it is **persisted** in user_state.json: never
     * change one.
     */
    id: string;
    /**
     * What the panel shows (written in Title Case; nothing capitalises it for you). A function for a
     * label that changes ("Ability (Turtwig Has 1)"); give such a control an `actionLabel`.
     */
    label?: string | (() => string);
    /** The label in the Keyboard Shortcuts window, when it should differ from `label`. */
    actionLabel?: string;
    tier?: Tier;
    /** False hides the control and greys its shortcut: "does nothing in this game / for this species". */
    available?: () => boolean;
    /** Extra condition for the panel only (e.g. a field shown only while a mode is on). */
    visible?: () => boolean;
    /** No shortcut action for this control (text fields, sliders, ROM-writing tools...). */
    noAction?: boolean;
    /** Extra classes on the control element, e.g. a class a tool or test finds it by. */
    class?: string;
    /** A one-line tooltip. */
    title?: string;
}

export interface ToggleControl extends ControlBase {
    kind: "toggle";
    get: () => unknown;
    set: (value: boolean) => void;
}

export interface ButtonControl extends ControlBase {
    kind: "button";
    run: () => unknown;
    /** "primary": the session's main action (New Run). "danger": can't be undone. */
    variant?: "primary" | "danger";
    /** Ask for a second click before running ("Click again to ..."). */
    confirmLabel?: string;
    /** Label shown instead of `label` while this returns a string (e.g. "Exit Style Mode"). */
    dynamicLabel?: () => string | undefined;
}

export interface ChoiceOption {
    value: unknown;
    /** What the dropdown shows; defaults to the value. The value is what's saved. */
    label?: string;
    /** The id part this option's shortcut uses; defaults to slug(label ?? value). Pin it when relabelling. */
    slug?: string;
}

export interface ChoiceControl extends ControlBase {
    kind: "choice";
    options: readonly (ChoiceOption | string)[] | (() => readonly (ChoiceOption | string)[]);
    get: () => unknown;
    set: (value: any) => void;
    /**
     * "choice" (default): one shortcut per option plus next/previous. "cycle": next/previous only,
     * for a list fed by data.
     */
    actions?: "choice" | "cycle";
    placeholder?: string;
}

export interface CounterControl extends ControlBase {
    kind: "counter";
    get: () => unknown;
    increment: () => unknown;
    decrement: () => unknown;
    /** Shortcut label stem: "Attempt Number" gives "Attempt Number +" / "Attempt Number -". */
}

export interface SliderControl extends ControlBase {
    kind: "slider";
    get: () => number;
    set: (value: number) => void;
    min: number;
    max: number;
    step?: number;
}

export interface TextControl extends ControlBase {
    kind: "text";
    get: () => unknown;
    set: (value: string) => void;
    placeholder?: string;
    /** A small button after the field, e.g. "Clear". */
    button?: { label: string; run: () => unknown; id?: string; actionLabel?: string };
}

export interface ReadoutControl extends ControlBase {
    kind: "readout";
    value: () => unknown;
}

/** Pairs of label/value, two per row (e.g. the six EVs with their benefit). */
export interface StatGridControl extends ControlBase {
    kind: "statGrid";
    items: () => { label: string; value: unknown; extra?: unknown }[];
}

/**
 * A shared or per-generation component. The shared ones are named by string ("species-picker",
 * "edition-picker"), so a generation's settingsPanel.ts imports no .vue file and stays loadable by
 * the tsx tools (tools/parity/action-ids.ts).
 */
export interface ComponentControl extends ControlBase {
    kind: "component";
    component: Component | "species-picker" | "edition-picker";
    props?: () => Record<string, unknown>;
    on?: Record<string, (...args: any[]) => unknown>;
}

/**
 * Markup the generation's own template supplies through a named slot of `<settings-panel>`.
 * For the few pieces that are genuinely per-generation (gen2's DV editor, the IV block the
 * harness drives by class). The slot is compiled in the overlay's scope but rendered by the
 * panel, so it re-renders with the panel, not with the whole overlay.
 */
export interface SlotControl extends ControlBase {
    kind: "slot";
    slot: string;
}

/** A control that renders nothing but contributes shortcut actions (e.g. a nature grid's raise/lower keys). */
export interface ActionsOnlyControl extends ControlBase {
    kind: "actions";
    actions: () => import("../shortcuts/types").ShortcutAction[];
}

export type SettingControl =
    | ToggleControl
    | ButtonControl
    | ChoiceControl
    | CounterControl
    | SliderControl
    | TextControl
    | ReadoutControl
    | StatGridControl
    | ComponentControl
    | SlotControl
    | ActionsOnlyControl;

export interface SettingsGroup {
    /** Shown as the group's heading and used as the shortcut group name. */
    title: string;
    /** Heading in the panel when it should differ from `title` ("" for none). */
    heading?: string;
    tier?: Tier;
    available?: () => boolean;
    visible?: () => boolean;
    controls: SettingControl[];
    /** Lay the controls out as a compact list of toggles/counters rather than one per row. */
    compact?: boolean;
}

export interface SettingsColumn {
    /** The class(es) the generation's old column element had, kept on the new one. */
    class?: string;
    groups: SettingsGroup[];
}

/** Run · Solo Pokémon · Style · Display (Scott's decision, plan §6 item 1). */
export interface SettingsPanelSpec {
    columns: [SettingsColumn, SettingsColumn, SettingsColumn, SettingsColumn];
    /** Whether "advanced" controls show (the generation's Show Advanced Settings field). */
    showAdvanced: () => boolean;
    /** Whether "dev" controls show (not a packaged build). */
    isDev: () => boolean;
    /** The overlay's UI colour, for the "tinted" panel style. */
    tint?: () => string | undefined;
}
