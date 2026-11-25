# tools/markers: checking chapter markers against real runs

Chapter markers can be checked offline against a real run: a Super Shuckie `.replay` holds the game's memory
frame by frame, and (format 5 and later) every marker the overlay wrote while it was recorded, as bookmarks.

1. **Memory log** (`memlog.cjs`). Uses the Router's headless replay tools, `xpr-replay-worker` (Super Shuckie's
   cores) and `pab-host` (PokeAByte's own mapper engine, so values are what PokeAByte served), from
   `A:\pkmn_yellow_xp_router\tools\replay_to_route\out` (build: that folder's README). Writes every change of the
   properties matching `--paths` as `frame@replayMs,path,jsonValue`.

   ```
   node tools/markers/memlog.cjs --replay <r.replay> --rom <rom> --mapper ST/gen4/pokemon_platinum_ne.xml \
        --paths '^(battle|meta|overworld|player|bag)\.' --chunks 12 --out p.mem.csv
   ```
   - `--find-rom`: `xpr-replay-worker.exe --replay <r> --find-rom A:/Dropbox/stp-projects/programs/roms`.
   - A 2-hour DS run takes ~13 min with 12 chunks. **gen3 must use `--chunks 1`**: Emerald's and FireRed's
     mapper scripts detect the patch once and cache it, and a chunk starts with a fresh mapper, so the
     `pointers.sStp*` values come out null in most chunks.
   - Log every property a marker reads (all six held items for gen4's Item, for example), or the run differs
     from the app for a reason that is only the log's.
2. **Old markers** (`bookmarks.mts`): `npx tsx tools/markers/bookmarks.mts <r.replay> > old.csv` (`frame,ms,name`).
   Format v4 replays have none; then use the recording's chapters (`ffprobe -show_chapters`) and line the two up by
   matching trainer INs (a recording is only the same run if most of them match).
3. **New markers** (`run-wiring.ts`): runs `games/<gen>/chapterMarkers.ts` over the log on the replay's clock.
   `npx tsx --tsconfig tsconfig.web.json tools/markers/run-wiring.ts --gen gen4 --game Platinum --mem p.mem.csv
   --bookmarks old.csv > new.csv`. `--module <file.ts>` runs any other wiring function the same way.
4. **Compare** (`compare.cjs`): `node tools/markers/compare.cjs --old old.csv --new new.csv --game platinum` prints,
   per kind, the markers kept on the same frame, moved, removed and added, and Cutter's own battle pairing
   (`K:\Programs\air_cutter\extensions\run-cutter\lib\pairing.js`) on both. `--list <kind>` prints the
   differences. Old markers were stamped with Super Shuckie's frame when the request reached it, so they sit
   ~0–20 frames after the runner's: "moved" by that much is the live polling delay, not a change.

The 2026-11-07 runs (ARCHITECTURE §9) used Platinum p-glaceon-line-1 / p-porygonz-line-1, HeartGold
h-porygonz-line-2, White 2 w-kyurem-1, Black b-victini-1, Emerald e-mudkip-2 and FireRed f-cloyster-line-1.

## Overlay logic over a real run

- **Mid-run evolution** (`lead-evolution-wiring.ts`): runs `core/overlay/leadEvolutionMixin.ts` with gen4's species,
  personality-value and `meta.state` handlers and the starter watcher (on Vue's reactivity, with the client's
  10-frame species debounce on the replay clock) over a memory log, and prints what the overlay follows.
  `npx tsx --tsconfig tsconfig.web.json tools/markers/lead-evolution-wiring.ts --mem h.mem.csv --starter Yanma
  --expect Yanmega@2878762`. `--start-ms` mounts mid-run, `--seed '<json>'` puts stored values in place first,
  `--code old` runs the handler from before 2026-11-24.
- **The real app over a real run** (`mem-to-scenario.ts`): turns windows of a memory log into a
  `tools/parity/make-fixture.ts` scenario (`--windows 30000-60000,2690000-2712000` keeps the run's start and the
  moment in question, with one step for everything that changed in between). Build the fixture with
  `make-fixture.ts` against the same mapper XML (`%APPDATA%\PokeAByte\Mappers\...`) and run it with
  `tools/parity/run.ts` (`--redirect-ports` while Scott's PokeAByte is up); set the overlay up the way the queuer
  does in `beforeReplay` (`/set-game`, `/set-starter`, `/refresh`, `/set-evolution`).
