"""
Lift gen2's legacy component + template into src/renderer/games/gen2/Overlay.vue
(plan 2.4, the "lift" half of the recipe).

    python tools/port/lift-gen2.py

Inputs: A:/Programs/gen2-stp-frontend/app/frontend.js (read-only), the template
extracted by tools/port/extract-template.ts, and games/gen2/data/_manifest.json from
tools/port/port-data.ts. Every replacement asserts the exact number of occurrences it
expects, so a change in the legacy source fails loudly instead of silently porting
something else. The seams it rewrites are listed in the header it writes into the SFC.
"""
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from lift_assets import rebase_assets  # noqa: E402
from lift_common import data_imports  # noqa: E402

LEGACY = pathlib.Path("A:/Programs/gen2-stp-frontend/app")
OUT = pathlib.Path("src/renderer/games/gen2")
ASSET_GEN = "gen2"
TEMPLATE = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path("tools/port/gen2-template.html")

src = (LEGACY / "frontend.js").read_text(encoding="utf-8")

# ---- 1. the component options object -----------------------------------------------
start = src.index("const app = Vue.createApp({")
end = src.rindex("}).mount('#app')")
options = src[start + len("const app = Vue.createApp("): end + 1]
assert options.startswith("{") and options.rstrip().endswith("}")


def replace_once(s, old, new, label):
    n = s.count(old)
    assert n == 1, f"{label}: expected 1 occurrence, found {n}"
    return s.replace(old, new, 1)


def cut(s, start_marker, end_marker, replacement, label):
    a = s.index(start_marker)
    b = s.index(end_marker, a)
    return s[:a] + replacement + s[b:]


# ---- 2. the mapper client is main.ts's; the component gets the session as `game` ----
n = options.count("this.mapper.")
assert n > 300, n
options = options.replace("this.mapper.", "this.game.")
# 30 more go through optional chaining (`this.mapper?.properties`), which the plain
# replacement above does not see.
n2 = options.count("this.mapper?.")
assert n2 == 30, n2
options = options.replace("this.mapper?.", "this.game?.")

options = replace_once(options, "            mapper: null,\n", "", "data(): mapper: null")
options = replace_once(
    options,
    """    mounted: async function () {
        const that = this
        this.mapper = new GameHookMapperClient()
        this.game.onMapperLoaded = (x) => {
            this.ready = true
            this.$nextTick(() => {""",
    """    mounted: async function () {
        const that = this
        // main.ts owns the mapper client and mounts this component once the mapper is
        // loaded and detected, so what was the onMapperLoaded callback runs here, in the
        // same order: ready, then the next-tick startup work, then the subscriptions.
        {
            this.ready = true
            this.$nextTick(() => {""",
    "mounted head",
)
options = replace_once(
    options,
    """                this.set_rom_starter()
            })
        }
        this.game.onMapperUnloaded = (x) => this.ready = false
        await this.game.connect()
""",
    """                this.set_rom_starter()
            })
        }
""",
    "onMapperLoaded tail / onMapperUnloaded / connect",
)

# ---- 3. hotkeys -> the module's table --------------------------------------------------
options = cut(
    options,
    "        keyhook.registerShortCut('F13'",
    "        // ── External Control Server ──",
    "        this.unbindHotkeys = bindHotkeys(gen2Hotkeys(this));\n\n",
    "hotkeys",
)

# ---- 4. control server -> main.ts + games/gen2/control.ts --------------------------------
options = cut(
    options,
    "        // ── External Control Server ──",
    "        // Enemy sprite resize tool — dev mode only.",
    "        // The control server (port 30159) lives in the main process and is bound to\n"
    "        // games/gen2/control.ts by main.ts; the client is main.ts's too, so the\n"
    "        // beforeunload cleanup that closed both is gone with them.\n\n",
    "control server",
)

# ---- 5. OBS -> the shared client ----------------------------------------------------------
options = cut(
    options,
    "        sendObsChapterMarker(chapterName) {",
    "        // ============ Style Settings Management Methods ============",
    "        sendObsChapterMarker(chapterName) {\n"
    "            // Byte-for-byte the same obs-websocket v5 exchange as gen1's; the shared\n"
    "            // client reads the url/password from the same key names (plan 1.9).\n"
    "            sendObsChapterMarker(chapterName);\n"
    "        },\n",
    "obs",
)

# ---- 6. open-folder and the backport importer -------------------------------------------
old_open = (
    "        openFolder(folderName, game_name, path = \"\", path2 = \"\") {\n"
    "            const fs = require('fs');\n"
    "            const fullPath = `.\\\\${folderName}\\\\${game_name}\\\\${path}\\\\${path2}`;\n"
    "            console.log(fullPath);\n"
    "\n"
    "            if (!fs.existsSync(fullPath)) {\n"
    "                fs.mkdirSync(fullPath, { recursive: true });\n"
    "            }\n"
    "\n"
    "            // Correctly handle spaces in folder names\n"
    "            require('child_process').exec(`start \"\" \"${fullPath}\"`);\n"
    "        },"
)
new_open = (
    "        openFolder(folderName, game_name, path = \"\", path2 = \"\") {\n"
    "            // Was require(\"fs\") + `start \"\"` from the renderer; the main process creates\n"
    "            // the folder under <appRoot>/splits and opens it (plan 1.6/1.7). The only\n"
    "            // caller passes `splits` as the folder name.\n"
    "            const fullPath = splitPath(game_name, path, path2);\n"
    "            console.log(`.\\\\${folderName}\\\\${game_name}\\\\${path}\\\\${path2}`);\n"
    "            revealSplitFolder(fullPath);\n"
    "        },"
)
options = replace_once(options, old_open, new_open, "openFolder")

# The backport importer (decision 15, known-legacy-bugs.md #26): the legacy method
# appended what it parsed to the *shipped* data files with require("fs") and read the
# two ASM files through `File.path`. Its body stays; the file appends become one call
# into games/gen2/backportOverrides.ts (userData, re-applied by the module's prepare())
# and the reads go through the File API, which is what a renderer without fs has.
# The parser itself is the legacy lib/backport_importer.js, ported verbatim below.
options = replace_once(
    options,
    "        importBackports() {\n"
    "            const backportImporter = require('./lib/backport_importer.js');\n",
    "        async importBackports() {\n"
    "            // The parser is games/gen2/backports.js (the legacy lib/backport_importer.js);\n"
    "            // the file appends are games/gen2/backportOverrides.ts (decision 15).\n",
    "importBackports head",
)
options = replace_once(
    options,
    "                const backportsContent = fs.readFileSync(backportsFileInput.files[0].path, 'utf8');\n"
    "                const movesContent = fs.readFileSync(movesFileInput.files[0].path, 'utf8');\n",
    "                const backportsContent = await backportsFileInput.files[0].text();\n"
    "                const movesContent = await movesFileInput.files[0].text();\n",
    "importBackports reads",
)
for name in ("parseBackportMoves", "buildMoveLookup", "parseBackportPokemon"):
    options = replace_once(options, f"backportImporter.{name}(", f"{name}(", f"importBackports {name}")
options = replace_once(
    options,
    "                // Write moves to data files\n"
    "                const filePaths = backportImporter.getDataFilePaths();\n"
    "                const movesAdded = backportImporter.appendMovesToG2MoveData(moves, filePaths.g2MoveData);\n"
    "                const movesArrayAdded = backportImporter.appendMovesToGen2Moves(moves, filePaths.gen2moves);\n"
    "                const pokemonAdded = backportImporter.appendPokemonToCrystal(pokemonName, data, filePaths.pokemonCrystal);\n"
    "                const moveMapAdded = backportImporter.appendToBackportMoveMap(pokemonName, newMoveMap, filePaths.backportMoveMap);\n",
    "                // Was four appends to the shipped data files; the overrides file instead.\n"
    "                const { movesAdded, pokemonAdded, moveMapAdded } = await recordBackport(pokemonName, moves, newMoveMap, data,\n"
    "                    { g2MoveData, gen2moves, dexDataCrystal, backportMoveMap });\n",
    "importBackports writes",
)

assert "this.game.connect" not in options and ".onMapperLoaded =" not in options and ".onMapperUnloaded =" not in options
# One bare reference is left: a truthiness guard (`if (!this.mapper || ...)`). The
# session is what the client was there -- present once the component exists.
options = replace_once(options, "if (!this.mapper || !this.game.properties", "if (!this.game || !this.game.properties", "bare this.mapper guard")
assert "this.mapper" not in options, "a this.mapper reference survived the seams"
assert "GameHookMapperClient" not in options

# Every `images/...` string literal in the script now points at the asset scheme
# (tools/port/lift-assets.py); the count is printed so a drift shows.
options, n_script_assets = rebase_assets(options, ASSET_GEN)

# ---- 7. imports for the data globals, and the template ---------------------------------
imports = data_imports(options, OUT)

template = TEMPLATE.read_text(encoding="utf-8")
# innerHTML re-escapes `&`, `<`, `>` and `"` in attribute values (`a &amp;&amp; b`).
# Vue's compiler decodes them either way, so the runtime template is the same, but
# vue-tsc's template parser does not, so restore the source form.
import html as _html
template = _html.unescape(template)
template, n_template_assets = rebase_assets(template, ASSET_GEN)
# Template expressions reach the mapper the same way the script does.
n_tpl = len(re.findall(r"\bmapper\.properties\b", template))
assert n_tpl > 50, n_tpl
template = re.sub(r"\bthis\.mapper\.", "this.game.", template)
template = re.sub(r"\bmapper\.properties\b", "game.properties", template)
assert not re.search(r"\bmapper\.", template)

header = """<script>
/**
 * gen2's overlay: Crystal, and Gold & Silver (plan 2.4, lifted 2026-09-10).
 *
 * This is the component object from the legacy `frontend.js` (6,750 lines, one
 * `Vue.createApp` call) and the `#app` markup from its `index.html`, brought in as an
 * SFC with the infrastructure swapped for the shared core and *nothing else changed*
 * (tools/port/lift-gen2.py does the swaps and asserts each one):
 *
 *   - `this.mapper.X`   -> `this.game.X`: the session main.ts builds -- the profile's
 *                          canonical view as `properties`, plus `setBits`. The
 *                          component no longer constructs or connects a client; what
 *                          was its `onMapperLoaded` callback runs at the top of
 *                          `mounted`, in the same order.
 *   - `MyStorage`       -> games/gen2/storage.ts (the file-backed layered store).
 *   - keyhook block     -> games/gen2/hotkeys.ts through core/hotkeys.
 *   - control server    -> games/gen2/control.ts, bound by main.ts (plan 1.8).
 *   - OBS marker method -> core/logic/obs.ts (the same exchange, plan 1.9).
 *   - logData/logCopy   -> games/gen2/splits.js over the splits IPC.
 *   - `<script src>`    -> imports of games/gen2/data/*.js.
 *   - openFolder        -> the splits IPC; importBackports keeps its body over the
 *                          File API, with the parser in games/gen2/backports.js and its
 *                          file appends in games/gen2/backportOverrides.ts (decision 15).
 *   - `images/...`      -> `images/gen2/...` everywhere (template, script,
 *                          stylesheet, data): the generation's tree sits next to gen1's
 *                          images, under the same document-relative root, until Phase 4
 *                          merges the pools (tools/port/lift_assets.py says why not a scheme).
 *
 * The template is the browser-normalised innerHTML Vue's runtime compiler saw
 * (tools/port/extract-template.ts), so the compiled DOM is the legacy DOM. The
 * script stays plain JavaScript, as it was. Decomposing this into the shared stores
 * is the Phase 2.4 refactor proper, to be done with the harness as the net, exactly
 * as gen1's was in Phase 1.
 */
import { defineComponent } from "vue";
import { bindHotkeys } from "~/core/hotkeys/KeyHook";
import { sendObsChapterMarker } from "~/core/logic/obs";
import { revealSplitFolder, splitPath } from "~/core/persistence/splitFiles";
import { MyStorage, StyleSettingsUtils } from "./storage";
import { enemySpriteScaleManager } from "./enemySprites";
import { gen2Hotkeys } from "./hotkeys";
import { loadCsvFile, logData, logCopy, transition } from "./splits.js";
import { buildMoveLookup, parseBackportMoves, parseBackportPokemon } from "./backports.js";
import { recordBackport } from "./backportOverrides";
"""

# A classic <script> runs in sloppy mode, where assigning to an undeclared name creates
# a global that every method can see; an ES module is strict, where the same line
# throws ReferenceError (`vitaminsUsed is not defined`, 6,434 times in one run). These
# are the names the legacy component assigns without declaring -- found by scanning for
# bare `name =` assignments the file never declares, plus `d`, `h` and `m`, which it declares
# in one method and assigns bare in another. Module-level `let`s reproduce the sharing
# exactly (every method sees the same binding, values persist across calls), minus the
# property on `window`, which nothing reads.
IMPLICIT_GLOBALS = [
    "backport_check_string", "battle_end", "d", "damageMax", "damageMin", "g2HpType", "g2gamestate", "h", "hpPower",
    "ivAtkBit", "ivDefBit", "m", "maxPercentage", "minPercentage", "newColor", "part1", "part2", "part3",
    "part4", "starterType", "string", "timecode", "upperZ", "usableVitamins", "v",
    "vitaminsUsed", "w", "x", "y",
]
# `newColor`, `x` and `y` were missed by the first scan (they are also declared as
# parameters elsewhere, which a text scan cannot tell apart); tools/port/check-undefined.ts
# found them on 2026-09-11. `hash(...)` (the playerNameChoice watcher) is undefined in the
# legacy app as well -- a ReferenceError there and here (known-legacy-bugs.md #32).
CHECK_ALLOW = ["hash"]
implicit = (
    "// Implicit globals of the legacy classic script, see tools/port/lift-gen2.py.\n"
    "let " + ", ".join(IMPLICIT_GLOBALS) + ";\n"
)

# The session arrives as a prop; the legacy component had no props at all.
options = replace_once(options, "\n    data() {", "\n    props: [\"game\"],\n    data() {", "props")
sfc = "<template>\n<div>\n" + template + "\n</div>\n</template>\n\n" + header + "\n".join(imports) + "\n\n" + implicit + "\nexport default defineComponent(" + options.rstrip() + ");\n</script>\n"
(OUT / "Overlay.vue").write_text(sfc, encoding="utf-8")
print("Overlay.vue:", sfc.count("\n"), "lines;", len(imports), "data imports")
left = [(options[: m.start()].count("\n"), m.group(0)) for m in re.finditer(r"require\([^)]*\)", options)]
print("remaining require():", left)

# ---- the backport parser: lib/backport_importer.js up to its file writers ----------------
# Everything before `appendMovesToG2MoveData` is parsing (the ASM regexes, the type
# map, the move lookup) and moves over verbatim; the four appenders and
# getDataFilePaths wrote the shipped files and are replaced by backportOverrides.ts.
bp_src = (LEGACY / "lib" / "backport_importer.js").read_text(encoding="utf-8")
bp_end = bp_src.index("// Append new moves to g2MoveData.js (object format)")
parser = bp_src[:bp_end].rstrip() + "\n"
parser = replace_once(parser, "const fs = require('fs');\nconst path = require('path');\n\n", "", "backports requires")
for name in ("normalizeName", "titleCase", "buildMoveLookup", "resolveMoveName", "parseBackportMoves", "parseBackportPokemon"):
    parser = replace_once(parser, f"function {name}(", f"export function {name}(", f"backports export {name}")
assert "require(" not in parser and "fs." not in parser
(OUT / "backports.js").write_text(
    "/**\n * gen2's backport-ASM parser: the first half of the legacy `lib/backport_importer.js`,\n"
    " * verbatim as an ES module (tools/port/lift-gen2.py). The second half wrote the\n"
    " * shipped data files and is games/gen2/backportOverrides.ts now (decision 15).\n */\n" + parser,
    encoding="utf-8")
print("backports.js:", parser.count("\n"), "lines")
