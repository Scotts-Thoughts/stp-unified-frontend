/**
 * Self-test for the trainer send-out order rules (2026-10-15, `core/logic/sendOutOrder.ts`), each case worked out by
 * hand from the decompilation the module cites (docs/send-out-order.md).
 *
 *   npm run parity:send-order
 */
import { gen4TypeMatchupMultiplier, orderSlots, predictGen2, predictGen3, predictGen4, predictGen5, SendOutOrderCache, type SendOutMon, type SendOutMove, type SendOutPlayer } from "../../src/renderer/core/logic/sendOutOrder.ts";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown): void {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    const ok = a === e;
    if (!ok) failures++;
    console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${a}${ok ? "" : ` (expected ${e})`}`);
}

const mv = (name: string, type: string, power: number, category: SendOutMove["category"] = power ? "Physical" : "Status"): SendOutMove => ({ name, type, power, category });
const mon = (species: string, t1: string, t2: string, moves: SendOutMove[], extra: Partial<SendOutMon> = {}): SendOutMon => ({ species, types: [t1, t2], moves, ...extra });

// ---- Gen 2: Crystal Red vs Sunflora (pokecrystal data/trainers/parties.asm). Seen in a run:
// Pikachu, Venusaur, Charizard, Espeon, Snorlax, Blastoise.
const red: SendOutMon[] = [
    mon("Pikachu", "Electric", "Electric", [mv("Charm", "Normal", 0), mv("Quick Attack", "Normal", 40), mv("Thunderbolt", "Electric", 95), mv("Thunder", "Electric", 120)]),
    mon("Espeon", "Psychic", "Psychic", [mv("Mud-Slap", "Ground", 20), mv("Reflect", "Psychic", 0), mv("Swift", "Normal", 60), mv("Psychic", "Psychic", 90)]),
    mon("Snorlax", "Normal", "Normal", [mv("Amnesia", "Psychic", 0), mv("Snore", "Normal", 40), mv("Rest", "Psychic", 0), mv("Body Slam", "Normal", 85)]),
    mon("Venusaur", "Grass", "Poison", [mv("Sunny Day", "Fire", 0), mv("Giga Drain", "Grass", 60), mv("Synthesis", "Grass", 0), mv("Solarbeam", "Grass", 120)]),
    mon("Charizard", "Fire", "Flying", [mv("Flamethrower", "Fire", 95), mv("Wing Attack", "Flying", 60), mv("Slash", "Normal", 70), mv("Fire Spin", "Fire", 15)]),
    mon("Blastoise", "Water", "Water", [mv("Rain Dance", "Water", 0), mv("Surf", "Water", 95), mv("Blizzard", "Ice", 120), mv("Whirlpool", "Water", 15)]),
];
const sunflora: SendOutPlayer = { species: "Sunflora", types: ["Grass", "Grass"] };
check("gen2 Red vs Sunflora", predictGen2(red, sunflora).map((i) => red[i].species),
    ["Pikachu", "Venusaur", "Charizard", "Espeon", "Snorlax", "Blastoise"]);
// Every candidate bad (weak to the player, no super-effective move): random in the game, party order here.
const allBad = [mon("A", "Normal", "Normal", []), mon("B", "Fire", "Fire", [mv("Ember", "Fire", 40)]), mon("C", "Fire", "Fire", [mv("Ember", "Fire", 40)])];
check("gen2 all bad keeps party order", predictGen2(allBad, { species: "Squirtle", types: ["Water", "Water"] }), [0, 1, 2]);

// ---- Gen 3, pass 1: the candidate the player's types hit HARDEST, if it has a super-effective damaging move.
const g3player: SendOutPlayer = { species: "Marshtomp", types: ["Water", "Ground"], defense: 60, specialDefense: 50 };
const g3party: SendOutMon[] = [
    mon("Lead", "Normal", "Normal", [mv("Tackle", "Normal", 35)], { level: 20, attack: 40, specialAttack: 40 }),
    mon("Neutral", "Normal", "Normal", [mv("Tackle", "Normal", 35)], { level: 20, attack: 40, specialAttack: 40 }),
    // Water and Ground both hit Rock/Fire: 10 -> 20 -> 40 (Water), -> 80 -> 160 (Ground); has Grass (SE on Ground/Water x4)
    mon("Weak+SE", "Rock", "Fire", [mv("Absorb", "Grass", 20, "Special")], { level: 20, attack: 40, specialAttack: 40 }),
    // Weak too but only a Status Grass move: power 0 never counts as super effective.
    mon("Weak+status", "Fire", "Fire", [mv("Stun Spore", "Grass", 0)], { level: 20, attack: 40, specialAttack: 40 }),
];
// Then nobody qualifies: pass 2 with D = 3, where a status move still scores (Stun Spore: 3 x2 x2 = 12 beats Tackle 3).
check("gen3 pass 1 picks the weakest with an SE move", predictGen3(g3party, g3player), [0, 2, 3, 1]);
// Levitate blocks a Ground move from being super effective in pass 1.
const g3lev: SendOutPlayer = { species: "Lunatone", types: ["Rock", "Psychic"], ability: "Levitate", defense: 50, specialDefense: 50 };
const levParty: SendOutMon[] = [
    mon("Lead", "Normal", "Normal", [mv("Tackle", "Normal", 35)], { level: 20, attack: 30, specialAttack: 30 }),
    mon("Digger", "Ground", "Ground", [mv("Dig", "Ground", 60)], { level: 20, attack: 30, specialAttack: 30 }),
    mon("Biter", "Dark", "Dark", [mv("Bite", "Dark", 60)], { level: 20, attack: 30, specialAttack: 30 }),
];
check("gen3 Levitate: no SE Ground, pass 2 leaves Dig unscaled", predictGen3(levParty, g3lev), [0, 2, 1]);
// Pass 2, nothing qualifies: damage = D x the candidate move's chart; STAB from the FAINTED mon's types.
// D = 3 with no KO move (Emerald end-of-turn faint). Lead is Water: Water Gun gets STAB (3 -> 4), Tackle stays 3.
const p2player: SendOutPlayer = { species: "Snorlax", types: ["Normal", "Normal"], defense: 65, specialDefense: 110 };
const p2party: SendOutMon[] = [
    mon("Lead", "Water", "Water", [mv("Water Gun", "Water", 40)], { level: 30, attack: 50, specialAttack: 50 }),
    mon("Tackler", "Normal", "Normal", [mv("Tackle", "Normal", 35)], { level: 30, attack: 50, specialAttack: 50 }),
    mon("Gunner", "Normal", "Normal", [mv("Water Gun", "Water", 40)], { level: 30, attack: 50, specialAttack: 50 }),
];
check("gen3 pass 2 STAB from the fainted mon", predictGen3(p2party, p2player), [0, 2, 1]);

// ---- Gen 4: Stage 1 is the candidate's own types attacking the player, summed in a byte.
check("gen4 TM neutral", gen4TypeMatchupMultiplier("Normal", "Water", "Water"), 40);
check("gen4 TM x4", gen4TypeMatchupMultiplier("Electric", "Water", "Flying"), 160);
check("gen4 TM immune", gen4TypeMatchupMultiplier("Normal", "Ghost", "Ghost"), 0);
const g4player: SendOutPlayer = { species: "Gyarados", types: ["Water", "Flying"], defense: 79, specialDefense: 100 };
const g4party: SendOutMon[] = [
    mon("Lead", "Normal", "Normal", [mv("Tackle", "Normal", 35)], { level: 30, attack: 50, specialAttack: 50 }),
    // Electric/Electric: 160 + 160 = 320 -> byte 64. Has Thunder Wave (status counts in stage 1).
    mon("Pikachu", "Electric", "Electric", [mv("Thunder Wave", "Electric", 0)], { level: 30, attack: 50, specialAttack: 50 }),
    // Rock/Ground: Rock 80 (x2 on Flying) + Ground 0 (Flying immune) = 80, Rock Throw SE.
    mon("Geodude", "Rock", "Ground", [mv("Rock Throw", "Rock", 50)], { level: 30, attack: 50, specialAttack: 50 }),
    mon("Grass", "Grass", "Grass", [mv("Vine Whip", "Grass", 35, "Physical")], { level: 30, attack: 50, specialAttack: 50 }),
];
// Byte overflow: Geodude (80) outranks Pikachu (64); Grass is 40+40=80 but later in the party and Vine Whip isn't SE.
check("gen4 stage 1 byte overflow", predictGen4(g4party, g4player), [0, 2, 1, 3]);

// Stage 2 byte overflow: Lv50 Atk 400 vs Def 100. Mega Kick 120: 400*120*22/100/50 = 211, +2 = 213, STAB 319 -> 63.
// Tackle 35: 61 + 2 = 63, STAB 94. The weaker move's Pokémon wins.
const strong = { level: 50, attack: 400, specialAttack: 400 };
check("gen4 stage 2 byte overflow", predictGen4([
    mon("Lead", "Normal", "Normal", [mv("Tackle", "Normal", 35)], strong),
    mon("Kicker", "Normal", "Normal", [mv("Mega Kick", "Normal", 120)], strong),
    mon("Tackler", "Normal", "Normal", [mv("Tackle", "Normal", 35)], strong),
], { species: "Snorlax", types: ["Normal", "Normal"], defense: 100, specialDefense: 100 }), [0, 2, 1]);

// ---- Gen 5: best move power x chart, sorted by the swap loop; a switch-in swaps battle positions.
const g5player: SendOutPlayer = { species: "Tepig", types: ["Fire", "Fire"] };
const g5party: SendOutMon[] = [
    mon("Lead", "Normal", "Normal", [mv("Tackle", "Normal", 50)]),
    mon("A", "Normal", "Normal", [mv("Pound", "Normal", 50)]),
    mon("B", "Normal", "Normal", [mv("Scratch", "Normal", 60)]),
    mon("C", "Normal", "Normal", [mv("Cut", "Normal", 60)]),
    mon("D", "Water", "Water", [mv("Water Gun", "Water", 40, "Special")]), // 80
];
// Round 1: positions 1-4 = A50 B60 C60 D80 -> D. Swap: [D, A, B, C, Lead].
// Round 2: A50 B60 C60 -> i=0: A<B swap (B,A,C), A<C swap (B,C,A); i=1: C vs A no -> B. Swap: [B, A, D, C, Lead].
// Round 3: A50 C60 -> C. Round 4: A.
check("gen5 swap sort and positions", predictGen5(g5party, g5player).map((i) => g5party[i].species), ["Lead", "D", "B", "C", "A"]);
check("gen5 status ignored, low power = 60", predictGen5([
    mon("Lead", "Normal", "Normal", []),
    mon("Status", "Water", "Water", [mv("Rain Dance", "Water", 0)]),
    mon("Toss", "Fighting", "Fighting", [mv("Seismic Toss", "Fighting", 0, "Physical")]),
], g5player), [0, 2, 1]);

// ---- Plumbing.
const slots = [0, 1, 2, 3].map((slot) => ({ slot, name: "s" + slot }));
check("orderSlots", orderSlots(slots, [0, 2, 1]).map((s) => [s.slot, s.row]), [[0, 0], [2, 1], [1, 2], [3, 3]]);
check("orderSlots no order", orderSlots(slots, null).map((s) => s.row), [0, 1, 2, 3]);
const cache = new SendOutOrderCache();
let computed = 0;
const team = [mon("A", "Normal", "Normal", []), mon("B", "Fire", "Fire", []), mon("C", "Water", "Water", [])];
cache.get(team, "p", () => (computed++, [0, 2, 1]));
check("cache keeps an order per team", [cache.get(team, "p", () => (computed++, [0, 1, 2])), computed], [[0, 2, 1], 1]);
check("cache follows the Pokémon if the list reorders", cache.get([team[1], team[0], team[2]], "p", () => [9]), [1, 2, 0]);
check("cache recomputes for another player", cache.get(team, "q", () => [2, 1, 0]), [2, 1, 0]);

console.log(failures ? `\n${failures} failure(s)` : "\nall passed");
process.exit(failures ? 1 : 0);
