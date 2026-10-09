/**
 * Self-test for the one-hit KO accuracy rules (2026-10-02, `core/logic/ohkoAccuracy.ts`),
 * each case worked out by hand from the decompilation the module cites.
 *
 *   npm run parity:ohko
 */
import { gen1OhkoFails, gen2OhkoAccuracy, gen3OhkoAccuracy, gen45OhkoAccuracy, isOhkoMove } from "../../src/renderer/core/logic/ohkoAccuracy.ts";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown): void {
    const ok = Object.is(actual, expected);
    if (!ok) failures++;
    console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${String(actual)}${ok ? "" : ` (expected ${String(expected)})`}`);
}

// Names, in every overlay's spelling.
check("HORN DRILL", isOhkoMove("HORN DRILL"), true);
check("Sheer Cold", isOhkoMove("Sheer Cold"), true);
check("horn_drill", isOhkoMove("horn_drill"), true);
check("FISSURE", isOhkoMove("FISSURE"), true);
check("Guillotine", isOhkoMove("Guillotine"), true);
check("Drill Peck", isOhkoMove("Drill Peck"), false);
check("null", isOhkoMove(null), false);

// Gen 1: a speed check before the ordinary accuracy test; a tie hits.
check("gen1 slower", gen1OhkoFails(50, 51), true);
check("gen1 tie", gen1OhkoFails(51, 51), false);
check("gen1 faster", gen1OhkoFails(52, 51), false);
check("gen1 unreadable", gen1OhkoFails(undefined, 51), false);

// Gen 2: 30% is 76/255; +2 per level on that scale, capped at 255.
check("gen2 lower level", gen2OhkoAccuracy(30, 20, 21), 0);
check("gen2 equal", gen2OhkoAccuracy(30, 20, 20), 30);
check("gen2 +10 floored", Math.floor(gen2OhkoAccuracy(30, 30, 20)!), 37); // 96/255 = 37.6%
check("gen2 cap", Math.min(100, Math.floor(gen2OhkoAccuracy(30, 100, 2)!)), 100); // 76 + 196 -> 255
check("gen2 unreadable", gen2OhkoAccuracy(30, undefined, 20), null);

// Gen 3: Random() % 100 + 1 < chance -- one fewer than the chance; Sturdy blocks.
check("gen3 equal", gen3OhkoAccuracy("30", 20, 20, "BLAZE"), 29);
check("gen3 +10", gen3OhkoAccuracy(30, 30, 20, null), 39);
check("gen3 lower level", gen3OhkoAccuracy(30, 19, 20, null), 0);
check("gen3 Sturdy", gen3OhkoAccuracy(30, 50, 20, "STURDY"), 0);
check("gen3 cap", gen3OhkoAccuracy(30, 100, 2, null), 100);
check("gen3 unreadable", gen3OhkoAccuracy("—", 20, 20, null), null);

// Gens 4-5: Random() % 100 < chance; Mold Breaker (and gen 5's Teravolt/Turboblaze) ignore Sturdy; No Guard always hits.
check("gen4 equal", gen45OhkoAccuracy(4, 30, 20, 20, "Blaze", "Overgrow"), 30);
check("gen4 +15", gen45OhkoAccuracy(4, 30, 35, 20, null, null), 45);
check("gen4 lower level", gen45OhkoAccuracy(4, 30, 19, 20, null, null), 0);
check("gen4 Sturdy", gen45OhkoAccuracy(4, 30, 50, 20, "Blaze", "Sturdy"), 0);
check("gen4 Mold Breaker", gen45OhkoAccuracy(4, 30, 50, 20, "Mold Breaker", "Sturdy"), 60);
check("gen4 Teravolt (no such ability)", gen45OhkoAccuracy(4, 30, 50, 20, "Teravolt", "Sturdy"), 0);
check("gen5 Teravolt", gen45OhkoAccuracy(5, 30, 50, 20, "Teravolt", "Sturdy"), 60);
check("gen4 No Guard", gen45OhkoAccuracy(4, 30, 20, 20, "No Guard", null), 100);
check("gen4 No Guard target", gen45OhkoAccuracy(4, 30, 20, 20, null, "No Guard"), 100);
check("gen4 No Guard lower level", gen45OhkoAccuracy(4, 30, 19, 20, "No Guard", null), 0);
check("gen5 cap", gen45OhkoAccuracy(5, 30, 100, 2, null, null), 100);

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
