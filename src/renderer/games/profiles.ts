import type { MapperProfile } from "../core/mapper/MapperProfile";
import { redBlueDeprecated } from "./gen1/mappers/red-blue-deprecated";
import { yellowDeprecated } from "./gen1/mappers/yellow-deprecated";

/**
 * Every mapper profile the app ships, by generation, with no app or Vue imports so the
 * parity harness can load this file under `tsx` (`tools/parity/profile-check.ts`) and
 * check a run's PokeAByte write log against the profile's `writes`.
 *
 * Hack mappers (Yellow Legacy, Yellow 2024, Crystal Legacy) are deliberately absent
 * (decision 8): loading one leaves `registry.detect` with nothing, and the game-select
 * screen says so instead of the overlay hanging (known-legacy-bugs.md #22).
 */
export const PROFILES: Readonly<Record<string, readonly MapperProfile[]>> = {
    gen1: [yellowDeprecated, redBlueDeprecated],
};

export function allProfiles(): MapperProfile[] {
    return Object.values(PROFILES).flat();
}
