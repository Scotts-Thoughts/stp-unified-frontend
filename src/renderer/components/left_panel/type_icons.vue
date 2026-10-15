<template>
    <!-- The type badges (core/overlay/player/TypeBadges.ts, laid out in games/gen1/playerPanel.ts) -->
    <type-badges v-bind="type_badges"></type-badges>
</template>

<script lang="ts">
import { defineComponent, inject } from "vue";
import PokeData from "~/logic/PokeData";
import { useMetaStore } from "~/stores/metaStore";
import { GameState } from "~/stores/types/GameState";
import { GameHookProperty } from "~/packages/gameHookMapperClient";
import { TypeBadges } from "~/core/overlay/player/TypeBadges";
import { typeBadgesLayout } from "~/games/gen1/playerPanel";

export default defineComponent({
    components: { TypeBadges },
    data() {
        return {
            /** Provided by the `frontend` component. */
            game_properties: inject<Record<string, GameHookProperty>>("game_properties", {}),
            meta: useMetaStore(),
        }
    },
    computed: {
        /** The badges' pictures, each type worked out once per change. */
        type_badges() {
            const type1 = this.get_type(1);
            const type2 = this.get_type(2);
            return {
                layout: typeBadgesLayout,
                src1: 'images/elements/types/' + type1 + '.webp',
                src2: 'images/elements/types/' + type2 + '.webp',
                dual: type1 != type2,
            };
        },
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
