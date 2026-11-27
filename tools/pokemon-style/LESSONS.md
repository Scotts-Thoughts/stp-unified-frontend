# What Scott's styling has taught the generator

Newest at the bottom. Each line: date, what Scott did (species and game), the lesson, and what changed
(`rules.py` name, a label in `data/labels.json`, or "no rule change"). Read this before changing a rule so
an old lesson isn't undone.

## Standing preferences (from the first rounds of review)

- The art is centred and sits on the Poke Ball, feet slightly behind the type icons (`T[gen].bot`, `cx`).
- Size follows evolution stage (`T[gen].size`). Inside a stage, small or cute species are smaller and weak
  final stages smaller (Watchog); size grows with height and base stat total (`SIZE_MODEL`).
- First stages never shrink far below the stage size (Pidgey looked too small: `SIZE_MIN_FIRST`). Big
  finals fill the space (Gengar).
- Crisp art: never drawn larger than its own pixels (the native cap in `layout`).
- Everything faces right, toward the gameplay area (`faces_right` label; art already facing right is not
  flipped). A family faces the same way (Turtwig, Grotle, Torterra).
- Floating Pokemon float: their middle sits at `FLOAT_CENTRE[gen]`, at least `FLOAT_MIN_LIFT` off the ground
  (Tynamo higher than Cryogonal). `floats` label.
- Centre the body, not the eyes, and not the outline. Eyes only for tall, narrow art like Watchog
  (`EYE_NARROW`, `EYE_MAX_OFF`); Roggenrola and Platinum's Houndoom, Hippowdon, Shellos, Riolu and Luxio
  went left when every species was eye-centred. Tails and wings count less (`CORE_W`; Pidgey's tail).
- Colour: Scott picks the background first, then the overlay colour is another colour of the Pokemon that
  stands out against it. Dominant colour unless it blends into the background as drawn (`COLOR_P`, textures
  measured with their `textureLooks.ts` filters). Watchog: yellow on a brown background; Roggenrola: blue;
  Unfezant: the green of its underbody.
- Steel background: brightness 38, contrast 169, blur 0.8 (`textureLooks.ts`) and `backgroundScale` 151
  (`TEX_FRAMING`), from his Platinum Bronzong line.

## Log

- 2026-11-25: first version of this tool. Everything above was fitted to Scott's ~890 styled looks and five
  review rounds. Steel colours: the old one-off script missed Steel's look (its blur is 0.8, not a whole number)
  and picked Steel species' colours against the unfiltered texture; this tool reads it, so a regenerate may
  change some Steel-type colours.
- 2026-11-25, HeartGold/SoulSilver Mamoswine line (evolution looks): Swinub kept almost exactly the generated
  look. Piloswine went 0.78 -> 0.71 and Mamoswine 1.08 -> 1.0 (about 8% smaller each), with their feet 5-7 px
  lower. The whole line got the same background (Dark Ice, brightness 41, contrast 127, blur 3) and Swinub and
  Piloswine the same overlay colour (#b28c79), a lighter tan than generated. Lesson: a family shares one
  background and often one colour; big gen4 middle/final stages may run a little large. One family only, so no
  rule change yet: if more big gen4 Pokemon come back smaller, lower `T["gen4"].size` middle/final by ~8%.
- 2026-11-26, gens 6-7 (3DS overlay) added, no looks of Scott's yet: `T["gen6"]` is gen 5's feet and body centre
  carried into the 3DS art box, sizes gen 5's x1.1 (mockup A draws the art bigger), and a new `xlim` keeps the
  outline between the canvas's left edge and the top screen's border (shifted in, shrunk only if wider than the
  room). 231 new pictures got `faces_right` / `floats` labels by eye from contact sheets. First lessons from his
  3DS looks should check these numbers.
- 2026-11-26, noticed while adding gens 6-7: a dry run for gens 2-5 wants to replace ~3,180 generated looks
  (overlay colours a few shades off, e.g. White 2 Meloetta #d57d5d -> #df8261), so something the colours depend on
  (likely a texture look) changed since the 11-25 run. Not regenerated; worth a look on the next `/pokemon-style`.
