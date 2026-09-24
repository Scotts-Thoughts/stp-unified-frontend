/**
 * Self-test for the split bookmarks (2026-09-23): the name and its parsing, the rows a
 * replay's bookmarks turn into (`src/shared/splitBookmarks.ts`), the `.replay` reader
 * (`src/shared/replayBookmarks.ts`, against a copy of the recorder's encoder and against
 * a file `supershuckie-replay-convert` wrote), the main-process comparison loader
 * (`src/main/splitComparison.ts`) on replays and CSVs, and the playback store
 * (`core/stores/useReplaySplitsStore.ts`) against a fake Super Shuckie.
 *
 *   npm run parity:replay-splits [-- --shuckie-port=30258]
 */
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The store's `defineStore` comes from pinia's CommonJS build (tsx loads the renderer's
// modules that way); an ESM `import { createPinia } from "pinia"` here would be a second
// copy with no active pinia in it, so the same build is required.
const { createPinia, setActivePinia } = createRequire(import.meta.url)("pinia") as typeof import("pinia");

const argv = process.argv.slice(2);
const PORT = Number(argv.find((a) => a.startsWith("--shuckie-port="))?.split("=")[1] ?? 30258);
const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "..", "fixtures", "replays", "legacy-bookmarks-v6.replay");

// What the renderer modules need: the user-state file (never written here) and Super
// Shuckie's address, redirected to the test port as the bookmarks self-test does.
(globalThis as { window?: unknown }).window = { api: { data: { read: async () => null, write: async () => {} } } };
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
  realFetch(String(input).replace("http://127.0.0.1:30158", `http://127.0.0.1:${PORT}`), init)) as typeof fetch;

const {
  isSplitBookmark, parseSplitBookmarkName, secondsToSplitTime, splitBookmarkKey, splitBookmarkName, splitTimeToHms, splitsFromBookmarks,
} = await import("../../src/shared/splitBookmarks.ts");
const { byteSourceOf, decodeBookmarkSection, decodeBookmarkTable, parseReplayHeader, readReplayBookmarks } =
  await import("../../src/shared/replayBookmarks.ts");
type ByteSource = import("../../src/shared/replayBookmarks.ts").ByteSource;
const { loadSplitComparison } = await import("../../src/main/splitComparison.ts");
const { setShuckieBookmarksEnabled } = await import("../../src/renderer/core/logic/shuckieBookmarks.ts");
const { useReplaySplitsStore } = await import("../../src/renderer/core/stores/useReplaySplitsStore.ts");

const results: string[] = [];
let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (!ok) failed++;
  results.push(`  ${ok ? "ok " : "FAIL"} ${name}${detail ? " -- " + detail : ""}`);
}
const rows = (list: { trainer: string; time: string; id?: number }[]) => list.map((r) => `${r.trainer}${r.id === undefined ? "" : `(${r.id})`}@${r.time}`).join(",");

// --- A. Names and times ------------------------------------------------------------
check("name: plain", splitBookmarkName("Brock", "00:45:12") === "SPLIT - Brock - 00:45:12");
check("name: instance", splitBookmarkName("Elite Four Will", "01:20:00", 2) === "SPLIT - Elite Four Will (2) - 01:20:00");
check("parse: plain", JSON.stringify(parseSplitBookmarkName("SPLIT - Brock - 00:45:12")) === JSON.stringify({ trainer: "Brock", hms: "00:45:12" }));
check("parse: instance", JSON.stringify(parseSplitBookmarkName("SPLIT - N (587) - 01:20:00")) === JSON.stringify({ trainer: "N", hms: "01:20:00", instance: 587 }));
check("parse: a trainer key with ' - ' in it", parseSplitBookmarkName("SPLIT - RTG1 - Wrapping Lass - 00:10:00")?.trainer === "RTG1 - Wrapping Lass");
check("parse: a trainer key ending in digits", JSON.stringify(parseSplitBookmarkName("SPLIT - Rival3-SS Anne - 00:30:01")) === JSON.stringify({ trainer: "Rival3-SS Anne", hms: "00:30:01" }));
check("parse: hours past two digits", parseSplitBookmarkName("SPLIT - Champion - 123:04:05")?.hms === "123:04:05");
check("parse: not a split", parseSplitBookmarkName("OUT - BROCK") === null && parseSplitBookmarkName("SPLIT - Brock") === null && parseSplitBookmarkName("SPLIT - Brock - 45:12") === null);
check("key: drops the time, keeps the instance", splitBookmarkKey("SPLIT - Brock - 00:45:12") === "SPLIT - Brock" && splitBookmarkKey("SPLIT - N (587) - 01:20:00") === "SPLIT - N (587)" && splitBookmarkKey("RESET") === null);
check("time: every panel spelling to HH:MM:SS", splitTimeToHms("45") === "00:00:45" && splitTimeToHms("5:12") === "00:05:12" && splitTimeToHms("1:05:12") === "01:05:12" && splitTimeToHms("1:05:12.34") === "01:05:12" && splitTimeToHms("0:05") === "00:00:05");
check("time: placeholders are not times", splitTimeToHms("-") === null && splitTimeToHms("") === null && splitTimeToHms(undefined) === null);
check("time: back to the panels' [h:]m:ss", secondsToSplitTime(3912) === "1:05:12" && secondsToSplitTime(312) === "5:12" && secondsToSplitTime(5) === "0:05" && secondsToSplitTime(0) === "0:00");
check("isSplit: typed SPLIT, untyped, or a string type; not another type", isSplitBookmark({ name: "SPLIT - Brock - 00:45:12", in_frame: 1, type: { name: "SPLIT" } }) && isSplitBookmark({ name: "SPLIT - Brock - 00:45:12", in_frame: 1, type: null }) && isSplitBookmark({ name: "SPLIT - Brock - 00:45:12", in_frame: 1, type: "split" }) && !isSplitBookmark({ name: "SPLIT - Brock - 00:45:12", in_frame: 1, type: { name: "BATTLE" } }));

// --- B. Rows from bookmarks ---------------------------------------------------------
const B = (name: string, in_frame: number, id = in_frame, type: string | null = "SPLIT") => ({ id, name, in_frame, type: type === null ? null : { name: type } });
const marks = [
  B("SPLIT - Misty - 00:20:00", 1500),
  B("IN - BROCK", 400, 400, "BATTLE"),
  B("SPLIT - Brock - 00:10:00", 500),
  B("SPLIT - Rival1-Lab - 00:00:45", 100),
  B("SPLIT - Brock - 00:08:00", 3000), // a new attempt beat Brock again
  B("SPLIT - Elite Four Will (1) - 01:00:00", 4000),
  B("SPLIT - Elite Four Will (2) - 01:30:00", 5000),
];
check("rows: frame order, unsorted input, other types ignored", rows(splitsFromBookmarks(marks, 2000)) === "Rival1-Lab@0:45,Brock@10:00,Misty@20:00", rows(splitsFromBookmarks(marks, 2000)));
check("rows: the last split per trainer wins and sits where it is", rows(splitsFromBookmarks(marks, 3500)) === "Rival1-Lab@0:45,Misty@20:00,Brock@8:00", rows(splitsFromBookmarks(marks, 3500)));
check("rows: instances are separate rows with ids", rows(splitsFromBookmarks(marks)) === "Rival1-Lab@0:45,Misty@20:00,Brock@8:00,Elite Four Will(1)@1:00:00,Elite Four Will(2)@1:30:00", rows(splitsFromBookmarks(marks)));
check("rows: a frame before every split is empty", splitsFromBookmarks(marks, 50).length === 0);
check("rows: the frame itself counts", rows(splitsFromBookmarks(marks, 100)) === "Rival1-Lab@0:45");

// --- C. The recorder's encoding ------------------------------------------------------
function uint(value: bigint | number): number[] {
  let v = BigInt(value);
  if (v === 0n) return [0];
  const bytes: number[] = [];
  while (v > 0n) { bytes.push(Number(v & 0xffn)); v >>= 8n; }
  return [bytes.length, ...bytes];
}
const bytevec = (b: number[]) => [...uint(b.length), ...b];
const str = (s: string) => bytevec([...Buffer.from(s, "utf8")]);
const u32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
const u64 = (v: number) => { const out: number[] = []; let n = BigInt(v); for (let i = 0; i < 8; i++) { out.push(Number(n & 0xffn)); n >>= 8n; } return out; };
interface T { id: bigint; name: string; color: number }
interface M { id: number; name: string; typeId?: bigint; inFrame: number; inMillis: number; out?: [number, number]; keyframe?: boolean; extra?: number[] }
function encodeTable(nextId: number, types: T[], bookmarks: M[]): Uint8Array {
  const out = [...u32(1), ...uint(nextId), ...uint(types.length)];
  for (const t of types) out.push(...bytevec([...uint(t.id), ...str(t.name), ...u32(t.color)]));
  out.push(...uint(bookmarks.length));
  for (const b of bookmarks) {
    const flags = (b.out ? 1 : 0) | (b.keyframe ? 2 : 0);
    out.push(...bytevec([...uint(b.id), ...str(b.name), ...uint(b.typeId ?? 0n), ...uint(b.inFrame), ...uint(b.inMillis), ...uint(flags), ...uint(b.out?.[0] ?? 0), ...uint(b.out?.[1] ?? 0), ...(b.extra ?? [])]));
  }
  return Uint8Array.from(out);
}
function encodeSection(payload: Uint8Array): Uint8Array {
  return Uint8Array.from([...Buffer.from("SSBM"), ...u32(1), ...u64(payload.length), ...new Array(32).fill(0), ...payload]);
}
function encodeReplay(version: number, patch: number, stream: number, section: Uint8Array | null): Uint8Array {
  const header = new Uint8Array(2048);
  header.set(Buffer.from("NIDO"), 0);
  header.set(u32(version), 4);
  header.set(u64(patch), 0x110);
  header.set(u64(section ? 2048 + patch + stream : 0), 0x3a8);
  header.set(Buffer.from("RINA"), 0x7fc);
  const file = new Uint8Array(2048 + patch + stream + (section?.length ?? 0));
  file.set(header, 0);
  for (let i = 0; i < patch + stream; i++) file[2048 + i] = (i * 7) & 0xff;
  if (section) file.set(section, 2048 + patch + stream);
  return file;
}

const SPLIT_ID = 0xfedcba9876543210n; // a type id past 2^53, as Super Shuckie's random ids are
const table = encodeTable(9, [{ id: SPLIT_ID, name: "SPLIT", color: 0x1a2b3c }, { id: 7n, name: "Battle", color: 0xff0000 }], [
  { id: 3, name: "SPLIT - Brock - 00:10:00", typeId: SPLIT_ID, inFrame: 500, inMillis: 8333 },
  { id: 1, name: "IN - BROCK", typeId: 7n, inFrame: 400, inMillis: 6666, out: [480, 8000] },
  { id: 2, name: "checkpoint", inFrame: 450, inMillis: 7500, keyframe: true, extra: [1, 2, 3, 4] },
  { id: 8, name: "SPLIT - Misty - 00:20:00", typeId: 99n, inFrame: 1500, inMillis: 25000 },
]);
const decoded = decodeBookmarkTable(table);
check("table: next id and types", decoded.nextId === 9 && decoded.types.map((t) => `${t.id}:${t.name}:${t.color}`).join(",") === "fedcba9876543210:SPLIT:#1A2B3C,0000000000000007:Battle:#FF0000", JSON.stringify(decoded.types));
check("table: bookmarks come out sorted by frame then id", decoded.bookmarks.map((b) => b.id).join(",") === "1,2,3,8");
const inBrock = decoded.bookmarks.find((b) => b.id === 1)!;
check("table: a range with a type", inBrock.type?.name === "Battle" && inBrock.in_frame === 400 && inBrock.in_millis === 6666 && inBrock.out_frame === 480 && inBrock.out_millis === 8000 && !inBrock.keyframe);
const cp = decoded.bookmarks.find((b) => b.id === 2)!;
check("table: an untyped keyframe point, trailing record bytes ignored", cp.type === null && cp.keyframe && cp.out_frame === null && cp.in_frame === 450);
check("table: a big type id resolves; an unknown type id reads as untyped", decoded.bookmarks.find((b) => b.id === 3)!.type?.name === "SPLIT" && decoded.bookmarks.find((b) => b.id === 8)!.type === null);
check("rows from the decoded table", rows(splitsFromBookmarks(decoded.bookmarks)) === "Brock@10:00,Misty@20:00", rows(splitsFromBookmarks(decoded.bookmarks)));

const section = encodeSection(table);
check("section: decodes", decodeBookmarkSection(section).bookmarks.length === 4);
const tryDecode = (bytes: Uint8Array) => { try { decodeBookmarkSection(bytes); return "ok"; } catch (e) { return (e as Error).message; } };
check("section: bad magic", tryDecode(Uint8Array.from([...Buffer.from("XXXX"), ...section.subarray(4)])).includes("unknown signature"));
check("section: cut short", tryDecode(section.subarray(0, 20)).includes("cut short"));
check("section: length mismatch", tryDecode(section.subarray(0, section.length - 1)).includes("records"));

const v6 = encodeReplay(6, 100, 1_000_000, section);
const reads: number[] = [];
const counting: ByteSource = { size: v6.length, read: async (o, l) => { reads.push(l); return v6.subarray(o, Math.min(v6.length, o + l)); } };
const fromFile = await readReplayBookmarks(counting);
check("replay: header + section only are read", fromFile.ok && fromFile.version === 6 && fromFile.table.bookmarks.length === 4 && reads.length === 2 && reads[0] === 2048 && reads[1] === section.length, JSON.stringify(reads));
check("replay: v3 has no section", (await readReplayBookmarks(byteSourceOf(encodeReplay(3, 0, 500, null)))).ok === false);
const unclosed = await readReplayBookmarks(byteSourceOf(encodeReplay(6, 0, 500, null)));
check("replay: an unclosed v6 says so", !unclosed.ok && unclosed.error.includes("never closed"), unclosed.ok ? "" : unclosed.error);
check("replay: not a replay", (await readReplayBookmarks(byteSourceOf(new Uint8Array(4096)))).ok === false);
check("header: fields", JSON.stringify(parseReplayHeader(v6)) === JSON.stringify({ version: 6, patchDataLength: 100, packetStreamEnd: 2048 + 100 + 1_000_000 }));

// --- D. A file the converter wrote --------------------------------------------------
const real = await readReplayBookmarks(byteSourceOf(new Uint8Array(readFileSync(FIXTURE))));
check("fixture: three legacy bookmarks, frames and times as Super Shuckie shows them",
  real.ok && real.version === 6 && real.table.nextId === 4 && real.table.types.length === 0 &&
  real.table.bookmarks.map((b) => `${b.id}:${b.name}@${b.in_frame}/${b.in_millis}:${b.type}`).join(",") === "1:checkpoint@7/166:null,2:late@76/1754:null,3:checkpoint@165/3873:null",
  real.ok ? JSON.stringify(real.table.bookmarks) : real.error);

// --- E. The comparison loader --------------------------------------------------------
const dir = mkdtempSync(join(tmpdir(), "stp-replay-splits-"));
try {
  const replayPath = join(dir, "run.replay");
  writeFileSync(replayPath, v6);
  const fromReplay = await loadSplitComparison(replayPath);
  check("loader: a replay gives its split rows", fromReplay.source === "replay" && fromReplay.name === "run.replay" && rows(fromReplay.rows) === "Brock@10:00,Misty@20:00" && fromReplay.replay?.bookmarks === 4, JSON.stringify(fromReplay));
  const csvPath = join(dir, "Y-Pikachu-3-simple.csv");
  writeFileSync(csvPath, "player_name,pokemon,trainer_name,real_time_hmmss,resets\nRED,Pikachu,Brock,9:58,0\nRED,Pikachu,Misty,21:03,1\n");
  const fromCsv = await loadSplitComparison(csvPath);
  check("loader: a CSV parses as it always did", fromCsv.source === "csv" && rows(fromCsv.rows) === "Brock@9:58,Misty@21:03", JSON.stringify(fromCsv.rows));
  check("loader: a replay with no splits gives no rows", (await loadSplitComparison(FIXTURE)).rows.length === 0);
  const v3Path = join(dir, "old.replay");
  writeFileSync(v3Path, encodeReplay(3, 0, 500, null));
  let refused = "";
  try { await loadSplitComparison(v3Path); } catch (e) { refused = (e as Error).message; }
  check("loader: a v3 replay is refused with the reason", refused.includes("old.replay") && refused.includes("v3"), refused);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

// --- F. The playback store against a fake Super Shuckie ------------------------------
const S = {
  playingBack: true,
  frame: 0,
  generation: 5,
  replay: "run-1",
  bookmarks: [] as { id: number; name: string; in_frame: number; type: { name: string } | null }[],
  fetches: 0,
};
function start(): Promise<Server> {
  const server = createServer((req, res) => {
    const url = new URL(req.url!, `http://127.0.0.1:${PORT}`);
    const reply = (body: unknown) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname === "/stats") return reply({ total_elapsed_frames: S.frame, is_playing_back: S.playingBack, bookmark_generation: S.generation, counters: {} });
    if (url.pathname === "/bookmarks") { S.fetches++; return reply({ replay: S.replay, state: S.playingBack ? "playback" : "recording", generation: S.generation, editable: true, bookmarks: S.bookmarks, types: [] }); }
    res.writeHead(404).end();
  });
  return new Promise((resolve) => server.listen(PORT, "127.0.0.1", () => resolve(server)));
}
let server = await start();
setActivePinia(createPinia());
setShuckieBookmarksEnabled(true);
const store = useReplaySplitsStore();

S.bookmarks = [B("IN - BROCK", 400, 1, "BATTLE"), B("SPLIT - Brock - 00:10:00", 500, 2), B("SPLIT - Misty - 00:20:00", 1500, 3)];
S.frame = 1000;
await store.tick();
check("store: playing back at frame 1000 shows the splits reached", store.playingBack && rows(store.currentSplits) === "Brock@10:00" && S.fetches === 1, `${rows(store.currentSplits)} fetches=${S.fetches}`);
S.frame = 2000;
await store.tick();
check("store: a later frame adds the next split without a refetch", rows(store.currentSplits) === "Brock@10:00,Misty@20:00" && S.fetches === 1, rows(store.currentSplits));
S.frame = 600;
await store.tick();
check("store: a scrub back drops the splits not yet reached", rows(store.currentSplits) === "Brock@10:00", rows(store.currentSplits));
S.bookmarks.push(B("SPLIT - Rival1-Lab - 00:00:45", 100, 4));
S.generation = 6;
await store.tick();
check("store: a generation change refetches; the new split lands in frame order", rows(store.currentSplits) === "Rival1-Lab@0:45,Brock@10:00" && S.fetches === 2 && store.generation === 6, `${rows(store.currentSplits)} fetches=${S.fetches}`);
S.playingBack = false;
await store.tick();
check("store: not playing back: nothing", !store.playingBack && store.currentSplits.length === 0 && store.bookmarks.length === 0);
S.playingBack = true;
await store.tick();
check("store: playing back again: fetched afresh", store.playingBack && rows(store.currentSplits) === "Rival1-Lab@0:45,Brock@10:00" && S.fetches === 3);
setShuckieBookmarksEnabled(false);
await store.tick();
check("store: switch off: nothing shown, nothing asked", !store.playingBack && store.currentSplits.length === 0);
setShuckieBookmarksEnabled(true);
await store.tick();
check("store: switch on: back", store.playingBack && rows(store.currentSplits) === "Rival1-Lab@0:45,Brock@10:00");
await new Promise((resolve) => server.close(resolve));
await store.tick();
check("store: Super Shuckie gone: cleared, no throw", !store.playingBack && store.currentSplits.length === 0);
server = await start();
await store.tick();
check("store: still inside the retry wait: not asked yet", !store.playingBack);
store._nextAttemptAt = 0;
await store.tick();
check("store: after the wait: back", store.playingBack && rows(store.currentSplits) === "Rival1-Lab@0:45,Brock@10:00");
store.stopPolling();
await new Promise((resolve) => server.close(resolve));

console.log(results.join("\n"));
console.log(failed ? `\nreplay splits self-test: ${failed} check(s) FAILED` : "\nreplay splits self-test: all checks passed");
process.exit(failed ? 1 : 0);
