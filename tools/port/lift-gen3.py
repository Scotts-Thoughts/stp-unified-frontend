"""
Lift gen3's legacy component + template into src/renderer/games/gen3/ (plan 2.4, the
"lift" half of the recipe; gen5's tools/port/lift-gen5.py is the model). gen3 is the
oldest of the four lifted apps and has the most seams of its own: its `#app` is the
overlay grid itself, its `ready` flag gates the `game` computed the template reads,
its style store has no `user_` layer, and its `logCopy` numbers finished runs by
listing a folder.

    python tools/port/lift-gen3.py [tools/port/gen3-template.html]

Inputs: A:/Programs/gen3-stp-frontend/app/ (read-only), the template extracted by
tools/port/extract-template.ts, and games/gen3/data/_manifest.json from
tools/port/port-data.ts. Writes Overlay.vue, hotkeys.ts, splits.js,
data/gameVariables.js, logic/Timer.js, logic/PubSub.js and components/Timer.js.
Every replacement asserts the exact number of occurrences it expects.
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

LEGACY = pathlib.Path("A:/Programs/gen3-stp-frontend/app")
OUT = pathlib.Path("src/renderer/games/gen3")
ASSET_GEN = "gen3"
TEMPLATE = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path("tools/port/gen3-template.html")
NL = chr(10)

src = (LEGACY / "scripts" / "frontend.js").read_text(encoding="utf-8")
options = component_options(src)

# The dead code the plan drops (docs/gen3-inventory.md): `Storage` (the watched
# Storage.json object) is referenced only from commented-out code in the component,
# and `retro` (the RetroArch UDP hook) only from the beforeunload cleanup cut below.
for line in options.split(NL):
    if re.search(r"(?<![.\w])Storage\b", line):
        assert line.strip().startswith("//"), f"a live Storage reference: {line.strip()[:80]}"

# ---- 0. the legacy computed `game` (the gameVariables entry) -> `game_data` --------------
# As in gen4 and gen5: the session arrives as the `game` prop, and a Vue prop shadows a
# computed of the same name, so gen3's computed `game()` and every use of it are renamed
# first. Unlike theirs, gen3's template reads the computed too (`game.dexData`,
# `this.game.region`), so the template gets the same rename below.
n_game = len(re.findall(r"this\.game\b", options))
assert n_game == 132, n_game
options = re.sub(r"this\.game\b", "this.game_data", options)
options = replace_once(
    options,
    "        game() {" + NL + "            if (this.ready == false) { return }",
    "        game_data() {" + NL + "            if (this.ready == false) { return }",
    "computed game",
)
assert not re.search(r"this\.game\b", options)

# ---- 1. the mapper client is main.ts's; the component gets the session as `game` ----
options = rename_mapper(options, expect_plain=493, expect_optional=35)

# gen3's `mounted` awaited `connect()`, which resolved only after the client's
# onMapperLoaded callback had raised `ready` and Vue had rendered the `v-else`
# overlay -- and the watchers `created()` queued had flushed before any of that with
# `ready` still false. The template here is that `v-else` content, gated on `ready`
# exactly as it was (assemble_sfc's root), and two ticks keep the order: the queued
# watchers; `ready` and the render; the callback's next-tick work; then the rest of
# `mounted`, which reads `#reset_counter_single` without a guard and so needs the
# overlay in the DOM.
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
        // loaded and detected. The legacy awaited the client's connect here, which resolved after
        // its onMapperLoaded callback (the block below) had raised `ready` and the
        // `v-else` overlay had rendered, and after the watchers `created()` queued had
        // flushed with `ready` still false. Two ticks keep that order (lift-gen3.py).
        await this.$nextTick()
        {
            this.ready = true
            this.$nextTick(() => {""",
    "mounted head",
)
options = replace_once(
    options,
    """                if (this._initialRomStarterPending) {
                    this._initialRomStarterPending = false;
                    this.update_rom_starter_and_intro_mon();
                }
            })
        }
        this.game.onMapperUnloaded = (x) => this.ready = false
        await this.game.connect()
""",
    """                if (this._initialRomStarterPending) {
                    this._initialRomStarterPending = false;
                    this.update_rom_starter_and_intro_mon();
                }
            })
        }
        // The render `ready` queued, then the callback above -- what the awaited connect covered.
        await this.$nextTick()
""",
    "onMapperLoaded tail / onMapperUnloaded / connect",
)

# ---- 2. hotkeys -> the module's table (games/gen3/hotkeys.ts, generated below) --------
hk_start = "        keyhook.registerShortCut('F22'"
hk_end = "        // ── External Control Server ──"
hotkey_block = options[options.index(hk_start): options.index(hk_end)]
options = cut(options, hk_start, hk_end, "        this.unbindHotkeys = bindHotkeys(gen3Hotkeys(this));\n\n", "hotkeys")

# ---- 3. control server -> main.ts + games/gen3/control.ts --------------------------------
# The cut takes the beforeunload cleanup with it: it closed the server, the RetroArch
# UDP hook (`retro`, dead) and the mapper client, none of which the component owns now.
options = cut(
    options,
    "        // ── External Control Server ──",
    "        // Enemy sprite resize tool — dev mode only.",
    "        // The control server (port 30159) lives in the main process and is bound to\n"
    "        // games/gen3/control.ts by main.ts; the client is main.ts's too, so the\n"
    "        // beforeunload cleanup that closed both (and the dead RetroArch hook) is gone with them.\n\n",
    "control server",
)
assert "retro" not in re.sub(r"//.*", "", options).replace("retroactive", ""), "a retro reference survived"

# ---- 4. OBS -> the shared client, in its probing variant ----------------------------------
# gen3's method is gen2's exchange plus a `GetRecordStatus` probe between Identify and
# the chapter request, with log lines at each step; `probeStatus` is that variant.
options = cut(
    options,
    "        sendObsChapterMarker(chapterName) {",
    "        /**\n         * Get the current storage key for the active Pokemon\n         */\n        getCurrentStorageKey() {",
    "        sendObsChapterMarker(chapterName) {\n"
    "            // gen3's obs-websocket v5 exchange -- Identify, a GetRecordStatus probe, then\n"
    "            // CreateRecordChapter, with its log lines -- is the shared client's `probeStatus`\n"
    "            // variant (core/logic/obs.ts, plan 1.9); it reads the same url/password keys.\n"
    "            sendObsChapterMarker(chapterName, { probeStatus: true });\n"
    "        },\n\n",
    "obs",
)

# ---- 5. the window icon: ipcRenderer.send -> the preload's channel ----------------------
options = replace_once(
    options,
    """        // Set the taskbar/window icon to match the initially selected game.
        try {
            require('electron').ipcRenderer.send('set-game-icon', this.gameSelection)
        } catch (e) {
            console.error('Failed to set initial game icon', e)
        }
        import('../lib/gameVariables.js').then((gameVariables) => {
            this.gameVariables = gameVariables.default;
            // Bind the newGame function to the Vue component
            // this.gameVariables.newGame = this.gameVariables.newGame.bind(this);
        })""",
    """        // Set the taskbar/window icon to match the initially selected game. The game ->
        // .ico mapping was gen3's main.js; it is the module's now (games/gen3/icons.ts),
        // and the file is sent over the shell's `set-game-icon` channel (plan 3.4).
        try {
            window.api.set_game_icon(gen3GameIcon(this.gameSelection))
        } catch (e) {
            console.error('Failed to set initial game icon', e)
        }
        // Was `import('../lib/gameVariables.js').then(...)`: the file resolved from disk
        // long before the mapper connected and `ready` rose, so nothing ever saw the gap.
        // The module is imported statically (games/gen3/data/gameVariables.js) and
        // assigned here, before anything that reads it.
        this.gameVariables = gameVariables;""",
    "created icon + gameVariables",
)
options = replace_once(
    options,
    """            // Update the taskbar/window icon to match the selected game.
            try {
                require('electron').ipcRenderer.send('set-game-icon', newValue)
            } catch (e) {
                console.error('Failed to update game icon', e)
            }""",
    """            // Update the taskbar/window icon to match the selected game (games/gen3/icons.ts).
            try {
                window.api.set_game_icon(gen3GameIcon(newValue))
            } catch (e) {
                console.error('Failed to update game icon', e)
            }""",
    "set-game-icon watch",
)

# ---- 6. open-folder: `start` from the renderer -> the splits IPC -------------------------
options = replace_once(
    options,
    """        openFolder(folderName, game_name, path = "", path2) {
            const fs = require('fs');
            const fullPath = `.\\\\${folderName}\\\\${game_name}\\\\${path}\\\\${path2}`;
            // console.log(fullPath);

            if (!fs.existsSync(fullPath)) {
                fs.mkdirSync(fullPath, { recursive: true });
            }

            // Correctly handle spaces in folder names
            require('child_process').exec(`start "" "${fullPath}"`);
        }, """,
    """        openFolder(folderName, game_name, path = "", path2) {
            // Was require("fs") + `start ""` from the renderer; the main process creates
            // the folder under <appRoot>/splits and opens it (plan 1.6/1.7). The only
            // caller passes `splits` as the folder name.
            revealSplitFolder(splitPath(game_name, path, path2));
        },""",
    "openFolder",
)

# ---- 6b. the species-settings watchers keep the precedence Vue 3.2 gave them -------------
# Same seam as gen5's (tools/port/lift-gen5.py explains it): the legacy page ran Vue
# 3.2.47, which flushed a component's pre-watchers LIFO, so the `$watch` per species
# setting registered in `created()` ran before the `starterString` watch option; Vue
# 3.5 flushes FIFO. gen3's `load_all_settings` sets `starterString` and then the style
# fields in one tick, and the same `is_loading_evolution_style` guard sits in these
# watchers, so they get the same precedence. gen3 has one more such watcher than
# gen4/gen5, the per-species `ui_saturation` one, guarded the same way.
options = replace_once(
    options,
    "                    MyStorage[storageKey] = {" + NL
    + "                        ...MyStorage[storageKey]," + NL
    + "                        [propName]: newValue" + NL
    + "                    };" + NL
    + "                }" + NL
    + "            );" + NL
    + "        }" + NL
    + "        for (let i = 0; i < this.auto_save.length; i++) {",
    "                    MyStorage[storageKey] = {" + NL
    + "                        ...MyStorage[storageKey]," + NL
    + "                        [propName]: newValue" + NL
    + "                    };" + NL
    + "                }," + NL
    + "                // flush: 'sync' -- the precedence Vue 3.2 gave these; see tools/port/lift-gen5.py." + NL
    + "                { flush: 'sync' }" + NL
    + "            );" + NL
    + "        }" + NL
    + "        for (let i = 0; i < this.auto_save.length; i++) {",
    "settings watchers flush",
)
options = replace_once(
    options,
    "                MyStorage[storageKey] = {" + NL
    + "                    ...MyStorage[storageKey]," + NL
    + "                    ui_saturation: newValue" + NL
    + "                };" + NL
    + "            }" + NL
    + "        );",
    "                MyStorage[storageKey] = {" + NL
    + "                    ...MyStorage[storageKey]," + NL
    + "                    ui_saturation: newValue" + NL
    + "                };" + NL
    + "            }," + NL
    + "            // flush: 'sync' -- as above." + NL
    + "            { flush: 'sync' }" + NL
    + "        );",
    "ui_saturation watcher flush",
)

# The `auto_save` and `encounter_settings` watchers are the same story from the other
# side: at boot `load_all_settings` sets `frame` true and the queued `starterString`
# watcher's `loadEvolutionStyle` sets it back to false. Under 3.2 the auto_save
# watcher (queued later, flushed first) ran between the two and persisted `frame`
# twice, ending at false; under 3.5 it runs after both, sees no net change, and
# never persists it -- a key present in the legacy state and absent from the unified
# one (oracle 4). `flush: 'sync'` persists at each assignment, which ends the same way.
options = replace_once(
    options,
    "                () => this[propName], // Using a function to return the property's value" + NL
    + "                (newValue) => {" + NL
    + "                    MyStorage[`${propName}`] = newValue;" + NL
    + "                }" + NL
    + "            );",
    "                () => this[propName], // Using a function to return the property's value" + NL
    + "                (newValue) => {" + NL
    + "                    MyStorage[`${propName}`] = newValue;" + NL
    + "                }," + NL
    + "                // flush: 'sync' -- as above." + NL
    + "                { flush: 'sync' }" + NL
    + "            );",
    "auto_save watchers flush",
)
options = replace_once(
    options,
    "                () => this[propName], // Using a function to return the property's value" + NL
    + "                (newValue) => {" + NL
    + "                    MyStorage[`${propName}`] = newValue;" + NL
    + "                    this.freezeEncounters();" + NL
    + "                }" + NL
    + "            );",
    "                () => this[propName], // Using a function to return the property's value" + NL
    + "                (newValue) => {" + NL
    + "                    MyStorage[`${propName}`] = newValue;" + NL
    + "                    this.freezeEncounters();" + NL
    + "                }," + NL
    + "                // flush: 'sync' -- as above." + NL
    + "                { flush: 'sync' }" + NL
    + "            );",
    "encounter_settings watchers flush",
)

# ---- 7. the timer component -------------------------------------------------------------
options = replace_once(
    options,
    """        "Timer": require("./components/Timer.js"),""",
    """        "Timer": TimerComponent,""",
    "timer component",
)

# Two bare references are left (a third is in a comment): the `game_data` computed's
# guard and the move-change check's argument. The session is what the client was there.
options = replace_once(options, "if (this.mapper && this.game.properties.meta?.gameName) {", "if (this.game && this.game.properties.meta?.gameName) {", "bare this.mapper guard (game_data)")
options = replace_once(options, "if (this.playerTeamMovesChanged(this.mapper, this.last_known_moves)) {", "if (this.playerTeamMovesChanged(this.game, this.last_known_moves)) {", "bare this.mapper (move change)")
options = replace_once(options, "// console.log('Moves changed:', this.getPlayerTeamMoveSet(this.mapper));", "// console.log('Moves changed:', this.getPlayerTeamMoveSet(this.game));", "bare this.mapper (comment)")
assert ".onMapperLoaded =" not in options and ".onMapperUnloaded =" not in options and "connect()" not in options
assert_no_mapper_outside_created(options)
assert "GameHookMapperClient" not in options
assert "keyhook." not in options and "ipcRenderer" not in options

options, n_script_assets = rebase_assets(options, ASSET_GEN)

# ---- 8. imports for the data globals, and the template ---------------------------------
imports = data_imports(options, OUT)
# The template's reads of the computed (`game.dexData`, `this.game.region`) follow the
# rename; `mapper.properties` -> `game.properties` is prepare_template's, after this.
raw_template = TEMPLATE.read_text(encoding="utf-8")
n_dex = len(re.findall(r"\bgame\.dexData\b", raw_template))
n_region = raw_template.count("this.game.region")
assert (n_dex, n_region) == (14, 3), (n_dex, n_region)
raw_template = re.sub(r"\bgame\.dexData\b", "game_data.dexData", raw_template)
raw_template = raw_template.replace("this.game.region", "this.game_data.region")
renamed_template = TEMPLATE.with_name("gen3-template.renamed.html")
renamed_template.write_text(raw_template, encoding="utf-8")
template, n_template_assets = prepare_template(renamed_template, ASSET_GEN, min_mapper_refs=140)
renamed_template.unlink()
# Every other `game.` in the template is now the session (`game.properties`).
assert not re.search(r"\bgame\.(?!properties)", template), "a computed `game` read survived in the template"

header = """<script>
/**
 * gen3's overlay: Emerald, FireRed & LeafGreen (plan 2.4, lifted 2026-09-11).
 *
 * This is the component object from the legacy `scripts/frontend.js` (8,292 lines,
 * one `Vue.createApp` call) and the `#app` markup from its `index.html`, brought in as
 * an SFC with the infrastructure swapped for the shared core and *nothing else
 * changed* (tools/port/lift-gen3.py does the swaps and asserts each one):
 *
 *   - `this.mapper.X`   -> `this.game.X`: the session main.ts builds -- the profile's
 *                          canonical view as `properties`, plus `setBits`. The
 *                          component no longer constructs or connects a client; what
 *                          was its `onMapperLoaded` callback runs in `mounted`, in the
 *                          same order, and the two ticks around it stand in for the
 *                          awaited `connect()`. gen3's own computed `game` (its
 *                          gameVariables entry) is `game_data` now, in script and
 *                          template, so the prop does not shadow it.
 *   - the root `<div>`  -> gated on the component's `ready`, as the legacy `v-else`
 *                          was: gen3's `game_data` returns nothing until `ready`, and
 *                          the template reads it at its top level.
 *   - `MyStorage`       -> games/gen3/storage.ts (the file-backed store with gen3's
 *                          own rules: no `user_` layer, a dev-mode write replaces the
 *                          shipped default).
 *   - keyhook block     -> games/gen3/hotkeys.ts through core/hotkeys (F20 is registered
 *                          twice there; the table runs both bodies in order).
 *   - control server    -> games/gen3/control.ts, bound by main.ts (plan 1.8).
 *   - OBS marker method -> core/logic/obs.ts in its `probeStatus` variant (gen3's
 *                          GetRecordStatus probe and log lines, plan 1.9).
 *   - logData/logCopy   -> games/gen3/splits.js over the splits IPC; the two split
 *                          folders the legacy file created at load are created there too.
 *   - Timer / PubSub    -> games/gen3/logic/, the timer component -> games/gen3/
 *                          components/, as ES modules with their bodies as they were.
 *   - `<script src>`    -> imports of games/gen3/data/**.js; the dynamic
 *                          `import('../lib/gameVariables.js')` -> a static import of
 *                          games/gen3/data/gameVariables.js, assigned in `created()`.
 *   - set-game-icon     -> `window.api.set_game_icon` with the module's icon table.
 *   - openFolder        -> the splits IPC.
 *   - `images/...`      -> `images/gen3/...` everywhere (template, script,
 *                          stylesheet, data): the generation's tree sits next to gen1's
 *                          images, under the same document-relative root, until Phase 4
 *                          merges the pools (tools/port/lift_assets.py says why not a scheme).
 *
 * What the legacy page also did at load and the lift drops: the `./storage` folder and
 * the watched `Storage.json` object in it (dead: read at load, referenced only from
 * commented-out code), the RetroArch UDP hook (dead), and the `keyhook.exe` spawn
 * (core's, through the main process).
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
import { gen3Hotkeys } from "./hotkeys";
import { gen3GameIcon } from "./icons";
import { loadCsvFile, logData, logCopy } from "./splits.js";
import { Timer } from "./logic/Timer.js";
import TimerComponent from "./components/Timer.js";
import gameVariables from "./data/gameVariables.js";
"""

# Found by tools/port/check-undefined.ts on the lifted SFC (see lift-gen4.py for the
# reasoning): the names the legacy component *assigns* without declaring, which a
# classic script turned into globals and a module would throw on. Three more names are
# read bare and never assigned -- `hash(...)` (known-legacy-bugs.md #32), `g3state()`
# as a default argument and `starterString` in `growthRate`'s fallback branch (#35) --
# and those stay undeclared: a read of an undeclared name is a ReferenceError in a
# classic script and in a module alike, so the lifted code fails exactly where the
# legacy did.
IMPLICIT_GLOBALS = [
    "attack", "damageMax", "damageMin", "defense", "gamestate", "h", "level", "m", "mod", "newColor",
    "power", "specialA", "specialD", "stab", "starterType", "timecode", "type1", "type2",
    "usableVitamins", "value_current", "value_previous", "vitaminsUsed",
]
CHECK_ALLOW = ["hash", "g3state", "starterString"]
implicit = implicit_globals_decl(IMPLICIT_GLOBALS, "gen3")

options = replace_once(options, "\n    data() {", "\n    props: [\"game\"],\n    data() {", "props")
sfc = assemble_sfc(template, header, imports, implicit, options, root_open='<div v-if="ready">')
(OUT / "Overlay.vue").write_text(sfc, encoding="utf-8")
print("Overlay.vue:", sfc.count("\n"), "lines;", len(imports), "data imports;", n_script_assets, "script +", n_template_assets, "template asset refs rebased")
print("remaining require():", remaining_requires(options))

# ---- 9. hotkeys.ts from the block cut above ---------------------------------------------
entries = hotkey_table(hotkey_block)
assert [k for k, _ in entries] == ["F22", "F21", "F20", "F20", "F17", "F18", "F19", "F23", "F24"], [k for k, _ in entries]
# gen3 registers F20 twice ("Base Stats", then "Automatic"). Its KeyHook kept both
# listeners and ran them in registration order, so one press logged both lines and
# left `stats` at "Automatic"; a table has one entry per key, so that entry runs the
# two bodies in that order (the first has no early return).
merged: list[tuple[str, str]] = []
for key, body in entries:
    if merged and merged[-1][0] == key:
        assert "return" not in merged[-1][1], "the first F20 body returns early; the bodies cannot be joined"
        # The body opens with the legacy's trailing `// Automatic` comment; fold it into the note.
        first_line, rest = body.split(NL, 1)
        assert first_line.strip().startswith("//"), first_line
        merged[-1] = (key, merged[-1][1] + f"            // gen3's second F20 registration ({first_line.strip()[2:].strip()}) ran after the first; see tools/port/lift-gen3.py." + NL + rest)
    else:
        merged.append((key, body))
write_hotkeys(
    OUT / "hotkeys.ts",
    "gen3",
    merged,
    """gen3's F-key table, lifted from the `keyhook.registerShortCut` calls in its
`mounted` (plan 2.4, decision 7: per-gen tables preserved, quirks included).

gen3's own shape: F22/F21/F20 pick the stat display, F17-F19 the right panel, F23
starts a new run and F24 pauses the timer. F20 was registered twice in the legacy
source ("Base Stats", then "Automatic"); both listeners fired on a press, in that
order, which the single F20 entry reproduces.""",
)
print("hotkeys.ts:", len(merged), "keys")

# ---- 10. gameVariables.js: the one legacy ES module, with its globals imported ------------
# `lib/gameVariables.js` was loaded by `import()`; as a real module it still saw the
# classic scripts' globals (`dexDataRubySapphireEmerald`...) on `window`. Those are
# imports now, resolved from port-data's manifest as tools/port/port-data.ts does it.
gv = (LEGACY / "lib" / "gameVariables.js").read_text(encoding="utf-8")
assert gv.count("export default gameVariables;") == 1 and "require(" not in gv
manifest = __import__("json").loads((OUT / "data" / "_manifest.json").read_text(encoding="utf-8"))
gv_code = re.sub(r'"(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\'|`(?:[^`\\]|\\.)*`', '""', gv)
gv_code = re.sub(r"//.*", "", gv_code)
gv_imports = []
for m in manifest:
    needed = [g for g in m["globals"] if re.search(r"\b" + re.escape(g) + r"\b", gv_code)]
    if needed:
        gv_imports.append(f'import {{ {", ".join(needed)} }} from "./{m["out"].split("/data/", 1)[1]}";')
assert len(gv_imports) == 4, gv_imports
gv, n_gv_assets = rebase_assets(gv, ASSET_GEN)
(OUT / "data" / "gameVariables.js").write_text(
    "// gen3's `lib/gameVariables.js`, verbatim (tools/port/lift-gen3.py): the per-game entry\n"
    "// the `game_data` computed returns. The globals it read off `window` are imports.\n"
    + NL.join(gv_imports) + NL + NL + gv, encoding="utf-8")
print("data/gameVariables.js:", len(gv_imports), "imports;", n_gv_assets, "asset refs rebased")


def cjs_to_esm(text: str, replacements: list[tuple[str, str, str]]) -> str:
    for old, new, label in replacements:
        text = replace_once(text, old, new, label)
    assert "require(" not in text and "module.exports" not in text, "a CommonJS form survived"
    return text


# ---- 11. the timer class, PubSub and the timer component ---------------------------------
# gen3's logic/PubSub.js and logic/Timer.js are byte-identical to gen5's; its
# components/Timer.js differs in one line (the "time played at 4x game-speed" title is
# live here, commented out in gen5's).
(OUT / "logic").mkdir(exist_ok=True)
(OUT / "components").mkdir(exist_ok=True)
pubsub = (LEGACY / "logic" / "PubSub.js").read_text(encoding="utf-8")
pubsub = cjs_to_esm(pubsub, [("module.exports = new PubSub();", "export default new PubSub();", "PubSub export")])
(OUT / "logic" / "PubSub.js").write_text("// gen3's `logic/PubSub.js`, verbatim as an ES module (tools/port/lift-gen3.py).\n" + pubsub, encoding="utf-8")

timer = (LEGACY / "logic" / "Timer.js").read_text(encoding="utf-8")
timer = cjs_to_esm(timer, [
    ('const PubSub = require("./PubSub");', 'import PubSub from "./PubSub.js";', "Timer PubSub import"),
    ("module.exports = Timer;", "export { Timer };", "Timer export"),
])
(OUT / "logic" / "Timer.js").write_text("// gen3's `logic/Timer.js`, verbatim as an ES module (tools/port/lift-gen3.py).\n" + timer, encoding="utf-8")

text = (LEGACY / "components" / "Timer.js").read_text(encoding="utf-8")
text = cjs_to_esm(text, [
    ("module.exports = {", "export default {", "Timer component export"),
    ('const PubSub = require("../logic/PubSub");', 'import PubSub from "../logic/PubSub.js";', "Timer component PubSub import"),
])
# The legacy page had Vue on `window`; an ES module imports what it uses.
used = sorted({m for m in re.findall(r"\bVue\.(\w+)", text)})
text = re.sub(r"\bVue\.(\w+)", r"\1", text)
head = ("// gen3's `components/Timer.js`, verbatim as an ES module (tools/port/lift-gen3.py): the\n"
        "// template string is compiled at runtime, exactly as the legacy page compiled it.\n"
        + (f'import {{ {", ".join(used)} }} from "vue";\n' if used else ""))
(OUT / "components" / "Timer.js").write_text(head + text, encoding="utf-8")
print("logic/PubSub.js, logic/Timer.js, components/Timer.js written")


# ---- 12. splits.js: logData / logCopy / loadCsvFile over the splits IPC ------------------
def legacy_fn(name: str) -> str:
    a = src.index(f"function {name}(")
    a = src.rindex("\n", 0, a) + 1
    b = src.index("\n}\n", a) + len("\n}\n")
    return src[a:b]


log_data = legacy_fn("logData")
log_copy = legacy_fn("logCopy")
load_csv = legacy_fn("loadCsvFile")
assert log_data.startswith("function logData(") and log_copy.startswith("function logCopy(")
assert load_csv.startswith("async function loadCsvFile(")

log_data = replace_once(log_data, "function logData(", "export function logData(", "logData export")
log_data = replace_once(log_data, "        return new Promise((resolve, reject) => {\n", "", "logData promise")
# `app.game.gameName` read the mounted instance's `game` computed; both call sites pass
# that same value as `gameName_path`, which is the argument the function otherwise ignored.
log_data = replace_once(
    log_data,
    "        const dirPath = `./splits/${app.game.gameName}/${starter}/attempts/`;",
    "        // The legacy read `gameName` off the mounted instance's `game` computed here, which\n"
    "        // is what both call sites pass as `gameName_path` (tools/port/lift-gen3.py).\n"
    "        const dirPath = splitPath(gameName_path, starter, \"attempts\");",
    "logData dirPath",
)
n_join = log_data.count("path.join(dirPath, ")
assert n_join == 3, n_join
log_data = log_data.replace("path.join(dirPath, ", "splitPath(dirPath, ")
fs_start = log_data.index("        fs.mkdir(dirPath, { recursive: true }, (err) => {")
log_data = log_data[:fs_start] + "        return appendSplitCsv(filePath, header, str);\n}\n"

# gen3's logCopy: attempts/ and finishes/ under the split folder, the finished-run
# number taken from a listing of finishes/ (known-legacy-bugs.md #21 describes the
# variants); test runs are counted but not copied.
log_copy = replace_once(log_copy, "function logCopy(", "export async function logCopy(", "logCopy export")
log_copy = replace_once(
    log_copy,
    "    var dirPathAttempts = `./splits/${gameName_path}/${starter}/attempts/`;\n"
    "    var dirPathFinishes = `./splits/${gameName_path}/${starter}/finishes/`;",
    "    var dirPathAttempts = splitPath(gameName_path, starter, \"attempts\");\n"
    "    var dirPathFinishes = splitPath(gameName_path, starter, \"finishes\");",
    "logCopy paths",
)
log_copy = replace_once(
    log_copy,
    "        if (fs.existsSync(dirPathFinishes)) {\n"
    "            const files = fs.readdirSync(dirPathFinishes);",
    "        {\n"
    "            // readdirSync over the splits IPC; a missing folder lists as empty, which is\n"
    "            // what the existsSync guard made it.\n"
    "            const files = await listSplitFolder(dirPathFinishes);",
    "logCopy listing",
)
copy_start = log_copy.index("    fs.mkdir(dirPathFinishes, { recursive: true }, (err) => {")
copies = re.findall(
    r"fs\.copyFile\(\n\s*path\.join\((dirPathAttempts, `[^`]*`)\),\s*\n\s*path\.join\((dirPathFinishes, `[^`]*`)\), \(err\) => \{",
    log_copy[copy_start:],
)
assert len(copies) == 3, copies
log_copy = log_copy[:copy_start] + (
    "    await ensureSplitFolder(dirPathFinishes);\n"
    "    // Copy files using unique_run_identifier from attempts folder and nextFinishedRunCount for finishes folder\n"
    "    // Note: test runs are not copied to finishes folder\n"
    "    if (!testStatus) {\n"
    "        await Promise.all([\n"
    + "".join(f"            copySplitFile(\n                splitPath({a}),\n                splitPath({b})),\n" for a, b in copies)
    + "        ]);\n"
    "    }\n"
    "}\n"
)
load_csv = replace_once(load_csv, "async function loadCsvFile(", "export async function loadCsvFile(", "loadCsvFile export")

splits = (
    'import { appendSplitCsv, copySplitFile, ensureSplitFolder, listSplitFolder, splitPath } from "~/core/persistence/splitFiles";\n'
    "\n"
    "/**\n"
    " * gen3's `logData`, `logCopy` and `loadCsvFile` (the helpers above its component in\n"
    " * `scripts/frontend.js`), on the splits IPC instead of `require(\"fs\")` (plan 2.4 /\n"
    " * 1.6). Generated by tools/port/lift-gen3.py, so every header string, path segment\n"
    " * and file-name template is byte-for-byte gen3's -- including its own `logCopy`,\n"
    " * which numbers a finished run by listing `finishes/` and copies nothing for a\n"
    " * test run (known-legacy-bugs.md #21).\n"
    " *\n"
    " * The legacy file also created `splits/`, `splits/Emerald` and `splits/FireRed` when\n"
    " * it loaded (and `storage/`, for the dead Storage.json object, which is not\n"
    " * reproduced), which is done here.\n"
    " */\n"
    "for (const folder of ['', 'Emerald', 'FireRed']) {\n"
    "    void ensureSplitFolder(folder);\n"
    "}\n\n"
    + log_data + "\n" + log_copy + "\n"
    + "/** The file picker behind \"Load Splits\": the File System Access API is Chromium's, not Node's. */\n"
    + load_csv
)
assert "fs." not in splits and "path.join" not in splits and "./splits/" not in splits and "app.game" not in splits, "a fs/path/app use survived in splits.js"
(OUT / "splits.js").write_text(splits, encoding="utf-8")
print("splits.js:", splits.count("\n"), "lines")

# ---- 13. the method files: component code that port-data copied as data ------------------
# gen3's methods/*.js and autosplitter/autosplitter_functions.js are not tables: their
# functions are mixed into the component's `methods` (`hiddenPowerPowerCalc,` ...) and
# run with `this` bound to it, reading `this.mapper.properties` and the page's
# `MyStorage`, and assigning a few names they never declare (a classic script's
# globals; the same rule as the component's IMPLICIT_GLOBALS, per file because no
# other file reads them). tools/port/port-data.ts copies them verbatim with exports,
# as data; this pass gives them the seams the component got, in place. `s` in
# time_functions.js stays undeclared: `gameTimeHMS` reads it and nothing ever assigns
# it, a ReferenceError on both sides (known-legacy-bugs.md #37).
CODE_FILES = {
    "autosplitter/autosplitter_functions.js": dict(mapper=56, optional=1, game=0, imports=['import { MyStorage } from "../../storage";'], implicit=["battle_end", "d"]),
    "methods/attacking_functions.js": dict(mapper=9, optional=0, game=4, imports=[], implicit=[]),
    "methods/modifier_functions.js": dict(mapper=7, optional=0, game=0, imports=[], implicit=[]),
    "methods/move_power_functions.js": dict(mapper=14, optional=0, game=0, imports=[], implicit=["ivAtkBit", "ivDefBit", "ivHpBit", "ivSpcABit", "ivSpcDBit", "ivSpdBit", "type"]),
}
MARK = "// Component code, not data: lifted in place by tools/port/lift-gen3.py (step 13)."
for rel, spec in CODE_FILES.items():
    path = OUT / "data" / rel
    text = path.read_text(encoding="utf-8")
    if text.startswith(MARK):
        print(f"data/{rel}: already lifted")
        continue
    n = len(re.findall(r"this\.game\b", text))
    assert n == spec["game"], (rel, "this.game", n)
    text = re.sub(r"this\.game\b", "this.game_data", text)
    n, n2 = text.count("this.mapper."), text.count("this.mapper?.")
    assert (n, n2) == (spec["mapper"], spec["optional"]), (rel, n, n2)
    text = text.replace("this.mapper.", "this.game.").replace("this.mapper?.", "this.game?.")
    assert "this.mapper" not in text
    head = MARK + NL
    if spec["imports"]:
        head += NL.join(spec["imports"]) + NL
    if spec["implicit"]:
        head += implicit_globals_decl(spec["implicit"], "gen3")
    path.write_text(head + text, encoding="utf-8")
    print(f"data/{rel}: {n + n2} mapper refs -> game, {len(spec['implicit'])} implicit global(s)")
