# Mapper matrix — which PokeAByte mapper each overlay is written against

Mappers live in `%APPDATA%\PokeAByte\Mappers` (a checkout of `github.com/PokeAByte/mappers`, HEAD `fe993a5`
on 2026-09-10) plus Scott's local `ST/` folder. PokeAByte 0.11.2 identifies a mapper by its **path relative
to that folder**; `GET /mapper` returns `meta.path` and `meta.gameName` (= the `<mapper name="…">` attribute).
Overlays read game identity from a *property* inside the mapper, and the property's name differs by family:

| Family | Identity property | Also present | Used by |
|---|---|---|---|
| `DEPRECATED/**` (+ `ST/gen3/*firered_leafgreen*`) | `meta.gameName` | `meta.generation`, `meta.gameType`, `meta.mapperType = "Deprecated"`, `meta.state` | gen1, gen2 |
| `STANDARD/**`, `EXPERIMENTAL/**`, `ST/gen4/**` | `meta.game_name` | `meta.generation`, `meta.game_type`, `meta.state` | gen4, gen5 (gen3: see below) |
| `ST/gen3/pokemon_emerald*_ne.xml` | **none** (no `<meta>` block) | — | gen3 (detection must use `/mapper` `meta.gameName` = "STP Pokemon Emerald") |

PokeAByte's own `docs/HowTo.md` states that the Generation 1 overlay only works with mappers that have
"deprecated" in their name. The camelCase/snake_case split is mapper *content*, not protocol.

## Installed mappers and the values the overlays compare against

| Path | `/mapper` `meta.gameName` | Property value | Consumer |
|---|---|---|---|
| `DEPRECATED/gen1/pokemon_yellow_deprecated.xml` | Pokemon Yellow - Deprecated Mapper | `meta.gameName` = `Yellow` | gen1 (`PokeData.setGame`) |
| `DEPRECATED/gen1/pokemon_red_blue_deprecated.xml` | Pokemon Red and Blue - Deprecated Mapper | `Red and Blue` | gen1 |
| `DEPRECATED/hacks/pokemon_yellow_legacy_deprecated.xml` | … | `Yellow Legacy` | gen1 edition dropdown lists it, but `PokeData.setGame` **throws** for it (not in `_games`) → overlay never becomes ready. **Out of scope — not registered (decision 8).** |
| `DEPRECATED/hacks/pokemon_yellow_2024_deprecated.xml` | … | `Yellow` | gen1 today (indistinguishable from Yellow); **not registered (decision 8)** |
| `DEPRECATED/gen2/pokemon_crystal_deprecated.xml` | Pokemon Crystal - Deprecated Mapper | `meta.gameName` = `Crystal` | gen2 (the recorded fixture uses this one) |
| `DEPRECATED/gen2/pokemon_gold_silver_deprecated.xml` | … | `Gold and Silver` | gen2 (trainer table bug: always Crystal) |
| `DEPRECATED/hacks/pokemon_crystal_legacy_deprecated.xml` | … | `Crystal Legacy` | **out of scope (decision 8)** |
| `STANDARD/gen2/pokemon_crystal.xml`, `pokemon_gold_silver.xml`, `pokemon_crystal_legacy.xml` | Pokemon Crystal / … | `meta.game_name` | not used by gen2 today |
| `DEPRECATED/gen3/pokemon_firered_leafgreen_deprecated.xml` | … | `meta.gameName` = `FireRed and LeafGreen` | gen3? |
| `ST/gen3/pokemon_firered_leafgreen_ne.xml`, `…_deprecated_ne.xml` | STP … | `meta.gameName` = `Pokemon FireRed and LeafGreen` | gen3 (matches its `"Pokemon FireRed…"` detection strings) |
| `ST/gen3/pokemon_emerald_ne.xml`, `…_deprecated_ne.xml`, `…_deprecated_ne_new.xml` | STP Pokemon Emerald | (no meta properties) | gen3 (`"Pokemon Emerald"` string → `/mapper` meta) |
| `STANDARD/gen3/pokemon_emerald.xml`, `EXPERIMENTAL/pokemon_emerald.xml` | Pokemon Emerald | `meta.game_name` = `Emerald` | — |
| `STANDARD/gen3/pokemon_ruby_sapphire.xml`, `DEPRECATED/gen3/pokemon_ruby_sapphire_deprecated.xml` | … | `Ruby and Sapphire` | gen3 has RS data but no selectable game |
| `ST/gen4/pokemon_platinum_ne.xml` | STP Pokemon Platinum | `meta.game_name` = `Platinum` | gen4 |
| `ST/gen4/pokemon_heartgold_soulsilver_ne.xml` | STP … | `HeartGold and SoulSilver` | gen4 |
| `ST/gen4/pokemon_diamond_pearl_ne.xml` | STP … | `Diamond and Pearl` | gen4 |
| `STANDARD/gen4/pokemon_{platinum,heartgold_soulsilver,diamond_pearl}.xml` | Pokemon … (- Beta) | same values | gen4 works with either family (same property names); the `_ne` variants add `patch.*` / encounter properties the overlay writes |
| `STANDARD/gen5/pokemon_black.xml` / `white` / `black_2` / `white_2` | Pokemon Black - Beta … | `meta.game_name` = `Black` / `White` / `Black 2` / `White 2` | gen5 |
| `STANDARD/gen1/pokemon_yellow.xml`, `pokemon_red_blue.xml` | Pokemon Yellow / Red and Blue | `meta.game_name` | **not** usable by gen1 today (it reads `gameName`) |
| `STANDARD/gen1/pokemon_tcg.xml` | Pokémon Trading Card Game | `game_name` | out of scope |

Rows marked "?" are confirmed by the gen2/gen3 inventories in Phase 2.1; the queuer's `expectedSelectedGameFromMapperId`
and the fixture headers are the ground truth for which mapper a recording used.

## Consequences for the unified app (decisions of 2026-09-10 applied)

1. **Today's mappers stay.** Each regular game ships exactly one `MapperProfile` (plan §2) for the mapper file the
   legacy overlay uses: DEPRECATED for gen1/gen2, `ST/gen3/*_ne` for gen3, `ST/gen4/*_ne` (STANDARD gen4 is
   property-compatible) for gen4, STANDARD for gen5. Parity is proven against those and only those.
2. **Hack mappers are out of scope** (`Yellow Legacy`, `Yellow 2024`, `Crystal Legacy`): no profile, not registered;
   loading one shows the "unsupported mapper" state on the game-select screen.
3. **Detection keys on `meta.path` first**, then on the profile's identity property (`meta.game_name` or
   `meta.gameName`), then on `/mapper` `meta.gameName` (for the `ST/gen3` emerald mappers that have no meta
   properties). The registry maps each path pattern to a `GameModule` + `MapperProfile`.
4. **Translation layer.** Overlay logic reads canonical keys; the profile maps them to this mapper's paths, value
   transforms and write endpoints. Using a different mapper for the same game later (e.g. `STANDARD/gen1/pokemon_yellow.xml`
   with `meta.game_name`) means writing a new profile file, recording a fixture with it, and running parity against the
   existing baselines — no store, hook or component changes. Keys a mapper cannot supply are declared `unsupported` and
   switch the corresponding feature flag off.
5. **Every fixture must be recorded with the mapper the legacy overlay actually uses**; the harness checks the fixture
   header's `meta.path` against the target module's profiles. Recording a gen1 fixture against
   `STANDARD/gen1/pokemon_yellow.xml` would produce a run the legacy app cannot even load.
6. `mapper.properties.meta.gameName.value` is also used as a **data key** in gen1 (`autosplitter[gameName]`,
   `GameDexes[game]`, split folder name). Those keys stay the mapper's strings (`Yellow`, `Red and Blue`, …); the
   queuer's `selected_game` strings (`Gold & Silver`, `HGSS`…) are the *edition/folder* vocabulary. Both vocabularies
   are declared per GameModule; nothing is renamed.

## ST/gen5 (2026-11-04)

`ST/gen5/pokemon_{black,white,black_2,white_2}_ne.{xml,js}` are generated from the upstream `STANDARD/gen5` files by
`tools/mappers/make-gen5-st.py`, so an upstream update can't undo them: after one, re-run the script (it stops if an edit no
longer applies). Property paths are the same plus `battle.opponent_2.pkmn_ram`, `.active_pokemon`, `.party_position` and
`battle.TESTING.opponent_2_indirect_1`. Gen5's profiles accept both families; pick `ST/gen5` in the queuer.

What was wrong upstream, each read from real battles in Super Shuckie replays:

- **Battle records with an ally or second opponent.** Normally the records are player, opponent, then both again. With an
  ally or second opponent they are player x2, opponent x2, ally x2, second opponent x2, so the upstream opponent records were
  the player's second copy. The second copy has a result before its animation; the first is what the screen shows.
- **`battle.ally.team_count`:** Black/White had White 2's address and White 2/Black 2 had Black's. It read 0 or junk, which broke
  `outcome_flags` and `battle_state_ready`, so `meta.state` stuck on "To Battle" (the script's own TODO).
- **Black 2 only:** `outcome_flags` and `battle_state_ready` took the 0x40 offset off twice, the pointer tables used an old base
  (0x2257494), and the script set `battle_ram_*_0` before comparing them, so its "changed?" test was always false.
- Pointer tables are 0x1C apart per client; client 3 is the second opponent.

**Checked in real memory:** Black, White and White 2, two-trainer fights from start to end, against the screen and against
`K:\Programs\pokemon-data` trainer tables. Upstream vs fixed on frozen frames (single, double, wild, overworld, full party):
every shared property equal, except `ally.team_count` and clock seconds.

**Black 2 is White 2 at a fixed offset:** every game address is 0x40 lower. `tools/mappers/check-black-2-offset.py` compares all
489 XML addresses and the script, so run it after `make-gen5-st.py`. Black 2 has no replays, so its battles were never watched;
they rest on that offset. Its overworld was read on the real game (name, map, clock, position). Triple and rotation battles were
not seen. White 2's `options.difficulty_keys` and `patch.*` are absent from Black 2 on purpose: `difficulty_keys` is a code patch,
so the offset can't be assumed, and the overlay writes to both.

`overworld.x/y/z` (White 2: 0x223B488, +8, +4; tiles x 0x10000) were found by walking, and replaced addresses that read junk in
White 2 and 0 in Black 2. Black/White keep upstream's.

`battle.field.weather` and `weather_count` (White 2: 0x21DD928, +4) replaced an address that read junk: upstream added the White 2
offset to Black's address. Found by injecting weather moves (`docs/parity-harness.md`) in Elite Four fights: 0 and 255 from battle
start, then the weather and its turns. Black's 0x21F63F4 was proven the same way against N (Rain 2, turns 4, 3, 2, 1, 0). White's
(+0x20) shows the same 0, 255 in real battles but no weather was run. Black 2's is White 2's less 0x40, not run.

`battle.opponent_2.party_position` is an index only during the battle (the script clamps it to 0 otherwise).
`containerprocessor` in the White 2 and Black 2 scripts writes to Black's party address (0x22349B4); that is unchecked.
