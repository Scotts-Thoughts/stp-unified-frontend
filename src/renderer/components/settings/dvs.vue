<template>
    <!-- The "dvs" slot of the settings panel (games/gen1/settingsPanel.ts): the DVs dropdown above it is a
         panel control. tools/parity/manual-ivs-check.ts fills the manual_dv_input fields in this order
         (Atk, Spe, Def, Spc) and reads the "HP: X (from the other four)" line. -->
    <template v-if="runConfig.config.dvs.mode == IV_MODE.manual">
        <div class="stp-ivgrid" style="grid-template-columns: repeat(2, auto 1fr);">
            <span>Atk</span><input type="text" class="manual_dv_input" :value="dvs.atk" @change="set_dv('atk', $event)">
            <span>Spe</span><input type="text" class="manual_dv_input" :value="dvs.spe" @change="set_dv('spe', $event)">
            <span>Def</span><input type="text" class="manual_dv_input" :value="dvs.def" @change="set_dv('def', $event)">
            <span>Spc</span><input type="text" class="manual_dv_input" :value="dvs.spc" @change="set_dv('spc', $event)">
        </div>
        <div class="stp-hint">HP: {{ hp_dv }} (from the other four)</div>
        <div class="stp-hint">Written when the starter is received.</div>
    </template>
    <div v-else class="stp-hint">The ROM patch's DVs.</div>
</template>

<script lang="ts">
/**
 * The starter's DVs (2026-09-17): `Automatic` (the default, what every run before had --
 * the ROM patch's spread, nothing written) or `Manual`, one field per DV, written with
 * the level-5 stats when the starter arrives in Oak's Lab (`games/gen1/starterDvs.ts`).
 * gen1 has no Hidden Power, so there is no type dropdown here; the HP DV is shown
 * because the game derives it from the other four. Stored in the species file
 * (`useGameSpeciesData.config.dvs`), the way gens 2-5 keep theirs with the starter.
 */
import { defineComponent } from "vue";
import { useGameSpeciesData } from "~/stores/useGameSpeciesData";
import { clampDvs, clampStat, DV_MAX, hpDv, IV_MODE } from "~/core/logic/starterIvs";

export default defineComponent({
    data() {
        return {
            runConfig: useGameSpeciesData(),
            IV_MODE,
        }
    },
    computed: {
        dvs() {
            return clampDvs(this.runConfig.config.dvs.manual);
        },
        hp_dv(): number {
            return hpDv(this.dvs);
        },
    },
    methods: {
        /** Normalises the field (whole, 0-15, an emptied field is 15) before it lands in the species file. */
        set_dv(stat: "atk" | "def" | "spe" | "spc", event: Event) {
            const input = event.target as HTMLInputElement;
            const value = clampStat(input.value, DV_MAX);
            this.runConfig.config.dvs.manual[stat] = value;
            // A rejected entry (letters, 40, -1) is shown as what was kept.
            input.value = String(value);
        },
    },
});
</script>
