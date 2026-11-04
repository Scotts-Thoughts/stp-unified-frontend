# Performance review — what was done and what is left

Reviewed 2026-09-17: the shared timers, the mapper client, the Super Shuckie polling and the
persistence layer, across all five generations. The brief was to reduce the load on the user's
machine without changing what the overlay does. Nothing here was measured at runtime; every
item is visible from the source. The parity harness (`docs/parity-harness.md`) is the check
that behaviour held.

## Where the load was

The timers themselves are cheap. Each generation runs one `requestAnimationFrame` loop that
formats a string and sets two reactive fields, which re-renders one small component per frame
(`logic/Timer.ts` for gen1, `games/gen3|gen5/logic/Timer.js`, the inline `updateTime()` in
gen2 and gen4). The load was in what the timers are wired to.

## Fixed in this pass

### 1. Super Shuckie polling (all five generations)

`GET http://127.0.0.1:30158/stats` was polled every 10 ms whenever the overlay was mounted:
100 requests and 100 JSON parses a second for the whole session, and each response became a
*new* reactive object, so every computed and template binding on the stats re-ran 100 times
a second even while the emulator sat idle. gen1, gen2, gen3 and gen5 polled even with the
Shuckie timer and counters both off; only gen4 gated its loop (Phase 2).

Two changes, both behaviour-identical:

- **Gate the loop on `shuckie_timer || shuckie_counters`** (gen4's gate), in
  `core/stores/useEmulatorStatsStore.ts` (through the `enabled` option gen1's `activate()`
  passes) and in the gen2/3/5 `mounted()` intervals. Every reader was checked and is behind
  one of the two flags: gen1's `timer.vue`, `faults.vue`, `settings/metrics.vue`,
  `games/gen1/hooks.ts`; the lifted overlays' timer text (`v-if="shuckie_timer"`), the fault
  counter blocks (`v-if="shuckie_counters"`), `blackouts_resets()`, `shuckie_faults_check()`,
  the counter decrement path and the split log's `shuckie_rt` ternary.
- **Skip the reactive assignment when the body is byte-identical** to the previous poll
  (`_lastStatsText` in the store, `_lastEmulatorStatsText` in the overlays). The object would
  have been equal in every field; leaving it alone means nothing dependent re-runs. gen1's
  overlay used to *watch* `emulator.stats` to call `ensureStarted()` after every poll; that
  watcher would have gone quiet, so the same check is now the store's `afterPoll` hook, run
  after every successful poll exactly as before.

Note for the record: the gen2-5 `fetchEmulatorStats()` still carries a branch that re-syncs
the local timer from a `stats.time` string. `/stats` has no `time` field
(`docs/external-contracts.md` §3), so the branch has never run against the real emulator; it
was left in place, and it still sees every poll (it reads the cached object when the body was
unchanged), so it behaves the same if the field ever appears.

### 2. Settings-file write bursts (`core/persistence/userState.ts`)

The write debounce was leading-edge with a 250 ms window and one timer per burst. A burst
that never ends -- gen2 persists `timer_formatted_time` from a watcher on every animation
frame for the whole run -- rewrote `data/user_state.json` four times a second. Now a write
that follows a landed write waits out `BURST_INTERVAL_MS` (1 s) from it. Every in-app read is
served from the cache, `beforeunload` still flushes, and the parity harness reads the cache
(`window.__stpUserState`) and excludes the file from its tree diff, so nothing observable
changed. The only difference is a hard crash mid-burst, which can now lose up to a second of
the last edits instead of 250 ms.

The write was fixed in the persistence layer rather than at gen2's watcher on purpose: the
persisted keys are what the legacy `localStorage` held, oracle 4 compares them at every
checkpoint, and gen2's watcher is part of that contract.

### 3. The mapper client's 60 s refresh leak (`packages/gameHookMapperClient.ts`)

`loadMapper()` ended by scheduling itself again in a minute and never cancelled the previous
timer. It is also called from every `MapperLoaded` event and every reconnect, so each of
those added one more permanent chain. Every chain's refresh re-fetched the whole `/mapper`
document, recreated every property object, reassigned `properties`, and that invalidated the
`game` computed in `main.ts`, which re-renders the entire overlay template. After a few
mapper switches the overlay was rebuilding several times a minute.

Now there is one `_refreshTimer`, cleared before it is rescheduled and in
`_deconstructMapper()` (which `disconnect()`, a lost connection and a failed refresh all go
through). The refresh itself is unchanged: once a minute after the latest load, as the
reference client intended.

### 4. `split_data` persisted into every species entry (found 2026-09-17, after the review)

The lag Scott reported after the first three fixes had a different cause: gen2-5 persisted
the autosplitter's ever-growing `split_data` array under a bare key *and* inside the running
species' style entry, so `data/user_state.json` had reached 324 MB (237 arrays). Every
settings write serialised it on the renderer's main thread (about a second), sent it over
IPC and `writeFileSync`'d it in main; startup parsed it. Nothing read the arrays back.
Fixed: the persistence sites are gone, `parseUserStateFile` strips the arrays from an old
file, and the 31 shipped gen2 style defaults that carried them are cleaned
(known-legacy-bugs.md #43). Without the arrays the file is 0.6 MB.

## Second pass (2026-09-17)

Items A, B, C, D and H below are done; E, F and G are left, each with the reason.
Verified the way §"How to verify" says: a `HEAD` (`ca5daf7`) worktree capture per fixture
(`tools/reports/<fixture>.perf-head`), the working tree (`.perf-final`), `diff.ts` between
them (`.perf-diff`). gen1, gen3, gen5 and the Crystal recording: all nine oracles green,
pixels exact. gen4: pixels exact and green on every oracle but 4, where the only key that
differs is `Platinum_Heatran` -- `{}` at HEAD, the shipped default in the working tree,
because `games/gen4/data/style/Platinum_Heatran.json` was an untracked file at the time
(absent from the worktree). `npm run parity:selftest` and `parity:debounce`, which drive
the client outside Vue, pass.

Review pass afterwards: the `PropertiesChanged` loop's `return` on an unknown path is a
`continue` (it dropped the rest of the batch -- a legacy client bug, never hit by the mock);
the refresh timer catches a failed `refreshMapper()` and reschedules while a mapper is
loaded (one transient failure used to end the resync for the session); the refresh no
longer serialises the glossary to compare it.

### A + H. The mapper client's internal tables are raw; a batch writes only what changed

`packages/gameHookMapperClient.ts`. `_propertiesMap`, `_debouceMap`, `_change`, `_once` and
`_properties` are `markRaw()`'d; the client itself stays in `main.ts`'s `data()`, so `meta`,
`properties` and every property object are reactive exactly as before. The lookup map holds
each property's *reactive proxy* (`reactive(x)`, the same proxy the overlay reaches through
`properties`), so a SignalR write through it still triggers. `updateProperty()` now takes the
`oldProperty` snapshot off the raw object (`snapshotProperty`) and assigns through
`applyPropertyFields`, which writes a field only when it differs (`bytes` by content; it is a
fresh array in every DTO). The handler semantics are untouched: the snapshot is still taken,
`.change()`/`.once()` still fire on `fieldsChanged.includes('value')`, `onPropertyChanged`
still gets every event. The debounce loop walks a raw `Map`, and skips when no mapper is
loaded (the map is `null` then). `loadMapper()` builds the tree plain and assigns
`properties` once instead of growing it key by key through the proxy.

### B. The 60 s refresh stays, but no longer rebuilds the tree

Decision: keep the resync (it is the reference client's contract and the mock serves it --
`parity-harness.md` §3), drop the rebuild. The timer now calls `refreshMapper()`: `GET /mapper`,
and if the document's property set is the loaded one (it always is -- a different set means a
mapper change, which arrives with its own `MapperLoaded`), the fetched fields are written onto
the *existing* property objects through `applyPropertyFields`, no handlers, like the old
refresh fired none. `properties`, the tree, the debounce map (with any pending debounced
update, which the rebuild used to drop) and `meta`/`glossary` (unless their JSON changed)
keep their identity, so `main.ts`'s `game` computed is not invalidated and nothing
re-renders unless a value actually moved. A struct/bitArray value is compared by JSON on
this path only. Any other property set falls back to `loadMapper()`.

The "cached property object goes stale after a refresh" bug therefore cannot happen from the
refresh any more (gen3's `batt` turned out to be a computed over `game`, not a `data()`
cache, so there was no instance of it to fix). It can still happen on a SignalR *reconnect*,
which does rebuild the tree with the overlay mounted -- and, separately, `_deconstructMapper()`
empties `properties` under a mounted overlay for the length of the reconnect. Neither is a
performance item; noted here so nobody looks for them in the refresh again.

### C. gen1's timer loop is quiet with nobody listening

`logic/Timer.ts`: `updateLoop` skips `update()` when `PubSub` has no `@timer/update`
subscriber (`PubSub.hasSubscribers`, new). The loop itself still runs (the singleton outlives
the overlay), it just does no formatting and no publish. The explicit `update()` calls
(`set`/`start`/`toggle`/`initialize`) are not gated, so a `timer.vue` that mounts while the
timer is paused gets its value the way it always did. This only works because
`components/left_panel/timer.vue`'s unsubscribe hook was spelled `onUnmounted`, which the
Options API never calls -- every overlay unmount left the dead instance subscribed. It is
`unmounted` now; a remount used to publish into one live and N dead components, which was
harmless but meant the gate would never have engaged.

Skipping the publish when the centisecond text repeats was *not* done: a subscriber that
appears in a frame where the text repeated would miss a frame of updates, which the
harness's frame grid can see, and the saving is two no-op reactive assignments (Vue's `set`
already drops an unchanged primitive).

### D. `NON_STYLE_KEYS` is a `Set`

`games/gen2|gen4|gen5/storage.ts`: `.includes` on a 70-entry (gen2) or 23-entry array is a
`Set.has`. `isStyleSettingsKey` runs on every `MyStorage` read and write, including gen2's
per-frame `timer_formatted_time`. What remains on that path -- `isGlobalKey` (five
comparisons), the cache write and the debounced `schedule()` early-return -- is already flat.

### Left alone

- **E. gen4's `setImmediate` hop.** One macrotask per frame; nothing measurable to gain and
  the harness's frame-grid expectations were built with it in place
  (`docs/parity-harness.md` §9, determinism). Measure at runtime before touching.
- **F. The 500 ms owned-item ticks (gen3/gen5).** ~130 proxied reads twice a second. The
  proposed replacement -- refresh `lastSeenOwned` on the next `change()` instead -- is a
  behaviour change: after 2 s without any bag/held event, the next event would see a stale
  timestamp and `checkForNewOwnedItems` would announce an item the player has held all
  along as an `Item -` chapter marker. Not worth that for the saving.
- **G. CSS filters on the lifted overlays.** Cannot be confirmed from source and cannot be
  measured in a harness run (it needs a DevTools paint-flashing / layers session on a live
  overlay). The two source-level mitigations both risk the pixel oracle: `contain: paint` on
  `.gametime` clips overflowing text, and giving it its own compositing layer switches its
  text from subpixel to grayscale antialiasing. Left for a session with DevTools open.
  **Measured 2026-10-15** (`npm run parity:art-layers`, numbers in `docs/ui-uniformity-plan.md` §6.2 under decision
  32). The full-screen tinted art layers add 2–5 ms of GPU-process time per idle frame, and the idle frame rate held.
  An overlay-colour fade costs 27–34 ms a frame, so it plays at about 35–45 fps. Most of that comes from the number of
  layers; the filters and blend are a small part.

## Left for a second pass (as written before the pass above)


Ordered by expected gain. None changes behaviour by design, but each touches something the
parity harness should be run against.

### A. The mapper client runs through Vue's reactive proxies

`main.ts` keeps the `GameHookMapperClient` in the root component's `data()`, so the whole
instance is deep-reactive: `_propertiesMap`, `_debouceMap`, `_change`, `_once`, and every
property object. Every SignalR `PropertiesChanged` batch therefore does its `Map` lookups
through instrumented proxies, assigns eleven proxied fields per changed property (each a
`trigger()`), and allocates an `oldProperty` copy. Only `.value` and `.bytes` have template
dependents. The debounce `requestAnimationFrame` loop also iterates `_debouceMap.values()`
through the reactive `Map` iterator every frame.

Candidate: `markRaw()` the four internal tables (nothing renders them; the subscription
tables are only ever read by the client) and assign the non-`value` fields only when they
differ. The property objects themselves must stay reactive: the templates read
`game.properties.x.value` and depend on it. Keep the `oldProperty` copy; handlers receive it.

### B. Whether the 60 s mapper refresh is needed at all

PokeAByte pushes `MapperLoaded` when a mapper changes; the timed refresh is inherited from the
reference GameHook client. Dropping it would remove the once-a-minute full overlay re-render.
It is a behaviour change, and some lifted components cache property objects in `data()`
(gen3's `batt`), which the refresh currently *replaces* -- so those components hold stale
objects after a refresh today. Decide the refresh's fate and that bug together.

### C. gen1's `logic/Timer.ts` singleton loop never stops

`Timer._instance` is created once per app and its `updateLoop` runs every frame for the life
of the page, formatting and publishing `@timer/update` whether or not a `timer.vue` is
subscribed (the overlay unmounts on `InstanceReset`, the loop does not). Skip `update()` when
`PubSub` has no subscriber, or when the formatted centisecond string is unchanged -- the
latter also helps on 120/144 Hz displays, where a third of frames repeat the same text.
gen3/gen5's `Timer.js` has a `stop()` the component calls on unmount; gen2 and gen4's inline
loops check `_unmounted`. gen1 is the odd one out.

### D. Per-frame `MyStorage` writes in gen2

`timer_formatted_time` goes through `MyStorage` -> `StyleSettingsStore.set` ->
`isStyleSettingsKey` (a linear scan of ~70 `NON_STYLE_KEYS`) -> `setUserState` on every
frame. Cheap individually; a `Set` for `NON_STYLE_KEYS`, or a fast path for keys already known
plain, removes it. gen4 keeps `timer_formatted_time` in `data()` but does not persist it per
frame; gen3 and gen5 keep it on the `Timer` instance, not in storage.

### E. The `setImmediate` hop in gen4's `updateTime()`

gen4 wraps its `requestAnimationFrame(this.updateTime)` in `setImmediate()` (Node's, via
`nodeIntegration`). It adds a macrotask per frame for no visible reason; the legacy app did
the same, so the harness's frame-grid expectations may depend on it (see
`docs/parity-harness.md` §9, determinism). Measure before touching.

### F. The 500 ms owned-item ticks in gen3 and gen5

`_ownedItemsInterval` walks the bag every 500 ms to refresh `lastSeenOwned` timestamps.
Negligible; listed for completeness. Could become "refresh on the next `change()`" instead.

### G. CSS filters on the lifted overlays -- unverified

Each lifted stylesheet and template carries 40-56 `filter` / `drop-shadow` declarations,
including seven chained shadows on the Pokémon artwork and `blur()` keyframes. If the
per-frame timer text invalidates a layer that shares a filtered ancestor, every frame re-runs
those filters on the GPU. Only a DevTools paint-flashing / layers session can show whether
it does. If it does, `contain: paint` (or its own compositing layer) on the `.gametime`
element isolates it. This is the one item on the list that may be the largest, and the one
that cannot be confirmed from source.

### H. Every SignalR change event still allocates

`updateProperty()` builds a fourteen-field `oldProperty` literal per changed property and
`fieldsChanged.includes('value')` is a linear scan. Small; only worth it together with A.

## How to verify a change from this list

1. Capture a baseline from a `HEAD` worktree (the standing baselines are stale; see
   `ARCHITECTURE.md` §12), one harness run at a time.
2. Apply the change, run `npm run parity:run` for the affected generation(s), `npm run
   parity:diff` against the worktree capture.
3. `npm run typecheck`.

## Third pass (2026-09-25)

The first two passes worked on the timers, the mapper client, the Shuckie poll and the
persistence layer. What was left sits in the two places they did not touch: the eager
renderer bundle, and what one render of a lifted overlay costs times how often it runs.
Everything below is behaviour-identical by design, and was verified the way "How to
verify" says: a `HEAD` (`ca9df80`) tree built in the scratchpad and captured per fixture
(`tools/reports/<fixture>.perf3-head`), the working tree captured the same way
(`.perf3`), `diff.ts` between them -- see "Verification" at the end.

### 1. The entry chunk carried every generation's pokedex

`src/renderer/data/pokedex.ts` imported all ten dex tables statically, and gen1's
`logic/PokeData.ts` imported it together with the one `data/moves.js` that held gens
1-4. `main.ts` imports gen1 eagerly (it styles the pre-mapper screen), so the whole of
it was in the entry chunk Chromium parses before the box-art screen can appear --
3,561 species and 1,263 moves, where gen1's `activate()` only ever selects Yellow or
Red and Blue, and gens 2-5 carry their own tables in their own lazily loaded chunks.

Now `pokedex.ts` imports the two gen1 tables and maps the other games to `{}` (as it
already did for gen5), `data/moves.js` is split verbatim into `data/moves/gen{1,2,3,4}.js`
and `PokeData` bundles gen1's. The eight other dex files and the three other move files
stay on disk, unreferenced, for the day a generation moves onto this data layer -- the
comments in both files say to bring one back with an `import()` from `setGame`, not a
static import. The parity harness cannot see a bundle's size, so the numbers are from
the build (`out/renderer/index.html`'s script):

| | before | after |
|---|---|---|
| entry chunk | 10.5 MB | 2.7 MB |
| species entries in it | 3,561 | 384 |
| moves in it | 1,263 | 191 |

### 2. The lifted overlays re-rendered whole, every frame or every poll

Each of gens 2-5 is one component with a template over a thousand lines long. gen2 and
gen4's own timer wrote `timer_formatted_time` (a fresh array) and four more fields onto
it on every animation frame, and the template read the array directly, so the entire
render function ran at 60 Hz for the length of a run; gen3 and gen5 were spared only
because their timer is a child component. All four assign `emulatorStats` on every
10 ms Super Shuckie poll whose body changed -- with the Shuckie timer running, every
poll -- and the template read `emulatorStats?.time_current` and the two counters
directly, so up to 100 whole renders a second on top.

What one render cost was dominated by the movepool table: `getMovepool()` called
inline in `v-for` once per row group (three to nine calls per render), each resolving
the species and then every learnset entry through `dataSearch`, a case-insensitive
scan of the table's keys. Measured on the Platinum tables the component actually uses
(`pokedex_plat`, `platinum_moves`; a `tsx` micro-benchmark of the methods verbatim):
0.63-0.88 ms per `getMovepool()` and 12,000-18,000 lower-cased key comparisons, so at
three calls per render and 60 renders a second about 110-160 ms of CPU per second
went into the lookups alone; gen2's Crystal tables 0.2 ms per call. With the lookup
indexed the same call is 0.02-0.03 ms.

Three changes, the DOM untouched:

- **`core/overlay/LiveText.ts`**: a component that renders one `<div>` whose text is
  a value it `inject`s. Each overlay `provide`s the per-frame / per-poll values as
  computeds under `liveText` (`shuckie_clock`, `shuckie_frames`, and in gen2/gen4
  `timer_clock`, `timer_frames`), and where the template said
  `<div class="gametimeClock">{{timer_formatted_time[0]}}</div>` it says
  `<live-text class="gametimeClock" source="timer_clock">`. The dependency belongs to
  the child's render, so a frame re-renders that one div. The DOM is the same (the
  class falls through onto the root div, the value goes through `toDisplayString`
  exactly as an interpolation does, and the `.` before the centiseconds is part of
  the computed), and so is the per-frame mutation -- the div's text set as a whole,
  as the compiled interpolation set it. That last point was found the hard way: a
  first version rendered a bare text node into the parent's div and updated its
  `nodeValue` in place, and gen4's captures then varied between two runs of the
  *same* build by a few levels in filtered images elsewhere on the page (HEAD's did
  not), which the whole-text form does not do.
- **`shuckie_player_resets` / `shuckie_blackout_counter`** computeds return the raw
  counter values, and the template keeps its `?? 0` / `== undefined` logic on them. A
  computed that yields the same primitive as before triggers nothing (Vue 3.4+), so a
  poll that only moved the time no longer reaches the overlay's render at all.
- **`movepoolRows`** computed memoises `getMovepool()` per displayed species, and
  `dataSearch` resolves through `core/logic/caseInsensitiveLookup.ts`: the lower-cased
  keys of a table indexed once, returning the *first* matching key in key order as
  `find` did. Two tables grow after the index is built (gen4's `applySpeciesAliases()`
  mirrors alias keys from `mounted()`, gen2's backport importer adds species), so a
  miss re-checks the key count and rebuilds; a hit cannot be stale, since keys are
  only appended. gen3's `dataSearch` keeps its `move_name()` canonicalisation.

`emulatorStats` itself is still assigned per changed poll, and gen2's watcher still
persists `timer_formatted_time` per frame (D above): those are the legacy contracts.

### 3. `movepoolResize()` registered a change handler on every render

gen3, gen4 and gen5 bind `:style="movepoolResize()"` on the movepool table, and the
method computed the style and then registered a `.change()` handler on the party
slot's species that re-ran the calc into a local nothing read again. One handler per
render -- in gen4 one per frame while the movepool showed -- kept in the client's
subscription table until the mapper unloaded, and all of them firing on the next
species change. The method is the calc now; the handler had no effect to lose. The
three bodies agree, so the allowlist entry is gone.

### 4. gen1's settings saves are coalesced; the user-data write is asynchronous

`useSettingsStore` saves a store on every mutation, and a style slider or a counter
button mutates once per input event: one `JSON.stringify`, one IPC round trip and one
synchronous `writeFileSync` in the main process per pointer move. `stores/helper/
files.ts` now coalesces: the JSON is still taken at the moment of the call (the last
snapshot of a 250 ms window is what lands, the same bytes the last immediate write
would have written), every read of a file with a pending write flushes it first (so
`reloadStyle` after a slider edit reads the edit back, as before), and `beforeunload`
flushes everything alongside `flushUserState`. `src/main/ipc.ts`'s `data:write` is
`fs/promises` now, serialised per file so writes land in the order sent; the invoke
still resolves when the bytes are on disk, which is what the harness's IPC barrier
waits for. Oracle 4 compares the files at the end of a run, after a 1,200 ms settle,
so the windows are closed by then.

### 5. gen4 loaded the same trainer table twice

`platinum_trainers.js` was byte-identical to `trainers/platinum.js` apart from the
export name (known-legacy-bugs.md #15 asked for exactly this hash check before
dropping); the overlay imports the one file under both names and the copy is gone --
1.5 MB of source and one parsed table less in gen4's chunk. gen3's near-twin
(`pokedex/firered_leafgreen.js` vs `firered_leafgreen.js`) was *not* merged: the two
differ in the Nidoran key spelling (`Nidoran_F` vs `NidoranF`) and in the order of a
few evolution lists, and `dataSearch` resolves by key, so they are not the same data.

### 6. gen1's stat averages are a computed

`stats.vue` called `average_stats()` from the template in the Averages and Medians
modes, ten times per render, each filtering and sorting the whole dex. `stat_averages`
does it once per game.

### 7. The runtime template compiler is out of the bundle

`main.ts` took `createApp` from `vue/dist/vue.esm-bundler.js` because the root template
was the markup inside `#app` in `index.html`, compiled at runtime, and gen3/gen5's
`Timer.js` and gen5's `ShuckieTimer.js` were template strings. The root is a render
function now (same three nodes, same order, `ref="overlay"` kept for the control
bridge; `#app` is empty in `index.html`, which Vue cleared on mount anyway), the three
timer components are render functions, and `createApp` comes from `vue`. The entry
chunk has no `compileToFunction` in it.

### Left alone

- **Merging the three `/stats` pollers** (the 10 ms emulator poll, the 250 ms
  replay-splits poll, the bookmark module's read per marker). The replay store's
  `frame` decides which SPLIT bookmarks the panel shows; feeding it from the fast
  poll would take its sample at a different virtual instant than its own tick does,
  which can move a row at a checkpoint near a split. Four localhost GETs a second are
  not worth a timing change the harness can see.
- gen3's dex pair (5 above), and everything in "Left alone" of the second pass.

### Drift allowlist

`parity:drift --update` after the edits: `movepoolRows` added with its reason,
`dataSearch` re-pinned (gen2=gen4=gen5 | gen3, as before), `movepoolResize` dropped
because the three bodies now agree. `get_stat` was already stale at `HEAD` -- gen4 and
gen5's copies were edited after the last review (the form-support and ability commits)
-- and the check was failing on it before this pass; it is re-pinned with its reason
unchanged.

## The clock in its own process (2026-10-01)

Not a load reduction: the clock's smoothness no longer depends on the overlay's load at all. The gen2 legacy app's
"timer fix" (commit `1ab51d8`, 2026-09-30) moved its clock into an `<iframe>` served from a different address,
which Chromium runs in its own renderer process; the unified app does the same for all five generations
(`core/overlay/ClockFrame.ts`, `src/main/timer-frame-server.ts`, ARCHITECTURE.md §4). The in-page
`requestAnimationFrame` loops are unchanged and still feed the split logs and `/status`; the frame only draws.
Measured with the page's main thread blocked for 2 s: the frame's clock kept a 10-12 ms frame gap in every
generation while the page's own clock showed a 2 s gap. Item E above (gen4's `setImmediate` hop) matters less
now, since what the viewer sees is the frame.

## Fourth pass (2026-10-13)

Found by reading the source; the two items marked *measured* were measured. Verified the way "How to verify" says,
against a copy of the working tree taken just before (it held another agent's uncommitted battle-mechanics edits,
so `HEAD` was not the right baseline): gen1, gen3, gen4, gen5 smoke and the Crystal recording, all nine oracles
green, pixels exact. `typecheck` and `parity:drift` pass.

### 1. The window was throttled when covered or minimised (all generations)

`src/main/index.ts` left `backgroundThrottling` at its default. Chromium then treats a minimised window, and on
Windows a fully covered one, as hidden: `requestAnimationFrame` stops (the clocks, gen4/gen5's debounced enemy
team through the mapper client's frame loop) and timers drop to once a second (the 10 ms Super Shuckie poll). OBS
captures this window, so a covered overlay could freeze on stream. Now `backgroundThrottling: false`, as the
Cutter window already had. The harness window is never covered, so it cannot show this either way.

### 2. gen4 re-rendered itself 43 times in a row at every battle exit (*measured*)

`get_stat()`'s `stat_fix_toggle_2` countdown (known-legacy-bugs #80): every call in the Overworld wrote the
component's own data from inside its render, which queues the render again, until the counter reached 0. The
gen4 smoke fixture's two battle exits each ran 43 renders in one task; now 1 (the whole replay: 98 renders of the
overlay before, 14 after). A method the template calls must not write `data()` that the template reads
(ARCHITECTURE.md §5).

How it was counted: a scratch script calling `run()` with a `beforeReplay` hook that wraps the overlay instance's
`render` (`document.querySelector('#app')._vnode.component.refs.overlay.$` -- a production build has no
`app._instance`) and counts renders per task with a `MessageChannel` ping. The other smoke fixtures, before ->
after: gen3 25 -> 25, gen5 23 -> 21, the Crystal recording 226 -> 226.

### 3. Move lookups were linear scans, about 40 (gen3) and 150 (gen2) per render in battle (*measured*)

`gen3moves.find(x => x.Move.toLowerCase() === this.move_name(y).toLowerCase())` re-ran `move_name` (some 30
string comparisons and a regex) for every row; gen2's `find` over `gen2moves` read every row through the reactive
proxy. Both go through `core/logic/firstMatchIndex.ts` now: the first element whose key matches, indexed once per
list, rebuilt on a miss if the list grew (gen2's backport importer). Checked against `find` for 996 names
(gen2's five duplicate spellings, misspellings, a growing list): identical results. gen3's 40 lookups: 3.4 ms ->
0.03 ms in Node; gen2 measured 1.8 ms -> 0.002 ms per render by the audit.

### 4. The hidden in-page clock no longer ticks behind the clock frame (all generations)

While the out-of-process clock shows, the page's own clock is `visibility: hidden` but kept re-rendering every frame
and every Super Shuckie poll. `LiveText` takes `frozen` (gens 2-5 pass `timer_frame_live`), gen3/gen5's `Timer.js`
freezes on `hideClock`, gen1's `timer.vue` returns the text it showed when the frame came up. The text follows the
source again in the render that unhides it. `ClockFrame.post()` read the page clock's colour with
`getComputedStyle` on every post (up to 100 a second with the Shuckie timer); the colour is now read on the frame's
own ready/alive messages, once a second, so a colour change reaches the frame up to 1 s later. Neither is visible
to the harness (it runs with the frame off).

### 5. Smaller

- `average_median_stats` (gens 3-5): six calls per render in the Average and Median modes, each walking and sorting
  the whole dex. The six answers are the computed `average_median_by_stat`; the body is `average_median_stats_of`.
- gen5 `on_starter_spot`: the starter-spot test in `get_stat`, `pokemon_dynamic_ability` and `stats_header`
  read `overworld.x`/`y`, so on map 391 at level 0/5 every step re-rendered the overlay. One computed; the render
  now depends on the yes/no answer.
- gen3/gen5 `Timer.js` unsubscribed in `onUnmounted`, never called (#82).
- Two debug `console.log`s gone (#81): gen2's per-move one ran about 16 times per render.

### Left alone

- gen2 still renders in bursts of up to 8 in one task (6 bursts of 4+ in the Crystal recording), the signature
  of a template method writing its own data. Not found yet.
- gen4/gen5 still call `get_stat()` 12-20 times per render (stat cells, `speed_comparison` twice per slot). It
  writes `stat_fix_*` and `stat_fix_toggle` while rendering, so making it a computed changes when those writes
  happen; worth it only with a harness diff on a recording that leaves a battle.
- The settings `<select>`/`<li>` lists (gen2 ~250, gen3 ~400, gen4 ~500, gen5 ~650 entries) are re-diffed on every
  render. Unmeasured, est. 0.1-0.5 ms; `v-memo` or a child component would fix it.
- `src/main/ipc.ts` `splits:write`, `storage:write`, `source:write` are synchronous; gen2's style store has no
  write debounce, so a slider drag blocks main once per input event (dev builds only).
- The Super Shuckie poll does not wait for the previous fetch; a stalled emulator stacks requests. Changing it
  changes poll timing, which the harness sees.

## Start-up (measured 2026-10-29)

Built app (`out/`), launched through Playwright with no mapper and every non-file request blocked, on Windows.

- **Warm** (files in the OS cache): about 0.75 s from launch to a visible start screen. Electron itself ~100 ms,
  main process to page start ~250 ms, the page ~300 ms to DOMContentLoaded.
- **Cold** (first launch after a while): 1.8-4.4 s, almost all of it reading files from disk.
- **SignalR loads Node packages in the page.** The renderer has `nodeIntegration`, so `@microsoft/signalr`'s
  `Platform.isNode` is true and `connect()` (called from `main.ts` `created()`) `require`s `ws`, `eventsource`,
  `tough-cookie`, `fetch-cookie`, `psl` and friends: 37 files, read synchronously before the first paint, so before
  `ready-to-show`. Profiled at 240-715 ms of `readFileUtf8`; ~80 ms or less once warm. Passing `WebSocket` /
  `httpClient` options does not stop it: `HttpConnection`'s constructor requires `ws` and `eventsource` whenever
  `isNode` is true. It also means SignalR talks to PokeAByte through Node's `ws` and fetch, not Chromium's, so a
  switch to the browser ones changes CORS and cookies and needs a test against the real PokeAByte.
  **Done (2026-10-29):** the shell now connects after main reports the window shown (`window:shown`, ARCHITECTURE
  §3), so the reads land after the first paint. 8 launches each: median 753 -> 621 ms from main start to a visible
  window, slowest 1,461 -> 861 ms; fully warm launches are unchanged (~600 ms). Stopping the reads altogether
  (making SignalR take its browser path) is still open, for the reason above.
- **The entry chunk is 2.5 MB; 1.8 MB of it is gen1's trainer and dex tables, both editions.** It compiled in
  ~10-20 ms warm (V8 parses lazily), so moving it out would barely move start-up. The 5-10 MB gen2-5 chunks
  load when a game is detected, not at launch.

## Fifth pass (2026-11-02): measured on the real app

Measured on the built app outside the harness, on Windows: the clock frame on, the fixture served by the mock
PokeAByte on another port (`--tool-url=`), every other request blocked, the window visible. **The harness's own
numbers are no good for CPU/GPU**: its fake clock and CDP traffic put gen5 at ~55% of a core sitting idle, where
the real app used ~2-8%. **The window must be visible** (not covered, not minimised): Windows stops drawing a
covered window, and the GPU cost then reads as zero. Per-process CPU came from `Win32_Process` user+kernel time;
GPU work from a CDP trace (`CrGpuMain` RunTask ms/s, `Display::DrawAndSwap` on the viz thread). Process CPU
was noisy on a machine in use; the trace counts were steady.

gen5 smoke fixture, before this pass (one core = 100%):

| | total | GPU process | overlay page | clock page |
|---|---|---|---|---|
| idle, timer paused | ~2-8% | ~1-3% | ~1-5% | ~1% |
| idle, timer running | ~20-31% | ~6% | ~1-5% | **12-19%** |
| fixture playing at 1x | 67-94% | **43-55%** | 10-20% | 12-16% |

### 1. Loading a game took 2.4-2.9 s, nearly all of it waiting (gens 2-5) (*measured*)

Mapper loaded -> overlay mounted: gen4 2,851 ms, gen5 2,431 ms. Compiling and running the 5-10 MB chunk was
~70-85 ms of that (V8 `compileModule` + `evaluateModule`), so turning the data tables into `JSON.parse` strings
would have saved tens of ms and was not done. The rest was `loadGenNStyleDefaults()` awaiting its 140-390
per-species style files (`data/style/*.json`, one lazy chunk each) one after another, ~7 ms apiece. They are
requested together now (`core/persistence/styleFiles.ts`, `loadStyleFiles`), and the table is built in the same
order: gen4 470-635 ms, gen5 430-470 ms, gen3 670-815 ms.

### 2. Every clock tick recomposited the full-screen art layers (all generations) (*measured*)

The page itself hardly repaints during play; the cost is the compositor. Each clock tick (~100 a second, in the
clock frame or the in-page clock alike) makes viz draw a new frame, and the GPU process's per-frame work scales with
the number of full-screen composited layers. The layers come from the species art's and the background texture's
**flip**: `rotateY(180deg)` / `rotateX(180deg)` (`SpeciesArt.ts`, `backgroundTexture.ts`) is a 3D transform, which
gives that image its own compositing layer, and every full-screen `.colored-image` art layer painted above it then
gets one too (compositing reason `Overlap`): four 1920x1080 layers in gen5's smoke state.

Measured with the timer running, gen5 (trace, two runs each):

| variant | GPU main ms/s | viz draw ms/s |
|---|---|---|
| as is | 193-583 | 111-130 |
| flip as `scaleX(-1)` / `scaleY(-1)` | 64-77 | 30-32 |
| the same, with `--disable-lcd-text` | 40-51 | 14-17 |
| `scaleX(-1)` + `will-change: transform` (keeps the layer) | 263-582 | 125-130 |
| art layers hidden (reference) | 154-176 | 116-118 |
| `will-change: transform` on the art layers | 812 (53 fps) | 97 |
| `contain`/`isolation`/`will-change` on the clock iframe | 470-514 | 109-123 |

So the 2D flip removes ~75-90% of the GPU-side work, but it is **not pixel-identical**: the flipped image is then
rasterised with the page instead of sampled by the compositor (the species art is resampled very slightly: edge
pixels move by up to a pixel at 4x zoom), and text near it that is no longer composited gets subpixel (coloured)
antialiasing instead of greyscale. `--disable-lcd-text` (a Chromium switch, `app.commandLine.appendSwitch`) keeps
all text greyscale, which made the text look as it does today in a side-by-side crop (the art's edge pixels still
differ, and most of the screen by +-1 level). Scott approved the change (2026-11-03): the flips are now
`scaleX(-1)` / `scaleY(-1)` and `src/main/index.ts` appends `disable-lcd-text`. **Don't bring a 3D transform
(`rotateX/Y`, `translateZ`, `will-change: transform`) back onto the art or texture**: it puts the full-screen layers
back on the compositor. The switch is app-wide, so it applies to Cutter's frame server too. Harness check against
the previous build (2026-11-03, all five smoke fixtures): only pixels differ, and every transform is the same 2D
matrix. Where an art layer is flipped (gen3, gen5) it is the art's edge pixels and +-1 levels elsewhere; where none is
(gen1, gen2 and some gen4 states) the text loses its coloured subpixel fringes and is greyscale, the same at 1x.

### 3. Smaller, behaviour-identical

- **The clock frame's loop stops when nothing can change** (`src/main/timer-frame.html`): a paused local timer,
  or emulator mode (its time arrives in messages). A message restarts it. A running clock still draws every frame.
- **The mapper client's debounce loop stops when nothing is counting down** (`gameHookMapperClient.ts`), and
  `_wakeDebounceLoop()` restarts it on the *next* frame when `_handlePropertiesChanged` arms an entry, so a count
  starts on the same frame as before. `parity:debounce` passes.
- **gen3/gen5 `Timer.js` loop stops while paused**, restarted by `startTime` and `pauseUnpauseTime` (the only
  places that unpause it). gen1's `logic/Timer.ts` was left: its paused flag lives in a store loaded from disk
  after the singleton starts, so a stopped loop could miss an unpause; its loop already does no work while paused.
- **A closed Super Shuckie** (gens 2-5, Shuckie timer or counters on): the 10 ms poll logged
  `Error fetching emulator stats` on every failure, 100 a second, each one also kept by the Report log. A failed
  poll now waits 1 s before the next try and logs at most once per 5 s; polling is back to 10 ms as soon as one
  succeeds. gen5's give-up-after-ten (drift allowlist) is unchanged.

### Verification

Baseline: a copy of the working tree just before this pass (it held other sessions' uncommitted work) with these
edits reversed, run as `unified@<copy>`; the working tree as `unified`; `diff.ts` between them, every generation's
fixture (gen2: the Crystal recording). gen1, gen2, gen3: all oracles green, pixels exact. gen4 and gen5: green but
for 5 pixels (2-3 levels) at the corners of the settings panel's header boxes in one capture each. Not these edits:
the baseline re-run matched itself, and the baseline copy *with all of them applied* matched the baseline exactly,
so the 5 pixels come from running in a different folder. `typecheck`, `parity:drift`, `parity:selftest`,
`parity:debounce` pass. The clock frame (never in a harness capture) was checked in the real app, gens 3 and 5:
it ticks, holds while paused, resumes from the paused time, and survives a pause and resume within 300 ms.

### Left alone

- `JSON.parse` for the data tables: measured above, not worth it.
- Capping the clock below the display's refresh rate: it would cut the per-tick cost on 120-165 Hz monitors, but
  the centiseconds would step less smoothly there; a 60 Hz monitor (most low-end machines) already gets 60.
- Electron's spellchecker: on Windows and macOS it uses the OS's, nothing is downloaded; turning it off would only
  remove the red underlines in the settings text boxes.

## Sixth pass (2026-11-03): where the time goes now, and the overlay's timer loop

Real app, 144 Hz monitor, after the fifth pass's flip change, traced (ms of work per second, all processes, the GPU
process's vsync wait left out; method in ARCHITECTURE §12).

- **Incoming game data is cheap.** Replaying the real gen2 recording (~270 changes/s), the client's websocket handling
  and the overlay's reactions cost ~7 ms/s. Not worth optimising.
- **The clock frame is the floor while the timer runs**: ~100 ms/s in its renderer and ~60 ms/s in the GPU process,
  per 144 frames/s (it scales with the refresh rate; a 60 Hz monitor draws 60). Its text changes 100 times a second,
  so this is the price of the centiseconds.
- **The overlay page kept a frame loop it no longer needed** (*fixed, below*). gen3/gen5 `logic/Timer.js` `updateLoop` and gen2/gen4's
  `updateTime` request a frame every display refresh while the timer runs, though the clock frame shows the time and
  the in-page clock is frozen behind it. That keeps the overlay renderer drawing 144 frames/s. Stopping it (probe:
  `requestAnimationFrame` stubbed in the overlay page): gen5 216-217 -> 167-169 ms/s, gen2 200-201 -> 169-178.
  gen1's `logic/Timer.ts` loop runs for the life of the page, **paused or not**: idle 35 -> 10 ms/s without it.
  The loop's values are read elsewhere at event time (split times, the autosplitter's logs, `set_rom_starter`
  checks, gen2/gen4's saved `time_*` fields), so stopping it means those must compute the time when read.

### The timer loop stops while the clock frame shows (all generations) (*measured*)

- gen3/gen5 `logic/Timer.js`: `updateLoop` also ends while `frameLive`; the overlay's `timer_frame_live` watcher
  calls `timer.setFrameLive`, which on the frame going away publishes the time and restarts the loop.
  `formatted_time` is a getter: the last `update()`'s value as before, but worked out when read while the frame
  shows, so the split and autosplitter code reads the time at that moment.
- gen2/gen4 `updateTime`: no next frame while `timer_frame_live`, and at most one frame in flight
  (`_timerFrameQueued`; a quick pause and resume used to start a second loop). The code that reads `time_*` /
  `timer_formatted_time` at an event (gen2's battle start, both gens' split log and autosplitter, gen4's reset and
  new-game checks) first calls `updateTime()` **when the frame shows**. Without that, gen2/gen4 read "0.00" in the
  real app (checked). The watcher restarts the loop when the frame goes away.
- gen1 `logic/Timer.ts`: `updateLoop` ends while paused, while the frame shows or with no subscriber; `timer.vue`
  wakes it on mount and when `metrics.timer.paused` changes (also covers the store loading a running timer from disk),
  and calls `setFrameLive`.
- Behaviour with the frame off (the harness, or the frame never coming up) is the legacy apps': the same per-frame
  values are read. Harness, all five fixtures, against the build just before: every oracle green, pixels exact (gen5:
  1 pixel in one capture, the run-to-run noise seen before).
- Real app, every generation: no overlay frames while the timer runs with the frame showing; the frame ticks, holds
  when paused, resumes; the split code's read matches the frame's time; taking the frame away restarts the loop at
  the refresh rate and the in-page clock shows the current time; putting it back, or pausing, stops it again.
- Traced: the overlay renderer went from ~41 ms/s at 144 frames/s to ~7 ms/s and no frames (gen2, gen5). Whole-app
  totals moved with machine load between runs (the clock frame's renderer measured 98-120 ms/s), so the same-run
  stub comparison above (14-22% of all work while the timer runs) is the better figure.
- Not checked in the real app: the gen1 store loading a *running* timer from disk while the frame is down.
