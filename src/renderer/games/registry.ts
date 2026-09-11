import type { GameModule } from "~/core/game/GameModule";
import type { ModuleManifest } from "~/core/game/ModuleManifest";
import type { MapperProfile } from "~/core/mapper/MapperProfile";
import { matchesIdentity, matchesPath, readIdentity } from "~/core/mapper/MapperAdapter";
import { gen1Manifest } from "./gen1/manifest";
import { gen2Manifest } from "./gen2/manifest";
import { gen3Manifest } from "./gen3/manifest";
import { gen4Manifest } from "./gen4/manifest";
import { gen5Manifest } from "./gen5/manifest";

/**
 * Mapper -> generation (plan 1.4, 3.1).
 *
 * The registry holds the five *manifests* -- profiles, editions, the edition key --
 * and loads a generation's module only once its mapper is detected: a lifted
 * generation is a ten-thousand-line component plus its data tables, and Vite splits
 * each `load()` into its own chunk, so the renderer bundle carries gen1 (the
 * pre-mapper screen's) and nothing else until a mapper says which.
 *
 * Detection order, from `docs/mapper-matrix.md`: the `/mapper` response's `meta.path`
 * against each profile's patterns first, then the profile's identity rule (a property
 * value for gen1/gen2/gen4/gen5, the `/mapper` meta for gen3's emerald mappers, which
 * have no meta properties). A mapper nothing claims -- every hack mapper, by decision 8
 * -- yields `null`, and `main.ts` shows the unsupported-mapper state.
 */
export const MANIFESTS: readonly ModuleManifest[] = [gen1Manifest, gen2Manifest, gen3Manifest, gen4Manifest, gen5Manifest];

export interface Detection {
    manifest: ModuleManifest;
    profile: MapperProfile;
    /** The mapper game name -- a data key ("Yellow", "Red and Blue", "Crystal"...). */
    game: string;
}

export function detect(metaPath: string | null | undefined, properties: any, mapperMeta: any): Detection | null {
    for (const manifest of MANIFESTS) {
        for (const profile of manifest.mappers) {
            if (matchesPath(profile, metaPath) || matchesIdentity(profile, properties, mapperMeta)) {
                const game = readIdentity(profile.identity, properties, mapperMeta) ?? profile.identity.values[0];
                return { manifest, profile, game };
            }
        }
    }
    return null;
}

const loaded = new Map<string, Promise<GameModule>>();

/** The generation's module, imported on first use and kept. */
export function loadModule(manifest: ModuleManifest): Promise<GameModule> {
    let pending = loaded.get(manifest.id);
    if (!pending) {
        pending = manifest.load();
        loaded.set(manifest.id, pending);
    }
    return pending;
}
