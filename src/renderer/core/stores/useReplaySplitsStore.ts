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
 */

const POLL_INTERVAL_MS = 250;
const RETRY_AFTER_FAILURE_MS = 5000;

interface StatsSample {
	total_elapsed_frames?: number;
	is_playing_back?: boolean;
	bookmark_generation?: number;
}

interface BookmarksReply {
	replay: string | null;
	state: "none" | "recording" | "playback";
	generation: number;
	bookmarks: FrameStampedBookmark[];
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
		_interval: null as ReturnType<typeof setInterval> | null,
		_nextAttemptAt: 0 as number,
		_fetching: false as boolean,
	}),
	getters: {
		/** `current_splits` rows for the frame being shown: the last split per trainer at or before it. */
		currentSplits(state): SplitRow[] {
			return state.playingBack ? splitsFromBookmarks(state.bookmarks, state.frame) : [];
		},
	},
	actions: {
		startPolling(): void {
			if (this._interval != null) return;
			this._interval = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
		},
		stopPolling(): void {
			if (this._interval != null) clearInterval(this._interval);
			this._interval = null;
			this.clear();
		},
		clear(): void {
			this.playingBack = false;
			this.replay = null;
			this.generation = null;
			this.bookmarks = [];
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
			} catch (_err) {
				// Left as it was; the next generation change (or the next tick with no
				// generation yet) tries again.
			} finally {
				this._fetching = false;
			}
		},
	},
});
