<template>
    <!-- toggle: label left, switch right -->
    <label v-if="c.kind === 'toggle'" class="stp-row stp-toggle" :title="c.title">
        <span class="stp-label">{{ labelText }}</span>
        <input type="checkbox" class="stp-switch" :class="c.class" :checked="!!c.get()" @change="c.set(($event.target as HTMLInputElement).checked)">
    </label>

    <!-- button -->
    <confirm-button
        v-else-if="c.kind === 'button' && c.confirmLabel"
        class="stp-btn" :class="[c.variant ? `stp-btn-${c.variant}` : '', c.class]" :title="c.title"
        :label="buttonLabel" :confirm-label="c.confirmLabel" @confirm="c.run()"
    ></confirm-button>
    <button
        v-else-if="c.kind === 'button'" type="button"
        class="stp-btn" :class="[c.variant ? `stp-btn-${c.variant}` : '', c.class]" :title="c.title" @click="c.run()"
    >{{ buttonLabel }}</button>

    <!-- choice: label above, full-width dropdown -->
    <label v-else-if="c.kind === 'choice'" class="stp-field" :title="c.title">
        <span v-if="labelText" class="stp-label">{{ labelText }}</span>
        <select class="stp-select" :class="c.class" :value="selectedValue" @change="onChoice(($event.target as HTMLSelectElement).value)">
            <option v-if="selectedIndex === -1" :value="NONE" disabled>{{ c.placeholder ?? "" }}</option>
            <option v-for="(o, i) in options" :key="i" :value="String(o.value)">{{ o.label ?? o.value }}</option>
        </select>
    </label>

    <!-- counter: label, value, - + -->
    <div v-else-if="c.kind === 'counter'" class="stp-row stp-counter" :title="c.title">
        <span class="stp-label">{{ labelText }}</span>
        <span class="stp-value">{{ c.get() }}</span>
        <button type="button" class="stp-round stp-minus decrement" :class="c.class" title="Decrease" @click="c.decrement()">−</button>
        <button type="button" class="stp-round stp-plus increment" :class="c.class" title="Increase" @click="c.increment()">+</button>
    </div>

    <!-- slider: label, range, value -->
    <label v-else-if="c.kind === 'slider'" class="stp-row stp-slider" :title="c.title">
        <span class="stp-label">{{ labelText }}</span>
        <input
            type="range" class="stp-range" :class="c.class" :min="c.min" :max="c.max" :step="c.step ?? 1"
            :value="c.get()" @input="c.set(Number(($event.target as HTMLInputElement).value))"
        >
        <span class="stp-value stp-value-small">{{ sliderText }}</span>
    </label>

    <!-- text: label above, field (+ button) -->
    <label v-else-if="c.kind === 'text'" class="stp-field" :title="c.title">
        <span v-if="labelText" class="stp-label">{{ labelText }}</span>
        <span class="stp-inline">
            <input type="text" class="stp-input" :class="c.class" :value="c.get() ?? ''" :placeholder="c.placeholder" @input="c.set(($event.target as HTMLInputElement).value)">
            <button v-if="c.button" type="button" class="stp-btn stp-btn-small" @click.prevent="c.button.run()">{{ c.button.label }}</button>
        </span>
    </label>

    <!-- readout -->
    <div v-else-if="c.kind === 'readout'" class="stp-row stp-readout" :class="c.class" :title="c.title">
        <span class="stp-label">{{ labelText }}</span>
        <span class="stp-value">{{ c.value() }}</span>
    </div>

    <!-- grid of label/value pairs, two per row -->
    <div v-else-if="c.kind === 'statGrid'" class="stp-statgrid" :class="c.class" :title="c.title">
        <div v-if="labelText" class="stp-label stp-statgrid-title">{{ labelText }}</div>
        <div v-for="item in c.items()" :key="item.label" class="stp-statgrid-cell">
            <span class="stp-label">{{ item.label }}</span>
            <span class="stp-value">{{ item.value }}</span>
            <span v-if="item.extra !== undefined && item.extra !== null && item.extra !== ''" class="stp-extra">{{ item.extra }}</span>
        </div>
    </div>

    <!-- shared or per-generation component -->
    <div v-else-if="c.kind === 'component'" class="stp-component" :class="c.class">
        <span v-if="labelText" class="stp-label stp-label-block">{{ labelText }}</span>
        <component :is="c.component" v-bind="c.props ? c.props() : {}" v-on="c.on ?? {}"></component>
    </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from "vue";
import ConfirmButton from "../overlay/ConfirmButton.vue";
import EditionPicker from "./EditionPicker.vue";
import SpeciesPicker from "./SpeciesPicker.vue";
import { choiceOptions } from "./toActions";
import type { SettingControl } from "./types";

/** The placeholder option's value: no saved value can be this. */
const NONE = "__stp_none__";

/** One control of the settings panel, by kind (types.ts). Slot controls are rendered by the panel. */
export default defineComponent({
    name: "SettingsControl",
    components: { ConfirmButton, EditionPicker, SpeciesPicker },
    props: {
        control: { type: Object as PropType<SettingControl>, required: true },
    },
    setup() {
        return { NONE };
    },
    computed: {
        c(): any {
            return this.control;
        },
        options(): { value: unknown; label?: string }[] {
            const c = this.c;
            if (c.kind !== "choice") return [];
            return choiceOptions(typeof c.options === "function" ? c.options() : c.options);
        },
        selectedValue(): string {
            return this.selectedIndex === -1 ? NONE : String(this.options[this.selectedIndex].value);
        },
        selectedIndex(): number {
            if (this.c.kind !== "choice") return -1;
            const current = this.c.get();
            return this.options.findIndex((o) => o.value === current || String(o.value) === String(current));
        },
        labelText(): string {
            const l = this.c.label;
            return typeof l === "function" ? l() : (l ?? "");
        },
        buttonLabel(): string {
            return (this.c.dynamicLabel && this.c.dynamicLabel()) || this.labelText;
        },
        sliderText(): string {
            const v = Number(this.c.get());
            if (!Number.isFinite(v)) return "";
            return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
        },
    },
    methods: {
        onChoice(value: string) {
            // Option values are the saved values as text (what the old `v-model` selects held), so a
            // script that sets `select.value = "Manual"` still works (tools/parity/manual-ivs-check.ts).
            const option = this.options.find((o) => String(o.value) === value);
            if (option) this.c.set(option.value);
        },
    },
});
</script>
