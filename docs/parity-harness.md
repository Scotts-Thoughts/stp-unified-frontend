# Parity harness — design spec (`tools/parity/`)

The harness is the only thing that decides whether a migration step is "done". It replays a recorded
PokeAByte session into an overlay app running under Playwright-for-Electron, and compares what the app
*shows* and what it *does* against a committed baseline captured from the unmodified legacy app.

Verified inputs (2026-09-10): PokeAByte 0.11.2 source (`A:\Programs\PokeAByte\src`), gen1's
`packages/gameHookMapperClient.ts`, the queuer's `fixture_recorder.js`, the first recorded fixture
(`tools/fixtures/raw/Pokemon Crystal - Deprecated Mapper/c-wigglytuff-2-11311.fixture.jsonl.gz`).

## 1. Oracles (what is compared)

| # | Oracle | Source | Comparison |
|---|---|---|---|
| 1 | **Computed styles + layout** | `getComputedStyle` (all properties) and `getBoundingClientRect` of every element under `#app-container`, keyed by a stable path (`tag.class1.class2:nth-child(n)` chain) | exact, after normalising `auto`/`none` spellings; the primary oracle because it is independent of the Chromium version |
| 2 | **Pixels** | `page.screenshot()` of the 1920×1080 content | zero tolerance when both sides run the same Electron (§4); `pixelmatch` threshold 0.1 + AA-skip when comparing Electron 25 vs 37 |
| 3 | **Split CSVs** | every file the app writes under `<sandbox>/splits/**` | byte-identical (wall clock is faked, §5) |
| 4 | **App data** | `<sandbox>/APPDATA/<app>/data/**` (gen1 format) and, for gen2–5, a `localStorage` dump taken via `page.evaluate` at the end of the run | JSON-normalised deep-equal |
| 5 | **PokeAByte writes** | every `POST /mapper/set-property-value|set-property-bytes|set-properties-by-bits` the app sends, in order, with body | exact sequence |
| 6 | **Control server** | `GET /status` after each scripted control call (`/set-game`, `/set-starter`, `/refresh`, …) | deep-equal on the fields the queuer reads (`external-contracts.md` §2) |
| 7 | **OBS chapter markers** | every `CreateRecordChapter` received by the OBS stub | exact sequence of names |
| 8 | **Super Shuckie calls** | every `POST /mark-start|mark-end|increment-counter` | exact sequence |
| 9 | **Console** | renderer `console.error` / uncaught exceptions | none allowed that the baseline did not also have |

A step passes only when every oracle for every fixture of the affected generation is green.

## 2. Fixture format (as actually written by `fixture_recorder.js`, format 1)

The plan's description in Phase 0.2 is close; these are the corrections:

- Line 1 header keys: `format, recordedAt, mapperId, replayName, item, meta, glossary, paths, initial`.
  `paths` is an **array** (index = id). `initial` is `{ [id]: <full property DTO> }` with every field
  PokeAByte serialises (`path, type, memoryContainer, address, length, size, reference, bits, description,
  value, bytes, isFrozen, isReadOnly, fieldsChanged`). `meta` is the `/mapper` meta
  (`id, gameName, gamePlatform, version, path`) — note `gameName` here is the `<mapper name>` attribute,
  e.g. `"Pokemon Crystal - Deprecated Mapper"`, not the `meta.gameName` *property*.
- Record types: `E` (change), `F` (frame sample), `K` (keyframe of every value, every 60 s and at stop),
  `M` (hub lifecycle), and **`P`** (`["P", t, id, path]`: a path first seen mid-run — the plan omits it).
- An `E` delta contains only the changed *fields' values* (`{value, bytes}`), **not** `fieldsChanged`
  itself. The replayer reconstructs `fieldsChanged = Object.keys(delta)`.
- Events are stored one per property; PokeAByte sends one message per tick with all properties that
  changed on that tick. The replayer **re-batches by identical `tMs`**.
- `meta.json` sidecar: `{file, mapperId, replayName, events, properties, lastFrame, durationSec, bytes}`.

**Measured size** (first fixture): 108 s, 1,073 properties, 40,920 events (≈379/s), 2.21 MB raw →
285 KB gzip (7.8×). A two-hour run therefore lands around **20 MB gzipped, not 100–300 MB**.
45 % of events are frame counters (`patch.time.frameCount`, `gameTime.frames`, `patch.time.oWFrameCount`,
`patch.time.battleFrameCount`) which every overlay reads (battle summary), so they cannot be pruned; the
prune step is still worthwhile for `screen.tiles.*`, `audio.*`, `new_props.*`, `scripts.*` once the
per-gen path inventories (Phase 2.3) prove nothing reads them. Full runs can simply be committed as-is
(git-lfs optional); checkpoint extracts stay for fast iteration.

## 3. `mock-pokeabyte` — the stand-in server

Node 22, no framework. Must be indistinguishable from PokeAByte 0.11.2 for the four JS clients (gen1's TS
client and the vendored `gameHookMapperClient.js` in gen2–5, which are the same lineage).

### HTTP
- Listen on `http://localhost:8085` (apps hardcode `localhost`; PokeAByte itself rejects `127.0.0.1` via
  `AllowedHosts`). Fail fast if the port is taken (a real PokeAByte is running).
- CORS: reflect `Origin`, `Access-Control-Allow-Credentials: true`, any method/header. Never `*`.
- `GET /mapper` → `{ meta, properties: [full DTO…], glossary }` from the **current** replay state (the client
  re-fetches every 60 s and rebuilds its property tree from this — stale values would silently roll back
  the UI). While "unloaded": HTTP 400 `{"title":"MAPPER_NOT_LOADED","status":400,"detail":"Please load a mapper file first."}`.
- `GET /mapper/meta`, `/mapper/properties`, `/mapper/properties/{path}`, `/mapper/glossary` — cheap to add,
  same data.
- `POST /mapper/set-property-value/`, `/mapper/set-property-bytes/`, `/mapper/set-properties-by-bits/`
  (trailing slash tolerated; `/` in paths → `.`; the legacy client only converts the *first* dot, the server
  converts all slashes back, so accept both). Each call is appended to the **write log** (oracle 5), applied to
  the replay state, and echoed on the next tick as a `PropertiesChanged` entry with `fieldsChanged`
  `["bytes","value"]` (plus `"isFrozen","frozen"` when `freeze` is true — PokeAByte emits the duplicate token).
  A `--writes=ignore` mode keeps the log but does not apply, for fixtures where the recording already contains
  the effect of the write.
- `GET /mapper-service/get-metadata` (200 meta / 404), `GET /mapper-service/get-mappers` (one entry from the
  fixture header), `PUT /mapper-service/change-mapper` (200, then `MapperLoaded`) — so the queuer's own probes
  also work against the mock.
- Anything else: 404.

### SignalR hub `/updates` (JSON protocol, WebSocket transport only)
1. `POST /updates/negotiate?negotiateVersion=1` → `{"negotiateVersion":1,"connectionId":"…","connectionToken":"…","availableTransports":[{"transport":"WebSockets","transferFormats":["Text"]}]}`.
2. WebSocket upgrade at `/updates?id=<token>`; client sends `{"protocol":"json","version":1}\x1e`; reply `{}\x1e`.
3. Immediately send `Hello` (invocation `{"type":1,"target":"Hello","arguments":[<MapperModel|null>]}\x1e`).
4. Then `MapperLoaded` with the same MapperModel once the replay is armed; `InstanceReset` (no arguments) on unload.
5. `PropertiesChanged` invocations with **one argument: an array of full property DTOs** (all fields, not
   deltas — the clients overwrite `memoryContainer, address, length, size, reference, bits, description, value,
   bytes, isFrozen, isReadOnly` unconditionally and only fire `.change()` when `fieldsChanged` includes `"value"`).
   `bytes` is a JSON number array. `type` is the lowercase enum string.
6. Ping `{"type":6}\x1e` every 15 s (virtual or real, whichever clock drives the run) — the client's
   `serverTimeoutInMilliseconds` is 30 s.
7. `Error` is never sent by the mock.

### Replay engine
- `load(fixture)`: header → state (`initial` values, glossary, meta); build id→path.
- `seek(tMs)`: apply the last `K` at or before `tMs`, then every `E` in `(tK, tMs]`; serve that as `/mapper`.
- `play(from, to, speed)`: emit batches grouped by `tMs`; `speed` = realtime multiplier or `virtual` (§5).
- `F` samples feed the Super Shuckie stub (`total_elapsed_frames`); `M` records trigger `MapperLoaded`/`InstanceReset`.
- Also stubs: **Super Shuckie** on `127.0.0.1:30158` (`/stats` returns `{time_current, total_elapsed_frames,
  is_playing_back:true, is_playback_finished:false, counters:{}}`, POSTs logged) and **OBS WebSocket 5** on
  `ws://localhost:4455` (Hello op 0 → Identify op 1 → Identified op 2; log every `CreateRecordChapter` op 6,
  reply op 7). Both are optional per run (`--no-shuckie`, `--no-obs`) so the "not running" code paths are
  also covered.

## 4. Runner (`tools/parity/run.ts`)

Playwright `_electron.launch({ executablePath, args, cwd, env })`, one app at a time (port 30159 and 8085 are
single-tenant).

| Target | executablePath | args | cwd |
|---|---|---|---|
| legacy genN (reference) | `A:\Programs\genN-stp-frontend\node_modules\electron\dist\electron.exe` (25.x) | `["A:\\Programs\\genN-stp-frontend"]` | sandbox dir seeded with `keyhook.exe`, `storage/`, empty `splits/` |
| legacy genN (same-Electron baseline) | the unified repo's Electron 37 binary | same | same |
| unified | Electron 37 | the repo root (built with `electron-vite build`; **never** the dev server, its `http://localhost:5173` origin changes `localStorage` scoping) — passing the root, not `out/main/index.js`, makes Electron read `package.json`, so the app name, `main` and `app.isPackaged` are what a real launch sees | sandbox |

Environment for every launch: `NODE_ENV=production`, `ELECTRON_ENABLE_LOGGING=1`, and Chromium switches
`--force-device-scale-factor=1` and **`--user-data-dir=<sandbox>\userData`**.

**[corrected 2026-09-10]** Revision 2 said `APPDATA=<sandbox>\AppData` gives each run a fresh profile.
It does not: Electron resolves `app.getPath('appData')` on Windows through the known-folder API, not the
environment, so runs launched that way all shared `%APPDATA%\Electron` and read each other's `localStorage`
(two identical runs produced split tables two rows apart). `--user-data-dir` is what actually isolates a run;
`APPDATA` is still set into the sandbox for anything that reads it directly.
After launch: `BrowserWindow.setContentSize(1920,1080)`, `webContents.setZoomFactor(1)`, assert
`getContentBounds()` is 1920×1080 (fail loudly on displays that cannot fit it — use a virtual display or
`--headless`-style offscreen window if needed), then wait for `#app` and the mock's `MapperLoaded` ack.

Phase 0 must confirm empirically that every legacy app starts under Electron 37 unmodified (they use only
`BrowserWindow`, `ipcMain`, `nodeIntegration: true`). If one does not, that gen's pixel oracle falls back to
the tolerance mode and computed styles carry the parity claim.

`settle` before a capture = advance the clock ≥ 500 ms virtual (covers the gen4 client's 10-frame
`deboucePath` debounce and every CSS transition/`opacityTransition` used by the overlays), then two
`requestAnimationFrame`s.

## 5. Clock

Overlays use `Date.now()` (timer, battle durations in the CSVs), `setTimeout` (250 ms storage save
debounce, 200 ms control-server reload/quit), and `requestAnimationFrame` (timer display, client debounce).
Wall-clock leakage would break oracles 2 and 3, so the runner installs Playwright's fake clock in the renderer
(`page.clock.install({ time: fixture.recordedAt })`) and advances it in lockstep with the replay
(`page.clock.runFor(dt)` per batch, or `page.clock.fastForward` between checkpoints). The mock's SignalR
ping is driven from the same virtual timeline so the client never sees a 30 s gap. Real-time mode
(`--realtime`) stays available for debugging, with the CSV time columns compared after masking.

## 6. Checkpoints (`scan-fixture.ts`)

Walk the stream and emit `checkpoints.json` per fixture: every transition of `battle.type`,
`battle.mode`, `meta.state`, enemy species, party lead species/level, badge bits, `events.beatChampion`,
`player.playerId` (reset / new game), plus the first and last `F` frame. For each checkpoint the runner
seeks to the **last keyframe before the enclosing battle or state change**, not merely before the
screenshot moment, so the apps' internal state machines (gen1 `EnemyState`, the gen2–5 equivalents) are
driven through the same transitions the legacy app saw, then plays forward to the checkpoint and captures.
Extracted checkpoint fixtures (`<game>/<replay>/<checkpoint>.fixture.jsonl.gz`) carry that lead-in.

## 7. Scripts and layout

```
tools/parity/
  mock-pokeabyte/   server.ts (REST+hub), replay.ts, shuckie-stub.ts, obs-stub.ts, signalr.ts
  run.ts            launch app → arm mock → drive checkpoints/control script → capture
  capture.ts        styles+rects dump, screenshot, localStorage dump, file collection
  diff.ts           oracles 1–9 → tools/reports/<gen>/<fixture>/<checkpoint>.{json,png}
  scan-fixture.ts   checkpoints + extraction
  prune-fixture.ts  drop unread paths (per-gen allowlist from the adapter inventories)
tools/baselines/<gen>/<fixture>/<checkpoint>/   committed reference captures (legacy@25 and legacy@37)
tools/fixtures/raw/<mapper gameName>/<replay>.fixture.jsonl.gz  (Dropbox-synced, git-ignored)
tools/fixtures/<gen>/<replay>/…                committed pruned/extracted fixtures
```

npm scripts: `parity:baseline <gen> <fixture>`, `parity:run <target> <fixture>`, `parity:diff`,
`parity:scan`, `parity:prune`, `parity:all` (every gen that is migrated so far).

## 8. Known quirks the mock must reproduce, not fix

- Legacy client aborts the *whole* batch (`return`, not `continue`) on the first unknown path — so a fixture
  containing `P` records must be replayed with those paths already present in `/mapper` (the replayer adds
  them to `initial` at load time).
- `oldProperty.isFrozen` reads a non-existent `property.frozen` (always `undefined`) — harmless.
- Property paths with numeric segments (`player.team.0.species`) become arrays in the client tree; the
  fixture stores them as-is.
- `meta.gameName` (DEPRECATED mappers) vs `meta.game_name` (STANDARD/ST mappers) is mapper content, not
  protocol; the mock serves whatever the fixture recorded. See `mapper-matrix.md`.

---

## 9. Status — what is built and how to run it (2026-09-10)

Everything in sections 1–8 is implemented in `tools/parity/`, oracle 6 included: `--control` replays the
queuer's call order for one queue item (`tools/parity/control-scripts/queuer-item.json`, whose `skipFor`
entries mirror the queuer's own per-generation guards) against the running overlay and records every
exchange plus the `/status` that follows it into `status.json`.

```
npm run parity:preflight -- unified          # which single-tenant port is held, and by what
npm run parity:selftest                      # 32 checks: the mock vs gen1's real GameHookMapperClient
npm run parity:scan -- <fixture> --out=tools/reports
npm run parity:run  -- <target> <fixture> --out=<dir> [--control]
npm run parity:diff -- <baseline-dir> <candidate-dir>
npm run parity:mock -- <fixture>             # serve a fixture by hand, no Playwright
```

`<target>` is `unified`, `legacy:genN@25` or `legacy:genN@37`.

### Determinism is not free — four things the runner has to do

Getting two identical runs to agree took four fixes; each is commented where it is handled, and any change to
the runner has to keep all four:

1. **`--user-data-dir` per sandbox** (section 4). Without it runs share `%APPDATA%\Electron`.
2. **`page.clock.pauseAt()` after `install()`.** `install()` alone keeps the fake clock ticking with real
   time, so the overlay's timer samples wall clock and the `.cs` digits differ every run. With the clock
   paused, `requestAnimationFrame` only fires when the clock is advanced — so "wait two frames" is spelled
   `clock.runFor(32)`, never an rAF promise, which would wait forever (`settle()` in `capture.ts`).
3. **A CDP barrier before every clock step** (`CLOCK_STEP_MS` in `run.ts`). Hub messages reach the renderer on
   its IO thread while `page.clock` advances over the DevTools pipe; without draining first, the app applies a
   property change at a different virtual time in each run.
4. **Arm the mapper before the reload.** A client that connects while no mapper is loaded leaves `_debouceMap`
   null and throws from its rAF loop a frame later (known-legacy-bugs.md #29) — landing in a different capture
   each run. Arming first also matches the queuer's real launch order.

Collecting the whole `userData` tree is a fifth trap: Chromium's own profile (DIPS, `DevToolsActivePort`, the
DPAPI-encrypted `Local State` key, the leveldb log framing, the Dawn caches) differs byte-for-byte between
identical runs. `run.ts` collects only what the app writes, and `localStorage` is compared from the page dump.

### `--redirect-ports`

Ports 8085 / 30158 / 4455 / 30159 are single-tenant, so a parity run normally requires PokeAByte, Super
Shuckie and any overlay to be closed. `--redirect-ports` binds the stubs to 18085 / 30258 / 14455 and installs
an init script that rewrites those hosts inside the renderer's `fetch`, `XMLHttpRequest` and `WebSocket`. It
changes URL strings only, so every oracle still holds. It cannot move the overlay's **own** control server off
30159, so gen2–5 targets still need that port free.

### Synthetic fixtures

`make-fixture.ts` builds a fixture from a shipped mapper XML plus a scenario (`tools/parity/scenarios/*.json`),
expanding the XML exactly as PokeAByte does (`lib/mapper-xml.ts`: classes, `var:` substitution, `{address} + n`
expressions, references, static `value=` properties). Every path a scenario sets is checked against the mapper
at build time, so a typo fails the build instead of silently doing nothing.

A synthetic fixture proves **determinism and no-change-under-refactor**, never correctness — its values are
chosen, not recorded. Every one carries `"synthetic": true` in its header. The recorded matrix in plan 0.2 is
still the ceiling on parity confidence.

### Phase 0.4 result

`tools/fixtures/gen1/gen1-yellow-smoke.fixture.jsonl.gz` (DEPRECATED/gen1 Yellow: new game → wild battle →
BROCK → reset → second attempt, 25 checkpoints) run twice against the copied gen1:

- **all nine applicable oracles green**, including three split CSVs, `data/overlay_settings.json`,
  `data/Yellow/Venomoth/{metrics,settings}.json` and the OBS marker sequence
  `OUT - NOBODY`, `IN - BROCK`, `OUT - BROCK`, `RESET`;
- the deliberate-break test passes: `font-size: 68px → 67px` on `.gametimeClock` is caught by oracles 1 and 2
  at every checkpoint, and renaming the `case "BROCK"` split trigger is caught by oracle 3
  (`Y-Venomoth-1-simple.csv` present in the baseline, absent in the broken build) and oracle 4.

Still outstanding for a full Phase 0 exit, both blocked on things outside the harness:

- **recorded fixtures** for the 0.2 matrix (decision 6: Scott records them). Until then the only recorded
  fixture is gen2 Crystal, and gen1-vs-gen1 parity rests on the synthetic fixture.
- **legacy baselines** (0.4) and the Electron 37 boot check for gen2–5 (checklist step 8): both need ports
  8085/30158/30159 free, i.e. PokeAByte, Super Shuckie and the running overlay closed.
