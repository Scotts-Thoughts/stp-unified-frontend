---
name: issues
description: Work through Scott's issue reports (the zips the overlay's Report button saves in reports/) and fix them. Use when Scott runs /issues or asks to go through his reports/issues.
---

# Fixing reported issues

Scott files issues with the overlay's **Report** button. Each one is a zip in `reports/` (gitignored), named
`<YYYY-MM-DD> <title>.zip`. Finished ones are moved to `reports/done/`. If Scott passes an argument, treat it as
a filter on the title (only those reports), otherwise do every zip directly in `reports/`.

## What's in a report zip

| File | Use |
|---|---|
| `report.txt` | Title, Scott's description, app version, and the overlay context: `generation`, `module`, `game`, `mapper_path`, window size. **Start here.** |
| `screenshot.png` / `screenshot-annotated.png` | The window when he hit Report; the annotated one has his drawing on it (circles, arrows) showing *where* the problem is. Look at both. |
| `console.log` | The last 5000 lines of renderer + main console. Grep it for `error`, `warn`, `Uncaught`. |
| `settings/…` | His `overlay_settings.json`, per-game/per-run `settings.json`/`metrics.json`, `user_state.json` (large: grep, don't read whole). Use these to reproduce the exact setup. |

## Steps

1. **List** the reports: `ls reports/*.zip`. If none, say so and stop.
2. **Unpack each** into the scratchpad (never into the repo): `unzip -o "<zip>" -d "<scratchpad>/issues/<name>"`.
   Read `report.txt`, view both screenshots, grep `console.log`.
3. **Triage, then go ahead.** For each report write one or two lines: what's wrong, which generation(s) and
   files are involved, and how you'll check the fix. Follow AGENTS.md's table to read only the needed
   ARCHITECTURE.md sections. **Running /issues is Scott's approval to fix:** start the work right away, even when
   it touches several generations or is a big job. This overrides AGENTS.md's "big jobs start with a plan and
   wait" rule for reported issues. Stop and talk first only when:
   - the report's own text says to hold off, or asks for discussion, brainstorming or a plan first; or
   - you can't tell what the right fix is (the description is ambiguous, or there are real design choices only
     Scott can make). Then interview him with a few specific questions, and fix once it's settled.
   Mention any choices you made on his behalf when you report back.
   - Description says "like the original overlays" → compare with the legacy app in
     `A:\Programs\genN-stp-frontend` (read-only).
   - Looks like game behaviour → check the decompilation before "fixing" it (game quirks stay).
   - One report can apply to all gens even if filed from one (e.g. a shared splits panel). Check `core/` first.
4. **Fix** one report at a time, following every AGENTS.md rule: no giant-file full reads, no renaming CSS
   classes/ids/setting keys, no commits.
5. **Verify** what you touched (AGENTS.md / ARCHITECTURE §12): `npm run typecheck` always; `npm run parity:drift`
   for gen2–5 edits; the `verify` skill when what's on screen changed (visual reports usually need this:
   compare the new capture with the report's screenshot).
6. **Move** a report to `reports/done/` only once its fix is made and verified. Leave unfixed or blocked ones in
   place.
7. **Report back** to Scott in plain language, per issue: fixed / needs his input / couldn't reproduce; files
   changed; which checks ran and which didn't. If you learned something lasting, add it to ARCHITECTURE.md and say so.
