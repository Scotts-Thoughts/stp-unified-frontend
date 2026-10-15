<template>
    <div class="gameToggle stp-editions" role="radiogroup">
        <img
            v-for="edition in editions"
            :key="edition.name"
            :src="`images/box_art/${edition.boxArt}`"
            :title="edition.name"
            :alt="edition.name"
            :class="['gameToggleImg', { selected: edition.name === modelValue }]"
            role="radio"
            :aria-checked="edition.name === modelValue"
            draggable="false"
            @click="pick(edition.name)"
        >
    </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from "vue";
import type { Edition } from "../game/GameModule";

/**
 * The game picker inside every generation's settings panel (plan step 3.3, audit E5): the same
 * box art, in the same order, as the start screen (components/GameSelect.vue), from the
 * generation's manifest. The value is the edition's name, which is what every generation
 * already stores (`selected_game`, `game_selection`, `gameSelection`, gen1's `edition`).
 */
export default defineComponent({
    name: "EditionPicker",
    props: {
        editions: { type: Array as PropType<readonly Edition[]>, required: true },
        modelValue: { type: String, default: "" },
    },
    emits: ["update:modelValue", "change"],
    methods: {
        pick(name: string) {
            if (name === this.modelValue) return;
            this.$emit("update:modelValue", name);
            this.$emit("change", name);
        },
    },
});
</script>
