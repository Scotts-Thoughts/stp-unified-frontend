<template>
    <div class="gametime">
        <!-- <div class="genericLabels timerLabel">time played at 4x game speed</div> -->
        <div class="gametimeClock" :style="frameLive ? 'visibility: hidden' : null">{{ time }}</div>
        <div class="gametimeFrames" :style="frameLive ? 'visibility: hidden' : null">{{ frames }}</div>
        <!-- The clock in its own process (core/overlay/ClockFrame.ts); the two above show until it is up. -->
        <clock-frame :gen="1" @live="frameLive = $event"></clock-frame>
    </div>
</template>

<script lang="ts">
import PubSub from "~/logic/PubSub";
import { computed, defineComponent } from "vue";
import { useOverlaySettingsStore } from "~/stores/useOverlaySettingsStore";
import { useSpeciesMetricsStore } from "~/stores/useSpeciesMetricsStore";
import { useEmulatorStatsStore, formatShuckieTime } from "~/core/stores/useEmulatorStatsStore";
import { ClockFrame, type ClockState } from "~/core/overlay/ClockFrame";

export default defineComponent({
    components: { ClockFrame },
    provide() {
        // What <clock-frame> posts to the out-of-process clock; read there, so this render does not depend on it.
        return { clockState: computed(() => this.frameState) };
    },
    data() {
        return {
            settings: useOverlaySettingsStore(),
            metrics: useSpeciesMetricsStore(),
            emulator: useEmulatorStatsStore(),
            localTime: "0",
            localFrames: ".00",
            frameLive: false,
        };
    },
    computed: {
        time(): string {
            if (this.settings.shuckie.timer) {
                return formatShuckieTime(this.emulator.timeCurrent)[0];
            }
            return this.localTime;
        },
        frames(): string {
            if (this.settings.shuckie.timer) {
                return formatShuckieTime(this.emulator.timeCurrent)[1];
            }
            return this.localFrames;
        },
        /** What the out-of-process clock needs: the timer fields and Super Shuckie's time. */
        frameState(): ClockState {
            return {
                mode: this.settings.shuckie.timer ? "emulator" : "local",
                startTime: this.metrics.timer.started_at,
                pause: this.metrics.timer.paused,
                pauseTime: this.metrics.timer.paused_at,
                emulatorMs: this.emulator.timeCurrent ?? null,
            };
        },
    },
    methods: {
        onTimeUpdate(value: string[]) {
            this.localTime = value[0];
            this.localFrames = value[1];
        },
    },
    created() {
        PubSub.subscribe("@timer/update", this.onTimeUpdate);
    },
    // Was `onUnmounted`, which the Options API never calls: every overlay unmount
    // left the old instance subscribed, so the timer loop kept publishing into dead
    // components and could never tell that nobody was listening (Timer.updateLoop).
    unmounted() {
        PubSub.unsubscribe("@timer/update", this.onTimeUpdate);
    }
});
</script>
