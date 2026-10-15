import type { ShortcutAction } from "./types";

/**
 * Helpers that turn a settings control into shortcut actions (docs/shortcuts-menu-plan.md
 * §3), so each generation's `actions.ts` reads as a list of its controls:
 *
 *   press   a button                   -> one action
 *   toggle  a checkbox                 -> "Toggle: <label>"
 *   choice  a dropdown, short list     -> "<label>: <option>" per option, plus next and previous
 *   cycle   a dropdown fed by data     -> next and previous only
 *
 * Each `run` should do what the control does -- set the same field or call the same
 * method -- so watchers and saving behave as if the control had been used.
 */

type Extra = Pick<ShortcutAction, "available" | "defaultShortcut">;

/** "Base Stats" -> "base_stats": the id part an option contributes. */
export function slug(text: string): string {
    return text
        .toLowerCase()
        .replace(/\+/g, " plus ")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

export function press(id: string, label: string, group: string, run: () => unknown, extra: Extra = {}): ShortcutAction {
    return { id, label, group, run, ...extra };
}

export function toggle(
    id: string,
    label: string,
    group: string,
    get: () => unknown,
    set: (value: boolean) => void,
    extra: Extra = {},
): ShortcutAction {
    return { id, label: `Toggle: ${label}`, group, run: () => set(!get()), ...extra };
}

export interface Option<T> {
    value: T;
    /** What the menu shows; defaults to the value. */
    label?: string;
    /** The id part for this option; defaults to slug(label ?? value). Pin it when an option is relabelled. */
    slug?: string;
}

function asOptions<T>(options: readonly (T | Option<T>)[]): Option<T>[] {
    return options.map((o) => (o !== null && typeof o === "object" && "value" in (o as object) ? (o as Option<T>) : { value: o as T }));
}

function step<T>(options: readonly T[], value: T, by: 1 | -1): T | undefined {
    if (options.length === 0) return undefined;
    const index = options.indexOf(value);
    if (index === -1) return options[by === 1 ? 0 : options.length - 1];
    return options[(index + by + options.length) % options.length];
}

/** Next and previous through a list that is worked out when the key is pressed. */
export function cycle<T>(
    idBase: string,
    label: string,
    group: string,
    options: () => readonly T[],
    get: () => T,
    set: (value: T) => void,
    extra: Pick<ShortcutAction, "available"> = {},
): ShortcutAction[] {
    const move = (by: 1 | -1) => () => {
        const next = step(options(), get(), by);
        if (next !== undefined) set(next);
    };
    return [
        { id: `${idBase}.next`, label: `${label}: next option`, group, run: move(1), ...extra },
        { id: `${idBase}.previous`, label: `${label}: previous option`, group, run: move(-1), ...extra },
    ];
}

/** One action per option, then next and previous. */
export function choice<T>(
    idBase: string,
    label: string,
    group: string,
    options: readonly (T | Option<T>)[],
    get: () => T,
    set: (value: T) => void,
    extra: Pick<ShortcutAction, "available"> = {},
): ShortcutAction[] {
    const list = asOptions(options);
    const values = list.map((o) => o.value);
    return [
        ...list.map((o) => {
            const text = o.label ?? String(o.value);
            return { id: `${idBase}.set.${o.slug ?? slug(text)}`, label: `${label}: ${text}`, group, run: () => set(o.value), ...extra };
        }),
        ...cycle(idBase, label, group, () => values, get, set, extra),
    ];
}
