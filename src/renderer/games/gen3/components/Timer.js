// gen3's `components/Timer.js`, verbatim as an ES module (tools/port/lift-gen3.py) --
// with its template string turned into the render function the compiler would have made
// from it (2026-09-25): the string was compiled at runtime, which kept Vue's template
// compiler in the renderer bundle for this component alone.
import { h, markRaw, ref } from "vue";
import PubSub from "../logic/PubSub.js";

export default {
    // `hideClock` is not in the legacy file: the overlay sets it while its out-of-process
    // clock (core/overlay/ClockFrame.ts) is showing, and the two lines stay in the DOM, hidden.
    // While hidden they keep the text they last showed and the render stops reading the time
    // (as LiveText's `frozen` does), so the hidden clock does not re-render every frame.
    props: { hideClock: { type: Boolean, default: false } },
    render() {
        const hidden = this.hideClock ? { visibility: "hidden" } : null;
        if (!this.hideClock || this.shown.time === undefined) {
            this.shown.time = this.time;
            this.shown.frames = this.frames;
        }
        return h("div", { class: "gametime" }, [
            h("div", { class: "timerTitle" }, "time played at 4x game-speed"),
            h("div", { class: "gametimeClock", style: hidden }, this.shown.time),
            h("div", { class: "gametimeFrames", style: hidden }, this.shown.frames),
        ]);
    },
    setup() {
        const time = ref("0");     // with a "ref", we can update the value of the variable and vue will automatically
        const frames = ref(".00"); // renrender the component.
        const onTimeUpdate = (value) => {
            time.value = value[0];
            frames.value = value[1];
        };
        PubSub.subscribe("time_update", onTimeUpdate);
        // Everything we return here can be accessed by other functions (and the rendering) of the component:
        return {
            time,
            frames,
            onTimeUpdate,
            shown: markRaw({ time: undefined, frames: undefined }),
        }
    },
    // Was `onUnmounted`, which the Options API never calls (gen1's timer.vue had the same
    // slip): every overlay unmount and Shuckie-timer toggle left a dead subscriber that the
    // timer loop kept publishing into every frame.
    unmounted() {
        // Not strictly necessary for this component, but unsubscribe from the time_update event:
        PubSub.unsubscribe("time_update", this.onTimeUpdate);
    }
}
