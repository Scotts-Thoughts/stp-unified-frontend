/**
 * Self-test for the EV gauge under the stat tiles (`core/logic/evGauge.ts`): how full each pill and the bar are, and
 * which colour a tile takes, at the edges of every range.
 *
 *   npm run parity:ev-gauge
 */
import { evGaugeState, evTotal } from "../../src/renderer/core/logic/evGauge.ts";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown): void {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    const ok = a === e;
    if (!ok) failures++;
    console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${a}${ok ? "" : ` (expected ${e})`}`);
}
const round = (xs: number[]) => xs.map((x) => Math.round(x * 100) / 100);

// Gens 3-5: one pill is 10 EVs, the pills end at 100 (the vitamin limit), the bar runs to 255.
check("0 EVs: nothing filled", [round(evGaugeState(0, "ev").pills), evGaugeState(0, "ev").bar], [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0]);
check("10 EVs: one pill", round(evGaugeState(10, "ev").pills), [1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
check("34 EVs: three pills and four tenths", round(evGaugeState(34, "ev").pills), [1, 1, 1, 0.4, 0, 0, 0, 0, 0, 0]);
check("100 EVs: all pills, empty bar", [round(evGaugeState(100, "ev").pills), evGaugeState(100, "ev").bar], [[1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 0]);
check("101 EVs: the bar starts", Math.round(evGaugeState(101, "ev").bar * 1000) / 1000, 0.006);
check("255 EVs: full bar", evGaugeState(255, "ev").bar, 1);
check("an unreadable value counts as 0", evGaugeState(undefined, "ev").bar, 0);

// Gens 1-2: one pill is 2,560 stat experience, the pills end at 25,600, the bar runs to 65,535.
check("2,560 stat exp: one pill", round(evGaugeState(2560, "statExp").pills)[0], 1);
check("25,600 stat exp: all pills, empty bar", [round(evGaugeState(25600, "statExp").pills)[9], evGaugeState(25600, "statExp").bar], [1, 0]);
check("65,535 stat exp: full bar", evGaugeState(65535, "statExp").bar, 1);

// Colours, gens 3-5: maxed is 252; the totals 400, 490 and 510 turn the tiles yellow, red and grey.
const colour = (v: number, total?: number) => evGaugeState(v, "ev", total).colour;
check("251 EVs, low total: blue", colour(251, 300), "blue");
check("252 EVs: green", colour(252, 300), "green");
check("total 399: blue", colour(50, 399), "blue");
check("total 400: yellow", colour(50, 400), "yellow");
check("total 489: yellow", colour(50, 489), "yellow");
check("total 490: red", colour(50, 490), "red");
check("total 509: red", colour(50, 509), "red");
check("total 510: grey", colour(50, 510), "grey");
check("maxed stat at total 400 stays green", colour(252, 400), "green");
check("maxed stat at total 490 stays green", colour(255, 490), "green");
check("maxed stat at total 510 turns grey", colour(252, 510), "grey");

// Colours, gens 1-2: no total limit; maxed is 63,002, the first value that gives the last stat point.
check("63,001 stat exp: blue", evGaugeState(63001, "statExp").colour, "blue");
check("63,002 stat exp: green", evGaugeState(63002, "statExp").colour, "green");
check("stat exp ignores a total", evGaugeState(100, "statExp", 600).colour, "blue");

check("total of six EVs", evTotal([34, 112, 20, 252, 0, 6]), 424);
check("total skips unreadable values", evTotal([10, undefined, null, "x", 5]), 15);

console.log(failures ? `${failures} failed` : "all passed");
process.exit(failures ? 1 : 0);
