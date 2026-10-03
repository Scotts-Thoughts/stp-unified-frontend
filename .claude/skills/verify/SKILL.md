---
name: verify
description: How to run the STP overlay and observe a change on screen (build, replay a fixture through the real app, read the captures). Use when verifying that an overlay change works.
---

# Verifying an overlay change

The surface is the overlay window. The parity harness is the handle: it launches the built app, feeds it a
recorded game session through a mock PokeAByte, and saves what was on screen.

## Build and run

1. Node must be 22.12 or newer. If it isn't installed: `npx -y node@22 -p process.execPath`, then put that
   folder first on `PATH`.
2. `npm run build`
3. `npm run parity:run -- unified <fixture.jsonl.gz> --out=<scratch dir> --redirect-ports`
   (about real time: a 90 s fixture takes about 2 minutes; run one at a time).
4. Each capture folder in `<scratch dir>` has `screen.png` and `styles.json` (every element's on-screen text,
   keyed by CSS path). Read the text from `styles.json`; look at `screen.png` for the frame.

For a before/after, build a copy of `HEAD` in a scratch folder and run it as target `unified@<dir>`
(ARCHITECTURE.md §12 has the steps).

## Staging a state no fixture covers

The smoke fixtures in `tools/fixtures/` are short and generic. The mapper XMLs are not on the Mac, so
`make-fixture.ts` can't build a new one there. Instead:

1. Unpack a smoke fixture (`gzip -dc`). Line 1 is the header, with the full mapper tree (`paths`, `initial`)
   and the real `glossary` (exact ability, move, species and item names).
2. Keep its first 10 s (new game, starter), then append your own records:
   `["E", tMs, pathId, {value, bytes}]` for each value, and `["F", tMs, frame]` every 250 ms.
3. Give it a new `replayName`, gzip it, and run it as above.

## Gotchas

- A capture is taken when `meta.state`, `battle.mode` or `player.team.0.level` changes, at most one per
  reason per 2 s. Space state changes at least 2 s apart.
- The harness caches capture times in `tools/reports/<replayName>.checkpoints.json`. Delete it after
  re-timing a fixture.
- The harness always runs the built app. Rebuild after every source change.
- gen4 battle: set `battle.mode`, `meta.state` = `Battle`, `meta.state_enemy`, and make
  `battle.player.active_pokemon.internals.personality_value` match the party leader's.
- gen5 battle: also fill `battle.player.team.0.species` (move power shows "—" without it), set
  `battle.player.active_pokemon.ability_temp`, put the enemy in
  `battle.opponent.pkmn_ram.pokemon_0_ram`, and use trainer `--` for a wild battle.
- The scratch folder can be wiped mid-session. Keep results you need in your notes as you go.

## The clock frame

- The harness runs with `STP_TIMER_FRAME=off`, so a capture never shows the out-of-process clock
  (`core/overlay/ClockFrame.ts`); it shows the in-page clock.
- To see the frame itself, drive the built app with Playwright against the mock PokeAByte
  (`npx tsx tools/parity/mock-pokeabyte/cli.ts <fixture> --speed=0 --no-obs`), launching
  `node_modules/electron/dist/Electron.app/Contents/MacOS/Electron <repo> --user-data-dir=<scratch>`
  without that variable. Ports 8085, 30158, 30159 and 30160 must be free. The clock frame is
  `page.frames()` entry whose URL has `30160`; `frame.evaluate` works in it. Main can tell you its
  process: `app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].webContents.mainFrame.frames.map(f => f.processId))`.
- gen3 and gen5 draw nothing on their smoke fixture's first frame; play it (`--speed=1`) and wait.
- gen2 has no committed fixture, and the Mac's `~/Documents/mappers/DEPRECATED/gen2` Crystal XML is older
  than the one the gen2 profile reads: a fixture made from it needs ~30 missing leaf paths padded in as
  nulls before the overlay mounts (geometry checks only).
