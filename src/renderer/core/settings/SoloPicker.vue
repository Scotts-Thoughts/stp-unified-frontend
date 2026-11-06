<template>
    <div class="stp-solo">
        <div class="stp-solo-row">
            <species-picker
                :model-value="modelValue" :options="options"
                @update:model-value="$emit('update:modelValue', $event)" @change="$emit('change', $event)"
            ></species-picker>
            <template v-if="host">
                <button type="button" class="stp-icon-btn stp-solo-save" title="Save Preset" aria-label="Save Preset" @click="toggleNaming">
                    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M3 2.5h8l2.5 2.5v8.5h-11z"/>
                        <path d="M5.5 2.5v3.5h4.5v-3.5"/>
                        <path d="M5 13.5v-4.5h6v4.5"/>
                    </svg>
                </button>
                <button type="button" class="stp-icon-btn stp-solo-load" title="Load Preset File" aria-label="Load Preset File" @click="loadFile">
                    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M2.5 13V3.5h4l1.5 2h5.5V13z"/>
                        <path d="M8 11.5v-4"/>
                        <path d="M6.2 9.2L8 7.5l1.8 1.7"/>
                    </svg>
                </button>
            </template>
        </div>

        <div v-if="naming" class="stp-solo-row">
            <input
                ref="nameField" v-model="name" type="text" class="stp-input stp-solo-name" placeholder="Preset name"
                maxlength="60" spellcheck="false" autocomplete="off" @keydown.enter.prevent="save" @keydown.esc.prevent="stopNaming"
            >
            <button type="button" class="stp-btn stp-btn-small stp-solo-confirm" :disabled="!fileName" @click="save">{{ replacing ? "Replace" : "Save" }}</button>
        </div>

        <div v-if="presets.length" class="stp-solo-row">
            <select class="stp-select stp-solo-presets" title="Presets" aria-label="Presets" :value="selected" @change="pick(($event.target as HTMLSelectElement).value)">
                <option value="" disabled>Presets</option>
                <option v-for="preset in presets" :key="preset" :value="preset">{{ preset }}</option>
            </select>
            <template v-if="selected">
                <button type="button" class="stp-icon-btn stp-solo-reload" title="Load Again" aria-label="Load Again" @click="pick(selected)">
                    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M3 8a5 5 0 1 0 1.5-3.5"/>
                        <path d="M3 2.5v3h3"/>
                    </svg>
                </button>
                <confirm-button class="stp-icon-btn stp-solo-delete" title="Delete Preset" label="×" confirm-label="Delete?" @confirm="remove"></confirm-button>
            </template>
        </div>

        <div v-if="note" class="stp-solo-note" :class="{ 'stp-solo-failed': failed }">{{ note }}</div>
    </div>
</template>

<script lang="ts">
import { defineComponent, nextTick, type PropType } from "vue";
import ConfirmButton from "../overlay/ConfirmButton.vue";
import SpeciesPicker from "./SpeciesPicker.vue";
import {
    applyPreset, capturePreset, deletePreset, importPreset, listPresets, parsePreset, presetFolder, readPreset, refusal, safeFileName, writePreset, type Preset,
} from "../presets/presets";
import type { SettingsPanelSpec } from "./types";

/**
 * The species picker with the panel's preset controls around it: Save and Load icons beside it, and the
 * saved presets of the current game + species under it (core/presets/presets.ts). A generation with no
 * `presets` host gets the plain picker.
 *
 * A loaded preset's values go through the controls, so they replace what the species has saved and
 * the species shows the same way next time.
 */
export default defineComponent({
    name: "SoloPicker",
    components: { ConfirmButton, SpeciesPicker },
    inject: { panel: { from: "settingsPanel" } },
    props: {
        modelValue: { type: String, default: "" },
        options: { type: Array as PropType<readonly string[]>, required: true },
    },
    emits: ["update:modelValue", "change"],
    data() {
        return {
            presets: [] as string[],
            selected: "",
            naming: false,
            name: "",
            note: "",
            failed: false,
            busy: false,
            refreshes: 0,
        };
    },
    computed: {
        spec(): SettingsPanelSpec {
            return (this as any).panel;
        },
        host() {
            return this.spec.presets ?? null;
        },
        /** The game + species the list is for. */
        target(): string {
            return this.host ? `${this.host.game()}\n${this.host.species()}` : "";
        },
        fileName(): string {
            return safeFileName(this.name);
        },
        replacing(): boolean {
            return this.presets.includes(this.fileName);
        },
    },
    watch: {
        target: {
            immediate: true,
            handler() {
                void this.refresh();
            },
        },
    },
    beforeUnmount() {
        if (this.naming) window.api.shortcuts.resume();
    },
    methods: {
        async refresh(keep = "") {
            if (!this.host) return;
            const run = ++this.refreshes;
            const list = await listPresets(this.host.game(), this.host.species()).catch(() => [] as string[]);
            if (run !== this.refreshes) return;
            this.presets = list;
            this.selected = list.includes(keep) ? keep : "";
        },
        tell(note: string, failed = false) {
            this.note = note;
            this.failed = failed;
        },
        /** One thing at a time: a second load while one is setting controls would mix the two. */
        async run(job: () => Promise<void>) {
            if (this.busy) return;
            this.busy = true;
            try {
                await job();
            } catch (e) {
                this.tell(e instanceof Error ? e.message : String(e), true);
            } finally {
                this.busy = false;
            }
        },
        toggleNaming() {
            if (this.naming) this.stopNaming();
            else void this.startNaming();
        },
        async startNaming() {
            this.naming = true;
            this.name = this.selected;
            this.tell("");
            // The keyboard hook sees every key, so typing a name could press a shortcut.
            window.api.shortcuts.suspend();
            await nextTick();
            (this.$refs.nameField as HTMLInputElement | undefined)?.select();
        },
        stopNaming() {
            if (!this.naming) return;
            this.naming = false;
            window.api.shortcuts.resume();
        },
        save() {
            const host = this.host;
            const name = this.fileName;
            if (!host || !name) return;
            void this.run(async () => {
                await writePreset(capturePreset(this.spec, host), name);
                this.stopNaming();
                await this.refresh(name);
                this.tell(`Saved "${name}"`);
            });
        },
        async apply(preset: Preset, name: string) {
            const skipped = await applyPreset(this.spec, this.host!, preset);
            await this.refresh(name);
            if (skipped.length) this.tell(`Loaded "${name}", except: ${skipped.join(", ")}`, true);
            else this.tell(`Loaded "${name}"`);
        },
        pick(name: string) {
            const host = this.host;
            if (!host) return;
            void this.run(async () => {
                this.selected = name;
                await this.apply(await readPreset(host.game(), host.species(), name), name);
            });
        },
        /** A file from anywhere: refused for another game, else kept with the presets and loaded. */
        loadFile() {
            const host = this.host;
            if (!host) return;
            void this.run(async () => {
                const file = await window.api.presets.pick(presetFolder(host.game(), host.species()));
                if (!file) return;
                const preset = parsePreset(file.contents);
                const refused = refusal(host, preset);
                if (refused) throw new Error(refused);
                await this.apply(preset, await importPreset(preset, file.name));
            });
        },
        remove() {
            const host = this.host;
            const name = this.selected;
            if (!host || !name) return;
            void this.run(async () => {
                await deletePreset(host.game(), host.species(), name);
                await this.refresh();
                this.tell(`Deleted "${name}"`);
            });
        },
    },
});
</script>
