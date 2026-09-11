import type { GameModule } from "~/core/game/GameModule";
import type { MapperProfile } from "~/core/mapper/MapperProfile";
import { matchesIdentity, matchesPath, readIdentity } from "~/core/mapper/MapperAdapter";
import { gen1 } from "./gen1";
import { gen2 } from "./gen2";
import { gen3 } from "./gen3";
import { gen4 } from "./gen4";
import { gen5 } from "./gen5";

/**
 * Mapper -> GameModule (plan 1.4; the fusion in plan 3.1 makes the import lazy per
 * generation).
 *
 * Detection order, from `docs/mapper-matrix.md`: the `/mapper` response's `meta.path`
 * against each profile's patterns first, then the profile's identity rule (a property
 * value for gen1/gen2/gen4/gen5, the `/mapper` meta for gen3's emerald mappers, which
 * have no meta properties). A mapper nothing claims -- every hack mapper, by decision 8
 * -- yields `null`, and `main.ts` shows the unsupported-mapper state.
 */
export const MODULES: readonly GameModule[] = [gen1, gen2, gen3, gen4, gen5];

export interface Detection {
    module: GameModule;
    profile: MapperProfile;
    /** The mapper game name -- a data key ("Yellow", "Red and Blue", "Crystal"...). */
    game: string;
}

export function detect(metaPath: string | null | undefined, properties: any, mapperMeta: any): Detection | null {
    for (const module of MODULES) {
        for (const profile of module.mappers) {
            if (matchesPath(profile, metaPath) || matchesIdentity(profile, properties, mapperMeta)) {
                const game = readIdentity(profile.identity, properties, mapperMeta) ?? profile.identity.values[0];
                return { module, profile, game };
            }
        }
    }
    return null;
}
