/**
 * Self-test for the shared move-power rules (2026-10-13, `core/logic/movePower.ts`), each case
 * worked out by hand from the decompilation the module cites.
 *
 *   npm run parity:move-power
 */
import {
    electroBallPower,
    flailReversalPower,
    gyroBallPower,
    heavySlamPower,
    punishmentPower,
    storedPowerPower,
    trumpCardPower,
    wringOutPower,
} from "../../src/renderer/core/logic/movePower.ts";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown): void {
    const ok = Object.is(actual, expected);
    if (!ok) failures++;
    console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${String(actual)}${ok ? "" : ` (expected ${String(expected)})`}`);
}

// Gen 4: pixels of a 64-pixel bar.
check("gen4 full", flailReversalPower(4, 100, 100), 20);
check("gen4 66% -> 42px", flailReversalPower(4, 66, 100), 40);
check("gen4 68% -> 43px (old code: nothing)", flailReversalPower(4, 68, 100), 20);
check("gen4 18.75% -> 12px", flailReversalPower(4, 75, 400), 100);
check("gen4 5% -> 3px (old overworld code: nothing)", flailReversalPower(4, 5, 100), 150);
check("gen4 1 HP -> 1px", flailReversalPower(4, 1, 400), 200);

// Gen 3 / 5: 48ths, at least 1.
check("gen3 full", flailReversalPower(3, "100", "100"), 20);
check("gen3 2% -> 0 -> 1", flailReversalPower(3, 2, 100), 200);
check("gen3 5% -> 2", flailReversalPower(3, 5, 100), 150);
check("gen3 17/48 -> 17", flailReversalPower(3, 17, 48), 40);
check("gen5 16/48 -> 16", flailReversalPower(5, 16, 48), 80);

// Gen 2: both divided by 4 above 255 max HP.
check("gen2 small max", flailReversalPower(2, 16, 48), 80);
check("gen2 300 max, 100 hp -> 1200/75 = 16", flailReversalPower(2, 100, 300), 80);
check("gen2 0 hp", flailReversalPower(2, 0, 100), 200);

check("unreadable", flailReversalPower(4, undefined, 100), null);
check("zero max", flailReversalPower(4, 0, 0), null);

// Gyro Ball: 1 + floor(25 * target / user), max 150.
check("gyro equal", gyroBallPower(100, 100), 26);
check("gyro 50 vs 101", gyroBallPower(50, 101), 51);
check("gyro cap", gyroBallPower(10, 400), 150);
check("gyro zero user", gyroBallPower(0, 100), null);

// Wring Out / Crush Grip.
check("wring out gen4 full", wringOutPower(4, 100, 100), 121);
check("wring out gen4 1hp", wringOutPower(4, 1, 300), 1);
check("wring out gen5 full", wringOutPower(5, 100, 100), 120);
check("wring out gen5 1hp", wringOutPower(5, 1, 300), 1);

// Trump Card: PP after paying for this use.
check("trump 0", trumpCardPower(0), 200);
check("trump 3", trumpCardPower(3), 50);
check("trump 9", trumpCardPower(9), 40);

// Punishment / Stored Power.
check("punishment none", punishmentPower([0, -2, 0]), 60);
check("punishment +2 +1", punishmentPower([2, 1, -1]), 120);
check("punishment cap", punishmentPower([6, 6, 6]), 200);
check("punishment 0..12 scale", punishmentPower([8, 6, 5], 6), 100);
check("stored power +3", storedPowerPower([1, 2, 0, -1]), 80);

// Electro Ball / Heavy Slam ratios.
check("electro 2x", electroBallPower(200, 100), 80);
check("electro slower", electroBallPower(99, 100), 40);
check("electro 4x", electroBallPower(400, 100), 150);
check("heavy slam 0.3/0.1", heavySlamPower(0.3, 0.1), 80);
check("heavy slam 5x", heavySlamPower(500, 100), 120);
check("heavy slam lighter", heavySlamPower(10, 100), 40);

if (failures) {
    console.log(`\n${failures} failure(s)`);
    process.exit(1);
}
console.log("\nall move-power rules ok");
