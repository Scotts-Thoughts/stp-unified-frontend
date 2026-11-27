/**
 * The overlay's side of the shared damage engine (`@stp/damage-calc`, the git submodule in damage-calc/).
 * Every number comes from the engine; this file only turns what a generation read from the mapper into the
 * engine's `BattlerState` / `Field`, and the engine's result into the short texts the move list and the enemy
 * panel show. Pure: no Vue, no mapper, so `tools/parity/damage-selftest.ts` runs it under tsx.
 *
 * Each generation gathers its own inputs (`games/genN/damage.ts`), because the mapper paths differ, and the
 * traps differ too: gens 1-2 keep in-battle stats with the stat stages, badge boosts and burn/paralysis already
 * applied, so they pass the party stats, which are raw (ARCHITECTURE §4, "Damage calculator").
 */
import {
    calcDamage, koChances, DEFAULT_FIELD, ZERO_STAGES, itemId, abilityId, BADGES_BY_GAME,
    type BattlerState, type DamageResult, type Field, type Gen, type MoveData, type BaseStats, type Status, type Weather,
    type StatStages, type MoveOptions,
} from "@stp/damage-calc";
import type { CalcStats, Gen12DVs, Gen3IVs } from "@stp/damage-calc/stats";

/** One game's compact data (`core/damage/data/<slug>.json`, built by `tools/damage/build-data.mjs`). */
export interface DamageGameData {
    gen: Gen;
    moves: Record<string, MoveData>;
    species: Record<string, { types: [string, string]; base: BaseStats; weight: number; evolves: boolean }>;
}

/** Lookup key: case, spaces and punctuation ignored, so "ThunderPunch", "Thunder Punch" and "thunder-punch" meet. */
export const looseKey = (name: string): string =>
    name.toLowerCase().replace(/♀/g, "f").replace(/♂/g, "m").replace(/[^a-z0-9]/g, "");

/** Old spellings the frontend tables keep whose loose key differs from data_objects' modern name. */
const MOVE_ALIASES: Record<string, string> = {
    faintattack: "feintattack", hijumpkick: "highjumpkick", vicegrip: "visegrip", smellingsalt: "smellingsalts",
};

const indexes = new WeakMap<DamageGameData, { moves: Map<string, MoveData>; species: Map<string, DamageGameData["species"][string]> }>();
function index(data: DamageGameData) {
    let ix = indexes.get(data);
    if (!ix) {
        ix = { moves: new Map(), species: new Map() };
        for (const [name, m] of Object.entries(data.moves)) ix.moves.set(looseKey(name), m);
        for (const [name, s] of Object.entries(data.species)) {
            const k = looseKey(name);
            if (!ix.species.has(k)) ix.species.set(k, s);
        }
        indexes.set(data, ix);
    }
    return ix;
}

export function findMove(data: DamageGameData, name: string | null | undefined): MoveData | null {
    if (!name) return null;
    const k = looseKey(name);
    const ix = index(data);
    return ix.moves.get(k) ?? ix.moves.get(MOVE_ALIASES[k] ?? "") ?? null;
}

export function findSpecies(data: DamageGameData, name: string | null | undefined) {
    if (!name) return null;
    const k = looseKey(name);
    const ix = index(data);
    return ix.species.get(k)
        // Forms: "Wormadam (Sandy Cloak)" is the data's "Wormadam (Sandy)"; "Giratina (Altered)" and "Deoxys-Attack"
        // fall back to the base name.
        ?? ix.species.get(looseKey(name.replace(/ (Cloak|Forme?|Form|Mode|Striped)\)/i, ")")))
        ?? ix.species.get(looseKey(name.replace(/[\s-]*\(.*\)$/, "").replace(/-.*$/, ""))) ?? null;
}

/** What a generation read about one battler. Stats are raw: no stages, badges, items or abilities applied. */
export interface MonInput {
    /** The player's side (badges count, friendship defaults to 255) or the enemy's. */
    isPlayer: boolean;
    species: string;
    level: number;
    stats: CalcStats;
    /** Current HP; default the max. */
    hp?: number | null;
    /** The mapper's types when it has them (Conversion, Color Change, forms); default the Pokédex's. */
    types?: [string | null | undefined, string | null | undefined] | null;
    stages?: Partial<StatStages> | null;
    item?: string | null;
    ability?: string | null;
    /** The mapper's status text in any spelling ("Burned", "PAR", "Badly Poisoned", ...). */
    status?: string | null;
    gender?: "M" | "F" | "N";
    dvs?: Gen12DVs;
    ivs?: Gen3IVs;
    friendship?: number | null;
    /** Owned badge ids (the engine's ids, `badges.ts`); player only. */
    badges?: readonly string[];
    /** Reflect / Light Screen up on this battler's side (gen 1: on this battler). */
    reflect?: boolean;
    lightScreen?: boolean;
}

export interface FieldInput {
    /** The edition's data key (`Edition.game`): "Red and Blue", "Crystal", "Platinum", "Black 2", ... */
    game: string;
    gen: Gen;
    /** The mapper's weather text in any spelling ("Rain", "Harsh Sunlight", "Sandstorm", "hail", ...). */
    weather?: string | null;
}

/**
 * The engine's badge ids from the badges owned, in the game's order (gens 1-3 boost stats by badge; gen 2's list is
 * Johto's eight then Kanto's eight). `owned[i]` true for the i-th badge.
 */
export function badgeIds(game: string, owned: readonly unknown[]): string[] {
    const list = BADGES_BY_GAME[game] ?? [];
    return list.filter((_, i) => owned[i] === true).map((b) => b.id);
}

export function toStatus(text: string | null | undefined): Status {
    const s = String(text ?? "").toLowerCase();
    if (!s || s === "none" || s === "ok" || s === "healthy") return "none";
    if (s.includes("toxic") || s.includes("bad")) return "toxic";
    if (s.includes("burn") || s === "brn") return "burn";
    if (s.includes("paral") || s === "par") return "paralysis";
    if (s.includes("poison") || s === "psn") return "poison";
    if (s.includes("sleep") || s.includes("asleep") || s === "slp") return "sleep";
    if (s.includes("freez") || s.includes("frozen") || s === "frz") return "freeze";
    return "none";
}

export function toWeather(text: string | null | undefined): Weather {
    const s = String(text ?? "").toLowerCase();
    if (s.includes("rain")) return "rain";
    if (s.includes("sun") || s.includes("drought")) return "sun";
    if (s.includes("sand")) return "sand";
    if (s.includes("hail") || s.includes("snow")) return "hail";
    return "none";
}

const isType = (t: unknown): t is string => typeof t === "string" && t.length > 0 && t !== "???";

export function toBattler(data: DamageGameData, m: MonInput): BattlerState | null {
    const isPlayer = m.isPlayer;
    const sp = findSpecies(data, m.species);
    if (!sp || !(m.level > 0) || !(m.stats?.hp > 0)) return null;
    const t1 = isType(m.types?.[0]) ? m.types![0]! : sp.types[0];
    const t2 = isType(m.types?.[1]) ? m.types![1]! : (isType(m.types?.[0]) ? t1 : sp.types[1]);
    const stats: CalcStats = data.gen === 1 ? { ...m.stats, spdefense: m.stats.spattack } : m.stats;
    const stages: StatStages = { ...ZERO_STAGES, ...Object.fromEntries(Object.entries(m.stages ?? {}).filter(([, v]) => Number.isFinite(v))) };
    if (data.gen === 1) stages.spdefense = stages.spattack;
    const hp = m.hp != null && Number.isFinite(m.hp) ? Math.max(0, Math.min(stats.hp, m.hp)) : stats.hp;
    return {
        species: m.species,
        level: m.level,
        types: [t1, t2 || t1],
        stats,
        baseStats: sp.base,
        stages,
        item: data.gen >= 2 ? itemId(m.item) : null,
        ability: data.gen >= 3 ? abilityId(m.ability) : null,
        status: toStatus(m.status),
        currentHp: Math.max(1, hp),
        weight: sp.weight,
        friendship: m.friendship ?? (isPlayer ? 255 : 70),
        gender: m.gender ?? "N",
        dvs: data.gen <= 2 ? m.dvs : undefined,
        ivs: data.gen >= 3 ? m.ivs : undefined,
        badges: new Set(isPlayer ? m.badges ?? [] : []),
        isPlayer,
        flags: { reflect: !!m.reflect, lightScreen: !!m.lightScreen, notFullyEvolved: sp.evolves },
        counters: {},
    };
}

export function toField(f: FieldInput): Field {
    return { ...DEFAULT_FIELD, game: f.game, gen: f.gen, weather: f.gen >= 2 ? toWeather(f.weather) : "none" };
}

/** One move's damage as the overlay shows it. */
export interface MoveDamage {
    /** "23–28" (HP, every hit of a multi-hit move added up), "—" for no damage, "OHKO" for a one-hit-KO move. */
    hp: string;
    /** "41–49%" of the target's max HP ("0%" when immune), or "—". */
    pct: string;
    /** Hits that land needed to KO from the target's current HP, no crits, held berries counted: "2HKO",
     *  "2HKO 56%" when the second hit only sometimes does it, "" when it doesn't or can't. */
    ko: string;
    /** Only the percent, for the enemy panel's narrow cells: "41–49%", "Immune", or "". */
    short: string;
    result: DamageResult | null;
}

const NO_DAMAGE: MoveDamage = { hp: "—", pct: "—", ko: "", short: "", result: null };
const DASH = "–";

/** Whole-number percent: rounded, so 41.2 → 41, 49.6 → 50. */
const wholePct = (p: number): number => Math.round(p);

/** Smallest chance a KO count needs to be the one shown. */
export const KO_SHOWN_FROM = 0.1;

/**
 * KO text from the target's current HP. The first hit count with at least a 10% chance, with its chance unless it
 * is (practically) certain: "2HKO", "2HKO 56%". Counts hits that connect (accuracy left out) and no critical hits, as a
 * viewer reads "2HKO"; a healing berry the target holds (Oran, Sitrus, Berry, Gold Berry, Berry Juice, Figy family)
 * is counted by the engine when it would be eaten.
 */
export function koText(r: DamageResult, hp: number, startFull: boolean): string {
    if (r.kind === "ohko") return "OHKO";
    const sure: DamageResult = { ...r, hitChance: 1, critChance: 0, crit: undefined };
    const chances = koChances(sure, Math.max(1, hp), 9, startFull);
    // The first count with a real chance: "3HKO 1%" reads as three hits when four are what it takes.
    const first = chances.find((c) => c.chance >= KO_SHOWN_FROM);
    if (!first) return "";
    const name = first.uses === 1 ? "OHKO" : `${first.uses}HKO`;
    if (first.chance >= 0.995) return name;
    return `${name} ${Math.max(1, Math.round(first.chance * 100))}%`;
}

export function describe(r: DamageResult, defender: BattlerState): MoveDamage {
    if (r.kind === "none" || r.kind === "reflect") return { ...NO_DAMAGE, result: r };
    // "Immune" doesn't fit the move lists' percent columns; "0%" says it there, the enemy panel's line has room.
    if (r.kind === "immune") return { hp: "0", pct: "0%", ko: "", short: "Immune", result: r };
    if (r.kind === "ohko") return { hp: "OHKO", pct: "100%", ko: "OHKO", short: "OHKO", result: r };
    const min = r.hits?.totalMin ?? r.min;
    const max = r.hits?.totalMax ?? r.max;
    if (max <= 0) return { ...NO_DAMAGE, result: r };
    const maxHp = Math.max(1, defender.stats.hp);
    const lo = wholePct((min / maxHp) * 100), hi = wholePct((max / maxHp) * 100);
    const pct = lo === hi ? `${lo}%` : `${lo}${DASH}${hi}%`;
    return {
        hp: min === max ? `${min}` : `${min}${DASH}${max}`,
        pct,
        ko: koText(r, defender.currentHp, defender.currentHp >= defender.stats.hp),
        short: pct,
        result: r,
    };
}

/**
 * The damage of each move (null for an empty slot or a move the data doesn't know). `options` per move name:
 * the overlay's Hidden Power type, for example.
 */
export function moveDamages(
    data: DamageGameData, field: FieldInput, attacker: MonInput, defender: MonInput,
    moves: readonly (string | null | undefined)[], options?: (move: string) => MoveOptions | undefined,
): (MoveDamage | null)[] {
    // The overlays recompute their panels on any mapper change (the clock, an exp tick); the same inputs give the
    // same answer, so it is kept. The KO odds are the costly part (a convolution per hit).
    const key = options ? null : JSON.stringify([data.gen, field, attacker, defender, moves]);
    const kept = key === null ? undefined : CACHE.get(key);
    if (kept && kept.data === data) return kept.result;
    const result = computeMoveDamages(data, field, attacker, defender, moves, options);
    if (key !== null) {
        if (CACHE.size >= CACHE_SIZE) CACHE.delete(CACHE.keys().next().value!);
        CACHE.set(key, { data, result });
    }
    return result;
}

const CACHE_SIZE = 256;
const CACHE = new Map<string, { data: DamageGameData; result: (MoveDamage | null)[] }>();

function computeMoveDamages(
    data: DamageGameData, field: FieldInput, attacker: MonInput, defender: MonInput,
    moves: readonly (string | null | undefined)[], options?: (move: string) => MoveOptions | undefined,
): (MoveDamage | null)[] {
    // A fainted attacker (0 HP) has nothing to show.
    if (attacker.hp === 0) return moves.map(() => null);
    const a = toBattler(data, attacker);
    const d = toBattler(data, defender);
    if (!a || !d) return moves.map(() => null);
    const f = toField(field);
    return moves.map((name) => {
        const md = findMove(data, name);
        if (!name || !md) return null;
        try {
            return describe(calcDamage({ attacker: a, defender: d, moveName: md.move, moveData: md, field: f, options: options?.(name) }), d);
        } catch (e) {
            console.warn(`[damage] ${name}:`, e);
            return null;
        }
    });
}
