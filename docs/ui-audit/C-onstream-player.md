# C — On-stream player side audit

> Snapshot of the 2026-10-14 UI audit (read-only, against the working tree of that day). Line numbers drift as
> the work in `docs/ui-uniformity-plan.md` lands; re-check any `file:line` before relying on it. Mark a finding
> done in the plan, not here.

Scope: everything viewers see on the player's side (timer, badges, faults box, repel/bonk counters, species art and
Pokéball floor, type badges, level/exp/growth, nature/friendship, stat tiles, the player's move list, Ability/Held
Item, player pop-ups). Read-only audit of the working tree on 2026-10-14; screenshots from
`tools/baselines/unified/*` (2026-09-11). gen1 files are under `src/renderer/components/`, gen2–5 refs are
`games/genN/Overlay.vue:<line>` unless a file is named.

## Inventory

| Element | gen1 | gen2 | gen3 | gen4 | gen5 |
|---|---|---|---|---|---|
| **Timer caption** | "time played at 4x game speed", `genericLabels timerLabel`, inline 16px (`graphics.vue:45`) | "time played at 4x **game-speed**", `timerTitle` (`:927`) | "time played at 4x **game-speed**", `timerTitle`, printed by `components/Timer.js:21` *and* again in the Shuckie branch (`:140`) | "…4x game speed", `genericLabels timerLabel`, titan 14px (`:1181`) | "…4x game speed", `timerLabel` (`:980`) |
| **Clock markup** | `left_panel/timer.vue` (PubSub `@timer/update`) | two `live-text` pairs (`:38-45`) | Shuckie `live-text` pair + `<timer>` child (`:139-146`) | two `live-text` pairs (`:74-82`) | Shuckie `live-text` pair + `<timer>` child (`:56-62`); `components/ShuckieTimer.js` registered but its use is commented out (`:55`, 69 dead lines) |
| Clock box | fixed 380px `.gametime` box, text right-aligned inside (`gen1/style.css:1724`) | same (`gen2/style.css:456`, duplicated at `:3015`) | right-anchored `right: 1627px`, no width (`gen3/style.css:855`) | `right: 1550px`, no width (`gen4/style.css:641`) | same as gen4 (`gen5/style.css:578`) |
| Clock fonts | `oseb` = OpenSans-ExtraBold.ttf | same | `oseb` = OpenSans-ExtraBold-**gen345**.ttf | same as gen3 | same as gen3 |
| **Faults box, 0/0** | label "faults" | "faults" | "faults" | "faults" | **"resets"** (`:983-988`) |
| Faults, 1 reset & 0 blackouts, Shuckie counters on | single box "resets" | single | single | single | **double box "resets 1 / blackouts 0"** (`:1008-1016`, `dsPairMixin.ts:442`) |
| Faults value | oseb 75px, **shrinks to 65/44px at 3/4+ digits** (`faults.vue:115-124`) | oseb 75px, no shrink | oseb 68px | oseb 68px | oseb 68px |
| Faults branches | one | Shuckie and local copies of the whole block (`:997-1046`) | same duplication (`:64-117`) | one block, `v-if` per value (`:46-72`) | different logic again (`:982-1031`); extra `resetCounter` hide toggle |
| **Badge row** | `badges.webp` backdrop, 8 badges, fade in, hidden at "No Pokemon" (`badges.vue`) | Johto/Kanto backdrops, fade in, hidden in "Base Stats" state (`:485-496`) | region backdrop, **no fade**, hidden in "Base Stats" (`:130-137`) | Sinnoh/Johto/Kanto, **no fade**, hidden at No Pokemon or `global_pointer` 0 (`:613-635`) | B/W and B2/W2 sets, fade in (`:573-582`) |
| Badge stat boosts | always shown (`badge_boosts.vue`) | toggle `display_badge_boosts` | toggle | — (game: no badge boosts from gen4) | — (game) |
| **Species art** | `pokemon_art` (Yellow) / `pokemon_art2` (R/B, no rotation) (`graphics.vue:11-40`) | no rotation (`:14-24`) | rotation; Ditto/Castform/Deoxys branches (`:13-42`) | rotation, cross-fades on species change (`:15-27`) | same as gen4 (`:16`) |
| Art filter | 6× `drop-shadow(0 0 .4px)` + offset shadow, inline, copied 7 times across the five overlays | same | same ×2 | same | same |
| Pokéball floor | inline `top:-160px` | `.pokeball` + per-species X/Y sliders (only gen2) | inline `top:30px`, file `gen3/elements/overlay/gen1&2/pokeball.webp` | plain | plain |
| **Type badges** | `images/elements/types`, in battle falls back to species types when battle types unreadable (`type_icons.vue:30`) | 2024/legacy icon switch, hidden at run end | same switch, `id="monoType"/"type1"/"type2"` | switch; **not hidden at run end**; no fallback, shows "???" (`:557-560`, screenshot `gen4-platinum-smoke/0004`) | switch, hidden at run end, no fallback |
| **Level header** | play 28px | play 700 26px | play 700 32px | play 32px | play 32px |
| Header text per mode | "Gen1 Average Stats", "<starter>'s DVs", "Stat Experience" | "DVs", "Hidden Power <type>", "Stat Experience" | "Averages", "Medians", "EVs (Lv:N)", "Detailed EVs" | "Gen4 Base Stat Averages", "EVs" | "Gen5 Base Stat Averages", "EVs" |
| **Exp label** | always "Exp:" | "Exp:" in Base Stats, else **"NN%"** (`:520-521`) | **"NN%"** (`:1047-1052`) | always "Exp:" | always "Exp:" |
| Growth-rate text | in bar | in bar | in bar | in bar | in bar |
| **Nature / Friendship** | — (game) | — (game) | "Nature:" + "Friendship: n/255"; EV modes: **"EVs: n/510"** (`:849-853`) | "Nature:" + "Friendship:"; Base Stats/IVs/EVs modes: **"Total:"** (`:566-587`) | same as gen4 (`:523-544`) |
| **Stat tiles** labels/values | Play-Bold 30px / 56px | Play-Bold 24 / 56 | Play-Bold 24 / **50** | Play-Bold 24 / 56 | same as gen4 |
| Stage modifier, value null | " " | " " | "" | "" | **"nu"** (`:6646`) |
| Spc. + crit rate | single Spc. + crit rate (game quirk, keep) | SpA./SpD. | | | |
| **Move list place** | inside left panel (fits the 10:9 GB game area) | same | bottom bar 2×2 (3:2 GBA area) | bottom bar (4:3 DS area) | bottom bar |
| Move headers | `moves pwr. acc. pp`, Play-Bold 14px, .72 | same, plus `dmg. range` mode (`:901-910`) | `type move pwr. acc. pp` ×2, 17px | **`Type Move Pwr. DC Acc. PP`** ×2, 15px, .9 | same as gen4 |
| DC column | — | — | — (game: no per-move split in gen3) | yes | yes |
| Accuracy text | **"100 %"** (space: `move_set.vue:30-31`) | "55%" | "100%" | "100%" | "100%" |
| Struggle row (out of PP) | yes, Normal icon, computed power | — | yes, power hard-coded 50, "???" icon (`:991-1004`) | — | — |
| Move markup | `v-for` | `v-for`, but every cell rendered twice (battle + overworld `v-show`) | 5 branches (Wally, Struggle×2, Ditto, normal) | **4 hand-copied tables** (`:640-719`) | 4 hand-copied tables (`:585-665`) |
| **Ability / Held Item** | — (game) | "Held Item:" only (game: no abilities) (`:1050`) | `abilityHeldItemLabelStyle` labels (`:60-61`) | labels inline-positioned `top:813px;left:496px` (`:1174-1177`) | inline `top:817px;left:507px`, chevron boxes (`:973-976`) |
| **Accuracy / evasion pop-ups** | "accuracy" / "evasion", lowercase, no colon, **value signed "+1"** (`pop_ups.vue`) | "Accuracy:" / "Evasion:" (`:942`, `:982`) | "Accuracy:" / "Evasion:" (`:1645`, `:1653`) | "accuracy:" / "evasion:"; empty boxes when the value is unreadable (`:1152-1162`, screenshots 0004/0009) | "accuracy:" / "evasion:" (`:951-962`) |
| Screens / field pop-up | "Reflect"/"Light Screen"/"Both", no turns (game: gen1 screens have no timer) | "Field: <effect>: <turns>" | "Field: …" | — | — |
| **Repel counter** | "repel steps", own box (`repel_counter.vue`) | "repel steps", own box, inside the `battlePopUps` gate (`:963`) | **"Repel Steps:"**, reuses the accuracy box (`:1667-1675`) | — | — |
| Bonk / item counter | "bonks" / "item count" (STP patch only) | "bonks" | — (patch quirk) | — | — |
| Duplicated full-canvas layer | — | — | — | `ui/moveset.svg` drawn twice (`:30-31`) | `ui/stats.svg` drawn twice (`:44-45`) |

**Not drift (keep):** the panel tint follows each species' `overlay_color` in every generation; the type-badge and
box art are per-generation pictures (gen5's flame-textured pills and chevron Ability/Held Item boxes are the B/W
look); the left panel's width (≈390 / 355 / 435 px) follows from the console's screen shape (GB 10:9, GBA 3:2, DS
4:3) that sizes the game area; gen1/2 have no abilities, natures or held-item-plus-ability row; gen1's single Spc.
and crit rate; DC only from gen4; badge boosts only gen1–3; bonks only on the STP gen1/2 patch.

**Fixture notes (not overlay bugs):** gen5's "0908:00:17.53" clock is the gen5 smoke fixture running with no timer
start (storage holds `"time": "490908:00:16"`, hours since 1970), identical in `legacy_gen5@37`. gen4's battle
captures show NaN stats, a "???" type and an empty move bar because that fixture carries no player battle data, so
the harness cannot check gen4's player side in battle.

## Findings

### C1 One faults box, and gen5's two faults bugs
- Now: five implementations of the same box. gen1 `left_panel/faults.vue:2-30`; gen2 `:912-924` + `:995-1046`
  (Shuckie and local copies of every branch); gen3 `:63-117` (same duplication); gen4 `:45-72`; gen5 `:30-36` +
  `:982-1031`. The mode (None/Resets/Blackouts/Both) is computed by `blackouts_resets()` in gen2/3/4 (byte-identical
  apart from position), by gen1's `top_left_ui_selector`, and inline in gen5's template plus `shuckie_faults_check`
  (`dsPairMixin.ts:442`). Two gen5 differences: at zero it says "resets" where every other generation says
  "faults"; with Super Shuckie counters it switches to the two-box layout as soon as *either* counter is above
  zero, while its own local mode (and gens 1–4 in both modes) wait for *both*. Only gen1 shrinks the number for
  3- and 4-digit counts (`faults.vue:115-124`); the others overflow the 128–150px box.
- Proposal: `core/overlay/player/FaultsBox.vue` with props `resets`, `blackouts`, `frameSingle/frameDouble` (SVG
  urls), and a per-generation `classes` map (gen1/2: `faults_style resets_1 …`; gen3/4: `faults_value
  timer_reset_value …`; gen5: `resets resets_2 resets_3 …`) so every existing class and id (`reset_counter`,
  `reset_counter_single`, `blackout_counter`) stays on its element. A pure `faultMode(resets, blackouts)` in
  `core/logic/` replaces the four mode functions. Each overlay passes `shuckie_counters ? (shuckie_x ?? 0) : x`
  once. gen1 keeps its run logic (PubSub, markers) in `faults.vue`'s script or `games/gen1/hooks.ts`; only the
  markup moves. Target look: gen1–4's rules ("faults" at zero, double box only when both > 0) plus gen1's
  digit shrink everywhere.
- Wins: one behaviour; ~235 template lines today → ~60-line component + 5 short call sites (≈ −135 lines, counted
  from the ranges above). The gen5 Shuckie mismatch (two-box frame with the wrong text) goes away.
- Visibility: on-stream.
- Risks: the classes/ids above must stay exactly where they are (the harness's layout oracle reads them). The gen5
  label and Shuckie behaviour change are visible; log both in `docs/known-legacy-bugs.md`. Do the move (no visual
  change) and the gen5 fix in separate commits.
- Size: M
- Needs Scott's call: yes — "Should gen5 say 'faults' at zero and use the double box only when both counters are
  above zero, like gens 1–4? Should every generation shrink a 3-digit faults count like gen1 does?"

### C2 Timer caption and clock markup
- Now: two spellings of the caption ("4x game speed" gen1/4/5, "4x game-speed" gen2/3), four classes for it
  (`timerLabel` in gen1/4/5, `timerTitle` in gen2/3), gen3 prints it twice (inside `components/Timer.js:21` and
  again in its Shuckie branch `:140`). Clock markup comes in three shapes: gen1's `timer.vue` (93 lines), gen2/4's
  `live-text` pairs, gen3/5's `Timer.js` child (two copies, identical except the caption line) + a `live-text`
  Shuckie pair. gen5's `components/ShuckieTimer.js` (69 lines) is registered and never rendered. gen1/2 put the
  digits in a fixed 380px box; gen3–5 anchor them on the right with no width, so a clock over 99 h runs off the
  panel (only seen with the gen5 fixture's missing start time, see Fixture notes).
- Proposal: one caption, "time played at 4x game speed" (three of five already), as data. A
  `core/overlay/player/GameClock.vue` that renders the caption, the two clock lines (as `live-text` with `frozen`),
  and `<clock-frame :gen>`, fed by each generation's existing `liveText` sources; gen1 provides its `timer.vue`
  values the same way. Keep `gametime`, `gametimeClock`, `gametimeFrames`, `timerLabel`/`timerTitle` on the same
  elements (pass the caption class per generation). Delete `gen5/components/ShuckieTimer.js` and, once gen3/5 feed
  `live-text`, both `Timer.js` components.
- Wins: caption uniform; ≈ −200 lines (timer.vue 93, two Timer.js 52 each, ShuckieTimer 69, offset by a ~50-line
  component). No performance change (the clock already runs out of process).
- Visibility: on-stream (caption text only; the clock itself is unchanged).
- Risks: `src/main/timer-frame.html` copies each generation's `.gametime*` geometry, so geometry must not move.
  gen3/5's `Timer.js` subscribes to PubSub `time_update` — the replacement source must publish the same text.
- Size: S for the caption + dead file; M for the shared component.
- Needs Scott's call: yes — "OK to make every caption read 'time played at 4x game speed' (no hyphen)?"

### C3 Player move list: headers, columns, Struggle, and gen2's double evaluation
- Now: headers `moves pwr. acc. pp` (gen1/2, lowercase 14px), `type move pwr. acc. pp` (gen3, lowercase 17px,
  "move" singular), `Type Move Pwr. DC Acc. PP` (gen4/5, Title Case 15px, opacity .9). The right-panel movepool on
  the same screen is Title Case in all five ("Way Move Type Pwr. Acc. PP"). gen1 prints "100 %" (template line
  break before the `%` span, `move_set.vue:30-31`); the others "100%". Struggle (all PP gone) shows only in gen1
  and gen3, and gen3 hard-codes power 50 with the "???" icon (`:991-1004`). gen4 and gen5 hand-copy the same row
  table four times (`gen4 :640-719`, `gen5 :585-665`). gen2 renders every cell twice, a battle copy and an
  overworld copy toggled with `v-show` (`:557-592`), so both copies are computed on every render.
- Proposal: column headers in Title Case like the movepool, short forms kept (`Move Pwr. Acc. PP`; `Type` where
  there is a type column; `DC` gen4/5 only). Box captions stay lowercase (C4). One
  `core/overlay/player/MoveRow.vue` (icon, name, power, optional category icon, accuracy, PP) used through `v-for`
  in every generation, with a per-generation class map (`movesetStyling moveStyling move1` in gen1,
  `movesetName/movesetPower/…` in gen2, `moveStyle move1 / move1power / move1acc / move1pp / move1icon` in gen3,
  `g4mp_*` in gen4/5). Positions stay in each `style.css`. Each overlay computes its four rows once (a computed
  `playerMoveRows`) instead of in the template. Struggle: show it in every generation, with each game's real
  power/type (gen2–4 Struggle is typeless in the decomps' battle engine: check `pokecrystal`/`pokeemerald`/
  `pokeplatinum` before choosing the icon).
- Wins: one header style and one row format; ≈ −220 lines (320 template lines today across the five → ~50-line
  component + call sites). Performance: gen2 today calls `typeEffectiveness` 4× per move per render (two `v-show`
  copies, each with a `:key` call and a content call: 16 per render), and with damage ranges on calls
  `damage_calculation` (221 lines) 4× per move (16 full damage calculations per render), plus
  `moveAccuracyEvasionDynamic` twice per move; gen4/5 `typeEffectiveness` (287/350 lines) 4× per render. In a
  child with a computed row list these run only when a move, PP, the enemy or a modifier changes, not on every
  re-render of the 1,000-line template (enemy HP, splits, settings…).
- Visibility: on-stream (headers, "%", Struggle); the gen4/5 `v-for` and gen2 single evaluation are invisible.
- Risks: the `:key="typeEffectiveness(...)"` in gen1/gen2 makes the power cell re-create (and re-animate, if any
  CSS transition) when the power changes; keep the key. gen4/5 `typeEffectiveness` and gen2's `get_stat` write
  `data()` while rendering (ARCHITECTURE §5 render trap); moving them into a computed changes *when* those writes
  happen — harness diff on a recording that leaves a battle. Struggle in gen2/4/5 is new on-stream behaviour.
- Size: M (gen4/5 `v-for` and gen2 de-duplication alone: S)
- Needs Scott's call: yes — "Title Case column headers everywhere (like the movepool), and show the Struggle row
  in every generation?"

### C4 Battle pop-ups and the repel counter
- Now: captions "accuracy"/"evasion" (gen1), "Accuracy:"/"Evasion:"/"Field:" (gen2/3), "accuracy:"/"evasion:"
  (gen4/5); values signed only in gen1 ("+1" vs "1"). The repel counter is "repel steps" in its own box in gen1/2
  but "Repel Steps:" in gen3, borrowing the accuracy box and slot (`:1667-1675`, inline `font-size:14px`); gen3's
  "Vs. Seeker:" borrows the evasion box. gen2 nests bonk and repel inside the `battlePopUps` gate (`:937`), so
  turning battle pop-ups off also hides the overworld counters. gen4 shows empty accuracy/evasion boxes when the
  modifier is unreadable (`!= 0` is true for null; screenshots `gen4-platinum-smoke/0004`, `/0009`); gen1 and gen5
  read through a guard.
- Proposal: `core/overlay/player/PopupBox.vue` (frame SVG, caption, value, classes) used for accuracy, evasion,
  field, repel, bonks, Vs. Seeker. Captions lowercase without a colon, like every other box caption on the panel
  ("faults", "repel steps", "time played…"); values signed (`formatStage` from C5); shown only when the value is a
  number other than 0. Repel/bonk visibility follows their own toggles, not `battlePopUps`.
- Wins: one caption style; ≈ −120 lines (≈210 today); fixes gen4's empty boxes.
- Visibility: on-stream.
- Risks: gen3's repel/Vs. Seeker keep the `accuracyLabel`/`evasionLabel` classes they use today (renaming is not
  allowed; a new box needs new art or reuse is kept). gen2's gate change is a behaviour change (log it).
- Size: M
- Needs Scott's call: yes — "Lowercase captions with no colon ('accuracy', 'repel steps') and '+1'-style values in
  every generation? Should gen2's repel/bonk counters stay visible when battle pop-ups are off?"

### C5 Stat tiles: header text, stage format, fonts, and per-tile recomputation
- Now: the tiles look alike (same Play-Bold face — gen1/3 call it `osb`, gen2/4/5 `play`), but sizes drift: labels
  30px in gen1 vs 24px elsewhere (`gen1/style.css:598`), values 50px in gen3 vs 56px elsewhere
  (`gen3/style.css:1937`). The header names the same mode differently ("Gen1 Average Stats" / "Averages" /
  "Gen4 Base Stat Averages"; "<starter>'s DVs" / "DVs"; "EVs (Lv:N)" / "EVs"). The stage modifier formatter is
  five copies (gen1 `stats.vue:336`, gen2 `:5151`, gen3 `:6691`, gen4 `:6563`, gen5 `:6644`); gen5
  prints **"nu"** when the value is null (a leftover debug string, visible over a stat tile at battle start).
  Performance: gen4/5 call `get_stat()` once per tile (it builds all six stats each time and writes
  `stat_fix_*`), and `statLabelOpacity()` once per tile (an object built from five mapper reads) — six of each per
  render, inside the 1,000-line template.
- Proposal: `core/logic/statFormat.ts` with `formatStage(v)` (null → "", 0 → "", >0 → "+n") used by all five; a
  `statsHeader(mode, ctx)` table with one naming scheme ("Base Stat Averages", "Base Stat Medians", "DVs"/"IVs",
  "EVs"/"Stat Experience" as the game calls it); a `core/overlay/player/StatTiles.vue` driven by each generation's
  existing `stat_object` array (already data in all five) that computes the six values and opacities once. Font
  sizes from one shared rule (24px labels / 56px values, gen1's 30px label is the odd one).
- Wins: removes "nu"; uniform headers; the per-tile calls drop to one computed per change. Lines: ≈ −100 (the
  mode-specific cells differ most, so savings are smaller here).
- Visibility: on-stream.
- Risks: `get_stat` writes data during render (known; ARCHITECTURE §5) — making it a computed needs a harness run
  on a recording that leaves a battle. Header text is in the pixel oracle. The "nu" fix is a code quirk: log it.
- Size: S for `formatStage` + "nu"; L for the shared tiles.
- Needs Scott's call: yes — "One naming for the stats header modes (which wording?), and 24px labels / 56px values
  everywhere?" (The "nu" fix needs no call beyond the usual known-legacy-bugs entry.)

### C6 Exp bar: label, five copies of the curve tables and the animation
- Now: label "Exp:" (gen1, gen4, gen5, gen2 in Base Stats/2023 style) vs a live "NN%" (gen2 2024 style, gen3).
  `calcExpStats` and its six growth tables exist five times (gen1 `exp_bar.vue:54`, gen2 `:4609`, gen3 `:6799`,
  gen4 `:6637`, gen5 `:6718`), with two spellings of the growth-rate names; the level-up animation on
  `expPoints.change` is copied five times too. gen3's template calls `calcExpStats` on every render, which
  allocates the full 6×101 table each time; gen2's version writes `this.exp_table[…][100]` while rendering (a
  render-time write to data the template reads; only the first write changes anything).
- Proposal: `core/logic/expCurve.ts` (tables once, both name spellings accepted, `levelAndPercent(rate, exp)`),
  and `core/overlay/player/ExpBar.vue` holding the animation, keeping `id="exp-bar"` / `ref="expBar"` /
  `expMeterOuter`/`expMeterInner`/`exp_label*` classes. Label: one choice for all five.
- Wins: ≈ −280 lines (tables ~25 lines ×5, animation ~50 ×5); no per-render table allocation in gen3.
- Visibility: on-stream (only if the label changes); the move itself is invisible.
- Risks: gen3's `expBarAnimation` off path sets width from a style binding; keep both paths. The animation's
  timings feed the pixel oracle at level-ups — move verbatim first.
- Size: M
- Needs Scott's call: yes — "Show the exp percentage ('37%') or the word 'Exp:' in front of the bar in every
  generation?"

### C7 Badge row
- Now: gen1/2/5 fade a new badge in; gen3/4 pop it in (`v-if` with no transition, `:133-137`, `:630-635`). When the
  row hides differs: "No Pokemon" (gen1, gen5), the overlay's "Base Stats" state (gen2, gen3), "No Pokemon" or a
  zero global pointer (gen4). gen4 builds the HG/SS rows three times over (`:613-627`).
- Proposal: `core/overlay/player/BadgeRow.vue`: backdrop image + list `{owned, src}` + one fade; the generation
  supplies the list (Johto/Kanto, Sinnoh, B/W vs B2/W2, gen3 region) and one "hidden" boolean.
- Wins: same fade everywhere; ≈ −45 lines.
- Visibility: on-stream (gen3/4 gain the fade).
- Risks: `badge` / `canvas` classes stay. A fade adds frames where a badge is half-visible at a split
  screenshot — the harness's pixel checkpoint at a `badges` change will differ in gen3/4 (expected).
- Size: S
- Needs Scott's call: yes — "Fade new badges in for gen3 and gen4 too?"

### C8 Species art, Pokéball floor and type badges
- Now: the same 7-shadow filter string is pasted 7 times (gen1 ×2, gen2, gen3 ×2, gen4, gen5) as an inline style
  rebuilt on each render. Rotation exists in gen1-Yellow/3/4/5 but not gen1-R/B or gen2; only gen2 has Pokéball
  X/Y sliders; only gen4/5 cross-fade art on a species change (gen3 only for Castform). Type badges: gen4/5 call
  `getSoloMonType` 4–5× per render and, in battle, show whatever the battle structure holds ("???" at battle
  start in the fixture) where gen1 falls back to the species' types; gen4 keeps the badges after a run ends while
  gen2/3/5 hide them (`gen4 :557` has no `!run_complete`).
- Proposal: `core/overlay/player/SpeciesArt.vue` (src + the existing per-species offset/scale/flip/rotation/
  saturation values; one filter in a shared CSS class; cross-fade keyed on species) and
  `core/overlay/player/TypeBadges.vue` (two srcs). A `soloTypes()` helper with gen1's fallback rule. Keep
  `pokemon_art`, `pokemon_art2`, `ref="pokemon_art"`, `pokemon_offsets`, `type_icons`, `typeIconContainer`, and
  gen3's `#monoType/#type1/#type2` on their elements.
- Wins: ≈ −70 lines; type-badge calls drop to one computed; the filter string is no longer re-diffed every
  render. Whether the 7 chained shadows cost GPU time per frame is unmeasured (performance-followups §G); one
  merged shadow would be cheaper but changes pixels.
- Visibility: on-stream (cross-fade in gen1–3, types fallback, gen4 run-end hide).
- Risks: rotation/Pokéball sliders are saved per-species settings — adding rotation to gen2 must default to 0.
- Size: M
- Needs Scott's call: yes — "Cross-fade the art on species change in every generation, and hide the type badges
  at run end in gen4 too?"

### C9 Nature / Friendship and Ability / Held Item boxes
- Now: gen3 shows "EVs: n/510" in EV modes and Friendship otherwise; gen4/5 show "Total:" (base-stat total, IV
  total, EV total) in Base Stats/IVs/EVs modes. gen4/5 position the Ability/Held Item captions with inline styles
  (`top:813px;left:496px` / `top:817px;left:507px`, `font-family: play`) where gen3 uses classes.
- Proposal: adopt gen4/5's "Total:" rule in gen3 (more useful, same box); a small `InfoRow.vue` (label + value +
  class) for Nature, Friendship/Total, Ability, Held Item (and gen2's Held Item), positions in CSS, not inline.
- Wins: one rule; ≈ −40 lines; inline styles out of the template.
- Visibility: on-stream (gen3 only).
- Risks: keep `labelFriendship`, `friendship`, `friendship_label/value`, `nature_label/value`, `labelAbility`,
  `ability`, `heldItem` on their elements.
- Size: S
- Needs Scott's call: yes — "Should gen3 show 'Total:' in Base Stats/IVs/EVs modes like gen4/5?"

### C10 Doubled full-canvas panel layers (gen4, gen5)
- Now: gen4 paints `ui/moveset.svg` twice (`:30-31`), gen5 paints `ui/stats.svg` twice (`:44-45`). Each is a
  1920×1080 masked, tinted layer with a `drop-shadow` filter.
- Proposal: drop the second copy (or, if the darker edge is wanted, double the shadow in CSS on one layer).
- Wins: one fewer full-screen filtered layer each; likely invisible apart from a slightly lighter shadow edge.
- Visibility: on-stream (sub-pixel shadow strength).
- Risks: pixel oracle will differ around those panel edges (expected).
- Size: S
- Needs Scott's call: yes — "Remove the duplicate panel layer in gen4/gen5 if the shadow difference is invisible to
  you on a side-by-side?"

### Adjacent (for the CSS / dead-code audits)
- `gen2/style.css` is roughly two copies of the legacy file (font faces at `:17` and `:2611`; identical
  `.gametime*`, `.statsheader`, `.stats_header`, `.stat_value_style` blocks at `:456/:3015`, `:1136/:3680`,
  `:1151/:3695`, `:2536/:5141`). The file says "re-run the tool", so dedupe in the port tool.
- gen4/5 declare `font-family: osb` in 46 rules but their `@font-face` for `osb` is commented out (as in legacy);
  nearly all those selectors are unused by the templates (`statsColumn*`, `label{Hp,Atk,…}`, `moveStyle`…), so
  they are dead CSS rather than wrong fonts.
- The faults/timer digits use two different ExtraBold files (gen1/2 `OpenSans-ExtraBold.ttf`, gen3–5
  `OpenSans-ExtraBold-gen345.ttf`); unifying the file is a visible change for Scott to judge side by side.

## How to build it once
Put the pieces in `src/renderer/core/overlay/player/` (components) and `core/logic/` (pure helpers), each fed by a
per-generation data file (e.g. `games/genN/playerPanel.ts`: class maps, asset paths, captions). No
`if (gen === …)` in core (Phase 6 rule). Land each piece in all five generations in one slice, as Phase 6 §5
asks: first a pure move with a zero-diff harness run, then a separate "uniformity" commit with the visible change
Scott approved, logged in `docs/known-legacy-bugs.md`. gen1's `left_panel/*.vue` become thin wrappers or are
replaced by the shared components; their run logic (PubSub, markers) stays gen1's.

## Quick wins
1. **C5 "nu" + shared `formatStage`** (S): removes a visible junk string from gen5 and five formatter copies.
2. **C1 faults box** (M): one component, fixes gen5's "resets"-at-zero and its Shuckie two-box mismatch.
3. **C3 gen4/5 move rows as `v-for` + gen2's single evaluation** (S, no visible change): ≈ −110 lines, and gen2 stops
   running 16 power (or 16 damage) calculations per render.
4. **C2 caption + delete `gen5/components/ShuckieTimer.js`** (S).
5. **C10 doubled panel layers** (S).
6. **C6 exp tables in `core/logic/expCurve.ts`** (M, invisible): ≈ −125 lines of identical game data.
