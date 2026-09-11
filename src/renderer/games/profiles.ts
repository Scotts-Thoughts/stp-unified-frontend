import type { MapperProfile } from "../core/mapper/MapperProfile";
import { gen1Manifest } from "./gen1/manifest";
import { gen2Manifest } from "./gen2/manifest";
import { gen3Manifest } from "./gen3/manifest";
import { gen4Manifest } from "./gen4/manifest";
import { gen5Manifest } from "./gen5/manifest";

/**
 * Every mapper profile the app ships, by generation, with no app or Vue imports so the
 * parity harness can load this file under `tsx` (`tools/parity/profile-check.ts`) and
 * check a run's PokeAByte write log against the profile's `writes`. The manifests are
 * the source (plan 3.1); their `load()` is a dynamic import that nothing here calls.
 *
 * Hack mappers (Yellow Legacy, Yellow 2024, Crystal Legacy) are deliberately absent
 * (decision 8): loading one leaves `registry.detect` with nothing, and the game-select
 * screen says so instead of the overlay hanging (known-legacy-bugs.md #22).
 */
export const PROFILES: Readonly<Record<string, readonly MapperProfile[]>> = Object.fromEntries(
    [gen1Manifest, gen2Manifest, gen3Manifest, gen4Manifest, gen5Manifest].map((m) => [m.id, m.mappers]),
);

export function allProfiles(): MapperProfile[] {
    return Object.values(PROFILES).flat();
}
