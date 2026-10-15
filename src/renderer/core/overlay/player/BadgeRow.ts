import { defineComponent, h, Transition, vShow, withDirectives, type PropType, type VNode } from "vue";
import "../../styles/player.css";

/** One badge in the row: `owned` already folds in when the generation hides the row (no Pokemon yet...). */
export interface Badge {
    owned: boolean;
    /** The badge picture; `null`: the badge's box is drawn with no picture (gen4's Sinnoh row in HG/SS). */
    src: string | null;
}

/**
 * The badges on the progress bar (C7 of docs/ui-audit/C-onstream-player.md), one component for all five
 * generations. Each badge is a `<div>` holding the picture; the backdrop picture and any wrapper that hides the row
 * stay in the generation's markup.
 *
 * How a badge appears is the generation's (`games/genN/playerPanel.ts`):
 * - `mode: "show"` (gens 1-2): the `<img>` is always there and shown with `v-show`;
 * - `mode: "if"` (gens 3-5): a `<div>` holding the `<img>` exists only while the badge is owned.
 * Either way a new badge fades in, the same in every generation (`badge-fade`, core/styles/player.css).
 */
export const BadgeRow = defineComponent({
    name: "BadgeRow",
    props: {
        badges: { type: Array as PropType<readonly Badge[]>, required: true },
        mode: { type: String as PropType<"show" | "if">, required: true },
        /** The `<img>`'s class (`canvas` in gens 1-2, `badge` in gens 3-5). */
        imgClass: { type: String, required: true },
        /** Inline style on each badge's `<div>` (gen4's Kanto row). */
        itemStyle: { type: String, default: null },
    },
    methods: {
        badge(badge: Badge): VNode {
            let content: VNode | null;
            if (this.mode === "show") {
                content = withDirectives(h("img", { src: badge.src, class: this.imgClass }), [[vShow, badge.owned]]);
            } else {
                content = badge.owned
                    ? h("div", null, badge.src === null ? [] : [h("img", { class: this.imgClass, src: badge.src })])
                    : null;
            }
            return h("div", this.itemStyle ? { style: this.itemStyle } : null, [h(Transition, { name: "badge-fade" }, () => content)]);
        },
    },
    render() {
        return this.badges.map((badge) => this.badge(badge));
    },
});
