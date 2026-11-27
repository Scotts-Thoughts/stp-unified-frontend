import { manualNewRun } from "~/core/logic/newRunGuard";
import { IV_MODE } from "~/core/logic/starterIvs";
import type { SettingControl, SettingsGroup, SettingsPanelSpec } from "~/core/settings/types";
import { openScreenshotsFolder } from "~/core/screenshot/screenshot";
import type { ModuleManifest } from "~/core/game/ModuleManifest";

/**
 * The 3DS overlay's settings panel as data (ARCHITECTURE §4 "The settings panel"): the four shared columns,
 * Software · Run · Pokémon · Style, rendered by core/settings/SettingsPanel.vue; the same list gives the controls'
 * shortcut actions (actions.ts). Laid out like gen5's (games/gen5/settingsPanel.ts), and a control that exists in
 * gen5 keeps gen5's id here, so a key bound to it means the same thing in both.
 *
 * `vm` is the overlay instance. The Pokémon column's starter groups (IVs, Ability & Gender, Nature) are gen 5's, with
 * gen 5's ids: they are written into the party once the starter is received (starterWrite.ts), not into a ROM patch,
 * so they take effect on the next starter or through Write to Game. What gens 3-5 have and this lacks: the Pokemon
 * Editor, encounters and RNG trips (the games are unpatched). "In the Game" shows the values as the game has them. Right Panel Layout is fixed to
 * the bottom-screen layout, so there is no layout dropdown and no Webcam Mode.
 */

function flag(vm: any, id: string, label: string, field: string, extra: Partial<SettingControl> = {}): SettingControl {
    return { kind: "toggle", id, label, get: () => vm[field], set: (v) => { vm[field] = v; }, ...extra } as SettingControl;
}

function slider(vm: any, field: string, label: string, min: number, max: number, step = 1): SettingControl {
    return { kind: "slider", id: `slider.${field}`, label, min, max, step, noAction: true, get: () => Number(vm[field]), set: (v) => { vm[field] = v; } };
}

export function threeDsSettingsPanel(vm: any, manifest: ModuleManifest): SettingsPanelSpec {
    const solo = () => vm.solo;
    const present = () => !!solo().present;
    const family = () => vm.evolution_family_list.length > 1;

    const software: SettingsGroup[] = [
        {
            title: "Game",
            controls: [
                {
                    kind: "component", id: "game.edition", component: "edition-picker", noAction: true,
                    props: () => ({ editions: manifest.editions.filter((e) => !e.devOnly || vm.isInDevMode), modelValue: vm.selected_game }),
                    on: { "update:modelValue": (v: string) => { vm.selected_game = v; } },
                },
                { kind: "button", id: "run.new", label: "New Run", variant: "primary", run: () => manualNewRun(vm.shuckie_timer, vm.emulatorStats, "button", () => vm.newRun()) },
            ],
        },
        {
            title: "Timer",
            controls: [
                { kind: "button", id: "timer.play_pause", label: "Play/Pause", run: () => vm.timer.pauseUnpauseTime() },
                {
                    kind: "button", id: "timer.set", label: "Set Timer",
                    run: () => (vm.shuckie_timer == false ? vm.timer.setTimer(vm.timer_startTimeOffset) : vm.sendEmulatorStart()),
                },
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
                { kind: "button", id: "splits.open_folder", label: "Open Splits Folder", run: () => vm.openSplitsFolder() },
                { kind: "button", id: "screenshots.open_folder", label: "Open Screenshots Folder", run: openScreenshotsFolder },
                { kind: "button", id: "shortcuts.open", label: "Keyboard Shortcuts", noAction: true, run: () => vm.open_shortcuts_menu() },
            ],
        },
        {
            title: "Readouts",
            controls: [
                { kind: "readout", id: "readout.party", label: "Player Party Count", value: () => vm.game.properties.player?.team_count?.value ?? 0 },
                { kind: "readout", id: "readout.hp", label: "HP", value: () => (present() ? `${solo().hp} / ${solo().hpMax}` : "-") },
                { kind: "readout", id: "readout.status", label: "Status", value: () => solo().status ?? "None" },
                {
                    kind: "statGrid", id: "readout.evs", label: "EVs", class: "stp-statgrid-numbers",
                    items: () => [
                        { label: "HP", value: solo().evs.hp },
                        { label: "Spe", value: solo().evs.speed },
                        { label: "Atk", value: solo().evs.attack },
                        { label: "SpA", value: solo().evs.special_attack },
                        { label: "Def", value: solo().evs.defense },
                        { label: "SpD", value: solo().evs.special_defense },
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
                flag(vm, "display.post_battle_splits", "Automatic Post-Battle Splits", "automatic_post_battle_splits", { tier: "advanced" }),
                flag(vm, "advanced.refilming_mode", "Re-filming Mode", "refilming_mode", { tier: "advanced" }),
                flag(vm, "advanced.test_run", "Test Run", "testRun", { tier: "advanced" }),
                flag(vm, "advanced.debugging", "Debugging", "debugging_mode", { tier: "advanced" }),
            ],
        },
        {
            title: "Style Settings",
            tier: "advanced",
            visible: () => vm.debugging_mode == true,
            controls: [{ kind: "slot", id: "slot.devtools", slot: "devtools" }],
        },
        {
            title: "Debugging",
            tier: "advanced",
            visible: () => vm.debugging_mode == true,
            controls: [
                { kind: "readout", id: "debug.state", label: "State", value: () => vm.game.properties.meta?.state?.value },
                { kind: "readout", id: "debug.in_battle", label: "In Battle", value: () => vm.in_battle },
                { kind: "readout", id: "debug.opponent", label: "Opponent", value: () => vm.opponent_label ?? "-" },
                { kind: "readout", id: "debug.battle_end", label: "Battle End", value: () => vm.game.properties.battle?.other?.battle_end?.value },
                { kind: "readout", id: "debug.team_count", label: "Team Count", value: () => vm.game.properties.player?.team_count?.value },
                { kind: "readout", id: "debug.map", label: "Map", value: () => `${vm.game.properties.overworld?.map_index?.value} ${vm.game.properties.overworld?.map_name?.value ?? ""}` },
                { kind: "readout", id: "debug.run_complete", label: "Run Complete", value: () => vm.run_complete },
                { kind: "readout", id: "debug.final_gametime", label: "Final Gametime", visible: () => !!vm.run_complete, value: () => vm.simple_data[7] },
            ],
        },
    ];

    const run: SettingsGroup[] = [
        {
            title: "Solo Pokemon",
            heading: "Solo Pokémon",
            controls: [
                {
                    kind: "component", id: "solo.species", component: "species-picker", noAction: true,
                    props: () => ({ modelValue: vm.starter, options: vm.pokemon_list }),
                    on: { "update:modelValue": (v: string) => { vm.setStarter(v); } },
                },
            ],
        },
        {
            title: "Split Comparison",
            controls: [
                { kind: "button", id: "splits.load_comparison", label: "Load Splits", actionLabel: "Load replay / split file to compare", run: () => vm.load_splits() },
                { kind: "readout", id: "splits.source", label: "Comparing Against", class: "stp-readout-wrap", visible: () => !!vm.previous_splits_source, value: () => vm.previous_splits_source },
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
    ];

    const automaticIvs = () => vm.iv_mode == IV_MODE.automatic;
    const pokemon: SettingsGroup[] = [
        {
            title: "Starter",
            controls: [
                flag(vm, "starter.set_in_game", "Set Starter in Game", "set_starter_in_game", {
                    title: "On: when the run's first Pokémon joins the party (out of battle), it becomes the Solo Pokémon, with the nature, ability, gender and IVs below.",
                }),
                {
                    kind: "button", id: "starter.write_now", label: "Write to Game", actionLabel: "Write Starter to Game",
                    title: "Make the party's first Pokémon the Solo Pokémon with the values below now (not in battle). Its stats are worked out again; damage taken is kept. A new species gets its own moves for its level.",
                    run: () => vm.write_starter(true, "button"),
                },
                { kind: "readout", id: "readout.starter_write", label: "Last Write", class: "stp-readout-wrap", visible: () => !!vm.starter_write_status, value: () => vm.starter_write_status },
            ],
        },
        {
            title: "IVs",
            controls: [
                { kind: "choice", id: "ivs.mode", label: "IVs", options: [IV_MODE.automatic, IV_MODE.manual], get: () => vm.iv_mode, set: (v) => { vm.iv_mode = v; } },
                {
                    kind: "choice", id: "ivs.hidden_power", label: "Hidden Power", actions: "cycle", available: automaticIvs,
                    options: () => Object.keys(vm.hiddenpowers),
                    get: () => `${vm.hidden_power_type}`, set: (v) => { vm.hidden_power_type = v; vm.hidden_power_index = 0; },
                },
                {
                    kind: "choice", id: "ivs.hidden_power_index", actions: "cycle", available: automaticIvs, label: "Spread",
                    options: () => (vm.hiddenpowers[vm.hidden_power_type] ?? []).map((row: unknown, index: number) => ({ value: `${index}`, label: `${row}` })),
                    get: () => `${vm.hidden_power_index}`, set: (v) => { vm.hidden_power_index = v; },
                },
                { kind: "slot", id: "slot.ivs", slot: "ivs" },
            ],
        },
        {
            title: "Ability & Gender",
            controls: [
                {
                    kind: "choice", id: "ability", label: "Ability", actions: "cycle", placeholder: "Select an ability",
                    options: () => vm.starter_abilities.map((name: string) => ({
                        value: name,
                        label: name === vm.tables.pokedex[vm.starter]?.hidden_ability && !(vm.tables.pokedex[vm.starter]?.abilities ?? []).includes(name) ? `${name} (Hidden)` : name,
                    })),
                    get: () => `${vm.pkmn_ability}`, set: (v) => { vm.pkmn_ability = v; },
                },
                {
                    kind: "choice", id: "gender", label: "Gender", options: ["Female", "Male"], available: () => !vm.starter_fixed_gender,
                    get: () => vm.pkmn_gender, set: (v) => { vm.pkmn_gender = v; },
                },
                { kind: "readout", id: "readout.fixed_gender", label: "Gender", visible: () => !!vm.starter_fixed_gender, value: () => vm.starter_fixed_gender },
            ],
        },
        {
            title: "Nature",
            controls: [
                {
                    kind: "choice", id: "nature", inHeading: true, label: "Nature", actions: "cycle", placeholder: "Select a Nature",
                    options: () => Object.keys(vm.natures).map((key) => ({ value: key, label: vm.natureLabels(key) })),
                    get: () => `${vm.pkmnNature}`, set: (v) => { vm.pkmnNature = v; },
                },
            ],
        },
        {
            title: "Evolution",
            available: family,
            controls: [
                flag(vm, "evolution.enabled", "Evolution", "evolution", {
                    title: "On: the run is a whole evolution line. Its split files are named after the line, and the art follows the party's lead as it evolves.",
                }),
                { kind: "readout", id: "evolution.line", label: "Line", class: "stp-readout-wrap", value: () => vm.evolution_family_list.join(" → ") },
            ],
        },
        {
            // What gens 3-5 set from this column and write into the ROM, the 3DS overlay reads from the party.
            title: "In The Game",
            heading: "In the Game",
            controls: [
                { kind: "readout", id: "readout.species", label: "Lead", value: () => (present() ? `${solo().species} Lv. ${solo().level}` : "No Pokémon yet") },
                { kind: "readout", id: "readout.nature", label: "Nature", value: () => (present() ? solo().nature : "-") },
                { kind: "readout", id: "readout.ability", label: "Ability", value: () => (present() ? solo().ability : "-") },
                { kind: "readout", id: "readout.held_item", label: "Held Item", value: () => (present() ? (solo().heldItem ?? "None") : "-") },
                { kind: "readout", id: "readout.hidden_power", label: "Hidden Power", value: () => (present() ? solo().hiddenPower : "-") },
                {
                    kind: "statGrid", id: "readout.ivs", label: "IVs",
                    items: () => [
                        { label: "HP", value: solo().ivs.hp },
                        { label: "Spe", value: solo().ivs.speed },
                        { label: "Atk", value: solo().ivs.attack },
                        { label: "SpA", value: solo().ivs.special_attack },
                        { label: "Def", value: solo().ivs.defense },
                        { label: "SpD", value: solo().ivs.special_defense },
                    ],
                },
            ],
        },
        {
            title: "Run Rules",
            controls: [flag(vm, "advanced.banned_hidden_power", "HP Banned for 1st Run", "banned_hidden_power")],
        },
    ];

    const style: SettingsGroup[] = [
        {
            title: "UI Color",
            controls: [
                { kind: "button", id: "style.color_picker", icon: "eyedropper", label: "Color Picker", noAction: true, run: () => vm.color_picker() },
                slider(vm, "ui_saturation", "Saturation", 0, 2, 0.1),
            ],
        },
        {
            title: "Display",
            controls: [
                {
                    kind: "choice", id: "stats", label: "Stats", actionLabel: "Stats", options: ["Automatic", "IVs", "EVs", "Base Stats"],
                    get: () => vm.stats_setting, set: (v) => { vm.stats_setting = v; },
                },
                {
                    // No "Trainers": these games have no trainer table to preview from (the enemy team is read live).
                    kind: "choice", id: "right_panel", label: "Right Panel", options: ["Automatic", "Movepool", "Splits"],
                    get: () => vm.right_ui, set: (v) => { vm.set_right_panel(v); },
                },
                {
                    kind: "choice", id: "display.unobtainable_moves", label: "Unobtainable Moves",
                    options: ["Never Cross Out", "Cross Out When Starter is Obtained", "Cross Out After First Badge", "Always Cross Out"],
                    get: () => vm.unobtainable_moves_toggle, set: (v) => { vm.unobtainable_moves_toggle = v; },
                },
            ],
        },
        {
            title: "Toggles",
            controls: [
                flag(vm, "display.wild_battles", "Show Wild Battles", "show_wild_battles"),
                flag(vm, "display.show_ev_gauge", "Show EV Gauge", "show_ev_gauge", {
                    title: "A gauge under each stat in the regular stats view: one pill per vitamin, then a bar up to the most EVs a stat can hold.",
                }),
                flag(vm, "display.show_nature_changes", "Show Nature Arrows", "show_nature_changes"),
                flag(vm, "moves.show_tutor_moves", "Show Tutor Moves", "show_tutor_moves", { available: () => vm.has_tutor_moves }),
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
                { kind: "button", id: "style.reset_pokemon", icon: "reset", label: "Reset Pokemon Settings", run: () => vm.resetPokemon() },
            ],
        },
        {
            title: "Background",
            controls: [
                { kind: "button", id: "style.reset_background", icon: "reset", label: "Reset Background", run: () => vm.resetBackground() },
                {
                    kind: "choice", id: "style.background_texture", label: "Texture", actionLabel: "Background Texture", actions: "cycle",
                    options: () => Object.keys(vm.textures),
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
                // The legacy field names are crossed: `backgroundXFlip` is the vertical flip (as in gens 2-5).
                flag(vm, "style.background_flip_y", "Flip Y", "backgroundXFlip", { actionLabel: "Background Flip Y" }),
            ],
        },
    ];

    return {
        columns: [{ groups: software }, { groups: run }, { groups: pokemon }, { groups: style }],
        showAdvanced: () => !!vm.show_advanced_settings,
        isDev: () => !!vm.isInDevMode,
    };
}
