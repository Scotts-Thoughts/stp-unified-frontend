# UI uniformity: plan

Status: **approved direction 2026-10-14; Scott answered all of §6 the same day. Nothing built.** Where an
audit report's proposal and §6 differ, §6 wins.
Detail, with `file:line` evidence for every claim, is in the five audit reports in `docs/ui-audit/`:
A settings panel structure, B control styling and the CSS, C on-stream player side, D right panel and battle views,
E editors, pop-ups and other windows. IDs below (A1, D4…) point into those reports.

## 1. Goal

Decision 26 is a guideline since 2026-10-14 (`docs/IMPLEMENTATION_PLAN.md` §5). Scott's aims:

1. **One user experience.** The same control looks and behaves the same in every generation.
2. **Fewer lines of code.** Shared components and shared CSS instead of five copies.
3. **Better performance.**
4. Every control stays **clear** and **does what it did**.

The first piece is already agreed in principle: one searchable species picker (`core/overlay/SpeciesPicker.vue`)
replacing the five "Solo Pokemon" pickers (§4, step 2.1).

## 2. Ground rules

- **Operator UI vs on-stream UI.** The settings panel, editors and dev tools are Scott's working area; OBS lays the
  game capture over the panel. They can be unified freely. Anything viewers see (timer, badges, stats, moves,
  movepool, enemy panel, splits panel, pop-ups) changes how every video series looks, so **each on-stream change
  needs Scott's yes** (§6.2).
- **A move and a rewrite never share a commit.** Build a shared component as a pure move first (harness: no
  difference), then make the visible change in its own commit with its own harness diff.
- **Never rename** CSS classes, element ids, saved-setting keys, `/status` fields, split CSV columns, marker names, or
  shortcut action ids (`user_state.json` stores them). A shared component keeps every existing class and id on its
  element and may add new ones. A dropdown option may change its *label* but never its stored *value*.
- **Game quirks stay** (gen1's single Spc. and crit rate, no abilities or natures in gens 1–2, DC only from gen4,
  badge boosts only in gens 1–3, the RNG helper only where the ROM patch has it…). Code quirks are fixed and logged
  in `docs/known-legacy-bugs.md`.
- **Differences become data**, never `if (gen === …)` in `core/`. Each generation hands a shared component its lists,
  labels, class map and ranges.
- Expected harness churn: almost every operator change moves the layout and pixel oracles inside the panel region.
  That is fine **only** when oracles 3–9 (splits, saved state, writes, markers, console, `/status`) are unchanged.
  `tools/parity/manual-ivs-check.ts` needs the `manual_iv_input`/`manual_dv_input` fields in order, one
  Automatic/Manual dropdown, and the "Hidden Power: X (Y)" text.

## 3. Where things stand (2026-10-14)

- **CSS:** 20,849 lines across the five `style.css` files. About **43%** (8,954 lines) can never apply: rules whose
  selectors match nothing, and rules a later copy overrides. gen2's file is the whole legacy stylesheet pasted twice
  (5,470 lines, 2,199 needed). After that, about 2,080 live lines are still exact copies between generations (B1, B6).
- **Settings panels:** about 2,400 template lines in five layouts (3, 4 or 5 columns), plus about 1,100 lines of
  `games/genN/actions.ts` that list the same controls again for the Keyboard Shortcuts window (A1, A2).
- **Copies:** the movepool table is written out 11 times (D4); the faults box, the clock, the exp curves and the
  stage formatter 5 times each (C1, C2, C5, C6); gen4/5's RNG modal 2 × 217 CSS lines (E7).
- **Performance:** in gens 2–5 the settings panel, movepool, move rows and enemy panel re-render with the whole
  7–10k-line overlay on every mapper change (E9, D14, C3). Examples: gen2 runs 16 power calculations per render for
  four moves; gen4 writes `data()` during render; gen5 changes a setting inside a computed. 20–33 full-screen,
  filtered and blended art layers per generation are the largest unmeasured paint cost (B8).
- **Real bugs found on the way** (§4 stage 1): gen5's movepool never shows Hidden Power's type or Return/Frustration
  power (D1); gen5 prints a stray "nu" over a stat tile (C5); gen5 shows its Debugging block to everyone (A8); gen3's
  wild-battle panel is laid out wrong, as it was in the legacy app (D3); gen4/5's "Reset ALL to Defaults" wipes every
  species' styling with no confirmation (E4); gen2/gen3 write a file to disk on every slider step in dev builds (E2);
  gen4's speed label means the opposite of the other four generations (D2).

## 4. Order of work

Each step lists its audit IDs. Sizes: S < 1 h, M half a day, L several days.

### Stage 1: fixes and dead code (no decision needed, little or no visible change)

| Step | What | IDs | Size |
|---|---|---|---|
| 1.1 | gen5 movepool reads `move`/`Move` (Hidden Power, Return, Frustration) | D1 | S |
| 1.2 | Shared `formatStage()` in `core/logic/`, removes gen5's "nu" and five copies | C5 | S |
| 1.3 | gen5's Debugging block also needs Show Advanced Settings, like gen4 | A8 | S |
| 1.4 | gen3 wild panel gets the trainer slot's classes and art | D3 | S |
| 1.5 | "Reset ALL to Defaults" needs a second click (gen4/5) | E4 | S |
| 1.6 | Debounced style writes in gen2/gen3; sliders save numbers (`.number`) | E2 | S |
| 1.7 | Render traps: gen4's `moves = [...]` in templates, gen5's setting write in `battlePokemonCrop`, gen3/4 per-`<td>` tutor `v-if`s, gen4/5 move rows as one `v-for`, gen2 move cells built once | D14, C3 | S–M |
| 1.8 | Hide gen1's empty enemy slot ("null / Lv:0") like gen2 | D9 | S |
| 1.9 | Wording and typos in the operator panel ("Compare splits::", "Blackouts?:", "Force Route 1 HM Users", gen5 "Input move 1", D/P's empty "Encounters:", "Pause/Resume"), gen1's duplicate Load button | A3, A6, E6 | S |
| 1.10 | Delete what nothing can reach: gen2 Inventory branch, gen4 trainer preview and isolation tables, gen5 `right_display` remnants, dead fields, gen3 `gamestate` gate, gen5 `ShuckieTimer.js`, leftover methods, the six dead resize-handle CSS blocks | D11, E11, E8, C2 | S |
| 1.11 | Invalid CSS (`line-height: 13x/14x`, `0 0x`, repeated properties) | B7 | S |

One commit per row (or per generation for 1.7, 1.10). Log each code-quirk fix in `known-legacy-bugs.md`.

### Stage 2: delete the CSS that can never apply

| Step | What | IDs | Size |
|---|---|---|---|
| 2.0 | Write a dead/overridden-rule finder in `tools/css/` (postcss, the repo's own; strips `.gen-N`, treats run-time-built classes as live). The audit's throwaway scripts were not kept | B1 | S |
| 2.1–2.5 | One generation per commit: remove dead rules, overridden rules and commented-out CSS. gen2 first (5,470 → ~2,200). Target ~11,900 lines in total | B1 | M |

Proof: harness pixels, layout and rects show **zero** difference per generation; check by hand the dev-only screens
no fixture reaches (Style Mode, battle testing, RNG modal). Remove the stale "re-run the tool" headers. This stage
comes before any CSS sharing, so nothing dead gets moved.

### Stage 3: shared operator controls (operator-only)

Order: the most-used control first, then shared styling, then panel groups.

| Step | What | IDs | Size |
|---|---|---|---|
| 3.1 | **`SpeciesPicker.vue`**: one searchable dropdown (type to filter; prefix matches first; ignores case, spaces and punctuation; ↑/↓, Enter, Esc; only a listed name can be chosen). Filtering inside the child, so typing no longer re-renders the overlay. Keeps each generation's `@change` side effects and `/set-starter` | (§1) | M |
| 3.0 | **Style mock-up:** one page showing three directions (dark glass, light frosted, tinted with the overlay's UI colour) on a real overlay screenshot, all inside the game-capture area. Scott picks one before 3.2 (§6 items 3, 4) | B2, B4 | S–M |
| 3.2 | **`core/styles/controls.css`** with tokens, in the chosen new style; every dropdown, button, field, checkbox and counter in one look; the 88 inline control styles become classes; New Run as the primary button | B2, B3, B5, B4 | M |
| 3.3 | `EditionPicker.vue` from `manifest.editions` (the start screen's box art) | E5, A4 | S–M |
| 3.4 | `TimerControls.vue`: Play/Pause, Set Timer, Start Time Offset + Clear | A5 | S |
| 3.5 | `SplitComparison.vue` + `CounterTable.vue` | A6, E6 | M |
| 3.6 | `StylePanel.vue`: UI colour, Pokémon image, background, in one order with one set of labels | E1, A12 | M |
| 3.7 | `PokemonEditor.vue`, `DevToolsBox.vue`, `RngTrips` (one shared pop-up, ~330 lines less) | E3, E4, E7, A13 | M |
| 3.8 | `EncounterLists.vue` fed by per-game `[field, location, species]` lists; gen5's HM-user locations looked up and confirmed by Scott; gen2 gains "HP Banned for 1st Run" | A10, A9 | M |
| 3.9 | One operator look for the start screen, the Shortcuts window and dev boxes (`core/styles/operator.css`) | E10 | S |

### Stage 4: one panel layout, one list of controls (with Phase 6.2)

| Step | What | IDs | Size |
|---|---|---|---|
| 4.1 | Phase 6.2's cut: each generation's settings columns become child components (no DOM change). Stops the panel re-rendering with the overlay | E9 | M per gen |
| 4.2 | `SettingControl` descriptors: one list per generation feeds both the panel and the Keyboard Shortcuts window, with a self-test that the action-id set is unchanged | A2 | M |
| 4.3 | One four-column layout (Run · Solo Pokémon · Style · Display), one Advanced rule, Display dropdowns and toggles in one order | A1, A7, A9, A11 | L |

### Stage 5: shared on-stream components (move first, then the approved look)

Each row is a Phase 6 slice (6.10 is the right panel, 6.5 the splits) followed by a separate uniformity commit for
what Scott approves in §6.2.

| Step | What | IDs | Size |
|---|---|---|---|
| 5.1 | `Movepool.vue` (11 copies → 1, ~800 lines less), one cross-out rule (gen1 gains it: Double Team), one fit rule (normal rows, shrink only on overflow) | D4, D5, D6 | L |
| 5.2 | One right-panel mode model (gen1's: a saved preference + a post-battle Splits override that is never saved) | D7, D10 | M |
| 5.3 | `SplitsPanel.vue` | D8 | M |
| 5.4 | Enemy panel: one wording and faint style, then `EnemyTeamPanel.vue`; one speed-label helper; then a trainer-preview mode for every generation (replaces gen2's "Trainers") | D9, D2, D14, D11 | S then L |
| 5.5 | Player side: `FaultsBox`, `GameClock`, `MoveRow` (+ Struggle everywhere), `PopupBox`, `StatTiles` (sizes per platform), `ExpBar` + `expCurve.ts`, `BadgeRow`, `SpeciesArt`/`TypeBadges`, `InfoRow` | C1–C9 | M each |
| 5.5b | **New:** at run end in Gen2, Emerald, HG/SS, Black and White, the final in-game play time replaces the type badges (§6 item 24). Find each game's play-time property in its mapper first | C8 | M |
| 5.6 | Share the CSS that is identical across gens 3–5 / 4–5 (`core/styles/shared-gen345.css`) | B6 | M–L |
| 5.7 | Measure the full-screen art layers (DevTools); then decide on merging, and drop gen4/5's doubled layer | B8, C10 | S + M |

### Rough totals (estimates from the audits, not measured)

CSS about −11,000 lines (stage 2 −8,950, then sharing). Templates and helpers about −5,000 (settings ~−1,400 with
`actions.ts` −400; movepool −800; enemy panel −1,000; splits −390; player side −1,000; editors, RNG, dead code
−1,000). Performance: the panel, movepool, move rows and enemy panel stop re-rendering with the whole overlay.

## 5. Verification per step

- Always `npm run typecheck`; `npm run parity:drift` after any gen2–5 overlay or mixin edit (a removed or moved
  member needs its allowlist entry updated).
- Harness for each affected generation against a `HEAD` worktree baseline (ARCHITECTURE §12). For a pure move or a
  dead-code removal: zero difference. For a visible change: the difference is only the intended one, and oracles 3–9
  are unchanged.
- gen2 has no committed fixture (its recording is in the gitignored `tools/fixtures/raw/`); gen4's fixture has no
  player battle data, so gen4's player side in battle cannot be checked by the harness (C, fixture notes).
- Hand checks where no fixture reaches: dev tools, editors, the RNG modal, typing in the species picker.
- Performance claims are measured (render counter, DevTools), not assumed.

## 6. Scott's decisions (interview, 2026-10-14)

All 32 questions are answered. The audit IDs are in brackets; "as proposed" means the recommendation in the audit
report.

### 6.1 Operator UI

1. **Layout:** four columns, Run · Solo Pokémon · Style · Display, in every generation. The **counters and split
   comparison stay in column 2**, under the species picker, where gens 2–5 have them today. (A1)
   Column 1: Game, New Run, Timer, Folders/Keyboard Shortcuts, Advanced, Readouts. Column 2: Species picker, split
   comparison, counters, Evolution, Form, DVs/IVs + Hidden Power, Gender/Ability, Nature, Run rules, Encounters.
2. **Show Advanced Settings** as proposed: Super Shuckie, Automatic Post-Battle Splits, run modes (Test Run,
   Re-filming, No Increment), Pokémon Editor and Debugging sit under it; Right Panel and Compare Splits are always
   visible. (A7)
3. **Control look: a new, polished, modern style** (none of today's five). It must stay inside the game-capture area
   so nothing reaches the filmed part. Mock up first; Scott asked to see three directions side by side on a real
   overlay screenshot: dark glass panels, light frosted panels, and panels tinted with the overlay's UI colour. (B2,
   B3)
4. **Panel boxes and label casing:** whatever fits the new style (decided with the mock-up). (B4)
5. **New Run** is a primary button, larger and emphasised, in all five. (B5)
6. **Box-art game picker** in all five, from the start screen's art. (E5)
7. Every generation gets **Clear loaded splits**, the **Previous/Current label boxes**, and **Followup + Summary**
   (where that generation has the battle-summary data; check each). (A6, E6)
8. **Pokémon Editor** under Show Advanced Settings in all five, in the packaged app too. (E3)
9. **RNG trips stays a pop-up** (one shared component for Platinum and White 2), not an in-panel section. (E7)
10. **Keyboard Shortcuts window** matches the new style. (E10)
11. **Live readouts** (party count, overworld HP, status, EVs / stat experience) always visible, in all five, gen1
    included. (A8)
12. **Style sliders:** add the missing controls (rotation in gen2, vertical background flip in gen4/5, working rotation
    on Red/Blue) and use the widest range each slider has in any generation. (E1)
13. **F-key-only options go into their dropdowns** (gen2 "Hidden Power" stats, gen4 "Detailed EVs", gen5 "Movepool").
    (A11)
14. gen3's "Inventory" and "Movepool+" go. **Build a proper trainer preview** ("look up a trainer's team") for every
    generation later, as a mode of the shared enemy panel (step 5.4); gen2's "Trainers" option becomes that. (D11)
15. Facts:
    - **gen2 gets "HP Banned for 1st Run"**, like gens 3–5. (A9)
    - **gen5's patch does not support guaranteed catches**: no switch in gen5. (A10)
    - **gen5's forced HM users get locations**: work them out from the gen5 patch or mapper and have Scott confirm
      the list. (A10)
    - **gen1 gets Unobtainable Moves**; the list is only **Double Team** (banned by Scott's run rules). (D5)

### 6.2 On-stream

16. **Speed label:** Outsped / Speed-tie / Outspeeds (describing the enemy) in all five; gen4 changes. (D2)
17. **Faults box:** gens 1–4's rules in gen5 too ("faults" at zero, two boxes only when both counters are above zero),
    and every generation shrinks a 3- or 4-digit count like gen1. (C1)
18. **Timer caption:** "time played at 4x game speed" (no hyphen) everywhere. (C2)
19. **Move list:** Title Case column headers like the movepool (DC only in gens 4–5), and a **Struggle row in every
    generation** with each game's real power and type (check the decomps). (C3)
20. **Pop-ups:** lowercase captions with no colon ("accuracy", "evasion", "repel steps"), signed values ("+1"); gen2's
    repel and bonk counters follow only their own toggles. (C4, D12)
21. **Stats header:** one naming in all five ("Base Stat Averages", "Base Stat Medians", "DVs"/"IVs",
    "EVs"/"Stat Experience"). **Tile font sizes are per platform**: Game Boy (gen1 and gen2 share one set), GBA
    (gen3), DS (gen4 and gen5 share one set). (C5)
22. **Exp bar label:** "Exp:" everywhere. (C6)
23. **Badges fade in** everywhere (gens 3 and 4 gain it). (C7)
24. **Species art cross-fades** on a species change in all five. **New, at run end:** in Gen2 (Crystal and
    Gold/Silver), Emerald, HeartGold/SoulSilver, Black and White, the type badges hide and the **final in-game play
    time** (hours:minutes) shows in their place. Those are the games whose Hall of Fame doesn't show the player's play
    time. Other games keep today's run-end behaviour. (C8)
25. gen3 shows **"Total:"** in Base Stats/IVs/EVs modes, like gens 4–5. (C9)
26. **Enemy panel:** "HP, Atk., Def., SpA., SpD., Spe." (gen1 keeps Spc./Crit.), "Lv:12", fainted Pokémon greyscale at
    half opacity. (D9)
27. **Right panel:** Automatic / Movepool / Splits in all five (old saved values mapped on read: "Battle Graphic" →
    Automatic, "Wild" → Automatic + wild on), the post-battle Splits switch is never saved, and "Movepool" keeps the
    movepool up during gen4 battles. (D7)
28. **Short movepool: normal rows, space below** (gens 1–3's rule) everywhere; gens 4–5 stop stretching. Long lists
    still shrink to fit. (D6)
29. **Splits panel: gens 3–5's look** (compact rows at natural height) with gens 3/5's **underlined header and 1px
    outline**. (D8)
30. **Wild-Pokémon panel:** an opt-in "Wild battles" checkbox in all five, off by default; a saved choice is kept.
    (D10)
31. **Doubled panel layers** (gen4 moveset, gen5 stats): remove only if a side-by-side shows no visible difference to
    Scott. (C10)
32. **Art layers:** measure with DevTools first, then bring Scott the numbers and a side-by-side before changing
    anything. (B8)

#### 5.7 measurements for decisions 31 and 32 (2026-10-15)

Measured on today's working tree (a snapshot build), five runs each, middle value reported. Tool:
`npm run parity:art-layers` (`tools/parity/art-layers-check.ts`). It replays each generation's harness fixture, then
measures in the running app. Full numbers: `tools/reports/art-layers/summary.md` (local, not in git). Nothing in the
overlays was changed.

**What the "art layers" are.** The coloured panel frames are drawn as stacked see-through pictures the size of the
whole screen. Each one has a shadow filter and a colour tint on top. Visible at once: gen1 4, gen2 6, gen3 10,
gen4 12, gen5 12.

**Cost when the overlay colour changes** (species swap, evolution, colour picker). The tint fades over 0.75 s
(gen2: 1 s).
- Each frame of the fade costs the graphics side 27–34 ms (gen1 has no fade: one 40 ms frame). A smooth 60 fps
  frame has about 17 ms.
- So the fade plays at roughly 35–45 frames a second instead of 60: 26–38 frames where 45–60 would be smooth.
- With the shadows and the tint blend turned off it gets smoother (38–61 frames), but each frame still costs
  15–26 ms.
- **Most of the cost is the number of full-screen layers, not the shadow or blend effects.**
- It lasts under a second and only happens on a colour change.

**Cost while idle with the clock running.**
- **Frames:** every generation kept its full frame rate (gen4 varied between runs, with or without the layers).
- **Graphics work per frame:**

  | | as is | without the layers | the layers' share |
  |---|---|---|---|
  | gen1 | 3.3 ms | 1.4 ms | 1.9 ms |
  | gen2 | 3.5 ms | 1.3 ms | 2.2 ms |
  | gen3 | 3.8 ms | 1.2 ms | 2.6 ms |
  | gen4 | 6.6 ms | 1.5 ms | 5.1 ms |
  | gen5 | 5.9 ms | 3.7 ms | 2.2 ms |

  That is 10–30% of a frame's budget.
- **Shadows and blend:** turning them off saves only 0.4–1.6 ms of that per frame.
- **Other parts of the overlay:** these layers barely change their work.
- **Caveat:** these are times measured on the computer's processor. The time the graphics card itself spends was not
  measured.

**The doubled layer (decision 31) is visible.** It is not just a slightly stronger shadow edge, as the audit guessed.

| | Pixels changed | Largest change | What you see |
|---|---|---|---|
| gen4 moveset panel | 185,000 | 19 of 255 | The whole panel turns slightly more see-through |
| gen5 stats panel | 116,000 | 54 of 255 | The frame turns more see-through; the "HP / Atk. / Spe." captions turn fainter |

Two shots of the unchanged overlay differ by 0–5 pixels, so these differences are real.

A possible same-look replacement is one copy at 99% opacity:
- **gen4:** close to identical (largest change 14; 268 pixels change by more than 8).
- **gen5:** still visible on the captions (largest change 44).

Side-by-side pictures, unchanged on top and second copy removed below:
- `tools/reports/art-layers/gen4/c10-panel-as-is-top-hidden-bottom.png`
- `tools/reports/art-layers/gen5/c10-panel-as-is-top-hidden-bottom.png`

Close-ups and difference images are in the same folders:
- `c10-zoom-4x-as-is-left-hidden-right.png`
- `c10-crop-difference-x8.png`
- `c10-crop-difference-x8-opacity-099.png`

**Recommendation (both decisions stay open for Scott):**
- **32:** leave the art layers alone for now.
  - The idle cost is small, and the frame rate held at idle.
  - The colour fade drops to about 35–45 fps for under a second, on events that are rare in a run.
  - If OBS ever shows dropped frames with the overlay up, the change that would help is fewer layers: merge the
    frames that share a colour into one layer. Removing the shadows would not help.
- **31:** keep both copies. Removing one changes the look, so it fails the "no visible difference" condition.
  - For gen4 only, "one copy at 99% opacity" is close to invisible, if Scott wants the one-layer saving
    (about 0.4 ms per idle frame) after looking at the gen4 pictures.

## 7. Status

Done 2026-10-14/15, uncommitted, each step verified with the harness; snapshots and per-step harness results in
`docs/ui-uniformity-log.md` (T0-T10), the code-quirk fixes in `docs/known-legacy-bugs.md` #88-#145.

| Stage | State |
|---|---|
| 1 Fixes and dead code | done (T1) |
| 2 Dead CSS | done (T2, fixed in T3; re-run after stage 5 in T10). `npm run css:dead` |
| 3 Shared operator controls | done (T3): `core/settings/`, Panel Style themes, species and box-art pickers |
| 4 Panel layout | done (T3): `games/genN/settingsPanel.ts` feeds the panel and the Keyboard Shortcuts window; missing style controls (decision 12) in T5 |
| 5 On-stream components | done: 5.1 Movepool (T4/T5), 5.5a faults box + clock (T4/T5), 5.3 Splits panel and 5.5c stat tiles/exp bar/badges (T6/T7), 5.5b move list + pop-ups (T7/T8), 5.4 enemy panel + trainer preview and 5.5d species art/type badges/run-end play time (T8/T9), 5.2 right-panel model (T9), 5.6 shared gen3-5 CSS (T9; `npm run css:share`), 5.7 measured (§6.2 under decision 32) |

Open, for Scott:
- Decision 31 is settled by its own rule: the side-by-side shows the doubled layers are visible, so both stay.
  Decision 32: measured (see above); recommendation is to leave the art layers as they are.
- gen5 HM-user encounter locations (decision 15) to confirm: B/W Route 3 Pidove, Wellspring Cave Woobat and
  Roggenrola, Pinwheel Forest Tympole and Timburr; B2/W2 Floccesy Ranch Psyduck and Pidove (#113: the B2/W2 mapper
  flags are commented out).
- Run-end play time: FireRed/LeafGreen and Black 2/White 2 already showed the play-time box at run end (their Hall
  of Fame shows the time too); kept, per "other games unchanged". HeartGold/SoulSilver's box has never been on
  screen before and was placed by gen5's offset: check it by eye.
- `/status` now reports the saved right-panel choice all run, with the panel actually shown in a new
  `right_panel_active` field (`docs/external-contracts.md`).
- Not reached by any fixture (check by hand): pop-ups in gens 1-2, the Struggle row, Followup + Summary, the wild
  panel (opt-in) in gens 2/4/5, the trainer preview, the run-end play time, typing in the species picker.
