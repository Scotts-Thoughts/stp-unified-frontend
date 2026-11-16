/**
 * Battle chapter markers, written exactly once per real battle (all generations; ARCHITECTURE §9).
 *
 * The memory a generation reads its opponent from is reused by the game outside battle (gen4's
 * BattleSystem, gen5's battle setup, gen3's screen callbacks), so a value appearing there is only a
 * candidate. `BattleMarkerTracker`:
 *  - holds a candidate's IN for `holdMs` (250 ms, the delay every generation's IN always had, which Cutter's
 *    offsets are tuned to), then writes it only if the generation's `confirm` check still passes;
 *  - keeps one battle open at a time, so a second IN is never written before the first battle's OUT;
 *  - writes an OUT only for the battle whose IN was written, under the IN's name, once; an end that comes
 *    while the IN is still held drops both (a flicker);
 *  - lets a wild candidate replace a held trainer one (and a trainer candidate never replace a held wild one).
 * No OUT is written for a wild battle: Cutter closes those on "Enemy Fainted".
 *
 * `SettleWindow` is the "memory is being reloaded" guard: kicked by a reset, a load or a burst of changes,
 * and settled again once `ms` pass with no kick. Item-style markers rebase silently while it is unsettled.
 *
 * Pure: the clock is passed in, so tools/markers/ can run a generation's real wiring over a replay.
 */

export interface MarkerClock {
	now(): number;
	setTimeout(fn: () => void, ms: number): unknown;
	clearTimeout(handle: unknown): void;
}

export const realClock: MarkerClock = {
	now: () => Date.now(),
	setTimeout: (fn, ms) => setTimeout(fn, ms),
	clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export const BATTLE_IN_HOLD_MS = 250;

export interface OpenBattle {
	name: string;
	isWild: boolean;
}

interface Candidate extends OpenBattle {
	confirm: () => boolean;
	timer: unknown;
}

export class BattleMarkerTracker {
	private pending: Candidate | null = null;
	private current: OpenBattle | null = null;

	constructor(
		private readonly send: (marker: string) => void,
		private readonly clock: MarkerClock = realClock,
		private readonly holdMs: number = BATTLE_IN_HOLD_MS,
	) {}

	/** The battle whose IN was written and whose end has not come yet. */
	get battle(): OpenBattle | null {
		return this.current;
	}

	/** A candidate IN is waiting out its hold. */
	get holding(): boolean {
		return this.pending != null;
	}

	/** A battle against `name` ("Wild" for a wild one) may have started; `confirm` decides when the hold ends. */
	begin(name: string, isWild: boolean, confirm: () => boolean = () => true): void {
		if (this.current) return;
		if (this.pending) {
			if (this.pending.isWild && !isWild) return;
			if (this.pending.name === name && this.pending.isWild === isWild) return;
			this.clock.clearTimeout(this.pending.timer);
		}
		const candidate: Candidate = { name, isWild, confirm, timer: null };
		candidate.timer = this.clock.setTimeout(() => {
			if (this.pending !== candidate) return;
			this.pending = null;
			if (this.current || !candidate.confirm()) return;
			this.current = { name, isWild };
			this.send("IN - " + name);
		}, this.holdMs);
		this.pending = candidate;
	}

	/**
	 * The battle against `name` (any battle when omitted) is over. Writes its OUT if its IN was written;
	 * drops a held IN for it without writing anything.
	 */
	end(name?: string | null): void {
		if (this.pending && (name == null || this.pending.name === name)) {
			this.clock.clearTimeout(this.pending.timer);
			this.pending = null;
			return;
		}
		if (!this.current || (name != null && this.current.name !== name)) return;
		const closed = this.current;
		this.current = null;
		if (!closed.isWild) this.send("OUT - " + closed.name);
	}

	/** Forget the open or held battle without writing anything. */
	abort(): void {
		if (this.pending) this.clock.clearTimeout(this.pending.timer);
		this.pending = null;
		this.current = null;
	}
}

export class SettleWindow {
	private kickedAt = -Infinity;

	constructor(
		private readonly clock: MarkerClock = realClock,
		private readonly ms: number = 2000,
	) {}

	kick(): void {
		this.kickedAt = this.clock.now();
	}

	get settled(): boolean {
		return this.clock.now() - this.kickedAt >= this.ms;
	}
}
