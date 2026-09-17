/**
 * The small, global pieces of user state that gen1 kept in `localStorage`, moved to a
 * file (decision 10, plan 1.10) -- and, since Phase 2, everything gen2-5's `MyStorage`
 * keeps as well.
 *
 * `localStorage` cannot hold anything for this app. The queuer launches it with
 * `npm run dev`, so the renderer's origin is `http://localhost:5173`, while a packaged
 * build runs on `file://` -- Chromium scopes `localStorage` per origin, so the two
 * builds never see each other's data and a port change silently empties it.
 *
 * Everything lives in one file, `%APPDATA%/stp-overlay/data/user_state.json`, under the
 * *same key names* the legacy `localStorage` used. That is deliberate: the Phase 2.6
 * importer decodes each legacy app's Chromium LevelDB and copies records across without
 * a translation table, and the file reads as "what localStorage held".
 *
 * ## Namespaces (plan 2.6)
 *
 * Each legacy app had its own `localStorage`, and the lifted components read their keys
 * verbatim -- gen4 and gen5 both keep `starter` and `selected_game`, in different
 * vocabularies. So the file is one section per generation, and a read or write goes to
 * the *active* generation's section (main.ts sets it when a module activates) unless
 * the caller names one (the box-art grid writes each generation's edition before any
 * is active). Two things are global, as they should be shared: the OBS url and
 * password, and the `enemyScale_<Species>` overrides (a species is the same species
 * across games). A file from before the namespaces -- one flat object -- is read as
 * gen1's section plus the globals, which is what it was.
 *
 * ## Why there is a cache
 *
 * Reading a file is asynchronous; the call sites are not. `enemySpriteScaleManager`
 * looks an override up inside a render path, and `sendObsChapterMarker` reads the OBS
 * url on the way to opening a socket. So the file is read once, before the overlay
 * mounts (`main.ts` awaits {@link loadUserState} at the head of its settings chain, and
 * `ready` only becomes true after that resolves), and every later read is served from
 * memory.
 *
 * ## Why writes are debounced
 *
 * `current_splits` is written from a deep watcher on every split row, which under
 * `localStorage` was a synchronous string assignment and is now an IPC round trip. The
 * 250 ms window is the interval the rest of gen1's saves already use; it is a leading-
 * edge window (one timer per burst, see `schedule`). {@link flushUserState} forces the
 * pending write out; the parity harness collects userData after the run, and the
 * runner's IPC barrier waits for the write to land before it reads the tree.
 */

import { GLOBAL_NAMESPACE, isGlobalKey, parseUserStateFile, serializeUserState } from "../../../shared/userStateFormat";

export { isGlobalKey, parseUserStateFile } from "../../../shared/userStateFormat";

/** Read once by {@link loadUserState}; every synchronous getter is served from here. */
let cache: Record<string, Record<string, unknown>> = {};
let active = "gen1";

/**
 * The generation whose section reads and writes go to. gen1 before a mapper is
 * detected: the pre-mapper screen is gen1's, as it always was.
 */
export function setActiveNamespace(id: string | null): void {
    active = id ?? "gen1";
}

function section(namespace: string): Record<string, unknown> {
    return (cache[namespace] ??= {});
}

function namespaceFor(key: string, explicit?: string): string {
    return isGlobalKey(key) ? GLOBAL_NAMESPACE : (explicit ?? active);
}

/** The active generation's view, flat, globals included: what its legacy `localStorage` held. */
export function activeUserState(): Record<string, unknown> {
    return { ...section(GLOBAL_NAMESPACE), ...section(active) };
}

// A read-only window into the cache for the parity harness (oracle 4 compares what
// the app has persisted at each checkpoint; the legacy apps expose the same thing as
// `localStorage`). Nothing in the app reads it.
if (typeof window !== "undefined") {
    (window as any).__stpUserState = () => JSON.parse(JSON.stringify(activeUserState()));
}
let loaded: Promise<void> | null = null;

const FILE = "user_state.json";
const DEBOUNCE_MS = 250;
/** While changes keep coming, the file is rewritten no more often than this. */
const BURST_INTERVAL_MS = 1000;

let pending: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<unknown> = Promise.resolve();
let lastWriteAt = 0;

/**
 * Reads the file into the cache. Safe to call repeatedly; only the first call reads.
 *
 * A missing file means "nothing saved yet", which is also what a fresh profile looked
 * like under `localStorage`, so it is not an error.
 */
export function loadUserState(): Promise<void> {
    if (loaded) return loaded;
    loaded = (async () => {
        try {
            const raw = await window.api.data.read(FILE);
            if (!raw) return;
            cache = parseUserStateFile(JSON.parse(raw));
        } catch (err) {
            // A corrupt file must not stop the overlay from starting; the next write
            // replaces it, exactly as a corrupt localStorage value used to be overwritten.
            console.warn(`[user-state] could not read data/${FILE}:`, err);
        }
    })();
    return loaded;
}

/** The value for `key`, or `fallback` when nothing has been saved. */
export function getUserState<T>(key: string, fallback: T, namespace?: string): T {
    const value = section(namespaceFor(key, namespace))[key];
    return value === undefined || value === null ? fallback : (value as T);
}

/**
 * Every saved key of the active generation (or the named one), in insertion order --
 * `localStorage.key(i)` for the managers that sweep the store (gen3's
 * `resetAllToDefaults`/`exportCurrentAsDefaults`).
 */
export function userStateKeys(namespace?: string): string[] {
    return Object.keys(section(namespace ?? active));
}

/**
 * Stores `value` under `key` and schedules the file write.
 *
 * `null` and `undefined` delete the key, which is what assigning them to
 * `LocalStorageProxy` did.
 */
export function setUserState(key: string, value: unknown, namespace?: string): void {
    const target = section(namespaceFor(key, namespace));
    if (value === undefined || value === null) delete target[key];
    else target[key] = value;
    schedule();
}

function schedule(): void {
    // One timer per window, not one per write: `current_splits` and the gen2 timer
    // text are written on every animation frame, and a trailing-edge debounce would
    // create and cancel a timer 60 times a second. The write lands 250 ms after the
    // first change of a burst instead of the last, which no reader can tell apart.
    //
    // A burst that never ends -- gen2's timer text changes every frame for the whole
    // run -- used to rewrite the file four times a second. Once a write has landed,
    // the next one waits out BURST_INTERVAL_MS from it instead. Every in-app read is
    // served from the cache, so nothing in the app can tell; a normal quit or reload
    // flushes (`beforeunload`), so the file is complete at every exit. Only a hard
    // crash sees the difference: up to a second of the last edits instead of 250 ms.
    if (pending) return;
    const sinceLastWrite = Date.now() - lastWriteAt;
    const delay = Math.max(DEBOUNCE_MS, BURST_INTERVAL_MS - sinceLastWrite);
    pending = setTimeout(() => {
        pending = null;
        write();
    }, delay);
}

function write(): Promise<unknown> {
    lastWriteAt = Date.now();
    const snapshot = serializeUserState(cache);
    inFlight = inFlight
        .then(() => window.api.data.write(FILE, snapshot))
        .catch((err) => console.error(`[user-state] could not write data/${FILE}:`, err));
    return inFlight;
}

/** Writes any pending change out and resolves once it has landed. */
export function flushUserState(): Promise<unknown> {
    if (pending) {
        clearTimeout(pending);
        pending = null;
        return write();
    }
    return inFlight;
}
