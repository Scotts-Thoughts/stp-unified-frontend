<template>
<div>
    <div class="mainContainer">
        <graphics />

        <!-- Background Process: -->
        <state />

        <left_panel />

        <right_panel :current_splits :previous_splits :collect_split_data />
        <game_area />
        <enemy_sprite_resize_handle />
    </div>
</div>
</template>

<script>
/**
 * The overlay itself: the three panels, the graphics layer and the split state that the
 * right panel compares (plan 1.1, converted from `components/frontend.js`).
 *
 * The mapper subscriptions this component used to install in `mounted` are now
 * `games/gen1/hooks.ts`; nothing else moved. `game` is the session `main.ts` builds --
 * the detected module and profile, and `properties` as the profile's canonical view
 * over the mapper (plan 1.4). The script block stays plain JavaScript: the reads below
 * are canonical keys now, but the view is untyped until Phase 2 settles the shared
 * key shapes.
 */
import PubSub from "~/logic/PubSub";
import { installGen1RunHooks } from "~/games/gen1/hooks";
import { getUserState, setUserState } from "~/core/persistence/userState";
import { log_split, autosplitter_process, format_trainer_name } from "../autosplitter/autosplitter_functions.js";
import { computed, defineComponent } from "vue";
import { useOverlaySettingsStore } from "~/stores/useOverlaySettingsStore.js";
import { useGameSpeciesData } from "~/stores/useGameSpeciesData.js";
import { useSpeciesMetricsStore } from "~/stores/useSpeciesMetricsStore.js";
import { useMetaStore } from "~/stores/metaStore";
import { useBattleStore } from "~/stores/useBattleStore";
import { useEmulatorStatsStore } from "~/core/stores/useEmulatorStatsStore";

// vue components:
import graphics from "./graphics.vue";
import state from "./state.vue"; // background process.
import left_panel from "./left_panel.vue";
import game_area from "./game_area.vue";
import right_panel from "./right_panel.vue";
import enemy_sprite_resize_handle from "./enemy_sprite_resize_handle.vue";

export default defineComponent({
    components: {
        graphics,

        state, // Background Processes

        left_panel, // Left Panel
        game_area, // Middle Panel
        right_panel, //Right Panel
        enemy_sprite_resize_handle, // dev-only resize tool
    },
    props: [ "game" ],
    data() {
        return {
            battle: useBattleStore(),
            meta: useMetaStore(),
            metrics: useSpeciesMetricsStore(),
            settings: useOverlaySettingsStore(),
            runConfig: useGameSpeciesData(),
            emulator: useEmulatorStatsStore(),

            // Static Data
            autosplitter_toggle: true,
            collect_split_data: true,

            split_data: [],
            split_logStr: "",
            simple_data_str: "",
            full_data_str: "",
            deprecated_data_str: "",
            simple_data: "",
            previous_splits: [],
            current_splits: [],
        }
    },
    created() {
        PubSub.subscribe("@run/cleared", this.clear_run);
        // The queuer's `/load-split-file` route: main reads and parses the CSV, the
        // control handler publishes the rows (plan 1.8).
        PubSub.subscribe("@splits/previous_loaded", this.set_previous_splits);
    },
    unmounted() {
        PubSub.unsubscribe("@run/cleared", this.clear_run);
        PubSub.unsubscribe("@splits/previous_loaded", this.set_previous_splits);
    },
    watch: {
        current_splits: {
            handler: function (newVal) {
                setUserState("current_splits", newVal)
            },
            deep: true,
        },
        previous_splits: {
            handler: function (newVal) {
                setUserState("previous_splits", newVal)
            },
            deep: true,
        },
        // When the Shuckie timer toggle is turned on and the emulator reports no running
        // timer, kick it off. The same check after every poll (which covers replays and
        // a flag enabled mid-session) is the `afterPoll` hook games/gen1/index.ts hands
        // the store: a watcher on `emulator.stats` no longer sees every poll, because an
        // unchanged body leaves the object alone.
        "settings.shuckie.timer"(enabled) {
            if (enabled) {
                this.emulator.ensureStarted();
            }
        },
    },
    computed: {
        gametimeSplit() {
            const h = this.game.properties.gameTime.hours
            const m = this.game.properties.gameTime.minutes
            const timecode = h + ":" + m.toString().padStart(2, "0")
            return timecode
        },
        /** "Y", "R" or "B", used as prefix of the split file names. */
        gameLetter() {
            return this.settings.gameLetter;
        },
        /** Folder under `splits/` that the split files are written to. */
        gamePath() {
            return this.meta.game;
        },
    },
    methods: {
        /** Start over: clears the splits, resets the timer and forgets the current save file. */
        clear_run() {
            this.current_splits = []
            this.battle_summary_header = "Battle Summary"
            // The post-battle splits override belongs to the run being cleared.
            this.settings.clearRightPanelOverride();
            this.metrics.resetTimer();
            this.metrics.update("player_id", 0);
            this.metrics.update("run_finished", false);
            this.metrics.update("splits_logged", false);
        },
        /** Replaces the split comparison shown in the right panel. */
        set_previous_splits(splits) {
            this.previous_splits = Array.isArray(splits) ? splits : [];
        },
        load_split_settings() {
            this.current_splits = getUserState("current_splits", [])
            this.previous_splits = getUserState("previous_splits", [])
        },
        padTime(time) {
            return !time
                ? "00"
                : time.toString().padStart(2, "0");
        },
        sleep(ms) {
            return new Promise((res) => setTimeout(res, ms))
        },
        log_split,
        autosplitter_process,
        format_trainer_name,
    },
    mounted: async function () {
        this.load_split_settings();
        // Everything that used to follow lives in games/gen1/hooks.ts (plan 1.1). The
        // hooks take this instance as their context, so the split-data fields and the
        // autosplitter_functions methods they use are unchanged.
        installGen1RunHooks(this);
    },
    provide() {
        return {
            // The canonical view (plan 1.4): the mapper client's own property objects,
            // under the names the profile declares.
            "game_properties": computed(() => {
                return this.game.properties;
            }),
            "game": computed(() => this.game),
        }
    }
});
</script>
