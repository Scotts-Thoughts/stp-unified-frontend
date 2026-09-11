/**
 * Shows what the Phase 2.6 importer would take from a legacy app's `localStorage`,
 * without writing anything.
 *
 *   npx tsx tools/import/dump-localstorage.ts <profile dir | leveldb dir> [--values] [--key=<name>]
 *
 * Reads a copy of the folder through the same reader the app uses on first launch
 * (`src/main/leveldb.ts`, `src/main/localStorageImport.ts`) and prints the origins,
 * the keys and, with `--values`, the decoded values. Values may hold an OBS password:
 * the default listing prints keys and sizes only.
 */
import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { decodeLocalStorage, mergeOrigins, readLegacyLocalStorage } from "../../src/main/localStorageImport.ts";
import { readLevelDb } from "../../src/main/leveldb.ts";

const argv = process.argv.slice(2);
const target = argv.find((a) => !a.startsWith("--"));
const showValues = argv.includes("--values");
const only = argv.find((a) => a.startsWith("--key="))?.slice("--key=".length);
if (!target) {
  console.error("usage: dump-localstorage.ts <profile dir | leveldb dir> [--values] [--key=<name>]");
  process.exit(2);
}
const dir = resolve(target);
const log = (m: string) => console.log(m);

// A leveldb folder given directly is read in place (it is expected to be a copy);
// a profile folder goes through the importer's own copy-then-read.
let merged: Record<string, unknown> | null;
if (existsSync(join(dir, "CURRENT"))) {
  const records = decodeLocalStorage(readLevelDb(dir, log));
  const origins = new Map<string, number>();
  for (const r of records) origins.set(r.origin, (origins.get(r.origin) ?? 0) + 1);
  for (const [origin, n] of origins) console.log(`origin ${origin}: ${n} record(s)`);
  merged = mergeOrigins(records);
} else {
  merged = readLegacyLocalStorage(dir, log);
}
if (!merged) {
  console.error(`${dir}: no Local Storage/leveldb`);
  process.exit(1);
}
const keys = Object.keys(merged).sort();
console.log(`${basename(dir)}: ${keys.length} key(s)`);
for (const key of keys) {
  if (only && key !== only) continue;
  const value = merged[key];
  const text = JSON.stringify(value);
  if (showValues) console.log(`  ${key} = ${text.length > 300 ? text.slice(0, 300) + `... (${text.length} chars)` : text}`);
  else console.log(`  ${key}  (${typeof value}${Array.isArray(value) ? "[]" : ""}, ${text.length} chars)`);
}
