/**
 * Reads and writes the user-state JSON under `%APPDATA%/<app>/data/**`.
 *
 * Same directory, same file names and the same 4-space JSON as gen1 wrote with
 * `require("fs")` in the renderer; only the call goes over IPC now (plan 1.6), which is
 * what lets the main process resolve and confine the path (`src/main/ipc.ts`).
 *
 * Both functions swallow failures and return `null`, exactly as before: a missing or
 * corrupt settings file has always meant "use the defaults", never "crash the overlay".
 */

/** Joins the folder and file into the "/" form the data IPC expects. */
export function dataPath(folder: string, file: string): string {
	return [folder, file]
		.map((segment) => String(segment ?? "").replace(/^[\\/]+|[\\/]+$/g, ""))
		.filter((segment) => segment !== "" && segment !== ".")
		.join("/");
}

export async function saveAppSettings<T>(folder: string, file: string, data: T) {
	const json = JSON.stringify(data, null, 4);
	await window.api.data.write(dataPath(folder, file), json);
}

export async function loadAppSettings<T>(folder: string, file: string): Promise<T | null> {
	try {
		const data = await window.api.data.read(dataPath(folder, file));
		if (data === null) {
			return null;
		}
		return JSON.parse(data) as T;
	} catch (ex) {
		return null;
	}
}
