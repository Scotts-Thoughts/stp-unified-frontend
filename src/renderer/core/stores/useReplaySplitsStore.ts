import { defineStore } from "pinia";
import { EMULATOR_BASE_URL } from "./useEmulatorStatsStore";
import { shuckieBookmarksEnabled } from "~/core/logic/shuckieBookmarks";
import { isSplitBookmark, splitsFromBookmarks, type FrameStampedBookmark, type SplitRow } from "../../../shared/splitBookmarks";

/**
 * The current run's splits while Super Shuckie is playing a replay back (2026-09-23).
 *
 * A replay carries its run's simple splits as `SPLIT` bookmarks
 * (`src/shared/splitBookmarks.ts`, written by `core/logic/shuckieBookmarks.ts`). During
 * playback the right panel's "current" column is read from those rather than from the
 * autosplitter's `current_splits`: the bookmarks at or before the playback frame are the
 * splits reached so far, in order, whether the replay was played from the start or
 * scrubbed to that point. The autosplitter keeps running (its CSVs and `current_splits`
 * are unchanged), it just does not drive the panel while a replay is loaded.
 *
 * The store polls `/stats` on its own, four times a second: gen1's 10 ms poll only runs
 * with the Shuckie timer or counters on, and gens 2-5 poll inside their overlays under the
 * same gate, while this needs `total_elapsed_frames`, `is_playing_back` and
 * `bookmark_generation` whenever a replay is loaded. `/bookmarks` is fetched only when
 * the generation moves (every add, edit or replay switch bumps it). With the Shuckie
 * Bookmarks switch off nothing is polled and the panel is the autosplitter's. A dead
 * Super Shuckie is retried every five seconds, silently.
 *
 * `is_playing_back` is true for the whole time a replay is loaded, including the stopped
 * state in which the game runs live from the replay's point (`is_playback_stopped`);
 * splits the player earns live from there are pushed by the autosplitter as always and
 * shown once the replay is unloaded.
 *
 * **The Cutter editor's rows (2026-11-17).** The editor's stand-in for Super Shuckie
 * (air_cutter `extensions/stp-overlay/lib/chain.js`) adds `splits` to its `/bookmarks`
 * reply: the rows of the splits CSV the user chose for the recording, in the CSV's order,
 * each with the frame it shows from, worked out from the recording (`lib/splits.js` there).
 * With them, the current column is exactly those rows up to the frame: no deduplication,
 * no reordering, so a trainer fought four times is four rows, as in the CSV. The store
 * then also asks four times as often, so a row lands within a few frames of its win.
 */

const POLL_INTERVAL_MS = 250;
/** With the editor's rows: its stand-in is local and cheap, and an export is paced to the wall clock. */
const ROWS_POLL_INTERVAL_MS = 50;
const RETRY_AFTER_FAILURE_MS = 5000;

interface StatsSample {
	total_elapsed_frames?: number;
	is_playing_back?: boolean;
	bookmark_generation?: number;
}

/** One of the editor's rows: a `current_splits` row and the frame it shows from (null: never). */
export interface FramedSplitRow extends SplitRow {
	frame: number | null;
}

interface BookmarksReply {
	replay: string | null;
	state: "none" | "recording" | "playback";
	generation: number;
	bookmarks: FrameStampedBookmark[];
	/** The Cutter editor's stand-in only. */
	splits?: FramedSplitRow[];
}

/** The editor's rows reached at `frame`, in their order, without the frame. */
export function rowsUpTo(rows: readonly FramedSplitRow[], frame: number): SplitRow[] {
	const out: SplitRow[] = [];
	for (const { frame: from, ...row } of rows) {
		if (from !== null && from !== undefined && from <= frame) out.push(row);
	}
	return out;
}

export const useReplaySplitsStore = defineStore("replay_splits", {
	state: () => ({
		/** A replay is loaded for playback: the panel reads {@link currentSplits}. */
		playingBack: false as boolean,
		/** The playback frame from the last `/stats`. */
		frame: 0 as number,
		/** The replay's name from `/bookmarks`, for the settings panel. */
		replay: null as string | null,
		/** The generation the split bookmarks below were fetched at. */
		generation: null as number | null,
		/** The replay's SPLIT bookmarks (only those), every frame. */
		bookmarks: [] as FrameStampedBookmark[],
		/** The editor's rows, when its stand-in sent them: shown in place of the bookmarks. */
		rows: null as FramedSplitRow[] | null,
		_intervalMs: POLL_INTERVAL_MS as number,
		_interval: null as ReturnType<typeof setInterval> | null,
		_nextAttemptAt: 0 as number,
		_fetching: false as boolean,
	}),
	getters: {
		/** `current_splits` rows for the frame being shown: the last split per trainer at or before it. */
		currentSplits(state): SplitRow[] {
			if (!state.playingBack) return [];
			if (state.rows) return rowsUpTo(state.rows, state.frame);
			return splitsFromBookmarks(state.bookmarks, state.frame);
		},
	},
	actions: {
		startPolling(): void {
			if (this._interval != null) return;
			this._interval = setInterval(() => void this.tick(), this._intervalMs);
		},
		/** Poll every `ms` from now on. */
		setPollInterval(ms: number): void {
			if (ms === this._intervalMs) return;
			this._intervalMs = ms;
			if (this._interval == null) return;
			clearInterval(this._interval);
			this._interval = setInterval(() => void this.tick(), ms);
		},
		stopPolling(): void {
			if (this._interval != null) clearInterval(this._interval);
			this._interval = null;
			this._intervalMs = POLL_INTERVAL_MS;
			this.clear();
		},
		clear(): void {
			this.playingBack = false;
			this.replay = null;
			this.generation = null;
			this.bookmarks = [];
			this.rows = null;
		},
		async tick(): Promise<void> {
			if (!shuckieBookmarksEnabled()) {
				if (this.playingBack) this.clear();
				return;
			}
			if (Date.now() < this._nextAttemptAt) return;
			let stats: StatsSample;
			try {
				const response = await fetch(`${EMULATOR_BASE_URL}/stats`);
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				stats = (await response.json()) as StatsSample;
			} catch (_err) {
				this._nextAttemptAt = Date.now() + RETRY_AFTER_FAILURE_MS;
				if (this.playingBack) this.clear();
				return;
			}
			await this.observeStats(stats);
		},
		/** A `/stats` body from any poll; the store's own or another store's. */
		async observeStats(stats: StatsSample): Promise<void> {
			const playingBack = stats.is_playing_back === true;
			this.frame = stats.total_elapsed_frames ?? 0;
			if (!playingBack) {
				if (this.playingBack) this.clear();
				return;
			}
			this.playingBack = true;
			const generation = stats.bookmark_generation;
			if (this.generation === null || (generation !== undefined && generation !== this.generation)) {
				await this.refreshBookmarks();
			}
		},
		async refreshBookmarks(): Promise<void> {
			if (this._fetching) return;
			this._fetching = true;
			try {
				const response = await fetch(`${EMULATOR_BASE_URL}/bookmarks`);
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				const reply = (await response.json()) as BookmarksReply;
				if (reply.state !== "playback") {
					this.clear();
					return;
				}
				this.replay = reply.replay;
				this.generation = reply.generation;
				this.bookmarks = reply.bookmarks.filter(isSplitBookmark).map(({ id, name, in_frame, type }) => ({ id, name, in_frame, type }));
				this.rows = Array.isArray(reply.splits)
					? reply.splits.filter((r) => r && typeof r.trainer === "string").map((r) => {
						const row: FramedSplitRow = { trainer: r.trainer, time: String(r.time ?? ""), frame: typeof r.frame === "number" ? r.frame : null };
						if (typeof r.id === "number") row.id = r.id;
						return row;
					})
					: null;
				this.setPollInterval(this.rows ? ROWS_POLL_INTERVAL_MS : POLL_INTERVAL_MS);
			} catch (_err) {
				// Left as it was; the next generation change (or the next tick with no
				// generation yet) tries again.
			} finally {
				this._fetching = false;
			}
		},
	},
});
