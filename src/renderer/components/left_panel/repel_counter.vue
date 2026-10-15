
<template>
    <div v-if="display">
        <popup-box v-bind="boxes.single"></popup-box>
        <popup-box v-bind="boxes.besideBoth"></popup-box>
    </div>
</template>

<script lang="ts">
import { defineComponent, inject } from "vue";
import { useSpeciesMetricsStore } from "~/stores/useSpeciesMetricsStore.js";
import { FaultMode } from "~/stores/types/FaultMode";
import { useOverlaySettingsStore } from "~/stores/useOverlaySettingsStore.js";
import { useMetaStore } from "~/stores/metaStore.js";
import { GameState } from "~/stores/types/GameState";
import {  GameHookProperty } from "~/packages/gameHookMapperClient";
import { PopupBox, type PopupBoxProps } from "~/core/overlay/player/PopupBox";
import { popupBoxes } from "~/games/gen1/playerPanel";
export default defineComponent({
    components: { PopupBox },
    data() {
        return { 
            game_properties: inject<Record<string, GameHookProperty>>("game_properties", {}),
            meta: useMetaStore(),
            settings: useOverlaySettingsStore(), 
            metrics: useSpeciesMetricsStore() 
        }
    },
    computed: {
        display() {
            return this.settings.pop_ups.repel.enabled
                && this.meta.gameState === GameState.overworld 
                && this.game_properties.overworld.repelCount.value > 0;
        },
        /** One box beside a single faults box, the `_1` box beside a double one (games/gen1/playerPanel.ts). */
        boxes(): Record<"single" | "besideBoth", PopupBoxProps> {
            const both = this.metrics.faultsMode == FaultMode.both;
            const steps = this.game_properties.overworld.repelCount.value;
            return {
                single: { ...popupBoxes.repel, shown: !both, value: !both ? steps : null },
                besideBoth: { ...popupBoxes.repelBesideBoth, shown: both, value: both ? steps : null },
            };
        }
    }
});
</script>