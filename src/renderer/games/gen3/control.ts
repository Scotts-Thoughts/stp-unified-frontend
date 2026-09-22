import { missing, type ControlReply, type ControlRoutes } from "~/core/control/useControlServer";

/**
 * gen3's control-server route table (plan 2.4; docs/external-contracts.md section 2),
 * lifted from the `http.createServer` block in its `mounted`. The socket now lives in
 * the main process (plan 1.8); the handlers and the reply shapes are gen3's, verbatim.
 *
 * `vm` is the overlay component instance -- every route reads and writes its fields.
 *
 * gen3's own field names: `/set-starter` writes `starterString`, `/refresh` reloads the
 * sprite settings of the current starter, `/set-right-panel` writes `right_panel`,
 * `/set-splits` writes `splits_display`, `/set-game` writes `gameSelection`,
 * `/set-show-tutor-moves` writes `tutor_moves`; `/status` reports `starterString`,
 * `gameSelection` (twice, as `selected_game` too) and `right_panel`.
 *
 * `/load-split-file` read the CSV with `require("fs")` from the absolute path the queuer
 * sent; the main process reads that path now (src/main/control-server.ts) and hands the
 * parsed rows over, so the route only stores them.
 * `/reload` and `/quit` keep their 200 ms delay so the reply is written first.
 */
export function gen3ControlRoutes(vm: () => any): ControlRoutes {
    const bad = (error: string): ControlReply => ({ ok: false, status: 400, error });
    const abilityKey = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return {
        status: () => {
            const v = vm();
            return {
                ready: v?.ready ?? false,
                starterString: v?.starterString,
                evolution: v?.evolution,
                evolution_splits_label: v?.evolution_splits_label,
                selected_evolution_species: v?.selected_evolution_species,
                gameSelection: v?.gameSelection,
                selected_game: v?.gameSelection,
                right_panel: v?.right_panel,
                hidden_power_type: v?.hidden_power_type,
                nature: v?.pkmnNature,
                ability: v?.pkmn_ability,
                splits: v?.splits_display,
                shuckie_counters: v?.shuckie_counters,
                show_tutor_moves: v?.tutor_moves,
                unobtainable_moves_toggle: v?.unobtainable_moves_toggle,
                automatic_post_battle_splits: v?.automatic_post_battle_splits,
            };
        },
        routes: {
            "/set-starter": (query) => {
                if (!query.species) return missing("species");
                vm().starterString = query.species;
                return { ok: true, starterString: vm().starterString };
            },
            "/set-evolution": (query) => {
                const v = vm();
                const enabled = query.enabled === "true";
                v.evolution = enabled;
                if (enabled && query.species) {
                    v.selected_evolution_species = query.species;
                }
                return { ok: true, evolution: v.evolution, selected_evolution_species: v.selected_evolution_species };
            },
            "/refresh": () => {
                vm().load_pokemon_sprite_settings(vm().starterString);
                return { ok: true };
            },
            "/new-run": () => {
                vm().newRun();
                return { ok: true };
            },
            "/set-right-panel": (query) => {
                if (!query.panel) return missing("panel");
                vm().right_panel = query.panel;
                return { ok: true, right_panel: vm().right_panel };
            },
            "/set-hidden-power": (query) => {
                if (!query.type) return missing("type");
                vm().hidden_power_type = query.type;
                return { ok: true, hidden_power_type: vm().hidden_power_type };
            },
            /** gen3's route (its 2026-09 working tree): the Nature dropdown, validated against `simple_natures`. */
            "/set-nature": (query) => {
                const v = vm();
                if (!query.nature || !Object.values(v.simple_natures).includes(query.nature)) return bad("Missing or invalid nature parameter");
                v.pkmnNature = query.nature;
                return { ok: true, nature: v.pkmnNature };
            },
            /**
             * The Abilities dropdown (legacy 2026-09-20 addition, ported to gen3/4/5). The name is
             * matched against the current starter's abilities ignoring case and spacing
             * ("Lightning Rod" == "Lightningrod" == the queuer's pokedex spelling) and stored
             * under this overlay's own spelling, so the per-starter storage and the
             * evolution-line slot remap keep working. Set before `/refresh`, like the nature.
             */
            "/set-ability": (query) => {
                const v = vm();
                const abilities: string[] = v.game_data?.dexData?.[v.starterString]?.abilities ?? [];
                const ability = query.ability ? abilities.find((a) => abilityKey(a) === abilityKey(query.ability)) : undefined;
                if (!ability) return bad(`Missing or invalid ability parameter (${v.starterString} has: ${abilities.join(", ") || "no abilities listed"})`);
                v.pkmn_ability = ability;
                return { ok: true, ability: v.pkmn_ability };
            },
            "/set-splits": (query) => {
                if (!query.mode) return missing("mode");
                vm().splits_display = query.mode;
                return { ok: true, splits: vm().splits_display };
            },
            /** Main reads and parses the CSV; `__splits` carries the parsed rows (src/main/control-server.ts). */
            "/load-split-file": (query) => {
                if (!query.__splits) return missing("file");
                const results = JSON.parse(query.__splits) as { trainer: string; time: string }[];
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
                vm().gameSelection = query.game;
                return { ok: true, selected_game: vm().gameSelection };
            },
            "/set-show-tutor-moves": (query) => {
                if (query.enabled === undefined) return missing("enabled");
                vm().tutor_moves = query.enabled === "true";
                return { ok: true, tutor_moves: vm().tutor_moves };
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
