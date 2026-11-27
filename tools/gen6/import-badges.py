"""Writes the 3DS games' badge pictures: images/gen6/badges/{kalos,hoenn}/0-7.webp and images/gen7/stamps/0-3.webp.

    py tools/gen6/import-badges.py [Kalos library folder]

Kalos (X/Y): the library's `badges/gen6/Gen6 Badge<N>-<Name>badge.png` files are Bulbapedia's 256x256 renders (Bug,
Cliff, Rumble, Plant, Voltage, Fairy, Psychic, Iceberg), taken from its archive through the Internet Archive because
Bulbapedia refuses scripted downloads. Each is cropped to its own outline, given gen 3's dark outline (OUTLINE) and
written 128px on its long side, so the overlay can fit it to its badge-case cell (wide badges such as Rumble and Fairy
fill the cell's width).

Hoenn (OR/AS): gen 3's own badge row, cut out of its full-canvas pictures (images/gen3/new_ui/badges/hoenn/badge1-8),
each at its outline's width and the whole row's height (HOENN_BAND), so every badge keeps gen 3's size and they all
scale alike. playerPanel.ts HOENN_GEN3_BOXES holds the same x ranges to place them.

Alola (Sun/Moon, Ultra Sun/Ultra Moon): Scott's four island trial completion stamps, the library's
`badges/gen7/Gen7 Stamp<N>-<Island>.png` (Melemele, Akala, Ulaula, Poni), cut to one shared square (so they stay the
same size) and given a thinner dark outline than the Kalos badges (STAMP_OUTLINE). All lossless WebP. Needs Pillow.
"""
import glob
import os
import sys

from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
IMAGES = os.path.normpath(os.path.join(HERE, "..", "..", "src", "renderer", "public", "images"))
LIBRARY = sys.argv[1] if len(sys.argv) > 1 else r"A:\Dropbox\stp-projects\libraries\badges\gen6"
SIZE = 128
# Gen 3's badges have a dark brown outline about 1/30 of their height; the Kalos renders have none, so each gets one
# this thick (px of the 128px picture, about 1.5 canvas px once fitted to its cell) in gen 3's outline colour.
OUTLINE = 4
OUTLINE_RGB = (50, 34, 12)
SUPER = 4  # drawn at 4x, then scaled down, for a smooth edge
# Gen 3's badge row (progress.webp's outline is y 117..161): every Hoenn badge is cut at this height.
HOENN_BAND = (117, 161)


def save(image, folder, n):
    out = os.path.join(IMAGES, "gen6", "badges", folder)
    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, f"{n}.webp")
    image.save(path, "WEBP", lossless=True, method=6)
    print("wrote", path, image.size)


for n in range(8):
    found = glob.glob(os.path.join(LIBRARY, f"Gen6 Badge{n + 1}-*.png"))
    if len(found) != 1:
        sys.exit(f"expected one 'Gen6 Badge{n + 1}-*.png' in {LIBRARY}, found {len(found)}")
    image = Image.open(found[0]).convert("RGBA")
    image = image.crop(image.getbbox())
    scale = SUPER * (SIZE - 2 * OUTLINE) / max(image.size)
    big = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.LANCZOS)
    pad = SUPER * OUTLINE
    canvas = Image.new("RGBA", (big.width + 2 * pad, big.height + 2 * pad), (0, 0, 0, 0))
    canvas.paste(big, (pad, pad))
    edge = canvas.getchannel("A")
    for _ in range(pad):
        edge = edge.filter(ImageFilter.MaxFilter(3))
    outlined = Image.new("RGBA", canvas.size, OUTLINE_RGB + (0,))
    outlined.putalpha(edge)
    outlined.alpha_composite(canvas)
    save(outlined.resize((round(outlined.width / SUPER), round(outlined.height / SUPER)), Image.LANCZOS), "kalos", n)

for n in range(8):
    image = Image.open(os.path.join(IMAGES, "gen3", "new_ui", "badges", "hoenn", f"badge{n + 1}.webp")).convert("RGBA")
    x0, _, x1, _ = image.getbbox()
    save(image.crop((x0, HOENN_BAND[0], x1, HOENN_BAND[1])), "hoenn", n)

STAMPS = os.path.join(os.path.dirname(LIBRARY), "gen7")
# The stamps' outline is thinner than the Kalos badges' (they have finer filigree), and follows only their solid
# parts (alpha >= STAMP_SOLID), so the faint ink specks around each stamp get none.
STAMP_OUTLINE = 2.5
STAMP_SOLID = 128
stamps = []
for n in range(4):
    found = glob.glob(os.path.join(STAMPS, f"Gen7 Stamp{n + 1}-*.png"))
    if len(found) != 1:
        sys.exit(f"expected one 'Gen7 Stamp{n + 1}-*.png' in {STAMPS}, found {len(found)}")
    stamps.append(Image.open(found[0]).convert("RGBA"))
# One square crop for all four (the union of their outlines), so they keep the same size and lose the empty margin.
boxes = [im.getbbox() for im in stamps]
x0, y0 = min(b[0] for b in boxes), min(b[1] for b in boxes)
x1, y1 = max(b[2] for b in boxes), max(b[3] for b in boxes)
side = max(x1 - x0, y1 - y0)
cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
crop = (round(cx - side / 2), round(cy - side / 2), round(cx - side / 2) + side, round(cy - side / 2) + side)
pad = round(SUPER * STAMP_OUTLINE)
for n, image in enumerate(stamps):
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(image.crop(crop), (0, 0))
    big = square.resize((side * SUPER, side * SUPER), Image.LANCZOS)
    canvas = Image.new("RGBA", (big.width + 2 * pad, big.height + 2 * pad), (0, 0, 0, 0))
    canvas.paste(big, (pad, pad))
    edge = canvas.getchannel("A").point(lambda a: 255 if a >= STAMP_SOLID else 0)
    for _ in range(pad):
        edge = edge.filter(ImageFilter.MaxFilter(3))
    edge = edge.filter(ImageFilter.GaussianBlur(SUPER / 2))
    outlined = Image.new("RGBA", canvas.size, OUTLINE_RGB + (0,))
    outlined.putalpha(edge)
    outlined.alpha_composite(canvas)
    out = os.path.join(IMAGES, "gen7", "stamps")
    os.makedirs(out, exist_ok=True)
    small = outlined.resize((round(outlined.width / SUPER), round(outlined.height / SUPER)), Image.LANCZOS)
    small.save(os.path.join(out, f"{n}.webp"), "WEBP", lossless=True, method=6)
    print("wrote", os.path.join(out, f"{n}.webp"), small.size)
