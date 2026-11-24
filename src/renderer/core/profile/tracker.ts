/**
 * Asks the router for its move stats while a game is loaded (move-stats spec §4.4).
 *
 * `main.ts` starts this when a mapper loads, with the bucket of the edition being
 * played, and stops it when the mapper unloads. Each generation calls
 * {@link onBattleEnded} where it already sees a battle end, and tells this module
 * whether re-filming mode or a test run is on ({@link setProfileSkip}). A 30-second
 * poll is the backstop: wild battles, and a battle-end hook the router hadn't caught
 * up with yet.
 *
 * Nothing here changes what the overlay shows, writes or sends while a game is
 * loaded. With no router running, every ask fails quietly and nothing is written.
 */
import { reactive } from "vue";
import { checkReply, applyReply, type RouterReply } from "./merge";
import { ensureActiveProfile, loadProfiles, saveProfile } from "./profiles";
import { bucketForRouterGame } from "./buckets";

const POLL_MS = 30_000;
/** The router files a battle when its game state leaves the battle, which can be a moment after the overlay's hook. */
const AFTER_BATTLE_MS = [3_000, 12_000];
const FIRST_POLL_MS = 3_000;

/** What the router is doing, for the profile bar's dot. */
export type RouterLink = "unknown" | "off" | "same" | "other";

export const routerState = reactive({
    link: "unknown" as RouterLink,
    /** the router's game name ("FireRed"), while it records */
    game: null as string | null,
    /** the last battles added or skipped, for the debug log and the selftest */
    lastAdded: 0,
    lastSkipped: 0,
});

let bucket: string | null = null;
let skipSource: (() => boolean) | null = null;
let interval: ReturnType<typeof setInterval> | null = null;
let afterBattle: ReturnType<typeof setTimeout>[] = [];
let polling: Promise<void> | null = null;
let again = false;

function clearAfterBattle(): void {
    for (const t of afterBattle) clearTimeout(t);
    afterBattle = [];
}

export function startProfileTracking(bucketKey: string | null): void {
    stopProfileTracking();
    bucket = bucketKey;
    if (!bucket) return;
    interval = setInterval(() => void pollRouter(), POLL_MS);
    // Not at once: the generation's overlay mounts after this and only then says
    // whether re-filming mode is on.
    afterBattle = [setTimeout(() => void pollRouter(), FIRST_POLL_MS)];
}

export function stopProfileTracking(): void {
    if (interval) clearInterval(interval);
    interval = null;
    clearAfterBattle();
    bucket = null;
    skipSource = null;
}

/** The generation's "re-filming mode or test run is on" (§4.4): battles handled while it is true are not added. */
export function setProfileSkip(source: () => boolean): void {
    skipSource = source;
}

/** A generation's battle-end hook. Cheap to call often: it only schedules the next asks. */
export function onBattleEnded(): void {
    if (!bucket) return;
    clearAfterBattle();
    afterBattle = AFTER_BATTLE_MS.map((ms) => setTimeout(() => void pollRouter(), ms));
}

function skipping(): boolean {
    try {
        return skipSource?.() === true;
    } catch {
        return false;
    }
}

/** One ask; a second call while one is running asks once more after it. */
export function pollRouter(): Promise<void> {
    if (polling) {
        again = true;
        return polling;
    }
    polling = (async () => {
        try {
            do {
                again = false;
                await pollOnce();
            } while (again && bucket);
        } finally {
            polling = null;
        }
    })();
    return polling;
}

async function pollOnce(): Promise<void> {
    const forBucket = bucket;
    if (!forBucket) return;
    let reply: { ok: boolean; status: number; body: unknown };
    try {
        reply = await window.api.router.get("/move-stats");
    } catch {
        reply = { ok: false, status: 0, body: null };
    }
    if (bucket !== forBucket) return;
    if (!reply.ok) {
        routerState.link = "off";
        routerState.game = null;
        return;
    }
    const body = reply.body as RouterReply;
    routerState.game = body?.game ?? null;
    const check = checkReply(body, forBucket);
    if (check === "mismatch") {
        routerState.link = "other";
        return;
    }
    if (check === "invalid") {
        routerState.link = "off";
        return;
    }
    routerState.link = "same";
    if (!body.battles?.length) return;
    // Until the generation's overlay has said whether re-filming mode is on, nothing is
    // handled: the next ask does it.
    if (!skipSource) return;
    await loadProfiles();
    const profile = await ensureActiveProfile();
    const result = applyReply(profile, forBucket, body, skipping(), new Date().toISOString());
    routerState.lastAdded = result.added;
    routerState.lastSkipped = result.skipped;
    if (result.added || result.skipped) {
        console.log(`[profiles] ${profile.name}: ${result.added} battle(s) added, ${result.skipped} skipped (${forBucket})`);
        await saveProfile(profile);
    }
}

/** The start screen's dot: is the router recording, and is it the game picked here? */
export async function checkRouterStatus(bucketKey: string | null): Promise<RouterLink> {
    let reply: { ok: boolean; body: unknown };
    try {
        reply = await window.api.router.get("/status");
    } catch {
        reply = { ok: false, body: null };
    }
    const body = reply.body as { recording?: boolean; game?: string | null } | null;
    if (!reply.ok || !body?.recording) {
        routerState.link = "off";
        routerState.game = null;
    } else {
        routerState.game = body.game ?? null;
        // With no game picked on the start screen there is nothing to disagree with yet.
        routerState.link = !bucketKey || bucketForRouterGame(body.game) === bucketKey ? "same" : "other";
    }
    return routerState.link;
}
