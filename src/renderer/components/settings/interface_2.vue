

<template>
    <div>
        <div>Solo Pokemon:</div>
        <select v-model="overlaySettings.starter" class="dropdownMenu dropdown_menu_column3" style="background-color: rgb(201, 199, 100)">
            <option disabled value="">Select a species</option>
            <option v-for="key in filtered_pokemon_list" :value="key">{{key}}</option>
        </select><br>
        <div>Search Pokemon:</div>
        <input type="text" v-model="search_term" placeholder="Search for a species">
        <!-- The ROM starter follows the dropdown (see the watcher); the button is a manual re-sync. -->
        <button class="buttonStyle set_starter_button" @click="set_rom_starter">Set ROM Starter</button>
    </div>
</template>

<script lang="ts">
import { defineComponent, inject } from "vue";
import PokeData from "~/logic/PokeData";
import { GameHookProperty } from "~/packages/gameHookMapperClient";
import { useOverlaySettingsStore } from "~/stores/useOverlaySettingsStore";

/** Species byte that the ROM patch uses for every backported species. */
const BACKPORT_SPECIES_BYTE = 0xBF;

export default defineComponent({
    data() {
        return {
            game_properties: inject<Record<string, GameHookProperty>>("game_properties", {}),
            overlaySettings: useOverlaySettingsStore(),
            search_term: ""
        }
    },
    computed: {
        filtered_pokemon_list() {
            if (this.search_term === '') {
                return PokeData.getAllSpecieNames();
            } else {
                return PokeData.getAllSpecieNames().filter(pokemon => pokemon.toLowerCase().includes(this.search_term.toLowerCase()));
            }
        },
    },
    watch: {
        /**
         * The ROM starter follows the solo Pokemon, as in gens 2-5 (2026-09-18): every change of
         * the store's `starter` -- the dropdown here or the queuer's `/set-starter` -- is written
         * to the patch, where gen1 used to wait for the button.
         */
        "overlaySettings.starter"() {
            this.set_rom_starter();
        },
    },
    methods: {
        async set_rom_starter() {
            const starter = this.overlaySettings.starter;
            if (!PokeData.findSpecies(starter)) {
                console.warn(`[settings] Cannot set the ROM starter, unknown species: ${starter}`);
                return;
            }
            // Backported species are not one of the original 151, the ROM patch uses a placeholder species for them.
            if (PokeData.isBackportSpecies(starter)) {
                await this.game_properties.patch.hChosenStarter.setBytes([BACKPORT_SPECIES_BYTE], false);
                return;
            }
            await this.game_properties.patch.hChosenStarter.set(starter, false);
        },
    },
    mounted() {
        // Sync the ROM starter to the dropdown on load, as gens 2-5 do: the overlay settings are
        // read before the overlay mounts, so the watcher never sees the persisted starter arrive.
        this.set_rom_starter();
    },
});
</script>
