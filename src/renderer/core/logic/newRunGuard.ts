/**
 * The manual New Run (the settings button, the F23 shortcut, the control server's `/new-run`) in every
 * generation goes through {@link manualNewRun}. While the Shuckie timer is on and Super Shuckie is recording a
 * replay, it does nothing: a stray New Run in the middle of a recorded run wiped every split before it and
 * restarted the run (report 2026-10-22, Crystal, mid-Red). The overlays' own new-run detection (a new save
 * file) does not come through here.
 */

/** The `/stats` field read here (docs/external-contracts.md §3; in every Super Shuckie build with the web server). */
type ShuckieStats = { readonly [field: string]: unknown };

/** Super Shuckie is recording a replay (not playing one back, not idle). */
export function shuckieRecording(stats: ShuckieStats | null | undefined): boolean {
    return stats?.is_recording === true;
}

/**
 * Runs `newRun` unless the Shuckie timer is on and a replay is recording; returns whether it ran. `source`
 * ("button", "F23", "/new-run") goes in the log line written when it is ignored.
 */
export function manualNewRun(
    shuckieTimer: boolean,
    stats: ShuckieStats | null | undefined,
    source: string,
    newRun: () => unknown,
): boolean {
    if (shuckieTimer && shuckieRecording(stats)) {
        console.log(`[new run] ${source} ignored: the Shuckie timer is on and Super Shuckie is recording a replay.`);
        return false;
    }
    void newRun();
    return true;
}
