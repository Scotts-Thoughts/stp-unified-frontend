/**
 * A read-only LevelDB reader in plain TypeScript -- enough of the format to read a
 * *copy* of a Chromium `Local Storage/leveldb` folder (plan 2.6): the MANIFEST for the
 * live table files, the tables (block-based, prefix-compressed keys, snappy or no
 * compression), and the write-ahead log, merged by sequence number so the newest
 * record per key wins and a deletion hides what it deleted.
 *
 * No native dependency: `classic-level` would build against the running Electron and
 * Node, and the reader is used once, at first launch, on a folder nobody else has
 * open. The format references are LevelDB's own `doc/table_format.md`,
 * `doc/log_format.md`, `db/version_edit.cc` and `db/dbformat.h`; the checksums are
 * verified for log records (a torn tail is expected in a copied folder and skipped
 * exactly as LevelDB's own reader skips it) and read past for table blocks, whose
 * corruption shows up as a parse failure of the block instead.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface LevelEntry {
    /** The user key (the internal key without its 8-byte sequence/type suffix). */
    key: Buffer;
    /** The value, or null for a deletion. */
    value: Buffer | null;
    sequence: number;
}

// ---------------------------------------------------------------- varints

function readVarint(buf: Buffer, pos: number): [number, number] {
    let result = 0;
    let shift = 0;
    for (;;) {
        if (pos >= buf.length) throw new Error("varint runs past the end of the buffer");
        const byte = buf[pos++];
        // Past 2^53 the value cannot be represented, and no field here is that large.
        result += (byte & 0x7f) * 2 ** shift;
        if ((byte & 0x80) === 0) return [result, pos];
        shift += 7;
        if (shift > 63) throw new Error("varint too long");
    }
}

// ---------------------------------------------------------------- crc32c (LevelDB's masked form)

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0x82f63b78 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32c(buf: Buffer, start: number, end: number): number {
    let crc = 0xffffffff;
    for (let i = start; i < end; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

/** LevelDB stores `((crc >> 15) | (crc << 17)) + 0xa282ead8` so a CRC of CRCs is not zero. */
export function maskedCrc(buf: Buffer, start: number, end: number): number {
    const crc = crc32c(buf, start, end);
    return ((((crc >>> 15) | (crc << 17)) >>> 0) + 0xa282ead8) >>> 0;
}

// ---------------------------------------------------------------- snappy

/** Decompresses one snappy block (the format LevelDB's `kSnappyCompression` uses). */
export function snappyUncompress(input: Buffer): Buffer {
    let [length, pos] = readVarint(input, 0);
    const out = Buffer.alloc(length);
    let outPos = 0;
    while (pos < input.length) {
        const tag = input[pos++];
        const kind = tag & 3;
        if (kind === 0) {
            let len = tag >>> 2;
            if (len >= 60) {
                const extra = len - 59;
                len = 0;
                for (let i = 0; i < extra; i++) len |= input[pos + i] << (8 * i);
                len >>>= 0;
                pos += extra;
            }
            len += 1;
            input.copy(out, outPos, pos, pos + len);
            pos += len;
            outPos += len;
            continue;
        }
        let len: number;
        let offset: number;
        if (kind === 1) {
            len = ((tag >>> 2) & 7) + 4;
            offset = ((tag >>> 5) << 8) | input[pos];
            pos += 1;
        } else if (kind === 2) {
            len = (tag >>> 2) + 1;
            offset = input[pos] | (input[pos + 1] << 8);
            pos += 2;
        } else {
            len = (tag >>> 2) + 1;
            offset = (input[pos] | (input[pos + 1] << 8) | (input[pos + 2] << 16) | (input[pos + 3] << 24)) >>> 0;
            pos += 4;
        }
        if (offset === 0 || offset > outPos) throw new Error("snappy copy offset out of range");
        // Copies may overlap their own output (a run), so byte by byte.
        for (let i = 0; i < len; i++) out[outPos + i] = out[outPos - offset + i];
        outPos += len;
    }
    if (outPos !== length) throw new Error(`snappy: decoded ${outPos} bytes, expected ${length}`);
    return out;
}

// ---------------------------------------------------------------- the log format

const LOG_BLOCK_SIZE = 32768;
const LOG_HEADER_SIZE = 7;

/**
 * The logical records of a log-format file (`*.log`, `MANIFEST-*`): fragments are
 * reassembled across the 32 KB blocks; a record whose checksum fails ends the read,
 * as LevelDB's reader treats the tail of a file that was being written.
 */
export function readLogRecords(file: Buffer): Buffer[] {
    const records: Buffer[] = [];
    let fragments: Buffer[] = [];
    let pos = 0;
    while (pos + LOG_HEADER_SIZE <= file.length) {
        const inBlock = pos % LOG_BLOCK_SIZE;
        if (LOG_BLOCK_SIZE - inBlock < LOG_HEADER_SIZE) {
            pos += LOG_BLOCK_SIZE - inBlock; // trailer padding
            continue;
        }
        const crc = file.readUInt32LE(pos);
        const length = file.readUInt16LE(pos + 4);
        const type = file[pos + 6];
        const start = pos + LOG_HEADER_SIZE;
        const end = start + length;
        if (end > file.length) break;
        if (type === 0 && length === 0) {
            // A zeroed, preallocated region: nothing more in this block.
            pos += LOG_BLOCK_SIZE - inBlock;
            continue;
        }
        // The checksum covers the type byte and the payload.
        if (maskedCrc(file, pos + 6, end) !== crc) break;
        const data = file.subarray(start, end);
        pos = end;
        if (type === 1) {
            records.push(Buffer.from(data));
            fragments = [];
        } else if (type === 2) {
            fragments = [data];
        } else if (type === 3) {
            fragments.push(data);
        } else if (type === 4) {
            fragments.push(data);
            records.push(Buffer.concat(fragments));
            fragments = [];
        } else {
            break; // unknown record type: stop, as the reference reader would report corruption
        }
    }
    return records;
}

/** The entries of one write batch (a `.log` record): sequence, count, then typed key/value pairs. */
export function parseWriteBatch(record: Buffer): LevelEntry[] {
    if (record.length < 12) return [];
    const sequence = Number(record.readBigUInt64LE(0));
    const count = record.readUInt32LE(8);
    const entries: LevelEntry[] = [];
    let pos = 12;
    for (let i = 0; i < count; i++) {
        const type = record[pos++];
        let keyLength: number;
        [keyLength, pos] = readVarint(record, pos);
        const key = Buffer.from(record.subarray(pos, pos + keyLength));
        pos += keyLength;
        if (type === 1) {
            let valueLength: number;
            [valueLength, pos] = readVarint(record, pos);
            entries.push({ key, value: Buffer.from(record.subarray(pos, pos + valueLength)), sequence: sequence + i });
            pos += valueLength;
        } else if (type === 0) {
            entries.push({ key, value: null, sequence: sequence + i });
        } else {
            throw new Error(`unknown write batch entry type ${type}`);
        }
    }
    return entries;
}

// ---------------------------------------------------------------- the manifest

/** The table files the current version consists of, from the MANIFEST's version edits. */
export function liveTableNumbers(manifest: Buffer): Set<number> {
    const live = new Set<number>();
    for (const record of readLogRecords(manifest)) {
        let pos = 0;
        while (pos < record.length) {
            let tag: number;
            [tag, pos] = readVarint(record, pos);
            let n: number;
            switch (tag) {
                case 1: // comparator name
                    [n, pos] = readVarint(record, pos);
                    pos += n;
                    break;
                case 2: // log number
                case 3: // next file number
                case 4: // last sequence
                case 9: // previous log number
                    [, pos] = readVarint(record, pos);
                    break;
                case 5: // compact pointer: level, internal key
                    [, pos] = readVarint(record, pos);
                    [n, pos] = readVarint(record, pos);
                    pos += n;
                    break;
                case 6: { // deleted file: level, number
                    [, pos] = readVarint(record, pos);
                    let number: number;
                    [number, pos] = readVarint(record, pos);
                    live.delete(number);
                    break;
                }
                case 7: { // new file: level, number, size, smallest, largest
                    [, pos] = readVarint(record, pos);
                    let number: number;
                    [number, pos] = readVarint(record, pos);
                    [, pos] = readVarint(record, pos);
                    [n, pos] = readVarint(record, pos);
                    pos += n;
                    [n, pos] = readVarint(record, pos);
                    pos += n;
                    live.add(number);
                    break;
                }
                default:
                    throw new Error(`unknown version edit tag ${tag}`);
            }
        }
    }
    return live;
}

// ---------------------------------------------------------------- tables

const TABLE_MAGIC = Buffer.from("57fb808b247547db", "hex"); // 0xdb4775248b80fb57 little-endian
const FOOTER_SIZE = 48;

function readBlockHandle(buf: Buffer, pos: number): [{ offset: number; size: number }, number] {
    let offset: number;
    let size: number;
    [offset, pos] = readVarint(buf, pos);
    [size, pos] = readVarint(buf, pos);
    return [{ offset, size }, pos];
}

/** The key/value entries of one block, prefix compression undone. */
function readBlock(file: Buffer, handle: { offset: number; size: number }): { key: Buffer; value: Buffer }[] {
    const raw = file.subarray(handle.offset, handle.offset + handle.size);
    const compression = file[handle.offset + handle.size];
    let data: Buffer;
    if (compression === 0) data = raw;
    else if (compression === 1) data = snappyUncompress(raw);
    else throw new Error(`unknown block compression ${compression}`);
    if (data.length < 4) throw new Error("block too small");
    const numRestarts = data.readUInt32LE(data.length - 4);
    const end = data.length - 4 - numRestarts * 4;
    const entries: { key: Buffer; value: Buffer }[] = [];
    let pos = 0;
    let previous = Buffer.alloc(0);
    while (pos < end) {
        let shared: number, nonShared: number, valueLength: number;
        [shared, pos] = readVarint(data, pos);
        [nonShared, pos] = readVarint(data, pos);
        [valueLength, pos] = readVarint(data, pos);
        const key = Buffer.concat([previous.subarray(0, shared), data.subarray(pos, pos + nonShared)]);
        pos += nonShared;
        const value = Buffer.from(data.subarray(pos, pos + valueLength));
        pos += valueLength;
        entries.push({ key, value });
        previous = key;
    }
    return entries;
}

/** Every entry of a table file, internal keys decoded to user key + sequence + type. */
export function readTable(file: Buffer): LevelEntry[] {
    if (file.length < FOOTER_SIZE || !file.subarray(file.length - 8).equals(TABLE_MAGIC)) {
        throw new Error("not a LevelDB table (bad magic)");
    }
    const footer = file.subarray(file.length - FOOTER_SIZE);
    let pos = 0;
    [, pos] = readBlockHandle(footer, pos); // metaindex: filters, which this reader does not need
    const [indexHandle] = readBlockHandle(footer, pos);
    const entries: LevelEntry[] = [];
    for (const index of readBlock(file, indexHandle)) {
        const [handle] = readBlockHandle(index.value, 0);
        for (const { key, value } of readBlock(file, handle)) {
            if (key.length < 8) throw new Error("internal key shorter than its suffix");
            const suffix = key.readBigUInt64LE(key.length - 8);
            const type = Number(suffix & 0xffn);
            const sequence = Number(suffix >> 8n);
            entries.push({ key: key.subarray(0, key.length - 8), value: type === 1 ? value : null, sequence });
        }
    }
    return entries;
}

// ---------------------------------------------------------------- the database

/**
 * The current contents of a LevelDB folder: the newest record per key across the
 * live tables and the log, deletions applied. `keyOf` turns the raw key into the map
 * key (a string); the default is the bytes as latin1, which round-trips.
 */
export function readLevelDb(dir: string, log: (message: string) => void = () => {}): Map<string, LevelEntry> {
    const current = readFileSync(join(dir, "CURRENT"), "latin1").trim();
    const manifestPath = join(dir, current);
    if (!existsSync(manifestPath)) throw new Error(`CURRENT names ${current}, which is not in ${dir}`);
    const live = liveTableNumbers(readFileSync(manifestPath));

    const newest = new Map<string, LevelEntry>();
    const take = (entry: LevelEntry) => {
        const id = entry.key.toString("latin1");
        const have = newest.get(id);
        if (!have || entry.sequence > have.sequence) newest.set(id, entry);
    };

    for (const name of readdirSync(dir)) {
        const table = /^(\d+)\.(ldb|sst)$/.exec(name);
        if (table) {
            const number = Number(table[1]);
            if (!live.has(number)) {
                log(`[leveldb] ${name} is not in the current version; skipped`);
                continue;
            }
            try {
                for (const entry of readTable(readFileSync(join(dir, name)))) take(entry);
            } catch (err) {
                log(`[leveldb] ${name}: ${(err as Error).message}; skipped`);
            }
            continue;
        }
        if (/^\d+\.log$/.test(name)) {
            try {
                for (const record of readLogRecords(readFileSync(join(dir, name)))) {
                    for (const entry of parseWriteBatch(record)) take(entry);
                }
            } catch (err) {
                log(`[leveldb] ${name}: ${(err as Error).message}; read up to there`);
            }
        }
    }
    for (const [id, entry] of newest) if (entry.value === null) newest.delete(id);
    return newest;
}
