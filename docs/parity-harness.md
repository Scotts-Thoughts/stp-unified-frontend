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

### Determinism is not free — twelve things the runner has to do

Getting two identical runs to agree took twelve fixes; each is commented where it is handled, and any change to
the runner has to keep all twelve. Items 5–10 were added on 2026-09-10 during Phase 1, after the first four
turned out to leave a flake that reproduced in roughly every other pair of runs: the on-screen timer's
hundredths digit differed at 5 of 25 checkpoints (oracles 1 and 2), with an identical virtual clock at every
capture. Item 11 is the one that was actually behind that flake all along (items 7 and 8 narrowed it without
closing it; see 8); item 12 is gen4's own variant of it. Each capture now records `virtualNow` (the renderer's `Date.now()`), `hubRx` (hub frames it
had processed) and `ticks` (the fake clock's tick counter, whose multiples of 16 are the animation-frame grid)
in `meta.json`, and `diff.ts` compares all three — so if this class of problem returns, the report names the
cause instead of listing its symptoms.

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
5. **Wait for the hub frames to be *received*, not just written** (`barrier()` + `installHubReceiptProbe()` in
   `run.ts`). Item 3's CDP round trip drains the renderer's task queue, which is not the same as the WebSocket
   having delivered anything: `mock.pushChanges()` writes to a socket, and that pipe has no ordering with
   respect to CDP. The mock counts the frames it writes to the connected client
   (`SignalRHub.sentToCurrentClient`), an init script counts the ones the renderer receives on `/updates`
   (`window.__hubRx`), and the barrier waits for the second to reach the first — which is what makes item 7
   mean anything, since "drain first" is not a thing you can express without it. Only `/updates` is counted:
   the overlay also opens a socket to the OBS stub, and counting those would let the barrier pass on frames the
   mapper never sent.
6. **A real task boundary before reading the DOM** (`flushRender()` in `capture.ts`). Vue writes the DOM from a
   microtask; `page.evaluate` resolves over CDP without guaranteeing that microtask ran, so a capture could
   read text one frame stale. `MessageChannel` is the primitive to use, because `page.clock` does not fake it —
   a faked `setTimeout(0)` would never fire while the clock is paused, and a microtask chain cannot outlast the
   queue it is on.
7. **Drain before the clock sweep, not only after it** (the first `barrier()` in `settleFor`). This is the one
   that actually closed the flake. The batch loop calls `mock.pushChanges()` and goes straight into
   `settleFor`, whose `settle()` starts a 1,200 ms `clock.runFor` immediately — so the hub frame arrives while
   that sweep is in flight, and `Date.now()` inside the property handler returns whichever intermediate value
   the sweep has reached. Which one depends on real-time interleaving. A run that starts its timer from a
   property change therefore stamped `metrics.timer.started_at` a few milliseconds apart between two otherwise
   identical runs, which is why the difference was ~10 ms and not a whole 16 ms frame, and why `virtualNow` and
   `hubRx` were identical at every capture: the harness fed both runs the same input at the same clock, and the
   app read the clock mid-advance.

   Two earlier attempts are worth recording because they *look* like fixes and are not. Draining only after the
   sweep (item 5 as first written) leaves the window open. And offsetting the sample by a millisecond to avoid
   landing on a 16 ms boundary is built on a false premise — `settle()` advances 1,200 ms, which is itself a
   multiple of 16, so *every* capture lands on a boundary, not just the flaky ones.
8. **Every clock step the runner makes is a whole number of frames** (`WARM_UP_STEP_MS = 192` in `run.ts`).
   Item 7 removed the mid-sweep read but the hundredths digit still flipped between runs, and the explanation
   this was built on — that the fake clock schedules `requestAnimationFrame` 16 ms from whenever the chain
   started, so a chain anchored in an odd 200 ms step (200 mod 16 = 8) ticks out of phase with one anchored in
   an even step — turned out to be wrong: the clock schedules every frame for the next multiple of 16 of its
   *tick counter* (`getTimeToNextFrame() = 16 - ticks % 16` in playwright-core's `clock.ts`), so a chain is on
   the grid whenever it starts. The pairs of runs that agreed after this change agreed by luck (item 11). The
   192 stays: it is harmless, and a step that is a whole number of frames is the easier one to reason about.
   Every other advance is fixed by the fixture or already a multiple of 16 (`settle` 1,200; `extraFrame` 32).
9. **Park the pointer** (`page.mouse.move(0, 0)` after the reload). The Electron window is a real window under
   the real desktop cursor, and Chromium re-evaluates `:hover` whenever layout changes under a stationary
   pointer. A range slider that happened to sit under the cursor was captured in its hover colours
   (`rgb(0,88,156)` fill, `rgb(229,229,229)` track) for six checkpoints of one run and its normal colours
   (`rgb(0,120,212)` / `rgb(239,239,239)`) in the next — a pixel-only difference with identical styles and text.
   (0, 0) is the corner of the full-screen background canvas, which nothing styles on hover. Then
   `Input.setIgnoreInputEvents` (CDP) makes the page ignore the desktop entirely: a later run captured every
   panel's text *selected* for two checkpoints — someone at the keyboard, and the run's window is a real
   1920×1080 window on their screen. Nothing in a run needs real input.
10. **A clean legacy run refreshes the app tree, and every capture settles CSS transitions first**
   (`prepareSandbox` in `targets.ts`, `finishAnimations()` in `capture.ts`). Legacy apps rewrite
   `default_style_settings.js` inside the tree they run from (known-legacy-bugs.md #25), so the second run of a
   sandbox started from the first run's edits — `attempt_number` 2, a different split file name. And
   `page.clock` does not touch the compositor: gen2's battle graphic fades in over a `<transition>`, and a
   capture mid-fade read `opacity: 0.668895` in one run and `0.768907` in the next. Every capture now finishes
   finite animations before reading styles, on both sides of a comparison, so the captured state is the
   transition's end state. The barrier also waits for in-flight `fetch`es (`window.__pendingFetch`), which is the
   third real-time pipe after IPC and the hub socket.

11. **Pin the animation-frame grid** (the init script after `clock.pauseAt()` in `run.ts`). The fake clock
   fires `requestAnimationFrame` on multiples of 16 of its tick counter, and the tick counter of the re-created
   document is not zero at the pause: `page.clock` records each call with the Node-side `Date.now()` of the
   call and *replays* that log in every new document, and between the `install` entry and the `pauseAt` entry
   the replay advances the ticks by the real milliseconds that separated the two calls — a few ms of CDP round
   trips, different every run (`_replayLogOnce` in `clock.ts`). Two runs then have frame grids a few ms apart,
   and an overlay timer that samples `Date.now()` on every frame reads a different instant at every capture;
   the hundredths digit shows it wherever a 10 ms boundary falls between the two grids, which for a 2–5 ms
   offset is 4–10 of gen2's 22 checkpoints — the exact shape of every flake in this list. Found after the
   unified gen2 port was one hundredth *behind* the legacy baseline at four checkpoints in two runs and at ten
   in a third, with `timer_startTime`, `virtualNow` and `hubRx` identical at every one. The init script runs
   before the app's first line: it reads the tick counter (`performanceNow()`), runs the clock forward to the
   next multiple of 16 (no timers exist yet, so nothing fires) and puts the wall clock back to `recordedAt`
   (`setSystemTime`). The grid is now at `recordedAt + 16k` in every run, and `meta.json`'s `ticks` proves it.

12. **Route `setImmediate` through the fake clock** (the init script after the grid pin in `run.ts`). Node's
   `setImmediate` is not among the functions `page.clock` fakes, and gen4's timer hops through it on every
   frame (`setImmediate(() => requestAnimationFrame(updateTime))`). Between two fake timers the clock yields
   to real time once (`_callFirstTimer` awaits a real `setTimeout(0)`), and a real `setImmediate` queued by the
   frame callback races that yield: when it loses, the clock has already advanced past the next frame
   boundary before the next frame is requested, the timer skips a frame, and the hundredths digit lags by one
   frame -- `.20` against `.22` at one checkpoint of one run, with `virtualNow`, `hubRx`, `ticks` and
   `timer_startTime` all identical. Routed through the (fake) `setTimeout` it fires one virtual millisecond
   after the frame, which is what "immediately, before the next frame" means to the app, on both sides.

   Also in this family: `clock.install()` is now given `recordedAt - 1000` and `pauseAt()` `recordedAt`. The
   pre-reload document's clock runs on real time between the two calls, and an app with a 10 ms poll (gen4's
   Shuckie interval) carried it past `recordedAt` before `pauseAt()` landed -- "Cannot fast-forward to the
   past", once in a few runs. With the install a second earlier the pause is always a forward move there; the
   re-created document replays the log and takes `recordedAt` from the `pauseAt` entry regardless.

Collecting the whole `userData` tree is a thirteenth trap: Chromium's own profile (DIPS, `DevToolsActivePort`, the
DPAPI-encrypted `Local State` key, the leveldb log framing, the Dawn caches) differs byte-for-byte between
identical runs. `run.ts` collects only what the app writes, and `localStorage` is compared from the page dump.

### Where the layout oracle is rooted

Element paths (oracle 1) are relative to where the overlay proper starts, because above it the legacy apps
and the unified shell differ by design (the shell's `<keyhook>` div, a `v-if` sibling that is or is not
rendered): the first `.mainContainer` for gen1 and gen2, and for an overlay without one (gen4, whose
top-level elements sit directly in its `v-else` wrapper) the element directly under `#app` that holds the
first background canvas -- the legacy wrapper, or the lifted component's root, which is why the shell mounts
the overlay component as a direct child of `#app` with no wrapper of its own. The root element itself is
keyed `""` and its rect is compared, so a shell that moved the overlay would still show.

### `unified@<dir>`: the no-change check against the previous commit

A refactor is proven not to change a generation by capturing the baseline from the commit before it with
the *same* harness: `git worktree add <dir> <commit>`, build there (a `node_modules` junction is enough), and
run `unified@<dir>` on the fixture; then run `unified` on the working tree and diff. A baseline captured by
an older harness is not comparable once the capture format moves, and it has moved with nearly every harness
fix. The Phase 2 gen2 commit was checked this way for gen1 (see plan section 7c for what it found).

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
