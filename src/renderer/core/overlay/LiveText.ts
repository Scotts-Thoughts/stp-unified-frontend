import { defineComponent, h, toDisplayString, type ComputedRef } from "vue";

/**
 * A `<div>` whose text the *parent's* render never reads (2026-09-25,
 * docs/performance-followups.md, third pass).
 *
 * Each lifted overlay (gens 2-5) is one component with a template over a thousand
 * lines long, and two things on it change many times a second: gen2 and gen4's own
 * timer writes `timer_formatted_time` on every animation frame, and every generation
 * assigns `emulatorStats` on each 10 ms Super Shuckie poll whose body changed -- which,
 * with the Shuckie timer running, is every poll. A template that interpolates those
 * values directly makes the whole overlay's render function a dependent, so the entire
 * template re-rendered at 60-100 Hz for the length of a run.
 *
 * The overlay now `provide`s those values as computeds under `liveText`, and where the
 * template used to say `<div class="gametimeClock">{{ timer_formatted_time[0] }}</div>`
 * it says `<live-text class="gametimeClock" source="timer_clock"></live-text>`. The
 * dependency is registered by this component's render, so a change re-renders this one
 * div. The DOM is the same -- the class falls through onto the root `<div>`, and the
 * value goes through `toDisplayString` exactly as an interpolation does -- and so is
 * the per-frame DOM mutation: the div's text is set as a whole (`textContent`), the way
 * the compiled interpolation set it and the way gen3/gen5's timer child sets its own.
 * (A first version rendered a bare text node into the parent's div and updated its
 * `nodeValue` in place; gen4's captures then varied between runs of the same build by a
 * few levels in a filtered image elsewhere on the page, which the whole-text form does
 * not do.)
 */
export const LiveText = defineComponent({
    name: "LiveText",
    props: {
        /** Key into the provided `liveText` table. */
        source: { type: String, required: true },
    },
    inject: {
        liveText: { from: "liveText", default: () => ({}) },
    },
    render() {
        const sources = this.liveText as Record<string, ComputedRef<unknown>>;
        const source = sources[this.source];
        return h("div", null, toDisplayString(source ? source.value : undefined));
    },
});
