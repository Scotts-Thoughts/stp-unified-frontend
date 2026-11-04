<template>
    <game-clock wrapper-class="gametime" :shuckie="settings.shuckie.timer" :hidden="frameLive">
        <!-- The clock in its own process (core/overlay/ClockFrame.ts); the two lines show until it is up. -->
        <clock-frame :gen="1" @live="frameLive = $event"></clock-frame>
    </game-clock>
</template>

<script lang="ts">
import PubSub from "~/logic/PubSub";
import { Timer } from "~/logic/Timer";
import { computed, defineComponent } from "vue";
import { useOverlaySettingsStore } from "~/stores/useOverlaySettingsStore";
import { useSpeciesMetricsStore } from "~/stores/useSpeciesMetricsStore";
import { useEmulatorStatsStore, formatShuckieTime } from "~/core/stores/useEmulatorStatsStore";
import { ClockFrame, type ClockState } from "~/core/overlay/ClockFrame";
import GameClock from "~/core/overlay/player/GameClock.vue";

// gen1's time sources for the shared clock (core/overlay/player/GameClock.vue): its own timer, published by the
// timer loop on `@timer/update`, and Super Shuckie's time.
export default defineComponent({
    components: { ClockFrame, GameClock },
    provide() {
        return {
            // What the clock's two lines show (core/overlay/LiveText.ts); read there, so this render does not depend on it.
            liveText: {
                timer_clock:    computed(() => this.localTime),
                timer_frames:   computed(() => this.localFrames),
                shuckie_clock:  computed(() => formatShuckieTime(this.emulator.timeCurrent)[0]),
                shuckie_frames: computed(() => formatShuckieTime(this.emulator.timeCurrent)[1]),
            },
            // What <clock-frame> posts to the out-of-process clock; read there, so this render does not depend on it.
            clockState: computed(() => this.frameState),
        };
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
    watch: {
        // The timer's frame loop ends while it has nothing to draw (logic/Timer.ts `updateLoop`):
        // restart it when the timer may have started -- by a button, a hotkey or the store loading
        // from disk -- and stop or restart it as the out-of-process clock appears or goes away.
        "metrics.timer.paused"() {
            Timer.ensure(this.metrics).wake();
        },
        frameLive(live: boolean) {
            Timer.ensure(this.metrics).setFrameLive(live);
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
        Timer.ensure(this.metrics).wake(); // the loop ends when nobody is subscribed
    },
    // Was `onUnmounted`, which the Options API never calls: every overlay unmount
    // left the old instance subscribed, so the timer loop kept publishing into dead
    // components and could never tell that nobody was listening (Timer.updateLoop).
    unmounted() {
        PubSub.unsubscribe("@timer/update", this.onTimeUpdate);
    }
});
</script>
