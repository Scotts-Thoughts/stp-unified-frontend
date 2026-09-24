# External contracts the unified app must preserve

Everything in this file is an interface that some *other* program depends on. None of it is
visible in a screenshot, so the parity harness (see `parity-harness.md`) records each one as an
oracle. Changing any of these is a feature change and needs Scott's sign-off.

Sources verified on 2026-09-10: `A:\Dropbox\stp-projects\programs\queuer` (Mirror Move: `main.js`,
`FRONTEND_LAUNCH.md`, `CLAUDE.md`, `fixture_recorder.js`), `A:\Programs\supershuckie`,
`A:\Dropbox\stp-projects\programs\fury_cutter`, `A:\Dropbox\stp-projects\programs\compare_gym_splits`,
gen1 sources, `%APPDATA%\PokeAByte\Mappers`.

## 1. Recording queuer (Mirror Move) — launch protocol

The queuer auto-launches one frontend per queue item and drives it over HTTP. It is the main
consumer of the overlay and the reason the unified app cannot change any of the following without a
matching queuer change (queuer changes are allowed, but must land in the same step, see plan Phase 3.6).

| Aspect | Today (gen1–5) | Where |
|---|---|---|
| Launch | `spawn("npm", ["run","dev"], {shell:true, detached:true})` in `FRONTEND_CONFIGS[gen].dir` | `main.js` `FRONTEND_CONFIGS`, `spawnFrontend` |
| App names | `stp-generation1-overlay`, `stp-generation2-overlay`, `stp-generation3-overlay`, `gen4-overlay-app`, `gen5-overlay-app` (= `package.json` `name` = `%APPDATA%\<name>`) | `FRONTEND_CONFIGS` |
| Window placement | Queuer pre-writes `%APPDATA%\<name>\dev-window-state.json` `{bounds, isFullScreen:true}`; every frontend reads it in `is.dev` mode only | all five `main.js` |
| Readiness | Polls `GET http://127.0.0.1:30159/status` for up to 120 s, expects `{ready:true,…}` | `ensureOverlayFrontendRunning` |
| Shutdown | `GET /quit` (gen2–5; `window.close()` after 200 ms), then `taskkill /pid <pid-on-30159> /T /F`, then tracked PID | `shutdownOverlayFrontend` |
| Gen detection | Substring match on the **mapper path** (`detectGenContext`); gen3 is the fallback | `main.js:1301` |
| Game verification | `/status.selected_game` must equal `expectedSelectedGameFromMapperId(mapperId)`, else `GET /set-game?game=<expected>` | `main.js:652` |

**Unified app requirement:** one entry `FRONTEND_CONFIGS.unified = { dir: "A:\\Programs\\stp-unified-frontend", name: "stp-overlay" }`
and `detectGenContext` returning `genKey: "unified"` for every mapper. The `dev-window-state.json` handling must be
kept verbatim in the unified `src/main` (it already exists in gen1's main).

**Status (2026-09-11, plan 3.6):** the queuer-side change is `docs/queuer-unified.patch` -- the `unified` config
entry, a `USE_UNIFIED_FRONTEND` switch that makes `detectGenContext` return `genKey: "unified"` while the
`isGen1/2/4/5` flags keep steering the per-generation call shapes, and `detectRunningFrontendGen` recognising the
unified overlay by `/status.app === "stp-overlay"`. It is **not applied**: the queuer's working tree carries
uncommitted edits, so the patch is for Scott to apply (`git apply docs/queuer-unified.patch` in the queuer
folder) and dry-run in Test Mode and Capture Fixtures mode before switching the default (decision 12). The
unified app's `package.json` name is `stp-overlay` (3.0.0), so `%APPDATA%\stp-overlay` is where the queuer's
window-state file goes; the app reads it in dev and, additively, when packaged.

## 2. Overlay control server — `http://127.0.0.1:30159`

gen2–5 each run `http.createServer` **inside the renderer** (`frontend.js`). gen1 has **no** control server;
the queuer's `isGen1` guards skip *some* of its calls there (the column below is read off `configureOverlay`
in its `main.js`, 2026-09-12 -- it is not "everything but `/set-starter`"). The unified app moves the server
to the main process (one implementation, `src/main/control-server.ts`) and must answer every route below
with the same semantics. Port 30159 is single-tenant: only one overlay can run at a time.

The queuer's `overlayFetch` **throws** on a connection failure or a non-2xx reply, and
`configureAndVerifyOverlay` gives up after three attempts. So against the legacy gen1 a queue item never got
past `/set-starter`; against the unified app gen1 answers every call, and its `/status` is polled like any
other generation's. A route's error reply is `{ ok: false, error }` with the HTTP status on the response
(400, 404, 500), never in the body -- `tools/parity/diff.ts` oracle 6 compares the bodies.

### Routes the queuer calls (in call order for one item)

| Route | Query | Gen guard in queuer | Effect |
|---|---|---|---|
| `GET /status` | – | all | `{ ready, selected_game, starter or starterString, right_panel or right_ui, hpType, … }` |
| `GET /set-game` | `game=<name>` (URL-encoded, may contain `&`) | gen2–5 | sets the game dropdown; queuer waits 1 s then re-reads `/status` |
| `GET /set-starter` | `species=` | all (the legacy gen1 had no server: the fetch failed and the item stopped) | selects the solo species |
| `GET /set-hidden-power` | `type=` | not gen1 | |
| `GET /set-nature` | `nature=<Adamant|…>` (a `simple_natures` name) | gen3-5 (gen3's 2026-09 addition, ported to gen4/5; the queuer calls it since 2026-09-18, after `/set-hidden-power`) | sets the Nature dropdown; `/status` reports it as `nature` |
| `GET /set-ability` | `ability=<Torrent|…>` (one of the current starter's abilities; matched ignoring case and spacing, so the queuer's "Lightning Rod" hits the overlays' "Lightningrod") | gen3-5 (2026-09-20 addition to all three legacy apps; the queuer calls it after `/set-nature`, before `/refresh`) | sets the Abilities dropdown, stored under the overlay's own spelling; `/status` reports it as `ability`. 400 when the name is not one of the starter's abilities (the reply lists them) |
| `GET /set-shuckie-counters` | `enabled=true|false` | not gen1 | |
| `GET /set-show-tutor-moves` | `enabled=` | not gen1, not gen2 | |
| `GET /set-unobtainable-moves` | `mode=<Always Cross Out|…>` | not gen1 | |
| `GET /set-automatic-post-battle-splits` | `enabled=` | not gen1 | |
| `GET /set-counters` | `bonk=false&repel_counter=false` | gen2 only | |
| `GET /refresh` | – | all -- gen2: after `/set-counters`; gen4: **before** `/set-evolution`; gen1/3/5: **after** it | reload styles for the starter |
| `GET /set-evolution` | `enabled=true&species=` / `enabled=false&species=` | not gen2 (gen1 gets it like gen3/5; the unified gen1 answers `ok: false, unsupported: true`) | **gen4: after `/refresh`; gen1/gen3/gen5: before `/refresh`** |
| `GET /set-right-panel` | `panel=Battle Graphic` (gen1/2/3) or `panel=Automatic` (gen4/5) | all | gen1 has no "Battle Graphic" mode: the unified app takes it as `Automatic` and reports `Automatic`, which the queuer's gen1 verification rejects -- `docs/queuer-unified.patch` sends gen1 `Automatic` |
| `GET /set-splits` | `mode=First|Followup` | all | |
| `GET /load-split-file` | `file=<absolute path>` (a CSV the queuer's user dragged in, `encodeURIComponent`ed; since 2026-09-23 also a Super Shuckie `.replay`, by extension) | only with `item.splitFile` | loads a previous run's splits for comparison; the unified main process reads the path as it is (`src/main/splitComparison.ts`: a CSV as `fs.readFileSync` + the legacy columns, as gen2-5 did; a `.replay` through its bookmark section, section 5) and hands the rows to the active generation's route as `__splits`, the file's name as `__source`. A replay it cannot read (format v3/v4, never closed) is a 500 with the reason. The reply body is unchanged: `{ ok, splits_loaded }` |
| `GET /new-run` | – | all | same as the F23 hotkey / "New Run" button |
| `GET /reload` | – | all | `location.reload()` after 200 ms |
| `GET /quit` | – | gen2–5 | `window.close()` after 200 ms |

### `/status` field names differ per gen (the queuer branches on them)

| Field | gen2 | gen3 | gen4 | gen5 |
|---|---|---|---|---|
| starter | `starter` | `starterString` | `starter` | `starter` |
| right panel | `right_panel` | `right_panel` | `right_ui` | `right_ui` |
| game | `selected_game` (`this.game_selection`) | `selected_game` (`this.gameSelection`) | `selected_game` | `selected_game` |
| evolution | – (no concept) | yes | yes | yes |
| hidden power | `hpType` | `hpType` | `hpType` | `hpType` |
| nature | – | `nature` (`pkmnNature`) | `nature` | `nature` |
| ability | – | `ability` (`pkmn_ability`, the overlay's own spelling) | `ability` | `ability` |

**Unified `/status`:** return the union — `starter` **and** `starterString`, `right_panel` **and** `right_ui`,
plus `app: "stp-overlay"`, `generation`, `mapper_path`. The queuer's existing per-gen branches then keep
working unchanged, and a later queuer cleanup can key on `app`.

### Expected `selected_game` strings (from `expectedSelectedGameFromMapperId`)

`"Black 2"`, `"White 2"`, `"Black"`, `"White"`, `"Platinum"`, `"HeartGold and SoulSilver"`, `"Diamond and Pearl"`,
`"FireRed and LeafGreen"`, `"Emerald"`, `"Crystal"`, **`"Gold & Silver"`** (ampersand — this is also the split folder
name), `null` for gen1 (Yellow / Red and Blue are set from the mapper automatically).

These strings are the `GameModule.editions` / game-select values and the on-disk split folder names. They are
**not** the mapper `game_name` values (see `mapper-matrix.md`).

## 3. Super Shuckie — `http://127.0.0.1:30158`

Used by gen1 (`useEmulatorStatsStore`, poll every **10 ms**) and by gen5's `ShuckieTimer`.

| Call | Shape (from `supershuckie-frontend-webserver/src/lib.rs`) |
|---|---|
| `GET /stats` | `{ time_current: number|null, total_elapsed_frames: number, is_playing_back: bool, is_playback_finished: bool, counters: { playerResets?, blackout_counter?, … }, … }` |
| `POST /mark-start` (optionally `?offset=`) | start the emulator-side timer |
| `POST /mark-end` | end it |
| `POST /increment-counter?name=X[&by=Y]` | bump a counter |
| `GET /bookmarks` | `{ replay, state: "none"\|"recording"\|"playback", generation, editable, bookmarks: [{ id, name, in_frame, … }], … }` |
| `POST /add-bookmark?name=X&type=T&frame=F` | a replay bookmark; `T` is created on first use. Needs Super Shuckie's `replay-bookmarks` branch (format v5); older builds 404 |

**Bookmarks at every chapter marker** (all generations, `core/logic/shuckieBookmarks.ts`): each OBS chapter
marker (§4) is also added to the replay being recorded or played back, named exactly like the chapter, on the
`total_elapsed_frames` read from `/stats` when the marker fired. Types are by kind of marker: `IN`/`OUT` →
BATTLE, `Map Change` → MAP CHANGE, `Text Box` → TEXT BOX, `MENU`, `Item` → ITEM, `Held Item` → HELD ITEM,
`New Move` → NEW MOVE, `Move Change` → MOVE CHANGE, `Level Up`/`Battle Level Up` → LEVEL UP, `Rare Candy Used`
→ RARE CANDY, `Special` → SPECIAL, `Turn`, `Next Pokemon`, `Enemy Fainted`, `RESET`, `BLACKOUT`, gen3's
`LABEL - MOVE` → TM MOVE and `LABEL - VICTORY` → VICTORY; anything new gets its kind in capitals. During
playback a marker is skipped when the replay already has a bookmark of that name within 300 frames that has
not answered for another marker in this pass (a seek back starts a new pass), so playing a replay again adds no
duplicates. Playback writes change the replay file and upgrade a pre-v5 replay in place. The **Shuckie
Bookmarks** switch (global user state `shuckie_bookmarks`, default on; gen1's Interface panel, gens 2-5 under
Show Advanced Settings) turns it off.

**Split bookmarks** (2026-09-23, all generations, `src/shared/splitBookmarks.ts`,
`addSplitBookmark` in `core/logic/shuckieBookmarks.ts`): every simple split the autosplitter writes to
its CSV is also added to the replay, typed `SPLIT` and named `SPLIT - <trainer> - HH:MM:SS`, or
`SPLIT - <trainer> (<instance>) - HH:MM:SS` where a generation tells repeat fights apart (gen4's n-th
Rival / Cyrus / HGSS Elite Four rematch, gen5's trainer id). `<trainer>` is the key the overlay keeps in
`current_splits` for the split (gen1 "Rival3-SS Anne", gen5's normalised "Cress"), the time is the CSV's
`real_time_hmmss` to the second (the Shuckie timer when that is on), hours always present, no
centiseconds. No OBS chapter goes with it (the battle's OUT marker is the chapter; oracle 8 sets split
bookmarks aside). On playback a split bookmark dedupes by its name less the time, so a replay played back
on the local timer does not double it. Under the same switch as the chapter-marker bookmarks.

**The panel during playback** (`core/stores/useReplaySplitsStore.ts`): while `/stats` reports
`is_playing_back`, the right panel's current-run column is the playing replay's `SPLIT` bookmarks at or
before `total_elapsed_frames` -- the last per trainer(+instance), in frame order -- instead of the
autosplitter's `current_splits`, so a scrub to any point shows the splits reached by then. The store
polls `/stats` every 250 ms and `/bookmarks` when `bookmark_generation` moves, retries a dead server
every 5 s, and does nothing with the Shuckie Bookmarks switch off. The autosplitter's own pushes and
CSVs are unchanged. The harness stub always reports `is_playing_back: true`, so under the harness the
panel is bookmark-driven from the bookmarks the app itself adds.

Failures are swallowed and throttled, so the app runs without Shuckie. The harness stubs this server
(replaying the fixture's `F` frame samples as `total_elapsed_frames`) and logs every POST as an oracle.

## 4. OBS WebSocket 5 — `ws://localhost:4455`

gen1 `logic/obs.ts` opens a throw-away socket per marker and sends `CreateRecordChapter`
with `chapterName` = `IN - <battle.trainer.class>` / `OUT - <battle.trainer.class>` (URL and password
overridable via localStorage keys `obs_websocket_url`, `obs_websocket_password`).
Consumers: `fury_cutter.py` (cuts battles from markers; recognises `IN - X` / `OUT - X` after stripping
leading `$%#`, and also plain `Battle` / `Overworld` names) and the StreamUP chapter-marker OBS plugin.
gen2 additionally documents "critical item" and "new move" chapter markers (`CRITICAL_ITEM_CHAPTER_MARKER.md`,
`NEW_MOVE_CHAPTER_MARKER.md` in the gen2 repo) — port those names byte-for-byte.

The harness runs a tiny OBS WebSocket stub (Hello → Identify → Identified, then records every
`CreateRecordChapter`) so the marker sequence per fixture is an oracle.

## 5. Split CSV files

gen1 writes, **relative to `process.cwd()`**:

```
./splits/<GamePath>/<Species>/attempts/<L>-<test_>?<Species>-<N>-simple.csv
./splits/<GamePath>/<Species>/attempts/<L>-<test_>?<Species>-<N>-full.csv
./splits/<GamePath>/<Species>/attempts/<L>-<test_>?<Species>-<N>.csv            (deprecated format)
./splits/<GamePath>/<Species>/attempts/<L>-<test_>?<Species>-<N>-battleSummary.csv
./splits/<GamePath>/<Species>/finishes/…   (copies on run completion)
./splits/<GamePath>/<Species>/refilmed/{attempts,finishes}/…   (refilming mode)
```

`<GamePath>` is the game name (`Yellow`, `Red and Blue`, …), `<L>` the edition letter (`Y`/`R`/`B`).
4,822 historical files exist under `A:\Programs\gen1-stp-frontend\splits\`; older ones lack the `<L>-`
prefix. gen2–5 folder names: `Crystal`, `Gold & Silver`, `HGSS`, `Platinum`, `Black`, … (confirm in
the per-gen inventories, Phase 2.1).

Consumers: `compare_gym_splits` reads `<Species>-<N>-simple.csv` and requires columns `trainer_name` and
`real_time_hmmss`; the overlay's own "Split Comparison" / `previous_splits`; the queuer's `/load-split-file`.

**A replay as the comparison** (2026-09-23): the overlay's "Load replay / split file to compare" button
(gen1: the right-panel settings; gens 2-5: the button that loaded a CSV) and `/load-split-file` accept a
Super Shuckie `.replay` as well as a CSV. Its `SPLIT` bookmarks (section 3) are the rows, read from the
file's bookmark section without Super Shuckie: `src/shared/replayBookmarks.ts` reads the 2048-byte header
(`NIDO`...`RINA`, `replay_version` at 0x004, `packet_stream_end` at 0x3A8) and the `SSBM` section at
`packet_stream_end` -- format v5 and later, closed files only; the recorder's `UnsignedInteger`,
`ByteVec`/`String` and raw `u32` encodings, the blake3 hash unverified. A v3/v4 replay or one whose
recording was never closed is refused with the reason (open it in Super Shuckie and add a bookmark, or
convert it, first). The loaded file's name is kept beside the rows (`previous_splits_source`, per
generation) and shown under the button.
Byte-identical output for a replayed fixture is the behavioural oracle (wall-clock columns handled by the
fake clock, see `parity-harness.md` §5).

**Unified app:** keep the same relative layout but resolve it against one explicit *app root*
(dev: repo root; packaged: directory of the executable) instead of the implicit cwd, and copy the five
legacy `splits/` trees into `stp-unified-frontend/splits/` once (Phase 3.7). The queuer spawns with
cwd = repo dir, so behaviour is unchanged for it.

## 6. Persistence locations (migration sources)

| App | Where user data lives today | Notes |
|---|---|---|
| gen1 | `%APPDATA%\stp-generation1-overlay\data\overlay_settings.json`, `data\<game>\<species>\{settings,metrics}.json`; `./storage/Storage.json` (577 KB, cwd-relative, read-only migration source); `localStorage` for `current_splits`/`previous_splits`, OBS url/password, sprite-scale overrides | already the target format |
| gen2 | `localStorage` (`MyStorage`), leveldb 3.0 MB | `%APPDATA%\stp-generation2-overlay\Local Storage\leveldb` |
| gen3 | `localStorage`, leveldb 17 MB. **`storage/Storage.json` in the repo is 0 bytes** (the plan's "Storage.json" claim is wrong for gen3) | `%APPDATA%\stp-generation3-overlay\…` |
| gen4 | `localStorage` (`MyStorage` + `style_settings_manager`), leveldb 13 MB | `%APPDATA%\gen4-overlay-app\…` |
| gen5 | `localStorage`, leveldb 7.9 MB, plus `gen5stylesettings.zip` (1.9 MB) in userData | `%APPDATA%\gen5-overlay-app\…` |

**Decision 10 (Scott, 2026-09-10): one file-based mechanism for everything; the unified app never uses `localStorage`.**

Implemented for gen1 on 2026-09-10 (plan 1.10). The four things gen1 kept in `localStorage` --
`current_splits`, `previous_splits`, `obs_websocket_url`/`obs_websocket_password`,
`enemy_sprite_styles_enabled` and the `enemyScale_<Species>` overrides -- are now
`%APPDATA%\stp-overlay\data\user_state.json`, **under the same key names**, so the Phase 2.6 importer can
copy LevelDB records into it without a translation table. `core/persistence/userState.ts` reads the file once
before the overlay mounts and serves every later read from memory, because the call sites (a render path, and
the OBS marker helper) are synchronous; writes are debounced 250 ms with a `beforeunload` flush, which is the
trade gen4 already makes. The one-time import of every legacy app's `Local Storage` -- gen1's own included --
is built (2026-09-12, `src/main/importLegacy.ts`): the file is one section per generation (`format: 2`) plus
a `global` one, and each section is seeded once from its legacy profile's LevelDB, read from a copy.

Shipped style defaults are per-species JSON in the repo (written back by dev-mode runs, as the legacy apps do with
`default_style_settings.js`); user state is under userData. The unified app's userData is `%APPDATA%\stp-overlay\`.
Because Chromium's `localStorage` is origin-scoped
and lives in LevelDB, the importer (Phase 2.6) reads a *copy* of each legacy `Local Storage\leveldb`
folder with a LevelDB reader written for the purpose (`src/main/leveldb.ts`, no native module) and decodes
Chromium's `_<origin>` + `\x00` + format byte + key records (format byte 0 = UTF-16LE, 1 = Latin-1, for keys
and values alike). gen2-5 wrote under `file://` (they load `index.html` from disk); gen1 under
`http://localhost:5173`; the importer takes the app's origin with the most records first and ignores
`devtools://devtools`. This is deterministic and tested (`npm run import:selftest`); it never opens the live
profile. gen1's `data\` tree is copied file-for-file.

## 7. keyhook.exe

Binary only (no source anywhere on disk). `md5 73db8f5278d94b21e6fc1beea09b144e`, 373,946 bytes,
identical in the gen2 and gen3 repos; **removed from the gen1 repo in commit `996d031` (2026-09-10)**, so
gen1 dev currently runs without hotkeys unless the exe is placed next to the project. gen1 looks in
`process.cwd()`, then `process.resourcesPath`, then PATH. Stdout protocol: lines `down,keyCode,time`
(`1`/`0`, Win32 VK code, ms). The unified app vendors it at `resources/keyhook.exe`, spawns it once from
main, and forwards events over IPC.

## 8. PokeAByte — `http://localhost:8085`

REST (`GET /mapper`, `POST /mapper/set-property-value/`, `/mapper/set-property-bytes/`,
`/mapper/set-properties-by-bits/`) and the SignalR hub `/updates` (`PropertiesChanged`, `MapperLoaded`,
`InstanceReset`, plus `Error`/`Hello` no-ops). Details and the mock in `parity-harness.md` §3. The mapper
files come from the `PokeAByte/mappers` git checkout in `%APPDATA%\PokeAByte\Mappers`; which mapper each
frontend targets is in `mapper-matrix.md`.

## 9. Out of scope, but sharing infrastructure

`A:\Dropbox\stp-projects\programs\frontends\` holds **stale** clones of gen1–5 (older HEADs of the same GitHub
remotes — never use them as inputs), plus `poketcg-frontend`, `tcg_frontend` and `race-frontend` (plain HTML
overlays, not Electron) and an unrelated January 2025 React/Vite project that is also called
`stp-unified-frontend`. None of these are inputs to this plan. The TCG mapper (`STANDARD/gen1/pokemon_tcg.xml`)
is therefore not a supported game.
