/**
 * Self-test for player profiles against a fake router (move-stats spec §4.6).
 *
 * A tiny HTTP server stands in for the pkmn_yellow_xp_router's move-stats server and
 * serves a fixed `/move-stats` that the test changes between asks. The reply is read
 * with main's own fetch (`src/main/routerFetch.ts`) and folded in with the renderer's
 * own merge (`core/profile/merge.ts`), so this checks:
 *   - de-duplication by battle_id: asking twice never counts a battle twice;
 *   - the re-filming / test-run rule: a battle handled while skipping is never added,
 *     even after skipping is turned off;
 *   - the game-mismatch rule: a reply for another game is not used;
 *   - "Remove from profile" takes exactly the run's numbers away and keeps it out;
 *   - the luck labels (§5.3).
 *
 *   npm run parity:profiles
 */
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import type { AddressInfo } from "net";
import { getFromRouter } from "../../src/main/routerFetch.ts";
import { applyReply, checkReply, normaliseProfile, removeRun, type Profile, type RouterBattle } from "../../src/renderer/core/profile/merge.ts";
import { luck } from "../../src/renderer/core/profile/counts.ts";
import { bucketForRouterGame } from "../../src/renderer/core/profile/buckets.ts";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown): void {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    const ok = a === e;
    if (!ok) failures++;
    console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${a}${ok ? "" : ` (expected ${e})`}`);
}

function battle(id: string, outcome: string, uses: number, hits: number): RouterBattle {
    return {
        battle_id: id,
        kind: "trainer",
        outcome,
        player: { "Fire Blast": { interest: 1, uses, acc_rolls: uses, hits, misses: uses - hits, expected_hits: uses * 0.85, hit_variance: uses * 0.85 * 0.15, listed_accuracy: 85, type: "Fire", multi_hit: {}, called_by: {} } },
        enemy: { Tackle: { interest: 2, uses: 1, crit_rolls: 1, crits: 0, expected_crits: 0.0625, crit_variance: 0.0586 } },
        other: { enemy_crits: 0, player_crits: 1 },
    };
}

let reply: unknown = null;
let status = 200;
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === "/move-stats") {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(status === 200 ? reply : { recording: false }));
    } else {
        res.writeHead(404);
        res.end("{}");
    }
});
await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
const port = (server.address() as AddressInfo).port;
const ask = async () => (await getFromRouter("/move-stats", port)).body as any;

const bucket = "FireRed and LeafGreen";
const profile: Profile = { format: 1, id: "ptest", name: "Test", picture: "Pikachu", created: "", buckets: {} };
const fireBlast = () => profile.buckets[bucket]?.player["Fire Blast"];

// 1. two battles, asked twice
reply = { format: 1, run_id: "run-1", game: "FireRed", solo_species: "Charmander", battles: [battle("b1", "won", 4, 3), battle("b2", "reset", 2, 2)], in_battle: false };
let body = await ask();
check("router game maps to the bucket", bucketForRouterGame(body.game), bucket);
check("reply is usable for FRLG", checkReply(body, bucket), "ok");
check("first ask adds both battles (a reset one too)", applyReply(profile, bucket, body, false, "2026-11-24T10:00:00Z"), { added: 2, skipped: 0 });
check("second ask adds nothing", applyReply(profile, bucket, await ask(), false, "2026-11-24T10:00:30Z"), { added: 0, skipped: 0 });
check("Fire Blast uses/hits after two battles", [fireBlast()?.uses, fireBlast()?.hits], [6, 5]);
check("type and listed accuracy carried", [fireBlast()?.type, fireBlast()?.listed_accuracy], ["Fire", 85]);
check("other counts summed", profile.buckets[bucket].other, { player_crits: 2 });

// 2. re-filming on: a new battle is marked handled, not added -- and stays out when it's turned off
reply = { ...(reply as object), battles: [battle("b1", "won", 4, 3), battle("b2", "reset", 2, 2), battle("b3", "won", 5, 1)] };
check("re-filming: b3 skipped", applyReply(profile, bucket, await ask(), true, "x"), { added: 0, skipped: 1 });
check("re-filming off later: b3 not added back", applyReply(profile, bucket, await ask(), false, "x"), { added: 0, skipped: 0 });
check("Fire Blast unchanged by the skipped battle", fireBlast()?.uses, 6);
reply = { ...(reply as object), battles: [...(reply as any).battles, battle("b4", "won", 1, 1)] };
check("next battle with re-filming off is added", applyReply(profile, bucket, await ask(), false, "x"), { added: 1, skipped: 0 });
check("run lists", [profile.buckets[bucket].runs[0].battle_ids, profile.buckets[bucket].runs[0].skipped_battle_ids], [["b1", "b2", "b4"], ["b3"]]);

// 3. game mismatch: the overlay plays Emerald, the router records FireRed
check("mismatch detected", checkReply(await ask(), "Emerald"), "mismatch");
check("not recording (503) is not ok", (status = 503, (await getFromRouter("/move-stats", port)).ok), false);
status = 200;
check("only the router's paths are asked", (await getFromRouter("/elsewhere", port)).ok, false);
check("a reply without a run is invalid", checkReply({ game: "FireRed", battles: [] }, bucket), "invalid");

// 4. a second run, then "Remove from profile" on the first
reply = { format: 1, run_id: "run-2", game: "LeafGreen", solo_species: "Bulbasaur", battles: [battle("c1", "won", 3, 2)] };
check("second run added", applyReply(profile, bucket, await ask(), false, "y"), { added: 1, skipped: 0 });
check("Fire Blast across both runs", fireBlast()?.uses, 10);
check("remove run-1", removeRun(profile, bucket, "run-1"), true);
check("Fire Blast is run-2's only", [fireBlast()?.uses, fireBlast()?.hits, fireBlast()?.expected_hits], [3, 2, 2.55]);
check("Tackle left only run-2's use", profile.buckets[bucket].enemy.Tackle?.uses, 1);
reply = { format: 1, run_id: "run-1", game: "FireRed", solo_species: "Charmander", battles: [battle("b1", "won", 4, 3), battle("b5", "won", 2, 2)] };
check("a removed run's later battles are skipped", applyReply(profile, bucket, await ask(), false, "z"), { added: 0, skipped: 1 });
check("removing it again does nothing", removeRun(profile, bucket, "run-1"), false);

// 5. the file round trip keeps everything
const again = normaliseProfile(JSON.parse(JSON.stringify(profile)));
check("profile survives save and load", JSON.stringify(again) === JSON.stringify(profile), true);

// 6. luck labels
check("too few rolls: no label", luck(4, 3.4, 0.5, 4), null);
check("on par", luck(17, 17, 2.55, 20), "on-par");
check("lucky (z = +1.25)", luck(19, 17, 2.55, 20), "lucky");
check("very unlucky (z = -2.5)", luck(13, 17, 2.55, 20), "very-unlucky");
check("an enemy's extra hits are unlucky for you", luck(19, 17, 2.55, 20, false), "unlucky");

server.close();
if (failures) {
    console.log(`\n${failures} check(s) FAILED`);
    process.exit(1);
}
console.log("\nall profile checks passed");
