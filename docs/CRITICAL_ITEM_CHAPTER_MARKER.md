# Critical Item Chapter Marker

When the player obtains an item that could be critical to a playthrough, fire
an OBS chapter marker named `Item - <name>` (e.g. `Item - Pink Bow`,
`Item - TM27 Return`, `Item - HM03 Surf`).

Implemented in `app/frontend.js` inside `mounted()`, immediately after the
"new move" chapter-marker block. Calls the existing
`sendObsChapterMarker(chapterName)` method.

## What counts as critical

Four categories. Any item not in one of these allowlists is ignored.

### Vitamins (mapper-format names)

`Hp Up`, `Protein`, `Iron`, `Carbos`, `Calcium`, `Pp Up`, `Rare Candy`

### Type-boosting damage held items

Sourced from `app/lib/typeBoostingItems.js` and normalized to the mapper's
casing. In Crystal these are: `BlackBelt`, `BlackGlasses`, `Charcoal`,
`Dragon Fang`, `Hard Stone`, `Magnet`, `Metal Coat`, `Miracle Seed`,
`Mystic Water`, `NeverMeltIce`, `Pink Bow`, `Poison Barb`, `Polkadot Bow`,
`Sharp Beak`, `SilverPowder`, `Soft Sand`, `Spell Tag`, `TwistedSpoon`.

> Silk Scarf is Gen 3+, not in Crystal — omitted.

### Berries

`Berry`, `Berry Juice`, `Bitter Berry`, `BurntBerry`, `Gold Berry`,
`Ice Berry`, `Mint Berry`, `MiracleBerry`, `MysteryBerry`, `Przcureberry`,
`Psncureberry`.

### TMs and HM03 Surf

All 50 TMs (`TM01-DynamicPunch` ... `TM50-Nightmare`). Of the HMs, **only
HM03-Surf** fires a marker — the others are skipped per spec.

## Data sources

Three independent watchers:

| What                    | Path                                          | Type                      | Trigger                       |
|-------------------------|-----------------------------------------------|---------------------------|-------------------------------|
| Bag (vitamins, berries, type-boost held items) | `player.items.0..20.item` **and** `.quantity`, plus `player.team.0..5.heldItem` | string name / int quantity | total owned count of a critical name increases |
| TMs                     | `player.tms.<TMxx-Name>` (50 keys)            | int (quantity)            | value transitions `<= 0` → `> 0` |
| HM03 Surf               | `player.hms.HM03-Surf`                        | bool                      | `false` → `true`              |

The bag has 21 fixed slots (`0..20`); empty slots have `value === null`.
Detection is now **quantity-aware**: both each slot's `.item` and its
`.quantity` are watched, so restocking an existing stack (Rare Candy ×3 → ×4)
fires even though the slot's name never changes. Team-held copies
(`player.team.N.heldItem`) are folded into the same per-item total so that
moving an item between the bag and a Pokemon's hands nets to zero.

Property keys with hyphens (e.g. `TM27-Return`, `HM03-Surf`) require bracket
notation in JS: `mapper.properties.player.tms["TM27-Return"]`.

## Detection rules

### Bag (vitamins / berries / damage held items)

1. Snapshot a **map** of `name → total count` (summed bag quantities + held
   copies) at startup.
2. On any `player.items.N.item`, `player.items.N.quantity`, or
   `player.team.N.heldItem` change, debounce 100 ms, then re-read the full map.
3. For each critical name whose total **increased** since the last snapshot,
   fire `Item - <name>` once (regardless of how many were gained — a 5-pack
   from the mart is one marker). The increase is first netted against any
   recently banked decrement (see below) so held↔bag moves don't fire.
4. Overwrite the snapshot with the just-read map, regardless of fires.

Restocking now **does** fire (Pink Bow ×1 → ×2, Rare Candy ×3 → ×4). Slot
reshuffles from using/selling other items still don't, because the summed
total of an untouched name is unchanged by a shift. Using or selling a
critical item is a decrease, so it never fires.

**Held↔bag move suppression.** Giving a bag item to a Pokemon to hold (or
taking it back) is two RAM writes — one source loses a copy, the other gains
one — leaving the grand total unchanged. Within a single debounce window this
is a net-zero diff. If the two writes straddle the window, the decrement is
banked in a per-name credit list (`MOVE_GRACE_MS = 2000`) and the matching
increment is cancelled against it before the fire check. A genuine pickup has
no offsetting banked decrement, so it still fires.

### TMs

Per TM, on `change`, fire when `oldProp.value <= 0 && newProp.value > 0`.

- First acquisition (0 → 1): fires.
- Buying a duplicate (1 → 2): does not fire.
- Selling all then re-buying (3 → 0 → 1): fires on the re-acquisition.

### HM03 Surf

On `change`, fire when `newProp.value === true && oldProp.value !== true`.
HM03 cannot normally be lost in Crystal, so this is effectively one-shot
per playthrough.

## Marker format

| Source                | Marker text             | Notes                                              |
|-----------------------|-------------------------|----------------------------------------------------|
| Bag item              | `Item - <name>`         | mapper casing preserved (e.g. `Item - Przcureberry`) |
| TM                    | `Item - TM27 Return`    | hyphen in property key replaced with space         |
| HM03 Surf             | `Item - HM03 Surf`      | hardcoded                                          |

## Debouncing

Same 100 ms debounce pattern as the new-move marker. Required for the bag
because using or selling an item triggers cascading slot shifts: slot 1
changes (A → B as B shifts up), slot 2 changes (B → C), etc. Without
debouncing, each shift would diff the bag mid-shift and could spuriously
match a "new" name. Coalescing collapses the cascade into one diff against
the pre-burst snapshot.

The TM and HM watchers don't need debouncing — each property is independent
and the transition test is self-contained per event.

## Snapshot lifecycle

- `lastOwnedCounts` is initialized at the bottom of `mounted()` from
  `readOwnedItemCounts()`. So if the user starts the app mid-playthrough with a
  Pink Bow already in the bag, no spurious marker fires (the count starts at
  its current value, not 0).
- TM and HM watchers rely on the mapper's own `oldProp` value passed to the
  change callback — no separate snapshot needed.
- On a game reset, the bag clears (counts → 0). A drop to 0 is a decrement, so
  it never fires, and subsequent re-acquisitions in the new run fire normally
  (the per-name decrement credit expires after `MOVE_GRACE_MS`, so a reset
  followed by a re-pickup seconds later still fires). Same for TMs (they reset
  to 0).

## Algorithm reference

```
# Allowlists
VITAMINS = {Hp Up, Protein, Iron, Carbos, Calcium, Pp Up, Rare Candy}
DAMAGE_HELD = {BlackBelt, BlackGlasses, Charcoal, Dragon Fang, Hard Stone,
               Magnet, Metal Coat, Miracle Seed, Mystic Water, NeverMeltIce,
               Pink Bow, Poison Barb, Polkadot Bow, Sharp Beak, SilverPowder,
               Soft Sand, Spell Tag, TwistedSpoon}
BERRIES = {Berry, Berry Juice, Bitter Berry, BurntBerry, Gold Berry,
           Ice Berry, Mint Berry, MiracleBerry, MysteryBerry,
           Przcureberry, Psncureberry}
isCritical(name) := name in VITAMINS ∪ DAMAGE_HELD ∪ BERRIES

# Bag + held items (quantity-aware)
MOVE_GRACE_MS = 2000
decrementCredit = {}   # name -> queue of {qty, at} recent unmatched losses

readOwnedItemCounts():
    counts = {}                                   # name -> total owned
    for i in 0..20:                               # bag: sum quantities
        add(counts, player.items[i].item.value, player.items[i].quantity.value)
    for i in 0..5:                                # team: each held copy = 1
        add(counts, player.team[i].heldItem.value, 1)
    return counts                                 # skips null/'' names and qty<=0

checkForNewItems():
    now      = Date.now()
    current  = readOwnedItemCounts()
    for name in keys(current) ∪ keys(lastOwnedCounts):
        if not isCritical(name): continue
        delta = current[name] - lastOwnedCounts[name]
        if delta == 0: continue
        if delta < 0:                             # bank the loss
            decrementCredit[name].push({qty: -delta, at: now}); continue
        gain = delta - consumeCredit(decrementCredit[name], delta, now, MOVE_GRACE_MS)
        if gain > 0:
            sendObsChapterMarker("Item - " + name)   # once, any gain amount
    lastOwnedCounts = current

scheduleOwnedCheck():    # 100 ms debounce
    clearTimeout(ownedCheckTimer)
    ownedCheckTimer = setTimeout(checkForNewItems, 100)

for i in 0..20:
    player.items[i].item.change(scheduleOwnedCheck)
    player.items[i].quantity.change(scheduleOwnedCheck)     # <-- catches restocks
for i in 0..5:
    player.team[i].heldItem.change(scheduleOwnedCheck)

# TMs
for tmKey in Object.keys(player.tms):
    player.tms[tmKey].change((new, old) => {
        if old.value <= 0 and new.value > 0:
            sendObsChapterMarker("Item - " + tmKey.replace('-', ' '))
    })

# HM03 Surf
player.hms["HM03-Surf"].change((new, old) => {
    if new.value === true and old.value !== true:
        sendObsChapterMarker("Item - HM03 Surf")
})
```

## Porting checklist

When implementing in another version of the software:

1. **Verify the property paths** — name and shape of the bag, TMs, and HMs
   varies by generation:
   - Bag size (Crystal: 21; Gen 3: 20–46 by pocket; etc.).
   - TM/HM property names and types — Gen 3+ uses item slots in the bag, not
     a separate `player.tms.*` namespace.
   - HM03 Surf might be at a different path or not exist as a discrete flag.
2. **Sync the allowlists with the target mapper's casing.** Open
   `localhost:8085/mapper` and grep the `glossary.items` table — names like
   `'Hp Up'` (lowercase `p`), `'Przcureberry'` (lowercase), `'BlackBelt'`
   (no space) are mapper-specific and have no fallback normalization here.
3. **Add or remove categories** — Gen 3 introduces Silk Scarf, the EV-boost
   power items, Choice Band, etc. Update `damageHeldItems` accordingly.
4. **Empty-slot sentinel** — this implementation treats `null` and `''` as
   empty bag slots; some mappers use `0`, `'-----'`, or `'NONE'`.
5. **Keep the 100 ms debounce** for the bag watcher; same reasoning as the
   moves marker.
6. **TM transition test** assumes integer quantity. If the target mapper
   stores TMs as bools or as a single bitfield, change `<=0 → >0` to the
   appropriate predicate, or watch a different property entirely.
7. **Reuse `sendObsChapterMarker`** — already present once you've ported the
   new-move marker.
