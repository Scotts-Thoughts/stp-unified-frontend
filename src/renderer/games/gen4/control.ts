import { readSplitCsv } from "~/core/persistence/splitFiles";
import { setUserState } from "~/core/persistence/userState";
import { missing, type ControlReply, type ControlRoutes } from "~/core/control/useControlServer";
import { MyStorage } from "./storage";

/**
 * gen4's control-server route table (plan 2.4; docs/external-contracts.md section 2),
 * lifted from the `http.createServer` block in its `mounted`. The socket now lives in
 * the main process (plan 1.8); the handlers and the reply shapes are gen4's, verbatim.
 *
 * `vm` is the overlay component instance -- every route reads and writes its fields.
 *
 * gen4's own routes and names: `/set-evolution` (evolution mode + the family species,
 * persisted under `<game>_<starter>`), `/set-right-panel` writes `right_ui` and
 * replies with it, `/set-splits` writes `split_type`, `/set-hidden-power` writes
 * `hidden_power_type`, `/set-show-tutor-moves`, and no `/set-counters`.
 *
 * Two routes differ in mechanism only: `/load-split-file` read the CSV with
 * `require("fs")` from an absolute path the queuer sent; it now goes through the
 * splits IPC, which resolves the path against the app root and refuses to escape it.
 * `/set-evolution` wrote the bare `<game>_<starter>` key straight to `localStorage`,
 * past the style manager; it writes the same key to the user state, past the store.
 * `/reload` and `/quit` keep their 200 ms delay so the reply is written first.
 */
export function gen4ControlRoutes(vm: () => any): ControlRoutes {
    const bad = (error: string): ControlReply => ({ ok: false, status: 400, error });
    return {
        status: () => {
            const v = vm();
            return {
                ready: v?.ready ?? false,
                starter: v?.starter,
                evolution: v?.evolution,
                evolution_splits_label: v?.evolution_splits_label,
                selected_evolution_species: v?.selected_evolution_species,
                gameName: v?.game?.properties?.meta?.game_name?.value,
                selected_game: v?.selected_game,
                right_ui: v?.right_ui,
                hidden_power_type: v?.hidden_power_type,
                splits: v?.split_type,
                shuckie_counters: v?.shuckie_counters,
                show_tutor_moves: v?.show_tutor_moves,
                unobtainable_moves_toggle: v?.unobtainable_moves_toggle,
                automatic_post_battle_splits: v?.automatic_post_battle_splits,
            };
        },
        routes: {
            "/set-starter": (query) => {
                if (!query.species) return missing("species");
                vm().starter = query.species;
                return { ok: true, starter: vm().starter };
            },
            "/set-evolution": (query) => {
                const v = vm();
                const enabled = query.enabled === "true";
                v.evolution = enabled;
                if (enabled && query.species) {
                    v.selected_evolution_species = query.species;
                }
                // Save evolution to storage so it persists after refresh
                const game_name = v.game?.properties.meta.game_name.value;
                if (game_name && v.starter) {
                    const storageKey = `${game_name}_${v.starter}`;
                    if (!MyStorage[storageKey]) {
                        MyStorage[storageKey] = {};
                    }
                    MyStorage[storageKey].evolution = enabled;
                    if (enabled && query.species) {
                        MyStorage[storageKey].selected_evolution_species = query.species;
                    }
                    setUserState(storageKey, MyStorage[storageKey]);
                }
                return { ok: true, evolution: v.evolution, selected_evolution_species: v.selected_evolution_species };
            },
            "/refresh": () => {
                vm().load_all_settings();
                return { ok: true };
            },
            "/new-run": () => {
                vm().newRun();
                return { ok: true };
            },
            "/set-right-panel": (query) => {
                if (!query.panel) return missing("panel");
                vm().right_ui = query.panel;
                return { ok: true, right_ui: vm().right_ui };
            },
            "/set-hidden-power": (query) => {
                if (!query.type) return missing("type");
                vm().hidden_power_type = query.type;
                return { ok: true, hidden_power_type: vm().hidden_power_type };
            },
            "/set-splits": (query) => {
                if (!query.mode) return missing("mode");
                vm().split_type = query.mode;
                return { ok: true, splits: vm().split_type };
            },
            "/load-split-file": async (query) => {
                if (!query.file) return missing("file");
                const csvText = (await readSplitCsv(query.file)) ?? "";
                const rows = csvText.split("\n").slice(1).filter((x) => x !== "");
                const results: { trainer: string; time: string }[] = [];
                for (const row of rows) {
                    const columns = row.split(",");
                    results.push({ trainer: columns[2], time: columns[3] });
                }
                vm().previous_splits = results;
                return { ok: true, splits_loaded: results.length };
            },
            "/set-shuckie-counters": (query) => {
                if (query.enabled === undefined) return missing("enabled");
                vm().shuckie_counters = query.enabled === "true";
                return { ok: true, shuckie_counters: vm().shuckie_counters };
            },
            "/set-game": (query) => {
                if (!query.game) return missing("game");
                vm().selected_game = query.game;
                return { ok: true, selected_game: vm().selected_game };
            },
            "/set-show-tutor-moves": (query) => {
                if (query.enabled === undefined) return missing("enabled");
                vm().show_tutor_moves = query.enabled === "true";
                return { ok: true, show_tutor_moves: vm().show_tutor_moves };
            },
            "/set-unobtainable-moves": (query) => {
                const validModes = ['Never Cross Out', 'Cross Out When Starter is Obtained', 'Cross Out After First Badge', 'Always Cross Out'];
                if (!query.mode || !validModes.includes(query.mode)) return bad("Missing or invalid mode parameter");
                vm().unobtainable_moves_toggle = query.mode;
                return { ok: true, unobtainable_moves_toggle: vm().unobtainable_moves_toggle };
            },
            "/set-automatic-post-battle-splits": (query) => {
                if (query.enabled === undefined) return missing("enabled");
                vm().automatic_post_battle_splits = query.enabled === "true";
                return { ok: true, automatic_post_battle_splits: vm().automatic_post_battle_splits };
            },
            "/reload": () => {
                setTimeout(() => { location.reload(); }, 200);
                return { ok: true, message: "Reloading overlay..." };
            },
            "/quit": () => {
                setTimeout(() => { window.close(); }, 200);
                return { ok: true, message: "Quitting overlay..." };
            },
        },
    };
}
