"""
Asset-path rewriting shared by the lift scripts (plan 2.4 interim, plan 4 target).

Every legacy overlay references its images as `images/...`, relative to its own
index.html. In the unified app each generation's tree sits under `images/genN/`,
next to gen1's own `images/` (the renderer's public dir), so every reference gets the
generation segment inserted -- in the template (`src="images/..."`,
`:src="'images/...'"`, template literals), in the script (string literals), in the
stylesheet (scope-css.py) and in the data files (port-data.ts --asset-prefix).

Why a plain relative path and not a URL scheme: a `stp-assets://genN/` protocol served
by the main process was the first interim, and Chromium decoded gen4's 6341x2835
background JPEG through a different path for it than for a file:// image -- two in a
channel at nine hundred pixels of every frame, against a legacy app that loads the
same file over file://. Served relative to the document the unified app loads the
same file:// URLs the legacy page did, and the frames are identical. Phase 4 merges
the trees into one pool under the same `images/` root; until then the parity runner
junctions `out/renderer/images/genN` to the legacy tree (tools/parity/targets.ts).

The rewrite is textual and verifiable: a `<base href>` would have redirected every
other relative URL in the document too (font faces inside injected <style>s, chunk
imports), which is how gen2's fonts stopped loading.
"""
import re

# gen2's textures.js spells paths with escaped backslashes ('images\\textures\\x.png');
# a file URL normalises them, and the separator after `images` is left alone. One
# pattern for every form -- a quoted string (which is also what a `src="..."`
# attribute is), a template literal, an unquoted `url(images/...)` -- so no reference
# can be rewritten twice.
_REF = re.compile(r"""(["'`]|url\(\s*)images(?=/|\\)""")


def rebase_assets(text: str, gen: str) -> tuple[str, int]:
    """`images/...` -> `images/<gen>/...` for every reference; returns (text, count)."""
    count = 0

    def sub(m):
        nonlocal count
        count += 1
        return f"{m.group(1)}images/{gen}"

    return _REF.sub(sub, text), count
