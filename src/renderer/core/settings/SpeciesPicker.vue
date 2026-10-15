<template>
    <div class="stp-picker" :class="{ 'stp-picker-open': open }">
        <input
            ref="input"
            type="text"
            class="stp-select stp-picker-input"
            :class="inputClass"
            :value="open ? query : modelValue"
            :placeholder="placeholder"
            spellcheck="false"
            autocomplete="off"
            role="combobox"
            :aria-expanded="open"
            @focus="openList"
            @mousedown="onMouseDown"
            @input="onInput(($event.target as HTMLInputElement).value)"
            @keydown="onKey"
            @blur="close"
        >
        <ul v-if="open" ref="list" class="stp-picker-list" role="listbox">
            <li
                v-for="(name, i) in matches"
                :key="name"
                :class="{ 'stp-picker-active': i === active, 'stp-picker-current': name === modelValue }"
                role="option"
                :aria-selected="i === active"
                @mousedown.prevent="pick(name)"
                @mousemove="active = i"
            >{{ name }}</li>
            <li v-if="matches.length === 0" class="stp-picker-empty">No species matches "{{ query }}"</li>
        </ul>
    </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from "vue";

/**
 * "nidoran♀" -> "nidoranf", "Mr. Mime" -> "mrmime", "Flabébé" -> "flabebe": what a typed
 * search is compared on, so case, spaces, punctuation and accents don't matter.
 */
export function speciesSearchKey(name: string): string {
    return name
        .replace(/♀/g, "f")
        .replace(/♂/g, "m")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

/** Names whose key starts with the query first, then names that contain it, each in list order. */
export function rankSpecies(options: readonly string[], query: string): string[] {
    const q = speciesSearchKey(query);
    if (!q) return [...options];
    const starts: string[] = [];
    const contains: string[] = [];
    for (const name of options) {
        const key = speciesSearchKey(name);
        if (key.startsWith(q)) starts.push(name);
        else if (key.includes(q)) contains.push(name);
    }
    return [...starts, ...contains];
}

/**
 * The one species picker for every generation (plan step 3.1). Click or focus opens the full
 * list at the current species; typing filters it; ↑/↓ move, Enter picks, Esc or clicking
 * away cancels. Only a name from `options` can be chosen, so there is nothing to validate.
 *
 * Emits `update:modelValue` and then `change` only when the user picks a different species,
 * the same order a native `<select v-model @change>` fires them in; a value set from outside
 * (the queuer's /set-starter, the game) changes `modelValue` and emits nothing.
 *
 * The list opens in place, pushing the controls below it down, so it can never draw outside
 * the column (and the game-capture area). The filtering lives here, so typing re-renders only
 * this component.
 */
export default defineComponent({
    name: "SpeciesPicker",
    props: {
        modelValue: { type: String, default: "" },
        options: { type: Array as PropType<readonly string[]>, required: true },
        placeholder: { type: String, default: "Search for a species" },
        inputClass: { type: [String, Array, Object] as PropType<unknown>, default: undefined },
    },
    emits: ["update:modelValue", "change"],
    data() {
        return { open: false, query: "", typed: false, active: 0 };
    },
    computed: {
        matches(): string[] {
            return this.typed ? rankSpecies(this.options, this.query) : [...this.options];
        },
    },
    methods: {
        openList() {
            if (this.open) return;
            this.open = true;
            this.typed = false;
            this.query = this.modelValue;
            const at = this.options.indexOf(this.modelValue);
            this.active = at === -1 ? 0 : at;
            this.$nextTick(() => {
                (this.$refs.input as HTMLInputElement | undefined)?.select();
                this.scrollToActive();
            });
        },
        onMouseDown() {
            // A click on the already-focused field reopens the list after Esc.
            if (document.activeElement === this.$refs.input && !this.open) this.openList();
        },
        close() {
            this.open = false;
            this.typed = false;
            this.query = "";
        },
        onInput(text: string) {
            if (!this.open) this.openList();
            this.query = text;
            this.typed = true;
            this.active = 0;
            this.$nextTick(this.scrollToActive);
        },
        pick(name: string) {
            const changed = name !== this.modelValue;
            this.close();
            (this.$refs.input as HTMLInputElement | undefined)?.blur();
            if (!changed) return;
            this.$emit("update:modelValue", name);
            this.$emit("change", name);
        },
        move(by: number) {
            if (!this.open) {
                this.openList();
                return;
            }
            const n = this.matches.length;
            if (n === 0) return;
            this.active = (this.active + by + n) % n;
            this.$nextTick(this.scrollToActive);
        },
        onKey(e: KeyboardEvent) {
            switch (e.key) {
                case "ArrowDown":
                    e.preventDefault();
                    this.move(1);
                    break;
                case "ArrowUp":
                    e.preventDefault();
                    this.move(-1);
                    break;
                case "PageDown":
                    e.preventDefault();
                    this.move(8);
                    break;
                case "PageUp":
                    e.preventDefault();
                    this.move(-8);
                    break;
                case "Enter": {
                    e.preventDefault();
                    const name = this.matches[this.active] ?? this.matches[0];
                    if (this.open && name) this.pick(name);
                    break;
                }
                case "Escape":
                    e.preventDefault();
                    this.close();
                    break;
                case "Tab":
                    this.close();
                    break;
            }
        },
        scrollToActive() {
            const list = this.$refs.list as HTMLElement | undefined;
            const item = list?.children[this.active] as HTMLElement | undefined;
            if (!list || !item) return;
            // Scroll the list only, never the column around it.
            if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop;
            else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) {
                list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
            }
        },
    },
});
</script>
