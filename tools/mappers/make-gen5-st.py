"""Generate ST/gen5/pokemon_<game>_ne.{xml,js} from STANDARD/gen5, so a mapper update can't undo the fixes.

Windows, Git Bash python: python tools/mappers/make-gen5-st.py
Facts behind each edit are in docs/mapper-matrix.md ("ST/gen5"); they were read from real battles in Super Shuckie replays.
"""
import os, re, uuid

M = "/c/Users/scott/AppData/Roaming/PokeAByte/Mappers/"
GAMES = {
    # game: (name, version_offset text for the JS constant, pointer-table base expression (client 0), bw?)
    "black":   ("STP Pokemon Black",   "0x2269838 + {version_offset}", True),
    "white":   ("STP Pokemon White",   "0x2269838 + {version_offset}", True),
    "black_2": ("STP Pokemon Black 2", "0x22573AC - 0x40", False),
    "white_2": ("STP Pokemon White 2", "0x22573AC", False),
}
UUIDS = {"black": "5c7a2e10-4f0b-4b6e-9c11-0b5e1a7d5001", "white": "5c7a2e10-4f0b-4b6e-9c11-0b5e1a7d5002",
         "black_2": "5c7a2e10-4f0b-4b6e-9c11-0b5e1a7d5003", "white_2": "5c7a2e10-4f0b-4b6e-9c11-0b5e1a7d5004"}
os.makedirs(M + "ST/gen5", exist_ok=True)


def once(t, a, b, what):
    n = t.count(a)
    assert n == 1, (what, n, a[:80])
    return t.replace(a, b)


for g, (name, table, bw) in GAMES.items():
    x = open(f"{M}STANDARD/gen5/pokemon_{g}.xml", encoding="utf8", newline="").read()
    j = open(f"{M}STANDARD/gen5/pokemon_{g}.js", encoding="utf8", newline="").read()
    nl = "\r\n" if "\r\n" in x else "\n"
    jnl = "\r\n" if "\r\n" in j else "\n"

    # ---- XML
    x, c = re.subn(r'<mapper id="[^"]+" name="[^"]+"', f'<mapper id="{UUIDS[g]}" name="{name}"', x, count=1)
    assert c == 1
    if bw:
        # Black/White had White 2's address for the ally's team count, so it read 0 and every battle-RAM sum that
        # includes the ally was wrong (the outcome flags, and with them meta.state).
        x = once(x, 'address="0x2257DA0 + (0x560 * 5) + {version_offset} + 0x14 - 4"', 'address="0x226A220 + (0x560 * 5) + 0x14 - 4 + {version_offset}"', "ally count")
    else:
        # ...and White 2 / Black 2 had Black's: the two were swapped.
        tail = " - 0x40" if g == "black_2" else ""
        x = once(x, f'address="0x226A220 + (0x560 * 5) + 0x14 - 4{tail}"', f'address="0x2257DA0 + (0x560 * 5) + 0x14 - 4{tail}"', "ally count")
    if g == "black_2":
        # The offset is already in outcome_flags_offset (the script's base address), so these took it off twice.
        x = once(x, '{outcome_flags_offset} + 0xDE - 0x40', '{outcome_flags_offset} + 0xDE', "outcome flags")
        x = once(x, '{outcome_flags_offset} + 0x38 - 0x40', '{outcome_flags_offset} + 0x38', "state ready")
        # An old address for the pointer tables: every other battle address is White 2's less 0x40.
        n = x.count("0x2257494 - 0x40")
        assert n == 12, n
        x = x.replace("0x2257494 - 0x40", "0x22573AC - 0x40")

    if not bw:
        # The real position, found by walking: x, z, y next to the player's name, in tiles * 0x10000. Upstream's addresses
        # read junk in White 2 and 0 in Black 2.
        tail = " - 0x40" if g == "black_2" else ""
        old = ("0x2148DA6", "0x2148DAE", "0x2148DB6") if g == "black_2" else ("0x224F910", "0x224F918", "0x224F914")
        for o, n in zip(old, ("0x223B488", "0x223B490", "0x223B48C")):
            x = once(x, f'address="{o}"', f'address="{n}{tail}"', "position")
        # Weather, found by injecting each weather move and fighting (docs/parity-harness.md). Upstream added the
        # White 2 offset to Black's address and read junk. Black and White's own address was proven the same way.
        x = once(x, 'address="0x21F63F4 + 0x1248C"', f'address="0x21DD928{tail}"', "weather")
        x = once(x, 'address="0x21F63F8 + 0x1248C"', f'address="0x21DD92C{tail}"', "weather count")

    # The second trainer's "who is out" pointer: tables are 0x1C apart, client 3 is the second opponent.
    m = re.search(r'([ \t]*)<property name="opponent_indirect_6"[^\n]*\n', x)
    line = f'{m.group(1)}<property name="opponent_2_indirect_1" type="int" address="{table} + (0x1C * 3)" length="4" />{nl}'
    x = x[:m.end()] + line + x[m.end():]

    # The second trainer's battle records, as the first trainer's.
    i = x.index("<opponent_2>")
    e = x.index("</opponent_2>", i)
    block = x[i:e]
    tabs = "\t\t\t\t"
    extra = f'{tabs}<property name="party_position" type="int" />{nl}'
    extra += f'{tabs}<class name="active_pokemon"   type="battle_structure" var:address="{{battle_ram_opponent_2_0}}" />{nl}'
    t_end = block.index("</team>")
    t_end = block.index("\n", t_end) + 1
    pk = f"{tabs}<pkmn_ram>{nl}"
    for s in range(6):
        pk += f'{tabs}\t<class name="pokemon_{s}_ram" type="battle_structure" var:address="{{battle_ram_opponent_2_{s}}}" />{nl}'
    pk += f"{tabs}</pkmn_ram>{nl}"
    block2 = block[:t_end] + pk + block[t_end:]
    t_start = block2.index(tabs + "<team>")
    block2 = block2[:t_start] + extra + block2[t_start:]
    x = x[:i] + block2 + x[e:]

    # ---- script
    # the two lines that made Black 2's "addresses changed?" test always false
    if g == "black_2":
        j, c = re.subn(r"(0x224B688 \+ \(0x560 \* \d\) \+ 0x14),", lambda m: m.group(1) + " - black2_version_offset,", j)
        assert c == 9, c
        j, c = re.subn(r"[ \t]*variables\.battle_ram_player_0\s+= battle_ram_starting_address\r?\n[ \t]*variables\.battle_ram_opponent_0\s+= enemy_battle_ram_start\r?\n(?=\s*\r?\n?[ \t]*let additional_offset)", "", j, count=1)
        assert c == 1, "b2 lines"
    j, c = re.subn(r"[ \t]*const enemy_battle_ram_start\s+= battle_ram_starting_address \+ player_structure_size\r?\n", "", j, count=1)
    assert c == 1
    j, c = re.subn(r"[ \t]*const player_structure_size\s+= player_team_count \* pkmn_ram_allocation\r?\n", "", j, count=1)
    assert c == 1

    calc = f"""
    // Battle records, read from real memory. Two sides (single, double, triple, wild): player, opponent, then both again.
    // With an ally or a second opponent: each of player, opponent, ally, second opponent twice in a row. In both layouts
    // the first copy is what the screen shows; the second has the result before its animation plays.
    const records_per_mon = (ally_team_count || opponent_2_team_count) ? 2 : 1;
    const enemy_battle_ram_start      = battle_ram_starting_address + (player_team_count * pkmn_ram_allocation * records_per_mon);
    const ally_battle_ram_start       = enemy_battle_ram_start + (opponent_team_count * pkmn_ram_allocation * records_per_mon);
    const opponent_2_battle_ram_start = ally_battle_ram_start + (ally_team_count * pkmn_ram_allocation * records_per_mon);
""".replace("\n", jnl)
    j, c = re.subn(r"(\r?\n)([ \t]*)let outcome_flags_address =", lambda m: calc + m.group(2) + "let outcome_flags_address =", j, count=1)
    assert c == 1
    j = once(j, "|| variables.battle_ram_opponent_0 != enemy_battle_ram_start", "|| variables.battle_ram_opponent_0 != enemy_battle_ram_start" + jnl + "        || variables.battle_ram_opponent_2_0 != (opponent_2_team_count ? opponent_2_battle_ram_start : null_data_address)", "reload")
    j, c = re.subn(r"([ \t]*)for \(let i = 1; i < 6; i\+\+\) \{\r?\n[ \t]*variables\[`battle_ram_opponent_\$\{i\}`\][^\n]*\n[ \t]*\}\r?\n",
                   lambda m: m.group(0) + m.group(1) + "for (let i = 0; i < 6; i++) {" + jnl + m.group(1) + "    variables[`battle_ram_opponent_2_${i}`] = opponent_2_team_count > i ? opponent_2_battle_ram_start + (pkmn_ram_allocation * i) : null_data_address" + jnl + m.group(1) + "}" + jnl, j, count=1)
    assert c == 1
    j = once(j, "setValue('battle.opponent.party_position', enemy_party_position);",
             "setValue('battle.opponent.party_position', enemy_party_position);" + jnl +
             "    // The table only points at records during the battle." + jnl +
             "    const opponent_2_party_position = (getValue('battle.TESTING.opponent_2_indirect_1') - (opponent_2_battle_ram_start + indirect_offset)) / 548;" + jnl +
             "    setValue('battle.opponent_2.party_position', Number.isInteger(opponent_2_party_position) && opponent_2_party_position >= 0 && opponent_2_party_position < 6 ? opponent_2_party_position : 0);", "position")
    open(f"{M}ST/gen5/pokemon_{g}_ne.xml", "w", encoding="utf8", newline="").write(x)
    open(f"{M}ST/gen5/pokemon_{g}_ne.js", "w", encoding="utf8", newline="").write(j)
    print("wrote", g)
