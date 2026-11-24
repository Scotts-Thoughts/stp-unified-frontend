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
