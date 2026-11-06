<template>
    <div class="stp-settings">
        <div v-for="(column, ci) in panel.columns" :key="ci" class="stp-settings-col" :class="column.class">
            <template v-for="group in column.groups" :key="group.title">
                <section v-if="shown(group)" class="stp-group" :class="{ 'stp-group-compact': group.compact, 'stp-group-collapsed': isCollapsed(group) }">
                    <div v-if="(group.heading ?? group.title) !== ''" class="stp-group-head">
                        <h3 class="stp-group-title">
                            <button
                                type="button" class="stp-group-toggle" :aria-expanded="!isCollapsed(group)"
                                :title="isCollapsed(group) ? 'Expand' : 'Collapse'" @click="toggleGroup(group)"
                            >
                                <svg class="stp-group-chevron" viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <path d="M2 3.5L5 6.5L8 3.5"/>
                                </svg>
                                {{ group.heading ?? group.title }}
                            </button>
                        </h3>
                        <template v-for="control in headingControls(group)" :key="control.id">
                        <settings-control v-if="control.kind !== 'button'" :control="control" bare></settings-control>
                        <button
                            v-else type="button"
                            class="stp-icon-btn" :title="String(control.label)" :aria-label="String(control.label)" @click="control.run()"
                        >
                            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <template v-if="control.icon === 'eyedropper'">
                                    <path d="M9 4.5l2.5 2.5"/>
                                    <path d="M10.2 3.2a1.9 1.9 0 0 1 2.7 2.7L8 10.8l-2.7-2.7z"/>
                                    <path d="M6.2 9L3 12.2V13h.8L7 9.8"/>
                                </template>
                                <template v-else>
                                    <path d="M3 8a5 5 0 1 0 1.5-3.5"/>
                                    <path d="M3 2.5v3h3"/>
                                </template>
                            </svg>
                        </button>
                        </template>
                    </div>
                    <template v-for="control in group.controls" :key="control.id">
                        <template v-if="control.kind !== 'actions' && !inHeading(control) && shown(control)">
                            <div v-if="control.kind === 'slot'" class="stp-slot" :class="control.class">
                                <slot :name="control.slot"></slot>
                            </div>
                            <settings-control v-else :control="control"></settings-control>
                        </template>
                    </template>
                </section>
            </template>
        </div>
        <div class="stp-top-buttons">
            <updates-button></updates-button>
            <voice-button></voice-button>
            <report-button></report-button>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from "vue";
import { getUserState, setUserState } from "../persistence/userState";
import SettingsControl from "./SettingsControl.vue";
import ReportButton from "../report/ReportButton.vue";
import UpdatesButton from "../updates/UpdatesButton.vue";
import VoiceButton from "../voice/VoiceButton.vue";
import type { SettingControl, SettingsGroup, SettingsPanelSpec, Tier } from "./types";
import "../styles/settings.css";

/** The titles of the groups collapsed in this generation (a per-generation user-state key). */
const COLLAPSED_KEY = "settings_collapsed_groups";

/**
 * The settings panel every generation shares (docs/ui-uniformity-plan.md stages 3-4): four
 * columns, Software · Run · Pokémon · Style, built from the generation's
 * `settingsPanel.ts`. It sits inside the game-capture area (each generation's style.css
 * places `.stp-settings`), so nothing it shows reaches the filmed part of the overlay.
 *
 * Being its own component, it re-renders only when something it shows changes, not with every
 * update of the overlay around it.
 */
export default defineComponent({
    name: "SettingsPanel",
    components: { SettingsControl, ReportButton, UpdatesButton, VoiceButton },
    provide() {
        return { settingsPanel: this.panel };
    },
    props: {
        panel: { type: Object as PropType<SettingsPanelSpec>, required: true },
    },
    data() {
        return { collapsed: getUserState<string[]>(COLLAPSED_KEY, []) };
    },
    methods: {
        isCollapsed(group: SettingsGroup): boolean {
            return this.collapsed.includes(group.title);
        },
        toggleGroup(group: SettingsGroup) {
            this.collapsed = this.isCollapsed(group)
                ? this.collapsed.filter((title) => title !== group.title)
                : [...this.collapsed, group.title];
            setUserState(COLLAPSED_KEY, this.collapsed);
        },
        inHeading(control: SettingControl): boolean {
            return control.kind === "button" ? !!control.icon : control.kind === "choice" && !!control.inHeading;
        },
        headingControls(group: SettingsGroup): SettingControl[] {
            return group.controls.filter((c) => this.inHeading(c) && this.shown(c));
        },
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
