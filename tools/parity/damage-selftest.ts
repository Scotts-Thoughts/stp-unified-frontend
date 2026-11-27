/**
 * Self-test for the overlay's damage glue (src/renderer/core/damage/calc.ts): name lookups across every game's
 * data, inputs reaching the engine unchanged, and the texts the move list and enemy panel show. The engine's own
 * formulas are tested in its repo (damage-calc/, `npm test`); this checks only what the overlay adds.
 *
 *   npm run parity:damage
 */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { findMove, findSpecies, moveDamages, toStatus, toWeather, type DamageGameData, type MonInput } from "../../src/renderer/core/damage/calc";

const DATA_DIR = join(process.cwd(), "src/renderer/core/damage/data");
const load = (slug: string): DamageGameData => JSON.parse(readFileSync(join(DATA_DIR, `${slug}.json`), "utf8"));

let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`);
}

// ── Every game's file loads, and the frontend's old spellings find their move ─────────────────────────────────
for (const file of readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"))) {
    const data = load(file.replace(/\.json$/, ""));
    const old = data.gen === 1 ? ["ThunderPunch", "Hi Jump Kick", "Selfdestruct", "Vicegrip", "Sand-Attack"]
        : data.gen === 2 ? ["Faint Attack", "DynamicPunch", "ExtremeSpeed"]
        : data.gen === 3 ? ["SmellingSalt", "Faint Attack", "SolarBeam"]
        : data.gen === 4 ? ["Faint Attack", "ThunderPunch", "Hi Jump Kick"]
        : ["Feint Attack", "Thunder Punch", "High Jump Kick"];
    check(`${file}: old spellings`, old.map((m) => findMove(data, m)?.move ?? null).every(Boolean), true);
    check(`${file}: Nidoran♀ / Nidoran F`, [findSpecies(data, "Nidoran♀"), findSpecies(data, "Nidoran F")].every(Boolean), true);
}
const plat = load("platinum");
check("Wormadam (Sandy Cloak) is the Sandy form", findSpecies(plat, "Wormadam (Sandy Cloak)")?.types, ["Bug", "Ground"]);
check("Giratina (Altered) falls back to Giratina", findSpecies(plat, "Giratina (Altered)")?.types, ["Ghost", "Dragon"]);

// ── Parsers ───────────────────────────────────────────────────────────────────────────────────────────────────
check("status spellings", ["Burned", "PAR", "Badly Poisoned", "Poisoned", "Asleep", "Frozen", "None", null].map(toStatus),
    ["burn", "paralysis", "toxic", "poison", "sleep", "freeze", "none", "none"]);
check("weather spellings", ["Rain", "Harsh Sunlight", "Sandstorm", "Hail", "Clear", undefined].map(toWeather),
    ["rain", "sun", "sand", "hail", "none", "none"]);

// ── A hand-computed gen 3 hit (pokefirered CalculateBaseDamage) ─────────────────────────────────────────────────
// L10, Atk 20, Tackle 35 (no STAB) vs Def 15, neutral: floor(floor(2*10/5+2) * 35 * 20 / 15 / 50) + 2 = 7,
// then the 85..100% roll: 5 (85), 6 (86-99), 7 (100). Weedle (Bug/Poison) has no STAB on Tackle, and Normal is
// neutral on Spearow (Normal/Flying).
const frlg = load("firered-leafgreen");
const stats = (hp: number, attack: number, defense: number) => ({ hp, attack, defense, spattack: 10, spdefense: 10, speed: 10 });
const weedle: MonInput = { isPlayer: true, species: "Weedle", level: 10, stats: stats(30, 20, 15) };
const spearow: MonInput = { isPlayer: false, species: "Spearow", level: 10, stats: stats(20, 15, 15) };
const field = { game: "FireRed and LeafGreen", gen: 3 as const };
const [tackle, stringShot, nothing] = moveDamages(frlg, field, weedle, spearow, ["Tackle", "String Shot", null]);
check("gen 3 Tackle HP range", tackle?.hp, "5–7");
check("gen 3 Tackle percent of 20 HP", tackle?.pct, "25–35%");
check("gen 3 Tackle KO from 20 HP: 3HKO is only 1% (two top rolls), so 4HKO", tackle?.ko, "4HKO");
check("status move shows a dash", [stringShot?.hp, stringShot?.pct, stringShot?.ko], ["—", "—", ""]);
check("empty slot is null", nothing, null);

// A held Oran Berry heals 10 at half HP, so the same hits take longer.
const [withOran] = moveDamages(frlg, field, weedle, { ...spearow, item: "Oran Berry" }, ["Tackle"]);
check("Oran Berry delays the KO", withOran?.ko, "5HKO 78%");
// From 7 HP left only the top roll (1 in 16) finishes it in one, under the 10% shown; two always do.
const [lowHp] = moveDamages(frlg, field, weedle, { ...spearow, hp: 7 }, ["Tackle"]);
check("KO counts from current HP", lowHp?.ko, "2HKO");
const [lowHp2] = moveDamages(frlg, field, weedle, { ...spearow, hp: 6 }, ["Tackle"]);
check("a likely OHKO shows its chance", lowHp2?.ko, "OHKO 94%");

// Gen 1 keeps one Special: the attacker's Special is used for both, and Special-type moves read it.
const yellow = load("yellow");
const g1 = (species: string, special: number): MonInput => ({ isPlayer: species === "Pikachu", species, level: 20, stats: { hp: 50, attack: 30, defense: 30, spattack: special, spdefense: 999, speed: 30 } });
const [shock] = moveDamages(yellow, { game: "Yellow", gen: 1 }, g1("Pikachu", 40), g1("Pidgey", 40), ["ThunderShock"]);
const [shock2] = moveDamages(yellow, { game: "Yellow", gen: 1 }, g1("Pikachu", 40), g1("Pidgey", 80), ["ThunderShock"]);
check("gen 1 Special defends with the Special stat", shock?.hp !== shock2?.hp, true);
const immune = moveDamages(yellow, { game: "Yellow", gen: 1 }, g1("Pikachu", 40), g1("Geodude", 40), ["ThunderShock"])[0];
check("immunity: 0% in the move list, Immune in the enemy panel", [immune?.pct, immune?.short], ["0%", "Immune"]);

if (failed) {
    console.log(`\n${failed} failed`);
    process.exit(1);
}
console.log("\nall passed");
