/**
 * The small, global pieces of user state that gen1 kept in `localStorage`, moved to a
 * file (decision 10, plan 1.10).
 *
 * `localStorage` cannot hold anything for this app. The queuer launches it with
 * `npm run dev`, so the renderer's origin is `http://localhost:5173`, while a packaged
 * build runs on `file://` -- Chromium scopes `localStorage` per origin, so the two
 * builds never see each other's data and a port change silently empties it.
 *
 * Everything lives in one file, `%APPDATA%/stp-overlay/data/user_state.json`, under the
 * *same key names* the legacy `localStorage` used. That is deliberate: the Phase 2.6
 * importer, which decodes each legacy app's Chromium LevelDB, can then copy records
 * across without a translation table, and the file reads as "what localStorage held".
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
 * 250 ms debounce is the interval the rest of gen1's saves already use. {@link flushUserState}
 * forces the pending write out; the parity harness collects userData after the run, and
 * the runner's IPC barrier waits for the write to land before it reads the tree.
 */

/** Read once by {@link loadUserState}; every synchronous getter is served from here. */
let cache: Record<string, unknown> = {};
let loaded: Promise<void> | null = null;

const FILE = "user_state.json";
const DEBOUNCE_MS = 250;

let pending: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<unknown> = Promise.resolve();

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
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object") cache = parsed as Record<string, unknown>;
        } catch (err) {
            // A corrupt file must not stop the overlay from starting; the next write
            // replaces it, exactly as a corrupt localStorage value used to be overwritten.
            console.warn(`[user-state] could not read data/${FILE}:`, err);
        }
    })();
    return loaded;
}

/** The value for `key`, or `fallback` when nothing has been saved. */
export function getUserState<T>(key: string, fallback: T): T {
    const value = cache[key];
    return value === undefined || value === null ? fallback : (value as T);
}

/**
 * Stores `value` under `key` and schedules the file write.
 *
 * `null` and `undefined` delete the key, which is what assigning them to
 * `LocalStorageProxy` did.
 */
export function setUserState(key: string, value: unknown): void {
    if (value === undefined || value === null) delete cache[key];
    else cache[key] = value;
    schedule();
}

function schedule(): void {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
        pending = null;
        write();
    }, DEBOUNCE_MS);
}

function write(): Promise<unknown> {
    const snapshot = JSON.stringify(cache, null, 4);
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
