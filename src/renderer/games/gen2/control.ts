import { manualNewRun } from "~/core/logic/newRunGuard";
import { missing, type ControlReply, type ControlRoutes } from "~/core/control/useControlServer";

/**
 * gen2's control-server route table (plan 2.4; docs/external-contracts.md section 2),
 * lifted from the `http.createServer` block in its `mounted`. The socket now lives in
 * the main process (plan 1.8); the handlers and the reply shapes are gen2's, verbatim.
 *
 * `vm` is the overlay component instance -- every route reads and writes its fields.
 *
 * `/load-split-file` read the CSV with `require("fs")` from the absolute path the queuer
 * sent; the main process reads that path now (src/main/control-server.ts) and hands the
 * parsed rows over, so the route only stores them.
 * `/reload` and `/quit` keep their 200 ms delay so the reply is written first.
 */
export function gen2ControlRoutes(vm: () => any): ControlRoutes {
    const bad = (error: string): ControlReply => ({ ok: false, status: 400, error });
    return {
        status: () => {
            const v = vm();
            return {
                ready: v?.ready ?? false,
                starter: v?.starter,
                gameName: v?.game?.properties?.meta?.gameName?.value,
                selected_game: v?.game_selection,
                // The preference. The queuer sets and checks "Battle Graphic" for gen2, so Automatic keeps that
                // name here (docs/external-contracts.md); `right_panel_active` is what shows now (a post-battle Splits).
                right_panel: v?.right_panel == "Automatic" ? "Battle Graphic" : v?.right_panel,
                right_panel_active: v?.right_panel_mode,
                bonk: v?.bonk,
                repel_counter: v?.repel_counter,
                splits: v?.toggle_compare_splits,
                hpType: v?.hpType,
                shuckie_counters: v?.shuckie_counters,
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
            "/refresh": () => {
                vm().load_all_settings();
                return { ok: true };
            },
            "/new-run": () => {
                const v = vm();
                // Ignored while a replay records with the Shuckie timer on (core/logic/newRunGuard.ts).
                if (!manualNewRun(v.shuckie_timer, v.emulatorStats, "/new-run", () => v.newRun())) {
                    return { ok: true, ignored: true, reason: "Super Shuckie is recording a replay" };
                }
                return { ok: true };
            },
            "/set-right-panel": (query) => {
                if (!query.panel) return missing("panel");
                // Old values map to the modes (core/overlay/rightPanelMode.ts); the reply names Automatic as /status does.
                const mode = vm().set_right_panel(query.panel);
                return { ok: true, right_panel: mode == "Automatic" ? "Battle Graphic" : mode };
            },
            "/set-counters": (query) => {
                if (query.bonk !== undefined) vm().bonk = query.bonk === "true";
                if (query.repel_counter !== undefined) vm().repel_counter = query.repel_counter === "true";
                return { ok: true, bonk: vm().bonk, repel_counter: vm().repel_counter };
            },
            "/set-splits": (query) => {
                if (!query.mode) return missing("mode");
                vm().toggle_compare_splits = query.mode;
                return { ok: true, splits: vm().toggle_compare_splits };
            },
            /** Main reads and parses the CSV; `__splits` carries the parsed rows (src/main/control-server.ts). */
            "/load-split-file": (query) => {
                if (!query.__splits) return missing("file");
                const results = JSON.parse(query.__splits) as { trainer: string; time: string }[];
                vm().previous_splits = results;
                vm().previous_splits_source = query.__source ?? null;
                return { ok: true, splits_loaded: results.length };
            },
            "/set-hidden-power": (query) => {
                if (!query.type) return missing("type");
                vm().hpType = query.type;
                return { ok: true, hpType: vm().hpType };
            },
            "/set-shuckie-counters": (query) => {
                if (query.enabled === undefined) return missing("enabled");
                vm().shuckie_counters = query.enabled === "true";
                return { ok: true, shuckie_counters: vm().shuckie_counters };
            },
            "/set-game": (query) => {
                if (!query.game) return missing("game");
                vm().game_selection = query.game;
                return { ok: true, selected_game: vm().game_selection };
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
