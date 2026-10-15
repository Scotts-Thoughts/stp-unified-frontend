# Hotkeys without keyhook.exe — plan

Status: **option B built 2026-10-14** (`src/main/hotkeys.ts`, `uiohook-napi` 1.5.5). Option A was built first
(2026-10-13), but `globalShortcut` took F24 from Super Shuckie, which Scott pauses with it, so §2's answer is B.
§6 was written for the old `KeyHook` VK-code stream, which the shortcuts menu has since replaced: main now builds
an accelerator from each hook key-down (keycode -> key name, plus the event's Ctrl/Alt/Shift/Meta flags) and
matches it exactly against what the overlay bound. A key-down of a key already down is an auto-repeat and is
ignored, so a hold fires once. The notes below on option A are kept for the reasoning.

What the build found (§4 step 2, keys injected with `keybd_event` into a harness-driven gen1 run):
- every key registered; presses arrive as a down/up pair, and a second press of a key works;
- **Electron fires on every auto-repeat** (a 10-repeat hold gave 10 triggers), so main drops a press within
  200 ms of the same key's previous one. A realistic hold (500 ms delay, then 33 ms repeats) now fires twice,
  and two taps 300 ms apart fire twice. Option B would get this exactly right (one trigger), since it sees key-up;
- the built renderer is byte-identical with and without the change (all 1,084 files in `out/renderer`), so no
  harness oracle can differ;
- not run: `packaged:probe` (needs a fresh `build:unpack`), and the Mac.

## 1. Why

The F13–F24 hotkeys come from `keyhook.exe`, a closed-source Windows binary (no source anywhere, md5
`73db8f52…`, `docs/external-contracts.md` §7). It is not in the repo and has to be put next to the app by hand.
The antivirus on Scott's machine quarantines it from the working tree from time to time, and once held its spawn for
over a minute (`src/main/index.ts`, `tools/parity/targets.ts`). Builds made while it was quarantined shipped
without it and gave no warning, and it doesn't exist on the Mac at all. The goal is hotkeys with **no separate
executable to bundle**.

What the overlays actually need is small. Every binding in all five tables (`games/genN/hotkeys.ts`) is a bare
**F13–F24**:
- no Shift, Ctrl or Alt combinations;
- nothing listens for key-up or key-repeat;
- nothing reads the event's `time` field.

So any source that reports "F-key N was pressed, with no modifier held" is enough.

## 2. The open decision: exclusive or shared keys

| | A. Electron `globalShortcut` (recommended) | B. `uiohook-napi` npm package |
|---|---|---|
| What ships | Nothing extra; it is built into Electron 37 | A native Node add-on, installed and packaged by npm (prebuilt, N-API, no rebuild per Electron version) |
| Antivirus exposure | None | Low (a `.node` DLL, not a spawned exe), but non-zero |
| Do other programs still see F13–F24? | **No.** It uses Win32 `RegisterHotKey`, which takes the key for this app. If another program already registered a key, registration of that key fails. | **Yes.** It is a low-level hook that only watches, like keyhook.exe |
| Mac | Works, no permission needed. Mac keyboards stop at F20, so F21–F24 may not register there; log and carry on | Works, but needs the Accessibility permission |
| Code change | Smallest (§3) | Same shape as §3, with the hook in place of `globalShortcut`. It also gives real key-up events |

**Ask Scott:** do OBS, the Stream Deck software, the emulator or anything else also react to F13–F24? If not,
choose A. If something does, choose B. The rest of this plan is written for A; §6 lists what changes for B.

Two instances of the overlay at once: under A the second instance gets no hotkeys and logs which keys it couldn't
register. The app has no single-instance lock (`src/main` has no `requestSingleInstanceLock`), so this can happen.
The legacy apps use keyhook.exe, which doesn't take keys exclusively, so running one alongside doesn't conflict.

## 3. Changes (option A)

### 3.1 Main process: `src/main/keyhook.ts` → `src/main/hotkeys.ts`

- Delete `keyhook.ts`. The new file exports `startHotkeys(getWindow)` and `stopHotkeys()`.
- `startHotkeys` loops over F13..F24 and calls `globalShortcut.register("F13", …)` for each. VK codes run from
  `0x7C` to `0x87` in order, matching `core/hotkeys/keys.ts`. `register` returns `false` when another program
  holds the key. Collect those and print **one** `console.warn` naming them ("F21, F22 are taken by another program;
  those hotkeys are off"), the way keyhook.ts prints one warning today.
- On each press, send **two** events on the IPC channel: `{ down: true, keyCode, time }` then
  `{ down: false, keyCode, time }`, with `time = Date.now()`.
  **The key-up is required.** `KeyHook.processKey` tracks key state, and a second "down" without an "up"
  between them is treated as a *repeat*, which never fires a binding. Without the up event, every key would
  work once and then never again.
- Look up the window per press (`getWindow()`, skip if it is null or destroyed), as keyhook.ts does now.
- `stopHotkeys()` calls `globalShortcut.unregisterAll()`.
- `globalShortcut` can only be used after `app` is ready. The current call site is already inside `whenReady`.
- Keep the existing `process.platform === "linux"` early return. Linux global shortcuts are unreliable under
  Wayland, and nobody runs the overlay on Linux.

### 3.2 `src/main/index.ts`

- Swap the import and the two calls (`startKeyhook` → `startHotkeys`, `stopKeyhook` → `stopHotkeys` in
  `will-quit`).
- Replace the comment about the antivirus holding the synchronous spawn: there is no spawn any more. Keeping the call
  after `createWindow()` is still right, because the press handler needs the window.
- Cutter mode (`--cutter-*`) skips this block today. Leave it that way.

### 3.3 IPC channel name (preload and types)

The channel `keyhook:key` is internal: only main and preload use it, and it is not on AGENTS.md's do-not-rename
list. Rename it to `hotkeys:key` in `src/main/hotkeys.ts` and `src/preload/index.js`. Also fix the preload
comments ("Decoded keyhook.exe events", and the header line 10–11). Keep `window.api.onKeyEvent` and the
`KeyEvent` type in `src/renderer/index.d.ts` unchanged. The renderer doesn't need to know where key presses come from.

### 3.4 Renderer: no behaviour change

- `core/hotkeys/KeyHook.ts`, `Hotkeys.vue`, `keys.ts` and all five `games/genN/hotkeys.ts` keep their logic.
  Only update comments that say "keyhook.exe stream" (`KeyHook.ts` header and the `bindHotkeys` doc comment). The
  class name `KeyHook` can stay: renaming it touches the lifted overlays and `tools/port/lift-gen*.py` for no gain.
- **Keep** `GameModule.keyhookElement` and the empty `<div>` in `Hotkeys.vue`. That is DOM parity with gen1's
  legacy layout, and the layout oracle compares it. It has nothing to do with the exe.
- `core/window/virtualKeys.ts` (gen5's second-screen `sendVirtualKey`, node-key-sender) is a different feature.
  It sends keys rather than receiving them. Out of scope.

### 3.5 Tooling

- `tools/parity/targets.ts`, the `keyhook.exe` sandbox copy (around line 185): **keep it for legacy targets**. The
  legacy apps still spawn `keyhook.exe` from their cwd, and their baselines contain `Error: spawn keyhook.exe ENOENT`
  when it is missing. Limit the copy and its two log lines to `target.kind !== "unified"`, and update the comment.
  `resources/keyhook.exe` stays wherever the harness reads it from. It is no longer *shipped*, only used as a
  harness input for the legacy apps.
- `tools/parity/packaged-probe.ts` (around lines 9 and 122–126): replace the two keyhook checks with one
  check that the main log has no "taken by another program" line from §3.1. Update the header list.
- `tools/parity/verify-all.ts` line 21: the comment about the antivirus stalling keyhook.exe's spawn now applies
  to the legacy apps only. Reword it.
- `package.json` `extraFiles: resources/**`: still needed for the icons. Nothing to change unless `resources/`
  ends up holding only icons. Then a narrower glob would stop a stray `keyhook.exe` from being packaged.
- `tools/port/lift-gen*.py`: historical, do not re-run or edit (ARCHITECTURE §12).

### 3.6 Docs

- `ARCHITECTURE.md`:
  - §2: the `src/main` line and the `index.ts` and `keyhook.ts` bullets.
  - §8: the keyhook.exe row in the systems table, and the paragraph after the table about where main looks for the exe.
  - §13: drop this plan's row once it's done.
- `docs/external-contracts.md` §7: mark keyhook.exe as a legacy-app-only input. Add a short note on what
  the unified app does now: `globalShortcut` takes the keys exclusively, and the second-instance behaviour.
- `docs/known-legacy-bugs.md` #23: change the "unified app" column to say the exe is no longer used.
- `README.md` lines 15 and 33.
- `AGENTS.md` Mac note ("There is no keyhook, so no hotkeys"). Per AGENTS.md, **suggest** this edit to Scott rather
  than making it.
- `docs/parity-harness.md` around line 378: the sandbox now seeds keyhook.exe for legacy targets only.

## 4. Verification

1. `npm run typecheck`. It doesn't cover `src/main`, so also run `npm run build`, which only catches syntax and
   import errors there.
2. **The keys really fire (manual, Windows).** Start the app with the network block, as the harness memory notes
   require. Load a gen1 fixture, then send a synthetic F-key from PowerShell with `keybd_event`/`SendInput`
   (`RegisterHotKey` responds to injected input), for example F15 with VK `0x7E`. Confirm:
   - the "Key: F15 pressed…" console line appears and the stats panel changes;
   - a **second** press of the same key also works (this is the key-up check in §3.1);
   - holding the key fires once, not repeatedly. Legacy ignored repeats. If Electron fires again on auto-repeat,
     add a guard in main that drops a press of the same key while it is still held. That needs option B's key-up
     events, or a short per-key cooldown. Record what you find in ARCHITECTURE §8.
   - Repeat the checks once for a lifted generation (gen3, whose table differs most).
3. **Nothing else changed:** run the harness for gen1 and one lifted generation. No oracle presses a key, so all
   nine should match a HEAD-worktree capture. The main-process log line changes, but that isn't an oracle.
   `npm run parity:drift` isn't needed unless a gen2–5 file was edited (comments in `games/genN/hotkeys.ts` would count).
4. **Packaged build:** `npm run build:unpack` then `npm run packaged:probe`, with the probe updated as in §3.5.
5. **Mac:** `npm run dev`, then press F13–F19 on a keyboard that has them, or use a synthetic event. Record whether
   F20–F24 register.
6. Report which checks ran and which couldn't.

## 5. Order of work

One change, one commit: §3.1–§3.4, then §3.5, then §3.6, then §4. The harness can't see the switch, so it
doesn't need splitting. Leave it uncommitted for Scott, per AGENTS.md.

## 6. If option B (`uiohook-napi`) is chosen instead

- `npm install uiohook-napi`. Check that electron-builder copies its prebuilt `.node` file into
  `dist/win-unpacked` (`asar: false` already, so no unpack rule is needed). Add that check to `packaged-probe.ts`.
- In `src/main/hotkeys.ts`, start `uIOhook` and listen to `keydown`/`keyup`. Map its keycodes, which are libuiohook
  scan-code constants (`UiohookKey.F13…F24`) and **not** Windows VK codes, to `0x7C…0x87`. Forward
  every key, modifiers included, as real down/up events. Then `KeyHook` gets the same stream keyhook.exe gave it, and
  the modifier and repeat handling works as before. Call `uIOhook.stop()` on quit.
- Mac: the first run asks for Accessibility permission. Document that in AGENTS.md's Mac note (suggest it to Scott).
- Verification as in §4, plus confirming that OBS (or whatever needed the keys) still receives them.
