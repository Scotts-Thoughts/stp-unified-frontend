import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { ClipboardItem, clipboard, ipcMain, type BrowserWindow } from "electron";
import { appRoot } from "./paths";

/**
 * The game screenshot's back end (core/screenshot/screenshot.ts does the drawing).
 *
 *   screenshot:capture   the window's picture now, as a PNG data URL
 *   screenshot:save      PNG bytes + the game's name -> `<appRoot>/screenshots/<YYYY-MM-DD HH.MM.SS> <game>.png`,
 *                        also put on the clipboard; returns the path
 */

function stamp(when: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}.${pad(when.getMinutes())}.${pad(when.getSeconds())}`;
}

/** A game name made safe for a file name on Windows and macOS ("Gold & Silver" stays). */
function fileGame(game: unknown): string {
    if (typeof game !== "string") return "";
    return game
        .replace(/^Pok[eé]mon\s+/i, "") // the shell calls FireRed "Pokemon FireRed and LeafGreen"
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[. ]+$/, "")
        .slice(0, 60)
        .trim();
}

function freeName(folder: string, base: string): string {
    let candidate = join(folder, `${base}.png`);
    for (let n = 2; existsSync(candidate); n++) candidate = join(folder, `${base} (${n}).png`);
    return candidate;
}

export function registerScreenshotIpc(getWindow: () => BrowserWindow | null): void {
    ipcMain.handle("screenshot:capture", async () => {
        const window = getWindow();
        if (!window || window.isDestroyed()) throw new Error("No overlay window to capture");
        const image = await window.webContents.capturePage();
        return `data:image/png;base64,${image.toPNG().toString("base64")}`;
    });

    ipcMain.handle("screenshot:save", async (_e, png: Uint8Array, game: unknown) => {
        const data = Buffer.from(png);
        if (data.length < 8 || data.readUInt32BE(0) !== 0x89504e47) throw new Error("Not a PNG");
        const folder = join(appRoot(), "screenshots");
        mkdirSync(folder, { recursive: true });
        const name = fileGame(game);
        const file = freeName(folder, name ? `${stamp(new Date())} ${name}` : stamp(new Date()));
        writeFileSync(file, data);
        try {
            // Electron 45's clipboard is the async W3C-style one (no writeImage).
            await clipboard.write([new ClipboardItem({ "image/png": new Blob([data], { type: "image/png" }) })]);
        } catch (error) {
            console.warn("[screenshot] could not copy to the clipboard:", error);
        }
        return file;
    });
}
