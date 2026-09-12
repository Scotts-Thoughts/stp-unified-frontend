import { createHash } from "crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { app, ipcMain, nativeImage, shell, type BrowserWindow } from "electron";
import { appRoot, rendererSourceRoot, resolveInside, splitsRoot, storageRoot, userDataRoot } from "./paths";

/**
 * Everything the renderer used to do with `require("fs")`, `require("path")`,
 * `require("crypto")` and `require("child_process")` (plan 1.6).
 *
 * The renderer still runs with `nodeIntegration: true` today, so these handlers are an
 * addition rather than a lock-down; the point is that every file-writing path goes
 * through one audited place, resolved against `appRoot()` instead of `process.cwd()`,
 * and refuses to escape its root.
 */
export function registerIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle("settings_dir", () => app.getPath("userData"));
  ipcMain.handle("app_root", () => appRoot());
  ipcMain.handle("is_packaged", () => app.isPackaged);

  // --- splits: the autosplitter's CSVs -----------------------------------------
  ipcMain.handle("splits:write", (_e, relative: string, contents: string, append = false) => {
    const target = resolveInside(splitsRoot(), relative);
    mkdirSync(dirname(target), { recursive: true });
    if (append && existsSync(target)) writeFileSync(target, contents, { flag: "a" });
    else writeFileSync(target, contents);
    return target;
  });
  ipcMain.handle("splits:read", (_e, relative: string) => {
    const target = resolveInside(splitsRoot(), relative);
    return existsSync(target) ? readFileSync(target, "utf-8") : null;
  });
  ipcMain.handle("splits:exists", (_e, relative: string) => existsSync(resolveInside(splitsRoot(), relative)));
  ipcMain.handle("splits:list", (_e, relative: string) => {
    const target = resolveInside(splitsRoot(), relative);
    if (!existsSync(target)) return [];
    return readdirSync(target, { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      directory: entry.isDirectory(),
    }));
  });
  ipcMain.handle("splits:copy", (_e, from: string, to: string) => {
    const source = resolveInside(splitsRoot(), from);
    const target = resolveInside(splitsRoot(), to);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    return target;
  });
  ipcMain.handle("splits:mkdir", (_e, relative: string) => {
    const target = resolveInside(splitsRoot(), relative);
    mkdirSync(target, { recursive: true });
    return target;
  });
  // --- window icon (plan 3.4, brought forward for gen4's lift) --------------------
  // gen3/4/5 swap the taskbar icon with the selected game (`set-game-icon`). The
  // renderer names a file under resources/icons/ -- `gen4/icon-platinum.ico` -- and
  // the module owns the game -> file mapping; an unknown file leaves the icon alone,
  // as the legacy `isEmpty()` check did.
  ipcMain.on("set-game-icon", (_e, relative: string) => {
    const window = getWindow();
    if (!window || typeof relative !== "string") return;
    const target = resolveInside(join(appRoot(), "resources", "icons"), relative);
    if (!existsSync(target)) return;
    const image = nativeImage.createFromPath(target);
    if (!image.isEmpty()) window.setIcon(image);
  });

  // --- gen5's second-screen key sender (decision 9) --------------------------------
  // node-key-sender calls a Java helper; the legacy renderer required it directly and
  // logged the failure when Java was missing. Same here, from the main process.
  ipcMain.on("send-virtual-key", (_e, keyName: string | number) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const keySender = require("node-key-sender") as { sendKey(key: string | number): unknown };
      keySender.sendKey(keyName);
      console.log(`Virtual key sent: ${keyName}`);
    } catch (error) {
      console.error(`Failed to send virtual key ${keyName}:`, error);
    }
  });

  /** The "open splits folder" button; creates the folder first, as the legacy code did. */
  ipcMain.handle("splits:reveal", async (_e, relative: string) => {
    const target = resolveInside(splitsRoot(), relative);
    mkdirSync(target, { recursive: true });
    await shell.openPath(target);
    return target;
  });

  // --- user data: %APPDATA%/<app>/data/** --------------------------------------
  ipcMain.handle("data:read", (_e, relative: string) => {
    const target = resolveInside(userDataRoot(), relative);
    return existsSync(target) ? readFileSync(target, "utf-8") : null;
  });
  ipcMain.handle("data:write", (_e, relative: string, contents: string) => {
    const target = resolveInside(userDataRoot(), relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
    return target;
  });
  ipcMain.handle("data:list", (_e, relative: string) => {
    const target = resolveInside(userDataRoot(), relative);
    if (!existsSync(target)) return [];
    return readdirSync(target, { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      directory: entry.isDirectory(),
    }));
  });

  // --- shipped defaults: <appRoot>/storage/** ----------------------------------
  ipcMain.handle("storage:read", (_e, relative: string) => {
    const target = resolveInside(storageRoot(), relative);
    return existsSync(target) ? readFileSync(target, "utf-8") : null;
  });
  /** Dev mode only: style edits are written back into the repo so they land in git. */
  ipcMain.handle("storage:write", (_e, relative: string, contents: string) => {
    if (app.isPackaged) throw new Error("storage/ is read-only in a packaged build; write to userData instead");
    const target = resolveInside(storageRoot(), relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
    return target;
  });

  // --- renderer source tree: <appRoot>/src/renderer/** -------------------------
  /**
   * Dev mode only: the enemy-sprite resize tool rewrites the JSON it was loaded from so
   * the new scale lands in git, exactly as gen1 does today with `require("fs")` and
   * `process.cwd()` (plan 1.6). A packaged build has no source tree to write to and the
   * caller falls back to a user-data override instead.
   */
  ipcMain.handle("source:write", (_e, relative: string, contents: string) => {
    if (app.isPackaged) throw new Error("the renderer source tree is not writable in a packaged build");
    const target = resolveInside(rendererSourceRoot(), relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
    return target;
  });

  // --- OBS WebSocket 5 authentication ------------------------------------------
  // gen1's logic/obs.ts does this with `require("crypto")` in the renderer.
  ipcMain.handle("obs:auth", (_e, password: string, salt: string, challenge: string) => {
    const secret = createHash("sha256").update(password + salt, "utf8").digest("base64");
    return createHash("sha256").update(secret + challenge, "utf8").digest("base64");
  });
}
