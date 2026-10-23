import { manualNewRun } from "~/core/logic/newRunGuard";
import { IV_MODE } from "~/core/logic/starterIvs";
import { panelThemeControl } from "~/core/settings/theme";
import type { SettingControl, SettingsGroup, SettingsPanelSpec } from "~/core/settings/types";
import { slug } from "~/core/shortcuts/build";
import { gen3Manifest } from "./manifest";

/**
 * gen3's settings panel as data (docs/ui-uniformity-plan.md stages 3-4): the four shared columns,
 * Run · Solo Pokémon · Style · Display, rendered by core/settings/SettingsPanel.vue, and the same list
 * gives the controls' shortcut actions (actions.ts). Ids are the action ids the controls had before
 * (persisted: never rename one).
 *
 * `vm` is the overlay instance. Every get/set/run touches the field or calls the method the old
 * template control did, so watchers and saving behave as they always did. The pieces that stay as
 * markup in Overlay.vue are the `slot` controls (the IV block the manual-IV harness drives by class,
 * the nature grid, the Pokemon Editor, the dev-only style tools).
 */

const EMERALD = "Emerald";
const FRLG = "FireRed and LeafGreen";

// [field, label] per encounter box, in the order the old columns listed them. The field is also the
// action id's last part (`encounters.<field>`).
const EMERALD_ENCOUNTERS: [string, string][] = [
    ["route_101", "Route 101"],
    ["route_102", "Route 102"],
    ["route_103", "Route 103"],
];
const FRLG_ENCOUNTERS: [string, string][] = [
    ["route_1", "Route 1"],
    ["route_2", "Route 2"],
    ["route_22", "Route 22"],
    ["viridian_forest", "Viridian Forest"],
    ["route_6", "Route 6"],
];
const EMERALD_HM_ENCOUNTERS: [string, string][] = [
    ["hm_102_zigzagoon", "Route 102 - Zigzagoon"],
    ["hm_104_marill", "Route 104 - Marill"],
    ["hm_104_taillow", "Route 104 - Taillow"],
    ["hm_116_abra", "Route 116 - Abra"],
    ["hm_woods_shroomish", "Petalburg Woods - Shroomish"],
    ["hm_cave_abra", "Granite Cave - Abra"],
    ["hm_119_tropius", "Route 119 - Tropius"],
];
const FRLG_HM_ENCOUNTERS: [string, string][] = [
    ["hm_1_pidgey", "Route 1 - Pidgey"],
    ["hm_1_rattata", "Route 1 - Rattata"],
    ["hm_24_25_abra", "Route 24/25 - Abra"],
    ["hm_6_meowth", "Route 6 - Meowth"],
    ["hm_6_pidgey", "Route 6 - Pidgey"],
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

export function gen3SettingsPanel(vm: any): SettingsPanelSpec {
    // gen3 picks its game-only rows by the box-art selection, as the old template did.
    const emerald = () => vm.gameSelection == EMERALD;
    const frlg = () => vm.gameSelection == FRLG;
    const advanced = () => vm.show_advanced_settings == true;
    // The block holding Evolution Family Style, Unify Styles and post-Kanto evolutions.
    const familyStyle = () => vm.evolution == true && vm.evolution_family_list.length > 1;
    const automaticIvs = () => vm.iv_mode == IV_MODE.automatic;
    const team0 = () => vm.game.properties.player.team[0];
    const species = () => vm.displayedPokemonSpecies;
    const abilities = (): unknown[] => vm.dexDataRubySapphireEmerald[species()]?.abilities ?? [];

    const encounterToggles = (list: [string, string][], game: string, available: () => boolean) =>
        list.map(([field, label]) => flag(vm, `encounters.${field}`, label, field, { actionLabel: `${label} (${game})`, available }));

    const run: SettingsGroup[] = [
        {
            title: "Game",
            controls: [
                {
                    kind: "component", id: "game.edition", component: "edition-picker", noAction: true,
                    props: () => ({ editions: gen3Manifest.editions.filter((e) => !e.devOnly || vm.isInDevMode), modelValue: vm.gameSelection }),
                    on: { "update:modelValue": (v: string) => { vm.gameSelection = v; } },
                },
                { kind: "button", id: "run.new", label: "New Run", variant: "primary", run: () => manualNewRun(vm.shuckie_timer, vm.emulatorStats, "button", () => vm.newRun()) },
            ],
        },
        {
            title: "Timer",
            controls: [
                // Two buttons in the old panel, one shown at a time by `shuckie_timer`.
                {
                    kind: "button", id: "timer.play_pause", label: "Play/Pause",
                    run: () => {
                        if (vm.shuckie_timer == false) return vm.timer.pauseUnpauseTime();
                        if (vm.shuckie_timer == true) return vm.sendEmulatorStart();
                    },
                },
                {
                    kind: "button", id: "timer.set", label: "Set Timer",
                    run: () => {
                        if (vm.shuckie_timer == false) return vm.timer.setTimer(vm.timer_startTimeOffset);
                        if (vm.shuckie_timer == true) return vm.sendEmulatorStart();
                    },
                },
                {
                    kind: "text", id: "timer.offset", label: "Start Time Offset", placeholder: "00:00:00.00", noAction: true,
                    get: () => vm.timer_startTimeOffset, set: (v) => { vm.timer_startTimeOffset = v; },
                    button: { id: "timer.clear_offset", label: "Clear", actionLabel: "Clear Start Time Offset", run: () => { vm.timer_startTimeOffset = "00:00:00.00"; } },
                },
                flag(vm, "timer.league_rematches", "Stop Timer After League Rematches", "league_rematches", { actionLabel: "Stop Timer After League Rematches (FRLG)", available: frlg }),
            ],
        },
        {
            title: "Files",
            heading: "",
            controls: [
                { kind: "button", id: "splits.open_folder", label: "Open Splits Folder", run: () => vm.openFolder(`splits`, vm.gameSelection, vm.getSplitFileName(), `finishes`) },
                { kind: "button", id: "shortcuts.open", label: "Keyboard Shortcuts", noAction: true, run: () => vm.open_shortcuts_menu() },
            ],
        },
        {
            title: "Readouts",
            controls: [
                { kind: "readout", id: "readout.party", label: "Player Party Count", value: () => (vm.game.properties.player.teamCount.value > 6 ? 0 : vm.game.properties.player.teamCount.value) },
                { kind: "readout", id: "readout.hp", label: "Overworld HP", value: () => `${team0().hp.value} / ${team0().maxHp.value}` },
                { kind: "readout", id: "readout.status", label: "Status", value: () => team0().statusCondition.value ?? "None" },
                {
                    kind: "statGrid", id: "readout.evs", label: "EVs",
                    items: () => [
                        { label: "HP", value: team0().evHp.value },
                        { label: "Spe", value: team0().evSpeed.value },
                        { label: "Atk", value: team0().evAttack.value },
                        { label: "SpA", value: team0().evSpecialAttack.value },
                        { label: "Def", value: team0().evDefense.value },
                        { label: "SpD", value: team0().evSpecialDefense.value },
                    ],
                },
                { kind: "readout", id: "readout.ev_total", label: "EV Total", value: () => `${vm.ev_total}/510` },
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
                // The old "Show optimization UI" / "Close optimization UI" buttons flipped this field.
                flag(vm, "settings.editor", "Pokemon Editor", "battle_testing_ui", { tier: "advanced", noAction: true }),
                flag(vm, "settings.debugging", "Debugging", "debugging", { tier: "advanced" }),
            ],
        },
        // The old panel hid the editor while Debugging was on.
        { title: "Pokemon Editor", tier: "advanced", visible: () => vm.battle_testing_ui == true && !vm.debugging, controls: [{ kind: "slot", id: "slot.editor", slot: "editor" }] },
        {
            title: "Style Settings",
            tier: "dev",
            visible: () => advanced() && vm.debugging == true,
            controls: [{ kind: "slot", id: "slot.devtools", slot: "devtools" }],
        },
        {
            title: "Debugging",
            tier: "advanced",
            visible: () => vm.debugging == true,
            controls: [
                { kind: "readout", id: "debug.state", label: "State", value: () => vm.g3stateVariable },
                { kind: "readout", id: "debug.callback1", label: "stpCallback1", value: () => vm.game.properties.pointers.sStpCallback1.value },
                { kind: "readout", id: "debug.callback2", label: "stpCallback2", value: () => vm.game.properties.pointers.sStpCallback2.value },
                { kind: "readout", id: "debug.enemy_state", label: "Enemy State", value: () => vm.enemyState },
                { kind: "readout", id: "debug.stats", label: "Stats Toggle", value: () => vm.stats },
                { kind: "readout", id: "debug.evolution", label: "Evolution", value: () => vm.evolution },
                { kind: "readout", id: "debug.evo_split_label", label: "Evo Split Label", value: () => vm.evolution_splits_label },
                { kind: "readout", id: "debug.catch_rate", label: "Catch Rate", value: () => vm.catch_rate },
                { kind: "readout", id: "debug.map", label: "Map", value: () => vm.game.properties.overworld.mapName.value },
                { kind: "readout", id: "debug.enemy_trainer", label: "Enemy Trainer", value: () => vm.enemyTrainerName },
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
                    props: () => ({ modelValue: vm.starterString, options: vm.pokemon_list }),
                    on: {
                        // The old select's v-model, then its @change, in that order.
                        "update:modelValue": (v: string) => {
                            vm.starterString = v;
                            vm.load_pokemon_sprite_settings(vm.s1dynamicReset.species.value);
                            vm.update_rom_starter_and_intro_mon();
                        },
                    },
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
                { kind: "choice", id: "splits_compare", label: "Compare Splits", options: ["First", "Followup"], get: () => vm.splits_display, set: (v) => { vm.splits_display = v; } },
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
                { kind: "readout", id: "readout.faults", label: "Faults", value: () => vm.playerResets + vm.blackout_counter },
            ],
        },
        {
            title: "Evolution",
            // The old panel showed the checkbox and the family block under separate conditions.
            available: () => !!vm.hasMultipleEvolutionStages || familyStyle(),
            controls: [
                flag(vm, "evolution.enabled", "Evolution", "evolution", { available: () => !!vm.hasMultipleEvolutionStages }),
                {
                    kind: "choice", id: "evolution.family_style", label: "Evolution Family Style", actions: "cycle", available: familyStyle,
                    placeholder: "Select a species in the evolution family",
                    options: () => strings(vm.evolution_family_list),
                    get: () => `${vm.selected_evolution_species}`, set: (v) => { vm.selected_evolution_species = v; },
                },
                { kind: "button", id: "evolution.unify_styles", label: "Unify Styles", available: familyStyle, run: () => vm.copyCurrentStylesToAllFamilyMembers() },
                flag(vm, "evolution.post_kanto", "Allow Post-Kanto Evolutions", "post_kanto_evolutions", { available: familyStyle }),
            ],
        },
        {
            title: "Form",
            available: () => vm.starterString == "Castform" || vm.starterString == "Deoxys",
            controls: [
                {
                    kind: "choice", id: "castform.form", label: "Castform Form", actionLabel: "Castform Form (Castform)",
                    title: "Each form styles separately",
                    available: () => vm.starterString == "Castform",
                    options: [
                        { value: "Normal", label: "Normal (Clear)", slug: "normal" },
                        { value: "Sunny", label: "Sunny (Harsh Sunlight)", slug: "sunny" },
                        { value: "Rainy", label: "Rainy (Rain)", slug: "rainy" },
                        { value: "Snowy", label: "Snowy (Hail)", slug: "snowy" },
                    ],
                    get: () => vm.castform_form, set: (v) => { vm.castform_form = v; },
                },
                {
                    kind: "choice", id: "deoxys.form", label: "Deoxys Form", actionLabel: "Deoxys Form (Deoxys)",
                    available: () => vm.starterString == "Deoxys",
                    options: ["Speed", "Normal", "Attack", "Defense"],
                    get: () => vm.deoxys_form,
                    set: (v) => {
                        vm.deoxys_form = v;
                        vm.load_deoxys_sprite_settings(vm.deoxys_form);
                    },
                },
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
                {
                    kind: "choice", id: "gender", label: "Gender", placeholder: "Select a gender",
                    options: ["Male", "Female"],
                    get: () => vm.pkmn_gender, set: (v) => { vm.pkmn_gender = v; },
                },
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
            controls: [flag(vm, "run.hp_banned_first_run", "HP Banned for 1st Run", "banned_hidden_power")],
        },
        {
            title: "Encounters",
            controls: [
                flag(vm, "encounters.guaranteed_catches", "Guaranteed Catches", "catch_rate"),
                ...encounterToggles(EMERALD_ENCOUNTERS, "Emerald", emerald),
                ...encounterToggles(FRLG_ENCOUNTERS, "FRLG", frlg),
            ],
        },
        {
            title: "Forced HM Users",
            available: () => emerald() || frlg(),
            controls: [
                ...encounterToggles(EMERALD_HM_ENCOUNTERS, "Emerald", emerald),
                ...encounterToggles(FRLG_HM_ENCOUNTERS, "FRLG", frlg),
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
                // The legacy field names are crossed: `backgroundXFlip` is the vertical flip.
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
                        "Badge Boosts",
                        "Comparison",
                        "Evolution",
                    ],
                    get: () => vm.stats, set: (v) => { vm.stats = v; },
                },
                {
                    kind: "choice", id: "display.stat_arrangement", label: "Stat Arrangement",
                    options: ["Speed: top right", "Speed: bottom right"],
                    get: () => vm.ui_stat_arrangement, set: (v) => { vm.ui_stat_arrangement = v; },
                },
                {
                    // Decision 27: Automatic was "Battle Graphic" (its shortcut id kept); "Wild" is the checkbox below (its
                    // id kept in actions.ts). A pick also ends a post-battle Splits.
                    kind: "choice", id: "right_panel", label: "Right Panel",
                    options: [{ value: "Automatic", slug: "battle_graphic" }, "Movepool", "Splits", "Trainers"],
                    get: () => vm.right_panel, set: (v) => { vm.set_right_panel(v); },
                },
                // Decision 30: the wild panel in wild battles (Automatic / Trainers), off by default; both games.
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
            available: () => vm.right_panel == "Trainers",
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
                flag(vm, "display.tutor_moves", "Show Tutor Moves", "tutor_moves"),
                flag(vm, "display.automatic_evs", "Automatic EVs", "automatic_evs", { tier: "advanced" }),
                flag(vm, "display.battle_graphics", "Show Battle Graphics", "battleGraphic", { tier: "advanced" }),
                flag(vm, "display.inventory", "Show Inventory", "inventory_display", { tier: "advanced" }),
                flag(vm, "display.nature_arrows", "Show Nature Arrows", "show_nature_changes", { tier: "advanced" }),
                flag(vm, "display.badge_boosts", "Badge Boosts", "display_badge_boosts", { tier: "advanced" }),
                flag(vm, "display.disable_right_panel_hotkeys", "Disable Panel Hotkeys", "disable_right_hotkeys", { tier: "advanced" }),
                flag(vm, "display.repel_counter", "Repel Counter", "repel_counter", { tier: "advanced", actionLabel: "Repel Counter (FRLG)", available: frlg }),
                flag(vm, "display.vs_seeker", "Vs. Seeker", "vs_seeker", { tier: "advanced", actionLabel: "Vs. Seeker (FRLG)", available: frlg }),
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
        showAdvanced: advanced,
        isDev: () => !!vm.isInDevMode,
        tint: () => vm.overlay_color,
    };
}
