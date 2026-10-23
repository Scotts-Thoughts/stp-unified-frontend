import { textures } from "~/data/textures";
import PokeData from "~/logic/PokeData";
import { RightPanelMode } from "~/stores/types/RightPanelMode";
import { SplitsMode } from "~/stores/types/SplitsMode";
import { StatsPanelMode } from "~/stores/types/StatsPanelMode";
import { useOverlaySettingsStore } from "~/stores/useOverlaySettingsStore";
import { useSpeciesMetricsStore } from "~/stores/useSpeciesMetricsStore";
import { useGameSpeciesData } from "~/stores/useGameSpeciesData";
import { useMetaStore } from "~/stores/metaStore";
import { useEmulatorStatsStore } from "~/core/stores/useEmulatorStatsStore";
import { shuckieBookmarksEnabled } from "~/core/logic/shuckieBookmarks";
import { IV_MODE } from "~/core/logic/starterIvs";
import { IS_DEV } from "~/core/env";
import { panelThemeControl } from "~/core/settings/theme";
import type { SettingControl, SettingsGroup, SettingsPanelSpec } from "~/core/settings/types";
import { openShortcutsMenu } from "~/core/shortcuts/engine";
import {
    clearSplitComparison,
    decrementMetric,
    incrementMetric,
    loadSplitComparison,
    newRun,
    openSplitsFolder,
    pickUiColor,
    reloadStyle,
    setRomStarter,
    setShuckieBookmarks,
    setTimer,
    toggleTimer,
} from "~/components/settings/commands";
import { gen1PanelState } from "~/components/settings/panelState";
import type { SpeciesMetrics } from "~/stores/useSpeciesMetricsStore";
import { gen1Manifest } from "./manifest";
import { gen1TrainerOptions, trainerSearch } from "./enemyPanel";
import { searchTrainers } from "~/core/logic/trainerPreview";

/**
 * gen1's settings panel as data (docs/ui-uniformity-plan.md stages 3-4): the four shared columns,
 * Run · Solo Pokémon · Style · Display, rendered by core/settings/SettingsPanel.vue from
 * components/game_area.vue, and the same list gives the controls' shortcut actions (actions.ts).
 * Ids are the action ids the controls had before (persisted: never rename one).
 *
 * gen1 has no overlay instance: every get/set/run reads or writes the Pinia store field the old
 * `components/settings/*.vue` control was bound to, or calls the same `commands.ts` function, so the
 * stores' watchers and saving behave as they always did. The logic those components ran besides
 * their markup (the ROM starter, encounter flags, the comparison and Shuckie Bookmarks
 * subscriptions) still runs in them, now with no template (game_area.vue mounts them in the old
 * order). The pieces that stay markup are the `slot` controls in game_area.vue: the manual DV fields
 * (the manual-IV harness drives them by class), the Pokemon Editor, the dev-only Style Settings box.
 *
 * `properties` is the mapper's canonical view, for the live readouts; the shortcut list
 * (actions.ts) builds the panel without one and never reads a readout.
 */

// [id suffix, label, gameSpecific key, the game whose patch has the flag (none: both)], in the
// order the old Yellow and Red/Blue tables listed them (both orders survive the merge).
const HM_ENCOUNTERS: [string, string, string, string | null][] = [
    ["route1_test", "Route 1 - Test", "EVENT_ENCOUNTER_ROUTE1_TEST", "Yellow"],
    ["viridian_forest_pidgey", "Viridian Forest - Pidgey", "EVENT_ENCOUNTER_VIRIDIAN_FOREST_PIDGEY", "Yellow"],
    ["route3_spearow", "Route 3 - Spearow", "EVENT_ENCOUNTER_ROUTE3_SPEAROW", null],
    ["mtmoon_sandshrew", "Mt. Moon - Sandshrew", "EVENT_ENCOUNTER_MTMOON_SANDSHREW", "Yellow"],
    ["mtmoon_geodude", "Mt. Moon - Geodude", "EVENT_ENCOUNTER_MTMOON_GEODUDE", "Red and Blue"],
    ["mtmoon_paras", "Mt. Moon - Paras", "EVENT_ENCOUNTER_MTMOON_PARAS", "Red and Blue"],
    ["route6_cut_user", "Route 6 - Cut User", "EVENT_ENCOUNTER_ROUTE6_CUT_USER", "Red and Blue"],
    ["route16_doduo", "Route 16 - Doduo", "EVENT_ENCOUNTER_ROUTE16_DODUO", null],
];

/** What the shortcut labels called each game ("Route 1 - Test (Yellow)"). */
const GAME_TAG: Record<string, string> = { "Yellow": "Yellow", "Red and Blue": "Red/Blue" };

/** Usable vitamins left for a stat experience value (left_panel/stats.vue's `usable_vitamins`). */
function usableVitamins(statExp: number): number {
    return Math.max(0, Math.ceil(10 - statExp / 2560));
}

/** `v-model.number`: a field that parses as a number is stored as one, anything else as typed. */
function asNumber(value: string): number | string {
    const n = parseFloat(value);
    return Number.isNaN(n) ? value : n;
}

function slider(id: string, label: string, target: () => any, key: string, min: number, max: number, step = 1): SettingControl {
    return { kind: "slider", id: `slider.${id}`, label, min, max, step, noAction: true, get: () => Number(target()[key]), set: (v) => { target()[key] = v; } };
}

/** The species list for the picker, read once per game (PokeData's list is fixed per game). */
let speciesCache: { game: unknown; names: string[] } | null = null;
function speciesNames(): string[] {
    const game = useOverlaySettingsStore().game;
    if (!speciesCache || speciesCache.game !== game) speciesCache = { game, names: PokeData.getAllSpecieNames() };
    return speciesCache.names;
}

export function gen1SettingsPanel(properties: () => any = () => undefined): SettingsPanelSpec {
    const settings = () => useOverlaySettingsStore();
    const data = () => useGameSpeciesData();
    const metrics = () => useSpeciesMetricsStore();
    const meta = () => useMetaStore();
    const emulator = () => useEmulatorStatsStore();
    const advanced = () => data().advanced;
    const isGame = (game: string | null) => () => game === null || settings().game === game;
    const team0 = () => properties().player.team[0];
    const showAdvanced = () => !!settings().show_advanced_settings;

    // What the counters show: the emulator's when the Shuckie Counters switch is on (was metrics.vue).
    const resets = (): number => (settings().shuckie.counters ? emulator().playerResets : metrics().resets);
    const blackouts = (): number => (settings().shuckie.counters ? emulator().blackoutCounter : metrics().blackouts);
    const counter = (id: string, label: string, property: keyof SpeciesMetrics, value: () => unknown): SettingControl => ({
        kind: "counter", id, label, get: value, increment: () => incrementMetric(property), decrement: () => decrementMetric(property),
    });

    const flag = (id: string, label: string, target: () => any, key: string, extra: Partial<SettingControl> = {}): SettingControl =>
        ({ kind: "toggle", id, label, get: () => target()[key], set: (v: boolean) => { target()[key] = v; }, ...extra }) as SettingControl;

    /** A `runConfig.config.gameSpecific` box: encounters.vue writes it to the ROM when it changes. */
    const encounterFlag = (id: string, label: string, key: string, extra: Partial<SettingControl> = {}): SettingControl =>
        ({
            kind: "toggle", id: `encounters.${id}`, label,
            get: () => data().config.gameSpecific?.[key],
            set: (v: boolean) => {
                const gameSpecific = data().config.gameSpecific;
                if (gameSpecific) gameSpecific[key] = v;
            },
            ...extra,
        }) as SettingControl;

    const run: SettingsGroup[] = [
        {
            title: "Game",
            controls: [
                {
                    kind: "component", id: "game.edition", component: "edition-picker", noAction: true,
                    props: () => ({ editions: gen1Manifest.editions, modelValue: settings().edition }),
                    on: { "update:modelValue": (v: string) => { settings().edition = v as any; } },
                },
                { kind: "button", id: "run.new", label: "New Run", variant: "primary", run: () => newRun() },
            ],
        },
        {
            title: "Timer",
            controls: [
                { kind: "button", id: "timer.play_pause", label: "Play/Pause", run: toggleTimer },
                { kind: "button", id: "timer.set", label: "Set Timer", run: setTimer },
                {
                    kind: "text", id: "timer.offset", label: "Start Time Offset", placeholder: "00:00:00.00", noAction: true,
                    get: () => metrics().timer_override, set: (v) => { metrics().timer_override = v; },
                    button: { id: "timer.clear_offset", label: "Clear", actionLabel: "Clear Start Time Offset", run: () => { metrics().timer_override = "00:00:00.00"; } },
                },
            ],
        },
        {
            title: "Files",
            heading: "",
            controls: [
                { kind: "button", id: "splits.open_folder", label: "Open Splits Folder", run: openSplitsFolder },
                { kind: "button", id: "shortcuts.open", label: "Keyboard Shortcuts", noAction: true, run: openShortcutsMenu },
            ],
        },
        {
            title: "Readouts",
            controls: [
                { kind: "readout", id: "readout.party", label: "Player Party Count", value: () => (properties().player.teamCount.value > 6 ? 0 : properties().player.teamCount.value) },
                { kind: "readout", id: "readout.hp", label: "Overworld HP", value: () => `${team0().hp.value} / ${team0().maxHp.value}` },
                { kind: "readout", id: "readout.status", label: "Status", value: () => team0().statusCondition.value ?? "None" },
                {
                    kind: "statGrid", id: "readout.stat_exp", label: "Stat Experience",
                    items: () =>
                        [["HP", "statExpHp"], ["Spe", "statExpSpeed"], ["Atk", "statExpAttack"], ["Spc", "statExpSpecial"], ["Def", "statExpDefense"]].map(([label, key]) => {
                            const value = team0()[key].value;
                            return { label, value, extra: `(${usableVitamins(value)})` };
                        }),
                },
            ],
        },
        {
            title: "Advanced",
            controls: [
                flag("settings.show_advanced", "Show Advanced Settings", settings, "show_advanced_settings"),
                flag("shuckie.timer", "Shuckie Timer", () => settings().shuckie, "timer", { tier: "advanced" }),
                flag("shuckie.counters", "Shuckie Counters", () => settings().shuckie, "counters", { tier: "advanced" }),
                {
                    kind: "toggle", id: "shuckie.bookmarks", label: "Shuckie Bookmarks", tier: "advanced",
                    // Global user state, not reactive: interface_1.vue mirrors it into the panel state.
                    get: () => { void gen1PanelState.shuckieBookmarks; return shuckieBookmarksEnabled(); },
                    set: setShuckieBookmarks,
                },
                flag("display.post_battle_splits", "Automatic Post-Battle Splits", () => settings().right_panel, "post_battle_splits", { tier: "advanced" }),
                flag("settings.editor", "Pokemon Editor", () => gen1PanelState, "editor", { tier: "advanced", noAction: true }),
                // Run modes: dev builds only, as before, and now also under Show Advanced Settings.
                flag("run.test_run", "Test Run", advanced, "test_run", { tier: "dev", visible: showAdvanced, noAction: true }),
                flag("run.refilming_mode", "Re-filming Mode", advanced, "refilming_mode", { tier: "dev", visible: showAdvanced, noAction: true }),
                {
                    kind: "text", id: "run.refilmed_attempt", label: "Re-filmed Attempt", tier: "dev", noAction: true,
                    visible: () => showAdvanced() && advanced().refilming_mode == true,
                    get: () => advanced().refilmed_attempt, set: (v) => { (advanced() as any).refilmed_attempt = asNumber(v); },
                },
                {
                    kind: "text", id: "run.refilmed_finish", label: "Re-filmed Finish", tier: "dev", noAction: true,
                    visible: () => showAdvanced() && advanced().refilming_mode == true,
                    get: () => advanced().refilmed_finish, set: (v) => { (advanced() as any).refilmed_finish = asNumber(v); },
                },
                flag("run.no_attempt", "No Increment", advanced, "no_attempt", { tier: "dev", visible: showAdvanced, noAction: true, title: "Don't count an attempt or write splits" }),
            ],
        },
        {
            title: "Pokemon Editor",
            heading: "Pokémon Editor",
            tier: "advanced",
            // The dev-only Test Run showed the editor too, as before.
            visible: () => gen1PanelState.editor || advanced().test_run == true,
            controls: [{ kind: "slot", id: "slot.editor", slot: "editor" }],
        },
        {
            title: "Style Settings",
            tier: "dev",
            visible: showAdvanced,
            controls: [{ kind: "slot", id: "slot.devtools", slot: "devtools" }],
        },
        {
            title: "Debugging",
            tier: "dev",
            visible: showAdvanced,
            controls: [
                { kind: "readout", id: "debug.state", label: "State", value: () => meta().gameState },
                { kind: "readout", id: "debug.mapper_state", label: "Mapper State", value: () => properties().meta.state.value },
                { kind: "readout", id: "debug.enemy_state", label: "Enemy State", value: () => meta().enemyState },
                { kind: "readout", id: "debug.blackout", label: "Blackout", value: () => metrics().blackout_pending },
                { kind: "readout", id: "debug.player_id", label: "Save File Id", value: () => metrics().player_id },
                { kind: "readout", id: "debug.run_finished", label: "Run Finished", value: () => metrics().run_finished },
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
                    props: () => ({ modelValue: settings().starter, options: speciesNames() }),
                    // interface_2.vue's watcher writes the new solo Pokemon to the ROM.
                    on: { "update:modelValue": (v: string) => { settings().starter = v; } },
                },
                { kind: "button", id: "starter.set_rom", label: "Set ROM Starter", title: "The ROM starter follows the Solo Pokemon; this writes it again.", run: setRomStarter },
            ],
        },
        {
            title: "Split Comparison",
            controls: [
                { kind: "button", id: "splits.load_comparison", label: "Load Replay / Split File", actionLabel: "Load replay / split file to compare", run: loadSplitComparison },
                { kind: "readout", id: "splits.source", label: "Comparing Against", class: "stp-readout-wrap", visible: () => !!gen1PanelState.comparisonName, value: () => gen1PanelState.comparisonName },
                { kind: "button", id: "splits.clear_comparison", label: "Clear Loaded Splits", available: () => gen1PanelState.hasComparison, run: clearSplitComparison },
                {
                    kind: "choice", id: "splits_compare", label: "Compare Splits",
                    options: [SplitsMode.first, SplitsMode.followup, SplitsMode.followup_summary],
                    get: () => settings().right_panel.splits.mode, set: (v) => { settings().right_panel.splits.mode = v; },
                },
                {
                    kind: "text", id: "splits.previous_label", label: "Previous Column Label", placeholder: "Previous", noAction: true,
                    get: () => data().config.labels.split_previous, set: (v) => { data().config.labels.split_previous = v; },
                },
                {
                    kind: "text", id: "splits.current_label", label: "Current Column Label", placeholder: "Current", noAction: true,
                    get: () => data().config.labels.split_current, set: (v) => { data().config.labels.split_current = v; },
                },
            ],
        },
        {
            title: "Counters",
            controls: [
                counter("counter.attempts", "Attempt", "attempts", () => metrics().attempts),
                counter("counter.finishes", "Finished Runs", "finishes", () => metrics().finishes),
                counter("counter.resets", "Resets", "resets", resets),
                counter("counter.blackouts", "Blackouts", "blackouts", blackouts),
                { kind: "readout", id: "readout.faults", label: "Faults", value: () => resets() + blackouts() },
            ],
        },
        {
            title: "DVs",
            controls: [
                {
                    kind: "choice", id: "dvs.mode", label: "DVs", options: [IV_MODE.automatic, IV_MODE.manual],
                    get: () => data().config.dvs.mode, set: (v) => { data().config.dvs.mode = v; },
                },
                { kind: "slot", id: "slot.dvs", slot: "dvs" },
            ],
        },
        {
            title: "Encounters",
            controls: [
                encounterFlag("early", "Early Encounters", "wEarlyEncounters"),
                encounterFlag("no_moon", "No Moon", "wEarlyEncountersNoMoon"),
                flag("encounters.guaranteed_catches", "Guaranteed Catches", settings, "guaranteed_catches"),
            ],
        },
        {
            // The patch's encounter flags (ARCHITECTURE §4). Each game's list is its own patch's.
            title: "Forced HM Users",
            visible: () => settings().game === "Yellow" || settings().game === "Red and Blue",
            controls: HM_ENCOUNTERS.map(([id, label, key, game]) =>
                encounterFlag(id, label, key, game
                    ? { actionLabel: `${label} (${GAME_TAG[game]})`, available: isGame(game) }
                    : {}),
            ),
        },
    ];

    const style: SettingsGroup[] = [
        { title: "Panel", controls: [panelThemeControl()] },
        {
            title: "UI Color",
            controls: [
                { kind: "button", id: "style.color_picker", label: "Color Picker", noAction: true, run: pickUiColor },
                slider("ui_saturation", "Saturation", () => data().ui, "saturation", 0, 2, 0.1),
            ],
        },
        {
            title: "Pokemon Image",
            heading: "Pokémon Image",
            controls: [
                slider("artwork_offset_x", "X-Offset", () => data().artwork, "offset_x", -600, 600),
                slider("artwork_offset_y", "Y-Offset", () => data().artwork, "offset_y", -600, 600),
                slider("artwork_scale", "Scale", () => data().artwork, "scale", 0.2, 2.5, 0.01),
                slider("artwork_saturation", "Saturation", () => data().artwork, "saturation", 90, 150),
                slider("artwork_rotation", "Rotation", () => data().artwork, "rotation", -180, 180, 0.01),
                flag("style.artwork_flip", "Flip", () => data().artwork, "flip", { actionLabel: "Pokemon Image Flip" }),
                {
                    kind: "button", id: "style.reset_pokemon", label: "Reset Pokemon Settings",
                    run: () => { Object.assign(data().artwork, { offset_x: 0, offset_y: 0, scale: 1, flip: false, saturation: 100, rotation: 0 }); },
                },
            ],
        },
        {
            title: "Background",
            controls: [
                {
                    kind: "choice", id: "style.background_texture", label: "Texture", actionLabel: "Background Texture", actions: "cycle",
                    options: () => Object.keys(textures),
                    get: () => data().background.texture, set: (v) => { data().background.texture = v; },
                },
                slider("background_offset_x", "X-Offset", () => data().background, "offset_x", -400, 400),
                slider("background_offset_y", "Y-Offset", () => data().background, "offset_y", -400, 400),
                slider("background_scale", "Scale", () => data().background, "scale", 50, 300),
                slider("background_brightness", "Brightness", () => data().background, "brightness", 0, 200),
                slider("background_contrast", "Contrast", () => data().background, "contrast", 0, 200),
                slider("background_saturation", "Saturation", () => data().background, "saturation", 0, 200),
                slider("background_blur", "Blur", () => data().background, "blur", 0, 10, 0.1),
                slider("background_hue", "Hue", () => data().background, "hue", 0, 358),
                flag("style.background_flip_x", "Flip X", () => data().background, "flip", { actionLabel: "Background Flip X" }),
                flag("style.background_flip_y", "Flip Y", () => data().background, "flip_y", { actionLabel: "Background Flip Y" }),
                {
                    kind: "button", id: "style.reload", label: "Reload Style", run: reloadStyle,
                    title: "Changes are saved automatically. This re-reads the saved style, discarding unsaved edits.",
                },
            ],
        },
    ];

    const display: SettingsGroup[] = [
        {
            title: "Display",
            controls: [
                {
                    kind: "choice", id: "stats", label: "Stats",
                    options: [
                        StatsPanelMode.automatic,
                        StatsPanelMode.badge_boosts,
                        StatsPanelMode.base_stats,
                        StatsPanelMode.dvs,
                        StatsPanelMode.evs,
                        StatsPanelMode.detailed_evs,
                        { value: StatsPanelMode.averages, label: "Base Stat Averages", slug: "averages" },
                        { value: StatsPanelMode.medians, label: "Base Stat Medians", slug: "medians" },
                        StatsPanelMode.vitamins,
                    ],
                    get: () => settings().left_panel.stats.mode, set: (v) => { settings().left_panel.stats.mode = v; },
                },
                {
                    kind: "choice", id: "right_panel", label: "Right Panel", options: [RightPanelMode.automatic, RightPanelMode.movepool, RightPanelMode.splits, RightPanelMode.trainers],
                    // Decision 27: a pick also ends a post-battle Splits override (core/overlay/rightPanelMode.ts).
                    get: () => settings().right_panel.mode, set: (v) => { settings().setRightPanelMode(v); },
                },
                // Decision 30: the wild panel in wild battles (Automatic / Trainers), off by default.
                flag("display.wild_battles", "Show Wild Battles", () => settings().right_panel, "wild_battles"),
                {
                    // Decision 15d: crosses out Double Team (games/gen1/data/unobtainable_moves.ts) in the movepool.
                    kind: "choice", id: "display.unobtainable_moves", label: "Unobtainable Moves",
                    options: ["Never Cross Out", "Cross Out When Starter is Obtained", "Cross Out After First Badge", "Always Cross Out"],
                    get: () => settings().right_panel.movepool.unobtainable_moves, set: (v) => { settings().right_panel.movepool.unobtainable_moves = v; },
                },
            ],
        },
        {
            // Decision 14: the trainer the "Trainers" right panel previews.
            title: "Trainers",
            available: () => settings().right_panel.mode == RightPanelMode.trainers,
            controls: [
                { kind: "text", id: "trainers.search", label: "Search Trainers", placeholder: "Search for a trainer", noAction: true, get: () => trainerSearch.value, set: (v) => { trainerSearch.value = v; } },
                {
                    kind: "choice", id: "trainers.examined", label: "Trainer", actions: "cycle",
                    options: () => searchTrainers(gen1TrainerOptions(meta().game), trainerSearch.value),
                    get: () => settings().right_panel.trainer.examined, set: (v) => { settings().right_panel.trainer.examined = v; },
                },
            ],
        },
        {
            title: "Toggles",
            controls: [
                flag("display.count_blackouts", "Count Blackouts", advanced, "count_blackouts", { title: "A blackout counts as a fault" }),
                // The store field is `right_panel.hotkeys`, and ticked (the default) F17-F19 all pick
                // Automatic; unticked F18 picks Movepool and F19 Splits (actions.ts legacyFKeys).
                flag("display.disable_right_panel_hotkeys", "F17-F19 Only Set Automatic", () => settings().right_panel, "hotkeys", {
                    title: "Ticked: F17, F18 and F19 all set the right panel to Automatic. Unticked: F18 sets Movepool and F19 Splits.",
                }),
                flag("display.repel_counter", "Show Repel Counter", () => settings().pop_ups.repel, "enabled"),
                flag("display.bonk_counter", "Show Bonk/Item Counter", () => settings().pop_ups.bonks, "enabled"),
                {
                    kind: "choice", id: "display.bonk_mode", label: "Bonk/Item Counter", options: ["Bonks", "Item Count"],
                    visible: () => settings().pop_ups.bonks.enabled == true,
                    get: () => settings().pop_ups.bonks.mode, set: (v) => { settings().pop_ups.bonks.mode = v; },
                },
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
        showAdvanced,
        isDev: () => IS_DEV,
        tint: () => data().ui.color,
    };
}
