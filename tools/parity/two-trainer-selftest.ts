/**
 * core/logic/twoTrainerBattle.ts against values read from real game memory (ARCHITECTURE.md §4, "Two-trainer battles").
 *
 *   npm run parity:two-trainer
 */
import assert from "node:assert/strict";
import { isTwoTrainerBattle, MAX_ENEMY_ROWS, secondTeamRows, twoTrainerHeader, twoTrainerHeaderStyle } from "../../src/renderer/core/logic/twoTrainerBattle";

// Platinum, Spear Pillar: Mars 528, Jupiter 407. HeartGold, Rocket Hideout: Ariana 479, Grunt 499.
assert.equal(isTwoTrainerBattle(528, 407), true);
assert.equal(isTwoTrainerBattle(479, 499), true);
// HeartGold, Clair: no second trainer.
assert.equal(isTwoTrainerBattle(35, 0), false);
// One trainer's id twice is that trainer's double battle (pokeplatinum Encounter_NewVsTrainer).
assert.equal(isTwoTrainerBattle(528, 528), false);
// A wild battle, and mapper properties with no value.
assert.equal(isTwoTrainerBattle(0, 407), false);
assert.equal(isTwoTrainerBattle(null, undefined), false);

assert.equal(secondTeamRows(3, 3), 3);
assert.equal(secondTeamRows(3, 2), 2);
assert.equal(secondTeamRows(4, 6), MAX_ENEMY_ROWS - 4);
assert.equal(secondTeamRows(6, 3), 0);
assert.equal(secondTeamRows(undefined, null), 0);

assert.equal(twoTrainerHeader("Commander Mars", "Commander Jupiter"), "Mars and Jupiter");
assert.equal(twoTrainerHeader("Executive Ariana", "Team Rocket Grunt"), "Ariana and Team Rocket Grunt");

assert.equal(twoTrainerHeaderStyle("Mars and Jupiter", 26, 24), undefined);
assert.equal(twoTrainerHeaderStyle("Ariana and Team Rocket Grunt", 26, 24), "font-size: 22px; white-space: nowrap;");

console.log("two-trainer selftest: ok");
