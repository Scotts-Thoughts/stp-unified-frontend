<template>
    <div class="gametime">
        <!-- <div class="genericLabels timerLabel">time played at 4x game speed</div> -->
        <div class="gametimeClock">{{ time }}</div>
        <div class="gametimeFrames">{{ frames }}</div>
    </div>
</template>

<script lang="ts">
import PubSub from "~/logic/PubSub";
import { defineComponent } from "vue";
import { useOverlaySettingsStore } from "~/stores/useOverlaySettingsStore";
import { useEmulatorStatsStore, formatShuckieTime } from "~/core/stores/useEmulatorStatsStore";

export default defineComponent({
    data() {
        return {
            settings: useOverlaySettingsStore(),
            emulator: useEmulatorStatsStore(),
            localTime: "0",
            localFrames: ".00",
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
    onUnmounted() {
        PubSub.unsubscribe("@timer/update", this.onTimeUpdate);
    }
});
</script>
