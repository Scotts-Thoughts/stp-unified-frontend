"""Makes gen 6's own UI frames: gen 5's frames with every cut-off corner turned into a round one.

    py tools/gen6/make-rounded-ui.py

Reads the gen 5 frame pictures the 3DS overlay wears (src/renderer/public/images/gen5/...) and writes the same
pictures, at the same places and in the same colours, under images/gen6/ (same names). Gen 5's own files are never written.

What changes, shape by shape (gen 6's battle screens are built from rounded boxes and pill-shaped buttons):
  - A cut-off (chamfered) corner between a horizontal and a vertical edge becomes a quarter circle. Its radius is
    ROUNDNESS times the cut's size, so a 20px cut becomes a ~34px round corner. 1.7 also keeps the frame's stacked
    outlines (each 1-2px inside the last) concentric: an inset of d shrinks a 45-degree cut by 0.586*d, and
    1.7 * 0.586 is about 1.
  - A pointed end (two slanted edges meeting between two horizontal edges, as in the ability and held item boxes,
    the stat tiles and the enemy team's move tags) becomes a half circle: the box turns into a pill.
  - Anything else (straight edges, the green game areas, gradients, filters, text lines) is copied unchanged.

Run it again after a gen 5 frame changes; it overwrites the gen 6 copies. Standard library only.
"""
import math
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
IMAGES = os.path.normpath(os.path.join(HERE, "..", "..", "src", "renderer", "public", "images"))
SRC = os.path.join(IMAGES, "gen5")

# Every gen 5 frame games/gen6 draws (Overlay.vue, playerPanel.ts, enemyPanel.ts), under images/gen5/.
FILES = [f"ui/{name}" for name in [
    "timer.svg", "timer_2.svg", "gametime.svg", "stats.svg", "exp_bar.svg", "nature_friendship.svg",
    "stats_values.svg", "ability_helditem.svg", "moveset.svg", "movepool.svg", "splits.svg", "opponent.svg",
    "accuracy.svg", "evasion.svg",
    *[f"enemy_ui/{n}.svg" for n in range(6)],
    *[f"speed_comp/{n}.svg" for n in range(6)],
    *[f"nature arrows/{way}/{stat}.svg" for way in ("raises", "lowers")
      for stat in ("Attack", "Defense", "Neutral", "Special Attack", "Special Defense", "Speed")],
]] + [f"enemy-area/stats/current_/{n}.svg" for n in range(6)]

ROUNDNESS = 1.7

# Gen 7 (Sun/Moon) keeps gen 5's angled cuts and softens every join: each corner of the outline becomes a short
# curve, so a straight edge bends into the slanted cut and the cut bends into the next edge, as Alola's menus do.
# A join's curve starts SOFTNESS of the shorter edge's length away from the corner, at most SOFT_MAX gen 5 px, so the points stay points.
EDGE_STROKE = "stroke: #000; stroke-width: 0.8px; stroke-linejoin: round;"
SOFTNESS = 0.22
SOFT_MAX = 7
# Alola's panels (the Sun/Moon party menu) are long hexagons: flat top and bottom, and each side a steep point,
# '<' on the left and '>' on the right, sticking out about a quarter of the panel's height. Gen 7 redraws every box that
# way (a convex box: gen 5's cut-corner and pointed boxes; square windows stay square), at most POINT_MAX gen 5 px so
# a tall box's corners don't crowd what is inside it. Frames with a window cut in them (the movepool) can only
# point as far as their border is wide.
POINT = 0.24
POINT_MAX = 12
POINT_CAPS = {"ui/movepool.svg": 3, "ui/splits.svg": 3}
POINT_CAP = POINT_MAX  # the cap for the file being converted
# The big panels at the canvas's sides (timer, faults, stats, the enemy team) are widened by half their points:
# the points reach half into the side margins and half inward, so they crowd what is inside less. Only boxes taller than WIDEN_MIN_H widen (the tiles and tags inside them keep their size).
WIDEN_FILES = {"ui/timer.svg", "ui/timer_2.svg", "ui/stats.svg", "ui/opponent.svg"}
WIDEN_MIN_H = 30  # every layer of the trainer-name bar (37..47 tall) must widen alike
WIDEN_SHARE = 0.5  # how much of the point goes outward (Scott: all of it was too much, none crowded the inside)
WIDEN = False  # whether the file being converted is one of them
# The movepool and splits frame doesn't take the hexagon (Scott: it looked odd there): it keeps gen 5's outline, both
# top corners cut, and every join gets the soft curve, so its square bottom corners come out softly rounded.
GEN5_SHAPE_FILES = {"ui/movepool.svg", "ui/splits.svg"}
GEN5_SHAPE = False  # whether the file being converted is one of them
STYLE = "round"  # "round" (gen 6) or "soft" (gen 7): the style of the file being converted

# Gen 6's stats panel is taller than gen 5's (it mirrors the bottom screen's slot: games/gen6/layout.ts STATS_*), and
# the room goes to its rows. These move a frame's points up or down (gen 5 px); games/gen6/style.css and
# playerPanel.ts move the text and gauges to match (STATS_ROWS there).
GEN5_TILE_TOPS, GEN5_TILE_H = (866, 929, 992), 59
TILE_TOPS, TILE_H = (853, 920, 987), 63


def tiles_map(y):
    """The stat tiles: three rows, each 4px taller and higher up, keeping their bottom line (~1050). A point outside a
    tile (a shadow's region) moves with the nearest tile edge above it, or with the first tile's top."""
    shift = TILE_TOPS[0] - GEN5_TILE_TOPS[0]
    for old, new in zip(GEN5_TILE_TOPS, TILE_TOPS):
        if y < old:
            return y + shift
        if y <= old + GEN5_TILE_H:
            return new + (y - old) * TILE_H / GEN5_TILE_H
        shift = (new + TILE_H) - (old + GEN5_TILE_H)
    return y + shift


STATS_FRAME_LIFT = 17.5  # the stats frame's top edge rises this much: 305px tall at 408 wide (layout.ts STATS_TOP)
MAPS = {
    "ui/stats.svg": lambda y: y - STATS_FRAME_LIFT if y < 805 else y,
    "ui/exp_bar.svg": lambda y: y - 16,
    "ui/nature_friendship.svg": lambda y: y - 13,
    "ui/stats_values.svg": tiles_map,
    # The moveset frame's top comes down to hug its header row (games/gen6/layout.ts MOVESET_TRIM).
    "ui/moveset.svg": lambda y: y + 12 if y < 950 else y,
    **{f"ui/nature arrows/{way}/{stat}.svg": tiles_map for way in ("raises", "lowers")
       for stat in ("Attack", "Defense", "Neutral", "Special Attack", "Special Defense", "Speed")},
}
MAP = None  # the map of the file being converted
X_SHIFT = 0  # and how far it moves sideways (gen 7's nature arrows)


def arrow_in_tile(svg):
    """Gen 7: a nature arrow centred on its stat tile's middle line and 1.5px further from its pointed right side.

    Gen 5 draws the arrow in the top or bottom half of the tile, near its right edge; gen 7's tiles are hexagons
    whose right side slants in there, so the arrow would poke out of the tile."""
    nums = [float(v) for v in re.findall(r"-?(?:\d+\.?\d*|\.\d+)", (re.search(r'points="([^"]*)"', svg) or [None, ""])[1])]
    if not nums:
        return tiles_map, 0
    ys = nums[1::2]
    mid = (min(ys) + max(ys)) / 2
    for old, new in zip(GEN5_TILE_TOPS, TILE_TOPS):
        if old <= mid <= old + GEN5_TILE_H:
            dy = (new + TILE_H / 2) - tiles_map(mid)
            return (lambda y: tiles_map(y) + dy), -1.5
    return tiles_map, 0
# Pictures that only move with the stat tiles: their shapes (arrows) stay pointed.
KEEP_SHAPE = {name for name in MAPS if name.startswith("ui/nature arrows/")}
ROUND = True  # whether the file being converted is rounded
EPS = 1e-6


# --- reading a path into polylines ----------------------------------------------------------------------------------

TOKEN = re.compile(r"[MmLlHhVvCcSsQqTtZzAa]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?")


def parse_path(d):
    """Subpaths as ([points], closed), or None if the path holds a curve that isn't a straight line."""
    tokens = TOKEN.findall(d)
    i, cmd = 0, None
    x = y = 0.0
    subpaths, pts = [], []
    start = (0.0, 0.0)

    def num():
        nonlocal i
        v = float(tokens[i])
        i += 1
        return v

    def straight(p0, cps, p1):
        # A curve is kept only if its control points lie on the chord (Illustrator writes chamfers as such curves).
        dx, dy = p1[0] - p0[0], p1[1] - p0[1]
        length = math.hypot(dx, dy)
        for cx, cy in cps:
            if length < EPS:
                if math.hypot(cx - p0[0], cy - p0[1]) > 0.05:
                    return False
            elif abs((cx - p0[0]) * dy - (cy - p0[1]) * dx) / length > 0.05:
                return False
        return True

    while i < len(tokens):
        t = tokens[i]
        if t.isalpha():
            cmd = t
            i += 1
            if cmd in "Zz":
                if pts:
                    subpaths.append((pts, True))
                pts = []
                x, y = start
                continue
        rel = cmd.islower()
        c = cmd.upper()
        ox, oy = (x, y) if rel else (0.0, 0.0)
        if c == "M":
            if pts:
                subpaths.append((pts, False))
            x, y = ox + num(), oy + num()
            pts = [(x, y)]
            start = (x, y)
            cmd = "l" if rel else "L"
        elif c == "L":
            x, y = ox + num(), oy + num()
            pts.append((x, y))
        elif c == "H":
            x = ox + num()
            pts.append((x, y))
        elif c == "V":
            y = oy + num()
            pts.append((x, y))
        elif c == "C":
            c1 = (ox + num(), oy + num())
            c2 = (ox + num(), oy + num())
            p1 = (ox + num(), oy + num())
            if not straight((x, y), [c1, c2], p1):
                return None
            x, y = p1
            pts.append(p1)
        elif c == "S":
            c2 = (ox + num(), oy + num())
            p1 = (ox + num(), oy + num())
            if not straight((x, y), [c2], p1):
                return None
            x, y = p1
            pts.append(p1)
        else:
            return None
    if pts:
        subpaths.append((pts, False))
    if MAP:
        subpaths = [([(x + X_SHIFT, MAP(y)) for x, y in p], closed) for p, closed in subpaths]
    # An outline that ends where it began is closed even without a Z (Illustrator's compound paths).
    return [(p, closed or (len(p) > 2 and math.hypot(p[0][0] - p[-1][0], p[0][1] - p[-1][1]) < 0.05))
            for p, closed in subpaths]


# --- rounding --------------------------------------------------------------------------------------------------------

def clean(pts, closed):
    """Drops zero-length steps and merges steps that carry on in the same direction."""
    out = []
    for p in pts:
        if out and math.hypot(p[0] - out[-1][0], p[1] - out[-1][1]) < 1e-3:
            continue
        out.append(p)
    if closed and len(out) > 1 and math.hypot(out[0][0] - out[-1][0], out[0][1] - out[-1][1]) < 0.05:
        out.pop()
    changed = True
    while changed and len(out) > 2:
        changed = False
        n = len(out)
        for k in range(n if closed else n - 2):
            a, b, c = out[k % n], out[(k + 1) % n], out[(k + 2) % n]
            d1 = (b[0] - a[0], b[1] - a[1])
            d2 = (c[0] - b[0], c[1] - b[1])
            l1, l2 = math.hypot(*d1), math.hypot(*d2)
            if l1 < EPS or l2 < EPS:
                continue
            cross = (d1[0] * d2[1] - d1[1] * d2[0]) / (l1 * l2)
            dot = (d1[0] * d2[0] + d1[1] * d2[1]) / (l1 * l2)
            if abs(cross) < 0.02 and dot > 0:
                del out[(k + 1) % n]
                changed = True
                break
    return out


def kind(a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    if abs(dy) <= 0.02 * max(abs(dx), 1e-9) and abs(dx) > 0.05:
        return "h"
    if abs(dx) <= 0.02 * max(abs(dy), 1e-9) and abs(dy) > 0.05:
        return "v"
    return "d"


def unit(a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy)
    return (dx / length, dy / length)


def fmt(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def round_subpath(pts, closed):
    """The subpath as SVG path data with its cut corners and pointed ends rounded."""
    if not ROUND:
        return None
    if STYLE == "soft":
        return soft_subpath(pts, closed)
    pts = clean(pts, closed)
    n = len(pts)
    if n < 3:
        return None
    segs = [(k, (k + 1) % n) for k in range(n if closed else n - 1)]
    kinds = [kind(pts[a], pts[b]) for a, b in segs]
    m = len(segs)

    # Runs of slanted segments with a straight (horizontal or vertical) segment on each side.
    corners = []  # (first slanted seg index, last slanted seg index, entering seg index, exiting seg index)
    visited = set()
    for s in range(m):
        if kinds[s] != "d" or s in visited:
            continue
        if not closed and (s == 0 or kinds[s - 1] == "d"):
            pass
        # walk back to the run's first slanted segment
        first = s
        steps = 0
        while kinds[(first - 1) % m] == "d" and steps < m and (closed or first > 0):
            first = (first - 1) % m
            steps += 1
        if steps >= m:
            return None  # all slanted: not a frame shape
        last = first
        run = [first]
        while kinds[(last + 1) % m] == "d" and (closed or last + 1 < m):
            last = (last + 1) % m
            run.append(last)
        visited.update(run)
        enter, exit_ = (first - 1) % m, (last + 1) % m
        if not closed and (first == 0 or last == m - 1):
            continue
        corners.append((first, last, enter, exit_))

    # Work out each corner's replacement: the point where the entering edge now stops, the arc(s), the exit point.
    plans = {}
    for first, last, enter, exit_ in corners:
        ea, eb = pts[segs[enter][0]], pts[segs[enter][1]]
        xa, xb = pts[segs[exit_][0]], pts[segs[exit_][1]]
        din, dout = unit(ea, eb), unit(xa, xb)
        cross = din[0] * dout[1] - din[1] * dout[0]
        dot = din[0] * dout[0] + din[1] * dout[1]
        run_pts = [pts[segs[k][1]] for k in range(first, first + ((last - first) % m) + 1)]
        run_pts = [pts[segs[first][0]]] + [pts[segs[k % m][1]] for k in range(first, first + ((last - first) % m) + 1)]
        P, Q = run_pts[0], run_pts[-1]
        if abs(dot) < 0.02 and abs(cross) > 0.98:
            # Cut corner: the two straight edges would meet at C.
            if kinds[enter] == "h":
                C = (Q[0], P[1])
            else:
                C = (P[0], Q[1])
            leg = (math.hypot(P[0] - C[0], P[1] - C[1]) + math.hypot(Q[0] - C[0], Q[1] - C[1])) / 2
            if leg < 0.3:
                continue
            plans[first] = {"type": "corner", "C": C, "din": din, "dout": dout, "leg": leg, "cross": cross,
                            "enter": enter, "exit": exit_, "R": ROUNDNESS * leg}
        elif dot < -0.98:
            # Pointed end between two parallel edges: a half circle.
            perp = (-din[1], din[0])
            sep = (Q[0] - P[0]) * perp[0] + (Q[1] - P[1]) * perp[1]
            r = abs(sep) / 2
            if r < 0.3:
                continue
            tip = max((p[0] - P[0]) * din[0] + (p[1] - P[1]) * din[1] for p in run_pts)
            centre_along = tip - r
            mid = (P[0] + perp[0] * sep / 2 + din[0] * centre_along, P[1] + perp[1] * sep / 2 + din[1] * centre_along)
            P2 = (P[0] + din[0] * centre_along, P[1] + din[1] * centre_along)
            Q2 = (P2[0] + perp[0] * sep, P2[1] + perp[1] * sep)
            T = (mid[0] + din[0] * r, mid[1] + din[1] * r)
            sweep = 1 if sep > 0 else 0
            plans[first] = {"type": "cap", "P2": P2, "Q2": Q2, "T": T, "r": r, "sweep": sweep,
                            "enter": enter, "exit": exit_, "P": P, "din": din, "perp": perp, "sep": sep,
                            "centre": (mid[0], mid[1])}

    if not plans:
        return None

    # Keep round corners from running past the middle of an edge they share with another corner.
    by_enter = {p["enter"]: p for p in plans.values() if p["type"] == "corner"}
    by_exit = {p["exit"]: p for p in plans.values() if p["type"] == "corner"}
    for s in range(m):
        a, b = pts[segs[s][0]], pts[segs[s][1]]
        length = math.hypot(b[0] - a[0], b[1] - a[1])
        at_end, at_start = by_enter.get(s), by_exit.get(s)
        legs = length + (at_end["leg"] if at_end else 0) + (at_start["leg"] if at_start else 0)
        budget = legs / (2 if at_end and at_start else 1)
        for p in (at_end, at_start):
            if p and p["R"] > budget:
                p["R"] = budget

    return {"pts": pts, "segs": segs, "plans": plans, "closed": closed, "m": m}


def soft_subpath(pts, closed):
    """Gen 7: every corner of the outline (a closed one; open lines stay as they are) becomes a short arc."""
    pts = clean(pts, closed)
    n = len(pts)
    if n < 3 or not closed:
        return None
    if n == 4 and all(kind(pts[k], pts[(k + 1) % 4]) in "hv" for k in range(4)):
        return None  # a square window (the movepool's table) stays square: the table inside it is
    if not GEN5_SHAPE:
        pts = alola_box(pts)
    n = len(pts)
    plans = {}
    for k in range(n):
        prev, here, nxt = pts[k - 1], pts[k], pts[(k + 1) % n]
        din, dout = unit(prev, here), unit(here, nxt)
        cross = din[0] * dout[1] - din[1] * dout[0]
        dot = din[0] * dout[0] + din[1] * dout[1]
        if abs(cross) < 0.05 or dot < -0.99:
            continue
        shorter = min(math.hypot(here[0] - prev[0], here[1] - prev[1]), math.hypot(nxt[0] - here[0], nxt[1] - here[1]))
        reach = min(SOFTNESS * shorter, SOFT_MAX)
        if reach < 0.3:
            continue
        turn = math.acos(max(-1.0, min(1.0, dot)))  # how far the outline turns at this corner
        r = reach / math.tan(turn / 2)
        side = 1 if cross > 0 else -1
        normal = (-din[1] * side, din[0] * side)  # towards the inside of the turn
        p_in = (here[0] - din[0] * reach, here[1] - din[1] * reach)
        centre = (p_in[0] + normal[0] * r, p_in[1] + normal[1] * r)
        plans[k] = {"type": "fillet", "V": here, "din": din, "dout": dout, "r": r, "turn": turn,
                    "cross": cross, "centre": centre}
    if not plans:
        return None
    return {"soft": True, "pts": pts, "plans": plans, "closed": True}


def alola_box(pts):
    """A convex box (not a plain rectangle) redrawn as Alola's hexagon over the same bounding box."""
    n = len(pts)
    if not 4 <= n <= 10:
        return pts
    signs = set()
    for k in range(n):
        a, b, c = pts[k - 1], pts[k], pts[(k + 1) % n]
        cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
        if abs(cr) > 1e-6:
            signs.add(cr > 0)
    if len(signs) != 1:
        return pts  # not convex: a notched or one-sided shape keeps its own outline
    if n == 4 and all(kind(pts[k], pts[(k + 1) % 4]) in "hv" for k in range(4)):
        return pts  # a square window or plain rectangle
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    d = min(POINT * (y1 - y0), POINT_CAP, (x1 - x0) / 4)
    if WIDEN and y1 - y0 > WIDEN_MIN_H:
        x0, x1 = x0 - d * WIDEN_SHARE, x1 + d * WIDEN_SHARE
    ym = (y0 + y1) / 2
    box = [(x0 + d, y0), (x1 - d, y0), (x1, ym), (x1 - d, y1), (x0 + d, y1), (x0, ym)]
    return box if True in signs else box[::-1]


def emit_soft(state):
    pts, plans = state["pts"], state["plans"]
    out = []
    for k, here in enumerate(pts):
        plan = plans.get(k)
        if plan is None:
            out.append(("L", here))
            continue
        reach = plan["r"] * math.tan(plan["turn"] / 2)
        din, dout = plan["din"], plan["dout"]
        out.append(("L", (here[0] - din[0] * reach, here[1] - din[1] * reach)))
        out.append(("A", plan["r"], 1 if plan["cross"] > 0 else 0, (here[0] + dout[0] * reach, here[1] + dout[1] * reach)))
    d = []
    for i, item in enumerate(out):
        if item[0] == "L":
            d.append(f"{'M' if i == 0 else 'L'}{fmt(item[1][0])},{fmt(item[1][1])}")
        else:
            _, r, sweep, p = item
            d.append(f"A{fmt(r)},{fmt(r)} 0 0 {sweep} {fmt(p[0])},{fmt(p[1])}")
    return "".join(d) + "Z"


def centre_of(plan):
    """Where a round corner's or a half circle's centre is."""
    if plan["type"] in ("cap", "fillet"):
        return plan["centre"]
    C, R, din, dout = plan["C"], plan["R"], plan["din"], plan["dout"]
    return (C[0] - din[0] * R + dout[0] * R, C[1] - din[1] * R + dout[1] * R)


def share_centres(states):
    """Makes the stacked outlines of one frame concentric.

    A frame is drawn as several shapes, each 1-2px inside the last (fill, grey ring, dark ring, black edge), and
    rounding each on its own gives every one a slightly different centre, so the rings come out thicker in some
    places than others: a visible wobble. Corners of the same kind within a few pixels of each other are one corner;
    every shape takes the outermost shape's centre and its own radius from that.
    """
    plans = [p for st in states for p in st["plans"].values()]
    groups = []
    for plan in plans:
        if plan["type"] == "fillet":
            key = ("fillet", round(plan["din"][0] * 4), round(plan["din"][1] * 4), round(plan["dout"][0] * 4), round(plan["dout"][1] * 4))
        else:
            key = (plan["type"], round(plan["din"][0]), round(plan["din"][1]),
               round(plan["dout"][0]) if plan["type"] == "corner" else 0,
               round(plan["dout"][1]) if plan["type"] == "corner" else 0)
        here = centre_of(plan)
        for g in groups:
            if g["key"] == key and math.hypot(here[0] - g["at"][0], here[1] - g["at"][1]) < 6:
                g["plans"].append(plan)
                break
        else:
            groups.append({"key": key, "at": here, "plans": [plan]})
    for g in groups:
        if len(g["plans"]) < 2:
            continue
        if g["key"][0] == "corner":
            outer = max(g["plans"], key=lambda p: p["R"])
            c = centre_of(outer)
            for plan in g["plans"]:
                if plan is outer:
                    continue
                C, din, dout = plan["C"], plan["din"], plan["dout"]
                along_in = (C[0] - c[0]) * din[0] + (C[1] - c[1]) * din[1]
                along_out = (c[0] - C[0]) * dout[0] + (c[1] - C[1]) * dout[1]
                plan["R"] = max(0.5, (along_in + along_out) / 2)
        elif g["key"][0] == "fillet":
            outer = max(g["plans"], key=lambda p: p["r"])
            c = outer["centre"]
            for plan in g["plans"]:
                if plan is outer:
                    continue
                V, din = plan["V"], plan["din"]
                r = abs(din[0] * (c[1] - V[1]) - din[1] * (c[0] - V[0]))  # c's distance from the entering edge
                plan["r"], plan["centre"] = max(0.3, r), c
        else:
            outer = max(g["plans"], key=lambda p: p["r"])
            c = outer["centre"]
            for plan in g["plans"]:
                if plan is outer:
                    continue
                P, din, perp, sep, r = plan["P"], plan["din"], plan["perp"], plan["sep"], plan["r"]
                along = (c[0] - P[0]) * din[0] + (c[1] - P[1]) * din[1]
                P2 = (P[0] + din[0] * along, P[1] + din[1] * along)
                Q2 = (P2[0] + perp[0] * sep, P2[1] + perp[1] * sep)
                mid = (P2[0] + perp[0] * sep / 2, P2[1] + perp[1] * sep / 2)
                plan.update(P2=P2, Q2=Q2, T=(mid[0] + din[0] * r, mid[1] + din[1] * r), centre=mid)


def emit_subpath(state):
    """The rounded subpath as SVG path data."""
    if state.get("soft"):
        return emit_soft(state)
    pts, segs, plans, closed, m = state["pts"], state["segs"], state["plans"], state["closed"], state["m"]
    skip = set()
    for first, plan in plans.items():
        k = first
        while True:
            skip.add(k)
            if (k + 1) % m == plan["exit"]:
                break
            k = (k + 1) % m
    out = []

    def move_or_line(p):
        out.append(("L", p))

    # Start at the beginning of a straight segment that isn't part of a corner.
    start_seg = next((s for s in range(m) if s not in skip), None)
    if start_seg is None:
        return None
    order = [(start_seg + k) % m for k in range(m)] if closed else list(range(m))
    if closed:
        first_point = pts[segs[start_seg][0]]
        # If a corner exits into the start segment, its exit point replaces the start point.
        for plan in plans.values():
            if plan["exit"] == start_seg:
                first_point = exit_point(plan)
        out.append(("M", first_point))
    else:
        out.append(("M", pts[0]))
    plan_at = {first: plan for first, plan in plans.items()}
    for s in order:
        if s in skip:
            if s in plan_at:
                plan = plan_at[s]
                if plan["type"] == "corner":
                    C, R = plan["C"], plan["R"]
                    p_in = (C[0] - plan["din"][0] * R, C[1] - plan["din"][1] * R)
                    p_out = (C[0] + plan["dout"][0] * R, C[1] + plan["dout"][1] * R)
                    move_or_line(p_in)
                    out.append(("A", R, 1 if plan["cross"] > 0 else 0, p_out))
                else:
                    move_or_line(plan["P2"])
                    out.append(("A", plan["r"], plan["sweep"], plan["T"]))
                    out.append(("A", plan["r"], plan["sweep"], plan["Q2"]))
            continue
        nxt = segs[s][1]
        endpoint = pts[nxt]
        if any(p["enter"] == s for p in plans.values()):
            continue  # the corner's own entry point ends this edge
        if closed and s == order[-1]:
            continue
        move_or_line(endpoint)

    d = []
    for item in out:
        if item[0] in ("M", "L"):
            d.append(f"{item[0]}{fmt(item[1][0])},{fmt(item[1][1])}")
        else:
            _, r, sweep, p = item
            d.append(f"A{fmt(r)},{fmt(r)} 0 0 {sweep} {fmt(p[0])},{fmt(p[1])}")
    if closed:
        d.append("Z")
    return "".join(d)


def exit_point(plan):
    if plan["type"] == "corner":
        C, R = plan["C"], plan["R"]
        return (C[0] + plan["dout"][0] * R, C[1] + plan["dout"][1] * R)
    return plan["Q2"]


def plan_d(d):
    """Each subpath of d as a rounding plan, or as its own straight outline where there is nothing to round."""
    subpaths = parse_path(d)
    if subpaths is None:
        return None
    parts = []
    for pts, closed in subpaths:
        st = round_subpath(pts, closed)
        if st is None:
            parts.append("M" + "L".join(f"{fmt(x)},{fmt(y)}" for x, y in pts) + ("Z" if closed else ""))
        else:
            parts.append(st)
    return parts if MAP or any(isinstance(p, dict) for p in parts) else None


def emit_d(parts):
    return "".join(p if isinstance(p, str) else emit_subpath(p) for p in parts)


# --- the files -------------------------------------------------------------------------------------------------------

def highlight(pts):
    """The faint lip along a box's bottom edge that curls up its bottom-left corner, following the round corner.

    Gen 5's is a thin band: (x0, top) down the cut corner to the bottom, along the bottom to a slanted right end, and
    back. Here the corner part is two arcs around the box's round corner (2px inside it) instead of two slants.
    """
    (x0, top), (x1, inner), (xr_in, _), (xr_out, bottom) = pts[0], pts[1], pts[2], pts[3]
    width = bottom - inner
    r_out = ROUNDNESS * (x1 - x0 - 2) - 2
    r_in = r_out - width
    cx, cy = x0 + r_out, bottom - r_out
    return (f"M{fmt(x0)},{fmt(min(top, cy))}L{fmt(x0)},{fmt(cy)}A{fmt(r_out)},{fmt(r_out)} 0 0 0 {fmt(cx)},{fmt(bottom)}"
            f"L{fmt(xr_out)},{fmt(bottom)}L{fmt(xr_in)},{fmt(inner)}L{fmt(cx)},{fmt(inner)}"
            f"A{fmt(r_in)},{fmt(r_in)} 0 0 1 {fmt(x0 + width)},{fmt(cy)}Z")


def move_filter_region(m):
    """A drop shadow's region (user space) moves with the shapes it shades, or it would cut them off."""
    tag = m.group(0)
    ym, hm = re.search(r'\sy="([-\d.]+)"', tag), re.search(r'\sheight="([-\d.]+)"', tag)
    if not ym or not hm or "userSpaceOnUse" not in tag:
        return tag
    y, h = float(ym.group(1)), float(hm.group(1))
    top, bottom = MAP(y), MAP(y + h)
    tag = tag.replace(ym.group(0), f' y="{fmt(top)}"')
    return tag.replace(hm.group(0), f' height="{fmt(bottom - top)}"')


def convert(svg):
    """Rounds every frame shape in svg. All shapes are planned first so stacked outlines can share centres."""
    pieces = []  # (match, attrs, attribute text to replace, plan parts or highlight d)

    def collect(m, is_polygon):
        attrs = m.group(1)
        if is_polygon:
            am = re.search(r'\spoints="([^"]*)"', attrs)
            nums = [float(v) for v in re.findall(r"-?(?:\d+\.?\d*|\.\d+)", am.group(1))]
            pts = list(zip(nums[0::2], nums[1::2]))
            if 'id="_highlight_"' in attrs:
                # Gen 7's boxes have no bottom-left cut for the faint lip to follow, so it is left out there.
                pieces.append((m, attrs, am.group(0), highlight(pts) if STYLE == "round" else ""))
                return
            parts = plan_d("M" + "L".join(f"{fmt(x)},{fmt(y)}" for x, y in pts) + "Z")
        else:
            am = re.search(r'\sd="([^"]*)"', attrs)
            parts = plan_d(am.group(1))
        if parts is not None:
            pieces.append((m, attrs, am.group(0), parts))

    for m in re.finditer(r"<polygon(\s[^>]*?)(/?>)", svg):
        collect(m, True)
    for m in re.finditer(r"<path(\s[^>]*?)(/?>)", svg):
        collect(m, False)
    share_centres([p for piece in pieces if not isinstance(piece[3], str) for p in piece[3] if isinstance(p, dict)])

    if MAP:
        svg = re.sub(r"<filter\s[^>]*>", move_filter_region, svg)
        pieces.clear()
        for m in re.finditer(r"<polygon(\s[^>]*?)(/?>)", svg):
            collect(m, True)
        for m in re.finditer(r"<path(\s[^>]*?)(/?>)", svg):
            collect(m, False)
        share_centres([p for piece in pieces if not isinstance(piece[3], str) for p in piece[3] if isinstance(p, dict)])

    out, at = [], 0
    for m, attrs, attr_text, parts in sorted(pieces, key=lambda piece: piece[0].start()):
        d = parts if isinstance(parts, str) else emit_d(parts)
        out.append(svg[at:m.start()])
        out.append("<path" + attrs.replace(attr_text, f' d="{d}"') + m.group(2))
        at = m.end()
    out.append(svg[at:])
    svg = "".join(out)
    if STYLE == "soft":
        # Gen 7's steep sides: the black edge (an unstyled black ring, under 1px once the zone scales it down) shimmers
        # in and out along a near-vertical line, worst under the overlay's colour tint. A thin black stroke on it
        # keeps a solid core everywhere, so the slanted sides come out smooth.
        svg = svg.replace('<path style="stroke-width: 0px;"', '<path style="' + EDGE_STROKE + '"')
        svg = re.sub(r'(<path d="[^"]*") style="stroke-width: 0px;"', lambda m: m.group(1) + ' style="' + EDGE_STROKE + '"', svg)
    return svg


def main():
    global MAP, ROUND, STYLE, POINT_CAP, GEN5_SHAPE, WIDEN, X_SHIFT
    for style, folder in (("round", "gen6"), ("soft", "gen7")):
        STYLE = style
        for name in FILES:
            MAP = MAPS.get(name)
            X_SHIFT = 0
            if style == "soft" and name.startswith("ui/nature arrows/"):
                with open(os.path.join(SRC, name), encoding="utf-8") as f:
                    MAP, X_SHIFT = arrow_in_tile(f.read())
            POINT_CAP = POINT_CAPS.get(name, POINT_MAX)
            GEN5_SHAPE = name in GEN5_SHAPE_FILES
            WIDEN = name in WIDEN_FILES
            ROUND = name not in KEEP_SHAPE
            with open(os.path.join(SRC, name), encoding="utf-8") as f:
                svg = f.read()
            out = convert(svg)
            target = os.path.join(IMAGES, folder, name)
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(target, "w", encoding="utf-8", newline="\n") as f:
                f.write(out)
        print(f"wrote {len(FILES)} frames to images/{folder}/ ({style})")


if __name__ == "__main__":
    main()
