/**
 * Chromium `localStorage` records out of a LevelDB folder (plan 2.6).
 *
 * Chromium keeps every origin's `localStorage` in one LevelDB under the profile's
 * `Local Storage/leveldb`. A data record's key is `_` + the serialised origin + `\0`
 * + a format byte + the storage key; its value is a format byte + the storage value.
 * The format byte is 0 for UTF-16LE and 1 for Latin-1 (the compact form Chromium
 * picks when every code unit fits a byte). `VERSION` and `META:<origin>` records are
 * bookkeeping. This is `components/services/storage/dom_storage/` in Chromium; the
 * shape was confirmed on the five legacy profiles on this machine.
 *
 * The legacy overlays wrote every value through `JSON.stringify` (`MyStorage`), and
 * read it back with a `JSON.parse` that fell back to the raw string, so the import
 * does the same.
 */
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readLevelDb, type LevelEntry } from "./leveldb";

export interface LocalStorageRecord {
    origin: string;
    key: string;
    /** The stored string. */
    raw: string;
    /** `JSON.parse(raw)`, or `raw` itself when it is not JSON -- what the legacy `MyStorage.get` returned. */
    value: unknown;
}

function decodeText(bytes: Buffer): string {
    if (bytes.length === 0) return "";
    const format = bytes[0];
    const body = bytes.subarray(1);
    if (format === 0) return body.toString("utf16le");
    if (format === 1) return body.toString("latin1");
    // Older Chromium wrote keys without a format byte; treat the whole thing as UTF-8.
    return bytes.toString("utf8");
}

/** Every data record of every origin in the folder's `localStorage`. */
export function decodeLocalStorage(entries: Map<string, LevelEntry>): LocalStorageRecord[] {
    const records: LocalStorageRecord[] = [];
    for (const entry of entries.values()) {
        const key = entry.key;
        if (key.length < 2 || key[0] !== 0x5f /* _ */) continue; // VERSION, META:...
        const separator = key.indexOf(0);
        if (separator < 0) continue;
        const origin = key.subarray(1, separator).toString("latin1");
        const name = decodeText(key.subarray(separator + 1));
        // Vue DevTools keeps its plugin settings under the app's origin; not the app's.
        if (name.startsWith("__VUE_DEVTOOLS")) continue;
        const raw = decodeText(entry.value ?? Buffer.alloc(0));
        let value: unknown = raw;
        try {
            value = JSON.parse(raw);
        } catch {
            /* not JSON: the raw string, as the legacy proxy returned it */
        }
        records.push({ origin, key: name, raw, value });
    }
    return records;
}

/**
 * The `localStorage` of one legacy app as one key -> value map. Only the app's own
 * origins count -- `file://` (gen2-5 load their `index.html` from disk), a local dev
 * server (`http://localhost:5173`, gen1 under Vite), or another local port; DevTools
 * keeps its own history under `devtools://devtools` in the same database and is left
 * out. Where an app has records under more than one of its origins, the origin with
 * the most records is the profile its runs actually wrote to and is preferred (gen5's
 * profile holds five stale keys under a dev-server origin next to 368 under
 * `file://`); a key the preferred origin lacks is taken from the next.
 */
export function mergeOrigins(records: LocalStorageRecord[]): Record<string, unknown> {
    const isAppOrigin = (origin: string): boolean => origin === "file://" || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
    const counts = new Map<string, number>();
    for (const r of records) if (isAppOrigin(r.origin)) counts.set(r.origin, (counts.get(r.origin) ?? 0) + 1);
    const order = [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || (a[0] === "http://localhost:5173" ? -1 : a[0] === "file://" && b[0] !== "http://localhost:5173" ? -1 : 1))
        .map(([origin]) => origin);
    const merged: Record<string, unknown> = {};
    for (const origin of order) {
        for (const record of records) {
            if (record.origin === origin && !(record.key in merged)) merged[record.key] = record.value;
        }
    }
    return merged;
}

/**
 * Reads a legacy app's `Local Storage/leveldb` -- from a copy, never the folder the
 * app may have open -- and returns its merged key/value map, or null when the folder
 * is not there.
 */
export function readLegacyLocalStorage(profileDir: string, log: (message: string) => void): Record<string, unknown> | null {
    const source = join(profileDir, "Local Storage", "leveldb");
    if (!existsSync(source)) return null;
    const copy = mkdtempSync(join(tmpdir(), "stp-leveldb-"));
    try {
        for (const name of readdirSync(source)) {
            if (name === "LOCK") continue;
            try {
                copyFileSync(join(source, name), join(copy, name));
            } catch (err) {
                log(`[import] ${source}/${name}: ${(err as Error).message}; skipped`);
            }
        }
        const records = decodeLocalStorage(readLevelDb(copy, log));
        const origins = [...new Set(records.map((r) => r.origin))];
        log(`[import] ${source}: ${records.length} record(s) under ${origins.length} origin(s) (${origins.join(", ")})`);
        return mergeOrigins(records);
    } finally {
        rmSync(copy, { recursive: true, force: true });
    }
}
