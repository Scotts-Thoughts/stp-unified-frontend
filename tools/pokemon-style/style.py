"""Default Pokemon looks: find what Scott changed, and (re)generate the looks he hasn't touched.

    python tools/pokemon-style/style.py diff [--json out.json] [--user-data DIR]
    python tools/pokemon-style/style.py show <Species> [--gen gen4] [--game "Platinum"]
    python tools/pokemon-style/style.py generate [--write] [--only gen4] [--species A,B]
    python tools/pokemon-style/style.py preview diff.json --out sheet.png
    python tools/pokemon-style/style.py accept

data/known.json remembers every look this tool wrote ("generated") and every look of Scott's that
has already been learned from ("user"). `diff` lists looks that match neither: those are new
lessons. `generate` only ever writes an entry that has no look yet, or still has exactly the look
this tool gave it. `accept` marks the current looks as learned, so the next `diff` starts clean.
"""
import argparse, glob, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from art import HERE, REPO, R, IMAGES, category  # noqa: E402
import rules  # noqa: E402

KNOWN = os.path.join(HERE, "data", "known.json")
DEX = json.load(open(os.path.join(HERE, "data", "dex.json"), encoding="utf-8"))
STORAGE = os.path.join(REPO, "storage", "Storage.json")
IMG = {"gen1|Yellow": "pokemon", "gen1|Red and Blue": "pokemon/Red_and_Blue", "gen2": "gen2/pokemon",
       "gen3": "gen3/pokemon", "gen4": "gen4/pokemon", "gen5": "gen5/pokemon"}
# Gens 6-7 (one 3DS overlay, games/gen6/) take each species' picture from its art table (dex.json `img`), and keep
# their looks in one folder: gen7's files are gen6's.
GENS = ("gen2", "gen3", "gen4", "gen5", "gen6", "gen7")
# Fields that count as "this entry has a look" (an entry with none of them falls back to defaults).
HAS_LOOK = {"imageScale", "overlay_color", "imageXOffset", "imageYOffset"}
LOOK_FIELDS = rules.STYLE_KEYS + ["imageSat", "imageRotation", "backgroundBlur", "backgroundBrightness",
                                  "backgroundContrast", "backgroundSaturation", "backgroundHue",
                                  "backgroundXOffset", "backgroundYOffset", "backgroundFlip", "backgroundFlipY",
                                  "use_custom_background", "custom_background", "background_texture"]


def load_json(p, default=None):
    try:
        return json.load(open(p, encoding="utf-8"))
    except FileNotFoundError:
        return default


def known():
    return load_json(KNOWN, {"generated": {}, "user": {}})


def save_known(k):
    with open(KNOWN, "w", encoding="utf-8", newline="\n") as f:  # LF on Windows too, as the file is committed
        json.dump(k, f, indent=1, sort_keys=True)
        f.write("\n")


def style_dir(gen):
    return os.path.join(R, "games", "gen6" if gen == "gen7" else gen, "data", "style")


def file_key(gen, game, species):
    return species if gen == "gen2" else f"{game}_{species}"


def look(d):
    """Only the look fields of a stored value."""
    if not isinstance(d, dict):
        return {}
    return {k: d[k] for k in d if k in LOOK_FIELDS or k.startswith("background")}


def has_look(d):
    """Has a real look: some look field set to something other than the overlay's blank default
    (scale 1, no offsets, black colour), which the app writes for a species nobody styled."""
    if not isinstance(d, dict) or not (HAS_LOOK & set(d)):
        return False
    return not (d.get("imageScale", 1) == 1 and not d.get("imageXOffset") and not d.get("imageYOffset")
                and d.get("overlay_color", "#000000") in ("#000000", None))


# ---- where Scott's edits live
def user_data_dir(arg=None):
    if arg:
        return arg
    if os.name == "nt":
        base = os.environ.get("APPDATA", "")
    elif sys.platform == "darwin":
        base = os.path.expanduser("~/Library/Application Support")
    else:
        base = os.path.expanduser("~/.config")
    return os.path.join(base, "stp-overlay")


def user_overrides(ud):
    """Looks saved by an installed build (gens 2-5 `user_<key>` in user_state.json; gen3 also plain keys)."""
    st = load_json(os.path.join(ud, "data", "user_state.json"), {}) or {}
    out = {}
    for gen in GENS:
        sec = st.get(gen) or {}
        for k, v in sec.items():
            if k.startswith("user_") and isinstance(v, dict):
                out.setdefault(gen, {}).setdefault(k[5:], {}).update(v)
            elif gen == "gen3" and isinstance(v, dict) and has_look(v):
                out.setdefault(gen, {}).setdefault(k, {}).update(v)
    return out


def gen1_user_looks(ud):
    """gen1 per-species settings (data/<game>/<species>/settings.json), as preset fields."""
    out = {}
    for p in glob.glob(os.path.join(ud, "data", "*", "*", "settings.json")):
        game = os.path.basename(os.path.dirname(os.path.dirname(p)))
        sp = os.path.basename(os.path.dirname(p))
        s = (load_json(p, {}) or {}).get("styling") or {}
        a, b, u = s.get("artwork") or {}, s.get("background") or {}, s.get("ui") or {}
        if not a:
            continue
        v = {"imageScale": a.get("scale"), "imageXOffset": a.get("offset_x"), "imageYOffset": a.get("offset_y"),
             "imageFlip": a.get("flip"), "overlay_color": u.get("color"), "ui_saturation": u.get("saturation"),
             "backgroundTexture": b.get("texture")}
        g = "Yellow" if game == "Yellow" else "Red and Blue"
        out[f"gen1|{g}|{sp}"] = {k: x for k, x in v.items() if x is not None}
    return out


# ---- what exists
def inventory():
    """Every species in every game: {id, gen, game, species, img, t1, fam, current}."""
    storage = load_json(STORAGE, {}).get("games", {})
    files = {}
    for gen in GENS:
        for p in glob.glob(os.path.join(style_dir(gen), "*.json")):
            k = os.path.basename(p)[:-5]
            if k != "index":
                files[(gen, k)] = load_json(p)
    inv = []
    for key, d in DEX.items():
        gen, game = key.split("|")
        rel = IMG.get(key) or IMG.get(gen)
        for s, info in d.items():
            img = os.path.join(IMAGES, info["img"]) if info.get("img") else os.path.join(IMAGES, rel, s + ".webp")
            e = dict(gen=gen, game=game, species=s, img=img if os.path.exists(img) else None,
                     t1=info.get("t1"), fam=info.get("fam") or [])
            if gen == "gen1":
                # Red and Blue presets are written to games.Red; a look Scott kept under games.Blue counts too.
                cur = None
                for gk in (["Yellow"] if game == "Yellow" else ["Red", "Blue"]):
                    st = ((storage.get(gk) or {}).get(s) or {}).get("style")
                    if st and (cur is None or (has_look(st) and not has_look(cur))):
                        cur = st
                e.update(id=f"gen1|{game}|{s}", current=cur or None)
            else:
                fk = file_key(gen, game, s)
                e.update(id=f"{gen}|{fk}", fkey=fk, current=files.get((gen, fk)), exists=(gen, fk) in files)
            inv.append(e)
    return inv, files


def line_entries(files):
    """Evolution-line looks Scott styled: `<Game>_<Final>-line-<Species>` with look fields."""
    out = []
    for (gen, k), v in files.items():
        if "-line-" in k and has_look(v):
            game, rest = k.split("_", 1)
            final, sp = rest.split("-line-", 1)
            out.append(dict(id=f"{gen}|{k}", gen=gen, game=game, species=sp, line_of=final, current=v,
                            solo_id=f"{gen}|{game}_{sp}"))
    return out


def same(a, b, keys):
    for k in keys:
        x, y = a.get(k), b.get(k)
        if isinstance(x, float) or isinstance(y, float):
            if x is None or y is None or abs(x - y) > 1e-6:
                return False
        elif x != y:
            return False
    return True


# ---- commands
def cmd_diff(args):
    k = known()
    inv, files = inventory()
    ud = user_data_dir(args.user_data)
    ov = user_overrides(ud)
    g1 = gen1_user_looks(ud)
    by_id = {e["id"]: e for e in inv}
    changes = []

    def current_of(e):
        cur = dict(e["current"] or {}) if isinstance(e.get("current"), dict) else {}
        if e["gen"] != "gen1":
            cur.update(ov.get(e["gen"], {}).get(e["id"].split("|", 1)[1], {}))
        else:
            cur.update(g1.get(e["id"], {}))
        return cur

    for e in inv:
        cur = current_of(e)
        if not has_look(cur):
            continue
        gen_v = k["generated"].get(e["id"])
        usr_v = k["user"].get(e["id"])
        if usr_v is not None and same(look(cur), usr_v, set(usr_v) | set(look(cur))):
            continue
        if gen_v is not None and same(cur, gen_v, gen_v.keys()):
            continue
        kind = "edited-generated" if gen_v is not None else ("edited-own" if usr_v is not None else "new-own")
        changes.append(dict(id=e["id"], kind=kind, gen=e["gen"], game=e["game"], species=e["species"],
                            stage=category(e["species"], rules.GENNUM[e["gen"]]), t1=e["t1"],
                            img=os.path.relpath(e["img"], IMAGES).replace("\\", "/") if e["img"] else None,
                            label=rules.label(e["img"]) if e["img"] else {},
                            now=look(cur), generated=gen_v, learned=usr_v))
    for le in line_entries(files):
        cur = dict(le["current"]); cur.update(ov.get(le["gen"], {}).get(le["id"].split("|", 1)[1], {}))
        usr_v = k["user"].get(le["id"])
        if usr_v is not None and same(look(cur), usr_v, set(usr_v) | set(look(cur))):
            continue
        solo = by_id.get(le["solo_id"])
        changes.append(dict(id=le["id"], kind="line-look", gen=le["gen"], game=le["game"], species=le["species"],
                            line_of=le["line_of"], stage=category(le["species"], rules.GENNUM[le["gen"]]),
                            t1=solo["t1"] if solo else None,
                            img=os.path.relpath(solo["img"], IMAGES).replace("\\", "/") if solo and solo["img"] else None,
                            now=look(cur), generated=k["generated"].get(le["solo_id"]),
                            solo_now=look(current_of(solo)) if solo else None, learned=usr_v))
    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(changes, f, indent=1)
    if not changes:
        print("No new changes since the last accept.")
    for c in changes:
        print(f"\n[{c['kind']}] {c['gen']} {c['game']} {c['species']}"
              + (f" (in the {c['line_of']} line)" if c.get("line_of") else "") + f"  stage={c['stage']} type={c['t1']}")
        if c.get("label"):
            print("   labels:", c["label"])
        ref = c.get("generated") or {}
        for f in sorted(set(c["now"]) | set(ref)):
            a, b = ref.get(f), c["now"].get(f)
            if a != b and (f in rules.STYLE_KEYS or f in ref):
                print(f"   {f}: generated {a!r} -> Scott {'(not stored: overlay default)' if b is None else repr(b)}")
        bg = {f: x for f, x in c["now"].items() if f.startswith("background") and f not in ref}
        if bg:
            print("   background:", bg)
    print(f"\n{len(changes)} change(s). User data read from {ud}")


def regenerate_ok(e, k):
    """May the generator write this entry? Only when it has no look, or exactly the generated one."""
    cur = e.get("current")
    if e["gen"] != "gen1" and e.get("exists") and cur is None:
        return False  # a file holding `null` was cleared on purpose
    g = k["generated"].get(e["id"])
    if e["gen"] == "gen1" and cur and not has_look(cur) and g is None:
        return False  # a gen1 `style` holding something else (old run data): left as it was
    if not has_look(cur):
        return True
    return g is not None and same(cur, g, g.keys())


def cmd_generate(args):
    k = known()
    inv, _ = inventory()
    only = set(args.only.split(",")) if args.only else None
    species = set(args.species.split(",")) if args.species else None
    storage = load_json(STORAGE) if args.write else None
    new_keys, n, changed, skipped = {}, 0, 0, 0
    for e in inv:
        if not e["img"] or (only and e["gen"] not in only) or (species and e["species"] not in species):
            continue
        if not regenerate_ok(e, k):
            skipped += 1
            continue
        v, cat, _ = rules.style_for(e)
        old = k["generated"].get(e["id"])
        if old == v and has_look(e["current"]):
            continue
        n += 1
        changed += old is not None
        if not args.write:
            print(e["id"], cat, v if old is None else {f: (old.get(f), v.get(f)) for f in v if old.get(f) != v.get(f)})
            continue
        if e["gen"] == "gen1":
            gk = "Yellow" if e["game"] == "Yellow" else "Red"
            ent = storage["games"].setdefault(gk, {}).setdefault(e["species"], {})
            st = {f: x for f, x in (ent.get("style") or {}).items() if f not in rules.STYLE_KEYS}
            st.update(v)
            ent["style"] = st
        else:
            p = os.path.join(style_dir(e["gen"]), e["fkey"] + ".json")
            out = dict(e["current"] or {})
            for f in rules.STYLE_KEYS:
                out.pop(f, None)
            out.update(v)
            with open(p, "w", encoding="utf-8", newline="\n") as f:
                f.write(json.dumps(out, indent=2) + "\n")
            if not e.get("exists"):
                new_keys.setdefault(e["gen"], []).append(e["fkey"])
        k["generated"][e["id"]] = v
    if args.write:
        for gen, keys in new_keys.items():
            ip = os.path.join(style_dir(gen), "index.json")
            idx = load_json(ip, [])
            idx += [x for x in keys if x not in idx]
            with open(ip, "w", encoding="utf-8", newline="\n") as f:
                f.write(json.dumps(idx, indent=2) + "\n")
        with open(STORAGE, "w", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps(storage, indent=4))
        save_known(k)
    print(f"{'Wrote' if args.write else 'Would write'} {n} look(s) ({changed} replacing an older generated look); "
          f"left {skipped} of Scott's own looks alone.")


def cmd_accept(args):
    k = known()
    inv, files = inventory()
    ud = user_data_dir(args.user_data)
    ov, g1 = user_overrides(ud), gen1_user_looks(ud)
    n = 0
    for e in inv:
        cur = dict(e["current"] or {}) if isinstance(e.get("current"), dict) else {}
        cur.update(g1.get(e["id"], {}) if e["gen"] == "gen1" else ov.get(e["gen"], {}).get(e["id"].split("|", 1)[1], {}))
        g = k["generated"].get(e["id"])
        if has_look(cur) and not (g is not None and same(cur, g, g.keys())):
            if k["user"].get(e["id"]) != look(cur):
                k["user"][e["id"]] = look(cur); n += 1
    for le in line_entries(files):
        cur = look(le["current"])
        if k["user"].get(le["id"]) != cur:
            k["user"][le["id"]] = cur; n += 1
    save_known(k)
    print(f"Marked {n} look(s) as learned.")


def cmd_show(args):
    inv, _ = inventory()
    k = known()
    for e in inv:
        if e["species"].lower() != args.species.lower() or (args.gen and e["gen"] != args.gen) \
                or (args.game and e["game"] != args.game) or not e["img"]:
            continue
        v, cat, capped = rules.style_for(e)
        print(f"{e['id']}  stage={cat}{' (capped for crispness)' if capped else ''}  labels={rules.label(e['img'])}")
        print("   rules now :", v)
        print("   stored    :", look(e["current"]) or None)
        print("   generated :", k["generated"].get(e["id"]))
        print("   learned   :", k["user"].get(e["id"]))


def _draw(c, v, gen, game, box=300):
    """A rough picture of one look: the art over its type's background in the art box. Lines mark
    the box centre and where the feet should sit."""
    from PIL import Image, ImageDraw, ImageOps
    from art import texture_display_color
    t = rules.T[gen]; C = t["C"]
    canvas = Image.new("RGB", (C, C), (40, 40, 40))
    tp = rules.texture_path(gen, c.get("t1") or "Normal")
    if tp:
        canvas = Image.new("RGB", (C, C), tuple(int(x) for x in texture_display_color(tp)))
    art = Image.open(os.path.join(IMAGES, c["img"])).convert("RGBA")
    s = float(v.get("imageScale", 1)); F = -1 if v.get("imageFlip") else 1
    if gen == "gen1" and game == "Red and Blue":
        w, h = art.size
    else:
        w = h = C
    art = art.resize((max(1, int(w * s)), max(1, int(h * s))))
    if F == -1:
        art = ImageOps.mirror(art)
    cx = C / 2 + s * F * v.get("imageXOffset", 0); cy = C / 2 - s * v.get("imageYOffset", 0)
    canvas.paste(art, (int(cx - art.width / 2), int(cy - art.height / 2)), art)
    d = ImageDraw.Draw(canvas)
    d.line([(C / 2, 0), (C / 2, C)], fill=(255, 255, 255)); d.line([(0, C / 2 + t["bot"]), (C, C / 2 + t["bot"])], fill=(255, 255, 0))
    d.rectangle([C - 60, 0, C, 40], fill=v.get("overlay_color") or "#000000")
    return canvas.resize((box, box))


def cmd_preview(args):
    """Side-by-side pictures (generated | Scott's) for each change in a diff JSON."""
    from PIL import Image, ImageDraw
    changes = json.load(open(args.diff_json, encoding="utf-8"))
    rows = [c for c in changes if c.get("img")][: args.max]
    if not rows:
        print("Nothing to draw."); return
    box = 300
    sheet = Image.new("RGB", (box * 2 + 20, (box + 30) * len(rows)), (255, 255, 255))
    d = ImageDraw.Draw(sheet)
    for i, c in enumerate(rows):
        y = i * (box + 30)
        d.text((4, y + 4), f"{c['gen']} {c['game']} {c['species']} ({c['kind']}): generated | Scott", fill=(0, 0, 0))
        if c.get("generated"):
            sheet.paste(_draw(c, c["generated"], c["gen"], c["game"], box), (0, y + 24))
        sheet.paste(_draw(c, c["now"], c["gen"], c["game"], box), (box + 20, y + 24))
    sheet.save(args.out)
    print("Saved", args.out)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("diff"); d.add_argument("--json"); d.add_argument("--user-data")
    g = sub.add_parser("generate"); g.add_argument("--write", action="store_true"); g.add_argument("--only")
    g.add_argument("--species")
    a = sub.add_parser("accept"); a.add_argument("--user-data")
    s = sub.add_parser("show"); s.add_argument("species"); s.add_argument("--gen"); s.add_argument("--game")
    p = sub.add_parser("preview"); p.add_argument("diff_json"); p.add_argument("--out", default="pokemon-style-preview.png")
    p.add_argument("--max", type=int, default=12)
    args = ap.parse_args()
    {"diff": cmd_diff, "generate": cmd_generate, "accept": cmd_accept, "show": cmd_show, "preview": cmd_preview}[args.cmd](args)


if __name__ == "__main__":
    main()
