/**
 * Self-test for core/logic/shuckieBookmarks.ts: the bookmark at every chapter marker,
 * against a fake Super Shuckie that behaves like the `replay-bookmarks` branch's REST
 * API (external-contracts.md §3), and then against the harness's own ShuckieStub.
 *
 *   npm run parity:bookmarks [-- --shuckie-port=30258]
 *
 * The module talks to 127.0.0.1:30158, the real Super Shuckie's port; a `fetch` shim
 * rewrites that to the test port (the harness does the same inside the renderer with
 * --redirect-ports), so this runs while a real Super Shuckie is up.
 */
import { createServer, type Server } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import { ShuckieStub } from "./mock-pokeabyte/shuckie-stub.ts";

const argv = process.argv.slice(2);
const PORT = Number(argv.find((a) => a.startsWith("--shuckie-port="))?.split("=")[1] ?? 30258);

// What the module needs from the renderer: the user-state file (never written here) and
// Super Shuckie's address.
(globalThis as { window?: unknown }).window = { api: { data: { read: async () => null, write: async () => {} } } };
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
  realFetch(String(input).replace("http://127.0.0.1:30158", `http://127.0.0.1:${PORT}`), init)) as typeof fetch;

const { addShuckieBookmark, bookmarkTypeFor, setShuckieBookmarksEnabled } = await import("../../src/renderer/core/logic/shuckieBookmarks.ts");

type Bm = { id: number; name: string; type: string; in_frame: number };
/** The fake Super Shuckie: one bookmark table per replay, the user's types shared by all. */
const S = {
  state: "none" as "none" | "recording" | "playback",
  replay: "run-1",
  frame: 0,
  generation: 1,
  editable: true,
  nextId: 1,
  files: new Map<string, Bm[]>(),
  requests: [] as string[],
  /** The user's saved types (lower case), like Super Shuckie's settings. */
  types: new Set<string>(),
};
const list = () => {
  if (!S.files.has(S.replay)) S.files.set(S.replay, []);
  return S.files.get(S.replay)!;
};

function start(): Promise<Server> {
  const server = createServer((req, res) => {
    const url = new URL(req.url!, `http://127.0.0.1:${PORT}`);
    S.requests.push(`${req.method} ${url.pathname}`);
    const frameAtRequest = S.frame;
    const reply = (status: number, body: unknown) => {
      // A little latency, out of order like the real server's tick can be.
      setTimeout(() => {
        res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify(body));
      }, Math.random() * 6);
    };
    if (url.pathname === "/stats") {
      reply(200, { total_elapsed_frames: frameAtRequest, is_recording: S.state === "recording", is_playing_back: S.state === "playback", bookmark_generation: S.generation, counters: {} });
      return;
    }
    if (url.pathname === "/bookmarks") {
      if (S.state === "none") return reply(404, { error: "no replay" });
      reply(200, {
        replay: S.replay,
        state: S.state,
        generation: S.generation,
        editable: S.editable,
        bookmarks: [...list()].sort((a, b) => a.in_frame - b.in_frame),
        types: [...S.types].map((name) => ({ name, saved: true })),
      });
      return;
    }
    if (url.pathname === "/add-bookmark") {
      if (S.state === "none") return reply(404, { error: "no replay" });
      const frame = Number(url.searchParams.get("frame"));
      if (!(frame <= S.frame)) return reply(400, { error: "frame past current" });
      const b = { id: S.nextId++, name: url.searchParams.get("name")!, type: url.searchParams.get("type")!, in_frame: frame };
      list().push(b);
      // Like Super Shuckie: one bump for a type it has to create, one for the bookmark.
      if (!S.types.has(b.type.toLowerCase())) {
        S.types.add(b.type.toLowerCase());
        S.generation++;
      }
      S.generation++;
      reply(200, b);
      return;
    }
    reply(404, { error: "no route" });
  });
  return new Promise((resolve) => server.listen(PORT, "127.0.0.1", () => resolve(server)));
}

const settle = () => sleep(150);
const results: string[] = [];
let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (!ok) failed++;
  results.push(`  ${ok ? "ok " : "FAIL"} ${name}${detail ? " -- " + detail : ""}`);
}
/** Fire a marker with Super Shuckie at `frame`, leaving the frame there until the /stats sample is taken. */
async function fire(name: string, frame: number): Promise<void> {
  S.frame = frame;
  addShuckieBookmark(name);
  await sleep(25);
}
const listed = () => list().map((b) => `${b.name}@${b.in_frame}`).join(",");
const listFetches = () => S.requests.filter((r) => r === "GET /bookmarks").length;

let server = await start();

// --- A. Types ------------------------------------------------------------------
const types: [string, string][] = [
  ["IN - BROCK", "BATTLE"], ["OUT - BROCK", "BATTLE"], ["IN - Wild", "BATTLE"], ["OUT - null", "BATTLE"], ["IN - NOT_MAJOR_BATTLE", "BATTLE"],
  ["RESET", "RESET"], ["BLACKOUT", "BLACKOUT"], ["Map Change - 820", "MAP CHANGE"], ["Map Change - PEWTER_CITY - GYM", "MAP CHANGE"],
  ["Text Box - true", "TEXT BOX"], ["MENU - Bag", "MENU"], ["Item - Potion", "ITEM"], ["Item - TM01 Mega Punch", "ITEM"], ["Item - HM03 Surf", "ITEM"],
  ["Held Item - Leftovers", "HELD ITEM"], ["New Move - Tackle", "NEW MOVE"], ["Move Change", "MOVE CHANGE"],
  ["Level Up - 12", "LEVEL UP"], ["Battle Level Up", "LEVEL UP"], ["Rare Candy Used", "RARE CANDY"],
  ["Special - G2_Headbutt", "SPECIAL"], ["LABEL - MOVE", "TM MOVE"], ["LABEL - VICTORY", "VICTORY"],
  ["Turn", "TURN"], ["Next Pokemon", "NEXT POKEMON"], ["Enemy Fainted", "ENEMY FAINTED"],
  ["Something New - x", "SOMETHING NEW"],
];
const badTypes = types.filter(([n, t]) => bookmarkTypeFor(n) !== t).map(([n, t]) => `${n}: ${bookmarkTypeFor(n)} != ${t}`);
check("every chapter marker kind has its type", badTypes.length === 0, badTypes.join("; "));

// --- B. No replay ---------------------------------------------------------------
S.state = "none";
await fire("IN - BROCK", 10);
await settle();
check("no replay: nothing added", !S.requests.some((r) => r.includes("add-bookmark")), S.requests.join(","));

// --- C. Recording ---------------------------------------------------------------
S.state = "recording";
S.replay = "run-1";
await fire("IN - BROCK", 100);
await fire("Text Box - true", 100);
await fire("Text Box - true", 160);
await fire("Next Pokemon", 170);
await fire("OUT - BROCK", 400);
await settle();
const recorded = list().map((b) => `${b.name}@${b.in_frame}:${b.type}`).join(" | ");
check(
  "recording: every marker, in order, at its frame, with its type",
  recorded === "IN - BROCK@100:BATTLE | Text Box - true@100:TEXT BOX | Text Box - true@160:TEXT BOX | Next Pokemon@170:NEXT POKEMON | OUT - BROCK@400:BATTLE",
  recorded,
);

// --- D. Playing that replay back ------------------------------------------------
S.state = "playback";
const before = list().length;
await fire("IN - BROCK", 104);
await fire("Text Box - true", 98);
await fire("Text Box - true", 166);
await fire("Next Pokemon", 175);
await fire("OUT - BROCK", 395);
await settle();
check("playback of a bookmarked replay adds nothing", list().length === before, `${list().length} vs ${before}`);
await fire("Item - Potion", 450);
await settle();
check("playback adds a marker the recording did not have", list().length === before + 1 && list().at(-1)!.name === "Item - Potion");

// --- E. An old replay without bookmarks ------------------------------------------
S.replay = "old-run";
S.generation++;
await fire("Text Box - true", 1000);
await fire("Text Box - true", 1060);
await fire("Text Box - true", 1120);
await settle();
check("old replay: repeats close together are all added", list().length === 3, listed());
await fire("Text Box - true", 1003);
await fire("Text Box - true", 1057);
await fire("Text Box - true", 1125);
await settle();
check("seek back and play again: nothing doubled", list().length === 3, listed());
await fire("Text Box - true", 990);
await fire("Text Box - true", 1062);
await fire("Text Box - true", 1119);
await fire("Text Box - true", 1180);
await settle();
check("a fourth repeat is added, the three known ones are not", list().length === 4, listed());

// --- F. A burst fired without waiting ---------------------------------------------
S.replay = "burst";
S.generation++;
S.frame = 5000;
addShuckieBookmark("OUT - MISTY");
addShuckieBookmark("Map Change - 12");
addShuckieBookmark("Text Box - false");
await sleep(25);
S.frame = 5010;
await settle();
check("burst: all added in firing order", listed() === "OUT - MISTY@5000,Map Change - 12@5000,Text Box - false@5000", listed());

// --- G. A replay that cannot be changed -------------------------------------------
S.replay = "v2";
S.generation++;
S.editable = false;
await fire("RESET", 10);
await settle();
check("uneditable replay: nothing added", list().length === 0);
S.editable = true;

// --- H. The switch ----------------------------------------------------------------
setShuckieBookmarksEnabled(false);
const requestsBefore = S.requests.length;
S.state = "recording";
S.replay = "off";
await fire("BLACKOUT", 50);
await settle();
check("switch off: no request at all", S.requests.length === requestsBefore && list().length === 0, S.requests.slice(requestsBefore).join(","));
setShuckieBookmarksEnabled(true);
await fire("BLACKOUT", 60);
await settle();
check("switch back on: adds again", list().length === 1);

// --- I. Super Shuckie gone ---------------------------------------------------------
await new Promise((resolve) => server.close(resolve));
await fire("RESET", 70);
await settle();
server = await start();
await fire("RESET", 80);
await settle();
check("survives Super Shuckie being down", listed() === "BLACKOUT@60,RESET@80", listed());

// --- K. Filling in a long replay --------------------------------------------------
S.state = "playback";
S.replay = "long-run";
S.generation++;
const fetchesBefore = listFetches();
for (let i = 0; i < 30; i++) await fire(i % 2 ? "Text Box - false" : "Text Box - true", 2000 + i * 40);
await settle();
check("backfill: every marker added", list().length === 30, String(list().length));
check("backfill: /bookmarks fetched once, not once per marker", listFetches() - fetchesBefore === 1, String(listFetches() - fetchesBefore));
await fire("Text Box - true", 2003);
for (let i = 1; i < 30; i++) await fire(i % 2 ? "Text Box - false" : "Text Box - true", 2000 + i * 40 + 2);
await settle();
check("the same stretch after a seek back: nothing doubled, no fetch", list().length === 30 && listFetches() - fetchesBefore === 1, `${list().length} bookmarks, ${listFetches() - fetchesBefore} fetches`);

// --- L. Another replay, outside edits, recording in between ------------------------
S.replay = "next-run";
S.generation++;
await fire("Text Box - true", 5);
await fire("Text Box - false", 45);
await settle();
check("another replay right after adds: not deduped against the last one", list().length === 2, listed());
S.files.get("next-run")!.push({ id: S.nextId++, name: "Map Change - 9", type: "MAP CHANGE", in_frame: 60 });
S.generation++;
await fire("Map Change - 9", 70);
await settle();
check("an outside edit right after adds of ours is seen", list().length === 3, listed());
S.state = "recording";
S.replay = "rec-2";
S.generation++;
await fire("RESET", 9000);
await settle();
S.state = "playback";
S.files.get("rec-2")!.push({ id: S.nextId++, name: "OUT - LANCE", type: "BATTLE", in_frame: 9100 });
await fire("OUT - LANCE", 9105);
await settle();
check("recording, then playing back: the new replay's list is used", list().length === 2, listed());
S.replay = "o-first";
S.generation++;
await fire("Map Change - 3", 20000);
await fire("Map Change - 4", 20100);
await settle();
S.replay = "o-second";
S.generation++; // Super Shuckie's reset() on load
await fire("Map Change - 4", 20105);
await settle();
check("replay switch with a forward seek: not deduped against the last replay", listed() === "Map Change - 4@20105", listed());

// --- P. New types -----------------------------------------------------------------
S.replay = "p-run";
S.generation++;
const pBefore = listFetches();
await fire("Held Item - Leftovers", 100);
await fire("Special - G2_Headbutt", 140);
await fire("Held Item - Mystic Water", 180);
await settle();
check("new types (two generation bumps each): every marker added, one fetch", list().length === 3 && listFetches() - pBefore === 1, `${list().length} bookmarks, ${listFetches() - pBefore} fetches`);

// --- Q. The harness's own stub ----------------------------------------------------
await new Promise((resolve) => server.close(resolve));
await fire("RESET", 0); // drops the pooled keep-alive socket to the closed server
await settle();
const stub = new ShuckieStub({ port: PORT, log: () => {} });
await stub.start();
stub.frame = 4242;
addShuckieBookmark("IN - BROCK");
addShuckieBookmark("Enemy Fainted");
await sleep(25);
stub.frame = 4300;
addShuckieBookmark("Enemy Fainted");
await settle();
check(
  "harness stub: a bookmark per marker, repeats close together included, POSTs kept out of the call log",
  stub.bookmarks.map((b) => `${b.name}@${b.in_frame}:${b.type}`).join(",") === "IN - BROCK@4242:BATTLE,Enemy Fainted@4242:ENEMY FAINTED,Enemy Fainted@4300:ENEMY FAINTED" && stub.calls.length === 0,
  `${JSON.stringify(stub.bookmarks)} calls=${stub.calls.length}`,
);
await stub.stop();

console.log(results.join("\n"));
console.log(failed ? `\nbookmarks self-test: ${failed} check(s) FAILED` : "\nbookmarks self-test: all checks passed");
process.exit(failed ? 1 : 0);
