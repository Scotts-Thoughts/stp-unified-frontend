"""Makes the start screen's box art and the taskbar icons for the 3DS games from Scott's art library.

    py tools/gen6/import-shell-art.py [--library "A:/Dropbox/stp-projects/libraries"] [--force]

- src/renderer/public/images/box_art/6-XY.webp, 6-OmegaRubyAlphaSapphire.webp, 7-SunMoon.webp,
  7-UltraSunUltraMoon.webp: a pair's two boxes side by side, 400px tall, like the other paired editions.
- resources/icons/gen6/icon-x.ico, icon-omegaruby.ico and resources/icons/gen7/icon-sun.ico, icon-ultrasun.ico:
  the pair's first box, fitted in a square (the library has no 3DS cartridge pictures).

A file that exists is left alone unless --force. Needs Pillow.
"""
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
args = sys.argv[1:]
LIBRARY = args[args.index("--library") + 1] if "--library" in args else "A:/Dropbox/stp-projects/libraries"
FORCE = "--force" in args
HEIGHT, GAP = 400, 24

PAIRS = [
    ("6-XY.webp", "gen6/icon-x.ico", ["6-Pokemon X.png", "6-Pokemon Y.png"]),
    ("6-OmegaRubyAlphaSapphire.webp", "gen6/icon-omegaruby.ico", ["6-Omega Ruby.png", "6-Alpha Sapphire.png"]),
    ("7-SunMoon.webp", "gen7/icon-sun.ico", ["7-Sun.png", "7-Moon.png"]),
    ("7-UltraSunUltraMoon.webp", "gen7/icon-ultrasun.ico", ["7-Ultra Sun.png", "7-Ultra Moon.png"]),
]


def box(name):
    image = Image.open(os.path.join(LIBRARY, "box art", name)).convert("RGBA")
    return image.resize((round(image.width * HEIGHT / image.height), HEIGHT), Image.LANCZOS)


for art_name, icon_name, sources in PAIRS:
    boxes = [box(name) for name in sources]
    art_path = os.path.join(ROOT, "src", "renderer", "public", "images", "box_art", art_name)
    if FORCE or not os.path.exists(art_path):
        width = sum(b.width for b in boxes) + GAP * (len(boxes) - 1)
        sheet = Image.new("RGBA", (width, HEIGHT), (0, 0, 0, 0))
        x = 0
        for b in boxes:
            sheet.paste(b, (x, 0))
            x += b.width + GAP
        sheet.save(art_path, "WEBP", lossless=True, method=6)
        print("wrote", art_path)
    icon_path = os.path.join(ROOT, "resources", "icons", icon_name)
    if FORCE or not os.path.exists(icon_path):
        os.makedirs(os.path.dirname(icon_path), exist_ok=True)
        first = boxes[0]
        square = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
        scale = 256 / max(first.size)
        fitted = first.resize((round(first.width * scale), round(first.height * scale)), Image.LANCZOS)
        square.paste(fitted, ((256 - fitted.width) // 2, (256 - fitted.height) // 2))
        square.save(icon_path, format="ICO", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
        print("wrote", icon_path)
