/**
 * Folding the router's `GET /move-stats` reply into a player profile (move-stats spec
 * §4.4, §4.5). Pure functions over plain objects, so `tools/parity/profile-router-selftest.ts`
 * can run them against a fake router without the app.
 *
 * - Every battle is handled once per run: its `battle_id` goes into the run's
 *   `battle_ids` (added) or `skipped_battle_ids` (seen while re-filming or on a test
 *   run). Asking twice, restarting the overlay or reloading never counts it again,
 *   and turning re-filming off later doesn't add a skipped battle back.
 * - Each run keeps the sum of what it added (`counts`), so "Remove from profile" can
 *   subtract exactly that. A removed run stays in the file, marked, so the next reply
 *   for it doesn't add its battles again.
 * - Reset and lost battles in the reply are added like any other: every roll was real
 *   (§2.2). The router has already decided which battles those are.
 */
import { bucketForRouterGame } from "./buckets";
import { addPair, emptyPair, type CountsPair } from "./counts";

export const PROFILE_FORMAT = 1;

export interface RouterBattle extends Partial<CountsPair> {
    battle_id: string;
    kind?: string;
    trainer?: string | null;
    outcome?: string;
    started_at?: string;
    finished_at?: string;
}

/** The parts of the router's reply the overlay reads (docs/external-contracts.md §10). */
export interface RouterReply {
    format?: number;
    run_id?: string;
    game?: string;
    solo_species?: string;
    battles?: RouterBattle[];
    in_battle?: boolean;
}

export interface ProfileRun {
    run_id: string;
    /** the router's game name ("FireRed"), as it was when the run was first seen */
    game: string;
    species: string;
    /** when the overlay first saw this run */
    started: string;
    battle_ids: string[];
    skipped_battle_ids: string[];
    /** "Remove from profile": its counts were taken away and later battles are skipped */
    removed?: boolean;
    /** the sum of every battle added from this run */
    counts: CountsPair;
}

export interface ProfileBucket extends CountsPair {
    runs: ProfileRun[];
}

export interface Profile {
    format: number;
    id: string;
    name: string;
    picture: string;
    created: string;
    buckets: Record<string, ProfileBucket>;
}

export function emptyBucket(): ProfileBucket {
    return { ...emptyPair(), runs: [] };
}

export type ReplyCheck = "ok" | "invalid" | "mismatch";

/** Whether a reply can be used for `bucket`: it has a run and battles, and the router plays the same game. */
export function checkReply(reply: unknown, bucket: string | null): ReplyCheck {
    const r = reply as RouterReply | null;
    if (!r || typeof r !== "object" || typeof r.run_id !== "string" || !r.run_id || !Array.isArray(r.battles)) return "invalid";
    if (!bucket || bucketForRouterGame(r.game) !== bucket) return "mismatch";
    return "ok";
}

export interface ApplyResult {
    added: number;
    skipped: number;
}

/**
 * Adds the reply's battles that this profile hasn't handled yet to `bucketKey`.
 * `skip` is true while re-filming mode or a test run is on: new battles are marked
 * handled but not added. The caller has already run {@link checkReply}.
 */
export function applyReply(profile: Profile, bucketKey: string, reply: RouterReply, skip: boolean, now: string): ApplyResult {
    const result: ApplyResult = { added: 0, skipped: 0 };
    const runId = reply.run_id!;
    const bucket = (profile.buckets[bucketKey] ??= emptyBucket());
    let run = bucket.runs.find((r) => r.run_id === runId);
    for (const battle of reply.battles ?? []) {
        if (!battle || typeof battle.battle_id !== "string" || !battle.battle_id) continue;
        if (run && (run.battle_ids.includes(battle.battle_id) || run.skipped_battle_ids.includes(battle.battle_id))) continue;
        if (!run) {
            run = { run_id: runId, game: reply.game ?? "", species: reply.solo_species ?? "", started: now, battle_ids: [], skipped_battle_ids: [], counts: emptyPair() };
            bucket.runs.push(run);
        }
        if (skip || run.removed) {
            run.skipped_battle_ids.push(battle.battle_id);
            result.skipped++;
            continue;
        }
        addPair(run.counts, battle, 1);
        addPair(bucket, battle, 1);
        run.battle_ids.push(battle.battle_id);
        result.added++;
    }
    if (run && reply.solo_species && !run.species) run.species = reply.solo_species;
    return result;
}

/** "Remove from profile": takes the run's battles out of the bucket's totals. */
export function removeRun(profile: Profile, bucketKey: string, runId: string): boolean {
    const bucket = profile.buckets[bucketKey];
    const run = bucket?.runs.find((r) => r.run_id === runId);
    if (!bucket || !run || run.removed) return false;
    addPair(bucket, run.counts, -1);
    run.removed = true;
    run.skipped_battle_ids.push(...run.battle_ids);
    run.battle_ids = [];
    run.counts = emptyPair();
    return true;
}

/** A profile file as read from disk, with anything missing filled in. */
export function normaliseProfile(raw: any): Profile | null {
    if (!raw || typeof raw !== "object" || typeof raw.id !== "string") return null;
    const buckets: Record<string, ProfileBucket> = {};
    for (const [key, b] of Object.entries<any>(raw.buckets ?? {})) {
        if (!b || typeof b !== "object") continue;
        buckets[key] = {
            player: b.player ?? {},
            enemy: b.enemy ?? {},
            other: b.other ?? {},
            runs: Array.isArray(b.runs)
                ? b.runs
                      .filter((r: any) => r && typeof r.run_id === "string")
                      .map((r: any) => ({
                          ...r,
                          battle_ids: Array.isArray(r.battle_ids) ? r.battle_ids : [],
                          skipped_battle_ids: Array.isArray(r.skipped_battle_ids) ? r.skipped_battle_ids : [],
                          counts: { ...emptyPair(), ...(r.counts ?? {}) },
                      }))
                : [],
        };
    }
    return {
        format: typeof raw.format === "number" ? raw.format : PROFILE_FORMAT,
        id: raw.id,
        name: typeof raw.name === "string" && raw.name ? raw.name : "Player",
        picture: typeof raw.picture === "string" ? raw.picture : "",
        created: typeof raw.created === "string" ? raw.created : "",
        buckets,
    };
}
