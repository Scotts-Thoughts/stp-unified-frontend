/**
 * Self-test for the reset check (`core/logic/resetGuard.ts`): what detection sees during a resume from replay against
 * a real reset, on a fake clock. The timelines are worked out from Super Shuckie's resume code and what each game
 * clears; they are not recordings. Every generation only supplies `cameBack`, so one timeline covers them all.
 *
 *   npm run parity:reset-guard
 */
import { clockJumped, confirmReset, emulatorClockBefore, noteEmulatorClock, type ResetGuardDeps } from "../../src/renderer/core/logic/resetGuard.ts";
import { latestTimePerTrainer } from "../../src/renderer/core/logic/splitComparison.ts";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown): void {
    const ok = Object.is(actual, expected);
    if (!ok) failures++;
    console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${String(actual)}${ok ? "" : ` (expected ${String(expected)})`}`);
}

/** Memory comes back at `backAt` ms (never if null); `/stats` takes `statsMs`, then answers `stats`. */
async function run(backAt: number | null, stats: Awaited<ReturnType<ResetGuardDeps["readStats"]>>, statsMs = 2): Promise<boolean> {
    let now = 0;
    const deps: ResetGuardDeps = {
        sleep: async (ms) => { now += ms; },
        readStats: async () => { now += statsMs; return stats; },
    };
    return confirmReset(() => backAt !== null && now >= backAt, deps);
}

const recording = { is_recording: true, is_playing_back: false };
const idle = { is_recording: false, is_playing_back: false };

check("quick resume is not a reset", await run(100, recording), false);
check("resume whose seek holds /stats for 2 s is not a reset", await run(2000, recording, 2000), false);
check("memory back after /stats, before the second look, is not a reset", await run(400, idle), false);
check("a real reset in a replay being played back counts", await run(null, { is_playing_back: true }), true);
check("a resume while a replay is loaded is not a reset", await run(100, { is_playing_back: true }), false);
check("a resume still running at the timeout is not a reset", await run(null, "busy", 3000), false);
check("real reset while recording counts", await run(null, recording), true);
check("real reset while idle counts", await run(null, idle), true);
check("real reset without Super Shuckie counts", await run(null, null), true);

{
    let backAfterFirst = false;
    const deps: ResetGuardDeps = { sleep: async () => {}, readStats: async () => null };
    const first = confirmReset(() => backAfterFirst, deps);
    const second = confirmReset(() => true, deps); // would say "came back" on a check of its own
    check("a second detection during the check gets the same verdict", await second, await first);
    check("and that verdict is the first caller's", await first, true);
}
check("the check is free again afterwards", await run(null, null), true);

// Gen4 (its games reload the save at boot, so memory always "came back"): Super Shuckie's emulated clock decides.
{
    const before = { emulatedMs: 10_000_000, at: 0 };
    check("clock: a real reset 2 s later, normal speed, did not jump", clockJumped(before, 10_002_000, 1, 2000), false);
    check("clock: a real reset while paused did not jump", clockJumped(before, 10_000_000, 1, 2000), false);
    check("clock: a real reset in 4x fast-forward did not jump", clockJumped(before, 10_008_000, 4, 2000), false);
    check("clock: a resume to an earlier point jumped", clockJumped(before, 9_000_000, 1, 2000), true);
    check("clock: a resume to a later point jumped", clockJumped(before, 10_600_000, 1, 2000), true);
    check("clock: a resume from a fresh emulator session jumped", clockJumped({ emulatedMs: 120_000, at: 0 }, 10_400_000, 1, 2000), true);

    const always = () => false;
    const at = (ms: number, stats: Record<string, unknown>): ResetGuardDeps => ({ sleep: async () => {}, readStats: async () => stats, now: () => ms });
    check("gen4 resume (clock jumped) is not a reset", await confirmReset(always, at(2000, { total_elapsed_time: 9_000_000, current_speed: 1 }), before), false);
    check("gen4 real reset (clock ran on) counts", await confirmReset(always, at(2000, { total_elapsed_time: 10_002_000, current_speed: 1 }), before), true);
    check("gen4 real reset with no earlier clock reading counts", await confirmReset(always, at(2000, { total_elapsed_time: 9_000_000 }), null), true);

    for (let t = 0; t <= 3000; t += 10) noteEmulatorClock({ total_elapsed_time: 5000 + t }, 100_000 + t);
    const sample = emulatorClockBefore(103_000);
    check("the reading used is at least 1.5 s old", !!sample && 103_000 - sample.at >= 1500 && 103_000 - sample.at < 1700, true);
    check("no reading once they are over 10 s old", emulatorClockBefore(200_000), null);
}

{
    const rows = [
        { trainer: "Rival", time: "1" }, { trainer: "Leader Roark", time: "2" }, { trainer: "Elite Four Aaron", time: "3" },
        { trainer: "Elite Four Aaron", time: "4" }, { trainer: "Rival", time: "5" }, { trainer: "Leader Roark", time: "6" },
    ];
    const out = latestTimePerTrainer(rows, (t) => t === "Rival");
    check("comparison keeps every Rival and merges refights", out.map((r) => `${r.trainer}=${r.time}`).join(), "Rival=1,Leader Roark=6,Elite Four Aaron=4,Rival=5");
}

console.log(failures === 0 ? "\nreset guard ok" : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
