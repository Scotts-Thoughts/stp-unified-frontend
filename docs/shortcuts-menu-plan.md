# Configurable shortcuts — plan

Status: **built 2026-10-14**, all of it, as written below. Builds on the global-shortcut hotkeys
(`src/main/hotkeys.ts`, `docs/hotkeys-without-keyhook-plan.md`). Later the same day main switched from Electron
global shortcuts to the `uiohook-napi` keyboard hook, because global shortcuts took F24 from the emulator. §4.3's
"register", "failed (taken by another program)", the 200 ms filter and "suspend unregisters" describe the old
main; the hook matches presses itself, ignores auto-repeats, and suspend only stops actions running. How it works now is ARCHITECTURE §4 "Shortcuts";
this file keeps the reasoning and the inventory.

What was built: gen1 77 actions (+ the app-wide "open the window"), gen2 90, gen3 145, gen4 128, gen5 110.
Differences from the plan text:
- gen2's Test Run, No increment and Re-filming Mode are actions; in gen2 they sit behind "Show Advanced
  Settings", not behind a dev-only gate as in gen1.
- Each gen1 settings button calls the same function as its shortcut (`components/settings/commands.ts`). "Set
  ROM Starter" reaches the Solo Pokemon panel through PubSub, because that panel owns the mapper write.
- The window is its own page, `src/renderer/shortcuts.html` (a second Vite entry), rather than the overlay's
  page with `?view=shortcuts`. It then loads nothing of the overlay.
- On the box-art screen the window shows gen1's shortcuts, which work there (gen1's F-keys always have),
  with a note to load a game for that game's own, rather than only "load a game first" (§4.4).
- Checks:
  - `npm run parity:shortcuts`: the engine self-test.
  - `npm run parity:shortcuts-app`: the built app, all five generations. It presses real keys, includes a
    reload to show bindings come back from disk, and runs on Windows only.
  - `npm run packaged:probe`: opens the window from the package.

## 1. Goal

1. A **Keyboard Shortcuts menu** where every shortcut the app has can be rebound or cleared.
2. Every useful thing the settings UI does (toggles, buttons, dropdown choices) is also available as a
   **shortcut action**, unbound by default, which the user can bind in that menu.
3. Today's F13–F24 keys stay bound by default and keep doing exactly what they do now. Each generation's keys
   differ (`games/genN/hotkeys.ts`).

## 2. What exists today (inventory, 2026-10-14)

There's no settings *menu* in any generation. The settings are always-drawn columns in the middle of the
1920×1080 overlay, under the game capture. Approximate control counts, dev-only included:

| | Controls | Reachable by F-key or control route today |
|---|---|---|
| gen1 (`components/settings/*.vue`) | ~90 (~66 in a release build) | ~20 |
| gen2 (`games/gen2/Overlay.vue` template L1–1069) | ~111 | ~12 |
| gen3 (`games/gen3/Overlay.vue` template L1–1693) | ~121 | ~14 |
| gen4 (`games/gen4/Overlay.vue` template L1–1300) | ~132 | ~22 |
| gen5 (`games/gen5/Overlay.vue` template L1–1077) | ~114 | ~18 |

gen4 and gen5 already have a "Keyboard Shortcuts" button that opens a static help popup (`togglePopup`). gen4's
popup shows gen5's keys.

## 3. Which controls become actions

| Control | Becomes | Example |
|---|---|---|
| Checkbox | one **Toggle** action | "Toggle: Show Repel Counter" |
| Button | one **Press** action | "New Run", "Attempt +", "Open Splits Folder", "Load replay / split file" |
| Dropdown with a short fixed list (≤ ~12 options) | one **Set** action per option, plus **Next** and **Previous** | "Stats: Base Stats", "Stats: next option" |
| Dropdown whose list comes from data (natures, abilities, hidden power types, textures, family members) | **Next** and **Previous** only | "Nature: next" |

**Left out**:
- text and number fields, including manual IVs/DVs, the timer offset, labels and searches;
- styling sliders;
- the starter and edition pickers (changing the run's species from a hotkey is too easy to do by accident);
- dev-only and Style Mode tools (Style Mode, enemy-sprite resize, export defaults);
- the Pokémon Editor, backport importer and optimization UI (debug tools that write to the ROM);
- dead controls (gen4/gen5 trainer search, gen4's legacy starter chooser).

The list can grow later. Adding an action is one entry in a table.

**Availability.** An action whose control is hidden in the current context does nothing, and the menu greys it
out. Examples: FRLG-only toggles in Emerald, Deoxys form for anything but Deoxys. **Show Advanced Settings is not
a gate.** An "advanced" toggle works by shortcut even while the column hides it.

## 4. Design

### 4.1 Action catalogs (renderer, per generation)

`games/genN/actions.ts` exports `genNActions(vm)` (gen1: `gen1Actions()` over its stores). It returns entries:

```ts
interface ShortcutAction {
  id: string;            // stable, persisted: "stats.set.base_stats", "counter.repel.toggle"
  label: string;         // as the settings UI words it
  group: string;         // the settings section it lives in ("Run", "Display", "Encounters", ...)
  run(): void;
  available?(): boolean; // §3 availability
  defaultShortcut?: string; // Electron accelerator, e.g. "F13"
}
```

- Each **current F-key handler becomes one action with its F-key as the default**. The body is moved over
  unchanged, including its `console.log` (the console oracle compares them) and its quirks. Example: gen1's F14
  ("EVs, pressed again Detailed EVs") becomes the action "Stats: EVs / Detailed EVs" with default `F14`.
- The rest call the same method or set the same field the control does, so persistence and watchers behave as if
  the control was clicked. A toggle action flips the bound field; a Set action assigns the option's value.
- `core/` holds only the types and the engine (§4.2), and never imports `games/` (ARCHITECTURE §10).
- `hotkeys.ts` in each generation is folded into `actions.ts`.

### 4.2 Engine (`core/shortcuts/`)

- **Bindings** are stored per generation in `user_state.json`, under a new key `shortcuts`:
  `{ [actionId]: accelerator | null }`. Only *changes* from the defaults are stored. `null` means "default
  cleared". Nothing is written until the user changes something; a mount-time write would show up in harness
  oracle 4.
- **Effective map** = defaults + stored changes. If two actions end up on one key, the menu refuses the second
  and offers to move the key.
- When a generation's overlay mounts, the engine sends main the list of accelerators to register. When it
  unmounts, the engine clears it.
- `core/hotkeys/KeyHook.ts` (a VK-code state machine) is retired; dispatch is by accelerator string.

### 4.3 Main process (`src/main/hotkeys.ts`)

- It is generalised from "register F13–F24" to "register exactly the accelerators the renderer sends"
  (`hotkeys:set`). It answers with the ones that failed (taken by another program, or invalid). On a press it
  sends `hotkeys:pressed` with the accelerator. The 200 ms auto-repeat filter stays, per accelerator.
- Side effect: F-keys a generation doesn't bind (gen1's F20–F22, for example) are no longer taken from other programs.
- `hotkeys:suspend` / `hotkeys:resume` unregister everything while the menu is recording a key. Otherwise the
  global shortcut would eat the key before the menu could see it.

### 4.4 The Keyboard Shortcuts menu (a separate window)

- **Why a separate window:** OBS captures the overlay window. A separate window never appears on stream, has room
  for ~80 actions, and is one shared component instead of five per-generation popups.
- It is a small `BrowserWindow` loading the same renderer bundle with `?view=shortcuts`, drawing
  `core/shortcuts/ShortcutsMenu.vue`. Main relays between it and the overlay:
  - the overlay sends the catalog's metadata (id, label, group, default, available, current binding, failed
    registrations);
  - the menu sends edits back;
  - the **overlay** persists them and re-registers. The overlay stays the only writer of `user_state.json`.
- Contents:
  - the active generation's actions, grouped like its settings columns;
  - a search box;
  - per row: the current key (click, then press a combination to record it), Clear, Reset to default;
  - a marker on keys that couldn't be registered;
  - "Reset all to defaults".
- With no game loaded (box-art screen), the menu says to load a game first.
- **Opening it:**
  - gen4/gen5: the existing "Keyboard Shortcuts" button opens this window instead of the static popup. That is a
    behaviour change and is logged.
  - gen1/2/3: a new "Keyboard Shortcuts" button in the first settings column (a layout change the harness will
    show).
  - An app-wide action "Open Keyboard Shortcuts menu", unbound by default.
- **Recording keys:** any combination of Ctrl/Alt/Shift/Win plus a key, converted from `KeyboardEvent.code` to
  Electron's accelerator syntax. F13–F24 from a Stream Deck arrive as normal key events.
  **Guard:** a letter, digit, Space, Enter, Tab, arrows or Backspace with no modifier is refused. As a global
  shortcut it would stop that key working in every program. F-keys, numpad keys and anything with a modifier
  are allowed.

### 4.5 Control server

No change. A `/shortcut?action=` route would be easy to add later if the queuer wants it.

## 5. Order of work

Each step is verified before the next, and each is a reviewable commit point for Scott. AGENTS.md says to leave
changes uncommitted, so stop and ask between steps.

1. **Engine + main + gen1 catalog** with only today's F-keys as actions. Behaviour should be identical.
   - Verify: typecheck, build, the injected-key test from the keyhook work (every F-key gen1 binds does what it
     did), and the gen1 harness.
2. **The menu window**, opened from gen1 and the app-wide action; rebinding and persistence for gen1.
   - Verify: rebind, restart, still bound; clear a default; conflict refusal; recording with shortcuts suspended.
3. **gen1's full catalog** (§3).
4. **gen2, gen3, gen4, gen5 catalogs**, one generation per step, with the menu button (gen2/3) or popup swap
   (gen4/5).
   - Verify each step: typecheck, `parity:drift`, the harness for that generation (only the new button should
     differ), and a sample of injected keys.
5. **Docs:**
   - ARCHITECTURE §2 (src/main, core) and §8;
   - a short "Adding a shortcut action" note in §4;
   - external-contracts (the new `shortcuts` key);
   - known-legacy-bugs entries for the popup swap.

## 6. Existing F-key quirks (kept by default; fix only if Scott says so)

Found during the inventory. Each would be its own change, logged in `docs/known-legacy-bugs.md`:

- **gen1:** the "Disable right panel hotkeys" checkbox does the opposite of its label (checked: F17–F19 all set
  Automatic). F24 ignores the Shuckie timer, unlike the Play/Pause button. The F13/F14 and F18/F19 console
  messages are swapped.
- **gen2:** F13 sets "Hidden Power" and F18 sets "Inventory". Neither is an option in its dropdown.
- **gen3:** F20 sets Base Stats and then immediately Automatic. "Disable Panel Hotkeys" is written but never read
  (always on at launch, so F17–F19 are off).
- **gen4:** F17–F20 write fields gen4 doesn't have (do nothing). F14's second press picks "Detailed EVs", which isn't
  in gen4's dropdown. Its shortcuts popup shows gen5's keys.
- **gen5:** `toggle_encounters` (F22) and the encounter watchers disagree on the Route 19/20/Flocessy map numbers.

Once every control has its own action, the simple fix for most of these is to rebind the F-key to the action
that does the intended thing.

## 7. Questions put to Scott

Scott said to build the plan as written, so each went with the recommendation:
1. The menu is a separate window (§4.4).
2. The left-out list (§3) stands. Anything on it can be added later as one entry in the generation's `actions.ts`.
3. The bare-key guard (§4.4) refuses typing keys with no modifier or only Shift.
4. Bindings are per generation (§4.2).
