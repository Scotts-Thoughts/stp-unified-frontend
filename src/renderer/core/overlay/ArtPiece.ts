import { cloneVNode, defineComponent, Fragment, isVNode, type PropType, type StyleValue, type VNode } from "vue";

/**
 * Draws its default slot with `extra` added to the style of each root element: how `Movepool.vue` draws the
 * generation's art twice, cut, in Webcam Mode (the same two cuts `SplitsPanel.vue` makes on its own art). The style
 * goes on the art element itself, as `SplitsPanel` does, because the art is `position: fixed` in some generations and a
 * wrapper's clip would not reach it.
 *
 * A slot passed on from a parent (`<art-piece><slot></slot></art-piece>`) arrives wrapped in a Fragment, which takes no
 * style, so Fragments are unwrapped to their elements.
 */
function elements(vnodes: unknown[]): VNode[] {
    return vnodes.filter(isVNode).flatMap((vnode) =>
        vnode.type === Fragment && Array.isArray(vnode.children) ? elements(vnode.children) : [vnode]);
}

export const ArtPiece = defineComponent({
    name: "ArtPiece",
    props: {
        extra: { type: [Object, String, Array] as PropType<StyleValue>, required: true },
    },
    setup(props, { slots }) {
        return () => elements(slots.default?.() ?? [])
            .map((vnode) => (typeof vnode.type === "string" ? cloneVNode(vnode, { style: props.extra }) : vnode));
    },
});
