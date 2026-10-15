<template>
    <!--
        Behaviour-only, like `core/shortcuts/Shortcuts.vue`: `state.js` rendered
        `<div></div>` in this position inside `.mainContainer`, and the layout oracle
        keys every element by its nth-child index, so removing the node would shift every
        sibling after it. The div stays.
    -->
    <div></div>
</template>

<script lang="ts">
/**
 * Hosts gen1's game-state machine (plan 1.1).
 *
 * The logic is `games/gen1/state.ts`; this component exists so that it is still
 * installed from a child's `created()` hook. That position matters: the subscriptions it
 * registers on `meta.state` must run before the ones `Overlay.vue` registers in its own
 * `mounted()`, because the overlay's blackout and chapter-marker handlers read
 * `meta.gameState` and would otherwise see the previous value.
 */
import { defineComponent, inject } from "vue";
import { GameHookProperty } from "~/packages/gameHookMapperClient";
import { useGameStateSync } from "~/games/gen1/state";

export default defineComponent({
    data() {
        return {
            game_properties: inject<Record<string, GameHookProperty>>("game_properties", {}),
        };
    },
    created() {
        useGameStateSync(this.game_properties);
    },
});
</script>
