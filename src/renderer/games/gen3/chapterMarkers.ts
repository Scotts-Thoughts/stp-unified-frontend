/**
 * gen3's battle IN/OUT chapter markers (ARCHITECTURE §9). The overlay calls this from `mounted`;
 * tools/markers/ runs the same function over a replay's memory.
 *
 * The patch mirrors the game's two main callbacks into `pointers.sStpCallback1/2`. The old markers followed
 * callback2, which changes on every warp, menu and screen: OUT was written on every return to `CB2_Overworld`
 * after any battle (FireRed: ~7,000 OUTs with no IN), a menu opened in battle wrote the IN again (Emerald, whose
 * callback list lacks `CB2_ReshowBattleScreenAfterMenu`), and a wild battle was wrapped in IN/OUT -
 * NOT_MAJOR_BATTLE. callback1 is `BattleMainCB1` exactly while the battle screen runs, through menus, summary and
 * evolution, and never outside it; a reset makes it null.
 *  - IN when callback1 becomes BattleMainCB1: the same frame callback2 becomes BattleMainCB2, when the old IN was
 *    written. `IN - <opponent>` for a trainer battle, `IN - Wild` otherwise.
 *  - OUT on the first `CB2_Overworld` after a trainer battle's callback1 leaves BattleMainCB1, as before (12
 *    frames after it), once, under the IN's name. A blackout (`CB2_WhiteOut`) writes no OUT, as before.
 *  - callback1 going null in battle is a reset or a replay load: if BattleMainCB1 comes straight back (a replay
 *    resumed mid-battle) the battle goes on, otherwise it ends with no OUT (RESET closes it).
 * Checked on e-mudkip-2 and f-cloyster-line-1 (2026-11-07).
 */
export interface Gen3MarkerContext {
	/** `game.properties`: nodes with `.value` and `.change((newProp, oldProp) => …)`. */
	props: any;
	selectedGame: string;
	send: (marker: string) => void;
}

const BATTLE_CB1 = "BattleMainCB1";

export function wireGen3ChapterMarkers(ctx: Gen3MarkerContext) {
	const P = ctx.props;
	const send = (marker: string) => {
		console.log("Chapter Detected: " + marker);
		ctx.send(marker);
	};
	const emerald = ctx.selectedGame == "Emerald";
	const opponentName = () => (emerald ? P.battle?.trainer?.opponentA?.value : P.battle?.trainer?.opponent?.value);

	let battle: { name: string; isWild: boolean } | null = null;
	let interrupted = false;
	let pendingOut: string | null = null;

	P.pointers?.sStpCallback1?.change((newProp: any, oldProp: any) => {
		const now = newProp?.value, before = oldProp?.value;
		if (now === BATTLE_CB1) {
			if (battle) {
				interrupted = false; // back after a replay load: the same battle
				return;
			}
			const trainer = P.battle?.type?.trainer?.value === true;
			const opponent = opponentName();
			battle = trainer && opponent != null ? { name: String(opponent), isWild: false } : { name: "Wild", isWild: true };
			pendingOut = null;
			send("IN - " + battle.name);
			return;
		}
		if (before === BATTLE_CB1 && battle) {
			if (now == null) {
				interrupted = true;
				return;
			}
			if (!battle.isWild) pendingOut = battle.name;
			battle = null;
			return;
		}
		if (interrupted && now != null) {
			battle = null; // reset: the battle did not come back
			interrupted = false;
		}
	});

	P.pointers?.sStpCallback2?.change((newProp: any) => {
		const now = newProp?.value;
		if (now === "CB2_Overworld" && pendingOut) {
			send("OUT - " + pendingOut);
			pendingOut = null;
		} else if (now === "CB2_WhiteOut") {
			pendingOut = null;
		}
	});

	return { inBattle: () => battle != null && !interrupted };
}
