"""Makes the 3DS overlay's split icons from Scott's art library: square face crops like gens 3-5's.

    py tools/gen6/make-split-icons.py [--library "A:/Dropbox/stp-projects/libraries/trainer art"] [--force] [--gen gen7]

Reads `<library>/gen6/<name>.png` and `<library>/gen7/<name>.png` (the official full-body artwork, from the Pokemon
Wiki on Fandom, pokemon.fandom.com, fetched 2026-11-26: Bulbapedia's Cloudflare check refuses scripted downloads;
OR/AS trainers use their OR/AS art, Hau his Ultra Sun/Ultra Moon art) and writes
src/renderer/public/images/gen6/split_images/<name>.webp and .../gen7/split_images/<name>.webp (lossless WebP).
`<name>` is the split's trainer name in games/gen6/games.ts, lower case, "&" as "_and_" (`splitIcon` in
games/gen6/Overlay.vue).

Each crop is framed by hand on the face (FACES, in the source picture's own pixels): the point between the eyes, and
the face's width from cheek to cheek. The square is 1.25 face widths across with the eyes half way down, as the other
generations' icons are (gen 6). Gen 7 follows a rule measured from gens 3-5's own icons instead (`face7`): its FACES
give the face's centre, eye line, chin and cheek-to-cheek width on the skin; the cheeks span CHEEKS
(0.52) of the square and the eyes-to-chin midpoint sits MID (0.54) down, so the face sits centred like gens 3-5's (eyes ~0.42,
chin ~0.66). Trainers who look to the left are flipped so every face looks right, towards the split's
name. The icons are 88px (twice the 43.8px they are shown at), so the art stays sharp. Some of the wiki's pictures
are small (Malva, Siebold, Molayne, Olympia, Wikstrom, Wulfric are under 100px across the face); those are a little
soft. A file that exists is left alone unless --force; --gen limits the run to one generation's folder (`--force --gen
gen7` remakes gen 7 without touching gen 6). Needs Pillow.
"""
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
IMAGES = os.path.normpath(os.path.join(HERE, "..", "..", "src", "renderer", "public", "images"))
args = sys.argv[1:]
LIBRARY = args[args.index("--library") + 1] if "--library" in args else "A:/Dropbox/stp-projects/libraries/trainer art"
FORCE = "--force" in args
ONLY = args[args.index("--gen") + 1] if "--gen" in args else None  # e.g. --gen gen7: only that generation
SIZE = 88
SPAN = 1.25  # the square's side, in face widths
EYES = 0.5  # how far down the square the eyes sit
# Gen 7's rule, measured from gens 3-5's 35px icons: the face is centred left-right with its cheeks spanning about
# CHEEKS of the square, eyes ~0.42 down and chin ~0.66, so the point half way from the eyes to the chin sits MID down.
CHEEKS = 0.52
MID = 0.54

# name: (between the eyes x, y, face width, flip[, tilt[, eyes]]), in the source picture's pixels. `tilt` is the eye
# line's angle in degrees (negative: the right eye is higher); the crop is turned by it so the eyes are level. `eyes`
# is how far down the icon the eyes sit, where EYES leaves the head off centre (Wulfric's beard).
# Gen 7 is framed by GEN7_RULE instead: (face centre x, eye line y, chin y, cheek-to-cheek width, flip[, tilt[,
# zoom]]), measured on the skin (not the hair); `zoom` scales the square (Kukui's 0.88 keeps his hand out).
# A gen 7 entry may end with Scott's hand adjustments, a dict applied on top of the measured framing:
#   "right" / "down": move the face that many pixels inside the finished icon (negative: left / up), in pixels as
#                     Scott sees them on the overlay at 1080p (the icon shows ~54.4px there: `.gen-7 .splitIcon` is
#                     69px in the right zone, scaled ~0.788), so 1 px is SIZE / SCREEN file pixels;
#   "zoom":           how much bigger the face gets in the square (1.06 = 6% bigger, 0.94 = 6% smaller), about the
#                     framing's eyes-to-chin midpoint;
#   "flip": True      mirrors the finished icon (on top of the measured `flip`); moves stay as seen after the flip.
SCREEN = 54.4
FACES = {
    "gen6": {
        "viola": (676, 368, 362, True), "grant": (1350, 880, 320, True), "korrina": (802, 758, 304, True, -24),
        "ramos": (95, 72, 70, True, -8), "clemont": (991, 625, 360, False, -14), "valerie": (450, 74, 78, False),
        "olympia": (237, 64, 48, False), "wulfric": (170, 33, 47, True, 0, 0.38), "lysandre": (713, 490, 292, False),
        "wikstrom": (126, 53, 58, True), "malva": (87, 52, 54, True), "drasna": (299, 93, 115, False),
        "siebold": (94, 62, 55, False), "diantha": (800, 424, 323, False),
        "roxanne": (768, 462, 300, False), "brawly": (1180, 576, 330, False), "wattson": (570, 420, 409, True),
        "flannery": (1040, 692, 392, False), "norman": (822, 638, 392, False), "winona": (330, 150, 100, True),
        "tate_and_liza": (257, 160, 160, False), "archie": (682, 228, 270, False), "maxie": (588, 335, 330, True),
        "wallace": (1250, 530, 310, True), "sidney": (1069, 746, 438, False), "phoebe": (1088, 452, 385, False),
        "glacia": (236, 118, 104, False), "drake": (475, 92, 122, False), "steven": (1006, 673, 354, True),
    },
    "gen7": {
        "hala": (1379, 662, 997, 481, False, {"zoom": 1.25, "down": -2}),
        "olivia": (976, 465, 648, 269, False, {"right": -4}),
        "nanu": (82, 63, 107, 64, False, {"right": -3, "down": 2, "zoom": 1.09}),
        "hapu": (169, 155, 206, 103, False, {"right": -1}),
        "guzma": (1167, 702, 936, 298, False, {"zoom": 0.91, "down": 2, "flip": True}),
        "lusamine": (1050, 375, 492, 234, False, {"zoom": 0.94, "right": 2}),
        "acerola": (867, 605, 799, 362, False, {"right": -2}),
        "kahili": (380, 229, 310, 118, False),
        "kukui": (1135, 575, 850, 380, False, 0, 0.88, {"right": 3}),
        "molayne": (71, 53, 77, 52, False, {"zoom": 1.29, "right": 1, "flip": True}),
        "hau": (427, 721, 961, 509, False, {"zoom": 1.18, "right": 2, "flip": True}),
    },
}


def face(path, x, y, width, flip, tilt=0, eyes=EYES):
    art = Image.open(path).convert("RGBA")
    if tilt:
        art = art.rotate(tilt, resample=Image.BICUBIC, center=(x, y))
    side = width * SPAN
    box = tuple(round(v) for v in (x - side / 2, y - eyes * side, x + side / 2, y + (1 - eyes) * side))
    icon = Image.new("RGBA", (box[2] - box[0], box[3] - box[1]))
    icon.alpha_composite(art.crop(box))
    icon = icon.resize((SIZE, SIZE), Image.LANCZOS)
    return icon.transpose(Image.FLIP_LEFT_RIGHT) if flip else icon


def face7(path, x, eyes, chin, width, flip, tilt=0, zoom=1.0, hand=None):
    hand = hand or {}
    art = Image.open(path).convert("RGBA")
    if tilt:
        art = art.rotate(tilt, resample=Image.BICUBIC, center=(x, eyes))
    side = width / CHEEKS * zoom / hand.get("zoom", 1.0)
    flip = flip != hand.get("flip", False)
    # Scott's moves are in on-screen pixels of the finished (maybe flipped) icon; the crop moves the other way.
    per_px = side / SCREEN  # source pixels per on-screen pixel
    x -= hand.get("right", 0) * per_px * (-1 if flip else 1)
    top = (eyes + chin) / 2 - MID * side - hand.get("down", 0) * per_px
    box = tuple(round(v) for v in (x - side / 2, top, x + side / 2, top + side))
    icon = Image.new("RGBA", (box[2] - box[0], box[3] - box[1]))
    icon.alpha_composite(art.crop(box))
    icon = icon.resize((SIZE, SIZE), Image.LANCZOS)
    return icon.transpose(Image.FLIP_LEFT_RIGHT) if flip else icon


GEN7_RULE = {"gen7"}

written = 0
for gen, faces in FACES.items():
    if ONLY and gen != ONLY:
        continue
    target_dir = os.path.join(IMAGES, gen, "split_images")
    os.makedirs(target_dir, exist_ok=True)
    for name, spec in faces.items():
        source = os.path.join(LIBRARY, gen, name + ".png")
        if not os.path.exists(source):
            sys.exit(f"make-split-icons: {source} is missing")
        target = os.path.join(target_dir, name + ".webp")
        if os.path.exists(target) and not FORCE:
            continue
        hand = spec[-1] if isinstance(spec[-1], dict) else None
        spec = spec[:-1] if hand else spec
        icon = face7(source, *spec, hand=hand) if gen in GEN7_RULE else face(source, *spec)
        icon.save(target, "WEBP", lossless=True)
        written += 1
print(f"make-split-icons: wrote {written} icons")
