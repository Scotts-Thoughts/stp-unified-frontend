/**
 * Self-test of the LevelDB reader and the localStorage decoder (plan 2.6).
 *
 *   npx tsx tools/import/selftest.ts
 *
 * The log format, write batches, snappy and the Chromium key/value encoding are
 * checked against hand-built bytes; the table reader is checked against a copy of
 * whichever legacy profile is on this machine (the folder is copied first and the
 * copy removed after), and skipped with a note when there is none.
 */
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { maskedCrc, parseWriteBatch, readLogRecords, readLevelDb, readTable, snappyUncompress, liveTableNumbers } from "../../src/main/leveldb.ts";
import { decodeLocalStorage, mergeOrigins } from "../../src/main/localStorageImport.ts";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok " : "FAIL"} ${name}${detail && !ok ? ` -- ${detail}` : ""}`);
  if (!ok) failures++;
}

// ---- varint-encoded write batch inside a log record ------------------------------
function varint(n: number): Buffer {
  const bytes: number[] = [];
  while (n >= 0x80) {
    bytes.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  bytes.push(n);
  return Buffer.from(bytes);
}
function batch(sequence: number, entries: { key: string; value?: string }[]): Buffer {
  const head = Buffer.alloc(12);
  head.writeBigUInt64LE(BigInt(sequence), 0);
  head.writeUInt32LE(entries.length, 8);
  const parts = [head];
  for (const e of entries) {
    const key = Buffer.from(e.key, "latin1");
    if (e.value === undefined) parts.push(Buffer.from([0]), varint(key.length), key);
    else {
      const value = Buffer.from(e.value, "latin1");
      parts.push(Buffer.from([1]), varint(key.length), key, varint(value.length), value);
    }
  }
  return Buffer.concat(parts);
}
function logRecord(payload: Buffer, type = 1): Buffer {
  const out = Buffer.alloc(7 + payload.length);
  out.writeUInt16LE(payload.length, 4);
  out[6] = type;
  payload.copy(out, 7);
  out.writeUInt32LE(maskedCrc(out, 6, out.length), 0);
  return out;
}

console.log("log records and write batches");
{
  const a = batch(10, [{ key: "k1", value: "v1" }, { key: "k2", value: "v2" }]);
  const b = batch(12, [{ key: "k1" }]);
  const file = Buffer.concat([logRecord(a), logRecord(b)]);
  const records = readLogRecords(file);
  check("two full records", records.length === 2, String(records.length));
  const entries = records.flatMap(parseWriteBatch);
  check("three entries with running sequences", entries.map((e) => e.sequence).join() === "10,11,12", entries.map((e) => e.sequence).join());
  check("a deletion has no value", entries[2].value === null && entries[2].key.toString() === "k1");
  // A torn tail: the last record's CRC is wrong, so reading stops before it.
  const torn = Buffer.concat([logRecord(a), logRecord(b)]);
  torn[torn.length - 1] ^= 0xff;
  check("a bad checksum ends the read", readLogRecords(torn).length === 1);
  // A record split across two blocks: FIRST + LAST fragments.
  const big = Buffer.alloc(40000, 0x41);
  const first = logRecord(big.subarray(0, 32768 - 7), 2);
  const last = logRecord(big.subarray(32768 - 7), 4);
  const joined = readLogRecords(Buffer.concat([first, last]));
  check("fragments reassemble across a block", joined.length === 1 && joined[0].length === 40000 && joined[0].equals(big));
}

console.log("snappy");
{
  // "aaaaaaaaaaaaaaaa": a 1-byte literal then a 15-byte copy at offset 1 (copy2).
  const compressed = Buffer.from([16, 0x00, 0x61, ((15 - 1) << 2) | 2, 0x01, 0x00]);
  check("literal + overlapping copy", snappyUncompress(compressed).toString() === "a".repeat(16));
  // A 4-byte copy1: offset 3, length 4 -> "abcabca" from literal "abc".
  const c1 = Buffer.from([7, (2 << 2) | 0, 0x61, 0x62, 0x63, ((4 - 4) << 2) | 1 | (0 << 5), 0x03]);
  check("copy1 form", snappyUncompress(c1).toString() === "abcabca", snappyUncompress(c1).toString());
  // A long literal (>= 60 bytes) uses the extra-length form.
  const text = Buffer.from("x".repeat(70));
  const c2 = Buffer.concat([varint(70), Buffer.from([(60 << 2) | 0, 69]), text]);
  check("long literal", snappyUncompress(c2).equals(text));
}

console.log("manifest");
{
  // new file (level 0, number 5), new file (level 1, number 7), deleted file (level 0, number 5)
  const edit = Buffer.concat([
    Buffer.from([7]), varint(0), varint(5), varint(100), varint(1), Buffer.from("a"), varint(1), Buffer.from("z"),
    Buffer.from([7]), varint(1), varint(7), varint(200), varint(1), Buffer.from("a"), varint(1), Buffer.from("z"),
    Buffer.from([6]), varint(0), varint(5),
    Buffer.from([4]), varint(12345),
  ]);
  const live = liveTableNumbers(logRecord(edit));
  check("live tables follow adds and deletes", [...live].join() === "7", [...live].join());
}

console.log("chromium localStorage records");
{
  const key = (origin: string, name: string, latin1 = true) =>
    Buffer.concat([Buffer.from("_" + origin, "latin1"), Buffer.from([0, latin1 ? 1 : 0]), latin1 ? Buffer.from(name, "latin1") : Buffer.from(name, "utf16le")]);
  const value = (text: string, latin1 = true) => Buffer.concat([Buffer.from([latin1 ? 1 : 0]), latin1 ? Buffer.from(text, "latin1") : Buffer.from(text, "utf16le")]);
  const entries = new Map([
    ["a", { key: key("file://", "starter"), value: value('"Kyurem"'), sequence: 1 }],
    ["b", { key: key("file://", "count"), value: value("3"), sequence: 2 }],
    ["c", { key: key("file://", "name", false), value: value("Pokémon", false), sequence: 3 }],
    ["d", { key: key("http://localhost:5173", "starter"), value: value('"Stale"'), sequence: 4 }],
    ["e", { key: key("devtools://devtools", "console-history"), value: value("[]"), sequence: 5 }],
    ["f", { key: Buffer.from("VERSION"), value: Buffer.from("1"), sequence: 0 }],
    ["g", { key: key("file://", "__VUE_DEVTOOLS_X"), value: value("{}"), sequence: 6 }],
  ]);
  const records = decodeLocalStorage(entries);
  check("bookkeeping and DevTools keys are dropped", records.length === 5, String(records.length));
  const merged = mergeOrigins(records);
  check("JSON values parse", merged.starter === "Kyurem" && merged.count === 3);
  check("UTF-16 keys and values decode", merged.name === "Pokémon", String(merged.name));
  check("the origin with more records wins", !("console-history" in merged) && merged.starter === "Kyurem");
}

console.log("table reader on this machine's legacy profiles");
{
  const roaming = process.env.APPDATA ?? "";
  const profiles = ["stp-generation1-overlay", "stp-generation2-overlay", "stp-generation3-overlay", "gen4-overlay-app", "gen5-overlay-app"]
    .map((n) => join(roaming, n, "Local Storage", "leveldb"))
    .filter((d) => existsSync(d));
  if (!profiles.length) console.log("  (no legacy profile here; skipped)");
  for (const source of profiles) {
    const copy = mkdtempSync(join(tmpdir(), "stp-selftest-"));
    try {
      for (const name of readdirSync(source)) if (name !== "LOCK") copyFileSync(join(source, name), join(copy, name));
      const tables = readdirSync(copy).filter((n) => /\.ldb$/.test(n));
      let parsed = 0;
      for (const t of tables) {
        readTable(readFileSync(join(copy, t)));
        parsed++;
      }
      const db = readLevelDb(copy);
      check(`${source.split("\\").slice(-3)[0]}: ${parsed} table(s) parse, ${db.size} live key(s)`, parsed === tables.length && db.size > 0);
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  }
}

console.log(failures ? `\n${failures} check(s) failed` : "\nimport self-test: all checks passed");
process.exit(failures ? 1 : 0);
