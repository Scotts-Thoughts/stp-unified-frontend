/**
 * Electron accelerator strings ("Ctrl+Shift+F5"): the one spelling the menu records,
 * the engine compares and main registers (src/main/hotkeys.ts).
 *
 * Canonical form: modifiers in the order Ctrl, Alt, Shift, Super, then one key, in the
 * spelling of `KEYS` below. `normalizeAccelerator` turns any accepted spelling into it,
 * so a stored binding and a default compare equal however they were written.
 */

const MODIFIERS = ["Ctrl", "Alt", "Shift", "Super"] as const;
type Modifier = (typeof MODIFIERS)[number];

const MODIFIER_ALIASES: Record<string, Modifier> = {
    ctrl: "Ctrl",
    control: "Ctrl",
    commandorcontrol: "Ctrl",
    cmdorctrl: "Ctrl",
    alt: "Alt",
    option: "Alt",
    shift: "Shift",
    super: "Super",
    meta: "Super",
    command: "Super",
    cmd: "Super",
};

/** `KeyboardEvent.code` -> the accelerator's key name. Anything not here cannot be bound. */
const CODE_TO_KEY: Record<string, string> = {
    Space: "Space",
    Tab: "Tab",
    Backspace: "Backspace",
    Delete: "Delete",
    Insert: "Insert",
    Enter: "Enter",
    NumpadEnter: "Enter",
    Escape: "Esc",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Backquote: "`",
    NumpadDecimal: "numdec",
    NumpadAdd: "numadd",
    NumpadSubtract: "numsub",
    NumpadMultiply: "nummult",
    NumpadDivide: "numdiv",
    AudioVolumeUp: "VolumeUp",
    AudioVolumeDown: "VolumeDown",
    AudioVolumeMute: "VolumeMute",
    MediaTrackNext: "MediaNextTrack",
    MediaTrackPrevious: "MediaPreviousTrack",
    MediaStop: "MediaStop",
    MediaPlayPause: "MediaPlayPause",
    PrintScreen: "PrintScreen",
    ScrollLock: "Scrolllock",
};
for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i);
    CODE_TO_KEY[`Key${letter}`] = letter;
}
for (let i = 0; i <= 9; i++) {
    CODE_TO_KEY[`Digit${i}`] = String(i);
    CODE_TO_KEY[`Numpad${i}`] = `num${i}`;
}
for (let i = 1; i <= 24; i++) CODE_TO_KEY[`F${i}`] = `F${i}`;

/** Every key name an accelerator may end in, by lower case. */
const KEYS = new Map<string, string>();
for (const key of Object.values(CODE_TO_KEY)) KEYS.set(key.toLowerCase(), key);
KEYS.set("return", "Enter");
KEYS.set("escape", "Esc");
KEYS.set("plus", "Plus");

/** Keys you type with. Bound with no modifier (or only Shift) they would fire every time you type them, in any program. */
const TYPING_KEYS = new Set<string>([
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split(""),
    "-", "=", "[", "]", "\\", ";", "'", ",", ".", "/", "`", "Plus",
    "Space", "Tab", "Backspace", "Delete", "Insert", "Enter", "Esc",
    "Up", "Down", "Left", "Right", "Home", "End", "PageUp", "PageDown",
]);

/** The canonical spelling, or null when it is not an accelerator this app can bind. */
export function normalizeAccelerator(accelerator: string | null | undefined): string | null {
    if (!accelerator) return null;
    const parts = accelerator.split("+").map((p) => p.trim());
    if (parts.some((p) => p === "")) return null;
    const key = KEYS.get(parts[parts.length - 1].toLowerCase());
    if (!key) return null;
    const modifiers = new Set<Modifier>();
    for (const part of parts.slice(0, -1)) {
        const modifier = MODIFIER_ALIASES[part.toLowerCase()];
        if (!modifier) return null;
        modifiers.add(modifier);
    }
    return [...MODIFIERS.filter((m) => modifiers.has(m)), key].join("+");
}

/**
 * The accelerator a keydown makes, or null while only modifiers are held (keep
 * recording) or the key is one this app cannot bind.
 */
export function acceleratorFromEvent(event: Pick<KeyboardEvent, "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">): string | null {
    const key = CODE_TO_KEY[event.code];
    if (!key) return null;
    const modifiers: Modifier[] = [];
    if (event.ctrlKey) modifiers.push("Ctrl");
    if (event.altKey) modifiers.push("Alt");
    if (event.shiftKey) modifiers.push("Shift");
    if (event.metaKey) modifiers.push("Super");
    return [...modifiers, key].join("+");
}

/**
 * Why `accelerator` may not be bound, or null when it may. A shortcut fires whatever program
 * has focus, so a typing key needs Ctrl, Alt or the Windows key with it.
 */
export function refusalReason(accelerator: string): string | null {
    const normalized = normalizeAccelerator(accelerator);
    if (!normalized) return "That key can't be used as a shortcut.";
    const parts = normalized.split("+");
    const key = parts[parts.length - 1];
    const modifiers = parts.slice(0, -1);
    const strong = modifiers.some((m) => m === "Ctrl" || m === "Alt" || m === "Super");
    if (!strong && TYPING_KEYS.has(key)) {
        return `${displayAccelerator(normalized)} would fire every time you type it, in any program. Add Ctrl or Alt, or use an F-key or a numpad key.`;
    }
    return null;
}

const IS_MAC = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);

const DISPLAY_NAMES: Record<string, string> = {
    Super: IS_MAC ? "Cmd" : "Win",
    Alt: IS_MAC ? "Option" : "Alt",
    numdec: "Num .",
    numadd: "Num +",
    numsub: "Num -",
    nummult: "Num *",
    numdiv: "Num /",
    Scrolllock: "Scroll Lock",
    PrintScreen: "Print Screen",
    MediaPlayPause: "Play/Pause",
    MediaNextTrack: "Next Track",
    MediaPreviousTrack: "Previous Track",
    MediaStop: "Stop",
    VolumeUp: "Volume Up",
    VolumeDown: "Volume Down",
    VolumeMute: "Mute",
    Plus: "+",
};

/** "Ctrl+Shift+F5" as the menu shows it ("Num 5", "Win" / "Cmd"). */
export function displayAccelerator(accelerator: string): string {
    return accelerator
        .split("+")
        .map((part) => DISPLAY_NAMES[part] ?? (/^num\d$/.test(part) ? `Num ${part.slice(3)}` : part))
        .join(" + ");
}
