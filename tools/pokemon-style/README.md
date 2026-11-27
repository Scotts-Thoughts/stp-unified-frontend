# tools/pokemon-style

Default looks (art size, position, flip, overlay colour) for every species Scott hasn't styled, in every
game of gens 1-7 (gens 6-7 are the one 3DS overlay, `games/gen6/`), plus the record of what he changed so the rules can learn from it. Run through the
`/pokemon-style` skill (`.claude/skills/pokemon-style/SKILL.md`).

Needs Python 3 with `numpy` and `Pillow` (`python -m pip install numpy pillow`).

| File | What |
|---|---|
| `style.py` | The commands: `diff`, `preview`, `show`, `generate [--write]`, `accept`. `--help` for details. |
| `rules.py` | The rules and their numbers. |
| `art.py` | Measuring pictures (outline, body centre, colours) and the species table. No rules. |
| `data/labels.json` | Per picture, set by eye: `faces_right`, `floats`, `eye_x`. Keyed by path under `public/images/`. |
| `data/species.json` | Every species: generation, what it evolves from, legendary, height (m), base stat total, Levitate (PokeAPI). |
| `data/dex.json` | Species, first type and family per game, from the overlay's Pokedex tables (`dump-dex.ts` rebuilds it). |
| `data/known.json` | `generated`: every look this tool wrote. `user`: Scott's looks already learned from. |
| `LESSONS.md` | What each of Scott's changes taught, newest last. |

Where looks are stored: gens 2-5 `src/renderer/games/genN/data/style/*.json`, gens 6 and 7 both in
`games/gen6/data/style/` (`<Game>_<Species>.json`; a 3DS species' picture comes from `data/species_art.js`, carried
into `dex.json` as `img`) (a dev-mode edit writes there;
an installed build saves `user_<key>` in `<userData>/stp-overlay/data/user_state.json`, which `diff` also
reads). gen1: presets in `storage/Storage.json` (`games.Yellow` / `games.Red`, `.style`); its edits go to
`<userData>/stp-overlay/data/<game>/<species>/settings.json`. Evolution-line looks
(`<Game>_<Final>-line-<Species>`) are never generated: with none stored the overlay uses the solo look.

`generate --write` never touches a look Scott made: it only writes an entry with no look, or one that still
holds exactly the look this tool gave it. A file holding `null` is left alone. A full run takes several
minutes (`--only gen4` or `--species A,B` for a quick one).
