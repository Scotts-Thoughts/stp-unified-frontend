# D — On-stream right side and battle views audit

> Snapshot of the 2026-10-14 UI audit (read-only, against the working tree of that day). Line numbers drift as
> the work in `docs/ui-uniformity-plan.md` lands; re-check any `file:line` before relying on it. Mark a finding
> done in the plan, not here.

Scope: the right-hand panel (Movepool, Splits, enemy team / wild panel, trainer art), the control that picks
what it shows, battle-only pop-ups, and gen2's "Candies" column. Read-only audit of the working tree on
2026-10-14; screenshots are the 2026-09-11 baselines (`tools/baselines/unified/...`), cross-checked against code.
Line numbers are `Overlay.vue` unless a file is named. "gen1 files" are under `src/renderer/components/`.

Phase 6 already has a slot for this work: slice **6.10 "Right panel and movepool"** (`docs/IMPLEMENTATION_PLAN.md`
:521, :1163, clusters at :1845-1846). Everything proposed below is meant to *be* that slice's target, with the
look/behaviour changes done in their own commits after the moves (Phase 6 rule: a move and a rewrite never share
a commit).

## Inventory

### Right-panel mode control (operator UI, but it decides what viewers see)

| | gen1 | gen2 | gen3 | gen4 | gen5 |
|---|---|---|---|---|---|
| Label | "Right Panel:" (`settings/interface_4.vue:17`) | "Right UI:" (:375) | "Right Panel:" (:757), **only with Show Advanced Settings** | "Right UI:" (:500) | "Right UI:" (:413), **advanced only**, hidden in second-screen mode |
| Options | Automatic, Movepool, Splits | Battle Graphic, Movepool, Splits, Trainers (Inventory commented out :378) | Battle Graphic, Inventory, Movepool, Movepool+, Splits, Wild (:759-764) | Automatic, Splits, Movepool (:502-504) | Automatic, Splits (:415-416) |
| Default | Automatic | "Battle Graphic" (:1257) | "Battle Graphic" (:2436) | Automatic (:1475) | Automatic (:1275) |
| What "automatic" means | enemy panel in To Battle/Battle for trainers (+wild if toggle), else movepool (`right_panel.vue:74-79`) | "Battle Graphic": enemy panel in trainer battles, else falls through to the movepool (:762, :855) | code **rewrites the saved setting** to "Wild"/"Battle Graphic" at each battle start (:3026-3032) | `enemy_graphic` computed wins over every option, so "Movepool" = "Automatic" (:778, :3283) | Automatic = Movepool branch (:892); enemy panel via `enemy_graphic` (:725) |
| Post-battle Splits | transient `mode_override`, never saved (`stores/useOverlaySettingsStore.ts:38-81`; legacy bug #39 fixed) | writes `right_panel = "Splits"` (:6301, :6320) — saved | writes `right_panel = "Splits"` (:8494, :8518) — saved | writes `right_ui = "Splits"` (:9413, :9477) — saved; reset on next Battle (:9292) | watcher writes `right_ui = "Splits"` (:1820) — saved; reset **inside the `battlePokemonCrop` computed** (:3092) |
| Splits mode label / options | "Compare splits::" (typo, double colon) First / Followup / Followup + Summary | "Splits:" same three | "Splits:" First / Followup (advanced only) | "Split Type:" First / Followup | "Splits:" **Followup / First** (reversed order) |
| Wild panel toggle | "Wild Pokemon" checkbox, **dev builds only** (`interface_4.vue:63-74`), default off | — (no wild panel) | "show_wild_battles" checkbox (:818), default **on** | — (`wild_pokemon_display` data is dead, :1510) | — (same dead field, :1330) |
| Speed-label toggle | store `right_panel.speed_comparison` (true), no control | data `speed_comparison_toggle: true` (:1252), no control | same (:1938) | always shown | always shown |

### Movepool table (on-stream)

| | gen1 `right_panel/move_pool.vue` | gen2 (:634-670, copy at :855-892) | gen3 (:1103-1143, copy :1593-1633; "Movepool+" :1144-1233) | gen4 (4 copies :1028-1146) | gen5 (:892-946) |
|---|---|---|---|---|---|
| Columns | Way Move Type Pwr. Acc. PP | same | same | + **DC** (game quirk: split is gen4+) | + DC |
| Title | `.movepoolLabel` titan 30px | `.movepoolTitle` 26px | `.movepoolTitle` 24px | `.movepoolLabel` 24px | `.movepoolLabel` 26px |
| Table font / line-height (style.css) | 16/20 (gen1 :2558) | 16/21 (:2412) | 15/18 (:3563) | 14/16 (:3651) | 13/15 (:3722) |
| Width | 366px | 366px | 328px | 404px | 404px |
| Row sizing to the panel | fixed; Mew only → 15px (`move_pool.vue:44-50`) | shrink only when it overflows (`customFormats` :3854) | shrink on overflow, 19px under 20 rows (:6053+) | **stretch to fill** from 12 rows (:6125-6200) | stretch to fill from 20 rows, 19px below (:6378-6451) |
| Header colour | class `background-<type2>` of the starter | inline `var(--current_<type2>)` | inline `var(--current_<type2>)` | inline `var(--<type2>)` (no palette prefix) | inline `var(--current_<type2>)` |
| Type-cell palette | `--normal` etc. | `current_` (same hex as gen1) | `current_` | plain vars (same hex) | `current_` |
| "-%" for no-accuracy | `{{x.accuracy ?? '-'}}%` | data "-" + "%" | same | same | same |
| OHKO power | "-" (data power 1 hidden, :219) | "-" (data) | "-" | "-" | "-" — Scott's rule "KO in the power column" is applied only to the player's move panel |
| Unobtainable strikethrough | **none** (no setting) | TM/HM rows only; level and tutor rows never | level ('Banned'), TM/HM, tutor | level, TM/HM, tutor | level, form, TM/HM, tutor |
| Strike style | — | inline style string per row: `opacity .4; line-through; transition 1.5s` | same | same | same |
| Tutor rows | — (no tutors in gen1: quirk) | always (Crystal) | toggle "Show Tutor Moves"; `v-if` on every `<td>`, empty `<tr>`s stay | toggle; `v-if` per `<td>` | toggle + B2/W2 only, `<template v-if>` (correct) |
| Hidden Power / Return / Frustration | — | computed (`movepoolPower` :3971) | computed | computed | **never computed** (see D1) |
| `first-row` padding | 1px | none | 1.5px | 2px | 2px |

### Splits panels (on-stream)

| | gen1 `splits_first/_followup/_summary.vue` | gen2 (:672-761) | gen3 (:1460-1517) | gen4 (:983-1026) | gen5 (:850-890; second screen :808-848) |
|---|---|---|---|---|---|
| Title | `.split_label` "Splits" | `.split_label`; **drawn twice** in Followup + Summary (:674 and :714) | `.movepoolTitle` "Splits" | `.movepoolLabel` | `.movepoolLabel` |
| Header row | type-2 colour, outline 2px, 18px, no underline | same | outline 1px, 14px, **underlined** | outline 2px, 14px, `movepool_header` | outline 1px, 16px, **underlined**, height 9px |
| Body font | 20px First / 18px Followup / 16px Summary | same | 14px | 15px | 16px |
| Table height | 960px (rows stretch) | 960px | natural | natural | natural |
| Icon | `<td class="scaled_icon"><img>` | same | `<img class="scaled_icon">` | `<img class="scaled_icon">` | `<img class="icons splitIcon">` |
| Followup + Summary | yes | yes | — | — | — |
| Diff colours | own copies (`splits_followup.vue:119`, `splits_summary.vue:219`) | `formattersMixin.split_diff_color` | mixin | mixin | mixin; previous "0:00" shown as "-" |

### Enemy team panel (trainer battles, on-stream)

| | gen1 `right_panel/enemy_graphic.vue` | gen2 (:762-824) | gen3 (:1335-1458) | gen4 (:778-915) | gen5 (:725-805) |
|---|---|---|---|---|---|
| Header | "brock's team" → capitalised (`fixTrainerName`) | "X's Team" | `special_trainer_names` | `get_trainer_name`, "Double Battle Team" | "X's Team", "Double Battle Team" |
| Level text | "Lv:12" | "Lv:12" | "Level: 12" | "Level: 12" | "Lv: 12" at opacity .7 |
| Stat labels | HP, Atk., Def., Spc., Spe., Crit. | HP, Atk., Def., SpA., SpD., Spe. | **Hp:**, Atk:, Def:, SpA:, SpD:, Spe: | Hp:, Atk:, Def:, Spe:, SpA:, SpD: | Hp:, Atk:, Def:, Spe:, SpA:, SpD: |
| Extra | Crit % (gen1 crit depends on base Speed: quirk) | DVs / base stats per Stats mode | Ability; EV yields in EVs mode | Ability; status (`stcd`) | Ability |
| Stage shown as | label opacity .1 + "+1" badge | same | label opacity + `.enemyMod` | `.enemyMod` table | label **hidden** + badge |
| Fainted | greyscale, opacity .5 (`methods/enemy` :12) | .5 (:4351) | .3, and *every* slot greyed in From Battle (:6321) | .35 (:5354) | greyscale only (`enemyFaint` returns before its body, :5650) |
| Empty slot before data loads | shows literal **"null", "Lv:0", zeros** (baseline `gen1-yellow-smoke/0011`) | hidden (`v-show species != null`, :770) | hidden (trainer data) | hidden (`team_count`) | hidden |
| Speed label (player faster / tie / enemy faster) | Outsped / Speed-tie / Outspeeds | same | same | **Outspeeds / Speed-Tied / Underspeeds** (:6341-6347) | Outsped / Speed-tie / Outspeeds |
| Enemy move power | — | — | — | column exists in the 2nd-team/preview blocks only, never a number (legacy #49) | — |
| Trainer art | 90-line `switch` (`enemy_graphic.vue:354-444`) | `specialTrainerGraphics` | `specialTrainerGraphics` | `getTrainerGraphic()` (called twice per render) | same |
| Panel fade | `fade` 300/200ms | `fade1` 300/200 | `fadeBattle` 300/200 | `fadeBattle` 300/300 +50ms delay | `fade1` 500/500 |

### Wild panel, trainer preview, pop-ups, Candies

| | gen1 | gen2 | gen3 | gen4 | gen5 |
|---|---|---|---|---|---|
| Wild panel | `right_panel/wild_pokemon.vue` (257 lines, 80% copy of enemy_graphic), reachable only in dev builds | — | :1234-1333, on by default, **layout broken** (D3) | — | — |
| Trainer preview ("look up a trainer's team") | — | option "Trainers" shows a search box but no panel (falls to movepool) | — | panel :916-981 exists, selector commented out (:476-483) | selector remnants only (:433) |
| Accuracy / evasion pop-ups | "accuracy", "evasion" (no colon), value with "+" (`left_panel/pop_ups.vue`) | "Accuracy:", "Evasion:", "Field:" (:942-991) | "Accuracy:", "Evasion:", screens (:1642-1666) | "accuracy:", "evasion:", no screens (:1154-1161) | "accuracy:", "evasion:" (:953-960) |
| Candies | — | rare-candy checklist, operator column 4 (:448-482) | — | — | — |

## Findings

### D1 gen5 movepool never shows Hidden Power's type/power or Return/Frustration power (bug)
- Now: gen5's movepool rows come from `black.js`, whose keys are lower-case (`move`, `type`, `power`;
  `data/moves/black.js:4742-4748`). `movepoolPower`, `movepoolType` and `movepoolTypeColor` (:7549-7610) test
  `moveObject.Move == 'Hidden Power'` / `'Return'` / `'Frustration'` and `moveObject.Type == 'Curse'`, which are
  always `undefined`. So TM10 shows "Normal / -" and Return/Frustration "-" (baseline `gen5-black-smoke/0006`),
  where gen4 shows "Ghost 60" and "1 / 102" (`gen4-platinum-smoke/0017`). Same dead test at :922
  (`x.Move == 'Whirlpool'`). Not in `docs/known-legacy-bugs.md`.
- Proposal: read `moveObject.move ?? moveObject.Move` (one helper), so gen5 matches gens 2-4. Log it as a code
  quirk fix. When D4 lands this disappears into the shared row adapter.
- Wins: correct on-stream numbers; no lines.
- Visibility: on-stream (TM10/TM27/TM21 rows in every gen5 run).
- Risks: harness pixels change on any gen5 fixture with those TMs (expected; re-baseline). gen5's
  `getUnobtainableMoveStyle` already reads the lower-case `move_object.move` (:5052), so crossing out is unaffected.
- Size: S. Needs Scott's call: no (it's a code bug), but tell him the gen5 rows will change.

### D2 The speed label means the opposite in gen4
- Now: gens 1, 2, 3 and 5 describe the **enemy**: player faster → "Outsped", enemy faster → "Outspeeds", tie →
  "Speed-tie" (`enemy_graphic.vue:176-187`, gen2 :3113-3150, gen3 :4337-4370, gen5 :4540-4566). gen4 describes the
  **player**: player faster → "Outspeeds", enemy faster → "Underspeeds", tie → "Speed-Tied" (gen4 :6341-6347). A
  viewer who watches two series reads "Outspeeds" as opposite facts. The colour (blue/yellow/red svg) agrees in all
  five. `battleMathMixin.speedComparison` (`core/overlay/battleMathMixin.ts:68-79`) uses gen4's words and is unused.
- Proposal: one helper next to `gen45TurnOrder` in `core/logic/battleSpeed.ts`, e.g. `speedLabel(order) →
  {label, svgClass}`, used by every panel; adopt the majority wording (gen1/2/3/5). Delete the unused mixin method.
- Wins: uniformity; ~5 copies of the 15-line label/colour pair become one (~60 lines).
- Visibility: on-stream.
- Risks: gen4's `svgColorClass` keys on the gen4 strings (:6437-6442) — change together. Any oracle reading the label
  text (none found in `tools/parity`).
- Size: S. Needs Scott's call: **yes** — "Use gen1's wording (Outsped / Speed-tie / Outspeeds, describing the enemy)
  in gen4 too, or gen4's (Outspeeds / Speed-Tied / Underspeeds, describing your Pokémon) everywhere?" Recommend the
  first (4 of 5 gens, existing videos).

### D3 gen3's wild-battle panel is laid out wrong (legacy layout bug)
- Now: the wild block (:1234-1333) wraps the slot in `<div class="ePkmn1">` without `ePkmnStyle` (which is what gives
  `position: relative; left: 24px; height: 160px`, style.css :3024), and its stat labels lack the
  `ePkmnStatsLabelColumn1/2` classes the trainer panel uses (:1387-1424). Everything piles into the top-left:
  "Wild Pidgey" overlaps the move name and PP, the stat column floats, the level is missing (baselines
  `gen3-firered-smoke/0004` and `/0013`; the legacy capture `legacy_gen3@37/.../0004` is identical, so it shipped
  like this). It also uses the old `images/gen3/enemy_area/` stats art while the trainer panel uses `new_ui/`.
- Proposal: short term, give the wild slot the trainer slot's markup (add `ePkmnStyle`, the column classes, the
  `new_ui` art, a Level line). Long term it is the one-slot case of the shared enemy panel (D9).
- Wins: a visibly broken on-stream panel fixed; it is on by default in gen3.
- Visibility: on-stream.
- Risks: pixels change for every gen3 wild battle (that's the point). Classes are only added. Log in known-legacy-bugs.
- Size: S. Needs Scott's call: no for the fix; see D10 for whether wild panels exist at all.

### D4 One Movepool component instead of ten copies
- Now: the movepool table is written out 1× in gen1 (a component with computeds, the model to copy), 2× in gen2,
  3× in gen3 (incl. "Movepool+"), 4× in gen4 (three level/TM/tutor-only variants whose selector is commented out at
  :493-498) and 1× in gen5 — about 410 template lines, plus per-gen `movepoolPower/Type/TypeColor` (~35 lines × 4),
  `getUnobtainableMoveStyle` (~25 × 4) and the resize calc (~40 × 4). The CSS block (~70 lines) exists in every
  `style.css`, and twice in gen2 (:2380 and :4985, byte-identical).
- Proposal: `core/overlay/Movepool.vue`, fed a plain prop built per gen:
  `{ title, columns: { dc: boolean }, headerType, rows: [{way, move, type, typeColor, dc?, power, accuracy, pp,
  struck}], fit: {containerHeight, baseFont, baseLine, mode} }`. Each gen supplies one computed `movepoolView` (its
  row adapter keeps its own Hidden Power / Return / Curse / backport / form rules — data, not `if (gen)` in core).
  Markup keeps `movepoolDemo`, `movepool_header`, `movepool_way/_move/_type/_tableC`, `first-row`, and the gen's
  title class (`movepoolLabel` or `movepoolTitle`) passed as a prop. Struck rows get an added class
  (`movepool-unobtainable`) instead of an inline style string. Shared CSS (`core/styles/movepool.css`) holds the
  column/stripe/strike rules; each gen's `style.css` keeps only position, width, font size and title size. Adopt
  gen5's `<template v-if>` for optional row groups. DC stays gen4/5-only (game quirk).
- Wins: ~410 template + ~400 helper + ~250 CSS lines → ~150 component + ~5 per gen + ~60 CSS: **≈ -800 lines**
  (estimate from the line ranges above). Performance: today each overlay render (any watched mapper value, so many
  per second in battle) rebuilds 60-90 rows × 6-7 cells and calls ~4 methods per row (gen4/5 call
  `getMoveCategory` twice per row, gen3/5 `move_name` per row, `getUnobtainableMoveStyle` does two `Array.includes`
  per row). As a child with a computed `rows`, a render of the parent that doesn't change the rows skips it entirely.
- Visibility: on-stream (but the move itself should be pixel-identical).
- Risks: CSS classes kept; `getUnobtainableMoveStyle`'s inline `transition: opacity 1.5s` must move into the class
  so the cross-out still fades. gen4/gen5 `evolution_transitioning` wrapper style (:1104, :892) stays outside.
  `parity:drift` allowlist entries for these methods change. The four gen4 isolation branches are unreachable
  (selector commented) — dropping them is a separate cleanup commit.
- Size: L (one component, four adapters, harness per gen). Needs Scott's call: no for the move; the visible
  follow-ups are D5/D6.

### D5 Which rows get crossed out differs for no game reason
- Now: gen1 has no Unobtainable Moves setting at all; gen2 never crosses out level-up or tutor rows (only TM/HM,
  :652/:868); gens 3-5 cross out level ('Banned' list), TM/HM and tutor rows. gen2 special-cases Hidden Power after
  the first finished run (:2890), gen3 has a 'First Playthrough' list (:4156) — those are run rules (data).
- Proposal: in the shared component every row group can be struck; each gen supplies its lists (gen1's can be
  empty, so its look doesn't change). Compute one `Set` of struck move names per (toggle, state, badge 1, finished
  runs) in a computed, not two `includes` per row per render.
- Wins: uniform behaviour; perf as in D4.
- Visibility: on-stream (gen2 only changes if its data lists level/tutor moves; today its `unobtainable_moves_object`
  probably has none, so likely no visible change).
- Risks: none to keys. Size: S (inside D4).
- Needs Scott's call: yes — "Should gen1 get the 'Unobtainable Moves' dropdown too (needs a list of gen1 TMs you
  can't get in a solo run), or stay without it?"

### D6 Five different "fit the movepool to the panel" rules
- Now: gen1 fixed size (Mew alone shrinks), gen2 shrinks only on overflow, gen3 shrinks on overflow / 19px rows under
  20, gen4 stretches rows to fill from 12 moves, gen5 stretches from 20 moves (inventory). So a short movepool
  ends halfway down the panel with white space in gen1/2/3 (baseline `gen1-yellow-smoke/0005`) and fills it in
  gen4/5. gen3's version also writes `data()` (`movepoolDefaultFontSize` …, :6066-6068) from a template-called method
  — the render trap pattern from ARCHITECTURE §5 (it settles because the values are constant).
- Proposal: one pure function in `core/logic/movepoolFit.ts` (`fit(rows, containerHeight, baseFont, baseLine,
  {stretchFrom, shrinkFactor})`) used by D4's component; adopt **gen4's** rule (fill the panel, never grow the font
  above default — its comment explains why) with per-gen numbers.
- Wins: ~160 lines → ~30; uniform look; removes the gen3 data writes.
- Visibility: on-stream (gen1/2/3 rows get taller for short lists).
- Risks: pixel changes in gens 1-3. Size: S-M.
- Needs Scott's call: yes — "Should a short movepool stretch to fill the panel in every generation (as gen4/gen5 do),
  or keep its rows at the normal size and leave space below (gen1/2/3)?"

### D7 One right-panel mode model (gen1's), with the same options everywhere
- Now: see the inventory. Three problems beyond naming: (a) gens 2-5 write the automatic "Splits" switch into the
  saved setting, so after a restart the panel opens on Splits until the next battle resets it — exactly the bug
  gen1 fixed with `mode_override` (known-legacy-bugs #39); (b) gen4's "Movepool" option does nothing different from
  "Automatic" because `enemy_graphic` is tested first (:778); (c) gen3 re-writes the user's choice to
  "Wild"/"Battle Graphic" at every battle start (:3026-3032) and hides the control behind Advanced, and gen5 resets it
  from inside a computed (`battlePokemonCrop` :3092 — a side effect in a computed, which Vue may run at any time).
- Proposal: gen1's model everywhere — a saved *preferred* mode (Automatic / Movepool / Splits) plus a transient,
  never-saved override for post-battle splits, and a "Wild battles" checkbox. A small shared store or mixin
  (`core/overlay/rightPanelMode.ts`) holds it; each gen keeps its saved key (`right_panel`, `this.right_panel` in
  gen2, `right_ui`) and maps old values on read ("Battle Graphic" → Automatic, "Wild" → Automatic + wild on). Same
  label ("Right Panel:"), same option order, same splits options and label ("Splits:" First / Followup / Followup +
  Summary), always visible (not Advanced-only).
- Wins: uniform operator UI and predictable on-stream behaviour; the four ad-hoc writers (~40 lines) go.
- Visibility: operator control; on-stream effect.
- Risks: **saved values** — keys stay, but the stored *strings* would change on next save; a read-time alias keeps old
  files working (call out to Scott). Shortcut actions built from these dropdowns (`games/genN/actions.ts`, `choice`
  builder) have ids derived from options — renaming an option renames an action id and drops a user's key
  (ARCHITECTURE §4 "Action ids are persisted"); keep ids or alias them. gen4 "Movepool" starting to really hide the
  enemy panel is a behaviour change.
- Size: M. Needs Scott's call: yes — "OK to make every generation offer Automatic / Movepool / Splits (gen2 and gen3's
  'Battle Graphic' becomes 'Automatic'), keep the post-battle Splits switch from surviving a restart, and make
  'Movepool' actually keep the movepool up during battles in gen4?"

### D8 One Splits panel
- Now: five hand-built table sets (inventory) with different fonts (14-20px), underlined vs plain headers, outline
  1px vs 2px, stretched (gen1/2) vs natural row height, and Followup + Summary only in gen1/2. gen2 draws "Splits"
  twice in Followup + Summary (:674, :714). gen1's two `split_diff_color` copies duplicate the mixin.
- Proposal: `core/overlay/SplitsPanel.vue` with `mode` (first / followup / followup+summary), rows from a shared
  `buildSplitRows(current, previous, order)` (Phase 6 slice 6.5 already plans `core/autosplitter/`), icon path as a
  prop, and a `variant="second-screen"` for gen5. Keep `splits_table`, `splits_table_old`, `battle_summary_table`,
  `battle_summary_label`, `split_label`, `scaled_icon`, `second_screen_splits_table`. Adopt **gen1/gen2's look**
  (largest text, stretched rows, Summary mode) — they are the most readable on a 1080p stream.
- Wins: ~232 (gen1) + ~90 + ~60 + ~45 + ~85 template lines → ~120: **≈ -390 lines**; Followup + Summary available in
  all gens (battle summary data exists in gens 2-5? only where `battle_summary` fields are mapped — check first).
- Visibility: on-stream.
- Risks: gen3/4/5's split rows carry per-gen naming (`split_image`, `getSplitImageName`, HGSS's hard-coded order at
  gen4 :2691-2740) — those stay in the gen's row builder. Pixel changes in gens 3-5.
- Size: M. Needs Scott's call: yes — "Make every generation's Splits panel look like gen1/gen2's (bigger text,
  rows spread over the whole panel, plain header), and offer 'Followup + Summary' wherever the battle summary data
  exists?"

### D9 Enemy team panel: same words and states first, one component later
- Now: three different designs (gen1/2; gen3; gen4/5), each with its own SVG art. Beyond the art, presentation
  differs for no game reason: labels "HP / Atk." vs "Hp: / Atk:" (the gen3-5 player stat panels say "HP", "Atk.",
  so the enemy panel disagrees with its own overlay); "Lv:12" vs "Level: 12" vs "Lv: 12"; stat order (gen3 SpA SpD
  Spe, gen4/5 Spe SpA SpD); fainted slot opacity .5 / .3 / .35 / greyscale-only; gen3 greys *all* slots in From
  Battle; gen1 shows "null / Lv:0 / 0" for a slot whose data hasn't arrived (`enemy_graphic.vue:20-21` binds the
  property object, baseline `gen1-yellow-smoke/0011`), the others hide it; gen3 checks `moves[0]` for moves 2-4
  (:1361-1367, copy-paste); gen4's second-trainer block hard-codes status "BRN" (:889, also the preview :944) and prints every
  stat twice without classes (:871-885).
- Proposal, step 1 (S, text/states only, per gen): one label set "HP / Atk. / Def. / SpA. / SpD. / Spe." (gen1 keeps
  "Spc."/"Crit." — quirk), one level format "Lv. 12" (or "Lv:12"), one faint style from a shared
  `core/overlay/enemyFaint.ts` (`opacity .5; grayscale(100%)`, gen1/gen2's), hide not-yet-loaded slots everywhere
  (gen2's `v-show`). Step 2 (L): `core/overlay/EnemyTeamPanel.vue` + `EnemySlot.vue` fed a normalised
  `EnemySlotView {species, level, types[], ability?, moves[{name,type}], stats[{key,label,value,stage}], fainted,
  active, speed}` from a per-gen adapter, with the art paths and positions as per-gen data/CSS. gen1's
  `trainer_artwork` 90-line switch becomes a data table like gen4/5's.
- Wins: step 1 uniformity at almost no cost; step 2 replaces gen1's 703 lines (enemy_graphic + wild_pokemon) and
  ~900 template lines in gens 2-5 with ~250 + adapters: **≈ -1,000 lines** (rough, from the ranges in the inventory).
- Visibility: on-stream.
- Risks: element classes (`ePkmnStyle`, `ePkmn${n}`, `ePkmnSprite`, `ePkmnSpriteResizing`, `data-enemy-slot`,
  `data-enemy-species` — the sprite resize tool keys on these) must stay. Pixel changes everywhere in battle.
- Size: step 1 S-M, step 2 L. Needs Scott's call: yes — "Use one wording on the enemy panel in every generation:
  'HP, Atk., Def., SpA., SpD., Spe.' (like your stat panel), 'Lv:12', fainted Pokémon greyed at half opacity?"

### D10 Wild-battle panel: decide if it exists
- Now: gen1 has one but only in dev builds (default off); gen3 has one, on by default, broken (D3); gens 2, 4, 5 have
  none (gen4/5 carry a dead `wild_pokemon_display` field).
- Proposal: either a "Wild battles" checkbox in every gen backed by the shared panel's one-slot mode (D9 step 2), or
  remove gen1's dev-only one and gen3's. Recommend the checkbox, default **off** (gen1's default), since it's the
  one-slot case of a component that will exist anyway.
- Wins: uniform; gen1's 257-line copy goes either way.
- Visibility: on-stream. Risks: gen3 default flips from on to off — behaviour change.
- Size: S (decision) / M (build). Needs Scott's call: yes — "Do you want a wild-Pokémon panel at all? If yes, as an
  opt-in checkbox in every generation?"

### D11 Dead or half-built right-panel options
- Now: gen2 "Trainers" (search box, no panel) and its `Inventory` branch (:825-855, option commented out); gen3
  "Inventory" (selectable, renders an empty panel — the table is commented out, :1519-1591) and "Movepool+"
  (placeholder splits with hard-coded "0:00:00", empty inventory and encounter tables, :1144-1233); gen4 trainer
  preview (:916-981, selector commented, and it labels slots with the *battle's* species, :926) and three
  `movepool_isolation` copies (:1028-1103, selector commented); gen5 `right_display` remnants; `wild_pokemon_display`
  (gen4/5); gen2/3 `speed_comparison_toggle` and gen1's store flag with no control; `battleMathMixin.speedComparison`.
- Proposal: remove what no control can reach (gen2 Inventory branch, gen4 trainer preview and isolation copies, gen5
  remnants, dead fields) in one cleanup commit; for the two reachable-but-empty gen3 options and gen2 "Trainers",
  ask. If Scott wants a trainer preview, build it once as a mode of D9's panel.
- Wins: ≈ -450 template lines (gen2 30, gen3 160 incl. comments, gen4 140, gen5 20, misc).
- Visibility: operator (reachable ones also on-stream if selected).
- Risks: saved values "Inventory"/"Movepool+"/"Trainers" need to fall back to Automatic on read. Shortcut action ids
  for those options (if `actions.ts` lists them) must be retired deliberately.
- Size: S. Needs Scott's call: yes — "gen3's 'Inventory' and 'Movepool+' and gen2's 'Trainers' show nothing useful.
  Remove them, or do you want a trainer-preview panel built properly for every generation?"

### D12 Battle pop-ups say the same thing five ways
- Now: "accuracy" (gen1, no colon, value with "+"), "Accuracy:" (gen2/3), "accuracy:" (gen4/5); field/screens pop-up
  in gens 1-3 only (gen4/5 have the battle flags in Platinum/HG-SS mappers, ARCHITECTURE §4). gen4 tests
  `meta.state == 'Battle'` on the property object, not `.value` (:1152, :1159).
- Proposal: one label style (recommend gen4/5's lowercase "accuracy:" which matches the "faults"/"time played"
  labels) and "+N" sign everywhere via a shared formatter. May overlap the left-panel area's audit.
- Visibility: on-stream. Size: S. Needs Scott's call: yes — "Pick one: 'accuracy:' or 'Accuracy:'; and show '+1'
  rather than '1'?"

### D13 gen2's "Candies" column
- What it is: an operator-side checklist of the ten Rare Candies you can pick up in Crystal (Olivine Lighthouse 5F,
  Lake of Rage hidden, Violet City, Route 34 hidden ("Goldenrod"), Route 27 ("Tohjo Falls"), Mt. Mortar 2F,
  Whirl Islands B1F hidden, the Fan Club president's gift, Cinnabar hidden, Route 28 ("Mt. Silver")). Each pill reads
  the mapper's `events.rare_candies.<flag>`: green "obtained", red "not obtained", yellow "unknown"
  (`rareCandyStatusClass` :2642; CSS `.candy-status*` style.css :5438-5469). They look like buttons but do nothing
  on click. Under Gold/Silver the paths are absent (`docs/game-support-gaps.md`:57), so all ten are yellow.
  `rareCandyStatusText` (:2636) is unused.
- Proposal: keep it gen2-only (only gen2's mapper has the flags); retitle "Rare Candies:" and drop the button look
  (no pointer/rounded-button styling) so it reads as status; delete the unused text helper. If another gen's mapper
  ever gets pickup flags, make it a shared `core/overlay/ChecklistColumn.vue` fed a list of `{label, path}`.
- Visibility: operator-only. Size: S. Needs Scott's call: no (operator UI), but mention the retitle.

### D14 Render performance in this area
Concrete costs found (beyond D4/D5/D6):
- **Speed comparison computed twice per slot** — once for the speed-colour svg class, once for the label — in every
  gen (gen1 `enemy_graphic.vue:27` and :75; gen2 :766 and :819; gen3 :1345 and :1454; gen4 :787 and :842; gen5 :731
  and :756). gen1's version also calls `PokeData.getTrainer` each time. 12 calls per render with a full team. Fix:
  one computed array `speedBySlot` in the panel.
- **gen4 writes `data()` during render**: `v-for="move_index in moves = [0,1,2,3]"` (:830, :897, :963) assigns a new
  array to the data field `moves` (:1794) for every slot on every render. Nothing reads `moves` today, so no loop —
  but any future read turns it into the ARCHITECTURE §5 render loop. gen2 does the same with undeclared names
  (:776, :835, :843). Replace with a literal `v-for="move_index in 4"`-style constant.
- **gen5 side effect in a computed**: `battlePokemonCrop` sets `right_ui` (:3092). Move it to the battle-start
  watcher (D7).
- **gen3/gen4 hidden tutor rows still render**: `v-if` sits on each `<td>`, so with tutors off every tutor move still
  creates an empty `<tr>` and calls `getUnobtainableMoveStyle` (gen3 :1132, :1622; gen4 :1134). gen5's
  `<template v-if>` is the fix.
- **gen4 `getTrainerGraphic()` called twice per render** (:914, :980; gen5 :803) and gen1's trainer art switch runs
  in a computed that calls it twice (`showtrainerArtwork` + `:src`, `enemy_graphic.vue:80-81, 112`).
- Everything above runs inside the 7-10k-line parent render in gens 2-5, which re-renders on any mapper value it
  reads; moving the right panel into child components (D4, D8, D9) is the structural fix and is what slice 6.10 is.

### Cross-area note: gen2's stylesheet contains itself twice
`games/gen2/style.css` lines 17-2600 and 2611-5194 are the same legacy sheet twice (only ~208 of ~2,580 lines
differ; e.g. the movepool block at :2412 and :5017 is byte-identical). The later copy wins the cascade, so the
earlier one is mostly dead weight. A careful de-dup (keep the first copy's rules that the second lacks) is roughly
**-2,400 lines with no pixel change**. Not strictly this area; flag to whoever owns CSS.

## Quick wins

1. **D1** gen5 Hidden Power / Return / Frustration in the movepool — a one-helper bug fix, visible every gen5 run.
2. **D3** gen3 wild panel layout — add the missing classes; fixes a panel that has been visibly broken since legacy.
3. **D2** one speed-label wording (needs Scott's one-word answer) — tiny change, removes a contradictory label.
4. **D9 step 1** gen1's "null / Lv:0" empty slot → hide it like gen2 (no call needed), plus the label/level/faint
   wording once Scott picks.
5. **D11** remove the unreachable branches (gen2 Inventory, gen4 trainer preview + isolation copies, dead fields) —
   ≈ -300 lines, operator-invisible, no behaviour change.
6. **D14** drop gen4's `moves = [...]` render writes and gen5's computed side effect — small, removes two render
   traps before Phase 6 moves the code.
