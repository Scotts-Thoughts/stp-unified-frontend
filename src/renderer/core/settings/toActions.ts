import { choice, cycle, press, toggle, type Option } from "../shortcuts/build";
import type { ShortcutAction } from "../shortcuts/types";
import type { ChoiceOption, SettingControl, SettingsPanelSpec } from "./types";

/** A choice control's options as the dropdown and the shortcuts see them. */
export function choiceOptions(options: readonly (ChoiceOption | string)[]): ChoiceOption[] {
    return options.map((o) => (typeof o === "string" ? { value: o } : o));
}

function resolveOptions(c: { options: readonly (ChoiceOption | string)[] | (() => readonly (ChoiceOption | string)[]) }): ChoiceOption[] {
    return choiceOptions(typeof c.options === "function" ? c.options() : c.options);
}

/**
 * Both the control's own `available` and the group's: a control in a group that doesn't
 * apply (e.g. Platinum's encounters while HG/SS is loaded) is greyed out in the window too.
 */
function both(a?: () => boolean, b?: () => boolean): (() => boolean) | undefined {
    if (!a) return b;
    if (!b) return a;
    return () => a() && b();
}

function actionsOf(c: SettingControl, group: string, groupAvailable?: () => boolean): ShortcutAction[] {
    // A text field never has an action of its own; its button (e.g. "Clear") can.
    if (c.noAction && c.kind !== "text") return [];
    const available = both(groupAvailable, c.available);
    const extra = available ? { available } : {};
    const label = c.actionLabel ?? (typeof c.label === "string" ? c.label : c.id);
    switch (c.kind) {
        case "toggle":
            return [toggle(c.id, label, group, c.get, c.set, extra)];
        case "button":
            return [press(c.id, label, group, c.run, extra)];
        case "choice": {
            if (c.actions === "cycle") {
                return cycle(c.id, label, group, () => resolveOptions(c).map((o) => o.value), c.get, c.set, extra);
            }
            const options: Option<unknown>[] = resolveOptions(c).map((o) => ({ value: o.value, label: o.label, slug: o.slug }));
            return choice(c.id, label, group, options, c.get, c.set, extra);
        }
        case "counter":
            return [
                press(`${c.id}.increment`, `${label} +`, group, c.increment, extra),
                press(`${c.id}.decrement`, `${label} -`, group, c.decrement, extra),
            ];
        case "text":
            return c.button?.id ? [press(c.button.id, c.button.actionLabel ?? c.button.label, group, c.button.run, extra)] : [];
        case "actions":
            return c.actions().map((a) => ({ ...a, group: a.group || group, available: both(available, a.available) }));
        default:
            return [];
    }
}

/**
 * The shortcut actions for every control in the panel, in panel order, grouped by the
 * panel's group titles. Each action does what its control does.
 */
export function panelActions(panel: SettingsPanelSpec): ShortcutAction[] {
    const out: ShortcutAction[] = [];
    for (const column of panel.columns) {
        for (const group of column.groups) {
            for (const control of group.controls) out.push(...actionsOf(control, group.title, group.available));
        }
    }
    return out;
}
