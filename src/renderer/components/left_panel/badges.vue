<template>
    <img class="canvas" :src="'images/elements/badges.webp'"/>
    <div v-show="game_properties.meta.state.value != 'No Pokemon'">
        <BadgeRow :badges="badges" v-bind="badgeRowLayout"></BadgeRow>
    </div>
</template>

<script lang="ts" setup>
import { GameHookProperty } from "~/packages/gameHookMapperClient";
import { computed, inject, unref } from "vue";
import { BadgeRow } from "~/core/overlay/player/BadgeRow";
import { badgeRow as badgeRowLayout, badgeImage } from "~/games/gen1/playerPanel";

const game_properties = inject<Record<string, GameHookProperty>>("game_properties", {});

/**
 * The eight badges (core/overlay/player/BadgeRow.ts). The injection is a ref: the template unwraps it, script code
 * must `unref` it. (`badgeRowLayout` is renamed on import: `<badge-row>` would resolve to a `badgeRow` binding.)
 */
const badges = computed(() => [1, 2, 3, 4, 5, 6, 7, 8].map((x) => ({
    owned: unref(game_properties).player.badges['badge' + x].value == true,
    src: badgeImage(x),
})));
</script>