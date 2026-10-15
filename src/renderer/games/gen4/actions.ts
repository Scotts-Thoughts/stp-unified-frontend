import { panelActions } from "~/core/settings/toActions";
import { press } from "~/core/shortcuts/build";
import type { ShortcutAction } from "~/core/shortcuts/types";
import { gen4SettingsPanel } from "./settingsPanel";

/**
 * gen4's shortcut actions (docs/shortcuts-menu-plan.md): the F-keys it shipped with,
 * bound by default, then one action per settings control, built from the settings panel's
 * description (settingsPanel.ts), unbound until the user binds them in the Keyboard
 * Shortcuts window.
 *
 * `vm` is the overlay component instance. Each `run` sets the same field or calls the
 * same method as its control, so watchers and auto-save behave as if it had been used.
 *
 * Ids are persisted (user_state.json `shortcuts`): never rename one.
 *
 * Left out on purpose (plan §3): the Game box-art picker and the Solo Pokemon combobox,
 * text fields (timer offset, manual IVs, trainer search), the styling sliders, the colour
 * picker (the browser only opens it from a click), the Style Settings box (dev-only: export
 * and reset defaults, Enemy Sprite Styles, Style Mode), the Pokemon Editor, the RNG
 * modal's inside (only its "RNG" button is here), and the dead controls (the legacy
 * "Starter Player Chooses" selects and the trainer select).
 */

const LEGACY = "Original F-keys";

/**
 * gen4's F-key table, moved out of `games/gen4/hotkeys.ts` unchanged (lifted from the
 * `keyhook.registerShortCut` calls in its `mounted`, plan 2.4, decision 7: per-gen tables
 * preserved, quirks included).
 *
 * gen4's own shape: F13 shows IVs (no DV/Hidden Power cycle), F14's second press sets
 * "Detailed EVs" (not an option in gen4's dropdown), F16 is Automatic with no Badge
 * Boosts cycle. F17-F19 write `right_panel` and F20 toggles `bonk`, fields gen4 doesn't
 * have, so they do nothing visible; F21/F22 only log that they are unused. Every one is
 * still a binding, so they stay, and the console oracle compares the log text.
 */
function legacyFKeys(vm: any): ShortcutAction[] {
    return [
        press("legacy.f13", "Stat Display: IVs", LEGACY, async () => { // Show IVs
            console.log("Key: F13 pressed: DVs displayed.")
            vm.stats_setting = "IVs";
        }, { defaultShortcut: "F13" }),
        press("legacy.f14", "Stat Display: EVs (\"Detailed EVs\", not in the dropdown, if EVs are showing)", LEGACY, async () => { // Show EVs
            console.log("Key: F14 pressed: Stat experience displayed.")
            if (vm.stats_setting == "EVs") {
                vm.stats_setting = "Detailed EVs";
                return
            }
            vm.stats_setting = "EVs";
        }, { defaultShortcut: "F14" }),
        press("legacy.f15", "Stat Display: Base Stats", LEGACY, async () => { // Show Base Stats
            console.log("Key: F15 pressed. Base Stats displayed.")
            vm.stats_setting = "Base Stats";
        }, { defaultShortcut: "F15" }),
        press("legacy.f16", "Stat Display: Automatic", LEGACY, async () => { // Automatic
            console.log("Key: F16 pressed. Stats are displaying automatically now.")
            vm.stats_setting = "Automatic";
        }, { defaultShortcut: "F16" }),
        press("legacy.f17", "Right panel: Battle Graphic (does nothing in gen4)", LEGACY, async () => { // Inventory
            console.log("Key: F17 pressed. Automatic battle graphics will be displayed.")
            vm.right_panel = "Battle Graphic";
        }, { defaultShortcut: "F17" }),
        press("legacy.f18", "Right panel: Inventory (does nothing in gen4)", LEGACY, async () => { // Trainer Graphic during Battle
            console.log("Key: F18 pressed. Inventory displayed.")
            vm.right_panel = "Inventory";
        }, { defaultShortcut: "F18" }),
        press("legacy.f19", "Right panel: Movepool (does nothing in gen4)", LEGACY, async () => { // Trainer Graphic during Battle
            console.log("Key: F19 pressed. Movepool displayed.")
            vm.right_panel = "Movepool";
        }, { defaultShortcut: "F19" }),
        press("legacy.f20", "Bonk counter (does nothing in gen4)", LEGACY, async () => { // Trainer Graphic during Battle
            console.log(`Key: F20 pressed. Bonk counter displayed. (Bonk = ${vm.bonk})`)
            vm.bonk = !vm.bonk;
        }, { defaultShortcut: "F20" }),
        press("legacy.f21", "Unused (only logs)", LEGACY, async () => { // Trainer Graphic during Battle
            console.log(`Key: F21 pressed. This shortcut is currently unused...`)
        }, { defaultShortcut: "F21" }),
        press("legacy.f22", "Unused (only logs)", LEGACY, async () => { // Trainer Graphic during Battle
            console.log(`Key: F22 pressed. This shortcut is currently unused...`)
        }, { defaultShortcut: "F22" }),
        press("legacy.f23", "New Run", LEGACY, async () => { // Clear Timer and Metrics
            vm.newRun()
        }, { defaultShortcut: "F23" }),
        press("legacy.f24", "Play/Pause", LEGACY, async () => { // Pause
            vm.pauseUnpauseTime()
        }, { defaultShortcut: "F24" }),
    ];
}

export function gen4Actions(vm: any): ShortcutAction[] {
    // One action per settings control, from the same description that renders the panel
    // (settingsPanel.ts), so the two can't drift apart.
    return [...legacyFKeys(vm), ...panelActions(gen4SettingsPanel(vm))];
}
