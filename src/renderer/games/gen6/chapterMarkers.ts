/**
 * The 3DS overlay's battle chapter markers (ARCHITECTURE §9): trainer IN/OUT, IN - Wild, Next Pokemon and Enemy
 * Fainted, with gens 4-5's names and rules. The overlay calls this from `mounted`; tools/markers/ can run the same
 * function over a replay's memory log.
 *
 * What the mappers give (read from Super Shuckie replays, docs/gen6-inventory.md):
 * - `battle.in_battle` is true exactly while the game's battle object exists, so there are no phantom battles to
 *   filter out as in gens 4-5: nothing here reads memory the game reuses between battles.
 * - `battle.opponent.id` is the trainer's id, 0 in a wild battle (hordes included). It arrives a few frames after
 *   `in_battle`, so a battle is only called wild once it has been on for a moment with the id still 0.
 * - `battle.opponent.trainer` is the trainer's class and name from the battle itself ("Youngster Joey"; X/Y and
 *   OR/AS, mapper 0.1.0). Where there is none yet (Sun/Moon, Ultra Sun/Ultra Moon), the trainer is written
 *   `Trainer <id>`, as gen 5 writes a trainer its table has no name for.
 */
import { BattleMarkerTracker, realClock, type MarkerClock } from "~/core/logic/battleMarkers";

export interface ThreeDsMarkerContext {
    /** `game.properties`: nodes with `.value` and `.change((newProp, oldProp) => ...)`. */
    props: any;
    send: (marker: string) => void;
    clock?: MarkerClock;
}

/** How long a battle must be on with no trainer id before it is called wild. */
export const WILD_WAIT_MS = 300;
/** How long after an opposing record's HP reaches 0 the faint is checked (see ENEMY FAINTED below). */
export const ENEMY_FAINT_CHECK_MS = 50;

/** The trainer's name for markers and split rows: the battle's own strings, else `Trainer <id>`; null in a wild battle. */
export function trainerLabel(props: any): string | null {
    const id = Number(props?.battle?.opponent?.id?.value) || 0;
    if (id === 0) return null;
    const name = props?.battle?.opponent?.trainer?.value;
    return typeof name === "string" && name !== "" ? name : "Trainer " + id;
}

export function wireThreeDsChapterMarkers(ctx: ThreeDsMarkerContext) {
    const P = ctx.props;
    const clock = ctx.clock ?? realClock;
    const send = (marker: string) => {
        console.log("Chapter Detected: " + marker);
        ctx.send(marker);
    };
    const tracker = new BattleMarkerTracker(send, clock);
    const opponent = () => P.battle?.opponent;
    const inBattle = () => P.battle?.in_battle?.value === true;
    const partyLoaded = () => {
        const count = opponent()?.team_count?.value;
        return typeof count === "number" && count >= 1 && count <= 6;
    };

    const trainerSeen = () => {
        const name = trainerLabel(P);
        if (!inBattle() || name === null) return;
        tracker.begin(name, false, () => inBattle() && trainerLabel(P) === name && partyLoaded());
    };
    opponent()?.id?.change?.(trainerSeen);
    // The name strings are freed a moment before the battle ends, with the trainer id still set: the name emptying
    // is the battle closing, not a new trainer ("Trainer 469" would get its own IN marker).
    opponent()?.trainer?.change?.((newProp: any, oldProp: any) => {
        if (!newProp?.value && oldProp?.value) return;
        trainerSeen();
    });

    P.battle?.in_battle?.change?.((newProp: any) => {
        if (newProp?.value === true) {
            trainerSeen();
            clock.setTimeout(() => {
                if (!inBattle() || trainerLabel(P) !== null || tracker.battle || tracker.holding) return;
                tracker.begin("Wild", true, () => inBattle() && trainerLabel(P) === null && partyLoaded());
            }, WILD_WAIT_MS);
        } else {
            tracker.end();
        }
    });

    // NEXT POKEMON: the opposing side's Pokemon that is out changed to another party slot.
    opponent()?.party_position?.change?.((newProp: any, oldProp: any) => {
        if (!inBattle() || !tracker.battle || tracker.battle.isWild) return;
        const v = newProp?.value, old = oldProp?.value, count = opponent()?.team_count?.value ?? 6;
        if (v === old || !Number.isInteger(v) || v < 0 || v >= count || !Number.isInteger(old)) return;
        send("Next Pokemon");
    });

    // ENEMY FAINTED: any of the opposing side's battle records going from some HP to none.
    for (let i = 0; i < 6; i++) {
        P.battle?.opponent_team?.[i]?.hp?.change?.((newProp: any, oldProp: any) => {
            if (!inBattle() || !tracker.battle) return;
            if (newProp?.value !== 0 || !(oldProp?.value > 0) || oldProp.value > 999) return;
            if (i >= (opponent()?.team_count?.value ?? 6)) return;
            // The records are emptied when the battle ends, in the same update that turns `in_battle` off, and the
            // changes of one update arrive in no set order. So look again a moment later: the battle still on and the
            // record still there means the Pokemon fainted.
            clock.setTimeout(() => {
                const record = P.battle?.opponent_team?.[i];
                if (inBattle() && record?.species?.value && record?.hp?.value === 0) send("Enemy Fainted");
            }, ENEMY_FAINT_CHECK_MS);
        });
    }

    return { tracker };
}
