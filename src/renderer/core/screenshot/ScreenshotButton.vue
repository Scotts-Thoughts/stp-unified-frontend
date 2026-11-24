<template>
    <button
        type="button"
        class="stp-screenshot-btn"
        :class="`stp-screenshot-btn-${status}`"
        :title="title"
        :disabled="status === 'busy'"
        @click="take"
    >
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            <path d="M2 5.2c0-.7.5-1.2 1.2-1.2h1.9l1-1.5h3.8l1 1.5h1.9c.7 0 1.2.5 1.2 1.2v6.6c0 .7-.5 1.2-1.2 1.2H3.2C2.5 13 2 12.5 2 11.8z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
            <circle cx="8" cy="8.4" r="2.4" fill="none" stroke="currentColor" stroke-width="1.3" />
        </svg>
    </button>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { runShortcutAction } from "../shortcuts/engine";
import { SCREENSHOT_ACTION_ID, screenshotState } from "./screenshot";
import "./screenshot.css";

/**
 * The camera button, left of the microphone button in the settings panel's top row. It runs
 * the generation's `screenshot.game` shortcut action (screenshot.ts), so the button and a bound
 * key do exactly the same thing. Its tooltip says what the last screenshot did.
 */
export default defineComponent({
    name: "ScreenshotButton",
    computed: {
        status() {
            return screenshotState.status;
        },
        title(): string {
            const base = "Save a screenshot of the overlay with the game from Super Shuckie in it (also copied to the clipboard).";
            switch (screenshotState.status) {
                case "busy":
                    return "Taking the screenshot…";
                case "done":
                    return `${base}\nLast: saved ${screenshotState.message}`;
                case "error":
                    return `${base}\nLast: ${screenshotState.message}`;
            }
            return base;
        },
    },
    methods: {
        take() {
            runShortcutAction([SCREENSHOT_ACTION_ID]);
        },
    },
});
</script>
