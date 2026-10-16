/**
 * The order in which a trainer's AI sends out its Pokémon against the player's one Pokémon (a solo run), read from
 * the decompilations (2026-10-15; the full write-up with citations is docs/send-out-order.md):
 *
 * - Every generation leads with party slot 0 (the first slot with a Pokémon).
 * - Gen 1 (pokered `EnemySendOut`): the first living Pokémon in party order, so party order. Not modelled here.
 * - Gen 2 (pokecrystal `FindMonInOTPartyToSwitchIntoBattle`): `nextGen2`.
 * - Gen 3 (pokeemerald `GetMostSuitableMonToSwitchInto`): `nextGen3`.
 * - Gen 4 (pokeplatinum `BattleAI_PostKOSwitchIn`, HG/SS identical): `nextGen4`.
 * - Gen 5 (pokebw2 `PickBestMonToSwitchInto`, github.com/fuddlesworth/pokebw2): `predictGen5`.
 *
 * None of the STP ROM forks change these rules. A prediction is a chain: the lead faints, the rule picks the next
 * Pokémon with the lead as the one that fainted, and so on. It assumes a neutral field (no stat stages, screens or
 * weather, nobody statused) and no voluntary switch; those can change the real order, and voluntary switches are
 * random. Where a rule is itself random (gen 2's "every candidate is bad"), the rest stay in party order.
 *
 * Inputs are plain data; type names are as the overlays spell them ("Fire"), compared through `normalType`.
 */
import { FORESIGHT, normalType, TYPE_MATCHUPS, typeProduct } from "./typeMatchups";

export interface SendOutMove {
    name: string;
    type: string;
    /** The ROM's base power: 0 for status moves, 1 for the moves whose power the engine works out (Seismic Toss,
     * Return in gen 3...). Gen 5's data has no 1s; its rule counts anything under 10 as 60. */
    power: number;
    category: "Physical" | "Special" | "Status";
}

export interface SendOutMon {
    species: string;
    types: [string, string];
    moves: SendOutMove[];
    /** Gens 3-4: what the damage pass reads from the Pokémon that just fainted. */
    level?: number;
    attack?: number;
    specialAttack?: number;
    ability?: string | null;
    item?: string | null;
    /** Gen 4: Hidden Power's type (from the IVs), if known; otherwise Normal. */
    hiddenPowerType?: string | null;
}

export interface SendOutPlayer {
    species: string;
    types: [string, string];
    /** Gens 3-4. */
    defense?: number;
    specialDefense?: number;
    ability?: string | null;
    item?: string | null;
    /** Gen 3: the move that knocks the enemy out (`gCurrentMove`), most often the player's strongest. */
    koMove?: SendOutMove | null;
    /** Gen 3: badge stat boosts on the player's side (Emerald/RS badges 5 and 7, FRLG the same flags). */
    defenseBadge?: boolean;
    specialDefenseBadge?: boolean;
}

/** One rule: the slot sent out after `fainted` faints, given who is still to come; null when the game picks at random. */
type NextRule = (party: readonly SendOutMon[], fainted: number, left: readonly number[], player: SendOutPlayer) => number | null;

const key = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const u8 = (n: number) => n & 0xff;

function chain(party: readonly SendOutMon[], player: SendOutPlayer, next: NextRule): number[] {
    const slots = party.map((_, i) => i);
    if (!slots.length) return [];
    const order = [slots[0]];
    let left = slots.slice(1);
    while (left.length) {
        const pick = next(party, order[order.length - 1], left, player);
        if (pick === null || !left.includes(pick)) return [...order, ...left];
        order.push(pick);
        left = left.filter((s) => s !== pick);
    }
    return order;
}

// ---------------------------------------------------------------- Gen 2

/**
 * pokecrystal engine/battle/core.asm `FindMonInOTPartyToSwitchIntoBattle` / `ScoreMonTypeMatchups`: a candidate is
 * good when one of its moves' types (power ignored: Sunny Day is Fire) is super effective on the player's types, and
 * bad when the player's type 1 (or, failing that, type 2) is super effective on its species types; both cancel. The
 * lowest good slot, else the lowest not-bad slot, else random (BattleRandom).
 */
export const nextGen2: NextRule = (party, _fainted, left, player) => {
    const [p1, p2] = player.types.map(normalType);
    const score = left.map((i) => {
        const mon = party[i];
        const [t1, t2] = mon.types.map(normalType);
        let good = false;
        for (const move of mon.moves) {
            if (!move?.name) break;
            if (typeProduct(normalType(move.type), p1, p2) > 1) { good = true; break; }
        }
        let bad = false;
        if (typeProduct(p1, t1, t2) > 1 || typeProduct(p2, t1, t2) > 1) {
            if (good) good = false;
            else bad = true;
        }
        return { i, good, bad };
    });
    return score.find((s) => s.good)?.i ?? score.find((s) => !s.bad)?.i ?? null;
};

export const predictGen2 = (party: readonly SendOutMon[], player: SendOutPlayer) => chain(party, player, nextGen2);

// ---------------------------------------------------------------- Gen 3

const GEN3_PHYSICAL = new Set(["Normal", "Fighting", "Flying", "Poison", "Ground", "Rock", "Bug", "Ghost", "Steel"]);

/** pokeemerald `sHoldEffectToType` (param 10 for each, Sea Incense 5). */
const GEN3_TYPE_ITEMS: Record<string, [string, number]> = {
    silverpowder: ["Bug", 10], metalcoat: ["Steel", 10], softsand: ["Ground", 10], hardstone: ["Rock", 10],
    miracleseed: ["Grass", 10], blackglasses: ["Dark", 10], blackbelt: ["Fighting", 10], magnet: ["Electric", 10],
    mysticwater: ["Water", 10], sharpbeak: ["Flying", 10], poisonbarb: ["Poison", 10], nevermeltice: ["Ice", 10],
    spelltag: ["Ghost", 10], twistedspoon: ["Psychic", 10], charcoal: ["Fire", 10], dragonfang: ["Dragon", 10],
    silkscarf: ["Normal", 10], seaincense: ["Water", 5],
};

/** ModulateDmgByType2 over the chart, in table order (pokeemerald `TypeCalc`); returns the damage and the SE flag. */
function gen3TypeCalc(damage: number, moveType: string, power: number, player: SendOutPlayer): { damage: number; superEffective: boolean; immune: boolean } {
    const [d1, d2] = player.types.map(normalType);
    let se = false, nve = false, noEffect = false;
    if (key(player.ability) === "levitate" && moveType === "Ground") return { damage, superEffective: false, immune: true };
    const apply = (m: number) => {
        damage = Math.floor(damage * m / 10);
        if (damage === 0 && m !== 0) damage = 1;
        if (m === 0) { noEffect = true; se = false; nve = false; }
        else if (m === 5 && power && !noEffect) { if (se) se = false; else nve = true; }
        else if (m === 20 && power && !noEffect) { if (nve) nve = false; else se = true; }
    };
    for (const [a, d, m] of TYPE_MATCHUPS) {
        if (a === FORESIGHT) continue;
        if (a !== moveType) continue;
        if (d === d1) apply(m);
        if (d === d2 && d1 !== d2) apply(m);
    }
    return { damage, superEffective: se, immune: noEffect };
}

/**
 * pokeemerald src/pokemon.c `CalculateBaseDamage`, the fainted enemy attacking the player with `move`, as
 * `AI_CalcDmg` calls it here: no crit, no random roll, stat stages neutral (`FaintClearSetData` reset the attacker's),
 * no status, no weather or screens. Its HP is 0, so Overgrow/Blaze/Torrent/Swarm apply. Returns damage + 2.
 */
export function gen3BaseDamage(attacker: SendOutMon, player: SendOutPlayer, move: SendOutMove | null | undefined): number {
    const power0 = move?.power ?? 0;
    const type = normalType(move?.type ?? "Normal");
    let power = power0;
    let attack = attacker.attack ?? 0, spAttack = attacker.specialAttack ?? 0;
    let defense = player.defense ?? 1, spDefense = player.specialDefense ?? 1;
    const atkAbility = key(attacker.ability), defAbility = key(player.ability);
    const atkItem = key(attacker.item), defItem = key(player.item);
    const atkSpecies = key(attacker.species), defSpecies = key(player.species);
    if (atkAbility === "hugepower" || atkAbility === "purepower") attack *= 2;
    if (player.defenseBadge) defense = Math.floor(110 * defense / 100);
    if (player.specialDefenseBadge) spDefense = Math.floor(110 * spDefense / 100);
    const typeItem = GEN3_TYPE_ITEMS[atkItem];
    if (typeItem && typeItem[0] === type) {
        if (GEN3_PHYSICAL.has(type)) attack = Math.floor(attack * (typeItem[1] + 100) / 100);
        else spAttack = Math.floor(spAttack * (typeItem[1] + 100) / 100);
    }
    if (atkItem === "choiceband") attack = Math.floor(150 * attack / 100);
    if (atkItem === "souldew" && (atkSpecies === "latias" || atkSpecies === "latios")) spAttack = Math.floor(150 * spAttack / 100);
    if (defItem === "souldew" && (defSpecies === "latias" || defSpecies === "latios")) spDefense = Math.floor(150 * spDefense / 100);
    if (atkItem === "deepseatooth" && atkSpecies === "clamperl") spAttack *= 2;
    if (defItem === "deepseascale" && defSpecies === "clamperl") spDefense *= 2;
    if (atkItem === "lightball" && atkSpecies === "pikachu") spAttack *= 2;
    if (defItem === "metalpowder" && defSpecies === "ditto") defense *= 2;
    if (atkItem === "thickclub" && (atkSpecies === "cubone" || atkSpecies === "marowak")) attack *= 2;
    if (defAbility === "thickfat" && (type === "Fire" || type === "Ice")) spAttack = Math.floor(spAttack / 2);
    if (atkAbility === "hustle") attack = Math.floor(150 * attack / 100);
    // hp 0 <= maxHP / 3: the pinch abilities always apply to a fainted attacker.
    if ((type === "Grass" && atkAbility === "overgrow") || (type === "Fire" && atkAbility === "blaze")
        || (type === "Water" && atkAbility === "torrent") || (type === "Bug" && atkAbility === "swarm")) {
        power = Math.floor(150 * power / 100);
    }
    if (key(move?.name) === "explosion" || key(move?.name) === "selfdestruct") defense = Math.floor(defense / 2);
    const levelFactor = Math.floor(2 * (attacker.level ?? 1) / 5) + 2;
    let damage = 0;
    if (GEN3_PHYSICAL.has(type)) {
        damage = Math.floor(Math.floor(attack * power * levelFactor / Math.max(1, defense)) / 50);
        if (damage === 0) damage = 1;
    }
    if (type === "???" || type === "Mystery") damage = 0;
    if (!GEN3_PHYSICAL.has(type) && type !== "???" && type !== "Mystery") {
        damage = Math.floor(Math.floor(spAttack * power * levelFactor / Math.max(1, spDefense)) / 50);
    }
    return damage + 2;
}

/**
 * pokeemerald src/battle_ai_switch_items.c `GetMostSuitableMonToSwitchInto` (Ruby and FR/LG the same here).
 * Pass 1: candidates by how hard the PLAYER's types hit their species types (most first, a game quirk the source
 * flags), the first with a super-effective damaging move. Pass 2: the (candidate, move) with the most damage, where
 * the damage is `gCurrentMove`'s from the fainted Pokémon, times STAB on the fainted Pokémon's types and the candidate
 * move's type chart, kept in a byte (`u8 bestDmg`).
 */
export const nextGen3: NextRule = (party, fainted, left, player) => {
    const [p1, p2] = player.types.map(normalType);
    const invalid = new Set<number>();
    for (;;) {
        let best = 0, bestMon: number | null = null;
        for (const i of left) {
            if (invalid.has(i)) continue;
            const [t1, t2] = party[i].types.map(normalType);
            let t = 10;
            for (const atk of [p1, p2]) {
                for (const [a, d, m] of TYPE_MATCHUPS) {
                    if (a === FORESIGHT || a !== atk) continue;
                    if (d === t1) t = u8(Math.floor(t * m / 10));
                    if (d === t2 && t1 !== t2) t = u8(Math.floor(t * m / 10));
                }
            }
            if (best < t) { best = t; bestMon = i; }
        }
        if (bestMon === null) break;
        const hasSE = party[bestMon].moves.some((move) => move?.name && gen3TypeCalc(0, normalType(move.type), move.power, player).superEffective);
        if (hasSE) return bestMon;
        invalid.add(bestMon);
    }
    const attacker = party[fainted];
    const base = gen3BaseDamage(attacker, player, player.koMove);
    const attackerTypes = attacker.types.map(normalType);
    let bestDmg = 0, bestMon: number | null = null;
    for (const i of left) {
        for (let j = 0; j < 4; j++) {
            const move = party[i].moves[j];
            let damage = 0;
            if (move?.name && move.power !== 1) {
                const type = normalType(move.type);
                damage = base;
                if (attackerTypes.includes(type)) damage = Math.floor(damage * 15 / 10);
                damage = gen3TypeCalc(damage, type, move.power, player).damage;
            }
            if (bestDmg < damage) { bestDmg = u8(damage); bestMon = i; }
        }
    }
    return bestMon ?? left[0];
};

export const predictGen3 = (party: readonly SendOutMon[], player: SendOutPlayer) => chain(party, player, nextGen3);

// ---------------------------------------------------------------- Gen 4

/** pokeplatinum `sTypeBoostingItems`: the type items and plates (param 20 in gen 4). */
const GEN4_TYPE_ITEMS: Record<string, string> = {
    silverpowder: "Bug", metalcoat: "Steel", softsand: "Ground", hardstone: "Rock", miracleseed: "Grass",
    blackglasses: "Dark", blackbelt: "Fighting", magnet: "Electric", mysticwater: "Water", sharpbeak: "Flying",
    poisonbarb: "Poison", nevermeltice: "Ice", spelltag: "Ghost", twistedspoon: "Psychic", charcoal: "Fire",
    dragonfang: "Dragon", silkscarf: "Normal", seaincense: "Water", waveincense: "Water", roseincense: "Grass",
    oddincense: "Psychic", rockincense: "Rock",
    flameplate: "Fire", splashplate: "Water", zapplate: "Electric", meadowplate: "Grass", icicleplate: "Ice",
    fistplate: "Fighting", toxicplate: "Poison", earthplate: "Ground", skyplate: "Flying", mindplate: "Psychic",
    insectplate: "Bug", stoneplate: "Rock", spookyplate: "Ghost", dracoplate: "Dragon", dreadplate: "Dark",
    ironplate: "Steel",
};
const GEN4_PUNCHES = new Set(["icepunch", "firepunch", "thunderpunch", "machpunch", "focuspunch", "dizzypunch",
    "dynamicpunch", "hammerarm", "megapunch", "cometpunch", "meteormash", "shadowpunch", "drainpunch", "bulletpunch",
    "skyuppercut"]);

/** `Move_CalcVariableType`: Hidden Power from the IVs, Judgment from the plate; everything else is the move's own
 * type here (Natural Gift's berry type is not modelled; Weather Ball has no weather in a neutral field). */
function gen4MoveType(mon: SendOutMon, move: SendOutMove): string {
    if (key(move.name) === "hiddenpower" && mon.hiddenPowerType) return normalType(mon.hiddenPowerType);
    if (key(move.name) === "judgment") return key(mon.item).endsWith("plate") ? GEN4_TYPE_ITEMS[key(mon.item)] ?? "Normal" : "Normal";
    return normalType(move.type);
}

/** `BattleSystem_TypeMatchupMultiplier`: 40, times each chart entry against the two types (the second once). */
export function gen4TypeMatchupMultiplier(attack: string, defend1: string, defend2: string): number {
    let mul = 40;
    for (const [a, d, m] of TYPE_MATCHUPS) {
        if (a !== attack) continue;
        if (d === defend1) mul = Math.floor(mul * m / 10);
        if (d === defend2 && defend1 !== defend2) mul = Math.floor(mul * m / 10);
    }
    return mul;
}

/** `BattleSystem_CalcEffectiveness`: does this move come out super effective on the player (status moves too)? */
function gen4SuperEffective(mon: SendOutMon, move: SendOutMove, player: SendOutPlayer): boolean {
    const ability = key(mon.ability);
    const type = ability === "normalize" ? "Normal" : gen4MoveType(mon, move);
    const [d1, d2] = player.types.map(normalType);
    if (ability !== "moldbreaker" && key(player.ability) === "levitate" && type === "Ground" && key(player.item) !== "ironball") return false;
    let se = false, nve = false;
    for (const [a, d, m] of TYPE_MATCHUPS) {
        if (a === FORESIGHT) { if (ability === "scrappy") break; continue; }
        if (a !== type) continue;
        // UpateMoveStatusForTypeMul (no power check: status moves count)
        const update = () => {
            if (m === 0) { se = false; nve = false; }
            else if (m === 5) { if (se) se = false; else nve = true; }
            else if (nve) nve = false;
            else se = true;
        };
        if (d === d1) update();
        if (d === d2 && d1 !== d2) update();
    }
    return se;
}

const divide = (dividend: number, divisor: number) => {
    if (dividend === 0) return 0;
    const q = Math.trunc(dividend / divisor);
    return q === 0 ? Math.sign(dividend) : q;
};

/**
 * pokeplatinum `BattleSystem_CalcMoveDamage` then `BattleSystem_ApplyTypeChart`, as `BattleAI_PostKOSwitchIn` calls
 * them: the FAINTED enemy attacks the player with a candidate's move, crit multiplier 1, power multiplier 10, no
 * random roll, neutral stages (the fainted battler's were reset), no status, weather or screens. Its HP is 0, so the
 * pinch abilities apply and Slow Start always halves. Returns the damage and whether the player is immune.
 * The caller keeps the byte (`u8 score`) after each step.
 */
export function gen4AiDamage(attacker: SendOutMon, player: SendOutPlayer, move: SendOutMove): { damage: number; immune: boolean } {
    const atkAbility = key(attacker.ability), defAbility = key(player.ability);
    const moldBreaker = atkAbility === "moldbreaker";
    const defHas = (ability: string) => !moldBreaker && defAbility === ability;
    const atkItem = key(attacker.item), defItem = key(player.item);
    const atkSpecies = key(attacker.species), defSpecies = key(player.species);
    const moveType = atkAbility === "normalize" ? "Normal" : normalType(move.type);
    const moveKey = key(move.name);
    let power = move.power;
    let attack = attacker.attack ?? 0, spAttack = attacker.specialAttack ?? 0;
    let defense = player.defense ?? 1, spDefense = player.specialDefense ?? 1;
    if (atkAbility === "technician" && moveKey !== "struggle" && power <= 60) power = Math.floor(power * 15 / 10);
    if (atkAbility === "hugepower" || atkAbility === "purepower") attack *= 2;
    if (atkAbility === "slowstart") attack = Math.floor(attack / 2);
    if (GEN4_TYPE_ITEMS[atkItem] === moveType) power = Math.floor(power * 120 / 100);
    if (atkItem === "choiceband") attack = Math.floor(attack * 150 / 100);
    if (atkItem === "choicespecs") spAttack = Math.floor(spAttack * 150 / 100);
    if (atkItem === "souldew" && (atkSpecies === "latios" || atkSpecies === "latias")) spAttack = Math.floor(spAttack * 150 / 100);
    if (defItem === "souldew" && (defSpecies === "latios" || defSpecies === "latias")) spDefense = Math.floor(spDefense * 150 / 100);
    if (atkItem === "deepseatooth" && atkSpecies === "clamperl") spAttack *= 2;
    if (defItem === "deepseascale" && defSpecies === "clamperl") spDefense *= 2;
    if (atkItem === "lightball" && atkSpecies === "pikachu") power *= 2;
    if (defItem === "metalpowder" && defSpecies === "ditto") defense *= 2;
    if (atkItem === "thickclub" && (atkSpecies === "cubone" || atkSpecies === "marowak")) attack *= 2;
    if ((atkItem === "adamantorb" && atkSpecies === "dialga" && (moveType === "Dragon" || moveType === "Steel"))
        || (atkItem === "lustrousorb" && atkSpecies === "palkia" && (moveType === "Dragon" || moveType === "Water"))
        || (atkItem === "griseousorb" && atkSpecies === "giratina" && (moveType === "Dragon" || moveType === "Ghost"))) {
        power = Math.floor(power * 120 / 100);
    }
    if (atkItem === "muscleband" && move.category === "Physical") power = Math.floor(power * 110 / 100);
    if (atkItem === "wiseglasses" && move.category === "Special") power = Math.floor(power * 110 / 100);
    if (defHas("thickfat") && (moveType === "Fire" || moveType === "Ice")) power = Math.floor(power / 2);
    if (atkAbility === "hustle") attack = Math.floor(attack * 150 / 100);
    if ((moveType === "Grass" && atkAbility === "overgrow") || (moveType === "Fire" && atkAbility === "blaze")
        || (moveType === "Water" && atkAbility === "torrent") || (moveType === "Bug" && atkAbility === "swarm")) {
        power = Math.floor(power * 150 / 100);
    }
    if (moveType === "Fire" && defHas("heatproof")) power = Math.floor(power / 2);
    if (moveType === "Fire" && defHas("dryskin")) power = Math.floor(power * 125 / 100);
    if (atkAbility === "ironfist" && GEN4_PUNCHES.has(moveKey)) power = Math.floor(power * 12 / 10);
    if (moveKey === "explosion" || moveKey === "selfdestruct") defense = Math.floor(defense / 2);
    // u16 movePower
    power &= 0xffff;
    const levelFactor = Math.floor((attacker.level ?? 1) * 2 / 5) + 2;
    let damage = 0;
    if (move.category === "Physical") damage = Math.floor(Math.floor(attack * power * levelFactor / Math.max(1, defense)) / 50);
    else if (move.category === "Special") damage = Math.floor(Math.floor(spAttack * power * levelFactor / Math.max(1, spDefense)) / 50);
    damage = u8(damage + 2);

    // ApplyTypeChart
    if (moveKey === "struggle") return { damage, immune: false };
    const type = atkAbility === "normalize" ? "Normal" : gen4MoveType(attacker, move);
    if (attacker.types.map(normalType).includes(type)) damage = atkAbility === "adaptability" ? damage * 2 : Math.floor(damage * 15 / 10);
    const [d1, d2] = player.types.map(normalType);
    let se = false, nve = false, immune = false;
    if (defHas("levitate") && type === "Ground" && defItem !== "ironball") {
        immune = true;
    } else {
        for (const [a, d, m] of TYPE_MATCHUPS) {
            if (a === FORESIGHT) { if (atkAbility === "scrappy") break; continue; }
            if (a !== type) continue;
            const ironBallGround = defItem === "ironball" && d === "Flying" && m === 0;
            const apply = () => {
                if (damage) damage = divide(damage * m, 10);
                if (m === 0) { immune = true; se = false; nve = false; }
                else if (m === 5 && move.power) { if (se) se = false; else nve = true; }
                else if (m === 20 && move.power) { if (nve) nve = false; else se = true; }
            };
            if (d === d1 && !ironBallGround) apply();
            if (d === d2 && d1 !== d2 && !ironBallGround) apply();
        }
    }
    if (defHas("wonderguard") && (!se || (se && nve)) && move.power) {
        immune = true;
    } else {
        if (se && move.power) {
            if (defHas("filter") || defHas("solidrock")) damage = divide(damage * 3, 4);
            if (atkItem === "expertbelt") damage = Math.floor(damage * 120 / 100);
        }
        if (nve && move.power && atkAbility === "tintedlens") damage *= 2;
    }
    return { damage, immune };
}

/**
 * pokeplatinum src/battle/battle_lib.c `BattleAI_PostKOSwitchIn` (HG/SS `ov12_02258800` is the same code).
 * Stage 1: candidates by their own species types attacking the player's types (`TypeMatchupMultiplier`, summed in a
 * byte), best first, the first with a super-effective move (status moves count). Stage 2: the (candidate, move) with
 * the most damage from the fainted Pokémon's stats, kept in a byte. The score variable is not reset between moves or
 * between the stages (a skipped move compares the previous value again): reproduced on purpose.
 */
export const nextGen4: NextRule = (party, fainted, left, player) => {
    const [p1, p2] = player.types.map(normalType);
    const disregarded = new Set<number>();
    let score = 0;
    for (;;) {
        let maxScore = 0, picked: number | null = null;
        for (const i of left) {
            if (disregarded.has(i)) continue;
            const [t1, t2] = party[i].types.map(normalType);
            score = u8(gen4TypeMatchupMultiplier(t1, p1, p2) + gen4TypeMatchupMultiplier(t2, p1, p2));
            if (maxScore < score) { maxScore = score; picked = i; }
        }
        if (picked === null) break;
        const mon = party[picked];
        if (mon.moves.some((move) => move?.name && gen4SuperEffective(mon, move, player))) return picked;
        disregarded.add(picked);
    }
    const attacker = party[fainted];
    let maxScore = 0, picked: number | null = null;
    for (const i of left) {
        for (let j = 0; j < 4; j++) {
            const move = party[i].moves[j];
            if (move?.name && move.power !== 1) {
                const result = gen4AiDamage(attacker, player, move);
                score = result.immune ? 0 : u8(result.damage);
            }
            if (maxScore < score) { maxScore = score; picked = i; }
        }
    }
    return picked ?? left[0];
};

export const predictGen4 = (party: readonly SendOutMon[], player: SendOutPlayer) => chain(party, player, nextGen4);

// ---------------------------------------------------------------- Gen 5

/**
 * pokebw2 src/ov167/btl_client.c `PickBestMonToSwitchInto`: each candidate's best damaging move, base power (under 10
 * counts as 60) times the type chart against the player (integer halving), no STAB, stats or abilities. The battle
 * keeps its own party order: candidates are positions 1 on, sorted by `if (p[i] < p[j]) swap` for every i < j (not a
 * stable sort), and a switch-in swaps position 0 with the newcomer's position. Black/White 1 are assumed the same.
 */
export function predictGen5(party: readonly SendOutMon[], player: SendOutPlayer): number[] {
    if (!party.length) return [];
    const [p1, p2] = player.types.map(normalType);
    const scoreOf = (mon: SendOutMon) => {
        let best = 0;
        for (const move of mon.moves) {
            if (!move?.name || move.category === "Status") continue;
            let power = move.power < 10 ? 60 : move.power;
            const product = typeProduct(normalType(move.type), p1, p2);
            if (product === 4) power *= 4;
            else if (product === 2) power *= 2;
            else if (product === 0.5) power = Math.floor(power / 2);
            else if (product === 0.25) power = Math.floor(power / 4);
            else if (product === 0) power = 0;
            if (best < power) best = power;
        }
        return best;
    };
    // positions[p] = party slot at battle position p
    const positions = party.map((_, i) => i);
    const fainted = new Set<number>();
    const order = [positions[0]];
    while (order.length < party.length) {
        fainted.add(positions[0]);
        const list: number[] = [];
        for (let p = 1; p < positions.length; p++) if (!fainted.has(positions[p])) list.push(p);
        if (!list.length) break;
        const power = list.map((p) => scoreOf(party[positions[p]]));
        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                if (power[i] < power[j]) {
                    [power[i], power[j]] = [power[j], power[i]];
                    [list[i], list[j]] = [list[j], list[i]];
                }
            }
        }
        const p = list[0];
        [positions[0], positions[p]] = [positions[p], positions[0]];
        order.push(positions[0]);
    }
    return order;
}

// ---------------------------------------------------------------- Shared helpers

/** A move's base power as the data spells it ("-", null, "45") as a number; status and missing are 0. */
export function movePowerOf(power: unknown): number {
    const n = Number(power);
    return Number.isFinite(n) ? n : 0;
}

/** The category as the rules need it; gen 3 has none in some tables, so it comes from the type (physical types). */
export function moveCategoryOf(category: unknown, type: unknown, power: number): SendOutMove["category"] {
    const c = key(category);
    if (c === "physical") return "Physical";
    if (c === "special") return "Special";
    if (c === "status") return "Status";
    if (!power) return "Status";
    return GEN3_PHYSICAL.has(normalType(type)) ? "Physical" : "Special";
}

/** The player's strongest damaging move: the stand-in for gen 3's `gCurrentMove` (the move that made the KO). */
export function strongestMove(moves: readonly (SendOutMove | null | undefined)[]): SendOutMove | null {
    let best: SendOutMove | null = null;
    for (const move of moves) {
        if (!move?.name || move.category === "Status" || move.power <= 1) continue;
        if (!best || move.power > best.power) best = move;
    }
    return best;
}

/**
 * Freezes an order for the length of one battle (Scott, 2026-10-15: the rows never move once the panel is up). The
 * order is worked out the first time a team is seen against a player Pokémon, and kept while both stay the same; a
 * new team or player Pokémon works it out again. It is kept as the Pokémon themselves, not their slot numbers, so a
 * mapper whose party list changes order in battle still finds each one.
 */
export class SendOutOrderCache {
    private key: string | null = null;
    private frozen: string[] = [];
    get(party: readonly SendOutMon[], player: string, compute: () => number[]): number[] {
        const ids = party.map((mon) => JSON.stringify(mon));
        const key = JSON.stringify([[...ids].sort(), player]);
        if (key !== this.key) {
            this.key = key;
            this.frozen = compute().map((slot) => ids[slot]);
        }
        const used = new Set<number>();
        const order: number[] = [];
        for (const id of this.frozen) {
            const slot = ids.findIndex((x, i) => x === id && !used.has(i));
            if (slot < 0) continue;
            used.add(slot);
            order.push(slot);
        }
        return order;
    }
}

/**
 * Puts the view's slots in `order` (party slots) and gives each its `row` (where it is drawn). Slots not in the order
 * (empty slots, Pokémon the rule never reached) follow in party order, so nothing is lost.
 */
export function orderSlots<S extends { slot: number; row?: number }>(slots: readonly S[], order: readonly number[] | null): S[] {
    const sorted = !order?.length ? [...slots]
        : [...order.map((s) => slots.find((x) => x.slot === s)).filter((x): x is S => !!x), ...slots.filter((x) => !order.includes(x.slot))];
    return sorted.map((slot, row) => ({ ...slot, row }));
}
