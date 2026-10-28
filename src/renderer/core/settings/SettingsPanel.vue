<template>
    <div class="stp-settings" :class="`stp-theme-${theme}`" :style="tintStyle">
        <div v-for="(column, ci) in panel.columns" :key="ci" class="stp-settings-col" :class="column.class">
            <template v-for="group in column.groups" :key="group.title">
                <section v-if="shown(group)" class="stp-group" :class="{ 'stp-group-compact': group.compact }">
                    <h3 v-if="(group.heading ?? group.title) !== ''" class="stp-group-title">{{ group.heading ?? group.title }}</h3>
                    <template v-for="control in group.controls" :key="control.id">
                        <template v-if="control.kind !== 'actions' && shown(control)">
                            <div v-if="control.kind === 'slot'" class="stp-slot" :class="control.class">
                                <slot :name="control.slot"></slot>
                            </div>
                            <settings-control v-else :control="control"></settings-control>
                        </template>
                    </template>
                </section>
            </template>
        </div>
        <report-button></report-button>
        <updates-button></updates-button>
    </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from "vue";
import SettingsControl from "./SettingsControl.vue";
import ReportButton from "../report/ReportButton.vue";
import UpdatesButton from "../updates/UpdatesButton.vue";
import { panelTheme } from "./theme";
import type { SettingsPanelSpec, Tier } from "./types";
import "../styles/settings.css";

/**
 * The settings panel every generation shares (docs/ui-uniformity-plan.md stages 3-4): four
 * columns, Run · Solo Pokémon · Style · Display, built from the generation's
 * `settingsPanel.ts`. It sits inside the game-capture area (each generation's style.css
 * places `.stp-settings`), so nothing it shows reaches the filmed part of the overlay.
 *
 * Being its own component, it re-renders only when something it shows changes, not with every
 * update of the overlay around it.
 */
export default defineComponent({
    name: "SettingsPanel",
    components: { SettingsControl, ReportButton, UpdatesButton },
    props: {
        panel: { type: Object as PropType<SettingsPanelSpec>, required: true },
    },
    computed: {
        theme(): string {
            return panelTheme();
        },
        tintStyle(): Record<string, string> {
            const tint = this.panel.tint?.();
            return tint ? { "--stp-tint": tint } : {};
        },
    },
    methods: {
        tierShown(tier: Tier | undefined): boolean {
            if (!tier || tier === "always") return true;
            if (tier === "advanced") return !!this.panel.showAdvanced();
            return !!this.panel.isDev();
        },
        shown(item: { tier?: Tier; available?: () => boolean; visible?: () => boolean }): boolean {
            if (!this.tierShown(item.tier)) return false;
            if (item.available && !item.available()) return false;
            if (item.visible && !item.visible()) return false;
            return true;
        },
    },
});
</script>
