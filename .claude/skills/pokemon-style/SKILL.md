---
name: pokemon-style
description: Learn from Scott's own Pokemon styling (art size, position, flip, overlay colour) and improve the generated default looks for every species. Use when Scott runs /pokemon-style or asks to learn from his styling changes or regenerate default looks.
---

# Learning from Scott's styling

The generator in `tools/pokemon-style/` gives every species Scott hasn't styled a default look. Each run of this
skill finds what Scott styled or restyled since the last run, works out what it says about his taste, changes the
rules or labels so the generator would have done it his way, and regenerates the looks he hasn't touched. Read
`tools/pokemon-style/README.md` (files, where looks are stored) and `LESSONS.md` (what has been learned) first.
If Scott passes an argument, treat it as a filter (a species, game or generation) on the changes to look at.

## Steps

1. **Check Python.** `python -c "import numpy, PIL"` (Windows may need `py`). If it fails, install with
   `python -m pip install numpy pillow`. Run every command from the repo root.
2. **Find the changes.** `python tools/pokemon-style/style.py diff --json <scratch>/diff.json`. Each change is:
   - `edited-generated`: Scott changed a look the generator made. The clearest lesson: generated vs his.
   - `new-own`: a look Scott styled that the generator never wrote.
   - `edited-own`: Scott changed a look of his own that was already learned from.
   - `line-look`: his look for a species inside its evolution line, compared with the generated solo look.
   If there are none, say so and stop.
3. **Look at them.** `python tools/pokemon-style/style.py preview <scratch>/diff.json --out <scratch>/sheet.png`
   and look at the sheet (left: generated, right: Scott's; white line: box centre, yellow: where feet go;
   corner swatch: overlay colour). It is a rough drawing, not the overlay: for a close call, see it in the app
   with the `verify` skill. `style.py show <Species> --gen genN` prints what the rules give now.
4. **Work out the lesson for each change**, in this order:
   - Facing (`imageFlip`): a wrong `faces_right` label. Fix the label for that picture and the rest of its
     family in `data/labels.json`.
   - Height: much higher with the art floating means a missing `floats` label.
   - Sideways shift: body centre vs eyes (`eye_x` label, `EYE_NARROW`, `CORE_W`).
   - Size: is this stage's size off (`T[gen].size`) or the species's height and stats (`SIZE_MODEL`)?
   - Colour: which colour of the art Scott took and why: it stands out from the background, it isn't the
     dominant one, it's the second colour of the art (`COLOR_P`, `pick_color`).
   - Background fields (`background*`): a texture framing to copy into `TEX_FRAMING` when the same texture is
     framed the same way more than once, or a filter look that belongs in `core/overlay/textureLooks.ts`.
   - Changes that are only taste for this one species: no rule change. Say so.
   One change is an example, not a rule. Change a shared number only when several changes point the same way,
   or Scott says it's general. A label fix for one picture is always fine.
5. **Change the generator** (`rules.py`, `data/labels.json`), then check the change doesn't undo an earlier
   lesson: `style.py show` for a few species named in `LESSONS.md`, and look again at what the new rule gives
   for the changed species. A rule change should bring the generated look close to Scott's.
6. **Log it.** One dated line per lesson at the bottom of `tools/pokemon-style/LESSONS.md`: what Scott did,
   the lesson, and what changed.
7. **Regenerate.** `style.py generate` (dry run) to see how many looks would change, then
   `style.py generate --write`. It only writes looks Scott hasn't touched. Then `style.py accept`, which marks
   his current looks as learned so the next `diff` shows only new changes.
8. **Check and report.** Run `npm run typecheck` only if you changed a `.ts` file. Append notes to
   `commitnotes.md` (AGENTS.md). Tell Scott in plain words what you learned from each change, what rule or label
   changed, how many looks were regenerated, and anything you were unsure about and want him to confirm.
   Don't commit.

## Traps

- Never hand-edit a style file Scott made. `generate --write` already refuses to.
- Evolution-line looks are never generated: with no line look, the overlay uses the solo look. A line look
  Scott made is still a lesson about that species.
- gen2 file names have no game (`<Species>.json`); gens 3-5 are `<Game>_<Species>.json`. Black/White and
  Black 2/White 2 are separate games with the same pictures.
- gen1 Red/Blue art is drawn at its own size, so its numbers don't compare with the other games'.
- A file holding `null` was cleared on purpose. Leave it alone.
- `generate --write` rewrites `storage/Storage.json` with 4-space indents, as it was.
