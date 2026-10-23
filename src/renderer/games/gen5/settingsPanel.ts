import { manualNewRun } from "~/core/logic/newRunGuard";
import { IV_MODE } from "~/core/logic/starterIvs";
import { panelThemeControl } from "~/core/settings/theme";
import type { SettingControl, SettingsGroup, SettingsPanelSpec } from "~/core/settings/types";
import { slug } from "~/core/shortcuts/build";
import { gen5Manifest } from "./manifest";

/**
 * gen5's settings panel as data (docs/ui-uniformity-plan.md stages 3-4): the four shared columns,
 * Run · Solo Pokémon · Style · Display, rendered by core/settings/SettingsPanel.vue, and the same list
 * gives the controls' shortcut actions (actions.ts). Ids are the action ids the controls had before
 * (persisted: never rename one). Laid out like gen4's (games/gen4/settingsPanel.ts).
 *
 * `vm` is the overlay instance. Every get/set/run touches the field or calls the method the old
 * template control did, so watchers and saving behave as they always did. The pieces that stay as
 * markup in Overlay.vue are the `slot` controls (the IV block the manual-IV harness drives by class,
 * the nature grid, the form notes, the Pokemon Editor, the Style Settings box).
 */

// [field suffix, label] per encounter box, in the order the old columns listed them. The field is
// `encounters_<suffix>`; the action id `encounters.<suffix>`.
const BW_ENCOUNTERS: [string, string][] = [
    ["route_1", "Route 1"],
    ["route_2", "Route 2"],
];
const B2W2_ENCOUNTERS: [string, string][] = [
    ["route_19", "Route 19"],
    ["route_20", "Route 20"],
    // The field keeps the old spelling; the game's is Floccesy.
    ["flocessy_ranch", "Floccesy Ranch"],
];
// The forced HM users (plan §6 decision 15c: "Location - Species"). Each writes `patch.encounter_<species>`.
// Where the patch stages each battle was read from the patched ROMs' map scripts (2026-10-14): a scripted wild
// battle, then the encounter variable set to 2. Pidove is one field in both games (`encounters_pidove`), so it
// is one control, listed first (game order), whose label follows the game.
const BW_HM_ENCOUNTERS: [string, string][] = [
    ["woobat", "Wellspring Cave - Woobat"],
    ["roggenrola", "Wellspring Cave - Roggenrola"],
    ["tympole", "Pinwheel Forest - Tympole"],
    ["timburr", "Pinwheel Forest - Timburr"],
];
const B2W2_HM_ENCOUNTERS: [string, string][] = [
    ["psyduck", "Floccesy Ranch - Psyduck"],
];
const PIDOVE_BW = "Route 3 - Pidove";
const PIDOVE_B2W2 = "Floccesy Ranch - Pidove";

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

export function gen5SettingsPanel(vm: any): SettingsPanelSpec {
    // The old panel decided by the box-art selection, not the mapper's game name; so does this.
    const blackWhite = () => vm.selected_game == "Black" || vm.selected_game == "White";
    const blackWhite2 = () => vm.selected_game == "Black 2" || vm.selected_game == "White 2";
    const white2 = () => vm.selected_game == "White 2";
    const familyStyle = () => vm.evolution == true && vm.evolution_family_list.length > 1;
    const automaticIvs = () => vm.iv_mode == IV_MODE.automatic;
    const team0 = () => vm.game.properties.player.team[0];
    const abilities = (): string[] => vm.g5PokemonData[vm.starter]?.abilities ?? [];
    const inBattle = () => vm.game.properties.meta.state.value == "Battle";
    const evBenefit = (stat: string) => (inBattle() ? "" : `(+${vm.calculate_ev_benefit(stat)})`);
    const evs = () => team0().evs;

    const encounterToggles = (list: [string, string][], game: string, available: () => boolean) =>
        list.map(([field, label]) =>
            flag(vm, `encounters.${field}`, label, `encounters_${field}`, { actionLabel: `${label} (${game})`, available }),
        );

    const run: SettingsGroup[] = [
        {
            title: "Game",
            controls: [
                {
                    kind: "component", id: "game.edition", component: "edition-picker", noAction: true,
                    props: () => ({ editions: gen5Manifest.editions.filter((e) => !e.devOnly || vm.isInDevMode), modelValue: vm.selected_game }),
                    on: { "update:modelValue": (v: string) => { vm.selected_game = v; } },
                },
                { kind: "button", id: "run.new", label: "New Run", variant: "primary", run: () => manualNewRun(vm.shuckie_timer, vm.emulatorStats, "button", () => vm.newRun()) },
            ],
        },
        {
            title: "Timer",
            controls: [
                { kind: "button", id: "timer.play_pause", label: "Play/Pause", run: () => vm.timer.pauseUnpauseTime() },
                // Two buttons in the old template, swapped by Shuckie Timer: this does what the visible one did.
                {
                    kind: "button", id: "timer.set", label: "Set Timer",
                    run: () => (vm.shuckie_timer == false ? vm.timer.setTimer(vm.timer_startTimeOffset) : vm.sendEmulatorStart()),
                },
                {
                    kind: "text", id: "timer.offset", label: "Start Time Offset", placeholder: "00:00:00.00", noAction: true,
                    get: () => vm.timer_startTimeOffset, set: (v) => { vm.timer_startTimeOffset = v; },
                    button: { id: "timer.clear_offset", label: "Clear", actionLabel: "Clear Start Time Offset", run: () => { vm.timer_startTimeOffset = "00:00:00.00"; } },
                },
                flag(vm, "advanced.stop_timer_after_n_dialogue", "Stop Timer After N Dialogue", "stop_timer_after_n_dialogue", { tier: "advanced" }),
            ],
        },
        {
            title: "Files",
            heading: "",
            controls: [
                { kind: "button", id: "splits.open_folder", label: "Open Splits Folder", run: () => vm.openSplitsFolder() },
                { kind: "button", id: "shortcuts.open", label: "Keyboard Shortcuts", noAction: true, run: () => vm.open_shortcuts_menu() },
            ],
        },
        {
            title: "Readouts",
            controls: [
                { kind: "readout", id: "readout.party", label: "Player Party Count", value: () => (vm.game.properties.player.team_count.value > 6 ? 0 : vm.game.properties.player.team_count.value) },
                { kind: "readout", id: "readout.hp", label: "Overworld HP", value: () => `${team0().stats.hp.value} / ${team0().stats.hp_max.value}` },
                { kind: "readout", id: "readout.status", label: "Status", value: () => (team0().status_condition.value == null ? "None" : team0().status_condition.value) },
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
            ],
        },
        {
            title: "Advanced",
            controls: [
                flag(vm, "advanced.show_settings", "Show Advanced Settings", "show_advanced_settings"),
                flag(vm, "shuckie.timer", "Shuckie Timer", "shuckie_timer", { tier: "advanced" }),
                flag(vm, "shuckie.counters", "Shuckie Counters", "shuckie_counters", { tier: "advanced" }),
                flag(vm, "shuckie.bookmarks", "Shuckie Bookmarks", "shuckie_bookmarks", { tier: "advanced" }),
                flag(vm, "display.post_battle_splits", "Automatic Post-Battle Splits", "automatic_post_battle_splits", {
                    tier: "advanced", visible: () => !vm.second_screen_mode,
                }),
                flag(vm, "advanced.second_screen_mode", "Second Screen Mode", "second_screen_mode", { tier: "advanced" }),
                flag(vm, "advanced.live_hp", "Live HP", "live_hp", { tier: "advanced" }),
                flag(vm, "settings.editor", "Pokemon Editor", "editor", { tier: "advanced", noAction: true }),
                flag(vm, "advanced.debugging", "Debugging", "debugging_mode", { tier: "advanced" }),
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
                { kind: "readout", id: "debug.outcome_flags", label: "Outcome Flags", value: () => vm.game.properties.battle.other.outcome_flags.value },
                { kind: "readout", id: "debug.team_count", label: "Team Count", value: () => vm.game.properties.player.team_count.value },
                { kind: "readout", id: "debug.delay", label: "Delay", value: () => vm.disallow_delay },
                { kind: "readout", id: "debug.blackout", label: "Blackout", value: () => vm.blackout },
                { kind: "readout", id: "debug.enemy_graphic", label: "Enemy Graphic", value: () => vm.enemy_graphic },
                { kind: "readout", id: "debug.run_complete", label: "Run Complete", value: () => vm.run_complete },
                { kind: "readout", id: "debug.single_battle", label: "Single Battle", value: () => vm.single_battle },
                { kind: "readout", id: "debug.second_screen", label: "Second Screen", value: () => vm.second_screen_check },
                { kind: "readout", id: "debug.show_evolved_base_stats", label: "Show Evolved Base Stats", value: () => vm.show_evolved_base_stats },
                { kind: "readout", id: "debug.final_gametime", label: "Final Gametime", visible: () => !!vm.run_complete, value: () => vm.simple_data[7] },
            ],
        },
    ];

    const solo: SettingsGroup[] = [
        {
            title: "Solo Pokemon",
            heading: "Solo Pokémon",
            controls: [
                {
                    // The old <select v-model="starter">: the `starter` watcher does the rest (storage, forms, ROM starter).
                    kind: "component", id: "solo.species", component: "species-picker", noAction: true,
                    props: () => ({ modelValue: vm.starter, options: vm.pokemon_list }),
                    on: { "update:modelValue": (v: string) => { vm.starter = v; } },
                },
            ],
        },
        {
            title: "Split Comparison",
            controls: [
                { kind: "button", id: "splits.load_comparison", label: "Load Replay / Split File", actionLabel: "Load replay / split file to compare", run: () => vm.load_splits() },
                { kind: "readout", id: "splits.source", label: "Comparing Against", class: "stp-readout-wrap", visible: () => !!vm.previous_splits_source, value: () => vm.previous_splits_source },
                // Shown only while splits are loaded, as before; its shortcut works at any time, as before.
                { kind: "button", id: "splits.clear_comparison", label: "Clear Loaded Splits", visible: () => vm.previous_splits.length > 0, run: () => vm.clear_splits() },
                { kind: "choice", id: "splits_compare", label: "Compare Splits", options: ["First", "Followup"], get: () => vm.toggle_compare_splits, set: (v) => { vm.toggle_compare_splits = v; } },
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
                    kind: "choice", id: "evolution.family", label: "Evolution Family Style", actions: "cycle", available: familyStyle,
                    placeholder: "Select a species in the evolution family",
                    options: () => strings(vm.evolution_family_list),
                    get: () => `${vm.selected_evolution_species}`, set: (v) => { vm.selected_evolution_species = v; },
                },
                { kind: "button", id: "evolution.unify_styles", label: "Unify Styles", available: familyStyle, run: () => vm.copyCurrentStylesToAllFamilyMembers() },
            ],
        },
        {
            title: "Form",
            available: () => !!vm.show_pokemon_forms || !!vm.show_battle_forms,
            controls: [
                {
                    // `pokemon_form` is a computed whose setter moves `starter` to the picked form.
                    kind: "choice", id: "form", label: () => `${vm.form_base_species} Form`, actionLabel: "Form", actions: "cycle",
                    available: () => !!vm.show_pokemon_forms,
                    options: () => vm.pokemon_form_options.map((o: any) => ({ value: o.species, label: o.label })),
                    get: () => vm.pokemon_form, set: (v) => { vm.pokemon_form = v; },
                },
                { kind: "slot", id: "slot.form_note", slot: "formNote", available: () => !!vm.show_pokemon_forms },
                {
                    // The base form is stored as "" (no battle form picked).
                    kind: "choice", id: "battle_form", label: () => `${vm.starter} Battle Form`, actionLabel: "Battle Form", actions: "cycle",
                    available: () => !!vm.show_battle_forms,
                    options: () => vm.battle_form_options.map((o: any) => ({ value: o.species == vm.starter ? "" : o.species, label: o.label })),
                    get: () => vm.battle_form, set: (v) => { vm.battle_form = v; },
                },
                { kind: "slot", id: "slot.battle_form_note", slot: "battleFormNote", available: () => !!vm.show_battle_forms },
            ],
        },
        {
            title: "IVs",
            controls: [
                { kind: "choice", id: "ivs.mode", label: "IVs", options: [IV_MODE.automatic, IV_MODE.manual], get: () => vm.iv_mode, set: (v) => { vm.iv_mode = v; } },
                {
                    kind: "choice", id: "ivs.hidden_power", label: "Hidden Power", actions: "cycle", available: automaticIvs,
                    placeholder: "Select a Hidden Power type",
                    options: () => strings(vm.values_function(vm.hiddenPowerTypes)),
                    get: () => `${vm.hidden_power_type}`, set: (v) => { vm.hidden_power_type = v; },
                },
                {
                    kind: "choice", id: "ivs.hidden_power_index", actions: "cycle", available: automaticIvs,
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
                    kind: "choice", id: "ability", label: () => `Ability (${vm.starter} Has ${abilities().length})`, actionLabel: "Ability", actions: "cycle",
                    placeholder: "Select an ability",
                    options: () => strings(vm.values_function(abilities())),
                    get: () => `${vm.pkmn_ability}`, set: (v) => { vm.pkmn_ability = v; },
                },
                {
                    kind: "readout", id: "readout.ability_slot", label: "Ability Slot",
                    value: () => {
                        const slot = abilities().indexOf(vm.pkmn_ability) + 1;
                        return slot == 3 ? "Hidden Ability" : slot;
                    },
                },
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
            controls: [flag(vm, "advanced.banned_hidden_power", "HP Banned for 1st Run", "banned_hidden_power")],
        },
        {
            // No Guaranteed Catches: gen5's patch has no such switch (plan §6 decision 15b).
            title: "Encounters",
            controls: [
                { kind: "button", id: "rng.open", label: "RNG Trips", actionLabel: "RNG (White 2)", available: white2, run: () => vm.openRNGModal() },
                ...encounterToggles(BW_ENCOUNTERS, "B/W", blackWhite),
                ...encounterToggles(B2W2_ENCOUNTERS, "B2/W2", blackWhite2),
            ],
        },
        {
            title: "Forced HM Users",
            available: () => blackWhite() || blackWhite2(),
            controls: [
                // Listed in both games' boxes before, one field: one control, available in every game, as its shortcut was.
                flag(vm, "encounters.pidove", "", "encounters_pidove", {
                    label: () => (blackWhite2() ? PIDOVE_B2W2 : PIDOVE_BW), actionLabel: `${PIDOVE_BW} (B/W) / ${PIDOVE_B2W2} (B2/W2)`,
                }),
                ...encounterToggles(BW_HM_ENCOUNTERS, "B/W", blackWhite),
                ...encounterToggles(B2W2_HM_ENCOUNTERS, "B2/W2", blackWhite2),
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
                        "IVs",
                        "EVs",
                        "Vitamins",
                        "Detailed EVs",
                        "Base Stats",
                        { value: "Base Stats Average", label: "Base Stat Averages", slug: "base_stats_average" },
                        { value: "Base Stats Median", label: "Base Stat Medians", slug: "base_stats_median" },
                    ],
                    get: () => vm.stats_setting, set: (v) => { vm.stats_setting = v; },
                },
                {
                    // Hidden in Second Screen Mode, as before (that mode draws its own right panel).
                    kind: "choice", id: "right_panel", label: "Right Panel", options: ["Automatic", "Movepool", "Splits", "Trainers"],
                    visible: () => !vm.second_screen_mode,
                    // Decision 27: a pick also ends a post-battle Splits (core/overlay/rightPanelMode.ts).
                    get: () => vm.right_ui, set: (v) => { vm.set_right_panel(v); },
                },
                // Decision 30: the wild panel in wild battles (Automatic / Trainers), off by default.
                flag(vm, "display.wild_battles", "Show Wild Battles", "show_wild_battles", { visible: () => !vm.second_screen_mode }),
                // The enemy team in the order the trainer's AI sends it out (core/logic/sendOutOrder.ts), on by default.
                flag(vm, "display.send_out_order", "Predicted Send-Out Order", "send_out_order", { visible: () => !vm.second_screen_mode }),
                {
                    kind: "choice", id: "display.unobtainable_moves", label: "Unobtainable Moves",
                    options: ["Never Cross Out", "Cross Out When Starter is Obtained", "Cross Out After First Badge", "Always Cross Out"],
                    get: () => vm.unobtainable_moves_toggle, set: (v) => { vm.unobtainable_moves_toggle = v; },
                },
            ],
        },
        {
            // Decision 14: the trainer the "Trainers" right panel previews (Black and White: B2/W2 have no trainer table).
            title: "Trainers",
            available: () => vm.right_ui == "Trainers" && !vm.second_screen_mode,
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
            controls: [
                // Black 2 / White 2 only (the tutors); any species (it used to sit in the evolution table, known-legacy-bugs #85).
                flag(vm, "moves.show_tutor_moves", "Show Tutor Moves", "show_tutor_moves", { actionLabel: "Show Tutor Moves (B2/W2)", available: blackWhite2 }),
            ],
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
