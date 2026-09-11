import type { Edition, GameModule } from "./GameModule";
import type { MapperProfile } from "../mapper/MapperProfile";

/**
 * What the shell knows about a generation *before* loading it (plan 3.1): enough to
 * detect its mappers, draw its editions on the box-art grid and store the edition the
 * user picked -- and a `load()` that brings in the rest, which for a lifted generation
 * is a ten-thousand-line component and its data tables. gen1 is loaded eagerly (it
 * styles the pre-mapper screen); the others load on detection, so the renderer bundle
 * carries one generation and Vite splits the other four into their own chunks.
 */
export interface ModuleManifest {
    id: GameModule["id"];
    generation: GameModule["generation"];
    /** The mapper profiles this generation ships (`docs/mapper-matrix.md`). */
    mappers: MapperProfile[];
    /** The mapper game-name strings the module accepts: the data keys. */
    games: string[];
    editions: Edition[];
    /**
     * The user-state key the generation reads its edition from -- the legacy apps' own
     * names (`game_selection`, `gameSelection`, `selected_game`), kept because the
     * lifted components read them (plan 3.1: the edition is a user setting, distinct
     * from the detected game). gen1's edition lives in its overlay settings store instead.
     */
    editionKey?: string;
    load(): Promise<GameModule>;
}

/** The manifest's fields a `GameModule` repeats, so a module spreads them instead of restating them. */
export function moduleBase(manifest: ModuleManifest): Pick<GameModule, "id" | "generation" | "mappers" | "games" | "editions"> {
    const { id, generation, mappers, games, editions } = manifest;
    return { id, generation, mappers, games, editions };
}
