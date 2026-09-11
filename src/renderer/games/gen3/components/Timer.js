// gen3's `components/Timer.js`, verbatim as an ES module (tools/port/lift-gen3.py): the
// template string is compiled at runtime, exactly as the legacy page compiled it.
import { ref } from "vue";
import PubSub from "../logic/PubSub.js";

// How the component will render:
const template = `
    <div class="gametime">
        <div class="timerTitle">time played at 4x game-speed</div>
        <div class="gametimeClock">{{time}}</div>
        <div class="gametimeFrames">{{frames}}</div>
    </div>
`

export default {
    template,
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
