import { panelActions } from "~/core/settings/toActions";
import { press } from "~/core/shortcuts/build";
import type { ShortcutAction } from "~/core/shortcuts/types";
import { gen2SettingsPanel } from "./settingsPanel";

/**
 * gen2's shortcut actions (docs/shortcuts-menu-plan.md): the F-keys it shipped with,
 * bound by default, then one action per settings control, built from the settings panel's
 * description (settingsPanel.ts), unbound until the user binds them in the Keyboard
 * Shortcuts window.
 *
 * Ids are persisted (user_state.json `shortcuts`): never rename one.
 *
 * `vm` is the overlay component instance. Each `run` assigns the same field the
 * control assigns, or calls the same method with the same arguments, so the overlay's
 * watchers save and react as if the control had been used.
 *
 * Left out on purpose (plan §3): the Game and Solo Pokemon pickers, text fields (timer
 * offset, trainer search, split labels, re-filming numbers, manual DVs), the styling sliders,
 * the colour picker (the browser only opens it from a click), the dev-only controls
 * (Enemy Sprite Styles, Style Mode), and the debug tools that write to the ROM (Import
 * Backports, Pokemon Editor, Pokemon Recalculator, with their fields and buttons).
 */

const LEGACY = "Original F-keys";

/**
 * gen2's F-key table, moved out of `games/gen2/hotkeys.ts` unchanged (it was lifted
 * from the `keyhook.registerShortCut` calls in the legacy `mounted`, plan 2.4,
 * decision 7: per-gen tables preserved, quirks included).
 *
 * Differences from gen1 that are gen2's own: F13 cycles DVs -> Hidden Power (a stats
 * view the Stats dropdown doesn't list: level 60/70/80 stats), F17-F19 switch the right
 * panel between Battle Graphic / Inventory / Movepool with no "hotkeys disabled" branch
 * (since decision 27 through `set_right_panel`: Battle Graphic and Inventory are Automatic), F20 toggles the bonk counter, and F21/F22 only log a line
 * saying they are unused -- which is still a binding, so they stay. The console oracle
 * compares the log text, so it stays as-is.
 */
function legacyFKeys(vm: any): ShortcutAction[] {
  return [
    press("legacy.f13", "Stats: DVs (Hidden Power level stats if DVs are showing)", LEGACY, () => { // Show IVs
      console.log("Key: F13 pressed: DVs displayed.")
      if (vm.stats_setting == "DVs") {
        vm.stats_setting = "Hidden Power"
        return
      };
      vm.stats_setting = "DVs";
    }, { defaultShortcut: "F13" }),
    press("legacy.f14", "Stats: EVs (Detailed EVs if EVs are showing)", LEGACY, () => { // Show EVs
      console.log("Key: F14 pressed: Stat experience displayed.")
      if (vm.stats_setting == "EVs") {
        vm.stats_setting = "Detailed EVs"
        return
      };
      vm.stats_setting = "EVs";
    }, { defaultShortcut: "F14" }),
    press("legacy.f15", "Stats: Base Stats", LEGACY, () => { // Show Base Stats
      console.log("Key: F15 pressed. Base Stats displayed.")
      vm.stats_setting = "Base Stats";
    }, { defaultShortcut: "F15" }),
    press("legacy.f16", "Stats: Automatic (Badge Boosts if Automatic is showing)", LEGACY, () => { // Automatic
      console.log("Key: F16 pressed. Stats are displaying automatically now.")
      if (vm.stats_setting == "Automatic") {
        vm.stats_setting = "Badge Boosts"
        return
      }
      vm.stats_setting = "Automatic";
    }, { defaultShortcut: "F16" }),
    press("legacy.f17", "Right Panel: Automatic", LEGACY, () => { // Inventory
      console.log("Key: F17 pressed. Automatic battle graphics will be displayed.")
      vm.set_right_panel("Battle Graphic");
    }, { defaultShortcut: "F17" }),
    press("legacy.f18", "Right Panel: Automatic (was the Inventory panel, removed)", LEGACY, () => { // Trainer Graphic during Battle
      console.log("Key: F18 pressed. Inventory displayed.")
      vm.set_right_panel("Inventory");
    }, { defaultShortcut: "F18" }),
    press("legacy.f19", "Right Panel: Movepool", LEGACY, () => { // Trainer Graphic during Battle
      console.log("Key: F19 pressed. Movepool displayed.")
      vm.set_right_panel("Movepool");
    }, { defaultShortcut: "F19" }),
    press("legacy.f20", "Show Bonk Counter on/off", LEGACY, () => { // Trainer Graphic during Battle
      console.log(`Key: F20 pressed. Bonk counter displayed. (Bonk = ${vm.bonk})`)
      vm.bonk = !vm.bonk;
    }, { defaultShortcut: "F20" }),
    //UNUSED F Keys
    press("legacy.f21", "Unused (only writes a console line)", LEGACY, () => {
      console.log(`Key: F21 pressed. This shortcut is currently unused...`)
    }, { defaultShortcut: "F21" }),
    press("legacy.f22", "Unused (only writes a console line)", LEGACY, () => {
      console.log(`Key: F22 pressed. This shortcut is currently unused...`)
    }, { defaultShortcut: "F22" }),
    press("legacy.f23", "New Run", LEGACY, () => { // Clear Timer and Metrics
      vm.newRun()
    }, { defaultShortcut: "F23" }),
    press("legacy.f24", "Play/Pause the timer", LEGACY, () => { // Pause
      vm.pauseUnpauseTime()
    }, { defaultShortcut: "F24" }),
  ];
}

export function gen2Actions(vm: any): ShortcutAction[] {
  // One action per settings control, from the same description that renders the panel
  // (settingsPanel.ts), so the two can't drift apart.
  return [...legacyFKeys(vm), ...panelActions(gen2SettingsPanel(vm))];
}
