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
