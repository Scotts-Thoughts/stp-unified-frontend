# Gen 6 (3DS) overlay: implementation plan

Status: **proposed, 2026-11-25. Not approved, nothing built.** The layout was picked by Scott from mockups
(layout "A", `docs/gen6/mockup-a.png`). Everything else in this plan is a recommendation for him to approve.

## 1. Goal

Add a sixth generation to the overlay for the 3DS games: **X / Y** first, then **Omega Ruby / Alpha Sapphire**.
It should look and behave like the gen 4/5 overlay in its Secondary Screen layout. The difference is that the
game area is the 3DS's top screen, and the bottom screen has a correctly shaped 4:3 slot.

The overlay keeps doing everything gens 1–5 do: splits, chapter markers, Super Shuckie bookmarks (if the
emulator supports them), the control server, faults, the timer, settings and shortcuts. "Every generation
changes together" (AGENTS.md) now means six generations.

Not in scope for the first version: Sun/Moon and Ultra Sun/Ultra Moon. They are 3DS games too, with the same
400×240 top screen, so the layout in §3 works for them unchanged. That makes them the natural next step (§9).

## 2. The blocker: where the game data comes from

Gens 1–5 read live memory through **PokeAByte** (or GameHook) and a *mapper* (ARCHITECTURE §1, §3;
`docs/mapper-matrix.md`). Nothing in this repo or its docs says that either tool can read a 3DS emulator.
This has to be settled before any other phase, because every panel depends on it.

**Phase 0 (a spike, about a day):**

1. Find out which 3DS emulator Scott records with (Azahar, Lime3DS or another Citra fork), and whether
   Super Shuckie supports it. If not, bookmarks are out for gen 6, and so is the replay-based debugging that
   AGENTS.md describes.
2. Check whether PokeAByte has a driver that reads that emulator's memory, and whether
   `github.com/PokeAByte/mappers` has X/Y or OR/AS mappers. Look in `STANDARD/`, `EXPERIMENTAL/` and the
   open PRs.
3. If there is no driver or mapper, pick one of these:
   - **(a) Write a mapper and/or driver for PokeAByte.** This is the recommended route, because the overlay's
     whole pipeline (the `GameHookMapperClient`, `MapperProfile`, the canonical view and the parity harness's
     mock PokeAByte) then works unchanged. The mapper needs the party, the enemy party in battle, bag, badges,
     game time, location, battle state and the patch/encounter properties the gen 4/5 `_ne` mappers add.
     Offsets can come from PKHeX (party and box structure, which are encrypted the same way as in Gen 4/5:
     block shuffle plus PRNG XOR) and from the RAM maps the speedrun and randomizer communities use. There is
     **no decompilation** for gen 6, so every offset has to be checked against the running game.
   - **(b) A small Lua or emulator-side script that serves the same JSON shape.** Only if (a) is impossible.
     It would need its own client in `packages/`, and it breaks the "one memory-tool client" rule in
     ARCHITECTURE §2.
4. Write down what was found in `docs/mapper-matrix.md` (a new "gen6" family row) and in a new
   `docs/gen6-inventory.md` (every property gen 6 reads and writes, as the other inventories do).

**Stop after Phase 0 and report to Scott.** If neither (a) nor (b) is feasible, the rest of this plan waits.

## 3. The layout (decided: mockup A)

One 1920×1080 canvas, every element absolutely positioned like gens 1–5. These are the numbers from mockup A v3.
They should live in one place, `games/gen6/layout.ts`, so the art, the CSS and the panels all read the same
values:

| Element | Position and size | Notes |
|---|---|---|
| Top screen (game area) | inner 1200×720 at (360, 19); 2px black border, 358..1562 × 17..741 | 400×240 at exactly 3×. Centred, so both side columns are the same width |
| Side columns | 332px wide: left x 13..345, right x 1575..1907 | 13px to the canvas edge and 13px to the game border, on **both** sides (Gen 4/5: 13px) |
| Top line / bottom line | y 20 / y 1062 | Same as Gen 4/5. The moveset ends at 1060, as in Gen 4/5 |
| Left column, top | timer, badges, faults box: Gen 5 art scaled 0.7905 (332/420), anchored to the top line | |
| Left column, bottom | stats panel (exp, nature, stat tiles): Gen 5 art scaled 0.7905, anchored to the bottom line | |
| Left column, middle | pokéball flush to the canvas edge, behind the stats as in Gen 5; type pill on the ball; species art standing in the ball, ~440px tall | The art's slider transform (`SpeciesArt`) still applies per species |
| Right panel | x 1575..1907, y 18..741 (frame bottom lined up with the game border's bottom) | The **one** right-panel slot: movepool, enemy team, splits or trainer preview take turns in it, exactly as in Gen 5 (`rightPanelMode.ts`). It is never split into two panels |
| Movepool table | fills the frame; rows fitted with `movepoolFitStyle` | Gen 5 `.movepoolDemo` look: Play bold, header in the lead's type colour with a 2px black outline, alternating rows |
| Bottom screen | inner 404×303 (exactly 4:3) at (1501, 757); 2px border, 1499..1907 × 755..1062 | Right and bottom edges sit on the same margins as everything else. 14px under the game border |
| Ability / held item band | x 361..1486 (Gen 5 band ×1.1008), y ≈ 761 | |
| Moveset | x 361..1486 (Gen 5 moveset ×1.1008), y ≈ 862..1060 | Ends 13px before the bottom screen's border |
| Shadows | every panel `filter: drop-shadow(0px 1px 1px)`; game areas `drop-shadow(0 0 1px #000000c5)` | As in Gen 5 |

What this means for the right panel's content: the column is 332px instead of Gen 5's 415px (0.8×). The enemy
team panel (`EnemyTeamPanel`, `enemyPanel.ts`) needs a gen 6 layout at that width, the same way Webcam Mode
already makes a short version (`webcamMode.ts`, `WEBCAM_FRAME_BOTTOM`). The frame bottom becomes 741 instead
of 730. The splits panel gets the same treatment.

The tutor and split rules of the Secondary Screen movepool (`secondScreen.ts`: `SECOND_SCREEN_TUTOR_LIMIT`,
`SECOND_SCREEN_SPLIT_LIMIT`) carry over. The limits should be re-measured, because the gen 6 frame is 723px
tall (Gen 5's is 712) but 0.8× as wide.

## 4. How to build the module (recommendation)

**Build gen 6 as a new, refactored generation, not as a copy of `games/gen5/Overlay.vue`.** Gens 2–5 are
"lifted" legacy components of 7,000–10,000 lines that Phase 6 is breaking up. A fifth copy would add more of
the code that work is trying to remove, and would double every future fix to Gen 5's quirks. The shared pieces
gen 6 needs already exist:

- **Player panel:** `core/overlay/player/` (`FaultsBox`, `GameClock`, `StatTiles`, `ExpBar`, `BadgeRow`,
  `MoveList`, `PopupBox`, `SpeciesArt`, `TypeBadges`, `InfoRow`), each fed by a `games/gen6/playerPanel.ts`
  modelled on gen 5's.
- **Right panel:** `Movepool.vue` and `movepoolView.ts`, `EnemyTeamPanel.ts` and `enemyTeamView.ts`,
  `SplitsPanel.vue`, `rightPanelMode.ts`, `trainerPreview.ts`.
- **Battle maths:** `core/logic/` (`battleSpeed`, `moveAccuracy`, `movePower`, `typeMatchups`, `expCurve`,
  `struggle`, `ohkoAccuracy`, `twoTrainerBattle`, `sendOutOrder`).
- **Run plumbing:** `resetGuard`, `newRunGuard`, `faultMode`, `battleMarkers`, `obs`, `shuckieBookmarks`,
  `splitComparison`, `core/control/`, `core/settings/`, `core/shortcuts/`, `core/persistence/`.
- **Look:** `backgroundTexture.ts`, `textureLooks.ts`, `shared-gen345.css` / `shared-gen45.css` (gen 6 joins
  the gen45 sheet as a third member, or gets a `shared-gen456.css`; `npm run css:share` decides).

Where gen 5 keeps logic only inside its `Overlay.vue` (stat calculation, ability and item effects on the stats
panel, battle-state reading, the run state machine), move it into `core/` as it is needed, with a `tsx`
self-test. Then gen 5 can call it later, which is a Phase 6 step. Gen 1's refactored module
(`games/gen1/`, `components/Overlay.vue` ~200 lines, Pinia stores) is the model for the file structure.

## 5. Phases

Each phase ends with something Scott can look at, and with `npm run typecheck` passing.

### Phase 0: data source (blocker)
See §2. Report, then stop until Scott approves the route.

### Phase 1: art and a static layout page
- `public/images/gen6/ui/`: the gen 5 SVGs (`timer.svg`, `badges.svg`, `stats.svg`, `stats_values.svg`,
  `exp_bar.svg`, `nature_friendship.svg`, `ability_helditem.svg`, `moveset.svg`, `movepool.svg`, `opponent.svg`,
  `enemy_ui/*`, `move_backgrounds.webp`) redrawn at the §3 positions. Most are a scale and a translate of the
  gen 5 file. The movepool frame and `opponent.svg` are redrawn to 332×723. `game_area.svg` becomes
  1200×720 and `second_screen_game_area.svg` becomes 404×303, still on whole pixels.
- Keep the files grey, coloured by `.colored-image::after` like gens 4/5 (`--overlay-color`, mix-blend
  `color`). The grey is what makes per-species colouring work.
- `games/gen6/layout.ts` with the §3 numbers, and a dev-only static page that draws the art with sample data.
  Compare it with `docs/gen6/mockup-a.png`. **Scott signs off on the look here,** before any wiring.

### Phase 2: module skeleton and detection
- `games/gen6/manifest.ts` (editions X, Y, Omega Ruby, Alpha Sapphire; box art, icons, split folders),
  `index.ts` (`GameModule`), `mappers/` (`MapperProfile`s and `*-paths.ts` for whatever Phase 0 produced),
  and a `gen6Manifest` entry in `games/registry.ts`.
- `GameSelect` box-art tiles for the four games.
- Verify: loading the mapper detects gen 6 and mounts an empty overlay. The unsupported-mapper path still
  works for anything else.

### Phase 3: data
- `games/gen6/data/`: Pokédex (721 species, Fairy type, gen 6 base stats, which changed for some older
  species), moves (gen 6 power/accuracy/PP/type changes), learnsets and TM/HM lists for X/Y and OR/AS,
  abilities, items, trainers (teams, levels, held items, AI) for both game pairs, encounter data if the
  overlay needs it, and the gen 6 type chart (Fairy; Steel no longer resists Ghost and Dark).
- Source: there is no decompilation, so use PKHeX's resources and the games' own extracted data (pk3DS can
  dump personal, learnset and trainer files). Cross-check against Bulbapedia, and record the source of each
  table in `ARCHITECTURE.md` §6.
- Species art: `images/gen6/pokemon/` (Gen 5 has 533 pictures; gen 6 needs all 721 plus Mega forms and
  form variants), type icons with Fairy, item sprites.
- Keep the data tables out of the main chunk, as the other generations do (lazy chunks per table).

### Phase 4: player panel and bottom centre
- `games/gen6/playerPanel.ts`: faults, clock, badges (8 per game; new badge art), stats tiles (with the EV
  gauge), exp bar, nature/friendship rows, ability/held item, moveset, popups (accuracy/evasion, weather,
  field), species art, type badges.
- Gen 6 rules the stats panel must get right: the exp formula (gen 6 goes back to the non-scaled formula, and
  Exp. Share is party-wide), the 1.5× critical hit, and Mega Evolution (stats, ability and type change in
  battle; the art should switch to the Mega form).

### Phase 5: right panel
- Movepool (the §3 frame, `movepoolFitStyle`, the Secondary Screen tutor/split rules), enemy team (a gen 6
  `enemyPanel.ts` at 332px, the six-slot party layout, speed comparison, sprites), splits, trainer preview.
- Double, triple, rotation and horde battles exist in gen 6. Decide per battle type what the enemy panel
  shows (gen 5 already turns off the in-battle calculation in doubles). Ask Scott (§8).

### Phase 6: run plumbing
- Splits (one CSV per run, simple format, `getFinishFileName()` and evolution lines as in gens 3–5),
  chapter markers (`chapterMarkers.ts`, critical item and new move markers), resets through `confirmReset`,
  new-run guard, `/status` and control routes (`control.ts`), the settings panel (`settingsPanel.ts`, with
  Right Panel Layout fixed to Secondary Screen), and the shortcut actions (`actions.ts`).
- Update `docs/external-contracts.md` for anything the queuer or OBS sees (generation 6 in `/status`, split
  folder names).

### Phase 7: verification
- Record a gen 6 fixture for the parity harness (`docs/parity-harness.md`): a short session through the
  first gym, with a trainer battle, a level-up, an evolution and a reset. Gen 6 has no legacy baseline, so
  the first run *becomes* the baseline. Scott checks the captures by eye once, and later changes are compared
  against them.
- Add `tsx` self-tests for every new `core/logic` rule, and `parity:*` scripts for them in `package.json`.
- Run `npm run typecheck`, `npm run parity:drift` (gens 2–5 must not change) and the gen 5 harness, to prove
  that shared code moved into `core/` did not change gen 5's output.

## 6. Shared code that changes

- `games/registry.ts` (a sixth manifest), `main.ts` only if detection needs a new identity flavour.
- `core/logic/typeMatchups.ts` (Fairy, and the Steel change by generation), `expCurve.ts` (no change expected),
  `movePower.ts` and `moveAccuracy.ts` (gen 6 move changes), `battleSpeed.ts` (gen 6 speed rules, Gale Wings,
  Mega Evolution timing).
- The Secondary Screen code in `secondScreen.ts`, and the right-panel shortening in `webcamMode.ts`: make the
  frame bottom a per-generation value (730 for gens 4–5, 741 for gen 6) instead of one constant.
- Every cross-generation feature added after this plan is approved must include gen 6.

## 7. Risks

- **Phase 0 finds no data source.** Then nothing else can start. This is the main risk.
- **Mapper offsets with no decompilation.** Every offset needs a test against the running game. Battle
  structures (enemy party, battle type, Mega state) are the hardest part.
- **Text at 0.79× scale.** The side panels' text is about 20% smaller than gen 5's. The stat numbers are
  still large, but the movepool rows go from 13px to about 10.4px. Check this at stream resolution in
  Phase 1. If it's too small, the fix is fewer columns (for example, drop DC or PP) rather than a smaller
  game screen.
- **Bigger data.** 721 species plus forms, and two game pairs with different trainers.
- **The bottom screen in OBS.** The overlay only draws the frame. The OBS scene must crop the emulator's
  bottom screen to 404×303. That is a non-integer scale of 320×240 (1.2625×), so set OBS to bilinear or
  area scaling for that source.

## 8. Questions for Scott (with my recommendation)

1. **Which games first?** I recommend X/Y, then OR/AS, then Sun/Moon in a later plan.
2. **Which emulator,** and does Super Shuckie support it? (Phase 0 answers this.)
3. **Double/triple/horde battles:** I recommend showing the enemy team as gen 5 does in doubles (no in-battle
   calculation), and treating hordes as wild battles.
4. **Mega Evolution:** I recommend switching the art and stats to the Mega form while it is active in battle.
5. **Movepool columns at 332px:** keep all seven (as in the mockup), or drop one for bigger text? I recommend
   keeping all seven unless the Phase 1 check says otherwise.

## 9. Later

- Sun/Moon and Ultra Sun/Ultra Moon reuse this layout and most of the module (same 400×240 top screen).
- If gen 6 proves the refactored structure, it is the template for finishing Phase 6 on gens 2–5.

## References

- Mockups and the script that drew them: `docs/gen6/` (`mockup-a.png` is the chosen layout).
- Gen 5 Secondary Screen: `core/logic/secondScreen.ts`, `core/logic/webcamMode.ts`, `games/gen5/Overlay.vue`
  (top of the template), `games/gen5/style.css` (`.movepoolDemo`, `.movepoolLabel`), `core/styles/shared-gen45.css`
  (`.colored-image::after`).
- ARCHITECTURE §3 (detection), §4 (generations), §5 (Phase 6), §6 (data), §12 (verifying), §13 (documents).
