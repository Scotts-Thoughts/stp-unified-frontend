"""
Lift gen5's legacy component + template into src/renderer/games/gen5/ (plan 2.4, the
"lift" half of the recipe; gen4's tools/port/lift-gen4.py is the model, and gen5
adds four small modules of its own: the real-time Timer class and PubSub it shares
with gen1's lineage, and the two template-string components that render the timers).

    python tools/port/lift-gen5.py [tools/port/gen5-template.html]

Inputs: A:/Programs/gen5-stp-frontend/app/ (read-only), the template extracted by
tools/port/extract-template.ts, and games/gen5/data/_manifest.json from
tools/port/port-data.ts. Writes Overlay.vue, hotkeys.ts, splits.js, logic/Timer.js,
logic/PubSub.js, components/Timer.js and components/ShuckieTimer.js. Every
replacement asserts the exact number of occurrences it expects.
"""
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from lift_common import (  # noqa: E402
    assemble_sfc, component_options, cut, data_imports, hotkey_table, implicit_globals_decl,
    prepare_template, remaining_requires, rename_mapper, replace_once, write_hotkeys,
    assert_no_mapper_outside_created,
)
from lift_assets import rebase_assets  # noqa: E402

LEGACY = pathlib.Path("A:/Programs/gen5-stp-frontend/app")
OUT = pathlib.Path("src/renderer/games/gen5")
ASSET_GEN = "gen5"
TEMPLATE = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path("tools/port/gen5-template.html")
NL = chr(10)

src = (LEGACY / "frontend.js").read_text(encoding="utf-8")
options = component_options(src)

# ---- 0. the legacy computed `game` (the game_variables entry) -> `game_data` --------------
# As in gen4: the session arrives as the `game` prop, and a Vue prop shadows a computed
# of the same name, so gen5's computed `game()` and every use of it are renamed first.
n_game = len(re.findall(r"this\.game\b", options))
assert n_game == 32, n_game
options = re.sub(r"this\.game\b", "this.game_data", options)
options = replace_once(
    options,
    "        game() {" + chr(10) + "            try {" + chr(10) + "                if (!this.mapper?.properties?.meta?.game_name?.value) {",
    "        game_data() {" + chr(10) + "            try {" + chr(10) + "                if (!this.mapper?.properties?.meta?.game_name?.value) {",
    "computed game",
)
assert not re.search(r"this\.game\b", options)

# ---- 1. the mapper client is main.ts's; the component gets the session as `game` ----
options = rename_mapper(options, expect_plain=709, expect_optional=110)

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
    """                    this.expBarState.expPoints = expPoints;
                }
            })
        }
        this.game.onMapperUnloaded = (x) => this.ready = false

        this.game._debouceTimeout = 15
        // this.game.deboucePath("battle.player.active_pokemon.modifiers")
        this.game.deboucePath("battle.opponent.pkmn_ram")
        this.game.deboucePath("battle.opponent.team")
        this.game.deboucePath("battle.opponent.team_count")
        this.game.deboucePath("player.team.0")
        await this.game.connect()
""",
    """                    this.expBarState.expPoints = expPoints;
                }
            })
        }
        // The client's debounce list (a 15-frame timeout, four `deboucePath` calls) is
        // the module's `debouncePaths`/`debounceFrames` in games/gen5/index.ts, applied
        // by main.ts before this component mounts.
""",
    "onMapperLoaded tail / onMapperUnloaded / debounce / connect",
)

# ---- 2. hotkeys -> the module's table (games/gen5/hotkeys.ts, generated below) --------
hk_start = "        keyhook.registerShortCut('F13'"
hk_end = "        // ── External Control Server ──"
hotkey_block = options[options.index(hk_start): options.index(hk_end)]
options = cut(options, hk_start, hk_end, "        this.unbindHotkeys = bindHotkeys(gen5Hotkeys(this));\n\n", "hotkeys")

# ---- 3. control server -> main.ts + games/gen5/control.ts --------------------------------
options = cut(
    options,
    "        // ── External Control Server ──",
    "        // Enemy sprite resize tool is dev-only. Packaged builds consume",
    "        // The control server (port 30159) lives in the main process and is bound to\n"
    "        // games/gen5/control.ts by main.ts; the client is main.ts's too, so the\n"
    "        // beforeunload cleanup that closed both is gone with them.\n\n",
    "control server",
)

# ---- 4. OBS -> the shared client (the method is byte-identical to gen2's) ---------------
options = cut(
    options,
    "        sendObsChapterMarker(chapterName) {",
    "        async update_rom_starter_and_intro_mon() {",
    "        sendObsChapterMarker(chapterName) {\n"
    "            // Byte-for-byte the same obs-websocket v5 exchange as gen1's and gen2's; the\n"
    "            // shared client reads the url/password from the same key names (plan 1.9).\n"
    "            sendObsChapterMarker(chapterName);\n"
    "        },\n",
    "obs",
)

# ---- 5. the window icon: ipcRenderer.send -> the preload's channel ----------------------
options = replace_once(
    options,
    """                // Update the taskbar/window icon to match the selected game.
                try {
                    require('electron').ipcRenderer.send('set-game-icon', newValue)
                } catch (e) {
                    console.error('Failed to update game icon', e)
                }""",
    """                // Update the taskbar/window icon to match the selected game. The game ->
                // .ico mapping was gen5's main.js; it is the module's now (games/gen5/icons.ts),
                // and the file is sent over the shell's `set-game-icon` channel (plan 3.4).
                try {
                    window.api.set_game_icon(gen5GameIcon(newValue))
                } catch (e) {
                    console.error('Failed to update game icon', e)
                }""",
    "set-game-icon",
)

# ---- 6. open-folder: `start` from the renderer -> the splits IPC -------------------------
options = replace_once(
    options,
    """        openFolder(folderName, game_name, path = "", path2 = "") {
            const fs = require('fs');
            const fullPath = ['.', folderName, game_name, path, path2].filter(segment => segment !== "").join("\\\\");

            if (!fs.existsSync(fullPath)) {
                fs.mkdirSync(fullPath, { recursive: true });
            }

            // Correctly handle spaces in folder names
            require('child_process').exec(`start "" "${fullPath}"`);
        },""",
    """        openFolder(folderName, game_name, path = "", path2 = "") {
            // Was require("fs") + `start ""` from the renderer; the main process creates
            // the folder under <appRoot>/splits and opens it (plan 1.6/1.7). The only
            // caller passes `splits` as the folder name.
            revealSplitFolder(splitPath(game_name, path, path2));
        },""",
    "openFolder",
)

# ---- 6b. the species-settings watchers keep the precedence Vue 3.2 gave them -------------
# The legacy page ran Vue 3.2.47, whose scheduler flushed a component's pre-watchers
# in LIFO order (its findInsertionIndex put an equal-id job *before* the ones already
# queued); Vue 3.5 flushes them FIFO. gen5's `created()` registers one `$watch` per
# species setting, and its `starter` watch option is registered earlier. At boot
# `load_all_settings` changes `starter` first and then four style fields, so under 3.2
# the four settings watchers ran *before* the starter watcher and saved the loaded
# values back to the species key (`Black_Heatran`) while `is_loading_evolution_style`
# was still false; under 3.5 the starter watcher runs first, raises the flag, and the
# four watchers skip. `flush: 'sync'` gives the settings watchers that precedence
# back: they run at the assignment, before any queued watcher, and inside
# `loadEvolutionStyle` they still see the flag raised. Observable behaviour, not
# scheduling, is the parity claim; oracle 4 is what found this.
options = replace_once(
    options,
    "                            ...MyStorage[storageKey]," + NL
    + "                            [propName]: newValue" + NL
    + "                    };" + NL
    + "                }" + NL
    + "            );" + NL
    + "        }" + NL
    + "        for (let i = 0; i < this.auto_save_settings.length; i++) {",
    "                            ...MyStorage[storageKey]," + NL
    + "                            [propName]: newValue" + NL
    + "                    };" + NL
    + "                }," + NL
    + "                // flush: 'sync' -- the precedence Vue 3.2 gave these; see tools/port/lift-gen5.py." + NL
    + "                { flush: 'sync' }" + NL
    + "            );" + NL
    + "        }" + NL
    + "        for (let i = 0; i < this.auto_save_settings.length; i++) {",
    "settings watchers flush",
)

# ---- 7. the second-screen key sender -> the shell's channel -----------------------------
# `keyhook.sendVirtualKey(0x83)` lived on the KeyHook instance and called
# node-key-sender in the renderer; core/window/virtualKeys.ts sends it to the main
# process, which holds the (Java-backed, decision 9) dependency.
n_vk = options.count("keyhook.sendVirtualKey(")
assert n_vk == 2, n_vk
options = options.replace("keyhook.sendVirtualKey(", "sendVirtualKey(")

# ---- 8. the timer class and the two timer components -----------------------------------
options = replace_once(
    options,
    """        "Timer": require("./components/Timer.js"),
        "ShuckieTimer": require("./components/ShuckieTimer.js"),""",
    """        "Timer": TimerComponent,
        "ShuckieTimer": ShuckieTimerComponent,""",
    "timer components",
)

# Two bare references are left, both truthiness guards (the `starter` watcher and the
# double-battle check). The session is what the client was there -- present once the
# component exists.
options = replace_once(options, "if (this.mapper && newValue in POKEMON_FORM_INFO", "if (this.game && newValue in POKEMON_FORM_INFO", "bare this.mapper guard (starter)")
options = replace_once(options, "if (!this.mapper || !this.game.properties || !this.game.properties.battle ||", "if (!this.game || !this.game.properties || !this.game.properties.battle ||", "bare this.mapper guard (double battle)")
assert ".onMapperLoaded =" not in options and ".onMapperUnloaded =" not in options and "connect()" not in options
assert_no_mapper_outside_created(options)
assert "GameHookMapperClient" not in options
assert ".deboucePath(" not in options and "._debouceTimeout" not in options

options, n_script_assets = rebase_assets(options, ASSET_GEN)

# ---- 9. imports for the data globals, and the template ---------------------------------
imports = data_imports(options, OUT)
template, n_template_assets = prepare_template(TEMPLATE, ASSET_GEN, min_mapper_refs=50)

header = """<script>
/**
 * gen5's overlay: Black & White, Black 2 & White 2 (plan 2.4, lifted 2026-09-11).
 *
 * This is the component object from the legacy `frontend.js` (10,465 lines, one
 * `Vue.createApp` call) and the `#app` markup from its `index.html`, brought in as an
 * SFC with the infrastructure swapped for the shared core and *nothing else changed*
 * (tools/port/lift-gen5.py does the swaps and asserts each one):
 *
 *   - `this.mapper.X`   -> `this.game.X`: the session main.ts builds -- the profile's
 *                          canonical view as `properties`, plus `setBits`. The
 *                          component no longer constructs or connects a client; what
 *                          was its `onMapperLoaded` callback runs at the top of
 *                          `mounted`, in the same order, and its four `deboucePath`
 *                          calls (15 frames) are the module's `debouncePaths`. gen5's
 *                          own computed `game` (its game_variables entry) is
 *                          `game_data` now, so the prop does not shadow it.
 *   - `MyStorage`       -> games/gen5/storage.ts (the file-backed layered store, with
 *                          gen5's key rule, style-field filter, three-layer read and
 *                          1 s debounced write).
 *   - keyhook block     -> games/gen5/hotkeys.ts through core/hotkeys; the second-screen
 *                          key sender -> core/window/virtualKeys.ts (decision 9).
 *   - control server    -> games/gen5/control.ts, bound by main.ts (plan 1.8).
 *   - OBS marker method -> core/logic/obs.ts (the same exchange, plan 1.9).
 *   - logData/logCopy   -> games/gen5/splits.js over the splits IPC; the three split
 *                          folders the legacy file created at load are created there too.
 *   - Timer / PubSub    -> games/gen5/logic/, the two timer components -> games/gen5/
 *                          components/, all four as ES modules with their bodies as they were.
 *   - `<script src>`    -> imports of games/gen5/data/**.js.
 *   - set-game-icon     -> `window.api.set_game_icon` with the module's icon table.
 *   - openFolder        -> the splits IPC.
 *   - `images/...`      -> `images/gen5/...` everywhere (template, script,
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
import { sendVirtualKey } from "~/core/window/virtualKeys";
import { MyStorage, StyleSettingsUtils } from "./storage";
import { enemySpriteScaleManager } from "./enemySprites";
import { gen5Hotkeys } from "./hotkeys";
import { gen5GameIcon } from "./icons";
import { loadCsvFile, logData, logCopy, transition } from "./splits.js";
import { Timer } from "./logic/Timer.js";
import TimerComponent from "./components/Timer.js";
import ShuckieTimerComponent from "./components/ShuckieTimer.js";
import { POKEMON_FORMS, POKEMON_FORM_LABELS, POKEMON_FORM_INFO, BATTLE_ONLY_FORMS, baseSpeciesOf, BATTLE_FORM_VARIANTS, BATTLE_FORM_LABELS } from "./forms.js";
"""

# Found by tools/port/check-undefined.ts on the lifted SFC (see lift-gen4.py for the
# reasoning). Two names stay undeclared on purpose because they are undeclared in the
# legacy app too: `hash(...)` (known-legacy-bugs.md #32) and `g5PokemonData`, which is
# a computed the settings loader reads bare on its fallback path (#34).
IMPLICIT_GLOBALS = [
    "attack", "basePower", "battle_end", "d", "damageMax", "damageMin", "debugging_mode", "defense",
    "fling_power", "gen3abilities", "h", "level", "m", "maxPercentage", "minPercentage", "nature",
    "newColor", "part1", "part2", "part3", "part4", "pid", "power", "shuckie_blackouts", "shuckie_resets",
    "specialA", "specialD", "stab", "starterType", "timecode", "type", "type1", "type2", "typeString",
    "usableVitamins", "vitaminsUsed",
]
CHECK_ALLOW = ["hash", "g5PokemonData"]
implicit = implicit_globals_decl(IMPLICIT_GLOBALS, "gen5")

options = replace_once(options, "\n    data() {", "\n    props: [\"game\"],\n    data() {", "props")
sfc = assemble_sfc(template, header, imports, implicit, options)
(OUT / "Overlay.vue").write_text(sfc, encoding="utf-8")
print("Overlay.vue:", sfc.count("\n"), "lines;", len(imports), "data imports;", n_script_assets, "script +", n_template_assets, "template asset refs rebased")
print("remaining require():", remaining_requires(options))

# ---- 10. hotkeys.ts from the block cut above ---------------------------------------------
entries = hotkey_table(hotkey_block)
assert [k for k, _ in entries] == ["F13", "F14", "F15", "F16", "F17", "F18", "F19", "F22", "F23", "F24"], [k for k, _ in entries]
write_hotkeys(
    OUT / "hotkeys.ts",
    "gen5",
    entries,
    """gen5's F-key table, lifted from the `keyhook.registerShortCut` calls in its
`mounted` (plan 2.4, decision 7: per-gen tables preserved, quirks included).

gen5's own shape: F13-F16 pick the stat display, F17-F19 the right panel, F20 and
F21 are commented out in the legacy source (so they are not bound at all here), and
F22 logs that it is unused -- which is still a binding, so it stays.""",
)
print("hotkeys.ts:", len(entries), "keys")

# ---- 11. the forms tables, the timer class, PubSub and the two timer components ---------
# The form tables are module-level constants above the component in frontend.js;
# they move verbatim into forms.js, exported.
f_start = src.index("// Alternate forms the game keeps outside of battle.")
f_end = src.index("const MyStorage = new Proxy({}, {")
forms = src[f_start:f_end].rstrip() + "\n"
for name in ("POKEMON_FORMS", "POKEMON_FORM_LABELS", "POKEMON_FORM_INFO", "BATTLE_ONLY_FORMS", "baseSpeciesOf", "BATTLE_FORM_VARIANTS", "BATTLE_FORM_LABELS"):
    forms = replace_once(forms, f"const {name} =", f"export const {name} =", f"forms export {name}")
(OUT / "forms.js").write_text(
    "/**\n * gen5's alternate-form tables, verbatim from the top of its `frontend.js` (plan 2.4).\n"
    " * Generated by tools/port/lift-gen5.py; do not edit.\n */\n" + forms, encoding="utf-8")


def cjs_to_esm(text: str, replacements: list[tuple[str, str, str]]) -> str:
    for old, new, label in replacements:
        text = replace_once(text, old, new, label)
    assert "require(" not in text and "module.exports" not in text, "a CommonJS form survived"
    return text


(OUT / "logic").mkdir(exist_ok=True)
(OUT / "components").mkdir(exist_ok=True)
pubsub = (LEGACY / "logic" / "PubSub.js").read_text(encoding="utf-8")
pubsub = cjs_to_esm(pubsub, [("module.exports = new PubSub();", "export default new PubSub();", "PubSub export")])
(OUT / "logic" / "PubSub.js").write_text("// gen5's `logic/PubSub.js`, verbatim as an ES module (tools/port/lift-gen5.py).\n" + pubsub, encoding="utf-8")

timer = (LEGACY / "logic" / "Timer.js").read_text(encoding="utf-8")
timer = cjs_to_esm(timer, [
    ('const PubSub = require("./PubSub");', 'import PubSub from "./PubSub.js";', "Timer PubSub import"),
    ("module.exports = Timer;", "export { Timer };", "Timer export"),
])
(OUT / "logic" / "Timer.js").write_text("// gen5's `logic/Timer.js`, verbatim as an ES module (tools/port/lift-gen5.py).\n" + timer, encoding="utf-8")

for comp in ("Timer", "ShuckieTimer"):
    text = (LEGACY / "components" / f"{comp}.js").read_text(encoding="utf-8")
    reps = [("module.exports = {", "export default {", f"{comp} export")]
    if 'const PubSub = require("../logic/PubSub");' in text:
        reps.append(('const PubSub = require("../logic/PubSub");', 'import PubSub from "../logic/PubSub.js";', f"{comp} PubSub import"))
    text = cjs_to_esm(text, reps)
    # The legacy page had Vue on `window`; an ES module imports what it uses.
    used = sorted({m for m in re.findall(r"\bVue\.(\w+)", text)})
    text = re.sub(r"\bVue\.(\w+)", r"\1", text)
    head = (f"// gen5's `components/{comp}.js`, verbatim as an ES module (tools/port/lift-gen5.py): the\n"
            "// template string is compiled at runtime, exactly as the legacy page compiled it.\n"
            + (f'import {{ {", ".join(used)} }} from "vue";\n' if used else ""))
    (OUT / "components" / f"{comp}.js").write_text(head + text, encoding="utf-8")
print("forms.js, logic/PubSub.js, logic/Timer.js, components/Timer.js, components/ShuckieTimer.js written")

# ---- 12. splits.js: logData / logCopy / transition / loadCsvFile over the splits IPC ------
def legacy_fn(name: str) -> str:
    a = src.index(f"function {name}(")
    a = src.rindex("\n", 0, a) + 1
    b = src.index("\n}\n", a) + len("\n}\n")
    return src[a:b]

log_data = legacy_fn("logData")
log_copy = legacy_fn("logCopy")
transition = legacy_fn("transition")
load_csv = legacy_fn("loadCsvFile")
assert log_data.startswith("function logData(") and log_copy.startswith("function logCopy(")
assert transition.startswith("function transition(") and load_csv.startswith("async function loadCsvFile(")

log_data = replace_once(log_data, "function logData(", "export function logData(", "logData export")
log_data = replace_once(log_data, "    return new Promise((resolve, reject) => {\n", "", "logData promise")
log_data = replace_once(
    log_data,
    "        var dirPath  = refilming_mode == true ? `./splits/${gameName}/refilmed/${split_file_prefix}/` : `./splits/${gameName}/${split_file_prefix}/`;",
    "        var dirPath  = refilming_mode == true ? splitPath(gameName, \"refilmed\", split_file_prefix) : splitPath(gameName, split_file_prefix);",
    "logData dirPath",
)
log_data = replace_once(
    log_data,
    "            dirPath = `./splits/${gameName}/${split_file_prefix}/test_runs`; ",
    "            dirPath = splitPath(gameName, split_file_prefix, \"test_runs\"); ",
    "logData test_runs dirPath",
)
n_join = log_data.count("path.join(dirPath, ")
assert n_join == 7, n_join
log_data = log_data.replace("path.join(dirPath, ", "splitPath(dirPath, ")
fs_start = log_data.index("        fs.mkdir(dirPath, { recursive: true }, (err) => {")
log_data = log_data[:fs_start] + "        return appendSplitCsv(filePath, header, str);\n}\n"

# gen5's logCopy: the attempts folder follows refilming_mode and finishes/ nests under it
# (known-legacy-bugs.md #21).
log_copy = replace_once(log_copy, "function logCopy(", "export function logCopy(", "logCopy export")
log_copy = replace_once(
    log_copy,
    "    var dirPathAttempts = refilming_mode == true ? `./splits/${gameName}/refilmed/${splitFileName}` : `./splits/${gameName}/${splitFileName}`;",
    "    var dirPathAttempts = refilming_mode == true ? splitPath(gameName, \"refilmed\", splitFileName) : splitPath(gameName, splitFileName);",
    "logCopy attempts",
)
log_copy = replace_once(log_copy, "    var dirPathFinishes = `${dirPathAttempts}/finishes`;", "    var dirPathFinishes = splitPath(dirPathAttempts, \"finishes\");", "logCopy finishes")
copy_start = log_copy.index("    fs.mkdir(dirPathFinishes, { recursive: true }, (err) => {")
copies = re.findall(
    r"fs\.copyFile\(\n\s*path\.join\((dirPathAttempts, `[^`]*`)\), \n\s*path\.join\((dirPathFinishes, `[^`]*`)\), \(err\) => \{",
    log_copy[copy_start:],
)
assert len(copies) == 3, copies
log_copy = log_copy[:copy_start] + "    return Promise.all([\n" + "".join(
    f"        copySplitFile(\n            splitPath({a}),\n            splitPath({b})),\n" for a, b in copies
) + "    ]);\n}\n"

transition = replace_once(transition, "function transition(", "export function transition(", "transition export")
load_csv = replace_once(load_csv, "async function loadCsvFile(", "export async function loadCsvFile(", "loadCsvFile export")

splits = (
    'import { appendSplitCsv, copySplitFile, ensureSplitFolder, splitPath } from "~/core/persistence/splitFiles";\n'
    "\n"
    "/**\n"
    " * gen5's `logData`, `logCopy`, `transition` and `loadCsvFile` (the helpers above its\n"
    " * component in `frontend.js`), on the splits IPC instead of `require(\"fs\")` (plan\n"
    " * 2.4 / 1.6). Generated by tools/port/lift-gen5.py, so every header string, path\n"
    " * segment and file-name template is byte-for-byte gen5's -- including the test-run\n"
    " * quirk shared with gen4 (`testStatus` moves the folder to `test_runs/` but the\n"
    " * unconditional switch after it puts the file name back), and gen5's own `logCopy`,\n"
    " * which follows `refilming_mode` and nests `finishes/` under the refilmed path\n"
    " * (known-legacy-bugs.md #21).\n"
    " *\n"
    " * The legacy file also created `splits/`, `splits/Platinum` and `splits/HGSS` when\n"
    " * it loaded -- gen4 leftovers it never writes to (known-legacy-bugs.md #17) --\n"
    " * which is reproduced below.\n"
    " */\n"
    "for (const folder of ['', 'Platinum', 'HGSS']) {\n"
    "    void ensureSplitFolder(folder);\n"
    "}\n\n"
    + log_data + "\n" + log_copy + "\n" + transition + "\n"
    + "/** The file picker behind \"Load Splits\": the File System Access API is Chromium's, not Node's. */\n"
    + load_csv
)
assert "fs." not in splits and "path.join" not in splits and "./splits/" not in splits, "a fs/path use survived in splits.js"
(OUT / "splits.js").write_text(splits, encoding="utf-8")
print("splits.js:", splits.count("\n"), "lines")
