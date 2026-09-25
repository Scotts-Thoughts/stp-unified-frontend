// gen5's `components/Timer.js`, verbatim as an ES module (tools/port/lift-gen5.py) --
// with its template string turned into the render function the compiler would have made
// from it (2026-09-25): the string was compiled at runtime, which kept Vue's template
// compiler in the renderer bundle for this component alone. The template's commented-out
// title line is gone with the template.
import { h, ref } from "vue";
import PubSub from "../logic/PubSub.js";

export default {
    render() {
        return h("div", { class: "gametime" }, [
            h("div", { class: "gametimeClock" }, this.time),
            h("div", { class: "gametimeFrames" }, this.frames),
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
            onTimeUpdate
        }
    },
    onUnmounted() {
        // Not strictly necessary for this component, but unsubscribe from the time_update event:
        PubSub.unsubscribe("time_update", this.onTimeUpdate);
    }
}
