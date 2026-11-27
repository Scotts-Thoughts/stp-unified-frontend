import { manualNewRun } from "~/core/logic/newRunGuard";
import { missing, type ControlReply, type ControlRoutes } from "~/core/control/useControlServer";

/**
 * The 3DS overlay's control-server route table (docs/external-contracts.md §2), with gen5's route names, reply
 * shapes and `/status` fields, so the queuer's gen 4/5 branches fit it. `vm` is the overlay component instance.
 *
 * Three routes exist only to answer: `/set-hidden-power`, `/set-nature` and `/set-ability` set what gens 3-5 write
 * into the ROM's starter. The 3DS games are unpatched and the overlay shows the party's own nature, ability and
 * Hidden Power, so there is nothing to set: they reply `{ ok: false, unsupported: true }`, as gen1 does for
 * `/set-evolution`. `/status` still reports `nature`, `ability` and `hidden_power_type`, read from the party.
 */
export function threeDsControlRoutes(vm: () => any): ControlRoutes {
    const bad = (error: string): ControlReply => ({ ok: false, status: 400, error });
    const unsupported = (what: string): ControlReply => ({ ok: false, unsupported: true, error: `${what} is read from the game in the 3DS overlay` });
    return {
        status: () => {
            const v = vm();
            return {
                ready: v?.ready ?? false,
                starter: v?.starter,
                evolution: v?.evolution,
                evolution_splits_label: v?.evolution_splits_label,
                selected_evolution_species: v?.displayed_species,
                gameName: v?.game?.properties?.meta?.game_name?.value,
                selected_game: v?.selected_game,
                right_ui: v?.right_ui,
                right_panel_active: v?.right_panel_mode,
                hidden_power_type: v?.solo?.hiddenPower ?? null,
                nature: v?.solo?.nature ?? null,
                ability: v?.solo?.ability ?? null,
                splits: v?.toggle_compare_splits,
                shuckie_counters: v?.shuckie_counters,
                show_tutor_moves: v?.show_tutor_moves,
                unobtainable_moves_toggle: v?.unobtainable_moves_toggle,
                automatic_post_battle_splits: v?.automatic_post_battle_splits,
            };
        },
        routes: {
            "/set-starter": (query) => {
                if (!query.species) return missing("species");
                vm().setStarter(query.species);
                return { ok: true, starter: vm().starter };
            },
            "/set-evolution": (query) => {
                const v = vm();
                v.evolution = query.enabled === "true";
                return { ok: true, evolution: v.evolution, selected_evolution_species: v.displayed_species };
            },
            "/refresh": () => {
                vm().load_all_settings();
                return { ok: true };
            },
            "/new-run": () => {
                const v = vm();
                if (!manualNewRun(v.shuckie_timer, v.emulatorStats, "/new-run", () => v.newRun())) {
                    return { ok: true, ignored: true, reason: "Super Shuckie is recording a replay" };
                }
                return { ok: true };
            },
            "/set-right-panel": (query) => {
                if (!query.panel) return missing("panel");
                return { ok: true, right_ui: vm().set_right_panel(query.panel) };
            },
            "/set-hidden-power": () => unsupported("Hidden Power"),
            "/set-nature": () => unsupported("The nature"),
            "/set-ability": () => unsupported("The ability"),
            "/set-splits": (query) => {
                if (!query.mode) return missing("mode");
                vm().toggle_compare_splits = query.mode;
                return { ok: true, splits: vm().toggle_compare_splits };
            },
            /** Main reads and parses the CSV or replay; `__splits` carries the parsed rows (src/main/control-server.ts). */
            "/load-split-file": (query) => {
                if (!query.__splits) return missing("file");
                const results = JSON.parse(query.__splits) as { trainer: string; time: string }[];
                vm().previous_splits = results;
                vm().previous_splits_source = query.__source ?? null;
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
                const validModes = ["Never Cross Out", "Cross Out When Starter is Obtained", "Cross Out After First Badge", "Always Cross Out"];
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
