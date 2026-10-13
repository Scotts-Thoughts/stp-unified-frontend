/**
 * Self-test for the gen4/gen5 turn-order Speed rules (2026-10-13, `core/logic/battleSpeed.ts`),
 * each case worked out by hand from pokeplatinum `BattleSystem_CompareBattlerSpeed`.
 *
 *   npm run parity:speed
 */
import { gen45TurnOrder, gen45TurnOrderSpeed } from "../../src/renderer/core/logic/battleSpeed.ts";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown): void {
    const ok = Object.is(actual, expected);
    if (!ok) failures++;
    console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${String(actual)}${ok ? "" : ` (expected ${String(expected)})`}`);
}

// Stages: 10/40 .. 40/10, integer division; strings from the mapper are accepted.
check("plain", gen45TurnOrderSpeed(4, { speed: 101 }), 101);
check("+1", gen45TurnOrderSpeed(4, { speed: 101, stage: 1 }), 151);
check("-1", gen45TurnOrderSpeed(4, { speed: 101, stage: "-1" }), 67); // 1010/15
check("-5 is 10/35", gen45TurnOrderSpeed(4, { speed: 100, stage: -5 }), 28);
check("Simple doubles, clamped", gen45TurnOrderSpeed(4, { speed: 100, stage: 4, ability: "Simple" }), 400);
check("gen5 Simple: stage already doubled", gen45TurnOrderSpeed(5, { speed: 100, stage: 4, ability: "Simple" }), 300);

// Weather abilities, and Cloud Nine switching them off; Sand Rush only in gen5.
check("Swift Swim rain", gen45TurnOrderSpeed(4, { speed: 80, ability: "Swift Swim", weather: "Rain" }), 160);
check("Swift Swim, Cloud Nine", gen45TurnOrderSpeed(4, { speed: 80, ability: "Swift Swim", weather: "Rain", weatherSuppressed: true }), 80);
check("Sand Rush gen4", gen45TurnOrderSpeed(4, { speed: 80, ability: "Sand Rush", weather: "Sandstorm" }), 80);
check("Sand Rush gen5", gen45TurnOrderSpeed(5, { speed: 80, ability: "Sand Rush", weather: "Sandstorm" }), 160);

// Items.
check("Iron Ball", gen45TurnOrderSpeed(4, { speed: 81, item: "Iron Ball" }), 40);
check("Power Anklet", gen45TurnOrderSpeed(4, { speed: 81, item: "Power Anklet" }), 40);
check("Choice Scarf", gen45TurnOrderSpeed(4, { speed: 81, item: "Choice Scarf" }), 121);
check("Choice Scarf, Klutz", gen45TurnOrderSpeed(4, { speed: 81, item: "Choice Scarf", ability: "Klutz" }), 81);
check("Macho Brace, Klutz still halves", gen45TurnOrderSpeed(4, { speed: 81, item: "Macho Brace", ability: "Klutz" }), 40);
check("Quick Powder Ditto", gen45TurnOrderSpeed(4, { speed: 48, item: "Quick Powder", species: "Ditto" }), 96);
check("Quick Powder not Ditto", gen45TurnOrderSpeed(4, { speed: 48, item: "Quick Powder", species: "Mew" }), 48);

// Status, Slow Start, Unburden, Tailwind.
check("paralysis", gen45TurnOrderSpeed(4, { speed: 99, status: "Paralyzed" }), 24);
check("Quick Feet paralysed", gen45TurnOrderSpeed(4, { speed: 99, status: "Paralyzed", ability: "Quick Feet" }), 148);
check("Quick Feet asleep", gen45TurnOrderSpeed(4, { speed: 99, status: "Asleep", ability: "Quick Feet" }), 148);
check("Slow Start", gen45TurnOrderSpeed(4, { speed: 99, ability: "Slow Start" }), 49);
check("Slow Start over", gen45TurnOrderSpeed(4, { speed: 99, ability: "Slow Start", slowStartActive: false }), 99);
check("Unburden, item gone", gen45TurnOrderSpeed(4, { speed: 90, ability: "Unburden", canUnburden: true, item: null }), 180);
check("Unburden, still holding", gen45TurnOrderSpeed(4, { speed: 90, ability: "Unburden", canUnburden: true, item: "Sitrus Berry" }), 90);
check("Unburden, never held one", gen45TurnOrderSpeed(4, { speed: 90, ability: "Unburden", canUnburden: false, item: null }), 90);
check("Tailwind", gen45TurnOrderSpeed(4, { speed: 90, tailwind: true }), 180);
// Order: stage, weather, item, Scarf, status -- each floored in turn.
check("chain", gen45TurnOrderSpeed(4, { speed: 75, stage: 1, ability: "Chlorophyll", weather: "Sun", item: "Choice Scarf", status: "Paralyzed" }), 84); // 112 -> 224 -> 336 -> 84

// Turn order.
check("faster", gen45TurnOrder({ speed: 100 }, { speed: 99 }, false), 1);
check("tie", gen45TurnOrder({ speed: 100 }, { speed: 100 }, false), 0);
check("Trick Room", gen45TurnOrder({ speed: 100 }, { speed: 99 }, true), -1);
check("Lagging Tail beats Trick Room", gen45TurnOrder({ speed: 10 }, { speed: 99, item: "Lagging Tail" }, true), 1);
check("Lagging Tail, Klutz", gen45TurnOrder({ speed: 100, item: "Lagging Tail", ability: "Klutz" }, { speed: 99 }, false), 1);
check("Stall", gen45TurnOrder({ speed: 300, ability: "Stall" }, { speed: 99 }, false), -1);
check("both Stall: slower first", gen45TurnOrder({ speed: 50, ability: "Stall" }, { speed: 99, ability: "Stall" }, false), 1);

if (failures) {
    console.log(`\n${failures} failure(s)`);
    process.exit(1);
}
console.log("\nall turn-order speed rules ok");
