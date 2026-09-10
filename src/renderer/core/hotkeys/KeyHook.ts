import { KeyNames, Keys } from "./keys";

/**
 * Key-state machine over the decoded `keyhook.exe` stream.
 *
 * The logic (`_processKey`, the modifier getters, `registerShortCut`) is gen1's,
 * unchanged, including the quirk in `registerShortCut` where the second
 * `shortCut = shortCut.map(...)` sits outside the `if` -- it runs for every input form,
 * which is what makes numeric and array shortcuts normalise their modifiers too.
 *
 * What is gone is the process handling: gen1 spawned `keyhook.exe` from the renderer
 * with `require("child_process")` and re-spawned it on every reload. The spawn now lives
 * in `src/main/keyhook.ts` and this class only consumes events (plan 1.1/1.6).
 */

export type KeyEventType = "down" | "up" | "repeat" | "unknown";

export interface HotkeyEvent {
  type: KeyEventType;
  keyCode: number;
  key: string;
  alt: boolean;
  ctrl: boolean;
  shift: boolean;
  time: number;
}

type Listener = (event: HotkeyEvent) => void;

export class KeyHook {
  private readonly listeners: Partial<Record<KeyEventType, Listener[]>> = {};
  private readonly keyState: boolean[] = new Array(256).fill(false);

  /** Feed one decoded event from `keyhook.exe`. */
  processKey(down: boolean, keyCode: number, time: number): void {
    const oldState = this.keyState[keyCode] === true;
    this.keyState[keyCode] = down;
    const key = KeyNames[keyCode];
    let type: KeyEventType = "unknown";

    if (oldState && down) type = "repeat";
    else if (down) type = "down";
    else type = "up";

    const listeners = this.listeners[type];
    if (!listeners) return;
    for (const listener of listeners) {
      listener({
        type,
        keyCode,
        key,
        alt: this.isAltDown,
        ctrl: this.isCtrlDown,
        shift: this.isShiftDown,
        time,
      });
    }
  }

  get isShiftDown(): boolean {
    return this.keyState[Keys.L_SHIFT] || this.keyState[Keys.R_SHIFT] || this.keyState[Keys.SHIFT];
  }
  get isCtrlDown(): boolean {
    return this.keyState[Keys.L_CTRL] || this.keyState[Keys.R_CTRL] || this.keyState[Keys.CTRL];
  }
  get isAltDown(): boolean {
    return this.keyState[Keys.L_ALT] || this.keyState[Keys.R_ALT] || this.keyState[Keys.ALT];
  }

  isKeyDown(key: string | number): boolean {
    const code = typeof key === "string" ? Keys[key.toUpperCase()] : key;
    return this.keyState[code];
  }

  on(event: KeyEventType, callback: Listener): void {
    (this.listeners[event] ??= []).push(callback);
  }

  /** Drops every registered listener; the component calls this when it unmounts. */
  clear(): void {
    for (const key of Object.keys(this.listeners) as KeyEventType[]) delete this.listeners[key];
  }

  registerShortCut(shortCut: string | number | number[], callback: () => void): void {
    let codes: number[];
    if (typeof shortCut === "number") codes = [shortCut];
    else if (typeof shortCut === "string") codes = shortCut.toUpperCase().split("+").map((x) => Keys[x.trim()]);
    else codes = shortCut;

    codes = codes.map((code) => {
      let x = code;
      if (x === Keys.L_SHIFT || x === Keys.R_SHIFT) x = Keys.SHIFT;
      if (x === Keys.L_CTRL || x === Keys.R_CTRL) x = Keys.CTRL;
      if (x === Keys.L_ALT || x === Keys.R_ALT) x = Keys.ALT;
      return x;
    });

    const checkAlt = codes.includes(Keys.ALT);
    const checkCtrl = codes.includes(Keys.CTRL);
    const checkShift = codes.includes(Keys.SHIFT);
    const checkKeys = codes.filter((x) => x !== Keys.ALT && x !== Keys.CTRL && x !== Keys.SHIFT);

    if (checkKeys.some((x) => typeof x !== "number")) throw new Error("Invalid key code");

    this.on("down", (data) => {
      if (
        checkAlt === data.alt &&
        checkCtrl === data.ctrl &&
        checkShift === data.shift &&
        checkKeys.every((x) => this.isKeyDown(x))
      ) {
        callback();
      }
    });
  }
}

/** A generation's hotkey table: F-key name -> what it does (plan: `GameModule.hotkeys`). */
export type HotkeyTable = Record<string, () => void>;

/**
 * Binds a hotkey table to the main-process key stream. Returns an unsubscribe function.
 *
 * On Linux there is no `keyhook.exe`, so no events ever arrive and every binding is
 * simply inert -- the same outcome gen1 got from its `process.platform` guard.
 */
export function bindHotkeys(table: HotkeyTable): () => void {
  const hook = new KeyHook();
  for (const [shortCut, action] of Object.entries(table)) {
    hook.registerShortCut(shortCut, action);
  }
  const unsubscribe = window.api?.onKeyEvent?.((key) => hook.processKey(key.down, key.keyCode, key.time));
  return () => {
    unsubscribe?.();
    hook.clear();
  };
}
