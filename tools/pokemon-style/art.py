"""Measuring the art pictures and reading the species table. No rules live here (see rules.py)."""
import json, os, re
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
R = os.path.join(REPO, "src", "renderer")
IMAGES = os.path.join(R, "public", "images")

# ---- species table (PokeAPI: generation, evolves-from, legendary/mythical, height in m, base stat total, Levitate)
SPECIES = json.load(open(os.path.join(HERE, "data", "species.json"), encoding="utf-8"))
BY_ID = {v["id"]: dict(v, name=k) for k, v in SPECIES.items()}
CHILDREN = {}
for v in SPECIES.values():
    if v["evolves_from"]:
        CHILDREN.setdefault(v["evolves_from"], []).append(v["id"])


def norm(n):
    return re.sub(r"[^a-z0-9]", "", n.lower().replace("♀", "f").replace("♂", "m"))


BY_NAME = {norm(k): v["id"] for k, v in SPECIES.items()}
BY_NAME.update({"nidoranf": 29, "nidoranm": 32, "farfetchd": 83, "mrmime": 122, "mimejr": 439, "hooh": 250, "porygonz": 474})


def base_name(s):
    """The species behind a form name: 'Mega Charizard X', 'Alolan Marowak', 'Rotom (Wash)' -> the species."""
    s2 = re.sub(r"^Mega ", "", s)
    s2 = re.sub(r"^(Alolan|Galarian|Hisuian|Paldean|Partner) ?", "", s2)
    s2 = re.sub(r"\s*\(.*\)$", "", s2)
    if norm(s2) not in BY_NAME:
        s2 = s2.split("-")[0]
    return s2


def species_id(name):
    return BY_NAME.get(norm(name)) or BY_NAME.get(norm(base_name(name)))


def info(name):
    i = species_id(name)
    return BY_ID.get(i) if i else None


def category(name, gen):
    """first / middle / final / single / legend, counting only species that exist by generation `gen`."""
    if name.startswith("Mega "):
        return "final"
    i = species_id(name)
    if i is None:
        return "final"
    gen = max(gen, BY_ID[i]["gen"])
    d, j = 0, i
    while BY_ID[j]["evolves_from"] and BY_ID[BY_ID[j]["evolves_from"]]["gen"] <= gen:
        j = BY_ID[j]["evolves_from"]
        d += 1
    further = any(BY_ID[c]["gen"] <= gen for c in CHILDREN.get(i, []))
    if further:
        return "first" if d == 0 else "middle"
    if d > 0:
        return "final"
    return "legend" if BY_ID[i]["legend"] else "single"


# ---- picture measurements
_bbox, _core = {}, {}


def bbox(path):
    """((W, H), x0, y0, x1, y1): the opaque part of the picture, ignoring stray faint pixels."""
    if path in _bbox:
        return _bbox[path]
    im = Image.open(path).convert("RGBA")
    m = np.array(im)[:, :, 3] > 100
    W, H = im.size
    cols, rows = m.sum(0), m.sum(1)
    xs = np.where(cols >= max(3, 0.006 * H))[0]
    ys = np.where(rows >= max(3, 0.006 * W))[0]
    r = (im.size, int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    _bbox[path] = r
    return r


def core_cx(path):
    """Horizontal centre of the body with thin parts (tails, wings, arms, antennae) left out: the opaque mask
    is opened by ~7% of the art's size so only thick parts stay. In source pixels."""
    if path in _core:
        return _core[path]
    im = Image.open(path).convert("RGBA")
    W, H = im.size
    k = 256 / max(W, H)
    small = im.resize((max(1, int(W * k)), max(1, int(H * k))))
    m = Image.fromarray(((np.array(small)[:, :, 3] > 100) * 255).astype("uint8"))
    _, x0, y0, x1, y1 = bbox(path)
    r = max(1, int(0.07 * max(x1 - x0, y1 - y0) * k))
    size = 2 * r + 1
    a = np.array(m.filter(ImageFilter.MinFilter(size)).filter(ImageFilter.MaxFilter(size))) > 0
    if a.sum() < 0.15 * (np.array(m) > 0).sum():
        a = np.array(m) > 0
    c = float(np.nonzero(a)[1].mean()) / k
    _core[path] = c
    return c


# ---- colour
def srgb2lab(rgb):
    c = np.asarray(rgb, float) / 255
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ M.T / np.array([0.95047, 1, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def hex2rgb(h):
    h = h.lstrip("#")
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]


def rgb2hex(rgb):
    return "#%02x%02x%02x" % tuple(int(round(x)) for x in np.clip(rgb, 0, 255))


def _kmeans(X, k, it=25, seed=0):
    rng = np.random.default_rng(seed)
    C = [X[rng.integers(len(X))]]
    for _ in range(k - 1):
        d = np.min(((X[:, None] - np.array(C)[None]) ** 2).sum(-1), 1)
        C.append(X[rng.choice(len(X), p=d / d.sum())])
    C = np.array(C)
    for _ in range(it):
        L = np.argmin(((X[:, None] - C[None]) ** 2).sum(-1), 1)
        C = np.array([X[L == j].mean(0) if (L == j).any() else C[j] for j in range(k)])
    return C, np.bincount(L, minlength=k)


_pal = {}


def palette(path, k=6):
    """The art's main colours, heaviest first: [(rgb, lab, share)]. Outlines (near black) are left out."""
    if path in _pal:
        return _pal[path]
    im = Image.open(path).convert("RGBA")
    im.thumbnail((160, 160))
    a = np.array(im).reshape(-1, 4)
    a = a[a[:, 3] > 200][:, :3]
    lab = srgb2lab(a)
    keep = lab[:, 0] > 18
    rgb, lab = a[keep], lab[keep]
    C, n = _kmeans(lab, k)
    L = np.argmin(((lab[:, None] - C[None]) ** 2).sum(-1), 1)
    rgbC = [rgb[L == j].mean(0) if (L == j).any() else np.zeros(3) for j in range(k)]
    res = [(np.array(rgbC[j]), C[j], n[j] / n.sum()) for j in np.argsort(-n)]
    _pal[path] = res
    return res


_LOOKS, _tex = None, {}


def texture_looks():
    """Default filter look per texture picture, read from core/overlay/textureLooks.ts."""
    global _LOOKS
    if _LOOKS is None:
        src = open(os.path.join(R, "core", "overlay", "textureLooks.ts"), encoding="utf-8").read()
        _LOOKS = {}
        for m in re.finditer(r"\[(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+),\s*\[([^\]]*)\]\]", src):
            b, c, s = map(int, m.groups()[:3])
            for f in re.findall(r'"([^"]+)"', m.group(5)):
                _LOOKS[f.lower()] = (b, c, s)
    return _LOOKS


def texture_display_color(path):
    """Mean colour of a texture as the overlay draws it by default (brightness, contrast, saturate applied)."""
    if path in _tex:
        return _tex[path]
    rel = os.path.relpath(path, IMAGES).replace("\\", "/").lower()
    b, c, s = texture_looks().get(rel, (100, 100, 100))
    im = Image.open(path).convert("RGB")
    im.thumbnail((200, 200))
    a = np.array(im).reshape(-1, 3) / 255.0
    a = np.clip((a * b / 100 - 0.5) * c / 100 + 0.5, 0, 1)
    g = (0.2126 * a[:, 0] + 0.7152 * a[:, 1] + 0.0722 * a[:, 2])[:, None]
    a = np.clip(g + (a - g) * s / 100, 0, 1)
    r = a.mean(0) * 255
    _tex[path] = r
    return r
