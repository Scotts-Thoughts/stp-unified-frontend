## Agent working and commit rules

- AGENTS.md: agents work in this one folder (no worktrees, copies or branches), append notes here when they
  finish, never ask about committing, and on Scott's say-so ask which next version he wants (major, minor or
  patch bump), bump once, use these notes as the commit description and empty this file.
- Added this `commitnotes.md`.
- Docs only; nothing to build or test.

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
