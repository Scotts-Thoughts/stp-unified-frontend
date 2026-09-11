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
5. Games with data but no selection (Ruby/Sapphire, gen2's Gold/Silver trainer table, Diamond/Pearl in gen4) → unchanged.
7. Hotkeys → per-gen F-key tables preserved including their quirks; a single unified table is a later feature.
9. gen5 second-screen toggle → ported behind `features.secondScreen`, documented as probably broken (#16).
12. Queuer edits (3.6) and dropping gen2's dead CDN tags (#4, #5) → done in Phase 3.6 / 2.1; the queuer change is
    shown to Scott when it lands, and the unified app runs with no network access at startup.
13. Inventory sprites → included in the pool.
14. Data provenance → per-gen data verbatim now; `data_objects` consolidation after parity as its own change.
15. gen2 backport importer → writes userData overrides, never shipped files.
16. gen1/gen2 box art → `icon.png` / `2-crystal.png` as placeholders until Scott supplies art in the gen3–5 style.

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
| 1.10 | Persistence to files, `localStorage` retired | ◐ the four `localStorage` consumers now use `core/persistence/userState.ts`; the **one-time import of gen1's own `Local Storage`** is not built — `external-contracts.md` §6 puts the Chromium LevelDB reader in Phase 2.6, where four more generations need it, so it is better built once there. Until then a gen1 user's saved split comparison and OBS credentials do not carry over. |

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
   generation's own key rules (2.6; the LevelDB importer is still to come).
7. Parity against the legacy app under the harness (2.7).

| gen | inventory | data | profiles | lift | CSS | persistence | parity vs legacy |
|---|---|---|---|---|---|---|---|
| 2 | ✅ 256 paths / 60 writes | ✅ 25 files + 40 style JSON | ✅ Crystal, Gold & Silver | ✅ `games/gen2/Overlay.vue` | ✅ 706 rules | ✅ (import deferred) | ✅ **all nine oracles green** on the recorded Crystal run (`c-wigglytuff-2-11311`, 22 checkpoints), three unified runs against a legacy baseline that two legacy runs agree on (2026-09-11) |
| 4 | ✅ 231 paths / 79 writes | ✅ 31 files + 383 style JSON + 506 sprite scales | ✅ Platinum, D&P, HG&SS (`ST/gen4/*_ne` and `STANDARD/gen4/*`) | ✅ `games/gen4/Overlay.vue` (10,607 lines) | ✅ 569 rules | ✅ gen4's key rule, style-field filter, 500 ms debounced write | ✅ **all nine oracles green, pixel-exact** on the synthetic Platinum fixture (`gen4-platinum-smoke`, 19 checkpoints), two unified runs against a legacy baseline two legacy runs agree on (2026-09-11) |
| 5 | ✅ 241 paths / 83 writes | ✅ 26 files + 327 style JSON + 669 sprite scales | ✅ Black, White, Black 2, White 2 (`STANDARD/gen5/*`) | ✅ `games/gen5/Overlay.vue` (10,641 lines) + its Timer/PubSub/timer components and form tables as ES modules | ✅ 570 rules | ✅ gen5's key rule, style-field filter, three-layer read, 1 s debounced write without flush | ✅ **all nine oracles green, pixel-exact** on the synthetic Black fixture (`gen5-black-smoke`, 14 checkpoints), two unified runs against a legacy baseline two legacy runs agree on (2026-09-11) |
| 3 | | | | | | | |

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
- gen4's parity fixture is synthetic (`tools/parity/scenarios/gen4-platinum-smoke.json`, built from the
  shipped `ST/gen4/pokemon_platinum_ne.xml`): a new game, the starter, a route change, a wild battle, Leader
  Roark, a level-up, a blackout and a reset, 21 checkpoints over 90 s. It proves determinism and no-change
  under the lift, not correctness (decision 6 still stands). Its Roark split is placed after the timer's first
  minute on purpose: known-legacy-bugs.md #33. gen5's (`gen5-black-smoke.json`, from
  `STANDARD/gen5/pokemon_black.xml`) follows the same shape with gen5's own edges: `flags.new_game`, the
  `player.name` reset, the `battle.other.battle` pointer for a blackout, and the Cilan split.

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

