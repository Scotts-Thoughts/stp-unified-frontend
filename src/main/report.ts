import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { join, relative } from "path";
import { deflateRawSync } from "zlib";
import { app, ipcMain, shell, type BrowserWindow } from "electron";
import { appRoot, userDataRoot } from "./paths";
import type { ReportPayload } from "../shared/report";

/**
 * The "Report" button (core/report/ReportButton.vue): everything someone needs to send
 * Scott about a problem, in one zip under `<appRoot>/reports/`.
 *
 *   report:capture  the window's picture and the log as they are now (held here until save/cancel)
 *   report:save     the user's title, description, drawn-on picture and the overlay's context
 *                   -> `reports/<YYYY-MM-DD> <title>.zip`, shown in Explorer/Finder
 *   report:cancel   drops what capture held
 *
 * The log is collected here from the start (`startReportLog`), through `console-message`
 * on the overlay window and a wrapper around main's own console: nothing is added to or
 * changed in either console's output, which the parity harness compares.
 */

const MAX_LINES = 5000;
const lines: string[] = [];

function push(line: string): void {
    lines.push(line);
    if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
}

function stamp(): string {
    return new Date().toISOString();
}

function describe(value: unknown): string {
    if (typeof value === "string") return value;
    if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

/** Wraps main's console once; each call still goes to the original method first. */
let mainConsoleWrapped = false;
function wrapMainConsole(): void {
    if (mainConsoleWrapped) return;
    mainConsoleWrapped = true;
    for (const level of ["log", "info", "warn", "error", "debug"] as const) {
        const original = console[level].bind(console);
        console[level] = (...args: unknown[]) => {
            original(...args);
            push(`${stamp()} [main:${level}] ${args.map(describe).join(" ")}`);
        };
    }
}

/** Starts the log for this window: its console, crashes and reloads. Call once per window. */
export function startReportLog(window: BrowserWindow): void {
    wrapMainConsole();
    const contents = window.webContents;
    contents.on("console-message", (event) => {
        const source = event.sourceId ? ` (${event.sourceId.replace(/^.*\/(src|out|node_modules)\//, "$1/")}:${event.lineNumber})` : "";
        push(`${stamp()} [${event.level}] ${event.message}${source}`);
    });
    contents.on("did-navigate", (_event, url) => push(`${stamp()} [page] loaded ${url}`));
    contents.on("render-process-gone", (_event, details) => push(`${stamp()} [page] renderer gone: ${details.reason} (exit ${details.exitCode})`));
    contents.on("unresponsive", () => push(`${stamp()} [page] not responding`));
    contents.on("responsive", () => push(`${stamp()} [page] responding again`));
}

// --- the zip: stored or deflated entries, no library ------------------------------

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(data: Buffer): number {
    let c = 0xffffffff;
    for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
    name: string;
    data: Buffer;
}

/** A plain zip (PKZIP 2.0, UTF-8 names). PNGs are stored as they are; everything else is deflated. */
function buildZip(entries: ZipEntry[], when: Date): Buffer {
    const time = (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1);
    const date = ((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
    const locals: Buffer[] = [];
    const centrals: Buffer[] = [];
    let offset = 0;
    for (const entry of entries) {
        const name = Buffer.from(entry.name, "utf-8");
        const store = entry.name.endsWith(".png");
        const body = store ? entry.data : deflateRawSync(entry.data);
        const crc = crc32(entry.data);

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6); // UTF-8 name
        local.writeUInt16LE(store ? 0 : 8, 8);
        local.writeUInt16LE(time, 10);
        local.writeUInt16LE(date, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(body.length, 18);
        local.writeUInt32LE(entry.data.length, 22);
        local.writeUInt16LE(name.length, 26);
        locals.push(local, name, body);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(store ? 0 : 8, 10);
        central.writeUInt16LE(time, 12);
        central.writeUInt16LE(date, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(body.length, 20);
        central.writeUInt32LE(entry.data.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt32LE(offset, 42);
        centrals.push(central, name);

        offset += local.length + name.length + body.length;
    }
    const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, ...centrals, end]);
}

// --- the report -------------------------------------------------------------------

interface Capture {
    when: Date;
    screenshot: Buffer;
    log: string;
}

let pending: Capture | null = null;

/** `YYYY-MM-DD` in local time. */
function localDate(when: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
}

/** A title made safe for a file name on Windows and macOS. */
function fileTitle(title: string): string {
    const cleaned = title
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[. ]+$/, "")
        .slice(0, 80)
        .trim();
    return cleaned || "Issue";
}

/** A name in `folder` that is not taken yet: `name.zip`, then `name (2).zip`... */
function freeName(folder: string, base: string): string {
    let candidate = join(folder, `${base}.zip`);
    for (let n = 2; existsSync(candidate); n++) candidate = join(folder, `${base} (${n}).zip`);
    return candidate;
}

/** Every file under the user-data folder (the settings), as `settings/...` entries. */
function settingsEntries(): ZipEntry[] {
    const root = userDataRoot();
    const entries: ZipEntry[] = [];
    const walk = (folder: string) => {
        if (!existsSync(folder)) return;
        for (const item of readdirSync(folder, { withFileTypes: true })) {
            const full = join(folder, item.name);
            if (item.isDirectory()) walk(full);
            else if (item.isFile() && statSync(full).size <= 20 * 1024 * 1024) {
                entries.push({ name: `settings/${relative(root, full).split("\\").join("/")}`, data: readFileSync(full) });
            }
        }
    };
    try {
        walk(root);
    } catch (error) {
        entries.push({ name: "settings/READ-ERROR.txt", data: Buffer.from(describe(error)) });
    }
    return entries;
}

function reportText(payload: ReportPayload, capture: Capture): string {
    const context = Object.entries(payload.context ?? {})
        .map(([key, value]) => `${key}: ${typeof value === "string" ? value : describe(value)}`)
        .join("\n");
    return [
        `Title: ${payload.title.trim()}`,
        `Date: ${capture.when.toString()}`,
        "",
        "Description:",
        payload.description.trim() || "(none)",
        "",
        "--- App ---",
        `stp-overlay ${app.getVersion()}${app.isPackaged ? "" : " (development)"}`,
        `Electron ${process.versions.electron}, Chrome ${process.versions.chrome}, Node ${process.versions.node}`,
        `System: ${process.platform} ${process.getSystemVersion()} ${process.arch}`,
        "",
        "--- Overlay ---",
        context,
        "",
    ].join("\n");
}

export function registerReportIpc(getWindow: () => BrowserWindow | null): void {
    ipcMain.handle("report:capture", async () => {
        const window = getWindow();
        if (!window || window.isDestroyed()) throw new Error("No overlay window to capture");
        const image = await window.webContents.capturePage();
        pending = { when: new Date(), screenshot: image.toPNG(), log: lines.join("\n") + "\n" };
        return `data:image/png;base64,${pending.screenshot.toString("base64")}`;
    });

    ipcMain.handle("report:cancel", () => {
        pending = null;
    });

    ipcMain.handle("report:save", async (_e, payload: ReportPayload) => {
        const capture = pending;
        if (!capture) throw new Error("Nothing captured; press Report again");
        const entries: ZipEntry[] = [
            { name: "report.txt", data: Buffer.from(reportText(payload, capture), "utf-8") },
            { name: "screenshot.png", data: capture.screenshot },
        ];
        const annotated = /^data:image\/png;base64,(.*)$/.exec(payload.annotated ?? "");
        if (annotated) entries.push({ name: "screenshot-annotated.png", data: Buffer.from(annotated[1], "base64") });
        entries.push({ name: "console.log", data: Buffer.from(capture.log, "utf-8") });
        entries.push(...settingsEntries());

        const folder = join(appRoot(), "reports");
        mkdirSync(folder, { recursive: true });
        const file = freeName(folder, `${localDate(capture.when)} ${fileTitle(payload.title)}`);
        writeFileSync(file, buildZip(entries, capture.when));
        pending = null;
        shell.showItemInFolder(file);
        return file;
    });
}
