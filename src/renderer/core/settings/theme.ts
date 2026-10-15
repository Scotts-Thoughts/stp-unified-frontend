import { ref } from "vue";
import { getUserState, setUserState } from "../persistence/userState";
import type { ChoiceControl } from "./types";

/**
 * The settings panel's look, shared by every generation (a global user-state key).
 * Scott asked to see three directions side by side (plan §6 item 3); all three ship and the
 * "Panel Style" dropdown switches between them live. "dark" is the default.
 */
export const PANEL_THEMES = [
    { value: "dark", label: "Dark Glass" },
    { value: "light", label: "Light Frosted" },
    { value: "tinted", label: "Tinted (UI Color)" },
] as const;

export type PanelTheme = (typeof PANEL_THEMES)[number]["value"];

const KEY = "settings_panel_theme";

function read(): PanelTheme {
    const v = getUserState<string>(KEY, "dark");
    return PANEL_THEMES.some((t) => t.value === v) ? (v as PanelTheme) : "dark";
}

/** Reactive; read lazily so the user state has loaded by the time a panel first renders. */
const current = ref<PanelTheme | null>(null);

export function panelTheme(): PanelTheme {
    if (current.value === null) current.value = read();
    return current.value;
}

export function setPanelTheme(value: PanelTheme): void {
    current.value = value;
    setUserState(KEY, value);
}

/** The "Panel Style" dropdown, the same in every generation's Style column. */
export function panelThemeControl(): ChoiceControl {
    return {
        kind: "choice",
        id: "style.panel_theme",
        label: "Panel Style",
        options: PANEL_THEMES.map((t) => ({ value: t.value, label: t.label })),
        get: panelTheme,
        set: (v) => setPanelTheme(v as PanelTheme),
    };
}
