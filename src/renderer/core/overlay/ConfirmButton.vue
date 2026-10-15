<template>
    <button type="button" @click="press" @blur="disarm">{{ armed ? confirmLabel : label }}</button>
</template>

<script lang="ts">
import { defineComponent } from "vue";

/**
 * A button for an action that can't be undone: the first click arms it and changes its label, a second
 * click within `windowMs` runs it. Classes and styles given to the component land on the `<button>`.
 * Used instead of `confirm()`, which blocks the page (and so the overlay) while it is open.
 */
export default defineComponent({
    name: "ConfirmButton",
    props: {
        label: { type: String, required: true },
        confirmLabel: { type: String, default: "Click again to confirm" },
        windowMs: { type: Number, default: 3000 },
    },
    emits: ["confirm"],
    data() {
        return { armed: false, timer: 0 as ReturnType<typeof setTimeout> | 0 };
    },
    beforeUnmount() {
        this.disarm();
    },
    methods: {
        press() {
            if (!this.armed) {
                this.armed = true;
                this.timer = setTimeout(() => this.disarm(), this.windowMs);
                return;
            }
            this.disarm();
            this.$emit("confirm");
        },
        disarm() {
            if (this.timer) clearTimeout(this.timer);
            this.timer = 0;
            this.armed = false;
        },
    },
});
</script>
