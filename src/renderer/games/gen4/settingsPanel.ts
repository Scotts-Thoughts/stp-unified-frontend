import { manualNewRun } from "~/core/logic/newRunGuard";
import { IV_MODE } from "~/core/logic/starterIvs";
import { panelThemeControl } from "~/core/settings/theme";
import type { SettingControl, SettingsGroup, SettingsPanelSpec } from "~/core/settings/types";
import { slug } from "~/core/shortcuts/build";
import { gen4Manifest } from "./manifest";

/**
 * gen4's settings panel as data (docs/ui-uniformity-plan.md stages 3-4): the four shared columns,
 * Run · Solo Pokémon · Style · Display, rendered by core/settings/SettingsPanel.vue, and the same list
 * gives the controls' shortcut actions (actions.ts). Ids are the action ids the controls had before
 * (persisted: never rename one).
 *
 * `vm` is the overlay instance. Every get/set/run touches the field or calls the method the old
 * template control did, so watchers and saving behave as they always did. The pieces that stay as
 * markup in Overlay.vue are the `slot` controls (the IV block the manual-IV harness drives by class,
 * the nature grid, the Pokemon Editor, the Style Settings box).
 */

// [field suffix, location - species] per encounter box, in the order the old columns listed them.
const PLATINUM_ENCOUNTERS: [string, string][] = [
    ["route_201", "Route 201"],
    ["route_202", "Route 202"],
    ["route_203", "Route 203"],
    ["oreburgh_gate", "Oreburgh Gate"],
    ["oreburgh_mine", "Oreburgh Mine"],
];
const PLATINUM_HM_ENCOUNTERS: [string, string][] = [
    ["route_201_bidoof", "Route 201 - Bidoof"],
    ["route_201_starly", "Route 201 - Starly"],
    ["route_202_bidoof", "Route 202 - Bidoof"],
    ["route_202_starly", "Route 202 - Starly"],
    ["route_203_abra", "Route 203 - Abra"],
    ["oreburgh_gate_zubat", "Oreburgh Gate - Zubat"],
    ["oreburgh_gate_geodude", "Oreburgh Gate - Geodude"],
    ["oreburgh_gate_psyduck", "Oreburgh Gate - Psyduck"],
    ["route_207_machop", "Route 207 - Machop"],
    ["route_207_geodude", "Route 207 - Geodude"],
    ["oreburgh_mine_geodude", "Oreburgh Mine - Geodude"],
    ["route_208_bibarel", "Route 208 - Bibarel"],
    ["route_213_buizel", "Route 213 - Buizel"],
];
const HGSS_ENCOUNTERS: [string, string][] = [
    ["route_29", "Route 29"],
    ["route_30", "Route 30"],
    ["sprout_tower", "Sprout Tower"],
];
const HGSS_HM_ENCOUNTERS: [string, string][] = [
    ["route_29_sentret", "Route 29 - Sentret"],
    ["route_29_rattata", "Route 29 - Rattata"],
    ["route_29_pidgey", "Route 29 - Pidgey"],
    ["route_30_rattata", "Route 30 - Rattata"],
    ["route_30_pidgey", "Route 30 - Pidgey"],
    ["route_31_bellsprout", "Route 31 - Bellsprout"],
    ["route_31_rattata", "Route 31 - Rattata"],
    ["route_31_pidgey", "Route 31 - Pidgey"],
    ["route_32_rattata", "Route 32 - Rattata"],
    ["route_32_wooper", "Route 32 - Wooper"],
    ["union_cave_sandshrew", "Union Cave - Sandshrew"],
    ["route_34_drowzee", "Route 34 - Drowzee"],
];

/** The nature grid's stats (`natureStats` in Overlay.vue), keys as `selectNatureRaise`/`Lower` take them. */
const NATURE_STATS = ["Attack", "Defense", "Special Attack", "Special Defense", "Speed"];

/** A select's option values: the old template bound each as `${value}`, so they are strings. */
function strings(values: readonly unknown[]): string[] {
    return values.map((v) => `${v}`);
}

function flag(vm: any, id: string, label: string, field: string, extra: Partial<SettingControl> = {}): SettingControl {
    return { kind: "toggle", id, label, get: () => vm[field], set: (v) => { vm[field] = v; }, ...extra } as SettingControl;
}

function slider(vm: any, field: string, label: string, min: number, max: number, step = 1): SettingControl {
    return { kind: "slider", id: `slider.${field}`, label, min, max, step, noAction: true, get: () => Number(vm[field]), set: (v) => { vm[field] = v; } };
}

export function gen4SettingsPanel(vm: any): SettingsPanelSpec {
    const gameName = () => vm.game?.properties?.meta?.game_name?.value;
    const platinum = () => gameName() == "Platinum";
    const hgss = () => gameName() == "HeartGold and SoulSilver";
    // The RNG button's own test also falls back to the picked box art before a game is read.
    const rngPlatinum = () => (gameName() || vm.selected_game) == "Platinum";
    const familyStyle = () => vm.evolution == true && vm.evolution_family_list.length > 1;
    const automaticIvs = () => vm.iv_mode == IV_MODE.automatic;
    const team0 = () => vm.game.properties.player.team[0];
    const species = () => vm.displayedPokemonSpecies;
    const abilities = (): string[] => vm.g4PokemonData[species()]?.abilities ?? [];
    const inBattle = () => vm.game.properties.meta.state.value == "Battle";
    const evBenefit = (stat: string) => (inBattle() ? "" : `(+${vm.calculate_ev_benefit(stat)})`);
    const evs = () => team0().evs;

    const encounterToggles = (list: [string, string][], prefix: "encounters" | "hm", idBase: string, game: string, available: () => boolean) =>
        list.map(([field, label]) =>
            flag(vm, `${idBase}.${field}`, label, `${prefix}_${field}`, { actionLabel: `${label} (${game})`, available }),
        );

    const run: SettingsGroup[] = [
        {
            title: "Game",
            controls: [
                {
                    kind: "component", id: "game.edition", component: "edition-picker", noAction: true,
                    props: () => ({ editions: gen4Manifest.editions.filter((e) => !e.devOnly || vm.isInDevMode), modelValue: vm.selected_game }),
                    on: { "update:modelValue": (v: string) => { vm.selected_game = v; } },
                },
                { kind: "button", id: "run.new", label: "New Run", variant: "primary", run: () => manualNewRun(vm.shuckie_timer, vm.emulatorStats, "button", () => vm.newRun()) },
            ],
        },
        {
            title: "Timer",
            controls: [
                { kind: "button", id: "timer.play_pause", label: "Play/Pause", run: () => vm.pauseUnpauseTime() },
                { kind: "button", id: "timer.set", label: "Set Timer", run: () => vm.set_timer() },
                {
                    kind: "text", id: "timer.offset", label: "Start Time Offset", placeholder: "00:00:00.00", noAction: true,
                    get: () => vm.timer_startTimeOffset, set: (v) => { vm.timer_startTimeOffset = v; },
                    button: { id: "timer.clear_offset", label: "Clear", actionLabel: "Clear Start Time Offset", run: () => { vm.timer_startTimeOffset = "00:00:00.00"; } },
                },
            ],
        },
        {
            title: "Files",
            heading: "",
            controls: [
                { kind: "button", id: "splits.open_folder", label: "Open Splits Folder", run: () => vm.openCurrentSplitsFolder() },
                { kind: "button", id: "shortcuts.open", label: "Keyboard Shortcuts", noAction: true, run: () => vm.open_shortcuts_menu() },
            ],
        },
        {
            title: "Readouts",
            controls: [
                { kind: "readout", id: "readout.party", label: "Player Party Count", value: () => (vm.game.properties.player.team_count.value > 6 ? 0 : vm.game.properties.player.team_count.value) },
                { kind: "readout", id: "readout.hp", label: "Overworld HP", value: () => `${team0().stats.hp.value} / ${team0().stats.hp_max.value}` },
                { kind: "readout", id: "readout.status", label: "Status", value: () => team0().status_condition.value ?? "None" },
                {
                    kind: "statGrid", id: "readout.evs", label: "EVs",
                    items: () => [
                        { label: "HP", value: evs().hp, extra: evBenefit("hp") },
                        { label: "Spe", value: evs().speed, extra: evBenefit("speed") },
                        { label: "Atk", value: evs().attack, extra: evBenefit("attack") },
                        { label: "SpA", value: evs().special_attack, extra: evBenefit("special_attack") },
                        { label: "Def", value: evs().defense, extra: evBenefit("defense") },
                        { label: "SpD", value: evs().special_defense, extra: evBenefit("special_defense") },
                    ],
                },
                { kind: "readout", id: "readout.ev_total", label: "EV Total", value: () => vm.get_effort_values() },
            ],
        },
        {
            title: "Advanced",
            controls: [
                flag(vm, "settings.show_advanced", "Show Advanced Settings", "show_advanced_settings"),
                flag(vm, "shuckie.timer", "Shuckie Timer", "shuckie_timer", { tier: "advanced" }),
                flag(vm, "shuckie.counters", "Shuckie Counters", "shuckie_counters", { tier: "advanced" }),
                flag(vm, "shuckie.bookmarks", "Shuckie Bookmarks", "shuckie_bookmarks", { tier: "advanced" }),
                flag(vm, "display.post_battle_splits", "Automatic Post-Battle Splits", "automatic_post_battle_splits", { tier: "advanced" }),
                flag(vm, "settings.editor", "Pokemon Editor", "editor", { tier: "advanced", noAction: true }),
                flag(vm, "settings.debugging_mode", "Debugging", "debugging_mode", { tier: "advanced" }),
            ],
        },
        { title: "Pokemon Editor", tier: "advanced", visible: () => vm.editor == true, controls: [{ kind: "slot", id: "slot.editor", slot: "editor" }] },
        {
            title: "Style Settings",
            tier: "advanced",
            visible: () => vm.debugging_mode == true,
            controls: [{ kind: "slot", id: "slot.devtools", slot: "devtools" }],
        },
        {
            title: "Debugging",
            tier: "advanced",
            visible: () => vm.debugging_mode == true && vm.editor == false,
            controls: [
                { kind: "readout", id: "debug.state", label: "State", value: () => vm.game.properties.meta.state.value },
                { kind: "readout", id: "debug.global_pointer", label: "Global Pointer", value: () => vm.game.properties.meta.global_pointer.value },
                { kind: "readout", id: "debug.team_count", label: "Team Count", value: () => vm.game.properties.player.team_count.value },
                { kind: "readout", id: "debug.delay", label: "Delay", value: () => vm.disallow_delay },
                { kind: "readout", id: "debug.blackout", label: "Blackout", value: () => vm.blackout },
                { kind: "readout", id: "debug.enemy_team_count", label: "Enemy Team Count", value: () => vm.double_battle_team_size },
                { kind: "readout", id: "debug.enemy_graphic", label: "Enemy Graphic", value: () => vm.enemy_graphic },
                { kind: "readout", id: "debug.battle_outcome", label: "Battle Outcome", value: () => vm.game.properties.battle.outcome.value },
                { kind: "readout", id: "debug.final_gametime", label: "Final Gametime", value: () => vm.simple_data[7] },
                { kind: "readout", id: "debug.progress_kanto", label: "Progress Kanto", value: () => vm.kanto_badges },
            ],
        },
    ];

    const solo: SettingsGroup[] = [
        {
            title: "Solo Pokemon",
            heading: "Solo Pokémon",
            controls: [
                {
                    kind: "component", id: "solo.species", component: "species-picker", noAction: true,
                    props: () => ({ modelValue: vm.starter, options: vm.pokemon_list }),
                    on: { "update:modelValue": (v: string) => { vm.starter = vm.normalizeSpeciesName(v); } },
                },
            ],
        },
        {
            title: "Split Comparison",
            controls: [
                { kind: "button", id: "splits.load_comparison", label: "Load Replay / Split File", actionLabel: "Load replay / split file to compare", run: () => vm.load_splits() },
                { kind: "readout", id: "splits.source", label: "Comparing Against", class: "stp-readout-wrap", visible: () => !!vm.previous_splits_source, value: () => vm.previous_splits_source },
                {
                    kind: "button", id: "splits.clear_comparison", label: "Clear Loaded Splits",
                    available: () => vm.previous_splits.length > 0,
                    run: () => { vm.previous_splits = []; vm.previous_splits_source = null; },
                },
                { kind: "choice", id: "splits_compare", label: "Compare Splits", options: ["First", "Followup"], get: () => vm.split_type, set: (v) => { vm.split_type = v; } },
                { kind: "text", id: "splits.previous_label", label: "Previous Column Label", noAction: true, get: () => vm.previous_label, set: (v) => { vm.previous_label = v; } },
                { kind: "text", id: "splits.current_label", label: "Current Column Label", noAction: true, get: () => vm.current_label, set: (v) => { vm.current_label = v; } },
            ],
        },
        {
            title: "Counters",
            controls: [
                { kind: "counter", id: "counter.attempts", label: "Attempt", get: () => vm.attempt_number, increment: () => vm.increment("attempt_number"), decrement: () => vm.decrement("attempt_number") },
                { kind: "counter", id: "counter.finishes", label: "Finished Runs", get: () => vm.finished_run_count, increment: () => vm.increment("finished_run_count"), decrement: () => vm.decrement("finished_run_count") },
                { kind: "counter", id: "counter.resets", label: "Resets", get: () => vm.playerResets, increment: () => vm.increment("playerResets"), decrement: () => vm.decrement("playerResets") },
                { kind: "counter", id: "counter.blackouts", label: "Blackouts", get: () => vm.blackout_counter, increment: () => vm.increment("blackout_counter"), decrement: () => vm.decrement("blackout_counter") },
                { kind: "readout", id: "readout.faults", label: "Faults", value: () => vm.faults },
            ],
        },
        {
            title: "Evolution",
            available: () => !!vm.hasMultipleEvolutionStages,
            controls: [
                flag(vm, "evolution.enabled", "Evolution", "evolution"),
                {
                    kind: "choice", id: "evolution.family_style", label: "Evolution Family Style", actions: "cycle", available: familyStyle,
                    placeholder: "Select a species in the evolution family",
                    options: () => strings(vm.evolution_family_list),
                    get: () => `${vm.selected_evolution_species}`, set: (v) => { vm.selected_evolution_species = v; },
                },
                { kind: "button", id: "evolution.unify_styles", label: "Unify Styles", available: familyStyle, run: () => vm.copyCurrentStylesToAllFamilyMembers() },
            ],
        },
        {
            title: "IVs",
            controls: [
                { kind: "choice", id: "ivs.mode", label: "IVs", options: [IV_MODE.automatic, IV_MODE.manual], get: () => vm.iv_mode, set: (v) => { vm.iv_mode = v; } },
                {
                    kind: "choice", id: "hidden_power.type", label: "Hidden Power", actions: "cycle", available: automaticIvs,
                    actionLabel: "Hidden Power type", placeholder: "Select a Hidden Power type",
                    options: () => strings(vm.values_function(vm.hiddenPowerTypes)),
                    get: () => `${vm.hidden_power_type}`, set: (v) => { vm.hidden_power_type = v; },
                },
                {
                    kind: "choice", id: "hidden_power.index", actions: "cycle", available: automaticIvs,
                    actionLabel: "Hidden Power index", placeholder: "Select a Hidden Power index",
                    options: () => (vm.hiddenpowers[vm.hidden_power_type] ?? []).map((key: unknown, index: number) => ({ value: `${index}`, label: `${key}` })),
                    get: () => `${vm.hidden_power_index}`, set: (v) => { vm.hidden_power_index = v; },
                },
                { kind: "slot", id: "slot.ivs", slot: "ivs" },
            ],
        },
        {
            title: "Ability & Gender",
            controls: [
                {
                    kind: "choice", id: "ability", label: () => `Ability (${species()} Has ${abilities().length})`, actionLabel: "Ability", actions: "cycle",
                    placeholder: "Select an ability",
                    options: () => strings(vm.values_function(abilities())),
                    get: () => `${vm.pkmn_ability}`, set: (v) => { vm.pkmn_ability = v; },
                },
                { kind: "readout", id: "readout.ability_slot", label: "Ability Slot", value: () => (abilities().length ? abilities().indexOf(vm.pkmn_ability) + 1 : 0) },
                { kind: "choice", id: "gender", label: "Gender", options: ["Female", "Male"], get: () => vm.pkmn_gender, set: (v) => { vm.pkmn_gender = v; } },
            ],
        },
        {
            title: "Nature",
            controls: [
                {
                    kind: "choice", id: "nature", label: "Nature", actions: "cycle", placeholder: "Select a Nature",
                    options: () => vm.values_function(vm.simple_natures).map((key: unknown) => ({ value: `${key}`, label: vm.natureLabels(`${key}`) })),
                    get: () => `${vm.pkmnNature}`, set: (v) => { vm.pkmnNature = v; },
                },
                { kind: "slot", id: "slot.nature_grid", slot: "natureGrid" },
                {
                    kind: "actions", id: "nature.grid",
                    actions: () => [
                        ...NATURE_STATS.map((stat) => ({ id: `nature.raise.${slug(stat)}`, label: `Nature +: ${stat}`, group: "Nature", run: () => vm.selectNatureRaise(stat) })),
                        ...NATURE_STATS.map((stat) => ({ id: `nature.lower.${slug(stat)}`, label: `Nature -: ${stat}`, group: "Nature", run: () => vm.selectNatureLower(stat) })),
                    ],
                },
            ],
        },
        {
            title: "Run Rules",
            controls: [flag(vm, "settings.hp_banned_first_run", "HP Banned for 1st Run", "banned_hidden_power")],
        },
        {
            title: "Encounters",
            controls: [
                flag(vm, "encounters.catch_rate", "Guaranteed Catches", "catch_rate"),
                { kind: "button", id: "rng.open", label: "RNG Trips", actionLabel: "RNG (Platinum)", available: rngPlatinum, run: () => vm.openRNGModal() },
                ...encounterToggles(PLATINUM_ENCOUNTERS, "encounters", "encounters", "Platinum", platinum),
                ...encounterToggles(HGSS_ENCOUNTERS, "encounters", "encounters", "HGSS", hgss),
            ],
        },
        {
            title: "Forced HM Users",
            available: () => platinum() || hgss(),
            controls: [
                ...encounterToggles(PLATINUM_HM_ENCOUNTERS, "hm", "hm_encounters", "Platinum", platinum),
                ...encounterToggles(HGSS_HM_ENCOUNTERS, "hm", "hm_encounters", "HGSS", hgss),
            ],
        },
    ];

    const style: SettingsGroup[] = [
        { title: "Panel", controls: [panelThemeControl()] },
        {
            title: "UI Color",
            controls: [
                { kind: "button", id: "style.color_picker", label: "Color Picker", noAction: true, run: () => vm.color_picker() },
                slider(vm, "ui_saturation", "Saturation", 0, 2, 0.1),
            ],
        },
        {
            title: "Pokemon Image",
            heading: "Pokémon Image",
            controls: [
                slider(vm, "imageXOffset", "X-Offset", -600, 600),
                slider(vm, "imageYOffset", "Y-Offset", -600, 600),
                slider(vm, "imageScale", "Scale", 0.2, 2.5, 0.01),
                slider(vm, "imageSat", "Saturation", 90, 150),
                slider(vm, "imageRotation", "Rotation", -180, 180, 0.01),
                flag(vm, "style.artwork_flip", "Flip", "imageFlip", { actionLabel: "Pokemon Image Flip" }),
                { kind: "button", id: "style.reset_pokemon", label: "Reset Pokemon Settings", run: () => vm.resetPokemon() },
            ],
        },
        {
            title: "Background",
            controls: [
                {
                    kind: "choice", id: "style.background_texture", label: "Texture", actionLabel: "Background Texture", actions: "cycle",
                    options: () => vm.dropdownDownMenuKeys.textures,
                    get: () => vm.backgroundTexture, set: (v) => { vm.backgroundTexture = v; },
                },
                slider(vm, "backgroundXOffset", "X-Offset", -400, 400),
                slider(vm, "backgroundYOffset", "Y-Offset", -400, 400),
                slider(vm, "backgroundScale", "Scale", 50, 300),
                slider(vm, "backgroundBrightness", "Brightness", 0, 200),
                slider(vm, "backgroundContrast", "Contrast", 0, 200),
                slider(vm, "backgroundSaturation", "Saturation", 0, 200),
                slider(vm, "backgroundBlur", "Blur", 0, 10, 0.1),
                slider(vm, "backgroundHue", "Hue", 0, 358),
                flag(vm, "style.background_flip_x", "Flip X", "backgroundFlip", { actionLabel: "Background Flip X" }),
                // The legacy field names are crossed: `backgroundXFlip` is the vertical flip (as in gens 2-3).
                flag(vm, "style.background_flip_y", "Flip Y", "backgroundXFlip", { actionLabel: "Background Flip Y" }),
            ],
        },
    ];

    const display: SettingsGroup[] = [
        {
            title: "Display",
            controls: [
                {
                    kind: "choice", id: "stats", label: "Stats", actionLabel: "Stats",
                    options: [
                        "Automatic",
                        "Base Stats",
                        { value: "Base Stats Average", label: "Base Stat Averages", slug: "base_stats_average" },
                        { value: "Base Stats Median", label: "Base Stat Medians", slug: "base_stats_median" },
                        "IVs",
                        "EVs",
                        "Detailed EVs",
                        "Vitamins",
                    ],
                    get: () => vm.stats_setting, set: (v) => { vm.stats_setting = v; },
                },
                // Decision 27: a pick also ends a post-battle Splits (core/overlay/rightPanelMode.ts).
                { kind: "choice", id: "right_panel", label: "Right Panel", options: ["Automatic", "Movepool", "Splits", "Trainers"], get: () => vm.right_ui, set: (v) => { vm.set_right_panel(v); } },
                // Decision 30: the wild panel in wild battles (Automatic / Trainers), off by default.
                flag(vm, "display.wild_battles", "Show Wild Battles", "show_wild_battles"),
                // The enemy team in the order the trainer's AI sends it out (core/logic/sendOutOrder.ts), on by default.
                flag(vm, "display.send_out_order", "Predicted Send-Out Order", "send_out_order"),
                {
                    kind: "choice", id: "display.unobtainable_moves", label: "Unobtainable Moves",
                    options: ["Never Cross Out", "Cross Out When Starter is Obtained", "Cross Out After First Badge", "Always Cross Out"],
                    get: () => vm.unobtainable_moves_toggle, set: (v) => { vm.unobtainable_moves_toggle = v; },
                },
            ],
        },
        {
            // Decision 14: the trainer the "Trainers" right panel previews.
            title: "Trainers",
            available: () => vm.right_ui == "Trainers",
            controls: [
                { kind: "text", id: "trainers.search", label: "Search Trainers", placeholder: "Search for a trainer", noAction: true, get: () => vm.search_trainers, set: (v) => { vm.search_trainers = v; } },
                {
                    kind: "choice", id: "trainers.examined", label: "Trainer", actions: "cycle",
                    options: () => vm.filtered_trainer_list, get: () => vm.examined_trainer, set: (v) => { vm.examined_trainer = v; },
                },
            ],
        },
        {
            title: "Toggles",
            controls: [flag(vm, "display.show_tutor_moves", "Show Tutor Moves", "show_tutor_moves")],
        },
    ];

    return {
        columns: [
            { groups: run },
            { groups: solo },
            { groups: style },
            { groups: display },
        ],
        showAdvanced: () => !!vm.show_advanced_settings,
        isDev: () => !!vm.isInDevMode,
        tint: () => vm.overlay_color,
    };
}
