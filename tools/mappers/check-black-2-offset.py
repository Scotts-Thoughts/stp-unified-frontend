"""Check that ST/gen5 Black 2 is White 2 with every game address 0x40 lower. Run after make-gen5-st.py.

Windows, Git Bash python: python tools/mappers/check-black-2-offset.py
Exits 1 and lists anything else. White 2's extra patch and difficulty_keys properties are deliberate: see docs/mapper-matrix.md.
"""
import re, sys
import xml.etree.ElementTree as ET

D = "/c/Users/scott/AppData/Roaming/PokeAByte/Mappers/ST/gen5/"
OFFSET = -0x40
RAM = 0x2000000
ONLY_WHITE_2 = re.compile(r"mapper/(properties/options/difficulty_keys|properties/patch/|references/difficulty_keys_list)")
CONST = re.compile(r"^[0-9A-Fa-fx+\-*() \t]+$")


def walk(el, path, out):
    p = path + [el.attrib.get("name", el.tag.split("}")[-1])]
    key = base = "/".join(p)
    n = 2
    while key in out:
        key, n = f"{base}#{n}", n + 1
    out[key] = {a.split("}")[-1]: v for a, v in el.attrib.items()}
    for c in el:
        walk(c, p, out)


def load(game):
    root = ET.parse(f"{D}pokemon_{game}_ne.xml").getroot()
    root.attrib.pop("name")
    out = {}
    walk(root, [], out)
    return out


def number(s):
    if not CONST.match(s or ""):
        return None
    try:
        r = eval(s, {"__builtins__": {}}, {})
    except Exception:
        return None
    return r if isinstance(r, int) else None


w, b = load("white_2"), load("black_2")
bad = [f"only in Black 2: {k}" for k in b if k not in w]
bad += [f"only in White 2: {k}" for k in w if k not in b and not ONLY_WHITE_2.match(k)]
checked = 0
for k in w:
    if k not in b:
        continue
    for attr in sorted((set(w[k]) | set(b[k])) - {"id", "description"}):
        x, y = w[k].get(attr), b[k].get(attr)
        nx, ny = number(x), number(y)
        if nx is not None and ny is not None and max(nx, ny) >= RAM:
            checked += 1
            if ny - nx != OFFSET:
                bad.append(f"{k} {attr}: {x} / {y}")
        elif x != y and k != "mapper/properties/meta/game_name" and "party_position" not in k:
            bad.append(f"{k} {attr}: {x} / {y}")

js = [open(f"{D}pokemon_{g}_ne.js", encoding="utf8").read().splitlines() for g in ("white_2", "black_2")]
if len(js[0]) != len(js[1]):
    bad.append("scripts differ in length")
for i, (x, y) in enumerate(zip(*js), 1):
    if "black2_version_offset" in y and "const black2_version_offset" not in y:
        if x.strip() == y.strip():
            continue
    if x.strip() != y.strip() and y.replace(" - black2_version_offset", "").strip() != x.replace(" - black2_version_offset", "").strip() and "const black2_version_offset" not in y:
        bad.append(f"script line {i}: {y.strip()[:100]}")
for i, line in enumerate(js[1], 1):
    code = line.split("//")[0]
    if re.search(r"0x2[0-9A-Fa-f]{6}", code) and "black2_version_offset" not in code and "0x22349B4" not in code:
        bad.append(f"script line {i} has no offset: {code.strip()[:100]}")

print(f"{checked} addresses compared")
print("\n".join(bad) or "all at the fixed offset")
sys.exit(1 if bad else 0)
