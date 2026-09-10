import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import type { BrowserWindow } from "electron";
import { appRoot } from "./paths";

/**
 * `keyhook.exe` is a small Windows global-keyboard hook that prints one line per key
 * event: `<down>,<virtual key code>,<time>`. The overlays use it for the F13-F24
 * hotkeys, which have to work while the emulator has focus -- an in-page `keydown`
 * listener never sees them.
 *
 * gen1 spawns it from the renderer (`components/keyhook.js`), so it restarts on every
 * reload and the child dies with the page. Plan 1.1/1.6 move the spawn here: one
 * process for the life of the app, and the renderer only receives decoded events.
 *
 * The binary is Windows-only and absent on Linux; when it is missing the overlay runs
 * with hotkeys disabled and says so once (known-legacy-bugs.md #23).
 */

export interface KeyEvent {
  down: boolean;
  keyCode: number;
  /** The `time` field keyhook.exe reports, passed through untouched. */
  time: number;
}

let child: ChildProcessWithoutNullStreams | null = null;

/** Where the exe can be: repo/exe folder first, then a packaged build's resources. */
function locateExecutable(): string | null {
  const candidates = [
    join(appRoot(), "keyhook.exe"),
    join(appRoot(), "resources", "keyhook.exe"),
    process.resourcesPath ? join(process.resourcesPath, "keyhook.exe") : null,
  ].filter((candidate): candidate is string => candidate !== null);
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate)) return candidate;
    } catch {
      // unreadable path; try the next one
    }
  }
  return null;
}

export function startKeyhook(getWindow: () => BrowserWindow | null): void {
  if (child) return;
  if (process.platform === "linux") return;

  const exePath = locateExecutable();
  if (!exePath) {
    console.warn(
      "[keyhook] keyhook.exe was not found next to the application, keyboard shortcuts (F13-F24) are disabled.",
    );
    return;
  }

  child = spawn(exePath);
  child.on("error", (err) => {
    console.error(`[keyhook] Could not start ${exePath}: ${err.message}. Keyboard shortcuts (F13-F24) are disabled.`);
    child = null;
  });
  child.on("exit", () => {
    child = null;
  });
  child.stderr.on("data", (data: Buffer) => console.error(`${data}`));
  child.stdout.on("data", (data: Buffer) => {
    const window = getWindow();
    if (!window || window.isDestroyed()) return;
    for (const line of data.toString().split(/[\n\r]+/)) {
      const parts = line.split(",").map((x) => parseInt(x, 10));
      if (parts.length !== 3 || parts.some(Number.isNaN)) continue;
      const [down, keyCode, time] = parts;
      window.webContents.send("keyhook:key", { down: down === 1, keyCode, time } satisfies KeyEvent);
    }
  });
}

export function stopKeyhook(): void {
  child?.kill();
  child = null;
}
