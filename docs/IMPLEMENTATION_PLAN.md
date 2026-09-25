# STP Unified Frontend — Implementation Plan

**Revision 2 — 2026-09-10.** Revision 1 was written against gen4 `2272e83` and gen5 `18167a5`. This revision was
re-verified file-by-file against the current working trees (gen1 `996d031`, gen2 `dd0f402` on branch `2026`,
gen3 `d1ce779`, gen4 `a7d179c`, gen5 `e441d32`), PokeAByte 0.11.2 source, the recording queuer, and the first
recorded fixture. Corrections to revision 1 are marked **[r2]**.

**Revision 2.1 — 2026-09-10, after Scott's decisions.** Hack mappers are out of scope; the regular games keep exactly the
mappers they use today, but every property access goes through a **mapper translation layer** (`MapperProfile`, §2) so a
different mapper can supply the same data later. All persistence moves to one file-based mechanism (decision 10).
Assets stay in plain git (decision 11, my call). The remaining decisions proceed on the listed defaults (§5). The legacy
`default_style_settings.js` files are now committed (`inputs.lock.md`).

Companion documents (all in `docs/`):

| Document | What it holds |
|---|---|
| `external-contracts.md` | every interface another program depends on: queuer launch protocol and control server on port 30159, Super Shuckie, OBS chapter markers, split CSVs, persistence locations, keyhook |
| `parity-harness.md` | the mock PokeAByte wire protocol, fixture format as actually written, clock/isolation strategy, oracles, scripts |
| `mapper-matrix.md` | which mapper file each legacy overlay is written against and the three game-name flavours |
| `known-legacy-bugs.md` | 31 bugs/quirks (28 from the survey, #29-#31 found by the harness) and how each is preserved |

Working directory: `A:\Programs\stp-unified-frontend`.
Source directories `A:\Programs\gen1..gen5-stp-frontend` are **read-only inputs**. Nothing is ever edited there;
files are copied in. **[r2] The inputs are the working trees, not HEAD**: all four legacy apps rewrite
`app/lib/default_style_settings.js` (and `enemy_sprite_scales.js`) inside their own tree while running in dev
mode. Scott committed those files on 2026-09-10 (`inputs.lock.md` records the commits); if a tree is dirty again when a
phase starts, re-run the Phase 0.0 snapshot before touching anything. The Dropbox copies under
`A:\Dropbox\stp-projects\programs\frontends\` are stale clones and are **not** inputs.

Goals, in priority order:

1. Refactor onto the gen1 componentised structure (Vue 3 SFC + Pinia + TypeScript + electron-vite).
2. Migrate gen2–gen5 into that structure with **zero functional or visual change**.
3. Fuse into one app that runs every game, sharing one asset pool (union of all textures/sprites, deduplicated).

Hard rule for the whole project: **pixel and behaviour parity is verified by tooling, not by eye** (Phase 0.3).
"Behaviour" explicitly includes the external contracts: control-server responses, split CSV bytes, PokeAByte
writes, OBS chapter-marker names, Super Shuckie calls. Any difference that is not a measured no-op is a bug
unless Scott has approved it as a cross-generation congruence change.

---

## 1. Where the five codebases stand today

| | gen1 | gen2 | gen3 | gen4 | gen5 |
|---|---|---|---|---|---|
| Toolchain | electron-vite 4, Electron **37.2.3**, Vue **3.5.17** SFC, Pinia 3, TS, `@microsoft/signalr` 7.0.14 | plain Electron **25.9.8**, vendored Vue **3.2.47** (runtime compiler) + SignalR 7.0.4 | Electron 25.2.0, same vendored libs | Electron 25.9.8, same | Electron 25.9.8, same + `node-key-sender` |
| Main app file | `components/frontend.js` 344 + ~34 components/stores | `app/frontend.js` 6,750 | `app/scripts/frontend.js` 8,292 | `app/frontend.js` **10,140** [r2] | `app/frontend.js` **10,465** [r2] |
| Template | SFCs + 9 template-string components | `app/index.html` 1,158 | `app/index.html` 2,010 | `app/index.html` **1,414** [r2] | `app/index.html` **1,176** [r2] |
| CSS | `style-yellow.css` 2,940 | `style.css` 4,828 | `style.css` 3,333 (+ `animations.css` 87, **never loaded** [r2]) | `style.css` **3,858** [r2] | `style.css` 3,938 |
| Games selectable | Yellow / Red and Blue (auto from mapper); editions Yellow, Yellow Legacy, Red, Blue | Crystal, Gold & Silver (dropdown; **game logic hardcoded to Crystal** [r2]) | Emerald, FireRed and LeafGreen (box-art grid [r2]) | Platinum, HeartGold and SoulSilver, Diamond and Pearl (box-art grid) | Black, White, Black 2, White 2 (box-art grid) |
| Mapper family (see `mapper-matrix.md`) | `DEPRECATED/gen1` (`meta.gameName`) | `DEPRECATED/gen2` (`meta.gameName`) | `ST/gen3/*_ne` (+ DEPRECATED FRLG); identity read from three places | `ST/gen4/*_ne` or `STANDARD/gen4` (`meta.game_name`) | `STANDARD/gen5` (`meta.game_name`) |
| Mapper paths read / written | 199 / 6 (`patch.wEarlyEncounters`, `patch.encounter_flags.*` via setBits) | 325 / ~25 (`patch.hStpCatchRate`, `hChosenStarter`, `wStarterHiddenPowerType`, 18 encounter flags…) | 279 / ~15 (dual `stp_vars.*` and `patch.*` paths) | 252 / 49 + 4 dynamic (26 `patch.FLAG_FORCE_*` via setBits, bag/moves/stats) | 197 / 22 + 2 dynamic (`patch.encounter_*`, `decrypted_mon_0` bytes, bag) |
| State/persistence | Pinia → `%APPDATA%\stp-generation1-overlay\data\**\*.json`; `./storage/Storage.json` read-only migration source; localStorage for splits/OBS | `MyStorage` → `style_settings_manager` → localStorage + dev-mode rewrite of `default_style_settings.js` (**1,114,883 lines / 26.6 MB**) | same mechanism (`default_style_settings.js` 3,649 lines); **`Storage.json` is 0 bytes and dead** [r2] | same (3,967 lines) | same (4,966 lines) + 29.8 MB `.backup` |
| Control server `127.0.0.1:30159` | **none** | yes, in renderer (15 routes) | yes (16 routes: +`/set-evolution`, `/set-show-tutor-moves`, −`/set-counters`) | yes (16) | yes (16) |
| IPC channels | `settings_dir` | **none** | `set-game-icon` [r2] | `set-game-icon` | `set-game-icon` |
| Images on disk | 494 MB | 513 MB / 685 files | 1.1 GB / 1,186 | 678 MB / 969 | **718 MB** / 4,384 (3,441 inventory sprites, **unused** [r2]) |
| OBS chapter markers | hand-rolled obs-websocket v5 (`IN - X` / `OUT - X`) | hand-rolled, 15 marker kinds (Item, New Move, RESET, BLACKOUT…); dead CDN `obs-websocket-js@4.0.3` | hand-rolled (probes `GetRecordStatus` first) | hand-rolled | hand-rolled |
| Super Shuckie | `useEmulatorStatsStore` polls `/stats` every 10 ms | flags only | flags only | flags only | `ShuckieTimer` component |
| Hotkeys (keyhook.exe stdout) | F13–F19, F23, F24 | F13–F20, F23, F24 | F17–F24 (**F20 bound twice**) | F13–F20, F23, F24 (F17–F19 inert) | F13–F19, F22–F24 (F17–F19 mean different things) |
| Native/extra | keyhook spawned from renderer (exe removed from repo 2026-09-10) | keyhook, ROM patching (catch rate, starter, hidden power, early encounters), backport importer that appends to data files, Style Mode | keyhook, abilities, natures, evolution splits, Castform/Deoxys forms, `pointers.*` state detection, VS Seeker, trash cans | keyhook, encounter forcing by bit flags, Voltorb Flip grid, RNG NPC helper, 2023/2024 type-icon eras | keyhook + node-key-sender second screen, alternate forms incl. Kyurem, encounter forcing by name, party-mon byte rewrite, bag rewrite |

**[r2] All five OBS integrations are hand-rolled raw WebSockets** — revision 1's "OBS WebSocket is gen5-only" was wrong.

Key observations that shape the plan:

- gen1's refactor is the target shape but is **not finished**: `frontend.js`, `keyhook.js`, `state.js`, `no_mapper.js`,
  `exp_bar.js`, `settings/interface_1.js`, `settings/encounters.js`, `splits_first.js`, `splits_followup.js` are still
  template-string components; `methods/`, `settings/pokemon_settings.js`, `createWatchedObject.js` (×2),
  `logic/temp/`, `data/deprecated_autosplitter.js`, `data/keyhook.js`, `battle_summaries/test`, `app/style-yellow.css`
  are dead. Its renderer still `require`s `fs`/`path`/`child_process`/`crypto` in 11 places.
- gen1 already anticipates multi-gen: `PokemonGame`, `GameDexes` (ten dexes, Gen 1–4), `trainers`, `moves` and `tmhm`
  keyed by generation, `PokeData.setGame()`. Gen 5 and the hack games are missing. This is the seam the registry is
  built on — but `meta.gameName` is also used as a **data key** (`autosplitter[game]`, split folder), so those strings
  are preserved as-is.
- **[r2] gen4 and gen5 are twins only at the infrastructure level**: `main.js` 86 %, `gameHookMapperClient.js` 88 %,
  `style.css` 90 % shared, but `frontend.js` 59 % and `index.html` 45 % (CRLF-normalised diff). gen5 adds an
  alternate-forms system, raw `pkmn_ram` battle reads, `decrypted_mon_0` writes, a `ShuckieTimer` component and an
  object-shaped `textures.js`. Plan for "gen5 reuses gen4's skeleton", not "gen5 is a reskin".
- gen2 is the closest to gen1: same DEPRECATED-mapper vocabulary (`patch.*`, `screen.tiles.*`, `battle.yourPokemon.*`,
  `player.badges.badgeN`), no natures/abilities, no box-art screen. gen3 is the outlier (`pointers.*`, `stp_vars.*`,
  `player.bag.*`, three game-identity sources with five string forms).
- **[r2] All four legacy `frontend.js` files share one boilerplate lineage**: the `KeyHook` class, `MyStorage` proxy,
  `logData()`/`logCopy()`, the control server, the OBS marker function, the timer. These are the first things that move
  to `core/`, once, with per-gen differences captured as data (hotkey table, status field names, folder names).
- **[r2] Every gen instantiates its own vendored mapper client**; md5s: gen2 = gen5 (`c88e212c…`, 446 lines),
  gen3 (`ca567d23…`, 453, adds `disconnect()`), gen4 (`e3890569…`, 421, `response.ok` checks), gen1 TS port. The
  differences are four hunks; they unify trivially (Phase 3.3).
- Data duplication is heavy and mostly **dead**: three RSE dex copies and a 1.6 MB `platinum.js` in gen3; `platinum_moves`
  triplicated and `platinum_trainers` loaded twice in gen4; ≈230 k lines of gen4 data plus a 29.8 MB backup in gen5 that
  nothing loads; `g2trainers.js` orphan twin in gen2; `cross_generation_moves.js` (24,749 lines) in gen1/2/4/5.
  `A:\Dropbox\stp-projects\programs\data_objects` is the upstream generator for most of it, but the frontends carry hand
  edits — per-gen data is ported verbatim now and consolidated only after parity (decision 14).
- **[r2] Textures**: 116 unique filenames case-sensitively, **95 case-insensitively — 21 case-only pairs** (revision 1
  listed two), and **21 filenames whose bytes differ between gens**. `textures.js` has five incompatible shapes: gen1
  `'Bug 1'` → path, gen2 lowercase `'bug'`, gen3 `'Bug'`, gen4 `'Bug'` (39 entries), gen5 `'Bug'` → **object with
  per-texture default background settings** (28 entries). A plain folder merge or a plain key union would silently
  change looks.
- **[r2] The queuer (Mirror Move) is the primary consumer** and drives every overlay over HTTP on port 30159 with
  per-gen field names (`external-contracts.md` §1–2). Revision 1 did not mention it.

---

## 2. Target architecture

```
stp-unified-frontend/
  package.json                 one app: name "stp-overlay", version 3.0.0
  electron.vite.config.ts
  electron-builder.yml         single build; per-game .ico switching at runtime
  resources/                   keyhook.exe (md5 73db8f52…, from gen2), icons/<game>.ico
  src/main/
    index.ts                   window (1920×1080 content, zoom-to-fit, dev-window-state.json — verbatim from gen1)
    paths.ts                   app root (dev: repo; packaged: exe dir) — replaces implicit process.cwd()
    control-server.ts          http 127.0.0.1:30159, union /status, routes from external-contracts.md §2
    keyhook.ts                 spawns resources/keyhook.exe once; forwards "down,keyCode,time" over IPC
    ipc.ts                     settings_dir, app_root, splits read/write/copy/list, data read/write, set-game-icon, obs-auth-hash
  src/preload/
  src/renderer/
    main.ts                    boot: connect mapper -> registry.detect(meta) -> load GameModule -> mount
    App.vue                    <GameSelect/> (box-art grid, all gens) | <Overlay :module/>
    core/                      generation-agnostic
      mapper/                  GameHookMapperClient (one copy), MapperAdapter, property-path helpers
      stores/                  gen1 stores made game-agnostic (read through adapter + GameModule)
      logic/                   PokeData, Timer, PubSub, battle math, obs (chapter markers), shuckie (stats client)
      autosplitter/            engine + CSV writers (logData/logCopy variants selected by GameModule)
      persistence/             userData JSON files; legacy importers (gen1 files, gen2–5 LevelDB localStorage)
      hotkeys/                 useHotkeys(): binds GameModule.hotkeys to the IPC key stream
      components/              shared SFCs (left/right panel, game area, settings, popups, timer)
      styles/base.css tokens.css
    games/
      registry.ts              mapper path/identity -> GameModule (lazy import per generation)
      gen1/ gen2/ gen3/ gen4/ gen5/
        index.ts               GameModule (below)
        adapter.ts             maps mapper.properties -> normalised state; declares flavour + read/write path lists
        hooks.ts               run/split/state-machine hooks that are inline in each frontend.js today
        data/                  dex, trainers, moves, tm/hm, natures, abilities, splits, sprite scales, style defaults
        components/            generation-specific SFC variants (only where the DOM differs)
        style.css              verbatim-ported rules, scoped under .gen-N
    public/images/ fonts/      merged asset pool (Phase 4); font files from every gen, @font-face names per gen
  storage/                     shipped defaults (extraResources)
  splits/                      consolidated split archives (Phase 3.7; git-ignored)
  tools/parity/ tools/assets/  harness + asset merge
  tools/fixtures/ tools/baselines/
  docs/
```

**GameModule** (the contract every generation implements) — **[r2] extended**:

```ts
interface GameModule {
  id: "gen1" | "gen2" | "gen3" | "gen4" | "gen5";
  generation: 1 | 2 | 3 | 4 | 5;
  /** Mapper profiles (translation layer): the mapper file(s) this module ships with today, plus any added later. */
  mappers: MapperProfile[];
  /** Mapper game-name strings this module accepts (data keys: GameDexes, autosplitter, split folder for gen1). */
  games: string[];                                     // ["Yellow", "Red and Blue"], ["Crystal", "Gold and Silver"], ...
  /** User-selectable editions = the queuer's `selected_game` vocabulary and the box-art grid entries. */
  editions: { name: string; boxArt: string; splitFolder: string; splitPrefix: string; icon: string }[];
  features: { abilities; natures; physicalSpecialSplit; doubleBattles; badgeBoosts; expBar; repelCounter; bonkCounter;
              voltorbFlip; fling; inventorySprites; romPatching; evolutionSplits; forms; secondScreen; shuckieTimer;
              styleMode; backportImporter; rngHelper; vitamins; ... : boolean };
  adapter: MapperAdapter;                              // reads/writes canonical keys, resolved through the active MapperProfile
  hooks: RunHooks;                                     // reset / new-run / blackout / run-finished / split triggers / chapter markers
  data: { dex; trainers; moves; tmhm; splits; spriteScales; typeChart; natures?; abilities?; forms?; textures: TextureVocabulary };
  defaultStyleSettings: () => Promise<Record<string, StyleProfile>>;   // per-species profiles from the snapshot
  styles: () => Promise<void>;                         // dynamic import of games/genN/style.css
  components?: Partial<Record<Slot, Component>>;
  hotkeys: HotkeyTable;                                // F-key -> action, exactly as today incl. quirks
  control: { statusFields: (state) => Record<string, unknown>; routes: Set<Route> };   // per-gen /status names + supported routes
  persistence: { legacyAppName: string; importLegacy(store: LegacyStore): UnifiedData };
  logCopyVariant: "gen1" | "gen2" | "gen3" | "gen4" | "gen5";
}
```

**Mapper translation layer [r2.1]** — Scott's requirement: keep today's mappers, but make it possible to extract the same
data from a different mapper later without touching overlay logic.

```ts
interface MapperProfile {
  id: string;                                           // "gen2/crystal-deprecated"
  pathPatterns: RegExp[];                               // /^DEPRECATED\/gen2\/pokemon_crystal_deprecated\.xml$/
  identity: { source: "property" | "mapperMeta"; path?: string; values: string[] };   // meta.gameName = "Crystal"
  reads: Record<CanonicalKey, PropertyRef>;             // "player.party[0].species" -> { path: "player.team.0.species" }
  writes: Record<CanonicalWrite, WriteRef>;             // "patch.catchRate" -> { path: "patch.hStpCatchRate", kind: "value" | "bytes" | "bits" }
  transforms?: Record<CanonicalKey, (raw: unknown) => unknown>;   // glossary / enum normalisation
  unsupported?: CanonicalKey[];                         // keys this mapper cannot provide -> the feature flag turns off
}
```

Rules: stores, hooks and components never mention a mapper path; they read **canonical keys** (named after what the
overlay means, `battle.enemy.hp`, not after the mapper) through the adapter. A profile is data, one file per mapper
(`games/genN/mappers/<id>.ts`). Each generation ships exactly one profile per game today — the mapper in
`mapper-matrix.md` — and parity is proven against it. Adding a STANDARD-mapper profile later is a new profile file, a
new fixture and a parity run, with no logic change. Canonical keys are shared across generations wherever the meaning
is the same, so gen1's set is extended, not duplicated. The harness's write-log oracle checks each profile's `writes`.
No profile is registered for hack mappers (decision 8).

Stores stay singular and generation-agnostic. Anything a store currently hard-codes about Gen 1 (stat names, badge
lists, exp formulas, the RIVAL/BROCK split trigger list, the `"NINTEN"` name check, the Hall-of-Fame tile check, the
Alakazam-Yellow exception) moves into `games/gen1/hooks.ts` or `GameModule.data`.

**Persistence rule (decision 10, Scott 2026-09-10)**: one file-based mechanism for everything; `localStorage` is retired.
The shape follows what the legacy overlays do today, minus the blob:
- **Shipped defaults** are per-game/per-species JSON in the repo (`games/genN/data/style/<Game>_<Species>.json`, generated
  from the committed `default_style_settings.js` files). Exactly like the legacy dev mode, a dev-mode run writes style
  edits back into those repo files so they land in git — one species per file, so diffs stay readable.
- **User state** (metrics, run config, splits comparison, OBS url/password, sprite-scale overrides, `selected_game`,
  starter) lives in `%APPDATA%\stp-overlay\data\…` as gen1 does now; a packaged build writes style overrides there too.
- Acceptance: everything the legacy apps persist survives a restart in both `npm run dev` and packaged mode; the
  app-data oracle checks it. (The queuer launches with `npm run dev` on origin `http://localhost:5173` while packaged
  builds run on `file://`, which is why origin-scoped `localStorage` cannot hold anything.)

---

## 3. Phases

### Phase 0 — Scaffold and safety net

**0.0 Snapshot the inputs [r2].** `docs/inputs.lock.md` records each legacy repo's HEAD and working-tree state. It was
regenerated after Scott committed the style files: all five trees are clean as of 2026-09-10 12:14. Re-run the snapshot
whenever a phase starts; if a tree is dirty, copy the dirty files to `tools/inputs/<gen>/` with their sha1 first. From
here on, the harness only ever runs legacy apps from **copies** (0.3), never from `A:\Programs\genN-*`, because dev-mode
runs rewrite those files.

**0.1 Copy gen1 in**: `src/`, `electron.vite.config.js`, `tsconfig*`, `package.json`, `README.md`, `storage/`, `icon.png`.
Exclude `node_modules`, `out`, `dist`, `splits`, `app/style-yellow.css` (stale), `src/renderer/Major Refactor.txt`.
`keyhook.exe` is **no longer in gen1** — take gen2's (identical to gen3's) into `resources/`. `git init`; add
`.gitignore` (`node_modules/ out/ dist/ splits/ tools/fixtures/raw/ tools/reports/ tools/baselines/
tools/sandbox/`); the first commit is the pristine gen1 copy plus `docs/` so every later diff is reviewable.
**[corrected 2026-09-10]** revision 2 ignored only `tools/baselines/**/*.png`. It has to be the whole tree:
oracle 1 records every computed property of every element, so one checkpoint's `styles.json` is ~16 MB and one
gen1 fixture run is ~400 MB. Baselines are re-captured, never reviewed as text.
**Assets stay in plain git (decision 11).** The legacy repos already track their images in git (gen1's `.git` alone is
1.8 GB), so this changes nothing about `clone → npm install → npm run dev` and adds no LFS quota or tooling. Rules that
keep the history from bloating: images are only ever *added*, never rewritten in place (a changed texture gets a new
file name); the merged pool lands in **one** commit per gen after the merge tool is final (Phase 4); baseline PNGs, raw
fixtures, sandboxes and `tools/reports` are git-ignored; `git clone --filter=blob:none` is documented for fast clones.
Fallback if the repo passes ~3 GB: `git lfs migrate import --include="src/renderer/public/images/**"` (git-lfs 3.7 is
installed on this machine).

**0.2 Record mapper fixtures** with the queuer's Capture Fixtures mode (`A:\Dropbox\stp-projects\programs\queuer`,
`fixture_recorder.js`). Format and measurements are in `parity-harness.md` §2; corrections to revision 1:
- there is a fifth record type `P` (path registered mid-run); `E` deltas carry only `{value, bytes}` and the replayer
  reconstructs `fieldsChanged`;
- **measured size is ~285 KB per 108 s → ≈20 MB gzipped per two-hour run**, not 100–300 MB. Full runs are committed
  as-is; the prune/extract layers are for iteration speed, not storage;
- **the mapper matters**: each fixture must be recorded with the mapper the legacy overlay actually uses
  (`mapper-matrix.md`): DEPRECATED for gen1/gen2, `ST/gen3/*_ne` for gen3, `ST/gen4/*_ne` for gen4, STANDARD gen5.
  The harness refuses a fixture whose header `meta.path` is not in the target GameModule's mapper list.

Recording matrix (one full replay each, plus short clips for edge states as they come up):

| gen | mapper | edition | notes |
|---|---|---|---|
| 1 | `DEPRECATED/gen1/pokemon_yellow_deprecated.xml` | Yellow | reset + new game early in the run, at least one blackout |
| 1 | `DEPRECATED/gen1/pokemon_red_blue_deprecated.xml` | Red or Blue | |
| 2 | `DEPRECATED/gen2/pokemon_crystal_deprecated.xml` | Crystal | ✅ `c-wigglytuff-2-11311` (108 s test capture) — a full run still needed |
| 2 | `DEPRECATED/gen2/pokemon_gold_silver_deprecated.xml` | Gold & Silver | exercises bugs #1–#2 |
| 3 | `ST/gen3/pokemon_emerald_ne.xml` | Emerald | |
| 3 | `ST/gen3/pokemon_firered_leafgreen_ne.xml` | FireRed and LeafGreen | VS Seeker, trash cans, evolution split |
| 4 | `ST/gen4/pokemon_platinum_ne.xml` | Platinum | Voltorb Flip, RNG NPC, FLAG_FORCE writes |
| 4 | `ST/gen4/pokemon_heartgold_soulsilver_ne.xml` | HeartGold and SoulSilver | Johto flags, 2023 icon era profile |
| 4 | `ST/gen4/pokemon_diamond_pearl_ne.xml` | Diamond and Pearl | |
| 5 | `STANDARD/gen5/pokemon_black.xml` / `white.xml` | Black / White | a run with a form-changing species (Kyurem, Darmanitan) |
| 5 | `STANDARD/gen5/pokemon_black_2.xml` / `white_2.xml` | Black 2 / White 2 | tutor moves, bw2 badges |

**0.3 Build the parity harness** (`tools/parity/`, full spec in `parity-harness.md`). Summary of what changed from
revision 1:
- the mock speaks PokeAByte 0.11.2 exactly (`localhost:8085`, reflected-origin CORS, JSON SignalR hub `/updates` with
  `Hello`/`MapperLoaded`/`PropertiesChanged`/`InstanceReset`, **full property DTOs in every change**, byte arrays as
  numbers, the duplicated `"frozen"` token, `/mapper` serving *current* values because clients re-fetch every 60 s,
  write endpoints logged + applied + echoed);
- it also stubs **Super Shuckie** (30158) and **OBS WebSocket** (4455), and **blocks all other network** so hidden
  CDN dependencies (gen2's Google Fonts and obs-websocket-js tags) surface as failures instead of silent differences;
- **nine oracles** (styles+rects, pixels, split CSVs, app data, PokeAByte writes, `/status`, OBS markers, Shuckie calls,
  console errors);
- **fake clock** in the renderer (`page.clock`) advanced in lockstep with the replay, so timers, 250 ms save debounces
  and battle durations are deterministic and a two-hour fixture replays in minutes;
- **same-Electron baselines**: each legacy app is captured under its own Electron 25 *and* under Electron 37; pixel
  zero-tolerance applies between legacy@37 and unified@37, the 25↔37 delta is recorded once as renderer drift. Phase 0
  verifies each legacy app boots unmodified under Electron 37 (they use only `BrowserWindow`, `ipcMain`,
  `nodeIntegration`);
- **sandboxing**: legacy apps run from a copied tree (`tools/sandbox/<gen>/`, `node_modules`/`images` junctioned),
  with `APPDATA` and cwd pointed into the sandbox, `--force-device-scale-factor=1`, content size asserted 1920×1080;
- checkpoints are found by `scan-fixture` and replayed with a **lead-in from the last keyframe before the enclosing
  battle/state change**, so the apps' internal state machines see the same transitions.

**0.4 Baselines and self-parity [r2].** Capture gen1 baselines for every gen1 fixture (Electron 25 and 37 — gen1 already
runs on 37, so only one set), then run the *built* gen1 copy from the unified tree against itself. Exit criterion for
Phase 0: the harness reports zero differences for gen1-vs-gen1, and deliberately breaking one CSS value and one split
trigger makes it fail.

### Phase 1 — Finish the gen1 refactor (establish the base)

1.1 Convert the remaining template-string components to SFCs: `frontend.js` → `Overlay.vue` + `games/gen1/hooks.ts`
(the reset / new-run / blackout / split-trigger / run-finished / Alakazam-Yellow watchers); `keyhook.js` → `core/hotkeys`
+ `src/main/keyhook.ts`; `state.js` → `useGameStateSync()`; `no_mapper.js` → `GameSelect.vue` (Phase 3.2 replaces its
look); `exp_bar.js`, `settings/interface_1.js`, `settings/encounters.js`, `splits_first.js`, `splits_followup.js`.
1.2 Move the split lists (`data/autosplitter.js`) into `games/gen1/data/splits.ts`; engine stays in `core/autosplitter`.
~~Delete `deprecated_autosplitter.js` after confirming nothing imports it (it does not today).~~ **Corrected
2026-09-10: it *is* imported** — `autosplitter/autosplitter_functions.js:1` reads it for the `trainerName` column of
the Deprecated CSV variant, so it moved into `games/gen1/data/` with the other two tables instead of being deleted.
`autosplitter/split_trainers.js` (the right panel's display names) moved with them; `splits.ts` re-exports all three.
1.3 Delete `methods/`, `settings/pokemon_settings.js`, both `createWatchedObject.js`, `logic/temp/`, `battle_summaries/test`,
`data/keyhook.js`, `data/saved_settings.js` (if unreferenced), `Major Refactor.txt`.
1.4 Introduce `GameModule`, `registry.ts` (single entry: gen1 covering Yellow and Red and Blue) and the **mapper
translation layer**: two `MapperProfile`s (`DEPRECATED/gen1/pokemon_yellow_deprecated.xml`,
`DEPRECATED/gen1/pokemon_red_blue_deprecated.xml`) whose `reads` cover all 199 paths and whose `writes` cover the 6
write paths from `docs/gen1-inventory.md`; every store/component read goes through the adapter's canonical keys.
Detection keys on `/mapper` `meta.path` first, then the profile's identity property. Extend `PokemonGame` with
`"Black" | "White" | "Black 2" | "White 2"`. **Hack mappers (Yellow Legacy, Yellow 2024, Crystal Legacy) are not
registered (decision 8)**; loading one shows the game-select screen's "unsupported mapper" state instead of hanging.
1.5 Move `style-yellow.css` to `games/gen1/style.css` scoped under `.gen-1`; extract only the truly shared rules
(font-faces, `#app-container` scaling, resets) to `core/styles/base.css`. Parity: gen1 baselines vs new app.
1.6 Replace every renderer `require` with IPC or core modules [r2 — the full list]: `autosplitter_functions.js`
(fs/path → splits IPC), `stores/helper/files.ts` (fs/path → data IPC), `data/enemy_sprite_scale_manager.ts` (dev-mode
source write → keep dev-only, via IPC), `logic/Storage.js` + `legacyStorage.ts` (read-only legacy import → persistence
importer), `logic/obs.ts` (`crypto` → main-side hash or `crypto.subtle`), `components/keyhook.js` (child_process → main),
`methods/file_system_functions.js` (delete), `no_mapper.js` (`process.env.NODE_ENV` → build define). Same file formats
and paths for everything that already lives in userData.
1.7 **App root [r2]**: `./splits` and `./storage` are cwd-relative today. Resolve them against `paths.appRoot()` and keep
the same relative layout, so the queuer (cwd = repo) and a packaged exe both write where gen1 writes now.
1.8 **Control server [r2]**: implement `src/main/control-server.ts` with the union `/status` (`external-contracts.md` §2)
and the routes gen1 can honour (`/status`, `/set-starter`, `/set-game`, `/new-run`, `/reload`, `/quit`, `/refresh`,
`/set-right-panel`, `/set-splits`, `/load-split-file`, `/set-shuckie-counters`, `/set-automatic-post-battle-splits`).
gen1 has none today, so this is additive; the queuer's gen1 branch keeps skipping what it skips.
1.9 **OBS + Shuckie clients to core** with gen1 semantics (`IN - X` / `OUT - X`; 10 ms `/stats` polling; `mark-start`
on new run when `shuckie_timer`, `mark-end` on champion). The chapter-name strings are data on the GameModule.
1.10 Persistence to files (decision 10, approved): `current_splits`, `previous_splits`, `obs_websocket_url/password`,
sprite-scale overrides → `%APPDATA%\stp-overlay\data\…`, with a one-time import from gen1's `Local Storage`;
`LocalStorageProxy` is deleted. The app-data oracle covers all of it in both dev and packaged runs.

Exit: gen1 runs from the unified tree, every oracle green on every gen1 fixture, no dead directories, the queuer can
launch it via a temporary `FRONTEND_CONFIGS.unified` entry in Test Mode.

### Phase 2 — Per-generation migration (repeatable recipe)

Order: **gen2 → gen4 → gen5 → gen3** (unchanged; the survey confirms the reasoning).

For each generation N:

2.0 **Sandbox the legacy app [r2]**: copy to `tools/sandbox/genN/`, capture baselines under Electron 25 and 37 for every
genN fixture, plus a scripted control-server session (the queuer's exact call sequence for that gen from
`external-contracts.md` §2) whose `/status` responses become oracle 6.
2.1 **Inventory** `index.html` and `frontend.js` → `docs/genN-inventory.md`: region → component → status; every
`<script>`/`<link>` (vendored, CDN, fonts — gen2 has two CDN tags); `@font-face` families; hotkey table; control routes
and `/status` field names; chapter-marker names; localStorage key rules (`isStyleSettingsKey` logic differs per gen);
files written to disk; dead files (**do-not-copy list** seeded from `known-legacy-bugs.md` #15, #20, #27, #28).
2.2 **Data**: copy referenced `app/lib/**`/`app/data/**` files to `games/genN/data/`, `var X =` → `export const`. Prove
identity of apparent twins by hash before dropping (`platinum_trainers.js` = `trainers/platinum.js`; `platinum_moves.js`
vs `.json` differ only by `"Power": "-"` vs `0` — keep the referenced one). Cross-gen files go to `core/` only when
byte-identical across gens (`cross_generation_moves.js` is near-identical: 4 changed lines between gen4/gen5 — keep
per-gen). `default_style_settings.js` → per-species JSON under `games/genN/data/style/` from the **committed** file
(`inputs.lock.md`), generated by a script that also handles gen2's 26.6 MB file (decision 5.2 moved here because gen2
cannot load it as a module reliably). These JSON files are the shipped defaults that dev-mode runs write back to
(persistence rule, §2).
2.3 **Mapper profile + adapter**: one `MapperProfile` per mapper file the gen uses today (`mapper-matrix.md`), built from
the path inventory (gen2 325, gen3 279, gen4 252, gen5 197) with `reads` and `writes` declared separately — the harness's
write-log oracle checks the write list. Identity detection strings verbatim (gen3's five forms, gen4's seven accepted
names). Canonical keys are reused from gen1 wherever the meaning is the same (`player.party[i].species`,
`battle.enemy.hp`) and extended for gen-specific data (natures, abilities, forms, `pointers.*`), never duplicated.
2.4 **Logic**: port `frontend.js` methods/computeds into stores and composables one feature at a time. Features with no
gen1 equivalent become feature-flagged `core/` modules: abilities, natures, phys/spec split, evolution splits, forms
(Deoxys/Castform in gen3; the gen5 `POKEMON_FORMS` table incl. Kyurem), ROM patch writers (three mechanisms: gen2
value writes, gen3 dual-path, gen4 `setBits` bit flags, gen5 `patch.encounter_*`), Voltorb Flip (gen4 only; gen5's
vestige is not ported), RNG NPC helper, Style Mode, backport importer (decision 15), second screen (decision 9),
`ShuckieTimer`, Fling (inline versions; `fling.js` is dead). Per-gen rules (exp formulas, badge boost tables, crit rates,
blackout sentinels, split trigger lists, `logCopy` variant) live in `GameModule.data`/`hooks`.
2.5 **CSS**: copy `style.css` verbatim into `games/genN/style.css`, prefix every selector with `.gen-N` via PostCSS,
change no value, keep every `@font-face` name. Parity first; then fold byte-identical rules into `base.css`; log
value-only differences to `docs/css-congruence-candidates.md` for Scott. gen3's `animations.css` is **not** ported (dead,
all-zero keyframes) — its comments are kept as `docs/battle-timing-notes.animations.css`.
2.6 **Persistence migration**: `core/persistence/import-genN.ts` reads a *copy* of `%APPDATA%\<legacy app>\Local Storage\leveldb`
with a Node LevelDB reader, decodes Chromium's localStorage records, applies that gen's key rules (gen2: heuristic
`isStyleSettingsKey` + `this.*` auto-save keys + `user_*`; gen3: `<Game>_<Species>` prefixes; gen4: 26-key allowlist,
two layers; gen5: 29-key allowlist, three layers) and writes `data/<game>/<species>/{settings,metrics,style}.json`.
Runs on first launch when the unified data dir is empty (decision 3). Unit-tested against a copied leveldb fixture from
each real profile. Split folder names stay exactly what each legacy app writes (`Crystal`, `Gold & Silver`, `Emerald`,
`FireRed and LeafGreen`, `Platinum`, `HGSS`, `DP`, `Black`, …).
2.7 **Parity**: all nine oracles green for every genN fixture and the scripted control session. Commit.

Per-gen notes **[r2 — rewritten from the survey]**:

- **gen2**: no game detection (`version()` hardcodes Crystal); edition dropdown only affects split paths, and attempts
  vs finishes disagree (#2). `MyStorage` routes *every* key through the style manager with a 43-entry exclusion list.
  Backport importer writes to shipped data files (#26). 15 chapter-marker kinds incl. `Item - X` / `New Move - X` whose
  specs (`*_CHAPTER_MARKER.md`) end with porting checklists — copy those two docs into `docs/`. Two CDN tags (#4, #5).
  Repo root `index.html` is a Gen 1 file (#27). Texture keys are lowercase. `_fd.diff` is an already-applied artifact.
- **gen3**: `Storage.json`/`createWatchedObject` dead (#9) — persistence is `MyStorage` like the others. Game identity
  from three sources (#12); `ST/gen3` emerald mappers have **no** `meta.*` properties, so detection must use `/mapper`
  `meta.gameName` = "STP Pokemon Emerald". `set-game-icon` IPC exists here too. Duplicate F20 (#6), unreachable
  double-battle classes (#7), undefined `loggedRunsManager` (#8). Ruby/Sapphire: `gameVariables["Ruby and Sapphire"]`
  is an empty object and the game is not in `available_games` — keep data out, do not add a game. Splits under four
  folder names (#11). The most modular legacy code base (`methods/`, `logic/`, `components/`) — but the target is still
  gen1's structure. OBS implementation is the best of the five (probes `GetRecordStatus`).
- **gen4**: 26 `FLAG_FORCE_*` bits written with `setBits` in address-grouped batches (the mock must accept
  `/mapper/set-properties-by-bits/`); `deboucePath` on four paths (10-frame client debounce → harness settle time).
  Voltorb Flip 5×5 grid in the template. Two icon eras `2023/` + `2024/` and `type-icons-circular/`. F17–F19 inert (#13).
  `logCopy` takes `finishFileName` (#21). Root `scripts/` is empty; `docs/silencing-dev-warnings.md` is the only doc.
- **gen5**: alternate forms (`POKEMON_FORMS`, `BATTLE_ONLY_FORMS`, `baseSpeciesOf`, B/W vs B2/W2 gating), raw `pkmn_ram`
  battle reads, `player.decrypted_mon_0.setBytes(...)` party rewrite, bag/money rewrite, `options.text_speed` byte write,
  `patch.encounter_*` name-value encounter forcing (no `setBits`). `ShuckieTimer` Vue component + `logic/Timer.js` +
  `PubSub` (gen1 also has these three — reconcile to `core/`). `textures.js` entries are objects carrying default
  background settings (applied when a texture is picked — behaviour, not just a lookup). Only `2024/` icons. Second
  screen via node-key-sender (#16). ~230 k lines of dead gen4 data + 29.8 MB backup (#20). `logCopy` refilming variant (#21).
- **gen1**: `keyhook.exe` no longer in the repo (#23); `Yellow Legacy` edition exists but `PokeData.setGame` throws on
  that mapper (#22); gen1's `obs.ts`, `Timer.ts`, `PubSub.js`, `useEmulatorStatsStore` are the seeds of the core modules.

### Phase 3 — Fusion: one app, runtime game selection

3.1 Boot flow: connect mapper → `registry.detect(meta.path, properties.meta)` → lazy-load the GameModule (data,
style.css, style defaults) → `PokeData.setGame(game)` → stores load `<game>/<species>` data → mount `<Overlay>` with root
class `.gen-N`. On `InstanceReset`, tear down and return to `<GameSelect>`. **[r2] `selected_game` (edition) is a user
setting, distinct from the mapper-detected game**: gen3–5 choose it on the box-art grid and the queuer sets it via
`/set-game`; gen1 derives it from the mapper with an edition sub-choice; gen2's dropdown chooses Crystal vs Gold & Silver.
The registry validates edition ∈ module.editions.
3.2 Pre-mapper screen — **decided (Scott, 2026-09-02): the box-art grid** from gen4/5 for every generation, replacing
gen1/2's text. The grid lists all editions of all five gens (13 tiles). **[r2] gen1 and gen2 have no box-art images**
(`images/box_art/` exists only in gen3/4/5) — Scott supplies `1-Yellow`, `1-RedandBlue`/`1-Red`/`1-Blue`, `2-Crystal`,
`2-GoldandSilver` art in the same style (decision 16). Clicking sets edition + taskbar icon; the streamed overlay is
untouched.
3.3 One `GameHookMapperClient` = gen1's TS version + gen3's `disconnect()` + gen2/5's `try/catch` + gen4's `response.ok`
checks; `deboucePath` kept (gen4/5 use it); `Hello`/`Error` no-op handlers kept; bug #24 handling as listed.
3.4 Window and icon: `set-game-icon` IPC for all gens; icons copied from gen3/4/5 (`.ico` per game), gen1's `icon.png`,
gen2's `2-crystal.png` converted once to `.ico` (decision 16).
3.5 Packaging: single electron-builder target, `compression: store`, `extraResources: storage/**, resources/**`,
version 3.0.0. `dev-window-state.json` honoured in dev (as today) and, additively, when packaged.
3.6 **Queuer integration [r2]** (changes in `A:\Dropbox\stp-projects\programs\queuer`, same step, Scott's approval per
decision 12): add `FRONTEND_CONFIGS.unified = { dir: "A:\\Programs\\stp-unified-frontend", name: "stp-overlay" }`,
make `detectGenContext` return `genKey: "unified"` while keeping `isGen1/2/4/5` for the per-gen call shapes; the union
`/status` makes `verifyOverlayConfig` pass unchanged. Dry-run a mixed-gen queue in Test Mode and in Capture Fixtures
mode before switching the default.
3.7 **Splits consolidation [r2]**: copy the five legacy `splits/` trees (gen1 4,822 files, gen2 2,461, gen3 1,454, gen4/5
their current sets) into `stp-unified-frontend/splits/` preserving every folder name (including gen3's four); nothing is
renamed. The `/load-split-file` route and the "Split Comparison" button read from there.

### Phase 4 — Asset merge

4.1 `tools/assets/merge.ts`: walk all five image trees, hash every file, produce `manifest.json`
`{ relPath, sha1, size, foundIn: [gen…] }` and a size report (5 trees ≈ 3.5 GB; gen1 494 MB, gen2 513, gen3 1.1 GB,
gen4 678, gen5 718).
4.2 Copy rules (unchanged in spirit, corrected in scope):
- same relPath + same hash → once; same relPath + **different hash** (21 files: `bug/electric/fighting/fire/flying/ghost/
  grass/ground/ice/normal/poison/rock/water/psychic.png`, `Dragon.png`, `Dragon-neutral.png`, `dark.jpg`, `steel.jpg`,
  `Computer.jpg`, `Grass.jpg`, `Ice.jpg`) → first-seen keeps the name, later ones get `-genN`, manifest records the map;
- different relPath + same hash (gen3 `elements/textures` vs `textures`, `movepool_border` vs `movepool-border`,
  per-game sprite subfolders, gen3's placeholder image that appears under 14 names) → once + aliases;
- **21 case-only collisions** (`Dragon.png/dragon.png`, `Water.png/water.png`, `Computer.jpg/computer.jpg`, and every
  `<Type>.jpg/<type>.jpg` pair between gen3 and gen2/4/5) → the manifest lowercases nothing; it assigns distinct
  on-disk names and the per-gen texture vocabulary maps to them. Windows is case-insensitive, so this is enforced by
  the merge tool, not by convention.
4.3 **Texture registry [r2]**: `core/data/textures.ts` is generated from the manifest **and five vocabularies**, one per
gen, each preserving its own keys and shape (gen5's per-texture default settings included). Every game's picker shows
its own vocabulary first, then the other gens' entries with a suffix (decision 2). Saved style profiles resolve through
their gen's vocabulary, so nobody's saved look changes. gen2's `default_textures.js` (Capitalised type → `'Bug 1'`
labels) is part of gen2's vocabulary.
4.4 Sprite resolver `resolveSprite(kind, game, speciesOrForm)` with ordered lookup (game folder → generation folder →
shared) driven by the manifest; forms (gen3 Castform/Deoxys, gen5 table) resolve through the module's forms data.
Type icons: gen1 `elements/type-icons`, gen2–5 `type-icons/` (gen4 `2023/`+`2024/`, gen5 `2024/`), `type-icons-circular`
(gen2–5) kept as distinct sets. Split images, badges (gen3 `badge_boosts/{hoenn,kanto}` trees, gen5 `bw2/`), trainers,
stats backgrounds, box art likewise.
4.5 Fonts: union of gen1 (6 files incl. `OSB.ttf` and the Open Sans variable font), gen2/4/5 (4), gen3 (7 incl.
`LeagueGothic`); `@font-face` names per gen unchanged (gen3 registers `oseb`, `osb`, `titan`, `play`, `lgothic`).
gen2's Google Fonts link is replaced by the local files only if the inventory (2.1) proves no rule resolved to the web
font; otherwise the exact web-font file is vendored.
4.6 Inventory sprites (3,441, gen5, unused): included in the pool (decision 13 default).
4.7 Outcome: manifest + size report; expect roughly 3.5 GB → well under 2 GB once the placeholder duplicates,
per-gen copies of identical sprites and dead folders are gone (exact figure reported).

### Phase 5 — Cleanup, performance, docs

5.1 Performance (gen1 goal 2, applied everywhere): lazy-load generation modules and dex/trainer data (`import()` per
game; gen2's trainer tables alone are 2.8 MB); giant tables as JSON on demand; no deep watchers on style objects (watch
bound keys); fixed `<img>` dimensions; `will-change`/`transform` only where legacy CSS already animates.
5.2 Style defaults: per-species JSON generated in Phase 2.2 replaces the five `default_style_settings.js` blobs;
dev-mode edits write those JSON files (one species per file), packaged builds write userData overrides (decision 10).
5.3 README rewrite: structure, how to add a game, how to run the harness, how to record fixtures, how the queuer
launches the app.
5.4 Final parity run across all five gens and all fixtures; final asset manifest and size report; delete the
`tools/sandbox/` copies.

---

### Phase 6 — Decomposition of the lifted overlays (the 2.4 refactor proper) **[added 2026-09-25]**

Goal: `games/gen{2,3,4,5}/Overlay.vue` (6,860 / 8,614 / 9,775 / 9,743 lines) become composition roots the size of
gen1's `components/Overlay.vue` (203 lines) over the shared stores, `core/logic` and shared components, every
generation difference living in the `GameModule` (features, data tables, hooks, mapper profiles) or in a
per-generation component variant -- with zero functional or visual change, proven the way every phase before it was:
the nine oracles on every fixture of the affected generations, gen1's no-change check whenever `core/` moves, and
`parity:drift` + `typecheck` green at every commit. The detailed plan is the last section of this document
("Phase 6 plan"); the status table is 7g.

6.0 **The net**: the decision-6 recordings, one per generation, alongside the first slices; the synthetic scenarios
extended meanwhile; `beforeReplay` hooks and self-tests for the dev-mode paths no fixture reaches.
6.1 **Inventory, coverage, ledger**: `parity:members` (every data key, computed, watch and method with its class,
readers, cluster and drift status), per-member coverage per fixture, the quirk ledger; the seven flagged drift
entries were adjudicated on 2026-09-25 (§5, decisions 17-21).
6.2 **Template split, no DOM change**: fragment components cut at the legacy section comments, reading the overlay
instance through `inject` at first.
6.3 **Persistence**: the `MyStorage`-seeded data keys into a per-generation settings store and a species-settings
store, on the same user-state keys and the same write rules.
6.4 **`mounted` out**: `games/genN/hooks.ts` and `state.ts` (verbatim, order preserved), hotkeys through
`GameModule.hotkeys()`, intervals and listeners into `activate`/`deactivate`.
6.5 **Splits**: gen1's autosplitter engine in `core/autosplitter/` with each `splits.js` as a variant; a shared
`useSplitsStore` that gen1 adopts too.
6.6 **Shuckie and timer** onto `useEmulatorStatsStore` and `logic/Timer.ts` + `left_panel/timer.vue`; the four
template-string Timer/PubSub copies deleted.
6.7 **Canonical keys** for the mapper-shape drift (DEPRECATED vs STANDARD spellings); the members that only
differed by path then collapse into shared ones.
6.8 **Battle math** as typed `core/logic/battle/` functions over `GameModule.data` tables; the identical tables to
`core/data/`.
6.9 **Feature modules behind flags**: evolution families, forms, ROM patching and encounters, Voltorb Flip, the RNG
helper, the second screen, Style Mode, the backport importer, the item watchers.
6.10 **Right panel and movepool** components; the movepool's indexed lookup and the `movepoolResize` handler leak.
6.11 **Control routes and hotkeys on stores** (`/status` names per generation unchanged).
6.12 **Texture registry and sprite resolver** (4.3 and 4.4 resume here).
6.13 **Retire the monoliths**, the `MyStorage` shim and the mixins; `parity:drift` retargeted at the components.
6.14 **Exit**: `parity:all` on every fixture including the recordings, performance re-measured, docs.

---

## 4. Rules for the CSS refactor

- Port verbatim, scope with `.gen-N`, verify, then dedupe. Never the other way round.
- A rule may move to `base.css` only if the computed result on every gen is unchanged (the harness confirms this).
- Introduce a CSS custom property only when its value is already identical everywhere it is used.
- Value differences between gens are **reported**, not fixed: selector, property, per-gen value, screenshot crop.
  Scott approves each; approved ones become tokens.
- Font family, weight, style, and any structural change are never proposed.
- **[r2]** Templates move from Vue 3.2's in-browser compiler to Vue 3.5 SFC compilation. Both condense whitespace by
  default, but the harness's rect oracle is the arbiter; if a gen's inline layout depends on a whitespace text node,
  the SFC gets the explicit `whitespace: 'preserve'` compiler option for that component rather than a CSS tweak.

## 5. Decisions

Nothing in this section blocks any phase any more.

**Resolved by Scott (2026-09-02 and 2026-09-10):**

1. Pre-mapper screen — box-art grid for all gens. (3.2)
6. Fixture recording — the queuer's Capture Fixtures mode; Scott records the 0.2 matrix, one replay per row.
8. Hack mappers (`Yellow Legacy`, `Yellow 2024`, `Crystal Legacy`) — **out of scope, not implemented, not registered.**
   The regular games keep exactly the mappers they use today (`mapper-matrix.md`).
10. Persistence — one file-based mechanism for everything, `localStorage` retired; "as long as stuff saves" is the
    acceptance test (§2 persistence rule, 1.10, 2.6, 5.2).
— New requirement: a **mapper translation layer** so a different mapper can supply the same data in the future
  (§2 `MapperProfile`, 1.4, 2.3). Today's mappers are the only profiles shipped.

**Resolved by me at Scott's request:**

11. Asset storage — **plain git, no LFS** (0.1). The legacy repos already keep images in git, so the install stays
    `clone → npm install → npm run build → npm run dev`; add-only images and one commit per gen keep history small;
    `git lfs migrate` is the documented fallback.

**Proceeding on the default (Scott waved these through; say so if any should change):**

2. Texture display-name collisions → other gens' entries get a `"(Gen N)"` suffix in the picker. (4.3)
3. Legacy settings → imported from each old app's localStorage on first launch. (2.6)
4. Known legacy bugs (`known-legacy-bugs.md`) → preserved and listed; the harness proves the preservation.
   **Amended by decision 25 (2026-09-25):** game quirks are kept, code quirks are fixed.
5. Games with data but no selection (Ruby/Sapphire, gen2's Gold/Silver trainer table, Diamond/Pearl in gen4) → unchanged.
7. Hotkeys → per-gen F-key tables preserved including their quirks; a single unified table is a later feature.
9. gen5 second-screen toggle → ported behind `features.secondScreen`, documented as probably broken (#16).
12. Queuer edits (3.6) and dropping gen2's dead CDN tags (#4, #5) → done in Phase 3.6 / 2.1; the queuer change is
    shown to Scott when it lands, and the unified app runs with no network access at startup.
13. Inventory sprites → included in the pool.
14. Data provenance → per-gen data verbatim now; `data_objects` consolidation after parity as its own change.
15. gen2 backport importer → writes userData overrides, never shipped files.
16. gen1/gen2 box art → `icon.png` / `2-crystal.png` as placeholders until Scott supplies art in the gen3–5 style. **Done 2026-09-11:** every edition's tile is the box front from Scott's library (`A:\Dropbox\stp-projects\librariesox art`), resized to 400 px tall into `images/box_art/`; a paired edition (Gold & Silver, FireRed and LeafGreen, Diamond and Pearl, HeartGold and SoulSilver) is the two boxes side by side in one file. The window icons are still the legacy ones.

**Resolved by Scott (2026-09-25, the Phase 6 interview):**

17. Shuckie poll on a dead Super Shuckie → **keep polling, throttled** (gen1's store: every 10 ms while a Shuckie toggle
    is on, the error logged at most every few seconds, the timer picked up the moment Shuckie appears); gen5's
    stop-after-ten is not ported. (6.6)
18. Split rows → **no general dedupe**. gen5's `load_splits` rule exists for N, who is fought several times and whose
    final battle alone should register; it is gen5 data on the module, and gens 2-4 keep every row. (6.5)
19. Shuckie call logging → **errors only, everywhere**: `console.error` on a failed call, no success lines. (6.6)
20. `convertDurationToSeconds` → **guards a non-string and returns 0 silently** (gen5's), everywhere. (6.5)
21. `get_stat` → **a per-generation variant by design** (DVs and badges in gen2; IVs, natures, abilities, items and
    stages in gens 3-5); re-pinned with that reason, sharing only the pure helpers. (6.8)
22. gen4's `setImmediate` hop → **dropped**: one shared timer loop, gen4's fixtures re-baselined if the hundredths digit
    moves. (6.6)
23. Recordings → **alongside 6.1-6.3**, not before: the behaviour-free slices start now, a logic slice waits per member
    until a fixture covers it. (6.0)
24. Fixture storage → **committed under `tools/fixtures/`**, plain git (decision 11); about 20 MB per run. (6.0)
25. Legacy quirks (amends decision 4) → **two kinds**. *Game quirks* -- anything that mirrors a feature of the game, the
    game's own code, or how the game presents information (gen2's Special Defense badge rule is the model: pokecrystal's
    `BadgeStatBoosts` does exactly that and no other generation has it) -- are kept exactly, verified against the
    decompilations listed in `CLAUDE.md`. *Code quirks* -- inconsistencies that exist only because the five apps were
    written at different stages -- are technical debt and are streamlined and standardised whenever possible, each fix
    its own commit after the no-change one. Approved now: the crash class (#32, #34, #35, #37), the split-row data
    class (#33, #36) and the persistence and folder class (#45 with a key migration, #2, #11). The rule is in `CLAUDE.md`.
26. Visual scope → **none**: visuals stay per generation through Phase 6; §4's value differences are a later phase.
27. Pilot generation → **gen2**, then gen4, gen5, gen3; the recordings still to make follow that order after gen2's.

**Resolved by me at Scott's request (2026-09-25; say so if either should change):**

28. `features.forms` → **true for gen3** (Castform, Deoxys) **and gen4** (`forms.js`). Nothing reads the flags yet, and a
    flag that lies is worse than one nothing reads. (6.1)
29. Shared tables → a table **identical after whitespace normalisation** may move to `core/data/` (`natures.js`, gen3 =
    gen4); the inventory records the normalisation and the normalised fingerprint. Anything differing beyond whitespace
    stays per generation. (6.8)

## 6. Risks

- **Fixture coverage** is the ceiling on parity confidence; states not captured are not verified. The recording matrix
  in 0.2 is the minimum.
- **Renderer drift Electron 25 → 37** (font anti-aliasing, Skia) would make zero-tolerance pixel diffs impossible;
  mitigated by same-Electron baselines (0.3). If a legacy app will not boot on 37, that gen's pixel oracle uses
  tolerance mode and computed styles carry the claim.
- **Vue 3.2 runtime templates → 3.5 SFCs** may change whitespace/transition timing; caught by the rect oracle, fixed
  per component with compiler options, never with CSS.
- **Legacy apps mutate their own trees and share ports** (30159, 8085): never run them from `A:\Programs\genN-*` for
  baselines, never two at once.
- Windows' case-insensitive filesystem vs 21 case-only asset collisions; enforced by the merge tool.
- `nodeIntegration: true` renderers → IPC touches every file-writing path; covered by the CSV, app-data and write-log oracles.
- gen2's 26.6 MB `default_style_settings.js` cannot be loaded as a module; converted from the snapshot in 2.2.
- The five mapper client copies have drifted (four hunks, enumerated); unified in 3.3 with the harness proving no
  behavioural change.
- **Wall-clock dependence** (`Date.now()` in timers and CSV durations, 250 ms/500 ms/1 s save debounces): the fake clock
  is mandatory for byte-identical oracles; real-time mode is debugging only.
- gen2 needs the network at startup (fonts + a dead CDN script); the harness blocks it, so this surfaces in Phase 2.1.
- Repo size: plain git with ~2 GB of images after the merge (decision 11). Kept in check by add-only images, one
  commit per gen, and git-ignored baselines/fixtures/sandboxes; `git lfs migrate` is the fallback.

## 7. Phase 0 checklist (concrete, in order)

Status as of 2026-09-10, after the first implementation session.

1. ✅ `docs/inputs.lock.md` — all legacy trees clean, style files committed 2026-09-10. Re-verified at the
   start of this session: gen1 `996d031`, gen2 `d89003b`, gen3 `d3b7648`, gen4 `7225a85`, gen5 `1d4e361`,
   all clean.
2. ✅ Copy gen1 per 0.1; `git init`; first commit "gen1 pristine copy + docs" (`36b8bc1`).
   `.gitattributes` pins `* -text` at the root and replaces gen1's `src/renderer/.gitattributes`
   (`* text=auto`), because the oracles compare bytes and git must not normalise line endings on checkout.
3. ✅ `npm ci`, `npm run build` — the copied gen1 builds unchanged. `npm run dev` against a real PokeAByte
   is **not done**: PokeAByte was in use (see 8) and the harness drives the built app instead.
4. ✅ `tools/parity/mock-pokeabyte` — REST + hub per `parity-harness.md` §3. Smoke test went further than
   planned: `selftest.ts` drives **gen1's real `GameHookMapperClient`** against the mock (32 checks — the
   negotiate/handshake/`Hello`/`MapperLoaded`/`InstanceReset` lifecycle, the nested property tree, the
   `.change()` rules, all three write endpoints, live `/mapper` values, and the Shuckie/OBS stubs) and passes.
5. ⛔ **Blocked on Scott (decision 6).** No gen1 Yellow recording exists; the queuer's Capture Fixtures mode
   needs the emulator and a run. Substituted for now by a *synthetic* gen1 Yellow fixture built from the
   shipped `DEPRECATED/gen1/pokemon_yellow_deprecated.xml` (`tools/parity/make-fixture.ts`,
   `scenarios/gen1-yellow-smoke.json`, 1,496 properties, 25 checkpoints). It proves determinism and
   no-change-under-refactor; it cannot prove correctness. The 0.2 matrix is still the ceiling on confidence.
6. ✅ `tools/parity/run.ts` + `capture.ts` + `diff.ts` with oracles 1–5 and 7–9, the Shuckie and OBS stubs,
   the network block and the fake clock. **Oracle 6 waits for Phase 1.8** — there is no control server to
   script against yet; `diff.ts` already compares `status.json` when a run produces one.
7. ◐ Self-parity **proven for the unified tree against itself** (two runs, all oracles green, and the
   deliberate-break test fails exactly as specified: a 68px→67px CSS value trips oracles 1 and 2, a renamed
   `case "BROCK"` split trigger trips oracles 3 and 4). The *legacy* gen1 sandbox baseline is not captured
   yet — see 8.
8. ⛔ **Blocked on a quiet machine.** Ports 8085 (PokeAByte), 30158 (Super Shuckie) and 30159 (a running
   overlay) were held for the whole session. `npm run parity:preflight` names the holder of each.
   `--redirect-ports` works around 8085/30158/4455 for gen1 and the unified app, but not 30159, so the
   legacy gen2–5 baselines and the Electron 37 boot check still need those closed.
9. ✅ `docs/gen1-inventory.md`, generated by `tools/parity/inventory.ts`: **224 live paths, 36 written**,
   17 with `.change()` subscriptions, 3 more reached only from files Phase 1.3 deletes. This corrects the
   plan's "199 / 6": the settings panels reach the mapper through the injected `game_properties`, not
   `mapper.properties`, and `patch.hChosenStarter` is written by `interface_2.vue`.
10. ◐ Phase 0 is complete except for the two blocked items (5 and 8), both outside the harness. Phase 1 can
    start now: the synthetic fixture is a working regression net for the gen1 refactor.

## 7b. Phase 1 checklist

Status as of 2026-09-10, after the second implementation session. Every item below was verified by replaying
`tools/fixtures/gen1/gen1-yellow-smoke.fixture.jsonl.gz` against the built app and diffing all nine oracles
against a baseline captured at the start of the session (`tools/baselines/unified/gen1-yellow-smoke`, git-ignored).
1.1, 1.2, 1.5 and 1.9 are green against that baseline with **zero** differences at zero pixel tolerance.

1.10 is the one item that deliberately changes an oracle, and the exact change is: the per-checkpoint
`localStorage` dump goes from `{current_splits, previous_splits}` to `{}`, and
`files/appdata/data/user_state.json` appears holding the same values. That is decision 10 landing, not a
regression, and it is why Phase 1's exit baseline has to be re-captured after it rather than compared to the
one before it.

| # | What | Status |
|---|---|---|
| 1.1 | Template-string components → SFCs; `frontend.js` → `Overlay.vue` + `games/gen1/hooks.ts`; `state.js` → `games/gen1/state.ts` + `state.vue`; `no_mapper.js` → `GameSelect.vue` | ✅ no `const template` left anywhere |
| 1.2 | Split lists → `games/gen1/data/splits.ts` | ✅ (correction: `deprecated_autosplitter` is live, so it moved rather than being deleted) |
| 1.3 | Delete dead gen1 files | ✅ `6a11b50`, plus `components/autosplitter.js` (an empty stub) in 1.1 |
| 1.4 | `GameModule`, `registry.ts`, the mapper translation layer | ✅ `core/mapper/` (profile types + adapter), two identity profiles over the 224/36 inventory paths, `core/game/GameModule.ts`, `games/registry.ts`, `games/gen1/index.ts`; every read goes through the canonical view; `npm run parity:adapter` (13 checks) and the write-log profile check in the runner |
| 1.5 | `style-yellow.css` → `games/gen1/style.css` under `.gen-1` + `core/styles/base.css` | ✅ 12 rules base, 349 scoped, verified rule-for-rule and pixel-for-pixel |
| 1.6 | No `require` in the renderer | ✅ `b0d1d2b` |
| 1.7 | App root | ✅ `e610bc8` |
| 1.8 | Control server | ✅ `e610bc8` |
| 1.9 | OBS + Shuckie to `core/`, marker names to data | ✅ |
| 1.10 | Persistence to files, `localStorage` retired | ✅ the four `localStorage` consumers use `core/persistence/userState.ts`; the one-time import of gen1's own `Local Storage` was built with Phase 2.6's LevelDB reader on 2026-09-12 (`src/main/importLegacy.ts`, section 7c), where four more generations needed it, so it was built once. |

**How 1.4 landed.** gen1's paths *are* the canonical vocabulary, so both gen1 profiles are identity maps; the
adapter (`buildCanonicalView`) aliases declared **containers** to the mapper's real objects and leaves to the real
property objects, so `.value`/`.change()`/`.set()` are the same objects with the same timing, and dynamic accesses the
static inventory cannot see (`badges['badge' + x]`, `battle[side][stat]`) keep working. 36 declared keys are absent
from the shipped mapper files (`patch.battle_info.hits.*`); the legacy code reads every one optional-chained with a
default, so the view hands back `undefined` exactly as the raw tree did. Components still spell keys the way gen1's
mapper does — that is the identity profile, not a leak — and the four script blocks left as plain JavaScript stay
that way until Phase 2 settles the shared key shapes.

**Also outstanding before Phase 2 starts:** the CSS scoping done by hand in 1.5 has to happen four more times
(2.5). It was done here with a throwaway script plus a checker that re-parses both outputs and proves same
rules / same bodies / same relative order. Phase 2.5 should land that as a committed tool — the two bugs it
caught here (native CSS nesting flattened by a naive brace scan; `url()` paths breaking when the file moves
two directories deeper) will recur in every generation.

## 7c. Phase 2 status

Status as of 2026-09-11, third implementation session (continued).

**How a generation is migrated (the recipe as actually run, gen2 first):**

1. `tools/parity/inventory.ts` on the legacy app → `docs/genN-inventory.md` (2.1).
2. `tools/port/port-data.ts` copies every `<script src>` data file in as an ES module, one export per global
   (the path under `lib/` kept, cross-file globals imported), with `images/` strings pointed at the
   generation's tree under the renderer's image root (`images/genN/`); `tools/port/port-style-defaults.ts`
   turns `default_style_settings.js` into one JSON per species and `tools/port/port-enemy-scales.ts` the
   sprite-scale table into JSON; `tools/port/port-profile-paths.ts` writes the profile's path tables from the
   inventory (2.2, 2.3).
3. `MapperProfile`s from the inventory, identity maps plus the containers the dynamic accesses need (2.3).
4. **Lift, then refactor** (2.4). `tools/port/extract-template.ts` reads the legacy `#app` markup back out of a
   real Chromium as the browser-normalised `innerHTML` Vue's runtime compiler compiled, and
   `tools/port/lift-genN.py` turns the legacy component object into `games/genN/Overlay.vue` with the
   infrastructure swapped for core -- mapper client, storage, hotkeys, control server, OBS, split files, asset
   paths -- and *nothing else changed*; every seam is an asserted replacement. The decomposition of the
   6,750-line component into the shared stores is the refactor proper and is done afterwards, with the harness
   as the net, exactly as gen1's was in Phase 1. This is the plan's own rule for CSS ("port verbatim, verify,
   then dedupe") applied to the code, and it is what makes "zero functional change" a measured claim instead of
   a hope: the same code runs, and the legacy-vs-unified diff says so.
5. `tools/port/scope-css.py` scopes the stylesheet under `.gen-N` and proves the split lossless (2.5).
6. The layered style store on the file-backed user state (`core/persistence/styleSettings.ts`), with the
   generation's own key rules (2.6), and the first-launch importer of every legacy app's `localStorage`
   (`src/main/leveldb.ts`, `localStorageImport.ts`, `importLegacy.ts`; done 2026-09-12, see below).
7. Parity against the legacy app under the harness (2.7).

| gen | inventory | data | profiles | lift | CSS | persistence | parity vs legacy |
|---|---|---|---|---|---|---|---|
| 2 | ✅ 256 paths / 60 writes | ✅ 25 files + 40 style JSON | ✅ Crystal, Gold & Silver | ✅ `games/gen2/Overlay.vue` | ✅ 706 rules | ✅ (import deferred) | ✅ **all nine oracles green** on the recorded Crystal run (`c-wigglytuff-2-11311`, 22 checkpoints), three unified runs against a legacy baseline that two legacy runs agree on (2026-09-11) |
| 4 | ✅ 231 paths / 79 writes | ✅ 31 files + 383 style JSON + 506 sprite scales | ✅ Platinum, D&P, HG&SS (`ST/gen4/*_ne` and `STANDARD/gen4/*`) | ✅ `games/gen4/Overlay.vue` (10,607 lines) | ✅ 569 rules | ✅ gen4's key rule, style-field filter, 500 ms debounced write | ✅ **all nine oracles green, pixel-exact** on the synthetic Platinum fixture (`gen4-platinum-smoke`, 19 checkpoints), two unified runs against a legacy baseline two legacy runs agree on (2026-09-11) |
| 5 | ✅ 241 paths / 83 writes | ✅ 26 files + 327 style JSON + 669 sprite scales | ✅ Black, White, Black 2, White 2 (`STANDARD/gen5/*`) | ✅ `games/gen5/Overlay.vue` (10,641 lines) + its Timer/PubSub/timer components and form tables as ES modules | ✅ 570 rules | ✅ gen5's key rule, style-field filter, three-layer read, 1 s debounced write without flush | ✅ **all nine oracles green, pixel-exact** on the synthetic Black fixture (`gen5-black-smoke`, 14 checkpoints), two unified runs against a legacy baseline two legacy runs agree on (2026-09-11) |
| 3 | ✅ 212 paths / 76 writes | ✅ 42 files (+ `gameVariables.js`) + 303 style JSON + 387 sprite scales | ✅ Emerald, FireRed & LeafGreen (`ST/gen3/*_ne`) | ✅ `games/gen3/Overlay.vue` (8,990 lines) + its Timer/PubSub/timer component as ES modules | ✅ 490 rules | ✅ gen3's own store: `<Game>_` key rule, no `user_` layer, replace-on-write defaults | ✅ **all nine oracles green, pixel-exact** on the synthetic FireRed fixture (`gen3-firered-smoke`, 15 checkpoints), a unified run against a legacy baseline two legacy runs agree on (2026-09-11) |

**Phase 2 as of 2026-09-11 (evening): every generation is lifted and green** -- gen2 on the one real recording,
gen3/gen4/gen5 on synthetic fixtures, gen1 unchanged by the whole phase (the `unified@<worktree>` check). What
Phase 2 still owed, and has since been given (2026-09-12): the LevelDB importer (2.6, decision 3) and gen2's backport
importer (decision 15). Still owed: oracle 6's control-script sessions (`--control`, blocked on port 30159); real
recordings for gen1/3/4/5 (decision 6, Scott); and `npm run dev` for the lifted generations, whose images sit
behind the `out/renderer/images/genN` junctions until Phase 4 merges the pools.

**What the harness found while lifting gen2**, each of which would have been invisible to review and is now a
rule in the tools:

- A classic `<script>` runs in sloppy mode; an ES module is strict. gen2 assigns 25 names it never declares
  (`vitaminsUsed`, `g2gamestate`, `d`, `h`, `m`...), which were `window` globals shared across methods. The
  lift declares them as module-level `let`s, which preserves the sharing exactly.
- `this.mapper?.properties` (optional chaining) is not matched by a `this.mapper.` replacement; 30 reads went
  through it.
- `innerHTML` re-escapes `&` in attributes; Vue decodes either way but vue-tsc's template parser does not.
- gen1's `@font-face` for `oseb` declared at weight 700 next to gen2's at the default weight made gen2's bold
  text select the real 700 face where the legacy app synthesised bold from the 400 one -- a pixel difference on
  every label. Font faces are global; each generation's stylesheet now carries its own and base.css none.
- A `<base href>` to route a generation's `images/...` through an asset scheme also re-routed every other
  URL in the document (the injected stylesheet's font faces, chunk imports). Asset references are rewritten
  textually at port time instead (`tools/port/lift_assets.py`), which is also what Phase 4 has to do anyway.
- **The interim asset transport is a plain relative path, not a URL scheme.** The first interim was a
  `stp-assets://genN/` protocol served by the main process, and Chromium decoded gen4's 6341x2835 background
  JPEG through a different path for it than for a `file://` image: two in a channel at nine hundred pixels of
  every frame, with every other oracle green, and identical the moment the same file was loaded over
  `file://` (a redirect from the scheme to `file://` is `ERR_UNSAFE_REDIRECT`). gen2's PNG textures never
  showed it. It is a race, not a rule: the two decode paths depend on whether the file was complete when the
  image was first painted, the scheme merely made the slow outcome consistent, and over `file://` one unified
  run in three still landed on it (identical build, 901 pixels again). The pixel oracle's exact mode now
  forgives a channel delta of two -- imperceptible, and oracle 1 compares every computed colour exactly -- so
  the race cannot fail a run on either side. So a lifted module's images live at `images/genN/...` next to gen1's own `images/`, the document
  resolves them like the legacy page did, `src/main/assets.ts` is gone, and the parity runner junctions
  `out/renderer/images/genN` to the legacy tree for a run. Phase 4 merges the trees under that same root, so
  the port-time rewrite is already the final shape; `npm run dev` for gen2-5 waits for that merge (the Vite
  dev server serves `public/`, and a junction there would be copied into every build).
- gen1's `useSettingsStore` wrote `--overlay-color` and `--style_ui_saturation` onto `<html>` for every
  generation, overwriting the colour gen2's component had just set. Anything generation-specific that touches
  the document now checks `core/game/active.ts` first, and gen1's own boot work (`PokeData.setGame`,
  `overlay.setGame`, the Shuckie poll) moved into gen1's `activate()`.
- The legacy style managers' dev/prod switch is `!app.isPackaged`, not the Vite flag: an unpackaged build
  launched by `electron.exe` (the harness, the queuer's `npm run dev`) writes style edits back into the source
  tree. `core/env.ts` now carries both notions, and the user-state debounce is leading-edge -- a timer per
  write, 60 times a second, was enough to shift the fake clock's animation-frame ordering.
- The unified app's whole boot (SignalR handshake, `/mapper` fetch, a module's `prepare()` imports) is one more
  real-time pipe; counted as `__stpPendingBoot` and drained before every warm-up sweep. (The "one hundredth
  behind" this was first blamed for turned out to be the harness's own frame grid -- next bullet -- but a boot
  that finishes mid-sweep is still a real-time event inside a virtual-time run, and the counter stays.)
- **The hundredths-digit flake, finally.** Playwright's fake clock fires `requestAnimationFrame` on multiples
  of 16 of its *tick counter*, and after the runner's reload the tick counter of the new document equals the
  real milliseconds that passed between the runner's `clock.install()` and `clock.pauseAt()` calls (the clock
  replays its call log there, advancing ticks by the real gap between entries). So the frame grid sat a few
  random milliseconds off `recordedAt` in every run, and every per-frame sampler -- the overlay timer -- read
  a different instant at every capture. Two runs of the *legacy* gen2 app agreed only by luck; the unified
  app was "one hundredth behind" at 4 checkpoints in two runs and 10 in a third. An init script now aligns the
  ticks to the grid before the app's first line and `meta.json` carries `ticks` (docs/parity-harness.md 9.11).
  Items 7 and 8 of that list, and the leading-edge user-state debounce, were built on the wrong theory and are
  marked as such; they stay because each is harmless or independently right.
- gen4's timer hops through Node's `setImmediate` between frames, which `page.clock` does not fake; the
  runner routes it through the fake `setTimeout` (harness 9.12). And a real `setImmediate` is not the only
  thing the renderer shares with Node: the lifted SFCs run with `nodeIntegration`, as the legacy apps did.
- `tools/port/check-undefined.ts` asks the TypeScript checker which names a lifted script uses but never
  declares (scope-aware, unlike the text scan used for gen2's list): gen2's lift had missed `newColor`, `x`
  and `y` -- declared as parameters elsewhere, assigned bare in one method -- and had dropped `loadCsvFile`
  (the "Load Splits" file picker) altogether; no fixture reaches either. gen4's list has 42 names. `hash()`
  is undefined in both legacy apps too (known-legacy-bugs.md #32) and is left that way.
- A Vue prop shadows a computed of the same name: gen4 -- alone among the five -- has a computed `game()`
  (its game_variables entry), so its lift renames that to `game_data` (30 sites, asserted) before the
  `this.mapper` -> `this.game` rename; the session prop keeps its name across the modules.
- gen4 ships `lib/pokedex/platinum.js` *and* `lib/trainers/platinum.js`: `port-data` now keeps the path under
  `lib/`, and it adds imports for the globals one data file reads from another (`game_variables.js` reads
  `g4PokemonData` from a file loaded six tags earlier -- a classic script saw it, an ES module does not).
- gen3/4/5 ship a different `OpenSans-ExtraBold.ttf` from gen1/2 (a pixel difference on every label if
  swapped); gen4's fonts live under `fonts/gen4/` until Phase 4 dedupes by hash.
- The legacy `body` rules are not identical to base.css's after all (gen2's and gen4's both add
  `background-color: #000000`); `scope-css.py` now carries `html`/`body` as `html:has(.gen-N)` /
  `body:has(.gen-N)` instead of dropping them.
- A profile key the loaded mapper does not have leaves no container in the canonical view (gen4's one
  vocabulary covers three mappers; Platinum has no `variables.*`), so the legacy short-circuit
  `properties?.variables?.game_started.change(...)` stays a short-circuit instead of a TypeError.
- gen4's legacy `mounted` configured the mapper client (`deboucePath` x4) before connecting; the module
  declares `debouncePaths` and main.ts applies them to the shared client the moment the mapper is detected --
  the same moment the legacy map was built, since no hub message can land in between.
- `set-game-icon` (plan 3.4) is brought forward: the renderer names a file under `resources/icons/` and the
  module owns the game -> `.ico` table that was gen4's `main.js`.
- The layout oracle's root is now "where the overlay proper starts": `.mainContainer` (gen1/gen2) or, for gen4,
  the element directly under `#app` holding the first background canvas -- so the shell mounts the overlay
  component with no wrapper of its own.
- **gen1 is unchanged by all of Phase 2**, checked the only way that is comparable: the previous commit was
  built in a worktree and captured with the same harness (`unified@<dir>`), then diffed against the working
  tree on the gen1 fixture. Styles, layout, split CSVs, PokeAByte writes, OBS markers and persisted state are
  identical. The pixel and console oracles differ, and the difference is known-legacy-bugs.md #31 *going
  away*: the generation's stylesheet is a `<style>` element now, whose base URL is the document, so the panel
  textures (`--url: url(images/ui/*.svg)`) that a built gen1 has never shown load, and the 123
  `ERR_FILE_NOT_FOUND` lines are gone. (Oracle 4 also lists `current_splits`/`previous_splits` "only in
  candidate" -- the previous commit predates the `__stpUserState` probe, so its state was invisible to the
  capture; the collected `data/user_state.json` files are identical.)
- **`this.mapper` stays undefined inside `created()`.** The legacy component constructed its client in
  `mounted`, so during `created()` every `this.mapper?.properties...` short-circuited: gen4's and gen5's
  species-settings blocks are skipped there and run only from `mounted`, after the mapper is loaded. The
  session prop exists from the start, so the first lifts renamed those to `this.game?.` and ran the blocks a
  lifecycle step early -- invisible for gen4, but gen5's `encounters_psyduck` watcher then fired against a
  patch property the Black mapper does not have (a `TypeError` the legacy app never logs) and persisted a
  `Black_Heatran` key a step early. `rename_mapper` now leaves `created()` alone, and the lifted component
  declares no `mapper` field, so the reads short-circuit exactly as they did.
- gen5's `style_settings_manager.js` is a third variant: a style key reads as defaults < bare key < user
  override, merged, and a dev-mode write keeps the *full* value under the bare key (`threeLayer` in the
  shared store); its defaults write is debounced 1 s with no unload flush (#25). Its `logCopy` follows
  `refilming_mode` (#21), its `v-else` wrapper is a `v-else-if`, and it creates `splits/Platinum` and
  `splits/HGSS` at load (#17) -- all reproduced. Its timer is gen1's lineage (`logic/Timer.js`, `PubSub.js`,
  two template-string components) and is ported as ES modules with the bodies as they were; the runtime
  compiler the shell already carries for its in-DOM template compiles them. The second-screen key sender
  (node-key-sender, decision 9) is a main-process channel.
- **Vue 3.2 flushed a component's pre-watchers LIFO; Vue 3.5 flushes them FIFO** (its
  `findInsertionIndex` puts an equal-id job after the queued ones where 3.2.47's put it before). gen5's
  `created()` registers one `$watch` per species setting, its `starter` watch option is registered earlier,
  and at boot `load_all_settings` changes `starter` first and then four style fields: under 3.2 the four
  settings watchers ran *before* the starter watcher and saved the loaded values back to the species key
  (`Black_Heatran`) while `is_loading_evolution_style` was still false; under 3.5 the starter watcher runs
  first, raises the flag, and the four skip -- a persisted key present in the legacy state and absent in the
  unified one, found by oracle 4 and traced with an instrumented sandbox copy. The lifts give those watchers
  `flush: 'sync'`, which is the precedence 3.2 gave them (at the assignment, before any queued watcher, and
  still behind the flag inside `loadEvolutionStyle`); gen4 gets the same seam for the same guard. Observable
  behaviour is the parity claim, not the scheduler.
- The harness dropped every boot-time console error: the pre-reload document's log was cleared *after* the
  reload settled, by which point the new document had already connected to the armed mock and run its boot.
  The log is now cleared the moment the new document is created, and oracle 9 sees the boot -- including,
  on the legacy side, the `spawn keyhook.exe ENOENT` page error when the exe is missing (both sides spawn it
  from the sandbox cwd; the unified app from its main process, which logs instead of throwing).
  `STP_PARITY_KEEP_SANDBOX=1` skips the sandbox refresh so an instrumented legacy copy survives a run.
- **gen3's `ready` gates its `game` computed, and the template reads it at its top level.** The legacy
  `mounted` awaited `connect()`, which resolved only after the client's onMapperLoaded callback had raised
  `ready` and Vue had rendered the `v-else` overlay -- and the watchers `created()` queued had flushed before
  that with `ready` still false. A lift whose root is the `v-else` content renders before `mounted`, with
  `ready` false, and `this.game_data.region` throws from the first render; a lift that raises `ready` before
  the render runs the queued `evolution` watcher a step early; a lift that runs the post-connect code
  synchronously reads `#reset_counter_single` before it exists. So the lifted root is
  `<div v-if="ready">` -- the `v-else` gate, where it was -- and `mounted` keeps the legacy's two async hops
  (`await this.$nextTick()` before raising `ready`, and again after): the queued watchers, then `ready` and
  the render, then the callback's next-tick work, then the rest against a rendered overlay. gen3's `#app` is
  also the overlay grid itself (`class="mainContainer"` on `#app`, where gen2/4/5 nest the grid a level
  down), so `GameModule.appClass` puts the class on `#app` and the shell's `<keyhook>` renders nothing for
  it (`GameModule.keyhookElement`, set only by gen1, whose legacy keyhook *was* a component with an empty
  div): an extra element there would take the grid's first cell.
- gen3's `style_settings_manager.js` is a fourth, earlier model with no `user_` layer: a style key reads as
  the bare key merged over the shipped default, a write lands on the bare key and in dev mode *replaces* the
  default (not merges), and `exportCurrentAsDefaults` folds every bare style key in. It is its own store
  (`games/gen3/storage.ts`, sharing only the per-species file writer) because those are different rules, not
  a different configuration of the shared one. Its `logCopy` numbers a finished run by listing `finishes/`
  (`fs.readdirSync`), which is a queued `splits:list` now; `logData` read the game folder off the mounted
  instance's computed (`app.game.gameName`), which both call sites also pass as `gameName_path`. F20 is
  registered twice in its hotkey block (#6): a table has one entry per key, so that entry runs both bodies in
  registration order, which is what two listeners did. `lib/gameVariables.js` was the one legacy ES module
  (loaded by `import()`) and still read four classic-script globals off `window`; it is imported statically
  with those as imports, and assigned in `created()` where the promise used to land. `methods/
  time_functions.js` declares `gameTimeHM` twice (#36), which a classic script hoists and a module refuses;
  `port-data.ts` renames the shadowed one. The OBS method is gen2's exchange plus a `GetRecordStatus` probe
  and log lines, which is the shared client's `probeStatus` variant.
- **gen3's `methods/*.js` and `autosplitter/autosplitter_functions.js` are component code, not data.**
  Their functions are mixed into the component's `methods` and run with `this` bound to it, reading
  `this.mapper.properties` and the page's `MyStorage` and assigning names they never declare. port-data.ts
  had copied them verbatim as tables; the first unified run threw `Cannot read properties of null (reading
  'properties')` from `hiddenPowerPowerCalc` on its first render. The lift now gives those four files the
  component's seams in place (step 13) and `check-undefined.ts` runs over them too (#37 is what it found).
  The inventory's "paths only reached from dead code" section was wrong for gen3 for the same reason: the
  `methods/` rule is gen1's.
- **Every legacy overlay ran a development build of Vue, and dev Vue rethrows an unhandled error.** A render
  that throws aborts the patch, so the overlay froze at its last good frame with the error in the console.
  Production Vue -- or an `app.config.errorHandler`, which the shell had -- logs it and replaces the
  component's tree with a comment: a blank overlay. The mock's undecoded `setBytes` (below) made gen3's
  `stageMultiplier` throw on both sides, and the two recoveries showed up as a stale legacy DOM against an
  empty unified one. The shell now sets `throwUnhandledErrorInProduction` and has no error handler, so a
  render error freezes the overlay exactly as it did, and the harness sees the same `pageerror` on both
  sides. (gen4's #33 fixture placement had kept this out of sight.)
- **A `scale(1)` container is not "no transform".** gen3's legacy page has no fit-to-window script and no
  scaling container; the shell's `#app-container` carried `transform: scale(1)` from base.css for it, and a
  transformed container is a composited layer whose inline boxes and text Chromium snaps to whole pixels --
  every `<br>` after a `<select>` sat at y+0.5 in the legacy and y+0 in the unified app, and every label
  in the settings panels rasterised differently (39,000 pixels a checkpoint). The fit-to-window script is
  now a module flag for gen1 too (its own index.html carried it; `index.html` no longer does), and a module
  without the flag runs with `transform: none` inline. Even with that, seven `<br>` rects sat half a pixel
  apart with the pixels identical: Chromium had laid gen3's `<select>`s out with the fallback font's
  baseline and did not revisit it when `play` arrived, because a `<style>` swapped in late has not fetched
  its faces where the legacy page's loading screen already used them. The shell now loads a module's
  declared faces before it is `ready`; that in turn found gen4 and gen5 declaring `lgothic` for a
  `LeagueGothic.ttf` neither ships nor uses (a 404 the legacy never fetched), which `scope-css.py` now drops.
- **The mock now decodes `set-property-bytes` into a value**, as PokeAByte's next read would (an integer,
  through the glossary for a referenced property). Before, the value stayed `null` after gen3's stage reset
  and the app crashed on it -- a stand-in artefact, found because the legacy crashed identically.
- **Oracle 5 compares the writes of one virtual instant as a set.** gen3 resets its five stage modifiers
  with five `setBytes` in one `Promise.all`; Chromium's connection pool and the server decide their arrival
  order, and two runs of the *same* legacy app differed there. The claim is "the same writes at the same
  instant".
- **The user state is one section per generation (2.6, 2026-09-12).** Each legacy app had its own
  `localStorage`, and the lifted components read their keys verbatim -- gen4 and gen5 both keep `starter` and
  `selected_game`, in different vocabularies -- so one flat file would have had the last generation's value
  win for every shared name, and an import of five profiles into it would have been wrong four times over.
  `data/user_state.json` is format 2 now: a `global` section (the OBS url and password, the
  `enemyScale_<Species>` overrides) and one section per generation, with reads and writes going to the
  *active* generation's (main.ts sets it with the module) unless the caller names one (the box-art grid,
  writing each generation's edition). The harness's probe returns the active generation's flat view, which
  is exactly what its legacy `localStorage` held, so oracle 4 compares as before; every fixture starts from
  an empty profile either way, and all five runs are unchanged.
- **The `localStorage` importer is a LevelDB reader in plain TypeScript** (`src/main/leveldb.ts`: the
  MANIFEST's live table set, the block-based tables with prefix-compressed keys and snappy, the write-ahead
  log with its checksums, merged by sequence so the newest record wins and a deletion hides). No native
  module: `classic-level` would have had to build against the running Electron, for a read that happens once.
  Chromium's record shape is `_<origin>\0<format byte><key>` -> `<format byte><value>`, format 0 UTF-16LE and 1
  Latin-1 (`src/main/localStorageImport.ts`); the values are `MyStorage`'s `JSON.stringify` output and are
  parsed back the way its `get` parsed them. On this machine the five profiles decode to 6 / 164 / 545 / 633 /
  369 keys, and two things the survey did not predict showed up: gen2-5 wrote under `file://` (they load
  `index.html` from disk; only gen1 ran under Vite's `http://localhost:5173`), and gen5's profile carries five
  stale keys under a dev-server origin next to its 368 real ones -- so the importer takes the app's origin
  with the most records first, and DevTools' own history (`devtools://devtools`, in the same database) not
  at all. It runs at every launch and seeds only a generation whose section is absent, from a copy of the
  profile, never the folder the legacy app may have open. `npm run import:selftest` checks the reader on
  hand-built records and on whatever profiles are present; `npm run import:dump <profile>` shows what would
  be taken.
- **gen2's backport importer (decision 15, #26; 2026-09-12).** The legacy `importBackports` read two ASM files
  through `File.path` and `require("fs")`, parsed them with `lib/backport_importer.js`, and appended the result
  to four *shipped* data files so the import survived a restart by having rewritten the app. The lift now keeps
  the method's body: the parser half of that file is `games/gen2/backports.js` verbatim (an ES module, the
  regexes untouched), the files are read through the File API, and the four appends are one call into
  `games/gen2/backportOverrides.ts`, which keeps the same entries in `%APPDATA%/stp-overlay/data/gen2/
  backports.json` and folds them into the in-memory tables in gen2's `prepare()` -- the state the rewritten
  files used to load into. The in-memory update the method did after the appends is unchanged, and so is its
  status text. The shipped tables are never written.
- **A parity run's window is pinned to the primary display.** With someone working at the machine, a run's
  window opened on -- or was moved to -- another monitor, and there Windows shrinks a 1920x1080 content window
  (a 1080-tall display) or reports it as 1914x1063 whatever is asked (one scaled 150%;
  `--force-device-scale-factor=1` pins the renderer, not the frame). Every green run had used the primary. The
  runner now moves the window to the primary display's work-area corner before sizing it, and again before any
  capture that finds it drifted.
- **Oracle 6 ran for every generation (2026-09-12).** It had never run: the legacy apps open their control
  server on a literal `listen(30159, ...)` inside `frontend.js`, and that port belonged to whichever overlay was
  running on the machine. The harness now rewrites the literal in the *sandbox copy* when `--redirect-ports`
  is on (the legacy trees stay read-only inputs; the clean run's refresh restores the file), so a run no
  longer needs any port free. The control script was rewritten from the queuer's `configureOverlay` rather
  than from its description: `onlyFor` guards for the branches (`/set-counters` for gen2, gen4's `/refresh`
  before `/set-evolution`, the others' after), `$expectedGame` from the queuer's own `expectedSelectedGameFromMapperId`
  and `$rightPanel` from its `detectGenContext`, the guards keyed by the **fixture's** generation whichever
  app answers. Two contract corrections fell out (external-contracts.md section 2): the queuer's gen1 guards
  are narrower than the doc said -- it sends `/set-starter`, `/set-evolution`, `/refresh`, `/set-right-panel`,
  `/set-splits` and `/new-run` to gen1 too, and its `overlayFetch` throws on a failed call, so against the
  legacy gen1 (no server) an item never got past `/set-starter`; and a lifted table's error reply carried its
  HTTP status inside the body (`{ ok, status: 400, error }`) where gen2-5 sent `{ ok, error }` with the
  status on the response, which the main process now does. The union `/status` is built in the shell for
  every generation (`app`, `generation`, `mapper_path`, `starter`/`starterString`, `right_panel`/`right_ui`),
  and the oracle compares a `/status` key by key, allowing exactly those extras. Result: gen2, gen3, gen4
  and gen5 answer the queuer's session as their legacy apps do -- every route, status and body, and every
  `/status` field the legacy reports; gen1, which had no server, answers all nine calls (the two it has no
  equivalent for say `unsupported: true`) and is compared against the previous commit's worktree. The queuer's
  gen1 verification expects `right_panel: "Battle Graphic"`, a mode gen1 does not have; `docs/queuer-unified.patch`
  now sends gen1 `Automatic`, which is what a gen1 item needs to be drivable at all.
- gen4's parity fixture is synthetic (`tools/parity/scenarios/gen4-platinum-smoke.json`, built from the
  shipped `ST/gen4/pokemon_platinum_ne.xml`): a new game, the starter, a route change, a wild battle, Leader
  Roark, a level-up, a blackout and a reset, 21 checkpoints over 90 s. It proves determinism and no-change
  under the lift, not correctness (decision 6 still stands). Its Roark split is placed after the timer's first
  minute on purpose: known-legacy-bugs.md #33. gen5's (`gen5-black-smoke.json`, from
  `STANDARD/gen5/pokemon_black.xml`) follows the same shape with gen5's own edges: `flags.new_game`, the
  `player.name` reset, the `battle.other.battle` pointer for a blackout, and the Cilan split. gen3's
  (`gen3-firered-smoke.json`, from `ST/gen3/pokemon_firered_leafgreen_ne.xml`) drives the `sStpCallback`
  state path: `CB2_MainMenu -> CB2_NewGameScene` for the new run, `CB2_InitBattle`/`BattleMainCB2`/
  `CB2_Overworld` for the IN/OUT markers, dialogue 6 and outcome 1 (FRLG's are bare ints) for Battle and
  the Brock split, `CB2_WhiteOut` for the blackout and the copyright screen plus two null callbacks for the
  reset. FireRed rather than Emerald because a fresh profile's game is `FireRed and LeafGreen` and the
  Emerald mapper has no `meta.gameName` to correct it (#12); the party leader is the legacy default
  starter, Rayquaza, so the overlay is coherent.

## 7d. Phase 3 status (fusion)

Status as of 2026-09-11, evening.

| step | status |
|---|---|
| 3.1 boot flow, lazy modules | ✅ `games/genN/manifest.ts` (profiles, editions, the edition key) is what the shell knows before loading; `games/registry.ts` detects over the manifests and `loadModule()` imports the generation on first detection (Vite splits gen2-5 into their own chunks: entry 10.4 MB with gen1, then 5.3 / 9.5 / 11.3 / 6.0 MB for gen2/3/4/5). The edition is a user setting per generation, stored where each lifted component reads it (`game_selection`, `gameSelection`, `selected_game`; gen1's store). `InstanceReset` tears down and returns to the grid, as before. |
| 3.2 pre-mapper screen | ✅ the box-art grid (`components/GameSelect.vue`) for every generation, fourteen tiles (the plan said thirteen; gen1 has Yellow, Red and Blue), gen4's tile styling; a click stores the edition and sets the taskbar icon. "Yellow Legacy" shows in a dev build only. **2026-09-11:** the screen was redone with real box art for all fourteen tiles (decision 16, done) -- `GameSelect.vue` is now the whole pre-mapper screen (title, status line, the unsupported-mapper warning as a prop, and the grid: gens 1-3 on one row, gens 4-5 on the next, tiles sized by height so a paired edition's two-box composite is twice as wide). |
| 3.3 one client | ✅ gen3's `disconnect()` (called on `beforeunload`, as gen3/4/5 did) and gen4's warn-not-throw on a failed write, folded into `packages/gameHookMapperClient.ts`; #24 handling as listed. |
| 3.4 window and icon | ✅ `set-game-icon` for every generation; gen3/4/5's `.ico`s, gen1's and gen2's `icon.png` (a NativeImage from a PNG, no conversion needed). |
| 3.5 packaging | ✅ `package.json`: `stp-overlay` 3.0.0, `asar: false`, `files: out/**` minus the image junction, `extraFiles`: `storage/**` and `resources/**` (next to the exe, which is what `appRoot()` resolves against when packaged), `extraResources`: the image pool as `resources/images`; `npm start` runs the built app. `dev-window-state.json` is read in dev and when packaged, and written on close in both. **A packaged build was produced and tried on 2026-09-12** (`npm run build:unpack`, electron-builder 26 `--dir`, 3.8 GB in `dist/win-unpacked/`): `npm run packaged:probe` launches the exe the way a double-click would (no `STP_APP_ROOT`, an unrelated working directory, the network blocked) and checks the renderer's location, the image-pool junction and the box-art grid's images, `storage/Storage.json` through the storage IPC, `keyhook.exe` in the package, and `/status` on the control server -- all pass. The first build found `storage/` and `keyhook.exe` where electron-builder puts `extraResources` (`resources/storage`, `resources/resources/`) and not where the main process looks (next to the exe): hence `extraFiles`. The `build:win` zip step (the same tree, stored uncompressed) has not been run. |
| 3.6 queuer | ⏸ patch prepared (`docs/queuer-unified.patch`, `docs/external-contracts.md`); not applied -- the queuer tree has Scott's uncommitted edits, and decision 12 wants the change shown and dry-run. |
| 3.7 splits | ✅ `tools/splits/consolidate.ts` copied the five trees into `splits/` (10,662 files, 228.6 MB, no conflicts; every folder name kept, gen3's four and gen5's gen4 leftovers included). |

Also done on the way: a first-launch import of gen1's file-based user data from `%APPDATA%/stp-generation1-overlay/data`
into `%APPDATA%/stp-overlay/data` (the package rename would otherwise have started gen1 empty; `src/main/importLegacy.ts`).
The `localStorage` (LevelDB) half of the 2.6 importer followed on 2026-09-12 (section 7c, last bullet).

Verified after the wiring: every generation's parity run and the gen1 no-change check, unchanged (the lazy import is
one more awaited step inside the boot barrier the harness already waits on).

## 7e. Phase 4 status (asset merge)

Status as of 2026-09-11, night. `tools/assets/merge.ts --report` measured the five trees and `--apply` built the pool.

| step | status |
|---|---|
| 4.1 manifest + size report | ✅ `tools/assets/manifest.json` (6,633 entries): gen1 919 files / 492 MB, gen2 685 / 511, gen3 1,186 / 1,083, gen4 969 / 676, gen5 4,384 / 712 -- **3,473 MB across the trees, 1,842 MB distinct bytes (6,164 distinct files), 1,631 MB byte-identical repetition**. The survey's "21 same-name/different-bytes pairs" undercounted by a lot: 655 relPaths carry different bytes in different trees, and there are 27 case-only name collisions. |
| 4.2 copy rules | ✅ with one adjustment the lifted components force, below: gen1's files stay at `images/<relPath>`, and each other generation's whole tree sits under `images/genN/<relPath>` -- the same URL space the lifts already used, real files now instead of junctions to the legacy trees. Nothing renamed, nothing deleted (decision 13 keeps gen5's inventory sprites). The pool is `src/renderer/public/images/`; a build no longer copies it (`copyPublicDir: false`, 3.5 GB would turn a 10 s build into minutes) but junctions `out/renderer/images` to it (`electron.vite.config.js`), the dev server serves it as `public/`, and a packaged build ships it as `resources/images` with the main process making the same junction on first launch. |
| 4.3 texture registry | ⏸ deferred to the decomposition of the lifted components: their texture tables (`games/genN/data/textures.js`) are the per-gen vocabularies the plan describes, and the code that reads them is the verbatim legacy code; a generated registry would have no consumer until that code is refactored (the 2.4 refactor proper). |
| 4.4 sprite resolver | ⏸ deferred for the same reason. The lifted components build image URLs from template strings (`images/gen5/pokemon/${species}.png`); a per-file rename or alias cannot be applied through a dynamic URL, which is exactly why the generation tier stays a real folder. The resolver's three tiers (game, generation, shared) are the layout the pool already has; the resolver itself arrives with the code that will call it. |
| 4.5 fonts | ✅ one `src/renderer/fonts/` with one copy of each distinct file (10 files for 17 references): gen2's four are gen1's bytes; gen3/4/5's `OpenSans-ExtraBold.ttf` is a different file from gen1/2's and is `OpenSans-ExtraBold-gen345.ttf` (`scope-css.py --font-rename`); gen3's `LeagueGothic`, `OpenSans-Bold` and `OpenSans-Regular` are its own. Every `@font-face` name per generation is unchanged. Vite already deduplicated identical fonts by content hash at build time, so this is source hygiene, verified pixel-identical. |
| 4.6 inventory sprites | ✅ in the pool (3,441 files under `images/gen5/inventory_sprites/`). |
| 4.7 outcome | the repo stores **1.84 GB** of image blobs for a 3.47 GB working tree (git keeps one object per distinct content, whatever the path); the working tree carries the repetition. Below the 2 GB the plan expected, without deleting anything: the dead folders the plan counted on removing are not separable from live ones without the reference analysis the decomposition will give. |

Why the pool is tiered rather than flat: the plan's flat pool with `-genN` suffixes and aliases was written for
refactored code addressing images through a resolver. The lifted components (Phase 2) address them with the legacy
template-string URLs, so the only layout that keeps every generation's look byte-for-byte is one folder per
generation -- which is the resolver's "generation tier" anyway. Same-name/different-bytes files (655 of them, mostly
per-generation sprite art of the same species) never meet on disk, and the case-only collisions (27) never share a
folder. Git deduplicates the identical 1.6 GB by content, which is what the size target was about.

Also done on the way: the main process creates its window before it spawns `keyhook.exe`. The antivirus on this
machine quarantines that exe from the working tree, fails the sandbox's copy of it, and -- the one that cost the
most -- holds the synchronous spawn of a freshly restored copy for over a minute, which the harness saw as three
consecutive "no window in 60 s" launches with the main process alive. With the window first the hook can take as
long as it likes; the run log now carries the main process's own output so the next such launch says why.

Verified after the merge: every generation's parity run and the gen1 no-change check, unchanged -- the lifted
templates read the same bytes from the pool that they read through the junctions.

## 7f. Phase 5 status (cleanup, performance, docs)

| step | status |
|---|---|
| 5.1 performance | ✅ generation modules are lazy (plan 3.1; the entry bundle carries gen1 and core, the other four load on detection as their own chunks, data tables included). The rest of 5.1 -- deep watchers, fixed `<img>` sizes, `will-change` -- is gen1-refactor work and lifted-component work that the harness would have to re-verify per change; none of it is a measured problem today, so it is not done blind. |
| 5.2 style defaults | ✅ since Phase 2.2: per-species JSON, dev-mode writes to the file, packaged builds write user overrides (decision 10). |
| 5.3 README | ✅ rewritten for the unified layout: structure, how to add a game, the harness, where the app keeps things. |
| 5.4 final parity run | ✅ every generation on its fixture after Phase 4 (this section's verification); manifest and size report in 4.1. `tools/sandbox/` copies are runtime artefacts (gitignored) and are left for the next harness run rather than deleted -- deleting them only makes the next run re-copy the legacy trees. |

What remains open across the plan: real fixture recordings for gen1/3/4/5 (decision 6); the queuer patch to
apply and dry-run (3.6); and the decomposition of the four lifted components into the shared stores (the 2.4
refactor proper), which is where 4.3 and 4.4 resume. Oracle 6 (the control-script sessions) and the packaged
build (3.5) closed on 2026-09-12 -- see 7d and the last bullets of 7c. `npm run parity:all` is the regression
check for whatever comes next. **2026-09-25:** Scott made the decomposition the next step; it is Phase 6
(§3), with its status in 7g and the detailed plan in the last section of this document.

**Review of the port as a whole (2026-09-12).** A read of every seam between the shell, the core and the
five modules against the legacy sources, looking for what the harness cannot see (nothing in a fixture unloads
a mapper, presses a hotkey, drags a sprite or sends `/load-split-file`). What it found, all corrected and
re-verified with `npm run parity:all`:

- **Mapper unload was not a teardown.** `InstanceReset` unmounts the overlay component, but the client's
  `.change()`/`.once()` tables survived `_deconstructMapper()`, and the lifted components had no `unmounted()`
  at all: after one emulator restart the old instance kept its hotkeys, its 10 ms Shuckie poll, its
  animation-frame timer loop, its dev-mode window listeners and its property handlers -- so the next battle
  wrote its split rows, OBS markers and ROM patches twice, once from a dead component. gen1 had half of this
  in the legacy app too (known-legacy-bugs.md #38). Now `GameHookMapperClient.clearSubscriptions()` runs from
  `onMapperUnloaded`, each lifted overlay has an `unmounted()` (hotkeys, intervals, listeners, the timer loop;
  gen3/gen5's `Timer` got a `stop()`), and gen3's two-tick `mounted` bails out if unmounted in between.
- **A stale load could mount over an unloaded client.** `onMapperLoaded` awaits the module import,
  `prepare()` and the stylesheet; an `InstanceReset` during those awaits left it setting `session` and
  `ready` over a client whose properties were `{}` (a render TypeError), and a second `MapperLoaded` could
  interleave with the first. `loadSequence` in main.ts makes a superseded load stop at its next await; a
  load that throws now reports itself on the pre-mapper screen instead of an unhandled rejection.
- **Overlapping stylesheet applications could end with gen1's class under gen2's sheet.** `applyModuleStyles`
  awaits the sheet and its font faces; the pre-mapper gen1 call and a detection's call overlap on a cold
  start, and a mapper *switch* (unload, then load within milliseconds, everything cached) overlapped them
  reliably. The latest call wins now (`styleSequence`).
- **A cancelled enemy-sprite drag stayed persisted in gen2-5.** The lifts kept
  `localStorage.removeItem("enemyScale_<species>")` in `cancelEnemySpriteResize`, `exitStyleMode` and
  `styleModeBack`, but the shared manager keeps the override in the user state; the removal cleared nothing.
  Those sites call `enemySpriteScaleManager.clearOverride()`, as gen1's store does.
- **`/load-split-file` never reached gen2-5's `previous_splits`.** The main process reads the queuer's
  absolute path and forwards the parsed rows as `__splits`; gen1's route used them, gen2-5's ignored them and
  re-read `query.file` through the splits IPC, which refuses a path outside `<appRoot>/splits` -- every real
  queuer file -- so the reply said `splits_loaded: N` while the panel got `[]`. All four routes take
  `__splits` now, and the contract table says the path is absolute (`docs/external-contracts.md`).
- Smaller: the dev-only `exportCurrentAsDefaults`/`resetAllToDefaults` of the shared style store swept the
  shipped defaults where the legacy managers swept the store (and gen2's export applied its
  `stylePropertyKeys` filter, which the port had left off); `keyhook.exe` output is line-buffered across
  chunks (the legacy loops dropped an event a chunk boundary cut in two); a dead `set-game-icon` `invoke`
  handler and its preload entry are gone (the `send` channel is the one in use).

**Why the decomposition waits for the recordings, in that order.** The lifted components are 7-11 thousand
lines each (250-340 methods, a 1,400-line `mounted`), and the net under them is the harness: gen2 has one real
recording (a Crystal run), gen3/4/5 have synthetic smoke scenarios, gen1 a synthetic one. Moving that much
logic into shared stores on a smoke net would be proven only for the states the smoke scenarios reach --
a battle in and out, a level, a badge -- and silently free to drift everywhere else: evolutions, blackouts,
resets, the second and later battles, the split archive after a whole run. Decision 6 gives the harness
real runs for every generation, and the decomposition should be measured against those. Until then the
lifted components are the *supported* shape (the README says so), and edits to them are verified as they
always were. When the recordings exist, the first slices are the ones with a shared consumer already in
`core/`: the split-CSV writers (`games/genN/splits.js`, each a variant of gen1's) behind gen1's
autosplitter engine, then the natures/abilities/type tables gen3-5 share byte-for-byte (2.2's rule: to `core/`
only when identical), then the texture vocabularies (4.3) and the sprite resolver (4.4) once a style picker
reads them.

## 7g. Phase 6 status (decomposition of the lifted overlays)

Status as of 2026-09-25: planned (the last section of this document), nothing started. Legend: ⬜ not started,
◐ partial, ✅ done, ⏸ waiting on Scott. A cell turns ✅ only when the recipe (Phase 6 plan, §5) passed for that
generation -- the no-change run green on every fixture of the generation, `typecheck`, `parity:drift`, the slice's
self-tests -- and the cell names the commit.

| slice | gen2 | gen3 | gen4 | gen5 | core / gen1 |
|---|---|---|---|---|---|
| 6.0 the net: recordings, extended scenarios, dev-mode hooks | ◐ one real Crystal recording (`tools/fixtures/raw/`, gitignored); no synthetic scenario | ⬜ synthetic smoke only | ⬜ synthetic smoke only | ⬜ synthetic smoke only | ⬜ gen1 synthetic smoke only |
| 6.1 inventory, coverage map, quirk ledger, adjudication | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ tooling; the seven flagged drift entries were adjudicated 2026-09-25 (§5, decisions 17-21) |
| 6.2 template split, no DOM change | ⬜ | ⬜ | ⬜ | ⬜ | – |
| 6.3 persistence: `MyStorage` keys to stores | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ settings-store factory, species-settings store |
| 6.4 `mounted` out: hooks, state machine, hotkeys, lifecycle | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ `main.ts` installs hooks and state for every module |
| 6.5 splits: engine + `useSplitsStore` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ `core/autosplitter/`; gen1 adopts the store |
| 6.6 Shuckie and timer | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ runtime-only Vue once no template-string component is left |
| 6.7 canonical keys | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ vocabulary extended from gen1's |
| 6.8 battle math + shared tables | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ `core/logic/battle/`, `core/data/`, `parity:battle-math` |
| 6.9 feature modules behind flags | ⬜ backport importer, ROM patches | ⬜ Castform/Deoxys forms, evolution families, trash cans | ⬜ Voltorb Flip, RNG helper, `setBits` encounters | ⬜ forms, second screen, party and bag rewrite | ⬜ `features.forms` for gen3 and gen4 |
| 6.10 right panel and movepool | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ `core/logic/moves.ts` index |
| 6.11 control routes and hotkeys on stores | ⬜ | ⬜ | ⬜ | ⬜ | – |
| 6.12 texture registry, sprite resolver | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ `core/assets/resolver.ts` |
| 6.13 retire the monoliths, the shim and the mixins | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ `parity:drift` retargeted |
| 6.14 exit | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |

## 8. Corrections the first implementation session made to the plan

- **`known-legacy-bugs.md` #29 and #30** are new, both found by the harness: the mapper client's rAF
  debounce loop dereferences a nulled `_debouceMap` (including on the ordinary "connected before a mapper is
  loaded" path), and gen1's decision to write encounter flags to the ROM at startup is a race between an IPC
  settings read and the mapper-loaded event.
- **`parity-harness.md` §4** claimed `APPDATA=<sandbox>` gives Electron a fresh profile on Windows. It does
  not — `--user-data-dir` is what isolates a run. Corrected in place, with the four determinism requirements
  the runner has to keep (§9).
- **`parity-harness.md` §3 seek** specified starting from the last keyframe. Keyframes carry values but no
  `bytes`, and the overlays read bytes, so the replayer replays every `E` from t=0 instead; the reason is at
  the top of `mock-pokeabyte/replay.ts`, and keyframes are now used as a consistency check on the recording.
- **gen1's write list** is bigger than the plan said (see checklist step 9).

## 8b. Corrections the second implementation session made (2026-09-10, Phase 1)

- **1.2 was wrong about `deprecated_autosplitter.js`.** It said nothing imports it; `autosplitter_functions.js:1`
  does, for the `trainerName` column of the Deprecated CSV. It moved into `games/gen1/data/` instead of being
  deleted. (That lookup interpolates two `battle.trainer` *properties* rather than their `.value`s and works
  only because `GameHookProperty.toString()` returns the value — checked, not a bug, not added to the bug list.)
- **1.3's "delete `methods/`" is too broad.** `methods/enemy.js` and `methods/text_functions.js` are imported by
  five live components; only `file_system_functions.js` and `unused_functions.js` were dead, and both are gone.
  `docs/gen1-inventory.md`, regenerated after the Phase 1 renames, reports the same **224 paths / 188 read /
  36 written** as before the refactor and no longer has a "paths only reached from dead code" section -- an
  independent check that nothing in Phase 1 added, dropped or moved a mapper access.
- **The `.gitignore` line in 0.1 was too narrow** (see the correction in place): baselines are ~400 MB per
  fixture run, not a handful of PNGs.
- **`parity-harness.md` §9 grew from four determinism requirements to seven.** The first four left a flake that
  reproduced in about every other pair of runs: the on-screen timer's hundredths digit differed at 5 of 25
  checkpoints. The three additions are a hub-frame receipt count, a `MessageChannel` task boundary before
  reading the DOM, and — the one that actually closed it — draining the hub *before* the clock sweep and not
  only after. The runner pushed a batch and went straight into a 1,200 ms `clock.runFor`, so the frame landed
  mid-sweep and the property handler read an intermediate `Date.now()`; that is why the difference was ~10 ms
  rather than a whole 16 ms frame. Two plausible-looking non-fixes are recorded there too, so nobody re-derives
  them.
- **Captures now record two probes**, `virtualNow` and `hubRx`, and `diff.ts` compares both. They are what
  turned "five checkpoints render different text" into "the clock and the input were identical, so it is the
  renderer's scheduling" — worth keeping for every later generation.
- **gen1's stylesheet uses native CSS nesting.** Nothing in revision 2 mentions it, and 2.5's "prefix every
  selector with `.gen-N` via PostCSS" has to preserve it: a naive brace scan hoists the inner rules to the top
  level and silently changes what they match.
- **`.gen-N` belongs on `#app-container`, not on `#app`.** The layout oracle keys elements by tag, classes and
  nth-child walking up to #app-container *exclusive*, so putting the class there keeps every key stable and
  every pre-scoping baseline comparable. 2.5 should do the same for each generation.

## Post-migration fixes (2026-09-13, gen1 first)

Four reports against the unified app, traced and fixed with the harness as the net (a gen1 fixture run of the
untouched commit against the fix, `unified@<built copy>` vs `unified`; the diff lists exactly the intended
differences and nothing else):

1. **Bold text in the moveset** -- renderer drift, not a port error: known-legacy-bugs.md #40. Chromium 138
   synthesises bold on a face declared at the default weight when a rule asks for 700, even when the file is
   already bold; Chromium 114 did not. The stylesheet and the font files are byte-identical to the legacy copy
   (verified against the pristine commit), and the same pattern exists in every lifted sheet, where the
   harness could not see it (same-Electron baselines). Fixed by declaring the weight on every already-bold
   face, all five generations, and `scope-css.py --font-weight` so a re-lift keeps it.
2. **Splits on an Automatic right panel before the game starts** -- the post-battle override was persisted:
   known-legacy-bugs.md #39. Transient now, and cleared on New Run and when a new run starts.
3. **The pre-mapper screen showed one green tile per generation** -- five selections at once, and a click on a
   sixth added another. The grid now remembers which generation was picked last (`selected_generation`, a
   global user-state key) and highlights one tile; a "Selected: ..." line and a one-sentence hint say what the
   screen is for. Each generation's stored edition is untouched.
4. **Super Shuckie in gen1** -- the timer and counters were wired (poll, display, `mark-start`/`mark-end`,
   counter increments, split rows) but the two switches were dev-only, so a packaged gen1 could not turn them
   on, and they were stored per game and species. They are `useOverlaySettingsStore.shuckie` now (once per
   install, as gens 2-5 keep them per generation), shown in the Interface panel of every build; with the
   timer switch on, Play/Pause and Set Timer drive the emulator (`/mark-start`, gen3's mapping), the split
   rows and the metrics panel carry the emulator's counters when the counters switch is on (gen4's rule),
   and `/set-shuckie-timer` joins `/set-shuckie-counters` on gen1's control server. A species file that still
   has the old flags is read and ignored; tick the switches once.

Harness note: `tools/parity/targets.ts` resolves the Electron binary through `require("electron")` now, so the
runner and `screenshot-idle.ts` launch on macOS and Linux as well as Windows.


## Super Shuckie bookmarks at every chapter marker (2026-09-14)

Super Shuckie's `replay-bookmarks` branch (commit `e994c95`) adds replay bookmarks and a REST API for them.
Every chapter marker, in every generation, now also becomes a bookmark in the replay Super Shuckie is recording
or playing back: `core/logic/shuckieBookmarks.ts`, contract in `external-contracts.md` §3.

- **One funnel.** `sendChapterMarker` sends the OBS chapter and adds the bookmark. gen1's two call sites (the
  battle hooks and `left_panel/faults.vue`) and gens 2-5's `sendObsChapterMarker` methods call it, so a
  bookmark goes out exactly where a chapter does, with the same name. The OBS exchange is unchanged.
- **Typed by kind** (BATTLE for `IN`/`OUT`, ITEM, MAP CHANGE, TEXT BOX, NEW MOVE, ...), so the bookmark window
  can color and tell them apart. Super Shuckie creates each type the first time it is used.
- **Playback adds too, without duplicates.** A marker is skipped when the replay already has a bookmark with
  that name within 300 frames that has not answered for another marker in this pass. Playing a replay again
  adds nothing, while the first playback of an older replay fills it in, repeats included. The list is
  fetched once per replay; the module then applies its own adds to its copy, including the generation bumps
  they cause, and fetches again only at a generation those adds do not explain. Without that, filling in a
  long replay downloaded the whole list once per marker.
- **Switch:** Shuckie Bookmarks (global user state `shuckie_bookmarks`, default on), in gen1's Interface panel
  and under Show Advanced Settings in gens 2-5.
- **Harness:** the Super Shuckie stub plays a replay with no bookmarks. Its `/add-bookmark` calls are logged
  to `shuckie-bookmarks.json`, apart from oracle 8's call log, because the legacy baselines add none.
  `diff.ts` checks that a unified candidate's bookmark names match its own OBS marker names.
  `npm run parity:bookmarks` (tools/parity/bookmarks-selftest.ts) drives the module through recording,
  playback dedupe, seeks, replay switches, outside edits, the switch and a dead server, against a fake
  Super Shuckie on a spare port (a `fetch` shim rewrites 30158, as --redirect-ports does in the renderer).
- **Verified** on the gen1/3/4/5 fixtures against a build of the previous commit: one bookmark per OBS marker
  in every run; the only intended differences are gen1's new settings row. Not yet run against a real
  Super Shuckie build, and gen2 has no fixture here, so it is typechecked only.


## Manual DVs and IVs in every generation (2026-09-17)

Every generation could already ask for the starter's genes before the game handed it over, but only
through a Hidden Power type: gen2 wrote an Atk/Def nibble byte to the ROM patch (`wStarterHiddenPowerType`,
Spe/Spc fixed at 15 by the patch), gens 3-5 wrote one of the perfect-or-near-perfect spreads for the type
(`hiddenpowers[type][index]`) at level 5 in the lab, and gen1 had nothing (no Hidden Power, the patch's
own spread). Scott's ask: keep that as the default, and add a way to dial in every value for a run that
needs a particular spread. `core/logic/starterIvs.ts` holds the shared pieces; each generation keeps its
own write path.

- **One dropdown, two modes.** `DVs:` (gens 1-2) / `IVs:` (gens 3-5), `Automatic` or `Manual`, placed where
  the Hidden Power dropdown was. Automatic shows the Hidden Power dropdown(s) and does exactly what the
  generation did before -- the default, so a run that never opens it is unchanged. Manual replaces them
  with one field per stat (Atk/Def/Spe/Spc, 0-15; HP/Atk/Def/SpA/SpD/Spe, 0-31), clamped on entry (an
  emptied or unreadable field is the perfect value), with a readout of the Hidden Power type and base
  power the spread yields, the derived HP DV (gens 1-2) and the gender the Attack DV decides (gen2).
- **Formulas from the games**, checked against every table row: pokecrystal `HiddenPowerDamage` and
  `GetGender`, pokeemerald `Cmd_hiddenpowercalc`, pokered `CalcStat` (`gen12Stat`). All 208 spreads in
  gens 3-5's tables and the 16 gen2 selector bytes yield their own type at 70.
- **Where the spread lands.** gen1: `games/gen1/starterDvs.ts`, run by a new hook when the party slot's
  level goes 0 -> 5 in Oak's Lab -- four nibbles by `setBits` (two calls, the nibbles share bytes) plus
  the level-5 stats, since the game only recomputes stats on a level-up; Automatic writes nothing.
  gen2: the fields' Atk/Def go into the patch byte through the female path's `setBytes` (and are
  re-asserted by the existing `wStarterHiddenPowerType.change` hook); Spe/Spc cannot ride on the byte, so
  `write_manual_starter_dvs` writes all four nibbles and the stats when the starter arrives (level 0 -> 5
  in Elm's Lab, NEW BARK map 5). `calculate_stat`, `update_pokemon`, the stats header and the movepool row
  read the effective spread (`starterDVs`); the inert gender dropdown is hidden in Manual. gens 3-5:
  `starter_ivs()` feeds the existing lab write (gen3 `setStartingAttributes`, gen4 `setStartingStats`,
  gen5 `set_starter_stats_object.ivs` via `apply_starter_ivs`, which the four watchers and the starter
  loaders call); a stale Hidden Power index reads as the type's first row instead of `undefined`.
- **Stored** where each generation keeps its Hidden Power choice: gen1 in the species file
  (`config.dvs`), gen2 once per install (`dv_mode`, `manual_dvs`), gens 3-5 per starter and shared across
  an evolution family (`iv_mode`, `manual_ivs`, in `pokemon_settings` and the shared-family lists). A
  loaded spread is assigned only when it differs, so a starter switch does not re-save it.
- **Profiles**: gen1 declares the four DV nibbles (bits) and six stats (value); gen2 adds `dvSpeed` and
  `dvSpecial` (bits). The control server is untouched: `/set-hidden-power` still sets the type, which
  Manual ignores until the dropdown goes back to Automatic.
- **Removed**: gen3's dead `Automatic IVs` toggle (known-legacy-bugs.md #41). gen2's movepool shows the
  spread's real Hidden Power power instead of a fixed 70 (#42).
- **Verified** three ways. `npm run typecheck` and the formula check over every table row. The no-change
  check: baselines captured from a built worktree of the previous commit (`unified@wt-1b4f880`) on all five
  fixtures, the final build diffed against them -- every difference is oracle 1/2 inside the settings
  column (gen1 `testingArea2`, gen2 `div.demo`, gens 3-5 `div.ui2`) plus gen1's species file gaining
  `config.dvs`; writes, control, OBS, Super Shuckie and console are identical. (`npm run parity:all` shows
  the same plus what the standing baselines already carried: font drift on bold text against
  `legacy_genN@37` (#40) and, for gen1, the pre-#39 `unified@wt-f9cb0fa`.) Manual mode:
  `npm run parity:manual-ivs` (`tools/parity/manual-ivs-check.ts`) switches each generation to Manual
  through the runner's new `beforeReplay` hook and checks the readout and the writes -- gen2's recording
  (Wigglytuff in Elm's Lab: the 0x96 patch byte, the four nibbles by bits, the six stats pokecrystal's
  formula gives), gen3's scenario (the six IV bits), and gen1 on a lab variant of its scenario the script
  synthesises (nibbles and Pikachu's L5 stats); gen4/gen5's scenarios never reach their lab, so there the
  readout and the profile check are what is covered. Not yet run against a live game.


## Cross-generation drift: the check and the shared mixins (2026-09-17)

Scott's concern: a change asked for "everywhere" lands in one generation and the other three keep
the old code, and nothing says so -- the method is still there under the same name, and the
harness only sees the states its fixture reaches. Measured before doing anything: of the members
the four lifted overlays (gens 2-5) share by name, 32 of 72 four-way names were byte-identical and
the rest had drifted, and in twenty of those three generations agreed while one differed (gen5's
`fetchEmulatorStats` stops polling a dead Super Shuckie after ten failures, gens 2-4 never; gen5's
`load_splits` dedupes repeated trainer rows, gens 2-4 push every row; gen3 silenced three
console lines the others print). The four commits of this week that touched all four overlays
(`1b4f880`, `ecccee0`, `6088f94`, `ca5daf7`) were each the same edit applied by hand four times.

The real fix is the decomposition into gen1's shared stores (2.4 proper, gated on decision 6's
recordings, §7f). What is done now works on the monoliths as they are, in two tiers.

**Tier 1 -- the drift check makes a missed generation a red build.** `npm run parity:drift`
(`tools/parity/drift-check.ts`) extracts every `methods`/`computed`/`watch` member of the four
overlays by name and compares bodies (comments and whitespace ignored; the member's own name and
spelling stripped, so `padTime(t) {..}`, `padTime: function (t) {..}` and gen3's shorthand
`padTime,` listing `export function padTime` from `data/methods/time_functions.js` read the
same). A name shared by two or more generations whose bodies differ must have an entry in
`tools/parity/drift-allowlist.json` with a one-line reason, and the entry pins a fingerprint of
each generation's body: editing one copy of an allowlisted member fails the check until the edit
reaches the others or the entry is re-reviewed (`--update` rewrites fingerprints and keeps
reasons); an entry whose bodies have come to agree is stale and fails too. `--report [name]`
prints the differences as diffs (`tools/reports/drift-report.md` is the full one). The
allowlist was seeded with every current difference (169 entries): 14 reviewed with the reason
written (the DV/IV split, the camelCase-vs-snake_case mapper shapes of gen2/3 vs gen4/5,
gen3's OBS probe, gen3's dropdown labels, gen2's `'this.current_splits'` key, ...), 6 flagged
`UNREVIEWED (omission?)` / `(console only)` for Scott to adjudicate -- the twenty-vs-one cases
above and `convertDurationToSeconds`, where gen2 and gen5 each guard a non-string and gen3/4
throw -- and 149 auto-described (`UNREVIEWED: gen2 | gen3 | gen4 | gen5 (...)`, mostly the
game-specific logic: `get_stat`, `typeEffectiveness`, `load_all_settings`) that need a reason
or a port when they are next touched. The check also reports a member defined twice in one
overlay, which found known-legacy-bugs.md #44 (eight dead first definitions, three of them
different from the live one; removed), and it is where #45 (gen2's typo'd split keys) and #46
(gen2's SpDef badge rule compares the property object, so the game's 206-432/661+ rule never
fires) came from.

`GameModule.features` is `Record<Feature, boolean>` now, not `Partial`: every module answers
every flag, and a new feature is a compile error in each `games/genN/index.ts` until that
generation says true or false. The five tables were filled with the previous "absent = off"
values, so nothing changed; nothing reads them yet.

**Tier 2 -- what was already identical is one copy.** Eight Options-API mixins under
`core/overlay/`, each holding members that were byte-identical in every overlay that defined
them and moved out unchanged (the extraction asserted identity per member; the state in
`data()` stays in each overlay, so no initialiser could drift; a generation that had no copy of
a helper gains it unused):

| mixin | overlays | members | what |
|---|---|---|---|
| `enemySpriteStyleMixin({ enemySpriteScaleManager })` | 2-5 | 19 | the resize handle, sprite transforms, Style Mode navigation; the manager is the generation's own table; `_styleModeBuildList` stays per gen |
| `formattersMixin` | 2-5 | 29 | pure text/number/time/colour helpers; gen3's shorthand entries and their `data/methods/*` imports dropped |
| `overlayCommonMixin` | 2-5 | 7 | `batt`/`map`/`s1`, the weather flag, first-expiring field effect, the overlay-colour and Shuckie Bookmarks watchers |
| `battleMathMixin` | 2-5 | 8 | Curse type, species mapping, stage-mod colours, vitamins left, Return/Frustration power, speed comparison label |
| `naturesMixin` | 3-5 | 6 | raised/lowered stat, nature from stats, labels |
| `manualIvsMixin` | 3-5 | 5 | `starter_ivs`, the field setter and loader, the Hidden Power readouts (gen2 keeps its DV versions) |
| `speciesArtMixin` | 3-5 | 5 | evolution-transition opacity/transition computeds, `resetPokemon` |
| `dsPairMixin` | 4-5 | 37 | the battle-slot shortcuts, `damageCalculation`, status/ability/plate helpers, EV/IV readouts, RNG-trip modal, Voltorb Flip styling, the Shuckie fault check |

2,909 lines left the four overlays (6,860 / 8,601 / 9,726 / 9,708 now). The mixins are
`// @ts-nocheck`: the bodies are the verbatim legacy JS, and typing them is a rewrite to do
when one is rewritten, not while it is moved. An overlay that defines a member one of its
mixins also provides overrides it silently (Vue takes the component's own), so the drift check
resolves each overlay's `mixins: [...]` and requires every such override to be listed under
`overrides` in the allowlist with a reason, pinned the same way -- that is the mechanism for a
generation that needs a different version, and it is visible (tried against a deliberate
break -- a `padTime` added to gen5 -- before being trusted).

**What the harness caught that the extraction did not.** The first no-change run was green
and pixel-exact on gens 1-4 and failed oracle 9 on gen5: `ReferenceError: shuckie_resets is not
defined`, twice. `shuckie_faults_check` assigns `shuckie_resets`/`shuckie_blackouts` without
declaring them -- legacy sloppy-mode globals, which the lift declares as one module-level
`let a, b, c...` per overlay (§7c) -- and the extraction's dependency scan read only the first
name of that line. In the mixin module the assignment is a strict-mode ReferenceError.
`tools/port/check-undefined.ts` (the lift's own checker for exactly this) run over the mixins
found fourteen such names in four members (`damageCalculation`'s `part1-4`, `damageMin/Max`,
`min/maxPercentage`; `getNature`'s `nature`; `getSoloNature`'s `pid`; `shuckie_faults_check`'s
two; `vitamins_remaining`'s `vitaminsUsed`/`usableVitamins`). Every one is assigned before it is
read, and the only other method still touching two of them (gen4/5's `damageRange`) assigns
before reading too, so the sharing carries no state between methods: each mixin module now
declares its names with the same `let`, as the lift did, and nothing observable changes. The
gen4 fixture never evaluated `shuckie_faults_check`, which is the point of the drift check's
premise (the harness sees only the states a fixture reaches): `check-undefined.ts` exports
`undeclaredNames()` now and `parity:drift` runs it over every mixin it resolves, so this class
fails at the check, not at the harness. Its `@ts-nocheck` line is dropped for the check.

What stayed put and why: `increment`/`decrement` and the Shuckie poll (the poll's three
copies differ only in the flagged ways; the whole cluster moves together once adjudicated);
`load_temp_splits`, `exportStyleSettingsAsDefaults`, `closeRNGModal`, `isDevMode`,
`playerName`/`playerNameChoice` (each reaches a per-generation module -- `splits.js`,
`storage.ts` -- and would need a factory parameter for six lines); gen2/gen4's timer trio
(gen3/gen5 use the Timer component instead).
The next slices, in order: the Shuckie cluster after the six flagged entries are decided; the
149 auto entries as they are touched (each is either a reason or a port); the four-way
`gen2 | gen3 | gen4 | gen5` members whose difference is only the mapper path shape, which
the `MapperProfile` canonical keys are the right tool for, not a mixin.

**Verified**: `npm run typecheck`, `npm run parity:drift`, and the no-change check on all
five fixtures -- the working tree as the previous session left it (its `.perf-final`
captures, taken from the same tree before any of this) against the refactored build:
gen1 (`gen1-yellow-smoke`), gen2 (the Crystal recording `c-wigglytuff-2-11311`, 22
checkpoints), gen3, gen4 and gen5's smoke fixtures, each `unified` with `--redirect-ports
--control`, diffed with `diff.ts` -- **all nine oracles green, pixels exact, on all five**
(`tools/reports/<fixture>.mixins`, `.mixins-diff`; gen4 and gen5 re-run after the declaration
fix above, the first gen5 run being the one that found it). The standing `tools/baselines`
were not used: docs/parity-harness.md says why they mislead. Nothing here is committed; the
working tree also carries the previous session's uncommitted performance pass, which the
`.perf-final` captures include on both sides of the diff.

**Review pass (same day).** Scott asked for the work to be checked for oversights. Probed rather than
re-read: every mixin member against every overlay's `data()` keys, props and other sections (no
collisions -- the only hits are the two watchers named after the key they watch); no name provided
by two mixins; `check-undefined.ts` over all four overlays after the import trims (clean); every
line the diff removes classified by the HEAD file's section (all inside `methods`/`computed`/
`watch`, imports or comments); `parity:selftest`, `parity:debounce`, `parity:bookmarks` (pass).
Found and fixed: the extraction captured a one-line `/** */` doc but not a multi-line one, so the
`starter_ivs` doc block was left above an unrelated member in gens 3-5 and the dead
`getCurrentStorageKey`'s above `fetchEmulatorStats` in gen3, and the "Enemy sprite resize tool"
banner sat above nothing in all four (the text is in `enemySpriteStyleMixin`'s doc and on
`starter_ivs` now); the removed watchers' `}, ` (trailing space) left a whitespace-only line in
each overlay. The cleanup itself then cut a doc block from its second line, leaving the `/**`
opener dangling -- an unterminated block comment that swallowed everything to the next `*/` --
and the drift check caught it before any run did (gen3's method count fell from 160 to 31; the
mixin members it then "missed" made the allowlist fail). The lesson is on the tool: a comment-only
edit is not verified by reading it, and `parity:drift`'s per-generation counts are worth a glance
on every run. The tokenizer is three-state now (code / string text / comment) so a comment that
directly follows a string can no longer leak into a fingerprint; every pinned fingerprint still
matches, which is the proof that no compared body changed across the whole pass. Verified again
after the fixes: the no-change check on gens 2-5 against the same `.perf-final` captures (all nine oracles
green, pixels exact, all four) and `npm run parity:manual-ivs` (all five cases pass; it is the
only run that enters Manual mode, so it is what exercises `manualIvsMixin`'s `set_manual_iv`
and `manualHiddenPower` directly), plus typecheck, `parity:drift` and `check-undefined` over
the mixins and the overlays.

**Peer review from the other session (same evening).** Agent 2's code review over the working tree
raised three things here, all taken. (1) `GameHookMapperClient.disconnect()` did not cancel the
5 s retry `_establishConnection()` arms when PokeAByte is down, nor clear `_debounceTick`: a
retry landing after the shell tore the client down found no SignalR client to start, went
straight to `connected = true`, `onConnected()`, a mapper GET and the frame loop -- so PokeAByte
coming up later "reconnected" an overlay that no longer existed, and the self-test's "disconnect()
stays disconnected" could flake if a retry landed in its window. The client keeps the handle
(`_retryTimer`), `disconnect()` clears it and nulls the tick, the retry callback and
`_establishConnection()` return on `_stopping`. `npm run parity:debounce` has a fifth scenario --
PokeAByte down, `connect()` false, `disconnect()`, PokeAByte up, 6.5 s -- which failed on the old
client exactly as described (connected, `onConnected` x1, 53 frames, mapper loaded) and passes
now; 38 checks. (2) `parity:drift` was green with 155 UNREVIEWED entries: it now prints the
flagged ones (`UNREVIEWED (...)`) by name on every run, and `--strict` fails on any UNREVIEWED
entry for a CI that wants the allowlist adjudicated. (3) `check-undefined.ts`'s `@ts-nocheck`
strip was anchored at the first character, so a directive it missed would have meant zero
diagnostics for a file the checker never looked at; anchored with leading whitespace now.

## gen1: the ROM starter follows the solo Pokemon (2026-09-18)

gens 2-5 write the chosen starter to the ROM patch whenever the solo Pokemon changes (gen2's
`starter` watcher calls `set_rom_starter`, gen3-5's `update_rom_starter_and_intro_mon` hangs off
the dropdown) and once more on mount, so the patch always carries what the dropdown shows. gen1
still waited for the `Set ROM Starter` button (`components/settings/interface_2.vue`). Scott's
ask: the same automatic assignment in gen1.

- **The store is the one source.** The dropdown's `v-model` and the queuer's `/set-starter`
  (`games/gen1/control.ts` -> `setStarter`) both land on `useOverlaySettingsStore.starter`, so one
  watcher on it in `interface_2.vue` covers both; it calls the button's own `set_rom_starter`
  (by value for the original 151, `setBytes([0xBF])` for a backport, unknown species warned and
  skipped -- all unchanged). The overlay settings are read before the overlay mounts
  (`main.ts` awaits `overlayLoaded` before `ready`), so the watcher never sees the persisted
  starter arrive: `mounted()` writes it once, gen2's "sync solo pokemon dropdown to the game on
  load". The button stays as a manual re-sync; the write stays unfrozen, as the legacy gen1
  always had it (gen2 freezes; vanilla `Init` zeroes HRAM on a reset, so whether gen1's patch
  needs the same is a question for Scott, not a change this made).
- **Verified** against a HEAD worktree build on `gen1-yellow-smoke` with `--control`
  (`tools/reports/starter-sync-gen1.{head,final}`): pixels exact; oracle 5 gains exactly the two
  intended writes -- `patch/hChosenStarter = Venomoth` at t=0 (mount, the harness's persisted
  starter) and `= Pikachu` at the control session's `/set-starter`; control, OBS, Shuckie and
  console identical (the one console error is the fixture's `images/pokemon/null.png`, on both
  sides). Oracle 0 reports `hubRx` one higher at every checkpoint: the mock echoes the mount-time
  write as one change frame, so a pre-change capture is now one hub frame behind -- expected,
  and deterministic (a second capture of the same build diffs all-green against the first).
  `npm run typecheck` clean. Not yet run against a live game.

## Split bookmarks and the replay as split comparison (2026-09-23)

Scott's ask: write each simple split into the replay Super Shuckie is recording, as a bookmark
typed `SPLIT` carrying the trainer and the time to the second; then compare the current run against
another run's `.replay` instead of a CSV, and while a replay is played back read the current run's
splits from its bookmarks, so a scrub to any point shows the splits reached by then without playing
the run through. Decisions taken with Scott before building: all five generations; the panel's
current column comes from the playing replay's bookmarks (last split per trainer at or before the
frame); CSV loading stays as a fallback by extension; the name is `SPLIT - <trainer> - HH:MM:SS`,
with an `(<instance>)` marker where a generation tells repeat fights apart; gen1's button goes under
the Compare-splits dropdown.

- **One shared vocabulary** (`src/shared/splitBookmarks.ts`, no imports, used by the renderer and
  main): the name, its parsing from the end (a trainer key may contain ` - `), the time spellings
  (`45`, `5:12`, `1:05:12`, `.cs` dropped) to `HH:MM:SS` and back to the panels' `[h:]m:ss`, and
  `splitsFromBookmarks(bookmarks, upToFrame)`: split bookmarks at or before the frame, sorted by
  `(in_frame, id)`, the last per trainer(+instance) kept in the position of that last bookmark. A
  bookmark counts as a split when its name parses and it is untyped or typed SPLIT.
- **Writing** (`addSplitBookmark` in `core/logic/shuckieBookmarks.ts`): at every site that writes the
  Simple CSV, with the key `current_splits` gets for that split -- gen1 `simple_data[2]` in
  `games/gen1/hooks.ts` (the `simpleSplit` closure and the champion; not the Hall of Fame re-log,
  which is the champion's key at a later time and would overwrite it under last-per-trainer); gens
  2-4 `simple_data[2]`; gen4's n-th Rival / Cyrus / HGSS rematch as the instance (the count in
  `current_splits` after the push); gen5 the normalised key and trainer id, stashed by
  `autosplitter_process` as `last_simple_split` (the normalisation moved out of the
  `collect_split_data` guard so it is always there), plus its relabelled Hall of Fame split. The type
  falls out of `bookmarkTypeFor` (the kind before the first ` - `, in capitals). No OBS chapter. On
  playback the dedupe compares names less a split's time, since a replay played back on the local
  timer stamps a slightly different second.
- **Reading a replay** (`src/shared/replayBookmarks.ts`, `src/main/replayFile.ts`): the 2048-byte
  header and the `SSBM` bookmark section at `packet_stream_end`, nothing else -- two ranged reads for
  a 370 MB file. Ground truth is `supershuckie-replay-recorder` (`header.rs`, `bookmark_section.rs`,
  `bookmarks.rs`, `packet/io.rs`); the first guess at the patch-length offset (0x018) was wrong, the
  struct says 0x110, and the parser was then checked against a v6 file the converter wrote (three
  legacy bookmarks decode to the frames and millis decoded by hand from the bytes:
  `checkpoint@7/166`, `late@76/1754`, `checkpoint@165/3873`). `u32` is raw little-endian, everything
  else the length-prefixed `UnsignedInteger`; a type id can exceed 2^53 so ids read as bigint and
  format as the REST API's 16 hex digits; the blake3 hash is not verified. v3/v4 files and unclosed
  recordings (`packet_stream_end` 0) are refused with the reason.
- **Loading** (`src/main/splitComparison.ts`): one loader for the queuer's `/load-split-file` and the
  in-app button, by extension: a `.replay` gives `splitsFromBookmarks` of its table, a `.csv` the
  legacy columns 2 and 3. The picker moved to main (`splits:pick-comparison`, `dialog.showOpenDialog`
  with a `.replay`/`.csv` filter): the legacy `showOpenFilePicker` gives a `File` with no path, and the
  file is read by main anyway. The file's base name rides along as `previous_splits_source` (gen1 user
  state; gens 2-5 `MyStorage`, added to the non-style key lists) and shows under the button. The
  control route's reply body is unchanged (oracle 6).
- **The panel during playback** (`core/stores/useReplaySplitsStore.ts`, started and stopped with the
  module in `main.ts`): polls `/stats` at 250 ms while the Shuckie Bookmarks switch is on, fetches
  `/bookmarks` when `bookmark_generation` moves, keeps only the split bookmarks, and exposes
  `currentSplits` for the current frame. gen1's overlay passes `displayed_current_splits` to
  `right_panel`; gens 2-5 read `effective_current_splits` from `overlayCommonMixin` (the mixin gained
  its first `data()`, the store) in every `compare_splits`. The autosplitter's pushes and CSVs are
  untouched. Under the harness the stub always reports playback, so the panel there is driven by the
  bookmarks the app itself adds; a captured screenshot at a split can differ from an older baseline by
  the round trip.
- **Harness:** oracle 8 sets split bookmarks aside from the marker/bookmark multiset (they have no
  chapter) and counts them in the detail; `npm run parity:replay-splits`
  (tools/parity/replay-splits-selftest.ts) covers the names, the rows, a copy of the recorder's
  encoder against the decoder, the converter-written fixture `tools/fixtures/replays/legacy-bookmarks-v6.replay`,
  the loader on replays and CSVs, and the store against a fake Super Shuckie (frames, scrubs,
  generation changes, the switch, a dead server). `parity:drift` re-pinned `compare_splits` and
  `load_splits` (reasons kept); `get_stat` was already drifting in gen4/gen5 at HEAD before this change
  and is left flagged for Scott.
- **Verified** (2026-09-23) `npm run typecheck` clean; `parity:replay-splits` 50/50, `parity:bookmarks` 22/22,
  `parity:debounce` green; `parity:drift` green apart from the pre-existing `get_stat` entry. gen1 end to end:
  `gen1-yellow-smoke` on this build vs the same fixture on a built worktree of HEAD `3ab2582`
  (`tools/reports/split-bookmarks-gen1.{head,final,diff}`): the run adds `SPLIT - Brock - 00:00:33` typed
  SPLIT at frame 2100, between the battle's `IN - BROCK` and `OUT - BROCK` (the four chapter markers and
  the simple CSV row `Brock,0:33` unchanged); oracles 3-9 identical (CSVs, user state, writes, the control
  session, OBS, Shuckie calls and bookmarks with the split set aside, console -- the one error is the
  fixture's `images/pokemon/null.png` on both sides). Oracles 1/2 differ in two places: the settings
  column at every checkpoint (the renamed metrics button, the new button and label in interface_4 shift
  what follows) and, from the checkpoint after the Brock split, the splits panel: the baseline lists
  Brock twice (0:33 and 0:34 -- gen1's `autosplitter_process` pushes a `current_splits` row on every
  `lowHealthAlarm` change of the battle, and First mode does not dedupe), the candidate once, because
  the harness stub reports playback and the panel is then the bookmarks' last-per-trainer list. Live
  recording is unchanged; the duplicate-row quirk is worth a look of its own.
  gen5 end to end, the same way (`tools/reports/split-bookmarks-gen5.{head,final,diff}`): the run adds
  `SPLIT - Cilan (12) - 490908:01:14` typed SPLIT at frame 4320, between the last `Enemy Fainted` and
  `OUT - Cilan` -- the normalised key, the trainer id as the instance, and the fixture's own absurd timer
  value exactly as its CSV row carries it (`490908:01:14.30`, centiseconds dropped); the eight chapter
  markers and the CSV unchanged; oracles 3-9 identical; oracles 1/2 differ only in the button's text
  (x 787-1038, y 111-124 at every checkpoint). Not yet run against a live Super Shuckie: the fake server
  and the stub speak the `replay-bookmarks` REST API; a build older than that 404s `/add-bookmark` and
  everything degrades to the autosplitter's own rows, as before.

## Phase 6 plan: decomposing the gen2-5 overlays (2026-09-25)

Scott's decision: the decomposition of the four lifted overlays into gen1's shape is the next step. This section is
the plan for it -- what is being decomposed, measured against the tree on 2026-09-25; the target; where each part of
a lifted overlay goes; the order of the slices; the recipe every commit follows; the rules; the risks; and what Scott
decides up front. §3 has the one-page summary and 7g the status table.

**The gate, and how the order honours it.** §7f said the decomposition waits for decision 6's recordings, because
the net under the lifted components is the harness and a smoke net proves only the states it reaches. That reasoning
still holds; it is built into the order below instead of postponing the phase. The recordings are slice 6.0 and run
alongside the first slices. The slices that move no behaviour go first -- a template cut into fragment components
with the same DOM, a data key moved to a store on the same persisted key, a byte-identical helper moved out -- and
are provable by construction plus the no-change check. A slice that moves *logic* through a state no fixture reaches
waits for the recording, or for a synthetic scenario that reaches it. The coverage map (6.1) says which case each
member is in, so the call is made on evidence per member, not once for the whole phase.

### 1. What is being decomposed

Measured on 2026-09-25 (HEAD `ca9df80`), after the 2026-09-17 mixins took 2,909 identical lines out:

| | gen2 | gen3 | gen4 | gen5 |
|---|---|---|---|---|
| `Overlay.vue` lines | 6,860 | 8,614 | 9,775 | 9,743 |
| of which template | 1,067 | 1,691 | 1,298 | 1,075 |
| `data()` keys | 242 (93 of them `battle_summary_*`) | 141 | 114 (109 seeded from `MyStorage`) | 90 |
| computed / watch / methods | 32 / 39 / 135 | 41 / 33 / 144 | 38 / 48 / 145 | 51 / 33 / 152 |
| `created` / `mounted` lines (≈) | 58 / 1,409 | 279 / 1,457 | 107 / 1,732 | 102 / 1,413 |
| `.change()` subscriptions | 60 | 56 | 38 | 31 |
| `MyStorage` reads and writes | 356 | 407 | 394 | 337 |
| `game.properties` reads, whole file / of which in the template | 609 / 61 | 586 / 144 | 711 / 120 | 710 / 68 |
| `:style` bindings, `v-if`+`v-show`, `v-for` in the template | 66, 153, 32 | 117, 196, 40 | 115, 144, 41 | 57, 132, 30 |
| mixins applied / members they hold | 4 / 63 | 7 / 79 | 8 / 116 | 8 / 116 |
| companions (lines) | `splits.js` 141, `storage.ts` 142, `control.ts` 108, `hotkeys.ts` 74, `backports.js` 199, `backportOverrides.ts` 118 | `splits.js` 222, `storage.ts` 145, `control.ts` 150, `hotkeys.ts` 62, `logic/Timer.js` 133, `logic/PubSub.js` 39, `components/Timer.js` 36 | `splits.js` 200, `storage.ts` 140, `control.ts` 166, `hotkeys.ts` 65, `forms.js` 37 | `splits.js` 203, `storage.ts` 148, `control.ts` 150, `hotkeys.ts` 60, `forms.js` 75, `logic/Timer.js` 133, `logic/PubSub.js` 39, `components/Timer.js` 36, `components/ShuckieTimer.js` 70 |

The four `Timer.js`/`PubSub.js` copies (gen3, gen5) are not identical to each other or to gen1's `logic/Timer.ts`
and `logic/PubSub.js`. The drift check's view of the same code: 192 members shared by two or more generations, 22
identical, 169 allowlisted differences of which 153 are unreviewed, 6 flagged for Scott, and `get_stat` failing
since 2026-09-23 (the note in 7f). Every one of those 169 is a decision the decomposition has to take anyway --
one shared body, or a per-generation variant with a reason -- which is why 6.1 starts with them.

The other session's performance pass of the same day (in progress, uncommitted, while this was written) is changing
the Timer components, the movepool lookup and the `movepoolResize` handler in these files. The numbers above are
HEAD's; 6.6 and 6.10 take whatever of that pass landed as their starting point and re-measure.

### 2. The target

gen1's shape, by name, so that a slice can say where a thing lands:

- **Composition root**: `games/genN/Overlay.vue` becomes what `components/Overlay.vue` is for gen1 (203 lines): the
  panels, the `provide()` of `game` and `game_properties`, and nothing else. Its `props: ["game"]` interface to
  `main.ts` is unchanged throughout.
- **Components**: shared where the markup is the same once the generation's classes and asset paths are parameters;
  per-generation variants under `games/genN/components/` where the DOM differs, plugged in through
  `GameModule.components` (typed since Phase 1, never used). gen1's tree is the naming scheme: `left_panel/{stats,
  move_set, exp_bar, badges, badge_boosts, faults, timer, type_icons, battle_popups, bonk_counter, repel_counter,
  pop_ups}`, `right_panel/{enemy_graphic, move_pool, splits_first, splits_followup, splits_summary, wild_pokemon}`,
  `settings/*`, `graphics`, `game_area`, `state`, `enemy_sprite_resize_handle`.
- **Stores** (singular and generation-agnostic, §2): `metaStore` (game state, current species, enemy state),
  `useOverlaySettingsStore` (settings, per generation namespace), `useGameSpeciesData` (per game+species config
  and styling -- for gens 2-5 the layered style store already holds this behind `MyStorage[<Game>_<Species>]`),
  `useSpeciesMetricsStore` (timer, faults, attempt, player id), `useBattleStore` (the battle summary),
  `useEnemySpriteResizeStore`, core's `useEmulatorStatsStore` and `useReplaySplitsStore`, and one new store,
  `useSplitsStore` (6.5), which gen1 adopts as well.
- **Logic**: `core/logic/*` pure functions, typed and self-tested; `core/autosplitter/` (the engine);
  `logic/Timer.ts` and `logic/PubSub.js` as the one timer and the one bus.
- **Per generation**: `games/genN/{index,manifest,hooks,state,control,hotkeys,markers,patches,settings}.ts`,
  `mappers/`, `data/`, `style.css`, `components/`. gen1 has the first seven today; `patches` and `settings` are new
  names for what gen1 keeps in `starterDvs.ts` and its stores.
- **Rules carried over from §2**: `core/` never imports `games/genN/`; stores and shared components read canonical
  keys, never mapper paths; a generation difference is data on the module (`features`, `data`, `hooks`, a profile)
  or a variant component, never a generation conditional in `core/`.
- **CSS does not change**: the class names and ids stay on the same elements and `games/genN/style.css` stays
  scoped under `.gen-N`, so every rule keeps matching. §4's fold-into-`base.css` work is not part of this phase, and
  visuals stay per generation throughout (decision 26).

### 3. Where each part of a lifted overlay goes

**`data()` keys** fall into five classes; 6.1's inventory assigns every key of every generation to one.

| class | what it looks like today | where it goes | slice |
|---|---|---|---|
| (a) settings | `key: MyStorage['key'] ?? default` seeds (109 of gen4's 114 keys): `shuckie_timer`, `selected_game`, `stats_setting`, `right_ui`/`right_panel`, `split_type`, `unobtainable_moves_toggle`, `ui_*`, `encounters_*`, `hm_*`, `toggle_EVENT_*`... | a per-generation settings store built from a declared key table (`games/genN/settings.ts`: key, default, kind) on the same user-state namespace under the same names -- oracle 4 dumps that section flat, so nothing on disk moves; the store autosaves (gen1's `useSettingsStore` pattern) and the 39 / 33 / 48 / 33 persistence watchers go | 6.3 |
| (b) per-species style and config | `MyStorage[<Game>_<Species>]` (gen4/5), `MyStorage[starter]` (gen2), `<Game>_`-prefixed keys (gen3), `castform_style_settings`, `visual_style_settings`: `overlay_color`, `image*`, `background*`, `pkmnNature`, `pkmn_ability`, `hidden_power_type`, `evolution`, `frame`, the species' own counters | the layered style store (`core/persistence/styleSettings.ts`, already shared; each generation's key rule and debounce already in `storage.ts`) read through a species-settings store shaped like `useGameSpeciesData`; `created()`'s field-by-field `this.x = MyStorage[key].x ?? d` (58-279 lines) becomes its `load()` on a starter or game change | 6.3 |
| (c) run state | `playerId`, `playerName`, `playerResets`, `blackout_counter`, `resetCounter`, `game_over`, `run_complete`, `finished_run_count`, `attempt_number`, `pb_time`, `split_logStr`, `simple_data*`, `full_data_str`, `deprecated_data_str`, `split_data`, `current_splits`, `previous_splits[_source]`, `timer_*`, `time_*`, `battle_start`, `time_split_start`, gen2's 93 `battle_summary_*` keys | `useSpeciesMetricsStore` (metrics, timer, attempt), `useBattleStore` (the summary), `useSplitsStore` | 6.4-6.6 |
| (d) transient UI state | `showPopup`, `showRNGModal`, `rng_*`, `starter_dropdown_open`, `search_term`, `enemyResize`, `style_mode_*`, `evolution_transition_progress`, `expBarAnimation`, `slotTimingFix`, `field_array`, `last_initiated_field_effect`, `second_screen_mode`, `enemyState`, `enemyModColour` | local state of the component that owns the region (or `useEnemySpriteResizeStore`, where gen1 already keeps it) | 6.2, 6.9, 6.10 |
| (e) data tables held as reactive state | `trainers_plat`, `trainers_hgss`, `moves`, `badges`, `natureStats`, `simple_natures`, `unobtainable_moves_object`, `hiddenpower_type_selector`, `dexDataRubySapphireEmerald`, `gameVariables`, `typeCalcs`, `stat_object`, `pkmnSlots` | module-level imports reached through `GameModule.data`, not reactive (performance-followups.md A: the client's tables stopped being proxies on 09-17; these are the last large ones) | 6.8 |

**`computed`** members become getters of the store that owns their inputs, or computeds of the owning component;
the pure ones (`typeHeaderColor`, `field_selector`, `screen_weather`, `battle_fade`, `stats_header`,
`growth_rate`, `blackouts_resets`, `hp_tracker_style`, `dropdownDownMenuKeys`...) become `core/logic` functions
the component calls with explicit inputs.

**`watch`** members are of three kinds: persistence writers (`current_splits`, `ui_stat_arrangement`, `starter`,
`playerName`... -- replaced by the stores' autosave, classes a and b); ROM and encounter writers (gen2's 14
`toggle_EVENT_ENCOUNTER_*`, gen3's 12 `hm_*`, gen4's 33 `encounters_*`/`hm_*`, gen5's 11 `encounters_*`, plus
`catch_rate`, `evolution`, `starter`, `pkmnNature`, `manual_ivs` -- to `games/genN/patches.ts`, their writes
already declared in the profile's `writes` with oracle 5 watching); and derived-state watchers (`playerId`,
`playerResets`, `blackout_counter`, `emulatorStats`, `playerNameChoice`, `selected_game`, `enemy_graphic`... --
store subscriptions or watchers in the owning component). #32 (`hash()` undefined in the `playerNameChoice`
watcher of gens 2-4) is a code quirk (decision 25): the watcher moves failing exactly as it does today, and the fix
is its own commit after the move.

**`methods`** cluster as follows (names as they are in the overlays; the inventory lists every member of every
generation with its cluster):

| cluster | members | destination | slice |
|---|---|---|---|
| Shuckie | `fetchEmulatorStats`, `sendEmulatorStart`, `sendEmulatorEnd`, `incrementEmulatorCounter`, `incrementEmulatorCounterByAmount` (all four generations; three of the five are flagged in the allowlist) | `core/stores/useEmulatorStatsStore.ts` | 6.6 |
| timer | gen2/gen4: `startTime`, `stopTime`, `updateTime`, `pauseUnpauseTime`, `set_timer`, `setStartTime`; gen3/gen5: the `Timer` component and `logic/Timer.js` | `logic/Timer.ts`, `useSpeciesMetricsStore`, `left_panel/timer.vue` | 6.6 |
| splits | `currentSplit`, `lastSplit`, `load_splits`, `load_temp_splits`, `clear_splits`, `getSplitFileName`, `getFinishFileName`, `generateUniqueRunIdentifier`, `autosplitter_trainer`, `convertDurationToSeconds`, `convertMSToDuration`; `splits.js`'s `logData`, `logCopy`, `transition`, `loadCsvFile` | `core/autosplitter/` (the engine), `useSplitsStore`, `games/genN/splits.ts` (the variant) | 6.5 |
| OBS and markers | `sendObsChapterMarker`, `checkMapperForChapterMarkerProperties`, gen2's `rareCandyStatus*` | already `core/logic/obs.ts` and `chapterMarkerProperties.ts`; each generation's marker names are on `GameModule.chapterMarkers` and move to `games/genN/markers.ts` | 6.4 |
| style and settings management | `load_all_settings`, `set_pokemon_prop`, `set_setting_prop`, `copy_overlay_properties`, `copyCurrentStylesToAllFamilyMembers`, `saveCurrentStyles`, `exportStyleSettingsAsDefaults`, `resetCurrentPokemonToDefaults`, `resetAllStyleSettingsToDefaults`, `currentPokemonHasUserOverrides`, `isDevMode`, `getStorageKey`, `getCurrentStorageKey`, `getStyleStorageKey`, `getEvolutionFamilyStorageKey`, `getEvolutionStateStorageKey`, `getCastformStyleStorageKey`, `loadDisplayedStyles`, `color_picker`, `clear_overlay_color`, `load_pokemon_sprite_settings`, `load_deoxys_sprite_settings`, `print_texture_settings`, `default_texture_settings` | the species-settings store over `core/persistence/styleSettings.ts` | 6.3 |
| species, evolution, forms | `getEvolutionFamily`, `getEvolutionFamilyForSpecies`, `getFullyEvolvedSpecies`, `updateEvolutionFamilyList`, `loadEvolutionStyle`, `performEvolutionTransition`, `mapAbilityByEvolutionSlot`, `mapAbilityToSpecies`, `speciesNameAliases`, `normalizeSpeciesName`, `formFromGame`, `resolveIncomingSpecies`, `syncFormByte`, `applySpeciesAliases`, `applyPokemonForm`, `battleFormVariants`, `formVariants`, `formChangeMoves`, `calculate_zoroark`, `species_function`, `getPokemonImageUrl`, `getStarterArt`, `getStarterImageUrl`, `getStarterTypeTexture`, `getStarterType1`, `getStarterType2`, `pokemon` | `core/logic/species/` over `GameModule.data` (the families, `forms.js`); `features.evolutionSplits`, `features.forms` | 6.9 |
| battle math | `damageRange`, `damage_calculation`, `get_stat`, `getStat`, `getEnemyStat`, `get_iv`, `get_dv`, `get_base_stat`, `get_base_stat_total`, `calculate_stat`, `calcExpStats`, `growthRate`, `growthRateCheck`, `stageModifiers`, `stage_modifiers`, `stageMultiplier`, `stat_mod`, `enemyStatModification`, `typeEffectiveness`, `typeEffectivenessCheck`, `type_effectiveness`, `determineSTAB`, `determineItemBoost`, `abilityModifier`, `burnModifier`, `weatherModifier`, `movePower`, `moveType`, `moveCategory`, `getMoveCategory`, `getAccuracy`, `moveAccuracyStatic`, `moveAccuracyDynamic`, `moveAccuracyEvasionDynamic`, `get_fling_power`, `hiddenPowerTypeCalc`, `hiddenPowerPowerCalc`, the `g2*PowerCalc` family, `enemy_move_power`, `enemy_effective_power`, `speed_comparison`, `paralysis`, `ability`, `natureCalculation`, `badge_boost`, `badgeBoost`, `badgeBoostType`, `get_bb_stat`, `g2spcDefCheck`, `calculate_ev_benefit`, `average_median_stats`, `status_stat_change`, `metal_powder`, `light_ball`, `macho_brace`, `maxStat`, `statExp`, `get_start_exp_ev_equivalent`, `get_stat_exp_increase` | `core/logic/battle/`, typed, parameterised by the `GameModule.data` tables; `battleMathMixin`, `dsPairMixin`, `naturesMixin` and `manualIvsMixin` dissolve into it | 6.8 |
| movepool, moveset, items | `getMovepool`, `dataSearch`, `movepoolResize`, `movepoolResizeSpecies`, `movepoolResizeCalc`, `movepoolPower`, `movepoolType`, `movepoolTypeColor`, `getUnobtainableMoveStyle`, `post_game_move_style`, `update_moveset`, `update_battle_moveset`, `update_items`, `update_held_item`, `update_buffer_moves`, `getPlayerTeamMoveSet`, `playerTeamMovesChanged`, `updateLastKnownMoves`, `scheduleMoveSetChangeCheck`, `get_player_move`, `get_player_move_pp`, `getMove`, `getMoveType`, `getMoveObject`, `getMoveProperty`, `getPP`, `move_name`, `get_backport_move`, `enemyMove`, `moveTypeIcon`, `moveCategoryIcon`, `enemy_held_item`, `held_item_icon`, `getRolloutCounter` | the `right_panel/move_pool` and `left_panel/move_set` components; `core/logic/moves.ts` (indexed lookups) | 6.10 |
| enemy graphic | `enemyPkmnUI`, `enemyPkmnFaint`, `enemyPkmnFaintWild`, `enemyPkmnFaintStats`, `enemyPkmnFaintStatsBackground`, `enemyPkmnFaintTypes`, `enemyPkmnText`, `enemyPkmnHP`, `enemyPkmnSpecies`, `enemyDynamic`, `enemyMods`, `enemyType`, `enemyType1`, `enemyType2`, `enemyFaint`, `eHPType`, `fade_enemy_mon`, `fade_enemy_mon_text`, `fade_enemy_mon_comparison`, `fade_stats`, `enemyDropShadow`, `enemyStatLabelOpacity`, `enemyHpOpacity`, `enemyStatusLabelOpacity`, `getTrainerGraphic`, `g2trainerEnemySelector`, `g3trainerEnemySelector`, `specialTrainerGraphics`, `special_trainer_names`, `g2martSelector`, `statLabelMartOpacity`, `battlePokemonCrop`, `battlePokemonCropWild`, `split_image`, `getSplitImageName`, `format_display_name`, `get_trainer_name`, `fixTrainerName`, `format_trainer_name`, `enemy_form`, `activeSlot`, `soloPkmn` | `right_panel/enemy_graphic` variants (gen4/gen5's two-slot team display, gen2's single enemy) | 6.10 |
| ROM patching, encounters, starter | `update_rom_starter_and_intro_mon`, `set_rom_starter`, `set_manual_dv`, `write_manual_starter_dvs`, `apply_starter_ivs`, `set_encounters`, `freezeEncounters`, `disable_encounters`, `toggle_encounters`, `set_hm_encounters`, `checkedEncounters`, `trashCans`, `write_byte_data`, `encrypt_byte_data`, `set_options`, `add_testing_items`, `update_nature`, `commit_starter_input`, `select_starter_option`, `close_starter_dropdown`, `update_atk`, `update_def`, `updateHiddenPowerDVs`, `getHiddenPowerDVs`, `hpDv`, `hpDvCalculation` | `games/genN/patches.ts` (with `core/logic/starterIvs.ts`, already shared); `features.romPatching`, `features.encounterFlags` | 6.9 |
| run and game state | `reset`, `increment`, `decrement`, `newRun`, `newGame`, `setGamestate`, `displayState`, `g2state`, `g3state`, `versionCheck`, `currentBattleState`, `statusHealedFix`, `statusCheck`, `hgss_badge_check`, `toggle_pokedex`, `toggle_national_dex`, `unlocked_difficulty_keys`, `transfer_metrics`, `q1`, `bat`, `batp`, `starterProp` | `games/genN/state.ts` (the state machine, like gen1's) and `useSpeciesMetricsStore` | 6.4 |
| UI only | `togglePopup`, `closePopup`, `closeRNGModal`, `popupAction`, `write_rng_initial_trips`, `setup_rng_bag_watchers`, `openFolder`, `openCurrentSplitsFolder`, `openSplitsFolder`, `battle_testing_ui_toggle`, `statLabelOpacity`, `stat_label_opacity`, `svgColorClass`, `nullCheck`, `customFormats`, `importBackports`, `_styleModeBuildList`, `clearInterval`, `badgeGraphic` | the owning component; `features.rngHelper`, `features.backportImporter` | 6.2, 6.9 |
| formatters | the 29 already in `formattersMixin` | `core/logic/format.ts`, typed, when the mixin dissolves | 6.13 |

**`created()`** becomes the species-settings store's `load()` (class b) plus, for gen3, the icon call moved into
`activate()`. **`mounted()`** (1,409-1,732 lines each) has four homes: the `.change()` subscriptions go to
`games/genN/hooks.ts` `installRunHooks(vm)`, verbatim at first with the instance as context exactly as gen1's did
in Phase 1.1, registration order preserved; the state-machine subscriptions (`meta.state`, gen3's `pointers.*`,
gen2's `g2stateVariable`, gen5's `battle.other.battle`) go to `games/genN/state.ts`, installed from a `state`
child so they register before the overlay's own handlers -- the ordering `components/state.vue` exists for;
`bindHotkeys(genNHotkeys(this))` becomes `GameModule.hotkeys()` bound by `main.ts` as gen1's is; and the
`setInterval`s (the 10 ms Shuckie poll; gen3/gen5's 500 ms owned-item tick), the two `addEventListener`s per
generation and the dev-mode listeners go to `activate()`/`deactivate()` and the stores' own start and stop.
`unmounted()` shrinks as they leave. `splits.js` is 6.5, `storage.ts`'s `MyStorage` a shim until 6.13,
`control.ts` and `hotkeys.ts` 6.11; `enemySprites.ts` and `icons.ts` stay as they are.

### 4. The order

Slices are **horizontal**: one shared thing lands and all four generations adopt it before the slice closes, so
the drift check shrinks monotonically and a slice cannot land in three generations and not the fourth. Within a
slice the pilot is **gen2** (decision 27: the one real recording, and the vocabulary closest to gen1), then gen4, gen5, and
gen3 last (the outlier: its `#app` is the grid, its state path is `pointers.*`, its game identity has three
sources). Features unique to one generation (6.9) are vertical. Each slice is one or more commits, every commit
passing the recipe in §5.

**6.0 The net** (Scott records; in parallel with 6.1-6.3):
- The decision-6 recordings, one per generation at minimum, each with the mapper `mapper-matrix.md` names, from New
  Game through the Hall of Fame, covering: the starter; at least two trainer battles including a gym leader and the
  rival; a wild battle; a level-up; an evolution (gens 3-5, with evolution splits on); a blackout; a reset and the
  second attempt; an item pickup and a new move (gen2's Item and New Move markers); a menu (gen4/5's MENU marker);
  a Rare Candy (gen4/5); a Voltorb Flip visit (gen4); a form change (gen3 Castform or Deoxys; gen5 a form species);
  a held-item change; the champion and the Hall of Fame (the finish CSV, `logCopy`). Coverage is then measured by
  6.1's map, not assumed. A recording is about 20 MB gzipped per two-hour run (0.2) and is committed under
  `tools/fixtures/<gen>/` in plain git (decision 24). They are made alongside 6.1-6.3, not before (decision 23);
  gen2's exists, and the rest follow the slice order: gen4, gen5, gen3, then gen1 (decision 27).
- Until they exist: the synthetic scenarios (`tools/parity/scenarios/*.json`, `make-fixture.ts`) are extended with
  the states above that the mapper XML can script -- a second battle, an evolution, an item pickup, the Hall of
  Fame -- each a checkpoint. They stay in the matrix after the recordings arrive; they are cheap and deterministic.
- The dev-mode paths no fixture drives (Style Mode, the defaults write-back, gen2's backport importer, Manual
  DVs/IVs) get `beforeReplay` hooks (`tools/parity/manual-ivs-check.ts` is the worked example) and self-tests.

**6.1 Inventory, coverage, ledger** (tooling, before any move):
- `npm run parity:members` (`tools/parity/member-inventory.ts`, on `drift-check.ts`'s `extractMembers` and
  `loadOverlays`, extended to `data()` keys): for every overlay and every member -- its section, its class (a-e)
  or cluster (§3), its readers (`this.<name>` sites in the script, references in the template), its drift status
  (identical / allowlisted with a reason / allowlisted unreviewed / unique to this generation), the mixin that
  holds it if any, the `known-legacy-bugs.md` rows that name it. Output: `tools/reports/members-<gen>.md` and one
  JSON the slices tick off, regenerated at every commit.
- Coverage per member per fixture: V8 coverage through Playwright on the Electron page
  (`page.coverage.startJSCoverage()`, Chromium's API, over the dev build so line ranges map back to the SFC), a
  `--coverage` flag on `run.ts`, and `parity:members --coverage` marking each member with the fixtures that
  executed it. If the Electron driver will not expose the API, a Vite plugin in the harness build counts entries
  per member instead. The rule it enforces: a member no fixture reaches moves only verbatim (identity proven by
  fingerprint), or after 6.0 gives a scenario or recording that reaches it.
- The quirk ledger: `known-legacy-bugs.md` rows mapped to members (#32 `hash()`, #33 gen4's numeric
  `real_time_hmmss` under a minute, #34/#35 bare reads, #36/#37 gen3's time functions, #43 `split_data`, #44 the
  removed duplicates, #45 gen2's `'this.*'` keys, #46 gen2's SpDef rule; `check-undefined`'s `--allow=hash`), each
  row classified under decision 25: a **game quirk** (it mirrors the game's features, code or presentation -- #46 is
  the model, pokecrystal's `BadgeStatBoosts`; verified against the decompilations in `CLAUDE.md`) is carried
  verbatim; a **code quirk** (an artefact of when the app was written) is fixed in its own commit after the move.
  Approved for fixing already: the crash class (#32, #34, #35, #37), the split-row data class (#33, #36) and the
  persistence and folder class (#45 with a key migration, #2, #11). Every slice states which rows it carries and
  which it fixes; 6.1 also sets `features.forms` to true for gen3 and gen4 (decision 28).
- Adjudicated on 2026-09-25 (§5, decisions 17-21): `fetchEmulatorStats` keeps polling, throttled, everywhere (gen5's
  stop-after-ten is not ported); `load_splits` keeps every row in gens 2-4 and gen5's N rule becomes gen5 data; the
  three Shuckie calls log errors only, everywhere; `convertDurationToSeconds` returns 0 silently everywhere;
  `get_stat` is a per-generation variant and is re-pinned with that reason. The first four are ports (one shared
  body lands in 6.5 / 6.6 and the entries are deleted); the fifth keeps its entry. From then on `parity:drift
  --strict` is the target: the remaining unreviewed entries are worked off slice by slice -- an entry a slice
  dissolves is deleted, one it keeps gets its reason -- and a slice that leaves an unreviewed entry among the
  members it touched is not done.

**6.2 Template split, no DOM change** (each generation, all four):
- Cut each template at the legacy section comments the lifts kept (`GRAPHICS`; `DEBUGGING`, which is the settings
  panel; `Badges`, `TYPE ICONS`, `BADGE ICONS`, `STATS`, `MOVESET`; `RIGHT BAR` / `Right Hand Information Area`
  with `Enemy Team Display`, `Splits`, `Movepool`, `Inventory`, `Second Screen Mode`; `LABELS`, `EXP BAR`;
  `BATTLE POP UPS` with `ACCURACY`, `EVASION`, `SCREENS`, `BONKS`, `REPEL COUNTER`; `Resets` / `FAULTS COUNTERS`;
  `HELD ITEM`, `Gametime`, `Voltorb Flip`, `Popup Menu`, `RNG Configuration Modal`) into components under
  `games/genN/components/`, named after gen1's.
- **Multi-root fragment components, no wrapper element** (gen1's `left_panel.vue` is the model): oracle 1 keys
  every element by its `tag.class:nth-child` chain, so a wrapper would shift every sibling after it. A region
  inside a `<transition>` keeps a single root there. Elements that render nothing stay (`state.vue` and
  `Hotkeys.vue` keep their empty `<div>` for the same reason). gen3's `#app` *is* the grid: its direct children
  keep their order.
- The component reads the overlay instance through `inject` (the root `provide()`s itself) at first, so this slice
  moves markup and nothing else: the `:style` bindings (57-117 per generation) and the template's
  `game.properties` reads (61-144) move unchanged. Each later slice replaces `overlay.<key>` with a store read in
  the owning component, one class of key at a time -- which is also how the perf items land: once the timer text
  and the Shuckie stats live in small components (6.6), a per-frame write re-renders a few nodes, not the page.
- Proof: the no-change run on every fixture of the generation (oracles 1 and 2 identical), `typecheck` (vue-tsc
  parses every new template), `parity:drift` (the extraction does not read templates; the component files' script
  members join its inventory in 6.13).

**6.3 Persistence: `MyStorage` keys to stores** (horizontal; classes a and b):
- `games/genN/settings.ts` declares the generation's setting keys with their defaults (generated from the `data()`
  seeds by 6.1's inventory; the same table `control.ts`'s `status` and the hotkeys read).
  `core/stores/createSettingsStore.ts` builds the store over `userState` for the active namespace under the same
  key names, so oracle 4 is byte-identical and the 2.6 importer keeps working.
- The species-settings store over `styleSettings.ts` with each generation's rules exactly as `storage.ts` passes
  them today (gen2 whole-value writes, immediate; gen3 `<Game>_` keys, replace-on-write defaults; gen4 the
  26-field filter and the 500 ms debounce; gen5 the three-layer read and the 1 s write with no unload flush, #25),
  replacing `created()`'s field-by-field load and the `set_pokemon_prop` / `load_all_settings` cluster.
- The persistence watchers go; the stores autosave with the generation's own write rules, and the dev-mode source
  writes (`source:write`) stay behind the same debounce. Quirks: #45 (gen2's `'this.current_splits'` /
  `'this.previous_splits'` keys) moves verbatim first and is then fixed in its own commit (decision 25): the keys
  become `current_splits` / `previous_splits` and a one-time migration renames them in gen2's section of
  `user_state.json`; #43 stays fixed (`split_data` is not persisted into species entries).
- `MyStorage` stays as a shim forwarding to the stores until its last reader goes (6.13), so the slice lands one
  key class at a time; `parity:members` reports the remaining readers.

**6.4 `mounted` out: hooks, state machine, hotkeys, lifecycle** (horizontal; verbatim first):
- `games/genN/hooks.ts` `installRunHooks(vm)`: the `.change()` block moved verbatim with `vm` as context
  (`games/gen1/hooks.ts` is the model; Phase 1.1 did exactly this for gen1), registration order preserved. The
  state-machine subscriptions go to `games/genN/state.ts` behind a `state` child component so they register first,
  as their position in `mounted` makes them today. `GameModule.hooks.installRunHooks` and `installStateSync` stop
  being no-ops for gens 2-5, and `main.ts` calls them for every module.
- `hotkeys()` returns the generation's table (the tables in `games/genN/hotkeys.ts` already take `vm`; they take
  stores from 6.11) and `main.ts` binds it, so `bindHotkeys` leaves `mounted`; gen1's pre-mapper binding is
  unchanged.
- The `setInterval`s, the `addEventListener`s and the dev-mode listeners go to `activate(game)` / `deactivate()`
  and the stores' start and stop; `unmounted()` shrinks accordingly. Under the fake clock the same periods and the
  same registration instant relative to `ready` (the `__stpPendingBoot` barrier) are behaviour: the hundredths
  flake (7c) is what a moved timer looks like when they are not.
- As the clusters land (6.5-6.9) each hook is rewritten against the stores in its own commit; the hooks file is
  where a generation's run logic reads as one page.

**6.5 Splits: the engine and a store** (horizontal; every fixture reaches a split):
- `core/autosplitter/` from gen1's `autosplitter/autosplitter_functions.js` (`log_split`, `autosplitter_process`,
  `format_trainer_name`, `logData`, `logCopy`), with the per-generation differences as parameters: the header sets
  and column lists; the folder rules (gen2's `Crystal` attempts vs edition finishes, #2; gen3's four folders, #11;
  gen4's `finishFileName`, #21; gen5's refilming variant -- #2 and #11 are code quirks, carried by the variant
  first and fixed in their own commits afterwards, decision 25); the file-name rules (`splitPrefix`, species or family
  names); the `transition()` helper. Each `games/genN/splits.js` becomes a `SplitWriterVariant` selected by
  `logCopyVariant`. Oracle 3 is byte-identical or the slice fails.
- `useSplitsStore` (core): `current_splits`, `previous_splits`, `previous_splits_source`, `split_data`,
  `simple_data`, `simple_data_str`, `full_data_str`, `deprecated_data_str`, `split_logStr`, `collect_split_data`;
  `effective_current_splits` / `displayed_current_splits` become its getter over `useReplaySplitsStore`; the
  right-panel components read it; `/load-split-file` and `pickSplitComparison` write to it. gen1's
  `components/Overlay.vue` adopts it too, closing its own "untangling is plan 1.4's job" note. The store keeps
  every row (decision 18); gen5's `load_splits` rule -- N is fought several times and only his final battle
  registers -- is gen5 data on the module (`data.splits.collapseFinalBattleOf`), not a shared dedupe.
  `convertDurationToSeconds` is one shared helper that returns 0 for a non-string, silently (decision 20).
- `addSplitBookmark` and `sendChapterMarker` stay where the hooks call them; each generation's marker-name table
  moves from `index.ts` to `games/genN/markers.ts` (gen1's shape).

**6.6 Shuckie and timer** (horizontal; after 6.1's adjudication of the three Shuckie entries):
- The five Shuckie methods go to `useEmulatorStatsStore` (`startPolling` with the generation's predicate,
  `shuckie_timer || shuckie_counters`, as gen1's); the `emulatorStats` data key and its watcher go; `faults`, the
  timer and the counters read the store. That ends the 10 ms re-render of the monolith (perf review 2026-09-25;
  performance-followups.md A/B). Decided (§5, decisions 17 and 19): the store keeps polling, throttled, in every generation -- gen5's
  stop-after-ten is not ported -- and the three Shuckie calls log errors only. Oracle 8 sees the calls and oracle 9
  the console, so both land as approved congruence commits after the verbatim move.
- Timer: gen2/gen4's `timer_*` trio and `updateTime` (a formatted array written onto the component every frame) and
  gen3/gen5's `Timer` component + `logic/Timer.js` become `logic/Timer.ts` + `useSpeciesMetricsStore.timer` +
  `left_panel/timer.vue` (which already switches between the Shuckie time and the local timer). gen4's
  `setImmediate` hop (perf E) is dropped (decision 22): one shared loop, and gen4's fixtures are re-baselined if
  the hundredths digit moves. #33 (gen4's numeric `real_time_hmmss` under a minute) travels with gen4's split
  variant first and is then fixed in its own commit (decision 25), as is #36 (gen3's shadowed `gameTimeHM`).
- The `PubSub` copies become gen1's `logic/PubSub.js`; the four `Timer.js` / `PubSub.js` files and the
  `components/Timer.js` / `ShuckieTimer.js` template-string components are deleted. With `main.ts`'s root template
  moved into an SFC, nothing needs Vue's runtime compiler and the bundle switches to runtime-only Vue (the perf
  review's last item).

**6.7 Canonical keys** (horizontal; gen2+gen3's DEPRECATED spellings vs gen4+gen5's STANDARD ones):
- The reviewed "mapper shape" drift entries and their kin -- `battle.enemyPokemon` vs
  `battle.opponent.active_pokemon` (`battEn`); `gameTime.hours` vs `game_time.hours.value`; `weatherCount` /
  `statusReflect` / `lightScreenCount` vs `weather_count` / `reflect_count` / ...; `expPoints` vs `exp`;
  `personalityValue` vs `internals.personality_value`; `yourPokemon.modStage*` vs `active_pokemon.modifiers.*` vs
  gen5's `pkmn_ram.pokemon_0_ram.modifiers.*` -- become canonical keys in the profiles: gen1's vocabulary extended
  (§2's rule), the DEPRECATED profiles identity where they already share gen1's names, the STANDARD profiles
  mapping. `buildCanonicalView` aliases the client's own objects, so `.value`, `.change()` and their timing are
  untouched (its header says why).
- The members whose only difference was the path then collapse into one body, the drift check sees them identical,
  and they move to `core/`. The template's direct reads (61-144 per generation) are renamed to the canonical
  spelling in the same slice, one mechanical rename per key, oracles 1/2 catching a wrong key (it renders
  `undefined`).
- gen3's `pointers.*` / `sStpCallback*` state path and gen5's `battle.other.*` have no gen1 equivalent: new,
  generation-specific canonical keys, declared `unsupported` in the other profiles (§2's rule for the feature
  flags; nothing reads `features` yet -- this is where something starts to).

**6.8 Battle math and the shared tables** (horizontal):
- `core/logic/battle/`: damage range, stat and stage math, type effectiveness, STAB / item / ability / burn /
  weather modifiers, exp and growth, natures, hidden power, badge boosts -- pure, typed functions over explicit
  inputs and the generation's tables on `GameModule.data` (`typeChart`, `stageModifiers`, `typeBoostingItems`,
  `natures`, `hiddenPower`, `badgeBoosts`, the growth tables). `battleMathMixin`, `dsPairMixin`, `naturesMixin`
  and `manualIvsMixin` dissolve into it as each member is typed; `npm run parity:battle-math` is a self-test per
  function family, its cases taken from the fixtures' checkpoints and from the decompilations (`CLAUDE.md`: game
  internals come from the source, never guessed).
- Tables move to `core/data/` only when identical (2.2's rule). Measured 2026-09-25: `type-effectiveness.js`
  gen3 = gen4 = gen5 (gen2's is the Gen 2 chart and stays); `hiddenpower-all.js` gen3 = gen4 = gen5;
  `default_colors.js` gens 2-5; `cross_generation_moves.js` gen2 = gen3 = gen5 with gen4's differing by four lines
  (a diff to review, then one file or two); gen4 = gen5 for `hiddenpower.js`, `hiddenPowerTypes.js`,
  `natureDefinitions.js`, `post_game_moves.js`, `misc/tmhm.js`, `moves/natural_gift.js`; `natures.js` gen3 = gen4
  after whitespace only, and gen5's is the same table without the 25 index entries -- "identical after
  whitespace normalisation" counts (decision 29): the inventory records the normalisation and the normalised
  fingerprint, and anything differing beyond whitespace stays per generation. Different
  everywhere and staying per generation: `stageModifiers.js`, `typeBoostingItems.js`,
  `type effectiveness array.js`, `autosplitter.js`, `auto_save_settings.js`, `textures.js`,
  `unobtainable_moves.js`, the dex, trainer and move tables. The duplicated imports (gen4's `platinum_trainers.js`
  = `trainers/platinum.js`; gen3's `pokedex/firered_leafgreen.js` ≈ `firered_leafgreen.js`) are aliased, one file
  per commit (decision 14: consolidation after parity).

**6.9 Feature modules behind flags** (vertical where a feature is one generation's):

| feature | generations | today | destination |
|---|---|---|---|
| evolution splits and families | 3, 4, 5 | `getEvolutionFamily*`, the `evolution` / `selected_evolution_species` watchers, gen3's `evolution_family_data/*`, `hasMultipleEvolutionStages` | `core/logic/species/evolution.ts` over `GameModule.data.evolutionFamilies`; `features.evolutionSplits` |
| forms | 3 (Castform, Deoxys), 4 (`forms.js`, 2026-09-20), 5 (`POKEMON_FORMS`, battle-only forms, Zoroark) | per-generation tables and methods | `core/logic/species/forms.ts` over `GameModule.data.forms`; `features.forms` -- gen3 and gen4 say `false` today although both carry forms; set to `true` in 6.1 (decision 28) |
| ROM patching, encounters, starter | 2 (value writes, DVs, hidden power, `hStpCatchRate`), 3 (dual `stp_vars.*` / `patch.*`, trash cans), 4 (`setBits` flags, `hm_*` / `encounters_*`), 5 (`patch.encounter_*`, the party byte rewrite, bag, options) | watchers and methods in the overlay | `games/genN/patches.ts` `installPatchWatchers(stores, game)`, writes declared in the profiles (oracle 5); `features.romPatching`, `features.encounterFlags` |
| Voltorb Flip | 4 | the `voltorb_flip` computed and the template grid | `games/gen4/components/voltorb_flip.vue`; `features.voltorbFlip` |
| RNG NPC helper | 4, 5 | `rng_*` state, the modal, `write_rng_initial_trips`, `setup_rng_bag_watchers` | `games/genN/components/rng_modal.vue`, `core/logic/rng.ts` if the two bodies agree |
| second screen | 5 | `second_screen_mode`, `sendVirtualKey` | `games/gen5/components/second_screen.vue`; `features.secondScreen` (#16: probably broken, preserved as is) |
| Style Mode and the enemy sprite resize | 2-5 | `enemySpriteStyleMixin` + the per-generation `_styleModeBuildList`, `isInDevMode` | gen1's `useEnemySpriteResizeStore` + `enemy_sprite_resize_handle.vue`, the species list from `GameModule.data` |
| backport importer | 2 | `importBackports`, `backports.js`, `backportOverrides.ts` | `games/gen2/backports/` behind `features.backportImporter` (decision 15) |
| item and held-item watchers, Item / New Move markers | 2 (the markers), 3 and 5 (the 500 ms owned-item tick, perf F) | blocks in `mounted` | `games/genN/hooks.ts`, then `core/logic/items.ts` where the bodies agree |
| vitamins, Rare Candy status (2), Fling (4, 5), badge boosts (2, 3), the exp bar, the bonk and repel counters | mixed | methods and template | the owning component and `core/logic/battle/` |

**6.10 Right panel and movepool** (per generation; shared where the DOM agrees):
- The enemy team display and trainer graphic, the splits (First, Followup, summary), the movepool (level-up,
  TM/HM, tutor and egg -- four tables in gen4/gen5) and the inventory become components. The trainer-team and
  movepool tables are where the per-frame cost lives: `getMovepool` is called three times per render from `v-for`
  and each call does a case-insensitive linear scan (0.6-0.9 ms per call on gen4's tables, perf review
  2026-09-25); it becomes a computed keyed on the displayed species over a lower-cased index built once
  (`core/logic/moves.ts`). `movepoolResize()` leaves the table's `:style`: it registers a `.change()` handler on
  the party slot's species on every render, never removed until the mapper unloads; it is registered once in the
  component's `mounted` and the method made pure. Both are behaviour-preserving: oracles 1/2 prove the same rows
  and the same styles, and the frame cost is measured before and after (performance-followups.md, "How to verify").
  The same-day performance pass may have landed both already; if so this slice inherits them and only moves them
  into the components.

**6.11 Control routes and hotkeys on stores** (horizontal):
- `games/genN/control.ts` reads and writes the stores instead of the instance; the `/status` field names per
  generation (`starter` / `starterString`, `right_panel` / `right_ui`, `selected_game`, `hpType`, `nature`,
  `ability`, `evolution`...) and every reply body stay exactly as they are -- oracle 6 compares key by key and
  `external-contracts.md` §2 is the contract. `/set-evolution`'s write past the style manager (the bare
  `<game>_<starter>` key) becomes a store action that performs the same write.
- The hotkey tables target the stores and drop `vm` from their signature; `GameModule.hotkeys()` no longer needs
  the instance, and `ControlContext.overlay()` goes.

**6.12 Texture registry and sprite resolver** (4.3 and 4.4 resume here):
- With images addressed through functions (`getPokemonImageUrl`, `getStarterTypeTexture`, `badgeGraphic`,
  `split_image`, `getTrainerGraphic`, `held_item_icon` are the seams), `core/assets/resolver.ts` provides the three
  tiers (game, generation, shared) over the pool's existing layout, and each generation's texture vocabulary is
  registered (`textures.js` has five shapes; gen5's entries carry default background settings applied on pick --
  behaviour, kept). Decision 2's "(Gen N)" suffix in the picker. Oracle 2 proves every URL still resolves to the
  same bytes.

**6.13 Retire the monoliths**:
- `games/genN/Overlay.vue` at or under about 200 lines: components, `provide()`, nothing else. The `MyStorage` and
  `StyleSettingsUtils` shims deleted; the mixins dissolved (their `@ts-nocheck` bodies were typed as 6.6-6.9
  rewrote them); the module-level `let` declarations of the legacy sloppy-mode globals gone, each having become
  state or a local; `check-undefined` clean over every module.
- `parity:drift` retargeted: it extracts members from `games/genN/**/*.vue` and `games/genN/*.ts` by file role (a
  member of the same name in the same role compared across generations) and asserts the four overlays' `methods`,
  `computed` and `watch` are empty. The allowlist ends at zero unreviewed entries, or the residue is a documented
  per-generation variant with its reason.
- README's "gen2-5 are lifted" paragraph is replaced with the decomposed shape.

**6.14 Exit**: `npm run parity:all` green on every fixture, recordings included; gen1's `unified@<dir>` check on
every core change; `typecheck`, `parity:drift --strict`, every self-test; performance re-measured (renders per
second with the Shuckie timer on, the entry chunk, the movepool cost) and `docs/performance-followups.md` updated;
7g complete.

### 5. The recipe, every commit

1. **Scope** from the inventory: the members, data keys and template lines the slice moves, per generation; their
   coverage per fixture; the quirk-ledger rows they touch; the drift entries they dissolve or keep.
2. **Baseline**: a built worktree of HEAD (`git worktree add <dir> HEAD`, a `node_modules` junction,
   `npm run build`) and `unified@<dir>` on every fixture of the affected generations, `--redirect-ports
   --control`; gen1's fixtures too whenever `core/` changes.
3. **Move verbatim.** Never move and rewrite in one commit (the mixins' rule); a rewrite is its own commit against
   the moved code as its baseline.
4. `npm run typecheck`; `npm run parity:drift` (entries the slice dissolves deleted, entries it keeps re-reviewed
   with a reason, `--update` only after reading the diff it reports); `tools/port/check-undefined.ts` over every
   new module; the relevant self-tests (`parity:bookmarks`, `parity:replay-splits`, `parity:debounce`,
   `parity:manual-ivs`, `parity:battle-math` once it exists); `parity:members` regenerated.
5. **Candidate** run on the same fixtures and `diff.ts` against step 2: all nine oracles green. A difference is a
   bug unless Scott approves it as a congruence change (the hard rule at the head of this document), and an approved
   change is its own commit after the no-change one.
6. **Commit** named for the slice and generation; the 7g row updated.

### 6. Rules (in addition to §2 and §4)

- **DOM identity**: fragment components, no wrapper elements, every legacy element kept including the empty ones
  and the `v-if` conditions that remove them; a `<transition>` keeps a single root.
- **Persisted names**: the same key names in the same user-state namespace, the same style-key rules and write
  debounces per generation. The 2.6 importer and oracle 4 both depend on it.
- **Order of effects**: `.change()` registration order; `setInterval`, `setTimeout` and `requestAnimationFrame`
  counts and periods; the instant relative to `ready` -- all behaviour under the fake clock.
- **Differences are data**: `features`, `data`, `hooks`, a profile, or a variant component; never
  `if (generation === 4)` in `core/`. Mapper-shape differences are canonical keys, not conditionals.
- **Console lines are oracle 9**: a `console.log` moved, added or removed is a diff (gen3's silenced Shuckie lines
  need Scott's call before 6.6).
- **Game quirks are kept, code quirks are fixed** (decision 25, amending decision 4): every quirk a slice touches is
  classified in the ledger; a game quirk is carried verbatim and named in the commit; a code quirk is fixed in its
  own commit after the no-change one, never inside the move. Standardising the implementation is the goal wherever
  the harness can prove the result.
- **Tables move to `core/data/` only when identical**, or identical after whitespace normalisation with the
  normalised fingerprint recorded (decision 29).
- **No logic moves through a state no fixture reaches**: verbatim moves only there, until 6.0 delivers the
  recording or scenario. The coverage map is the go/no-go per member.
- **Read `parity:drift`'s per-generation counts on every run** (the 2026-09-17 lesson: a comment edit hid a
  hundred members from the check).

### 7. Risks

- **Coverage** (§6's first risk, still the ceiling): 6.0 and 6.1's map; a member is moved as logic only when a
  fixture executes it.
- **Reactivity shifts**: a `data()` key on the component and a Pinia state field batch and watch differently
  (`$patch`, flush timing), and `MyStorage` returns a fresh object per read where a store returns the same reactive
  object -- `control.ts` mutates `MyStorage[key].evolution` and writes it back, which a store must not double-apply.
  Oracles 1 and 4 catch it; the pilot generation finds it first.
- **Fragments**: a multi-root component inside `<transition>` or beside keyed `v-for` siblings; gen3's grid
  placing direct children. Oracle 1 catches every misplaced element.
- **Options API `this` everywhere**: a moved key breaks every reader; the inventory's reader lists make the rename
  mechanical, and `typecheck` reaches template reads only once the components are typed.
- **Timing**: gen4's `setImmediate`, the 10 ms poll, `debouncePaths` / `debounceFrames`, the boot barrier --
  parity-harness.md's "Determinism is not free" lists what breaks and how each was found.
- **Dev-mode-only paths** without fixtures: `beforeReplay` hooks and self-tests, not review.
- **Concurrent work in the same files**: the performance pass of 2026-09-25 edits the overlays while this plan is
  written; 6.1's inventory is regenerated from whatever is committed when the phase starts, and every measurement
  above is re-taken then.
- **Scale**: four generations times a dozen slices; the drift check is what keeps a slice from landing in three
  generations and not the fourth, and horizontal slices are the discipline that keeps it shrinking.

### 8. Decisions taken (2026-09-25)

Scott answered the open questions on 2026-09-25; §5 holds them as decisions 17-29 and the slices above cite them.
In one place, what each changes:

| decision | effect on the plan |
|---|---|
| 17 the Shuckie poll keeps polling, throttled | 6.6 uses `useEmulatorStatsStore` as it is; gen5's stop-after-ten goes, its allowlist entry with it |
| 18 no general split dedupe; gen5's N rule is data | 6.5's store keeps every row; `data.splits.collapseFinalBattleOf` on gen5's module |
| 19 Shuckie calls log errors only | 6.6; gen3's silenced lines and the others' success lines both go |
| 20 `convertDurationToSeconds` returns 0 silently | 6.5, one shared helper |
| 21 `get_stat` stays per generation | 6.8: one variant per generation over shared pure helpers; the entry re-pinned |
| 22 `setImmediate` dropped | 6.6: one timer loop; gen4 re-baselined if the frame grid moves |
| 23 recordings alongside 6.1-6.3 | 6.0 runs in parallel; a logic slice waits per member for coverage |
| 24 recordings committed | `tools/fixtures/<gen>/`, plain git |
| 25 game quirks kept, code quirks fixed | the ledger classifies every row; three groups approved; the rule is in `CLAUDE.md` |
| 26 visuals stay per generation | no §4 unification inside Phase 6 |
| 27 gen2 pilots | slice order gen2, gen4, gen5, gen3; the remaining recordings in that order |
| 28 `features.forms` true for gen3 and gen4 | 6.1 flips the flags |
| 29 whitespace-normalised identity counts | 6.8's table moves |

Nothing in this plan now waits on a decision; what remains is work.
