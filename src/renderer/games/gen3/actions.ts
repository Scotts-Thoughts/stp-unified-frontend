import { panelActions } from "~/core/settings/toActions";
import { press } from "~/core/shortcuts/build";
import type { ShortcutAction } from "~/core/shortcuts/types";
import { gen3SettingsPanel } from "./settingsPanel";

/**
 * gen3's shortcut actions (docs/shortcuts-menu-plan.md): the F-keys it shipped with,
 * bound by default, then one action per settings control, built from the settings panel's
 * description (settingsPanel.ts), unbound until the user binds them in the Keyboard
 * Shortcuts window.
 *
 * `vm` is the overlay component instance. Each action sets the same field or calls the
 * same method as its control, so watchers and saving behave as if it had been clicked.
 *
 * Ids are persisted (user_state.json `shortcuts`): never rename one.
 *
 * Left out on purpose (plan §3): the Game box art and Solo Pokemon pickers, text fields
 * (Start Time Offset, split column labels, manual IVs), the styling sliders, the colour
 * picker (the browser only opens it from a click), the Pokemon Editor and everything in it
 * (debug tools that write to the ROM), the dev-only controls (Enemy Sprite Styles, Style
 * Mode, the enemy sprite resize handle) and the commented-out ones.
 */

const LEGACY = "Original F-keys";

/**
 * gen3's F-key table, moved out of `games/gen3/hotkeys.ts` unchanged (lifted from the
 * `keyhook.registerShortCut` calls in the legacy `mounted`; plan 2.4, decision 7: per-gen
 * tables preserved, quirks included).
 *
 * gen3's own shape: F22/F21/F20 pick the stat display, F17 and F19 the right panel, F23
 * starts a new run and F24 pauses the timer. F18 (Inventory) was retired with that right-panel
 * option (ui-uniformity-plan decision 14). Quirks:
 *   F20          was registered twice in the legacy source ("Base Stats", then
 *                "Automatic"); both listeners fired on a press, in that order, which
 *                the single body reproduces. The second half always lands on Automatic
 *                (the first half has just set Base Stats), and both messages log.
 *   F17, F19     do nothing while "Disable Panel Hotkeys" is on, which it always is at
 *                launch (`disable_right_hotkeys` starts true and is never loaded).
 *   F24          the overlay's own timer, even with Shuckie Timer on (the "Play/Pause"
 *                action below follows the switch, like the button).
 *   console.log  the console oracle compares these, so the text stays as-is.
 */
function legacyFKeys(vm: any): ShortcutAction[] {
    return [
        press("legacy.f22", "Stats: IVs", LEGACY, async () => { // Show IVs
            console.log("Key: F22 pressed: IVs displayed.")
            vm.stats = "IVs";
        }, { defaultShortcut: "F22" }),
        press("legacy.f21", "Stats: EVs (Detailed EVs if EVs are showing)", LEGACY, async () => { // Show EVs
            console.log("Key: F21 pressed: EVs displayed.")
            if (vm.stats == "EVs") {
                vm.stats = "Detailed EVs"
                return
            };
            vm.stats = "EVs";
        }, { defaultShortcut: "F21" }),
        press("legacy.f20", "Stats: Automatic (sets Base Stats first, then Automatic)", LEGACY, async () => { // Show Base Stats
            console.log("Key: F20 pressed. Base Stats displayed.")
            vm.stats = "Base Stats";
            // gen3's second F20 registration (Automatic) ran after the first; see tools/port/lift-gen3.py.
            console.log("Key: F20 pressed. Stats are displaying automatically now.")
            if (vm.stats == "Automatic") {
                vm.stats = "Badge Boosts"
                return
            };
            vm.stats = "Automatic";
        }, { defaultShortcut: "F20" }),
        press("legacy.f17", "Right Panel: Automatic (not while \"Disable Panel Hotkeys\" is on)", LEGACY, async () => { // Inventory
            if (vm.disable_right_hotkeys) { return }
            console.log("Key: F17 pressed. Automatic battle graphics will be displayed.")
            vm.set_right_panel("Battle Graphic");
        }, { defaultShortcut: "F17" }),
        press("legacy.f19", "Right Panel: Movepool (not while \"Disable Panel Hotkeys\" is on)", LEGACY, async () => { // Trainer Graphic during Battle
            if (vm.disable_right_hotkeys) { return }
            console.log("Key: F19 pressed. Movepool displayed.")
            vm.set_right_panel("Movepool");
        }, { defaultShortcut: "F19" }),
        press("legacy.f23", "New Run", LEGACY, async () => { // Clear Timer and Metrics
            vm.newRun()
        }, { defaultShortcut: "F23" }),
        press("legacy.f24", "Play/Pause the overlay's timer (ignores Shuckie Timer)", LEGACY, async () => { // Pause
            vm.timer.pauseUnpauseTime();
        }, { defaultShortcut: "F24" }),
    ];
}

export function gen3Actions(vm: any): ShortcutAction[] {
    // One action per settings control, from the same description that renders the panel
    // (settingsPanel.ts), so the two can't drift apart.
    return [
        ...legacyFKeys(vm),
        ...panelActions(gen3SettingsPanel(vm)),
        // The right panel's old "Wild" option (decision 27/30: Automatic with Show Wild Battles on). Its saved id stays.
        press("right_panel.set.wild", "Right Panel: Automatic + Show Wild Battles (was \"Wild\")", "Display", () => { vm.set_right_panel("Wild"); }),
    ];
}
