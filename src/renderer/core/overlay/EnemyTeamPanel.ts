import { createCommentVNode, defineComponent, h, toDisplayString, Transition, vShow, withDirectives, type PropType, type StyleValue, type VNode } from "vue";

/**
 * One element of a generation's enemy team panel (`games/genN/enemyPanel.ts`). Strings in `children` are text;
 * `null` is nothing (an empty `v-if`).
 */
export interface EnemyNode {
    /** Default `div`. */
    tag?: string;
    /** The element a template `v-if` branch or `:key` would be: a different key makes a new element. */
    key?: string | number;
    /** As a template's `class` / `:class` (a string, an array or an object). */
    class?: unknown;
    id?: string;
    style?: StyleValue;
    /** `<img>`'s picture. */
    src?: string | null;
    /** Other attributes (the sprite resize tool's `data-enemy-slot` / `data-enemy-species`). */
    attrs?: Readonly<Record<string, unknown>>;
    /** `v-show`; omitted: always shown. */
    show?: boolean;
    /** A `<transition>` of this name around the element (its fade is in each `style.css`). */
    transition?: string;
    /** The element's only content, shown as an interpolation shows it (`null` and `undefined` as ""). */
    text?: unknown;
    children?: readonly EnemyChild[];
}
export type EnemyChild = EnemyNode | string | null;

function draw(child: EnemyChild): VNode | string {
    if (child === null) return createCommentVNode("v-if", true);
    if (typeof child === "string") return child;
    const props: Record<string, unknown> = { ...child.attrs };
    if (child.key !== undefined) props.key = child.key;
    if (child.class !== undefined) props.class = child.class;
    if (child.id !== undefined) props.id = child.id;
    if (child.style !== undefined) props.style = child.style;
    if (child.src !== undefined) props.src = child.src;
    const content = "text" in child ? toDisplayString(child.text) : child.children?.map(draw);
    const element = h(child.tag ?? "div", props, content);
    const vnode = child.show === undefined ? element : withDirectives(element, [[vShow, child.show]]);
    // No `persisted` on a v-show child: only the dev template compiler adds it (see core/overlay/player/PopupBox.ts).
    return child.transition === undefined ? vnode : h(Transition, { name: child.transition }, () => vnode);
}

/**
 * The enemy team panel on the right side in trainer battles, in all five generations (D9 of
 * docs/ui-audit/D-onstream-right-battle.md, docs/ui-uniformity-plan.md step 5.4): the trainer's name, the panel art,
 * and per Pokémon its sprite, types, moves, stats, stat stages and the speed label.
 *
 * The generations draw it with different element trees and art (gen1/gen2 one design, gen3 another, gens 4-5 a
 * third), and the harness compares every element, so each generation's `layout` turns the plain `view` its overlay
 * computed (`enemyTeamView.ts`) into elements. No generation's rule lives here. The component re-renders only when
 * `view` changes, not with every render of the whole overlay.
 */
export const EnemyTeamPanel = defineComponent({
    name: "EnemyTeamPanel",
    props: {
        /** What the generation's computed worked out (`EnemyTeamView` and the generation's extras). */
        view: { type: Object, required: true },
        /** The generation's element tree for `view`. */
        layout: { type: Function as PropType<(view: any) => readonly EnemyChild[]>, required: true },
    },
    render() {
        return this.layout(this.view).map(draw);
    },
});
