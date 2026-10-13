/**
 * Self-test for the gen3-5 accuracy rules (2026-10-13, `core/logic/moveAccuracy.ts`), each case
 * worked out by hand from pokeemerald `Cmd_accuracycheck` and pokeplatinum
 * `BattleControllerPlayer_CheckMoveHitAccuracy`.
 *
 *   npm run parity:accuracy
 */
import { accuracyStageIndex, gen3IsPhysicalType, moveAccuracy } from "../../src/renderer/core/logic/moveAccuracy.ts";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown): void {
    const ok = Object.is(actual, expected);
    if (!ok) failures++;
    console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${String(actual)}${ok ? "" : ` (expected ${String(expected)})`}`);
}

// One combined stage, not two ratios multiplied.
check("gen3 acc-1 eva+1 -> stage -2", moveAccuracy(3, { accuracy: 100, accuracyStage: -1, evasionStage: 1 }), 60);
check("gen3 acc+1 eva+1 -> stage 0", moveAccuracy(3, { accuracy: 95, accuracyStage: "1", evasionStage: "1" }), 95);
check("gen3 acc-3 eva+3 -> clamped -6", moveAccuracy(3, { accuracy: 100, accuracyStage: -3, evasionStage: 3 }), 33);
check("gen4 acc+2 eva-1 -> stage +3", moveAccuracy(4, { accuracy: 50, accuracyStage: 2, evasionStage: -1 }), 100);
check("gen5 enemy Double Team lowers", moveAccuracy(5, { accuracy: 100, evasionStage: 1 }), 75);
check("string accuracy", moveAccuracy(3, { accuracy: "70" }), 70);
check("dash accuracy", moveAccuracy(3, { accuracy: "-" }), null);

// Foresight: gen3 ignores the evasion stage entirely, gen4 only a raised one.
check("gen3 Foresight vs +2", accuracyStageIndex(3, { accuracyStage: 0, evasionStage: 2, targetIdentified: true }), 6);
check("gen3 Foresight vs -2", accuracyStageIndex(3, { accuracyStage: 0, evasionStage: -2, targetIdentified: true }), 6);
check("gen4 identified vs +2", accuracyStageIndex(4, { accuracyStage: 0, evasionStage: 2, targetIdentified: true }), 6);
check("gen4 identified vs -2", accuracyStageIndex(4, { accuracyStage: 0, evasionStage: -2, targetIdentified: true }), 8);
// Simple / Unaware (gen4+), and Mold Breaker ignoring the target's.
check("gen4 Simple user", accuracyStageIndex(4, { accuracyStage: 2, userAbility: "Simple" }), 10);
check("gen4 Unaware target", accuracyStageIndex(4, { accuracyStage: 2, targetAbility: "Unaware" }), 6);
check("gen4 Unaware vs Mold Breaker", accuracyStageIndex(4, { accuracyStage: 2, targetAbility: "Unaware", userAbility: "Mold Breaker" }), 8);
check("gen5 Simple: stage already doubled", accuracyStageIndex(5, { accuracyStage: 2, userAbility: "Simple" }), 8);
check("gen3 has no Simple", accuracyStageIndex(3, { accuracyStage: 2, userAbility: "SIMPLE" }), 8);

// Modifiers.
check("gen3 Compound Eyes", moveAccuracy(3, { accuracy: 70, userAbility: "COMPOUND EYES" }), 91);
check("gen3 Hustle physical", moveAccuracy(3, { accuracy: 100, userAbility: "Hustle", physical: true }), 80);
check("gen3 Hustle special", moveAccuracy(3, { accuracy: 100, userAbility: "Hustle", physical: false }), 100);
check("gen3 Sand Veil in sand", moveAccuracy(3, { accuracy: 100, targetAbility: "SAND VEIL", weather: "Sandstorm" }), 80);
check("gen3 Sand Veil, Cloud Nine", moveAccuracy(3, { accuracy: 100, targetAbility: "SAND VEIL", weather: "Sandstorm", weatherSuppressed: true }), 100);
check("gen3 Lax Incense 5", moveAccuracy(3, { accuracy: 100, targetItem: "LAX INCENSE" }), 95);
check("gen4 Lax Incense 10", moveAccuracy(4, { accuracy: 100, targetItem: "Lax Incense" }), 90);
check("gen4 Snow Cloak in hail", moveAccuracy(4, { accuracy: 90, targetAbility: "Snow Cloak", weather: "Hail" }), 72);
check("gen4 Snow Cloak, Mold Breaker", moveAccuracy(4, { accuracy: 90, targetAbility: "Snow Cloak", weather: "Hail", userAbility: "Mold Breaker" }), 90);
check("gen4 Thunder in sun", moveAccuracy(4, { accuracy: 70, thunder: true, weather: "Sun" }), 50);
check("gen4 Zoom Lens, target moved", moveAccuracy(4, { accuracy: 70, userItem: "Zoom Lens", targetMovedFirst: true }), 84);
check("gen4 Zoom Lens, we move first", moveAccuracy(4, { accuracy: 70, userItem: "Zoom Lens", targetMovedFirst: false }), 70);
check("gen4 Gravity", moveAccuracy(4, { accuracy: 50, gravity: true }), 83);
check("gen4 fog", moveAccuracy(4, { accuracy: 100, fog: true }), 60);
check("gen4 Tangled Feet confused", moveAccuracy(4, { accuracy: 100, targetAbility: "Tangled Feet", targetConfused: true }), 50);
check("gen5 Compound Eyes", moveAccuracy(5, { accuracy: 70, userAbility: "Compound Eyes" }), 91);
check("gen5 Wide Lens", moveAccuracy(5, { accuracy: 90, userItem: "Wide Lens" }), 98);
check("gen5 Victory Star", moveAccuracy(5, { accuracy: 90, userAbility: "Victory Star" }), 99);
check("gen5 cap", moveAccuracy(5, { accuracy: 100, userItem: "Wide Lens" }), 100);

// Physical by type in gen3.
check("gen3 Ghost is physical", gen3IsPhysicalType("Ghost"), true);
check("gen3 Dark is special", gen3IsPhysicalType("DARK"), false);

if (failures) {
    console.log(`\n${failures} failure(s)`);
    process.exit(1);
}
console.log("\nall accuracy rules ok");
