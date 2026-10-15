/**
 * Self-test for the keyboard-shortcut engine (2026-10-14, `core/shortcuts/`,
 * docs/shortcuts-menu-plan.md): accelerator spelling, the bare-key guard, the action
 * builders, and the engine's binding, dispatch, edits and persistence against a fake
 * `window.api`.
 *
 *   npm run parity:shortcuts
 */

let failures = 0;
function check(label: string, actual: unknown, expected: unknown): void {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    const ok = a === e;
    if (!ok) failures++;
    console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${a}${ok ? "" : ` (expected ${e})`}`);
}

// --- a fake window.api, installed before the engine (and userState) load -------------
const registered: string[][] = [];
const catalogs: any[] = [];
const writes: string[] = [];
const handlers: { pressed?: (a: string) => void; edit?: (e: any) => void; refresh?: () => void } = {};
let stored: Record<string, unknown> = { format: 2, gen1: { shortcuts: { "a.two": "Ctrl+Alt+K", "a.legacy": null, "a.bogus": "Shift+Q+Z" } } };

(globalThis as any).window = {
    api: {
        data: {
            read: async () => JSON.stringify(stored),
            write: async (_file: string, contents: string) => {
                writes.push(contents);
                stored = JSON.parse(contents);
                return "";
            },
        },
        shortcuts: {
            register: (list: string[]) => registered.push(list),
            publishCatalog: (catalog: any) => catalogs.push(catalog),
            onPressed: (h: any) => ((handlers.pressed = h), () => {}),
            onEdit: (h: any) => ((handlers.edit = h), () => {}),
            onRefresh: (h: any) => ((handlers.refresh = h), () => {}),
            openMenu: () => {},
        },
    },
};

const { normalizeAccelerator, acceleratorFromEvent, refusalReason, displayAccelerator } = await import(
    "../../src/renderer/core/shortcuts/accelerators.ts"
);
const { choice, cycle, press, toggle, slug } = await import("../../src/renderer/core/shortcuts/build.ts");
const { bindShortcuts } = await import("../../src/renderer/core/shortcuts/engine.ts");
const { flushUserState } = await import("../../src/renderer/core/persistence/userState.ts");

// --- accelerators ---------------------------------------------------------------------
check("normalize order", normalizeAccelerator("shift+control+f5"), "Ctrl+Shift+F5");
check("normalize aliases", normalizeAccelerator("CmdOrCtrl+Option+a"), "Ctrl+Alt+A");
check("normalize numpad", normalizeAccelerator("Num5"), "num5");
check("normalize unknown key", normalizeAccelerator("Ctrl+Banana"), null);
check("normalize two keys", normalizeAccelerator("Shift+Q+Z"), null);
check("normalize empty", normalizeAccelerator(""), null);
check("from event", acceleratorFromEvent({ code: "KeyR", ctrlKey: true, altKey: false, shiftKey: true, metaKey: false }), "Ctrl+Shift+R");
check("from event F13", acceleratorFromEvent({ code: "F13", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }), "F13");
check("from event modifier only", acceleratorFromEvent({ code: "ControlLeft", ctrlKey: true, altKey: false, shiftKey: false, metaKey: false }), null);
check("from event numpad", acceleratorFromEvent({ code: "Numpad7", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }), "num7");
check("refuse bare letter", refusalReason("R") !== null, true);
check("refuse shift+letter", refusalReason("Shift+R") !== null, true);
check("refuse bare space", refusalReason("Space") !== null, true);
check("allow ctrl+letter", refusalReason("Ctrl+R"), null);
check("allow bare F-key", refusalReason("F13"), null);
check("allow bare numpad", refusalReason("num5"), null);
check("allow shift+F-key", refusalReason("Shift+F5"), null);
check("display", displayAccelerator("Ctrl+num5"), "Ctrl + Num 5");

// --- builders -------------------------------------------------------------------------
check("slug", slug("Followup + Summary"), "followup_plus_summary");
let mode = "B";
const modes = choice("m", "Mode", "G", ["A", "B", "C"], () => mode, (v) => (mode = v));
check("choice ids", modes.map((a) => a.id), ["m.set.a", "m.set.b", "m.set.c", "m.next", "m.previous"]);
modes[3].run();
check("choice next", mode, "C");
modes[3].run();
check("choice next wraps", mode, "A");
modes[4].run();
check("choice previous wraps", mode, "C");
modes[0].run();
check("choice set", mode, "A");
let texture = "nope";
const textures = cycle("t", "Texture", "G", () => ["x", "y"], () => texture, (v) => (texture = v));
textures[0].run();
check("cycle from unknown value", texture, "x");
let flag = false;
toggle("f", "Flag", "G", () => flag, (v) => (flag = v)).run();
check("toggle", flag, true);
check("toggle label", toggle("f", "Flag", "G", () => flag, () => {}).label, "Toggle: Flag");

// --- engine ---------------------------------------------------------------------------
const ran: string[] = [];
let blocked = false;
const actions = [
    press("a.legacy", "Legacy", "G", () => ran.push("legacy"), { defaultShortcut: "F13" }),
    press("a.one", "One", "G", () => ran.push("one"), { defaultShortcut: "F14" }),
    press("a.two", "Two", "G", () => ran.push("two")),
    press("a.three", "Three", "G", () => ran.push("three"), { available: () => !blocked }),
    press("a.bogus", "Bogus", "G", () => ran.push("bogus")),
];
const settle = () => new Promise((r) => setTimeout(r, 0));
const unbind = bindShortcuts({ actions, namespace: "gen1", title: "Generation 1", gameLoaded: true });
await settle();
const last = () => catalogs[catalogs.length - 1];
const bindingOf = (id: string) => last().rows.find((r: any) => r.id === id)?.binding ?? null;

check("registered: stored + defaults, cleared default dropped, bad stored value ignored", registered.at(-1), ["F14", "Ctrl+Alt+K"]);
check("open-menu action appended", last().rows.at(-1).id, "app.open_shortcuts_menu");
check("no write on bind", writes.length, 0);

handlers.pressed!("F14");
handlers.pressed!("Ctrl+Alt+K");
handlers.pressed!("F13");
check("presses dispatch", ran, ["one", "two"]);

handlers.edit!({ type: "set", id: "a.three", accelerator: "F14" });
await settle();
check("set onto a held key without steal is refused", bindingOf("a.three"), null);

handlers.edit!({ type: "set", id: "a.three", accelerator: "F14", steal: true });
await settle();
check("steal moves the key", [bindingOf("a.three"), bindingOf("a.one")], ["F14", null]);

blocked = true;
handlers.pressed!("F14");
check("unavailable action ignored", ran.length, 2);
handlers.refresh!();
check("catalog marks unavailable", last().rows.find((r: any) => r.id === "a.three").available, false);
blocked = false;

handlers.edit!({ type: "set", id: "a.two", accelerator: "R" });
await settle();
check("bare letter refused by the engine too", bindingOf("a.two"), "Ctrl+Alt+K");

handlers.edit!({ type: "reset", id: "a.one" });
await settle();
check("reset takes the default back", [bindingOf("a.one"), bindingOf("a.three")], ["F14", null]);

handlers.edit!({ type: "clear", id: "a.one" });
await settle();
check("clear", bindingOf("a.one"), null);

await flushUserState();
// a.three lost F14 back to its default, which is no key: nothing to store for it.
check("persisted only the changes", (stored as any).gen1.shortcuts, { "a.two": "Ctrl+Alt+K", "a.legacy": null, "a.one": null });

handlers.edit!({ type: "reset-all" });
await settle();
await flushUserState();
check("reset-all drops the key", (stored as any).gen1.shortcuts, undefined);
check("reset-all registers the defaults", registered.at(-1), ["F13", "F14"]);

unbind();
check("unbind clears the registration", registered.at(-1), []);
handlers.pressed!("F13");
check("no dispatch after unbind", ran.length, 2);

console.log(failures === 0 ? "\nall shortcut checks passed" : `\n${failures} shortcut check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
