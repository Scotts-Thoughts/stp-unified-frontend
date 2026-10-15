import { PokemonGame, PokemonSpecies } from "~/logic/PokeDataTypes";
import { YellowDex } from "./pokedex/YellowDex";
import { RedAndBlueDex } from "./pokedex/RedAndBlueDex";

/**
 * The dex tables gen1's data layer (`logic/PokeData.ts`) can reach.
 *
 * Only the two gen1 games are imported (2026-09-25, docs/performance-followups.md, third
 * pass). This file is on the renderer's eager import graph -- `main.ts` imports gen1
 * for the pre-mapper screen -- and it used to import all ten tables, so the entry
 * chunk carried 3,561 species (8.9 MB of source) that nothing reachable read: gen1's
 * `activate()` only ever selects Yellow or Red and Blue, and gens 2-5 ship their own
 * tables inside their own lazily loaded chunks. The other eight tables were deleted
 * on 2026-10-14 (they are in git history); if a generation moves onto this data layer,
 * bring its table back with an `import()` from `PokeData.setGame`, not a static import here.
 */
export const GameDexes: Record<PokemonGame, Record<string, PokemonSpecies>> = {
    "Yellow": YellowDex,
    "Red and Blue": RedAndBlueDex,
    "Gold and Silver": {},
    "Crystal": {},
    "Ruby and Sapphire": {},
    "Emerald": {},
    "FireRed and LeafGreen": {},
    "Diamond and Pearl": {},
    "Platinum": {},
    "HeartGold and SoulSilver": {},
    "Black": {},
    "White": {},
    "Black 2": {},
    "White 2": {},
}
