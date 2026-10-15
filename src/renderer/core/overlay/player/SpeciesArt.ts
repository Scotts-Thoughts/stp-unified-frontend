import { defineComponent, h, Transition, vShow, withDirectives, type PropType, type VNode } from "vue";
import "../../styles/player.css";

/** A species' saved art adjustments (the Style sliders), as each generation stores them. */
export interface SpeciesArtLook {
    scale?: number | string;
    flip: unknown;
    offsetX?: number | string;
    offsetY?: number | string;
    rotation?: number | string;
    /** Percent. */
    saturation?: number | string;
}

/**
 * The art's inline style: the sliders' transform, and its saturation under the black outline (six thin shadows)
 * and the offset shadow, which follows a flip.
 */
export function speciesArtStyle(look: SpeciesArtLook): { transform: string; filter: string } {
    const outline = "drop-shadow(0 0 0.4px #000) ".repeat(6);
    return {
        transform: `scale(${look.scale}) ${look.flip ? "rotateY(180deg)" : ""} translate(${look.offsetX}px, ${-(look.offsetY as number)}px) rotate(${look.rotation}deg)`,
        filter: `saturate(${look.saturation}%) ${outline}drop-shadow(${look.flip ? "-3px" : "3px"} 3px 3px #000)`,
    };
}

const slider = { type: null as unknown as PropType<number | string>, default: undefined } as const;

/**
 * The solo Pokemon's art (C8 of docs/ui-audit/C-onstream-player.md), one `<img>` for all five generations: the
 * picture with the species' saved adjustments. A new picture cross-fades over the old one in every generation
 * (decision 24 of docs/ui-uniformity-plan.md): the generation names the `<transition>` (gens 1-2
 * `species-art-fade` in core/styles/player.css, gen3 `castformFade`, gens 4-5 `styleFade` in their `style.css`) and,
 * if the picture's path is not the right key, the key whose change starts the fade. A `v-if` on the art stays in the
 * generation's markup; a `v-show` is `show`, inside the transition.
 */
export const SpeciesArt = defineComponent({
    name: "SpeciesArt",
    props: {
        src: { type: String, required: true },
        /** `pokemon_art` (gen1 Red/Blue: `pokemon_art2`, gen2: `pokemon_art pokemon_offsets`). */
        imgClass: { type: String, required: true },
        // Untyped: a slider or a saved value may hand over text, and a Boolean prop would cast "" to true.
        scale: slider,
        flip: { type: null as unknown as PropType<unknown>, default: false },
        offsetX: slider,
        offsetY: slider,
        rotation: slider,
        saturation: slider,
        /** A `<transition>` of this name around the art; none: no transition. */
        transition: { type: String as PropType<string | null>, default: null },
        /** The art's key inside the transition: a new key cross-fades the old art out and the new one in. Omitted: the
         * picture's path. */
        artKey: { type: null as unknown as PropType<string | number | null | undefined>, default: undefined },
        /** `v-show` on the art (gen1's Yellow picture); omitted: always shown. */
        show: { type: null as unknown as PropType<boolean | undefined>, default: undefined },
    },
    render() {
        const key = this.artKey === undefined ? this.src : this.artKey ?? undefined;
        let art: VNode = h("img", { key, class: this.imgClass, style: speciesArtStyle(this), src: this.src });
        if (this.show !== undefined) art = withDirectives(art, [[vShow, this.show]]);
        return this.transition ? h(Transition, { name: this.transition }, () => art) : art;
    },
});
