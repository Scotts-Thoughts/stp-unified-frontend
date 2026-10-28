<template>
    <button
        v-if="state && state.enabled"
        type="button"
        class="stp-updates-btn"
        :class="{ 'stp-updates-btn-new': highlight }"
        :title="title"
        @click="open"
    >
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path d="M8 2v8M4.5 6.8 8 10.3l3.5-3.5M3 13.5h10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        </svg>
        <span>{{ label }}</span>
    </button>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import type { UpdateState } from "../../../shared/updates";
import "./updates.css";

/**
 * The Updates button, beside the Report button (top right of the settings panel and of
 * the start screen). It opens the Updates window (src/main/updater/), and only shows in
 * a build that can update itself, so development runs and the parity harness never draw it.
 */
export default defineComponent({
    name: "UpdatesButton",
    data() {
        return {
            state: null as UpdateState | null,
            unsubscribe: null as (() => void) | null,
        };
    },
    computed: {
        highlight(): boolean {
            return !!this.state && (!!this.state.available || this.state.job?.kind === "ready");
        },
        label(): string {
            if (this.state?.job?.kind === "ready") return "Restart to update";
            if (this.state?.job?.kind === "downloading") return "Downloading…";
            return this.state?.available ? "Update available" : "Updates";
        },
        title(): string {
            const state = this.state;
            if (!state) return "";
            return state.available ? `Version ${state.available} is available (you have ${state.current})` : `Version ${state.current}: updates and rollback`;
        },
    },
    async mounted() {
        const api = window.api?.updates;
        if (!api) return;
        this.unsubscribe = api.onState((state) => {
            this.state = state;
        });
        this.state = await api.getState();
    },
    beforeUnmount() {
        this.unsubscribe?.();
    },
    methods: {
        open() {
            window.api.updates.openWindow();
        },
    },
});
</script>
