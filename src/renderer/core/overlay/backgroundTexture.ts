/**
 * The background texture's inline style, shared by all five generations (gen1's
 * components/graphics.vue, and gens 2-5 through overlayCommonMixin's `backgroundTextureStyle`).
 *
 * The texture is a 1920x1080 `.canvas` image, scaled about its centre and then moved by
 * the X/Y offset. An offset pulls one edge of the image into view, and a blur fades the
 * image's own border to transparent (CSS blurs against transparent, not the edge pixels),
 * so either shows the black page behind. The scale drawn is therefore never below the
 * smallest that still covers the whole canvas; the saved scale is left as it is.
 */

const HALF_WIDTH = 960;
const HALF_HEIGHT = 540;
/** How far in from the image's border a blur of 1px still lets the black through (~3 standard deviations). */
const BLUR_FADE_PER_PX = 3;

export interface BackgroundTextureSettings {
    blur: unknown;
    hue: unknown;
    brightness: unknown;
    contrast: unknown;
    saturation: unknown;
    /** Percent; 100 is the canvas size. */
    scale: unknown;
    /** Mirror horizontally. */
    flip: unknown;
    /** Mirror vertically (gen1-3 only). */
    flipY?: unknown;
    offsetX: unknown;
    /** Positive moves the texture up. */
    offsetY: unknown;
}

/** Values arrive as numbers or, from an unconverted slider or an old preset, as strings. */
function num(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

/**
 * The scale (percent) to draw: the saved one, or the smallest that covers the canvas once
 * the offsets and the blur's faded border are taken off, rounded up to a tenth of a percent.
 * A setting that already covers is returned unchanged.
 */
export function coveringBackgroundScale(scale: unknown, offsetX: unknown, offsetY: unknown, blur: unknown): number {
    const saved = num(scale);
    const fade = Math.max(0, num(blur)) * BLUR_FADE_PER_PX;
    // The offset is applied before the scale, so both it and the fade grow with the image:
    // the covered half-width is scale * (960 - |x| - fade), which must reach 960.
    const needed = Math.max(
        HALF_WIDTH / Math.max(1, HALF_WIDTH - Math.abs(num(offsetX)) - fade),
        HALF_HEIGHT / Math.max(1, HALF_HEIGHT - Math.abs(num(offsetY)) - fade),
    ) * 100;
    return saved >= needed ? saved : Math.ceil(needed * 10) / 10;
}

/**
 * The `filter` and `transform` the five templates used to build inline. Everything but the
 * scale is passed through as given, so a style that already covered renders exactly as before.
 */
export function backgroundTextureStyle(s: BackgroundTextureSettings): { filter: string; transform: string } {
    const scale = coveringBackgroundScale(s.scale, s.offsetX, s.offsetY, s.blur);
    return {
        filter: `blur(${s.blur}px) hue-rotate(${s.hue}deg) brightness(${s.brightness}%) contrast(${s.contrast}%) saturate(${s.saturation}%)`,
        transform: `scale(${scale}%) ${s.flip ? 'rotateY(180deg)' : ''} ${s.flipY ? 'rotateX(180deg)' : ''} translate(${s.offsetX}px, ${-(s.offsetY as number)}px)`,
    };
}
