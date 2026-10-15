import { createCommentVNode, defineComponent, h, toDisplayString, vShow, withDirectives, type PropType, type VNode } from "vue";

/**
 * One of the player's moves as the move list shows it (C3 of docs/ui-audit/C-onstream-player.md): plain values,
 * worked out once per change by the overlay's computed (`games/genN/playerPanel.ts` `playerMoveList`), not by the
 * template on every render of the whole overlay.
 */
export interface MoveRow {
    /** The move's name as shown. */
    name: unknown;
    /** The type icon's picture. */
    icon?: string | null;
    power?: unknown;
    /** The power cell's key (gens 1-2): a new value makes a new element, as the old template's `:key` did. */
    powerKey?: unknown;
    accuracy?: unknown;
    pp?: unknown;
    /** The damage-class icon's picture (gens 4-5). */
    category?: string | null;
}

/**
 * One element of a generation's move list. Strings in `children` are text; `null` is nothing (an empty `v-if`).
 */
export interface MoveNode {
    /** Default `div`. */
    tag?: string;
    /** The element a template `v-if` branch or `:key` would be: a different key makes a new element. */
    key?: string | number | symbol | null;
    class?: string;
    id?: string;
    style?: string | Readonly<Record<string, string>>;
    /** `<img>`'s picture. */
    src?: string | null;
    /** `v-show`; omitted: always shown. */
    show?: boolean;
    /** The element's only content, shown as an interpolation shows it (`null` and `undefined` as ""). */
    text?: unknown;
    children?: readonly MoveChild[];
}
export type MoveChild = MoveNode | string | null;

function draw(child: MoveChild): VNode | string {
    if (child === null) return createCommentVNode("v-if", true);
    if (typeof child === "string") return child;
    const props: Record<string, unknown> = {};
    if (child.key !== undefined && child.key !== null) props.key = child.key;
    if (child.class !== undefined) props.class = child.class;
    if (child.id !== undefined) props.id = child.id;
    if (child.style !== undefined) props.style = child.style;
    if (child.src !== undefined) props.src = child.src;
    const content = "text" in child ? toDisplayString(child.text) : child.children?.map(draw);
    const vnode = h(child.tag ?? "div", props, content);
    return child.show === undefined ? vnode : withDirectives(vnode, [[vShow, child.show]]);
}

/**
 * The player's move list and its column headers, in every generation.
 *
 * The five generations draw it with different element trees (gen1 and gen3 a block of `<div>`s, gen2 a table with a
 * battle and an overworld copy of each cell, gens 4-5 one table per move slot), and the harness compares every
 * element, so each generation's `layout` (in `games/genN/playerPanel.ts`) turns the plain `list` its overlay computed
 * into elements. No generation's rule lives here. The component re-renders only when `list` changes.
 */
export const MoveList = defineComponent({
    name: "MoveList",
    props: {
        /** What the generation's computed worked out: its rows, and anything its layout needs (state, toggles). */
        list: { type: Object, required: true },
        /** The generation's element tree for `list`. */
        layout: { type: Function as PropType<(list: any) => readonly MoveChild[]>, required: true },
    },
    render() {
        return this.layout(this.list).map(draw);
    },
});
