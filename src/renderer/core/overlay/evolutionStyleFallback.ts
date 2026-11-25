/**
 * Evolution mode (gens 3-5) styles each family member from `<Game>_<Family>-line-<Species>`.
 * When that entry has no styling of its own, the species' own `<Game>_<Species>` styling is
 * used instead (Scott, 2026-11-25), so a Pokémon looks the same with the evolution box ticked
 * until it is styled for evolution mode. The first style edit in evolution mode copies that
 * styling into the line entry before the edit lands, so the rest of the look is kept.
 */

/** Every saved field that is part of a Pokémon's look (art, overlay colour, background). */
export const STYLE_FIELDS = [
    "overlay_color", "ui_saturation",
    "imageXOffset", "imageYOffset", "imageScale", "imageFlip", "imageSat", "imageRotation",
    "backgroundTexture", "backgroundBlur", "backgroundHue", "backgroundScale", "backgroundUrl",
    "backgroundFlip", "backgroundXFlip", "use_custom_background", "backgroundXOffset", "backgroundYOffset",
    "backgroundBrightness", "backgroundContrast", "backgroundSaturation",
] as const;

type Store = Record<string, any>;

/** Whether a saved entry sets any part of the look. */
export function hasStyle(entry: unknown): boolean {
    if (!entry || typeof entry !== "object") return false;
    const e = entry as Record<string, unknown>;
    return STYLE_FIELDS.some((k) => e[k] !== undefined && e[k] !== null);
}

/** The key to read a family member's look from: its line entry if styled, else its own entry. */
export function styleSourceKey(storage: Store, lineKey: string, ownKey: string): string {
    return hasStyle(storage[lineKey]) ? lineKey : ownKey;
}

/** Before the first style write to an unstyled line entry, copy the species' own look into it. */
export function seedLineStyle(storage: Store, lineKey: string, ownKey: string): void {
    if (lineKey === ownKey || hasStyle(storage[lineKey])) return;
    const own = storage[ownKey];
    if (!hasStyle(own)) return;
    const seed: Record<string, unknown> = {};
    for (const k of STYLE_FIELDS) {
        if (own[k] !== undefined && own[k] !== null) seed[k] = own[k];
    }
    storage[lineKey] = { ...seed, ...(storage[lineKey] ?? {}) };
}

/** True when a saved property is part of the look. */
export function isStyleField(name: string): boolean {
    return (STYLE_FIELDS as readonly string[]).includes(name);
}
