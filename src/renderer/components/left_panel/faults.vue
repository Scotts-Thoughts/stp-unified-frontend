<template>
    <faults-box :layout="layout" :mode="top_left_ui_selector" :resets="reset_count" :blackouts="blackout_count" :font-sizes="fontSizes"></faults-box>
</template>

<script>
import PubSub from "~/logic/PubSub";
import { sendChapterMarker } from "~/core/logic/shuckieBookmarks";
import { gen1ChapterMarkers } from "~/games/gen1/markers";
import { useSpeciesMetricsStore } from "~/stores/useSpeciesMetricsStore.js";
import { defineComponent, markRaw } from "vue";
import { FaultsBox } from "~/core/overlay/player/FaultsBox";
import { faultMode } from "~/core/logic/faultMode";
import { faultsLayout, faultsFontSizes } from "~/games/gen1/playerPanel";
import { useMetaStore } from "~/stores/metaStore.js";
import { useGameSpeciesData } from "~/stores/useGameSpeciesData.js";
import { useOverlaySettingsStore } from "~/stores/useOverlaySettingsStore";
import { useEmulatorStatsStore } from "~/core/stores/useEmulatorStatsStore";
// The markup is the shared faults box (core/overlay/player/FaultsBox.ts, laid out in games/gen1/playerPanel.ts);
// gen1's run logic (resets, blackouts, chapter markers) stays here.
export default defineComponent({
    components: { FaultsBox },
    inject: [ "game_properties" ],
    data() {
        return {
            layout: markRaw(faultsLayout),
            fontSizes: faultsFontSizes,
            meta: useMetaStore(),
            metrics: useSpeciesMetricsStore(),
            runConfig: useGameSpeciesData(),
            settings: useOverlaySettingsStore(),
            emulator: useEmulatorStatsStore(),
        }
    },
    computed: {
        reset_count() {
            return this.settings.shuckie.counters ? this.emulator.playerResets : this.metrics.resets;
        },
        blackout_count() {
            return this.settings.shuckie.counters ? this.emulator.blackoutCounter : this.metrics.blackouts;
        },
        top_left_ui_selector() {
            return faultMode(this.reset_count, this.blackout_count);
        },
    },
    methods: {
        clear_playthrough_data() {
            this.metrics.update("resets", 0);
            this.metrics.update("blackouts", 0);
            this.metrics.update("blackout_pending", false);
        },
        reset_occurred() {
            this.metrics.update("blackout_pending", false);
            this.metrics.update("resets", this.metrics.resets + 1);
            sendChapterMarker(gen1ChapterMarkers.reset());
            if (this.settings.shuckie.counters) {
                this.emulator.incrementCounter("playerResets");
            }
        },
        check_blackout([newProp, oldProp]) {
            if (newProp?.value == "Overworld" && oldProp?.value == "Battle" && this.metrics.blackout_pending == true) {
                this.metrics.update("blackout_pending", false);
                if (this.runConfig.advanced.count_blackouts) {
                    sendChapterMarker(gen1ChapterMarkers.blackout());
                    this.metrics.update("blackouts", this.metrics.blackouts + 1);
                    if (this.settings.shuckie.counters) {
                        this.emulator.incrementCounter("blackout_counter");
                    }
                }
            }
            else if (newProp?.value == "Overworld") {
                this.metrics.update("blackout_pending", false);
            }
        },
        new_run_started() {
            if (this.runConfig.advanced.no_attempt == true) {
                return
            }
            this.metrics.update("resets", 0);
            this.metrics.update("blackouts", 0);
        },
    },
    created() {
        PubSub.subscribe("@run/cleared", this.clear_playthrough_data);
        PubSub.subscribe("@run/reset_occurred", this.reset_occurred);
        PubSub.subscribe("@run/check_blackout", this.check_blackout);
        PubSub.subscribe("@run/new_run_started", this.new_run_started);
    },
    mounted() {
        this.game_properties.player.team[0].hp.change((newProp, oldProp) => {
            if (newProp.value == 0 && this.game_properties.meta.state.value == 'Battle') {
                this.metrics.update("blackout_pending", true);
            }
        })
    },
    unmounted() {
        PubSub.unsubscribe("@run/cleared", this.clear_playthrough_data);
        PubSub.unsubscribe("@run/reset_occurred", this.reset_occurred);
        PubSub.unsubscribe("@run/check_blackout", this.check_blackout);
        PubSub.unsubscribe("@run/new_run_started", this.new_run_started);
    }
});
</script>
