import { BrowserWindow, ipcMain } from "electron";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import type { UiohookKeyboardEvent } from "uiohook-napi";
import { appRoot } from "./paths";
import type { ShortcutCatalog, ShortcutEdit } from "../shared/shortcuts";

/**
 * Keyboard shortcuts, through the `uiohook-napi` keyboard hook (an npm package, no helper
 * exe), and the Keyboard Shortcuts window (docs/shortcuts-menu-plan.md).
 *
 * They have to work while the emulator has focus, so an in-page `keydown` listener
 * cannot see them. Until 2026-10 the F13-F24 keys came from `keyhook.exe`, a
 * closed-source global hook spawned here (docs/hotkeys-without-keyhook-plan.md).
 *
 * The overlay decides what is bound: on mount it sends the accelerators of its
 * generation's actions (`hotkeys:set`), and main matches every key press against them
 * and sends each match back (`hotkeys:pressed`).
 *
 * The hook only watches, as keyhook.exe did: every key still reaches the focused
 * program, so F24 pauses the overlay's timer and the emulator at once. Electron's
 * `globalShortcut` (used for a day, 2026-10-13) took a bound key from every other program
 * instead, and the emulator stopped pausing.
 *
 * Accelerators match exactly: "F24" fires only with no modifier held, "Ctrl+Alt+K" only
 * with Ctrl and Alt (either side) and nothing else.
 */

/**
 * Holding a key makes the OS auto-repeat it, and the hook reports each repeat as another
 * key-down. A key-down of a key that is already down is a repeat and is ignored, so a held
 * key fires once, as it did with keyhook.exe. A key whose key-up the hook missed would then
 * never fire again, so a key counts as down only while repeats keep coming: Windows repeats
 * every 33 ms by default and about every 400 ms at its slowest, and a key-down after this
 * long a silence is a new press.
 */
const STALE_HELD_MS = 1000;

/** What the overlay asked for. */
let wanted = new Set<string>();
/** Bound accelerators the hook cannot report: it would not start, or no key makes them. */
let failed: string[] = [];
/** True while the window records a key: the key reaches the window and runs nothing. */
let suspended = false;
/** Keys down now: hook keycode -> time of its latest key-down or repeat. */
const held = new Map<number, number>();

let getOverlay: () => BrowserWindow | null = () => null;
let menuWindow: BrowserWindow | null = null;
let lastCatalog: ShortcutCatalog | null = null;

/**
 * The hook runs on Windows and Mac. On the Mac it needs the Accessibility permission: the
 * first start asks for it and fails, and the shortcuts work after a restart once it is
 * allowed. On Linux it would need X11, and nobody runs the overlay there; the bindings stay
 * inert, as they were without keyhook.exe.
 */
const supported = process.platform !== "linux";

type Hook = typeof import("uiohook-napi");
let hook: Hook | null = null;
/** null until something is first bound; then whether the hook started. */
let hookRunning: boolean | null = null;
let hookError = "";

/** Hook keycode (libuiohook's `VC_*`, the same on Windows and Mac) -> accelerator key name. */
let keyNames = new Map<number, string>();

function buildKeyNames(codes: Hook["UiohookKey"]): Map<number, string> {
    const k = codes as unknown as Record<string, number>;
    const names = new Map<number, string>();
    // The key names of core/shortcuts/accelerators.ts's CODE_TO_KEY.
    const named: Record<string, string> = {
        Space: "Space", Tab: "Tab", Backspace: "Backspace", Delete: "Delete", Insert: "Insert",
        Enter: "Enter", NumpadEnter: "Enter", Escape: "Esc",
        ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
        Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
        Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\",
        Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Backquote: "`",
        NumpadDecimal: "numdec", NumpadAdd: "numadd", NumpadSubtract: "numsub",
        NumpadMultiply: "nummult", NumpadDivide: "numdiv",
        PrintScreen: "PrintScreen", ScrollLock: "Scrolllock",
    };
    for (const [code, name] of Object.entries(named)) names.set(k[code], name);
    for (let i = 0; i < 26; i++) {
        const letter = String.fromCharCode(65 + i);
        names.set(k[letter], letter);
    }
    // Numpad digits with Num Lock on; with it off they are Home, End etc. and fire nothing,
    // as with `globalShortcut`.
    for (let i = 0; i <= 9; i++) {
        names.set(k[String(i)], String(i));
        names.set(k[`Numpad${i}`], `num${i}`);
    }
    for (let i = 1; i <= 24; i++) names.set(k[`F${i}`], `F${i}`);
    // Not in `UiohookKey`: libuiohook's VC_MEDIA_* and VC_VOLUME_* (uiohook.h).
    names.set(0xe022, "MediaPlayPause");
    names.set(0xe024, "MediaStop");
    names.set(0xe010, "MediaPreviousTrack");
    names.set(0xe019, "MediaNextTrack");
    names.set(0xe020, "VolumeMute");
    names.set(0xe030, "VolumeUp");
    names.set(0xe02e, "VolumeDown");
    return names;
}

/** The accelerator a key-down makes, in the canonical spelling (core/shortcuts/accelerators.ts). */
function acceleratorOf(event: UiohookKeyboardEvent): string | null {
    const key = keyNames.get(event.keycode);
    if (!key) return null;
    const modifiers: string[] = [];
    if (event.ctrlKey) modifiers.push("Ctrl");
    if (event.altKey) modifiers.push("Alt");
    if (event.shiftKey) modifiers.push("Shift");
    if (event.metaKey) modifiers.push("Super");
    return [...modifiers, key].join("+");
}

function onKeyDown(event: UiohookKeyboardEvent): void {
    const time = Date.now();
    const previous = held.get(event.keycode);
    held.set(event.keycode, time);
    if (previous !== undefined && time - previous < STALE_HELD_MS) return;
    if (suspended) return;
    const accelerator = acceleratorOf(event);
    if (!accelerator || !wanted.has(accelerator)) return;
    const window = getOverlay();
    if (!window || window.isDestroyed()) return;
    window.webContents.send("hotkeys:pressed", accelerator);
}

function onKeyUp(event: UiohookKeyboardEvent): void {
    held.delete(event.keycode);
}

/** Starts the hook the first time something is bound; it then runs until the overlay closes. */
function ensureHook(): void {
    if (hookRunning !== null || !supported) return;
    try {
        // Loaded here rather than imported, so a missing or broken native file costs the
        // shortcuts and not the whole app.
        hook = require("uiohook-napi") as Hook;
        keyNames = buildKeyNames(hook.UiohookKey);
        hook.uIOhook.on("keydown", onKeyDown);
        hook.uIOhook.on("keyup", onKeyUp);
        hook.uIOhook.start();
        hookRunning = true;
    } catch (error) {
        hookRunning = false;
        hookError = error instanceof Error ? error.message : String(error);
        hook?.uIOhook.removeAllListeners();
    }
}

function stopHook(): void {
    if (!hookRunning || !hook) return;
    try {
        hook.uIOhook.stop();
    } catch {
        // quitting anyway
    }
    hook.uIOhook.removeAllListeners();
    hookRunning = null;
    held.clear();
}

/** Some key press makes `accelerator`'s key ("Plus" is only ever typed into a file by hand). */
function reachable(accelerator: string): boolean {
    const key = accelerator.split("+").pop();
    for (const name of keyNames.values()) if (name === key) return true;
    return false;
}

function applyWanted(): void {
    if (!supported) return;
    if (wanted.size > 0) ensureHook();
    const before = failed.join(", ");
    if (hookRunning === false) failed = [...wanted];
    else failed = [...wanted].filter((a) => !reachable(a));
    if (failed.length === 0 || failed.join(", ") === before) return;
    if (hookRunning === false) {
        const mac = process.platform === "darwin"
            ? " Allow stp-overlay under System Settings > Privacy & Security > Accessibility, then restart it."
            : "";
        console.warn(`[hotkeys] the keyboard hook would not start (${hookError}); every shortcut is off.${mac}`);
    } else {
        console.warn(`[hotkeys] ${failed.join(", ")}: no key press makes these; those shortcuts are off.`);
    }
}

/** The catalog with main's own knowledge added, to the window if it is open. */
function forwardCatalog(): void {
    if (!menuWindow || menuWindow.isDestroyed() || !lastCatalog) return;
    menuWindow.webContents.send("shortcuts:catalog", { ...lastCatalog, failed });
}

export function openShortcutsMenu(): void {
    if (menuWindow && !menuWindow.isDestroyed()) {
        if (menuWindow.isMinimized()) menuWindow.restore();
        menuWindow.focus();
        return;
    }
    menuWindow = new BrowserWindow({
        width: 820,
        height: 900,
        minWidth: 560,
        minHeight: 400,
        title: "Keyboard Shortcuts",
        autoHideMenuBar: true,
        icon: join(appRoot(), "resources", "icons", "default.png"),
        webPreferences: {
            preload: join(__dirname, "../preload/index.js"),
            sandbox: false,
            contextIsolation: false,
            nodeIntegration: true,
        },
    });
    menuWindow.on("closed", () => {
        menuWindow = null;
        // A window closed mid-recording must not leave every shortcut off.
        suspended = false;
    });
    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
        menuWindow.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/shortcuts.html`);
    } else {
        menuWindow.loadFile(join(__dirname, "../renderer/shortcuts.html"));
    }
}

/**
 * The IPC between the overlay, main and the window. `getWindow` is the overlay window,
 * looked up per message because it is created after this runs.
 */
export function startHotkeys(getWindow: () => BrowserWindow | null): void {
    getOverlay = getWindow;

    // Overlay -> main: the accelerators to listen for (an empty list unbinds everything).
    ipcMain.on("hotkeys:set", (_event, accelerators: unknown) => {
        wanted = new Set(Array.isArray(accelerators) ? accelerators.filter((a): a is string => typeof a === "string") : []);
        applyWanted();
        forwardCatalog();
    });

    // Window -> main: recording a key. Pressing a bound key there records it and must not
    // also run its action.
    ipcMain.on("hotkeys:suspend", () => {
        suspended = true;
    });
    ipcMain.on("hotkeys:resume", () => {
        suspended = false;
    });

    // Overlay -> main -> window: what the active generation's actions are and how they are bound.
    ipcMain.on("shortcuts:catalog", (_event, catalog: ShortcutCatalog) => {
        lastCatalog = catalog;
        forwardCatalog();
    });
    ipcMain.handle("shortcuts:get-catalog", () => (lastCatalog ? { ...lastCatalog, failed } : null));

    // Window -> main -> overlay: an edit, or a request for a fresh catalog (availability
    // changes with the game and species, so the window asks whenever it gains focus).
    ipcMain.on("shortcuts:edit", (_event, edit: ShortcutEdit) => {
        const window = getOverlay();
        if (window && !window.isDestroyed()) window.webContents.send("shortcuts:edit", edit);
    });
    ipcMain.on("shortcuts:refresh", () => {
        const window = getOverlay();
        if (window && !window.isDestroyed()) window.webContents.send("shortcuts:refresh");
    });

    // Anyone -> main: open (or focus) the window.
    ipcMain.on("shortcuts:open-menu", () => openShortcutsMenu());
}

/**
 * The overlay page is about to be replaced (a reload): its bindings go with it, and the
 * new page sends its own once a generation mounts.
 */
export function clearHotkeysForReload(): void {
    wanted = new Set();
    lastCatalog = null;
    failed = [];
}

export function stopHotkeys(): void {
    stopHook();
    wanted = new Set();
    if (menuWindow && !menuWindow.isDestroyed()) menuWindow.close();
}
