# AGENTS.md

This is an Electron + Vue stream overlay for Pokémon gens 1–5. gen1 is refactored; gen2–5 are giant legacy
components being broken up. Read `ARCHITECTURE.md` **only in the sections your task needs**:

| Task | Read |
|---|---|
| Anything (first time in a session) | §1, §2 |
| Bug or feature in one generation | §4, plus §5 if it's gen2–5 |
| Feature across all generations | §4, §5, §10 |
| Pokémon data fix (dex, trainers, moves) | §6 |
| Refactor / Phase 6 / cleanup | §5, §10, §11, and the "Phase 6 plan" in `docs/IMPLEMENTATION_PLAN.md` |
| Something that looks like a legacy bug | §11 |
| Adding a mapper, edition or game | §4, §13 |
| Startup, game detection, wrong overlay loading | §3 |
| Main process (`src/main`), file access | §2, §10 |
| Settings, saving, split files | §7, §9 |
| Control server, OBS, Super Shuckie, PokeAByte, chapter markers | §8, §9, then `docs/external-contracts.md` |
| Performance | §3, §5, `docs/performance-followups.md` |
| Checking your work | §12 |

To read one section, run `grep -n '^## ' ARCHITECTURE.md` for the starting lines, then read only that range.

## Rules

- **Don't commit or push.** Leave changes uncommitted for Scott to review, unless Scott asks for a commit.
  Where the docs say two things need separate commits, do one, stop, and tell Scott so it can be committed
  before you start the other.
- **Big jobs start with a short plan.** For a refactor, a change across several generations, or anything over an
  hour of work: say what you will change and how you'll verify it, then wait for approval.
- **Never read a giant file whole.** The four `games/gen{2,3,4,5}/Overlay.vue` files (7k–10k lines) and the
  data tables (up to 118k lines, see ARCHITECTURE §6) are searched with grep, or read in slices. Run `wc -l` on
  any file under a `data/` folder before reading it.
- **`components/`, `stores/`, `logic/` and `data/` at the top of `src/renderer/` are gen1-only.** Shared code is
  `src/renderer/core/`.
- **Game quirks stay; code quirks get fixed.** If the real game does it, keep it. Check the decompilations below.
  If it's only an inconsistency between the old apps, fix it in its own change and log it in
  `docs/known-legacy-bugs.md`. Details: ARCHITECTURE §11.
- **Don't rename these:** CSS classes, element ids, saved-setting keys, `/status` fields, split CSV columns,
  marker names. Other programs and the test harness depend on them.
- **Verify only what you touched** (ARCHITECTURE §12):
  - always `npm run typecheck` (it does not cover `src/main`, which has no working typecheck: for an edit there, run
    `npm run build`, which only catches syntax and import errors, and say the edit is otherwise unchecked);
  - `npm run parity:drift` for any gen2–5 edit;
  - the harness for the affected generation(s) when what's shown, written or sent could change.
  - Say which checks you ran and which you couldn't.
- **Write lasting knowledge into the repo, not Claude's memory.** Memory stays on one machine, and Scott works on
  both Windows and a Mac.
  - When you learn something the next agent would need, add it briefly to the right section of `ARCHITECTURE.md`
    (or the matching `docs/` file). That could be a trap, a rule, how something really works, or a setup step.
  - Record lasting facts, not a diary of this task.
  - If it's a rule nearly every task needs, suggest adding it here instead of editing this file yourself.
  - Mention what you added when you report back.
- **Talking to Scott:** Scott is not a professional developer. Use plain language, give a recommendation rather than a
  list of options, and say what you did not verify.

## Game decompilations (read-only ground truth)

Gen 1/2 are asm; Gen 3/4 are C. Search them instead of guessing at game internals.

| | Windows | Mac |
|---|---|---|
| Red/Blue, Yellow | `A:\Cygwin\home\scott\pokered`, `…\pokeyellow` | `~/Documents/pokemap/repos/pokered`, `…/pokeyellow` |
| Gold/Silver, Crystal | `A:\Cygwin\home\scott\pokegold`, `…\pokecrystal` | `~/Documents/pokemap/repos/pokegold`, `…/pokecrystal` |
| Ruby/Sapphire, Emerald, FireRed/LeafGreen | `A:\decomps\pokeruby`, `…\pokeemerald`, `…\pokefirered` | `~/Documents/pokemap/repos/pokeruby`, `…/pokeemerald`, `…/pokefirered` |
| Diamond/Pearl, HeartGold/SoulSilver | `A:\Dropbox\stp-projects\programs\pokemap\repos\pokediamond`, `…\pokeheartgold` | `~/Documents/pokemap/repos/pokediamond`, `…/pokeheartgold` |
| Platinum | `A:\decomps\pokeplatinum` | `~/Documents/pokemap/repos/pokeplatinum` |

## Machine notes

- **Mac:** Node must be ≥ 22.12 for `npm run build`/`dev`. There is no keyhook, so no hotkeys. Legacy-app
  baselines can't be captured here (ARCHITECTURE §12).
- **Windows:** the legacy apps live in `A:\Programs\genN-stp-frontend`. They are read-only inputs; never edit them.
