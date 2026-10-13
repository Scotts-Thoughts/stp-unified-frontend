# Architecture

This is the map of the codebase: what lives where, how the pieces connect, and the rules that hold everywhere.
It describes things that change rarely. For the history of how the code got here, see
`docs/IMPLEMENTATION_PLAN.md` (§13 below says which parts of it are still live).

Names are given as symbols and paths so you can search for them. Sections are numbered so `AGENTS.md` can point at them.

**Reading one section.** Run `grep -n '^## ' ARCHITECTURE.md` to get each section's starting line, then read
only that range.

**Keep it current.** This file is the shared memory for agents on every machine. When you learn something lasting,
add it to the matching section, keeping it short.

- If the fact is specific to one machine, say which machine.
- If a new section is needed, add it at the end, so the existing numbers `AGENTS.md` points at stay the same.

## 1. Bird's-eye view

The STP overlay is one Electron app that draws a stream overlay for Scott's Thoughts Pokémon runs. It covers
five generations: gen1 (Yellow, Red & Blue), gen2 (Crystal, Gold & Silver), gen3 (Emerald, FireRed & LeafGreen),
gen4 (Platinum, Diamond & Pearl, HeartGold & SoulSilver) and gen5 (Black, White, Black 2, White 2).

It reads live game memory from a memory tool: PokeAByte by default, or GameHook. The memory tool exposes a
*mapper*, a tree of named game properties such as party, enemy and bag. The overlay:

- picks the generation that matches the loaded mapper;
- renders that generation's overlay;
- writes split CSVs;
- sends chapter markers to OBS and bookmarks to Super Shuckie;
- answers a recording queuer over a local HTTP control server.

The code came from five separate legacy apps, one per generation. **gen1 has been refactored** into small Vue
components and Pinia stores. **gen2–5 are "lifted"**: each is its legacy app's giant component, brought in
verbatim with only the plumbing swapped. Breaking the lifted overlays up is the current long-running job
(Phase 6, §5).

Correctness is measured, not eyeballed. The **parity harness** (§12) replays a recorded game session into the
app and compares nine things against a baseline: pixels, layout, split files, saved state, writes, markers,
and more. A refactor is done when the harness shows no difference.

## 2. Code map

```
src/main/         Electron main process (Node). Window, file IPC, control server, keyhook, cutter mode.
src/preload/      index.js defines window.api, the renderer's entire view of main. Types: src/renderer/index.d.ts
src/shared/       Pure TS used by both sides: user-state file format, split/replay bookmark formats.
src/renderer/
  main.ts         The shell: boot, mapper client, game detection, module load/unload. See §3.
  core/           Shared by every generation. Never imports games/ (§10).
  games/          registry.ts, profiles.ts, and one folder per generation (gen1..gen5).
  packages/       gameHookMapperClient.ts: the one memory-tool client (PokeAByte or GameHook).
  components/ stores/ logic/ autosplitter/ methods/ utils/ data/
                  gen1's own code, despite the generic names (§4). Exception: components/GameSelect.vue
                  is the shared box-art screen shown before a mapper loads.
  public/images/  Image pool: gen1 at the root, others under images/genN/. Lossless WebP.
  fonts/
tools/            Dev tooling, not shipped. See §12 and §13.
docs/             Reference docs. See §13.
```

### src/main

- `index.ts`: window creation, first-launch legacy imports, IPC registration, control server, then keyhook
  (last on purpose, because antivirus delays the spawn). The window has `backgroundThrottling: false`: OBS
  captures it while it may be covered or minimised, and a throttled window stops `requestAnimationFrame`.
- `paths.ts`: `appRoot()`, `splitsRoot()`, `userDataRoot()`, etc. `resolveInside()` guards every IPC path.
- `ipc.ts`: all file IPC. Writes to `storage/` and source files are refused in a packaged build.
- `control-server.ts`: `ControlServer` on `127.0.0.1:30159` (`STP_CONTROL_PORT` overrides it).
  - `/quit`, `/reload` and `/load-split-file` are answered in main.
  - Every other route is forwarded to the renderer (`control-request` / `control-reply`, 5 s timeout).
- `keyhook.ts`: spawns `keyhook.exe` (Windows only) and forwards key lines as `keyhook:key`.
- `timer-frame-server.ts`: serves `timer-frame.html`, the clock page, on `127.0.0.1:30160` (§8). The page and
  its two fonts are bundled with the main process (`?raw` and electron-vite's `?asset` imports). `STP_TIMER_FRAME=off`
  skips it; the URL reaches the renderer as `--timer-frame-url=` (`window.api.timerFrameUrl`).
- `importLegacy.ts`, `leveldb.ts`, `localStorageImport.ts`: the one-time seeding from the legacy apps' profiles.
- `splitComparison.ts`, `replayFile.ts`: read split comparisons from `.replay` bookmarks or legacy CSVs.
- `cutter.ts`: the air_cutter editor modes (`--cutter-*` flags), which replace the normal boot.

### src/renderer/core

| Folder | What it holds |
|---|---|
| `mapper/` | `MapperProfile` (plain data: path patterns, identity rule, read/write tables); `MapperAdapter.ts` (`buildCanonicalView`, `matchesPath`, `matchesIdentity`) |
| `game/` | `GameModule`, `Edition`, `ModuleManifest`, and `active.ts` (the active module and namespace) |
| `persistence/` | `userState.ts` (debounced JSON store), `styleSettings.ts` (layered style defaults), `splitFiles.ts` (serial queue over the splits IPC) |
| `stores/` | `useEmulatorStatsStore` (Super Shuckie poll), `useReplaySplitsStore` |
| `control/` | `registerControlServer`: turns forwarded requests into per-generation route calls and builds `/status` |
| `hotkeys/` | `KeyHook`, `bindHotkeys(table)` |
| `overlay/` | Mixins shared by the lifted gen2–5 overlays (§5), `LiveText`, and `ClockFrame` (the clock in its own process, below) |
| `logic/` | Cross-generation helpers: OBS (`obs.ts`), Shuckie bookmarks, split comparison, enemy sprite scales, starter IVs, move reminder, battle mechanics (speed, accuracy, move power, OHKO; §4) |
| `window/` | `scaleToFit`, virtual keys |
| `styles/base.css` | The document reset only. Each generation's look is in `games/genN/style.css` |

## 3. How a game gets on screen

All of this is in `src/renderer/main.ts`.

1. **Startup.** It loads env, user state and legacy storage. It styles the pre-mapper screen with gen1's module
   (gen1 is imported eagerly; gen2–5 are lazy chunks). It creates `GameHookMapperClient` and connects.
2. **Mapper loads.**
   - `detect()` in `games/registry.ts` walks every manifest's `MapperProfile`s. It tries the path pattern
     first, then the identity rule.
   - If nothing matches, `GameSelect` shows "unsupported mapper". Hack mappers are deliberately unsupported.
3. **Module loads.**
   - `loadModule(manifest)` imports `games/genN/index.ts`.
   - The module's `prepare()` runs, and its stylesheet goes into `<style id="stp-gen-style">`, scoped under `.gen-N`.
   - The active module and user-state namespace are set, then `activate()` runs.
4. **Overlay mounts.** `module.overlay` is mounted with a `game` prop: `{module, profile, game, properties, meta, setBits}`.
   - `properties` is the profile's **canonical view** (`buildCanonicalView`). Its leaves are the client's live
     property objects.
   - The view is rebuilt when the client replaces its tree, which happens every 60 s.
5. **Mapper unloads.** Subscriptions are cleared, `deactivate()` runs, and gen1 styling is restored. The shell
   returns to `GameSelect`.
6. **Window icon.** As soon as the overlay for a detected game is up, the shell sets the taskbar icon to that
   game's cartridge (`Edition.icon`, a file under `resources/icons/`). Red and Blue are one mapper, so that
   icon follows the edition. A pair shares the first game's cartridge (Gold for Gold & Silver, and the same
   for FireRed, Diamond and HeartGold). With no mapper loaded the icon is the portrait,
   `resources/icons/default.png` (the same picture electron-builder stamps on the exe). Clicking
   a tile on the pre-mapper screen sets that tile's cartridge until a mapper loads.

A `loadSequence` counter discards stale loads when mappers change quickly.

## 4. The generations

Every `games/genN/` has:

- `manifest.ts`: mapper profiles and editions, known before the module loads;
- `index.ts`: the `GameModule`;
- `mappers/`: `MapperProfile`s and the `*-paths.ts` read/write tables;
- `style.css`;
- `data/`.

**gen1 (refactored).**
- `games/gen1/` holds the module, `hooks.ts`, `state.ts`, `hotkeys.ts`, `control.ts`, `markers.ts` and the
  split tables.
- The overlay itself is `src/renderer/components/Overlay.vue` (~200 lines), built from `components/left_panel/`,
  `right_panel/` and `settings/`, with the Pinia stores in `src/renderer/stores/`.
- gen1's data layer is `logic/PokeData.ts` over `data/`.
- The ROM starter (`patch.hChosenStarter`, HRAM `$FFDF`) is reset by the patch's `Init` on every soft reset
  and power-on: stp-pokered writes `$FF` (default starters), stp-pokeyellow `SPECIES_STARTER` (Backport, or Mew
  without backports). `components/settings/interface_2.vue` watches the byte and writes the solo Pokemon again,
  once per reset. Any other write to it must expect that.
- The encounter flags (`patch.encounter_flags.*`, the forced HM-user encounters): stp-pokered's rival battle in
  Oak's Lab turns Spearow, Geodude and the Cut user on itself. `components/settings/encounters.vue` overwrites
  every flag with the run's settings when the player leaves the lab before the Pokedex (`set_encounters`), and
  writes a single flag when its checkbox changes. Mt Moon checks Geodude before Paras, so a Geodude flag left on
  wins. The patch clears a flag when that species is caught. The gen1 smoke fixture never takes this path.

**gen2–5 (lifted).**
- `games/genN/Overlay.vue` is a single Options-API component of 7,000–10,000 lines. Around it sit:
  - `hotkeys.ts` (`genNHotkeys(vm)`), bound by the overlay's own `mounted`;
  - `control.ts` (`genNControlRoutes(vm)`);
  - `storage.ts` (`MyStorage`, style defaults);
  - `splits.js` (split CSV writing);
  - `data/`.
- Per-generation extras:
  - gen2: `backports.js` and `backportOverrides.ts`;
  - gen3 and gen5: `logic/Timer.js` and `PubSub.js`, and a small `components/` folder (`Timer.js`; gen5 also
    has `ShuckieTimer.js`);
  - gen4 and gen5: `forms.js`;
  - gen2–5: `enemySprites.ts`.
- The seams where the legacy code was re-plumbed (`this.game.*` instead of `this.mapper.*`, the IPC in place of
  `fs`, and so on) are listed in a comment block at the top of each overlay's `<script>`.

**Move power in battle (gen4, gen5).**
- The power shown for the player's moves comes from `typeEffectiveness` in each overlay.
- `in_battle_calc` says whether the in-battle calculation (type matchup included) is used. It is false out of
  battle, once gen4's enemy state is `Battle Finished`, in a gen5 double battle, and with `typeCalcs` off.
  Then the plain power is shown.
- It reads the enemy's defensive abilities (Levitate, Filter, Flash Fire and so on) through `target_ability`.
  That is `null` when:
  - the player's ability is Mold Breaker, or in gen5 also Teravolt or Turboblaze, because those ignore the
    target's ability (pokeplatinum `Battler_IgnorableAbility`);
  - `in_battle_calc` is false, because the enemy data in memory is then left over from the last battle.
- A new defensive-ability check must read `target_ability`, not the enemy's ability directly.
- `enemy_effective_power` (the enemy's moves) never shows a number: gen4's first line always returns, and
  gen5 never calls it (known-legacy-bugs #49).

**Battle mechanics shared across generations (2026-10-13 audit).**
- The rules live in `core/logic/`, each read from the decompilations and covered by a `tsx` self-test:
  `battleSpeed.ts` (gens 4-5 turn-order Speed and who moves first, `parity:speed`), `moveAccuracy.ts`
  (gens 3-5 accuracy, `parity:accuracy`), `movePower.ts` (Flail/Reversal, Gyro Ball, Wring Out, Trump Card,
  Punishment, and gen5's Stored Power, Electro Ball and Heavy Slam, `parity:move-power`),
  `ohkoAccuracy.ts` (`parity:ohko`). Add a mechanic there, not as another copy in each overlay.
- **One-hit KO moves show "KO" in the power column** (Scott's rule, all five generations): `ohkoPowerText` in
  `ohkoAccuracy.ts`, or 0 in battle when the type chart (or Levitate, Wonder Guard...) leaves them no effect.
  gen1's data gives them power 1, the game's own placeholder, which used to show as 1.
- **One place per effect (Scott's rule).** An effect on a stat (Choice Band, Huge Power, Light Ball in gen5)
  shows in the stats panel; an effect on the move or the target's side (type items, screens, Explosion
  halving Defense) shows in the power column. Never both, or the number counts it twice.
- The speed label compares the Speed the game uses for turn order (stages, items, paralysis, Tailwind,
  Unburden) and, under Trick Room, says who moves first.
- Battle flags (Unburden, Tailwind, Trick Room, screens, Foresight, Flash Fire...) are `battle.flags.*` in the
  Platinum and HG/SS `_ne` mappers and the gen3 ST mappers. D/P and gen5 have none, so those effects do
  nothing there. HG/SS names the Unburden flag `knock_off_flag` (pokeheartgold `unk88.knockOffFlag`).
- gen5's `battle.opponent.active_pokemon` is pinned to party slot 0; the enemy that is out is
  `battle.opponent.pkmn_ram[pokemon_<party_position>_ram]` (`activeOpponent()`).
- gen5 weather is switched off in `typeEffectiveness` (known-legacy-bugs #58), so gen5's accuracy leaves
  weather out too.
- **Weather is a bit field in gens 3 and 4.** Each weather has a temporary bit and a permanent bit (Drizzle,
  Drought, Sand Stream, Snow Warning, overworld weather), so a glossary on the raw value must list every
  combination. In gen4 the same bytes also hold Uproar and Gravity, so gen4 reads the bits instead:
  `battleWeather()` (what is on the field, for display) and `effectiveWeather()` (empty under Cloud Nine or Air
  Lock, for every damage, speed and accuracy rule). Don't read `battle.field.weather` directly in gen4.
- Simple differs by generation: gen4 doubles the stored stage when it is used, gen5 doubles each change as it
  is applied (the stored stage already counts it), so only gen4 code may double a stage for Simple.
- A move's in-battle power that depends on the target or on earlier turns (Brine, Rollout, Trump Card...) is
  gen4's `battleMovePower`; gen4 works out a battler's gender from its personality value
  (`battlerGender`), because the battle structure's gender is not mapped.

**The clock in its own process (all five generations, 2026-10-01).** After the gen2 legacy app's "timer fix"
(its commit `1ab51d8`). The overlay's own clock is a `requestAnimationFrame` loop on the page, so a long script or
a heavy repaint stalls it. Now `core/overlay/ClockFrame.ts` draws an `<iframe>` over the clock, showing
`src/main/timer-frame.html` from `127.0.0.1:30160`; the address differs from the overlay's (`file://` packaged,
`localhost` in dev), so Chromium gives the frame its own renderer process, and the page computes the time itself
from the state the overlay posts (start, pause, Super Shuckie's time, the clock's colour).
- Each generation keeps its clock markup and hides it (`visibility: hidden`) while the frame is live; with no
  frame URL (the harness, the Cutter chain, port 30160 in use) nothing changes. The frame's box is the
  `.gen-N .gametimeFrame` rule in each `style.css`; the page copies each generation's `.gametime*` geometry and
  loads the generation's `oseb` font (gen1/2 and gen3-5 ship different files).
- Each parent `provide`s the state as a computed (`clockState`, like `liveText`), so its own render never
  depends on the timer fields or the Shuckie polls. gen2/gen4 build it from their `timer_*` data; gen3/gen5 from
  `MyStorage` on `Timer.onChange` (their storage
  proxy is not reactive, and must not be read through the reactive `timer`, whose Symbol-key probes its get trap
  cannot take); gen1 from `useSpeciesMetricsStore().timer`.
- Checked on the Mac with the page frozen for 2 s: the frame's worst gap was 10-12 ms in every generation, the
  page's own clock 2 s. The Shuckie-timer mode shows the last posted emulator time, so it still stalls with the page.

**Adding a mapper or edition.**
- A new `games/genN/mappers/<x>.ts` profile, listed in that generation's `manifest.ts`.
- An `editions` entry (box art, split folder, icon).
- Then run `npx tsx tools/parity/profile-check.ts` and a harness run.

## 5. Lifted overlays, shared mixins, drift, and Phase 6

**Mixins.** Code that the four lifted overlays share lives in `core/overlay/*Mixin.ts`. Most are verbatim legacy
JS under `@ts-nocheck`. Editing a mixin changes several generations at once:

| Mixin | Used by |
|---|---|
| `overlayCommonMixin`, `battleMathMixin`, `formattersMixin`, `enemySpriteStyleMixin` | gen2–5 |
| `naturesMixin`, `manualIvsMixin`, `speciesArtMixin` | gen3–5 |
| `dsPairMixin` | gen4–5 |

**Drift check.** Methods that share a name across the gen2–5 overlays but have different bodies must be listed
in `tools/parity/drift-allowlist.json`. `npm run parity:drift` fails otherwise.
- Changing one copy of such a method means you either change all copies (a cross-generation fix) or
  re-review the allowlist entry.
- It is a 3-second static check, so run it after any gen2–5 edit.

**Render traps in the lifted overlays** (docs/performance-followups.md lists what was fixed).
- A method the template calls must not write `data()` that the template reads. Vue queues the render again and
  loops until the value settles, all before the first paint (gen4's stat countdown ran 43 renders per battle
  exit, known-legacy-bugs #80). Existing writers: `get_stat` (`stat_fix_*`), gen5 `typeEffectiveness`.
- Each template is over a thousand lines and re-renders on any mapper value it reads. Something that changes
  often (per frame, per poll, per step) belongs in a small child or a computed (`LiveText`, `on_starter_spot`),
  and a lookup the template repeats belongs in an index (`core/logic/firstMatchIndex.ts`,
  `caseInsensitiveLookup.ts`), not a `find` over a table.

**Phase 6** is breaking each lifted overlay down to a ~200-line composition root like gen1's.
- The plan is the last section of `docs/IMPLEMENTATION_PLAN.md`, "Phase 6 plan". Its §5 "The recipe" and §6
  "Rules" are the parts to follow.
- The status table is §7g of the same document.
- The order is set by decision 27: gen2 pilots, then gen4, gen5, gen3.
- Each slice lands one shared piece in all four generations.
- Rules:
  - A move and a rewrite never share a commit.
  - CSS classes and element ids do not change.
  - A difference between generations becomes data or a variant component, never an `if (gen === …)` in `core/`.
  - No visual unification (decision 26).

## 6. Data files

- Pokédex, trainer, move and evolution tables live per generation in `games/genN/data/`, and gen1's in
  `src/renderer/data/`.
- They were ported once from the legacy apps and are now hand-edited. The port scripts cannot be re-run (§12).

**Do not read these whole.** Search them with grep, or read a slice.

The rule: **run `wc -l` on any file under a `data/` folder before reading it.** If it is over about 2,000 lines,
don't read it whole. The list below is a guide, not a complete list.

Tables of 20,000 to 118,000 lines:
- everything in `games/genN/data/pokedex/`, `data/trainers/` and `data/evolution_family_data/`;
- every `*trainers*`, `dexData*` and `cross_generation_moves.js` file;
- gen2's `g2trainers-short.js` (the largest), `crystal_trainers.js`, `crystal-trainers-otto.js` and
  `pokemon_crystal.js`;
- gen3's `data/firered_leafgreen.js`; gen4's `g4PokemonDataPlat.js`;
- everything under `src/renderer/data/pokedex/` and `src/renderer/data/trainers/`.

Files of 5,000 to 14,000 lines:
- the four lifted `Overlay.vue` files;
- the move tables (`moves.js`, `platinum_moves.js`, `generation_3_moves.js`, `g4MoveData.js`, gen5's
  `moves/black.js`, `src/renderer/data/moves/*`);
- gen3's `gen3data.js`;
- `games/gen2/style.css`.

**Dead copies. Editing these has no effect.**
- In `src/renderer/data/pokedex/`, only `YellowDex` and `RedAndBlueDex` are wired in. The eight other-generation
  dexes there are unused; the live ones are in `games/genN/data/`.
- `src/renderer/data/moves/gen2.js`, `gen3.js` and `gen4.js` are unused.
- Also unimported:
  - gen3: `gen1data.js`, `gen1moves.js`, `gen1dataGrowthMovepool.js`;
  - gen4 and gen5: `natureDefinitions.js`;
  - gen2: `battle_summary_properties.js`.

**Near-duplicates.**
- `cross_generation_moves.js` exists in gen2–5. gen2, gen3 and gen5 are identical; gen4 differs.
- gen3 imports both `pokedex/firered_leafgreen.js` and `firered_leafgreen.js`.
- gen4 imports both `moves.js` and `platinum_moves.js`.
- A data fix may belong in more than one file. Check with grep.

**Style defaults.**
- `games/genN/data/style/*.json` are per-species layout defaults. A dev-mode edit in the running app rewrites
  them through `source.write`.
- File naming differs by generation:
  - gen2: `<Species>.json`
  - gen3: `<Game>_<number>.json`
  - gen4 and gen5: `<Game>_<Species>.json`
- `enemy_sprite_scales.json` works the same way.
- The dev server must not hot-update these files: a hot update re-mounts the overlay mid-edit, which is how
  Style Mode once lost its resize handle after the first Enter. The `SELF_WRITTEN` pattern in
  `electron.vite.config.js` drops their updates; a new written-back data file needs adding there too.
- **Don't use `server.watch.ignored` for this.** An unwatched file is never invalidated in Vite's cache, so
  every window reload until the dev server restarts gets the table as it was at startup (edits look "lost"),
  and the next sprite commit writes that stale table back over the file, wiping the session's edits.

**File names with spaces.** gen4 and gen5 have `data/type effectiveness array.js`, which needs quoting in shell commands.

## 7. Persistence

| What | Where | Owner |
|---|---|---|
| Per-generation and global settings (what the legacy apps kept in `localStorage`) | `<userData>/stp-overlay/data/user_state.json`, sections `gen1`…`gen5` and `global` | `core/persistence/userState.ts`; format in `src/shared/userStateFormat.ts` |
| gen1 overlay settings; per-species settings and metrics | `<userData>/stp-overlay/data/overlay_settings.json`, `data/<game>/<species>/` | `src/renderer/stores/*` via `stores/helper/files.ts` |
| gen2–5 user overrides | `user_*` keys in `user_state.json` | `games/genN/storage.ts` |
| Shipped style defaults | `games/genN/data/style/*.json` (§6) | `core/persistence/styleSettings.ts` (gen3 has its own manager) |
| Split CSVs | `<appRoot>/splits/` (folder names kept from the five legacy apps) | `core/persistence/splitFiles.ts` + `games/genN/splits.js` |
| Legacy gen1 presets (read-only) | `<appRoot>/storage/Storage.json` | `logic/Storage.ts` |

`<userData>` is `%APPDATA%` on Windows and `~/Library/Application Support` on a Mac.

**Persisted key names are a contract.** Renaming one silently loses a user's settings, and harness oracle 4
flags it.

## 8. External systems

| System | Address | Code that talks to it |
|---|---|---|
| PokeAByte (memory tool) | `http://localhost:8085`, REST plus SignalR `/updates` | `packages/gameHookMapperClient.ts` |
| GameHook (alternative) | `http://127.0.0.1:61358/instances/0` | same client, auto-detected. Set with `STP_TOOL_URL` or `--tool-url` |
| Recording queuer | calls our control server on `:30159` | `src/main/control-server.ts`, `core/control/`, `games/genN/control.ts` |
| Super Shuckie (emulator) | `http://127.0.0.1:30158` | `core/stores/useEmulatorStatsStore.ts`, `core/logic/shuckieBookmarks.ts` |
| OBS | `ws://localhost:4455` | `core/logic/obs.ts` |
| keyhook.exe (F13–F24 hotkeys) | child process, Windows only | `src/main/keyhook.ts`, then `core/hotkeys/KeyHook.ts` |
| air_cutter (video tool) | launches the app with `--cutter-*` | `src/main/cutter.ts`, `tools/cutter/` |
| The clock page (our own) | `http://127.0.0.1:30160/timer` | `src/main/timer-frame-server.ts`, `core/overlay/ClockFrame.ts` |

`docs/external-contracts.md` specifies exactly what each of these sends and expects:
- control routes and `/status` fields;
- the split CSV format;
- OBS marker names.

Treat those as fixed interfaces. Another program depends on each one.

`keyhook.exe` is not in the repo; it is build output and was removed in `5dce66a`. Main looks for it at:
1. `<appRoot>/keyhook.exe`
2. `<appRoot>/resources/keyhook.exe`
3. the packaged `resources/` folder

Without it, the app runs and logs that hotkeys are disabled.

**Building the Windows package.** `npm run build:win` does not add `keyhook.exe`, so build in three steps:
1. `npm run build:unpack`
2. copy `keyhook.exe` (the one in `A:\Programs\gen2-stp-frontend`) to `dist/win-unpacked/resources/`
3. `npx electron-builder --win --prepackaged dist/win-unpacked` to make the zip

Make the zip **before** launching the packaged app, or run `packaged:probe` only after zipping. On first launch
the app creates the `resources/app/out/renderer/images` junction, and the zip step follows it, storing the
image pool twice (5.9 GB instead of 3 GB). If that junction is already there, remove it with
`[System.IO.Directory]::Delete(path, $false)`, which deletes only the link; `rm -rf` would follow it. The
`!out/renderer/images` entry in `build.files` keeps the dev build's junction, which points into
`src/renderer/public/images`, out of the package. Before that entry was added, the package worked only on the
machine that built it.

## 9. Chapter markers, bookmarks and splits

- **Sending markers.**
  - `core/logic/shuckieBookmarks.ts` `sendChapterMarker` sends an OBS chapter plus a Super Shuckie bookmark.
  - `addSplitBookmark` handles split bookmarks.
  - Name formats are in `src/shared/splitBookmarks.ts`.
- **Marker names.**
  - gen1 keeps them in `games/gen1/markers.ts`.
  - gen2–5 hard-code them inline in `Overlay.vue` (grep `sendChapterMarker`).
  - The specs for the "Item" and "New Move" markers are `docs/CRITICAL_ITEM_CHAPTER_MARKER.md` and
    `docs/NEW_MOVE_CHAPTER_MARKER.md`. They cite legacy `app/frontend.js`, which is now gen2's `Overlay.vue`.
- **Autosplitting.**
  - gen1: `src/renderer/autosplitter/` with its tables in `games/gen1/data/`.
  - gen2–5: `games/genN/splits.js` plus `data/autosplitter*.js`.
- **Comparing against a previous run.** `core/logic/splitComparison.ts` and `core/stores/useReplaySplitsStore.ts`.

## 10. Invariants

These hold across the codebase. Breaking one is a bug even if nothing visibly fails.

- **`core/` never imports from `games/`**, and gen2–5 never import gen1's top-level folders (`components/`,
  `stores/`, `logic/` and so on). No tool enforces this. Grep before you add an import.
- **The renderer does not use Node APIs** (`fs`, `path`, `child_process`, `crypto`). Files go through
  `window.api`. `nodeIntegration` is still on, so nothing stops you except this rule.
- **No `localStorage`.** All persistence is file-based (§7). The storage origin differs between dev and a
  packaged build, which is why it was retired.
- **Profiles are plain data.** `games/profiles.ts` and `mappers/*.ts` import no Vue, so the harness can load them
  under `tsx`. Every mapper write must be declared in the profile, or oracle 5 fails.
- **Unchanged means unchanged.** These are all compared by the harness or read by another program:
  - CSS classes and element ids;
  - persisted key names;
  - `/status` field names;
  - split CSV bytes;
  - marker names;
  - `console` output.
- **Some `GameModule` fields do nothing yet.**
  - Nothing in the shell reads `features`, `components`, `hooks`, `chapterMarkers` or `logCopyVariant`.
  - gen2–5's `hotkeys: () => ({})` is intentionally empty; each overlay binds its own keys.
  - Wiring new behaviour into these fields for gen2–5 does nothing until Phase 6 connects them.
- **The generated-code headers are out of date.** Files headed "generated by lift-genN.py, do not edit" are
  edited by hand now. The lift can't be re-run (§12).

## 11. Legacy quirks: keep the game's, fix the code's

This is decision 25 of the plan. The ledger is `docs/known-legacy-bugs.md`.

- **Game quirks** mirror the real game: its mechanics, its code, or how it presents information. **Keep them
  exactly.** Check the decompilation before touching one (paths in `AGENTS.md`).
  - Example: gen2 boosts Special Defense from badges only when the unboosted Special Attack is 206–432 or 661+.
  - That comes from pokecrystal's `BadgeStatBoosts`, and no other generation has it.
- **Code quirks** exist only because five apps were written at different times. Examples: a typo'd storage key,
  a guard present in one generation but not another, drifted copies of one helper. **Fix them**, in this order:
  1. Move the code verbatim first.
  2. Fix the quirk in its own separate change.
  3. Verify both with the harness.
  4. Record the fix in `docs/known-legacy-bugs.md`.
- **If you can't tell which kind a quirk is,** the decompilation decides: if the game does it, keep it.
- **A missing `.value` is not automatically a bug.** Mapper property objects define `toString()` (the value as
  text), so `prop == 3`, `prop < 206` and `prop / other` coerce to the number and work. `===`, `switch`, `+`
  (string concatenation) and a `null` value do not. Test the expression before logging it as a bug.

## 12. Verifying a change

From cheapest to most expensive:

| Check | Command | Cost | When |
|---|---|---|---|
| Typecheck | `npm run typecheck` | ~15 s | Always. Covers renderer, shared and preload, but **not** `src/main` |
| Drift | `npm run parity:drift` | ~3 s | Any gen2–5 overlay or mixin edit |
| Self-tests | `parity:selftest`, `parity:gamehook`, `parity:adapter`, `parity:bookmarks`, `parity:replay-splits`, `parity:debounce`, `import:selftest` | seconds each, no build | When touching the client, bookmarks, splits or import code |
| Harness, one generation | `npm run build`, then `npm run parity:all -- --only=genN` | ~2 min per fixture | Anything that changes what an overlay shows, writes or sends |

There are no unit tests and no linter; the self-tests and the harness are the tests.

**`src/main` has no typecheck.** `npx tsc --noEmit -p tsconfig.node.json --composite false` runs, but reports
errors that are already there (`mainWindow` possibly null, and others), so it can't be used as pass or fail. The
build does not check types. To check a main-process edit, compare that command's output before and after.

**Harness facts** (full reference: `docs/parity-harness.md`):
- It always runs the built app in `out/`, so run `npm run build` first.
- Harness runs must go one at a time.
- The harness runs the app with `STP_TIMER_FRAME=off` (`run.ts`), so the overlay draws its own clock and the
  oracles compare what they always did; the clock frame (§2 `core/overlay`) never appears in a capture.
- Fixtures live in `tools/fixtures/genN/`. There is one synthetic smoke fixture each for gen1, gen3, gen4 and
  gen5. **gen2 has no committed fixture**; its one real recording is in the gitignored `tools/fixtures/raw/`.
- Baselines (`tools/baselines/`) are local and gitignored, so a machine may have none. `parity:all` then
  prints `NOBASE`.
- **Pixel noise (seen on the Mac).** gen4's faded box-art pictures in the settings panel (`.gameToggleImg`)
  can differ between two runs of the same build: the same ~100 pixels in every capture, pixels oracle only.
  If a diff shows only that, run each side again and compare the pairings before blaming the change.
  A second signature (2026-10-01): the blurred grass background behind gen4's species art rasterises in one
  of two states per run (up to 11 levels, ~1,900-2,800 pixels in every capture, pixels oracle only); two runs of
  one build landed in different states, so repeats of both sides are the only way to tell it from a change.
- The portable way to get a baseline:
  1. Build a `git worktree` of `HEAD` (before your change).
  2. Run it as target `unified@<dir>`.
  3. Run `unified` on your change.
  4. `npx tsx tools/parity/diff.ts <before> <after>`.

  If the worktree's `node_modules` is a junction to the repo's, delete the junction **before** removing the
  worktree: `git worktree remove --force` follows it and empties the real `node_modules`. From PowerShell,
  `[System.IO.Directory]::Delete("<worktree>\node_modules", $false)` removes only the link (a `cmd /c rmdir`
  from PowerShell can fail silently); check it is gone before deleting the folder.

  A `git archive` of `HEAD` built in a scratch folder works too. Leave the images out of the archive, and
  symlink `node_modules` and `src/renderer/public/images` (and, once built, `out/renderer/images`) back to the
  repo's copies.
- Capturing baselines from the legacy apps (`legacy:genN@25/@37`) and `packaged:probe` work **only on the
  Windows machine**. They need `A:\Programs\genN-stp-frontend`.

**Mac setup.** electron-vite 4 needs Node ≥ 22.12 (or 20.19+). With an older Node, `build` and `dev` fail,
but `typecheck` and the `tsx` self-tests still work. If `node_modules` is missing, run `npm ci` under Node 22
(about 10 s). If no Node 22 is installed, `npx -y node@22 -p process.execPath` fetches one into the npx cache
and prints its path; put that folder first on `PATH` for `build` and the harness. The harness runs on the Mac: `targets.ts` finds Electron through `require("electron")`, and a
1920×1080 content window fits the display.

**Old-Chromium comparisons.** The legacy apps ran Electron 25 (Chromium 114). To check a difference that only
shows under the old renderer, such as the synthetic-bold drift in known-legacy-bugs #40, run Electron 25 through
`npx`. On the Mac it is already in the npx cache (`~/.npm/_npx/*/node_modules/electron`).

**Tools you should not re-run.** These are one-time historical scripts, and they read `A:\Programs\...`:
- `tools/port/*` (except `check-undefined.ts`)
- `tools/assets/merge.ts`
- `tools/splits/consolidate.ts`

Re-running them would overwrite months of hand edits.

**Still in use.** `tools/assets/to-webp.ts` converts any new PNG to WebP. `tools/cutter/` is still in use.

## 13. Documents, and which parts are live

| Document | Read it when |
|---|---|
| `docs/external-contracts.md` | Touching control routes, `/status`, split CSVs, markers or persistence |
| `docs/parity-harness.md` | Running or changing the harness. §1 covers the oracles, §7 the scripts, §9 the determinism fixes |
| `docs/known-legacy-bugs.md` | Anything that looks like a bug in gen2–5; recording a quirk fix |
| `docs/mapper-matrix.md`, `docs/genN-inventory.md` | Mapper, profile or detection work. The inventories list every property each generation reads and writes |
| `docs/game-support-gaps.md` | Adding or fixing support for a game or edition |
| `docs/performance-followups.md` | Performance work. It records what four passes did and what is still open |
| `docs/themes-plan.md` | Themes (per-generation looks). A proposed plan, not built yet |
| `docs/CRITICAL_ITEM_CHAPTER_MARKER.md`, `docs/NEW_MOVE_CHAPTER_MARKER.md` | OBS marker logic |
| `docs/inputs.lock.md`, `docs/queuer-unified.patch`, `docs/battle-timing-notes.animations.css` | Rarely. These are port inputs, the queuer-side patch, and timing notes |

**`docs/IMPLEMENTATION_PLAN.md` is mostly history.** The live parts:
- §2 target architecture. Its rules hold, though its file tree is dated.
- §4 CSS rules.
- **§5 Decisions.** Numbered 1–29. Cite them by number.
- §6 risks.
- §7g Phase 6 status.
- "Cross-generation drift" (how the allowlist works).
- "The image pool as lossless WebP".
- **"Phase 6 plan"** (the final section).

Everything else is a dated log: §1, Phases 0–5, §7–§7f, §8 and the dated feature sections. Read that part only
when you need to know *why* something was done.
