import { createCommentVNode, defineComponent, h, toDisplayString, Transition, vShow, withDirectives, type PropType, type VNode } from "vue";

const optionalText = { type: String as PropType<string | null>, default: null };

/**
 * What a generation fixes about one pop-up box (`games/genN/playerPanel.ts`): its picture, classes and caption.
 * Positions stay in each generation's `style.css`.
 */
export interface PopupBoxLayout {
    /** The `<transition>`'s name (its fade is in each `style.css`). */
    transition: string;
    /** `true`: the box exists only while shown (`v-if`); otherwise it is hidden with `v-show`. */
    lazy?: boolean;
    id?: string;
    /** The frame picture's element class (`tinted-box`, `colored-image ds`...). */
    frameClass: string;
    /** The frame picture, as the frame's `--url`. */
    frame: string;
    /** A `<div>` of this class around the caption and the value (gen3's field box); none: no wrapper. */
    bodyClass?: string;
    labelClass: string;
    label?: string;
    labelStyle?: string;
    valueClass: string;
}

/** Everything a `<popup-box>` takes: the layout, and what the overlay's computed works out. */
export interface PopupBoxProps extends PopupBoxLayout {
    shown: boolean;
    value?: unknown;
    /** Added to the frame's style: the overlay's tint, e.g. `filter: saturate(1)`. */
    frameStyle?: string | null;
    valueStyle?: string | null;
}

/**
 * A battle or overworld pop-up box beside the player's panel (C4 of docs/ui-audit/C-onstream-player.md, D12):
 * accuracy, evasion, the field/screens box, the repel steps, bonks, Vs. Seeker. A `<transition>` around one
 * `<div>`: the frame picture, the caption and the value. Whatever decides when a box shows (and any wrapper around
 * several boxes) stays in the overlay; the overlay's computed hands each box plain values.
 */
export const PopupBox = defineComponent({
    name: "PopupBox",
    props: {
        transition: { type: String, required: true },
        lazy: { type: Boolean, default: false },
        shown: { type: Boolean, default: false },
        id: optionalText,
        frameClass: { type: String, required: true },
        frame: { type: String, required: true },
        frameStyle: optionalText,
        bodyClass: optionalText,
        labelClass: { type: String, required: true },
        label: optionalText,
        labelStyle: optionalText,
        valueClass: { type: String, required: true },
        value: { type: null, default: null },
        valueStyle: optionalText,
    },
    methods: {
        box(): VNode {
            const frameStyles: unknown[] = [{ "--url": `url(${this.frame})` }];
            if (this.frameStyle) frameStyles.push(this.frameStyle);
            const label = h("div", { class: this.labelClass, style: this.labelStyle }, toDisplayString(this.label));
            const value = h("div", { class: this.valueClass, style: this.valueStyle }, toDisplayString(this.value));
            const body = this.bodyClass ? [h("div", { class: this.bodyClass }, [label, value])] : [label, value];
            return h("div", this.id ? { id: this.id } : null, [
                h("div", { class: this.frameClass, style: frameStyles }),
                ...body,
            ]);
        },
    },
    render() {
        let content: VNode;
        if (this.lazy) {
            content = this.shown ? this.box() : createCommentVNode("v-if", true);
        } else {
            content = withDirectives(this.box(), [[vShow, this.shown]]);
        }
        return h(Transition, { name: this.transition }, () => content);
    },
});
