"""Imports the gen 6 and gen 7 species art from Scott's art library into the image pool.

    py tools/gen6/import-art.py [--library "A:/Dropbox/stp-projects/libraries/pokemon"] [--force]

Writes src/renderer/public/images/gen6/pokemon/<Name>.webp (lossless WebP, 600x600 like gen5's pool; the library
art is 1280x1280), named by the species or form's name in the Pokedex tables (games/gen6/data/pokedex/). Gen 1-5
species keep using gen5's pictures (tools/gen6/build-data.mjs writes the lookup, species_art.js: run it after
this). A picture that already exists is left alone unless --force. Needs Pillow.

What is taken:
- library gen6/ and gen7/: `NNN<anything>.png` is the species with that National Dex number (the library's own
  names have typos: 698Aramura, 719Diancle, 720Hoopla), 650-807 only;
- gen6/ form files: 681-blade, 719-mega, 720-unbound;
- "mega evolutions/": `NNNN<Species>-Mega[_X|_Y].png` for the Megas the 3DS games have;
- "regional forms/": `Alolan-<Species>.png`.
"""
import json
import os
import re
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "src", "renderer", "public", "images", "gen6", "pokemon")
DEX = os.path.join(ROOT, "src", "renderer", "games", "gen6", "data", "pokedex", "ultra_sun_ultra_moon.js")
SIZE = 600

args = sys.argv[1:]
LIBRARY = args[args.index("--library") + 1] if "--library" in args else "A:/Dropbox/stp-projects/libraries/pokemon"
FORCE = "--force" in args

FORM_FILES = {"681-blade": "Aegislash (Blade)", "719-mega": "Mega Diancie", "720-unbound": "Hoopa (Unbound)"}


def dex_names():
    """National Dex number -> base species name, and every name in the table."""
    text = open(DEX, encoding="utf-8").read()
    by_number, names = {}, set()
    for match in re.finditer(r'"species":\s*"([^"]+)",\s*"rom_id":\s*\d+,\s*"national_dex_number":\s*(\d+)', text):
        name, number = json.loads('"' + match.group(1) + '"'), int(match.group(2))
        names.add(name)
        if not re.match(r"(Mega|Primal|Alolan) ", name) and "(" not in name:
            by_number.setdefault(number, name)
    if len(by_number) < 800:
        sys.exit(f"import-art: only {len(by_number)} species read from {DEX}; has its layout changed?")
    return by_number, names


def file_safe(name):
    """The picture's file name: plain ASCII, as the pool's other pictures are (tools/gen6/build-data.mjs `artFile`)."""
    folded = name.replace("é", "e").replace("’", "'").replace("♀", " F").replace("♂", " M")
    return re.sub(r'[<>:"/\\|?*]', "", folded)


def convert(source, name):
    target = os.path.join(OUT, file_safe(name) + ".webp")
    if os.path.exists(target) and not FORCE:
        return False
    image = Image.open(source).convert("RGBA")
    if image.size != (SIZE, SIZE):
        # Fit inside the square, centred, as the pool's pictures are.
        scale = SIZE / max(image.size)
        resized = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.LANCZOS)
        image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        image.paste(resized, ((SIZE - resized.width) // 2, (SIZE - resized.height) // 2))
    image.save(target, "WEBP", lossless=True, method=6)
    return True


def main():
    by_number, names = dex_names()
    os.makedirs(OUT, exist_ok=True)
    jobs = []  # (source, name)
    for folder in ("gen6", "gen7"):
        for file in sorted(os.listdir(os.path.join(LIBRARY, folder))):
            stem, ext = os.path.splitext(file)
            if ext.lower() != ".png":
                continue
            if stem in FORM_FILES:
                jobs.append((os.path.join(LIBRARY, folder, file), FORM_FILES[stem]))
                continue
            match = re.match(r"0*(\d{3})[A-Za-z_]", stem)
            if not match or "-" in stem.replace("-o", ""):  # 666-archipelago and the like; Jangmo-o keeps its hyphen
                continue
            number = int(match.group(1))
            if 650 <= number <= 807 and number in by_number:
                jobs.append((os.path.join(LIBRARY, folder, file), by_number[number]))
    for file in sorted(os.listdir(os.path.join(LIBRARY, "mega evolutions"))):
        match = re.match(r"0*(\d+)[^-]*-Mega(?:_([XY]))?\.png$", file)
        if not match or int(match.group(1)) not in by_number:
            continue
        name = "Mega " + by_number[int(match.group(1))] + (" " + match.group(2) if match.group(2) else "")
        if name in names:
            jobs.append((os.path.join(LIBRARY, "mega evolutions", file), name))
    for file in sorted(os.listdir(os.path.join(LIBRARY, "regional forms"))):
        match = re.match(r"Alolan-(.+)\.png$", file)
        if match and "Alolan " + match.group(1) in names:
            jobs.append((os.path.join(LIBRARY, "regional forms", file), "Alolan " + match.group(1)))
    written = 0
    for source, name in jobs:
        if convert(source, name):
            written += 1
    have = {os.path.splitext(f)[0] for f in os.listdir(OUT)}
    lacking = sorted(n for n in (by_number[i] for i in range(650, 808)) if file_safe(n) not in have)
    print(f"{len(jobs)} pictures matched, {written} written, {len(have)} in images/gen6/pokemon")
    if lacking:
        print("gen 6-7 species with no picture:", ", ".join(lacking))


if __name__ == "__main__":
    main()
