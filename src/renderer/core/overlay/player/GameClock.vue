<template>
    <div :class="wrapperClass">
        <div v-if="captionClass" :class="captionClass">{{ caption }}</div>
        <live-text class="gametimeClock" :source="shuckie ? 'shuckie_clock' : 'timer_clock'" :style="hidden ? 'visibility: hidden' : null" :frozen="hidden"></live-text>
        <live-text class="gametimeFrames" :source="shuckie ? 'shuckie_frames' : 'timer_frames'" :style="hidden ? 'visibility: hidden' : null" :frozen="hidden"></live-text>
        <slot></slot>
    </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { LiveText } from "~/core/overlay/LiveText";

/**
 * The game clock's in-page lines, one component for all five generations (C2 of docs/ui-audit/C-onstream-player.md):
 * the two live-text lines (hours:minutes:seconds and hundredths), and in gen3 the caption above them (the other
 * generations' captions sit elsewhere in their overlays). A default slot follows the lines (gen1's clock frame).
 *
 * The time comes from the `liveText` the overlay provides (core/overlay/LiveText.ts), under four fixed keys:
 * `timer_clock` / `timer_frames` for the overlay's own timer and `shuckie_clock` / `shuckie_frames` for Super
 * Shuckie's. Only the two lines re-render when the time changes, never the overlay.
 *
 * The classes `gametimeClock` and `gametimeFrames` (and `gametime` on the wrapper where a generation has it) are
 * what each generation's `style.css` places, and `src/main/timer-frame.html` copies that geometry: they never move.
 */
export default defineComponent({
    name: "GameClock",
    components: { LiveText },
    props: {
        /** Super Shuckie's time instead of the overlay's own timer. */
        shuckie: { type: Boolean, default: false },
        /** The out-of-process clock (core/overlay/ClockFrame.ts) is showing: the lines hide and stop following the time. */
        hidden: { type: Boolean, default: false },
        /** The wrapper's class (`gametime` in gens 1-3; none in gen4, and in gen5 only around its own timer). */
        wrapperClass: { type: String, default: null },
        /** The caption's class when the caption is drawn here (gen3's `timerTitle`); none: no caption. */
        captionClass: { type: String, default: null },
        caption: { type: String, default: "time played at 4x game speed" },
    },
});
</script>
