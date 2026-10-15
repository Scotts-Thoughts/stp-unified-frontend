import { defineComponent, h, toDisplayString, vShow, withDirectives, type PropType, type VNode } from "vue";
import type { ExpProgress } from "~/core/logic/expCurve";

/** Where a generation's exp bar elements get their classes (`games/genN/playerPanel.ts`). */
export interface ExpBarLayout {
    /** The wrapper's class (`expBar`); none: a plain `<div>`. */
    wrapper?: string;
    /** The label's class. */
    label?: string;
    /** Put the label after the bar instead of before it (gen3). */
    labelAfter?: boolean;
    /** The outer (track) and inner (fill) elements' classes, and the fill's id where it has one (gen1 `exp-bar`). */
    outer: string;
    inner: string;
    innerId?: string;
}

/** A generation's level-up animation timings (`games/genN/playerPanel.ts`). */
export interface ExpBarTiming {
    /** ms for a change across the whole bar; a change takes its share of it. */
    maxDuration: number;
    /** Every change takes exactly this long instead (gen3: 200 ms). */
    fixedDuration?: number;
    /** After filling the bar on a level-up, wait this long instead of the fill's length + 50 ms (gen2: 250 ms). */
    levelUpWait?: number;
    /** After a level-up, fill again from empty to the new level's progress (default). gen3 leaves the bar empty. */
    refill?: boolean;
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

/**
 * The exp bar, one component for all five generations (C6 of docs/ui-audit/C-onstream-player.md): an optional
 * label, the track and the fill. The generation decides *when* the bar moves (its watchers on the exp and species
 * properties); this component owns the fill element and *how* it moves: `setWidth` jumps, `animate` plays the
 * level-up animation with the generation's `timing`.
 *
 * The fill's width and transition are set on the element directly, not through a binding, so a re-render never
 * resets an animation that is running.
 */
export const ExpBar = defineComponent({
    name: "ExpBar",
    props: {
        layout: { type: Object as PropType<ExpBarLayout>, required: true },
        /** The label's text; `null`: no label element. */
        label: { type: String as PropType<string | null>, default: null },
        /** Draw the track and fill (gen2's 2023 bar exists only in the 2023 style). */
        bar: { type: Boolean, default: true },
        /** `v-show` on the wrapper (gen2's exp bar toggle); omitted: always shown. */
        visible: { type: Boolean as PropType<boolean | undefined>, default: undefined },
        timing: { type: Object as PropType<ExpBarTiming>, default: () => ({ maxDuration: 600 }) },
    },
    methods: {
        fill(): HTMLElement | null {
            return (this.$refs.inner as HTMLElement | undefined) ?? null;
        },
        /** The fill's inline width ("37.5%"), "" before anything set it. */
        width(): string {
            return this.fill()?.style.width ?? "";
        },
        setWidth(width: string) {
            const el = this.fill();
            if (el) el.style.width = width;
        },
        /** `null` clears the transition, as the overlays always did (`style.transition = null`). */
        setTransition(transition: string | null) {
            const el = this.fill();
            if (el) (el.style as unknown as { transition: string | null }).transition = transition;
        },
        /** Animate from one exp state to the next: along the bar, or on a level-up to full, empty, and on. */
        async animate(from: ExpProgress, to: ExpProgress) {
            const t = this.timing;
            const target = (to.percent * 100) + "%";
            if (from.level == to.level) {
                const duration = t.fixedDuration ?? Math.ceil((to.percent - from.percent) * t.maxDuration);
                this.setTransition(`width ${duration}ms ease-in-out`);
                this.setWidth(target);
                await sleep(duration + 50);
            } else {
                const duration1 = t.fixedDuration ?? Math.ceil((1 - from.percent) * t.maxDuration);
                const duration2 = t.fixedDuration ?? Math.ceil(to.percent * t.maxDuration);
                this.setTransition(`width ${duration1}ms ease-in`);
                this.setWidth("100%");
                await sleep(t.levelUpWait ?? duration1 + 50);
                this.setTransition(null);
                this.setWidth("0%");
                if (t.refill !== false) {
                    await sleep(50);
                    this.setTransition(`width ${duration2}ms ease-out`);
                    this.setWidth(target);
                    await sleep(duration2 + 50);
                }
            }
            this.setTransition(null);
        },
    },
    render() {
        const { layout, label } = this;
        const labelNode = () => h("div", { class: layout.label }, toDisplayString(label));
        const children: (VNode | null)[] = [
            label !== null && !layout.labelAfter ? labelNode() : null,
            this.bar ? h("div", { class: layout.outer }, [h("div", { ref: "inner", id: layout.innerId, class: layout.inner })]) : null,
            label !== null && layout.labelAfter ? labelNode() : null,
        ];
        const wrapper = h("div", { class: layout.wrapper }, children);
        return this.visible === undefined ? wrapper : withDirectives(wrapper, [[vShow, this.visible]]);
    },
});
