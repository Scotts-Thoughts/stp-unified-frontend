import type { HotkeyTable } from "~/core/hotkeys/KeyHook";

/**
 * gen2's F-key table, lifted from the `keyhook.registerShortCut` calls in its
 * `mounted` (plan 2.4, decision 7: per-gen tables preserved, quirks included).
 *
 * Differences from gen1 that are gen2's own: F13 cycles DVs -> Hidden Power, F17-F19
 * switch the right panel between Battle Graphic / Inventory / Movepool with no
 * "hotkeys disabled" branch, F20 toggles the bonk counter, and F21/F22 are bound to a
 * console line saying they are unused -- which is still a binding, so it stays.
 *
 * `vm` is the overlay component instance, which is what `this` was.
 */
export function gen2Hotkeys(vm: any): HotkeyTable {
    return {
        F13: () => { // Show IVs
            console.log("Key: F13 pressed: DVs displayed.")
            if (vm.stats_setting == "DVs") {
                vm.stats_setting = "Hidden Power"
                return
            };
            vm.stats_setting = "DVs";
        },
        F14: () => { // Show EVs
            console.log("Key: F14 pressed: Stat experience displayed.")
            if (vm.stats_setting == "EVs") {
                vm.stats_setting = "Detailed EVs"
                return
            };
            vm.stats_setting = "EVs";
        },
        F15: () => { // Show Base Stats
            console.log("Key: F15 pressed. Base Stats displayed.")
            vm.stats_setting = "Base Stats";
        },
        F16: () => { // Automatic
            console.log("Key: F16 pressed. Stats are displaying automatically now.")
            if (vm.stats_setting == "Automatic") {
                vm.stats_setting = "Badge Boosts"
                return
            }
            vm.stats_setting = "Automatic";
        },
        F17: () => { // Inventory
            console.log("Key: F17 pressed. Automatic battle graphics will be displayed.")
            vm.right_panel = "Battle Graphic";
        },
        F18: () => { // Trainer Graphic during Battle
            console.log("Key: F18 pressed. Inventory displayed.")
            vm.right_panel = "Inventory";
        },
        F19: () => { // Trainer Graphic during Battle
            console.log("Key: F19 pressed. Movepool displayed.")
            vm.right_panel = "Movepool";
        },
        F20: () => { // Trainer Graphic during Battle
            console.log(`Key: F20 pressed. Bonk counter displayed. (Bonk = ${vm.bonk})`)
            vm.bonk = !vm.bonk;
        },
        //UNUSED F Keys
        F21: () => {
            console.log(`Key: F21 pressed. This shortcut is currently unused...`)
        },
        F22: () => {
            console.log(`Key: F22 pressed. This shortcut is currently unused...`)
        },
        F23: () => { // Clear Timer and Metrics
            vm.newRun()
        },
        F24: () => { // Pause
            vm.pauseUnpauseTime()
        },
    };
}
