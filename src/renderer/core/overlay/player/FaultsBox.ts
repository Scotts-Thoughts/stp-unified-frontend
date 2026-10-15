import { defineComponent, h, toDisplayString, vShow, withDirectives, type PropType, type VNode } from "vue";
import { faultFontSize, type FaultMode } from "~/core/logic/faultMode";

/**
 * One element of a faults box, as a generation lays it out (`games/genN/playerPanel.ts`).
 *
 * The five generations drew the same box (the "faults" / "resets" / "blackouts" labels, the counts and the frame
 * picture) with five different element trees, and the harness compares every element's place, classes and styles.
 * So each generation describes its tree once as data, and this component draws it. No generation's rule lives here:
 * which mode is showing comes in as `mode` (core/logic/faultMode.ts).
 */
export interface FaultsNode {
    /** Shown (`v-show`) only in these modes. Omitted: always shown. */
    show?: readonly FaultMode[];
    /** Rendered at all (`v-if`) only in these modes. Omitted: always rendered. */
    only?: readonly FaultMode[];
    class?: string;
    id?: string;
    /** Inline style that never changes (a frame's `--url`). */
    style?: Readonly<Record<string, string>>;
    /** A frame picture: the box's `frameStyle` (the overlay's tint) is added to its style. */
    frame?: boolean;
    /** Fixed text, such as a label. */
    text?: string;
    /** Shows this counter. */
    count?: "resets" | "blackouts";
    /** Font size follows this counter's digit count (the box's `fontSizes`; none when that is not given). */
    sizeBy?: "resets" | "blackouts";
    children?: readonly FaultsNode[];
}

/**
 * The faults box (C1 of docs/ui-audit/C-onstream-player.md). A generation whose box sits in more than one place in
 * its overlay (gen2: frames, labels and counts; gen5: frames, then labels and counts) uses one `<faults-box>` per
 * place, each with its part of the layout.
 */
export const FaultsBox = defineComponent({
    name: "FaultsBox",
    props: {
        /** The generation's element tree (one or more top-level elements). */
        layout: { type: Array as PropType<readonly FaultsNode[]>, required: true },
        /** faultMode() of the two counts shown. */
        mode: { type: String as PropType<FaultMode>, required: true },
        resets: { type: [Number, String], default: undefined },
        blackouts: { type: [Number, String], default: undefined },
        /** Added to every frame's style: the overlay's tint and shadow, e.g. `filter: saturate(1) drop-shadow(...)`. */
        frameStyle: { type: String, default: null },
        /** [up to 2 digits, 3 digits, 4 or more] in px for the `sizeBy` elements (faultFontSize). */
        fontSizes: { type: Array as unknown as PropType<readonly [number, number, number]>, default: null },
    },
    methods: {
        node(node: FaultsNode): VNode | null {
            if (node.only && !node.only.includes(this.mode)) return null;
            const styles: unknown[] = [];
            if (node.style) styles.push(node.style);
            if (node.frame && this.frameStyle) styles.push(this.frameStyle);
            if (node.sizeBy && this.fontSizes) {
                styles.push({ "font-size": faultFontSize(this[node.sizeBy], this.fontSizes) + "px" });
            }
            const props: Record<string, unknown> = {};
            if (node.class) props.class = node.class;
            if (node.id) props.id = node.id;
            if (styles.length) props.style = styles;
            const children = node.count ? toDisplayString(this[node.count])
                : node.text ?? node.children?.map((child) => this.node(child));
            const vnode = h("div", props, children);
            return node.show ? withDirectives(vnode, [[vShow, node.show.includes(this.mode)]]) : vnode;
        },
    },
    render() {
        const nodes = this.layout.map((node) => this.node(node));
        return nodes.length === 1 ? nodes[0] : nodes;
    },
});
