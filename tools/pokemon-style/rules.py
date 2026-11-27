"""The styling rules. Every number here was learned from Scott's hand-styled entries; LESSONS.md says
where each one came from. Change a rule here, log why in LESSONS.md, then run `style.py generate`."""
import json, math, os, re
from art import (HERE, R, IMAGES, bbox, core_cx, category, info, palette, srgb2lab, rgb2hex,
                 texture_display_color)

GENNUM = {"gen1": 1, "gen2": 2, "gen3": 3, "gen4": 4, "gen5": 5, "gen6": 6, "gen7": 7}

# Per generation, in screen pixels relative to the middle of the art box (+ is down / right):
#   C      the art box's size in the overlay
#   cx     where the body's middle sits across
#   bot    where the feet sit (just behind the type icons, on the Poke Ball)
#   size   how big the art is drawn for each evolution stage
#   hmax/wmax  the tallest / widest art may be
#   ui     ui_saturation written with the colour (None: leave the generation's default)
T = {
    "gen1": dict(C=396, cx=2, bot=130, size=dict(first=225, middle=268, final=310, single=295, legend=340), hmax=380, wmax=390, ui=0.9),
    "gen2": dict(C=396, cx=0, bot=129, size=dict(first=190, middle=232, final=265, single=255, legend=295), hmax=311, wmax=320, ui=None),
    "gen3": dict(C=396, cx=-20, bot=125, size=dict(first=192, middle=260, final=326, single=300, legend=345), hmax=365, wmax=420, ui=1.6),
    "gen4": dict(C=396, cx=20, bot=146, size=dict(first=205, middle=285, final=370, single=323, legend=339), hmax=392, wmax=432, ui=1.5),
    "gen5": dict(C=376, cx=0, bot=163, size=dict(first=200, middle=298, final=397, single=316, legend=357), hmax=428, wmax=445, ui=1.5),
    # The 3DS overlay (gens 6-7 share it, games/gen6/layout.ts ART_BOX): a 440 box with no padding, centred at canvas
    # (197, 548). Feet and body centre are gen 5's points carried through the ball's zone (x0.79 from the bottom-left
    # corner): canvas (175, 786). Sizes are gen 5's x1.1, as mockup A draws the art bigger than gen 5 (440 against
    # ~382 tall: docs/gen6/build_mockup_a.py). `xlim`: the outline stays between 10px past the canvas's left edge and
    # 6px before the top screen's border (canvas x -10..352), shifted in, or shrunk if it is wider than that.
    # Not yet checked against Scott's looks.
    "gen6": dict(C=440, cx=-22, bot=238, size=dict(first=220, middle=328, final=437, single=348, legend=393), hmax=520, wmax=350,
                 xlim=(-207, 155), ui=1.5),
}
T["gen7"] = T["gen6"]
RB_ABS = (204, 580)  # Red/Blue art is drawn at its natural size; where its feet go in the container

# Inside a stage, real height and base stat total move the size: (height weight, BST weight, mean log height,
# mean BST/100). Weak final stages (Watchog) come out smaller than strong ones.
SIZE_MODEL = {"first": (0.093, 0.137, -0.628, 3.121), "middle": (0.198, 0.113, -0.063, 3.958),
              "final": (0.14, 0.30, 0.237, 4.964), "single": (0.20, 0.15, -0.123, 4.448),
              "legend": (0.25, 0.06, 0.378, 6.108)}
SIZE_MIN, SIZE_MIN_FIRST, SIZE_MAX = 0.72, 0.95, 1.22  # first stages never shrink much (Pidgey)

FLOAT_LIFT = {"gen1": 90, "gen2": 80, "gen3": 110, "gen4": 95, "gen5": 80}  # Red/Blue floaters only
FLOAT_CENTRE = {"gen1": -55, "gen2": -55, "gen3": -95, "gen4": -55, "gen5": -50, "gen6": -40, "gen7": -40}  # a floater's middle
FLOAT_MIN_LIFT = 80
EYE_MAX_OFF, EYE_NARROW = 0.2, 0.55  # centre on the eyes only for narrow art (Watchog)
CORE_W = 0.75  # body centre vs outline centre (tails and wings count less: Pidgey)

# Overlay colour: the dominant colour, unless it blends into the background as drawn.
COLOR_P = dict(pen=0.5, hue=-1, de=25, cw=0.8, chroma_bonus=0.5)

# Background framing Scott set by hand for a texture, copied into generated entries using it (gens 3-5).
TEX_FRAMING = {"Steel": {"backgroundScale": 151}}
GEN1_TEX = {"Bug": "Bug 1", "Dragon": "Dragon 1", "Electric": "Electric 1", "Fighting": "Fighting 1", "Fire": "Fire 1",
            "Flying": "Flying 1", "Ghost": "Ghost 1", "Grass": "Grass 1", "Ground": "Ground 1", "Ice": "Ice 1",
            "Normal": "Normal 1", "Poison": "Poison 1", "Psychic": "Psychic (crisp)", "Rock": "Rock 1", "Water": "Water 2",
            "Dark": "Dark Clouds", "Steel": "Rock 1", "Fairy": "Roses"}

# Per-picture labels set by eye: faces_right, floats, eye_x (0-1 across the art as drawn after any flip).
LABELS = json.load(open(os.path.join(HERE, "data", "labels.json"), encoding="utf-8"))

# The fields the generator writes; only these are compared when looking for Scott's changes.
STYLE_KEYS = ["imageScale", "imageXOffset", "imageYOffset", "imageFlip", "overlay_color", "ui_saturation",
              "backgroundScale", "backgroundTexture"]


def size_factor(species, cat):
    f = info(species)
    if f is None:
        return 1.0
    a, b, mh, mb = SIZE_MODEL[cat]
    k = math.exp(a * (math.log(max(f["height"], 0.1)) - mh) + b * (f["bst"] / 100 - mb))
    return min(SIZE_MAX, max(SIZE_MIN_FIRST if cat == "first" else SIZE_MIN, k))


def label(img):
    return LABELS.get(os.path.relpath(img, IMAGES).replace("\\", "/"), {})


def layout(e):
    """Scale, offsets and flip for one entry: {gen, game, species, img}."""
    gen = e["gen"]; t = T[gen]; img = e["img"]
    (W, H), x0, y0, x1, y1 = bbox(img)
    rb = gen == "gen1" and e["game"] == "Red and Blue"
    if rb:
        kx = ky = 1; CW, CH = W, H; tcx = RB_ABS[0] - (-2 + W / 2); tbot = RB_ABS[1] - (208 + H / 2)
    else:
        kx = t["C"] / W; ky = t["C"] / H; CW = CH = t["C"]; tcx = t["cx"]; tbot = t["bot"]
    bw = (x1 - x0) * kx; bh = (y1 - y0) * ky
    cat = category(e["species"], GENNUM[gen])
    target = t["size"][cat] * size_factor(e["species"], cat)
    mix = 0.7 * max(bw, bh) + 0.3 * math.sqrt(bw * bh)
    s = min(target / mix, t["hmax"] / bh, t["wmax"] / bw)
    native = W / CW  # never draw the art bigger than its own pixels (upscaling blurs)
    capped = s > native * 1.0001
    s = math.floor(min(s, native) * 100) / 100
    lab = label(img)
    F = 1 if lab.get("faces_right") else -1  # everything looks toward the game area
    sw, sh = s * bw, s * bh
    ex = lab.get("eye_x")
    if ex is not None and not rb and abs(ex - 0.5) <= EYE_MAX_OFF and bw / bh < EYE_NARROW:
        room = max(0.0, (t["wmax"] - sw) / 2)
        tcx += max(-room, min(room, -(ex - 0.5) * sw))
    if lab.get("floats"):
        if rb:
            tbot -= FLOAT_LIFT[gen]
        else:
            tbot = min(tbot - FLOAT_MIN_LIFT, FLOAT_CENTRE[gen] + sh / 2)
    if rb:
        cx_rel = (x0 + x1) / 2 * kx - CW / 2
    else:
        cx_rel = (CORE_W * core_cx(img) + (1 - CORE_W) * (x0 + x1) / 2) * kx - CW / 2
    bot_rel = y1 * ky - CH / 2
    best = None
    for ds in (0, -0.01, 0.01, -0.02, 0.02):  # nudge the scale so the art lands on whole pixels
        s2 = round(s + ds, 2)
        if s2 > native:
            continue
        x = round(tcx / (s2 * F) - cx_rel); y = round(bot_rel - tbot / s2)
        left = s2 * F * (-CW / 2 + x); top = s2 * (-CH / 2 - y)
        cand = (abs(left - round(left)) + abs(top - round(top)) + abs(ds) * 10, s2, x, y)
        if best is None or cand < best:
            best = cand
    _, s, x, y = best
    lim = t.get("xlim")
    if lim and not rb:
        # Keep the outline between the column's limits: shift it in, and only if it is wider than the room, shrink it.
        room = lim[1] - lim[0]
        if s * bw > room:
            s = math.floor(room / bw * 100) / 100
            x = round(tcx / (s * F) - cx_rel); y = round(bot_rel - tbot / s)
        a, b = s * F * (x0 * kx - CW / 2 + x), s * F * (x1 * kx - CW / 2 + x)
        lo, hi = min(a, b), max(a, b)
        shift = lim[0] - lo if lo < lim[0] else (lim[1] - hi if hi > lim[1] else 0)
        if shift:
            x += math.ceil(shift / (s * F)) if shift / (s * F) > 0 else math.floor(shift / (s * F))
    return dict(imageScale=s, imageXOffset=x, imageYOffset=y, imageFlip=F == -1), cat, capped


# ---- colour
def _hue(lab):
    return math.degrees(math.atan2(lab[2], lab[1])) % 360


def _clashes(lab, tl, q):
    import numpy as np
    if tl is None:
        return False
    if np.linalg.norm(tl - lab) < q["de"]:
        return True
    C = np.hypot(*lab[1:]); Ct = np.hypot(*tl[1:])
    d = abs(_hue(lab) - _hue(tl)) % 360
    if C > 12 and Ct > q["ctex"] and min(d, 360 - d) < q["hue"]:
        return True
    if C <= 12 and Ct <= q["ctex"] and abs(lab[0] - tl[0]) < q["dl"]:
        return True
    return False


def pick_color(img, tex_rgb, p=None):
    """The heaviest colour of the art, with greys, near-blacks and colours that blend into the
    background marked down. Returns (hex, candidates)."""
    import numpy as np
    q = dict(cw=0.8, gray=18, Lmin=25, Lmax=92, de=20, ctex=8, hue=35, dl=25, pen=0.25, chroma_bonus=0.0)
    q.update(p or COLOR_P)
    tl = srgb2lab(tex_rgb) if tex_rgb is not None else None
    cands = []
    for rgb, lab, w in palette(img):
        C = np.hypot(lab[1], lab[2]); L = lab[0]
        s = w ** q["cw"]
        if C < q["gray"]: s *= 0.35
        if L < q["Lmin"]: s *= 0.3
        if L > q["Lmax"] and C < 20: s *= 0.3
        s *= 1 + q["chroma_bonus"] * min(C, 60) / 60
        cl = _clashes(lab, tl, q)
        if cl: s *= q["pen"]
        cands.append((s, rgb, lab, cl))
    cands.sort(key=lambda c: -c[0])
    return rgb2hex(cands[0][1]), cands


def gen1_texture(t1):
    return GEN1_TEX.get(t1, "Normal 1")


def texture_path(gen, t1):
    """The picture behind a type's default background, or None."""
    if gen == "gen1":
        src = open(os.path.join(R, "data", "textures.js"), encoding="utf-8").read(); name = gen1_texture(t1)
    else:
        src = open(os.path.join(R, "games", "gen6" if gen == "gen7" else gen, "data", "textures.js"), encoding="utf-8").read()
        name = t1.lower() if gen == "gen2" else t1
    m = re.search(r"['\"]%s['\"]\s*:\s*(?:\{\s*['\"]path['\"]\s*:\s*)?['\"]([^'\"]+)" % re.escape(name), src, re.I)
    if not m:
        return None
    p = os.path.join(R, "public", m.group(1).replace("\\\\", "/").replace("\\", "/"))
    return p if os.path.exists(p) else None


def style_for(e):
    """The generated look for one entry {gen, game, species, img, t1}: (values, stage, capped)."""
    v, cat, capped = layout(e)
    t1 = e.get("t1") or "Normal"
    tp = texture_path(e["gen"], t1)
    v["overlay_color"] = pick_color(e["img"], texture_display_color(tp) if tp else None)[0]
    if e["gen"] in ("gen3", "gen4", "gen5", "gen6", "gen7"):
        v.update(TEX_FRAMING.get(t1, {}))
    ui = T[e["gen"]]["ui"]
    if e["gen"] == "gen1":
        v["backgroundTexture"] = gen1_texture(t1)
        v["ui_saturation"] = ui
    elif ui is not None:
        v["ui_saturation"] = ui
    return v, cat, capped
