import PubSub from "~/logic/PubSub";
import { RightPanelMode } from "~/stores/types/RightPanelMode";
import { StatsPanelMode } from "~/stores/types/StatsPanelMode";
import { useOverlaySettingsStore } from "~/stores/useOverlaySettingsStore";
import { useSpeciesMetricsStore } from "~/stores/useSpeciesMetricsStore";
import type { HotkeyTable } from "~/core/hotkeys/KeyHook";

/**
 * gen1's F-key table, moved out of `components/keyhook.js` unchanged (plan 1.1).
 *
 * Every generation binds a different set with different meanings (decision 7: the
 * per-gen tables are preserved including their quirks), so this is the first piece of
 * `GameModule.hotkeys`.
 *
 * Quirks kept deliberately, because they are what the overlay does today:
 *   F17/F18/F19  each branch on `right_panel.hotkeys`, but the "true" branch of all
 *                three sets Automatic, so with hotkeys enabled the three keys do the
 *                same thing and only the disabled branch reaches Movepool and Splits.
 *   F20-F22      unbound in gen1.
 *   console.log  each key logs, and two of the messages are swapped (F13 says "EVs
 *                displayed" while it selects DVs, F14 says "IVs"); the console oracle
 *                compares these, so the text stays as-is.
 */
export function gen1Hotkeys(): HotkeyTable {
  const settings = () => useOverlaySettingsStore();
  const metrics = () => useSpeciesMetricsStore();

  return {
    F13: () => {
      console.log("Key: F13 pressed: EVs displayed.");
      settings().setStatsPanelMode(StatsPanelMode.dvs);
    },
    F14: () => {
      console.log("Key: F14 pressed: IVs displayed.");
      const s = settings();
      if (s.left_panel.stats.mode === StatsPanelMode.evs) {
        s.setStatsPanelMode(StatsPanelMode.detailed_evs);
        return;
      }
      s.setStatsPanelMode(StatsPanelMode.evs);
    },
    F15: () => {
      console.log("Key: F15 pressed. Base Stats displayed.");
      settings().setStatsPanelMode(StatsPanelMode.base_stats);
    },
    F16: () => {
      console.log("Key: F16 pressed. Stats are displaying automatically now.");
      const s = settings();
      if (s.left_panel.stats.mode === StatsPanelMode.automatic) {
        s.setStatsPanelMode(StatsPanelMode.badge_boosts);
        return;
      }
      s.setStatsPanelMode(StatsPanelMode.automatic);
    },
    F17: () => {
      console.log("Key: F17 pressed. Automatic battle graphics will be displayed.");
      const s = settings();
      if (s.right_panel.hotkeys === true) {
        s.setRightPanelMode(RightPanelMode.automatic);
        return;
      }
      s.setRightPanelMode(RightPanelMode.automatic);
    },
    F18: () => {
      console.log("Key: F18 pressed. Splits displayed.");
      const s = settings();
      if (s.right_panel.hotkeys === true) {
        s.setRightPanelMode(RightPanelMode.automatic);
        return;
      }
      s.setRightPanelMode(RightPanelMode.movepool);
    },
    F19: () => {
      console.log("Key: F19 pressed. Movepool displayed.");
      const s = settings();
      if (s.right_panel.hotkeys === true) {
        s.setRightPanelMode(RightPanelMode.automatic);
        return;
      }
      s.setRightPanelMode(RightPanelMode.splits);
    },
    F23: () => {
      console.log("Key: F23 pressed. Starting a new run.");
      PubSub.publish("@run/cleared");
    },
    F24: () => {
      metrics().toggleTimer();
    },
  };
}
