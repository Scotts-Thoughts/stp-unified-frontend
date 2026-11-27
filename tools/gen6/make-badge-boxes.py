"""Makes the gen 6 timer frames with a badge box sized for each game's badges.

    py tools/gen6/make-badge-boxes.py

Reads images/gen6/ui/timer.svg and timer_2.svg (gen 5's frames, rounded by make-rounded-ui.py; run that first) and
writes timer-<layout>.svg and timer_2-<layout>.svg next to them, one pair per badge layout:

  - "case" (X/Y): two rows of four big Kalos badges, so the box is BADGE_BOX_DY["case"] gen 5 px taller.
  - "row"  (OR/AS): one row of Hoenn badges as gen 3 lays them out, so the box is as short as gen 3's (shorter).

Only the badge box's bottom edge moves (every point of its outline below BOX_SPLIT_Y moves by dy, so its round
corners keep their shape), and the faults box(es) under it move down or up by the same dy. The timer is untouched.
The overlay moves the fault counts by the same dy (playerPanel.ts BADGE_BOX_DY, which must match). Gen 7 has no
badges and keeps the plain timer.svg. Standard library only.
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
UI = os.path.normpath(os.path.join(HERE, "..", "..", "src", "renderer", "public", "images", "gen6", "ui"))

# Must match playerPanel.ts BADGE_BOX_DY.
BADGE_BOX_DY = {"case": 40, "row": -48}
# The badge box runs y 76..220 (gen 5 px); points below this line are its bottom edge.
BOX_SPLIT_Y = 150

NUM = re.compile(r"-?(?:\d+\.?\d*|\.\d+)")
CMD = re.compile(r"[MLAZ]|-?(?:\d+\.?\d*|\.\d+)")


def fmt(v):
    return ("%.2f" % v).rstrip("0").rstrip(".")


def stretch_path(d, dy):
    """Moves every point below BOX_SPLIT_Y by dy. The generator writes only absolute M, L, A and Z."""
    tokens = CMD.findall(d)
    out, i, cmd = [], 0, None
    while i < len(tokens):
        t = tokens[i]
        if t.isalpha():
            cmd = t
            out.append(t)
            i += 1
            continue
        if cmd in ("M", "L"):
            x, y = float(tokens[i]), float(tokens[i + 1])
            i += 2
            out.append(f"{fmt(x)},{fmt(y + dy if y > BOX_SPLIT_Y else y)}")
        elif cmd == "A":
            rx, ry, rot, large, sweep, x, y = (float(v) for v in tokens[i:i + 7])
            i += 7
            out.append(f"{fmt(rx)},{fmt(ry)} {fmt(rot)} {int(large)} {int(sweep)} {fmt(x)},{fmt(y + dy if y > BOX_SPLIT_Y else y)}")
        else:
            raise ValueError(f"unexpected path command {cmd!r} in {d[:60]}")
    # One argument group per command, written straight after its letter, as the source does.
    return "".join(out)


def make(svg, dy):
    # The faults box groups (Layer_32 / Layer_29 copies; not Layer_26, which holds them and the badge box) move.
    svg, n = re.subn(r'<g id="(Layer_(?!26_)\d+_copy_2)"', lambda m: f'<g transform="translate(0 {dy})" id="{m.group(1)}"', svg)
    if n == 0:
        raise ValueError("no faults box group found")
    # The badge box: the group whose outline starts at M51,185.
    start = svg.index('M51,185')
    g_open = svg.rindex("<g>", 0, start)
    g_close = svg.index("</g>", start)
    block = svg[g_open:g_close]
    block = re.sub(r'd="([^"]+)"', lambda m: f'd="{stretch_path(m.group(1), dy)}"', block)
    return svg[:g_open] + block + svg[g_close:]


for name in ("timer", "timer_2"):
    source = open(os.path.join(UI, f"{name}.svg"), encoding="utf-8").read()
    for layout, dy in BADGE_BOX_DY.items():
        path = os.path.join(UI, f"{name}-{layout}.svg")
        open(path, "w", encoding="utf-8", newline="").write(make(source, dy))
        print("wrote", path)
