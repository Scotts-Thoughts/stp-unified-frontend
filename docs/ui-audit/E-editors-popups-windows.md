# E — Editors, style tools, popups and windows audit

> Snapshot of the 2026-10-14 UI audit (read-only, against the working tree of that day). Line numbers drift as
> the work in `docs/ui-uniformity-plan.md` lands; re-check any `file:line` before relying on it. Mark a finding
> done in the plan, not here.

Scope: everything outside the main settings controls and the on-stream panels. That means the ROM-writing
Pokémon editors and debug readouts, gen3's "Show optimization UI", the Style Mode and style-defaults tools,
the colour picker, the Pokémon image and background slider groups, the edition picker inside the panel, the
split comparison loader, the enemy sprite resize handle, the RNG modal, the box-art GameSelect screen, the
Keyboard Shortcuts window, and how the panels are shown and hidden.

Paths are short: `gN:` means `src/renderer/games/genN/Overlay.vue` (template line), and `cmp/` means
`src/renderer/components/`. Every line number was read from the current working tree on 2026-10-14. The
screenshots are a month old, and the comparison button labels in them ("Split Comparison", "Load split file to
compare splits") have since been changed.

## Inventory

**Edition picker, GameSelect and the shortcuts window**

| Element | gen1 | gen2 | gen3 | gen4 | gen5 |
|---|---|---|---|---|---|
| Edition picker in the panel | `<select>` Yellow/Red/Blue, `cmp/settings/interface_1.vue:3` | `<select>` Crystal / Gold & Silver, g2:57 | box-art tiles, `images/gen3/box_art/` (FireRed art only, not the FR+LG pair), g3:154, tiles 130 px | tiles, `images/gen4/box_art/` (2 jpg + 1 webp), g4:96, tiles 90 px, order Plat/HGSS/DP | tiles, path built inline `5-${game.replace(' ','')}`, g5:69, tiles 66 px |
| Box-art CSS | — | — | `.gen-3 .gameToggle*` style.css:411-445 | gen4 style.css:375-409 | gen5 style.css:396-430 (same rules, different widths) |
| GameSelect screen (shell) | `cmp/GameSelect.vue`: one shared screen, art from `images/box_art/` via `manifest.editions`. The in-panel pickers use different art and a different order, and don't share its code. | ← | ← | ← | ← |
| "Keyboard Shortcuts" button | `interface_1.vue:25` (`buttonStyle_column3`) | g2:97 | g3:244 | g4:125 | g5:99. Same window everywhere (`core/shortcuts/ShortcutsMenu.vue`), whose look (system font, blue accent, light/dark) differs from GameSelect (play font, green #11ce18, dark) and from the panels |

**Pokémon Editor and debug readout**

| Element | gen1 | gen2 | gen3 | gen4 | gen5 |
|---|---|---|---|---|---|
| How the Pokémon Editor opens | "Test run:" checkbox (dev builds only, `IS_RELEASE`), `interface_1.vue:31,50` → `battle_testing.vue` | "Pokemon Editor:" checkbox, **always visible, packaged builds too**, g2:138, key `this.editor` | "Show optimization UI" / "Close optimization UI" **button**, always visible, g3:267/306. It also **hides the EV table**. Key `battle_testing_ui` | "Pokemon Editor:" checkbox, always visible, g4:165, key `editor` | "Pokemon Editor:" checkbox, always visible, g5:139, key `editor` |
| Editor: move fields | "Moveset Updating:"; 4 bare `<input>` with no class | same heading; `inputContainer` + `<br>` | "Moveset:"; bare `<input>` | "Moveset Updating:"; `inputContainer` 140 px | same as gen4 |
| Editor: move buttons | "Update Party Moves" / "Update Battle Moves" | same | "Set moves in the Overworld" / "Set moves while in Battle" | same as gen1 | "Update Moves" (party only). gen5 still has `update_battle_moveset` and `update_items`, but nothing calls them |
| Editor: item fields | "Item Updating:" ×4 + "Update" | same | "Top 4 items:" | "Item Updating:" | — (instead: "Held Item:" field with placeholder **"Input move 1"**, g5:152) |
| Editor extras (these extras are genuine per-game tools) | — | DV editor and Pokémon Recalculator (stat exp), g2:149-181 | "Recalculate stats for nature" | — | "Add Testing Items", "Set Options", "Recalculate Stats" |
| Debug readout gate | `isRelease == false`, `interface_1.vue:53` | `release == false && debugging && advanced && !editor`, g2:183 (`release` is hard-coded `false`, g2 script:1207) | `v-show="debugging"`, g3:330 (stays rendered while hidden) | `debugging_mode && !editor && advanced`, g4:222 | `!editor && debugging_mode` (no advanced gate), g5:156. It shows in the gen5 baseline |
| Debug toggle label | (none) | "Debugging:" | "Debugging:" | "Debugging-Mode:" | "Debugging-Mode:" |

**Style tools and the colour picker**

| Element | gen1 | gen2 | gen3 | gen4 | gen5 |
|---|---|---|---|---|---|
| Style Mode | table row "Style Mode: [Start]/[Exit]" + progress, `interface_1.vue:35-39`, gate `IS_RELEASE` (Vite dev only) | same row, g2:79-88, gate `isInDevMode && advanced && debugging` (`isInDevMode` = not packaged) | same as gen2, g3:203-212 | in the "Style Settings" box: "Style Mode (iterate Pokedex)" / "Exit Style Mode", g4:147-161 | same box, g5:121-135 (byte-identical to gen4) |
| Enemy Sprite Styles toggle | row "Enemy Sprite Styles:", `interface_1.vue:34` | row, g2:78 | row, g3:199 | label "Enemy Sprite Styles (scale/offset/flip)", g4:141 | same as gen4 |
| Style Settings box (Export All as Defaults / Reset Current Pokémon / Reset ALL) | — | commented out, g2:119-136 (methods still present) | commented out, g3:249-266 (methods present; its Reset ALL uses `confirm()`) | live, g4:129-162. **Reset ALL has no confirmation** | live, identical to gen4. **No confirmation** |
| UI colour group | "UI Color:" header, [Color Picker], "Saturation:" at the top of the column, `interface_3.vue:2-7` | header, picker, slider between the dropdowns and the image group, g2:399-401 | header first, like gen1, g3:643-645 | **no header**; picker after "Reset Pokemon Settings", g4:530 | no header, and no gap between Reset and the picker, g5:452 |
| Colour picker code | own `EyeDropper` call, `interface_3.vue:116` | `color_picker` → `colorPick` (formattersMixin:111), the same body in 4 overlays (g2 script 3583, g3 5670, g4 5061, g5 5435). In every generation, cancelling with Esc leaves an unhandled `AbortError` | ← | ← | ← |

**Pokémon image sliders**

| Element | gen1 | gen2 | gen3 | gen4 | gen5 |
|---|---|---|---|---|---|
| Header | "Pokemon:" | "Pokemon Image Settings" (no colon; same in gens 3-5) | ← | ← | ← |
| X-Offset / Y-Offset | -400..400 | **-600..600** | -400..400 | -400..400 | -400..400 |
| Scale | 0.3..2, step .02 | 0.2..2.5, step .01 | same as gen2 | same | same |
| Saturation | 90..150 | 90..150 | 90..150 | 90..150 | 90..150 |
| Rotation | 0..360, step 1. **Has no effect on Red/Blue**: `pokemon_art2` has no `rotate()`, `cmp/graphics.vue:28` | — (the art's transform has no rotate, g2:15) | -180..180, step .25 | -180..180, step .01 | -180..180, step .01 |
| Flip | "Flip:" | "Flip:" | "Flip:" | "Flip:" | "Flip:" |
| Reset button | — (gen1 has "Reload style", `interface_3.vue:94`) | — | "Reset Pokemon Settings" | same | same |

**Background sliders**

| Element | gen1 | gen2 | gen3 | gen4 | gen5 |
|---|---|---|---|---|---|
| Background X/Y | -400..400 | -325..325 | -125..125 | -125..125 | -125..125 |
| Background Scale | **50..300** | 100..200 | 100..200 | 100..200 | 100..200 |
| Brightness, Contrast, Saturation, Hue | 0..200 / 0..358 | same | same | same | same |
| Blur | 0..10, **step .1** | 0..10, step 1 | step 1 | step 1 | step 1 |
| Background flip | "Flip X:" and "Flip Y:" on two rows | one row "Flip  X:[ ] Y:[ ]", g2:435 | "Horizontal Flip:" / "Vertical Flip:", g3:725-730 | "Flip:" only. **No vertical flip** (the transform has no `rotateX`, g4:8) | same as gen4 |
| Group footer | "Changes are saved automatically." + [Reload style] | — | — | — | [Log Color Settings] (logs a snippet to the console, g5:472) |
| Pokéball floor X/Y | — | advanced only, g2:412-416. Its start-up value is read from key `pokeball_translateX` but saved to `this.pokeball_translateX` (data():1501 vs load at 3813) | — | — | — |
| Slider value type | `v-model.number` | plain `v-model`, so **numbers are saved as strings** (the same in gens 3-5) | ← | ← | ← |
| Disk writes while dragging (dev / unpackaged builds) | debounced (`stores/helper/files.ts:73`) | **one file write per input event** (`storage.ts` has no `writeDebounceMs`) | **one file write per input event** (`gen3/storage.ts:79`) | 500 ms debounce | 1000 ms debounce |

**Split comparison**

| Element | gen1 | gen2 | gen3 | gen4 | gen5 |
|---|---|---|---|---|---|
| Load-comparison button | **two buttons**: "Load replay / split file" (`metrics.vue:5`) and "Load replay / split file to compare" (`interface_4.vue:170`) | "Load replay / split file to compare", g2:214 (same text in gens 3-5) | g3:389 | g4:246 | g5:213 |
| "Comparing against: …" line | only next to the interface_4 button | g2:215 | g3:390 | g4:247 | g5:214 |
| "Clear loaded splits" | — | — | — | — | g5:215 |
| Previous/Current label fields | `metrics.vue:9-15` | g2:216-225 | **none**: `previous_label`/`current_label` exist and show on stream (g3:1498), but nothing can edit them | none (labels shown at g4:991) | none |
| Comparison-mode dropdown label | "Compare splits::" (double colon, `interface_4.vue:24`) | "Splits:" | "Splits:" (advanced) | "Split Type:" | "Splits:" (order Followup, First) |
| Replay playback shown in the panel | the store keeps `replay` "for the settings panel" (`core/stores/useReplaySplitsStore.ts:52`), but no generation shows it | — | — | — | — |

**Resize handle, Style Mode panel, modals, panel visibility and shortcut labels**

| Element | gen1 | gen2 | gen3 | gen4 | gen5 |
|---|---|---|---|---|---|
| Enemy sprite resize handle | component `cmp/enemy_sprite_resize_handle.vue` + Pinia store; zoom fix uses the `webFrame` zoom | inline `<teleport>` g2:1067 + `enemySpriteStyleMixin`; zoom fix uses the CSS `#app-container` scale; key handlers copied into `mounted` (g2 script ~6764) | g3:1691, handlers ~8660 | g4:1270, ~9645 | g5:1047; tooltip omits "Arrows move… F1 flips" although both work (~9450) |
| Handle CSS | the unscoped rule in the gen1 component is the only one that applies, because the handle is teleported outside `.gen-N` | `.gen-2 …ResizeHandle` **twice** (style.css:1467, 4085), never matches | dead (style.css:3085) | dead (3392) | dead. gen1's own `.gen-1` copy (style.css:805) is dead too |
| Style Mode dummy enemy panel | `cmp/right_panel.vue:7-60` | g2:596-635 | g3:1056+ | g4:723+ | g5:669+. Each one copies its generation's own enemy panel markup, so the differences between them are correct |
| RNG modal | — (game quirk: the patch only exists for Platinum and White 2) | — | — | full-window `.popup-overlay`, z-index 100000, g4:1234-1257, button g4:377 (Platinum only, `margin-left: 8px`) | identical markup g5:487-510, button g5:358 (White 2 only) |
| Modal CSS | — | — | — | 217 lines, style.css:4089-4310 | **byte-identical** 217 lines, 4169-4390. About 100 of them are dead: `.popup-content`, `.popup-body`, `.popup-item` are unused, and the first `.popup-overlay`/`-header`/`-close` set is overridden later in the same block |
| Native dialogs | — | — | `confirm()` in `resetAllStyleSettingsToDefaults` (button commented out) | — | — |
| Panel container and visibility | `game_area.vue`: 4 boxes `.testingArea1-4`, inline z-index 50000, green translucent with a black border, always mounted | `.debugging1-4`, z 20000, transparent, always mounted | `<div v-if="gamestate == true">`. `gamestate` is a saved flag (default true) that nothing in the UI can change, so it's always shown; `.ui5` needs advanced | `.ui1-3`, z-index 5, always | same as gen4 |
| Shortcut labels for the same action ids | "Pokemon image Flip", "Background Flip X/Y" (`games/gen1/actions.ts:208-214`) | "Pokemon Image Flip", "Background Flip X/Y" | "Background Horizontal/Vertical Flip" (gen3 actions:216) | "Background Flip" | "Background Flip" |

None of the missing controls in the tables above is a game quirk, with one exception: the RNG helper exists only
where the ROM patch does.

## Findings

### E1 One style panel: UI colour, Pokémon image and background in one shared component
- **Now:** five hand-written copies of the same three groups: `cmp/settings/interface_3.vue:1-98`, g2:398-436,
  g3:642-732, g4:519-549, g5:442-473. They differ in group order, header text ("Pokemon:" vs "Pokemon Image
  Settings"), flip labels (four different spellings), slider ranges (inventory), which controls exist (gen2 has no
  rotation; gen4/5 have no vertical background flip; Red/Blue's rotation slider does nothing) and footers (Reload
  style / Reset Pokemon Settings / Log Color Settings).
- **Proposal:** `core/overlay/StylePanel.vue`, built from three small row components (`SliderRow`, `CheckRow`,
  `StyleGroup`). Use gen1's order and labels: "UI Color:" [Color Picker] Saturation → "Pokemon Image:" X-Offset,
  Y-Offset, Scale, Saturation, Rotation, Flip, [Reset Pokemon Settings] → "Background Texture:" dropdown, X/Y,
  Scale, Brightness, Contrast, Saturation, Blur, Hue, "Flip X:", "Flip Y:".
  - Each generation passes a binding map (field name → v-model). gen1 binds its Pinia `runConfig`; gens 2-5
    bind their data fields. The saved names stay, including the misleading `backgroundXFlip` for the vertical flip.
  - Ranges become one table in core, using the widest range each generation has today (image offset -600..600,
    background offset -400..400, background scale 50..300, blur step .1). A wider range never clamps a saved value;
    a range input's arrow keys still move one step.
  - Rotation is a special case: gen1 saves 0..360 and the others -180..180. Show values above 180 as θ−360. That
    turns the same way, so nothing on screen changes.
  - Per-generation extras go in a slot: gen1's "Reload style", gen2's Pokéball floor, and gen5's "Log Color
    Settings", which moves to E4.
  - Move `color_picker` into a shared `pickOverlayColor()` that catches the Esc `AbortError`.
- **Wins:** about 290 template lines today → about 90 in core plus about 5 per generation, roughly **−180 lines**
  (counted from the line ranges above). One look and one set of labels. All five generations get "Reset Pokemon
  Settings", which is `speciesArtMixin.resetPokemon`; gen1 needs an equivalent store reset.
- **Visibility:** operator-only (the controls). Adding gen2's rotation, gen4/5's vertical flip and Red/Blue's
  `rotate()` means changing the on-stream art and background transforms, although at the default values nothing
  moves.
- **Risks:**
  - The layout oracle keys elements by `tag.class:nth-child`, so any reshuffle in the panel shows as a layout and
    pixel difference inside the panel. That's expected, but it needs a re-baseline.
  - Keep the `checkBoxStyle`, `dropdownMenu` and `buttonStyle` classes on their elements.
  - The shortcut action ids don't change. Their labels should take the new wording ("Background Flip X/Y" in all
    five).
- **Size:** M (the component plus gen1), then S per lifted generation.
- **Needs Scott's call:** yes.
  1. "OK to add the missing controls: rotation to gen2, vertical background flip to gen4/5, and making rotation
     work on Red/Blue? Each is invisible until you move it."
  2. "OK to use the widest range for each slider? gen3-5's background offset becomes about 3× coarser per mouse
     pixel; the arrow keys still give 1-step precision."

### E2 Slider saves: a disk write per drag step in gen2/gen3, and numbers stored as text in gens 2-5
- **Now:** a range input fires `input` continuously while dragging.
  - In an unpackaged build (dev, harness, `npm start`), gen2's style store has no `writeDebounceMs`
    (`games/gen2/storage.ts:83`), and gen3's `set()` calls `writeStyleDefaultsFile` on every write
    (`games/gen3/storage.ts:79`).
  - Each such write is a synchronous `source:write` in main (`docs/performance-followups.md` "Left alone" lists
    gen2 only), so a one-second drag is about 60 blocking file writes.
  - gen4 (500 ms) and gen5 (1000 ms) debounce; gen1 debounces in `stores/helper/files.ts`.
  - Separately, gens 2-5 use `v-model` without `.number`, so every moved slider saves `"12"` rather than `12`,
    in `user_state.json` and in the style JSON files.
- **Proposal:**
  - Give gen2 the shared debounce (`writeDebounceMs: 500`, gen4's value).
  - Route gen3's write through the same per-key debounced writer in `core/persistence/styleSettings.ts`, by
    exporting it.
  - The shared `SliderRow` from E1 uses `.number`.
  - Log the string values in `docs/known-legacy-bugs.md` and fix them in their own change.
- **Wins:** performance, measurable as main-process IPC count during a drag. Same behaviour in all five
  generations.
- **Visibility:** operator-only.
- **Risks:**
  - `.number` changes what's saved (text → number) the first time a slider moves. The smoke fixtures never move
    a slider, so expect no harness difference. Check any `== "0"`-style comparison on these fields first.
  - A debounce means a hard crash within 500 ms of a drag loses the last step (unload flushes, as gen4 does).
- **Size:** S.
- **Needs Scott's call:** no.

### E3 One Pokémon Editor, one gate
- **Now:** five different ways to open the ROM-writing editor, five layouts and three button vocabularies
  (inventory).
  - gen1 hides it in dev builds behind "Test run".
  - gens 2-5 show it **in packaged builds too**, as an always-visible checkbox (gen2/4/5) or a button (gen3).
  - gen3's button also hides the EV table: g3:268 is `v-show="!battle_testing_ui"`.
  - gen1/gen3 inputs have no class.
  - gen5's held-item placeholder reads "Input move 1".
  - gen5's `update_items` and `update_battle_moveset` (about 52 lines) are never called, and gen4 = gen5 for both
    methods (drift allowlist).
- **Proposal:** `core/overlay/PokemonEditor.vue`, used the same way in all five generations.
  - Layout:
    - "Pokemon Editor:" checkbox row; the generation keeps its own saved key (`this.editor`,
      `battle_testing_ui`, `editor`).
    - "Moves:" four `inputContainer` fields + [Update Party Moves] [Update Battle Moves], with gen1's wording.
    - "Items (top 4):" four fields + [Update].
    - A slot for each generation's extras (gen2's DV editor and recalculator, gen3's nature recalc, gen5's testing
      items / options / recalc / held item).
  - It emits `set-party-moves`, `set-battle-moves` and `set-items` with the field values. The memory writes stay in
    each generation, because the mapper shapes differ.
  - Move gen4/gen5's identical `update_items` and `update_battle_moveset` into `dsPairMixin`.
  - Wire gen5's battle-moves and items buttons to the methods it already has. gen3's EV table stays visible.
- **Wins:** about 120 template lines → about 50, plus the 52 dead lines in gen5 (**about −120**). One gate for a
  tool that writes the ROM.
- **Visibility:** operator-only.
- **Risks:**
  - gen1's editor is tied to `test_run`, which also changes how gen1 records the run. Giving gen1 its own
    "Pokemon Editor" flag adds a saved key in gen1's store.
  - Showing gen5's two extra buttons adds features (the methods exist and are drift-reviewed as gen4 = gen5).
  - Layout re-baseline for the panel.
- **Size:** M.
- **Needs Scott's call:** yes. "Should the Pokémon Editor be available in the packaged app (as gens 2-5 are
  today) or only in dev builds (as gen1)? I recommend behind 'Show Advanced Settings' in all five, visible in
  packaged builds."

### E4 One dev-tools box: Style Mode, enemy sprite styles, style defaults and the debug readout
- **Now:**
  - Style Mode and Enemy Sprite Styles are table rows in gens 1-3 but a bordered "Style Settings" box in gen4/5,
    with different labels.
  - The style-defaults buttons (Export / Reset Current / Reset ALL) are live only in gen4/5 (byte-identical
    g4:129-162 = g5:103-136). In gen2/3 they're commented out, while the methods remain in all four.
  - **"Reset ALL to Defaults" wipes every species' style with no confirmation** in gen4/5 (g4 script 3635, g5
    3469). gen3's copy had a native `confirm()`.
  - The debug readout has four different gates. gen5's ignores "Show Advanced Settings"; gen3's is a `v-show`.
  - Two meanings of "dev" are in use: gen1's `IS_RELEASE`/`IS_DEV` (Vite dev server only) and gens 2-5's
    `isInDevMode` (= not packaged). So under the harness or `npm start`, gen1 hides its dev tools while gens 2-5
    show them.
  - gen2's `release` is hard-coded `false`.
- **Proposal:** `core/overlay/DevToolsBox.vue`, gen4/5's box as the model, shown when `!isPackaged()` (the flag
  the style writers already follow) and the generation's Debugging toggle is on. It contains:
  - Enemy Sprite Styles;
  - Style Mode Start/Exit + progress, with gen1-3's short labels;
  - Export Defaults / Reset Current Pokémon / Reset ALL, where Reset ALL asks for a second click ("Click again
    to reset ALL") rather than a native `confirm()`, which blocks the page;
  - Log Texture Settings (gen5's, offered to all, since all have the texture fields);
  - a `rows` prop for the generation's debug readout (`[{label, value}]`).
  - Label the toggle "Debugging:" everywhere and keep the saved keys `debugging` / `debugging_mode`.
- **Wins:** about 38×2 + 18×2 (commented) + 3×10 rows → about 45 lines (**about −100**). One way to reach the
  dev tools. No accidental wipe of every species' styling.
- **Visibility:** operator-only, dev builds.
- **Risks:** gen1's tools would now appear in harness and `npm start` runs. Dev-only, so the packaged probe is
  unaffected, but the gen1 harness layout changes when Debugging is on. The fixtures run with it off, which needs
  checking.
- **Size:** M.
- **Needs Scott's call:** yes. "OK for 'Reset ALL to Defaults' to need a second click?"

### E5 One edition picker in the panel, built from the manifests
- **Now:**
  - gen1 and gen2 use dropdowns.
  - gens 3-5 use box-art tiles, each from its own image folder with its own art, sizes and CSS. gen3 shows the
    FireRed box only for FR+LG; gen4 uses two jpgs.
  - The tile order differs from the manifests and from the GameSelect screen (gen4 Plat/HGSS/DP; gen1
    Yellow/Red/Blue).
  - GameSelect already draws the right art for all 14 editions from `manifest.editions`.
- **Proposal:** `core/overlay/EditionPicker.vue`, taking `editions` (`manifest.editions` minus `devOnly` in
  release) and `modelValue`.
  - It renders `div.gameToggle > img.gameToggleImg` from `images/box_art/`, sized by height so a pair is twice as
    wide, as GameSelect does.
  - The CSS lives once in core, with the `.gameToggle`/`.gameToggleImg` class names kept and the
    grey-until-selected look of gens 3-5. Tile height is chosen so gen4 (one single + two pairs) fits the 280 px
    column, about 58 px.
  - Each generation binds its field: `settings.edition`, `game_selection`, `gameSelection`, `selected_game`.
- **Wins:** delete 3 × ~35 CSS lines, the `game_box_art` maps, and the 9 files under `images/gen{3,4,5}/box_art/`
  (**about −120 lines**). The same art and order in the panel as on the start screen.
- **Visibility:** operator-only.
- **Risks:**
  - The harness's `packaged-probe.ts` counts `.game-select .gameToggleImg`, which isn't affected (it's scoped to
    `.game-select`).
  - The queuer sets editions through routes, not the DOM, so it's unaffected.
  - gen1/gen2 lose their `<select>`, a layout change in the panel.
- **Size:** S-M.
- **Needs Scott's call:** yes. "Box-art tiles in the gen1 and gen2 panels too, instead of the dropdown?"
  (I recommend yes.)

### E6 One split-comparison control
- **Now:**
  - gens 2-5 share the label and the "Comparing against" line.
  - gen1 has two buttons for the same action (`metrics.vue:5` and `interface_4.vue:170`).
  - Only gen5 can clear a comparison.
  - Only gens 1/2 can edit the Previous/Current headings, although gens 3-5 show them on stream (g3:1498, g4:991).
  - The replay name the store keeps for the panel is shown nowhere.
  - gen2/3/4's `load_splits` bodies are byte-identical; gen5 dedupes rows (allowlisted "omission?").
- **Proposal:** `core/overlay/SplitComparisonControl.vue`, placed under the Solo Pokémon block as in gens 2-5.
  - [Load replay / split file to compare], "Comparing against: <name>", [Clear loaded splits] while something is
    loaded, the Previous/Current fields, and "Playing back: <replay>" while `replaySplits.playingBack`.
  - It emits `load`/`clear`; the generation keeps its loader. gen5's dedupe stays gen5's until Scott rules on the
    drift entry.
  - Move the shared gen2/3/4 body into `overlayCommonMixin`.
  - Remove gen1's duplicate button. Fix "Compare splits::".
- **Wins:** uniformity, about −40 lines, and two controls that gens 3-5 lack, with no on-stream change unless used.
- **Visibility:** operator-only (the headings the fields edit are on-stream, but unchanged by default).
- **Risks:** `previous_label`/`current_label` keys exist in all four generations (gen3 `this.previous_label`), so
  nothing new is saved. Clear sets `previous_splits = []`, which is saved state.
- **Size:** S.
- **Needs Scott's call:** yes. "Give every generation 'Clear loaded splits' and the Previous/Current fields?"

### E7 RNG modal: one component, half the CSS, and it should not cover the stream
- **Now:**
  - gen4 and gen5 have byte-identical modal markup (g4:1234-1257 = g5:487-510) and byte-identical 217-line CSS
    blocks, about 100 of which are dead (inventory). Its methods are already in `dsPairMixin`.
  - It is a full-window `position: fixed` overlay at z-index 100000 with a 50% black backdrop, **inside the
    captured page**. Opened while recording, it darkens the whole on-stream overlay.
  - The two "RNG" buttons differ in inline style.
- **Proposal:**
  - `core/overlay/RngTripsModal.vue` with the markup and the live CSS only (about 90 lines), taking `npcs`,
    `config` and `optionsFor`.
  - Better still: drop the backdrop and render it as an inline expandable section in the settings column, so it
    never leaves the panel area. The Keyboard Shortcuts window solved the same problem by being a separate
    window, which is heavier than needed here.
  - One button style.
- **Wins:** about **−330 lines** (2×217 CSS + 2×24 markup → about 120). No risk of a dimmed stream.
- **Visibility:** operator, currently able to bleed onto the stream.
- **Risks:** keep the `.popup-*` / `.rng-*` class names if the modal form stays; the `rng_config` saved key is
  unchanged.
- **Size:** S (component) / M (inline variant).
- **Needs Scott's call:** yes. "RNG trips as an inline panel section instead of a popup over the whole overlay?"

### E8 Enemy sprite resize handle: one implementation, and gen2-5 shouldn't depend on gen1's CSS
- **Now:**
  - gen1 has a component and a Pinia store; gens 2-5 have a mixin plus four hand-copied keydown/mousedown
    handlers in `mounted`.
  - gens 2-5 are **styled only by the unscoped rule inside gen1's component**, which happens to be global because
    gen1 is imported eagerly. All six `.gen-N .ePkmnSpriteResizeHandle` rules (78 lines, gen2's twice) can never
    match a teleported element.
  - The scale fix differs: gen1 divides by the `webFrame` zoom, gens 2-5 by the `#app-container` CSS scale. The
    window uses both (main `setZoomFactor` and `scaleToFit`), so each fix is right in only some window sizes.
  - gen5's tooltip leaves out the arrows and F1.
  - In Style Mode, the Enter/Backspace keys are taken even while a text field has focus.
- **Proposal:**
  - `core/overlay/EnemySpriteResizeHandle.vue` (moved from gen1, unscoped style kept), with a small adapter
    interface: `species`, `slot`, `baseSize`, `setScale`, `nudge`, `flip`, `commit`, `cancel`, `styleMode*`. gen1
    passes its store; gens 2-5 pass mixin methods.
  - One `useDevSpriteKeys()` holds the key and Ctrl+click handlers, and ignores keys while an
    input/select/textarea has focus.
  - Divide by zoom × CSS scale.
  - Delete the six dead CSS blocks.
- **Wins:** about **−200 lines** (4 × ~30-line handler copies, 4 × 3-line teleports, 78 CSS lines), and one tool
  that behaves the same way.
- **Visibility:** dev-only operator.
- **Risks:** the class `ePkmnSpriteResizeHandle` stays; the drift check loses nothing because these are `mounted`
  bodies. The zoom fix changes drag speed in dev only.
- **Size:** M.
- **Needs Scott's call:** no.

### E9 Settings panels are re-rendered with the whole overlay in gens 2-5 (performance)
- **Now:** every lifted overlay's settings columns are part of its 1,000-1,700-line root template (always mounted,
  no hover or hide; inventory last rows). So every overlay render (each mapper change the template reads) also
  re-diffs:
  - the panel, including the 250-650-entry species and trainer lists (performance-followups "Left alone");
  - live readouts: gen4/5's six `calculate_ev_benefit()` calls per render (g4:198-216, also under `v-show` in
    battle, so they're computed while hidden); gen2's debug `speed_comparison` and `svgColorClass` (g2:188-189);
  - gen3's `v-show` subtrees (EV table, editor, debug table g3:268/307/330), which still evaluate while hidden.

  gen1 doesn't have this problem: its panels are separate components that re-render only on their own
  dependencies.
- **Proposal:**
  - Do Phase 6.2's cut of the `DEBUGGING` section first, with no DOM change. Each generation's settings columns
    become `games/genN/components/settings_*.vue` components reading the overlay through `inject`. A child
    re-renders only when the keys it reads change.
  - Then, in its own change, switch gen3's three `v-show`s to `v-if`, and put the EV-benefit cells under `v-if`.
  - The shared pieces from E1, E3-E6 then slot into those components.
  - Keep the panels always visible: Scott works from them, and OBS covers them.
- **Wins:** the panel's share of every overlay render goes away. The settings panel is roughly half of each
  template by line count (g2:55-482 of 1071), so I'd estimate a similar cut in render time. This is
  **unmeasured**; measure with the same render counter as the fourth pass.
- **Visibility:** operator-only.
- **Risks:** the 6.2 cut must keep the element order. `v-if` instead of `v-show` removes hidden elements from the
  DOM, which shifts layout-oracle nth-child chains (expected, one re-baseline).
- **Size:** M per generation.
- **Needs Scott's call:** no.

### E10 Operator screens use three different visual styles
- **Now:**
  - GameSelect: dark, `play` font, green #11ce18 accent.
  - Keyboard Shortcuts window: system UI font, blue #2f6fde accent, light or dark from the OS
    (`ShortcutsMenu.vue:232-256`).
  - In-panel controls: green #72fd4f `buttonStyle`, play/osb fonts.
  - RNG modal: green gradient header.
- **Proposal:** a small `core/styles/operator.css` with tokens (accent green, surface, text, the play font). It
  would be used by GameSelect, the Shortcuts window, the RNG/dev boxes and the shared components above, and it
  fits `docs/themes-plan.md`, which already adds a picker to all five panels.
- **Wins:** a consistent operator feel. About −40 lines once the components share tokens.
- **Visibility:** operator-only.
- **Risks:** none for the harness except GameSelect pixels on the idle screen.
- **Size:** S.
- **Needs Scott's call:** yes. "Should the Keyboard Shortcuts window match the green STP look of the start screen,
  or keep its plain Windows look?"

### E11 Leftovers to delete (small)
- gen3's `togglePopup`/`closePopup` (g3 script 4848-4853) touch a `showPopup` that no longer exists.
  known-legacy-bugs #83 says they're gone, which is true only for gen4/5.
- `clear_overlay_color` is defined in all four lifted overlays, and nothing calls it.
- `copy_overlay_properties` (gen3, gen4) only appears in commented-out markup.
- gen3's `gamestate` panel gate (g3:151) is a saved flag with no control, so it's always `true`.
- The commented-out Style Settings blocks in gen2/3.
- **Wins:** about −80 lines. **Risks:** the drift check (re-run `parity:drift --update` for any removed shared
  member). **Size:** S. **Needs Scott's call:** no.

Also adjacent, but outside E (the species picker is already planned): the in-panel EditionPicker (E5) and
SpeciesPicker should share a "picker" row style so the two choosers above them look the same.

## Quick wins

1. **E2**: debounce gen2/gen3 style writes and use `.number`. Small, removes a real main-process stall in dev
   builds, and needs no visible change.
2. **E7**: one RNG modal component, deleting about 330 lines of duplicate or dead CSS and markup. With Scott's
   OK, make it an inline section so it can't dim the stream.
3. **E8**: delete the six dead `.gen-N .ePkmnSpriteResizeHandle` blocks now. The shared handle and key handler
   can follow.
4. **E4 (part)**: a second-click confirmation on gen4/5's "Reset ALL to Defaults", and gen5's debug readout gated
   by "Show Advanced Settings" like the others.
5. **E6**: remove gen1's duplicate comparison button, fix "Compare splits::", and fix gen5's "Input move 1"
   placeholder (E3). These are text-only fixes.
6. **E5**: the shared EditionPicker from `manifest.editions`, which deletes three CSS copies and 9 duplicate
   images.
