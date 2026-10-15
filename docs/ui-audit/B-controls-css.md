# B — Control styling and the CSS itself: audit

> Snapshot of the 2026-10-14 UI audit (read-only, against the working tree of that day). Line numbers drift as
> the work in `docs/ui-uniformity-plan.md` lands; re-check any `file:line` before relying on it. Mark a finding
> done in the plan, not here.

Scope: how the settings-panel controls look in each generation, then the five `games/genN/style.css` files
themselves. Everything here was read from source on 2026-10-14. The screenshots are a month old and agree with the
code for every control below.

How the numbers were made (scripts in the audit scratch folder, all read-only on the repo):
`css_audit.cjs` parses each sheet with the repo's own `postcss` and normalises selectors by removing `.gen-N`. It
then counts duplicate rules, dead rules, `!important`, and filter/animation use, and builds per-control property
tables. `css_shadow.cjs` finds declarations that a later rule with the same selector overrides. `livedup.cjs` counts
duplicates among live rules only. `simulate.cjs` writes cleaned copies to `sim/` and counts their lines.
`controls.cjs` sizes the control CSS.

- **What "dead" means here:** the rule's selector names a class or id that appears nowhere in that generation's
  source: its `games/genN/**` (data included), `core/**`, `main.ts` and `index.html`, plus gen1's own folders.
  Class names built at run time are counted as live: a prefix before `${`, a suffix after `}`, or a `'x' +` string.
- **The dead count is a lower bound.** A class that happens to be a common word (`.hp`, `.nature`, `.atk`) is
  counted as live even when no template uses it. gen4/gen5 have several of these.

Visibility: **the whole settings panel is operator UI.** It sits where OBS lays the game capture over it. Only
finding B8 (the full-screen filtered art layers) is on-stream.

---

## Inventory

### Settings-panel controls

| Element / control | gen1 | gen2 | gen3 | gen4 | gen5 |
|---|---|---|---|---|---|
| **Panel columns** (container) | 4 × `.testingAreaN` (style.css:523-581, game_area.vue:2-11). Each is a **boxed** sub-panel: 4px black border, `#c9ffbba6` fill, `drop-shadow` filter. Play 15px / line-height 21px | 4 × `.debugging .debuggingN` (style.css:3072-3094, plus `.debugging4` at :546, which only exists in the "old" half of the file, see B1). Overlay.vue:55/205/362/448. No box. Play 13px/15px | 4 × `.ui_style .uiN .ui_border` (style.css:2184-2224), Overlay.vue:152/378/642/734. No box. `osb` (= Play-Bold) 700 14px/14px, `text-transform: capitalize` | 3 × `.uiN` (style.css:243-292), Overlay.vue:94/238/460. No box. Play 700, **12px** in ui1/ui3 and 13px in ui2, capitalize. ui1 has `line-height: 13x` (invalid, see B7) | 3 × `.uiN` (style.css:264-313), Overlay.vue:67/205/398. No box. Play 700 13px, capitalize. ui1 has `line-height: 14x` (invalid) |
| **Dropdown** `.dropdownMenu` | :404. 240×**30**, 17px, `#72fd4f` | :2628. 210×23, 13px, **`#abff96`** (lighter) | :395. 280×21, 14px, `#72fd4f` | :294. 300×22, 13px, `#72fd4f` | :315. 280×22, 15px, **`#9eff86`** (lighter) |
| | All five: radius 10px, Play, `drop-shadow(0 0 2px #000000c5)`, hover `#11ce18` | | | | |
| `.dropdown_menu_column3` | :2845. 210px | :4708. 210px, h22 | :447. 210px, but 4 selects override it inline to **296px** (Overlay.vue:449/497/503/507) | **class used, no rule** (falls back to 300px) | **class used, no rule** (280px) |
| **Button** `.buttonStyle` | :431. 280×26, **18px**, bg **`#72fd4fb4`** (translucent). Hover `#11ce18`; the only gen with an `:active` press effect (:467) | :2656. **210**×24, 14px, `#72fd4f`. Hover `#14d61a` | :527. 280×21, 15px. Hover `#14d61a` | :496. 280×22, **13px**. Hover `#14d61a` | :432. 280×22, **16px**. Hover `#14d61a` |
| `.buttonStyle_column3` | :2841. 210px | :4704. 210px | :539. 210px | class used 3×, **no rule** | class used 3×, **no rule** |
| **"New Run"** (the big button) | metrics.vue:3 `new_run_button` (:2818): **210×45, 24px**, 8px margins | Overlay.vue:62, plain `buttonStyle`: 210×24, 14px. Its `.new_run_button` rule (:4689) is dead | Overlay.vue:228 `new_run_button` (:543): **280×28, 21px** | Overlay.vue:100, plain: 280×22, 13px | Overlay.vue:72, plain: 280×22, 16px |
| **+ / − counters** | `smallButtonStyle increment` / `smallButtonStyle decrement` (:442/:455/:459): **24px**, **no hover** | `smallButtonStyle increment` / **`smallButtonStyle2`** `decrement` (:3096-3134): 22px, hovers `#14d61a` / `#fd6e6e` | same classes (:2235-2273): **18px** | (:3545-3583): **20px** | (:3608-3646): **22px** |
| **Text field** `.inputContainer` | :472. bright **`#72fd4f`**, 18px, right-aligned, 110w | :2672. **`#daffd0`**, 15px, **left**, 210w, h25, pad 3 | :749. **`#a3fc8b`**, 18px, right, 130w | :444. **`#d8ffc9`**, h24, pad 4, browser-default font size (13.33px), default width | :247. same as gen4 |
| Inline width overrides on text fields | 0 | 17 (widths 30–210, `text-align` ×3) | 0 | 8 × `width:140px` | 9 (140/207/280px) |
| **Un-classed text inputs** (browser white) | 8 battle-testing (battle_testing.vue:4-16), plus the species search (interface_2.vue:11) | trainer search (Overlay.vue:440) | 8 battle-testing (Overlay.vue:309-323), plus the species search (:385) | trainer search (:486) | trainer search (:435). Its battle-testing fields *are* `inputContainer` |
| **Checkbox** `.checkBoxStyle` | :513. **15×15** (also sets `background`/`font-size`/`font-family`, which do nothing on a native checkbox) | :5097. 15×15, same no-op properties | **no rule**: browser default 13×13 | no rule: 13×13 | no rule: 13×13 |
| **Range slider** | 14, all un-classed, browser default | 15, default | 14, default | 14, default | 14, default |
| Slider ranges (*behaviour*, listed for whoever builds a shared slider block) | bg X/Y ±400, bg scale 50–300, rotation 0–360 step 1, blur step 0.1 (interface_3.vue:15-79) | image X/Y **±600**, bg X/Y **±325**, scale 100–200, no rotation, pokéball X/Y (Overlay.vue:401-432) | image ±400, bg ±125, rotation ±180 step .25 (:645-722) | bg ±125, rotation ±180 step .01 (:521-547) | same as gen4 (:444-469) |
| **Colour picker** (an EyeDropper button) | `buttonStyle_column3`, 210px (interface_3.vue:3) | plain, 210px (:400) | `_column3`, 210px (:644) | plain, 280px (:530) | plain, 280px (:452) |
| **Game picker** | dropdown (interface_1.vue:3) | dropdown (Overlay.vue:57) | box-art toggle `.gameToggle` (:411): 130px images, centred | box-art toggle (:375): 90px, space-between | box-art toggle (:396). Same rules as gen4 |
| Nature +/− grid `.nature_grid_btn` | — (game quirk: no natures) | — (game quirk) | :477 | :337. Identical to gen3 except `font-family: Play` | :358. Same as gen4 |
| Start-time offset field | `inputContainer` 110w next to `set_button_style` "Set Timer" (interface_1.vue:10-11) | `inputContainer` inline 210w, right (:65) | `.timerOffsetControls` flex + "Clear" button (:763/:778) | same as gen3 (:461/:476); clear button lacks `cursor:pointer`, gap 2 vs 4 | inline 280w, right, no Clear button |
| Manual IV/DV fields | `manual_dv_input` (:489), 32px | `manual_dv_input` class but **no rule**; inline 30px | `manual_iv_input` (:758), 26px, 11px font | (:453) 22×14, padding 2 | (:256) same as gen4 |
| Dev "Style Mode" buttons | inline `font-size:11px; width:auto; padding:0 12px` (+ `color:#f44` on Exit) | same, plus 3 more 11px buttons | same | 5 × inline 11px (2 red) | 5 × inline 11px (2 red) |
| "Unify Styles" row (evolution select + button) | — | — | inline select 125w, button 85×23 `top:-2px` (:433/:437) | inline 180w / 100×23 (:287/:291) | inline 180w / 100×23 (:254/:260) |
| Solo-Pokemon select | inline `background-color: rgb(201,199,100)` (yellow) | same inline yellow (:207) | same inline yellow (:380) | combobox (`input.dropdownMenu`, `.starter_dropdown_list` :409+) | plain green select |

The Solo-Pokemon row is covered by the planned `SpeciesPicker.vue`. The **yellow inline background** is three copies
of one value, so that component should give it a class (e.g. `.speciesPickerSelect`) rather than carry it inline.

Static `style="…"` attributes on `<select>/<input>/<button>`: **gen1 3, gen2 29, gen3 15, gen4 19, gen5 22
(88 in all).** About 45 are widths, 13 are the 11px dev buttons, 6 are the `#f44` red text, 3 are the yellow
species select, and the rest are one-offs. Every gen also wraps each column in an inline `z-index` (gen1
`50000` ×4, gen2 `20000` ×4); gen3-5 set it in CSS instead.

### The stylesheets

| | gen1 | gen2 | gen3 | gen4 | gen5 | Total |
|---|---|---|---|---|---|---|
| Lines | 2,947 | 5,470 | 3,740 | 4,306 | 4,386 | **20,849** (+ 70 in `base.css`) |
| Blank / comment lines | 382 / 199 | 742 / 362 | 509 / 199 | 592 / 252 | 595 / 261 | 2,820 / 1,273 |
| Commented-out CSS (lines) | 54 | 119 | 84 | 84 | 88 | 429 |
| Rules / declarations | 366 / 1,586 | 703 / 3,422 | 478 / 2,087 | 562 / 2,426 | 563 / 2,499 | |
| **Dead rules** (lower bound) | 138 rules, 799 lines | 228, 1,085 | 172, 957 | 252, 1,402 | 216, 1,210 | **1,006 rules, 5,453 lines** |
| **Fully overridden rules** (a later same-selector rule replaces every property) | 4, 12 | **332, 2,143** | 7, 20 | 23, 79 | 27, 83 | |
| Dead **or** overridden | 811 lines | **2,687** | 959 | 1,457 | 1,274 | **7,188 lines** |
| Same selector defined 2+ times in one file | 8 | **331** | 10 | 31 | 35 | |
| `!important` | 3 | 0 | 0 | 0 | 0 | 3 |
| `filter` declarations | 23 | 40 | 23 | 30 | 29 | |

`!important` is not a problem: there are 3 in the whole codebase, all gen1 (`.stat_multi_line` ×2, `.movesetStyling`).

---

## Findings

### B1 Delete the CSS that can never apply (−8,954 lines, no visible change)
- **Now:** 34% of all stylesheet lines are rules that match nothing, or are fully overridden by a later copy of
  themselves. The worst case is **gen2**: its legacy `style.css` was the whole stylesheet **pasted twice**. An
  older copy (lines 17–2,610, after the header) is followed by a newer one (from line 2,611, which starts again with
  the same three `@font-face`s).
  - Every rule in the old half that the new half redefines loses: 332 rules, 2,143 lines.
  - The two halves differ, and the **second half is what renders.** For example, `.buttonStyle` is 280px wide at :61
    but 210px at :2656, and `.inputContainer` is `#72fd4f` at :77 but `#daffd0` at :2672.
  - Only 12 old-half rules survive: `html/body:has(.gen-2)`, `#app-container`, `#app`, `.gametimeFrame` (:496,
    added by the unified app), `.debugging4` (:546), and the `.ePkmnMod*` set (:1505-1566).
  - The legacy file at `A:\Programs\gen2-stp-frontend\app\style.css` has the same double paste, so it came in when
    the app was lifted.
  - In the other gens, the dead rules are left-overs from older layouts. Examples: gen4/5's `.statsContainer`,
    `.statsLabelsColumn1`, `.badge2`…`.badge8`, `.overlayStarter` and `.popup-content`/`.popup-body` (the old F-key
    help popup); gen3's `.slideR-*` transitions; gen1's `.radioButtonStyle`, `.save_all_settings`,
    `.damageRangeLabels`.
- **Proposal:**
  - Delete, per generation, every rule `css_dead_list.txt` names, every fully overridden rule and every
    overridden declaration, plus the 429 lines of commented-out CSS.
  - A trial run (`simulate.cjs`, output in `sim/`) gives **20,849 → 11,895 lines**: gen1 1,939, gen2 2,199,
    gen3 2,508, gen4 2,482, gen5 2,767.
  - Delete the gen2-5 header line "Do not edit by hand -- re-run the tool". The sheets have been hand-edited
    since (the timer, custom IVs), and re-running `scope-css.py` would now throw those edits away.
- **Wins:** −8,954 lines (−43%), with **no rendered change**: nothing that matched an element is removed, and
  nothing that won the cascade is removed. Two smaller benefits:
  - Lower style-recalc cost, because Chromium matches every rule's last selector part against each changed
    element. 2,700 fewer selectors in gen2.
  - The rest of this audit gets far easier to read.
- **Visibility:** none (no pixel changes); it touches the on-stream and operator CSS alike.
- **Risks:**
  - A class built in a way my heuristics miss (for example, assembled in JS from two unrelated strings) would lose
    its rule.
  - Mitigation: run the harness for each generation and require the pixel, layout and rect oracles to show zero
    difference. Do one commit per generation.
  - Dev-only screens the fixtures never reach (Style Mode, battle-testing, the RNG modal, the encounter popups)
    need a quick manual look after the change. Their classes were all found in the source, so they should be safe.
  - No class or id is renamed.
- **Size:** M (one generation per sitting; the lists already exist).
- **Needs Scott's call:** no. It is a zero-diff cleanup; the harness is the proof.

### B2 One shared `core/styles/controls.css` for every settings control
- **Now:** each generation styles the same eight controls on its own. The inventory rows above show five sizes for
  every control, three different greens for dropdowns, four for text fields, two hover greens and two checkbox
  sizes. These rules total **1,002 lines** across the five sheets (`controls.cjs`; 1,244 counting the panel
  columns).
- **Proposal:**
  - Add `core/styles/controls.css`, linked in `index.html` after `base.css` and so before `stp-gen-style`.
  - Write its selectors as `:where(#app-container) .buttonStyle`, which has specificity (0,1,0). Any rule left in a
    gen sheet (0,2,0) still wins, so a generation can keep a deliberate exception.
  - Remove the per-gen copies of the control rules.
  - Base it on tokens on `#app-container`, so a theme (themes-plan §"common.css") can restyle every generation at
    once:
    `--ctl-accent:#72fd4f; --ctl-accent-hover:#14d61a; --ctl-pressed:#11ce18; --ctl-plus:#29c702;
    --ctl-minus:#cc5353; --ctl-minus-hover:#fd6e6e; --ctl-field:#d8ffc9; --ctl-radius:10px; --ctl-h:22px;
    --ctl-font:play; --ctl-font-size:15px; --ctl-shadow:drop-shadow(0 0 2px #000000c5)`.
  - **Target look:** gen4/gen5's family (the newest, and the most consistent), with the outliers dropped:
    - Dropdowns and buttons: 22px tall, 15px text, opaque `#72fd4f`, radius 10px. Dropdowns keep the drop-shadow.
    - Hover `#14d61a` on buttons and `#11ce18` on dropdowns, as four of the five generations do now. Add gen1's
      `:active` press (`translateY(2px)`) everywhere, since it costs nothing.
    - Text fields: gen4/5's pale `#d8ffc9`, 24px tall, 4px padding, at the 15px control size.
    - +/− counters: 20px circles. Hover and colour come from `.increment` / `.decrement`, so gen1's markup works
      unchanged; `.smallButtonStyle2` stays as an alias.
    - Checkboxes: 15×15, as in gen1/2. That is easier to hit, and one rule replaces the no-op `background` and
      `font-size` lines.
    - Range sliders: browser default (already the same everywhere). Optionally add `accent-color: var(--ctl-accent)`.
  - Widths: give each panel column a `--ctl-w` (its usable width). Controls use `width: var(--ctl-w)`, and
    `_column3` becomes `--ctl-w-narrow`. This replaces the 280/300/210/296px literals and most of the 45 inline
    widths (B3).
- **Wins:**
  - Uniformity: every control looks the same in all five generations.
  - About **−850 CSS lines**: ~1,000 out, ~150 in.
  - The four classes that have no rule today (`buttonStyle_column3`, `dropdown_menu_column3` in gen4/5;
    `manual_dv_input` in gen2) start doing something.
- **Visibility:** operator-only.
- **Risks:**
  - **Cascade order.** Today a gen sheet's control rule can beat an earlier rule on the same element only because
    it comes later in the file. Once it moves to a sheet that loads earlier, that earlier rule wins instead.
    Example: gen2's `.set_button_style` (:2644) comes before `.buttonStyle` (:2656). `set_button_style` is dead in
    gen2, but check each such pair.
  - **Classes with no rule today.** gen4/5 put `set_button_style` and `comparison_button` on buttons that have no
    rule for them now. If the shared sheet adopts gen1's `.set_button_style {width:96px}`, gen5's "Set Timer"
    shrinks from 280px to 96px. Define these variants on purpose.
  - The panel layout moves by a few pixels. The harness's layout/pixel oracles for gen1-5 out-of-battle
    checkpoints will change, so the baselines must be re-captured in this commit, separate from B1.
  - No class or id is renamed.
- **Size:** M.
- **Needs Scott's call:** yes, one question. "Use gen4/gen5's look for every settings control: 22px green
  controls, 15px text, pale-green text boxes, 15px checkboxes. Yes?"

### B3 Turn the 88 inline control styles into classes
- **Now:** 88 static `style=""` attributes on controls (see the inventory). They come in four kinds:
  - widths (≈45; for example gen2's 17 text-field widths, gen3's 4 × `width:296px`, gen4's 8 × `width:140px`);
  - the dev "Style Mode" and defaults buttons at `font-size:11px` (13), with `color:#f44` on the destructive ones (6);
  - the yellow species select (3);
  - the "Unify Styles" row (`width:85-100px; height:23px; top:-2px`) and the RNG button
    (`padding:2px 10px; font-size:12px`), each written differently in each generation.
- **Proposal:**
  - Add classes to `controls.css`: `.ctlDev` (the 11px compact button), `.ctlDanger` (red text), `.ctlCompact`
    (the 100×22 inline button in a row) and `.ctlRight` (right-aligned numeric or time fields).
  - Widths mostly vanish under B2's `--ctl-w`. Two side-by-side controls (ability + gender, evolution + Unify)
    become `.ctlPair` with two children at 50/50.
  - Existing classes stay; the new classes are only added.
- **Wins:** −88 attributes, and every generation's dev buttons and paired rows look the same. Line count is about
  neutral (attributes become ~20 CSS lines); the gain is clarity.
- **Visibility:** operator-only.
- **Risks:** none for ids or saved keys. Pixel/layout baselines change (do it in the same commit as B2).
- **Size:** S–M.
- **Needs Scott's call:** no.

### B4 One panel style: drop gen1's boxed, filtered columns, and pick one label font
- **Now:**
  - gen1's settings sit in three **boxes**: 4px black border, translucent `#c9ffbba6` fill and a
    `drop-shadow(0 4px 4px)` filter on each 250–580×988px column (style.css:523-581). gen2-5 put controls straight
    on the coloured game-area art, with no box.
  - Panel text differs in size: 15px/21px (gen1), 13px/15px (gen2), 14px/14px (gen3), 12–13px/13px (gen4) and 13px
    (gen5). Every generation uses the same Play-Bold file (`osb` and `play` are both `Play-Bold.ttf`).
  - gen3-5 add `text-transform: capitalize`, which turns "Show bonk/item counter:" into "Show Bonk/item Counter:".
    gen1/2 show labels as written.
- **Proposal:**
  - Adopt gen2-5's box-less panel. It removes three large filtered layers in gen1 (see B8).
  - Put one panel rule in `controls.css`, keyed on the existing column classes (`.testingAreaN`, `.debuggingN`,
    `.uiN`): Play 700, 13px, line-height 15px, no `text-transform`.
  - Write labels in Title Case in the templates where they rely on `capitalize` today. That is a text edit, so
    coordinate it with whoever audits labels.
  - Column *positions* stay per generation: that is layout, and the panel widths differ per generation.
- **Wins:** a single panel style. About −60 CSS lines (the 12 panel rules collapse to one shared rule plus 3–4
  position rules per generation). gen1 loses three filtered layers.
- **Visibility:** operator-only, but gen1's boxes show in the overlay window.
- **Risks:**
  - The layout oracles change for all generations.
  - Removing `capitalize` changes every gen3-5 label that was written in lowercase. Grep the label texts first.
  - ARCHITECTURE/plan §4 ("Rules for the CSS refactor") still says "Font family, weight, style … are never
    proposed". Decision 26 (now a guideline) supersedes it for operator UI, but §4 should be updated so the next
    agent does not refuse this.
- **Size:** S (CSS) + S (label text).
- **Needs Scott's call:** yes. "gen1's settings panels sit in black-bordered boxes; gen2-5's don't. Drop the boxes
  in gen1 (recommended), or add them to all five? And should labels be Title Case as written (no automatic
  capitalising)?"

### B5 One size for the "primary" buttons (New Run, Load comparison)
- **Now:** "New Run" is 210×45/24px in gen1, 280×28/21px in gen3, and an ordinary 22–24px button in gen2/4/5.
  gen2 even has an unused `.new_run_button` rule. "Load split comparison" is `comparison_button`: 210×33/20px in
  gen1, 210×21/12px in gen3, and the class has no rule in gen4/5.
- **Proposal:**
  - Add `.new_run_button` to the New Run button in gen2/4/5 (adding a class only). Define it once in
    `controls.css` at gen3's 280×28/21px, which stands out without gen1's 45px.
  - `comparison_button` becomes a plain control-height button.
- **Wins:** the most-used button looks and sits the same everywhere. −30 CSS lines.
- **Visibility:** operator-only.
- **Risks:** the layout of column 1 shifts by about 6px in gen2/4/5. No ids are touched.
- **Size:** S.
- **Needs Scott's call:** yes. "Make 'New Run' the same bigger button in every generation (gen3's size)?"

### B6 Share what gen3-5 (and gen4/5) already copy verbatim
- **Now:** after B1, gens 4 and 5 still share **1,032 identical live lines** (52% of gen4). gen3 shares 370–500
  with each of them.
  - Among live rules, about **2,080 lines** are exact duplicates of another generation's rule. By group: gen4+5
    612, gen3+4+5 548, all five 176, gen2-5 114, gen1+2 216.
  - The newest features were pasted three times: `.nature_grid*` (gen3 :451-512, gen4 :310-373, gen5 :331-394),
    `.gameToggle*` (gen3 :411-445, gen4 :375-409, gen5 :396-430) and `.timerOffsetControls`/`.timerOffsetClearButton`
    (gen3 :763-797, gen4 :461-494).
  - They have already drifted: gen3's game images are 130px and centred, gen4/5's 90px and space-between. gen3's
    Clear button has `cursor:pointer`, gen4's does not.
- **Proposal:**
  - Move the control-like blocks (nature grid, game toggle, timer offset) into `controls.css` with B2.
  - For the remaining on-stream duplicates, add `core/styles/shared-gen345.css` (and/or `-gen45.css`), with
    selectors `:where(.gen-3, .gen-4, .gen-5) .movepool_header …`. Load it like the gen sheet (module `styles()`
    returns both) so it unloads with the module.
  - Only exact-duplicate live rules move, and each move must keep cascade order (same caveat as B2). Do it after
    B1, or you are moving dead code.
- **Wins:** about −2,000 lines. A fix to the move table or type badges then lands in every generation at once.
- **Visibility:** the moved rules include on-stream ones, but byte-identical rules render identically. No visual
  change is intended.
- **Risks:**
  - Cascade order (a moved rule now loads before the gen sheet). Mitigation: move only rules whose selector has no
    other rule in that gen sheet, then run the pixel/layout harness for gens 3, 4 and 5.
  - Phase 6 says CSS folding must be its own commit, never inside a move.
- **Size:** M–L.
- **Needs Scott's call:** no for the identical rules. Any rule that is "almost identical" (gen4/5 have 80 shared
  selectors with different bodies) is an on-stream look change, item by item.

### B7 Small code quirks in the control CSS (fix and log in known-legacy-bugs)
- `line-height: 13x` (gen4 style.css:251) and `14x` (gen5 :272) on `.ui1` are invalid, so Chromium drops them.
  Column 1 therefore has `normal` line spacing while columns 2 and 3 have 13/14px. That is why gen4/5's first
  column looks looser than the other two.
- `margin: 0 0x` (gen4 :885, gen5 :814) is invalid and dropped.
- `z-index: 5` followed by `z-index: 20000` in the same `.uiN` rule (gen4/5 ×3 each). Other repeated properties
  within a single rule: gen1 10, gen2 30, gen3 2, gen4 9, gen5 9. The first value is dead in each case.
- `.checkBoxStyle` sets `background`, `font-size` and `font-family` on a native checkbox (gen1 :513, gen2 :5097):
  no effect.
- **Proposal:** fix them in B1/B2 and log #7's line-height fix in `docs/known-legacy-bugs.md`. It is the only one
  that changes pixels (gen4/5 operator column 1).
- **Size:** S. **Needs Scott's call:** no.

### B8 CSS performance: full-screen filtered art layers (on-stream, measure first)
- **Now:** the panel art is a stack of **full 1920×1080 layers**. Each layer has:
  - a `drop-shadow` filter (`.ds`);
  - an `::after` with `mask-image`, `mix-blend-mode: color`, `filter: saturate(.6)`, and a 750 ms
    `background-color` transition (gen3 :288-310, gen4 :698-729, gen5 :635-666).

  How many are mounted at once, from the templates:

  | | `colored-image` | with `.ds` | behind `v-if`/`v-show` |
  |---|---|---|---|
  | gen2 | 23 | 13 | 4 |
  | gen3 | 33 | 29 | 0 |
  | gen4 | 30 | 28 | 1 |
  | gen5 | 27 | 25 | 5 |

  gen1's `.tinted-box` (20 uses, style.css:276-305 and :2941-2955) is the same design. Its filter chain is
  `saturate(var) drop-shadow(var(--drop-shadow))`, and the default shadow is `0 0 0 transparent`, so the
  drop-shadow pass runs for nothing.
  - Each drop-shadow is computed over a 2-megapixel layer, even though the art is only a thin frame.
  - Changing the overlay colour (species swap, evolution, colour picker) animates ~30 blended full-screen layers for
    750 ms.
  - This is `docs/performance-followups.md` item G ("CSS filters… unverified"), with the counts now known.
- **Smaller items:**
  - gen1's three `.testingArea` columns put a drop-shadow filter on large subtrees, so any hover or typing repaints
    the column through the filter. B4 removes it.
  - `filter: drop-shadow` on every `.dropdownMenu` (8–19 per gen) is cheap and can stay.
  - gen3-5 `.frame { filter: blur(0px) }` is dead (B1 removes it).
  - gen3-5 define `@keyframes blur-out` three times each; the last copy wins. Keep one.
- **Proposal:** measure before changing anything. Take a DevTools Performance and Layers capture of one gen3
  overlay with the clock running and one colour change. If paint time from these layers is significant, the
  lowest-risk fixes are:
  1. drop gen1's no-op `drop-shadow(0 0 0 transparent)` when `--drop-shadow` is unset;
  2. merge the static frame SVGs that share a colour into one masked layer per colour group (fewer, identical
     pixels);
  3. remove the `transition` during the first paint of a species load.
- **Wins:** possibly the largest GPU and paint saving on the page. Unmeasured, so no number is claimed.
- **Visibility:** **on-stream.**
- **Risks:** the pixel oracle will flag even ±1 changes from merging layers (filtered and blended edges).
- **Size:** M (measure S, fix M).
- **Needs Scott's call:** yes, but only after measuring. "The coloured frame art costs X ms per change; merge the
  layers (may shift edge pixels by ±1)?"

---

## Quick wins

1. **B1: delete dead and overridden CSS.** −8,954 lines (43%), zero pixels changed, provable with the harness.
   gen2 alone drops from 5,470 to 2,199 lines because its file is two pasted copies.
2. **B7: fix the invalid `line-height: 13x/14x`** in gen4/5 column 1 and the other no-op declarations. Minutes of
   work; gen4/5's three columns then share one line spacing.
3. **B2 + B3: `core/styles/controls.css` with tokens, plus classes for the 88 inline styles.** One look for every
   dropdown, button, field, checkbox and counter in all five generations. About −850 CSS lines, and themes get a
   single place to restyle controls.
4. **B5: one "New Run" button size.** Add one class in three templates and keep one rule.
5. **B6 (first slice): move the triple-pasted nature grid, game toggle and timer-offset CSS** into the shared sheet
   before they drift further. They have already started to.
