"""
What every `lift-genN.py` shares (plan 2.4): the asserted-replacement helpers, the
component-object extraction, the data imports, the template preparation, the
hotkey-table generation and the SFC assembly. Each generation's script lists its own
seams -- the exact legacy text it rewrites and what it becomes -- and every seam is
asserted to occur exactly once, so a change in a legacy source fails loudly.
"""
import html as _html
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from lift_assets import rebase_assets  # noqa: E402


def replace_once(s: str, old: str, new: str, label: str) -> str:
    n = s.count(old)
    assert n == 1, f"{label}: expected 1 occurrence, found {n}"
    return s.replace(old, new, 1)


def cut(s: str, start_marker: str, end_marker: str, replacement: str, label: str) -> str:
    """Replaces everything from start_marker up to (not including) end_marker."""
    assert s.count(start_marker) == 1, f"{label}: start marker found {s.count(start_marker)} times"
    a = s.index(start_marker)
    b = s.index(end_marker, a)
    return s[:a] + replacement + s[b:]


def component_options(src: str) -> str:
    """The `{...}` passed to `Vue.createApp(...)`; every legacy gen2-5 frontend.js has exactly one."""
    start = src.index("const app = Vue.createApp({")
    end = src.rindex("}).mount('#app')")
    options = src[start + len("const app = Vue.createApp("): end + 1]
    assert options.startswith("{") and options.rstrip().endswith("}")
    return options


def rename_mapper(options: str, expect_plain: int, expect_optional: int) -> str:
    """`this.mapper.X` -> `this.game.X`, with the counts the legacy source has today.

    Everywhere except inside `created()`: the legacy component constructed its client
    in `mounted`, so during `created()` `this.mapper` was undefined and every
    `this.mapper?.properties...` there short-circuited -- gen4's and gen5's settings
    blocks are skipped at that point and run only from `mounted`, after the mapper is
    loaded. The session prop exists from the start, so a renamed `this.game?.` would
    run those blocks a lifecycle step early (gen5: a settings watcher then fired on a
    mapper path the loaded game does not have). Left as `this.mapper` -- still
    undefined, since the lifted component declares no such field -- they short-circuit
    exactly as before.
    """
    n = options.count("this.mapper.")
    assert n == expect_plain, f"this.mapper.: expected {expect_plain}, found {n}"
    n2 = options.count("this.mapper?.")
    assert n2 == expect_optional, f"this.mapper?.: expected {expect_optional}, found {n2}"
    a = options.index("\n    created() {")
    b = options.index("\n    watch: {", a)
    assert "this.mapper." not in options[a:b], "a non-optional this.mapper in created() would have thrown in the legacy app"
    head, created, tail = options[:a], options[a:b], options[b:]
    rename = lambda s: s.replace("this.mapper.", "this.game.").replace("this.mapper?.", "this.game?.")
    return rename(head) + created + rename(tail)


def data_imports(options: str, out_dir: pathlib.Path) -> list[str]:
    """One import per data global the component references (from port-data's manifest)."""
    manifest = json.loads((out_dir / "data" / "_manifest.json").read_text(encoding="utf-8"))
    imports = []
    for m in manifest:
        rel = m["out"].split("/data/", 1)[1]
        for g in m["globals"]:
            if re.search(r"\b" + re.escape(g) + r"\b", options):
                imports.append(f'import {{ {g} }} from "./data/{rel}";')
    return sorted(imports)


def prepare_template(path: pathlib.Path, asset_gen: str, min_mapper_refs: int) -> tuple[str, int]:
    """The extracted innerHTML, unescaped for vue-tsc, assets rebased, mapper refs renamed."""
    template = path.read_text(encoding="utf-8")
    # innerHTML re-escapes `&`, `<`, `>` and `"` in attribute values (`a &amp;&amp; b`).
    # Vue's compiler decodes them either way, so the runtime template is the same, but
    # vue-tsc's template parser does not, so restore the source form.
    template = _html.unescape(template)
    template, n_assets = rebase_assets(template, asset_gen)
    n = len(re.findall(r"\bmapper\.properties\b", template))
    assert n >= min_mapper_refs, f"template mapper.properties: expected >= {min_mapper_refs}, found {n}"
    template = re.sub(r"\bthis\.mapper\.", "this.game.", template)
    template = re.sub(r"\bmapper\.properties\b", "game.properties", template)
    template = re.sub(r"\bmapper\?\.properties\b", "game?.properties", template)
    assert not re.search(r"\bmapper[?]?\.", template), "a mapper reference survived in the template"
    return template, n_assets


HOTKEY_RE = re.compile(
    r"^        keyhook\.registerShortCut\('(F\d+)', async \(\) => \{(.*?)^        \}\);\n",
    re.S | re.M,
)


def hotkey_table(block: str) -> list[tuple[str, str]]:
    """`keyhook.registerShortCut('F13', async () => {...});` entries -> (key, body) with `vm.` for `this.`."""
    entries = []
    for m in HOTKEY_RE.finditer(block):
        key, body = m.group(1), m.group(2)
        body = re.sub(r"\bthis\.", "vm.", body)
        entries.append((key, body))
    # Nothing but comments and blank lines may remain once the entries are removed.
    rest = HOTKEY_RE.sub("", block)
    leftover = [ln for ln in rest.splitlines() if ln.strip() and not ln.strip().startswith("//")]
    assert not leftover, f"hotkey block has lines the table does not carry: {leftover[:3]}"
    return entries


def write_hotkeys(out: pathlib.Path, gen: str, entries: list[tuple[str, str]], doc: str) -> None:
    lines = [
        'import type { HotkeyTable } from "~/core/hotkeys/KeyHook";',
        "",
        "/**",
        *[f" * {ln}".rstrip() for ln in doc.strip("\n").splitlines()],
        " *",
        " * `vm` is the overlay component instance, which is what `this` was. Generated by",
        f" * tools/port/lift-{gen}.py from the `keyhook.registerShortCut` block; do not edit.",
        " */",
        f"export function {gen}Hotkeys(vm: any): HotkeyTable {{",
        "    return {",
    ]
    for key, body in entries:
        lines.append(f"        {key}: async () => {{{body}        }},")
    lines += ["    };", "}", ""]
    out.write_text("\n".join(lines), encoding="utf-8")


def implicit_globals_decl(names: list[str], gen: str) -> str:
    return (
        f"// Implicit globals of the legacy classic script, see tools/port/lift-{gen}.py.\n"
        "let " + ", ".join(sorted(names)) + ";\n"
    )


def assemble_sfc(template: str, header: str, imports: list[str], implicit: str, options: str, root_open: str = "<div>") -> str:
    """The wrapper div is the legacy `v-else` element whose content the template was;
    gen3 gates it on the component's own `ready` (see tools/port/lift-gen3.py)."""
    return (
        "<template>\n" + root_open + "\n" + template + "\n</div>\n</template>\n\n"
        + header + "\n".join(imports) + "\n\n" + implicit
        + "\nexport default defineComponent(" + options.rstrip() + ");\n</script>\n"
    )


def remaining_requires(options: str) -> list[tuple[int, str]]:
    return [(options[: m.start()].count("\n"), m.group(0)) for m in re.finditer(r"require\([^)]*\)", options)]


def assert_no_mapper_outside_created(options: str) -> None:
    """Every `this.mapper` left is inside `created()` (see rename_mapper)."""
    a = options.index("\n    created() {")
    b = options.index("\n    watch: {", a)
    assert "this.mapper" not in options[:a] + options[b:], "a this.mapper reference survived the seams"
