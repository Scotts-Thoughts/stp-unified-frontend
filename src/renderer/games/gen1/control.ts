/**
 * gen1's control-server route table (plan 1.8, docs/external-contracts.md section 2).
 *
 * gen1 had no control server at all, so every route here is additive: the queuer's gen1
 * branch keeps skipping what it skips, and nothing it already sends changes meaning.
 * The routes it *does* send for other generations are implemented where gen1 has an
 * equivalent, so a mixed-generation queue can drive this app uniformly later.
 *
 * `/status` reports the **union** of the per-generation field names -- `starter` and
 * `starterString`, `right_panel` and `right_ui` -- so each of the queuer's existing
 * per-gen branches reads a field that exists (`app`, `generation` and `mapper_path`
 * come from the shell, `core/control/useControlServer.ts`, for every generation).
 *
 * gen1 has no evolution splits, no tutor moves and no unobtainable-move mode, so those
 * routes answer `ok: false` with `unsupported: true` rather than silently accepting a
 * setting that would do nothing.
 */
import PubSub from "~/logic/PubSub";
import { RightPanelMode } from "~/stores/types/RightPanelMode";
import { SplitsMode } from "~/stores/types/SplitsMode";
import { useGameSpeciesData } from "~/stores/useGameSpeciesData";
import { useMetaStore } from "~/stores/metaStore";
import { useOverlaySettingsStore, type GameEdition } from "~/stores/useOverlaySettingsStore";
import { asBoolean, missing, type ControlReply, type ControlRoutes } from "~/core/control/useControlServer";

const EDITIONS: GameEdition[] = ["Yellow", "Red", "Blue"];

const UNSUPPORTED = (route: string): ControlReply => ({
  ok: false,
  unsupported: true,
  error: `${route} has no gen1 equivalent`,
});

export function gen1ControlRoutes(isReady: () => boolean): ControlRoutes {
  const settings = () => useOverlaySettingsStore();
  const runConfig = () => useGameSpeciesData();
  const meta = () => useMetaStore();

  return {
    status: () => {
      const s = settings();
      const config = runConfig().config;
      return {
        ready: isReady(),
        gameName: s.game,
        // gen1 derives the game from the mapper; the queuer expects null here and sets
        // nothing, so `selected_game` reports the edition the user picked instead.
        selected_game: s.edition,
        starter: s.starter,
        starterString: s.starter,
        // gen2-5 report the *setting* here (`this.right_panel`), not what is currently
        // on screen, so the queuer sees back what it set. gen1 also has a temporary
        // override for post-battle splits, reported separately.
        right_panel: s.visualization.right_panel.mode,
        right_ui: s.visualization.right_panel.mode,
        right_panel_active: s.right_panel_mode,
        splits: s.visualization.right_panel.splits.mode,
        hpType: config.hidden_power,
        bonk: s.pop_ups.bonks.enabled,
        repel_counter: s.pop_ups.repel.enabled,
        shuckie_counters: s.shuckie.counters,
        automatic_post_battle_splits: s.visualization.right_panel.post_battle_splits,
        current_species: meta().currentSpecies,
      };
    },
    routes: {
      "/set-starter": (query) => {
        if (!query.species) return missing("species");
        settings().setStarter(query.species);
        return { ok: true, starter: query.species };
      },

      "/set-game": (query) => {
        if (!query.game) return missing("game");
        if (!EDITIONS.includes(query.game as GameEdition)) {
          return { ok: false, status: 400, error: `Not a gen1 edition: ${query.game}` };
        }
        settings().setEdition(query.game as GameEdition);
        return { ok: true, selected_game: query.game };
      },

      "/refresh": async () => {
        const s = settings();
        await runConfig().reloadStyle(s.game, s.starter);
        return { ok: true };
      },

      "/new-run": () => {
        PubSub.publish("@run/cleared");
        return { ok: true };
      },

      "/set-right-panel": (query) => {
        if (!query.panel) return missing("panel");
        const mode = Object.values(RightPanelMode).find((m) => m === query.panel);
        // The queuer sends gen2/gen3's "Battle Graphic" as well as "Automatic";
        // gen1's automatic mode is what both mean.
        const resolved = mode ?? (query.panel === "Battle Graphic" ? RightPanelMode.automatic : null);
        if (!resolved) return { ok: false, status: 400, error: `Unknown panel: ${query.panel}` };
        settings().setRightPanelMode(resolved);
        return { ok: true, right_panel: resolved, right_ui: resolved };
      },

      "/set-splits": (query) => {
        if (!query.mode) return missing("mode");
        const mode = Object.values(SplitsMode).find((m) => m === query.mode);
        if (!mode) return { ok: false, status: 400, error: `Unknown splits mode: ${query.mode}` };
        settings().visualization.right_panel.splits.mode = mode;
        return { ok: true, splits: mode };
      },

      "/set-hidden-power": (query) => {
        if (!query.type) return missing("type");
        runConfig().config.hidden_power = query.type;
        return { ok: true, hpType: query.type };
      },

      "/set-shuckie-counters": (query) => {
        const enabled = asBoolean(query.enabled);
        if (enabled === null) return missing("enabled");
        settings().shuckie.counters = enabled;
        return { ok: true, shuckie_counters: enabled };
      },

      /** gen1 only (the queuer sends none of the generations a timer switch): the same shape as the counters route. */
      "/set-shuckie-timer": (query) => {
        const enabled = asBoolean(query.enabled);
        if (enabled === null) return missing("enabled");
        settings().shuckie.timer = enabled;
        return { ok: true, shuckie_timer: enabled };
      },

      "/set-automatic-post-battle-splits": (query) => {
        const enabled = asBoolean(query.enabled);
        if (enabled === null) return missing("enabled");
        settings().visualization.right_panel.post_battle_splits = enabled;
        return { ok: true, automatic_post_battle_splits: enabled };
      },

      "/set-counters": (query) => {
        const bonk = asBoolean(query.bonk);
        const repel = asBoolean(query.repel_counter);
        const s = settings();
        if (bonk !== null) s.pop_ups.bonks.enabled = bonk;
        if (repel !== null) s.pop_ups.repel.enabled = repel;
        return { ok: true, bonk: s.pop_ups.bonks.enabled, repel_counter: s.pop_ups.repel.enabled };
      },

      /** Main reads and parses the file, a replay or a CSV; `__splits` carries the rows, `__source` the file's name. */
      "/load-split-file": (query) => {
        if (!query.__splits) return missing("file");
        const splits = JSON.parse(query.__splits) as { trainer: string; time: string }[];
        PubSub.publish("@splits/previous_loaded", { rows: splits, name: query.__source ?? null });
        return { ok: true, splits_loaded: splits.length };
      },

      "/set-evolution": () => UNSUPPORTED("/set-evolution"),
      "/set-show-tutor-moves": () => UNSUPPORTED("/set-show-tutor-moves"),
      "/set-unobtainable-moves": () => UNSUPPORTED("/set-unobtainable-moves"),
    },
  };
}
