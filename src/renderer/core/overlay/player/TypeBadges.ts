import { createCommentVNode, defineComponent, h, vShow, withDirectives, type PropType, type VNode } from "vue";

/** One type picture in a generation's type badges (`games/genN/playerPanel.ts`). */
export interface TypeBadgeImg {
    /** Which of the two types it shows. */
    type: 1 | 2;
    id?: string;
    class?: string;
    /** Rendered (`v-if`) only for a dual-typed Pokemon. */
    ifDual?: boolean;
    /** Shown (`v-show`) only while the badges are `shown` and: any typing, a dual typing, a single typing. Omitted:
     * always shown. */
    show?: "any" | "dual" | "mono";
}

/** How a generation lays out its type badges: the nested `<div>`s' classes (outermost first) and the pictures. */
export interface TypeBadgesLayout {
    wrappers: readonly string[];
    imgs: readonly TypeBadgeImg[];
}

/**
 * The solo Pokemon's type badges (C8 of docs/ui-audit/C-onstream-player.md), one component for all five generations.
 * Which types show (battle types, species types, a fallback) is the generation's rule, worked out once per change in
 * its overlay's computed; the pictures' paths come in as `src1`/`src2`. A `<transition>` or a `v-if` around the
 * badges stays in the generation's markup.
 */
export const TypeBadges = defineComponent({
    name: "TypeBadges",
    props: {
        layout: { type: Object as PropType<TypeBadgesLayout>, required: true },
        src1: { type: String, required: true },
        src2: { type: String, required: true },
        /** The two types differ. */
        dual: { type: Boolean, required: true },
        /** The generation's own show/hide of the badges (gen2's type icons toggle), for the `show` pictures. */
        shown: { type: Boolean, default: true },
    },
    methods: {
        img(img: TypeBadgeImg): VNode {
            if (img.ifDual && !this.dual) return createCommentVNode("v-if", true);
            const props: Record<string, unknown> = {};
            if (img.id) props.id = img.id;
            if (img.class) props.class = img.class;
            props.src = img.type === 1 ? this.src1 : this.src2;
            const vnode = h("img", props);
            if (!img.show) return vnode;
            const shown = this.shown && (img.show === "any" || (img.show === "dual") === this.dual);
            return withDirectives(vnode, [[vShow, shown]]);
        },
    },
    render() {
        let content: VNode[] = this.layout.imgs.map((img) => this.img(img));
        for (let i = this.layout.wrappers.length - 1; i >= 0; i--) {
            content = [h("div", { class: this.layout.wrappers[i] }, content)];
        }
        return content[0];
    },
});
