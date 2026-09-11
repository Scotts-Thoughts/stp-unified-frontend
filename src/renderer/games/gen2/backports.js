/**
 * gen2's backport-ASM parser: the first half of the legacy `lib/backport_importer.js`,
 * verbatim as an ES module (tools/port/lift-gen2.py). The second half wrote the
 * shipped data files and is games/gen2/backportOverrides.ts now (decision 15).
 */
// Crystal move tutor moves (these get separated into tutor_learnset)
const TUTOR_MOVES = ['Flamethrower', 'Thunderbolt', 'Ice Beam'];

// ASM type constant -> display name
const TYPE_MAP = {
    'NORMAL': 'Normal', 'FIGHTING': 'Fighting', 'FLYING': 'Flying',
    'POISON': 'Poison', 'GROUND': 'Ground', 'ROCK': 'Rock',
    'BUG': 'Bug', 'GHOST': 'Ghost', 'STEEL': 'Steel',
    'FIRE': 'Fire', 'WATER': 'Water', 'GRASS': 'Grass',
    'ELECTRIC': 'Electric', 'PSYCHIC': 'Psychic', 'PSYCHIC_TYPE': 'Psychic',
    'ICE': 'Ice', 'DRAGON': 'Dragon', 'DARK': 'Dark',
    'FAIRY': 'Fairy', 'BIRD': 'Bird', 'CURSE_TYPE': 'Curse',
};

export function normalizeName(name) {
    return name.replace(/[\s\-']/g, '').toLowerCase();
}

export function titleCase(str) {
    return str.toLowerCase().split(/\s+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

// Build a lookup: normalized move name -> actual display name
export function buildMoveLookup(g2MoveData) {
    const lookup = {};
    for (const moveName of Object.keys(g2MoveData)) {
        lookup[normalizeName(moveName)] = moveName;
    }
    return lookup;
}

// Resolve an ASM move constant to its display name
export function resolveMoveName(constant, moveLookup, newMoveMap) {
    const c = constant.trim();
    if (newMoveMap && newMoveMap[c]) return newMoveMap[c];

    let normalized = c;
    if (normalized === 'PSYCHIC_M') normalized = 'PSYCHIC';
    normalized = normalizeName(normalized.replace(/_/g, ''));
    return moveLookup[normalized] || null;
}

// Parse backport_moves.asm
export function parseBackportMoves(content) {
    const moves = [];
    const newMoveMap = {}; // NEW_MOVE_1 -> "Icicle Crash"

    // Parse: move NEW_MOVE_1, EFFECT_FLINCH_HIT, 85, ICE, 90, 10, 30 ; icicle crash
    const moveLines = content.match(/^\s*move\s+.+$/gm) || [];
    for (const line of moveLines) {
        const m = line.match(
            /move\s+(NEW_MOVE_\d+)\s*,\s*(\w+)\s*,\s*(\d+)\s*,\s*(\w+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*\d+\s*;?\s*(.*)/i
        );
        if (!m) continue;

        const identifier = m[1].trim();
        const effect = m[2].trim();
        const power = parseInt(m[3]);
        const type = TYPE_MAP[m[4].trim().toUpperCase()] || titleCase(m[4].trim());
        const accuracy = parseInt(m[5]);
        const pp = parseInt(m[6]);
        const comment = m[7].trim();

        // Display name from comment (e.g. "icicle crash" -> "Icicle Crash")
        const displayName = comment
            ? titleCase(comment.replace(/;.*$/, '').trim())
            : identifier;

        // Description from effect (e.g. EFFECT_FLINCH_HIT -> "Effect flinch hit")
        const effectDesc = effect.replace(/^EFFECT_/, '').replace(/_/g, ' ').toLowerCase();
        const description = `Effect ${effectDesc}`;

        moves.push({ identifier, displayName, type, power, accuracy, pp, description });
        newMoveMap[identifier] = displayName;
    }

    // Fallback: parse names from backport_move_names if comments weren't available
    const nameLines = content.match(/^\s*li\s+"[^"]+"/gm) || [];
    let idx = 1;
    for (const line of nameLines) {
        const m = line.match(/li\s+"([^"]+)"/);
        if (!m) continue;
        const key = `NEW_MOVE_${idx}`;
        if (!newMoveMap[key]) {
            const rawName = m[1].replace(/@/g, '').trim();
            newMoveMap[key] = titleCase(rawName);
            const moveObj = moves.find(mv => mv.identifier === key);
            if (moveObj) moveObj.displayName = titleCase(rawName);
        }
        idx++;
    }

    return { moves, newMoveMap };
}

// Parse backports.asm
export function parseBackportPokemon(content, newMoveMap, moveLookup) {
    // Name from backport_name macro: db "FROSLASS@@"
    const nameSection = content.match(/MACRO\s+backport_name[\s\S]*?db\s+"([^"]+)"/i);
    let rawName = nameSection ? nameSection[1].replace(/@/g, '').trim() : 'Backport';
    const parsedName = titleCase(rawName);

    // Base stats from def lines
    const stats = {};
    const statRegex = /def\s+backport_(\w+)\s+EQU\s+(\d+)/gi;
    let m;
    while ((m = statRegex.exec(content)) !== null) {
        stats[m[1].toLowerCase()] = parseInt(m[2]);
    }

    // Types: db ICE, GHOST; type ...
    const typeMatch = content.match(/db\s+(\w+)\s*,\s*(\w+)\s*;\s*type/i);
    const type1 = typeMatch ? (TYPE_MAP[typeMatch[1].trim().toUpperCase()] || titleCase(typeMatch[1])) : 'Normal';
    const type2 = typeMatch ? (TYPE_MAP[typeMatch[2].trim().toUpperCase()] || titleCase(typeMatch[2])) : 'Normal';

    // Single-value fields
    const catchRate = parseInt((content.match(/db\s+(\d+)\s*;\s*catch rate/i) || [, '255'])[1]);
    const baseExp = parseInt((content.match(/db\s+(\d+)\s*;\s*base exp/i) || [, '0'])[1]);

    const itemsMatch = content.match(/db\s+(\w+)\s*,\s*(\w+)\s*;\s*items/i);
    const commonItem = itemsMatch ? itemsMatch[1].trim() : 'NO_ITEM';
    const rareItem = itemsMatch ? itemsMatch[2].trim() : 'NO_ITEM';

    const genderRatio = (content.match(/db\s+(GENDER_\w+)\s*;\s*gender ratio/i) || [, 'GENDER_F50'])[1].trim();
    const eggCycles = parseInt((content.match(/db\s+(\d+)\s*;\s*step cycles to hatch/i) || [, '20'])[1]);
    const growthRate = (content.match(/db\s+(GROWTH_\w+)\s*;\s*growth rate/i) || [, 'GROWTH_MEDIUM_FAST'])[1].trim();

    const eggGroupMatch = content.match(/dn\s+(EGG_\w+)\s*,\s*(EGG_\w+)\s*;\s*egg groups/i);
    const eggGroup1 = eggGroupMatch ? eggGroupMatch[1].trim() : 'EGG_NONE';
    const eggGroup2 = eggGroupMatch ? eggGroupMatch[2].trim() : 'EGG_NONE';

    // TM/HM learnset - separate into TM/HM and tutor moves
    const tmhmMatch = content.match(/tmhm\s+([^\n]+)/i);
    const tmhmMoves = [];
    const tutorMoves = [];
    if (tmhmMatch) {
        const rawLine = tmhmMatch[1].replace(/;.*$/, ''); // strip comments
        const constants = rawLine.split(',').map(s => s.trim()).filter(Boolean);
        for (const c of constants) {
            const moveName = resolveMoveName(c, moveLookup, newMoveMap);
            if (moveName) {
                if (TUTOR_MOVES.includes(moveName)) {
                    tutorMoves.push(moveName);
                } else {
                    tmhmMoves.push(moveName);
                }
            }
        }
    }

    // Level-up learnset
    const levelupMoves = [];
    const levelupSection = content.match(/MACRO\s+backport_level_up_learnset([\s\S]*?)ENDM/i);
    if (levelupSection) {
        const lineRegex = /db\s+(\d+)\s*,\s*(\w+)/g;
        while ((m = lineRegex.exec(levelupSection[1])) !== null) {
            const level = parseInt(m[1]);
            const moveConstant = m[2].trim();
            const moveName = resolveMoveName(moveConstant, moveLookup, newMoveMap);
            if (moveName) {
                levelupMoves.push([level, moveName]);
            }
        }
    }

    return {
        parsedName,
        data: {
            base_hp: stats['hit'] || 0,
            base_atk: stats['atk'] || 0,
            base_def: stats['def'] || 0,
            base_spc_atk: stats['spa'] || 0,
            base_spc_def: stats['spd'] || 0,
            base_spd: stats['spe'] || 0,
            type_1: type1,
            type_2: type2,
            catch_rate: catchRate,
            base_xp: baseExp,
            common_item: commonItem,
            rare_item: rareItem,
            gender_ratio: genderRatio,
            egg_cycles: eggCycles,
            growth_rate: growthRate,
            egg_group_1: eggGroup1,
            egg_group_2: eggGroup2,
            tm_hm_learnset: tmhmMoves,
            tutor_learnset: tutorMoves,
            levelup_moveset: levelupMoves,
            egg_moves: []
        }
    };
}
