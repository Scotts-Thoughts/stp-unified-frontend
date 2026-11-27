<template>
<div>
    <!-- Keyed by the texture path so swapping textures cross-fades old and new -->
    <transition name="styleFade">
        <img class="canvas" :key="currentTexturePath" :src="currentTexturePath" :style="background_texture_style">
    </transition>

    <!-- The Poke Ball, flush to the canvas edge behind the stats, and the species art standing in it -->
    <div class="tds-zone" :style="zones.ball">
        <img class="canvas" src="images/gen5/elements/pokeball.webp">
    </div>
    <species-art img-class="pokemon_art" v-bind="species_art_look" transition="styleFade" :art-key="displayed_species" :src="species_art_src"></species-art>

    <!-- The 3DS's two screens (games/gen6/layout.ts): the top one at 3x, the bottom one in its 4:3 slot. Both take the
         HP / status / Pokerus tint, like gens 2-5's game areas. -->
    <div class="colored-image ds" :style="hp_tracker_style" style="--url: url(images/gen6/ui/game_area.svg)"></div>
    <div class="colored-image ds" :style="hp_tracker_style" style="--url: url(images/gen6/ui/second_screen_game_area.svg)"></div>

    <!-- Left column, top: timer, badges, faults (gen 5's art and places, scaled as one zone) -->
    <div class="tds-zone" :style="zones.leftTop">
        <faults-box :layout="faults_layout.frames" :mode="blackouts_resets" :frame-style="panel_filter"></faults-box>
        <img v-for="badge in badge_slots" :key="'slot' + badge.key" class="tds-badge tds-badge-slot" :src="badge.src" :style="badge.style">
        <transition-group name="badge-fade">
            <img v-for="badge in badges_view" :key="badge.key" class="tds-badge" :src="badge.src" :style="badge.style">
        </transition-group>
        <game-clock v-if="shuckie_timer == true" shuckie :hidden="timer_frame_live"></game-clock>
        <div v-else>
            <game-clock wrapper-class="gametime" :hidden="timer_frame_live"></game-clock>
        </div>
        <!-- The clock in its own process (core/overlay/ClockFrame.ts), with gen 5's clock geometry -->
        <clock-frame :gen="5" @live="timer_frame_live = $event"></clock-frame>
        <div class="genericLabels timerLabel">time played at 4x game speed</div>
        <div class="tds-shift" :style="faults_shift">
            <faults-box :layout="faults_layout.counts" :mode="blackouts_resets" :resets="fault_resets" :blackouts="fault_blackouts" :font-sizes="faults_font_sizes"></faults-box>
        </div>
    </div>

    <!-- The type pill on the ball -->
    <div class="tds-zone" :style="zones.ball">
        <type-badges v-if="!run_complete" v-bind="type_badges"></type-badges>
        <!-- Gametime: the last split's in-game time, in the type pill's place once the run is over -->
        <transition name="fade1">
            <div v-show="run_complete" style="position: relative; top: 59px;">
                <div class="colored-image ds" :style="[panel_filter, frame_url('gametime.svg')]"></div>
                <div class="genericLabels gametimeLabel">gametime</div>
                <div id="gametime_display" style="top: 699px; font-size: 38px;" class="resets">
                    <div>{{ simple_data[7] }}</div>
                </div>
            </div>
        </transition>
    </div>

    <!-- Left column, bottom: stats, exp bar, nature and friendship rows -->
    <div class="tds-zone" :style="zones.leftBottom">
        <div class="colored-image ds" :style="[panel_filter, frame_url('stats.svg')]"></div>
        <img class="canvas colored-image ds" :src="frame('ui/exp_bar.svg')">
        <img class="canvas colored-image ds" :src="frame('ui/nature_friendship.svg')">
        <img class="canvas colored-image ds" :src="frame('ui/stats_values.svg')">
        <div v-if="show_nature_changes == true && nature_arrows && (stats_setting == 'Automatic' || stats_setting == 'Base Stats')">
            <img class="canvas colored-image ds" :src="frame(`ui/nature arrows/raises/${nature_arrows.raises}.svg`)">
            <img class="canvas colored-image ds" :src="frame(`ui/nature arrows/lowers/${nature_arrows.lowers}.svg`)">
        </div>
        <div class="posAbs">
            <div class="stats_header">{{ stats_header }}</div>
            <div class="growth_rate">{{ growth_rate }}</div>
            <info-row v-bind="info_rows.nature"></info-row>
            <info-row v-bind="info_rows.total"></info-row>
            <div class="stats_container" id="stats">
                <div style="z-index: 100000;">
                    <stat-tiles :nodes="stat_tiles"></stat-tiles>
                </div>
            </div>
        </div>
        <exp-bar ref="expBar" :layout="exp_bar_layouts.bar" label="Exp:" :timing="exp_bar_timing"></exp-bar>
        <div style="position: absolute;">
            <popup-box v-bind="battle_popups.accuracy"></popup-box>
            <popup-box v-bind="battle_popups.evasion"></popup-box>
        </div>
    </div>

    <!-- Bottom centre: the ability and held item band, then the moveset -->
    <div class="tds-zone" :style="zones.ability">
        <div class="colored-image ds" :style="[panel_filter, frame_url('ability_helditem.svg')]"></div>
        <div class="posAbs labelAbility" style="font-family: play; top: 817px; left: 507px;">
            <div class="posAbs">Ability:</div>
            <div class="posAbs" style="left: 487px; width: 200px;">Held Item:</div>
        </div>
        <div class="ability">{{ ability_text }}</div>
        <div class="heldItem">{{ solo.heldItem }}</div>
    </div>
    <div class="tds-zone" :style="zones.moveset">
        <div class="colored-image ds" :style="[panel_filter, frame_url('moveset.svg')]"></div>
        <img class="canvas" src="images/gen5/ui/move_backgrounds.webp">
        <move-list :list="player_move_list" :layout="move_list_layout"></move-list>
    </div>

    <!-- The settings panel (core/settings/SettingsPanel.vue), described in settingsPanel.ts, over the top screen's area -->
    <settings-panel :panel="settingsPanel">
        <!-- The starter's IVs (as gen 5's block: the Hidden Power spread in Automatic, six fields in Manual) -->
        <template #ivs>
            <div v-if="iv_mode == 'Automatic'" class="stp-ivgrid">
                <span class="stp-stat-hp">HP</span><span class="stp-stat-hp">{{ hiddenpowers[hidden_power_type]?.[hidden_power_index]?.[0] }}</span>
                <span class="stp-stat-atk">Atk</span><span class="stp-stat-atk">{{ hiddenpowers[hidden_power_type]?.[hidden_power_index]?.[1] }}</span>
                <span class="stp-stat-def">Def</span><span class="stp-stat-def">{{ hiddenpowers[hidden_power_type]?.[hidden_power_index]?.[2] }}</span>
                <span class="stp-stat-spa">SpA</span><span class="stp-stat-spa">{{ hiddenpowers[hidden_power_type]?.[hidden_power_index]?.[4] }}</span>
                <span class="stp-stat-spd">SpD</span><span class="stp-stat-spd">{{ hiddenpowers[hidden_power_type]?.[hidden_power_index]?.[5] }}</span>
                <span class="stp-stat-spe">Spe</span><span class="stp-stat-spe">{{ hiddenpowers[hidden_power_type]?.[hidden_power_index]?.[3] }}</span>
            </div>
            <template v-else>
                <div class="stp-ivgrid">
                    <span class="stp-stat-hp">HP</span><input type="text" class="manual_iv_input stp-stat-hp" :value="manual_ivs.hp" @change="set_manual_iv('hp', $event)">
                    <span class="stp-stat-atk">Atk</span><input type="text" class="manual_iv_input stp-stat-atk" :value="manual_ivs.atk" @change="set_manual_iv('atk', $event)">
                    <span class="stp-stat-def">Def</span><input type="text" class="manual_iv_input stp-stat-def" :value="manual_ivs.def" @change="set_manual_iv('def', $event)">
                    <span class="stp-stat-spa">SpA</span><input type="text" class="manual_iv_input stp-stat-spa" :value="manual_ivs.spa" @change="set_manual_iv('spa', $event)">
                    <span class="stp-stat-spd">SpD</span><input type="text" class="manual_iv_input stp-stat-spd" :value="manual_ivs.spd" @change="set_manual_iv('spd', $event)">
                    <span class="stp-stat-spe">Spe</span><input type="text" class="manual_iv_input stp-stat-spe" :value="manual_ivs.spe" @change="set_manual_iv('spe', $event)">
                </div>
                <div class="stp-hint">Hidden Power: {{ manualHiddenPower.type }}</div>
            </template>
        </template>
        <template #devtools>
            <div class="stp-hint">{{ isInDevMode ? "Development mode: changes save to the defaults" : "Production mode: changes save locally" }}</div>
            <button v-if="isInDevMode" class="stp-btn" @click="exportStyleSettingsAsDefaults()">Export All Settings as Defaults</button>
            <button class="stp-btn" @click="resetCurrentPokemonToDefaults()">Reset Current Pokémon to Defaults</button>
        </template>
    </settings-panel>

    <!-- The right panel: the enemy team, the splits or the movepool take turns in the one slot -->
    <div class="tds-zone" :style="zones.right">
        <transition name="fade1">
            <div v-if="enemy_graphic && right_ui == 'Automatic'" style="position: absolute;" key="1">
                <enemy-team-panel :view="enemy_team_view" :layout="enemy_team_layout" webcam :webcam-rows="enemy_row_art" :webcam-header="66" :webcam-lines="panel_lines"></enemy-team-panel>
            </div>
            <div v-else-if="right_panel_mode == 'Splits'" key="7" style="filter: drop-shadow(0px 1px 1px)" class="posAbs">
                <div class="posAbs movepoolLabel">Splits</div>
                <div v-if="splitsView">
                    <splits-panel :view="splitsView" />
                </div>
            </div>
            <div v-else key="6" style="filter: drop-shadow(0px 1px 1px);">
                <movepool :view="movepoolView">
                    <div class="colored-image ds" :style="[`filter: saturate(${ui_saturation})`, frame_url('movepool.svg')]"></div>
                </movepool>
            </div>
        </transition>
    </div>
</div>
</template>

<script>
/**
 * The 3DS overlay: X/Y and Omega Ruby/Alpha Sapphire (gen6), Sun/Moon and Ultra Sun/Ultra Moon (gen7).
 *
 * Not a lifted legacy app like gens 2-5's overlays (docs/gen6-3ds-overlay-plan.md §4). It is built from the pieces
 * every generation shares (core/overlay/: the player components, Movepool, SplitsPanel, EnemyTeamPanel, the mode and
 * common mixins, the clock frame, the settings panel) and from gen 5's art, classes and stylesheet, drawn inside
 * scaled zones (layout.ts) so the DS and 3DS generations share one look.
 *
 * How it reads the game (docs/gen6-inventory.md; every path is in mappers/standard-paths.ts):
 *   - `solo` is the one model of the player's Pokemon: the party's lead (`player.team.0`), with its battle record
 *     (`battle.player_team.0`: level, stats, stat stages, moves and PP, item, ability, HP) laid over it while a
 *     battle is on. Everything the player panel shows comes from it, worked out once per change.
 *   - `enemy_team` is the opposing side's battle records (`battle.opponent_team`), so the enemy panel needs no
 *     trainer table.
 *   - A battle is `battle.in_battle`; it is won when `battle.other.battle_end` leaves 0 before it ends, and lost
 *     (a blackout) when it ends with every one of the player's Pokemon at 0 HP.
 *   - The games are unpatched. The one write is the starter (starterWrite.ts): once the run's first Pokemon is in the
 *     party, its nature, ability, gender and IVs become the settings panel's, written into the encrypted party slot.
 *
 * The run plumbing (splits, markers, resets, the timer, Super Shuckie, the control routes in control.ts, the
 * shortcut actions in actions.ts) follows gen 5's, with gen 5's names, so the queuer and Cutter read one contract.
 */
import { computed, defineComponent, markRaw, shallowRef } from "vue";
import { ClockFrame } from "~/core/overlay/ClockFrame";
import { FaultsBox } from "~/core/overlay/player/FaultsBox";
import { MoveList } from "~/core/overlay/player/MoveList";
import { PopupBox } from "~/core/overlay/player/PopupBox";
import GameClock from "~/core/overlay/player/GameClock.vue";
import { StatTiles } from "~/core/overlay/player/StatTiles";
import { ExpBar } from "~/core/overlay/player/ExpBar";
import { SpeciesArt } from "~/core/overlay/player/SpeciesArt";
import { TypeBadges } from "~/core/overlay/player/TypeBadges";
import { InfoRow } from "~/core/overlay/player/InfoRow";
import SettingsPanel from "~/core/settings/SettingsPanel.vue";
import Movepool from "~/core/overlay/Movepool.vue";
import SplitsPanel from "~/core/overlay/SplitsPanel.vue";
import { EnemyTeamPanel } from "~/core/overlay/EnemyTeamPanel";
import { overlayCommonMixin } from "~/core/overlay/overlayCommonMixin";
import { manualIvsMixin } from "~/core/overlay/manualIvsMixin";
import { naturesMixin } from "~/core/overlay/naturesMixin";
import { clampIvs, IV_MODE } from "~/core/logic/starterIvs";
import { formattersMixin } from "~/core/overlay/formattersMixin";
import { speciesArtMixin } from "~/core/overlay/speciesArtMixin";
import { readRightPanelMode, rightPanelModeMixin } from "~/core/overlay/rightPanelMode";
import { splitDiffColor, splitsHead } from "~/core/overlay/splitsView";
import { healthTrackerStyle } from "~/core/logic/healthTracker";
import { expProgress } from "~/core/logic/expCurve";
import { confirmReset } from "~/core/logic/resetGuard";
import { moveAccuracy, moveAccuracyPreview } from "~/core/logic/moveAccuracy";
import { crossOutActive, struckMoves } from "~/core/logic/unobtainableMoves";
import { markReminderMoves } from "~/core/logic/moveReminder";
import { movepoolTitle, secondScreenPart, SECOND_SCREEN_TUTOR_LIMIT } from "~/core/logic/secondScreen";
import { pickSplitComparison, latestTimePerTrainer } from "~/core/logic/splitComparison";
import { addSplitBookmark, sendChapterMarker, shuckieBookmarksEnabled } from "~/core/logic/shuckieBookmarks";
import { bindShortcuts } from "~/core/shortcuts/engine";
import { revealSplitFolder, splitPath } from "~/core/persistence/splitFiles";
import { onBattleEnded, setProfileSkip } from "~/core/profile/tracker";
import { gen6Manifest } from "./manifest";
import { gen7Manifest } from "../gen7/manifest";
import { threeDsGame, gameOrDefault, splitFor } from "./games";
import { gameData } from "./data";
import { MyStorage, StyleSettingsUtils, VISUAL_STYLE_FIELDS } from "./storage";
import { threeDsSettingsPanel } from "./settingsPanel";
import { threeDsActions } from "./actions";
import { logData, logCopy } from "./splits";
import { trainerLabel, wireThreeDsChapterMarkers } from "./chapterMarkers";
import { BADGE_BOX_DY, badgeCellStyle, battlePopups, expBarLayouts, expBarTiming, faultsFontSizes, faultsLayout, infoRows, moveListLayout, playerMoveList, statTiles, statsHeader, typeBadges } from "./playerPanel";
import { ENEMY_ROW_ART, enemyTeamLayout, enemyTeamView } from "./enemyPanel";
import { STAT_KEYS, basePower, hiddenPowerType, moveTypeFor, shownPower, withStage } from "./logic/battle";
import { abilityName, dexEntry, evolutionFamily, fullyEvolved, headerType, moveName, speciesArtPath, speciesList, speciesName } from "./logic/species";
import { RIGHT_PANEL_LINES, ART_BOX, ZONES, zoneStyle } from "./layout";
import { Timer } from "./logic/Timer.js";
import PubSub from "./logic/PubSub.js";
import { textures } from "./data/textures.js";
import { default_colors } from "./data/default_colors.js";
import { natures } from "./data/natures.js";
import { hiddenpowers } from "./data/hiddenpower-all.js";
import { writeStarter } from "./starterWrite";

/** A species' run counters and options, kept under `<Game>_<Solo Pokemon>`; its look (VISUAL_STYLE_FIELDS) under `<Game>_<species shown>`. */
/** How long a new map id must hold before it counts as a Map Change (the load-screen ids pass in under it). */
const MAP_SETTLE_MS = 1000;
const RUN_FIELDS = [
    "attempt_number", "finished_run_count", "playerResets", "blackout_counter", "evolution", "evolution_splits_label",
    // The starter write's choices (starterWrite.ts), per Solo Pokemon as in gens 3-5
    "pkmnNature", "pkmn_ability", "pkmn_gender", "iv_mode", "manual_ivs", "hidden_power_type", "hidden_power_index",
];
/** How many times a starter write that could not be made (a read caught mid-change, no read-back) is tried again. */
const STARTER_WRITE_TRIES = 5;
/** Starters are handed over at level 5; one level of slack for OR/AS, where the starter fights straight away. */
const STARTER_MAX_LEVEL = 6;
/** How long after the starter write a lead that changes back is written again (the game may still be handing it over). */
const STARTER_GUARD_MS = 3 * 60 * 1000;
/** A new game shows its play-time clock leaving 0:00:00 by at most this much (seconds), where a loaded save jumps further. */
const NEW_GAME_CLOCK_MAX_S = 5;
/** Sun/Moon: how long the new save must stay nameless, with no time played, before it counts as a new game. */
const NEW_SAVE_CONFIRM_MS = 1500;

/** The timer's `hh:mm:ss.cc` start offset, `ms` further on. */
function addToOffset(offset, ms) {
    const m = /(\d+):(\d{2}):(\d{2})\.(\d{2})/.exec(offset ?? "");
    const total = (m ? ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 + +m[4] * 10 : 0) + Math.round(ms);
    const cs = Math.floor(total / 10) % 100, s = Math.floor(total / 1000) % 60, min = Math.floor(total / 60000) % 60, h = Math.floor(total / 3600000);
    const two = (n) => String(n).padStart(2, "0");
    return `${two(h)}:${two(min)}:${two(s)}.${two(cs)}`;
}
/** Plain settings, saved under their own names in the generation's section. */
const SAVED_SETTINGS = [
    "selected_game", "show_advanced_settings", "refilming_mode", "testRun", "right_ui", "show_wild_battles", "show_ev_gauge",
    "show_nature_changes", "show_tutor_moves", "previous_label", "current_label", "previous_splits", "previous_splits_source",
    "current_splits", "toggle_compare_splits", "automatic_post_battle_splits", "unobtainable_moves_toggle", "banned_hidden_power",
    "shuckie_timer", "shuckie_counters", "stats_setting", "timer_startTimeOffset", "run_complete", "simple_data", "simple_data_str",
    "battle_start", "debugging_mode", "set_starter_in_game",
];
const NO_STATS = () => ({ hp: 0, attack: 0, defense: 0, special_attack: 0, special_defense: 0, speed: 0 });
const value = (node) => (node == null ? undefined : node.value);

export default defineComponent({
    mixins: [formattersMixin, speciesArtMixin, overlayCommonMixin, manualIvsMixin, naturesMixin, rightPanelModeMixin("right_ui")],
    components: { ClockFrame, FaultsBox, MoveList, PopupBox, GameClock, SettingsPanel, Movepool, SplitsPanel, EnemyTeamPanel, StatTiles, ExpBar, SpeciesArt, TypeBadges, InfoRow },
    props: ["game"],
    provide() {
        // What <live-text> shows and what <clock-frame> posts, read through computeds the children render, so this
        // component's own render does not depend on the timer or on the Super Shuckie polls (as in gens 3-5).
        const timerText = shallowRef(["0", ".00"]);
        this._onTimeUpdate = (text) => { timerText.value = text; };
        PubSub.subscribe("time_update", this._onTimeUpdate);
        return {
            liveText: {
                shuckie_clock: computed(() => this.formatMilliseconds(this.emulatorStats?.time_current)),
                shuckie_frames: computed(() => "." + this.getCentiseconds(this.emulatorStats?.time_current)),
                timer_clock: computed(() => timerText.value[0]),
                timer_frames: computed(() => timerText.value[1]),
            },
            clockState: computed(() => this.timer_frame_state),
        };
    },
    data() {
        // The module that mounted this overlay: gen6 (X/Y, OR/AS) or gen7 (Sun/Moon, Ultra Sun/Ultra Moon).
        const moduleId = this.game?.module?.id === "gen7" ? "gen7" : "gen6";
        const game = gameOrDefault(this.game?.properties?.meta?.game_name?.value ?? MyStorage.selected_game, moduleId);
        return {
            ready: false,
            module_id: moduleId,
            isInDevMode: StyleSettingsUtils.isDevMode(),
            debugging_mode: MyStorage.debugging_mode ?? false,
            show_advanced_settings: MyStorage.show_advanced_settings ?? false,
            selected_game: game.name,
            starter: MyStorage.starter ?? (moduleId === "gen7" ? "Rowlet" : "Froakie"),
            pokemon_list: [],

            // Run options
            evolution: false,
            evolution_splits_label: "",
            refilming_mode: MyStorage.refilming_mode ?? false,
            testRun: MyStorage.testRun ?? false,
            banned_hidden_power: MyStorage.banned_hidden_power ?? true,

            // The starter write (starterWrite.ts): on by default, as gens 3-5 always write theirs
            set_starter_in_game: MyStorage.set_starter_in_game ?? true,
            pkmnNature: "Hardy",
            pkmn_ability: "",
            pkmn_gender: "Female",
            iv_mode: IV_MODE.automatic,
            manual_ivs: clampIvs(null),
            hidden_power_type: "Dark",
            hidden_power_index: 0,
            starter_write_status: "",
            starter_write_busy: false,

            // Display
            right_ui: readRightPanelMode(MyStorage.right_ui).mode === "Trainers" ? "Automatic" : readRightPanelMode(MyStorage.right_ui).mode,
            show_wild_battles: MyStorage.show_wild_battles ?? false,
            show_ev_gauge: MyStorage.show_ev_gauge ?? true,
            show_nature_changes: MyStorage.show_nature_changes ?? true,
            show_tutor_moves: MyStorage.show_tutor_moves ?? true,
            stats_setting: MyStorage.stats_setting ?? "Automatic",
            unobtainable_moves_toggle: MyStorage.unobtainable_moves_toggle ?? "Always Cross Out",

            // Splits
            previous_label: MyStorage.previous_label ?? "Previous",
            current_label: MyStorage.current_label ?? "Current",
            collect_split_data: true,
            previous_splits: MyStorage.previous_splits ?? [],
            previous_splits_source: MyStorage.previous_splits_source ?? null,
            current_splits: MyStorage.current_splits ?? [],
            toggle_compare_splits: MyStorage.toggle_compare_splits ?? "First",
            automatic_post_battle_splits: MyStorage.automatic_post_battle_splits ?? true,
            prepare_for_splits: false,
            simple_data: MyStorage.simple_data ?? "",
            simple_data_str: MyStorage.simple_data_str ?? "",
            battle_start: MyStorage.battle_start ?? 0,
            run_complete: MyStorage.run_complete ?? false,

            // Super Shuckie
            emulatorStats: null,
            emulatorStatsInterval: null,
            failCounter: 0,
            shuckie_timer: MyStorage.shuckie_timer ?? false,
            shuckie_counters: MyStorage.shuckie_counters ?? false,
            shuckie_bookmarks: shuckieBookmarksEnabled(),

            // Faults: one reset or blackout can trip its detection twice
            disallow_faults: false,
            disallow_delay: 2000,
            playerResets: 0,
            blackout_counter: 0,
            attempt_number: 0,
            finished_run_count: 0,

            // The species' look (loadSpeciesStyle); the defaults here only last until the first load
            is_loading_style: true,
            overlay_color: "#000000",
            ui_saturation: 0.6,
            imageXOffset: 0, imageYOffset: 0, imageScale: 1, imageFlip: false, imageSat: 100, imageRotation: 0,
            backgroundBlur: 0, backgroundHue: 0, backgroundScale: 100, backgroundUrl: "", backgroundFlip: false, backgroundXFlip: false,
            use_custom_background: false, backgroundXOffset: 0, backgroundYOffset: 0, backgroundTexture: "Normal",
            backgroundBrightness: 100, backgroundContrast: 100, backgroundSaturation: 100,
            evolution_transitioning: false,
            evolution_transition_progress: 0,

            // Timer
            timer_startTimeOffset: MyStorage.timer_startTimeOffset ?? "00:00:00.00",
            timer: markRaw(new Timer(MyStorage)),
            timer_frame_live: false,
            timer_frame_version: 0,

            // Tables
            textures,
            default_colors,
            natures,
            hiddenpowers,
        };
    },
    created() {
        // A species' look is saved as it is edited, under the species shown; its run counters under the Solo Pokemon.
        for (const field of VISUAL_STYLE_FIELDS) {
            this.$watch(field, (v) => { if (!this.is_loading_style) this.saveSpeciesField(this.styleKey(), field, v); }, { flush: "sync" });
        }
        for (const field of RUN_FIELDS) {
            this.$watch(field, (v) => { if (!this.is_loading_style) this.saveSpeciesField(this.runKey(), field, v); }, { flush: "sync" });
        }
        for (const field of SAVED_SETTINGS) {
            this.$watch(field, (v) => { MyStorage[field] = v; }, { deep: true });
        }
        // A trainer battle ends the post-battle Splits, as in gen 5: only the override, never the operator's own pick.
        this.$watch(
            () => this.right_panel_override == "Splits" && this.enemy_graphic == true,
            (leave) => { if (leave) this.clear_right_panel_override(); },
            { immediate: true },
        );
    },
    watch: {
        // The out-of-process clock showing or not decides whether the timer's own frame loop runs.
        timer_frame_live(live) {
            this.timer.setFrameLive(live);
        },
        // The post-battle Splits wait for the enemy panel to go, as in gen 5.
        enemy_graphic(shown) {
            if (shown == false && this.prepare_for_splits == true) {
                this.prepare_for_splits = false;
                this.show_post_battle_splits();
            }
        },
        // The species on screen changed (a new Solo Pokemon, an evolution, the first Pokemon of a run): its look.
        displayed_species() {
            this.loadSpeciesStyle();
            this.syncExpBar();
        },
        selected_game(game) {
            // The edition follows the mapper: a pair is one mapper, so there is nothing else to pick within a game.
            const detected = this.game.properties.meta?.game_name?.value;
            if (detected && game !== detected && threeDsGame(detected)) this.selected_game = detected;
        },
    },
    computed: {
        settingsPanel() {
            return markRaw(threeDsSettingsPanel(this, this.module_id === "gen7" ? gen7Manifest : gen6Manifest));
        },
        /** The detected game's tables (data/index.ts) and its facts (games.ts). */
        tables() {
            return gameData();
        },
        game_info() {
            return this.tables.game;
        },
        zones() {
            return {
                leftTop: zoneStyle(ZONES.leftTop), leftBottom: zoneStyle(ZONES.leftBottom), ball: zoneStyle(ZONES.ball),
                ability: zoneStyle(ZONES.ability), moveset: zoneStyle(ZONES.moveset), right: zoneStyle(ZONES.right),
            };
        },
        panel_lines() {
            return RIGHT_PANEL_LINES;
        },
        panel_filter() {
            return `filter: saturate(${this.ui_saturation}) drop-shadow(0px 1px 1px)`;
        },
        in_battle() {
            return value(this.game.properties.battle?.in_battle) === true;
        },
        /**
         * The player's Pokemon as the panel shows it: the party's lead, with its battle record over it in battle.
         * Read once per change; every piece of the player panel takes its values from here.
         */
        solo() {
            const P = this.game.properties;
            const lead = P.player?.team?.[0];
            const species = speciesName(value(lead?.species));
            const present = species !== null && (Number(value(P.player?.team_count)) || 0) > 0;
            const record = this.in_battle ? P.battle?.player_team?.[0] : null;
            const inBattle = present && !!record && speciesName(value(record.species)) !== null;
            const read = (node, keys) => Object.fromEntries(keys.map((key) => [key, Number(value(node?.[key])) || 0]));
            const stats = inBattle
                ? { ...read(record.stats, STAT_KEYS), hp: Number(value(record.hp_max)) || 0 }
                : { ...read(lead?.stats, STAT_KEYS), hp: Number(value(lead?.stats?.hp_max)) || 0 };
            const stages = inBattle ? read(record.modifiers, ["attack", "defense", "special_attack", "special_defense", "speed", "accuracy", "evasion"]) : {};
            const shownStats = { ...stats };
            for (const key of ["attack", "defense", "special_attack", "special_defense", "speed"]) shownStats[key] = withStage(stats[key], stages[key]);
            const ivs = read(lead?.ivs, STAT_KEYS);
            const moves = [0, 1, 2, 3].map((i) => inBattle
                ? { name: moveName(value(record[`move_${i}`]?.id)), pp: Number(value(record[`move_${i}`]?.pp)) || 0 }
                : { name: moveName(value(lead?.moves?.[i]?.move)), pp: Number(value(lead?.moves?.[i]?.pp)) || 0 });
            return {
                present,
                inBattle,
                species,
                level: Number(value(inBattle ? record.level : lead?.level)) || 0,
                hp: Number(value(inBattle ? record.hp : lead?.stats?.hp)) || 0,
                hpMax: stats.hp,
                stats,
                stages,
                shownStats,
                ivs,
                evs: read(lead?.evs, STAT_KEYS),
                moves,
                nature: present ? (value(lead?.nature) ?? "") : "",
                ability: present ? abilityName(value(inBattle ? record.ability : lead?.ability)) : null,
                heldItem: present ? (value(inBattle ? record.held_item : lead?.held_item) ?? null) : null,
                friendship: Number(value(lead?.friendship)) || 0,
                status: present ? (value(lead?.status_condition) ?? null) : null,
                exp: Number(value(lead?.exp)) || 0,
                hiddenPower: present ? hiddenPowerType(ivs) : null,
            };
        },
        /** The species on screen: the party's lead once there is one, the picked Solo Pokemon until then. */
        displayed_species() {
            const lead = this.solo.present ? this.solo.species : null;
            return lead && this.tables.pokedex[lead] ? lead : this.starter;
        },
        shown_entry() {
            return dexEntry(this.tables, this.displayed_species);
        },
        base_stats() {
            return this.shown_entry?.base_stats ?? null;
        },
        species_art_src() {
            return speciesArtPath(this.tables, this.displayed_species);
        },
        growth_rate() {
            return this.shown_entry?.growth_rate ?? "";
        },
        ability_text() {
            return this.solo.present ? this.solo.ability : (this.shown_entry?.abilities?.[0] ?? "");
        },
        /** The nature's raised and lowered stats, as the arrow pictures are named; null for a neutral nature or none. */
        nature_arrows() {
            const nature = this.natures[this.solo.nature];
            return nature && nature.raises && nature.lowers && nature.raises !== nature.lowers ? nature : null;
        },
        /** The abilities the Solo Pokemon can be written with: its regular ones, then its hidden one. */
        starter_abilities() {
            const entry = this.tables.pokedex[this.starter];
            return [...new Set([...(entry?.abilities ?? []), ...(entry?.hidden_ability ? [entry.hidden_ability] : [])])];
        },
        /** "Male", "Female" or "Genderless" when the species has only one; null when the gender is a choice. */
        starter_fixed_gender() {
            const ratio = Number(this.tables.pokedex[this.starter]?.gender_ratio);
            return ratio === 255 ? "Genderless" : ratio === 254 ? "Female" : ratio === 0 ? "Male" : null;
        },
        evolution_family_list() {
            return evolutionFamily(this.tables, this.starter);
        },
        has_tutor_moves() {
            return (this.shown_entry?.tutor_learnset?.length ?? 0) > 0;
        },
        currentTexturePath() {
            return (this.textures[this.backgroundTexture] ?? this.textures.Normal)?.path ?? "";
        },
        hp_tracker_style() {
            const solo = this.solo;
            if (!solo.present) return healthTrackerStyle({ state: "Battle", hp: 1, maxHp: 1, status: null, pokerus: 0 });
            return healthTrackerStyle({
                state: this.in_battle ? "Battle" : "Overworld",
                hp: solo.hp, maxHp: solo.hpMax, status: solo.status,
                pokerus: value(this.game.properties.player?.team?.[0]?.pokerus),
            });
        },
        faults() {
            return this.blackout_counter + this.playerResets;
        },
        gametimeSplit() {
            const time = this.game.properties.game_time;
            return `${value(time?.hours) ?? 0}:${String(value(time?.minutes) ?? 0).padStart(2, "0")}`;
        },
        timer_frame_state() {
            this.timer_frame_version; // re-read when the Timer reports a change: its storage is not reactive
            return {
                mode: this.shuckie_timer ? "emulator" : "local",
                startTime: MyStorage.timer_startTime ?? 0,
                pause: MyStorage.timer_pause ?? true,
                pauseTime: MyStorage.timer_pause_time ?? 0,
                emulatorMs: this.emulatorStats?.time_current ?? null,
            };
        },

        /* ---- The player panel (playerPanel.ts) ---- */
        faults_layout() { return faultsLayout(this.game_info.badgeLayout, this.game_info.frames); },
        /** Moves the fault counts with the faults box under a badge box sized for its badges (playerPanel.ts). */
        faults_shift() { return `transform: translateY(${BADGE_BOX_DY[this.game_info.badgeLayout]}px);`; },
        faults_font_sizes() { return faultsFontSizes; },
        exp_bar_layouts() { return expBarLayouts; },
        exp_bar_timing() { return expBarTiming; },
        move_list_layout() { return moveListLayout; },
        stats_header() { return statsHeader(this); },
        stat_tiles() { return statTiles(this); },
        info_rows() { return infoRows(this); },
        type_badges() { return typeBadges(this); },
        player_move_list() { return playerMoveList(this); },
        battle_popups() { return battlePopups(this); },
        /** The badges owned (gen 7: island stamps), each in its place in the badge box (playerPanel.ts `badgeCellStyle`). */
        badges_view() {
            if (!this.solo.present) return [];
            const game = this.game_info;
            const won = this.badges_won;
            return game.badges.map((src, n) => ({ n, src })).filter((badge) => won[badge.n])
                .map((badge) => ({ key: badge.n, src: badge.src, style: badgeCellStyle(badge.n, this.game_info.badgeLayout) }));
        },
        /**
         * Whether each badge is won: the mapper's `player.badges[n]`, or in gen 7 (no badges in the mappers) the island's
         * stamp once this run has its grand trial split (games.ts `badgeSplits`).
         */
        badges_won() {
            const game = this.game_info;
            if (game.badgeSplits) {
                const done = new Set((this.current_splits ?? []).map((split) => split.trainer));
                return game.badges.map((_, n) => done.has(game.badgeSplits[n]));
            }
            const owned = this.game.properties.player?.badges;
            return game.badges.map((_, n) => !!owned && value(owned[n]) === true);
        },
        /** Every badge's place as a faint grey shape, under the owned ones: gen 5's progress picture, made from the badges. */
        badge_slots() {
            return this.game_info.badges.map((src, n) => ({ key: n, src, style: badgeCellStyle(n, this.game_info.badgeLayout) }));
        },

        /* ---- The right panel ---- */
        /** The opposing side's battle records, in party order; empty outside battle. */
        enemy_team() {
            if (!this.in_battle) return [];
            const P = this.game.properties;
            const count = Math.max(0, Math.min(6, Number(value(P.battle?.opponent?.team_count)) || 0));
            const team = [];
            for (let slot = 0; slot < count; slot++) {
                const mon = this.readBattler(P.battle?.opponent_team?.[slot], slot);
                if (mon) team.push(mon);
            }
            return team;
        },
        /** "Youngster Joey", "Trainer 37" where the mapper has no name, or null in a wild battle and outside battle. */
        opponent_label() {
            return this.in_battle ? trainerLabel(this.game.properties) : null;
        },
        /** The enemy panel shows: a trainer battle, or a wild one with "Show Wild Battles" on. */
        enemy_graphic() {
            if (!this.in_battle || this.enemy_team.length === 0) return false;
            return this.opponent_label !== null || this.show_wild_battles == true;
        },
        enemy_team_view() {
            const header = this.opponent_label !== null
                ? `${this.opponent_label}'s Team`
                : "Wild " + [...new Set(this.enemy_team.map((mon) => mon.species))].join(" & ");
            return enemyTeamView(this, this.enemy_team, header);
        },
        enemy_team_layout() { return enemyTeamLayout; },
        enemy_row_art() { return ENEMY_ROW_ART; },
        movepoolRows() {
            const entry = this.shown_entry;
            const moves = this.tables.moves;
            const row = (name) => moves[name] ?? { move: name, type: "Normal", category: "Status", power: null, accuracy: null, pp: "" };
            const machines = (entry?.tm_hm_learnset ?? []).map((name) => ({ way: this.tables.machineOf[name] ?? "TM", ...row(name) }));
            const order = (way) => (way.startsWith("HM") ? 1000 : 0) + (parseInt(way.slice(2), 10) || 999);
            machines.sort((a, b) => order(a.way) - order(b.way));
            return {
                level: markReminderMoves((entry?.level_up_learnset ?? []).map(([level, name]) => ({ Level: level, ...row(name) }))),
                tmhm: machines,
                tutor: (entry?.tutor_learnset ?? []).map((name) => row(name)),
            };
        },
        movepoolStruck() {
            const active = crossOutActive(this.unobtainable_moves_toggle, {
                starterObtained: this.solo.present,
                // Gen 7 has no badges: its first island stamp (Hala's grand trial) stands for the first badge.
                firstBadge: this.badges_won[0] === true,
            });
            const lists = this.tables.unobtainable;
            const firstRun = (this.attempt_number > 1 || this.banned_hidden_power == false) ? [] : (lists["First Playthrough"] || []);
            return struckMoves(active, { everywhere: [...(lists.Banned || []), ...firstRun], machines: lists[this.game_info.name] });
        },
        /** What the shared movepool table shows (core/overlay/Movepool.vue), with gen 5's look and the Secondary Screen rules. */
        movepoolView() {
            const user = this.move_user;
            const row = (x, way, first) => {
                const type = moveTypeFor(x, user) ?? x.type;
                return {
                    way, move: x.move, type, typeColor: `var(--current_${String(type).toLowerCase()})`,
                    dc: x.category, dcColor: `var(--current_${String(x.category).toLowerCase()})`,
                    power: basePower(x, user) ?? "-", accuracy: x.accuracy ?? "-", pp: x.pp, first,
                };
            };
            const rows = this.movepoolRows;
            const struck = this.movepoolStruck;
            const part = secondScreenPart(rows.level.length, rows.tmhm.length, rows.level.map((x) => x.Level), this.solo.level);
            const groups = [
                { struck: struck.everywhere, rows: part === "machines" ? [] : rows.level.map((x, index) => row(x, x.Level, index === 0)) },
                { struck: struck.machines, rows: part === "level" ? [] : rows.tmhm.map((x) => row(x, x.way)) },
            ];
            const tutorsFit = rows.level.length + rows.tmhm.length + rows.tutor.length <= SECOND_SCREEN_TUTOR_LIMIT;
            if (this.show_tutor_moves && tutorsFit && part === "all") groups.push({ struck: struck.machines, rows: rows.tutor.map((x) => row(x, "Tutor")) });
            return {
                title: movepoolTitle(part),
                titleClass: "posAbs movepoolLabel",
                titleFirst: true,
                dc: true,
                headerColor: `var(--current_${headerType(this.shown_entry)})`,
                fit: { containerHeight: 976, lineHeight: 19, fontSize: 14, shrinkFactor: 0.77, fontFrom: 17 },
                // The frame always stops level with the top screen's border (layout.ts), as gen 5's does in Secondary Screen.
                webcam: { frameBottom: 1055, tableHeight: 1000, limit: RIGHT_PANEL_LINES.frameBottom },
                groups,
            };
        },
        /** What moves are worked out against: the Pokemon on screen, or the species alone before there is one. */
        move_user() {
            const entry = this.shown_entry;
            const solo = this.solo;
            return {
                types: [entry?.type_1, entry?.type_2],
                ability: solo.ability,
                friendship: solo.present ? solo.friendship : null,
                ivs: solo.present ? solo.ivs : undefined,
            };
        },
        /** The enemy Pokemon that is out, for the player's move power and accuracy. */
        active_enemy() {
            if (!this.in_battle) return null;
            const position = Number(value(this.game.properties.battle?.opponent?.party_position)) || 0;
            return this.enemy_team.find((mon) => mon.slot === position) ?? this.enemy_team[0] ?? null;
        },
        /** The splits of the game in play order, and the run's splits against them (First) or against a loaded run (Followup). */
        compare_splits() {
            const order = this.game_info.splits;
            const current = this.effective_current_splits ?? [];
            const seconds = (time) => this.convertDurationToSeconds(time);
            const shown = (time) => this.convertSecondsToDuration(seconds(time));
            const latest = new Map();
            for (const split of current) if (order.includes(split.trainer)) latest.set(split.trainer, split);
            if (this.toggle_compare_splits === "First") {
                const done = [...latest.values()].map((split) => ({ trainer: split.trainer, current_time: shown(split.time) }));
                const rest = order.filter((trainer) => !latest.has(trainer)).map((trainer) => ({ trainer, current_time: "-" }));
                return [...done, ...rest];
            }
            const previous = this.previous_splits.length ? this.previous_splits.filter((row) => order.includes(row.trainer)) : order.map((trainer) => ({ trainer, time: null }));
            return previous.map((row) => {
                const before = row.time ? seconds(row.time) : null;
                const split = latest.get(row.trainer);
                if (!split) return { trainer: row.trainer, previous_time: before === null ? "-" : this.convertSecondsToDuration(before), current_time: "-", difference: "-" };
                const now = seconds(split.time);
                let difference = "-";
                if (before !== null) {
                    const diff = now - before;
                    difference = `${diff < 0 ? "-" : "+"}${Math.floor(Math.abs(diff) / 60)}:${String(Math.abs(diff) % 60).padStart(2, "0")}`;
                    if (difference == "+0:00") difference = "0:00";
                }
                return { trainer: row.trainer, previous_time: before === null ? "-" : this.convertSecondsToDuration(before), current_time: this.convertSecondsToDuration(now), difference };
            });
        },
        splitsView() {
            const mode = this.toggle_compare_splits;
            if (mode !== "First" && mode !== "Followup") return undefined;
            return {
                // Gen 5's icon classes (its style.css is loaded here too): 43.8px face icons, as in gen 5.
                table: { class: "splits_table tds-splits", icon: { imgClass: "icons splitIcon" } },
                head: splitsHead(mode, this.previous_label, this.current_label),
                headerColor: `var(--current_${headerType(this.shown_entry)})`,
                rows: this.compare_splits.map((split) => ({
                    icon: this.splitIcon(split.trainer),
                    cells: mode === "First" ? [split.trainer, "", "", split.current_time] : [split.trainer, split.previous_time, split.current_time, split.difference],
                    diffStyle: mode === "First" ? undefined : splitDiffColor(split.difference),
                })),
                // The movepool's frame (splits.svg is the same frame, cut short at 780), held at the movepool's
                // bottom line by `fill`, so the two panels are the same height.
                art: { class: "colored-image ds", style: [`filter: saturate(${this.ui_saturation})`, this.frame_url("movepool.svg")], frameBottom: 1055 },
                webcam: true,
                webcamLimit: RIGHT_PANEL_LINES.frameBottom,
                fill: true,
            };
        },
    },
    methods: {
        /** A frame picture's path: gen 6's round frames or gen 7's soft-cut ones (games.ts `frames`). */
        frame(path) {
            return `${this.game_info.frames}/${path}`;
        },
        /** The `--url` of a frame picture under `<frames>/ui/`, for a `colored-image` layer. */
        frame_url(picture) {
            return `--url: url(${this.frame("ui/" + picture)})`;
        },
        /* ---- Reading the game ---- */
        /** One battle record (`battle.player_team.N` / `battle.opponent_team.N`) as plain values, or null for an empty slot. */
        readBattler(node, slot) {
            const species = speciesName(value(node?.species));
            if (!node || species === null) return null;
            const number = (n) => Number(value(n)) || 0;
            return {
                slot,
                species,
                level: number(node.level) & 0xff,
                ability: abilityName(value(node.ability)),
                heldItem: value(node.held_item) ?? null,
                hp: number(node.hp),
                hpMax: number(node.hp_max),
                stats: { hp: number(node.hp_max), attack: number(node.stats?.attack), defense: number(node.stats?.defense), special_attack: number(node.stats?.special_attack), special_defense: number(node.stats?.special_defense), speed: number(node.stats?.speed) },
                stages: Object.fromEntries(["attack", "defense", "special_attack", "special_defense", "speed", "accuracy", "evasion"].map((key) => [key, number(node.modifiers?.[key])])),
                moves: [0, 1, 2, 3].map((i) => ({ name: moveName(value(node[`move_${i}`]?.id)), pp: number(node[`move_${i}`]?.pp), ppMax: number(node[`move_${i}`]?.pp_max) })),
            };
        },
        /**
         * A move as the player's list shows it: its type (Hidden Power's from the IVs), category, power and accuracy.
         * In battle the power counts the same-type bonus and the type chart against the enemy that is out, and the
         * accuracy the accuracy and evasion stages; outside battle both are the move's own.
         */
        moveFacts(name) {
            const move = this.tables.moves[name];
            const user = this.move_user;
            // A horde (a wild battle with more than one opponent) has no one target: the move's own numbers, as gen 5
            // shows them in a double battle. A trainer double can't be told from a single yet (no battle format in the
            // mappers), so it is worked out against the opponent the mapper calls out.
            const horde = this.opponent_label === null && this.enemy_team.length > 1;
            const enemy = horde ? null : this.active_enemy;
            const target = enemy ? { types: [dexEntry(this.tables, enemy.species)?.type_1, dexEntry(this.tables, enemy.species)?.type_2] } : null;
            const physical = move?.category === "Physical";
            // Gens 6-7 keep gen 5's accuracy rule (stages summed into one ratio, the modifiers chained): core/logic/moveAccuracy.ts.
            const hit = move?.accuracy == null ? null
                : enemy && this.solo.inBattle
                    ? moveAccuracy(5, { accuracy: move.accuracy, physical, accuracyStage: this.solo.stages.accuracy, evasionStage: enemy.stages.evasion, userAbility: this.solo.ability, targetAbility: enemy.ability, userItem: this.solo.heldItem, targetItem: enemy.heldItem })
                    : moveAccuracyPreview(5, { accuracy: move.accuracy, physical, userAbility: this.solo.ability, userItem: this.solo.heldItem });
            return {
                type: moveTypeFor(move, user) ?? "undefined",
                category: move?.category ?? "Status",
                power: shownPower(this.tables, name, user, target),
                accuracy: hit ?? "-",
            };
        },

        /* ---- Storage: a species' look and run counters ---- */
        gameName() {
            return value(this.game.properties.meta?.game_name) || this.selected_game;
        },
        styleKey() {
            return `${this.gameName()}_${this.displayed_species}`;
        },
        runKey() {
            return `${this.gameName()}_${this.starter}`;
        },
        saveSpeciesField(key, field, v) {
            MyStorage[key] = { ...(MyStorage[key] || {}), [field]: v };
        },
        /** The look of the species on screen: what is stored for it, else the defaults of its type. */
        loadSpeciesStyle() {
            const stored = MyStorage[this.styleKey()] || {};
            const type = dexEntry(this.tables, this.displayed_species)?.type_1 ?? "Normal";
            const defaults = {
                overlay_color: this.default_colors[type] ?? "#a8a878", ui_saturation: 0.6,
                imageXOffset: 0, imageYOffset: 0, imageScale: 1, imageFlip: false, imageSat: 100, imageRotation: 0,
                backgroundTexture: this.textures[type] ? type : "Normal", backgroundBlur: 0, backgroundHue: 0, backgroundScale: 100,
                backgroundUrl: "", backgroundFlip: false, backgroundXFlip: false, use_custom_background: false,
                backgroundXOffset: 0, backgroundYOffset: 0, backgroundBrightness: 100, backgroundContrast: 100, backgroundSaturation: 100,
            };
            this.is_loading_style = true;
            for (const field of VISUAL_STYLE_FIELDS) this[field] = stored[field] ?? defaults[field];
            // An unstyled background takes its texture's default look (core/overlay/textureLooks.ts).
            this.apply_texture_look();
            this.$nextTick(() => { this.is_loading_style = false; });
            document.documentElement.style.setProperty("--overlay-color", this.overlay_color);
        },
        loadRunState() {
            const stored = MyStorage[this.runKey()] || {};
            const loading = this.is_loading_style;
            this.is_loading_style = true;
            this.attempt_number = stored.attempt_number ?? 0;
            this.finished_run_count = stored.finished_run_count ?? 0;
            this.playerResets = stored.playerResets ?? 0;
            this.blackout_counter = stored.blackout_counter ?? 0;
            this.evolution = stored.evolution ?? false;
            this.evolution_splits_label = stored.evolution_splits_label ?? "";
            this.pkmnNature = this.natures[stored.pkmnNature] ? stored.pkmnNature : "Hardy";
            this.pkmn_ability = this.starter_abilities.includes(stored.pkmn_ability) ? stored.pkmn_ability : (this.starter_abilities[0] ?? "");
            this.pkmn_gender = stored.pkmn_gender === "Male" ? "Male" : "Female";
            this.iv_mode = stored.iv_mode === IV_MODE.manual ? IV_MODE.manual : IV_MODE.automatic;
            this.load_manual_ivs(stored.manual_ivs);
            this.hidden_power_type = this.hiddenpowers[stored.hidden_power_type] ? stored.hidden_power_type : "Dark";
            this.hidden_power_index = stored.hidden_power_index ?? 0;
            this.$nextTick(() => { this.is_loading_style = loading && this.is_loading_style; });
        },
        /** Everything stored for the Solo Pokemon, read again: what `/refresh` and a starter change do. */
        load_all_settings() {
            const stored = MyStorage.starter;
            if (stored && this.tables.pokedex[stored]) this.starter = stored;
            else if (!this.tables.pokedex[this.starter]) this.starter = speciesList(this.tables)[0];
            this.loadRunState();
            this.loadSpeciesStyle();
            this.syncExpBar();
        },
        /** The Solo Pokemon picker, `/set-starter`: a species of this game's Pokedex, in any of the mappers' spellings. */
        setStarter(species) {
            const name = speciesName(species);
            if (!name || !this.tables.pokedex[name]) {
                console.warn(`[3ds] "${species}" is not in ${this.game_info.name}'s Pokedex`);
                return;
            }
            this.starter = name;
            MyStorage.starter = name;
            this.loadRunState();
            this.loadSpeciesStyle();
        },
        /**
         * Writes the settings panel's nature, ability, gender and IVs into the party's lead (starterWrite.ts). `force`
         * is the button's: write even when the lead already holds them. Retries a write that could not be made yet.
         */
        async write_starter(force = false, reason = "button") {
            if (this.starter_write_busy) return false;
            this.starter_write_busy = true;
            try {
                for (let attempt = 1; attempt <= STARTER_WRITE_TRIES; attempt++) {
                    const outcome = await writeStarter({
                        props: this.game.properties,
                        tables: this.tables,
                        natures: this.natures,
                        choice: { species: this.starter, nature: this.pkmnNature, ability: this.pkmn_ability, gender: this.pkmn_gender, ivs: this.starter_ivs() },
                        preferred: this.starter,
                        force,
                    });
                    this.starter_write_status = outcome.message;
                    console.log(`[3ds] starter write (${reason}, try ${attempt}): ${outcome.ok ? "ok" : "not written"}: ${outcome.message}`);
                    if (outcome.ok) return true;
                    // In battle or no mapper support: trying again now would not help.
                    if (/in battle|mapper has no/.test(outcome.message) || this._unmounted) return false;
                    await this.sleep(1000);
                }
                return false;
            } finally {
                this.starter_write_busy = false;
            }
        },
        resetCurrentPokemonToDefaults() {
            StyleSettingsUtils.resetToDefaults(this.styleKey());
            this.loadSpeciesStyle();
        },
        exportStyleSettingsAsDefaults() {
            StyleSettingsUtils.exportCurrentAsDefaults();
        },
        async color_picker() {
            this.overlay_color = await this.colorPick();
        },

        /* ---- Counters ---- */
        increment(property) {
            this[property]++;
            if (this.shuckie_counters == true) this.incrementEmulatorCounter(property);
        },
        decrement(property) {
            if (this[property] == 0) return;
            this[property]--;
            if (this.shuckie_counters == true && this.emulatorStats?.counters?.[property] > 0) this.incrementEmulatorCounter(property, -1);
        },
        async disallow_faults_function() {
            this.disallow_faults = true;
            await this.sleep(this.disallow_delay);
            this.disallow_faults = false;
        },

        /* ---- Splits ---- */
        /** A split's face icon (tools/gen6/make-split-icons.py): images/gen6|gen7/split_images/<name>.webp. */
        splitIcon(split) {
            // The split's own name less a rematch tag ("Hala (E4)" is Hala's face), not its trainer: OR/AS's
            // "Tate&Liza" is "Liza & Tate" in battle memory, and the icon is tate_and_liza.
            const name = String(split).replace(/\s*\(.*\)$/, "").toLowerCase().replace(/&/g, "_and_");
            return `images/gen${this.game_info.generation}/split_images/${name}.webp`;
        },
        /** The split files' name: the species, or "<FullyEvolved>-line" with Evolution on. */
        getSplitFileName() {
            return this.evolution ? `${fullyEvolved(this.tables, this.starter)}-line` : this.starter;
        },
        /** The `finishes/` copy is named after the species in hand (a branching line's files share one folder). */
        getFinishFileName() {
            return this.evolution ? `${this.displayed_species}-line` : this.starter;
        },
        splitTarget() {
            return { game: this.gameName(), fileName: this.getSplitFileName(), attempt: this.attempt_number, testRun: this.testRun == true, refilming: this.refilming_mode == true };
        },
        openSplitsFolder() {
            const name = this.getSplitFileName();
            revealSplitFolder(this.refilming_mode == true ? splitPath(this.gameName(), "refilmed", name) : splitPath(this.gameName(), name));
        },
        async load_splits() {
            const comparison = await pickSplitComparison();
            if (!comparison) return;
            this.previous_splits_source = comparison.name;
            this.previous_splits = latestTimePerTrainer(comparison.rows).map((row) => ({ trainer: row.trainer, time: row.time }));
        },
        clear_splits() {
            this.previous_splits = [];
            this.previous_splits_source = null;
        },
        convertDurationToSeconds(duration) {
            const parts = String(duration ?? "").split(".")[0].split(":").map((part) => parseInt(part, 10) || 0);
            return parts.reduce((total, part) => total * 60 + part, 0);
        },
        /** The time a split is stamped with: Super Shuckie's with its timer on, else the overlay's own. */
        splitTime() {
            const time = this.timer.getTime();
            const real = `${this.padTime(time.hours)}:${this.padTime(time.minutes)}:${this.padTime(time.seconds)}.${this.padTime(time.ms)}`;
            if (!this.shuckie_timer) return { stamp: real, shown: this.timer.formatted_time[0] };
            const stamp = `${this.formatMilliseconds(this.emulatorStats?.time_current)}.${this.getCentiseconds(this.emulatorStats?.time_current)}`;
            return { stamp, shown: stamp };
        },
        /**
         * A battle was won (`battle.other.battle_end` left 0 with the battle still on). A trainer on the game's split
         * list gets its row, bookmark and CSV line; the final battle also ends the run. Steps run in a fixed order
         * with the run's end armed first, so a failed file write cannot skip it (known-legacy-bugs #165).
         */
        battleWon(battle) {
            const P = this.game.properties;
            if (!battle.trainer || !battle.trainerName) return;
            const game = this.game_info;
            if (game.splitClasses.length && battle.trainerClass && !game.splitClasses.includes(battle.trainerClass)) return;
            // The split's name: usually the trainer's, but a trainer fought twice has two (games.ts `splitFor`).
            const trainer = splitFor(game, battle.trainerName, new Set((this.current_splits ?? []).map((split) => split.trainer)));
            if (!trainer) return;
            const final = game.finalBattle.includes(trainer);
            const time = this.splitTime();
            const lead = P.player?.team?.[0];
            const row = [
                value(P.player?.name) ?? "", this.starter, trainer, time.stamp, String(this.playerResets), String(this.blackout_counter),
                String(this.solo.level), this.gametimeSplit, (Date.now() - this.battle_start) / 1000,
                ...[0, 1, 2, 3].map((i) => moveName(value(lead?.moves?.[i]?.move)) ?? ""),
            ];
            this.simple_data = row;
            this.simple_data_str = row.join(",") + "\n";
            if (final) {
                this.timer.stopTime();
                if (this.shuckie_timer == true) this.sendEmulatorEnd();
                this.run_complete = true;
                if (this.testRun == false && this.refilming_mode == false) this.finished_run_count++;
            }
            this.current_splits.push({ trainer, time: time.shown, id: battle.trainerId });
            if (this.automatic_post_battle_splits == true && game.postBattleSplits.includes(trainer)) this.prepare_for_splits = true;
            console.log(`Autosplitter - Battle Ended: Split: ${trainer} at ${time.stamp} (Gametime: ${this.gametimeSplit})`);
            addSplitBookmark(trainer, time.shown, battle.trainerId);
            const target = this.splitTarget();
            const finishes = this.finished_run_count;
            const finishName = this.getFinishFileName();
            logData(target, this.simple_data_str)
                .then(() => { if (final && !target.testRun) return logCopy(target, finishes, finishName); })
                .catch((error) => console.error("Error:", error));
        },
        async newRun() {
            this.current_splits = [];
            this.timer.setTimer(this.timer_startTimeOffset);
            this.playerResets = 0;
            this.blackout_counter = 0;
            this.run_complete = false;
            this.clear_right_panel_override();
            this.syncExpBar();
        },
        /**
         * A new game began in the cartridge: the timer starts if it stands at zero, and the attempt is counted.
         * `lateMs`: how long ago it began (the timer starts that far on, so a check that waited costs nothing).
         */
        runStarted(lateMs = 0) {
            if (this.shuckie_timer == true) {
                if (this.emulatorStats?.time_current != null) return;
                this.sendEmulatorStart(lateMs);
            } else {
                if (parseInt(this.timer.formatted_time[0]) != 0) return;
                this.timer.startTime(lateMs > 0 ? addToOffset(this.timer_startTimeOffset, lateMs) : this.timer_startTimeOffset);
            }
            if (this.refilming_mode == false) this.attempt_number++;
            this.current_splits = [];
            this.run_complete = false;
        },

        /* ---- Markers ---- */
        sendObsChapterMarker(chapterName) {
            sendChapterMarker(chapterName);
        },

        /* ---- Exp bar ---- */
        expStats(exp) {
            const progress = expProgress(this.shown_entry?.growth_rate, exp, "Medium Fast");
            if (isNaN(progress.percent)) progress.percent = 0;
            return progress;
        },
        /** Puts the bar where the lead's experience is, with no animation. */
        syncExpBar() {
            this.$nextTick(() => {
                const exp = this.solo.present ? this.solo.exp : 0;
                this._expBarAt = { species: this.displayed_species, exp };
                this.$refs.expBar?.setTransition(null);
                this.$refs.expBar?.setWidth(this.expStats(exp).percent * 100 + "%");
            });
        },

        /* ---- Super Shuckie ---- */
        async fetchEmulatorStats() {
            try {
                const response = await fetch("http://127.0.0.1:30158/stats");
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const text = await response.text();
                // Skipped when the body is the same as the last poll's: a new object would re-evaluate every binding.
                if (text !== this._lastEmulatorStatsText) {
                    this._lastEmulatorStatsText = text;
                    this.emulatorStats = JSON.parse(text);
                }
            } catch (error) {
                // Not answering: try again in 1 s rather than on the next tick, and say so once per 5 s.
                this._emulatorStatsRetryAt = Date.now() + 1000;
                if (!(Date.now() - (this._emulatorStatsErrorLoggedAt || 0) < 5000)) {
                    this._emulatorStatsErrorLoggedAt = Date.now();
                    console.error("Error fetching emulator stats:", error);
                }
            }
        },
        async postToEmulator(path, what) {
            try {
                const response = await fetch(`http://127.0.0.1:30158/${path}`, { method: "POST" });
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return true;
            } catch (error) {
                console.error(`Error sending ${what}:`, error);
                return false;
            }
        },
        sendEmulatorStart(lateMs = 0) {
            const base = this.timer_startTimeOffset != "00:00:00.00"
                ? this.timer_startTimeOffset.split(":").map((x) => parseInt(x)).reduce((acc, curr) => acc * 60 + curr, 0) * 1000
                : null;
            const offset = lateMs > 0 ? (base ?? 0) + Math.round(lateMs) : base;
            return this.postToEmulator(offset === null ? "mark-start" : `mark-start?offset=${offset}`, "start command");
        },
        sendEmulatorEnd() {
            return this.postToEmulator("mark-end", "end command");
        },
        incrementEmulatorCounter(name, by) {
            return this.postToEmulator(`increment-counter?name=${name}${by === undefined ? "" : `&by=${by}`}`, "counter");
        },
    },
    unmounted() {
        // The shell unmounts this component when the mapper unloads; the mapper subscriptions are the client's and
        // main.ts clears them at the same moment. What is this component's own is stopped here.
        this._unmounted = true;
        this.unbindHotkeys?.();
        clearInterval(this.emulatorStatsInterval);
        this.timer.stop();
        PubSub.unsubscribe("time_update", this._onTimeUpdate);
    },
    mounted() {
        const P = this.game.properties;
        const send = (marker) => this.sendObsChapterMarker(marker);
        // The Timer writes its storage outside Vue's reactivity; this is how the clock frame hears of a change.
        this.timer.onChange = () => { this.timer_frame_version++; };
        this.ready = true;
        this.pokemon_list = speciesList(this.tables);
        this.load_all_settings();
        // A first launch has no saved clock: it stands at the start offset, paused, until a new game starts it.
        if (MyStorage.timer_startTime == null) this.timer.setTimer(this.timer_startTimeOffset);
        this.timer.update();

        // Super Shuckie's stats, only while one of its features is on (the timer text, the fault counters, the split times).
        this.emulatorStatsInterval = setInterval(() => {
            if (this.ready && (this.shuckie_timer || this.shuckie_counters) && !(Date.now() < (this._emulatorStatsRetryAt || 0))) this.fetchEmulatorStats();
        }, 10);

        // EXP BAR: the party's experience moves once the battle's results are written back; the bar follows it,
        // through a level-up when there was one.
        P.player?.team?.[0]?.exp?.change?.(async (newProp) => {
            const exp = Number(newProp?.value) || 0;
            const before = this._expBarAt;
            const species = this.displayed_species;
            this._expBarAt = { species, exp };
            const bar = this.$refs.expBar;
            if (!bar) return;
            const to = this.expStats(exp);
            if (!before || before.species !== species || exp <= before.exp || !this.solo.present) {
                bar.setTransition(null);
                bar.setWidth(to.percent * 100 + "%");
                return;
            }
            await bar.animate(this.expStats(before.exp), to);
            bar.setTransition(null);
        });

        // RESETS: the save's trainer name empties when the game restarts. A replay being resumed looks the same for a
        // moment, so the reset is confirmed before it counts (core/logic/resetGuard.ts).
        P.player?.name?.change?.(async (newProp, oldProp) => {
            const emptied = !newProp?.value && !!oldProp?.value;
            const filled = !!newProp?.value && !oldProp?.value;
            const clock = this.timer.getTime();
            const running = this.shuckie_timer ? this.emulatorStats?.time_current > 0 : clock.hours + clock.minutes + clock.seconds + clock.ms > 0;
            if (emptied && running) {
                const allowed = this.disallow_faults == false && this.run_complete == false;
                this.disallow_faults_function();
                if (allowed && await confirmReset(() => !!P.player?.name?.value)) {
                    this.playerResets++;
                    send("RESET");
                    if (this.shuckie_counters) this.incrementEmulatorCounter("playerResets");
                }
            }
            // A NEW GAME, the late fallback (Sun/Moon name the player a minute into the intro, before the clock runs):
            // the name entered with no time played and no Pokemon, and still so a moment later, because a Continue
            // shows the name a few frames before the save's time and party (OR/AS, Ultra Moon).
            if (filled && clockSeconds() === 0 && partyEmpty()) {
                const at = Date.now();
                await this.sleep(NEW_SAVE_CONFIRM_MS);
                if (!this._unmounted && value(P.player?.name) && clockSeconds() === 0 && partyEmpty()) this.runStarted(Date.now() - at);
            }
        });

        // A NEW GAME (docs/gen6-inventory.md, "The new game"). The timer starts where it would in gens 3-5, as the new
        // game begins, from what the game shows (all checked against Scott's Super Shuckie replays):
        // - X/Y, OR/AS: the play-time clock leaves 0:00:00 as the intro begins, straight after "Begin game"; a loaded
        //   save jumps from 0:00:00 to its own time instead, and brings its name with it (or before it).
        // - Sun/Moon, Ultra Sun/Ultra Moon: `meta.save_loaded` (mapper 0.3.0) turns on as the language is confirmed,
        //   which is where these games start; a Continue turns it on too, with the save's name in the same read, so
        //   the new save must stay nameless, with no time played, for a moment. The timer is started that moment late.
        const clockSeconds = () => (Number(value(P.game_time?.hours)) || 0) * 3600 + (Number(value(P.game_time?.minutes)) || 0) * 60
            + (Number(value(P.game_time?.seconds)) || 0);
        const partyEmpty = () => (Number(value(P.player?.team_count)) || 0) === 0;
        let clockWas = clockSeconds();
        const clockMoved = () => {
            const now = clockSeconds();
            if (clockWas === 0 && now > 0 && now <= NEW_GAME_CLOCK_MAX_S && partyEmpty() && !value(P.player?.name)) this.runStarted((now - 1) * 1000);
            clockWas = now;
        };
        P.game_time?.seconds?.change?.(clockMoved);
        P.game_time?.minutes?.change?.(clockMoved);
        P.game_time?.hours?.change?.(clockMoved);
        P.meta?.save_loaded?.change?.(async (newProp, oldProp) => {
            if (newProp?.value !== true || oldProp?.value === true) return;
            if (value(P.player?.name) || clockSeconds() !== 0 || !partyEmpty()) return;
            const at = Date.now();
            await this.sleep(NEW_SAVE_CONFIRM_MS);
            if (this._unmounted || value(P.meta?.save_loaded) !== true) return;
            if (!value(P.player?.name) && clockSeconds() === 0 && partyEmpty()) this.runStarted(Date.now() - at);
        });

        // THE STARTER: the party goes from empty to one Pokemon, a fresh one (level 6 or under, as OR/AS can level it in
        // its first battle; in the first hour of the save), and the settings' nature, ability, gender and IVs are written into it (starterWrite.ts). A save being
        // loaded also fills an empty party, hence the level and time test. Out of battle only (OR/AS hand the starter
        // over in a battle; the write waits for it to end). A lead that already holds the values is left alone.
        let partyWasEmpty = (Number(value(P.player?.team_count)) || 0) === 0;
        let starterPending = false;
        const tryStarter = async () => {
            if (!starterPending || this.in_battle || this.set_starter_in_game != true) return;
            // Let the game finish handing the Pokemon over (and the mapper poll it) before reading it.
            await this.sleep(1000);
            if (!starterPending || this.in_battle) return;
            starterPending = false;
            const count = Number(value(P.player?.team_count)) || 0;
            const level = Number(value(P.player?.team?.[0]?.level)) || 0;
            const hours = Number(value(P.game_time?.hours)) || 0;
            if (count !== 1 || level < 1 || level > STARTER_MAX_LEVEL || hours !== 0) {
                console.log(`[3ds] starter write skipped: party ${count}, level ${level}, ${hours} h played (a loaded save, not a new starter)`);
                return;
            }
            if (await this.write_starter(false, "starter received")) starterGuardUntil = Date.now() + STARTER_GUARD_MS;
        };
        // For a while after the write, the game may still be handing the Pokemon over (the nickname screen, OR/AS's
        // first battle) from its own copy and put the old one back: if the lead changes, write again. writeStarter
        // leaves a lead that still holds the values alone, so this costs nothing when the stamp held.
        let starterGuardUntil = 0;
        let guardTimer = null;
        const guardStarter = () => {
            if (Date.now() > starterGuardUntil || this.set_starter_in_game != true) return;
            clearTimeout(guardTimer);
            guardTimer = setTimeout(() => {
                if (this._unmounted || this.in_battle || Date.now() > starterGuardUntil) return;
                if ((Number(value(P.player?.team_count)) || 0) !== 1) return;
                this.write_starter(false, "starter changed back");
            }, 500);
        };
        for (const node of [P.player?.team?.[0]?.species, P.player?.team?.[0]?.nature, P.player?.team?.[0]?.ability, P.player?.team?.[0]?.ivs?.hp]) {
            node?.change?.(guardStarter);
        }
        P.player?.team_count?.change?.((newProp) => {
            const count = Number(newProp?.value) || 0;
            if (count === 0) {
                partyWasEmpty = true;
                starterPending = false;
                return;
            }
            if (!partyWasEmpty) return;
            partyWasEmpty = false;
            if (this.set_starter_in_game != true) return;
            starterPending = true;
            tryStarter();
        });
        P.battle?.in_battle?.change?.((newProp) => { if (newProp?.value !== true) { tryStarter(); guardStarter(); } });

        // BATTLES: won when `battle_end` leaves 0 while the battle is on; a blackout when it ends unwon with every one
        // of the player's Pokemon at 0 HP. The battle's facts are remembered as they arrive: when `in_battle` turns
        // off the mapper has already emptied them.
        let battle = null;
        const noteBattle = () => {
            if (!battle || !this.in_battle) return;
            const id = Number(value(P.battle?.opponent?.id)) || 0;
            if (id !== 0) {
                battle.trainer = true;
                battle.trainerId = id;
                battle.trainerName = value(P.battle?.opponent?.trainer_name) || battle.trainerName || trainerLabel(P);
                battle.trainerClass = value(P.battle?.opponent?.trainer_class_name) || battle.trainerClass;
            }
            const count = Math.max(0, Math.min(6, Number(value(P.battle?.player?.team_count)) || 0));
            if (count > 0) {
                const hp = [];
                for (let slot = 0; slot < count; slot++) {
                    if (value(P.battle?.player_team?.[slot]?.species)) hp.push(Number(value(P.battle.player_team[slot].hp)) || 0);
                }
                if (hp.length) battle.playerHp = hp;
            }
        };
        setProfileSkip(() => this.testRun == true || this.refilming_mode == true);
        // The overlay started with a battle already on: it is followed from here, so its win or blackout still counts.
        if (value(P.battle?.in_battle) === true) {
            battle = { trainer: false, trainerId: 0, trainerName: null, trainerClass: null, playerHp: null, won: Number(value(P.battle?.other?.battle_end)) > 0 };
            noteBattle();
        }
        P.battle?.in_battle?.change?.((newProp) => {
            if (newProp?.value === true) {
                battle = { trainer: false, trainerId: 0, trainerName: null, trainerClass: null, playerHp: null, won: false };
                this.battle_start = Date.now();
                noteBattle();
                return;
            }
            const ended = battle;
            battle = null;
            onBattleEnded();
            if (!ended || ended.won) return;
            if (ended.playerHp && ended.playerHp.every((hp) => hp === 0)) {
                if (this.disallow_faults == false && this.run_complete == false) {
                    this.blackout_counter++;
                    send("BLACKOUT");
                    if (this.shuckie_counters) this.incrementEmulatorCounter("blackout_counter");
                }
                this.disallow_faults_function();
            }
        });
        for (const node of [P.battle?.opponent?.id, P.battle?.opponent?.trainer_name, P.battle?.opponent?.trainer_class_name, P.battle?.player?.team_count]) {
            node?.change?.(noteBattle);
        }
        for (let slot = 0; slot < 6; slot++) P.battle?.player_team?.[slot]?.hp?.change?.(noteBattle);
        P.battle?.other?.battle_end?.change?.((newProp) => {
            if (!battle || battle.won || !this.in_battle || !(Number(newProp?.value) > 0)) return;
            noteBattle();
            battle.won = true;
            try {
                this.battleWon(battle);
            } catch (error) {
                console.error("[3ds] the battle-won handler failed:", error);
            }
        });

        // Trainer IN/OUT, IN - Wild, Next Pokemon and Enemy Fainted (chapterMarkers.ts).
        wireThreeDsChapterMarkers({ props: P, send });

        // LEVEL UP (battle only, as gens 2 and 5): the battling lead's level goes up by one.
        P.battle?.player_team?.[0]?.level?.change?.((newProp, oldProp) => {
            const before = (Number(oldProp?.value) || 0) & 0xff, now = (Number(newProp?.value) || 0) & 0xff;
            if (!this.in_battle || before <= 0 || now !== before + 1) return;
            console.log("Chapter Detected: Level Up - " + now);
            send(`Level Up - ${now}`);
            send("Battle Level Up");
        });

        // NEW MOVE: one move more than a moment ago on the same species (four slots can change at once, so wait a beat).
        const readMoves = () => ({ species: this.solo.present ? this.solo.species : null, moves: this.solo.moves.map((m) => m.name).filter(Boolean) });
        let lastMoves = readMoves();
        let moveTimer = null;
        const checkMoves = () => {
            moveTimer = null;
            const before = lastMoves, now = readMoves();
            lastMoves = now;
            if (before.species !== now.species || before.moves.length < 1) return;
            const added = now.moves.filter((move) => !before.moves.includes(move));
            if (added.length !== 1) return;
            console.log("Chapter Detected: New Move - " + added[0]);
            send("New Move - " + added[0]);
        };
        const scheduleMoves = () => {
            if (moveTimer) clearTimeout(moveTimer);
            moveTimer = setTimeout(checkMoves, 100);
        };
        for (let i = 0; i < 4; i++) {
            P.player?.team?.[0]?.moves?.[i]?.move?.change?.(scheduleMoves);
            P.battle?.player_team?.[0]?.[`move_${i}`]?.id?.change?.(scheduleMoves);
        }
        P.battle?.in_battle?.change?.(() => { lastMoves = readMoves(); scheduleMoves(); });

        // HELD ITEM: an item newly held by a party member (the count of that item across the six slots goes up).
        const heldCounts = () => {
            const counts = new Map();
            for (let i = 0; i < 6; i++) {
                const item = value(P.player?.team?.[i]?.held_item);
                if (item) counts.set(item, (counts.get(item) ?? 0) + 1);
            }
            return counts;
        };
        let lastHeld = heldCounts();
        let heldTimer = null;
        let heldQuietUntil = 0;
        P.player?.name?.change?.(() => { heldQuietUntil = Date.now() + 5000; });
        for (let i = 0; i < 6; i++) {
            P.player?.team?.[i]?.held_item?.change?.(() => {
                if (heldTimer) clearTimeout(heldTimer);
                heldTimer = setTimeout(() => {
                    heldTimer = null;
                    const before = lastHeld, now = heldCounts();
                    lastHeld = now;
                    if (Date.now() < heldQuietUntil) return;
                    for (const [item, count] of now) {
                        if (count <= (before.get(item) ?? 0)) continue;
                        console.log("Chapter Detected: Held Item - " + item);
                        send("Held Item - " + item);
                    }
                }, 100);
            });
        }

        // MAP CHANGE, as gens 4-5 (Cutter cuts by map between story battles). The 3DS games pass through other ids
        // while a map loads (Ultra Sun/Moon: 0 for two seconds, or 2 for a frame, around battles and doors), so a map
        // counts once it has held for MAP_SETTLE_MS, and only if it is not the map last marked.
        let lastMap = Number(value(P.overworld?.map_index)) || null;
        let mapTimer = null;
        P.overworld?.map_index?.change?.((newProp) => {
            clearTimeout(mapTimer);
            const map = Number(newProp?.value) || 0;
            if (map === 0) return;
            mapTimer = setTimeout(() => {
                if (this._unmounted || this.in_battle || Number(value(P.overworld?.map_index)) !== map || map === lastMap) return;
                lastMap = map;
                send(`Map Change - ${map}`);
            }, MAP_SETTLE_MS);
        });

        this.unbindHotkeys = bindShortcuts({
            actions: threeDsActions(this, this.module_id === "gen7" ? gen7Manifest : gen6Manifest),
            namespace: this.module_id,
            title: `Generation ${this.module_id === "gen7" ? 7 : 6}`,
            gameLoaded: true,
        });
        // Where the species art stands (layout.ts): read by style.css through these.
        const root = document.documentElement.style;
        root.setProperty("--tds-art-left", ART_BOX.left + "px");
        root.setProperty("--tds-art-top", ART_BOX.top + "px");
        root.setProperty("--tds-art-size", ART_BOX.size + "px");
    },
});
</script>
