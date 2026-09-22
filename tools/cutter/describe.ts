/**
 * What the Cutter editor needs to know about this overlay (air_cutter:
 * docs/overlay-clip-plan.md §5.5, §5.8), as JSON on stdout:
 *
 *   npx tsx tools/cutter/describe.ts        (npm run cutter:describe)
 *
 * * `settings` / `runState`: which files under the two writable roots —
 *   `<userData>/data` and `<appRoot>/storage` — and which keys of
 *   `user_state.json` are the overlay's *settings* (kept for an overlay–recording
 *   pairing) and which are what a session accumulates (never copied back from an
 *   editor's chain). Globs, `/`-separated, relative to each root.
 * * `windows`: where each generation's layout puts the game, in 1920x1080 frame
 *   pixels, where the layout says so. gen1 and gen2 lay the page out in columns of
 *   400 | 1120 | 400 (games/gen1/style.css `.mainContainer`, games/gen2/style.css);
 *   1120 is seven Game Boy screens across and 1008 seven down, centred. gen3–gen5
 *   draw the window as an image and are left for the user to set.
 *
 * The run-state list is read off the code: the split tables, the timer, the
 * counters and the per-route encounter flags are what `user_state.json` holds of
 * a run (every `MyStorage[...] =` and `setUserState(...)` in src/renderer), and
 * `storage/<Game>/<Species>/metrics.json` is the attempt count and timer.
 * Everything else a generation keeps is a setting. Unconfirmed by the team.
 */
const describe = {
  version: 1,
  settings: {
    data: ["user_state.json", "**/*.json"],
    storage: ["Storage.json"],
  },
  runState: {
    data: [],
    storage: ["**/metrics.json"],
    userStateKeys: [
      "current_splits",
      "previous_splits",
      "testRun",
      "timer_*",
      "blackout_counter",
      "playerResets",
      "encounters_*",
      "hm_*",
      "simple_data",
      "simple_data_str",
      "full_data_str",
      "deprecated_data_str",
    ],
  },
  windows: {
    gen1: { x: 400, y: 36, width: 1120, height: 1008 },
    gen2: { x: 400, y: 36, width: 1120, height: 1008 },
  },
};
process.stdout.write(JSON.stringify(describe, null, 2) + "\n");
