"""
Scope a legacy stylesheet under `.gen-N` (plan 2.5; the tool Phase 1.5 did by hand).

    python tools/port/scope-css.py <legacy style.css> <out style.css> <gen-class> [--fonts=../../fonts] [--asset-gen=gen2]

Rules, in the plan's order -- port verbatim, verify, never edit a value:

  * top-level blocks only, with native CSS nesting preserved: a block's body can
    contain whole rules (`.x { .y { } }`), and prefixing the outer selector scopes
    them too;
  * `@font-face` and `@keyframes` are copied unscoped (at-rules cannot be scoped; a
    generation's fonts load with its stylesheet, and unload with it);
  * `:root` becomes `.gen-N` -- the class sits on `#app-container`, so every custom
    property still reaches every element that reads it;
  * `#app-container` becomes `.gen-N#app-container` (same element, higher
    specificity); `#app` becomes `.gen-N #app`;
  * `*` is DROPPED: `core/styles/base.css` already carries the reset, and it is
    identical across the five apps -- the tool prints the dropped block so that claim
    is checked every time;
  * `html` and `body` become `html:has(.gen-N)` / `body:has(.gen-N)`: the class is on
    `#app-container`, below them, so they cannot be prefixed, but `:has()` scopes them
    to the time this generation is active and out-specifies base.css's own `html, body`
    rule. gen2's were identical to base.css's; gen4's `body` adds
    `background-color: #000000`, which is why they are carried instead of dropped;
  * everything else gets `.gen-N ` in front of each selector in the list;
  * `url(fonts/...)` is re-based with --fonts, because the file moves, and
    `url(images/...)` becomes `url(images/<gen>/...)` with --asset-gen, because the
    generation's tree sits next to gen1's images until Phase 4 merges them
    (tools/port/lift_assets.py); nothing else inside a body is touched.

After writing, it re-parses both files and proves: same rules (minus the dropped
ones), byte-identical bodies (minus the font re-base), same relative order.
"""
import re
import sys
from pathlib import Path


def next_token(src: str, start: int):
    i = start
    while i < len(src):
        if src.startswith("/*", i):
            end = src.find("*/", i + 2)
            i = len(src) if end == -1 else end + 2
            continue
        if src[i] in "{}":
            return i, src[i]
        i += 1
    return -1, ""


def parse(text: str):
    """Top-level (prelude, body) blocks, comment-aware and nesting-aware."""
    blocks = []
    i = 0
    trivia = 0
    while True:
        open_at, tok = next_token(text, i)
        if open_at == -1:
            break
        assert tok == "{", f"stray }} at {open_at}"
        depth, j = 1, open_at + 1
        while depth:
            at, t = next_token(text, j)
            assert at != -1, "unbalanced brace"
            depth += 1 if t == "{" else -1
            j = at + 1
        close = j - 1
        blocks.append((text[trivia:open_at], text[open_at + 1 : close]))
        i = close + 1
        trivia = i
    return blocks, text[trivia:]


def selector_of(prelude: str) -> str:
    return re.sub(r"/\*.*?\*/", "", prelude, flags=re.S).strip()


def comments_of(prelude: str) -> str:
    idx = prelude.rfind("*/")
    return prelude[: idx + 2].strip() if idx != -1 else ""


DROP = {"*"}
DOCUMENT = {"html", "body"}


FONT_SRC = re.compile(r"url\(fonts/([^)]+)\)")
FONT_FAMILY = re.compile(r"font-family\s*:\s*([^;}]+)")


def dead_font_face(body: str, src_text: str, legacy_dir) -> bool:
    """A `@font-face` whose file the legacy app does not ship and whose family no rule
    uses: gen4 and gen5 declare `lgothic` for a `fonts/LeagueGothic.ttf` that is not in
    their trees, and nothing sets `font-family: lgothic`. The legacy page never fetched
    it (a face loads on first use); the shell now loads every declared face before the
    overlay renders (main.ts, the `<select>` baseline), which would fetch it and log a
    404 the legacy never logged. Dropped, with the same outcome: no rule resolves to it."""
    if legacy_dir is None:
        return False
    src = FONT_SRC.search(body)
    family = FONT_FAMILY.search(body)
    if not src or not family:
        return False
    if (legacy_dir / "fonts" / src.group(1)).exists():
        return False
    name = family.group(1).strip().strip("\"\'")
    uses = [m for m in re.finditer(r"font-family\s*:\s*([^;}]+)", src_text) if name in [x.strip().strip("\"\'") for x in m.group(1).split(",")]]
    # One use is this declaration itself.
    return len(uses) <= 1


def scope(src_text: str, gen_class: str, fonts: str, asset_gen: str = "", legacy_dir=None):
    blocks, tail = parse(src_text)
    out = []
    dropped = []
    for prelude, body in blocks:
        sel = selector_of(prelude)
        lead = comments_of(prelude)
        head = (lead + "\n") if lead else ""
        if sel.startswith("@font-face") and dead_font_face(body, src_text, legacy_dir):
            dropped.append((sel, body))
            continue
        if sel.startswith("@font-face") or sel.startswith("@keyframes") or sel.startswith("@-webkit-keyframes"):
            body2 = body.replace("url(fonts/", f"url({fonts}/")
            out.append(head + f"{sel} {{{body2}}}")
            continue
        if sel.startswith("@"):
            raise SystemExit(f"unhandled at-rule: {sel[:40]}")
        if sel in DROP:
            dropped.append((sel, body))
            continue
        if sel == ":root":
            # Custom properties go to `.gen-N` (on #app-container, so they still reach
            # every element); anything else in `:root` styled the <html> element itself
            # and goes to `html:has(.gen-N)` -- gen4's `:root` sizes the document
            # 1080x1920, and the compositor rasterises a document that size differently.
            own, rest = split_root(body)
            out.append(head + f".{gen_class} {{{own}}}")
            if rest.strip():
                out.append(f"/* the non-custom-property half of :root */\nhtml:has(.{gen_class}) {{{rest}}}")
            continue
        if asset_gen:
            body = body.replace("url(images/", f"url(images/{asset_gen}/")
        parts = [p.strip() for p in sel.split(",")]
        scoped = []
        for p in parts:
            if p in DOCUMENT:
                scoped.append(f"{p}:has(.{gen_class})")
            elif p == "#app-container":
                scoped.append(f".{gen_class}#app-container")
            elif p.startswith("#app-container "):
                scoped.append(f".{gen_class}#app-container " + p[len("#app-container "):])
            else:
                scoped.append(f".{gen_class} {p}")
        out.append(head + f"{',\n'.join(scoped)} {{{body}}}")
    return out, dropped, tail


DECL = re.compile(r"^\s*([A-Za-z-]+)\s*:")


def split_root(body: str):
    """(custom-property lines + comments, other declaration lines) of a `:root` body."""
    own, rest = [], []
    for line in body.split("\n"):
        m = DECL.match(line)
        (rest if m and not m.group(1).startswith("--") else own).append(line)
    return "\n".join(own), "\n".join(rest)


def unscope(sel: str, gen_class: str) -> str:
    parts = [p.strip() for p in sel.split(",")]
    res = []
    for p in parts:
        if p == f".{gen_class}":
            res.append(":root")
        elif p.endswith(f":has(.{gen_class})") and p[: -len(f":has(.{gen_class})")] in DOCUMENT:
            res.append(p[: -len(f":has(.{gen_class})")])
        elif p.startswith(f".{gen_class}#app-container"):
            res.append("#app-container" + p[len(f".{gen_class}#app-container"):])
        elif p.startswith(f".{gen_class} "):
            res.append(p[len(f".{gen_class} "):])
        else:
            res.append(p)
    return ",\n".join(res)


def verify(src_text: str, out_text: str, gen_class: str, fonts: str, dropped, asset_gen: str = ""):
    src_blocks, _ = parse(src_text)
    out_blocks, _ = parse(out_text)
    src_rules = [(selector_of(p), b) for p, b in src_blocks]
    def unbase(b):
        b = b.replace(f"url({fonts}/", "url(fonts/")
        return b.replace(f"url(images/{asset_gen}/", "url(images/") if asset_gen else b
    out_rules = [(unscope(selector_of(p), gen_class), unbase(b), "the non-custom-property half of :root" in p) for p, b in out_blocks]
    # A split `:root` is two output rules for one source rule: fold the marked
    # html:has() half back into the `:root` before it, and compare their lines as a
    # multiset.
    folded = []
    for sel, body, is_half in out_rules:
        if is_half:
            assert folded and folded[-1][0] == ":root", "a :root half without its :root"
            folded[-1] = (folded[-1][0], folded[-1][1] + "\n" + body)
            continue
        folded.append((sel, body))
    out_rules = folded
    kept = [(s, b) for s, b in src_rules if s not in DROP and (s, b) not in dropped]
    kept_norm = [(",\n".join(x.strip() for x in s.split(",")), b) for s, b in kept]
    out_norm = [(",\n".join(x.strip() for x in s.split(",")), b) for s, b in out_rules]
    assert len(kept_norm) == len(out_norm), f"rule count: {len(kept_norm)} vs {len(out_norm)}"
    for k, (a, b) in enumerate(zip(kept_norm, out_norm)):
        if a[0] == ":root" and b[0] == ":root":
            assert sorted(l.strip() for l in a[1].split("\n") if l.strip()) == sorted(l.strip() for l in b[1].split("\n") if l.strip()), f"rule {k} (:root) lost a line"
            continue
        assert a == b, f"rule {k} differs:\n  {a[0][:80]!r}\n  {b[0][:80]!r}"
    return len(out_norm)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    opts = dict(a[2:].split("=", 1) for a in sys.argv[1:] if a.startswith("--"))
    if len(args) != 3:
        raise SystemExit(__doc__)
    src_path, out_path, gen_class = args
    fonts = opts.get("fonts", "../../fonts")
    asset_gen = opts.get("asset-gen", "")
    src_text = Path(src_path).read_text(encoding="utf-8")
    out, dropped, tail = scope(src_text, gen_class, fonts, asset_gen, legacy_dir=Path(src_path).parent)
    header = f"""/**
 * Scoped under `.{gen_class}` by tools/port/scope-css.py from {Path(src_path).as_posix()}
 * (plan 2.5). Values untouched; selectors prefixed; `:root` -> `.{gen_class}`;
 * `#app-container` -> `.{gen_class}#app-container`; `html`/`body` -> `:has(.{gen_class})`
 * variants; `*` dropped because core/styles/base.css carries the reset; a `@font-face` for a file the legacy app
 * does not ship and no rule uses is dropped too. `url(fonts/...)` re-based to `{fonts}/`;
 * `url(images/...)` -> `url(images/{asset_gen}/...)` (tools/port/lift_assets.py).
 * Do not edit by hand -- re-run the tool.
 */
"""
    out_text = header + "\n\n".join(out) + ("\n" + tail.strip() if tail.strip() else "") + "\n"
    n = verify(src_text, out_text, gen_class, fonts, dropped, asset_gen)
    Path(out_path).write_text(out_text, encoding="utf-8")
    print(f"{n} rules scoped -> {out_path}")
    for sel, body in dropped:
        print(f"dropped {sel!r}: {' '.join(body.split())[:120]}")


if __name__ == "__main__":
    main()
