
<template>
    <div v-if="battle_fade == true && (meta.gameState == 'Battle' || meta.gameState == 'From Battle')">
        <popup-box v-bind="boxes.accuracy"></popup-box>
        <popup-box v-bind="boxes.evasion"></popup-box>
        <popup-box v-bind="boxes.screens"></popup-box>
    </div>
</template>

<script lang="ts">
import { defineComponent, inject } from "vue";
import { GameHookProperty } from "~/packages/gameHookMapperClient";
import { useMetaStore } from "~/stores/metaStore";
import { PopupBox, type PopupBoxProps } from "~/core/overlay/player/PopupBox";
import { popupBoxes } from "~/games/gen1/playerPanel";
import { formatStage } from "~/core/logic/statFormat";

/** A stage byte the battle structure holds when no stage is set (0x07 is stage 0; 0x00 / 0xFF: not in a battle yet). */
const noStage = (byte: number) => byte == 0x07 || byte == 0x00 || byte == 0xFF;

export default defineComponent({
    components: { PopupBox },
    data() {
        return { 
            game_properties: inject<Record<string, GameHookProperty>>("game_properties", {}),
            meta: useMetaStore(),
        }
    },
    computed: {
        /** The three boxes' props (games/gen1/playerPanel.ts popupBoxes), worked out once per change. */
        boxes(): Record<"accuracy" | "evasion" | "screens", PopupBoxProps> {
            const mon = this.game_properties.battle.yourPokemon;
            const accuracy = !noStage(mon.modStageAccuracy.bytes[0]);
            const evasion = !noStage(mon.modStageEvasion.bytes[0]);
            const screens = mon.effects.reflect.bytes[0] != 0xFF && (mon.effects.reflect.value == true || mon.effects.lightScreen.value == true);
            return {
                accuracy: { ...popupBoxes.accuracy, shown: accuracy, value: accuracy ? formatStage(mon.modStageAccuracy.value) : null },
                evasion: { ...popupBoxes.evasion, shown: evasion, value: evasion ? formatStage(mon.modStageEvasion.value) : null },
                screens: screens
                    ? { ...popupBoxes.screens, shown: true, label: this.screen[2], value: this.screen[0], valueStyle: this.screen[1] }
                    : { ...popupBoxes.screens, shown: false },
            };
        },
        battle_fade() {
            const trainerClasses = ["LORELEI", "BRUNO", "AGATHA", "LANCE", "RIVAL3"];
            const validStates = ["To Battle", "From Battle"];
            if (this.meta.gameState == "Battle") {
                return true;
            }
            return validStates.includes(this.meta.gameState) 
                && (trainerClasses.includes(this.game_properties.battle.trainer.class.value) || this.meta.gameState != "From Battle")
        },
        screen() {
            if (this.game_properties.battle.yourPokemon.effects.reflect.value == true && this.game_properties.battle.yourPokemon.effects.lightScreen.value == true) {
                return ["Both","font-size: 20px","screens",]
            }
            if (this.game_properties.battle.yourPokemon.effects.lightScreen.value == true) {
                return ["Light Screen","font-size: 16px","screen",]
            }
            if (this.game_properties.battle.yourPokemon.effects.reflect.value == true) {
                return ["Reflect","font-size: 20px","screen",]
            }
            else {
                return [" ","font-size: 20px","screen",]
            }
        },
    }
});
</script>