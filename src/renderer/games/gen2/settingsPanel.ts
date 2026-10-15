import { IV_MODE } from "~/core/logic/starterIvs";
import { panelThemeControl } from "~/core/settings/theme";
import type { SettingControl, SettingsGroup, SettingsPanelSpec } from "~/core/settings/types";
import { gen2Manifest } from "./manifest";

/**
 * gen2's settings panel as data (docs/ui-uniformity-plan.md stages 3-4): the four shared columns,
 * Run · Solo Pokémon · Style · Display, rendered by core/settings/SettingsPanel.vue, and the same list
 * gives the controls' shortcut actions (actions.ts). Ids are the action ids the controls had before
 * (persisted: never rename one).
 *
 * `vm` is the overlay instance. Every get/set/run touches the field or calls the method the old
 * template control did, so watchers and saving behave as they always did. The pieces that stay as
 * markup in Overlay.vue are the `slot` controls: the backport importer, the Pokemon Editor (with the
 * DV editor and the recalculator), the dev-only style tools, the DV readout and the manual DV fields
 * (the manual-DV harness drives them by class), and the Rare Candies tracker.
 */

// [field, location - species] per forced HM-user encounter box, in the order the old table listed them.
const HM_ENCOUNTERS: [string, string, string][] = [
    ["route29_sentret", "toggle_EVENT_ENCOUNTER_ROUTE_29_SENTRET", "Route 29 - Sentret"],
    ["route31_bellsprout", "toggle_EVENT_ENCOUNTER_ROUTE31_BELLSPROUT", "Route 31 - Bellsprout"],
    ["route32_bellsprout", "toggle_EVENT_ENCOUNTER_ROUTE32_BELLSPROUT", "Route 32 - Bellsprout"],
    ["union_cave_sandshrew", "toggle_EVENT_ENCOUNTER_UNION_CAVE_SANDSHREW", "Union Cave - Sandshrew"],
    ["ilex_forest_psyduck", "toggle_EVENT_ENCOUNTER_ILEX_FOREST_PSYDUCK", "Ilex Forest - Psyduck"],
    ["ilex_forest_oddish", "toggle_EVENT_ENCOUNTER_ILEX_FOREST_ODDISH", "Ilex Forest - Oddish"],
    ["route34_abra", "toggle_EVENT_ENCOUNTER_ROUTE34_ABRA", "Route 34 - Abra"],
    ["national_park_psyduck", "toggle_EVENT_ENCOUNTER_NATIONAL_PARK_PSYDUCK", "National Park - Psyduck"],
    ["olivine_city_krabby", "toggle_EVENT_ENCOUNTER_OLIVINE_CITY_KRABBY", "Olivine City - Krabby"],
    ["violet_city_poliwag", "toggle_EVENT_ENCOUNTER_VIOLET_CITY_POLIWAG", "Violet City - Poliwag"],
    ["ecruteak_city_poliwag", "toggle_EVENT_ENCOUNTER_ECRUTEAK_CITY_POLIWAG", "Ecruteak City - Poliwag"],
];

/** The Hidden Power dropdown's options, in its order. */
const HIDDEN_POWER_TYPES = [
    "Dark", "Ice", "Ground", "Rock", "Psychic", "Flying", "Fire", "Electric",
    "Water", "Dragon", "Ghost", "Bug", "Grass", "Steel", "Poison", "Fighting",
];

function flag(vm: any, id: string, label: string, field: string, extra: Partial<SettingControl> = {}): SettingControl {
    return { kind: "toggle", id, label, get: () => vm[field], set: (v) => { vm[field] = v; }, ...extra } as SettingControl;
}

function slider(vm: any, field: string, label: string, min: number, max: number, step = 1): SettingControl {
    return { kind: "slider", id: `slider.${field}`, label, min, max, step, noAction: true, get: () => Number(vm[field]), set: (v) => { vm[field] = v; } };
}

export function gen2SettingsPanel(vm: any): SettingsPanelSpec {
    const automaticDvs = () => vm.dv_mode == IV_MODE.automatic;
    const trainersPanel = () => vm.right_panel == "Trainers";
    const team0 = () => vm.game.properties.player.team[0];
    const statExp = (field: string) => team0()[field].value;
    const statExpBenefit = (field: string) => `(${vm.statExp(statExp(field))})`;

    const run: SettingsGroup[] = [
        {
            title: "Game",
            controls: [
                {
                    kind: "component", id: "game.edition", component: "edition-picker", noAction: true,
                    props: () => ({ editions: gen2Manifest.editions.filter((e) => !e.devOnly || vm.isInDevMode), modelValue: vm.game_selection }),
                    on: { "update:modelValue": (v: string) => { vm.game_selection = v; } },
                },
                { kind: "button", id: "run.new", label: "New Run", variant: "primary", run: () => vm.newRun() },
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
                // gen2's only caller has always passed `Crystal` as the game folder, whatever the edition.
                { kind: "button", id: "splits.open_folder", label: "Open Splits Folder", run: () => vm.openFolder(`splits`, `Crystal`, vm.starter, "finishes") },
                { kind: "button", id: "shortcuts.open", label: "Keyboard Shortcuts", noAction: true, run: () => vm.open_shortcuts_menu() },
            ],
        },
        {
            title: "Advanced",
            controls: [
                flag(vm, "advanced.show_settings", "Show Advanced Settings", "show_advanced_settings"),
                flag(vm, "shuckie.timer", "Shuckie Timer", "shuckie_timer", { tier: "advanced" }),
                flag(vm, "shuckie.counters", "Shuckie Counters", "shuckie_counters", { tier: "advanced" }),
                flag(vm, "shuckie.bookmarks", "Shuckie Bookmarks", "shuckie_bookmarks", { tier: "advanced" }),
                flag(vm, "display.post_battle_splits", "Automatic Post-Battle Splits", "automatic_post_battle_splits", { tier: "advanced" }),
                flag(vm, "advanced.test_run", "Test Run", "testRun", { tier: "advanced" }),
                flag(vm, "advanced.refilming_mode", "Re-filming Mode", "refilming_mode", { tier: "advanced" }),
                {
                    kind: "text", id: "advanced.refilmed_attempt", label: "Re-filmed Attempt", tier: "advanced", noAction: true,
                    visible: () => !!vm.refilming_mode,
                    get: () => vm.refilmed_attempt, set: (v) => { vm.refilmed_attempt = v; },
                },
                {
                    kind: "text", id: "advanced.refilmed_finish", label: "Re-filmed Finish", tier: "advanced", noAction: true,
                    visible: () => !!vm.refilming_mode,
                    get: () => vm.refilmed_finish, set: (v) => { vm.refilmed_finish = v; },
                },
                flag(vm, "advanced.no_increment", "No Increment", "no_increment", { tier: "advanced" }),
                flag(vm, "advanced.import_backports", "Import Backports", "show_backport_import", { tier: "advanced", noAction: true }),
                flag(vm, "settings.editor", "Pokemon Editor", "editor", { tier: "advanced", noAction: true }),
                flag(vm, "advanced.debugging", "Debugging", "debugging", { tier: "advanced" }),
            ],
        },
        {
            title: "Import Backports",
            tier: "advanced",
            visible: () => !!vm.show_backport_import,
            controls: [{ kind: "slot", id: "slot.backports", slot: "backports" }],
        },
        { title: "Pokemon Editor", tier: "advanced", visible: () => !!vm.editor, controls: [{ kind: "slot", id: "slot.editor", slot: "editor" }] },
        {
            title: "Style Settings",
            tier: "dev",
            visible: () => !!vm.show_advanced_settings && !!vm.debugging,
            controls: [{ kind: "slot", id: "slot.devtools", slot: "devtools" }],
        },
        {
            title: "Readouts",
            controls: [
                { kind: "readout", id: "readout.return_power", label: "Return Base Power", value: () => vm.g2ReturnPowerCalc(team0()) },
                { kind: "readout", id: "readout.party", label: "Player Party Count", value: () => (vm.game.properties.player.teamCount.value > 6 ? 0 : vm.game.properties.player.teamCount.value) },
                { kind: "readout", id: "readout.hp", label: "Overworld HP", value: () => `${team0().hp.value} / ${team0().maxHp.value}` },
                { kind: "readout", id: "readout.status", label: "Status", value: () => (team0().statusCondition.value == null ? "None" : team0().statusCondition.value) },
                {
                    kind: "statGrid", id: "readout.stat_exp", label: "Stat Experience",
                    items: () => [
                        { label: "HP", value: statExp("statExpHp"), extra: statExpBenefit("statExpHp") },
                        { label: "Spe", value: statExp("statExpSpeed"), extra: statExpBenefit("statExpSpeed") },
                        { label: "Atk", value: statExp("statExpAttack"), extra: statExpBenefit("statExpAttack") },
                        { label: "Spc", value: statExp("statExpSpecial"), extra: statExpBenefit("statExpSpecial") },
                        { label: "Def", value: statExp("statExpDefense"), extra: statExpBenefit("statExpDefense") },
                    ],
                },
            ],
        },
        {
            title: "Debugging",
            tier: "advanced",
            visible: () => !!vm.debugging && !vm.editor,
            controls: [
                { kind: "readout", id: "debug.state", label: "State", value: () => vm.g2stateVariable },
                { kind: "readout", id: "debug.h_chosen_starter", label: "hChosenStarter", value: () => vm.game.properties.patch.hChosenStarter },
                { kind: "readout", id: "debug.early_encounters", label: "wEarlyEncounters", value: () => vm.game.properties.patch.wEarlyEncounters },
                { kind: "readout", id: "debug.held_item", label: "Held Item", value: () => vm.get_held_item },
                {
                    kind: "readout", id: "debug.svg_color_class", label: "svgColorClass",
                    value: () => vm.svgColorClass(vm.speed_comparison(0, vm.game.properties.battle.trainer.team[0]?.speed).comparison, vm.game.properties.battle.trainer.team[0]),
                },
                { kind: "readout", id: "debug.speed_comparison", label: "Speed Comparison", value: () => vm.speed_comparison(0, vm.game.properties.battle.trainer.team[0]?.speed).comparison },
                { kind: "readout", id: "debug.bonks", label: "Bonks", value: () => vm.game.properties.patch.steps.bonks.value },
                { kind: "readout", id: "debug.enemy_state", label: "Enemy State", value: () => vm.enemyState },
                { kind: "readout", id: "debug.run_complete", label: "Run Complete", value: () => vm.run_complete },
                { kind: "readout", id: "debug.kanto_badges", label: "Kanto Badges", value: () => vm.kanto_badges },
                { kind: "readout", id: "debug.move1", label: "Move1", value: () => vm.move_name(vm.camelCase(vm.s1.move1.value)) },
                { kind: "readout", id: "debug.move2", label: "Move2", value: () => vm.move_name(vm.camelCase(vm.s1.move2.value)) },
                { kind: "readout", id: "debug.move3", label: "Move3", value: () => vm.move_name(vm.camelCase(vm.s1.move3.value)) },
                { kind: "readout", id: "debug.move4", label: "Move4", value: () => vm.move_name(vm.camelCase(vm.s1.move4.value)) },
                { kind: "readout", id: "debug.gender_list", label: "pokemon_gender_list", value: () => vm.pokemon_gender_list },
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
                    // The old dropdown's @change, after its v-model: load the picked species' styling.
                    on: { "update:modelValue": (v: string) => { vm.starter = v; vm.load_pokemon_sprite_settings(vm.s1dynamicReset.species.value); } },
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
                {
                    kind: "choice", id: "splits_compare", label: "Compare Splits", options: ["First", "Followup", "Followup + Summary"],
                    get: () => vm.toggle_compare_splits, set: (v) => { vm.toggle_compare_splits = v; },
                },
                { kind: "text", id: "splits.previous_label", label: "Previous Column Label", placeholder: "Previous", noAction: true, get: () => vm.previous_label, set: (v) => { vm.previous_label = v; } },
                { kind: "text", id: "splits.current_label", label: "Current Column Label", placeholder: "Current", noAction: true, get: () => vm.current_label, set: (v) => { vm.current_label = v; } },
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
            title: "DVs",
            controls: [
                { kind: "choice", id: "dvs.mode", label: "DVs", options: [IV_MODE.automatic, IV_MODE.manual], get: () => vm.dv_mode, set: (v) => { vm.dv_mode = v; } },
                {
                    kind: "choice", id: "dvs.hidden_power", label: "Hidden Power", actions: "cycle", available: automaticDvs,
                    options: HIDDEN_POWER_TYPES, get: () => vm.hpType, set: (v) => { vm.hpType = v; },
                },
                { kind: "slot", id: "slot.dvs", slot: "dvs" },
            ],
        },
        {
            // gen2 has no abilities (game quirk); the gender comes from the Attack DV, so it is picked
            // here only in Automatic (Manual shows the gender its Atk DV gives under the fields).
            title: "Gender",
            controls: [
                {
                    kind: "choice", id: "dvs.gender", label: "Gender", actions: "cycle", available: automaticDvs,
                    options: () => vm.pokemon_gender_list, get: () => vm.pokemon_gender, set: (v) => { vm.pokemon_gender = v; },
                },
                { kind: "readout", id: "readout.gender_ratio", label: "Ratio", available: automaticDvs, value: () => vm.pokemon_gender_ratio },
            ],
        },
        {
            title: "Run Rules",
            controls: [flag(vm, "settings.hp_banned_first_run", "HP Banned for 1st Run", "banned_hidden_power")],
        },
        {
            title: "Encounters",
            controls: [
                flag(vm, "encounters.early", "Early Encounters", "toggle_wEarlyEncounters"),
                flag(vm, "encounters.guaranteed_catches", "Guaranteed Catches", "toggle_wGuaranteedCatches"),
            ],
        },
        {
            title: "Forced HM Users",
            controls: HM_ENCOUNTERS.map(([id, field, label]) => flag(vm, `encounters.${id}`, label, field)),
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
                {
                    kind: "button", id: "style.reset_pokemon", label: "Reset Pokemon Settings",
                    run: () => { Object.assign(vm, { imageXOffset: 0, imageYOffset: 0, imageScale: 1, imageFlip: false, imageSat: 100, imageRotation: 0 }); },
                },
            ],
        },
        {
            title: "Pokeball Floor",
            heading: "Pokéball Floor",
            tier: "advanced",
            controls: [
                slider(vm, "pokeball_translateX", "X-Offset", -400, 400),
                slider(vm, "pokeball_translateY", "Y-Offset", -400, 400),
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
                flag(vm, "style.background_flip_y", "Flip Y", "backgroundXFlip", { actionLabel: "Background Flip Y" }),
            ],
        },
    ];

    const display: SettingsGroup[] = [
        {
            title: "Display",
            controls: [
                {
                    kind: "choice", id: "stats", label: "Stats",
                    // "Hidden Power" (level 60/70/80 stats) was reachable only by F13 (plan §6 item 13).
                    options: ["Automatic", "Badge Boosts", "Base Stats", "DVs", "Hidden Power", "EVs", "Detailed EVs", "Vitamins"],
                    get: () => vm.stats_setting, set: (v) => { vm.stats_setting = v; },
                },
                {
                    // Decision 27: Automatic was "Battle Graphic" (its shortcut id kept); a pick also ends a post-battle Splits.
                    kind: "choice", id: "right_panel", label: "Right Panel",
                    options: [{ value: "Automatic", slug: "battle_graphic" }, "Movepool", "Splits", "Trainers"],
                    get: () => vm.right_panel, set: (v) => { vm.set_right_panel(v); },
                },
                // Decision 30: the wild panel in wild battles (Automatic / Trainers), off by default.
                flag(vm, "display.wild_battles", "Show Wild Battles", "show_wild_battles"),
                {
                    kind: "choice", id: "display.unobtainable_moves", label: "Unobtainable Moves",
                    options: ["Never Cross Out", "Cross Out When Starter is Obtained", "Cross Out After First Badge", "Always Cross Out"],
                    get: () => vm.unobtainable_moves_toggle, set: (v) => { vm.unobtainable_moves_toggle = v; },
                },
            ],
        },
        {
            title: "Trainers",
            available: trainersPanel,
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
                flag(vm, "display.bonk_counter", "Show Bonk Counter", "bonk"),
                flag(vm, "display.repel_counter", "Show Repel Counter", "repel_counter"),
            ],
        },
        { title: "Rare Candies", controls: [{ kind: "slot", id: "slot.rare_candies", slot: "rareCandies" }] },
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
