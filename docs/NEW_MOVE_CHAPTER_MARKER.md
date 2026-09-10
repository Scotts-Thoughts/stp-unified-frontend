# New Move Chapter Marker

When the player's lead Pokemon learns a new move, fire an OBS chapter marker
named `New Move - <move name>` (e.g. `New Move - Ice Beam`).

Implemented in `app/frontend.js` inside `mounted()`, immediately after the
existing trainer IN/OUT chapter-marker block. Calls the existing
`sendObsChapterMarker(chapterName)` method.

## Data sources

The active "source" depends on `mapper.properties.meta.state.value`:

| State          | Move source                              |
|----------------|------------------------------------------|
| `Battle`       | `mapper.properties.battle.yourPokemon`   |
| anything else  | `mapper.properties.player.team[0]`       |

> Note: `battle.enemyPokemon` is the **opponent**, not the player. The player's
> active battler lives at `battle.yourPokemon` (see `s1dynamic()` in
> `frontend.js`). If you're porting to a generation that names this differently
> (e.g. `battle.playerPokemon`, `battle.activePokemon`), update the path.

From whichever source is active, read four slot values and a species:

- `source.move1.value` ... `source.move4.value`
- `source.species.value`

## Detection rule

A "new move learned" event is recognized when **all** of the following hold,
comparing the latest snapshot against the previous validated snapshot:

1. `species` is unchanged (filters out lead swaps / fresh games / evolutions).
2. The previous snapshot had **at least one** non-empty move
   (filters out the very first starter and post-reset re-population).
3. The multiset diff `newMoves \ oldMoves` contains **exactly one** entry
   (filters out reorders, full-set replacements, and clears).

The marker text is `"New Move - " + addedMove`.

### Why a multiset diff

Move order in memory can shuffle without learning anything new
(`['Pound','Sing','Scratch','Bide']` → `['Bide','Sing','Scratch','Pound']`).
Set-equality on the multiset returns 0 added and we don't fire. A genuine learn
(`...,'Bide']` → `...,'Ice Beam']`) gives 1 added and 1 removed → fire with
`Ice Beam`. Filling an empty 4th slot gives 1 added and 0 removed → fire.

### Cases the rule covers

| Old set                           | New set                               | Result                  |
|-----------------------------------|---------------------------------------|-------------------------|
| `[Pound,Sing,Scratch,Bide]`       | `[Bide,Sing,Scratch,Pound]`           | reorder, no marker      |
| `[Pound,Sing,Scratch,Bide]`       | `[Pound,Sing,Scratch,Ice Beam]`       | **fires** `Ice Beam`    |
| `[Tackle,Growl,Leer,null]`        | `[Tackle,Growl,Leer,Bide]`            | **fires** `Bide`        |
| `[null,null,null,null]`           | `[Tackle,null,null,null]`             | first Pokemon, no marker|
| `[null,null,null,null]`           | `[Tackle,Growl,Leer,Bide]`            | game reset, no marker   |
| `[A,B,C,D]` (Pidgey)              | `[E,F,G,H]` (Geodude — lead swap)     | species changed, no marker |
| `[A,B,C,D]`                       | `[null,null,null,null]`               | clear, no marker        |

## Debouncing

All 8 watched properties (4 × `player.team[0]` + 4 × `battle.yourPokemon`) feed
into one `scheduleMoveCheck()` with a **100 ms debounce**. This is essential.

Without debouncing, when the battle struct populates at battle start, the four
slots fire change events one at a time. After event 1 only `move1` matches the
party data; if you compared snapshots then you'd see "1 added", incorrectly
firing a marker for the player's existing first move. Debouncing collapses the
burst into a single diff against the pre-burst snapshot, which (correctly)
shows zero net change.

Bursts that need to coalesce:

- Battle struct populating at battle start (4 slots fill in).
- Battle struct clearing at battle end.
- Lead swap (party data shifts).
- Game reset (everything goes null, then re-populates).

## Snapshot lifecycle

- Initial snapshot is taken at the bottom of `mounted()` via `readMoveContext()`.
- Every time `checkForNewMove()` runs (debounced), the snapshot is overwritten
  with the just-read context — even if no marker fires. This keeps the
  comparison baseline current and prevents one missed fire from corrupting
  every subsequent comparison.

## Algorithm reference

```
readMoveContext():
    state = meta.state.value
    source = (state == 'Battle') ? battle.yourPokemon : player.team[0]
    return { species: source.species.value,
             moves:   [source.move1..move4 .value] }

checkForNewMove():
    previous = lastMoveContext
    current  = readMoveContext()
    lastMoveContext = current                 # always update

    if previous.species != current.species: return

    oldMoves = previous.moves filter !empty
    newMoves = current.moves  filter !empty

    added = multiset(newMoves) - multiset(oldMoves)

    if oldMoves.length >= 1 AND added.length == 1:
        sendObsChapterMarker("New Move - " + added[0])

scheduleMoveCheck():    # debounced wrapper
    clearTimeout(timer)
    timer = setTimeout(checkForNewMove, 100)

# Hook the 8 properties:
for slot in [move1..move4]:
    player.team[0][slot].change(scheduleMoveCheck)
    battle.yourPokemon[slot].change(scheduleMoveCheck)
```

## Porting checklist

When implementing in another version of the software:

1. **Verify the property paths** in the target generation's mapper:
   - Player party slot 0: usually `player.team[0]` or `player.party[0]`.
   - Player active battler: usually `battle.yourPokemon` — but **confirm**,
     gens differ.
   - Game state: `meta.state.value` and the literal string `'Battle'`.
2. **Verify the move slot names** are `move1..move4` (some mappers use
   `moves[0..3]`, `move_1`, etc.).
3. **Verify `species.value`** exists on both sources for the species-change
   guard — if not, drop that guard or substitute a different identity check
   (e.g. `dexNumber`, `pid`).
4. **Empty-slot sentinel**: this implementation treats `null` and `''` as
   empty. If the target mapper uses `0`, `'-----'`, or `'NONE'`, extend the
   filter accordingly.
5. **Keep the 100 ms debounce.** Don't shorten it below the mapper's worst-case
   inter-property update gap, or the burst-coalescing will break and you'll
   get phantom markers on battle start / end.
6. **Reuse `sendObsChapterMarker`** if it exists; otherwise port that helper
   first — it owns the OBS WebSocket connection and request shape.
