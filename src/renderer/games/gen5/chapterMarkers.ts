/**
 * gen5's battle chapter markers (ARCHITECTURE §9): trainer IN/OUT, IN - Wild, Next Pokemon and Enemy Fainted.
 * The overlay calls this from `mounted`; tools/markers/ runs the same function over a replay's memory.
 *
 * `battle.opponent.trainer` is the trainer id in the battle setup data, memory the game reuses when no battle
 * is on: between battles it holds leftover ids that read as "Jude" (White 2), "Jaden" / "Alf & Fred" (Black)
 * and others. The game's own battle flag tells them apart: `battle.other.battle` is 21828 (0x5544) from the
 * frame the battle is set up (the slot reads "--", the opponent's party loads, the real id follows ~15 frames
 * later) until the screen tears down, when it drops to 0 in the same frame the leftover id comes back
 * (w-kyurem-1, b-victini-1 replays, 2026-11-07). So a trainer IN is written only while the flag is on and the
 * opponent's party count is 1-6, and the in-battle markers only while the flag is on.
 */
import { BattleMarkerTracker, realClock, type MarkerClock } from "~/core/logic/battleMarkers";

export interface Gen5MarkerContext {
	/** `game.properties`: nodes with `.value` and `.change((newProp, oldProp) => …)`. */
	props: any;
	selectedGame: string;
	send: (marker: string) => void;
	clock?: MarkerClock;
}

export const GEN5_BATTLE_ACTIVE = 21828;

export function wireGen5ChapterMarkers(ctx: Gen5MarkerContext) {
	const P = ctx.props;
	const clock = ctx.clock ?? realClock;
	const send = (marker: string) => {
		console.log("Chapter Detected: " + marker);
		ctx.send(marker);
	};
	const tracker = new BattleMarkerTracker(send, clock);

	const opponent = () => P.battle?.opponent;
	const battleOn = () => P.battle?.other?.battle?.value === GEN5_BATTLE_ACTIVE && !!P.player?.name?.value;
	const partyLoaded = () => {
		const count = opponent()?.team_count?.value;
		return typeof count === "number" && count >= 1 && count <= 6;
	};
	const isTrainerValue = (v: any) => v != null && v !== "" && v !== "--";

	// Whether a trainer id was written since the battle flag came on: the real id lands ~15 frames after it.
	let trainerWrittenThisBattle = false;
	P.battle?.other?.battle?.change((newProp: any) => {
		if (newProp?.value === GEN5_BATTLE_ACTIVE) trainerWrittenThisBattle = false;
		// A wild battle lasts as long as the flag: meta.state can drop out of Battle and back mid-fight.
		else if (tracker.battle?.isWild) tracker.end("Wild");
	});

	// TRAINER IN / OUT. Plot battles that skip "To Battle" (Bianca, Cheren, N) still set the flag. A trainer
	// the mapper's table has no name for (White 2 ids 2103-2105) reads null; it is named by its id.
	const unnamed = (id: any) => "Trainer " + id;
	opponent()?.trainer?.change((newProp: any, oldProp: any) => {
		if (isTrainerValue(newProp?.value)) {
			const name = newProp.value;
			if (battleOn()) trainerWrittenThisBattle = true;
			tracker.begin(name, false, () => opponent()?.trainer?.value === name && battleOn() && partyLoaded());
		} else if (isTrainerValue(oldProp?.value)) {
			tracker.end(oldProp.value);
		}
	});
	opponent()?.id?.change((newProp: any, oldProp: any) => {
		const id = newProp?.value;
		if (opponent()?.trainer?.value == null && id > 0) {
			if (battleOn()) trainerWrittenThisBattle = true;
			tracker.begin(unnamed(id), false, () => opponent()?.trainer?.value == null && opponent()?.id?.value === id && battleOn() && partyLoaded());
		} else if (oldProp?.value > 0) {
			tracker.end(unnamed(oldProp.value));
		}
	});

	// WILD: no trainer was written since the flag came on, looked at once the state reads Battle. (The slot
	// reads "--" in a wild battle, except before the run's first trainer battle, when nothing has cleared the
	// leftover id yet.)
	P.meta?.state?.change((newProp: any) => {
		if (newProp?.value === "Battle") {
			tracker.begin("Wild", true, () => P.meta?.state?.value === "Battle" && battleOn() && !trainerWrittenThisBattle);
		} else if (!tracker.battle && tracker.holding) {
			tracker.end("Wild");
		}
	});

	// NEXT POKEMON: party_position is worked out from a pointer, (ptr - base) / 548, so a freed or moved pointer
	// gives fractions and junk; only a whole slot inside the opponent's party counts.
	opponent()?.party_position?.change((newProp: any, oldProp: any) => {
		if (!battleOn() || P.meta?.state?.value !== "Battle") return;
		const v = newProp?.value, count = opponent()?.team_count?.value ?? 6;
		if (v === oldProp?.value || !Number.isInteger(v) || v < 0 || v >= count) return;
		if (!Number.isInteger(oldProp?.value) || oldProp.value < 0 || oldProp.value >= count) return;
		send("Next Pokemon");
	});

	// ENEMY FAINTED: every opponent battle record, not just the lead's (`active_pokemon` is fixed at slot 0, so
	// only the first faint of a battle was ever marked).
	for (let i = 0; i < 6; i++) {
		opponent()?.pkmn_ram?.[`pokemon_${i}_ram`]?.stats?.hp?.change((newProp: any, oldProp: any) => {
			// Not while "To Battle": the records load then, and an uninitialised 65535 can be followed by 0.
			if (!battleOn() || P.meta?.state?.value !== "Battle" || P.battle?.other?.outcome_flags?.value === 1) return;
			if (newProp?.value !== 0 || !(oldProp?.value > 0)) return;
			if (i >= (opponent()?.team_count?.value ?? 6)) return;
			send("Enemy Fainted");
		});
	}

	return { tracker };
}
