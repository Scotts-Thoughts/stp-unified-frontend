"""
Lift gen4's legacy component + template into src/renderer/games/gen4/ (plan 2.4, the
"lift" half of the recipe; gen2's tools/port/lift-gen2.py is the model).

    python tools/port/lift-gen4.py [tools/port/gen4-template.html]

Inputs: A:/Programs/gen4-stp-frontend/app/frontend.js (read-only), the template
extracted by tools/port/extract-template.ts, and games/gen4/data/_manifest.json from
tools/port/port-data.ts. Writes Overlay.vue, hotkeys.ts and splits.js. Every
replacement asserts the exact number of occurrences it expects, so a change in the
legacy source fails loudly instead of silently porting something else. The seams it
rewrites are listed in the header it writes into the SFC.
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

LEGACY = pathlib.Path("A:/Programs/gen4-stp-frontend/app")
OUT = pathlib.Path("src/renderer/games/gen4")
ASSET_GEN = "gen4"
TEMPLATE = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path("tools/port/gen4-template.html")
NL = chr(10)

src = (LEGACY / "frontend.js").read_text(encoding="utf-8")
options = component_options(src)

# ---- 0. the legacy computed `game` (the game_variables entry) -> `game_data` --------------
# The session arrives as the `game` prop, as it does for every overlay, and a Vue prop
# shadows a computed of the same name. gen4 -- alone among the five -- has a computed
# `game()` returning its game_variables entry (`gameName`, `splits`, `champion`,
# `finalBattle`, `evolutions`); it and its 28 uses are renamed first, so the mapper
# rename below cannot touch them. The template never referenced it.
# 24 member reads, 3 truthiness guards, one optional chain and two comment mentions.
n_game = len(re.findall(r"this\.game\b", options))
assert n_game == 30, n_game
options = re.sub(r"this\.game\b", "this.game_data", options)
options = replace_once(
    options,
    "        game() {" + chr(10) + "            const game = this.mapper.properties.meta.game_name.value",
    "        game_data() {" + chr(10) + "            const game = this.mapper.properties.meta.game_name.value",
    "computed game",
)
assert not re.search(r"this\.game\b", options)

# ---- 1. the mapper client is main.ts's; the component gets the session as `game` ----
options = rename_mapper(options, expect_plain=689, expect_optional=84)

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
        this.game._debouceTimeout = 10
        // this.game.deboucePath("battle.player.active_pokemon.modifiers")
        this.game.deboucePath("battle.opponent.active_pokemon")
        this.game.deboucePath("battle.opponent.team")
        this.game.deboucePath("player.team.0.species") // TODO: requires testing
        this.game.deboucePath("meta.global_pointer") // TODO: requires testing
        await this.game.connect()
""",
    """                    this.expBarState.expPoints = expPoints;
                }
            })
        }
        // The client's debounce list (`_debouceTimeout = 10`, four `deboucePath` calls)
        // is the module's `debouncePaths` in games/gen4/index.ts, applied by main.ts
        // before this component mounts; the client's default timeout is the same 10.
""",
    "onMapperLoaded tail / onMapperUnloaded / debounce / connect",
)

# ---- 2. hotkeys -> the module's table (games/gen4/hotkeys.ts, generated below) --------
hk_start = "        keyhook.registerShortCut('F13'"
hk_end = "        // ── External Control Server ──"
hotkey_block = options[options.index(hk_start): options.index(hk_end)]
options = cut(options, hk_start, hk_end, "        this.unbindHotkeys = bindHotkeys(gen4Hotkeys(this));\n\n", "hotkeys")

# ---- 3. control server -> main.ts + games/gen4/control.ts --------------------------------
options = cut(
    options,
    "        // ── External Control Server ──",
    "        // Enemy sprite resize tool — dev mode only.",
    "        // The control server (port 30159) lives in the main process and is bound to\n"
    "        // games/gen4/control.ts by main.ts; the client is main.ts's too, so the\n"
    "        // beforeunload cleanup that closed both is gone with them.\n\n",
    "control server",
)

# ---- 4. OBS -> the shared client (the method is byte-identical to gen2's) ---------------
options = cut(
    options,
    "        sendObsChapterMarker(chapterName) {",
    "        // ============ Style Settings Management Methods ============",
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
    """                // Update the taskbar/window icon to match the active game.
                try {
                    require('electron').ipcRenderer.send('set-game-icon', newValue)
                } catch (e) {
                    console.error('Failed to update game icon', e)
                }""",
    """                // Update the taskbar/window icon to match the active game. The game ->
                // .ico mapping was gen4's main.js; it is the module's now (games/gen4/index.ts),
                // and the file is sent over the shell's `set-game-icon` channel (plan 3.4).
                try {
                    window.api.set_game_icon(gen4GameIcon(newValue))
                } catch (e) {
                    console.error('Failed to update game icon', e)
                }""",
    "set-game-icon",
)

# ---- 6. open-folder: `start` from the renderer -> the splits IPC -------------------------
options = replace_once(
    options,
    """        openFolder(folderName) {
            require('child_process').exec(`start .\\\\${folderName}\\\\`);
        },""",
    """        openFolder(folderName) {
            // Was `start .\\\\<folder>\\\\` from the renderer; the main process opens the folder
            // under <appRoot>/splits (plan 1.6/1.7). Nothing calls this with anything but
            // `splits`, which is the splits root itself.
            revealSplitFolder(folderName === "splits" ? "" : folderName);
        },""",
    "openFolder",
)
options = replace_once(
    options,
    """            let folderPath;
            if (this.refilming_mode === true) {
                folderPath = `.\\\\splits\\\\${gameName}\\\\refilmed\\\\${splitFileName}`;
            } else {
                folderPath = `.\\\\splits\\\\${gameName}\\\\${splitFileName}`;
            }
            
            require('child_process').exec(`start "" "${folderPath}"`);""",
    """            // Was `start "" ".\\\\splits\\\\..."` from the renderer; the main process creates the
            // folder under <appRoot>/splits and opens it (plan 1.6/1.7).
            let folderPath;
            if (this.refilming_mode === true) {
                folderPath = splitPath(gameName, "refilmed", splitFileName);
            } else {
                folderPath = splitPath(gameName, splitFileName);
            }

            revealSplitFolder(folderPath);""",
    "openCurrentSplitsFolder",
)

assert ".onMapperLoaded =" not in options and ".onMapperUnloaded =" not in options and "connect()" not in options
# ---- 6b. the species-settings watchers keep the precedence Vue 3.2 gave them -------------
# Same seam as gen5's (tools/port/lift-gen5.py explains it): the legacy page ran Vue
# 3.2.47, which flushed a component's pre-watchers LIFO, so the `$watch` per species
# setting registered in `created()` ran before the `starter` watch option; Vue 3.5
# flushes FIFO. gen4's parity fixture is green either way, but the same
# `is_loading_evolution_style` guard sits in these watchers, so they get the same
# precedence and the two lifts read alike.
options = replace_once(
    options,
    "                        [propName]: newValue" + NL
    + "                    };" + NL
    + "                }" + NL
    + "            );" + NL
    + "        }" + NL
    + "        for (let i = 0; i < this.auto_save_settings.length; i++) {",
    "                        [propName]: newValue" + NL
    + "                    };" + NL
    + "                }," + NL
    + "                // flush: 'sync' -- the precedence Vue 3.2 gave these; see tools/port/lift-gen5.py." + NL
    + "                { flush: 'sync' }" + NL
    + "            );" + NL
    + "        }" + NL
    + "        for (let i = 0; i < this.auto_save_settings.length; i++) {",
    "settings watchers flush",
)

assert_no_mapper_outside_created(options)
assert "GameHookMapperClient" not in options
assert ".deboucePath(" not in options and "._debouceTimeout" not in options

# Every `images/...` string literal in the script now points at the asset scheme.
options, n_script_assets = rebase_assets(options, ASSET_GEN)

# ---- 7. imports for the data globals, and the template ---------------------------------
imports = data_imports(options, OUT)
template, n_template_assets = prepare_template(TEMPLATE, ASSET_GEN, min_mapper_refs=50)

header = """<script>
/**
 * gen4's overlay: Platinum, Diamond & Pearl, HeartGold & SoulSilver (plan 2.4,
 * lifted 2026-09-11).
 *
 * This is the component object from the legacy `frontend.js` (10,140 lines, one
 * `Vue.createApp` call) and the `#app` markup from its `index.html`, brought in as an
 * SFC with the infrastructure swapped for the shared core and *nothing else changed*
 * (tools/port/lift-gen4.py does the swaps and asserts each one):
 *
 *   - `this.mapper.X`   -> `this.game.X`: the session main.ts builds -- the profile's
 *                          canonical view as `properties`, plus `setBits`. The
 *                          component no longer constructs or connects a client; what
 *                          was its `onMapperLoaded` callback runs at the top of
 *                          `mounted`, in the same order, and its four `deboucePath`
 *                          calls are the module's `debouncePaths`. gen4's own computed
 *                          `game` (its game_variables entry) is `game_data` now, so the
 *                          prop does not shadow it.
 *   - `MyStorage`       -> games/gen4/storage.ts (the file-backed layered store, with
 *                          gen4's key rule, style-field filter and debounced write).
 *   - keyhook block     -> games/gen4/hotkeys.ts through core/hotkeys.
 *   - control server    -> games/gen4/control.ts, bound by main.ts (plan 1.8).
 *   - OBS marker method -> core/logic/obs.ts (the same exchange, plan 1.9).
 *   - logData/logCopy   -> games/gen4/splits.js over the splits IPC.
 *   - `<script src>`    -> imports of games/gen4/data/**.js.
 *   - set-game-icon     -> `window.api.set_game_icon` with the module's icon table.
 *   - openFolder        -> the splits IPC.
 *   - `images/...`      -> `images/gen4/...` everywhere (template, script,
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
import { gen4Hotkeys } from "./hotkeys";
import { gen4GameIcon } from "./icons";
import { loadCsvFile, logData, logCopy, transition } from "./splits.js";
"""

# A classic <script> runs in sloppy mode, where assigning to an undeclared name creates
# a global that every method can see; an ES module is strict, where the same line
# throws ReferenceError. These are the names the legacy component uses without
# declaring -- found by tools/port/check-undefined.ts on the lifted SFC, which asks the
# TypeScript checker rather than the running app. Module-level `let`s reproduce the
# sharing exactly (every method sees the same binding, values persist across calls),
# minus the property on `window`, which nothing reads.
IMPLICIT_GLOBALS = [
    "attack", "basePower", "battle_end", "calculated_stats", "d", "damageMax", "damageMin", "debugging_mode",
    "defense", "encounters_off", "encounters_on", "fling_power", "gen3abilities", "h", "level", "m",
    "maxPercentage", "minPercentage", "modifier_table", "nature", "newColor", "part1", "part2", "part3",
    "part4", "pid", "power", "shuckie_blackouts", "shuckie_resets", "specialA", "specialD", "stab",
    "stageModification", "starterType", "timecode", "turn_count", "type", "type1", "type2", "typeString",
    "usableVitamins", "vitaminsUsed",
]
# `hash(...)` (the playerNameChoice watcher) is undefined in the legacy app as well -- a
# ReferenceError there and here (known-legacy-bugs.md #32) -- so it is left undeclared.
CHECK_ALLOW = ["hash"]
implicit = implicit_globals_decl(IMPLICIT_GLOBALS, "gen4")

# The session arrives as a prop; the legacy component had no props at all.
options = replace_once(options, "\n    data() {", "\n    props: [\"game\"],\n    data() {", "props")
sfc = assemble_sfc(template, header, imports, implicit, options)
(OUT / "Overlay.vue").write_text(sfc, encoding="utf-8")
print("Overlay.vue:", sfc.count("\n"), "lines;", len(imports), "data imports;", n_script_assets, "script +", n_template_assets, "template asset refs rebased")
print("remaining require():", remaining_requires(options))

# ---- 8. hotkeys.ts from the block cut above ----------------------------------------------
entries = hotkey_table(hotkey_block)
assert [k for k, _ in entries] == [f"F{n}" for n in range(13, 25)], [k for k, _ in entries]
write_hotkeys(
    OUT / "hotkeys.ts",
    "gen4",
    entries,
    """gen4's F-key table, lifted from the `keyhook.registerShortCut` calls in its
`mounted` (plan 2.4, decision 7: per-gen tables preserved, quirks included).

gen4's own shape: F13 shows IVs (no DV/Hidden Power cycle), F16 is Automatic with no
Badge Boosts cycle, F17-F19 switch the right panel, F20 toggles the bonk counter, and
F21/F22 log that they are unused -- which is still a binding, so it stays.""",
)
print("hotkeys.ts:", len(entries), "keys")

# ---- 9. splits.js: logData / logCopy / transition / loadCsvFile over the splits IPC ------
def legacy_fn(name: str) -> str:
    a = src.index(f"function {name}(")
    a = src.rindex("\n", 0, a) + 1
    # ends at the next top-level `}` line
    b = src.index("\n}\n", a) + len("\n}\n")
    return src[a:b]

log_data = legacy_fn("logData")
log_copy = legacy_fn("logCopy")
transition = legacy_fn("transition")
load_csv = legacy_fn("loadCsvFile")
assert log_data.startswith("function logData(") and log_copy.startswith("function logCopy(")
assert transition.startswith("function transition(") and load_csv.startswith("async function loadCsvFile(")

# logData: the Promise wrapper and the fs callbacks become one appendSplitCsv call; the
# `./splits/` prefixes go, because the IPC resolves against the splits root (plan 1.7).
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
fs_end = log_data.rindex("\n}\n")
log_data = log_data[:fs_start] + "        return appendSplitCsv(filePath, header, str);\n}\n"

log_copy = replace_once(log_copy, "function logCopy(", "export function logCopy(", "logCopy export")
log_copy = replace_once(log_copy, "    var dirPathAttempts = `./splits/${gameName}/${splitFileName}`;", "    var dirPathAttempts = splitPath(gameName, splitFileName);", "logCopy attempts")
log_copy = replace_once(log_copy, "    var dirPathFinishes = `./splits/${gameName}/${splitFileName}/finishes`;", "    var dirPathFinishes = splitPath(gameName, splitFileName, \"finishes\");", "logCopy finishes")
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
    'import { appendSplitCsv, copySplitFile, splitPath } from "~/core/persistence/splitFiles";\n'
    "\n"
    "/**\n"
    " * gen4's `logData`, `logCopy`, `transition` and `loadCsvFile` (the helpers above its\n"
    " * component in `frontend.js`), on the splits IPC instead of `require(\"fs\")` (plan\n"
    " * 2.4 / 1.6). Generated by tools/port/lift-gen4.py, so every header string, path\n"
    " * segment and file-name template is byte-for-byte gen4's -- including the test-run\n"
    " * quirk, where `testStatus` moves the folder to `test_runs/` but the unconditional\n"
    " * switch after it puts the file name back to the normal one.\n"
    " *\n"
    " * The legacy `logData` resolved after the append (or after logging an error);\n"
    " * `appendSplitCsv` does the same, through one ordered queue. `logCopy` returned\n"
    " * nothing and copied in the background; it now returns the copies' promise.\n"
    " */\n"
    + log_data + "\n" + log_copy + "\n" + transition + "\n"
    + "/** The file picker behind \"Load Splits\": the File System Access API is Chromium's, not Node's. */\n"
    + load_csv
)
assert "fs." not in splits and "path.join" not in splits and "./splits/" not in splits, "a fs/path use survived in splits.js"
(OUT / "splits.js").write_text(splits, encoding="utf-8")
print("splits.js:", splits.count("\n"), "lines")
