import { createCommentVNode, defineComponent, h, toDisplayString, Transition, vShow, withDirectives, type PropType, type StyleValue, type VNode } from "vue";
import "../styles/enemyPanel.css";
import { cropHeight, WEBCAM_PANEL_BOTTOM, webcamArtStyleOrHidden, webcamPanelScale } from "../logic/webcamMode";

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
    /**
     * Webcam Mode's squeeze only: this text's size as a share of the rows' scale (default 1.2, a little over the rows),
     * for text that is crowded in the shorter rows (gen1's stat numbers and stage badges).
     */
    squeezeText?: number;
}
export type EnemyChild = EnemyNode | string | null;

/**
 * A picture named from a value the mapper has not sent yet: `images/gen5/pokemon/null.webp`, a type icon's
 * `undefined.webp`. The team count can arrive a few frames before the species (gens 4-5 debounce each path on its
 * own), and such a picture showed the broken-image icon until the species came.
 */
const MISSING_PICTURE = /(^|\/)(null|undefined)([-.][^/]*)?$/;

/** The load state `core/styles/enemyPanel.css` reads: a picture is hidden until it has loaded, then fades in. */
const STATE = "data-stp-state";
function onPictureLoad(event: Event) {
    (event.target as HTMLElement).setAttribute(STATE, "loaded");
}
function onPictureError(event: Event) {
    (event.target as HTMLElement).setAttribute(STATE, "error");
}
/** A missing picture forgets it had loaded, so the real one fades in when it comes instead of popping in. */
function forgetLoad(vnode: VNode) {
    if (vnode.props?.["data-stp-missing"] !== undefined) (vnode.el as HTMLElement | null)?.removeAttribute(STATE);
}

/** Props an `<img>` of the panel gets on top of its own (see `onPictureLoad`). */
function pictureProps(src: string | null | undefined): Record<string, unknown> {
    const missing = !src || MISSING_PICTURE.test(src);
    return {
        src: missing ? null : src,
        "data-stp-fade": "",
        "data-stp-missing": missing ? "" : undefined,
        onLoad: onPictureLoad,
        onError: onPictureError,
        onVnodeMounted: forgetLoad,
        onVnodeUpdated: forgetLoad,
    };
}

/**
 * Webcam Mode's squeeze (`EnemyTeamPanel`'s `webcam`): the whole panel is drawn `rows` times its height, full width, so
 * the frames and boxes get shorter; text and icons are scaled back up to `text` times their own shape (never squashed),
 * and sprites to `rows` times their size in both directions.
 */
interface Squeeze {
    rows: number;
    text: number;
}

/** A node's classes as one string (a template class may be a string, an array or an object). */
function classText(value: unknown): string {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(classText).join(" ");
    if (value && typeof value === "object") return Object.entries(value).filter(([, on]) => on).map(([name]) => name).join(" ");
    return "";
}

const isIcon = (child: EnemyChild): boolean =>
    child !== null && typeof child === "object" && child.tag === "img" && /icon|type/i.test(classText(child.class));

/**
 * A row of icons on their own (the Pokémon's type icons): drawn as one group at its regular size, so the icons keep
 * their size and the distance between them, from the group's bottom left so they keep their distance from the bottom
 * and left of their area's border.
 */
const isIconGroup = (child: EnemyNode): boolean =>
    child.tag !== "th" && child.tag !== "td" && !!child.children?.length
    && child.children.every((c) => c === null || isIcon(c)) && child.children.some(isIcon);

/** The `transform` in a node's style (an object, a `prop: value;` string, or an array of either), if any. */
function styleTransform(style: unknown): string | undefined {
    if (Array.isArray(style)) return style.map(styleTransform).filter((t) => t !== undefined).pop();
    if (typeof style === "string") return /(?:^|;)\s*transform\s*:\s*([^;]+)/.exec(style)?.[1].trim();
    if (style && typeof style === "object") {
        const value = (style as Record<string, unknown>).transform;
        return typeof value === "string" ? value : undefined;
    }
    return undefined;
}

/**
 * A sprite's transform in the squeeze: its own size times `rows` across (the row already takes it to `rows` down), with
 * the sideways offset its sprite settings give it kept whole, so it sits as far from the centre of its area as it does
 * in the regular layout. (A `scale` property would shrink that offset too and pull every sprite towards its box's
 * centre, right of where it was placed.) Every generation writes `translate(Xpx, Ypx) scale(sx, s)` or `none`.
 */
function spriteTransform(transform: string | undefined, rows: number): string {
    const match = transform && /translate\(\s*([-\d.e]+)px\s*,\s*([-\d.e]+)px\s*\)\s*scale\(\s*([-\d.e]+)\s*,\s*([-\d.e]+)\s*\)/.exec(transform);
    if (!match) return `scale(${rows}, 1)`;
    const [, x, y, sx, sy] = match.map(Number);
    return `translate(${x}px, ${y}px) scale(${sx * rows}, ${sy})`;
}

/** The `scale` (a CSS property of its own, so it composes with a sprite's `transform`) that undoes the squeeze. */
function unsqueeze(child: EnemyNode, squeeze: Squeeze | null): Record<string, string> | null {
    if (!squeeze) return null;
    const { rows, text } = squeeze;
    if ("text" in child) {
        const size = child.squeezeText === undefined ? text : Math.min(1, rows * child.squeezeText);
        return { scale: `${size} ${size / rows}` };
    }
    if (isIconGroup(child)) return { scale: `1 ${1 / rows}`, "transform-origin": "left bottom" };
    if (child.tag !== "img") return null;
    const cls = classText(child.class);
    if (/sprite/i.test(cls)) return { transform: spriteTransform(styleTransform(child.style), rows) };
    // A type icon placed on its own (gens 1-3: `ePkmnTypeIcons`, each at its own `left`): regular size, from its bottom
    // left, so the icons keep their size, the distance between them and their place in the corner of their area.
    if (/typeicon/i.test(cls)) return { scale: `1 ${1 / rows}`, "transform-origin": "left bottom" };
    // A lone icon (a move's type) keeps its place in its cell: scaled from its centre, whatever origin its style.css has,
    // and a little smaller than the text, so it sits inside the shorter move row (at the text's size it was too tall).
    if (isIcon(child)) {
        const icon = Math.min(1, rows * 1.05);
        return { scale: `${icon} ${icon / rows}`, "transform-origin": "center" };
    }
    return null; // full-canvas art: squeezed with its row
}

/** The trainer picture in Webcam Mode: its `src` and the style that places it under the team (`webcamArtStyle`). */
interface ArtPlace {
    src: string;
    style: Record<string, string>;
}

const isArt = (child: EnemyChild, art: ArtPlace | null): boolean =>
    art !== null && child !== null && typeof child === "object" && child.tag === "img" && child.src === art.src;

/** The node holds the trainer picture somewhere inside it. */
const holdsArt = (child: EnemyChild, art: ArtPlace | null): boolean =>
    art !== null && child !== null && typeof child === "object" && (isArt(child, art) || !!child.children?.some((c) => holdsArt(c, art)));

function draw(child: EnemyChild, squeeze: Squeeze | null = null, art: ArtPlace | null = null): VNode | string {
    if (child === null) return createCommentVNode("v-if", true);
    if (typeof child === "string") return child;
    const props: Record<string, unknown> = { ...child.attrs };
    if (child.key !== undefined) props.key = child.key;
    if (child.class !== undefined) props.class = child.class;
    if (child.id !== undefined) props.id = child.id;
    if (child.style !== undefined) props.style = child.style;
    if (isArt(child, art)) props.style = child.style === undefined ? art!.style : [child.style, art!.style];
    const upright = unsqueeze(child, squeeze);
    if (upright) {
        props.style = child.style === undefined ? upright : [child.style, upright];
        if ("text" in child) props["data-stp-upright"] = "";
    }
    if (child.tag === "img") Object.assign(props, pictureProps(child.src));
    else if (child.src !== undefined) props.src = child.src;
    // An icon group's icons are scaled with it, not one by one.
    const inner = squeeze && isIconGroup(child) ? null : squeeze;
    const content = "text" in child ? toDisplayString(child.text) : child.children?.map((c) => draw(c, inner, art));
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
        /**
         * Webcam Mode (`core/logic/webcamMode.ts`): a team whose art (`view.crop`'s height) runs past the webcam line is
         * squeezed to fit: the same width, each row shorter, text and icons upright and a little smaller, sprites
         * shrunk evenly (`Squeeze`). With it off, or a team that fits, the element tree is what it was.
         */
        webcam: { type: Boolean, default: false },
        /**
         * The y in the panel art where the trainer's header ends and the first Pokémon's row begins (gens 1-2: 81,
         * gens 3-5: 66). Everything above it, the header with its angled cutout and the panel's top edge level with the
         * game area, is drawn at its regular size; only the rows below it are squeezed.
         */
        webcamHeader: { type: Number, default: 0 },
    },
    computed: {
        /**
         * Webcam Mode's place for the trainer picture (`view.art`, gens 1, 4 and 5): its own shape, under the team's last
         * row (`webcamArtStyle`), or hidden when there is no room. `null` with Webcam Mode off or no picture.
         */
        artPlace(): ArtPlace | null {
            const src = (this.view as { art?: unknown }).art;
            if (!this.webcam || typeof src !== "string") return null;
            const crop = cropHeight((this.view as { crop?: unknown }).crop);
            return { src, style: webcamArtStyleOrHidden(src, this.squeeze ? WEBCAM_PANEL_BOTTOM : crop) };
        },
        squeeze(): Squeeze | null {
            const rows = this.webcam ? webcamPanelScale(cropHeight((this.view as { crop?: unknown }).crop), this.webcamHeader) : 1;
            return rows === 1 ? null : { rows, text: Math.min(1, rows * 1.2) };
        },
    },
    mounted() {
        this.alignUpright();
    },
    updated() {
        this.alignUpright();
    },
    methods: {
        /**
         * Scales each upright text from the side its text is aligned to, so a left-aligned move name stays at the left
         * of its box and a centred stat stays centred.
         */
        alignUpright(): void {
            const box = this.$refs.squeezeBox;
            if (!(box instanceof HTMLElement)) return;
            for (const el of box.querySelectorAll<HTMLElement>("[data-stp-upright]")) {
                const align = getComputedStyle(el).textAlign;
                const side = align === "left" || align === "start" ? "left" : align === "right" || align === "end" ? "right" : "center";
                if (el.style.transformOrigin !== `${side} center`) el.style.transformOrigin = `${side} center`;
            }
        },
    },
    render() {
        const squeeze = this.squeeze;
        const art = this.artPlace;
        const layout = this.layout(this.view);
        if (!squeeze) return layout.map((child) => draw(child, null, art));
        const cut = this.webcamHeader;
        // The trainer picture is drawn once, outside both boxes, so it keeps its shape (`artPlace` puts it under the team).
        const rows = layout.filter((child) => !holdsArt(child, art));
        const pictures = layout.filter((child) => holdsArt(child, art));
        // Two boxes over the whole 1920x1080 canvas, each holding the whole panel: the first drawn as it is and cut off
        // below the header, the second squeezed from the header's bottom down and cut off above it. Each becomes the
        // containing block of the art (fixed, sized in % of the window: gen4's speed bar) and of every absolutely placed
        // piece (a transform makes it one), so they keep their places and sizes. Clicks go through their empty parts
        // (core/styles/enemyPanel.css gives what they hold its pointer events back).
        const box = { position: "absolute", left: "0", top: "0", width: "1920px", height: "1080px" };
        return [
            h("div", {
                class: "stp-webcam-fit",
                style: { ...box, transform: "scaleY(1)", "clip-path": `inset(0 0 ${1080 - cut}px 0)` },
            }, rows.map((child) => draw(child, null))),
            h("div", {
                ref: "squeezeBox",
                class: "stp-webcam-fit",
                style: { ...box, transform: `scaleY(${squeeze.rows})`, "transform-origin": `0 ${cut}px`, "clip-path": `inset(${cut}px 0 0 0)` },
            }, rows.map((child) => draw(child, squeeze))),
            ...pictures.map((child) => draw(child, null, art)),
        ];
    },
});
