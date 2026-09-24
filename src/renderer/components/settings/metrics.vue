<template>
<div>
    <button class="buttonStyle new_run_button" @click="clear_run">New Run</button>
    <br>
    <button class="buttonStyle comparison_button" @click="load_splits()">Load replay / split file</button><br>
    <table>
        <tbody>
            <tr>
                <td>Previous: </td>
                <td><input type="text" class="inputContainer" v-model="runConfig.config.labels.split_previous" placeholder="Previous"/></td>
            </tr>
            <tr>
                <td>Current: </td>
                <td><input type="text" class="inputContainer" v-model="runConfig.config.labels.split_current" placeholder="Current"/></td>
            </tr>
        </tbody>
    </table>
    <br>
    <table>
        <tbody>
            <tr>
                <td style="text-align: left;">Attempt:</td>
                <td>{{metrics.attempts}}</td>
                <td>
                    <button @click="increment('attempts')" class="smallButtonStyle increment">+</button>
                    <button @click="decrement('attempts')" class="smallButtonStyle decrement">-</button>
                </td>
            </tr>
            <tr>
                <td style="text-align: left;">Finished Runs:</td>
                <td>{{metrics.finishes}}</td>
                <td>
                    <button @click="increment('finishes')" class="smallButtonStyle increment">+</button>
                    <button @click="decrement('finishes')" class="smallButtonStyle decrement">-</button>
                </td>
            </tr>
            <tr>
                <td style="text-align: left;">Resets:</td>
                <td>{{resets}}</td>
                <td>
                    <button @click="increment('resets')" class="smallButtonStyle increment">+</button>
                    <button @click="decrement('resets')" class="smallButtonStyle decrement">-</button>
                </td>
            </tr>
            <tr>
                <td style="text-align: left;">Blackouts:</td>
                <td>{{blackouts}}</td>
                <td>
                    <button @click="increment('blackouts')" class="smallButtonStyle increment">+</button>
                    <button @click="decrement('blackouts')" class="smallButtonStyle decrement">-</button>
                </td>
            </tr>
            <tr>
                <td style="text-align: left;">Faults:</td>
                <td>{{faults}}</td>
            </tr>
        </tbody>
    </table>
    <br>
</div>
</template>

<script lang="ts">
import PubSub from "~/logic/PubSub";
import { SpeciesMetrics, useSpeciesMetricsStore } from "~/stores/useSpeciesMetricsStore.ts";
import { useGameSpeciesData } from "~/stores/useGameSpeciesData.ts";
import { useOverlaySettingsStore } from "~/stores/useOverlaySettingsStore";
import { useEmulatorStatsStore } from "~/core/stores/useEmulatorStatsStore";
import { pickSplitComparison } from "~/core/logic/splitComparison";
import { defineComponent } from "vue";

/** Counters that are mirrored to the Shuckie emulator when the "Shuckie Counters" option is on. */
const EMULATOR_COUNTERS: Partial<Record<keyof SpeciesMetrics, string>> = {
    resets: "playerResets",
    blackouts: "blackout_counter",
};

export default defineComponent({
    data() {
        return {
            runConfig: useGameSpeciesData(),
            settings: useOverlaySettingsStore(),
            metrics: useSpeciesMetricsStore(),
            emulator: useEmulatorStatsStore(),
        }
    },
    computed: {
        /** What the overlay shows: the emulator's counters when the Shuckie Counters switch is on (as gen4 reports its faults). */
        resets(): number {
            return this.settings.shuckie.counters ? this.emulator.playerResets : this.metrics.resets;
        },
        blackouts(): number {
            return this.settings.shuckie.counters ? this.emulator.blackoutCounter : this.metrics.blackouts;
        },
        faults(): number {
            return this.resets + this.blackouts;
        }
    },
    methods: {
        clear_run() {
            PubSub.publish("@run/cleared");
        },
        increment(property: keyof SpeciesMetrics) {
            const value = this.metrics[property];
            if (typeof value === "number") {
                this.metrics.update(property, (value + 1) as any);
                const counter = EMULATOR_COUNTERS[property];
                if (counter && this.settings.shuckie.counters) {
                    this.emulator.incrementCounter(counter);
                }
            }
        },
        decrement(property: keyof SpeciesMetrics) {
            const value = this.metrics[property];
            if (typeof value === "number") {
                if (value <= 0) {
                    return;
                }
                this.metrics.update(property, (value - 1) as any);
                const counter = EMULATOR_COUNTERS[property];
                if (counter && this.settings.shuckie.counters) {
                    const emulatorValue = this.emulator.stats?.counters?.[counter];
                    if (emulatorValue != null && emulatorValue > 0) {
                        this.emulator.incrementCounterBy(counter, -1);
                    }
                }
            }
        },
        /**
         * The comparison: a replay's SPLIT bookmarks or a split CSV, picked and parsed in
         * main (core/logic/splitComparison.ts, 2026-09-23); the overlay takes the rows
         * off the same event the queuer's /load-split-file publishes.
         */
        async load_splits() {
            const comparison = await pickSplitComparison();
            if (comparison) PubSub.publish("@splits/previous_loaded", { rows: comparison.rows, name: comparison.name });
        },
    },
});
</script>
