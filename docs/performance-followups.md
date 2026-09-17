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

## Left for a second pass

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
`stp-overlay-harness-determinism` in memory). Measure before touching.

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
   `stp-overlay-verification-workflow` in memory), one harness run at a time.
2. Apply the change, run `npm run parity:run` for the affected generation(s), `npm run
   parity:diff` against the worktree capture.
3. `npm run typecheck`.
