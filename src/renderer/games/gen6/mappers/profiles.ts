import { identityReads, identityWrites, type MapperProfile } from "../../../core/mapper/MapperProfile";
import { THREE_DS_READS, THREE_DS_WRITES } from "./standard-paths";

/**
 * The four 3DS mapper profiles: `STANDARD/gen6/pokemon_x_y.xml`, `pokemon_omega_ruby_alpha_sapphire.xml` and
 * `STANDARD/gen7/pokemon_sun_moon.xml`, `pokemon_ultra_sun_moon.xml` (docs/mapper-matrix.md). Identity profiles:
 * every canonical key is the mapper path. A pair of versions shares one mapper, so the game is the pair.
 *
 * Plain data with no Vue or app imports (ARCHITECTURE §10): the harness loads it under `tsx`.
 */
function profile(id: string, file: string, game: string): MapperProfile {
    return {
        id,
        pathPatterns: [new RegExp(`^STANDARD/gen[67]/${file}\\.xml$`)],
        identity: { source: "property", path: "meta.game_name", values: [game] },
        reads: identityReads(THREE_DS_READS),
        writes: identityWrites(THREE_DS_WRITES),
    };
}

export const xyStandard = profile("gen6/x-y", "pokemon_x_y", "X and Y");
export const orasStandard = profile("gen6/omega-ruby-alpha-sapphire", "pokemon_omega_ruby_alpha_sapphire", "Omega Ruby and Alpha Sapphire");
export const sunMoonStandard = profile("gen7/sun-moon", "pokemon_sun_moon", "Sun and Moon");
export const ultraSunMoonStandard = profile("gen7/ultra-sun-ultra-moon", "pokemon_ultra_sun_moon", "Ultra Sun and Ultra Moon");
