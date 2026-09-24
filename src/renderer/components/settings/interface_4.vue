
<template>
<div>
    <div>Stats:</div>
    <select v-model="settings.left_panel.stats.mode" class="dropdownMenu dropdown_menu_column3">
        <option>{{StatsPanelMode.automatic}}</option>
        <option>{{StatsPanelMode.badge_boosts}}</option>
        <option>{{StatsPanelMode.base_stats}}</option>
        <option>{{StatsPanelMode.dvs}}</option>
        <option>{{StatsPanelMode.evs}}</option>
        <option>{{StatsPanelMode.detailed_evs}}</option>
        <option>{{StatsPanelMode.averages}}</option>
        <option>{{StatsPanelMode.medians}}</option>
        <option>{{StatsPanelMode.vitamins}}</option>
    </select><br>
    <br>
    Right Panel:<br>
    <select v-model="settings.right_panel.mode" class="dropdownMenu dropdown_menu_column3">
        <option>{{RightPanelMode.automatic}}</option>
        <option>{{RightPanelMode.movepool}}</option>
        <option>{{RightPanelMode.splits}}</option>
    </select>
    <br>
    Compare splits::<br>
    <select v-model="settings.right_panel.splits.mode" class="dropdownMenu dropdown_menu_column3">
        <option>{{ SplitsMode.first }}</option>
        <option>{{ SplitsMode.followup }}</option>
        <option>{{ SplitsMode.followup_summary }}</option>
    </select>
    <br>
    <button class="buttonStyle buttonStyle_column3" @click="load_comparison">Load replay / split file to compare</button><br>
    <div v-if="comparison_name" style="font-size: 12px;">Comparing against: {{ comparison_name }}</div>
    <br>
    <table>
        <tbody>
            <tr>
                <td>Blackouts?:</td>
                <td><input class="checkBoxStyle" type="checkbox" v-model="runConfig.advanced.count_blackouts"/></td>
            </tr>
            <tr>
                <td>Disable right panel hotkeys:</td>
                <td><input class="checkBoxStyle" type="checkbox" v-model="settings.right_panel.hotkeys"/></td>
            </tr>
            <tr>
                <td>Automatic post-battle splits:</td>
                <td><input class="checkBoxStyle" type="checkbox" v-model="settings.right_panel.post_battle_splits"/></td>
            </tr>
            <tr>
                <td>Show repel counter:</td>
                <td><input class="checkBoxStyle" type="checkbox" v-model="settings.pop_ups.repel.enabled"/></td></tr>
            <tr>
                <td>Show bonk/item counter:</td>
                <td><input class="checkBoxStyle" type="checkbox" v-model="settings.pop_ups.bonks.enabled"/></td></tr>
        </tbody>
    </table>
    <div v-if="settings.pop_ups.bonks.enabled">
        <select v-model="settings.pop_ups.bonks.mode" class="dropdownMenu dropdown_menu_column3">
            <option>Bonks</option>
            <option>Item Count</option>
        </select>
        <br>
    </div>
    <br>
    <div v-if="isRelease == false">
        <div style="text-decoration: underline;">Graphics Toggles:</div>
        <table>
            <tbody>
                <tr>
                    <td>Wild Pokemon:     </td>
                    <td><input class="checkBoxStyle" type="checkbox" v-model="settings.right_panel.wild_battles"/></td>
                </tr>
            </tbody>
        </table>
    </div>
</div>
</template>

<script lang="ts">
import { defineComponent } from "vue"
import { useOverlaySettingsStore } from "~/stores/useOverlaySettingsStore";
import { useGameSpeciesData } from "~/stores/useGameSpeciesData";
import { SplitsMode } from "~/stores/types/SplitsMode";
import { RightPanelMode } from "~/stores/types/RightPanelMode";
import { StatsPanelMode } from "~/stores/types/StatsPanelMode";
import { IS_RELEASE } from "~/core/env";
import PubSub from "~/logic/PubSub";
import { getUserState } from "~/core/persistence/userState";
import { pickSplitComparison } from "~/core/logic/splitComparison";
export default defineComponent({
    data() {
        return {
            settings: useOverlaySettingsStore(),
            runConfig: useGameSpeciesData(),
            StatsPanelMode,
            RightPanelMode,
            SplitsMode,
            isRelease: IS_RELEASE,
            /** The file the split comparison came from (components/Overlay.vue keeps the rows). */
            comparison_name: getUserState<string | null>("previous_splits_source", null),
        }
    },
    created() {
        PubSub.subscribe("@splits/previous_loaded", this.comparison_loaded);
    },
    unmounted() {
        PubSub.unsubscribe("@splits/previous_loaded", this.comparison_loaded);
    },
    methods: {
        /**
         * A replay's SPLIT bookmarks, or a split CSV, as the run to compare against
         * (core/logic/splitComparison.ts, 2026-09-23); the overlay takes the rows off
         * the same event the queuer's /load-split-file publishes.
         */
        async load_comparison() {
            const comparison = await pickSplitComparison();
            if (comparison) PubSub.publish("@splits/previous_loaded", { rows: comparison.rows, name: comparison.name });
        },
        comparison_loaded(payload: unknown) {
            const name = Array.isArray(payload) ? null : (payload as { name?: string | null } | null)?.name ?? null;
            this.comparison_name = name;
        },
    },
});
</script>
