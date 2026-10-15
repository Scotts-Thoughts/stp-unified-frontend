import { panelActions } from "~/core/settings/toActions";
import { press } from "~/core/shortcuts/build";
import type { ShortcutAction } from "~/core/shortcuts/types";
import { gen5SettingsPanel } from "./settingsPanel";

/**
 * gen5's shortcut actions (docs/shortcuts-menu-plan.md): the F-keys it shipped with,
 * bound by default, then one action per settings control, built from the settings panel's
 * description (settingsPanel.ts), unbound until the user binds them in the Keyboard
 * Shortcuts window.
 *
 * Ids are persisted (user_state.json `shortcuts`): never rename one.
 *
 * `vm` is the overlay component instance. Each `run` assigns the same field the
 * control does, or calls the same method, so the overlay's watchers save and react as
 * if the control had been used.
 *
 * Left out on purpose (plan §3): the Game box-art picker and the Solo Pokemon picker,
 * text fields (timer offset, column labels, manual IVs), the styling sliders, the colour
 * picker (the browser only opens it from a click), the Style Settings box (export/reset
 * defaults, Enemy Sprite Styles, Style Mode, "Log Color Settings"), the Pokemon Editor with
 * its fields and buttons (writes to the ROM), and the RNG modal's own controls (only its
 * "RNG" button is here).
 */

const LEGACY = "Original F-keys";

/**
 * gen5's F-key table, moved out of `games/gen5/hotkeys.ts` unchanged (it was lifted
 * from the `keyhook.registerShortCut` calls in the legacy `mounted`, plan 2.4,
 * decision 7: per-gen tables preserved, quirks included).
 *
 * gen5's own shape: F13-F16 pick the stat display, F17-F19 the right panel (F17 flips
 * Right UI between Automatic and Splits, F18 flips the splits style, F19 steps through
 * the four Unobtainable Moves settings), F20 and F21 are commented out in the legacy
 * source (so they are not bound at all here), F22 flips every encounter-route box
 * (`toggle_encounters`), F23 is New Run and F24 Play/Pause, neither of which logs.
 * The console oracle compares the log text, so it stays as-is.
 */
function legacyFKeys(vm: any): ShortcutAction[] {
  return [
    press("legacy.f13", "Stats: IVs", LEGACY, async () => {
      console.log("Key: F13 pressed: IVs displayed.")
      vm.stats_setting = "IVs";
    }, { defaultShortcut: "F13" }),
    press("legacy.f14", "Stats: EVs (Detailed EVs if EVs are showing)", LEGACY, async () => {
      console.log("Key: F14 pressed: EVs displayed.")
      if (vm.stats_setting == "EVs") {
        vm.stats_setting = "Detailed EVs";
        return
      }
      vm.stats_setting = "EVs";
    }, { defaultShortcut: "F14" }),
    press("legacy.f15", "Stats: Base Stats", LEGACY, async () => {
      console.log("Key: F15 pressed. Base Stats displayed.")
      vm.stats_setting = "Base Stats";
    }, { defaultShortcut: "F15" }),
    press("legacy.f16", "Stats: Automatic", LEGACY, async () => {
      console.log("Key: F16 pressed. Stats are displaying automatically now.")
      vm.stats_setting = "Automatic";
    }, { defaultShortcut: "F16" }),
    press("legacy.f17", "Right UI: switch between Automatic and Splits", LEGACY, async () => {
      console.log("Key: F17 pressed. Right panel toggled.")
      // Decision 27: through the mode model; a post-battle Splits counts as Splits (it used to be written to right_ui).
      vm.set_right_panel(vm.right_panel_mode == 'Automatic' ? 'Splits' : 'Automatic');
    }, { defaultShortcut: "F17" }),
    press("legacy.f18", "Splits: switch between First and Followup", LEGACY, async () => {
      console.log(`Key: F18 pressed. Splits style changed.`)
      vm.toggle_compare_splits = vm.toggle_compare_splits == "First" ? "Followup" : "First";
    }, { defaultShortcut: "F18" }),
    press("legacy.f19", "Unobtainable Moves: next option", LEGACY, async () => {
      console.log(`Key: F19 pressed. Cycling through unobtainable moves settings...`)
      vm.unobtainable_moves_toggle = vm.unobtainable_moves_toggle == "Never Cross Out" ? "Cross Out When Starter is Obtained" : vm.unobtainable_moves_toggle == "Cross Out When Starter is Obtained" ? "Cross Out After First Badge" : vm.unobtainable_moves_toggle == "Cross Out After First Badge" ? "Always Cross Out" : "Never Cross Out";
    }, { defaultShortcut: "F19" }),
    press("legacy.f22", "Encounters: flip all route boxes (Route 1, 2, 19, 20, Flocessy Ranch)", LEGACY, async () => {
      console.log(`Key: F22 pressed. Toggle Encounters.`)
      vm.toggle_encounters()
    }, { defaultShortcut: "F22" }),
    press("legacy.f23", "New Run", LEGACY, async () => { // Clear Timer and Metrics
      vm.newRun()
    }, { defaultShortcut: "F23" }),
    press("legacy.f24", "Play/Pause", LEGACY, async () => { // Pause
      // vm.pauseUnpauseTime()
      vm.timer.pauseUnpauseTime();
    }, { defaultShortcut: "F24" }),
  ];
}

export function gen5Actions(vm: any): ShortcutAction[] {
  // One action per settings control, from the same description that renders the panel
  // (settingsPanel.ts), so the two can't drift apart.
  return [...legacyFKeys(vm), ...panelActions(gen5SettingsPanel(vm))];
}
