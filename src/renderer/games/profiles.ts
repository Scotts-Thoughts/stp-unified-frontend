import type { MapperProfile } from "../core/mapper/MapperProfile";
import { redBlueDeprecated } from "./gen1/mappers/red-blue-deprecated";
import { yellowDeprecated } from "./gen1/mappers/yellow-deprecated";
import { crystalDeprecated } from "./gen2/mappers/crystal-deprecated";
import { goldSilverDeprecated } from "./gen2/mappers/gold-silver-deprecated";
import { emeraldNe } from "./gen3/mappers/emerald-ne";
import { fireRedLeafGreenNe } from "./gen3/mappers/firered-leafgreen-ne";
import { diamondPearlStandard } from "./gen4/mappers/diamond-pearl";
import { heartGoldSoulSilverStandard } from "./gen4/mappers/heartgold-soulsilver";
import { platinumStandard } from "./gen4/mappers/platinum";
import { black2Standard } from "./gen5/mappers/black-2";
import { blackStandard } from "./gen5/mappers/black";
import { white2Standard } from "./gen5/mappers/white-2";
import { whiteStandard } from "./gen5/mappers/white";

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
    gen2: [crystalDeprecated, goldSilverDeprecated],
    gen3: [emeraldNe, fireRedLeafGreenNe],
    gen4: [platinumStandard, diamondPearlStandard, heartGoldSoulSilverStandard],
    gen5: [blackStandard, whiteStandard, black2Standard, white2Standard],
};

export function allProfiles(): MapperProfile[] {
    return Object.values(PROFILES).flat();
}
