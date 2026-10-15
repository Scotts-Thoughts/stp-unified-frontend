/**
 * The default look of each background texture, shared by all five generations.
 *
 * A species whose background filters are all untouched (brightness, contrast and
 * saturation 100, blur 0) gets its texture's look when it loads or is reset, instead of
 * the raw image. A species with any of the four changed keeps its own values. Hue,
 * scale, offsets and flips are per-species framing and are never set here.
 *
 * Looks are keyed by image file, not texture name: the generations name the same
 * picture differently (gen5's "Water" is gen3's "Dark Water" and gen2's "water"). The
 * values are the median of Scott's styled species for each picture (2026-10-15, from the
 * shipped style files, the legacy apps and his saved overrides), or picked by eye in the
 * same style where he had styled two or fewer. Edit a row to change every generation.
 */

export interface TextureLook {
    brightness: number;
    contrast: number;
    saturation: number;
    blur: number;
}

/** [brightness, contrast, saturation, blur, image files under public/images]. */
type LookRow = [number, number, number, number, string[]];

const LOOKS: LookRow[] = [
    // gen1 Bug 1, gen2 bug (median of 9 styled species)
    [91, 121, 100, 0, ["gen2/textures/bug.webp","textures/bug.webp"]],
    // gen1 Bug 2 (Honey Comb), gen2 bug 2 (Honey Comb) (picked by eye)
    [70, 125, 85, 2, ["gen2/textures/bug2.jpg","textures/bug2.jpg"]],
    // gen1 Dark Clouds (from 1 styled species)
    [100, 115, 100, 0, ["textures/Dark Clouds.jpg"]],
    // gen1 Digital, gen2 Computer, gen4 Computer (picked by eye)
    [100, 115, 100, 0, ["gen2/textures/computer.jpg","gen4/textures/Computer.jpg","textures/digital.jpg"]],
    // gen1 Dragon 1, gen2 dragon (picked by eye)
    [75, 125, 100, 0, ["gen2/textures/dragon.webp","textures/Dragon.webp"]],
    // gen1 Electric 1, gen2 electric (median of 9 styled species)
    [70, 175, 100, 0, ["gen2/textures/electric.webp","textures/electric.webp"]],
    // gen1 Electric 2 (median of 4 styled species)
    [88, 149, 130, 0, ["textures/electric_2.jpg"]],
    // gen1 Electric 3 (picked by eye)
    [70, 125, 100, 0, ["textures/electric_3.jpg"]],
    // gen1 Fighting 1, gen2 fighting (median of 5 styled species)
    [95, 120, 100, 0, ["gen2/textures/fighting.webp","textures/fighting.webp"]],
    // gen1 Fire 1, gen2 fire (median of 31 styled species)
    [94, 131, 100, 1, ["gen2/textures/fire.webp","textures/fire.webp"]],
    // gen1 Flying 1, gen2 flying (median of 7 styled species)
    [100, 124, 100, 0, ["gen2/textures/flying.webp","textures/flying.webp"]],
    // gen1 Ghost 1, gen2 ghost, gen3 Ghost Purple, gen4 Ghost Purple, gen5 Ghost Purple (median of 6 styled species)
    [100, 120, 90, 0, ["gen2/textures/ghost.webp","gen3/textures/Ghost Purple.webp","gen4/textures/Ghost Purple.webp","gen5/textures/Ghost Purple.webp","textures/ghost.webp"]],
    // gen1 Ghost Fighting, gen2 Ghost Fighting (picked by eye)
    [90, 110, 100, 0, ["gen2/textures/ghost_fighting.webp","textures/Ghost Fighting.webp"]],
    // gen1 Grass 1, gen2 grass (median of 2 styled species)
    [50, 150, 115, 3, ["gen2/textures/grass.webp","textures/grass.webp"]],
    // gen1 Ground 1, gen2 ground (median of 24 styled species)
    [72, 126, 100, 0, ["gen2/textures/ground.webp","textures/ground.webp"]],
    // gen1 Ice 1, gen2 ice (median of 8 styled species)
    [57, 154, 100, 0, ["gen2/textures/ice.webp","textures/ice.webp"]],
    // gen1 Ice 2, gen2 ice 2 (picked by eye)
    [80, 120, 100, 0, ["gen2/textures/aurora.jpg","textures/aurora.jpg"]],
    // gen1 Night Forest, gen2 Night Forest (picked by eye)
    [100, 115, 100, 0, ["gen2/textures/forest.jpg","textures/forest.jpg"]],
    // gen1 Normal 1, gen2 normal (picked by eye)
    [70, 115, 100, 0, ["gen2/textures/normal.webp","textures/normal.webp"]],
    // gen1 Poison 1, gen2 poison (median of 13 styled species)
    [71, 121, 100, 0, ["gen2/textures/poison.webp","textures/poison.webp"]],
    // gen1 Psychic (crisp), gen1 Psychic 1, gen3 Psychic, gen4 Psychic, gen5 Psychic (median of 49 styled species)
    [85, 161, 100, 0, ["gen3/textures/Psychic.jpg","gen4/textures/Psychic.jpg","gen5/textures/Psychic.jpg","textures/Psychic (crisp).jpg"]],
    // gen1 Rock 1, gen2 rock (median of 3 styled species)
    [75, 130, 100, 0, ["gen2/textures/rock.webp","textures/rock.webp"]],
    // gen1 Roses, gen3 Roses, gen4 Roses (from 1 styled species)
    [78, 130, 100, 2, ["gen3/textures/Roses.jpg","gen4/textures/Roses.jpg","textures/Roses.jpg"]],
    // gen1 Water 1, gen2 water 2 (picked by eye)
    [80, 125, 100, 0, ["gen2/textures/water2.webp","textures/water1.webp"]],
    // gen1 Water 2, gen2 water, gen3 Dark Water, gen4 Dark Water, gen5 Water (median of 72 styled species, darkened per Scott)
    [85, 130, 100, 0, ["gen2/textures/water.jpg","gen3/textures/Dark Water.jpg","gen4/textures/Dark Water.jpg","gen5/textures/Water.jpg","textures/water.jpg"]],
    // gen1 Water 3 (median of 3 styled species)
    [91, 117, 114, 2, ["textures/water 3.jpg"]],
    // gen2 Bayleef (picked by eye)
    [80, 120, 100, 1, ["gen2/textures/Bayleef.jpg"]],
    // gen2 dark, gen3 Dark, gen4 Dark, gen5 Dark (median of 29 styled species)
    [100, 130, 100, 0, ["gen2/textures/dark.jpg","gen3/textures/Dark.jpg","gen4/textures/Dark.jpg","gen5/textures/Dark.jpg"]],
    // gen2 dog (picked by eye)
    [75, 120, 100, 0, ["gen2/textures/dog_bone.jpg"]],
    // gen2 fairy, gen3 Fairy, gen4 Fairy, gen5 Fairy (median of 13 styled species)
    [85, 110, 130, 0, ["gen2/textures/fairy.jpg","gen3/textures/Fairy.jpg","gen4/textures/Fairy.jpg","gen5/textures/Fairy.jpg"]],
    // gen2 flying_2 (picked by eye)
    [75, 120, 100, 1, ["gen2/textures/flying_2.jpg"]],
    // gen2 fur (from 1 styled species)
    [85, 112, 100, 2, ["gen2/textures/fur.jpg"]],
    // gen2 Grass 2, gen3 Dark Grass, gen4 Dark Grass, gen5 Grass (median of 36 styled species)
    [61, 164, 100, 1, ["gen2/textures/Grass 2.jpg","gen3/textures/Dark Grass.jpg","gen4/textures/Dark Grass.jpg","gen5/textures/Grass.jpg"]],
    // gen2 leaves 3 (picked by eye)
    [80, 120, 100, 0, ["gen2/textures/leaves 3.jpg"]],
    // gen2 Pasture (picked by eye)
    [70, 115, 100, 2, ["gen2/textures/Pasture.jpg"]],
    // gen2 pink_clouds (picked by eye)
    [75, 115, 100, 0, ["gen2/textures/pink_clouds.jpg"]],
    // gen2 psychic (median of 3 styled species)
    [73, 136, 100, 0, ["gen2/textures/psychic.webp"]],
    // gen2 steel (picked by eye)
    [55, 120, 100, 0, ["gen2/textures/steel.jpg"]],
    // gen2 Web (picked by eye)
    [100, 115, 100, 0, ["gen2/textures/Web.jpg"]],
    // gen3 Brushed Steel, gen4 Brushed Steel, gen5 Brushed Steel (median of 15 styled species)
    [74, 129, 100, 0, ["gen3/textures/Brushed Steel.jpg","gen4/textures/Brushed Steel.jpg","gen5/textures/Brushed Steel.jpg"]],
    // gen3 Bug, gen4 Bug, gen5 Bug (median of 27 styled species)
    [57, 118, 100, 2, ["gen3/textures/Bug.jpg","gen4/textures/Bug.jpg","gen5/textures/Bug.jpg"]],
    // gen3 Cave (picked by eye)
    [80, 120, 100, 1, ["gen3/textures/Cave.jpg"]],
    // gen3 Computer (picked by eye)
    [70, 120, 100, 1, ["gen3/textures/Computer.jpg"]],
    // gen3 Cracked Magma (picked by eye)
    [75, 115, 100, 1, ["gen3/textures/Cracked Magma.jpg"]],
    // gen3 Dark Ice, gen4 Dark Ice, gen5 Ice (median of 16 styled species)
    [41, 132, 100, 3, ["gen3/textures/Dark Ice.jpg","gen4/textures/Dark Ice.jpg","gen5/textures/Ice.jpg"]],
    // gen3 Dark Moon, gen4 Dark Moon, gen5 Dark Moon (median of 11 styled species)
    [94, 146, 100, 1, ["gen3/textures/Dark Moon.jpg","gen4/textures/Dark Moon.jpg","gen5/textures/Dark Moon.jpg"]],
    // gen3 Dark Perspective (picked by eye)
    [100, 115, 100, 0, ["gen3/textures/Dark Perspective.jpg"]],
    // gen3 Dragon, gen4 Dragon, gen5 Dragon (median of 36 styled species)
    [89, 157, 100, 1, ["gen3/textures/Dragon.jpg","gen4/textures/Dragon.jpg","gen5/textures/Dragon.jpg"]],
    // gen3 Electric, gen4 Electric, gen5 Electric (median of 35 styled species)
    [62, 167, 100, 0, ["gen3/textures/Electric.jpg","gen4/textures/Electric.jpg","gen5/textures/Electric.jpg"]],
    // gen3 Fighting, gen4 Fighting, gen5 Fighting (median of 22 styled species)
    [62, 130, 100, 2, ["gen3/textures/Fighting.jpg","gen4/textures/Fighting.jpg","gen5/textures/Fighting.jpg"]],
    // gen3 Fire, gen4 Fire, gen5 Fire (median of 46 styled species)
    [75, 118, 100, 1, ["gen3/textures/Fire.jpg","gen4/textures/Fire.jpg","gen5/textures/Fire.jpg"]],
    // gen3 Fireplace (picked by eye)
    [80, 120, 100, 1, ["gen3/textures/Fireplace.jpg"]],
    // gen3 Flying, gen4 Flying, gen5 Flying (median of 15 styled species)
    [83, 140, 100, 2, ["gen3/textures/Flying.jpg","gen4/textures/Flying.jpg","gen5/textures/Flying.jpg"]],
    // gen3 Ghost, gen4 Ghost, gen5 Ghost (median of 23 styled species)
    [100, 117, 100, 0, ["gen3/textures/Ghost.jpg","gen4/textures/Ghost.jpg","gen5/textures/Ghost.jpg"]],
    // gen3 Grass, gen4 Grass, gen5 Sunny Grass (median of 3 styled species)
    [50, 125, 108, 2, ["gen3/textures/Grass.jpg","gen4/textures/Grass.jpg","gen5/textures/Sunny Grass.jpg"]],
    // gen3 Ground, gen4 Ground, gen5 Ground (median of 38 styled species)
    [34, 129, 100, 4, ["gen3/textures/Ground.jpg","gen4/textures/Ground.jpg","gen5/textures/Ground.jpg"]],
    // gen3 Ice, gen4 Ice (picked by eye)
    [60, 130, 100, 2, ["gen3/textures/Ice.jpg","gen4/textures/Ice.jpg"]],
    // gen3 Jungle Swamp, gen4 Jungle Swamp, gen5 Jungle Swamp (median of 3 styled species)
    [85, 115, 100, 3, ["gen3/textures/Jungle Swamp.jpg","gen4/textures/Jungle Swamp.jpg","gen5/textures/Jungle Swamp.jpg"]],
    // gen3 Mountain at Night (picked by eye)
    [90, 115, 100, 0, ["gen3/textures/Mountain at Night.jpg"]],
    // gen3 Muddy Water, gen4 Muddy Water, gen5 Muddy Water (median of 3 styled species)
    [55, 140, 100, 3, ["gen3/textures/Muddy Water.jpg","gen4/textures/Muddy Water.jpg","gen5/textures/Muddy Water.jpg"]],
    // gen3 Normal, gen4 Normal, gen5 Normal (picked by eye)
    [70, 120, 100, 1, ["gen3/textures/Normal.jpg","gen4/textures/Normal.jpg","gen5/textures/Normal.jpg"]],
    // gen3 Poison, gen4 Poison, gen5 Poison (median of 38 styled species)
    [68, 133, 100, 3, ["gen3/textures/Poison.jpg","gen4/textures/Poison.jpg","gen5/textures/Poison.jpg"]],
    // gen3 Red Stone (picked by eye)
    [70, 120, 100, 1, ["gen3/textures/Red Stone.jpg"]],
    // gen3 Rock, gen4 Rock, gen5 Rock (median of 30 styled species)
    [100, 114, 100, 2, ["gen3/textures/Rock.jpg","gen4/textures/Rock.jpg","gen5/textures/Rock.jpg"]],
    // gen3 SciFi (picked by eye)
    [85, 115, 100, 0, ["gen3/textures/SciFi.jpg"]],
    // gen3 Spiral (picked by eye)
    [70, 115, 100, 1, ["gen3/textures/Spiral.jpg"]],
    // gen3 Steel, gen4 Steel, gen5 Steel (median of 3 styled species)
    [45, 115, 100, 0, ["gen3/textures/Steel.jpg","gen4/textures/Steel.jpg","gen5/textures/Steel.jpg"]],
    // gen3 SteelLab (picked by eye)
    [85, 115, 100, 0, ["gen3/textures/SteelLab.jpg"]],
    // gen3 Swamp Water, gen4 Swamp Water, gen5 Swamp Water (median of 2 styled species)
    [90, 116, 120, 3, ["gen3/textures/Swamp Water.jpg","gen4/textures/Swamp Water.jpg","gen5/textures/Swamp Water.jpg"]],
    // gen3 Underwater Tunnel (median of 4 styled species)
    [80, 136, 100, 2, ["gen3/textures/Underwater Tunnel.jpg"]],
    // gen3 Volcano (picked by eye)
    [85, 115, 100, 0, ["gen3/textures/Volcano.jpg"]],
    // gen3 Water, gen4 Water (median of 14 styled species)
    [29, 134, 141, 2, ["gen3/textures/Water.jpg","gen4/textures/Water.jpg"]],
    // gen3 Water Drops, gen4 Water Drops, gen5 Water Drops (picked by eye)
    [75, 120, 100, 1, ["gen3/textures/Water Drops.jpg","gen4/textures/Water Drops.jpg","gen5/textures/Water Drops.jpg"]],
    // gen3 Water Ice (picked by eye)
    [80, 120, 100, 0, ["gen3/textures/Water Ice.jpg"]],
    // gen4 Avalanche (picked by eye)
    [65, 125, 100, 1, ["gen4/textures/Avalanche.jpg"]],
    // gen4 Beaver Dam (picked by eye)
    [70, 120, 100, 2, ["gen4/textures/Beaver Dam.jpg"]],
    // gen4 Fallen Trees (median of 5 styled species)
    [50, 120, 100, 4, ["gen4/textures/Fallen Trees.jpg"]],
    // gen4 Honey Comb, gen5 Honey Comb (picked by eye)
    [75, 120, 100, 1, ["gen4/textures/Honey Comb.jpg","gen5/textures/Honey Comb.jpg"]],
    // gen4 Hydrangea (picked by eye)
    [70, 115, 100, 2, ["gen4/textures/Hydrangea.jpg"]],
    // gen4 Judgement (picked by eye)
    [85, 125, 100, 0, ["gen4/textures/Judgement.jpg"]],
    // gen4 Snowy Trees (picked by eye)
    [60, 125, 100, 2, ["gen4/textures/Snowy Trees.jpg"]],
    // gen4 Underwater Rocks (median of 3 styled species)
    [110, 110, 120, 0, ["gen4/textures/Underwater_Rocks.jpg"]],
    // gen4 Vines (median of 2 styled species)
    [102, 125, 100, 2, ["gen4/textures/Vines.jpg"]],
    // gen5 Paint (from 1 styled species)
    [74, 108, 87, 1, ["gen5/textures/Paint.jpg"]],
];

/** `images\gen2\textures/water.jpg` and `images/gen2/textures/water.jpg` are the same key. */
function fileKey(src: string): string {
    return src.split("\\").join("/").replace(/^\.?\//, "").replace(/^images\//, "").toLowerCase();
}

const BY_FILE = new Map<string, TextureLook>();
for (const [brightness, contrast, saturation, blur, files] of LOOKS) {
    for (const file of files) BY_FILE.set(fileKey(file), { brightness, contrast, saturation, blur });
}

/** The look for a texture's image path (as the generation's `textures` table gives it), if it has one. */
export function textureLook(src: unknown): TextureLook | undefined {
    return typeof src === "string" ? BY_FILE.get(fileKey(src)) : undefined;
}

/**
 * A generation's `textures` entry for a name, as an image path: gen5's entries are
 * `{ path, ... }`, the others plain strings. Falls back to a case-insensitive match,
 * because gen2-5's reset writes the lower-cased type name.
 */
export function texturePath(table: Record<string, unknown> | undefined, name: unknown): string | undefined {
    if (!table || typeof name !== "string") return undefined;
    let entry = table[name];
    if (entry === undefined) {
        const lower = name.toLowerCase();
        const key = Object.keys(table).find((k) => k.toLowerCase() === lower);
        entry = key === undefined ? undefined : table[key];
    }
    if (typeof entry === "string") return entry;
    const path = (entry as { path?: unknown } | undefined)?.path;
    return typeof path === "string" ? path : undefined;
}

/** True when none of the four filters has been moved off its plain value. */
export function hasUntouchedFilters(brightness: unknown, contrast: unknown, saturation: unknown, blur: unknown): boolean {
    return Number(brightness) === 100 && Number(contrast) === 100 && Number(saturation) === 100 && Number(blur) === 0;
}

/**
 * The look to apply when the texture is changed from `oldSrc` to `newSrc`: the new
 * texture's, if the filters are untouched or still exactly the old texture's look (so
 * browsing textures shows each in its own look), else nothing (the filters were styled
 * by hand and stay). A species load also changes the texture, but its look has been
 * applied by then, so this returns nothing (or, for two textures with the same look, the
 * same values).
 */
export function lookAfterTextureChange(
    oldSrc: unknown,
    newSrc: unknown,
    current: { brightness: unknown; contrast: unknown; saturation: unknown; blur: unknown },
): TextureLook | undefined {
    const next = textureLook(newSrc);
    if (!next) return undefined;
    const old = textureLook(oldSrc);
    const { brightness, contrast, saturation, blur } = current;
    const untouched = hasUntouchedFilters(brightness, contrast, saturation, blur)
        || (old !== undefined && Number(brightness) === old.brightness && Number(contrast) === old.contrast
            && Number(saturation) === old.saturation && Number(blur) === old.blur);
    return untouched ? next : undefined;
}
