// gen5's `components/ShuckieTimer.js`, verbatim as an ES module (tools/port/lift-gen5.py) --
// with its template string turned into the render function the compiler would have made
// from it (2026-09-25); see components/Timer.js. The overlay does not mount it today (the
// <shuckie-timer> tag in its template is commented out), but it stays registered.
import { computed, h } from "vue";

export default {
    render() {
        return h("div", { class: "gametime" }, [
            h("div", { class: "gametimeClock" }, this.time),
            h("div", { class: "gametimeFrames" }, this.frames),
        ]);
    },
    props: {
        emulatorStats: {
            type: Object,
            default: () => null
        }
    },
    setup(props) {
        // Helper function to format numbers with leading zeros (same as Timer.js)
        const f = (x) => x.toString().padStart(2, "0");
        
        // Use computed properties that directly access props - they'll automatically be reactive
        const time = computed(() => {
            const ms = props.emulatorStats?.time_current ?? null;
            
            if (!ms && ms !== 0) {
                return "0";
            }
            
            // Calculate hours, minutes, seconds (same calculation as Timer.js)
            const totalSeconds = Math.floor(ms / 1000);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            
            // Progressive format matching Timer.js update() method:
            // If hours != 0: h:mm:ss
            // Else if minutes != 0: m:ss
            // Else: s
            if (hours != 0) {
                return hours + ":" + f(minutes) + ":" + f(seconds);
            } else if (minutes != 0) {
                return minutes + ":" + f(seconds);
            } else {
                return seconds.toString();
            }
        });
        
        const frames = computed(() => {
            const ms = props.emulatorStats?.time_current ?? null;
            
            if (!ms && ms !== 0) {
                return ".00";
            }
            
            // Centiseconds: divide by 10, then mod 100 (same as Timer.js line 88)
            const centiseconds = Math.floor((ms / 10) % 100);
            return "." + f(centiseconds);
        });
        
        // Everything we return here can be accessed by other functions (and the rendering) of the component:
        return {
            time,
            frames
        }
    }
}
