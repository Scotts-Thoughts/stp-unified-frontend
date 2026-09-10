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
