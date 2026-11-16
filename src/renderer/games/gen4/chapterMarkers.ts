/**
 * gen4's chapter markers that depend on knowing whether a battle is really on (ARCHITECTURE §9):
 * trainer IN/OUT, IN - Wild, Next Pokemon, Enemy Fainted, Turn, MENU (HG/SS), Item and New Move.
 * The overlay calls this from `mounted`; tools/markers/ runs the same function over a replay's memory.
 *
 * Why it is gated: `battle.opponent.trainer` is BattleSystem.trainerIDs[1], inside memory the game frees after
 * each battle and reuses for menus and map loading, so it holds leftover numbers between battles (Platinum's
 * "Dragon Tamer Geoffrey" 557 and "Ninja Boy Joel" 70, HG/SS's "Ace Trainer Gaven"). In those moments the
 * opponent's party count beside it holds garbage (0, 99, 127, 236-238); in a real battle it is 1-6 within four
 * frames of the trainer id. Checked on three full runs (Platinum v0.3.0 and v6, HeartGold v6): 461 of 461 real
 * trainer battles kept, no phantom left. `meta.state` is no gate either: it compares the battle's active
 * Pokémon with party slot 0, so it reads Overworld after a switch and Battle again after the battle ends.
 */
import { BattleMarkerTracker, realClock, SettleWindow, type MarkerClock } from "~/core/logic/battleMarkers";

export interface Gen4MarkerContext {
	/** `game.properties`: nodes with `.value` and `.change((newProp, oldProp) => …)`. */
	props: any;
	selectedGame: string;
	send: (marker: string) => void;
	clock?: MarkerClock;
}

const ITEM_BURST_MS = 1500;
const ITEM_SETTLE_MS = 2000;
const ALL_POCKETS = ["items", "medicine", "balls", "tmhm", "berries", "battle_items"];
/** HG/SS app overlay ids the episode pipeline reads as footage walls; the other ids were debug noise. */
const HGSS_MENU_MARKERS = new Set([12, 15]);

export function wireGen4ChapterMarkers(ctx: Gen4MarkerContext) {
	const P = ctx.props;
	const clock = ctx.clock ?? realClock;
	const send = (marker: string) => {
		console.log("Chapter Detected: " + marker);
		ctx.send(marker);
	};
	const hgss = ctx.selectedGame == "HeartGold and SoulSilver";
	const tracker = new BattleMarkerTracker(send, clock);

	const opponent = () => P.battle?.opponent;
	const partyLoaded = () => {
		const count = opponent()?.team_count?.value;
		return typeof count === "number" && count >= 1 && count <= 6;
	};
	const trainerBattleCandidate = () => {
		if (opponent()?.trainer?.value == null || !partyLoaded()) return false;
		// HG/SS's IN always waited for the battle application (overlay 12) as well.
		return !hgss || P.meta?.menu?.app_overlay_id?.value === 12;
	};
	const wildBattleCandidate = () => P.battle?.mode?.value === "Wild" && opponent()?.trainer?.value == null && partyLoaded();
	// A battle whose IN was written and whose result is not in yet (outcome_flags 1: won; the trainer slot only
	// clears a few seconds later, after the post-battle text).
	const inBattle = () => tracker.battle != null && P.battle?.other?.outcome_flags?.value !== 1;

	// TRAINER IN / OUT, IN - Wild
	const offerTrainer = () => {
		const name = opponent()?.trainer?.value;
		if (name == null || !trainerBattleCandidate()) return;
		tracker.begin(name, false, () => opponent()?.trainer?.value === name && trainerBattleCandidate());
	};
	opponent()?.trainer?.change((newProp: any, oldProp: any) => {
		if (newProp?.value == null) {
			tracker.end(oldProp?.value);
			return;
		}
		if (tracker.battle?.isWild) tracker.abort();
		offerTrainer();
	});
	opponent()?.team_count?.change(() => {
		offerTrainer();
		if (tracker.battle?.isWild && !partyLoaded()) tracker.end("Wild");
	});
	if (hgss) P.meta?.menu?.app_overlay_id?.change(() => offerTrainer());
	P.battle?.mode?.change?.((newProp: any, oldProp: any) => {
		if (newProp?.value === "Wild" && oldProp?.value !== "Wild" && wildBattleCandidate()) {
			tracker.begin("Wild", true, wildBattleCandidate);
		}
	});

	// MENU (HG/SS): only the bag/save walls the episode pipeline reads.
	if (hgss) {
		P.meta?.menu?.app_overlay_id?.change((newProp: any) => {
			if (HGSS_MENU_MARKERS.has(newProp?.value)) send("MENU - " + newProp.value);
		});
	}

	// NEXT POKEMON / ENEMY FAINTED / TURN: only inside a battle whose IN was written.
	const enemyPresent = () => opponent()?.active_pokemon?.species?.value != null;
	opponent()?.party_position?.change((newProp: any, oldProp: any) => {
		if (!inBattle() || !enemyPresent()) return;
		if (newProp?.value === oldProp?.value) return;
		send("Next Pokemon");
	});
	opponent()?.active_pokemon?.stats?.hp?.change((newProp: any, oldProp: any) => {
		if (!inBattle() || !enemyPresent()) return;
		if (newProp?.value !== 0 || oldProp?.value === 0) return;
		send("Enemy Fainted");
	});
	// Only the Platinum mapper has battle.turn_counter; a reset between battles is a decrement.
	P.battle?.turn_counter?.change((newProp: any, oldProp: any) => {
		if (!inBattle()) return;
		if ((newProp?.value ?? 0) <= (oldProp?.value ?? 0)) return;
		send("Turn");
	});

	// NEW MOVE: in battle from the battler, otherwise the lead. A switch of source (battle start or end) only
	// takes a new snapshot: the battle copy and the party differ by the move just replaced.
	const readMoveContext = () => {
		const battle = P.meta?.state?.value == "Battle";
		const source = battle ? P.battle?.player?.active_pokemon : P.player?.team?.[0];
		const moves = [0, 1, 2, 3].map((i) => source?.moves?.[i]?.move?.value ?? null);
		return { source: battle ? "battle" : "party", species: source?.species?.value ?? null, moves };
	};
	let lastMoveContext = readMoveContext();
	let moveCheckTimer: unknown = null;
	const checkForNewMove = () => {
		const previous = lastMoveContext;
		const current = readMoveContext();
		lastMoveContext = current;
		if (previous.source !== current.source || previous.species !== current.species) return;
		const oldMoves = previous.moves.filter((m: any) => m != null && m !== "");
		const newMoves = current.moves.filter((m: any) => m != null && m !== "");
		const counts: Record<string, number> = {};
		oldMoves.forEach((m: string) => (counts[m] = (counts[m] || 0) + 1));
		const added: string[] = [];
		for (const m of newMoves) {
			if (counts[m]) counts[m]--;
			else added.push(m);
		}
		if (oldMoves.length >= 1 && added.length === 1) send("New Move - " + added[0]);
	};
	const scheduleMoveCheck = () => {
		if (moveCheckTimer) clock.clearTimeout(moveCheckTimer);
		moveCheckTimer = clock.setTimeout(() => {
			moveCheckTimer = null;
			checkForNewMove();
		}, 100);
	};
	for (let i = 0; i < 4; i++) {
		P.player?.team?.[0]?.moves?.[i]?.move?.change(() => scheduleMoveCheck());
		P.battle?.player?.active_pokemon?.moves?.[i]?.move?.change(() => scheduleMoveCheck());
	}

	// ITEM: a rise in an item's total across the six pockets and the party's held items. HMs other than HM03
	// are left out. After a reset or load the bag reads garbage, empties and refills item by item over a few
	// seconds, so while `settle` is unsettled the totals are only re-read; any change while unsettled, a
	// reset flag, a party-size change, the title-screen map or three or more names moving at once kicks it again.
	const isBlockedHm = (name: string) => /^HM(?!03)\d{2}\b/.test(String(name)) ||
		["Cut", "Fly", "Strength", "Defog", "Rock Smash", "Waterfall", "Rock Climb"].includes(name);
	const readItemTotals = () => {
		const totals = new Map<string, number>();
		for (const pocket of ALL_POCKETS) {
			const slots = P.bag?.[pocket];
			if (!slots) continue;
			for (const k of Object.keys(slots)) {
				const name = slots[k]?.item?.value;
				if (name == null || name === "") continue;
				totals.set(name, (totals.get(name) || 0) + (slots[k]?.quantity?.value ?? 1));
			}
		}
		for (let i = 0; i < 6; i++) {
			const name = P.player?.team?.[i]?.held_item?.value;
			if (name == null || name === "") continue;
			totals.set(name, (totals.get(name) || 0) + 1);
		}
		return totals;
	};
	const settle = new SettleWindow(clock, ITEM_SETTLE_MS);
	let lastItemTotals = readItemTotals();
	const lastItemFiredAt = new Map<string, number>();
	let itemCheckTimer: unknown = null;
	const checkItemDeltas = () => {
		const current = readItemTotals();
		const rose: string[] = [];
		let moved = 0;
		for (const name of new Set([...current.keys(), ...lastItemTotals.keys()])) {
			const before = lastItemTotals.get(name) ?? 0;
			const now = current.get(name) ?? 0;
			if (now !== before) moved++;
			if (now > before && !isBlockedHm(name)) rose.push(name);
		}
		lastItemTotals = current;
		if (moved >= 3 || (moved > 0 && !settle.settled)) {
			settle.kick();
			return;
		}
		const now = clock.now();
		for (const name of rose) {
			if (now - (lastItemFiredAt.get(name) ?? -Infinity) >= ITEM_BURST_MS) send("Item - " + name);
			lastItemFiredAt.set(name, now);
		}
	};
	const scheduleItemCheck = () => {
		if (itemCheckTimer) clock.clearTimeout(itemCheckTimer);
		itemCheckTimer = clock.setTimeout(() => {
			itemCheckTimer = null;
			checkItemDeltas();
		}, 100);
	};
	for (const pocket of ALL_POCKETS) {
		const slots = P.bag?.[pocket];
		if (!slots) continue;
		for (const k of Object.keys(slots)) {
			slots[k]?.item?.change?.(() => scheduleItemCheck());
			slots[k]?.quantity?.change?.(() => scheduleItemCheck());
		}
	}
	for (let i = 0; i < 6; i++) P.player?.team?.[i]?.held_item?.change?.(() => scheduleItemCheck());
	const kickOnReload = (node: any, when: (value: any) => boolean = () => true) =>
		node?.change?.((newProp: any) => {
			if (when(newProp?.value)) settle.kick();
		});
	kickOnReload(P.flags?.new_game_1);
	kickOnReload(P.variables?.game_started);
	// Any change of party size: a reset empties it, and a Pokémon withdrawn from the PC brings its held item.
	kickOnReload(P.player?.team_count);
	kickOnReload(P.overworld?.map_index, (v) => v === 0);

	return { tracker };
}
