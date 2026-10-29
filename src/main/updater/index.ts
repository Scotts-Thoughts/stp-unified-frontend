import { is } from "@electron-toolkit/utils";
import { app, BrowserWindow, dialog, ipcMain, shell, type MessageBoxOptions } from "electron";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { UpdateJob, UpdatePrefs, UpdatePrefsChange, UpdateState } from "../../shared/updates";
import { appRoot } from "../paths";
import applyScript from "./apply.ps1?raw";
import { planDownload, readPreviousManifest, resetStagingFor, runDownload, sizeOf } from "./download";
import {
    compareVersions,
    filesToStage,
    formatOps,
    IMAGE_COPIES,
    INSTALL_MANIFEST,
    parseCopyGroups,
    parseManifest,
    planSwap,
    PREVIOUS,
    ROLLBACK_OPS,
    ROLLBACK_OPS_NEXT,
    STAGING,
    UPDATES,
    type Manifest,
} from "./plan";
import { fetchManifest, listReleases, type Release } from "./releases";

/**
 * The updater (docs/updates.md): checks GitHub for a newer release when the app starts,
 * downloads only the files that changed, and installs them with apply.ps1 while the app
 * is closed; keeps the replaced files for one local rollback; and lets the Updates window
 * (core/updates/UpdatesWindow.vue) install any release on GitHub.
 *
 * Only a packaged Windows build updates itself; everything else gets the window with the
 * reason it is off. Everything is in the install folder (the exe's folder) under updates/,
 * beside the user's splits/ and reports/, which the updater never touches.
 */

const STARTUP_CHECK_DELAY = 5000;
const ROLLBACK_CMD = "Roll back to previous version.cmd";

let getOverlay: () => BrowserWindow | null = () => null;
let updatesWindow: BrowserWindow | null = null;
let releases: Release[] = [];
let abort: AbortController | null = null;
let ready: { release: Release; target: Manifest } | null = null;
let failedResult: string | null = null;

const state: UpdateState = {
    enabled: false,
    disabledReason: null,
    current: app.getVersion(),
    previous: null,
    available: null,
    quiet: false,
    prefs: { silenced: false, skipped: null, remindAfter: null },
    checking: false,
    lastChecked: null,
    releases: [],
    job: null,
    error: null,
    justInstalled: null,
};

/** The install folder: where the exe is, which holds resources/, storage/ and updates/. */
function installRoot(): string {
    return dirname(app.getPath("exe"));
}

const inRoot = (relative: string) => join(installRoot(), ...relative.split("/"));

function disabledReason(): string | null {
    if (!app.isPackaged) return "Updates only work in the installed app, not when it runs from the source code.";
    if (process.platform !== "win32") return "Updates only work on Windows.";
    if (process.env.STP_APP_ROOT) return "Updates are off while the test harness runs the app.";
    if (process.env.STP_UPDATES === "off") return "Updates are turned off (STP_UPDATES=off).";
    if (!existsSync(inRoot(INSTALL_MANIFEST))) return "This copy has no install manifest (it was built before updates existed). Download the newest version once from GitHub; it will update itself after that.";
    return null;
}

function readCurrent(): Manifest {
    return parseManifest(readFileSync(inRoot(INSTALL_MANIFEST), "utf-8"));
}

function readText(path: string): string | null {
    try {
        return readFileSync(path, "utf-8");
    } catch {
        return null;
    }
}

// ---- settings: whether, and about which version, the user wants to be asked --------------

const settingsFile = () => join(app.getPath("userData"), "updates.json");

function readSettings(): UpdatePrefs {
    let saved: Partial<UpdatePrefs> = {};
    try {
        saved = JSON.parse(readFileSync(settingsFile(), "utf-8")) ?? {};
    } catch {
        // none yet, or unreadable: the defaults
    }
    return {
        silenced: saved.silenced === true,
        skipped: typeof saved.skipped === "string" ? saved.skipped : null,
        remindAfter: typeof saved.remindAfter === "string" ? saved.remindAfter : null,
    };
}

function writeSettings(change: Partial<UpdatePrefs>): void {
    const settings = { ...readSettings(), ...change };
    try {
        writeFileSync(settingsFile(), JSON.stringify(settings));
    } catch (err) {
        console.error("[updates] could not save updates.json:", err);
    }
    refreshQuiet(settings);
}

/** The next local midnight: "Remind me tomorrow" asks again on the first launch of the next day. */
function nextMidnight(): string {
    const date = new Date();
    date.setHours(24, 0, 0, 0);
    return date.toISOString();
}

/** Whether the user asked not to be told about `version` now. */
function isQuiet(version: string, settings: UpdatePrefs): boolean {
    if (settings.silenced) return true;
    if (settings.skipped && compareVersions(version, settings.skipped) <= 0) return true;
    return !!settings.remindAfter && Date.now() < Date.parse(settings.remindAfter);
}

function refreshQuiet(settings = readSettings()): void {
    state.prefs = settings;
    state.quiet = !!state.available && isQuiet(state.available, settings);
}

// ---- state --------------------------------------------------------------------------------

let lastBroadcast = 0;

function broadcast(throttle = false): void {
    const now = Date.now();
    if (throttle && now - lastBroadcast < 250) return;
    lastBroadcast = now;
    for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send("updates:state", state);
    }
}

function setJob(job: UpdateJob | null): void {
    state.job = job;
    const overlay = getOverlay();
    if (overlay && !overlay.isDestroyed()) {
        overlay.setProgressBar(job?.kind === "downloading" && job.total > 0 ? job.received / job.total : job?.kind === "preparing" ? 2 : -1);
    }
    broadcast();
}

function messageOf(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

function formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 2 ** 20).toFixed(bytes < 10 * 2 ** 20 ? 1 : 0)} MB`;
    return `${(bytes / 2 ** 30).toFixed(2)} GB`;
}

async function showBox(options: MessageBoxOptions): Promise<number> {
    const parent = updatesWindow && !updatesWindow.isDestroyed() && updatesWindow.isFocused() ? updatesWindow : getOverlay();
    const result = parent && !parent.isDestroyed() ? await dialog.showMessageBox(parent, { noLink: true, ...options }) : await dialog.showMessageBox({ noLink: true, ...options });
    return result.response;
}

// ---- start-up housekeeping ----------------------------------------------------------------

/** apply.ps1's report on the last swap, read once. */
function readLastResult(): void {
    const file = inRoot(`${UPDATES}/last-result.json`);
    const text = readText(file);
    if (text === null) return;
    rmSync(file, { force: true });
    try {
        const result = JSON.parse(text.replace(/^﻿/, ""));
        if (result.ok && result.committed) state.justInstalled = state.current;
        else if (!result.ok) failedResult = String(result.error ?? "unknown error");
    } catch {
        // unreadable: nothing to report
    }
}

/** The script and the .cmd that runs it without the app, written fresh on every launch. */
function writeHelperFiles(): void {
    mkdirSync(inRoot(UPDATES), { recursive: true });
    writeFileSync(inRoot(`${UPDATES}/apply.ps1`), applyScript.replace(/\r?\n/g, "\r\n"));
    writeFileSync(
        inRoot(`${UPDATES}/${ROLLBACK_CMD}`),
        [
            "@echo off",
            "rem Written by stp-overlay's updater (src/main/updater/index.ts). Puts back the version",
            "rem you had before the last update, for when the new one does not even start.",
            'if not exist "%~dp0rollback-ops.txt" (',
            "    echo There is no previous version to roll back to.",
            "    pause",
            "    exit /b 1",
            ")",
            "echo This puts back the version of stp-overlay you had before the last update.",
            "echo Close stp-overlay first. It opens again when the rollback is done.",
            "pause",
            'powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0apply.ps1" -AppRoot "%~dp0.." -Ops "%~dp0rollback-ops.txt"',
            "",
        ].join("\r\n"),
    );
}

/** Arguments the restarted app gets again: the memory tool override and a test's user-data folder. */
function launchLine(): string[] {
    return [app.getPath("exe"), ...process.argv.slice(1).filter((a) => a.startsWith("--tool-url=") || a.startsWith("--user-data-dir="))];
}

/** Files of the previous version are all in updates/previous/ (sizes checked, not hashes). */
function previousUsable(current: Manifest, previous: Manifest): boolean {
    return filesToStage(current, previous).every((f) => sizeOf(inRoot(`${PREVIOUS}/${f.path}`)) === f.size);
}

function copyGroupsOf(sourceDir: string) {
    return parseCopyGroups(readText(inRoot(`${sourceDir}/${IMAGE_COPIES}`)) ?? readText(inRoot(IMAGE_COPIES)));
}

/** updates/rollback-ops.txt for the .cmd, or none when there is nothing to roll back to. */
function refreshRollback(): void {
    rmSync(inRoot(ROLLBACK_OPS_NEXT), { force: true });
    state.previous = null;
    const previous = readPreviousManifest(installRoot());
    if (!previous) {
        rmSync(inRoot(ROLLBACK_OPS), { force: true });
        return;
    }
    const current = readCurrent();
    if (!previousUsable(current, previous)) {
        console.error(`[updates] updates/previous (${previous.version}) is incomplete; no local rollback`);
        rmSync(inRoot(ROLLBACK_OPS), { force: true });
        return;
    }
    state.previous = previous.version;
    const ops = planSwap({
        current,
        target: previous,
        currentCopies: parseCopyGroups(readText(inRoot(IMAGE_COPIES))),
        targetCopies: copyGroupsOf(PREVIOUS),
        fromPrevious: true,
        previousExists: true,
        launch: launchLine(),
    });
    writeFileSync(inRoot(ROLLBACK_OPS), formatOps(ops));
}

// ---- check, download, install --------------------------------------------------------------

async function check(prompt: boolean): Promise<void> {
    if (!state.enabled || state.checking) return;
    state.checking = true;
    broadcast();
    try {
        releases = await listReleases();
        state.releases = releases.map(({ version, name, notes, published, page }) => ({ version, name, notes, published, page }));
        const newest = releases[0];
        state.available = newest && compareVersions(newest.version, state.current) > 0 ? newest.version : null;
        state.lastChecked = new Date().toISOString();
        state.error = null;
    } catch (err) {
        console.error("[updates] check failed:", err);
        state.error = `Could not check for updates: ${messageOf(err)}`;
    } finally {
        state.checking = false;
        refreshQuiet();
        broadcast();
    }
    if (prompt && state.available && !state.quiet && !state.job) {
        await promptUpdate(releases[0]).catch((err) => {
            console.error("[updates] prompt failed:", err);
        });
    }
}

async function downloadSize(release: Release, target: Manifest): Promise<number> {
    const plan = await planDownload({ root: installRoot(), current: readCurrent(), target, release }, false);
    return plan.bytes;
}

function trimNotes(notes: string): string {
    const text = notes.trim();
    return text.length > 600 ? `${text.slice(0, 600)}…` : text;
}

/** The start-up question. */
async function promptUpdate(release: Release): Promise<void> {
    const target = await fetchManifest(release);
    const bytes = await downloadSize(release, target);
    const notes = trimNotes(release.notes);
    const choice = await showBox({
        type: "info",
        title: "Update available",
        message: `Version ${release.version} of stp-overlay is available.`,
        detail: `You have ${state.current}. The update downloads ${formatBytes(bytes)}.${notes ? `\n\n${notes}` : ""}`,
        buttons: ["Update now", "Remind me tomorrow", "Skip this version", "Never ask me"],
        defaultId: 0,
        cancelId: 1,
    });
    // Closing the dialog counts as "Remind me tomorrow". "Never ask me" can be undone in the Updates window.
    if (choice === 1) writeSettings({ remindAfter: nextMidnight() });
    if (choice === 2) writeSettings({ skipped: release.version, remindAfter: null });
    if (choice === 3) {
        writeSettings({ silenced: true });
        await showBox({
            type: "info",
            title: "Update questions turned off",
            message: "stp-overlay won't ask about new versions again.",
            detail: `You stay on version ${state.current}. To check or update yourself, or to turn the questions back on, use the Updates button next to the Report button.`,
            buttons: ["OK"],
        });
    }
    broadcast();
    if (choice !== 0) return;
    openUpdatesWindow();
    await install(release, target);
}

/** Downloads `target` into updates/staging/, then offers the restart. */
async function install(release: Release, target: Manifest): Promise<void> {
    if (state.job && state.job.kind !== "ready") throw new Error("an update is already running");
    if (existsSync(inRoot(`${UPDATES}/previous-new`))) {
        throw new Error("An earlier update was interrupted (updates/previous-new is still there). Download the full zip from GitHub to repair this copy.");
    }
    ready = null;
    state.error = null;
    setJob({ kind: "preparing", version: release.version });
    abort = new AbortController();
    try {
        const root = installRoot();
        await resetStagingFor(root, release.version);
        const ctx = { root, current: readCurrent(), target, release };
        const plan = await planDownload(ctx, true);
        const job = { kind: "downloading" as const, version: release.version, received: 0, total: plan.bytes };
        setJob(job);
        await runDownload(
            ctx,
            plan,
            (received) => {
                job.received = received;
                const overlay = getOverlay();
                if (overlay && !overlay.isDestroyed() && job.total > 0) overlay.setProgressBar(Math.min(1, received / job.total));
                broadcast(true);
            },
            abort.signal,
        );
        ready = { release, target };
        setJob({ kind: "ready", version: release.version });
    } catch (err) {
        setJob(null);
        state.error = abort?.signal.aborted ? "The download was stopped." : `The download of ${release.version} failed: ${messageOf(err)}`;
        console.error("[updates] download failed:", err);
        broadcast();
        return;
    } finally {
        abort = null;
    }
    const choice = await showBox({
        type: "info",
        title: "Update ready",
        message: `Version ${release.version} is ready to install.`,
        detail: "The overlay closes and opens again in a few seconds. Your settings and splits stay as they are.",
        buttons: ["Restart now", "Later"],
        defaultId: 0,
        cancelId: 1,
    });
    if (choice === 0) restart();
}

/** Installs the downloaded update now. */
function restart(): void {
    if (!ready) throw new Error("no update is ready");
    swapAndRestart(ready.target, false);
}

/** Writes the op lists, starts apply.ps1 and quits; the script opens the app again. */
function swapAndRestart(target: Manifest, fromPrevious: boolean): void {
    const current = readCurrent();
    const sourceDir = fromPrevious ? PREVIOUS : STAGING;
    if (fromPrevious) rmSync(inRoot(STAGING), { recursive: true, force: true });
    const missing = filesToStage(current, target).filter((f) => sizeOf(inRoot(`${sourceDir}/${f.path}`)) !== f.size);
    if (missing.length > 0) throw new Error(`${missing.length} files of ${target.version} are missing from ${sourceDir} (first: ${missing[0].path})`);
    if (!fromPrevious && !existsSync(inRoot(`${STAGING}/manifest.json`))) throw new Error("the download is incomplete");

    const currentCopies = parseCopyGroups(readText(inRoot(IMAGE_COPIES)));
    const targetCopies = copyGroupsOf(sourceDir);
    const launch = launchLine();
    const ops = planSwap({ current, target, currentCopies, targetCopies, fromPrevious, previousExists: existsSync(inRoot(PREVIOUS)), launch });
    // After the swap, the version being left is the local rollback; the .cmd's list for it.
    const back = planSwap({ current: target, target: current, currentCopies: targetCopies, targetCopies: currentCopies, fromPrevious: true, previousExists: true, launch });

    writeHelperFiles();
    const opsFile = inRoot(`${UPDATES}/ops.txt`);
    writeFileSync(opsFile, formatOps(ops));
    writeFileSync(inRoot(ROLLBACK_OPS_NEXT), formatOps(back));
    rmSync(inRoot(`${UPDATES}/last-result.json`), { force: true });

    startHelper(["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", inRoot(`${UPDATES}/apply.ps1`), "-AppRoot", installRoot(), "-Ops", opsFile, "-WaitPid", String(process.pid)]);
    console.log(`[updates] installing ${target.version} (${ops.length} ops); quitting`);
    setJob({ kind: "restarting", version: target.version });
    setTimeout(() => app.quit(), 300);
}

/**
 * Starts apply.ps1 so that it outlives the app. A plain detached child is not enough: when
 * the app runs inside a Windows job object that kills its processes on exit and forbids
 * breaking away (a terminal, some launchers, Playwright under some hosts), the child dies
 * with the app before it can swap anything. A process WMI creates belongs to no job, so a
 * short-lived PowerShell asks WMI to start the helper; the detached spawn is the fallback.
 */
function startHelper(args: string[]): void {
    const commandLine = ["powershell.exe", ...args].map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(" ");
    const launcher = [
        "$si = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }",
        "$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $env:STP_HELPER_COMMAND; CurrentDirectory = $env:STP_HELPER_CWD; ProcessStartupInformation = $si }",
        "if ($r.ReturnValue -ne 0) { exit 10 + $r.ReturnValue }",
        "Write-Output $r.ProcessId",
    ].join("; ");
    const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", launcher], {
        encoding: "utf-8",
        windowsHide: true,
        timeout: 30000,
        env: { ...process.env, STP_HELPER_COMMAND: commandLine, STP_HELPER_CWD: inRoot(UPDATES) },
    });
    if (result.status === 0 && /^\d+$/.test(result.stdout.trim())) {
        console.log(`[updates] started apply.ps1 through WMI (pid ${result.stdout.trim()})`);
        return;
    }
    console.error(`[updates] WMI could not start apply.ps1 (status ${result.status}): ${result.stderr || result.error}; starting it directly`);
    spawn("powershell.exe", args, { detached: true, stdio: "ignore", windowsHide: true, cwd: inRoot(UPDATES) }).unref();
}

// ---- the Updates window ----------------------------------------------------------------------

export function openUpdatesWindow(): void {
    if (updatesWindow && !updatesWindow.isDestroyed()) {
        if (updatesWindow.isMinimized()) updatesWindow.restore();
        updatesWindow.focus();
        return;
    }
    updatesWindow = new BrowserWindow({
        width: 760,
        height: 820,
        minWidth: 520,
        minHeight: 420,
        title: "Updates",
        autoHideMenuBar: true,
        icon: join(appRoot(), "resources", "icons", "default.png"),
        webPreferences: {
            preload: join(__dirname, "../preload/index.js"),
            sandbox: false,
            contextIsolation: false,
            nodeIntegration: true,
        },
    });
    updatesWindow.on("closed", () => {
        updatesWindow = null;
    });
    updatesWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith("https://github.com/")) shell.openExternal(url);
        return { action: "deny" };
    });
    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
        updatesWindow.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/updates.html`);
    } else {
        updatesWindow.loadFile(join(__dirname, "../renderer/updates.html"));
    }
    // A check when the window opens, unless one ran in the last minute.
    if (state.enabled && (!state.lastChecked || Date.now() - Date.parse(state.lastChecked) > 60_000)) void check(false);
}

function releaseOf(version: string): Release {
    const release = releases.find((r) => r.version === version);
    if (!release) throw new Error(`version ${version} is not in the release list; check for updates again`);
    return release;
}

async function installFromWindow(version: string): Promise<void> {
    if (!state.enabled) throw new Error(state.disabledReason ?? "updates are off");
    const release = releaseOf(version);
    if (version === state.current) throw new Error(`${version} is the version you have`);
    const target = await fetchManifest(release);
    const bytes = await downloadSize(release, target);
    const older = compareVersions(version, state.current) < 0;
    const choice = await showBox({
        type: "question",
        title: older ? "Install an older version" : "Install update",
        message: `Install version ${version}?`,
        detail: `You have ${state.current}. This downloads ${formatBytes(bytes)}, then the overlay closes and opens again.${older ? " Your settings stay; an older version may not know settings added later." : ""}`,
        buttons: ["Install", "Cancel"],
        defaultId: 0,
        cancelId: 1,
    });
    if (choice === 0) await install(release, target);
}

async function rollback(): Promise<void> {
    if (!state.enabled) throw new Error(state.disabledReason ?? "updates are off");
    if (state.job && state.job.kind !== "ready") throw new Error("an update is running");
    const previous = readPreviousManifest(installRoot());
    if (!previous || !previousUsable(readCurrent(), previous)) throw new Error("there is no previous version to roll back to");
    const choice = await showBox({
        type: "question",
        title: "Roll back",
        message: `Roll back to version ${previous.version}?`,
        detail: `The overlay closes and opens again with ${previous.version}. Nothing is downloaded, and you can come back to ${state.current} the same way.`,
        buttons: ["Roll back", "Cancel"],
        defaultId: 0,
        cancelId: 1,
    });
    if (choice === 0) swapAndRestart(previous, true);
}

/** Runs `action`, putting any failure in `state.error` for the window. */
function guarded(action: () => Promise<void> | void) {
    return async () => {
        try {
            await action();
        } catch (err) {
            state.error = messageOf(err);
            console.error("[updates]", err);
        }
        broadcast();
        return state;
    };
}

export function startUpdater(getWindow: () => BrowserWindow | null): void {
    getOverlay = getWindow;

    ipcMain.handle("updates:get-state", () => state);
    ipcMain.handle("updates:check", guarded(() => check(false)));
    ipcMain.handle("updates:install", (_event, version: string) => guarded(() => installFromWindow(String(version)))());
    ipcMain.handle("updates:rollback", guarded(rollback));
    ipcMain.handle("updates:restart", guarded(restart));
    ipcMain.handle("updates:set-prefs", (_event, change: UpdatePrefsChange) => {
        const next: Partial<UpdatePrefs> = {};
        if (typeof change?.silenced === "boolean") next.silenced = change.silenced;
        if (change?.skipped === null || typeof change?.skipped === "string") next.skipped = change.skipped;
        if (change?.remindAfter === null) next.remindAfter = null;
        writeSettings(next);
        broadcast();
        return state;
    });
    ipcMain.on("updates:cancel", () => abort?.abort());
    ipcMain.on("updates:open-window", () => openUpdatesWindow());
    ipcMain.on("updates:open-page", (_event, url: unknown) => {
        if (typeof url === "string" && url.startsWith("https://github.com/")) shell.openExternal(url);
    });

    state.disabledReason = disabledReason();
    state.enabled = state.disabledReason === null;
    refreshQuiet();
    if (!state.enabled) return;

    try {
        state.current = readCurrent().version;
        readLastResult();
        writeHelperFiles();
        refreshRollback();
        if (existsSync(inRoot(`${UPDATES}/previous-new`))) state.error = "An earlier update was interrupted. Download the full zip from GitHub to repair this copy.";
    } catch (err) {
        console.error("[updates] start-up housekeeping failed:", err);
    }

    setTimeout(async () => {
        if (failedResult) {
            await showBox({
                type: "error",
                title: "Update failed",
                message: `The update could not be installed. You still have version ${state.current}.`,
                detail: `${failedResult}\n\nDetails are in updates\\apply.log in the overlay's folder.`,
                buttons: ["OK"],
            });
            state.error = `The last update could not be installed: ${failedResult}`;
            failedResult = null;
        }
        // Silenced: not even a look at GitHub; the Updates window still checks when opened.
        if (!readSettings().silenced) await check(true);
    }, STARTUP_CHECK_DELAY);
}
