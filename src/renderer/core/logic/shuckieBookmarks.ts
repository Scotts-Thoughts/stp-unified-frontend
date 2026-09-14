import { getUserState, setUserState } from "~/core/persistence/userState";
import { EMULATOR_BASE_URL } from "~/core/stores/useEmulatorStatsStore";
import { sendObsChapterMarker } from "~/core/logic/obs";

/**
 * Super Shuckie replay bookmarks at every chapter marker.
 *
 * Each OBS chapter marker is also added as a bookmark to the replay Super Shuckie is
 * recording or playing back (`/add-bookmark`, supershuckie `docs/external_commands.md`),
 * named exactly like the chapter and typed by the kind of marker ({@link bookmarkTypeFor}).
 * Super Shuckie creates a type, with a colour of its own, the first time it sees its name.
 *
 * While recording, every marker is added. While playing back the same markers fire again,
 * so a marker is added only if the replay does not have it yet: a bookmark with the same
 * name within {@link DUPLICATE_WINDOW_FRAMES}. Each existing bookmark answers for one marker
 * per pass through the replay, so markers that really do repeat close together (Text Box,
 * Turn) are all added by the first playback of a replay recorded without bookmarks and none
 * are doubled by the next one; seeking backwards starts a new pass. A playback write goes
 * into the replay file, and the first one upgrades a replay older than format v5 in place.
 *
 * The `shuckie_bookmarks` switch (global user state, on by default) turns all of it off.
 * Failures are swallowed like the other Shuckie calls: the overlay runs without Super Shuckie.
 */

const ENABLED_KEY = "shuckie_bookmarks";
/** ~5 s: how far apart the same marker may fire on playback and still be the recorded one. */
const DUPLICATE_WINDOW_FRAMES = 300;
/** A frame this far behind the last one is a seek backwards, not requests landing out of order. */
const REWIND_TOLERANCE_FRAMES = 60;

/** Types of the markers with fixed names; checked before {@link TYPE_BY_KIND}. */
const TYPE_BY_NAME = new Map<string, string>([
	["RESET", "RESET"],
	["BLACKOUT", "BLACKOUT"],
	["Turn", "TURN"],
	["Next Pokemon", "NEXT POKEMON"],
	["Enemy Fainted", "ENEMY FAINTED"],
	["Battle Level Up", "LEVEL UP"],
	["Rare Candy Used", "RARE CANDY"],
	["Move Change", "MOVE CHANGE"],
	// gen3: CB2_UseTMHMAfterForgettingMove, and a won autosplitter battle.
	["LABEL - MOVE", "TM MOVE"],
	["LABEL - VICTORY", "VICTORY"],
]);

/** Types of the `<kind> - <detail>` markers, by kind. */
const TYPE_BY_KIND = new Map<string, string>([
	["IN", "BATTLE"],
	["OUT", "BATTLE"],
	["Map Change", "MAP CHANGE"],
	["Text Box", "TEXT BOX"],
	["MENU", "MENU"],
	["Item", "ITEM"],
	["Held Item", "HELD ITEM"],
	["New Move", "NEW MOVE"],
	["Level Up", "LEVEL UP"],
	["Special", "SPECIAL"],
]);

interface ShuckieStats {
	total_elapsed_frames: number;
	is_recording?: boolean;
	is_playing_back?: boolean;
	bookmark_generation?: number;
}

interface ShuckieBookmark {
	id: number;
	name: string;
	in_frame: number;
}

interface ShuckieBookmarks {
	replay: string | null;
	state: "none" | "recording" | "playback";
	generation: number;
	editable: boolean;
	bookmarks: ShuckieBookmark[];
	/** `saved: false` is a type only the replay knows; using it adopts it into the user's types. */
	types: { name: string; saved: boolean }[];
}

/** Keeps markers in the order they fired, so each is checked against the ones before it. */
let queue: Promise<void> = Promise.resolve();
/** The last `/bookmarks`, with this module's adds since then applied to it. */
let known: ShuckieBookmarks | null = null;
/** The generation `known` was fetched at and each one this module's adds have moved it to since. */
const knownGenerations = new Set<number>();
/** The playback pass: which replay, the furthest frame seen, and the bookmarks already matched. */
const pass = { replay: null as string | null, frame: 0, matched: new Set<number>() };

export function shuckieBookmarksEnabled(): boolean {
	return getUserState<boolean>(ENABLED_KEY, true);
}

export function setShuckieBookmarksEnabled(enabled: boolean): void {
	setUserState(ENABLED_KEY, enabled);
}

/**
 * A chapter marker: the OBS chapter and the Super Shuckie bookmark, at the same moment and
 * with the same name. `probeStatus` is gen3's OBS exchange (see `sendObsChapterMarker`).
 */
export function sendChapterMarker(chapterName: string, options: { probeStatus?: boolean } = {}): void {
	sendObsChapterMarker(chapterName, options);
	addShuckieBookmark(chapterName);
}

/** The bookmark type for a chapter marker: its fixed name's, its kind's, or the kind itself in capitals. */
export function bookmarkTypeFor(chapterName: string): string {
	const fixed = TYPE_BY_NAME.get(chapterName);
	if (fixed) return fixed;
	const dash = chapterName.indexOf(" - ");
	const kind = dash < 0 ? chapterName : chapterName.slice(0, dash);
	return TYPE_BY_KIND.get(kind) ?? kind.toUpperCase();
}

export function addShuckieBookmark(chapterName: string): void {
	if (!shuckieBookmarksEnabled()) return;
	// The frame is read now rather than in the queue, so the bookmark lands where the marker
	// fired and not where the previous marker's requests happened to finish.
	const stats = getJson<ShuckieStats>("/stats");
	queue = queue
		.then(() => stats)
		.then((s) => (s ? place(chapterName, s) : undefined))
		.catch(() => { /* ignore */ });
}

async function place(name: string, stats: ShuckieStats): Promise<void> {
	const frame = stats.total_elapsed_frames;
	if (stats.is_recording) {
		await add(name, frame);
		return;
	}
	if (!stats.is_playing_back) return;

	// Every add changes the generation, and fetching the whole list again after each one would
	// download it once per marker while an old replay is filled in. So `known` follows this
	// module's adds itself, and is fetched again only at a generation they do not explain: another
	// replay, the user's own edits, a failed save.
	if (!known || stats.bookmark_generation === undefined || !knownGenerations.has(stats.bookmark_generation)) {
		known = await getJson<ShuckieBookmarks>("/bookmarks");
		knownGenerations.clear();
		if (known) knownGenerations.add(known.generation);
	}
	const list = known;
	if (!list || list.state !== "playback" || !list.editable) return;

	const rewound = frame + REWIND_TOLERANCE_FRAMES < pass.frame;
	if (list.replay !== pass.replay || rewound) {
		pass.replay = list.replay;
		pass.matched.clear();
		pass.frame = frame;
	} else {
		pass.frame = Math.max(pass.frame, frame);
	}

	let nearest: ShuckieBookmark | null = null;
	for (const bookmark of list.bookmarks) {
		if (bookmark.name !== name || pass.matched.has(bookmark.id)) continue;
		const distance = Math.abs(bookmark.in_frame - frame);
		if (distance <= DUPLICATE_WINDOW_FRAMES && (!nearest || distance < Math.abs(nearest.in_frame - frame))) nearest = bookmark;
	}
	if (nearest) {
		pass.matched.add(nearest.id);
		return;
	}

	const type = bookmarkTypeFor(name);
	const added = await add(name, frame);
	if (!added) return;
	pass.matched.add(added.id);
	list.bookmarks.push(added);
	// Super Shuckie bumps the generation once for the bookmark, and once more when the type
	// has to be created (or adopted from the replay) in the user's types first.
	const savedType = list.types.find((t) => t.saved && t.name.toLowerCase() === type.toLowerCase());
	list.generation += savedType ? 1 : 2;
	if (!savedType) list.types.push({ name: type, saved: true });
	knownGenerations.add(list.generation);
}

async function add(name: string, frame: number): Promise<ShuckieBookmark | null> {
	const query = new URLSearchParams({ name, type: bookmarkTypeFor(name), frame: String(frame) });
	const response = await fetch(`${EMULATOR_BASE_URL}/add-bookmark?${query}`, { method: "POST" });
	return response.ok ? response.json() : null;
}

async function getJson<T>(path: string): Promise<T | null> {
	try {
		const response = await fetch(EMULATOR_BASE_URL + path);
		return response.ok ? await response.json() : null;
	} catch (_) {
		return null;
	}
}
