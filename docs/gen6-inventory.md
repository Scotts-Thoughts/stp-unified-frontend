# Gen 6 / gen 7 (3DS) inventory

What the 3DS overlay (`src/renderer/games/gen6/`, shared by the `gen6` and `gen7` modules) reads, and what the
mappers had to gain for it. First build pass 2026-11-26. The ROMs are unpatched, so there is no STP patch block. The
overlay's **one write** is the starter (2026-11-27, "Writing the starter" below): the party's lead becomes the Solo
Pokémon, with the settings' nature, ability, gender and IVs, written straight into the party in memory. Everything else is read from the party.

## Games and mappers

| Game key (`meta.game_name`) | Mapper | Module |
|---|---|---|
| `X and Y` | `STANDARD/gen6/pokemon_x_y.xml` | gen6 |
| `Omega Ruby and Alpha Sapphire` | `STANDARD/gen6/pokemon_omega_ruby_alpha_sapphire.xml` | gen6 |
| `Sun and Moon` | `STANDARD/gen7/pokemon_sun_moon.xml` | gen7 |
| `Ultra Sun and Ultra Moon` | `STANDARD/gen7/pokemon_ultra_sun_moon.xml` | gen7 |

Each mapper covers both versions of its pair. All four are **version 0.3.0**, made from the stock 0.0.2 files by
`py tools/mappers/make-3ds-mappers.py` (idempotent; `--check` reports without writing; `--dir` for another
mappers folder). It edits the files in `%APPDATA%\PokeAByte\Mappers` and bumps `mapper_tree.json`. **A PokeAByte
mapper update can put the stock files back: run the script again.** The script needs LF files; restore a stock
file with `git show HEAD:<path> > <path>`, not `git checkout` (which writes CRLF on Windows).

What the script changes:

1. **Name tables** (all four). The stock files carried gen 4's lists: moves stopped at 467, abilities at 123,
   items at 536, the type list had no Fairy, and seven species were misspelled. The new lists are
   `tools/mappers/data/refs-3ds.json` (moves by `rom_id` from the pokemon-data repo; items 537–959 and abilities
   from PKHeX's text tables).
2. **Battle teams, gen 6.** `battle.player_team.0-5` and `battle.opponent_team.0-5` (gen 7 had them). The battle
   object is at `[0x08000140]`; the party pointer tables are at `+0x160` (player) and `+0x17C` (opponent): six
   pointers in battle order and a count at `+0x18`. A battler's record is `pointer + 0xC`, 0x244 bytes; byte 13 is
   its party slot (0–5 player, 12–17 opponent). `battle.player.team_count` is now the real count.
3. **Trainer names** (all four): `battle.opponent.trainer` ("Youngster Joey"), `.trainer_name`,
   `.trainer_class_name`. The trainer id is at battle object `+0x958` (gen 6), `+0xB00` (S/M), `+0xB04` (US/UM);
   the name and class string objects are at `id − 0x10` and `id − 0xC` (characters pointer at `+4`, length u16 at
   `+10`). Gen 7's strings live in `0x30000000–0x30040000`.
4. **US/UM battle `level`** reads one byte (it read two and showed 0x1xx values).
5. **The starter write** (all four, 0.2.0): `player.encrypted_mon_0` (the lead's 232 stored bytes as memory holds
   them, at the script's `PARTY_BASE`) and `player.encrypted_mon_0_stats` (its 28 party-stat bytes, `PARTY_BASE +
   0x158`). Both are `string` properties read and written as bytes, as gen 5's `decrypted_mon_0` (which, despite its
   name, is also the encrypted copy).
6. **The new game** (gen 7, 0.3.0; X/Y and OR/AS move to 0.3.0 with nothing added): `meta.save_loaded`, the byte at
   `{save_block} + 0x82C`. What the byte is in the save is not known; what it does was read from the replays (below,
   "The new game").

## What the overlay reads

- **Party**: `player.team.0-5.*` (species, level, exp, nature, ability, held_item, friendship, status, stats, ivs,
  evs, moves, `flags.alternate_form`), `player.team_count`, `player.name`, `player.tid`, `player.badges` (gen 6
  only; gen 7 has none).
- **Battle**: `battle.in_battle`, `battle.other.battle_end`, `battle.opponent.id` (0 = wild),
  `battle.opponent.team_count`, `battle.opponent.party_position`, `battle.opponent.trainer*`,
  `battle.player.team_count`, `battle.player_team.N.*` and `battle.opponent_team.N.*` (species, hp, hp_max, level,
  ability, held_item, stats, `modifiers.*` stat stages, `move_N.id/pp/pp_max`).
- **Other**: `overworld.map_index`, `game_time.hours/minutes`, `bag.*` pockets (held-item marker), `meta.*`.

The read list the profiles claim is `games/gen6/mappers/standard-paths.ts`.

## How the game's state is told (found from Scott's replays, 2026-11-26)

- **Battle on**: `battle.in_battle`. **Wild** when `battle.opponent.id` stays 0 (the marker waits 300 ms).
- **Won**: `battle.other.battle_end` leaves 0 (257, then 1) while the battle is still on. The split and the OUT
  marker use the trainer name remembered during the battle: **the name strings empty about 100 ms before
  `in_battle` turns off**, with the id still set.
- **Blackout**: the battle ends unwon with every one of the player's battle records at 0 HP.
- **Enemy out**: `battle.opponent.party_position`; the battle team records keep their order when one faints.
- **Reset**: `player.name` empties (then `confirmReset`, as every generation). The name empties on the reset in all
  four `save, save, reset, reload` replays (logged 2026-11-27); the overlay's own handling was checked with a
  hand-made scenario only. **New game**: see "The new game" below.
- **Horde battles** (wild, several opponents) show each move's own power. A trainer double can't be told from a
  single (no battle format in the mappers), so its power is against the opponent `party_position` names.
- **Gen 7's battle teams hold leftovers outside battle**: read them only while `in_battle` is true.
- **Map ids pass through others while a map loads**: US/UM's `overworld.map_index` sits at 0 for about two seconds
  around battles and doors, and shows 2 for one frame. The Map Change marker therefore waits until a nonzero id has
  held for a second (`MAP_SETTLE_MS`) and is not the map last marked.

## The new game (2026-11-27)

Read from Scott's replays with the headless worker (`xy-properties-new game`, Sun `default-0`, and the four
`save, save, reset, reload` replays), with screenshots at the frames:

- **X/Y**: with no save the game shows the language screen ("Begin game"), a black screen, then Sycamore's intro.
  The play-time clock (`game_time`) leaves 0:00:00 as the intro begins (seconds 1 about 60 frames later), and the
  new save is set up on the same frames. The name is entered much later, with the clock already running. The
  overlay starts the timer when the clock goes from 0:00:00 to 5 s or less with no name and no Pokemon: about one
  game second after "Begin game". OR/AS share the engine; **no OR/AS new-game replay exists, so it is unchecked**.
- **Sun/Moon**: with no save the game opens on the language screen, says "Your settings have been saved", then a
  message from Kukui and the intro (appearance, name about a minute in, the prologue). The clock only leaves
  0:00:00 in the player's house, about three minutes in. `meta.save_loaded` turns on as the language is confirmed;
  the overlay waits 1.5 s and, if the name is still empty, no time is played and the party is empty, starts the
  timer as of the moment the byte turned on. **No US/UM new-game replay exists**: the byte sits at the same offset
  from the save block and behaves the same on a reset there, but the new game itself is unchecked.
- **Reset, then Continue** (all four replays): on the title screen the name empties, the clock reads 0:00:00 and
  `save_loaded` is off; on Continue the name comes first (with `save_loaded`), then the time and party up to 60
  frames later (OR/AS, Ultra Moon). The clock jumps to the save's time, so it never trips the new-game test. The
  old test (the name entered with no time played and no Pokemon) would have, so it is now a late fallback that
  waits 1.5 s.

## Writing the starter (2026-11-27)

As gens 3-5: the Pokémon column's **Starter**, **IVs**, **Ability & Gender** and **Nature** groups (gen 5's control
ids) choose the values, kept per Solo Pokémon under `<Game>_<Solo>` like the run counters. **Set Starter in Game**
(on by default) makes the lead the Solo Pokémon with them when the party goes from empty to one Pokémon of level 6 or
under in the save's first hour
(a save being loaded also fills an empty party; the level and time tell it from a new starter), once no battle is on
(OR/AS hand the starter over inside Birch's battle; the write waits for it to end). **Write to Game** writes now.
A lead that already has the species and values is left alone; the stats are worked out again from them (gen 3+
formula, the current level and EVs) and current HP keeps the damage taken. For three minutes after the write, a lead
that changes back (the game may still be handing it over from its own copy, as at a nickname screen) is written again.

**The species** (0x08) is the Solo Pokémon's when it differs from the lead's, as the earlier generations' starter
choice gives it: exp (0x10) is the start of the current level on its growth rate, the moves (0x5A-0x61, PP 0x62-0x65,
no PP Ups, no relearn moves) are the last four it learns by that level from the Pokédex learnset, the form is the base
one (a form such as "Lycanroc (Midnight)" is written as its base species), and the name (0x40, UTF-16, the gender
signs as the games' 0xE08E/0xE08F) is the species' unless the player nicknamed it. The game's own Pokédex flags are
not touched (it lists the starter it handed over as caught).

The write (`games/gen6/starterWrite.ts`, crypto in `games/gen6/logic/pk6.ts`): read both properties, decrypt here,
refuse if the checksum does not add up (the read caught the game mid-change) or the lead is an egg, stamp nature
(0x1C), ability (0x14) and ability number (0x15: 1, 2, 4 hidden), gender (0x1D bits 1-2; fixed by the species' ratio
when it has one), IVs (0x74, egg and nickname bits kept) and the stats (0xF0-0xFC), encrypt with the EC kept (so the
block order and key stay the game's) and the checksum worked out again, check the bytes decrypt back to the stamp,
then write the stored bytes whole and then the party stats, and read back until memory shows them. Up to five tries.

**Only out of battle.** A battle keeps its own copy of the party and writes it back when it ends: a stamp made during
an Ultra Moon battle came back as the old Pokémon at the next level-up. Outside battle, the game's own rewrites keep it.

**Checked headlessly** (`tools/gen6/starter-write-test.ts`, against Scott's Super Shuckie replays): in all four pairs,
decrypt then encrypt gives back the game's bytes exactly; memory read straight after the write holds exactly the
bytes written; the replay then plays on and every time the game itself rewrote the Pokémon (level-ups in X and OR, a
battle's end in Sun, a held item and a TM in Ultra Moon) the checksum still added up, the sanity word stayed 0, no
egg bit, and the stamped nature, ability, gender and IVs stayed; the game's own level-up stats matched the stamped
IVs and nature. Hidden abilities in all four. With the species changed (Fennekin to Froakie in X, Combusken to
Mudkip in OR, Popplio to Rowlet in Sun, Litten to Popplio in Ultra Moon) the game battled with the new species and
wrote its exp back, species, moves and choices kept. `mapper` mode checks through Poké-A-Byte's own engine (pab-host) that the
two properties sit at the lead's address and serve the bytes memory holds. The harness ran a synthetic X/Y new game
(the lead's real bytes from a replay): two writes at the starter, none on the reload; mid-run X/Y and Sun replays write
nothing. **Not checked:** a live write through Poké-A-Byte into the running Super Shuckie (the path is gen 5's
`setBytes`), and a starter received from a real new game (no replay of one could be played to that point).

The test tool needs a replay worker with three test commands (`goto <frame>`, `read <hex addr> <n>`, `write <hex addr>
<hex bytes>`): the 3DS-capable xpr-replay-worker with those added to its command loop (`main.rs`, next to `job`).

## Data and art

`tools/gen6/build-data.mjs` writes `games/gen6/data/` (one Pokédex per game pair, `moves_gen6.js`,
`moves_gen7.js`, `tmhm.js`, `type_chart.js`, `unobtainable_moves.js`, `species_art.js`) from
`A:/Programs/pokemon-data`, in gen 5's shapes. Only the detected game's Pokédex is loaded
(`data/index.ts`, through the module's `prepare(game)`). `tools/gen6/import-art.py` adds the species pictures gen 5's
pool lacks (`public/images/gen6/pokemon/`, ASCII file names), `import-shell-art.py` the box art and icons, and
`import-badges.py` the badge pictures: the eight Kalos badges (Bulbapedia's renders, kept in the art library as
`libraries/badges/gen6/Gen6 Badge<N>-<Name>badge.png`; Bulbapedia's Cloudflare check refuses scripted downloads, so
they came from its image archive through the Internet Archive, `web.archive.org/web/2023id_/<archives.bulbagarden.net
URL>`; the script adds gen 3's dark outline to each), and OR/AS's Hoenn row cut out of gen 3's own full-canvas badge pictures so all eight keep gen 3's sizes
(gen 3's `images/gen3/badges/*Badge.webp` files are padded differently and drew the last three too big).
`make-kalos-badges.py`, the old stand-in pips, is no longer needed. **The badge box is sized to each game's badges**
(`games.ts` `badgeLayout`): X/Y ("case") two rows of four big badges in a box 40 gen-5-px taller, OR/AS ("row") gen
3's single row in a box 48 px shorter, gen 7 ("stamps") its own box as is, holding the four island trial stamps (`images/gen7/stamps`), each shown once the run has that island's kahuna split (`badgeSplits`: the mappers have no trial flags). `make-badge-boxes.py` draws the frames
(`ui/timer[_2]-case.svg`, `-row.svg`) from the rounded `timer.svg` by moving the box's bottom edge and the faults box;
the overlay moves the fault counts by the same amount (`playerPanel.ts` `BADGE_BOX_DY`, keep the two equal) and
places each badge with `badgeCellStyle`. Rerun it after `make-rounded-ui.py`. Badges not won yet show as faint grey
shapes of the same pictures (`.tds-badge-slot`), the way gen 5's `progress.webp` draws them.

**Species looks** (art size, position, flip, overlay colour) are generated by `tools/pokemon-style/` like gens 2-5's:
gens 6 and 7 both write `data/style/<Game>_<Species>.json` here (3,418 files, one per species per game pair). The
3DS art box rules are `T["gen6"]` in `rules.py`; they keep the art between the canvas's left edge and the top
screen's border. Scott's own 3DS looks will be learned from by `/pokemon-style` as for the other generations.

## Not built yet

Mega Evolution and in-battle form changes, ability and item effects on stats, experience during battle, the
"Trainers" preview mode, the queuer hand-off, and the 3DS screenshot crop are not done or not checked. Double
and horde battles were logged but not looked at in the overlay.

## Logging a 3DS replay headlessly

Scott's Super Shuckie replay worker and the installed `pab-host` have no 3DS support yet, so `memlog.cjs` takes
`--worker <xpr-replay-worker.exe>` and `--pab <pab-host.exe>` for 3DS-capable builds (a worker built with the
`Nintendo3DS` core; a pab-host built from the PokeAByte source that knows platform `3DS`). `--snapshot <file>`
saves every property's value at the first frame, and `mem-to-scenario.ts --initial <file>` uses it, because a
short replay that starts mid-game never changes most values.

**A replay that opens the save (a new game, a reset, Continue) needs a copy of Super Shuckie's save folder.** The
keyframes keep the save card's path as Super Shuckie had it, `./UserData/azahar/sdmc/...`, relative to the working
folder; without it the game hits a fatal "not formatted" error and the worker hangs. Copy `supershuckie
2\UserData\azahar` (nand, sdmc, sysdata, config; not the 36 MB shader cache) to a short folder such as
`%TEMP%\x3w\UserData\azahar` (a long path breaks Windows' 260-character limit), run the worker with `x3w` as its
working folder, **and** set `XPR_3DS_USER_DIR` to the copy: after a reset the game mounts the card from the user
folder, and without it a Continue finds no save and starts a new game. The game writes its saves into the copy, so
copy it again before each replay (a new game overwrites that game's save). Never point either at Super Shuckie's
own folder.
