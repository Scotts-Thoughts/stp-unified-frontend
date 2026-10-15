import PubSub from "~/logic/PubSub";
import { RightPanelMode } from "~/stores/types/RightPanelMode";
import { StatsPanelMode } from "~/stores/types/StatsPanelMode";
import { useOverlaySettingsStore } from "~/stores/useOverlaySettingsStore";
import { useSpeciesMetricsStore } from "~/stores/useSpeciesMetricsStore";
import { panelActions } from "~/core/settings/toActions";
import { press } from "~/core/shortcuts/build";
import type { ShortcutAction } from "~/core/shortcuts/types";
import { gen1SettingsPanel } from "./settingsPanel";

/**
 * gen1's shortcut actions (docs/shortcuts-menu-plan.md): the F-keys it shipped with,
 * bound by default, then one action per settings control, built from the settings panel's
 * description (settingsPanel.ts), unbound until the user binds them in the Keyboard
 * Shortcuts window. Each `run` does what its control does (the same store field, the same
 * `components/settings/commands.ts` function), so watchers and saving behave as for a click.
 *
 * Ids are persisted (user_state.json `shortcuts`): never rename one.
 *
 * Left out on purpose (plan §3): the edition and Solo Pokemon pickers, text and number
 * fields (timer offset, split labels, manual DVs, re-filmed numbers), the styling sliders,
 * the colour picker (the browser only opens it from a click), the Pokemon Editor, and the
 * dev-only controls (run modes, enemy sprite styles, Style Mode, the Wild Pokemon toggle).
 */

const LEGACY = "Original F-keys";

/**
 * gen1's F-key table, moved out of `games/gen1/hotkeys.ts` unchanged (it came from
 * `components/keyhook.js`, plan 1.1). Each generation binds a different set with
 * different meanings (decision 7), quirks included:
 *   F17/F18/F19  each branch on `right_panel.hotkeys`, but the "true" branch of all
 *                three sets Automatic, so with hotkeys enabled the three keys do the
 *                same thing and only the disabled branch reaches Movepool and Splits.
 *   F20-F22      unbound in gen1.
 *   console.log  each key logs, and two of the messages are swapped (F13 says "EVs
 *                displayed" while it selects DVs, F14 says "IVs"); the console oracle
 *                compares these, so the text stays as-is.
 *   F24          the overlay's own timer, even with Shuckie Timer on (the button's
 *                "Play/Pause" action below follows the switch).
 */
function legacyFKeys(): ShortcutAction[] {
  const settings = () => useOverlaySettingsStore();
  const metrics = () => useSpeciesMetricsStore();
  return [
    press("legacy.f13", "Stats: DVs", LEGACY, () => {
      console.log("Key: F13 pressed: EVs displayed.");
      settings().setStatsPanelMode(StatsPanelMode.dvs);
    }, { defaultShortcut: "F13" }),
    press("legacy.f14", "Stats: EVs (Detailed EVs if EVs are showing)", LEGACY, () => {
      console.log("Key: F14 pressed: IVs displayed.");
      const s = settings();
      if (s.left_panel.stats.mode === StatsPanelMode.evs) {
        s.setStatsPanelMode(StatsPanelMode.detailed_evs);
        return;
      }
      s.setStatsPanelMode(StatsPanelMode.evs);
    }, { defaultShortcut: "F14" }),
    press("legacy.f15", "Stats: Base Stats", LEGACY, () => {
      console.log("Key: F15 pressed. Base Stats displayed.");
      settings().setStatsPanelMode(StatsPanelMode.base_stats);
    }, { defaultShortcut: "F15" }),
    press("legacy.f16", "Stats: Automatic (Badge Boosts if Automatic is showing)", LEGACY, () => {
      console.log("Key: F16 pressed. Stats are displaying automatically now.");
      const s = settings();
      if (s.left_panel.stats.mode === StatsPanelMode.automatic) {
        s.setStatsPanelMode(StatsPanelMode.badge_boosts);
        return;
      }
      s.setStatsPanelMode(StatsPanelMode.automatic);
    }, { defaultShortcut: "F16" }),
    press("legacy.f17", "Right Panel: Automatic", LEGACY, () => {
      console.log("Key: F17 pressed. Automatic battle graphics will be displayed.");
      const s = settings();
      if (s.right_panel.hotkeys === true) {
        s.setRightPanelMode(RightPanelMode.automatic);
        return;
      }
      s.setRightPanelMode(RightPanelMode.automatic);
    }, { defaultShortcut: "F17" }),
    press("legacy.f18", "Right Panel: Automatic (Movepool with \"F17-F19 Only Set Automatic\" off)", LEGACY, () => {
      console.log("Key: F18 pressed. Splits displayed.");
      const s = settings();
      if (s.right_panel.hotkeys === true) {
        s.setRightPanelMode(RightPanelMode.automatic);
        return;
      }
      s.setRightPanelMode(RightPanelMode.movepool);
    }, { defaultShortcut: "F18" }),
    press("legacy.f19", "Right Panel: Automatic (Splits with \"F17-F19 Only Set Automatic\" off)", LEGACY, () => {
      console.log("Key: F19 pressed. Movepool displayed.");
      const s = settings();
      if (s.right_panel.hotkeys === true) {
        s.setRightPanelMode(RightPanelMode.automatic);
        return;
      }
      s.setRightPanelMode(RightPanelMode.splits);
    }, { defaultShortcut: "F19" }),
    press("legacy.f23", "New Run", LEGACY, () => {
      console.log("Key: F23 pressed. Starting a new run.");
      PubSub.publish("@run/cleared");
    }, { defaultShortcut: "F23" }),
    press("legacy.f24", "Play/Pause the overlay's timer (ignores Shuckie Timer)", LEGACY, () => {
      metrics().toggleTimer();
    }, { defaultShortcut: "F24" }),
  ];
}

export function gen1Actions(): ShortcutAction[] {
  // One action per settings control, from the same description that renders the panel
  // (settingsPanel.ts), so the two can't drift apart.
  return [...legacyFKeys(), ...panelActions(gen1SettingsPanel())];
}
