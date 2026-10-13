<template>
    <div class="typeContainer">
        <div class="type">
            <img :src="'images/elements/types/' + get_type(1) + '.webp'" />
            <img v-if="get_type(1) != get_type(2)" :src="'images/elements/types/' + get_type(2) + '.webp'" />
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent, inject } from "vue";
import PokeData from "~/logic/PokeData";
import { useMetaStore } from "~/stores/metaStore";
import { GameState } from "~/stores/types/GameState";
import { GameHookProperty } from "~/packages/gameHookMapperClient";

export default defineComponent({
    data() {
        return {
            /** Provided by the `frontend` component. */
            game_properties: inject<Record<string, GameHookProperty>>("game_properties", {}),
            meta: useMetaStore(),
        }
    },
    methods: {
        /**
         * Get the nth type of the current pokemon, as a lower case string. In battle the battle types
         * (wBattleMonType, which Conversion and Transform overwrite); otherwise, or when a battle type is
         * unreadable (a backported type the mapper cannot name), the species, falling back to the starter, then "normal".
         */
        get_type(typeNumber: 1 | 2): string {
            if (this.meta.gameState == GameState.in_battle && this.game_properties.player?.team?.[0]?.species?.value != "Backport") {
                const battle_type1 = this.game_properties.battle?.yourPokemon?.type1?.value;
                const battle_type2 = this.game_properties.battle?.yourPokemon?.type2?.value;
                if (battle_type1 && battle_type2) {
                    return String(typeNumber === 1 ? battle_type1 : battle_type2).toLowerCase();
                }
            }
            const data = PokeData.findSpecies(this.meta.currentSpecies) ?? PokeData.findSpecies(this.meta.starter);
            const type = typeNumber === 1 ? data?.type_1 : data?.type_2;
            return (type ?? "Normal").toLowerCase();
        },
    }
});
</script>
