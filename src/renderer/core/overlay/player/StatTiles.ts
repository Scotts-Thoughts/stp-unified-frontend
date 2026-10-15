import { defineComponent, h, toDisplayString, vShow, withDirectives, type PropType, type VNode } from "vue";

/**
 * One element of a generation's stat tiles (`games/genN/playerPanel.ts` builds them, gen1 in
 * `components/left_panel/stats.vue`). Strings in `children` are text; `null` is nothing.
 */
export interface StatNode {
    /** Default `div`. */
    tag?: string;
    /** The element a template `v-if` branch would be: a different key makes a new element, as a `v-if` switch does. */
    key?: string | number;
    class?: string;
    id?: string;
    style?: string | Readonly<Record<string, string | number | undefined>>;
    /** `v-show`; omitted: always shown. */
    show?: boolean;
    /** The element's only content, shown as an interpolation shows it (`null` and `undefined` as ""). */
    text?: unknown;
    children?: readonly StatChild[];
}
export type StatChild = StatNode | string | null;

function node(child: StatChild): VNode | string | null {
    if (child === null || typeof child === "string") return child;
    const props: Record<string, unknown> = {};
    if (child.key !== undefined) props.key = child.key;
    if (child.class !== undefined) props.class = child.class;
    if (child.id !== undefined) props.id = child.id;
    if (child.style !== undefined) props.style = child.style;
    const content = "text" in child ? toDisplayString(child.text) : child.children?.map(node);
    const vnode = h(child.tag ?? "div", props, content);
    return child.show === undefined ? vnode : withDirectives(vnode, [[vShow, child.show]]);
}

/**
 * The stat tiles (C5 of docs/ui-audit/C-onstream-player.md): the six (gen1: five) stat labels and values, the
 * stage modifiers in battle, and the mode-specific cells (DVs/IVs, EVs, vitamins, badge boosts, averages...).
 *
 * The generations draw these with different element trees (gen3 lists the labels, then the values, and its stage
 * modifiers sit in a block of their own), and the harness compares every element, so each generation describes
 * its tree as data from one computed and this component draws it. The computed works out each value once per
 * change; the old templates called `get_stat()` and the opacity helpers once per tile on every render.
 */
export const StatTiles = defineComponent({
    name: "StatTiles",
    props: {
        nodes: { type: Array as PropType<readonly StatChild[]>, required: true },
    },
    render() {
        return this.nodes.map(node);
    },
});
