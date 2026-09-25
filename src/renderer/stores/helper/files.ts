/**
 * Reads and writes the user-state JSON under `%APPDATA%/<app>/data/**`.
 *
 * Same directory, same file names and the same 4-space JSON as gen1 wrote with
 * `require("fs")` in the renderer; only the call goes over IPC now (plan 1.6), which is
 * what lets the main process resolve and confine the path (`src/main/ipc.ts`).
 *
 * Both functions swallow failures and return `null`, exactly as before: a missing or
 * corrupt settings file has always meant "use the defaults", never "crash the overlay".
 *
 * ## Why writes are coalesced (2026-09-25, docs/performance-followups.md, third pass)
 *
 * `useSettingsStore` saves a store on every mutation, and a style slider or a counter
 * button mutates once per input event, so a drag was one IPC round trip and one file
 * write per pointer move. The JSON is still taken at the moment of the call -- the
 * snapshot semantics are unchanged, and a write that follows for the same file within
 * the window replaces the pending text, so what lands is the latest state as of the
 * last call -- but the write itself goes out once per file per {@link DEBOUNCE_MS}
 * window. Every read of a file with a pending write flushes it first, so a reader
 * never sees the file older than the last save (`reloadStyle` after a slider edit
 * reads back the edit, as it did). `beforeunload` flushes everything (main.ts), the
 * same trade `core/persistence/userState.ts` makes.
 */

const DEBOUNCE_MS = 250;

interface PendingWrite {
	json: string;
	timer: ReturnType<typeof setTimeout>;
	/** Resolves once the write that carries this window's text has landed. */
	landed: Promise<void>;
	resolve: () => void;
}

/** One pending write per file: the latest JSON of the window and the timer that sends it. */
const pending = new Map<string, PendingWrite>();
/** The write in flight per file, so a read (or the next write) waits for it in order. */
const inFlight = new Map<string, Promise<unknown>>();

/** Joins the folder and file into the "/" form the data IPC expects. */
export function dataPath(folder: string, file: string): string {
	return [folder, file]
		.map((segment) => String(segment ?? "").replace(/^[\\/]+|[\\/]+$/g, ""))
		.filter((segment) => segment !== "" && segment !== ".")
		.join("/");
}

function send(path: string, entry: PendingWrite): void {
	pending.delete(path);
	const previous = inFlight.get(path) ?? Promise.resolve();
	const write = previous
		.catch(() => undefined)
		.then(() => window.api.data.write(path, entry.json))
		.then(() => undefined, (err) => { console.error(`[settings] could not write data/${path}:`, err); })
		.finally(() => {
			if (inFlight.get(path) === write) inFlight.delete(path);
			entry.resolve();
		});
	inFlight.set(path, write);
}

/** Sends the pending write for `path` now, if there is one, and resolves once nothing for `path` is in flight. */
function flushPath(path: string): Promise<unknown> {
	const entry = pending.get(path);
	if (entry) {
		clearTimeout(entry.timer);
		send(path, entry);
	}
	return inFlight.get(path) ?? Promise.resolve();
}

/** Saves `data` as 4-space JSON; resolves once the (coalesced) write has landed. */
export function saveAppSettings<T>(folder: string, file: string, data: T): Promise<void> {
	const path = dataPath(folder, file);
	const json = JSON.stringify(data, null, 4);
	const entry = pending.get(path);
	if (entry) {
		entry.json = json;
		return entry.landed;
	}
	let resolve!: () => void;
	const landed = new Promise<void>((r) => { resolve = r; });
	const next: PendingWrite = {
		json,
		landed,
		resolve,
		timer: setTimeout(() => send(path, next), DEBOUNCE_MS),
	};
	pending.set(path, next);
	return landed;
}

export async function loadAppSettings<T>(folder: string, file: string): Promise<T | null> {
	try {
		const path = dataPath(folder, file);
		await flushPath(path);
		const data = await window.api.data.read(path);
		if (data === null) {
			return null;
		}
		return JSON.parse(data) as T;
	} catch (ex) {
		return null;
	}
}

/** Writes every pending save out and resolves once all of them have landed. */
export function flushAppSettings(): Promise<unknown> {
	const paths = [...new Set([...pending.keys(), ...inFlight.keys()])];
	return Promise.all(paths.map((path) => flushPath(path)));
}
