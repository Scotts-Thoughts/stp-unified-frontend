import { toggle } from "../shortcuts/build";
import { layoutSwitches, rightPanelLayout, RIGHT_PANEL_LAYOUTS, type RightPanelLayout } from "../logic/secondScreen";
import type { SettingControl } from "./types";

/**
 * The Right Panel Layout dropdown of gens 4-5 (`core/logic/secondScreen.ts`), and the old switches' shortcut actions
 * kept under their persisted ids: `display.webcam_mode` (Webcam Mode on/off) and, in gen5, `advanced.second_screen_mode`
 * (the old Second Screen Mode switch, now Secondary Screen on/off). Turning one on picks its layout; off picks Historical.
 *
 * `vm` has `webcam_mode` and `second_screen_mode`. Not saved in presets: a streaming setup, not a Pokémon's look.
 */
export function rightPanelLayoutControls(vm: any, oldSecondScreenAction: boolean): SettingControl[] {
    const get = (): RightPanelLayout => rightPanelLayout(vm.webcam_mode, vm.second_screen_mode);
    const set = (layout: RightPanelLayout): void => {
        const next = layoutSwitches(layout);
        vm.webcam_mode = next.webcam_mode;
        vm.second_screen_mode = next.second_screen_mode;
    };
    const old = (id: string, label: string, layout: RightPanelLayout) =>
        toggle(id, label, "", () => get() === layout, (on) => set(on ? layout : "Historical"));
    return [
        {
            kind: "choice", id: "display.right_panel_layout", label: "Right Panel Layout", options: [...RIGHT_PANEL_LAYOUTS], preset: false,
            title: "Webcam keeps the right panel above the bottom right corner. Secondary Screen does the same and adds a green area for the DS's second screen under it.",
            get, set: (v) => set(v as RightPanelLayout),
        },
        {
            kind: "actions", id: "display.right_panel_layout.legacy", label: "Right Panel Layout",
            actions: () => [
                old("display.webcam_mode", "Webcam Mode", "Webcam"),
                ...(oldSecondScreenAction ? [old("advanced.second_screen_mode", "Second Screen Mode", "Secondary Screen")] : []),
            ],
        },
    ];
}
