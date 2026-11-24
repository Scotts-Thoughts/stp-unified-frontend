/**
 * Game buckets for player profiles (move-stats spec §4.3).
 *
 * Paired versions share a bucket, the way the overlay groups its editions: a bucket's
 * key is the edition's `game` (the mapper game name the manifests already use), so
 * "Red" and "Blue" both land in "Red and Blue". The router names single versions
 * ("FireRed", "SoulSilver"), so its name is mapped here only to check that both
 * programs agree on what is being played (§4.4). This file is the only part of
 * `core/profile/` that knows about games.
 */
import type { ModuleManifest } from "../game/ModuleManifest";

export interface BucketInfo {
    key: string;
    label: string;
    generation: number;
}

/** In the order the stats screen shows its tabs. */
export const BUCKETS: readonly BucketInfo[] = [
    { key: "Red and Blue", label: "Red / Blue", generation: 1 },
    { key: "Yellow", label: "Yellow", generation: 1 },
    { key: "Gold and Silver", label: "Gold / Silver", generation: 2 },
    { key: "Crystal", label: "Crystal", generation: 2 },
    { key: "Emerald", label: "Emerald", generation: 3 },
    { key: "FireRed and LeafGreen", label: "FireRed / LeafGreen", generation: 3 },
    { key: "Diamond and Pearl", label: "Diamond / Pearl", generation: 4 },
    { key: "Platinum", label: "Platinum", generation: 4 },
    { key: "HeartGold and SoulSilver", label: "HeartGold / SoulSilver", generation: 4 },
    { key: "Black", label: "Black", generation: 5 },
    { key: "White", label: "White", generation: 5 },
    { key: "Black 2", label: "Black 2", generation: 5 },
    { key: "White 2", label: "White 2", generation: 5 },
];

const BY_KEY = new Map(BUCKETS.map((b) => [b.key, b]));

/** The router's version names (pkmn_yellow_xp_router `xpr-core/src/consts.rs`) -> bucket. */
const ROUTER_VERSIONS: Record<string, string> = {
    Red: "Red and Blue",
    Blue: "Red and Blue",
    Yellow: "Yellow",
    Gold: "Gold and Silver",
    Silver: "Gold and Silver",
    Crystal: "Crystal",
    Emerald: "Emerald",
    FireRed: "FireRed and LeafGreen",
    LeafGreen: "FireRed and LeafGreen",
    Diamond: "Diamond and Pearl",
    Pearl: "Diamond and Pearl",
    Platinum: "Platinum",
    HeartGold: "HeartGold and SoulSilver",
    SoulSilver: "HeartGold and SoulSilver",
    Black: "Black",
    White: "White",
    "Black 2": "Black 2",
    "White 2": "White 2",
};

export function bucketInfo(key: string | null | undefined): BucketInfo | null {
    return key ? (BY_KEY.get(key) ?? null) : null;
}

export function bucketLabel(key: string): string {
    return BY_KEY.get(key)?.label ?? key;
}

/** The bucket the router's `game` belongs to, or null for a game the overlay doesn't run (Ruby, Sapphire). */
export function bucketForRouterGame(game: string | null | undefined): string | null {
    if (!game) return null;
    return ROUTER_VERSIONS[game] ?? (BY_KEY.has(game) ? game : null);
}

/**
 * The bucket for a generation's chosen edition. `editionName` is what the start screen
 * stores (an `Edition.name`); `fallbackGame` -- the detected mapper's game -- is used
 * when no edition is stored yet.
 */
export function bucketForEdition(manifest: ModuleManifest, editionName: string | null | undefined, fallbackGame?: string | null): string | null {
    const edition = manifest.editions.find((e) => e.name === editionName);
    const key = edition?.game ?? fallbackGame ?? null;
    return key && BY_KEY.has(key) ? key : null;
}
