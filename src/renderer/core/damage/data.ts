import { shallowReactive } from "vue";
import type { DamageGameData } from "./calc";

/**
 * Each game's damage data (`data/<slug>.json`, built by `tools/damage/build-data.mjs`), loaded the first time a
 * generation asks for it. Vite makes each file its own chunk, so a generation only ever loads its own games.
 */
const FILES = import.meta.glob<DamageGameData>("./data/*.json", { import: "default" });

/** Edition `game` (games/genN/manifest.ts) → data file. */
const SLUGS: Record<string, string> = {
    "Red and Blue": "red-blue", "Yellow": "yellow",
    "Gold and Silver": "gold-silver", "Crystal": "crystal",
    "Emerald": "emerald", "FireRed and LeafGreen": "firered-leafgreen", "Ruby and Sapphire": "emerald",
    "Diamond and Pearl": "diamond-pearl", "Platinum": "platinum", "HeartGold and SoulSilver": "heartgold-soulsilver",
    "Black": "black-white", "White": "black-white", "Black 2": "black2-white2", "White 2": "black2-white2",
};

const loaded = shallowReactive(new Map<string, DamageGameData>());
const pending = new Set<string>();

/**
 * The game's data, or null while it loads (a computed that read it re-runs when it arrives, because `loaded` is
 * reactive). Null for a game with no file.
 */
export function damageData(game: string | null | undefined): DamageGameData | null {
    const slug = game ? SLUGS[game] : undefined;
    if (!slug) return null;
    const have = loaded.get(slug);
    if (have) return have;
    const load = FILES[`./data/${slug}.json`];
    if (load && !pending.has(slug)) {
        pending.add(slug);
        load().then((d) => loaded.set(slug, d)).catch((e) => console.warn(`[damage] ${slug}:`, e));
    }
    return null;
}
