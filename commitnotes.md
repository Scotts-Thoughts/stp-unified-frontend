## Agent working and commit rules

- AGENTS.md: agents work in this one folder (no worktrees, copies or branches), append notes here when they
  finish, never ask about committing, and on Scott's say-so ask which next version he wants (major, minor or
  patch bump), bump once, use these notes as the commit description and empty this file.
- Added this `commitnotes.md`.
- Docs only; nothing to build or test.

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
