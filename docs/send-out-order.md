# Enemy send-out order

Status: **built 2026-10-15** in gens 2-5 (gen1 needs nothing: its order is party order). The rules are
`src/renderer/core/logic/sendOutOrder.ts` (self-test `npm run parity:send-order`), the chart they walk
`core/logic/typeMatchups.ts`. §1 is the reference for the games' rules; §2-§3 describe what was built.

Goal: in a trainer battle, the enemy team panel lists the trainer's Pokémon in the order the game's AI will send
them out against the player's solo Pokémon, instead of party order. Example: Crystal, Red vs Sunflora →
Pikachu, Venusaur, Charizard, Espeon, Snorlax, Blastoise.

## 1. What the games actually do (from the decompilations)

Every generation leads with **party slot 0**. The rules below are only about the *replacement after an enemy
Pokémon faints*. None of the STP ROM forks change them: stp-pokered, stp-pokeyellow, stp-pokecrystal,
stp-pokegold, stp-pokeemerald, stp-pokefirered, stp-pokeplatinum, stp-pokeheartgold and stp-pokeheartgold-dagron
were all diffed against vanilla.

### Gen 1 (pokered `engine/battle/core.asm:1322-1341`)
- The next Pokémon is the first living one in party order. It never looks at the player.
- **Party order already is the send-out order**, so gen1 needs no change.
- Voluntary switches happen only for Jugglers, Cooltrainer♀ and Agatha. They are random, and the incoming
  Pokémon is again the first living one.

### Gen 2 (pokecrystal `engine/battle/core.asm:3240-3423`, `FindMonInOTPartyToSwitchIntoBattle`)
For each living candidate other than the current one:
- **good**: one of its moves' *types* is super effective (a multiplier above 1×) against the player's current
  types (`wBattleMonType1/2`). Power is ignored, so Sunny Day counts as Fire and Thunder Wave as Electric.
- **bad**: the player's type 1, or failing that type 2, is super effective against the candidate's species
  types. Good and bad together cancel to neutral.

The pick is the lowest slot that is good; otherwise the lowest slot that is not bad. If every candidate is bad,
the pick is **random**: `BattleRandom & 7`, and Gold uses `< 6` instead of `< party count`.

The player's moves, stats, stat stages and HP play no part. Worked example, Red vs Sunflora:
- Venusaur is good (Sunny Day) and Charizard is good.
- Blastoise is good from Blizzard and bad from Grass, so it is neutral.
- Espeon and Snorlax are neutral.
- Order: Pikachu, Venusaur, Charizard, Espeon, Snorlax, Blastoise. This matches what was seen in the run.

Every Crystal and Gold trainer class can also switch voluntarily (`engine/battle/ai/items.asm`,
`ai/switch.asm`). It is random and built on a known-buggy type check, so it can't be predicted; recompute
after it happens.

### Gen 3 (pokeemerald `src/battle_ai_switch_items.c:629-790`, `GetMostSuitableMonToSwitchInto`)
**Pass 1.**
- Score each candidate by how hard the **player's** current types hit the candidate's species types. Start at
  10 and apply both player types; a single-type player is applied twice.
- Take candidates from **highest score down**, ties to the lower slot.
- Return the first one that has a super-effective damaging move against the player. Pass 1 checks this with
  the player's ability, so Levitate blocks Ground.
- Yes, it prefers the Pokémon the player hits hardest. That is a real game quirk; the source flags it.

**Pass 2**, if nobody qualifies:
- Score each (candidate, move) pair, skipping moves with power 1. Status moves still score.
- The score is `D × STAB × type effectiveness`, using the move's type against the player's types.
- `D` is the base damage of `gCurrentMove` with the **fainted** enemy as the attacker and the player as the
  defender. `gCurrentMove` is the move that caused the faint; after an end-of-turn faint in Emerald and FR/LG
  it is 0, which gives D = 3.
- STAB is checked against the **fainted** enemy's types, not the candidate's.
- No random roll, no crit.
- The best score is kept in **one byte** (`u8`), so values over 255 wrap around and the choice turns chaotic.
- The first strict maximum wins. If Pass 2 finds nothing, the pick is the first living Pokémon.

Version notes:
- Ruby and Sapphire don't clear `gCurrentMove`.
- In Emerald two-trainer battles, each trainer only uses its own half of the party.
- `stp-pokeemerald/docs/enemy_trainer_send_out_logic.md` has three errors:
  - Normal doubles lead with slots 0 and 1, not 0 and 3.
  - Pass 2 computes `gCurrentMove`, not the candidate's move.
  - The power-1 skip also covers Hidden Power, Return and Frustration.

### Gen 4 (pokeplatinum `src/battle/battle_lib.c:7923-8089`, `BattleAI_PostKOSwitchIn`; HG/SS `ov12_02258800` is identical)
**Stage 1.**
- Score each candidate by its **own species types attacking the player's current types**.
- Each type starts at 40 and is doubled, halved or zeroed by the type chart. The two types' scores are added
  up in one byte, so 160 + 160 wraps to 64.
- Take candidates from the highest score down, ties to the lower slot.
- Return the first one with a super-effective move. Status moves count here, and variable types are resolved:
  Hidden Power from IVs, Natural Gift and Judgment from the held item, Weather Ball from the weather.

**Stage 2**, if nobody qualifies:
- For each (candidate, move) pair with power ≠ 1, take the real damage formula (`CalcMoveDamage`) with **the
  fainted enemy as the attacker** and the candidate's move.
- The fainted enemy's stat stages are reset, and its HP of 0 always triggers Blaze, Torrent, Overgrow and Swarm.
- The defender is the player's Pokémon: its stats, stat stages, ability and item, plus screens and weather.
- Then the type chart. No random roll; crit multiplier 1.
- The result is truncated to one byte.
- Two quirks:
  - The score variable isn't reset between moves.
  - It also starts Stage 2 holding Stage 1's last value. Both must be copied exactly.
- The fallback is the first living Pokémon.

The rest:
- Scott's own `stp-pokeplatinum/docs/trainer_switch_ai.md` agrees with all of this.
- Diamond/Pearl are **not verified**. There is no D/P decomp on Windows; `pokediamond` on the Mac can settle it.
- Voluntary switches: every trainer can, and each needs a random roll.

### Gen 5 (B2W2 matching decomp `fuddlesworth/pokebw2`, `src/ov167/btl_client.c:3654-3720, 3814-3869`)
- Score each candidate by its best damaging move with PP left: `base power` (under 10 counts as 60) × the
  type chart against the player's current types.
- No STAB, stats, abilities, items or randomness.
- The scores are sorted with `for i, for j>i: if p[i] < p[j] swap`, and the top one is sent. Copy that exact
  loop, not a stable sort: with ties it does not always favour the lower slot.
- The battle's party order is **not** the trainer's: each switch-in swaps the active slot with the newcomer's slot.
- Black/White 1 are **not verified** (no BW1 decomp). They are almost certainly the same engine.

## 2. What the feature does

1. **One prediction per battle, made when the panel first shows.** Simulate the battle as a chain:
   1. The lead is slot 0.
   2. "Slot 0 faints" picks the next Pokémon using slot 0 as the fainted enemy.
   3. That one faints, and so on.

   It assumes a neutral field: no stat stages, no screens, no weather, nobody statused, and no voluntary switch.
2. **Rows never move** (Scott, 2026-10-15). The order is frozen for the battle (`SendOutOrderCache`): it is worked
   out again only when the team or the player's Pokémon changes. It is kept as the Pokémon themselves, not slot
   numbers, so a mapper whose party list reorders in battle still finds each one. A voluntary switch or a changed
   field can make the real order differ; the panel does not follow.
3. **The player's Pokémon is the one in the party** (party slot 0 from memory), not the species picker:
   - its species types (gens 2-5), and in gens 3-4 its Defense, Sp. Def, ability and held item;
   - gen 3 also reads the Defense/Special badge boosts (badges 5 and 7) and takes the player's strongest damaging
     move as the knock-out move (`gCurrentMove`);
   - with no party, the evolution species if the evolution toggle is on, else the species picker.
4. **The Trainers preview** (right panel set to Trainers) uses the same prediction, worked out fresh each time.
   The wild panel and double battles keep party order (a double battle picks against a random target).
5. **"Predicted Send-Out Order"**, a toggle in the Display group of the settings panel, on by default; off keeps
   party order. Saved as `send_out_order` (gen2 `this.send_out_order`); it has a shortcut action
   (`display.send_out_order`).
6. **When the game picks at random** (gen 2's "every candidate is bad"), the rest stay in party order.

## 3. How it is built

- `core/logic/sendOutOrder.ts`: `predictGen2/3/4/5(party, player)`, plain data in (`SendOutMon`, `SendOutPlayer`),
  party slots out. Gens 3 and 4 port the damage formulas (`gen3BaseDamage`, `gen4AiDamage`) only as far as this
  rule uses them; each function says what it leaves out (Natural Gift's berry type, Rivalry's genders, Weather Ball
  in weather, Iron Ball beyond Ground-on-Flying).
- `core/logic/typeMatchups.ts`: the ROM's type chart in ROM order (the engines truncate entry by entry).
- Each `games/genN/enemyPanel.ts` builds the inputs from what it already reads and calls `orderSlots(slots, order)`:
  - gen2: the party in memory, types from `pokemon_crystal.js`, move types from `g2MoveData`;
  - gen3: the trainer table (`enemyTrainer`), moves from `generation_3_moves` (looked up spelling-free);
  - gen4: the trainer table (`enemy_mon_static`), moves from `generation4_moves_new`, Hidden Power's type from memory;
  - gen5: the party in memory (Black/White and Black 2/White 2), moves from `black_moves`.
- **Slot and row.** `EnemySlotView.slot` stays the party slot (its data, `data-enemy-slot`, the sprite resize tool,
  the speed label, stat stages, faints). The new `row` (read with `rowOf`) is where it is drawn: the `ePkmnN` class
  and the numbered position art (`stats/N.svg`, `speed_comp/N.svg`, `enemy_ui/N.svg`... are full-canvas pictures
  placed by their number). No class name changed, only the number in it.
- `PreviewPokemon` gained `item` (the tables' `held_item`) for the damage step.

## 4. Open points

- **Gen3's faint move.** Pass 2 needs the move that caused the faint; the prediction uses the player's strongest
  damaging move. This matters only when no candidate passes Pass 1, and only when a damage value passes 255.
- **Diamond/Pearl and Black/White 1** are inferred, not read. D/P can be checked on the Mac (`pokediamond`).
- **Field state:** the prediction assumes no weather, even in a rain or sand area.
- **gen5's party list in battle:** whether the mapper's `battle.opponent.team` follows the battle's own order (which
  swaps on every switch-in) is unchecked; the frozen order follows the Pokémon either way.
- **Gen4 forms** (Rotom, Wormadam): their types are not checked in the decomp.
- **Real-run checks for Scott**, one battle each, chosen so Stage 2 / Pass 2 actually decides something:
  - Crystal Red;
  - an Emerald gym leader;
  - a Platinum gym leader;
  - a Black gym leader.
