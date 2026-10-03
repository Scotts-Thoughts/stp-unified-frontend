import { defineComponent, h } from "vue";

/** The timer fields the clock page needs; one shape for all five generations. */
export interface ClockState {
    /** 'local' for the overlay's own timer, 'emulator' for Super Shuckie's time. */
    mode: "local" | "emulator";
    /** `Date.now()` the local timer started at. */
    startTime: number;
    /** The local timer is paused. */
    pause: boolean;
    /** `Date.now()` it paused at. */
    pauseTime: number;
    /** Super Shuckie's `time_current` in ms, or null before the first poll. */
    emulatorMs: number | null;
}

/** How long the page may go without a heartbeat before the in-page clock takes over. */
const QUIET_MS = 3500;

/**
 * The out-of-process clock (2026-10-01, after the gen2 legacy app's "timer fix").
 *
 * An <iframe> over the overlay's clock, showing the page `src/main/timer-frame.html` that
 * the main process serves on 127.0.0.1:30160. Because its address differs from the
 * overlay's, Chromium runs it in its own renderer process, so a long script or a heavy
 * repaint in the overlay cannot stall it; the overlay's own `requestAnimationFrame` clock
 * stalls with the overlay. The page computes the time itself from the state posted here.
 *
 * The parent keeps its own clock markup and hides it (`visibility: hidden`) while `live`
 * is true, so the DOM, the classes and the harness oracles are unchanged while the frame
 * is off: with no `window.api.timerFrameUrl` (the harness, the Cutter chain, a port in
 * use) nothing is rendered and `live` never turns on. The page announces itself when it
 * is up and every second after; if it goes quiet the in-page clock shows again and the
 * frame is reloaded, which also covers a server that came up after the page.
 */
export const ClockFrame = defineComponent({
    name: "ClockFrame",
    props: {
        /** Which generation's clock geometry the page draws (`?gen=`). */
        gen: { type: Number, required: true },
    },
    inject: {
        /**
         * The parent `provide`s the state as a computed, the way it provides `liveText`: this
         * component's watcher is its dependent, so the parent's render does not re-run on
         * every timer field change or Super Shuckie poll.
         */
        clockState: { from: "clockState", default: null },
    },
    emits: {
        /** The frame is showing the clock; the parent hides its own. */
        live: (_value: boolean) => true,
    },
    data() {
        return {
            live: false,
            reloads: 0,
            lastAlive: 0,
            cleanup: null as null | (() => void),
        };
    },
    computed: {
        state(): ClockState | null {
            // Vue 3.3+ unwraps an injected ref, so this is the value; reading it here still tracks the computed.
            return (this.clockState as ClockState | null) ?? null;
        },
        baseUrl(): string | null {
            return window.api?.timerFrameUrl ?? null;
        },
        src(): string | null {
            return this.baseUrl ? `${this.baseUrl}?gen=${this.gen}&r=${this.reloads}` : null;
        },
        targetOrigin(): string {
            try {
                return new URL(this.baseUrl ?? "").origin;
            } catch {
                return "*";
            }
        },
    },
    watch: {
        state: {
            deep: true,
            handler() {
                this.post();
            },
        },
        live(value: boolean) {
            this.$emit("live", value);
        },
    },
    mounted() {
        if (!this.src) return;
        const onMessage = (e: MessageEvent) => {
            const frame = this.$el as HTMLIFrameElement | null;
            if (!frame || e.source !== frame.contentWindow) return;
            const type = e.data?.type;
            if (type === "overlay-timer-ready") {
                this.lastAlive = Date.now();
                this.live = true;
                this.post();
            } else if (type === "overlay-timer-alive") {
                this.lastAlive = Date.now();
                if (!this.live) {
                    this.live = true;
                }
                // The colour follows the overlay's style settings; once a second is enough.
                this.post();
            }
        };
        window.addEventListener("message", onMessage);
        const watch = window.setInterval(() => {
            const quiet = Date.now() - this.lastAlive > QUIET_MS;
            if (this.live && quiet) this.live = false;
            if (!this.live && quiet) this.reloads++;
        }, 2000);
        this.cleanup = () => {
            window.removeEventListener("message", onMessage);
            window.clearInterval(watch);
        };
    },
    unmounted() {
        this.cleanup?.();
    },
    methods: {
        /** The colour the overlay draws its own clock in, so the frame matches it. */
        colorOfPageClock(): string | null {
            const clock = (this.$el as HTMLElement | null)?.parentElement?.querySelector(".gametimeClock");
            return clock ? getComputedStyle(clock).color : null;
        },
        post() {
            const frame = this.$el as HTMLIFrameElement | null;
            const s = this.state;
            if (!frame?.contentWindow || !s) return;
            // A plain copy: a reactive proxy cannot cross postMessage.
            const state = {
                mode: s.mode,
                startTime: s.startTime,
                pause: s.pause,
                pauseTime: s.pauseTime,
                emulatorMs: s.emulatorMs,
                color: this.colorOfPageClock(),
            };
            try {
                frame.contentWindow.postMessage({ type: "overlay-timer", state }, this.targetOrigin);
            } catch {
                // not up yet; it asks for the state when it is
            }
        },
    },
    render() {
        if (!this.src) return null;
        return h("iframe", {
            class: "gametimeFrame",
            src: this.src,
            title: "timer",
            style: {
                border: "0",
                background: "transparent",
                pointerEvents: "none",
                display: "block",
                visibility: this.live ? "visible" : "hidden",
            },
        });
    },
});
