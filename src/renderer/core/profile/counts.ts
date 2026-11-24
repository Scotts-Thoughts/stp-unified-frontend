/**
 * Move counts as the router writes them (move-stats spec §2.1), and the sums a
 * profile keeps of them. Adding a battle is adding numbers; "Remove from profile"
 * subtracts a run's cached sum the same way.
 */

export interface MoveCounts {
    interest?: number;
    uses?: number;
    acc_rolls?: number;
    hits?: number;
    misses?: number;
    expected_hits?: number;
    hit_variance?: number;
    listed_accuracy?: number | null;
    /** the move's type ("Fire"); routers before it was added leave it out */
    type?: string | null;
    crit_rolls?: number;
    crits?: number;
    expected_crits?: number;
    crit_variance?: number;
    effect_rolls?: number;
    effects?: number;
    expected_effects?: number;
    effect_variance?: number;
    effect_blocked?: number;
    effect_kind?: string | null;
    listed_effect_chance?: number | null;
    failed?: number;
    no_effect?: number;
    protected?: number;
    super_effective?: number;
    not_very_effective?: number;
    ohko?: number;
    kos?: number;
    multi_hit?: Record<string, number>;
    called_by?: Record<string, number>;
}

export type SideCounts = Record<string, MoveCounts>;

export interface CountsPair {
    player: SideCounts;
    enemy: SideCounts;
    other: Record<string, number>;
}

/** §3: 1 = luck move, 2 = only crits are random, 3 = nothing is. */
export const INTEREST_LUCK = 1;
export const INTEREST_CRIT_ONLY = 2;
export const INTEREST_NO_LUCK = 3;

const SUMMED = [
    "uses", "acc_rolls", "hits", "misses", "expected_hits", "hit_variance",
    "crit_rolls", "crits", "expected_crits", "crit_variance",
    "effect_rolls", "effects", "expected_effects", "effect_variance", "effect_blocked",
    "failed", "no_effect", "protected", "super_effective", "not_very_effective", "ohko", "kos",
] as const;
const FIRST_SEEN = ["listed_accuracy", "type", "effect_kind", "listed_effect_chance"] as const;

export function emptyPair(): CountsPair {
    return { player: {}, enemy: {}, other: {} };
}

function num(v: unknown): number {
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Float sums are rounded so that adding and taking away the same battle leaves exactly what was there. */
function tidy(v: number): number {
    return Math.round(v * 1e6) / 1e6;
}

function addMap(into: Record<string, number>, from: Record<string, number> | undefined, sign: number): void {
    if (!from || typeof from !== "object") return;
    for (const [k, v] of Object.entries(from)) {
        const next = tidy(num(into[k]) + sign * num(v));
        if (next === 0) delete into[k];
        else into[k] = next;
    }
}

export function addMove(into: MoveCounts, from: MoveCounts, sign = 1): void {
    for (const k of SUMMED) {
        into[k] = tidy(num(into[k]) + sign * num(from[k]));
    }
    for (const k of FIRST_SEEN) {
        if ((into[k] === undefined || into[k] === null) && from[k] !== undefined && from[k] !== null) {
            (into as any)[k] = from[k];
        }
    }
    if (!into.interest && from.interest) into.interest = from.interest;
    into.multi_hit ??= {};
    into.called_by ??= {};
    addMap(into.multi_hit, from.multi_hit, sign);
    addMap(into.called_by, from.called_by, sign);
}

export function addSide(into: SideCounts, from: SideCounts | undefined, sign = 1): void {
    if (!from || typeof from !== "object") return;
    for (const [name, counts] of Object.entries(from)) {
        if (!counts || typeof counts !== "object") continue;
        const entry = (into[name] ??= {});
        addMove(entry, counts, sign);
        // A move whose every count went back to zero (a removed run) leaves the table.
        if (sign < 0 && SUMMED.every((k) => num(entry[k]) === 0)) delete into[name];
    }
}

export function addPair(into: CountsPair, from: Partial<CountsPair> | undefined, sign = 1): void {
    if (!from) return;
    addSide(into.player, from.player, sign);
    addSide(into.enemy, from.enemy, sign);
    addMap(into.other, from.other, sign);
}

// --- luck (spec §5.3) ----------------------------------------------------------------

export type Luck = "very-lucky" | "lucky" | "on-par" | "unlucky" | "very-unlucky";

export const LUCK_LABELS: Record<Luck, string> = {
    "very-lucky": "Very lucky",
    lucky: "Lucky",
    "on-par": "On par",
    unlucky: "Unlucky",
    "very-unlucky": "Very unlucky",
};

/** Fewer rolls than this say nothing. */
export const MIN_ROLLS = 5;

/**
 * How unusual `actual` is: z = (actual - expected) / sqrt(variance). `goodWhenHigh` is
 * false where more is worse for the player (an enemy's hits, crits and effects).
 */
export function luck(actual: number, expected: number, variance: number, rolls: number, goodWhenHigh = true): Luck | null {
    if (rolls < MIN_ROLLS || !(variance > 0)) return null;
    const z = ((actual - expected) / Math.sqrt(variance)) * (goodWhenHigh ? 1 : -1);
    if (z >= 2) return "very-lucky";
    if (z >= 1) return "lucky";
    if (z <= -2) return "very-unlucky";
    if (z <= -1) return "unlucky";
    return "on-par";
}

export function hitLuck(c: MoveCounts, goodWhenHigh = true): Luck | null {
    return luck(num(c.hits), num(c.expected_hits), num(c.hit_variance), num(c.acc_rolls), goodWhenHigh);
}
export function critLuck(c: MoveCounts, goodWhenHigh = true): Luck | null {
    return luck(num(c.crits), num(c.expected_crits), num(c.crit_variance), num(c.crit_rolls), goodWhenHigh);
}
export function effectLuck(c: MoveCounts, goodWhenHigh = true): Luck | null {
    return luck(num(c.effects), num(c.expected_effects), num(c.effect_variance), num(c.effect_rolls), goodWhenHigh);
}

/**
 * The row's chip: the luck of whatever this move rolled most of -- accuracy for a
 * move that can miss, else its secondary effect.
 */
export function moveLuck(c: MoveCounts, goodWhenHigh = true): Luck | null {
    return num(c.acc_rolls) >= num(c.effect_rolls) ? hitLuck(c, goodWhenHigh) : effectLuck(c, goodWhenHigh);
}

/** Sorted for display: luck moves first by uses, then crit-only, then no-luck. */
export function sortedMoves(side: SideCounts): { main: [string, MoveCounts][]; quiet: [string, MoveCounts][] } {
    const rows = Object.entries(side).sort((a, b) => num(b[1].uses) - num(a[1].uses) || a[0].localeCompare(b[0]));
    const isQuiet = (c: MoveCounts) => c.interest === INTEREST_CRIT_ONLY || c.interest === INTEREST_NO_LUCK;
    const quiet = rows.filter(([, c]) => isQuiet(c)).sort((a, b) => num(a[1].interest) - num(b[1].interest) || num(b[1].uses) - num(a[1].uses));
    return { main: rows.filter(([, c]) => !isQuiet(c)), quiet };
}
