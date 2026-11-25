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
| Scott reports something the overlay got wrong in a run | `A:\Dropbox\stp-projects\project_context\docs\workflows\debugging-from-replays.md`, then `tools/markers/README.md` |

**When Scott reports a problem from a run, reproduce it yourself:** find the run's Super Shuckie replay, log the
game's memory through it headlessly (`tools/markers/memlog.cjs`), find the cause in the log, then fix it. Don't
ask him for files or a plan first.

To read one section, run `grep -n '^## ' ARCHITECTURE.md` for the starting lines, then read only that range.

## Git: no pull requests, work on main

- **Never open a pull request and never push a branch.** Scott commits and pushes
  himself.
- **Work in Scott's local checkout** of this repo on his PC, on the branch it is
  already on (normally `main`). Don't create or switch branches for your work.
- **Leave every change uncommitted**, so Scott can test it locally on main and
  commit it himself.
- If you are running in a cloud session with only a clone of this repo, do the
  work on Scott's PC instead (folder access or Remote Control). If you can't,
  stop and ask Scott; don't fall back to a branch or a PR.

## Rules

- **One working copy, no worktrees.** Always work in this folder, on the branch it is on, even when other agents
  are editing files here at the same time. Never make a git worktree, a copy of the repo or a new branch to work
  in. Other agents' half-finished edits are normal: leave them alone and don't revert files you didn't change.
  (The HEAD build that ARCHITECTURE §12 uses for before/after captures is a read-only baseline, not a place to
  work; delete it when the capture is done.)
- **Write commit notes when you finish.** When your task is done, append your notes to `commitnotes.md` (next to
  this file): a short heading for the task, then a few plain bullets saying what changed and why, what you
  verified and what you didn't. Add to the file; never rewrite or delete other agents' notes.
- **Don't commit or push unless Scott says to, and don't ask.** Leave changes uncommitted. Never ask Scott whether
  to commit; he will tell you when. Where the docs say two things need separate commits, do one, stop, and tell
  Scott so it can be committed before you start the other.
- **When Scott says to commit:**
  1. Ask Scott which version this commit is, offering the three next versions worked out from the one in
     `package.json`. For `3.4.1` that is `4.0.0`, `3.5.0` or `3.4.2`. Then bump once to the one he picks:
     `npm version major|minor|patch --no-git-tag-version` updates `package.json` and `package-lock.json`
     together.
  2. Commit everything Scott asked for. The commit message is the new version as the title (`v3.4.2`), then
     everything in `commitnotes.md` as the description.
  3. Empty `commitnotes.md` (leave the file in place) and include that in the same commit, so the next agent
     starts fresh.
  Push only if Scott asks for that too.
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
- **Every generation changes together.** A feature, file format or saved preference that applies to more than one
  generation goes into all of them (gen1, gen2, gen3, gen4, gen5, and every game inside each) in the same piece of
  work. If one can't be done yet, say so in your report and add it to the list below; don't leave it to be
  noticed later. When you remove a setting or move logic into a shared mixin, grep every generation for the old name.
  Decisions that hold everywhere:
  - **Splits:** one CSV per run, the simple format, no `-simple` / `-full` names (`docs/external-contracts.md` §5).
  - **Post-battle splits:** the switch is `show_post_battle_splits()` from `rightPanelModeMixin`. Nothing else
    may use that name; a `data()` key with the same name replaces the method and crashes the battle-end handler.
  - **Resets:** a detected reset goes through `confirmReset` (`core/logic/resetGuard.ts`) before it counts or sends a
    marker, because resuming from a replay looks like a reset (ARCHITECTURE §9).
  - **Finished runs:** the `finishes/` copy is named by `getFinishFileName()` where a generation has evolution lines
    (gens 3-5), and re-filming mode covers gens 1-5. Gens 1 and 2 have no evolution lines.
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
| Diamond/Pearl | none; use `A:\decomps\pokeplatinum` (same battle engine) | `~/Documents/pokemap/repos/pokediamond` |
| HeartGold/SoulSilver | `A:\decomps\pokeheartgold` | `~/Documents/pokemap/repos/pokeheartgold` |
| Platinum | `A:\decomps\pokeplatinum` | `~/Documents/pokemap/repos/pokeplatinum` |

## Machine notes

- **Mac:** Node must be ≥ 22.12 for `npm run build`/`dev`. There is no keyhook, so no hotkeys. Legacy-app
  baselines can't be captured here (ARCHITECTURE §12).
- **Windows:** the legacy apps live in `A:\Programs\genN-stp-frontend`. They are read-only inputs; never edit them.
