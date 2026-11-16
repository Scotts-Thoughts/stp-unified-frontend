/**
 * Every generation's reset counter goes through {@link confirmReset}, because resuming from a replay looks like a
 * reset. Super Shuckie attaches the replay at frame 0 before it seeks to the resume point, so for a moment the game
 * memory is the replay's start: the save data is gone and then comes back (ARCHITECTURE §9).
 *
 * In gens 1-3 and 5, getting from a reset back to loaded save data takes seconds of title screens, so the save data
 * being back shortly afterwards means nothing was reset. Not in gen4: those games read the save at boot, so it is back
 * within moments of a real reset, and gen4 passes a `cameBack` that is always false. It passes `before` instead: a
 * reading of Super Shuckie's emulated clock from before the reset, which a replay resume makes jump
 * ({@link clockJumped}).
 *
 * `/stats` helps here in an unusual way. Super Shuckie answers it on the thread that runs the resume, so the request
 * only returns once the resume is over. Waiting for it is what makes a slow seek safe: the check below can't reach
 * its verdict in the middle of one. A request that doesn't return at all in {@link SHUCKIE_BUSY_TIMEOUT_MS} means
 * Super Shuckie is still busy with a replay; a refused one means it isn't running, and only the memory check applies.
 *
 * A replay being played back is not a reason to drop a reset: the overlay runs against played-back replays (the
 * harness's Super Shuckie stand-in always reports one), and a reset in one is a reset.
 *
 * The cost is that a real reset is counted, and its RESET marker sent, about half a second late.
 */

/** How long the memory gets to settle, before and after the `/stats` request. */
export const RESET_SETTLE_MS = 250;
/** Longer than a healthy `/stats` ever takes, and short enough not to hold a reset up for long. */
export const SHUCKIE_BUSY_TIMEOUT_MS = 3000;

const STATS_URL = "http://127.0.0.1:30158/stats";

/** A fresh `/stats` reading: its fields, `"busy"` if it never came back, `null` if Super Shuckie isn't running. */
type ShuckieReading = { readonly [field: string]: unknown } | "busy" | null;

export type ResetGuardDeps = {
    sleep: (ms: number) => Promise<void>;
    readStats: () => Promise<ShuckieReading>;
    now?: () => number;
};

/**
 * Super Shuckie's emulated clock (`/stats` `total_elapsed_time`, ms) and when it was read. The emulator keeps
 * counting through a reset the game does itself, but loading a replay puts the clock at the replay's position, so
 * it jumps. Gen4 needs this: its games read the save at boot, so memory can't tell a resume from a reset there.
 */
export type EmulatorClockSample = { emulatedMs: number; at: number };

const clockSamples: EmulatorClockSample[] = [];
const CLOCK_SAMPLE_EVERY_MS = 100;
const CLOCK_KEEP_MS = 10_000;
/**
 * How old the clock reading compared against must be. Super Shuckie answers nothing while it loads a replay, so
 * a reading this old was taken before the replay unless the resume's memory change took longer than this to
 * reach the overlay.
 */
export const CLOCK_LOOKBACK_MS = 1500;

/** Called with every `/stats` reading a generation polls. */
export function noteEmulatorClock(stats: { readonly [field: string]: unknown } | null | undefined, now = Date.now()): void {
    const emulatedMs = stats?.total_elapsed_time;
    if (typeof emulatedMs !== "number") return;
    const last = clockSamples[clockSamples.length - 1];
    if (last && now - last.at < CLOCK_SAMPLE_EVERY_MS) return;
    clockSamples.push({ emulatedMs, at: now });
    while (clockSamples.length > 0 && now - clockSamples[0].at > CLOCK_KEEP_MS) clockSamples.shift();
}

/** The newest clock reading at least {@link CLOCK_LOOKBACK_MS} old, or null if there is none. */
export function emulatorClockBefore(now = Date.now()): EmulatorClockSample | null {
    for (let i = clockSamples.length - 1; i >= 0; i--) {
        const sample = clockSamples[i];
        if (now - sample.at > CLOCK_KEEP_MS) return null;
        if (now - sample.at >= CLOCK_LOOKBACK_MS) return sample;
    }
    return null;
}

/**
 * Whether the emulated clock moved in a way no running game does: backwards, or further than fast-forward could
 * take it (8x is allowed for, so only a jump of tens of seconds or more counts).
 */
export function clockJumped(before: EmulatorClockSample, emulatedMs: number, speed: unknown, now: number): boolean {
    const delta = emulatedMs - before.emulatedMs;
    const wall = Math.max(0, now - before.at);
    const fastest = Math.max(8, typeof speed === "number" && Number.isFinite(speed) ? speed : 1);
    return delta < -500 || delta > wall * fastest + 2000;
}

async function readStats(): Promise<ShuckieReading> {
    try {
        const response = await fetch(STATS_URL, { signal: AbortSignal.timeout(SHUCKIE_BUSY_TIMEOUT_MS) });
        return response.ok ? await response.json() : null;
    } catch (err) {
        return err instanceof Error && err.name === "TimeoutError" ? "busy" : null;
    }
}

const defaultDeps: ResetGuardDeps = {
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    readStats,
};

/**
 * The check in progress. A reset can trip detection more than once on its way down (gen3 sees it in the reset
 * callback and again when the callbacks go null), so a second caller gets the same verdict instead of a check of its
 * own. A caller that counts has to make sure it counts once.
 */
let inFlight: Promise<boolean> | null = null;

/**
 * Whether a reset the overlay just detected was real. `cameBack` says whether the save data is in memory again;
 * it is called twice, so a generation only has to name the property that a reset empties.
 */
export function confirmReset(cameBack: () => boolean, deps: ResetGuardDeps = defaultDeps, before: EmulatorClockSample | null = null): Promise<boolean> {
    inFlight ??= check(cameBack, deps, before).finally(() => { inFlight = null; });
    return inFlight;
}

async function check(cameBack: () => boolean, deps: ResetGuardDeps, before: EmulatorClockSample | null): Promise<boolean> {
    await deps.sleep(RESET_SETTLE_MS);
    if (cameBack()) return ignored("the save data came straight back");
    const stats = await deps.readStats();
    if (stats === "busy") return ignored("Super Shuckie is busy with a replay");
    if (before && stats && typeof stats.total_elapsed_time === "number"
        && clockJumped(before, stats.total_elapsed_time, stats.current_speed, (deps.now ?? Date.now)())) {
        return ignored("Super Shuckie's clock jumped, so a replay was loaded");
    }
    await deps.sleep(RESET_SETTLE_MS);
    if (cameBack()) return ignored("the save data came back");
    return true;
}

function ignored(reason: string): false {
    console.log(`[reset] not counted: ${reason}.`);
    return false;
}
