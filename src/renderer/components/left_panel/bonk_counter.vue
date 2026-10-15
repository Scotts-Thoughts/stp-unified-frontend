
<template>
    <div v-if="enabled">
        <div v-if="mode === 'Bonks'">
            <popup-box v-bind="boxes.bonks"></popup-box>
            <popup-box v-bind="boxes.bonksBesideBoth"></popup-box>
        </div>
        <div v-else-if="mode === 'Item Count'">
            <popup-box v-bind="boxes.itemCount"></popup-box>
            <popup-box v-bind="boxes.itemCountBesideBoth"></popup-box>
        </div>
    </div>
</template>

<script lang="js">
import { defineComponent } from "vue";
import { useOverlaySettingsStore } from "~/stores/useOverlaySettingsStore.js";
import { useSpeciesMetricsStore } from "~/stores/useSpeciesMetricsStore.js";
import { useMetaStore } from "~/stores/metaStore.js";
import { GameState } from "~/stores/types/GameState";
import { PopupBox } from "~/core/overlay/player/PopupBox";
import { popupBoxes } from "~/games/gen1/playerPanel";
export default defineComponent({
    components: { PopupBox },
    inject: ["game_properties"],
    data() {
        return { 
            meta: useMetaStore(),
            settings: useOverlaySettingsStore(),
            metrics: useSpeciesMetricsStore() 
        }
    },
    computed: {
        enabled() {
            return this.meta.gameState === GameState.overworld && this.settings.pop_ups.bonks.enabled;
        },
        mode() {
            return this.settings.pop_ups.bonks.mode;
        },
        bonks() {
            return this.game_properties.patch.steps.bonks.value;
        },
        /** Bonks or the item count, beside a single or a double faults box (games/gen1/playerPanel.ts). */
        boxes() {
            const both = this.metrics.faultsMode == 'Both';
            if (this.mode === 'Bonks') {
                return {
                    bonks: { ...popupBoxes.bonks, shown: !both, value: !both ? this.bonks : null },
                    bonksBesideBoth: { ...popupBoxes.bonksBesideBoth, shown: both, value: both ? this.bonks : null },
                };
            }
            const count = () => this.game_properties?.player.itemCount.value;
            return {
                itemCount: { ...popupBoxes.itemCount, shown: !both, value: !both ? count() : null },
                itemCountBesideBoth: { ...popupBoxes.itemCountBesideBoth, shown: both, value: both ? count() : null },
            };
        }
    }
});
</script>