/**
 * Where gen2's imported backports live (decision 15, known-legacy-bugs.md #26).
 *
 * The legacy importer appended each parsed move and species to the *shipped* data
 * files with `require("fs")` -- `g2MoveData.js`, `gen2moves.js`, `pokemon_crystal.js`,
 * `backport_move_map.js` -- so the import survived a restart by having rewritten the
 * app. Here the shipped tables stay read-only and the same entries go to
 * `%APPDATA%/stp-overlay/data/gen2/backports.json`; gen2's `prepare()` folds them into
 * the in-memory tables before the overlay mounts, which is the state the rewritten
 * files used to load into. The import itself (`importBackports` in Overlay.vue, the
 * legacy method with the file writes swapped for `recordBackport`) updates the running
 * tables exactly as it did.
 */

export interface BackportMove {
    identifier: string;
    displayName: string;
    type: string;
    power: number;
    accuracy: number;
    pp: number;
    description: string;
}

export interface BackportOverrides {
    /** displayName -> the g2MoveData entry (`{ Move, Type, Power, Accuracy, PP, Description }`). */
    moves: Record<string, Record<string, unknown>>;
    /** species name -> the dexDataCrystal entry (`{ name, base_hp, ... }`). */
    pokemon: Record<string, Record<string, unknown>>;
    /** species name -> `{ BACKPORT_MOVE_1..3: displayName | null }`. */
    moveMap: Record<string, Record<string, string | null>>;
}

export interface BackportTables {
    g2MoveData: Record<string, unknown>;
    gen2moves: Record<string, unknown>[];
    dexDataCrystal: Record<string, unknown>;
    backportMoveMap: Record<string, Record<string, string | null>>;
}

const FILE = "gen2/backports.json";

const empty = (): BackportOverrides => ({ moves: {}, pokemon: {}, moveMap: {} });

export async function loadBackportOverrides(): Promise<BackportOverrides> {
    try {
        const raw = await window.api.data.read(FILE);
        if (!raw) return empty();
        const parsed = JSON.parse(raw) as Partial<BackportOverrides>;
        return { moves: parsed.moves ?? {}, pokemon: parsed.pokemon ?? {}, moveMap: parsed.moveMap ?? {} };
    } catch (err) {
        console.warn(`[backports] could not read data/${FILE}:`, err);
        return empty();
    }
}

/**
 * Adds the overrides to the tables the way the legacy file appends did: a move goes
 * into `g2MoveData` and `gen2moves` when `g2MoveData` lacks it, a species into
 * `dexDataCrystal` when absent, a move map when absent. Nothing shipped is replaced.
 */
export function applyBackportOverrides(overrides: BackportOverrides, tables: BackportTables): void {
    for (const [name, entry] of Object.entries(overrides.moves)) {
        if (tables.g2MoveData[name]) continue;
        tables.g2MoveData[name] = { ...entry };
        tables.gen2moves.push({ ...entry });
    }
    for (const [name, entry] of Object.entries(overrides.pokemon)) {
        if (tables.dexDataCrystal[name]) continue;
        tables.dexDataCrystal[name] = { name, ...entry };
    }
    for (const [name, mapping] of Object.entries(overrides.moveMap)) {
        if (tables.backportMoveMap[name]) continue;
        tables.backportMoveMap[name] = { ...mapping };
    }
}

/**
 * Persists one import: the moves not yet in `g2MoveData`, the species if
 * `dexDataCrystal` lacks it, the move map if `backportMoveMap` lacks it -- the same
 * conditions the legacy appenders checked against the files -- and reports what was
 * new, for the status message. The caller (the legacy method body) updates the
 * running tables itself.
 */
export async function recordBackport(
    pokemonName: string,
    moves: BackportMove[],
    newMoveMap: Record<string, string>,
    data: Record<string, unknown>,
    tables: BackportTables,
): Promise<{ movesAdded: number; pokemonAdded: boolean; moveMapAdded: boolean }> {
    const overrides = await loadBackportOverrides();
    let movesAdded = 0;
    for (const move of moves) {
        if (tables.g2MoveData[move.displayName] || overrides.moves[move.displayName]) continue;
        overrides.moves[move.displayName] = {
            Move: move.displayName,
            Type: move.type,
            Power: move.power,
            Accuracy: move.accuracy,
            PP: move.pp,
            Description: move.description,
        };
        movesAdded++;
    }
    const pokemonAdded = !tables.dexDataCrystal[pokemonName] && !overrides.pokemon[pokemonName];
    if (pokemonAdded) overrides.pokemon[pokemonName] = { ...data };
    const moveMapAdded = !tables.backportMoveMap[pokemonName] && !overrides.moveMap[pokemonName];
    if (moveMapAdded) {
        const mapping: Record<string, string | null> = {};
        for (let i = 1; i <= 3; i++) mapping[`BACKPORT_MOVE_${i}`] = newMoveMap[`NEW_MOVE_${i}`] || null;
        overrides.moveMap[pokemonName] = mapping;
    }
    if (movesAdded || pokemonAdded || moveMapAdded) {
        await window.api.data.write(FILE, JSON.stringify(overrides, null, 2) + "\n");
    }
    return { movesAdded, pokemonAdded, moveMapAdded };
}
