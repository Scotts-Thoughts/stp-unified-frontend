import { manualNewRun } from "~/core/logic/newRunGuard";
import { panelActions } from "~/core/settings/toActions";
import { press } from "~/core/shortcuts/build";
import { N3DS_PICTURE, SCREEN_BOXES, runSeconds, screenshotAction } from "~/core/screenshot/screenshot";
import type { ShortcutAction } from "~/core/shortcuts/types";
import type { ModuleManifest } from "~/core/game/ModuleManifest";
import { threeDsSettingsPanel } from "./settingsPanel";

/**
 * The 3DS overlay's shortcut actions (ARCHITECTURE §4 "Shortcuts"): the F-keys gens 4-5 use for the same things,
 * bound by default, then one action per settings control, built from the settings panel's description and unbound
 * until the user binds them in the Keyboard Shortcuts window.
 *
 * Ids are persisted (user_state.json `shortcuts`, in the gen6 or gen7 section): never rename one. The F-key ids and
 * meanings are gen5's (`legacy.f13`...), so a streamer's keys do the same in every DS and 3DS game; F14's second
 * press (Detailed EVs), F19's Unobtainable Moves cycle and F22's encounter flip have nothing to act on here and are
 * left out or simplified.
 */
const LEGACY = "Original F-keys";

function fKeys(vm: any): ShortcutAction[] {
    return [
        press("legacy.f13", "Stats: IVs", LEGACY, () => { vm.stats_setting = "IVs"; }, { defaultShortcut: "F13" }),
        press("legacy.f14", "Stats: EVs", LEGACY, () => { vm.stats_setting = "EVs"; }, { defaultShortcut: "F14" }),
        press("legacy.f15", "Stats: Base Stats", LEGACY, () => { vm.stats_setting = "Base Stats"; }, { defaultShortcut: "F15" }),
        press("legacy.f16", "Stats: Automatic", LEGACY, () => { vm.stats_setting = "Automatic"; }, { defaultShortcut: "F16" }),
        press("legacy.f17", "Right UI: switch between Automatic and Splits", LEGACY, () => {
            vm.set_right_panel(vm.right_panel_mode == "Automatic" ? "Splits" : "Automatic");
        }, { defaultShortcut: "F17" }),
        press("legacy.f18", "Splits: switch between First and Followup", LEGACY, () => {
            vm.toggle_compare_splits = vm.toggle_compare_splits == "First" ? "Followup" : "First";
        }, { defaultShortcut: "F18" }),
        press("legacy.f19", "Unobtainable Moves: next option", LEGACY, () => {
            const modes = ["Never Cross Out", "Cross Out When Starter is Obtained", "Cross Out After First Badge", "Always Cross Out"];
            vm.unobtainable_moves_toggle = modes[(modes.indexOf(vm.unobtainable_moves_toggle) + 1) % modes.length];
        }, { defaultShortcut: "F19" }),
        press("legacy.f23", "New Run", LEGACY, () => {
            manualNewRun(vm.shuckie_timer, vm.emulatorStats, "F23", () => vm.newRun());
        }, { defaultShortcut: "F23" }),
        press("legacy.f24", "Play/Pause", LEGACY, () => { vm.timer.pauseUnpauseTime(); }, { defaultShortcut: "F24" }),
    ];
}

export function threeDsActions(vm: any, manifest: ModuleManifest): ShortcutAction[] {
    return [
        ...fKeys(vm),
        ...panelActions(threeDsSettingsPanel(vm, manifest)),
        // Both screens, each into its own box: the bottom screen always has its slot in this layout.
        screenshotAction(() => ({ top: SCREEN_BOXES.n3dsTop, bottom: SCREEN_BOXES.n3dsBottom, source: N3DS_PICTURE }),
            () => ({ species: vm.displayed_species ?? vm.starter, finishes: vm.finished_run_count, seconds: runSeconds(vm.shuckie_timer, vm.emulatorStats?.time_current, vm.timer.getTime()) })),
    ];
}
