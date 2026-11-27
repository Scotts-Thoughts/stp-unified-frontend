"""Draws stand-in pictures for the eight Kalos badges: src/renderer/public/images/gen6/badges/kalos/0-7.webp.

    py tools/gen6/make-kalos-badges.py [--force]

The art library has no Kalos badge art (libraries/badges stops at gen 5), so until Scott adds the real badges under
these eight names, X/Y shows a pip per badge in its gym's type colour: Bug, Rock, Fighting, Grass, Electric, Fairy,
Psychic, Ice. Omega Ruby/Alpha Sapphire use gen 3's Hoenn badge pictures. Needs Pillow.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "src", "renderer", "public", "images", "gen6", "badges", "kalos"))
COLOURS = ["#91a119", "#afa981", "#ff8000", "#3fa129", "#fac000", "#ef70ef", "#ef4179", "#3dcef3"]
SIZE, SCALE = 96, 4


def shade(colour, factor):
    r, g, b = (int(colour[i:i + 2], 16) for i in (1, 3, 5))
    return tuple(max(0, min(255, round(c * factor))) for c in (r, g, b)) + (255,)


os.makedirs(OUT, exist_ok=True)
for n, colour in enumerate(COLOURS):
    path = os.path.join(OUT, f"{n}.webp")
    if os.path.exists(path) and "--force" not in sys.argv:
        continue
    big = SIZE * SCALE
    image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    pad = 8 * SCALE
    draw.ellipse((pad, pad, big - pad, big - pad), fill=shade(colour, 0.55), outline=(20, 20, 20, 255), width=3 * SCALE)
    inner = 16 * SCALE
    draw.ellipse((inner, inner, big - inner, big - inner), fill=shade(colour, 1.0))
    # A soft highlight at the top left.
    glow = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((26 * SCALE, 22 * SCALE, 54 * SCALE, 44 * SCALE), fill=(255, 255, 255, 150))
    image = Image.alpha_composite(image, glow.filter(ImageFilter.GaussianBlur(5 * SCALE)))
    image.resize((SIZE, SIZE), Image.LANCZOS).save(path, "WEBP", lossless=True, method=6)
    print("wrote", path)
