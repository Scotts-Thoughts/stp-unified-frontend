## Agent working and commit rules

- AGENTS.md: agents work in this one folder (no worktrees, copies or branches), append notes here when they
  finish, never ask about committing, and on Scott's say-so ask which next version he wants (major, minor or
  patch bump), bump once, use these notes as the commit description and empty this file.
- Added this `commitnotes.md`.
- Docs only; nothing to build or test.

## Player profiles and move stats from the router (all generations)
- New `core/profile/`: player profiles that collect the move stats the router (pkmn_yellow_xp_router) records
  while it records a route. A profile bar at the top of the start screen shows the active profile's picture and
  name, switches, makes, renames and deletes profiles, shows a router dot (green: recording the picked game; amber:
  another game; grey: not recording) and opens a "Move stats" screen: one tab per game pair, your moves and the
  enemy's moves with hit rate vs expected, crits, effects and a luck chip, crit-only and no-luck moves folded
  away, and the runs that fed the tab with "Remove from profile".
- While a game is loaded the overlay asks the router `GET /move-stats` (port 30161) a few seconds after each
  battle ends and every 30 s. The ask goes through the main process (`src/main/routerFetch.ts`,
  `routerClient.ts`), because the router sends no CORS headers on purpose. Each battle is counted once
  (by `battle_id` per run); battles seen while re-filming mode or a test run is on are marked handled but never
  added; a reply for a different game than the edition being played is ignored.
- Each generation got a two-line hook (gen1 `hooks.ts`, gens 2–5 `Overlay.vue` mounted code): `setProfileSkip`
  (test run or re-filming on) and `onBattleEnded()` where it already sees a battle end. Nothing shown, written or
  sent changes in a game; no `/status` fields or split changes.
- Profiles are files in `data/profiles/<id>.json`; the active one is the new global user-state key
  `active_profile`. Nothing is written until a profile is made or the router reports a battle.
- New `npm run parity:profiles`: a fake router server checks de-duplication, the re-filming rule, the game
  mismatch rule, "Remove from profile" and the luck labels.
- Docs: ARCHITECTURE §2 (`src/main` and `core/profile/`), §7 (profile files), §8 (the router), §12 (the new
  self-test); `docs/external-contracts.md` §10 (the router's contract).
- Checked: `npm run typecheck` passes; `npm run parity:profiles` passes; `npm run build` passes (`src/main` edits
  are otherwise unchecked, as usual). Harness before/after on the gen1, gen3, gen4 and gen5 smoke fixtures
  (HEAD build vs this change, in a Linux container): gen3 all oracles green; gen1, gen4 and gen5 differ only in
  pixels (17, 1 and up to 532 pixels: text carets and the blurred texture behind the stat tiles, nothing near
  this change); console, writes, user state and control oracles identical everywhere. gen2 has no fixture.
- Also screenshotted the start screen and the stats screen with a seeded profile and a fake router (dot, Esc to
  close, New profile).
- `npm run parity:drift` fails on `methods.load_all_settings` (gen5), but it fails the same way on the commit
  before this change; not caused by this work.
- Not checked: the profile bar and stats screen against a real router, and the whole thing in a real game. That
  is the in-game test pass with Scott.

## Accuracy above 100% with Compound Eyes (gens 3-5)
- gen4: at the end of a battle ("From Battle") the accuracy column showed Compound Eyes' 1.3x with no cap (90 → 117). gen5 had the same path but showed a blank instead. Every non-battle state in gens 3-5 now goes through the new `moveAccuracyPreview` in `core/logic/moveAccuracy.ts` (own ability and item, capped at 100).
- Wide Lens 1 point low (viewer report): gen4 out of battle used gen5's 4096ths (90 → 98, game 99), and gen5's in-battle chain floored where the game rounds (90 → 98, game 99). gen5 now rounds halves down, taken from Pokémon Showdown since there is no gen5 decompilation.
- gen3 was already capped; it now uses the same preview so the three stay alike.
- Logged as known-legacy-bugs #190; ARCHITECTURE battle-mechanics note points at the preview.
- Verified: `npm run typecheck`, `npm run parity:accuracy` (new cases for the cap and Wide Lens), `npm run parity:drift` (getAccuracy fingerprints re-recorded; the one remaining failure, `load_all_settings` in gen5, was already failing before this change). Not run: the harness/replay in the real app.

## Pokérus alert on the game-area box (gens 2–5)
- The box behind the game screen already changed colour in gen2 and gen5 (red when damaged in the overworld,
  blue with a status condition, green otherwise). That rule is now one helper, `core/logic/healthTracker.ts`,
  with a new top priority: purple-pink while the lead Pokémon has an active Pokérus infection (days left in the
  low nibble of `player.team.0.pokerus`). A cured Pokémon goes back to the normal colours.
- gen3 and gen4 now get the same tinted box (their game area was a plain picture; gen4 had the computed but never
  used it). gen2 keeps its lighter damaged red.
- Every mapper gens 2–5 use already has `pokerus` in the party data, so no mapper change. Declared
  `player.team.0.pokerus` in each generation's reads table. Drift allowlist entry for `hp_tracker_style` re-reviewed.
- Verified: `npm run typecheck`, `npm run parity:drift` (only the existing gen5 `load_all_settings` failure,
  which was already failing before this change), `parity:adapter`, and a Platinum smoke replay with Pokérus
  injected (green → purple-pink → red once cured and damaged). Not run: gen2/gen3/gen5 on screen, and no
  before/after harness diff. The purple-pink is approximate, not read from a game palette.

## Copy Solo Style button (Evolution group, gens 3-5)

- New "Copy Solo Style" button in the settings panel's Evolution group, next to Unify Styles. It shows only while
  Evolution is on and the species picked in "Evolution Family Style" has a stored solo look (its style from when
  Evolution is off). Pressing it copies that look (colour, UI saturation, image position/scale/flip, background
  texture and its sliders, gen3's frame) into the species' evolution-line style and reloads it on screen.
- Shared code in `core/overlay/soloStyleCopyMixin.ts`, added to the gen3, gen4 and gen5 overlays. Gens 1 and 2
  have no evolution lines, so nothing to add there. New shortcut action id `evolution.copy_solo_style`.
- The copy goes through each generation's own `loadEvolutionStyle`, so defaults the solo entry doesn't store are
  filled the same way the solo overlay fills them. No style data files were changed.
- ARCHITECTURE §7: note on the solo vs evolution-line style keys and the button.
- Verified: `npm run typecheck` passes; a small script against a fake overlay confirmed the copy, the merge
  (other line fields kept) and that the button hides with no solo look or with Evolution off.
  `npm run parity:drift` fails on `load_all_settings` (gen5), but it fails the same way on the untouched main
  branch, so it is not from this change. Not run in the real app or the harness.

## Weather turn box in gens 2-5

- A YouTube viewer asked for a Rain Dance turn counter. Gens 2 and 3 only showed weather inside the shared field box,
  and only when it ran out before Reflect, Light Screen or Safeguard; gens 4 and 5 read the turn count but never drew
  it. Every game in gens 2-5 now has its own weather box: the weather's name over its turns left ("rain" / "5").
- `core/overlay/player/weatherBox.ts` decides when it shows: Rain, Sun, Sandstorm or Hail with 1-8 turns left, and not
  for permanent weather (Drizzle, Drought, Sand Stream, Snow Warning, overworld weather), whose counter never ticks.
  Gens 3 and 4 (Platinum, HG/SS) check the mapper's permanent-weather bits; D/P and gen5 have none.
- Boxes: right under the faults box in every generation (Scott's choice), between accuracy and evasion. To make room,
  gen2's evasion box moved to the right (where the field box was) and the field box one row down; gen5's accuracy
  and evasion boxes moved one row down. gen2's weather box is inside the Battle Pop Ups toggle like the others. New
  frame pictures `weather.svg` in each generation's ui folder, copied from that generation's existing frames and
  moved; gen2's `evasion.svg`/`screens.svg` and gen5's `accuracy.svg`/`evasion.svg` were moved the same way.
- Weather is out of the field box in every generation (`field_effect_array`), and the shared
  `field_effect_first_expiring` no longer assumes four entries. The gen2/gen3 watcher that made the weather the
  field box's "last started" effect is gone. Drift allowlist fingerprints for `field_effect_array` updated.
- No mapper changes. Black 2 and White 2 only have a working counter with the `ST/gen5` mappers
  (`tools/mappers/make-gen5-st.py`); the upstream `STANDARD` ones read the wrong address.
- Checked: `npm run typecheck`; `npm run parity:drift` (the one remaining failure, gen5 `load_all_settings`, was
  already there and isn't from this change); the harness with rain injected mid-battle into the gen3 FireRed, gen4
  Platinum and gen5 Black smoke fixtures and a new synthetic gen2 Crystal fixture (rain 5, then sandstorm 2): each box
  showed the right name and turns, and gen5's 255 at battle start showed nothing. gen2's moved accuracy, evasion
  and field boxes checked on screen beside it.
- Not checked: a real battle with a weather move in any game; permanent weather hiding the box; D/P, HG/SS, Emerald,
  Gold/Silver, White, Black 2 and White 2 (same code paths as the games checked); Damp Rock's 8 turns; gen5's moved accuracy/evasion boxes on screen (they never show today, see below).
- Found, not fixed: gen5's accuracy and evasion boxes compare `meta.state` (the property) with "Battle" instead of
  `meta.state.value`, so they look like they can never show (`games/gen5/playerPanel.ts` `battlePopups`).

## East Sea Shellos and Gastrodon on the gen4 enemy panel

- Platinum (and D/P, HG/SS) always drew the pink West Sea art for an enemy Shellos/Gastrodon. The enemy panel now reads
  the form byte from the opponent's party in memory (`flags.alternate_forms`) and draws `Shellos-East` /
  `Gastrodon-East` for form 1: trainer battles, the second trainer of a two-trainer battle, and the wild panel
  (`enemyFormArt` in `games/gen4/enemyPanel.ts`). Styles stay keyed by the species name, so style data is untouched.
- The wild panel in gen5 now uses `enemy_form` too (it already did for trainers), through a new optional
  `PreviewPokemon.artSuffix` in `core/logic/trainerPreview.ts`. Gens 1-3 have no forms with their own art here.
- Mappers (PokeAByte `ST/gen4`, separate repo): added `alternate_forms` to the party flags of the D/P and HG/SS mappers,
  the property Platinum already has. No extra version bump: those files were already at 1.7.0 (uncommitted) from the
  move-stats work.
- Verified: `npm run typecheck` passes; a small script checked `enemyFormArt` (form 1 gives "-East", form 0, other
  species and a mismatched species give "") and the wild preview's suffix. `parity:drift` fails on
  `load_all_settings` in gen5, which this change doesn't touch (fails the same at HEAD). Not checked: the harness
  (no Platinum fixture with Shellos) or a real battle against an East Sea Shellos.

## Right Panel Layout with a DS Secondary Screen (gens 4-5)

- Gens 4 and 5: the Webcam Mode switch became a "Right Panel Layout" dropdown: Historical, Webcam or Secondary
  Screen (`core/logic/secondScreen.ts`, `core/settings/rightPanelLayout.ts`). Gens 1-3 keep the Webcam Mode switch.
- Secondary Screen shortens the right panel like Webcam Mode and draws a green area for the DS's second screen
  under it (419×314, the game area's look, `images/genN/ui/second_screen_game_area.svg`; gen4 got a copy of gen5's).
- Movepool in Secondary Screen: tutor moves only while the whole list is 45 or fewer; over 75 level-up + TM/HM
  moves (Mew, Mewtwo, Arceus, Gallade) it shows the level-up list when the lead is at a learning level or one below,
  else the TM/HM list, and the title says which.
- Removed gen5's old Second Screen Mode (splits over a game area) at Scott's request, with its CSS
  (`second_screen_splits_table`, `splitIcon_2`) and `second_screen_splits.svg`. Its `second_screen_mode` key now
  means Secondary Screen. The screen-swap key feature (`second_screen_toggle`) is untouched.
- Saved keys unchanged (`webcam_mode`, plus `second_screen_mode` now saved in gen4 too); the old shortcut action ids
  `display.webcam_mode` and gen5 `advanced.second_screen_mode` still work (0 missing, 10 added).
- Verified: typecheck, `parity:drift` (movepoolView/splitsView re-reviewed; `methods.load_all_settings` in gen5
  already failed before this change), `parity:action-ids`, `parity:presets`; harness before/after on the gen4 and
  gen5 smoke fixtures: overlay pixels unchanged outside the settings panel (which is taller by the dropdown) apart
  from clock/fade timing noise; gen4 showed one transient `playerResets` key in the baseline at one checkpoint only
  (same at the next), not traced. Screenshots of Secondary Screen with Mew at learning and non-learning levels,
  Ponyta, Infernape, Oshawott and Splits in both generations.
- Not verified: on Scott's machines, voice phrases (`parity:voice`), and with real DS screen capture in OBS.
- The game-screenshot thread's change reads `second_screen_mode` for the DS bottom box in gens 4 and 5.

## Game screenshot

- New camera button (settings panel, left of the microphone) and a bindable "Save Game Screenshot" shortcut
  (`screenshot.game`, group Run) in all five generations. It takes the game picture from Super Shuckie's
  `GET /screenshot`, takes the overlay window's own picture, draws each game screen into the gameplay box with
  sharp pixels (as OBS layers it), saves `screenshots/<date> <time> <game>.png` next to `reports/` and copies it
  to the clipboard. Boxes: gens 1-2 the Game Boy box, gen3 the GBA box, gens 4-5 the DS top screen; gen5 also
  draw the touch screen into its box (`SCREEN_BOXES.dsSecondScreen`) when `second_screen_mode` is on. gen4 gets
  that field from the Right Panel Layout change (another thread); until then gen4 draws only the top screen.
- Needs the matching Super Shuckie change (its `/screenshot` used to need Settings > Allow bot control too).
  With an older Super Shuckie the button's tooltip says to update it or turn bot control on.
- New files: `src/main/screenshot.ts`, `src/renderer/core/screenshot/`. `screenshots/` is gitignored.
  ARCHITECTURE §2 and docs/external-contracts.md §3 describe it.
- Verified: `npm run typecheck`; `npm run build`; main's tsc output has no new errors (15 before and after);
  `parity:shortcuts` passes; drove the built app (Linux, xvfb) on the gen1, gen3, gen4 and gen5 smoke fixtures
  against a stand-in Super Shuckie serving a test card, and checked the saved PNG's pixels land exactly in each
  box (gen5 with Second Screen Mode on too), the clipboard holds the PNG, and with no Super Shuckie the tooltip
  says it didn't answer.
- Not verified: gen2 (no fixture; it uses the same box as gen1), a real Super Shuckie, Windows, and the parity
  harness against a baseline. The new button changes the settings panel's top row, so the layout and pixels
  oracles will show it in every generation. `parity:drift` fails on gen5 `load_all_settings`, which this change
  doesn't touch (no Overlay.vue edits).

## EV gauge under the stat tiles (all five generations)

- New: in the regular stats view (Automatic) every stat tile shows a thin EV gauge along its bottom: ten pills
  (one per vitamin: 10 EVs, or 2,560 stat experience in gens 1-2) then a bar to 255 EVs / 65,535 stat exp, in a
  1 px see-through case. Blue (the Exp bar's gradient); green once a stat is maxed (252 EVs; 63,002 stat exp in
  gens 1-2, the first value that gives the last stat point per pokered `CalcStat` / pokecrystal `GetSquareRoot`);
  gens 3-5 only: yellow from 400 total EVs, red from 490, every gauge grey at 510 (a maxed stat stays green until
  510). The stat number is 90% size and centred in its tile while the gauge shows. Spec:
  https://claude.ai/artifact/EqXvguxJi7XBrK1aHyz1Bn
- Code: `core/logic/evGauge.ts` (fills, colours, limits), `core/overlay/player/evGauge.ts` (the node tree),
  `core/styles/player.css` (looks); each generation's `statTiles` (gen1 `components/left_panel/stats.vue`) adds it,
  with the tiles' measured positions in `evGaugeLayout` (`games/genN/playerPanel.ts`); `stat_value_large` in each
  `style.css`. Other stats modes are untouched.
- New setting "Show EV Gauge" (Toggles, on by default) in all five: saved key `show_ev_gauge` (gen2
  `this.show_ev_gauge`, as all its keys; gen1 `visualization.left_panel.stats.show_ev_gauge`). Off gives today's tiles.
- Vitamin limits checked against pokered/pokecrystal item_effects.asm (refused at 25,600, +2,560) and pokeemerald
  (EV_ITEM_RAISE_LIMIT 100, 510 total); gens 4-5 assumed the same (pokeplatinum's EV constants match).
- Verified: `npm run typecheck` passes; new `npm run parity:ev-gauge` (26 checks) passes; `parity:presets` and
  `parity:shortcuts` pass; harness captures with staged EV values for Yellow, Crystal (a synthetic fixture built in
  scratch from the PokeAByte Crystal mapper, not committed), FireRed, Platinum and Black show each gauge inside its
  tile, 3 px from the bottom, whole-pixel pills, the digits centred, and the blue, green, yellow and red states. Grey only by self-test.
- `npm run parity:drift` fails on `load_all_settings` (gen5) on HEAD too, before this change; not touched here.
- Not verified: other games inside each generation (Red/Blue, Gold/Silver, Ruby/Sapphire/Emerald, D/P, HG/SS,
  B2/W2) by eye; battle stage markers checked next to the gauge in Platinum only (staged +6/-6, clear of it); no
  before/after harness diff against baselines (none on this machine).

## Fix missed mid-run evolutions (gens 4-5)
- Scott's Yanma evolved into Yanmega by Rare Candy in HeartGold and the overlay didn't follow. The gen4/gen5 check
  only ran inside the lead's species event, and gave up if that event's old value read blank (0x0000) or, with
  that, fell through to the normal path that only moves the starter in Overworld/Battle. It now reads the party as
  it is now and also runs from the personality-value handler and on every game-state change. "The same Pokemon" is
  the personality value recorded while the lead was the Solo Pokemon, which also stops a different Pokemon of the
  same family (new save) from counting as an evolution.
- Second bug, reproduced: the Evolution flags are stored per Solo Pokemon and nothing wrote them for the evolved
  species, so the queuer's /refresh or a restart after any evolution switched Evolution off. The evolution now
  writes them for the evolved species (gen4 `evoState_` key, gen5 the species key).
- The two generations shared the same copied code; it now lives once in `core/overlay/leadEvolutionMixin.ts`.
  Gen3 checked and left alone (its own handler, no blank-old-value check, starter stays the base species).
  Yanmega's `knows_move` condition is the game's business; the overlay only watches the species, so move-known,
  item, friendship and trade evolutions all go through the same path.
- Verified: typecheck; drift (watch.starter re-reviewed; `load_all_settings` gen5 already fails on main, not from
  this change); synthetic HeartGold replays through the real app: plain Rare Candy evolution, one with a blank
  species read and a non-Overworld state in between, one where a different Pokemon arrives, each followed by a
  /refresh (Evolution now stays on, it went off before); gen4 and gen5 smoke fixtures run with no page errors.
- Not verified: the real game (I couldn't reproduce Scott's exact miss from a recording, so the cause above is the
  likeliest one, not a proven one); a gen5 evolution replay.

## EV gauge follow-up: hidden while base stats show, one number size

- The gauge now shows only while the Automatic view shows the Pokémon's own stats (stats header "Level N"); while
  it shows Base Stats (no Pokémon yet, Base Stats state, an invalid battle state) or IVs (gens 4-5 2023 style before
  TM27) there is no gauge.
- The big stat numbers are one size everywhere: Automatic, Base Stats and the full-size averages/medians (gen1,
  gen3) all use the new `stat_value_large` (50 px, gen3 45 px, centred), so switching to Base Stats no longer makes
  the numbers grow. `ev_gauge_value` (added earlier today) is replaced by it.

## DS second screen area on whole pixels (gens 4-5)

- The Secondary Screen green area was 419×314.25 from y 747.75, so it drew about 314 green rows: a pixel short
  of 4:3 (Scott). It is now 420×315 at (1486,747), the DS's 256×192 at exactly 1.640625x, with a 1px black edge
  outside it (1px further left than before). Both `second_screen_game_area.svg` files and the game screenshot's
  `SCREEN_BOXES.dsSecondScreen` changed together.
- Verified: typecheck; built and screenshotted gens 4 and 5 in Secondary Screen and counted the green pixels:
  420×315 from (1486,747) in both. Not checked in OBS with a real capture.

## Game screenshot: file name and a visible result

- Screenshots are named `YYYYMMDD-HHMMSS-<species>-<Finished Runs>-<run clock H MM SS>.png`, Scott's format
  (`20261124-213659-Yanmega-1-21334.png`): when it was taken, the solo Pokémon as it is now, the Finished Runs
  counter, and the run clock with no padding on the hours. Before any finish the counter is 0 and the clock is
  the run's current time; a missing species is `Unknown`. Two in the same second get " (2)".
- After each click a note above the camera button says where the file went, or why nothing was saved (yellow
  used to mean only "failed", with the reason in the tooltip).
- Verified: typecheck, build, and the built app on the gen1 and gen5 smoke fixtures against a stand-in Super
  Shuckie (file name and note checked). Gens 2-4 not run in the app.

## Open Screenshots Folder button

- "Open Screenshots Folder" next to "Open Splits Folder" in every generation's settings panel. It opens
  `<appRoot>/screenshots`, creating it first (`screenshot:reveal` in src/main/screenshot.ts). It is also a
  bindable shortcut (`screenshots.open_folder`).
- Verified: typecheck, build, and the built app on gens 1 and 4 (button shows, click creates the folder).
  Not seen opening Explorer on Windows.

## AGENTS.md: reproduce reported run problems from the replay
- Added a routing row and a short rule: when Scott reports something the overlay got wrong in a run, find the
  run's Super Shuckie replay, log memory headlessly with `tools/markers/memlog.cjs`, and find the cause before
  asking him for anything. Full recipe in `project_context/docs/workflows/debugging-from-replays.md`.
- Docs only; no checks needed.

## Mid-run evolution: the art stayed on the old species (Yanmega, HeartGold)
- Tested from both of Scott's Yanmega replays (h-yanmega-line-2-dnf, evolution 14:51; h-yanmega-line-2-21334,
  20:01) by logging their memory headlessly. The game data is clean in both: one species event, same personality
  value. Over that data the evolution check follows the evolution, before and after yesterday's fix, in a new
  harness (`tools/markers/lead-evolution-wiring.ts`) and in the real app (a fixture built from the log,
  `tools/markers/mem-to-scenario.ts`, run through `tools/parity/run.ts`).
- Cause found in the real app: after "Evolving to: Yanmega" the starter watcher draws the family member stored
  under the new starter's key. With `selected_evolution_species: "Yanma"` stored under Yanmega (a choice saved
  while Yanmega was the Solo Pokemon in an earlier session), the starter became Yanmega and the art stayed Yanma.
  It fits the 21334 evidence: the evolved species' Evolution flags were written (only the evolution writes both
  at once), and ten seconds later the Yanmega family-style choice and the family's ability were saved, as when the
  family style dropdown is changed by hand. The evolution now stores the evolved species as that choice first.
- Also: the run's Pokemon is now a short list of personality values (`evolution_lead_pvs`), and every check
  refreshes it. gen4 debounces the species and not the personality value, so a reset's garbage value could
  replace the real one while the species still read the Solo Pokemon (seen in the dnf log at 9223 s), and a later
  evolution would have been missed.
- Verified: real app on the dnf evolution fixture: the art shows Yanmega with and without a stale stored choice
  (it showed Yanma with one before); harness on both logs, mounted mid-run (during a blank read, right after the
  evolution), with a stale stored choice, and a different Yanmega after a blank (not followed); typecheck.
  `parity:drift` fails only on the known gen5 `load_all_settings` entry.
- Not verified: what was stored on Scott's machine at 14:51 (storage keeps only the latest value, now Yanmega),
  so the stale choice is the cause that reproduces the symptom, not one read from that moment; gen5 (same mixin
  and the same starter-watcher code) not run in the app.

## Enemy team in Webcam / Secondary Screen: even gaps, corners kept, smaller gen5 type icons

- A team of five or six no longer gets squeezed as one block. Each row is fitted on its own (`webcamRowLayout` in
  `core/logic/webcamMode.ts`, `drawFitted` in `core/overlay/EnemyTeamPanel.ts`): the rows get shorter, and the gap
  between rows equals the gap between the last row and the DS second screen (or the Webcam line), the art's own
  smallest row gap. Before, the rows sat ~3px apart and the last one ~8px above the second screen.
- The frame art is drawn in slices per row, so the corners keep their shape and only the straight sides shrink
  (Scott: gen5's 45° corners were getting flattened, the same problem the header had).
- gen5's type icons are 25% smaller in a squeezed team (Scott: they looked about a third too big). Other generations'
  icons unchanged.
- Two to four Pokémon: no change (they already fit). Every generation passes its row geometry (`ENEMY_ROW_ART`), so
  gens 1-3's Webcam Mode gets the same even gaps.
- Verified: typecheck; `parity:drift` (only the gen5 `load_all_settings` failure that was already there); screenshots
  of the built app with Black (4, 5 and 6 Pokémon, Secondary Screen, and 5 in Webcam), Platinum (5 and 6, Secondary
  Screen) and FireRed (5 and 6, Webcam) trainer previews. Not seen on screen: gens 1-2 (same code path), a live battle,
  OBS on Scott's machine.

## Gen 6 (3DS) overlay plan

- Added `docs/gen6-3ds-overlay-plan.md`: the plan for a gen 6 / 3DS overlay (X/Y, then OR/AS) on the Gen 4/5 Secondary Screen layout. Proposed only; nothing built.
- Added `docs/gen6/mockup-a.png` (the layout Scott picked) and `docs/gen6/build_mockup_a.py`, the script that drew it. The script is a reference: it expects the staged assets next to it, so it won't run from the repo as-is.
- ARCHITECTURE §13: new row for the plan.
- No code changed; no checks run (docs only).

## Gen 5 runs on the standard mappers (Burgh's team not fading in Black)

- Cause: Black was running on the stock STANDARD/gen5 mapper (the ST/gen5 copies had vanished after a Poke-A-Byte
  mapper update). Its ally team count reads junk that depends on the location; at Burgh it threw off the battle-ready
  address, so the state stayed "To Battle" all battle and fainted Pokémon never greyed out. No overlay code change.
- Scott's rule: Gen 5+ uses the standard mappers, Gen 3-4 the ST ones; never push to or PR the mappers repo.
- tools/mappers/make-gen5-st.py now patches STANDARD/gen5 in place (keeps names and ids, skips patched files);
  check-black-2-offset.py reads STANDARD/gen5. Docs and the gen5 profile comments updated (docs/mapper-matrix.md).
- On Scott's PC: STANDARD/gen5 patched (originals in the project's mapper-backup folder), ST/gen5 deleted. Not pushed.
- Verified: the script on the stock files gives exactly the installed files, a second run skips all four, and the
  Black 2 offset check passes. Not verified: a real battle on the patched mapper; typecheck not run (comment-only .ts edits).

## Generated style defaults for every unstyled species; evolution mode falls back to the solo look
- New `core/overlay/evolutionStyleFallback.ts`, used by gens 3-5 `Overlay.vue` (`loadEvolutionStyle`, the style watcher,
  `set_pokemon_prop`, Copy to Family, the evolution fade): a `-line-` entry with no look reads the species' solo look;
  the first evolution-mode style edit copies the solo look into the line entry first. gen1 and gen2 have no evolution lines.
- Generated looks for every species Scott hadn't styled: 4,892 entries (gen5 2,543, gen4 1,429, gen3 692, gen2 228,
  gen1 152 Storage.json presets). Files that already had a look were skipped; non-style files were merged into, not
  replaced. Rules are in ARCHITECTURE §6 "Generated defaults". Generator scripts are not in the repo.
- Steel texture look (gens 3-5) is now Scott's Bronzong-line look (38/169/100, blur 0.8); generated Steel-type
  entries also get backgroundScale 151.
- drift-allowlist: re-fingerprinted loadEvolutionStyle, set_pokemon_prop, copyCurrentStylesToAllFamilyMembers and
  performEvolutionTransition (the same edit in gens 3-5). load_all_settings (gen5) still fails drift from another change.
- Verified: typecheck, build, parity:drift (apart from load_all_settings), on Scott's working tree. Sample renders of
  ~40 species in Platinum and Black reviewed by Scott over five rounds. Not verified: the evolution fallback on screen,
  gens 1-3 renders after the last round, and most of the ~4,900 entries were not looked at one by one.

## /pokemon-style skill: learn from Scott's styling and regenerate untouched looks
- New `tools/pokemon-style/` (Python: `style.py` diff / preview / show / generate / accept, `rules.py`, `art.py`,
  `data/`, `LESSONS.md`, `README.md`, `dump-dex.ts`) and `.claude/skills/pokemon-style/SKILL.md`. It is the
  one-off generator from the "Generated style defaults" task, moved into the repo with a record of what it wrote
  (`data/known.json`) so it can tell Scott's edits from its own and never overwrite his.
- Fixed in the move: Steel's texture look (blur 0.8) wasn't read, so Steel-type colours were picked against the
  unfiltered texture. Regenerated those 41 looks (Aggron, Lairon, Metagross, Registeel, Klink, Klinklang).
- Trial run on the HGSS Mamoswine-line edits: logged in `LESSONS.md`, no rule change (one family only).
- Verified: the tool reproduces every previously generated look except those 41 colours; diff, preview, accept and
  generate ran on this copy. Not verified: reading an installed build's `user_state.json` overrides and gen1
  per-species settings (written to the documented paths, no real files to test against). No TypeScript changed.
- ARCHITECTURE.md §6: note on the tool after "Generated defaults".

## Gen 6 and gen 7 (3DS) overlay, first build pass: X/Y, OR/AS, Sun/Moon, Ultra Sun/Ultra Moon
- New `games/gen6/` (and `games/gen7/manifest.ts`): one new overlay for the four 3DS game pairs, laid out as
  mockup A (top screen 1200x720, 4:3 bottom-screen slot bottom right) and wearing gen 5's art. It is a small new
  component built from the `core/overlay/` pieces, not a lifted legacy file. Player panel (art, types, stats with EV
  gauge, nature, friendship, exp bar, ability, held item, moves with in-battle power and accuracy, stat-stage
  pop-ups), movepool, enemy team panel, splits panel, badges, timer, faults, settings panel, shortcuts, control
  routes, split CSVs, OBS markers and Super Shuckie bookmarks.
- The overlay writes nothing to the game (unpatched ROMs); nature, ability, IVs and Hidden Power are read.
- Game data for the four pairs generated from the pokemon-data repo (`tools/gen6/build-data.mjs`); 225 species
  pictures, box art and icons imported (`tools/gen6/import-*.py`). Kalos badges are stand-in coloured pips
  (`make-kalos-badges.py`): the art library has no Kalos badge art.
- **Mappers (in `%APPDATA%\PokeAByte\Mappers`, not this repo, left uncommitted there):** the four STANDARD 3DS
  mappers go from 0.0.2 to 0.1.0 through `tools/mappers/make-3ds-mappers.py`: gen 6/7 move, ability, item and type
  names (they carried gen 4's lists), gen 6 battle teams, trainer names for all four, a US/UM level fix.
  A PokeAByte mapper update can undo this; run the script again.
- Shared code: `GameModule` gains ids gen6/gen7 and an optional `prepare(game)`; the movepool, splits and enemy
  panels take optional line limits (`webcamMode.ts`); `screenshot.ts` knows the 3DS screen boxes; four new profile
  buckets. Defaults are unchanged for gens 1-5.
- Tools: `memlog.cjs` takes `--worker`, `--pab` and `--snapshot`; `mem-to-scenario.ts` takes `--initial`.
- Docs: new `docs/gen6-inventory.md`; ARCHITECTURE §1, §4 ("The 3DS overlay"), §13; `docs/mapper-matrix.md`;
  `docs/external-contracts.md` §11; status line of `docs/gen6-3ds-overlay-plan.md`.
- Checked: `npm run typecheck` and `npm run build` pass. Six of Scott's 3DS replays were logged headlessly through
  a 3DS-capable Super Shuckie worker and the patched mappers, then replayed into the built app with the harness:
  X/Y trainer battles, X/Y first badge (split row written, badge shown), X/Y blackout, OR/AS trainer battle with a
  level-up, Sun trainer battle, Sun blackout, Ultra Moon overworld. No console errors; markers, the blackout
  counter and the pictures were read by eye. The gen 4 and gen 5 smoke fixtures still run on this build.
- `npm run parity:drift` fails on `methods.load_all_settings` (gen5 changed since its last review). This work did
  not touch gen5's `Overlay.vue`; the failure is from an earlier commit.
- **Not checked:** the real app with a live emulator and PokeAByte; resets and new-game starts (the replays with a
  reset in them could not be logged); the queuer; the 3DS screenshot crop; double and horde battles; Webcam and
  Secondary Screen modes; no before/after capture of gens 1-5 was made for the shared-code edits.
- **Not built:** Mega Evolution and form changes, ability and item effects on stats, experience during battle,
  the Trainers preview, trainer split icons, generated species styles, a gen 7 badge box.

## Gen 6 and gen 7 (3DS) overlay, refinement pass
- Badge box: every badge's place now shows as a faint grey shape until it is won, as gen 5's progress picture
  does (`.tds-badge-slot`). X/Y still uses the stand-in coloured pips; OR/AS uses gen 3's Hoenn badges.
- Species looks: `tools/pokemon-style/` now covers gens 6 and 7 (`T["gen6"]` in `rules.py`, the 3DS games in
  `dex.json` with each species' picture). 231 new pictures got facing/floating labels by eye. 3,418 looks written to
  `games/gen6/data/style/`; a new `xlim` rule keeps the art between the canvas's left edge and the top screen's
  border. `known.json` grows by these entries (written with LF now; the tool wrote CRLF on Windows).
- A dry run for gens 2-5 would replace ~3,180 generated looks with slightly different colours: something the colours
  depend on changed after the 11-25 run. Not regenerated; noted in `LESSONS.md` for the next `/pokemon-style`.
- Map Change markers wait until a new map id has held for a second: Ultra Sun/Moon passes through 0 and 2 while a
  map loads, which gave extra markers.
- A battle already on when the overlay starts is followed (its win or blackout counts), and a trainer's name
  emptying just before the battle ends no longer starts a second "IN - Trainer N".
- A horde battle shows each move's own power, not against one of the five opponents.
- Checked: typecheck and build pass. Ten 3DS scenarios replayed in the harness with no console errors and the
  markers read: X/Y trainer battles, first badge, blackout, double, horde; OR/AS trainer battle; Sun trainer battle
  and blackout; Ultra Moon overworld; and a hand-made new-game-then-reset scenario (timer starts, attempt 1, one
  RESET). Gen 4 and gen 5 smoke fixtures still run as before (their one console error each is the old mapper
  warning).
- Not checked: whether the real game empties the trainer name on a soft reset (the replays with a reset in them
  still hang the 3DS replay worker); a trainer double battle's move power is still worked out against one opponent
  (the mappers have no battle format); markers for a battle already on when the overlay starts.

## Gen 6 and gen 7 (3DS) overlay: its own rounded frames
- The 3DS overlay no longer wears gen 5's frame pictures. New `tools/gen6/make-rounded-ui.py` writes gen 6 copies of
  the 27 gen 5 frames it draws (`images/gen6/ui/`, `images/gen6/enemy-area/stats/current_/`): same places, colours
  and layers, but every cut-off corner is a quarter circle (1.7x the cut, so a 20px cut becomes a ~34px corner and
  the stacked outlines stay concentric) and every pointed end (ability/held item, stat tiles, enemy move tags) is a
  half circle. The faint bottom-left lip on the timer, gametime and moveset boxes follows the round corner.
- `games/gen6/Overlay.vue`, `playerPanel.ts` and `enemyPanel.ts` point at the gen 6 copies; `games/gen6/style.css`
  gives the CSS exp bar pill ends. Gen 5's files and CSS are untouched. The game screens' black edges stay square
  (the footage is square).
- ARCHITECTURE §4 ("The 3DS overlay"): where the frames come from and to regenerate rather than hand-edit.
- Checked: `npm run typecheck` and `npm run build` pass; the X/Y double battle and X/Y first badge replays run in
  the harness with no console errors, and the captures were read by eye (player panel, enemy team, splits, timer,
  badges, ability, moveset). `npm run parity:drift` still fails only on the earlier `methods.load_all_settings`
  entry (gen5, not touched here).
- Not checked: the movepool, the gametime box at the end of a run, the accuracy/evasion pop-ups and the two-count
  faults box on screen (their pictures were checked in a browser, not in the app); the live app.

## Gen 6 and gen 7 (3DS) overlay: movepool height and EV gauge width
- The movepool's frame ran 2px past the top screen's bottom edge. `layout.ts` `RIGHT_PANEL_LINES.frameBottom` now
  allows for the frame's real 8 gen-5-px bottom border (movepool.svg and splits.svg: 1055 inside, 1063 outside)
  instead of 5, so its outer edge ends on the same pixel row as the game border (740), as measured in a capture.
- The EV gauges sit 24px inside each stat tile (gen 5 uses 16) so they clear gen 6's round tile corners
  (`playerPanel.ts` `evGaugeLayout.side`). The bar part of each gauge is 16px shorter; the ten pills are unchanged.
- Checked: typecheck and build pass; the X/Y first badge replay runs with no console errors, and the movepool
  bottom, the EV gauges and the enemy team panel were read by eye.
- Not checked: a splits list long enough to reach the bottom line (it uses the same line, so should end level too).

## Gen 6: real Kalos badges, and a badge box sized to each game's badges
- The eight Kalos badges are Bulbapedia's renders, saved in the art library as
  `libraries/badges/gen6/Gen6 Badge<N>-<Name>badge.png` and copied into `images/gen6/badges/kalos/0-7.webp` by the new
  `tools/gen6/import-badges.py`. They replace the coloured stand-in pips. Bulbapedia's bot check blocks scripted
  downloads, so the files came from its image archive through the Internet Archive (2023 copies).
- The badge box now changes size with the badges (`games.ts` `badgeLayout`). X/Y: two rows of four like the game's
  badge case, in a box 40 gen-5-px taller, so the badges are bigger with less empty space. OR/AS: gen 3's single row,
  in a box 48 px shorter. The Hoenn badges are now cut from gen 3's own badge pictures (`images/gen6/badges/hoenn/`),
  so all eight are the same size as in gen 3; the old `gen3/badges/*Badge.webp` files made the last three look bigger.
  The row is drawn at gen 3's size, spread across the box (less an inset for its round ends) and centred on the box's
  visible middle line, measured in a capture. Gen 7 and gen 5 are unchanged.
- The Kalos badges get a dark brown outline like gen 3's badges (gen 3's own outline colour, about 1.5 canvas px),
  added by `import-badges.py`, so they stand out against the box the same way.
- New `tools/gen6/make-badge-boxes.py` writes `ui/timer-case.svg`, `timer-row.svg` and the `timer_2-` pair from the
  rounded `timer.svg`: the badge box's bottom edge and the faults box move; the overlay moves the fault counts by the
  same amount (`playerPanel.ts` `BADGE_BOX_DY`). Rerun it after `make-rounded-ui.py`.
- Checked: typecheck passes; an X/Y fixture with all eight badges added one by one and the OR/AS fixture run in the
  harness, captures read by eye (badges, box, faults box and its count). Missing-file errors and one broken badge
  image in some runs came from another agent rebuilding `out/` during my runs (index.html rebuilt mid-run); the
  images load in the other captures. `npm run parity:drift` fails only on the existing gen5 `load_all_settings` entry.
- Not checked: the live app; the "Both" faults mode (two fault boxes) on screen; the badge fade-in by eye; gen 7.

## Gen 6 and gen 7 (3DS) overlay: leader portraits in Splits, Splits as tall as the movepool
- Every split now has a face icon, as in gens 3-5: X/Y (14), OR/AS (15), Sun/Moon and Ultra Sun/Ultra Moon (12
  between them). Scott's art library had no gen 6/7 trainer art and Bulbapedia blocks scripted downloads, so the
  official full-body artwork came from the Pokemon Wiki on Fandom (OR/AS art for the Hoenn trainers); originals saved
  in `libraries/trainer art/gen6` and `gen7`.
- New `tools/gen6/make-split-icons.py` crops each face, framed by hand on the eyes and face width (its `FACES`
  table, with an optional tilt that levels the eyes and an optional eye height), flips the twelve who look left (Viola, Ramos, Wulfric, Korrina,
  Grant, Wikstrom, Malva, Wattson, Winona, Maxie, Wallace, Steven) so every face looks towards its name, levels
  Korrina's, Ramos's and Clemont's tilted heads, and after Scott's review recentres Grant, Olympia, Wulfric, Malva,
  Drasna, Siebold and Diantha, flips Ramos, and scales 18 crops so every face shows at about the same size (eyes
  ~46/132 of the icon apart), then Scott's pixel nudges (Ramos, Clemont, Olympia, Malva, Drasna, Siebold) and a
  zoom-out for Lysandre and Wikstrom so their chins aren't cut off; and writes 88px icons into `images/gen6/split_images/` and `images/gen7/split_images/`
  (lossless WebP). A few of the wiki's pictures are small, so Malva, Siebold, Molayne, Olympia, Wikstrom and Wulfric
  are a little soft; Siebold's own art has his hand over his face. `games/gen6/Overlay.vue` gives the splits table
  gen 5's icon column (`splitIcon()`).
- The Splits frame now always reaches the movepool's bottom line (level with the game border) instead of shrinking
  to the rows, and its rows stretch to equal heights so the table fills it: it uses `movepool.svg` and a new optional
  `SplitsView.fill` (`core/overlay/SplitsPanel.vue`, `fillRows`). Gens 1-5 don't set it, so they are unchanged. A list
  too long still shrinks its icons.
- ARCHITECTURE §4 (3DS overlay) notes both; `docs/gen6-inventory.md` no longer lists split icons as missing.
- Checked: typecheck and build pass; the X/Y first badge replay runs in the harness with no console errors, and the
  capture shows all 14 X/Y portraits and the table filling the frame down to the game border's line.
- Not checked: OR/AS and gen 7 splits on screen (every icon file was checked to exist for every split name); a
  Followup comparison; the live app.

## Gen 6 and gen 7 (3DS) overlay: stats panel as wide as the bottom screen
- The stats panel (bottom left) is now 408px wide, the same as the bottom screen's slot (bottom right), so the two
  bottom corners mirror each other (`layout.ts` `STATS_WIDTH`, `STATS_SCALE`). It keeps gen 5's proportions, so its
  top is at about y 775, 20px below the bottom screen's top.
- The ability/held item band and the moveset are narrower to make room: their frames now run from 13px after the
  stats panel to 13px before the bottom screen.
- The Poke Ball, the type pill and the species art move up by as much as the stats panel grew (`STATS_RISE`, ~54px),
  closing the gap under the faults box. The left column's top (timer, badges, faults) is untouched.
- Checked: typecheck and build pass; the X/Y first badge replay runs with no console errors and the capture was read
  by eye. Not checked: Webcam and Secondary Screen modes, and species whose art sits high (it may now reach the
  faults box).
- Follow-up: the stats panel now also matches the bottom screen's height. Its frame (gen 6's own `stats.svg`) has its
  top edge 19.5 gen 5 px higher than gen 5's, through a `LIFTS` entry in `make-rounded-ui.py`, and the "Level"
  header moves up half of that (`games/gen6/style.css`). Measured in a capture: the stats frame runs x 13..421,
  y 755..1061, the same as the bottom screen's black edge. The art, ball and type pill rise ~72px in all.
- Follow-up: the stats panel's freed height goes to its rows, not the "Level" header. The stat tiles are 63 gen 5 px
  tall instead of 59 (tops 853/920/987, bottom line unchanged), and the header, exp bar and nature row move up
  (header back to its old distance from the frame's top). `make-rounded-ui.py` `MAPS` moves the frame pictures'
  points (and their drop-shadow regions, which otherwise cut the shapes off); `games/gen6/style.css` moves the text,
  stage badges and line heights; `playerPanel.ts` `evGaugeLayout` the EV bars. The nature arrows are now gen 6
  copies moved with the tiles (shapes kept pointed). Checked in the X/Y double battle and first badge replays (stage
  badge, nature arrows, EV bars all in place), typecheck passes.

## Gen 6 and gen 7 (3DS) overlay: timer caption, right panel width
- The timer's caption reads "time played at 4x game speed", as in gens 1-5 (it said "time played"). Gens 1-5 already
  matched; only gen 6/7 changed.
- The right panel (movepool, splits, enemy team) overhung its column by ~3px on each side: the zone scaled gen 5's
  415px frame to the column, but the frame's outline reaches 1486.59..1907.41. `layout.ts` `RIGHT_SCALE` now fits
  the outline, so the panel's right edge ends on the bottom screen's right edge (both last pixel 1906, measured) and
  its left edge 13px from the top screen. The panel is ~1.4% smaller; the bottom still lines up with the game border.
- Checked: typecheck and build pass; X/Y first badge replay with the movepool, splits and enemy team captures read.

## Settings panel: Readouts in gen 6's left column, EV numbers right-aligned (gens 3-6)
- Gen 6/7: the Readouts group moves from the second column to the first, under the file buttons.
- The EVs readout's numbers are right-aligned in a 3-digit slot so the digits line up (labels stay left-aligned):
  new `stp-statgrid-numbers` class in `core/styles/settings.css`, set on the `readout.evs` grid in gens 3, 4, 5 and 6
  (gens 1-2 have no EVs readout). The IV grids are unchanged.
- Checked: typecheck and build pass; the gen 6 settings panel read in an X/Y replay capture. Gens 3-5 not looked at
  on screen (same class on the same control).

## Gen 6 and gen 7 (3DS) overlay: shorter moveset frame, centred ability band
- The moveset frame is 12 gen 5 px shorter at the top so it hugs its header row (`make-rounded-ui.py` `MAPS`,
  `layout.ts` `MOVESET_TRIM`); its bottom stays on the bottom line (canvas 1062, level with the stats panel and the
  bottom screen). The moves themselves don't move.
- The ability/held item band is centred in the space between the top screen's border and the moveset frame
  (`ABILITY_CENTRE_Y`), instead of sitting high in it.
- Checked: typecheck and build pass; X/Y double battle replay capture read (frame top ~885, header text ~897).

## Gen 7 (Sun/Moon, Ultra Sun/Ultra Moon): its own frame style
- New "soft" style in `tools/gen6/make-rounded-ui.py`, written to `images/gen7/` (gen 6's round set is unchanged):
  gen 5's angled cuts stay, and every join between two edges becomes a short curve (it starts 36% of the shorter
  edge's length from the corner, at most 12 gen 5 px), so a straight edge bends into the cut and the cut bends into
  the next edge, as in Alola's party menu. Pointed ends (ability/held item, stat tiles, move tags) become soft points.
  The stacked outlines share centres, as in gen 6. The stats/moveset size changes (`MAPS`) apply to both sets.
- The overlay picks the set from the game: `games.ts` `frames` ("images/gen6" / "images/gen7"); Overlay.vue
  `frame()` / `frame_url()`, `playerPanel.ts` `faultsLayout(layout, frames)` and the popup frames, `enemyPanel.ts`
  `view.frames`. The game screens' frames (`game_area.svg`) stay gen 6's for both.
- Checked: typecheck and build pass; a Sun replay (gen 7 frames) and the X/Y double battle replay (gen 6 frames,
  unchanged) run with no console errors, captures read by eye. Not checked: Ultra Sun/Ultra Moon on screen (same
  code path), the gen 7 movepool/splits/accuracy popups on screen. The exp bar keeps gen 6's pill-ended CSS bar.

## Gen 6/7 stat labels at gens 1-5's opacity
- The HP/Atk/Def/SpA/SpD/Spe labels in the 3DS stats panel were drawn at full opacity (inline `opacity: 1` in `games/gen6/playerPanel.ts` overrode the shared `.stat_label_style` rule). They now use `.63`, the same as gens 1-5; a stat with a stage change in battle still fades to `.1`.
- Verified: `npm run typecheck`. Not checked on screen.
- Follow-up: gen 7's boxes are now Alola's shape, not gen 5's with soft corners. Every convex box (gen 5's cut-corner
  and pointed boxes) is redrawn over its bounding box as a long hexagon: flat top and bottom, each side a steep
  point sticking out 16% of the box's height (at most 8 gen 5 px; 3 for the movepool/splits frames, whose square
  table window must stay inside the border). Joins get small curves (22% of the shorter edge, at most 7 px) so the
  points stay points. Square windows, rectangles and notched shapes keep their outlines; the faint bottom-left lip is
  left out of gen 7. Checked in a Sun replay.
- Follow-up: the stats panel and the movepool/splits frames don't take the hexagon (Scott: it looked odd on them).
  They keep gen 5's slanted cut on the top-left and bottom-right corners only (Alola's diagonal accent) and the other
  corners become 18px soft curves (`SLANT_FILES`). Square windows (the movepool's table) are left square in gen 7.
  The movepool's bottom corners stay square, as in gen 5. Checked in a Sun replay.
- Follow-up (supersedes the slanted-corner try): the stats panel is back to the hexagon. The movepool/splits frame
  keeps gen 5's outline in gen 7 (`GEN5_SHAPE_FILES`): both top corners cut, every join softly curved, so its bottom
  corners are soft curves again. Checked in a Sun replay.
- Follow-up: gen 7's points stick out further (a quarter of a box's height, at most 12 gen 5 px; was 16% / 8),
  closer to Sun/Moon's menu. Checked in a Sun replay with the enemy team showing: the move tags nearly touch the
  enemy row's pointed right side but stay inside it.
- Follow-up: in gen 7 the timer, faults, stats and enemy-team panels widen by their points (`WIDEN_FILES`): their
  corners stay where gen 5's were and the points reach out into the side margins, so the points no longer crowd the
  tiles and move tags inside. The stats panel's points therefore reach past the bottom screen's mirror width.
  Checked in a Sun replay.
- Follow-up: the widened panels now take half their point outward and half inward (`WIDEN_SHARE` 0.5); all outward
  was too much. Checked in a Sun replay.
- Fix: the enemy trainer-name bar's innermost layer (37 tall) was under the widening cut-off while its other layers
  widened, so one part of the bar showed lighter than the rest. `WIDEN_MIN_H` is now 30, so every layer widens alike.

## Gen 7 splits: rival Hau and the Elite Four rematches
- Ultra Sun/Ultra Moon ended the run on the first win against Hau, who is the rival all game. Now only a Hau win
  after an Elite Four split counts (as the champion split, which ends the run); earlier Hau wins are no split.
- Hala and Olivia (Sun/Moon) and Olivia (USUM) are kahunas and then Elite Four members. The second fight wrote a
  second "Hala"/"Olivia" row and replaced the kahuna's time in the panel. The Elite Four fights are now their own
  splits, "Hala (E4)" and "Olivia (E4)", with the same face icons. Sun/Moon has 11 splits, USUM 11.
- How: `games/gen6/games.ts` gains `splitRules` (the trainer a split stands for, and `afterAny`, splits one of which
  must be done first) and `splitFor`, which picks the split for a win; `battleWon` and `splitIcon` in
  `games/gen6/Overlay.vue` use it. X/Y and OR/AS have no rules, so they work as before. ARCHITECTURE §4 notes it.
- Guzma's several fights still each write a row under "Guzma" (the panel shows the latest), as before.

## Gen 7: island trial stamps in the badge box
- Sun/Moon and Ultra Sun/Ultra Moon show Scott's four island trial completion stamps (Melemele, Akala, Ulaula, Poni)
  in the badge box, one row of four, instead of nothing. Saved in the art library as
  `libraries/badges/gen7/Gen7 Stamp<N>-<Island>.png` and in `images/gen7/stamps/0-3.webp` by `import-badges.py`.
- The gen 7 mappers have no trial flags, so an island's stamp shows once this run has that island's grand trial split
  (Hala, Olivia, Nanu, Hapu: `games.ts` `badgeSplits`). A run whose splits were cleared, or one started past an island,
  shows those stamps as not won. Stamps not won yet are the same faint grey shapes as gen 5/6's badges.
- The stamps are cut to one shared square (less empty margin) and drawn about 25% bigger, nearly touching across the
  box, with a dark outline thinner than the Kalos badges' (2.5 vs 4 px of the picture) that skips the faint ink specks.
  Because of the outline, a stamp not won yet shows as a plain grey disc rather than grey filigree.
- Gen 7's angled badge box keeps its size (`badgeLayout: "stamps"`, `playerPanel.ts` `STAMP_CELLS`); X/Y and OR/AS
  are unchanged.
- Checked: typecheck passes; the Sun fixture runs in the harness with Hala and Olivia splits put in the run by a test
  hook, and the capture shows those two stamps in colour and the other two grey. Not checked: a real grand trial win
  in a replay, Ultra Sun/Ultra Moon on screen, the live app.

## Gen 7 split icons: faces centred, bigger
- Measured gens 3-5's 35px split icons (no written rule exists anywhere): the face is centred left-right, cheeks span
  about 0.52 of the square, eyes ~0.42 down, chin ~0.66. Gen 7's icons were framed tighter (1.25 hair-inclusive face
  widths, eyes half way down), so faces sat low, Guzma's was off to the right and Kukui's hand showed.
- `tools/gen6/make-split-icons.py`: gen 7 now has its own framing (`face7`, `CHEEKS` 0.52, `MID` 0.54) with each face
  re-measured on the skin (centre, eye line, chin, cheek width); Kukui is zoomed in a little (0.88) to keep his hand
  out. New `--gen` flag; ran `--force --gen gen7`, so gen 6's icons and its framing code are untouched. Still 88px
  lossless WebP.
- `games/gen6/style.css`: `.gen-7 .splitIcon` is 69px high (width auto), filling Sun/Moon's and USUM's 11 rows (each
  ~75.6px in the zone, ~59.6px on screen); gen 6 keeps 43.8px.
- Checked: typecheck, build; harness captures of Sun/Moon and USUM (screenshots/gen7-splits/after-*.png): icons are
  square, 54.4px on screen, rows and the table's bottom unchanged, no height cap kicks in. Contact sheet old vs new
  checked by eye. Not checked: the live app, gen 6 on screen (its CSS rule is unchanged). Hala's raised hand still
  shows at the right edge of his icon (it's right beside his face in the art); Nanu and Molayne stay a bit soft
  (small source pictures).
- Scott's hand adjustments, as a trailing `{right, down, zoom, flip}` dict on each gen 7 `FACES` entry (moves in
  on-screen px at 1080p, where the icon is 54.4px; zoom = how much bigger the face gets; flip mirrors the finished
  icon), so the measured framing stays as it was (two rounds): Hala zoom 1.25, up 2 (head about Nanu's size); Olivia
  left 4; Nanu left 3, down 2, zoom 1.09; Hapu left 1; Guzma zoom 0.91, down 2, flipped; Lusamine zoom 0.94, right 2;
  Acerola left 2; Molayne zoom 1.29, right 1, flipped; Hau zoom 1.18, right 2, flipped; Kukui right 3 (keeps his 0.88
  framing). Kahili unchanged. Checked: typecheck, build, harness
  captures `screenshots/gen7-splits/adjusted-*.png` (icons still 54.4px on screen), before/after contact sheet by eye.
  Not checked: the live app.

## Gen 6/7 audit: OR/AS Mossdeep split, gen 7 "Cross Out After First Badge"
- OR/AS never counted the Tate & Liza split: the split list said "Tate&Liza" (gen 3's name) with class "Leader", but in
  OR/AS the pair is one trainer, "Leaders Liza & Tate" (Bulbapedia). `games.ts` now maps the split `Tate&Liza` to
  `Liza & Tate`, adds the `Leaders` class, and `splitFor` compares names without case or spaces and with a pair's two
  names in either order. The split keeps its name "Tate&Liza" (panel, CSV, icon, older split files).
- `splitIcon` uses the split's own name less a " (E4)" tag instead of the trainer name, so the icon still finds
  `tate_and_liza.webp` (and Hala (E4) still shows Hala).
- Gen 7: "Cross Out After First Badge" never crossed anything out, because it read `player.badges[0]`, which the gen 7
  mappers don't have. A new `badges_won` (badge flags in gen 6, kahuna splits in gen 7) feeds both the badge box and
  the cross-out rule, so in Sun/Moon and USUM the first island stamp (Hala) counts as the first badge.
- Audited without changes: the four split lists and finals, the game data (type chart with Fairy and gen 6 Steel,
  TM/HM lists per game, gen 6 vs gen 7 move changes, base stats, megas, Alolan forms), every mapper path the overlay
  claims (all present in all four mappers; gen 7 has no `player.badges`, as expected), X/Y and OR/AS badge bit order
  against replays. Mappers not edited, still 0.1.0 on all four (`make-3ds-mappers.py --check`: already patched).
- Verified: `npm run typecheck`, `npm run build`; `splitFor` cases by script (Liza & Tate / Tate & Liza / Tate&Liza,
  Hala and Hala (E4), Olivia (E4), USUM Hau before and after the E4); harness replays with no console errors: X/Y
  Viola win (split row, badge), X/Y blackout, OR/AS Brawly win (new fixture from Scott's replay: split row, two Hoenn
  badges shown), OR/AS trainer battle with level-up, Sun trainer battle, Sun blackout, Ultra Moon level-up/move.
  `npm run parity:drift` fails only on the existing gen5 `load_all_settings` entry.
- Not verified: a real Tate & Liza or kahuna win in a replay (none recorded); the cross-out change on screen; the
  live app. No 3DS replay has a split time, so SPLIT bookmarks weren't exercised (the harness timer stays at 0).
- Fix: gen 7's nature arrows poked out of the hexagon stat tiles (gen 5 draws them in the tile's top or bottom half,
  where gen 7's right side slants in). In gen 7 each arrow is now centred on its tile's middle line and 1.5px further
  left (`arrow_in_tile` in `make-rounded-ui.py`); gen 6's arrows are unchanged. Checked in a Sun replay (Lax: Def up,
  SpD down).

## Gen 6 and gen 7 (3DS): memory writes and the starter setting (X, Y, OR, AS, Sun, Moon, US, UM)
- New starter write, as gens 3-5 have it: the Pokémon column gains Starter (Set Starter in Game, on by default; Write
  to Game button), IVs (Automatic Hidden Power spread or Manual), Ability & Gender and Nature, kept per Solo Pokémon.
  When the party goes from empty to one Pokémon (level 6 or under, first hour of the save) and no battle is on, the
  lead's nature, ability, gender and IVs are written and its stats worked out again. Gen 5's control ids are reused.
- How: `games/gen6/logic/pk6.ts` decrypts the party slot (block shuffle + LCRNG), stamps it, re-encrypts it with the
  checksum worked out again, and `games/gen6/starterWrite.ts` writes the 232 stored bytes whole, then the 28
  party-stat bytes, then reads back until memory shows them. It refuses a read whose checksum doesn't add up, an egg,
  and battles (a battle writes its copy of the party back at the end and undoes the stamp: seen in Ultra Moon).
- Mappers (`%APPDATA%\PokeAByte\Mappers`, not this repo, uncommitted there): all four 3DS mappers go to **0.2.0**
  through `tools/mappers/make-3ds-mappers.py` step 5, which adds `player.encrypted_mon_0` and `_stats`; X/Y, OR/AS,
  Sun/Moon and US/UM stay on the same version number. Run the script again after a PokeAByte mapper update.
- New tool `tools/gen6/starter-write-test.ts`: writes into a replay's emulator and plays on (needs a replay worker
  with `goto`/`read`/`write` test commands; docs/gen6-inventory.md "Writing the starter").
- Checked: `npm run typecheck`, `npm run build`. Headless, all four pairs: decrypt+encrypt gives back the game's bytes
  exactly; the written bytes read back exactly; the game then rewrote the Pokémon itself (level-ups in X and OR, a
  battle end in Sun, held item and TM in Ultra Moon) with the checksum good, no Bad Egg sign, and the stamped values
  kept, its own level-up stats matching the stamped IVs/nature; hidden abilities in all four; the overlay's own
  `writeStarter` used for the write in all four. Through PokeAByte's engine (pab-host) the new properties sit at the
  lead's address and serve the right bytes. Harness: a synthetic X/Y new game writes the starter once (bytes decrypt
  with a good checksum to the defaults), mid-run X/Y and Sun replays write nothing, same markers as before, no
  console errors. `parity:drift` not run (no gen2-5 edit).
- Not checked: a live write through PokeAByte into a running Super Shuckie; a starter received in a real new game
  (no replay reaches it); the settings panel by eye.
- Docs: `docs/gen6-inventory.md` ("Writing the starter"), ARCHITECTURE §4 (the 3DS overlay), `docs/mapper-matrix.md`.
- The starter also becomes the **Solo Pokémon's species**, as the earlier generations' starter choice gives it: new
  species id, exp at the start of its level on its growth rate, the last four moves it learns by that level (full PP),
  base form, and the species' name unless the player nicknamed it. For three minutes after the write, a lead that
  changes back is written again (the game might still be handing it over from its own copy); a lead that already has
  the species and choices is left alone, so its exp, moves and EV-raised stats are never reset by this.
- Checked for the species: headless in all four pairs (Fennekin to Froakie in X, Combusken to Mudkip in OR, Popplio to
  Rowlet in Sun, Litten to Popplio in Ultra Moon): the game battled with the new species and wrote its exp back, with
  the checksum good and species, moves, nature, ability, gender and IVs kept; the harness new game wrote a Froakie with
  a good checksum. Not checked: the game's own Pokédex still lists the species it handed over; nickname screens.
- Fix: gen 7's steep slanted sides looked jagged. Cause: the frames' black edge is under 1px once a zone scales it
  down, so on a near-vertical line it fades in and out pixel by pixel, made worse by the colour tint's blend (a
  browser test with and without the tint layer showed it). In gen 7 that edge now gets a thin 0.8px black stroke
  (`EDGE_STROKE`), which keeps a solid line along the slant. Gen 6 unchanged. Checked with before/after close-ups of
  a Sun replay.

## Damage ranges from stp-damage-calc (all five generations)

- In a battle the player's move list now shows each move's damage to the enemy out: the HP range, the percent of its
  max HP, and hits to KO, in place of power, accuracy and PP (out of battle it looks as before). Each enemy move in the
  enemy panel (trainer, wild, gen1's wild panel) gets a small line under its name: percent range and hits to KO
  against the player's Pokémon.
- Hits to KO count hits that land, no crits, from the target's current HP, and count a held healing berry (Oran,
  Sitrus, Berry, Gold Berry, Berry Juice, Figy family). It shows the first count with at least a 10% chance, with the
  chance when it isn't certain ("2HKO 56%").
- All numbers come from Scott's shared engine `stp-damage-calc`, added as a git submodule in `damage-calc/` (like
  Solodex and Matchup Planner) and imported as `@stp/damage-calc`. Move/species data is built from data_objects by
  `tools/damage/build-data.mjs` into `src/renderer/core/damage/data/`. The glue is `core/damage/`, each
  generation's inputs `games/genN/damage.ts`.
- Gens 1-2 take stats from the party structs, not the battle structs (those already include stages, badges and
  burn/paralysis, which the engine applies itself; checked in pokecrystal `CalcPlayerStats`).
- The release workflow now checks out submodules with the `DAMAGE_CALC_TOKEN` secret. **Scott: add that secret to this
  repo on GitHub** (same kind as Solodex's), or the next release build fails. A fresh clone (the Mac) needs
  `git submodule update --init`.
- Gen 2's old "damage ranges" setting is ignored in battle now (its own formula is replaced by the engine's there).
- Not done: the second trainer's team in a two-trainer battle (gens 3-5) shows no enemy damage; doubles count as
  singles. The gen 5 mapper has no Reflect/Light Screen flags, so gen 5 never counts screens.
- Found, not fixed (separate change): gen 4's screens pop-up reads `battle.field.player.reflect`, which the mapper
  doesn't have (the real flags are `battle.flags.player_side.*`). Gen 5's reads the same missing path.
- Verified: `npm run typecheck`; new `npm run parity:damage` self-test (name lookups in every game's data, a
  hand-computed gen 3 hit, Oran Berry, immunity); the harness on staged battles in gens 1, 3, 4 and 5 and the real
  gen 2 Crystal recording (move list and enemy panel on screen in all five). `parity:drift` fails on
  `load_all_settings` in gen5, which was already so at HEAD (gen5's Overlay.vue is untouched here).
- Not verified: a live run in any game; Diamond/Pearl, HG/SS, Emerald, Gold/Silver, Red/Blue, Black 2/White 2 (same
  code paths as their siblings); full before/after harness comparison of non-battle screens (the change only acts in
  battle, but I didn't diff every oracle).

## Gen 6 and gen 7 (3DS) overlay: no light line outside the frames, moveset bottom level
- A faint light line showed just outside the frames' dark edge. The colour tint (`.colored-image::after`, a
  `color`-blended layer masked by the frame picture) reached the frame's outermost half-covered pixels, where the
  frame below is nearly transparent, so the tint colour itself showed there. `games/gen6/style.css` now erodes the
  tint's mask by ~0.8px (the picture intersected with itself shifted four ways), so the tint stops inside the edge.
  Both gen 6 and gen 7. Measured in a Sun capture: the pixel just outside the enemy panel went from (23,34,66) to
  (4,12,39), the background's colour.
- The moveset frame sat a pixel lower than the stats panel and the bottom screen: gen 5's fill edge (1060) was pinned
  to canvas 1060, leaving its outline a pixel past the others. `layout.ts` now pins its outline (gen 5's 1063) to
  the bottom line; measured in a Sun capture, the stats, moveset and bottom screen edges end on the same row.
- Checked: typecheck and build pass; Sun and X/Y double battle replays, no console errors.
- Follow-up: the stats panel and the bottom screen are now exactly the same height where it shows. The frames' black
  edge is 1px and the screen's is 2px, so on a dark background the stats panel looked a pixel taller at each end.
  `layout.ts` `FRAME_BOTTOM` / `STATS_TOP` put the frames' outline 1px inside the screen's outer edge (stats frame
  756..1060, its top lift now 17.5 gen 5 px), and the moveset uses the same bottom. Measured in a Sun capture: the
  stats panel's lit part and the screen's green both run rows 757..1059; the moveset's ends on 1059 too.

## Gen 6 and gen 7 (3DS) overlay: equal top and bottom margins
- The margin above the top screen's edge was 17px and the one under the bottom screen's edge 18px. The bottom line
  is now 1063 (`layout.ts` `BOTTOM_LINE`; gens 4-5 keep 1062) and the bottom screen moves down 1px: inner 404x303
  at (1501, 758), edge 1499..1907 x 756..1063 (`BOTTOM_SCREEN`, `images/gen6/ui/second_screen_game_area.svg`,
  `screenshot.ts` `n3dsBottom`, `docs/gen6-3ds-overlay-plan.md`). The stats panel, moveset, ability band, Poke Ball
  and art move down with it.
- Measured in a Sun capture: rows 0..16 above the top screen's edge and rows 1063..1079 under the bottom screen's
  edge are background (17 each); the stats panel's lit part and the bottom screen's green both run 758..1060.
- **OBS:** the bottom screen's green area is 1px lower; a 3DS bottom-screen source already placed in OBS needs to
  move down 1px.
- Checked: typecheck and build pass; Sun and X/Y double battle replays, no console errors.
