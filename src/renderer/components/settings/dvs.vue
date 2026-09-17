<template>
    <div>
        <div>DVs:</div>
        <select v-model="runConfig.config.dvs.mode" class="dropdownMenu dropdown_menu_column3">
            <option>{{ IV_MODE.automatic }}</option>
            <option>{{ IV_MODE.manual }}</option>
        </select>
        <div v-if="runConfig.config.dvs.mode == IV_MODE.manual">
            <table class="ui_table">
                <tbody>
                    <tr>
                        <td>Atk:</td><td><input type="text" class="inputContainer manual_dv_input" :value="dvs.atk" @change="set_dv('atk', $event)"/></td>
                        <td style="padding-left: 12px;">Spe:</td><td><input type="text" class="inputContainer manual_dv_input" :value="dvs.spe" @change="set_dv('spe', $event)"/></td>
                    </tr>
                    <tr>
                        <td>Def:</td><td><input type="text" class="inputContainer manual_dv_input" :value="dvs.def" @change="set_dv('def', $event)"/></td>
                        <td style="padding-left: 12px;">Spc:</td><td><input type="text" class="inputContainer manual_dv_input" :value="dvs.spc" @change="set_dv('spc', $event)"/></td>
                    </tr>
                </tbody>
            </table>
            <div style="opacity: .7;">HP: {{ hp_dv }} (from the other four)</div>
            <div style="opacity: .7;">Written when the starter is received.</div>
        </div>
        <div v-else style="opacity: .7;">The ROM patch's DVs.</div>
    </div>
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
