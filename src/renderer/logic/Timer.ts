import PubSub from "./PubSub";
import { SpeciesMetricStore } from "~/stores/useSpeciesMetricsStore";
const f = (x: number) => x.toString().padStart(2, "0");

export type TimerData = {
	/** Whether the timer is paused. */
	paused: boolean
	/** The timestamp of when the timer was started (milliseconds since UNIX epoch). */
	started_at: number
	/** The timestamp of when the timer was paused (milliseconds since UNIX epoch). */
	paused_at: number
};

/** Calculate the elapsed time (in hours, seconds, minunutes, milliseconds) on the timer. */
export function getTime(timer: TimerData) {
	var time = Date.now() - timer.started_at
	if (timer.paused == true) {
		time = timer.paused_at - timer.started_at
	}
	return {
		ms: (Math.floor(time / 10) % 100),
		seconds: (Math.floor(time / 1000) % 60),
		minutes: (Math.floor(time / 60000) % 60),
		hours: (Math.floor(time / 3600000))
	};
}

/** Split a number of milliseconds into the same shape that {@link getTime} returns. */
export function splitMilliseconds(milliseconds: number) {
	const time = Math.max(0, milliseconds);
	return {
		ms: (Math.floor(time / 10) % 100),
		seconds: (Math.floor(time / 1000) % 60),
		minutes: (Math.floor(time / 60000) % 60),
		hours: (Math.floor(time / 3600000))
	};
}

/**
 * Format a time object into an array of strings with the following formats:
 *
 * * 0: `[<hh>:][<mm>:][<ss>]` (e.g. `01:23:45` or `23:45`).
 * * 1: `.<ms>` (e.g. `.67`)
 * * 2: `<h>h<m>m<s>s`  (e.g. `1h23m45s`)
 */
export function formatTime(time: ReturnType<typeof getTime>): [string, string, string] {
	const {ms: ms, seconds: s, minutes: m, hours: h} = time;
	if (h != 0) {
		return [ h + ":" + f(m) + ":" + f(s), "." + f(ms), h + "h" + m + "m" + s + "s", ];
	} else if (m != 0) {
		return [ m + ":" + f(s), "." + f(ms), h + "h" + m + "m" + s + "s", ];
	}
	return [ s.toString(), "." + f(ms), h + "h" + m + "m" + s + "s", ];
}

/**
 * Real-world timer.
 */
export class Timer {
	static _instance: Timer| null;

	/**
	 * Create the timer instance for the given store, or re-bind the existing instance to it. Only ever one
	 * update loop is running, no matter how often this is called.
	 */
	static initialize(store: SpeciesMetricStore) {
		if (this._instance) {
			this._instance._store = store;
			this._instance.update();
			return;
		}
		this._instance = new Timer(store);
	}

	/** Get the timer instance, creating it for the given store if it does not exist yet. */
	static ensure(store: SpeciesMetricStore) {
		if (!this._instance) {
			this.initialize(store);
		}
		return this._instance!;
	}

	static instance() {
		if (!this._instance)  {
			throw new Error("Timer has not been initialized");
		}
		return this._instance;
	}

	_store: SpeciesMetricStore;

	/**
	 * An array with formatted time information. First item is the general time as `hh:mm:ss`.
	 * Second is the number of milliseconds elapsed as `.ms`
	 *
	 * Only current as of the last `update()`: the frame loop does not refresh it while
	 * no `timer.vue` is subscribed (see `updateLoop`), so it is not a live value to poll.
	 * Read the time through `SpeciesMetricStore.getTime()`, which formats from the store,
	 * or subscribe to `@timer/update`.
	 */
	formatted_time: string[] = ["0", ".00"];
	constructor(store: SpeciesMetricStore) {
		this._store = store;
		this.formatted_time  = ["0", ".00"];
		this.update();     // update once to set everything correctly.
		this.updateLoop(); // then start the timer loop.
		// We may be paused, so the update() is necessary, since the loop does no updates when paused.
	}

	/**
	 * The frame loop. It formats and publishes only while the timer is running, a `timer.vue` is
	 * subscribed and the out-of-process clock is not showing (`setFrameLive`); with the overlay
	 * gone there is nobody to publish to, and `formatted_time` has no other reader (the split log
	 * formats its own from the store). Otherwise it ends (2026-11-03: it used to request a frame at
	 * the display's refresh rate for the life of the page, paused or not), and `wake` restarts it:
	 * `timer.vue` calls it when the timer's paused flag or the clock frame changes, which also covers
	 * the store loading a running timer from disk. The explicit `update()` calls in
	 * `set`/`start`/`toggle` and `initialize` are not gated, so a component that mounts while the
	 * timer is paused still gets its value the way it always did.
	 */
	updateLoop = () => {
		if (this._store.timer.paused || this.frameLive || !PubSub.hasSubscribers("@timer/update")) {
			this.looping = false;
			return;
		}
		this.update();
		this.looping = true;
		window.requestAnimationFrame(this.updateLoop);
	}

	looping = false;

	/** The out-of-process clock (core/overlay/ClockFrame.ts) is showing; set by `timer.vue`. */
	frameLive = false;

	/** Restarts an ended `updateLoop` on the next frame; a no-op while it runs. */
	wake = () => {
		if (this.looping) return;
		this.looping = true;
		window.requestAnimationFrame(this.updateLoop);
	}

	/**
	 * Called by `timer.vue` when the out-of-process clock appears or goes away. When it goes away
	 * the in-page clock shows again, so it gets the current time and the loop restarts.
	 */
	setFrameLive = (live: boolean) => {
		this.frameLive = live;
		if (!live) {
			this.update();
			this.wake();
		}
	}

	/**
 	 * Pause and set the timer back to default
	 * @param startTimeOffset The default value to set the timer to, as a string in the format `hh:mm:ss.ms`
	 */
	set = (startTimeOffset: string) => {
		const timeOffset = this.parseOffsetString(startTimeOffset);
		this._store.timer.paused = true;
		this._store.timer.started_at = Date.now() - timeOffset;
		this._store.timer.paused_at = Date.now();
		this.update();
	}

	/**
	 * Sets the timer (see {@link set}) and unpauses it.
	 * @param startTimeOffset An offset to add to the timer value, a string in the format hh:mm:ss.ms.
	 */
	start = (startTimeOffset: string) => {
		if (this._store.timer.paused == false) {
			return
		}
		this.set(startTimeOffset);
		this._store.timer.paused = false;
		this.update();
		this.wake();
	}

	/**
	 * Pauses the timer if it's currently running and vice versa.
	 */
	toggle = () => {
		if (this._store.timer.paused == true) {
			this._store.timer.paused = false;
			this._store.timer.started_at += Date.now() - this._store.timer.paused_at;
			this.update();
			this.wake();
		}
		else {
			this._store.timer.paused = true;
			this._store.timer.paused_at = Date.now();
		}
	}

	/** Pause the timer. */
	stop = () => {
		this._store.timer.paused_at = Date.now();
		this._store.timer.paused = true;
	}

	/**
	 * Updates the {@link formatted_time} and publishes a `time_update` event which the "Timer" vue component listens for.
	 */
	update = () => {
		this.formatted_time = formatTime(getTime(this._store.timer));
		PubSub.publish("@timer/update", this.formatted_time);
	}

	/**
	 * Parses a time value string with format `hh:mm:ss.ms` and returns the number of milliseconds that value describes.
	 * @param offset The offset string to parse.
	 * @returns Milliseconds
	 */
	parseOffsetString = (offset: string): number => {
		const timeRegex = /(\d+):(\d{2}):(\d{2})\.(\d{2})/;
		const timeOffsetArray = offset.match(timeRegex)?.slice(1,5).map(x => parseInt(x)) ?? [0,0,0,0];
		return timeOffsetArray[0] * 3600000 + timeOffsetArray[1] * 60000 + timeOffsetArray[2] * 1000 + timeOffsetArray[3] * 10;
	}
}
