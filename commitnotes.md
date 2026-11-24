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
