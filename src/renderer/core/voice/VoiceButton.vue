<template>
    <button
        type="button"
        class="stp-voice-btn"
        :class="`stp-voice-btn-${status}`"
        :title="title"
        :aria-pressed="status !== 'off'"
        @click="toggle"
    >
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" fill="currentColor" />
            <path d="M3.3 7.6a4.7 4.7 0 0 0 9.4 0M8 12.3v2.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none" />
            <path v-if="status === 'off'" d="M2.5 2.5l11 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
    </button>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { setVoiceEnabled, voiceState } from "./voice";
import "./voice.css";

/**
 * The microphone button, left of the Report button (top right of the settings panel and of
 * the start screen). It switches voice control on and off (voice.ts); its colour says what
 * voice control is doing, and its tooltip what it last did.
 */
export default defineComponent({
    name: "VoiceButton",
    computed: {
        status() {
            return voiceState.status;
        },
        title(): string {
            const last = voiceState.last ? `\nLast: ${voiceState.last}` : "";
            switch (voiceState.status) {
                case "off":
                    return 'Voice control is off. Click to turn it on, then say "Hey Rotom" and a command: show IVs, show EVs, show regular stats, show base stats, show automatic right panel, show splits.';
                case "starting":
                    return "Voice control is starting…";
                case "waiting":
                    return `Voice control is on: say "Hey Rotom", then a command. Click to turn it off.${last}`;
                case "listening":
                    return `Listening for a command…${last}`;
                case "error":
                    return `Voice control stopped: ${voiceState.error}\nClick to turn it off.`;
            }
            return "";
        },
    },
    methods: {
        toggle() {
            setVoiceEnabled(voiceState.status === "off");
        },
    },
});
</script>
