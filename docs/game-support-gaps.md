# Game support gaps — Gold & Silver, Ruby & Sapphire, Diamond & Pearl

Investigated 2026-09-17. Six games have never had full support: Gold, Silver, Ruby, Sapphire, Diamond, Pearl.
This lists, per game, what is missing or wrong and where, so each can be scheduled. Nothing here was
changed; `known-legacy-bugs.md` still governs what the lifted components preserve.

**Bottom line:** none of the three pairs is playable today. G/S and R/S are blocked on *mappers* (the
`%APPDATA%\PokeAByte\Mappers` checkout, outside this repo); D/P is blocked on three overlay bugs, and its
data is mostly good.

| | Mapper | Trainer data | Pokémon / move data | Overlay logic | Splits |
|---|---|---|---|---|---|
| **Gold & Silver** | blocker | 19/495 wrong | 15 species' learnsets | hardcoded Crystal | partial |
| **Ruby & Sapphire** | none usable | none | shared, correct | empty `gameVariables` entry | none |
| **Diamond & Pearl** | missing paths | complete | tutors are Platinum's | three crashes | crash after "Full" file |

## Method

1. **Mapper vs profile.** Every `<property>` path inside each mapper's `<properties>` block was extracted
   (with the `<classes>` templates expanded recursively — gen4 nests templates inside templates) and
   intersected with the generation's `GEN*_READS` / `GEN*_WRITES` tables (`games/genN/mappers/*-paths.ts`).
   A path the mapper lacks resolves to `undefined` in the canonical view (`core/mapper/MapperAdapter.ts:52`,
   deliberately, so `?.` short-circuits keep working), which is why an unguarded `.value` or `.change()`
   on one is a TypeError.
2. **Data vs decomps.** The shipped trainer, learnset, base-stat, TM/HM and evolution tables were diffed
   against the decomp repos listed in `AGENTS.md` (pokegold/pokecrystal, pokeruby/pokeemerald,
   pokediamond `files/poketool/personal/wotbl.json`).
3. **Overlay branching.** Every `gameSelection` / `selected_game` / `meta.gameName` / `meta.game_name`
   branch in the three `Overlay.vue` files was read for the edition in question.

The mappers checkout is a git repo (`origin` = `github.com/PokeAByte/mappers`, local branch `development`)
with Scott's commits on top of upstream; `git log -- <mapper>` says which mappers carry local work.

---

## Gold & Silver (gen2)

### 1. Mapper — the blocker

`DEPRECATED/gen2/pokemon_gold_silver_deprecated.xml` is stock upstream (its only local commits are `init`
and `small fixes`), while `pokemon_crystal_deprecated.xml` carries a dozen local commits on top of those
(`crystal starter`, `abra flags`, `crystal deprecated state management`, `backport support for gen2`,
`crystal added hm users`, `candies`, `platinum patch version support`, `mapper updates`, …) that added the
`patch`, `events`, `squidgyExtras` blocks and the `.js` state machine the overlay depends on.

G/S supplies **647 paths vs Crystal's 1073**. Of the profile's paths, **145 of 253 reads and 28 of 62
writes are absent** (`games/gen2/mappers/deprecated-paths.ts`):

| Absent in G/S | Consequence |
|---|---|
| `meta.state`, and no `.js` preprocessor | The state machine has no input. `hp_tracker_style` (`Overlay.vue:2202`) reads `meta.state.value` from the template, so the overlay **throws during render**. `battle.info.lowHealthAlarm` / `battle.lowHealthAlarm` (To/From Battle) are absent too. |
| `battle.trainer.class` / `.id` / `.name` / `.totalPokemon` | The G/S `battle.trainer` block is only `team.N.*`. Every trainer lookup (54 sites) has nothing to key on. |
| `battle.enemyPokemon.species` / `.type1` / `.type2` | Enemy identity and type effectiveness. |
| `overworld.map` / `.mapIndex` / `.mapName` / `.x` / `.y` | Map-change markers, Goldenrod dept-store logic, encounter logic (19 sites). |
| `patch.*` — all of it (131 sites) | Encounter flags, hidden-power / starter / catch-rate writes, Shuckie timers (`patch.time.*`), bonks (`patch.steps.bonks`), battle summary (`patch.battle_info.*`), resets / blackouts. There is no STP-patched G/S ROM, so `romPatching`, `encounterFlags`, `shuckieTimer` and `bonkCounter` in `games/gen2/index.ts` are Crystal-only in practice. |
| `player.items.*`, `player.pokeBalls`, `player.itemCount`, `player.teamCount` | Inventory panel and ball tracking. |
| `events.rare_candies.*`, `events.beat_elite_four`, `gameClock.day` | Rare-candy tracker, post-E4 logic. |
| `screen.menu.*`, `screen.tiles.*`, `screen.vRamState.text_box` | Text-box detection. |

Renamed rather than missing: `squidgyExtras.repelStepsRemaining` → `player.repelStepsLeft`;
`battle.field.player.*` → `battle.field.playerScreens.*` (and `enemy` → `enemyScreens`). G/S also has
`battle.enemyPokemon.dv*`, `battle.yourPokemon.battleStat*` and `rival.rivalName` that Crystal lacks.

`STANDARD/gen2/pokemon_gold_silver.xml` (2038 paths) has `meta.state` and a `.js`, but it is the
snake_case `battle.opponent.*` / `bag.*` vocabulary: a new profile with a translation table, not a drop-in.

**Fix lives in the mappers checkout:** port Crystal's local additions to the G/S deprecated mapper, with
addresses from pokegold. The Shuckie / patch surface stays Crystal-only until a G/S ROM patch exists.

### 2. Trainer data — 19 of 495 parties wrong

`crystal_trainers` is used for both editions (`Overlay.vue:3097`, known-legacy-bugs.md #1). Against
pokegold `data/trainers/parties.asm`: Crystal appended its rematch trainers at the *end* of each class,
so `Class N` keys are compatible and **476 of 495 G/S trainers resolve to an identical party**. Every gym
leader, E4 member, Red, the Kanto leaders and every rival fight match. The 19 that differ:

| Class / id (G/S name) | G/S | Crystal |
|---|---|---|
| Bird Keeper 12, 14, 17 (Jose) | Farfetch'd 37 / 35 / 41 | 36 / 34 / 40 (+ moveset) |
| Bird Keeper 18, 19 (Vance) | Pidgeotto 31, 33 / Pidgeotto 35, Pidgeot 37 | Pidgeotto 32 ×2 / Pidgeot 38 ×2 |
| Cooltrainer M 6, 7 (Gaven) | Victreebel, Kingler, Flareon @34 / @38 | @35 / @39 (+ moveset) |
| Cooltrainer F 12, 18 (Beth) | Rapidash 38 / 42 | 39 / 43 |
| Cooltrainer F 19, 20 (Reena) | Starmie, Nidoqueen, Starmie 33–35 / 37–39 | 34–36 / 38–40 (+ moveset) |
| Pokémaniac 9, 10 (Brent) | Nidoran♀ 19, Nidoking 23 / Nido line 28–32 | Kangaskhan 25 / Porygon 36 |
| Fisher 19 (Chris → Tully) | Goldeen 32 ×2, Qwilfish 34 | Qwilfish 32 |
| Fisher 22 (Wilton) | Goldeen 31, Seaking 35 ×2 | Seaking 34 ×2, Remoraid 38 |
| Hiker 9, 19 (Parry) | Onix 34 / Onix 38 | Onix 35, Swinub 33 / Piloswine, Dugtrio, Steelix |
| Blackbelt 3 (Kenji) | Onix 30, Machamp 37, Onix 30, Hitmonlee 35 | Onix 33, Machamp 38, Steelix 33, Hitmonlee 36 |
| Picnicker 21 (Erin) | Ponyta 36 ×2 | Ponyta 36, Raichu 34, Ponyta 36 |

Three more differ only by name (Fisher 7/18 Chris→Tully, Super Nerd 1 Eric→Stan, Biker 1 Kazu→Benny,
Kimono Girl 1 Kyoko→Naoko). Trainer class DVs are identical except Crystal's added Mysticalman (Eusine),
which G/S does not have. Small enough to ship as an override table on `crystal_trainers` rather than a
second 33k-line file.

### 3. Pokémon data — 15 species' learnsets

`dexDataCrystal` is used for both. Base stats are identical (the 247 base-stat file diffs in the decomps
are only sprite-dimension includes). Move stats and the TM list are identical. Level-up learnsets differ
for **15 species** (`data/pokemon/evos_attacks.asm`): Dugtrio, Magneton, Cloyster, Eevee, Spinarak,
Ariados, Hoppip, Skiploom, Jumpluff, Yanma, Qwilfish, Sneasel, Swinub, Piloswine, Suicune. Crystal adds
move tutors; `unobtainable_moves["Gold and Silver"]` (Psych Up) already exists.

### 4. Overlay hardcodes

| Where | What |
|---|---|
| `Overlay.vue:2384` `version()` | returns `"Pokemon Crystal"` (known #3) |
| `Overlay.vue:6417`, `:6686` | `this.autosplitter["Crystal"]` — the autosplitter table has no G/S key |
| `Overlay.vue:6656` | `gameName = game_selection == 'Crystal' ? 'C' : 'GS'` — the one place G/S is distinguished (split file prefix) |
| `splits.js:17` | attempts folder hardcoded `Crystal/` (known #2) |
| `manifest.ts` | both editions declare `splitPrefix: "c"` |
| `data/autosplitter.js` `Crystal` | rival labels are gen1 copy-paste ("Nugget Bridge", "SS Anne", "Silph Co.") — affects both editions |

### 5. Dead weight

`data/g2trainers-short.js` (118k lines) and `data/crystal-trainers-otto.js` (30k) are imported into
`data()` (`Overlay.vue:1320`, `:1337`) and never read.

### 6. Harness

No G/S fixture (`tools/parity/scenarios/`). `control-script.ts:84` already maps a G/S mapper to the
`Gold & Silver` edition.

---

## Ruby & Sapphire (gen3)

### 1. Not selectable at all

No profile in `games/gen3/manifest.ts`, no edition, no box art in `images/gen3/box_art/` (only
`3-emerald.png`, `3-firered.png`), `available_games` = `["Emerald", "FireRed and LeafGreen"]`
(`Overlay.vue:1892`), `gen3GameIcon` falls through to the default `.ico`. With an RS mapper loaded the
shell shows the unsupported-mapper state.

No `ST/gen3/*ruby_sapphire*_ne.xml` exists, and neither stock mapper is usable:

- `DEPRECATED/gen3/pokemon_ruby_sapphire_deprecated.xml` (989 paths): **91 of 210 reads and 41 of 76
  writes missing.** No trainer identity — `battle.trainer` holds only `team.N.*`, no `opponentA` /
  `opponentAId` / `class` / `totalPokemon`. No `overworld.*` (map name, encounters, repel), no
  `player.bag.*`, no `player.playerId`, no `battle.turnInfo.battleStart` / `battleDialogue` /
  `battleOutcome`. No `pointers.sStpCallback*`, `misc.palette5`, `patch.*`, `stp_vars.*`: those come from
  the STP ROM patch, and `ST/gen3/patch_versions_*.json` exists only for emerald and firered.
- `STANDARD/gen3/pokemon_ruby_sapphire.xml` (672 paths): the snake_case `battle.player` /
  `battle.opponent` vocabulary — 192 of 210 reads missing.

### 2. `gameVariables["Ruby and Sapphire"]` is `{}`

`data/gameVariables.js:258`. The `game_data` computed (`Overlay.vue:3825`) would return `{}`: no
`dexData`, `evolutions`, `trainerList`, `splits`, `champion`, `finalBattle`, `opponentImageMap`,
`encountersMap`, `starterLocation`, and — critically — no `callback1` / `callback2` address lists. The
gen3 state machine keys on those ROM addresses (`Overlay.vue:8175-8240`: `pointers.callback1` in
`game_data.callback1.overworld` → Overworld, `toBattle` → Battle, `callback2.reset` / `blackout`), and the
values in the Emerald entry (`134765285`, `134455025`, …) are Emerald's. RS needs its own set from
pokeruby. `versionCheck()` (`:6588`) returns `"Version Error"` for anything but the two Emerald / FRLG
strings.

### 3. Trainer data — none

No RS trainer file; the legacy `ruby_trainers.json` / `sapphire_trainers.json` were orphans and not copied
(known #28). `emeraldTrainers` is keyed by numeric trainer id. Against pokeruby
(`include/constants/opponents.h`, `src/data/trainers_en.h`, `src/data/trainer_parties.h`): of 694 RS ids,
**208 identical in Emerald, 273 same trainer with a different party, 213 a different trainer entirely.**

| RS trainer | RS id | RS party | Emerald at that id |
|---|---|---|---|
| Roxanne | 265 | Geodude 14, Nosepass 15 | Geodude 12 ×2, Nosepass 15 |
| Brawly | 266 | Machop 17, Makuhita 18 | Machop 16, Meditite 16, Makuhita 19 |
| Wattson | 267 | Magnemite 22, Voltorb 20, Magneton 23 | Voltorb 20, Electrike 20, Magneton 22, Manectric 24 |
| Flannery | 268 | Slugma 26 ×2, Torkoal 28 | Numel 24, Slugma 24, Camerupt 26, Torkoal 29 |
| Norman | 269 | Slaking 28, Vigoroth 30, Slaking 31 | Spinda 27, Vigoroth 27, Linoone 29, Slaking 31 |
| Winona | 270 | Swellow 31, Pelipper 30, Skarmory 32, Altaria 33 | Swablu 29, Tropius 29, Pelipper 30, Skarmory 31, Altaria 33 |
| Tate & Liza | 271 | Lunatone 42, Solrock 42 | Claydol 41, Xatu 41, Lunatone 42, Solrock 42 |
| Wallace (leader) | 272 | Luvdisc 40, Whiscash 42, Sealeo 40, Seaking 42, Milotic 43 | Juan |
| Sidney / Glacia / Drake | 261 / 263 / 264 | Sharpedo / Glalie-first / Flygon ×2 | Crawdaunt / Sealeo-first / Kingdra (Phoebe matches) |
| Steven (champion) | 335 | Skarmory 57, Claydol 55, Aggron 56, Cradily 56, Armaldo 56, Metagross 58 | Wallace |
| Brendan / May, Routes 110 & 119, Lilycove | 521–537, 661–666 | Wailmer / Numel / Shroomish teams | Wingull / Slugma / Lombre teams |
| Maxie 1 / Tabitha 1 / Courtney 1, 2 | 566 / 596 / 599, 600 | Team Magma | Julio / a Grunt / Brendan & May Rustboro |
| Archie 1, 3 / Matt 2 | 1, 35 / 31 | Team Aqua | Sawyer / Leah / Zander |

Ruby and Sapphire share one trainer table — there are no `SAPPHIRE` ifdefs in `trainers_en.h` or
`trainer_parties.h`; the map scripts pick Maxie vs Archie — so one RS file serves both.

### 4. Pokémon data — fine

`dexDataRubySapphireEmerald` is valid for RS: base stats, abilities, evolutions, TM/HM compatibility (all
412 species, after normalising `SOLARBEAM`/`SOLAR_BEAM` spelling) and level-up learnsets are identical
between pokeruby and pokeemerald; only Deoxys differs (form learnset). Move tutors differ (RS has nine
one-move tutors; Emerald's Battle Frontier tutors do not exist), so `unobtainable_moves` needs an RS
list — the Emerald list (`data/unobtainable_moves.js:24`) is tutor-driven.

### 5. Splits and lookups

| Where | What |
|---|---|
| `data/autosplitter/split_trainers.js:87` | `split_trainers_by_game["Ruby and Sapphire"]` aliases the Emerald list, whose ids (`LEADER_JUAN_1`, `CHAMPION_WALLACE`, `RIVAL_STEVEN`, `RIVAL_MAY_ROUTE_*`) do not exist in RS |
| `data/autosplitter.js` | keys: `Simple Splits`, `Emerald` only |
| `data/autosplitter/trainer_name_lookup.js` | no RS entry |
| `Overlay.vue:8831`, `:8943` | `logData` has an `'RS'` prefix branch keyed on the string `'Ruby & Sapphire'`, which nothing produces |
| `gameVariables` `opponentImageMap` | Emerald's `LEADER_*_1.png` sprites are reusable for the same leaders; Wallace-as-leader and Steven-as-champion need art |

### 6. What RS support needs, in order

1. An `ST/gen3/pokemon_ruby_sapphire_ne.xml` in the emerald_ne vocabulary (mappers checkout), plus an RS
   `.js` for party decryption (the DEPRECATED RS `.js` has one to start from). No STP ROM patch means the
   `patch.*` / `stp_vars.*` / `sStpCallback*` features stay off; the state machine can run on the stock
   `pointers.callback1/2` once the RS addresses are in `gameVariables`.
2. `games/gen3/mappers/ruby-sapphire-ne.ts` profile, manifest edition, box art, icon, `available_games`.
3. An RS trainer table extracted from pokeruby in the `emeraldTrainers` shape (numeric id keys, computed
   stats from the trainer's IV byte and species base stats).
4. `gameVariables["Ruby and Sapphire"]`: dex/evolutions (reuse RSE), `callback1`/`callback2` addresses,
   `splits`, `champion`/`finalBattle` (Steven), `opponentImageMap`, `encountersMap`, `starterLocation`.
5. `split_trainers_by_game`, `autosplitter`, `trainer_name_lookup`, `unobtainable_moves` RS entries.

---

## Diamond & Pearl (gen4)

The closest of the three: registered (`games/gen4/manifest.ts`), mapper present
(`ST/gen4/pokemon_diamond_pearl_ne.xml`), trainer and dex tables present and verified. Three overlay bugs
make it non-functional.

### 1. `mounted()` throws before the state machine installs

`Overlay.vue:9950` calls `this.game.properties.player.starter.change(...)` unguarded, and `player.starter`
does not exist in the D/P mapper (it is Platinum/HGSS-only). Since absent paths are `undefined`, this is a
TypeError inside the async `mounted`, and everything after it never runs:

- the battle modifier watchers (`:9971-9991`),
- the `meta.state` watcher (`:10297`) — splits, autosplitter, right-panel switching, champion / Hall of
  Fame handling, Shuckie timer logging,
- the menu-cursor watcher (`:10505`) and the exp watcher (`:10587`),
- `bindHotkeys` (`:10660`) — no hotkeys at all on D/P.

### 2. `game_data()` ignores D/P

`Overlay.vue:3291-3295` returns `game_variables['Platinum']` or `['HeartGold and SoulSilver']` and
`undefined` otherwise, although `game_variables["Diamond and Pearl"]` exists
(`data/game_variables.js:123`). Once #1 is fixed, at the end of every trainer battle
`this.autosplitter[this.game_data.gameName]` (`:10334`) throws after the "Full" split file is written;
the Deprecated and Simple split files and the `finalBattle` / `champion` handling (`:10428-10448`) never
run. The entry itself is a copy-paste: `gameName: "Platinum"`, Hoenn `encountersMap`, `starterLocation:
["ROUTE 101"]`, Emerald `callback1/2` values (the last three are unused in gen4). `data/autosplitter.js`
has no `Diamond and Pearl` key, so fixing `game_data` alone routes to Platinum's list — which works by
accident because the trainer names are the same.

### 3. The starter stat / IV write never fires

`setStartingStats` triggers only for Platinum on `Route 201 - Map 1` and HGSS on map 61
(`Overlay.vue:9942-9947`); `update_rom_starter_and_intro_mon` (`:4300`) has Platinum and HGSS branches
only, although the D/P mapper does expose `patch.stpStarterSpecies`. Manual and automatic IVs, nature,
ability and the starter species write are inert on D/P. Encounter-rate forcing (`:4158-4260`) is
Platinum / HGSS only as well.

### 4. Mapper gaps

`pokemon_diamond_pearl_ne.xml` has 3465 paths vs Platinum's 4006. Relative to what the profile reads and
Platinum supplies, D/P lacks:

| Absent in D/P | Where it bites |
|---|---|
| the whole `flags.*` block (`lab_scene_ended`, `new_game_1`, `got_tm27_return`) | `flags.got_tm27_return.value` is read in the 2023 stat label (`:3203`) → TypeError; `lab_scene_ended` gates encounter forcing |
| `patch.*` except `stpStarterSpecies` (`stpCatchRate`, `FLAG_STP_CATCH_RATE`, all `FLAG_FORCE_*`) | `catch_rate` watcher (`:2237`) and `setCatchRate` (`:4141`) → TypeError; no encounter forcing |
| `player.starter` | #1 above |
| `player.team.N.flags.alternate_forms` / `.fateful_encounter` | Wormadam / Shaymin / Mew starter writes (`:9927`, `:9937`) |
| `battle.turn_counter` | `:4745` |
| `battle.flags.player_active.metronome_item_turns` | commented out (`:8717`) — harmless |

The D/P mapper's `<patch>` block (line 799) is a stub: one live property, the rest commented out.
`ST/gen4/patch_versions.json` describes the Platinum patch only.

### 5. Data

| Table | State |
|---|---|
| `data/trainers/diamond_pearl.js` (`trainers_dp`) | **complete and correct**: 850 trainers, D/P rosters verified (Gardenia Cherubi/Turtwig/Roserade 19–22, Fantina at gym 5 with Drifblim/Gengar/Mismagius 32–36, Cynthia's Spiritomb 61 … Garchomp 66). Ids align with Platinum's numbering (Platinum appended 850–927). Used by `enemy_mon_static` (`:3298`). |
| `data/pokedex/diamond_pearl.js` (`pokedex_dp`) `level_up_learnset` | **verified** against pokediamond `wotbl.json` for all 489 species; the only diffs are `Faint Attack` vs the decomp's `Feint Attack`. 81 species differ from Platinum, so the separate table matters. |
| `pokedex_dp` `tutor_learnset` | **wrong**: byte-identical to Platinum's for all 492 species with tutors. D/P has no move tutors. The tutor column of the movepool (`:1087`, `:6620`) shows Platinum tutors. |
| `data/post_game_moves.js` | no `Diamond and Pearl` key, and `post_game_move_style` hardcodes `'Platinum'` (`:5074`, "change this to be dynamic when adding more games") — the TM viability strikethrough uses Platinum's post-game list |
| `data/moves/unobtainable_moves.js` | has a `Diamond and Pearl` entry |
| `platinum_moves` / `g4MoveData` / `g4tmhmMapping` / `misc/tmhm.js` | shared; move stats and the TM list are the same across gen4 |
| `trainerData()` (`:3432`) | returns `undefined` for D/P (and HGSS); `getTrainer` (`:6144`) would throw |
| `get_trainer_name` (`:3969`) | Platinum's id table: D/P has no Lake Verity rival (850–852), so D/P's first rival (247–249) is labelled "Rival 2" and each later one is off by one; D/P's two Cyrus fights (403 HQ, 404 Spear Pillar) are labelled "Cyrus 2" / "Cyrus 3"; 913 / 926 / 927 do not exist in D/P |
| box art, icon, split folder | present (`4-DiamondandPearl.jpg`, `gen4/icon-diamond.ico`, `DP`) |

### 6. What D/P support needs, in order

All in this repo:

1. `game_data()`: return `game_variables['Diamond and Pearl']`; set its `gameName` to `"Diamond and
   Pearl"` and add a `Diamond and Pearl` key to `data/autosplitter.js`.
2. Guard the reads the D/P mapper cannot satisfy: `player.starter.change` (`:9950`), `catch_rate` /
   `setCatchRate`, `flags.got_tm27_return`, the `alternate_forms` / `fateful_encounter` writes.
3. A D/P trigger for `setStartingStats` (level 5 on Route 201, or the Lake Verity lab scene) and a D/P
   branch in `update_rom_starter_and_intro_mon` writing `patch.stpStarterSpecies`.
4. Empty `tutor_learnset` in `pokedex_dp`; add `post_game_moves["Diamond and Pearl"]` and make
   `post_game_move_style` read `selected_game`.
5. D/P rows in `get_trainer_name` (rival 247–249 = Rival 1 …; Cyrus 403 / 404 = Cyrus 1 / 2).
6. Record a D/P fixture (`tools/parity/scenarios/`) and add it to `verify-all`.

---

## Cross-cutting

- **Feature flags are per generation, not per edition.** `games/gen2/index.ts` and `games/gen4/index.ts`
  declare `romPatching`, `encounterFlags`, `shuckieTimer`, `bonkCounter`, `rngHelper`, `voltorbFlip` for
  the whole module; for G/S and D/P the mapper cannot supply them. When editions become real, the flags
  need an edition dimension (plan §2, "keys a mapper cannot supply are declared `unsupported` and switch
  the corresponding feature flag off").
- **`unobtainable_moves` tables are per game and already have G/S and D/P entries** (gen2
  `data/unobtainable_moves.js`, gen4 `data/moves/unobtainable_moves.js`); RS has none.
- **No harness coverage** for any of the six (`tools/parity/scenarios/`: yellow, firered, platinum, black).
