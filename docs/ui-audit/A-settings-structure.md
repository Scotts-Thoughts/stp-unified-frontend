# A. Settings panel: structure, content and wording audit

> Snapshot of the 2026-10-14 UI audit (read-only, against the working tree of that day). Line numbers drift as
> the work in `docs/ui-uniformity-plan.md` lands; re-check any `file:line` before relying on it. Mark a finding
> done in the plan, not here.

Scope: the operator settings panel (the green area in the middle) in all five generations. It covers the columns,
the groups, the order of controls, labels, control types, and the "Show Advanced Settings" gate. It does not cover
how a button or checkbox is styled (area B). Everything here is **operator-only**: OBS captures the window, but the
panel is Scott's working area and not part of any video series' look. Where a change touches something viewers see
(for example the Stat Arrangement dropdown, which moves on-stream stats), that is called out.

Sources: the code as of 2026-10-14 (gen1 `src/renderer/components/settings/*.vue`, composed in
`components/game_area.vue`; gen2–5 the `DEBUGGING` / `ui1..ui5` section of `games/genN/Overlay.vue`). The
screenshots in `tools/baselines/unified/*/0002|0003*/screen.png` are a month old (no Keyboard Shortcuts button,
older button text), so the code wins wherever they differ.

Size of what's being unified (template lines only): gen1 420 (8 files), gen2 430 (`Overlay.vue:54-483`), gen3 685
(`:150-834`), gen4 461 (`:93-553`), gen5 420 (`:66-485`). About **2,400 lines** in total, plus about 1,100 lines of
`games/genN/actions.ts` that list the same controls again for the Keyboard Shortcuts window.

## Inventory

`file:line` refs are to `games/genN/Overlay.vue` for gen2–5 and to `components/settings/` for gen1.
"adv" = shown only with Show Advanced Settings ticked. "dev" = development builds only.

### Panel shape

| | gen1 | gen2 | gen3 | gen4 | gen5 |
|---|---|---|---|---|---|
| Column containers | 4: `.testingArea1/2/4` boxed (250/250/580 px), `.testingArea3` drawn on top of the right half of `.testingArea4` (`game_area.vue`, `gen1/style.css:523-582`) | 4 unboxed `.debugging1..4` (320/320/320/240 px); `debugging3` (1100+320) overlaps `debugging4` (starts at 1380). The rules appear twice in `gen2/style.css` (`:522-550` and `:3072-3095`) | 5 unboxed `.ui1..ui5` (280/350/220/220 px). `ui5` is an absolutely placed 470×250 box over the bottom of ui3/ui4 that only ever holds the Deoxys form (`:823-834`) | 3 unboxed `.ui1..3` (350/320/435 px); ui1 (462+350) overlaps ui2 (772) by 40 px | same as gen4 |
| What each column holds | 1 game, timer, Shuckie, folders, dev · 2 solo, New Run, splits, counters, encounters, DVs · 3 style · 4 display | 1 game, run, timer, advanced, folders, editor, debug · 2 solo, splits, counters, gender/DVs, encounters, readouts · 3 display + style · 4 Rare Candy tracker | 1 game, advanced, timer, folders, EVs/editor/debug · 2 solo, splits, counters, Pokémon setup, encounters · 3 style + Unobtainable · 4 display · 5 Deoxys | 1 game, run, timer, advanced, folders, style tools, editor, readouts, debug · 2 solo, splits, counters, Pokémon setup, encounters · 3 display + style | same as gen4 |
| Whole-panel gate | none | none | `v-if="gamestate == true"` (`:151`); `gamestate` is a stored flag with no control anywhere (`:1988`), so it's a dead gate | none | none |
| Label casing | as typed | as typed | forced Title Case (`text-transform: capitalize`, `gen3/style.css:2188-2197`) | forced Title Case (`gen4/style.css:243+`) | forced Title Case |
| Empty space (screenshots) | col 1 is two-thirds empty | col 4 only Candies | col 4 three-quarters empty; ui5 usually empty | bottom of col 1/3 | col 1 filled by the Debugging block |

### Run, timer, splits, counters

| Control | gen1 | gen2 | gen3 | gen4 | gen5 |
|---|---|---|---|---|---|
| Game picker | dropdown `Game:` (`interface_1.vue:2`) | dropdown `Game:` (`:56-60`) | box-art row (`:153-156`) | box-art row (`:95-98`) | box-art row (`:68-71`) |
| New Run | col 2, top of `metrics.vue:3` | col 1, under Game (`:62`) | col 1, *inside* the "Timer:" group (`:226`) | col 1 (`:100`) | col 1 (`:72`) |
| Timer header | `Timer Setting:` | `Timer:` | `Timer:` | none | none |
| Play/Pause button text | `Play/Pause` | **`Pause/Resume`** (`:64`) | `Play/Pause` (two buttons, by Shuckie timer) | `Play/Pause` | `Play/Pause` |
| Set Timer + offset | `Set Timer` + inline input, no label, no Clear (`interface_1.vue:11-12`) | `Set Timer` + 210 px input, no label, no Clear (`:65`) | `Set Timer`, then `Start Time Offset:` + input + **Clear** (`:236-239`) | same as gen3 (`:103-109`) | `Set Timer`, bare 280 px input, no label, no Clear (`:75-79`) |
| Timer-stop option (game-specific) | — | — | `Stop Timer After League Rematches:` (FRLG, `:222`) | — | `Stop timer after N dialogue:` (adv, `:93`) |
| Open Splits Folder / Keyboard Shortcuts | col 1 | col 1 | col 1, under a `Splits:` header (`:241`) | col 1 | col 1 |
| Load comparison | **two buttons that do the same thing**: `Load replay / split file` (`metrics.vue:5`) and `Load replay / split file to compare` (`interface_4.vue:31`); both call `loadSplitComparison()` | `Load replay / split file to compare` (`:213`) | same (`:388`) | same (`:246`) | same (`:213`) |
| "Comparing against: X" | under the col-4 button only | yes | yes | yes | yes |
| Clear loaded splits | — | — | — | — | yes (`:215`) |
| Previous / Current labels | inputs (`metrics.vue:9-16`) | inputs (`:216-224`) | stored and shown on stream (`:1498-1500`, `:2151`), **no input** | — | — |
| Compare-splits mode | `Compare splits::` (double colon), First / Followup / Followup + Summary, col 4 (`interface_4.vue:24`) | `Splits:` same three, col 3 (`:391`) | `Splits:` First / Followup, **adv** (`:766`) | `Split Type:` First / Followup (`:513`) | `Splits:` **Followup / First** (reversed order), adv (`:426`) |
| Post-battle splits | `Automatic post-battle splits:` col 4 | `Post-Battle Splits:` adv col 1 | `Post-Battle Splits:` adv col 4 | `Automatic Post Battle Splits:` col 1, always | `Automatic Post Battle Splits:` adv, hidden in Second Screen Mode |
| Counter labels | `Attempt:` / `Finished Runs:` / `Resets:` / `Blackouts:` / `Faults:` | `Attempt Number:` / `Finish Number:` / … | same as gen2 | same as gen2 | same as gen2 |
| Counter markup | +/- in one cell, both `smallButtonStyle` | +/- in separate cells, minus is `smallButtonStyle2` | as gen2 | as gen2 | as gen2 |
| Count blackouts toggle | `Blackouts?:` (`interface_4.vue:37`) | — | — | — | — |

### Advanced, Shuckie, testing, debugging

| Control | gen1 | gen2 | gen3 | gen4 | gen5 |
|---|---|---|---|---|---|
| `Show Advanced Settings` | — (dev-only blocks use `IS_RELEASE` instead) | inside `v-if="release == false"`, but `release` is hard-coded `false` (`:66`, `:1207`) | always (`:160`) | always (`:112`) | always (`:81`) |
| Super Shuckie Timer/Counters/Bookmarks | own `Super Shuckie:` group, always shown (`interface_1.vue:14-21`) | adv, with colons | adv, with colons | adv, **no colons** (`Shuckie Timer`) | adv, no colons |
| HP banned for 1st run | — (no Hidden Power in gen1, game quirk) | **— (gen2 has HP: missing, not a quirk)** | always (`:164`) | always (`:113`) | **adv** (`:82`) |
| Test run | `Test run:` dev | `Test Run:` adv | commented out | commented out | commented out |
| Re-filming mode + attempt/finish inputs | `Refilming mode:` + `Attempt:`/`Finish:` dev | `Re-filming Mode:` + `Attempt Number:`/`Finish Number:` adv | — | commented out | commented out |
| Don't-count switch | `No attempt/split:` dev | `No increment:` adv (different body: gen2 skips the reset and attempt increments, gen1 returns early from new-run) | — | — | — |
| Debugging switch | — (dev-only block) | `Debugging:` adv | `Debugging:` adv | `Debugging-Mode:` adv | `Debugging-Mode:` adv |
| Debugging readout block | dev, `Debugging:` (`interface_1.vue:53-70`) | adv + debugging + not editor (`:183`) | `v-show="debugging"`, **not** gated by adv (`:330`) | adv + debugging + not editor (`:222`) | debugging + not editor only. **`debugging_mode` defaults to true** (`:5308`), so it shows to everyone (visible in `gen5-black-smoke` screenshot with Advanced unticked) |
| Style Mode / Enemy Sprite Styles (dev tools) | rows in the dev table | rows, dev + adv + debugging | rows, dev + adv + debugging | inside a boxed "Style Settings" panel, adv + debugging (`:129-163`) | same as gen4 (`:103-137`) |
| Style Settings mgmt (Export / Reset current / Reset ALL) | — | commented out (`:118-136`) | commented out (`:248-266`) | adv + debugging, shown in packaged builds too | same as gen4 |
| Log Color Settings (console dump) | — | — | — | — | always, in the Style column (`:472`) |
| Pokémon editor switch | `Test run` shows `battle_testing.vue` | `Pokemon Editor:` checkbox (`:138`) | **button** `Show optimization UI` / `Close optimization UI` (`:267`) | `Pokemon Editor:` checkbox, bare text (`:165`) | `Pokemon Editor:` checkbox, bare text (`:139`) |
| Editor contents | moves (party/battle), 4 items | moves, items, DV-for-HP, recalculator with stat exp | moves ("Set moves in the Overworld" / "…while in Battle"), "Top 4 items", "Recalculate stats for nature" | moves, items (as gen1) | testing items, options, recalc, moves ("Update Moves"), held item, whose placeholder says **"Input move 1"** (`:152`) |
| Readouts in the panel | — | Return Base Power, Player Party Count, Overworld HP, Status, Stat Experience, always (`:328-361`) | EVs + total, always (hidden by the editor) (`:269-303`) | Party Count, Overworld HP, Status, EVs + benefit, always (`:187-221`) | same as gen4 (`:173-203`) |
| Second Screen Mode / Live HP | — | — | — | — | adv (`:91-92`) |
| gen2 backport importer | — | adv (`:102-116`) | — | — | — |

### Solo Pokémon setup (the species picker itself is out of scope)

| Control | gen1 | gen2 | gen3 | gen4 | gen5 |
|---|---|---|---|---|---|
| Set ROM Starter | button (`interface_2.vue:13`) | commented out | commented out | — | — |
| Evolution / family style / Unify Styles | — | — | yes (`:423-450`), plus `Allow post-Kanto evolutions` | yes | yes, no "Evolution Family Style:" header (commented out, `:253`) |
| Form picker | — (game quirk) | — | `Castform Form:` col 2 always; `Deoxys Form:` **adv, in ui5** | — (decision 28 enables forms later) | generic `<Species> Form:` and `<Species> Battle Form:` (`:263-278`) |
| DVs / IVs mode | `DVs:` Automatic/Manual (`dvs.vue`) | `DVs:` + `Hidden Power:` type, Gender + ratio (Automatic only) | `IVs:` + Hidden Power type + index | same as gen3 | same as gen3 |
| Ability / Gender | — / — (game quirk) | — / Gender (from Atk DV, game quirk) | `Abilities: (X has N)` / Gender from a list with placeholder | same, plus an `Ability: N` index line; Gender is literal Female/Male | same, `Ability: N` or `Hidden Ability`; Female/Male |
| Nature + grid | — (quirk) | — (quirk) | identical | identical | identical |
| RNG button | — | — | — | Platinum, **adv**, next to Catch Rate (`:377`) | White 2, always, under Nature (`:357-359`) |
| Show Tutor Moves | — | — (Crystal has tutors) | col 4 Toggles, always | **top of col 3, alone** (`:461-463`) | col 2 under Evolution, B2W2 + adv (`:250`) |

### Encounters

| Control | gen1 | gen2 | gen3 | gen4 | gen5 |
|---|---|---|---|---|---|
| Group header | `Encounter Settings:` | `Encounter Settings:` | `Encounters:` | `Encounters:` / `HM Encounters:` side by side | `Encounters:` / `HM Users:` side by side |
| Global switches | `Early Encounters:`, `No Moon:` | `Encounters:` (same flag as gen1's "Early Encounters") | — | — | — |
| Guaranteed catches | `Guaranteed Catches:` | `Guaranteed Catches:` | `Guarantee catches:` (always) | **`Catch Rate:`**, adv (`:375`) | — |
| Per-area list | — | — | `Route 101:` (with colons) | `Route 201` (no colons, 11 px) | `Route 1` (no colons, 11 px) |
| Forced HM-user list | three columns `Route 3` / `- Spearow:` / box | three columns, as gen1 | `Force HM Users:` (E) / **`Force Route 1 HM Users:`** (FRLG, but the list also has Route 24/25 and Route 6, `:588`), rows `Route 102 - Zigzagoon:` | `Route 201 - Bidoof` | **species only** (`Woobat`, no location) |
| Which game decides the list | mapper game name | n/a (one list) | the box-art selection | the mapper game name; D/P shows an **orphan `Encounters:` header with nothing under it** (`:437`) | the box-art selection |
| Lists are game data? | yes (Yellow vs R/B differ: patch quirk) | yes | yes | yes | yes |

### Display

| Control | gen1 | gen2 | gen3 | gen4 | gen5 |
|---|---|---|---|---|---|
| Stats dropdown label | `Stats:` | `Stats:` | `Stats:` (bare text) | **`Stat Display:`** | `Stat Display:` |
| Stats options (stored as the option text) | Automatic, Badge Boosts, Base Stats, DVs, EVs, Detailed EVs, **Averages, Medians**, Vitamins | Automatic, Badge Boosts, Base Stats, DVs, EVs, Vitamins, Detailed EVs (template also has "Hidden Power", only reachable by F13) | Automatic, Badge Boosts, Base Stats, Vitamins, IVs, EVs, Detailed EVs, **Base Stats Average, Base Stats Median**, Comparison, Evolution | Automatic, IVs, EVs, Vitamins, Base Stats, Average, Median (no Detailed EVs, though the template supports it, `:601`) | Automatic, IVs, EVs, Vitamins, Detailed EVs, Base Stats, Average, Median |
| Stat Arrangement | — | — (field exists, no control) | dropdown, but the default `"HP, Atk, Def, Spe, SpA, SpD"` (`:2340`) is not one of its two options, so it **shows blank** until picked (screenshot) | — (field exists) | — (field exists) |
| Right panel label | `Right Panel:` | `Right UI:` | `Right Panel:` (**adv**) | `Right UI:` | `Right UI:` (adv, hidden in Second Screen Mode) |
| Right panel options | Automatic, Movepool, Splits | Battle Graphic, Movepool, Splits, Trainers | Battle Graphic, Inventory, Movepool, Movepool+, Splits, Wild | Automatic, Splits, Movepool | Automatic, Splits (template also handles Movepool, `:892`) |
| Unobtainable Moves | — (`gen1/control.ts:14`: no such mode) | col 3 | col 3 (Style column) | col 3 | col 3, adv |
| Repel counter | `Show repel counter:` | `Show Repel Counter:` | `Repel Counter:` FRLG + adv | — | — |
| Bonk counter | `Show bonk/item counter:` + Bonks/Item Count mode | `Show Bonk Counter:` | — | — | — |
| Panel hotkeys | `Disable right panel hotkeys:` (does the opposite of its label, `docs/shortcuts-menu-plan.md` §6) | — | `Disable Panel Hotkeys:` adv (written, never read) | — | — |
| Wild battles | `Wild Pokemon:` dev, under `Graphics Toggles:` | — | `Show wild battles:` FRLG + adv | — | — |
| Other toggles | — | — | Automatic EVs, Show Battle Graphics, Show Inventory, Show Nature Arrows, **Badge Boosts** (a checkbox with the same name as a Stats option), Vs. Seeker (FRLG) — all adv; an empty `<tr>` (`:774`) | — | — |
| Trainer search | — | when Right UI = Trainers | — | dead: gated on `right_display == 'Trainer'`, whose control is commented out (`:484`) | dead, same (`:433`) |
| Game-only tracker | — | `Candies:` Rare Candy checklist (col 4, `:449`) | — | — | — |

### Style

| Control | gen1 | gen2 | gen3 | gen4 | gen5 |
|---|---|---|---|---|---|
| Column position | col 3 | col 3, after the display dropdowns | col 3 | col 3, after the display dropdowns | col 3, after the display dropdowns |
| UI colour | `UI Color:` + Color Picker + Saturation, top | same | same, top | **no header**; Color Picker sits *between* the Pokémon and background sliders | same as gen4, directly under Reset with no gap |
| Pokémon image header | `Pokemon:` | `Pokemon Image Settings` (no colon) | same | same | same |
| Pokémon image rows | X, Y, Scale, Saturation, Rotation, Flip | X, Y, Scale, Saturation, Flip (**no Rotation**) | as gen1 | as gen1 | as gen1 |
| Reset / reload | `Reload style` + "Changes are saved automatically." | — | `Reset Pokemon Settings` | same | same |
| Background flips | `Flip X:` / `Flip Y:` rows | one row `Flip X: [] Y: []` | `Horizontal Flip:` / `Vertical Flip:` | single `Flip:` | single `Flip:` |
| Slider ranges | per gen (e.g. background X ±400 gen1, ±325 gen2, ±125 gen3–5) | | | | |
| Extras | — | Pokeball Floor X/Y, adv | — | — | Log Color Settings |

## Findings

### A1 One panel shell: four columns, fixed group order, the same in every generation
- Now: five different shapes (see "Panel shape" above). Column count 3–5; boxed in gen1 only; widths 220–580 px;
  two overlaps (gen2 `debugging3`/`debugging4`, gen4/gen5 `ui1`/`ui2`); gen3's fifth column is a floating box for a
  single Deoxys dropdown; gen3 wraps the whole panel in a dead `gamestate` gate (`gen3/Overlay.vue:151`); big
  empty stretches in gen1 col 1 and gen3 col 4. A setting lives in a different column in nearly every gen. Show
  Tutor Moves alone is in three different places, and Unobtainable Moves sits in the Style column in gen3.
- Proposal: **one canonical layout.** Four equal columns inside each generation's green area. Only the area's box
  differs per gen (the left and right panels are different widths on stream). The groups in order, top to bottom:

  | Column 1 · Run | Column 2 · Solo Pokémon | Column 3 · Style | Column 4 · Display |
  |---|---|---|---|
  | **Game** (box-art row) | **Solo Pokemon** (SpeciesPicker; gen1 + Set ROM Starter) | **UI Color** [Color Picker], Saturation | **Stats** ▾ |
  | **New Run** | **Evolution** ☐, family style ▾ [Unify Styles] | Theme ▾ (slot for `docs/themes-plan.md` §4.4) | Stat Arrangement ▾ (where the gen has it) |
  | **Timer**: [Play/Pause] [Set Timer], Start Time Offset [____] [Clear], game-specific stop option | **Form** ▾ (Castform, Deoxys, gen5 forms…) | **Pokemon Image**: X, Y, Scale, Saturation, Rotation, Flip; [Reset Pokemon Settings] | **Right Panel** ▾ |
  | **Counters**: Attempt / Finished Runs / Resets / Blackouts (+ −), Faults | **DVs / IVs** ▾, Hidden Power ▾ (+ index), manual fields, readout | **Background**: Texture ▾, X, Y, Scale, Brightness, Contrast, Saturation, Blur, Hue, Flip X, Flip Y | **Unobtainable Moves** ▾ |
  | **Splits**: [Load replay / split file to compare], Comparing against, [Clear loaded splits], Compare Splits ▾, Previous/Current labels, Automatic Post-Battle Splits ☐ | **Gender** ▾, **Ability** ▾, **Nature** ▾ + grid | gen-only style extras (gen2 Pokeball Floor, gen1 Reload Style) | **Toggles**: one checkbox list (Show Tutor Moves, Show Repel Counter, Show Bonk Counter, Count Blackouts, …) |
  | [Open Splits Folder] [Keyboard Shortcuts] | **Run rules**: HP Banned for 1st Run ☐ | | gen-only trackers (gen2 Rare Candies) |
  | ☐ **Show Advanced Settings** → the **Advanced** group (A7) | **Encounters** (A10) | | |
  | **Readouts** (A8) at the bottom | | | |

  This follows the majority today: gen1 and gen3 already put Style in column 3 and Display in column 4, and all five
  put Solo Pokémon and the counters in column 2. The one real move is to bring split comparison together. The
  load button sits with the counters, but the Compare Splits dropdown and the post-battle checkbox are scattered.
  I'd move the counters and splits to column 1 so column 2 is purely "the solo Pokémon". The cost is that New Run
  and the counters sit in a new spot for gens 2–5 (they're in column 2 there today).
- How to build it once: `core/settings/SettingsPanel.vue` (the grid), `SettingsGroup.vue` (header + rows), row
  components `ToggleRow`, `ChoiceRow`, `ButtonRow`, `CounterRow`, `SliderRow`, `TextRow`, `ReadoutRow`, and a few
  composites that are already near-identical: `TimerControls`, `CounterTable`, `SplitComparison`, `EncounterLists`,
  `StyleSliders`, `NatureGrid` (gen3–5 byte-identical today). Each gen supplies a `games/genN/settingsPanel.ts` that
  returns the four columns as data (A2). Each column element keeps its old class (`testingArea1`, `debugging
  debugging1`, `ui_style ui1 ui_border`, `ui1`) beside a new shared `stp-settings-col`, so nothing is renamed. The
  shell's CSS goes in one shared file (area B owns the details). Remove the dead `gamestate` gate, the empty
  `<tr>`, ui5 (the Deoxys form moves into the Form row), and gen2's duplicate `.debugging*` rules.
- Wins: one layout to learn. The ~2,400 template lines become ~600–700 lines of shared components plus ~120–200
  lines of data per gen. I estimated that from gen4's encounter arrays in `actions.ts:101-141` (≈40 lines for 33
  checkboxes, vs ≈80 template lines). Net about **−1,000 lines**. Performance: today each lifted overlay re-renders
  the whole panel on every mapper change it reads. As a child component, the panel only re-renders when its own
  inputs change, which is the fix ARCHITECTURE §5 prescribes for render traps.
- Visibility: operator-only (the panel is in the OBS capture area, but it isn't part of the on-stream design).
- Risks: harness oracles 1 and 2 (layout, pixels) change across the whole panel region in every fixture. That is
  expected, so land it as its own commit per generation, after Phase 6.2 has cut each panel into a fragment
  component, never inside a move. Oracles 3–9 (splits, state, writes, markers…) must stay identical.
  `tools/parity/manual-ivs-check.ts` finds the DV/IV mode as "the one `<select>` whose options are exactly
  Automatic / Manual", fills `input.manual_iv_input`/`manual_dv_input` in DOM order, and reads the "Hidden Power: X
  (Y)" readout. Keep those classes, the field order and that text, and don't add a second Automatic/Manual
  dropdown. `parity:drift` is unaffected (templates aren't compared).
- Size: L (multi-day, done one generation at a time after the shell lands).
- Needs Scott's call: **yes**. "Is this column order right? In particular, should the counters and split
  comparison move to column 1 next to New Run and the timer, so column 2 is only the solo Pokémon?"

### A2 One list of controls feeds both the panel and the Keyboard Shortcuts window
- Now: every control is written twice per generation, once as template markup and once in `games/genN/actions.ts`
  (1,092 lines across five files) as a `toggle`/`press`/`choice`/`cycle` action with the same label, the same
  field and the same `available` test (e.g. gen4 `actions.ts:101-141` already holds the encounter tables as
  `[field, label]` arrays). ARCHITECTURE §4 says "adding a settings control means adding its action in the same
  change". That's a rule people have to remember today, not something the code enforces. The groups in the window
  already disagree between gens ("Advanced" in gen2/gen5 vs "Settings" in gen3/gen4).
- Proposal: a `SettingControl` descriptor in `core/settings/types.ts`:
  `{ id, label, kind, get, set | run, options?, min/max/step?, available?, tier: "always" | "advanced" | "dev" }`.
  `games/genN/settingsPanel.ts` lists them grouped by column and group. `core/settings/toActions.ts` turns the same
  list into `ShortcutAction`s (a checkbox becomes `toggle`, a short dropdown `choice`, a data-fed dropdown `cycle`,
  a button `press`), so `actions.ts` keeps only the "Original F-keys" and one line of `...toActions(panel)`.
  `available()` hides the row in the panel (what the `v-if`s do today) and greys it in the window. The group name
  is the panel group's name, so the window's sections match the panel.
- Wins: the rule enforces itself. About **−400 lines** of `actions.ts`: roughly 60% of each file is per-control
  actions that would become derived. Labels can't drift between the panel and the window.
- Visibility: operator-only.
- Risks: **action ids are persisted** (`shortcuts` in `user_state.json`), so each descriptor carries its existing
  id explicitly and the change must produce the exact same id set (add a self-test that diffs the old and new id
  lists per gen). `choice()` builds ids from `slug(option label)` (`core/shortcuts/build.ts:94`). Relabelling an
  option (A11) must therefore keep the slug from the stored value, or give an explicit id. Option values are saved
  settings (`stats_setting` stores "Averages" / "Base Stats Average" literally), so a new display label must not
  change the value.
- Size: M for the core + one gen, then S–M per gen.
- Needs Scott's call: no.

### A3 One wording for the same setting (and the typos)
- Now (all operator-only labels; refs in the inventory):
  - "Attempt:" vs "Attempt Number:"; "Finished Runs:" vs "Finish Number:"
  - "Right Panel:" vs "Right UI:"; "Stats:" vs "Stat Display:"
  - "Compare splits::" vs "Splits:" vs "Split Type:"
  - "Timer Setting:" vs "Timer:" vs nothing; "Pause/Resume" (gen2) vs "Play/Pause"
  - "Post-Battle Splits" vs "Automatic post-battle splits" vs "Automatic Post Battle Splits"
  - "Debugging:" vs "Debugging-Mode:"; "Shuckie Timer:" vs "Shuckie Timer"
  - "Guaranteed Catches" vs "Guarantee catches" vs "Catch Rate" (gen4's `catch_rate` is the same switch as gen3's)
  - "HM Encounters" vs "HM Users" vs "Force HM Users"
  - "Pokemon:" vs "Pokemon Image Settings"; "Flip X/Y" vs "Horizontal/Vertical Flip"
  - "Averages/Medians" vs "Base Stats Average/Median"
  - Typos and wrong text: `Compare splits::` (`interface_4.vue:24`); `Blackouts?:` (`interface_4.vue:37`, it means
    "count blackouts"); gen3 `Force Route 1 HM Users:` over a list that includes Route 24/25 and Route 6
    (`gen3/Overlay.vue:588`); gen5 held-item field placeholder "Input move 1" (`gen5/Overlay.vue:152`); gen4 D/P's
    empty `Encounters:` header (`gen4/Overlay.vue:437`); gen1 `Disable right panel hotkeys` does the opposite of
    what it says (shortcuts-menu-plan §6).
- Proposal: the canonical labels in A1's table, in Title Case (gen3–5 already force it with CSS). Use "Attempt" and
  "Finished Runs" (gen1's: clearer and narrower), "Right Panel", "Stats", "Compare Splits", "Timer" with
  "Play/Pause", "Automatic Post-Battle Splits", "Debugging", "Guaranteed Catches", "Forced HM Users",
  "Pokemon Image", "Flip X / Flip Y", "Base Stats Average / Median" (display label only, value unchanged), "Count
  Blackouts". The shortcut window labels follow automatically with A2; without A2, edit them by hand in the same
  change.
- Wins: uniformity; no line change.
- Visibility: operator-only.
- Risks: labels aren't persisted and no harness code matches label text (I checked `tools/parity`: only
  "Hidden Power: …" readout text and the Automatic/Manual options). Changing a dropdown's option *text* would change
  the stored value; use `value=` to keep it. Choice action ids are slugs of the option text (see A2).
- Size: S.
- Needs Scott's call: no (wording only). Optional question: "Do you prefer 'Attempt / Finished Runs' or 'Attempt
  Number / Finish Number'?"

### A4 Game picker: box art everywhere
- Now: gen1 and gen2 use a dropdown (`interface_1.vue:2-6`, `gen2/Overlay.vue:56-60`); gen3–5 use a row of box-art
  images (`.gameToggle`), each with its own `available_games`/`game_box_art` table.
- Proposal: one `GamePicker.vue` (the gen3–5 markup) fed by the manifest's `editions` (box art already exists for
  every edition: the pre-mapper `GameSelect` screen shows it). It sets the same field (`settings.edition`,
  `game_selection`, `gameSelection`, `selected_game`).
- Wins: uniformity; removes three near-copies of the art table (≈10 lines each).
- Visibility: operator-only.
- Risks: gen1's `edition` drives the Red/Blue icon (ARCHITECTURE §3.6). The value written must be the same string.
  The `.gameToggleImg` class is used by `tools/parity/packaged-probe.ts:121` on the pre-mapper screen (a different
  element, but keep the class).
- Size: S.
- Needs Scott's call: no.

### A5 Timer group: one shape
- Now: three shapes (see inventory). gen1 and gen2 have Set Timer with an unlabelled input and no Clear; gen3 and
  gen4 have "Start Time Offset:" + Clear; gen5 has a bare 280 px input. gen3 puts New Run inside the timer group.
  gen2 says "Pause/Resume".
- Proposal: `TimerControls.vue` = [Play/Pause] [Set Timer] / "Start Time Offset" [input] [Clear] (gen3/gen4's).
  Each gen passes its own `playPause()`/`setTimer()` callbacks, so gen3 and gen5's "Shuckie timer on → send emulator
  start" branches stay exactly as they are. FRLG's "Stop Timer After League Rematches" and gen5's "Stop Timer After
  N Dialogue" go in as per-game extra rows of this group.
- Wins: uniformity, Clear in every gen; ≈−40 lines.
- Visibility: operator-only.
- Risks: the input binds to each gen's own field (`metrics.timer_override`, `timer_startTimeOffset`). Adding Clear
  to gen1/2/5 is a new control, so it needs a new action (`timer.clear_offset`, as gen4 has).
- Size: S.
- Needs Scott's call: no.

### A6 Counters and split comparison: one table, one group, no duplicate button
- Now: counters are the same four plus Faults everywhere, with two label sets and two markup shapes. Split
  comparison is split across columns. gen1 has two buttons that both call `loadSplitComparison()`
  (`metrics.vue:5`, `interface_4.vue:31`). Only gen5 can clear a loaded comparison. Only gen1 and gen2 let you edit
  the Previous/Current labels; gen3 shows them on stream but has no input. The compare-mode dropdown has three
  names, three option sets, and gen5 lists Followup before First.
- Proposal: `CounterTable.vue` fed by `[{label, value, inc, dec}]` plus a Faults readout. `SplitComparison.vue`
  holds: Load, "Comparing against", Clear loaded splits, Compare Splits ▾ (options as gen data, always First first),
  Previous/Current label inputs (only where the gen shows them), and Automatic Post-Battle Splits. Drop gen1's
  second Load button.
- Wins: one place for everything about split comparison; ≈−120 lines (four 30-line counter tables).
- Visibility: operator-only. Adding Previous/Current inputs to gen3 would let Scott change on-stream text, but the
  text itself doesn't change unless he edits it.
- Risks: `increment`/`decrement` keep their per-gen field names. "Clear loaded splits" in gens 1–4 is new
  behaviour, so check what gen5's `clear_splits` (`gen5/Overlay.vue:3883`) writes before porting it.
- Size: M.
- Needs Scott's call: **yes**. "Should every gen get 'Clear loaded splits' and the Previous/Current label boxes, and
  should gens 3–5 get the 'Followup + Summary' mode gens 1–2 have, or is that a gen1/2-only feature?"

### A7 "Show Advanced Settings" means something different in every gen
- Now: gen1 has no such checkbox (its hidden rows are dev-build-only). gen2's whole table sits in a `release ==
  false` block that's always true. Then the gating varies:
  - Super Shuckie is always visible in gen1, advanced in gens 2–5.
  - HP Banned for 1st Run is always visible in gens 3–4, advanced in gen5.
  - Right Panel and Compare Splits are advanced in gens 3 and 5, always visible in gens 2 and 4.
  - Catch Rate is advanced in gen4, Guaranteed Catches always visible elsewhere.
  - The Deoxys form is advanced, the Castform form is not.
  - Automatic Post-Battle Splits is always visible in gens 1 and 4, advanced in gens 2, 3 and 5.

  So the same setting is sometimes there and sometimes not, depending on the game.
- Proposal: one rule with three tiers, set per descriptor (`tier`, A2):
  - **Always:** everything used to set up or run a session. That's Game, Run, Timer, Counters, Splits (including
    the compare mode), the whole Solo Pokémon column (forms included), Encounters, Display, Style.
  - **Advanced** (in the Advanced group under the checkbox, column 1): Super Shuckie, Automatic Post-Battle Splits,
    run modes (Test Run, Re-filming Mode + its two inputs, No Increment), gen5's Second Screen Mode and Live HP,
    gen2's backport importer, rarely used display toggles (gen3's Automatic EVs, Battle Graphics, Inventory, Nature
    Arrows, Badge Boosts, Vs. Seeker), Pokémon Editor, Debugging.
  - **Dev** (development builds only, `isInDevMode`/`IS_DEV`, no checkbox needed): Style Mode, Enemy Sprite Styles,
    Export All Settings as Defaults, Log Color Settings.

  Add the checkbox to gen1 (its saved key would be new; gen1's dev-only rows stay dev-only). Remove gen2's dead
  `release` flag.
- Wins: a setting is in the same place and visible on the same terms in every gen. It also matches the existing
  shortcut rule that "Show Advanced Settings is not a gate" (shortcuts work either way).
- Visibility: operator-only.
- Risks: saved key `show_advanced_settings` (gen2's is `this.show_advanced_settings`, known-legacy-bugs #45) stays
  as it is. Moving a control between tiers doesn't change what it does.
- Size: S once A1/A2 exist (it's one field per descriptor). M as a standalone pass.
- Needs Scott's call: **yes**. "Is this split right? In particular: should Super Shuckie and Automatic Post-Battle
  Splits be hidden under Advanced (as in gens 2–5) or always visible (as in gen1)? Should the Right Panel and
  Compare Splits dropdowns always be visible?"

### A8 Debug readouts are mixed into the panel; gen5 shows its Debugging block to everyone
- Now:
  - **gen5's "Debugging:" block is visible by default.** It's gated only by `editor == false && debugging_mode`
    (`gen5/Overlay.vue:156`), and `debugging_mode` defaults to `true` (`:5308`), so it shows with Advanced
    unticked. This is visible in `tools/baselines/unified/gen5-black-smoke/0002-party_0_level-4000/screen.png`.
    gen4 additionally requires `show_advanced_settings` (`:222`); gen3's `v-show="debugging"` isn't gated by
    Advanced (`:330`), but that flag defaults to false.
  - Live readouts appear in different places and with different contents. gen2 col 2 has Return Base Power, Party
    Count, Overworld HP, Status and Stat Experience; gen3 col 1 has EVs + total, swapped out by the optimization UI;
    gen4/5 col 1 have Party Count, HP, Status and EVs + "benefit". gen1 has none.
  - Dev tools are spread out: rows in a table in gens 1–3, a boxed "Style Settings" panel in gens 4–5 (also in
    packaged builds), and a "Log Color Settings" button in gen5's Style column.
- Proposal: three separate groups:
  - **Readouts** (always, bottom of column 1): one `ReadoutRow` list per gen with the same order. Party Count,
    Overworld HP, Status, then EVs (gens 3–5) or Stat Experience (gens 1–2, a game quirk) with the benefit column
    where the gen computes it, then gen-only lines (gen2 Return Base Power).
  - **Debugging** (advanced + Debugging ticked, in every gen): the state tables.
  - **Developer** (dev builds only): Style Mode, Enemy Sprite Styles, Style Settings management, Log Color Settings.
  - Fix gen5's gate to match gen4's, as a code quirk logged in `known-legacy-bugs.md`.
- Wins: a clear panel by default in gen5; one place to look for live numbers. Performance: the debug and readout
  tables read 15–25 mapper values each (`gen5/Overlay.vue:157-203`) inside the 1,000-line overlay render. As a
  small child component (or hidden by default) they stop re-rendering the whole overlay on each change.
- Visibility: operator-only.
- Risks: gen5's default change alters what the harness captures (the panel region in oracles 1/2). `debugging_mode`
  also switches `console.log` lines in gen4's split code (`gen4/Overlay.vue:2684-3025`, forced off locally), so
  check gen5's readers before changing its default. Don't flip the saved key. Simply also requiring
  `show_advanced_settings` in the template changes no output.
- Size: S for the gen5 gate; M for the regrouping.
- Needs Scott's call: **yes**. "Do you want the live readouts (HP, status, EVs/stat exp) always visible in every gen,
  including gen1, or only under Advanced?"

### A9 Solo Pokémon setup: one order, shared pieces (next to the species picker)
- Now: the order differs. gen2 goes Gender → DVs → Hidden Power. gen3 goes Evolution → Castform → Ability/Gender →
  Nature → IVs. gens 4–5 go Evolution → IVs → Ability/Gender → Nature. The form picker is a different control in
  each gen (gen3 Castform always, Deoxys advanced and in a floating column; gen5 generic). The Ability readout
  differs (gen3 none, gen4 "Ability: N", gen5 "Hidden Ability"). Gender is a list with a placeholder in gen3 and
  literal Female/Male in gens 4–5. gen5 has no "Evolution Family Style:" header. Show Tutor Moves is in this column
  only in gen5. The RNG button is next to Catch Rate in gen4 (advanced) and under Nature in gen5 (always). The
  Nature grid is byte-identical in gens 3–5.
- Proposal: column 2 order = SpeciesPicker → Evolution (+ family style) → Form → DVs/IVs (+ Hidden Power) → Gender →
  Ability → Nature → Run Rules (HP Banned for 1st Run) → RNG (where the game has it). Build shared pieces:
  `FormPicker.vue` (gen5's generic `<Species> Form` markup, fed by an options list; gen3's Castform and Deoxys
  become entries in it), `NatureGrid.vue`, `HiddenPowerPicker.vue`, `AbilityGenderRow.vue`. Each gen passes its own
  lists. Move Show Tutor Moves to Display toggles.
- Wins: ≈−250 lines (the IV/HP/ability/gender/nature block is ~80 lines × 3 near-identical copies).
- Visibility: operator-only.
- Risks: keep `manual_iv_input`/`manual_dv_input`, field order and the readout text (harness). gen3's Deoxys
  `@change="load_deoxys_sprite_settings"` and gen2's `@change="load_pokemon_sprite_settings"` must still fire. HP
  Banned in gen2 is a missing feature (Crystal has Hidden Power), so adding it is new behaviour, not a move.
- Size: M.
- Needs Scott's call: **yes**. "Should gen2 get 'HP Banned for 1st Run' (Crystal has Hidden Power)? Should gen2
  get evolution settings like gens 3–5?"

### A10 Encounter lists: one component, per-game data
- Now: three layouts (gen1/2: three columns "Route 3 | - Spearow: | ☐"; gen3: one column with colons; gen4/5: two
  side-by-side 11 px lists) and five header wordings (see inventory). gen5's HM list names only the species. gen3's
  FRLG header is wrong. gen4 D/P shows an empty header. The guaranteed-catch switch has three names, is advanced
  in gen4 and missing in gen5. gen3 and gen5 pick the list by the box-art selection, gens 1 and 4 by the mapper's
  game name.
- Proposal: `EncounterLists.vue` with three optional parts. Switches (Guaranteed Catches, Early Encounters, No Moon)
  come first. Then **Encounters** (per-area early-encounter boxes) and **Forced HM Users** as two lists side by
  side (gen4/5's layout), each row "Location - Species". Each gen supplies `[field, location, species]` arrays per
  game: gen4's arrays already exist in `actions.ts:101-141`, gen1's and gen3's are in theirs. The component shows
  no header for an empty list. The `available()` test that decides the game stays per gen (it's in `actions.ts`
  today).
- Wins: ≈−200 lines of template (≈60 checkbox rows × 3–4 lines). The lists become data, shared with the shortcuts.
- Visibility: operator-only.
- Risks: each checkbox's `v-model` field and any `@change` (gen1 writes the flag on change, ARCHITECTURE §4) must be
  preserved. That's why descriptors carry `get`/`set`, not a field name. gen5's HM rows need location names. They
  come from the game (pokeblack/white map names aren't in a decomp here, so take them from the patch or ask Scott).
  Different lists per game are a game/patch quirk and stay.
- Size: M.
- Needs Scott's call: **yes**. "Should gen5 get a Guaranteed Catches switch (does the gen5 ROM patch support it)?
  Should gen4's Catch Rate be always visible like the others? Where are gen5's HM users (Woobat, Roggenrola,
  Pidove, Tympole, Timburr; Psyduck, Pidove) found, so rows can read 'Location - Species'?"

### A11 Display group: same dropdowns, same option names, toggles in one list
- Now: see the Display inventory. Different labels and different option orders. Stats options mean the same thing
  under different names (gen1 "Averages" = gen3–5 "Base Stats Average"). Some options exist only behind an F-key:
  gen2's "Hidden Power" stats, gen4's "Detailed EVs", gen5's "Movepool" right panel. gen3's Stat Arrangement is
  blank by default because its stored default isn't one of its options. Toggles are scattered: gen3 has a
  "Toggles:" list, gen4 a lone Show Tutor Moves at the top of column 3, gen1 a table under Compare Splits. gen3 has
  a "Badge Boosts" checkbox *and* a "Badge Boosts" Stats option. gen4/5's trainer search is dead code (no control
  sets `right_display`).
- Proposal: column 4 = Stats ▾ → Stat Arrangement ▾ (where the gen has it) → Right Panel ▾ → Unobtainable Moves ▾ →
  one "Toggles" checkbox list. Option lists stay per gen as data (which modes exist is per gen; gen4 has no badge
  boosts, a game quirk). Use one display name per meaning, with values unchanged, and always in the order
  Automatic → Base Stats → Average → Median → DVs/IVs → EVs → Detailed EVs → Vitamins → Badge Boosts → gen extras.
  Fix gen3's blank Stat Arrangement by adding the stored default as a labelled option, or by mapping it to "Speed:
  bottom right", which is what the `hp_spe_` modifier it falls back to draws; check `gen3/Overlay.vue:2978-2985`.
  Log it in known-legacy-bugs. Rename gen3's "Badge Boosts" checkbox to say what it does. Delete gen4/5's dead
  trainer-search block.
- Wins: uniformity; ≈−60 lines.
- Visibility: operator-only. **Exception:** the Stat Arrangement fix and any added dropdown option let Scott pick a
  different on-stream stats layout. Nothing changes unless he picks one.
- Risks: dropdown values are saved settings and `/status` may report them (`control.ts` status); never change a
  value, only its display text. F-key behaviour (shortcuts-menu-plan §6 quirks) is untouched.
- Size: S–M.
- Needs Scott's call: **yes**. "Should the options now reachable only by F-key (gen2 'Hidden Power' stats, gen4
  'Detailed EVs', gen5 'Movepool' right panel) be added to their dropdowns? Should gen1 get the Unobtainable Moves
  setting (gen1 has none today)?"

### A12 Style group: same rows in the same order
- Now: UI Color header missing in gens 4–5, where Color Picker sits between the Pokémon and background sliders (gen5
  with no gap). Headers "Pokemon:" vs "Pokemon Image Settings". gen2 lacks Rotation. Background flips are done
  three ways (Flip X/Flip Y rows; one "Flip X: Y:" row; Horizontal/Vertical Flip; a single Flip). There's
  Reset Pokemon Settings (gens 3–5) vs Reload Style (gen1) vs nothing (gen2). Slider ranges differ per gen.
- Proposal: `StyleSliders.vue` with three sections: UI Color [Color Picker] + Saturation (+ Theme, themes-plan §4.4)
  → Pokemon Image (X, Y, Scale, Saturation, Rotation, Flip) + [Reset Pokemon Settings] → Background (Texture, X, Y,
  Scale, Brightness, Contrast, Saturation, Blur, Hue, Flip X, Flip Y). Rows a gen doesn't support are left out by
  data (gen2 Rotation, gens 4–5 vertical flip). Slider min/max/step come from per-gen data.
- Wins: ≈−200 lines (five 60–100-line copies → one component + ranges).
- Visibility: operator-only (the sliders move on-stream art, but only when used).
- Risks: **keep each gen's slider ranges**. A narrower range would clamp a saved value the next time the slider is
  touched, and that would move the art on stream. Adding Rotation to gen2 or Flip Y to gens 4–5 is new behaviour
  (the template has to apply it), so leave those out unless Scott asks.
- Size: M.
- Needs Scott's call: no (gaps stay as gaps unless asked).

### A13 Pokémon Editor / testing tools: one switch, per-gen tool list
- Now: four switches (gen1 dev-only "Test run" opens `battle_testing.vue`; gen2 "Pokemon Editor:" checkbox; gen3 a
  "Show optimization UI"/"Close optimization UI" button pair that also hides the EV readout; gen4/5 a bare-text
  "Pokemon Editor:" checkbox). The button texts differ for the same action: "Update Party Moves" / "Set moves in the
  Overworld" / "Update Moves". gen5's held-item placeholder is wrong.
- Proposal: one "Pokemon Editor" checkbox in the Advanced group. When ticked, it shows a `PokemonEditor.vue` with
  sections the gen supplies: Moves (4 fields + Update Party Moves / Update Battle Moves), Items, and gen extras
  (gen2 DV/stat-exp recalculator, gen3 Recalculate Stats for Nature, gen5 Testing Items / Set Options / Recalculate
  Stats / Held Item). gen1's stays dev-only under Test Run unless Scott wants it in release.
- Wins: ≈−80 lines; one way to open it.
- Visibility: operator-only.
- Risks: these buttons write to the ROM, so each keeps its exact method. gen3's toggle also hides the EVs readout
  (`v-show="!battle_testing_ui"`, `:268`); keep that or move the readout per A8. These are excluded from shortcuts
  on purpose (ARCHITECTURE §4), so no actions are needed.
- Size: S–M.
- Needs Scott's call: no.

## Quick wins

1. **A8 (gen5 gate only):** hide gen5's Debugging block unless Show Advanced Settings is ticked, as in gen4. It's a
   one-condition template change that clears up gen5's default panel. S.
2. **A3:** fix the wording and typos ("Compare splits::", "Blackouts?:", "Force Route 1 HM Users", gen5 "Input move
   1", gen4 D/P empty header, "Pause/Resume") and align the labels. No behaviour change. S.
3. **A6 (part):** remove gen1's duplicate "Load replay / split file" button. Both buttons call the same function. S.
4. **A11 (part):** fix gen3's blank Stat Arrangement dropdown and delete gen4/5's dead trainer-search and
   legacy-starter blocks and gen3's dead `gamestate` gate and empty row. S.
5. **A5:** one timer group with Start Time Offset + Clear in every gen. S.
6. **A2 before A1:** build the descriptor list and `toActions` first, with an id-equality self-test. After that,
   every panel group in A1 is just rendering a list that's already checked. M.
