"""Patches the STANDARD 3DS mappers (X/Y, Omega Ruby/Alpha Sapphire, Sun/Moon, Ultra Sun/Ultra Moon), in place.

    python tools/mappers/make-3ds-mappers.py            patch %APPDATA%/PokeAByte/Mappers/STANDARD/gen6 and gen7
    python tools/mappers/make-3ds-mappers.py --dir <d>  patch another mappers folder (the folder holding STANDARD/)
    python tools/mappers/make-3ds-mappers.py --check    say what would be patched, change nothing

Each step is skipped where it is already in the file, and an edit that no longer applies stops the script before
anything is written. A mapper that gets any step goes to 0.3.0, from the stock 0.0.2, from 0.1.0 (steps 1-4 only) or
from 0.2.0 (steps 1-5), and all four move together (X/Y and OR/AS move to 0.3.0 although step 6 adds nothing to them), so the version numbers stay the same across X/Y, OR/AS, Sun/Moon and Ultra Sun/Ultra Moon.
Until Scott pushes these to the mappers repo, a Poke-A-Byte mapper update puts the stock files back: run this again.
Never push to the mappers repo yourself (docs/mapper-matrix.md). Everything here was read from Super Shuckie
replays (docs/gen6-inventory.md).

1. Name tables (all four). The stock 0.0.2 files carried gen 4's reference tables: 468 moves, 124 abilities (234 in
   Sun/Moon), 537 items and gen 4's type list. So any move after Shadow Force, any ability after Bad Dreams and any
   item after Enigma Stone read null (Scald, Protean, every Mega Stone), and types from Fire on were one off, with
   no Fairy. The tables are rebuilt from tools/mappers/data/refs-3ds.json. Six species names are corrected to the
   games' own spelling (Nidoran♀, Nidoran♂, Farfetch’d, Qwilfish, Ho-Oh, Treecko, Flabébé), which is also what
   the overlay's tables are keyed on.

2. Battle teams (X/Y and OR/AS). Stock: only `battle.player_active` / `battle.opponent_active`, found by walking the
   battle structs from the first one and taking the first struct with a player slot (0-5) and the first with an
   opponent slot (12-17). The structs lie in battle order, so once the opponent's lead fainted the "first opponent
   struct" was still the fainted lead and the next Pokemon never showed; `battle.player.team_count` was always 1.
   Now, from the battle object's own tables (object at [0x08000140]; six pointers per side in battle order, the
   Pokemon that is out first; +0xC from a pointer is its 0x244 struct, whose byte 13 is its party slot):
   - `battle.player_team.0-5` and `battle.opponent_team.0-5`: each side's battle structs by PARTY SLOT, with the
     gen 7 mappers' property names. The script copies them into memory containers; a slot with no Pokemon, and
     every slot while no battle is on, reads empty (species null, stages 0).
   - `battle.player_active` / `battle.opponent_active` and the `party_position`s follow the tables' first entry.
   - `battle.player.team_count` is the table's count.

3. The opposing trainer's name (all four): `battle.opponent.trainer_name`, `.trainer_class_name` and `.trainer`
   ("Youngster Joey"), read from the two strings the battle object points at, 0x10 and 0xC before the trainer id
   (X/Y, OR/AS: +0x948, +0x94C; Sun/Moon: +0xAF0, +0xAF4; Ultra Sun/Ultra Moon: +0xAF4, +0xAF8). null in a wild
   battle (trainer id 0) and outside battle. The mappers' `trainers` reference is Platinum's list and matches nothing.

4. Ultra Sun/Ultra Moon: a battle record's `level` read two bytes (a level 4 Pokemon with the next byte 1 read 260).

5. The starter write (all four): `player.encrypted_mon_0` (the lead's 232 stored bytes, encrypted, as memory holds
   them) and `player.encrypted_mon_0_stats` (its 28 party-stat bytes, slot + 0x158). The overlay reads both,
   decrypts, stamps the starter's nature, ability, gender and IVs, encrypts with the checksum worked out again and
   writes each back whole (games/gen6/logic/pk6.ts; docs/gen6-inventory.md, "Writing the starter").

6. The new game (Sun/Moon, Ultra Sun/Ultra Moon): `meta.save_loaded`, the byte at {save_block} + 0x82C. It is 0 on the
   title screen and before the first save exists, and turns 1 when a save is loaded (Continue) or created: in a new game
   that is the moment the language is confirmed, which is where these games start (no title-screen New Game without a
   save). The play-time clock only starts some three minutes later, after the intro. X/Y and OR/AS need nothing: their
   clock starts from 0:00:00 the moment the intro begins (docs/gen6-inventory.md, "The new game").
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OLD_VERSIONS, NEW_VERSION = ("0.0.2", "0.1.0", "0.2.0"), "0.3.0"

# file (under STANDARD/), move table, highest ability id, highest item id, gen 6 battle object,
# the trainer id's offset in the battle object as the script writes it, and where the game keeps the strings
MAPPERS = [
    ("gen6/pokemon_x_y", "moves_gen6", 188, 717, True, "0x958", ("BATTLE_OBJ_LO", "BATTLE_OBJ_HI")),
    ("gen6/pokemon_omega_ruby_alpha_sapphire", "moves_gen6", 191, 775, True, "0x958", ("BATTLE_OBJ_LO", "BATTLE_OBJ_HI")),
    ("gen7/pokemon_sun_moon", "moves_gen7", 232, 920, False, "0xB00", ("0x30000000", "0x30040000")),
    ("gen7/pokemon_ultra_sun_moon", "moves_gen7", 233, 959, False, "0xB04", ("0x30000000", "0x30040000")),
]

# The party's first slot (the mapper script's PARTY_BASE), per mapper: step 5 checks the script agrees.
PARTY_BASES = {
    "gen6/pokemon_x_y": "0x08CE1CE8",
    "gen6/pokemon_omega_ruby_alpha_sapphire": "0x08CF727C",
    "gen7/pokemon_sun_moon": "0x34195E10",
    "gen7/pokemon_ultra_sun_moon": "0x33F7FA44",
}
# The line before the player's <team> (a newline first, so the four-tab battle team_count lines do not match).
STARTER_ANCHOR = '\n\t\t\t<property name="team_count" type="int" />\n'
STARTER_PROPERTIES = (
    '\t\t\t<!-- The lead as memory holds it (encrypted): its 232 stored bytes, and its 28 party-stat bytes at slot + 0x158.\n'
    '\t\t\t     The overlay writes the starter through these (tools/mappers/make-3ds-mappers.py, stp-unified-frontend). -->\n'
    '\t\t\t<property name="encrypted_mon_0"       type="string" address="@BASE@" length="232" />\n'
    '\t\t\t<property name="encrypted_mon_0_stats" type="string" address="@BASE@ + 0x158" length="28" />\n'
)

# Step 6: the gen 7 mappers' <meta> block gets the byte that turns on when a save is loaded or created.
SAVE_LOADED_ANCHOR = '\t\t\t<property name="state_enemy"    type="string" />\n'
SAVE_LOADED_PROPERTY = (
    '\t\t\t<!-- 0 on the title screen and before the first save exists; 1 once a save is loaded or created (a new game:\n'
    '\t\t\t     the language confirmed). tools/mappers/make-3ds-mappers.py (stp-unified-frontend). -->\n'
    '\t\t\t<property name="save_loaded"    type="bool"   address="{save_block} + 0x82C" />\n'
)

USUM_LEVEL_OLD = '<property name="level"      address="{address} + 12"  type="int"  length="2" />'
USUM_LEVEL_NEW = '<property name="level"      address="{address} + 12"  type="int" />'

TYPES = ["Normal", "Fighting", "Flying", "Poison", "Ground", "Rock", "Bug", "Ghost", "Steel", "Fire", "Water", "Grass",
         "Electric", "Psychic", "Ice", "Dragon", "Dark", "Fairy"]

SPECIES_FIXES = {"Nidoran-F": "Nidoran♀", "Nidoran-M": "Nidoran♂", "Farfetch'd": "Farfetch’d", "Qwillfish": "Qwilfish",
                 "Ho-oh": "Ho-Oh", "Treeko": "Treecko", "Flabebe": "Flabébé"}

REFERENCES_MARK = "<!-- 3DS name tables: tools/mappers/make-3ds-mappers.py (stp-unified-frontend) -->"

TEAM_CLASS = '''
		<!--
		battle_team_pokemon: one battle struct (the 0x244 layout of battle_pokemon above) as the script copies it into
		a memory container, by party slot. A slot with no Pokemon, and every slot while no battle is on, reads empty
		(species null, stat stages 0). Same property names as the gen 7 mappers' battle.player_team / opponent_team.
		-->
		<battle_team_pokemon>
			<property name="species"    address="0"   memoryContainer="{memoryContainer}" type="int" length="2" reference="species" />
			<property name="hp_max"     address="2"   memoryContainer="{memoryContainer}" type="int" length="2" />
			<property name="hp"         address="4"   memoryContainer="{memoryContainer}" type="int" length="2" />
			<property name="held_item"  address="6"   memoryContainer="{memoryContainer}" type="int" length="2" reference="items" />
			<property name="ability"    address="10"  memoryContainer="{memoryContainer}" type="int" length="2" reference="abilities" />
			<property name="level"      address="12"  memoryContainer="{memoryContainer}" type="int" />
			<stats>
				<property name="hp"              address="4"   memoryContainer="{memoryContainer}" type="int" length="2" />
				<property name="hp_max"          address="2"   memoryContainer="{memoryContainer}" type="int" length="2" />
				<property name="attack"          address="234" memoryContainer="{memoryContainer}" type="int" length="2" />
				<property name="defense"         address="236" memoryContainer="{memoryContainer}" type="int" length="2" />
				<property name="special_attack"  address="238" memoryContainer="{memoryContainer}" type="int" length="2" />
				<property name="special_defense" address="240" memoryContainer="{memoryContainer}" type="int" length="2" />
				<property name="speed"           address="242" memoryContainer="{memoryContainer}" type="int" length="2" />
			</stats>
			<modifiers>
				<property name="attack"          address="248" memoryContainer="{memoryContainer}" type="int" reference="stage_modifiers" />
				<property name="defense"         address="249" memoryContainer="{memoryContainer}" type="int" reference="stage_modifiers" />
				<property name="special_attack"  address="250" memoryContainer="{memoryContainer}" type="int" reference="stage_modifiers" />
				<property name="special_defense" address="251" memoryContainer="{memoryContainer}" type="int" reference="stage_modifiers" />
				<property name="speed"           address="252" memoryContainer="{memoryContainer}" type="int" reference="stage_modifiers" />
				<property name="accuracy"        address="253" memoryContainer="{memoryContainer}" type="int" reference="stage_modifiers" />
				<property name="evasion"         address="254" memoryContainer="{memoryContainer}" type="int" reference="stage_modifiers" />
			</modifiers>
			<move_0>
				<property name="id"     address="266" memoryContainer="{memoryContainer}" type="int" length="2" reference="moves" />
				<property name="pp"     address="268" memoryContainer="{memoryContainer}" type="int" />
				<property name="pp_max" address="269" memoryContainer="{memoryContainer}" type="int" />
			</move_0>
			<move_1>
				<property name="id"     address="280" memoryContainer="{memoryContainer}" type="int" length="2" reference="moves" />
				<property name="pp"     address="282" memoryContainer="{memoryContainer}" type="int" />
				<property name="pp_max" address="283" memoryContainer="{memoryContainer}" type="int" />
			</move_1>
			<move_2>
				<property name="id"     address="294" memoryContainer="{memoryContainer}" type="int" length="2" reference="moves" />
				<property name="pp"     address="296" memoryContainer="{memoryContainer}" type="int" />
				<property name="pp_max" address="297" memoryContainer="{memoryContainer}" type="int" />
			</move_2>
			<move_3>
				<property name="id"     address="308" memoryContainer="{memoryContainer}" type="int" length="2" reference="moves" />
				<property name="pp"     address="310" memoryContainer="{memoryContainer}" type="int" />
				<property name="pp_max" address="311" memoryContainer="{memoryContainer}" type="int" />
			</move_3>
		</battle_team_pokemon>
'''

TEAM_PROPERTIES = '''			<!-- Each side's battle structs by party slot (filled by the script; empty outside battle) -->
			<player_team>
''' + "".join(f'				<class name="{i}" type="battle_team_pokemon" var:memoryContainer="battle_player_team_{i}" />\n' for i in range(6)) + '''			</player_team>
			<opponent_team>
''' + "".join(f'				<class name="{i}" type="battle_team_pokemon" var:memoryContainer="battle_opponent_team_{i}" />\n' for i in range(6)) + '''			</opponent_team>
'''

JS_CONSTANTS = '''
// The battle object's party tables: six pointers per side in battle order (the Pokemon that is out first),
// then the side's count. A pointer + BATTLE_DELTA is a 0x244 battle struct; its byte 13 is the party slot
// (0-5 player, 12-17 opponent).
const TEAM_PLAYER_TABLE = 0x160;
const TEAM_OPPONENT_TABLE = 0x17C;
const TEAM_COUNT_OFFSET = 0x18;
const TEAM_COPY_SIZE = 0x138;
const TEAM_STAGES_START = 248;
const TEAM_STAGES_END = 254;
const TEAM_NEUTRAL_STAGE = 6;
const MAX_SPECIES = 721;
'''

JS_RESOLVE = '''function emptyBattler() {
    const bytes = new Array(TEAM_COPY_SIZE).fill(0x00);
    for (let i = TEAM_STAGES_START; i <= TEAM_STAGES_END; i++) {
        bytes[i] = TEAM_NEUTRAL_STAGE;
    }
    return bytes;
}

// One side's battle structs: `addrs[party slot]` (0 for none) and `order`, the party slots in battle order.
function readTeam(obj, table, slotBase) {
    const team = { addrs: [0, 0, 0, 0, 0, 0], order: [], count: 0 };
    if (!obj) {
        return team;
    }
    try {
        const count = readU32Addr(obj + table + TEAM_COUNT_OFFSET);
        if (count < 1 || count > 6) {
            return team;
        }
        for (let i = 0; i < count; i++) {
            const ptr = readU32Addr(obj + table + 4 * i);
            if (ptr < BATTLE_OBJ_LO || ptr + BATTLE_DELTA + BATTLE_SLOT > BATTLE_OBJ_HI) {
                continue;
            }
            const addr = ptr + BATTLE_DELTA;
            const species = readU16Addr(addr);
            const slot = memory.defaultNamespace.get_bytes(addr + 13, 1).get_byte(0) - slotBase;
            if (species < 1 || species > MAX_SPECIES || slot < 0 || slot > 5 || team.addrs[slot]) {
                continue;
            }
            team.addrs[slot] = addr;
            team.order.push(slot);
        }
        team.count = count;
    } catch (e) {}
    return team;
}

function fillTeam(name, team) {
    for (let slot = 0; slot < 6; slot++) {
        let bytes = null;
        if (team.addrs[slot]) {
            try {
                const data = memory.defaultNamespace.get_bytes(team.addrs[slot], TEAM_COPY_SIZE);
                bytes = new Array(TEAM_COPY_SIZE);
                for (let i = 0; i < TEAM_COPY_SIZE; i++) {
                    bytes[i] = data.get_byte(i);
                }
            } catch (e) {
                bytes = null;
            }
        }
        memory.fill(`${name}_${slot}`, 0x00, bytes || emptyBattler());
    }
}

function resolveActiveBattlers() {
    const obj = battleObject();
    const player = readTeam(obj, TEAM_PLAYER_TABLE, 0);
    const opponent = readTeam(obj, TEAM_OPPONENT_TABLE, 12);
    let playerAddr = 0x081FB000 + BATTLE_DELTA;
    let enemyAddr = playerAddr + BATTLE_SLOT;
    if (player.order.length) {
        playerAddr = player.addrs[player.order[0]];
        safeSet("battle.party_position", player.order[0]);
        safeSet("battle.player.party_position", player.order[0]);
    }
    if (opponent.order.length) {
        enemyAddr = opponent.addrs[opponent.order[0]];
        safeSet("battle.opponent.party_position", opponent.order[0]);
    }
    bindActive("player_active", playerAddr);
    bindActive("opponent_active", enemyAddr);
    // Outside battle the twelve containers are emptied once, not every poll.
    if (obj || variables.battle_teams_filled !== 0) {
        fillTeam("battle_player_team", player);
        fillTeam("battle_opponent_team", opponent);
        variables.battle_teams_filled = obj ? 1 : 0;
    }
    variables.battle_player_count = player.count;
}

'''

TRAINER_PROPERTIES = '''				<!-- The opposing trainer's own strings from the battle object: "Joey", "Youngster", "Youngster Joey".
				     null in a wild battle and outside battle. (The `trainers` reference below is Platinum's list.) -->
				<property name="trainer" type="string" />
				<property name="trainer_name" type="string" />
				<property name="trainer_class_name" type="string" />
'''

JS_TRAINER_CONSTANTS = '''
// The opposing trainer's name and class: two string objects the battle object points at, 0x10 and 0xC before
// the trainer id. A string object holds a pointer to its UTF-16 text at +4 and the text's length at +10.
const TRAINER_ID = @ID@;
const TRAINER_NAME_STRING = TRAINER_ID - 0x10;
const TRAINER_CLASS_STRING = TRAINER_ID - 0xC;
const TRAINER_TEXT_LO = @LO@;
const TRAINER_TEXT_HI = @HI@;
const TRAINER_TEXT_MAX = 32;

function readGameString(ptr) {
    try {
        if (ptr < TRAINER_TEXT_LO || ptr + 12 > TRAINER_TEXT_HI) {
            return null;
        }
        const chars = readU32Addr(ptr + 4);
        const length = readU16Addr(ptr + 10);
        if (length < 1 || length > TRAINER_TEXT_MAX || chars < TRAINER_TEXT_LO || chars + length * 2 > TRAINER_TEXT_HI) {
            return null;
        }
        const data = memory.defaultNamespace.get_bytes(chars, length * 2);
        let text = "";
        for (let i = 0; i < length; i++) {
            const code = data.get_uint16_le(i * 2);
            if (code === 0) {
                break;
            }
            // The games' own codes for the gender signs.
            text += code === 0xE08E ? "\\u2642" : code === 0xE08F ? "\\u2640" : String.fromCharCode(code);
        }
        return text || null;
    } catch (e) {
        return null;
    }
}

function resolveTrainerName(obj, id) {
    const name = obj && id ? readGameString(readU32Addr(obj + TRAINER_NAME_STRING)) : null;
    const trainerClass = obj && id ? readGameString(readU32Addr(obj + TRAINER_CLASS_STRING)) : null;
    safeSet("battle.opponent.trainer_name", name);
    safeSet("battle.opponent.trainer_class_name", trainerClass);
    safeSet("battle.opponent.trainer", name ? (trainerClass ? trainerClass + " " + name : name) : null);
}
'''


def fail(message):
    sys.exit(f"make-3ds-mappers: {message}")


def replace_once(text, old, new, what):
    if text.count(old) != 1:
        fail(f"{what}: expected one match, found {text.count(old)}")
    return text.replace(old, new)


def xml_escape(value):
    return value.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;")


def table(name, entries):
    """A reference block: `entries` is (key text, value or None) in id order."""
    lines = [f"\t\t<{name}>\n"]
    for key, value in entries:
        lines.append(f'\t\t\t<entry key="{key}" />\n' if value is None else f'\t\t\t<entry key="{key}" value="{xml_escape(value)}" />\n')
    lines.append(f"\t\t</{name}>\n")
    return "".join(lines)


def replace_reference(text, name, block):
    start = text.index("<references>")
    pattern = re.compile(r"\t\t<" + name + r">\n.*?\t\t</" + name + r">\n", re.S)
    matches = list(pattern.finditer(text, start))
    if len(matches) != 1:
        fail(f"reference <{name}>: expected one block, found {len(matches)}")
    return text[:matches[0].start()] + block + text[matches[0].end():], matches[0].group(0)


def patch_references(xml, refs, moves_key, max_ability, max_item):
    moves = refs[moves_key].split("|")
    abilities = refs["abilities"].split("|")[:max_ability + 1]
    new_items = refs["items"].split("|")
    xml, _ = replace_reference(xml, "moves", table("moves", [(str(i), None if i == 0 else n) for i, n in enumerate(moves)]))
    xml, _ = replace_reference(xml, "abilities", table("abilities", [(str(i), None if i == 0 else n) for i, n in enumerate(abilities)]))
    xml, _ = replace_reference(xml, "pokemon_types", table("pokemon_types", [(f"0x{i:02X}", n) for i, n in enumerate(TYPES)]))
    # Items 0-536 stay as the file has them; the list grows from 537.
    start = xml.index("<references>")
    block = re.search(r"\t\t<items>\n(.*?)\t\t</items>\n", xml[start:], re.S)
    if not block:
        fail("reference <items> not found")
    old = re.findall(r'<entry key="(0x[0-9A-Fa-f]+)"(?:\s+value="([^"]*)")?\s*/>', block.group(1))
    if len(old) < refs["items_from"]:
        fail(f"reference <items>: {len(old)} entries, expected at least {refs['items_from']}")
    entries = [(key, None if value == "" else value) for key, value in old[:refs["items_from"]]]
    for index, name in enumerate(new_items, start=refs["items_from"]):
        if index > max_item:
            break
        entries.append((f"0x{index:04X}", name))
    lines = ["\t\t<items>\n"]
    for key, value in entries:
        # Old values are already XML text; new ones are escaped.
        lines.append(f'\t\t\t<entry key="{key}" />\n' if value is None else f'\t\t\t<entry key="{key}" value="{value}" />\n')
    lines.append("\t\t</items>\n")
    xml = xml[:start + block.start()] + "".join(lines) + xml[start + block.end():]
    for wrong, right in SPECIES_FIXES.items():
        xml = re.sub(r'(<entry key="0x[0-9A-Fa-f]{4}" value=")' + re.escape(xml_escape(wrong)) + r'("\s*/>)', lambda m: m.group(1) + right + m.group(2), xml)
    return replace_once(xml, "\t<references>\n", "\t<references>\n\t\t" + REFERENCES_MARK + "\n", "references start")


def patch_teams_xml(xml):
    xml = replace_once(xml, "\t\t</battle_pokemon>\n", "\t\t</battle_pokemon>\n" + TEAM_CLASS, "battle_pokemon class end")
    anchor = '\t\t\t<class name="opponent_active" type="battle_pokemon" var:address="{opponent_active}" />\n'
    return replace_once(xml, anchor, anchor + TEAM_PROPERTIES, "opponent_active property")


def patch_teams_js(js):
    js = replace_once(js, "const BATTLE_DELTA = 0xC;\n", "const BATTLE_DELTA = 0xC;\n" + JS_CONSTANTS, "BATTLE_DELTA")
    match = re.search(r"function resolveActiveBattlers\(\) \{\n.*?\n\}\n\n(?=function resolveBattle\(\))", js, re.S)
    if not match:
        fail("resolveActiveBattlers not found")
    js = js[:match.start()] + JS_RESOLVE + js[match.end():]
    return replace_once(js, 'safeSet("battle.player.team_count", 1);',
                        'safeSet("battle.player.team_count", variables.battle_player_count || 1);', "player team_count")


def patch_trainer_xml(xml):
    anchor = '\t\t\t\t<property name="trainer_class" type="int" />\n'
    return replace_once(xml, anchor, anchor + TRAINER_PROPERTIES, "opponent trainer_class property")


def patch_trainer_js(js, id_offset, text_range):
    constants = JS_TRAINER_CONSTANTS.lstrip("\n").replace("@ID@", id_offset).replace("@LO@", text_range[0]).replace("@HI@", text_range[1])
    js = replace_once(js, "function resolveBattle() {\n", constants + "\nfunction resolveBattle() {\n", "resolveBattle")
    js = replace_once(js, '        safeSet("battle.opponent.trainer_class", 0);\n',
                      '        safeSet("battle.opponent.trainer_class", 0);\n        resolveTrainerName(0, 0);\n', "trainer_class reset")
    id_line = f'        safeSet("battle.opponent.id", readU16Addr(obj + {id_offset}));\n'
    return replace_once(js, id_line, id_line + "        resolveTrainerName(obj, readU16Addr(obj + TRAINER_ID));\n", "opponent id read")


def main():
    args = sys.argv[1:]
    check = "--check" in args
    base = os.path.join(os.environ.get("APPDATA", ""), "PokeAByte", "Mappers")
    if "--dir" in args:
        base = args[args.index("--dir") + 1]
    with open(os.path.join(HERE, "data", "refs-3ds.json"), encoding="utf-8") as f:
        refs = json.load(f)
    writes = []
    for name, moves_key, max_ability, max_item, gen6, id_offset, text_range in MAPPERS:
        xml_path = os.path.join(base, "STANDARD", name + ".xml")
        js_path = os.path.join(base, "STANDARD", name + ".js")
        with open(xml_path, encoding="utf-8", newline="") as f:
            xml = old_xml = f.read()
        with open(js_path, encoding="utf-8", newline="") as f:
            js = old_js = f.read()
        steps = []
        if REFERENCES_MARK not in xml:
            xml = patch_references(xml, refs, moves_key, max_ability, max_item)
            steps.append("name tables")
        if gen6:
            has_xml, has_js = "battle_team_pokemon" in xml, "function readTeam" in js
            if has_xml != has_js:
                fail(f"{name}: battle teams half patched (.xml and .js disagree); restore both from the mappers repo first")
            if not has_xml:
                xml, js = patch_teams_xml(xml), patch_teams_js(js)
                steps.append("battle teams")
        has_xml, has_js = 'name="trainer_class_name"' in xml, "function resolveTrainerName" in js
        if has_xml != has_js:
            fail(f"{name}: trainer name half patched (.xml and .js disagree); restore both from the mappers repo first")
        if not has_xml:
            xml, js = patch_trainer_xml(xml), patch_trainer_js(js, id_offset, text_range)
            steps.append("trainer name")
        if 'name="encrypted_mon_0"' not in xml:
            if f"const PARTY_BASE = {PARTY_BASES[name]};" not in js:
                fail(f"{name}: the script's PARTY_BASE is not {PARTY_BASES[name]}; check the party address before adding the starter write")
            xml = replace_once(xml, STARTER_ANCHOR, STARTER_ANCHOR + STARTER_PROPERTIES.replace("@BASE@", PARTY_BASES[name]), "player team_count")
            steps.append("starter write")
        if not gen6 and 'name="save_loaded"' not in xml:
            xml = replace_once(xml, SAVE_LOADED_ANCHOR, SAVE_LOADED_ANCHOR + SAVE_LOADED_PROPERTY, "meta state_enemy")
            steps.append("new game byte")
        if gen6 and steps == [] and 'platform="3DS" version="0.2.0"' in xml:
            steps.append("(nothing new)")
        if USUM_LEVEL_OLD in xml:
            xml = replace_once(xml, USUM_LEVEL_OLD, USUM_LEVEL_NEW, "battle level")
            steps.append("battle level (one byte)")
        for old_version in OLD_VERSIONS:
            if steps and f'platform="3DS" version="{old_version}"' in xml:
                xml = replace_once(xml, f'platform="3DS" version="{old_version}"', f'platform="3DS" version="{NEW_VERSION}"', "version")
                steps.append(f"version {old_version} -> {NEW_VERSION}")
        print(f"{name}: {', '.join(steps) if steps else 'already patched'}{' (not written)' if check and steps else ''}")
        if xml != old_xml:
            writes.append((xml_path, xml))
        if js != old_js:
            writes.append((js_path, js))
    if check:
        return
    for path, text in writes:
        with open(path, "w", encoding="utf-8", newline="") as f:
            f.write(text)
    # Poke-A-Byte lists each mapper's version in mapper_tree.json.
    tree_path = os.path.join(base, "mapper_tree.json")
    if os.path.exists(tree_path):
        with open(tree_path, encoding="utf-8", newline="") as f:
            tree = old_tree = f.read()
        for name, *_rest in MAPPERS:
            for old_version in OLD_VERSIONS:
                pattern = re.compile(r'("path":"STANDARD/' + re.escape(name) + r'\.xml"[^{}]*?"version":")' + re.escape(old_version) + r'(")')
                tree = pattern.sub(lambda m: m.group(1) + NEW_VERSION + m.group(2), tree)
        if tree != old_tree:
            with open(tree_path, "w", encoding="utf-8", newline="") as f:
                f.write(tree)
            print("mapper_tree.json: versions updated")


if __name__ == "__main__":
    main()
