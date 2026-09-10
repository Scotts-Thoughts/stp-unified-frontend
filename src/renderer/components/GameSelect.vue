<template>
    <div>
        <div>Game:</div>
            <select v-model="settings.edition" class="dropdownMenu dropdown_menu_column3">
                <option>Yellow</option>
                <option v-if="isRelease == false">Yellow Legacy</option>
                <option>Red</option>
                <option>Blue</option>
            </select><br>
            <div>Solo Pokemon:</div>
            <select v-model="settings.starter" class="dropdownMenu dropdown_menu_column3" style="background-color: rgb(201, 199, 100)">
                <option disabled value="">Select a species</option>
                <option v-for="key in filtered_pokemon_list" :value="key">{{key}}</option>
            </select><br>
    </div>
</template>

<script lang="ts">
/**
 * The pre-mapper screen: pick the edition and the solo species while PokeAByte has no
 * mapper loaded (plan 1.1, renamed from `no_mapper.js`).
 *
 * Phase 3.2 replaces the look with the box-art grid that gen3-5 use, for every
 * generation. Until then this is gen1's two dropdowns, unchanged -- including the
 * `isRelease` guard that hides the Yellow Legacy option in a release build, even though
 * hack mappers are out of scope (decision 8, known-legacy-bugs.md #22).
 */
import { defineComponent } from "vue";
import PokeData from "~/logic/PokeData";
import { useOverlaySettingsStore } from "~/stores/useOverlaySettingsStore";
import { IS_RELEASE } from "~/core/env";


export default defineComponent({
    data() {
        return {
            settings: useOverlaySettingsStore(),
            isRelease: IS_RELEASE,
        }
    },
    computed: {
        filtered_pokemon_list() {
            // No mapper is loaded yet, so pick the data set based on the edition the user selected.
            if (this.settings.edition === "Red" || this.settings.edition === "Blue") {
                PokeData.setGame("Red and Blue");
            } else {
                PokeData.setGame("Yellow");
            }
            return PokeData.getAllSpecieNames();
        }
    }
});
</script>
