/**
 * Split bookmarks: how a run's simple splits are written into its Super Shuckie replay,
 * and how they are read back out (2026-09-23).
 *
 * Every simple split the autosplitter writes to its CSV is also a bookmark in the replay
 * being recorded, typed `SPLIT` and named
 *
 * ```text
 *   SPLIT - <trainer> - HH:MM:SS               SPLIT - Brock - 00:45:12
 *   SPLIT - <trainer> (<instance>) - HH:MM:SS  SPLIT - Elite Four Will (2) - 01:20:00
 * ```
 *
 * `<trainer>` is exactly the key the overlay keeps in `current_splits` for that split
 * (gen1's "Rival3-SS Anne", gen5's normalised "Cress"), so a row read back from a replay
 * is the row the live run would have had. The time is the split's real time to the
 * second -- the CSV's `real_time_hmmss`, which is the Shuckie timer when that is on --
 * with hours always present and no centiseconds. `<instance>` is there only where a
 * generation tells repeat fights of one trainer apart: gen4's n-th Rival / Cyrus /
 * HGSS Elite Four rematch, gen5's trainer id (which its N handling keys on).
 *
 * Reading back, {@link splitsFromBookmarks} turns the SPLIT bookmarks at or before a
 * frame into `current_splits` rows: the last bookmark per trainer(+instance) wins, in
 * the order of the winning bookmarks. That is what the right panel shows for the run
 * being played back (scrubbing anywhere shows the splits reached so far, without playing
 * the replay through) and what a replay opened as the comparison provides in place of
 * a CSV.
 *
 * Shared by the renderer (writing, the playback panel) and the main process (reading a
 * `.replay` chosen as the comparison), so this file has no imports.
 */

export const SPLIT_BOOKMARK_TYPE = "SPLIT";
const PREFIX = "SPLIT - ";

/** One `current_splits` / `previous_splits` row, as every generation's panel reads them. */
export interface SplitRow {
	trainer: string;
	/** `[h:]m:ss`, the form the CSV's `real_time_hmmss` column and the panels use. */
	time: string;
	/** The instance marker, where the generation records one (gen5's trainer id, gen4's n-th fight). */
	id?: number;
}

export interface SplitBookmarkFields {
	trainer: string;
	/** `HH:MM:SS`. */
	hms: string;
	instance?: number;
}

/** What {@link splitsFromBookmarks} needs of a bookmark: the REST API's and the file's shape both fit. */
export interface FrameStampedBookmark {
	name: string;
	in_frame: number;
	id?: number;
	type?: { name: string } | string | null;
}

// ------------------------------------------------------------------------- time

/**
 * A split time to seconds: "45", "5:12", "1:05:12", any of them with a trailing ".cs".
 * Null for anything else (the "-" placeholder, an empty cell).
 */
export function splitTimeToSeconds(time: string | null | undefined): number | null {
	if (typeof time !== "string") return null;
	const match = /^\s*(\d+)(?::(\d{1,2}))?(?::(\d{1,2}))?(?:\.\d+)?\s*$/.exec(time);
	if (!match) return null;
	const parts = [match[1], match[2], match[3]].filter((p) => p !== undefined).map(Number);
	let seconds = 0;
	for (const part of parts) seconds = seconds * 60 + part;
	return seconds;
}

/** Whole seconds as `HH:MM:SS` (hours grow past two digits rather than wrap). */
export function secondsToHms(seconds: number): string {
	const s = Math.max(0, Math.floor(seconds));
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/**
 * Whole seconds as the panels' `[h:]m:ss`: the same spelling as `convertSecondsToDuration`
 * in `utils/timehelpers.js` and its copies in gens 2-5 ("1:05:12", "5:12", "0:05").
 */
export function secondsToSplitTime(seconds: number): string {
	const s = Math.max(0, Math.floor(seconds));
	const hours = Math.floor(s / 3600);
	const minutes = Math.floor((s % 3600) / 60);
	const rest = s % 60;
	const pad = (n: number) => String(n).padStart(2, "0");
	if (hours > 0) return `${hours}:${pad(minutes)}:${pad(rest)}`;
	if (minutes > 0) return `${minutes}:${pad(rest)}`;
	return `0:${pad(rest)}`;
}

/** A split time in any of the panels' spellings to `HH:MM:SS`; null when it is not a time. */
export function splitTimeToHms(time: string | null | undefined): string | null {
	const seconds = splitTimeToSeconds(time);
	return seconds === null ? null : secondsToHms(seconds);
}

// ------------------------------------------------------------------------- name

/** The bookmark name for a split (see the module comment). */
export function splitBookmarkName(trainer: string, hms: string, instance?: number | null): string {
	const marker = instance === undefined || instance === null ? "" : ` (${instance})`;
	return `${PREFIX}${trainer}${marker} - ${hms}`;
}

/**
 * The fields of a split bookmark's name, or null for any other bookmark. The time is
 * matched at the end and the instance just before it, so a trainer key that itself
 * contains " - " or ends in a number parses the same as any other.
 */
export function parseSplitBookmarkName(name: string): SplitBookmarkFields | null {
	if (typeof name !== "string" || !name.startsWith(PREFIX)) return null;
	const match = /^(.+?)(?: \((\d+)\))? - (\d{2,}:\d{2}:\d{2})$/.exec(name.slice(PREFIX.length));
	if (!match) return null;
	const fields: SplitBookmarkFields = { trainer: match[1], hms: match[3] };
	if (match[2] !== undefined) fields.instance = Number(match[2]);
	return fields;
}

/**
 * What makes two split bookmarks the same split: the name without its time. Used to
 * dedupe on playback (a replay played back with the local timer would stamp a slightly
 * different time on the same split) and to pick the last bookmark per split.
 */
export function splitBookmarkKey(name: string): string | null {
	const fields = parseSplitBookmarkName(name);
	if (!fields) return null;
	return `${PREFIX}${fields.trainer}${fields.instance === undefined ? "" : ` (${fields.instance})`}`;
}

/** Whether a bookmark is a split: named like one, and typed SPLIT when it is typed at all. */
export function isSplitBookmark(bookmark: FrameStampedBookmark): boolean {
	if (!parseSplitBookmarkName(bookmark.name)) return false;
	const type = bookmark.type;
	const typeName = typeof type === "string" ? type : type?.name;
	return typeName === undefined || typeName === null || typeName === "" || typeName.toUpperCase() === SPLIT_BOOKMARK_TYPE;
}

// ------------------------------------------------------------------------- rows

/**
 * The `current_splits` rows a set of bookmarks describes at `upToFrame` (every bookmark
 * when it is omitted): the last split bookmark per trainer(+instance), each in the
 * position of that last bookmark. Bookmarks are taken in `(in_frame, id)` order, so the
 * input may be unsorted.
 */
export function splitsFromBookmarks(bookmarks: readonly FrameStampedBookmark[], upToFrame?: number): SplitRow[] {
	const sorted = bookmarks
		.filter((b) => isSplitBookmark(b) && (upToFrame === undefined || b.in_frame <= upToFrame))
		.slice()
		.sort((a, b) => a.in_frame - b.in_frame || (a.id ?? 0) - (b.id ?? 0));
	const latest = new Map<string, SplitRow>();
	for (const bookmark of sorted) {
		const fields = parseSplitBookmarkName(bookmark.name)!;
		const key = splitBookmarkKey(bookmark.name)!;
		const row: SplitRow = { trainer: fields.trainer, time: secondsToSplitTime(splitTimeToSeconds(fields.hms)!) };
		if (fields.instance !== undefined) row.id = fields.instance;
		// Re-inserting moves the key to the end: the row sits where its last bookmark is.
		latest.delete(key);
		latest.set(key, row);
	}
	return [...latest.values()];
}
