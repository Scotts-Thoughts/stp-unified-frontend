/**
 * Proves the mock is indistinguishable from PokeAByte to the code that matters: it
 * drives gen1's real GameHookMapperClient (the same file the app ships) against the
 * mock and asserts the whole handshake, the property tree, change events, the 60 s
 * mapper re-fetch path, and every write endpoint.
 *
 *   npx tsx tools/parity/mock-pokeabyte/selftest.ts [fixture.jsonl.gz]
 *
 * Ports are deliberately NOT the canonical 8085 / 30158 / 4455: the protocol is what
 * is under test, and the self-test has to run while a real PokeAByte, Super Shuckie or
 * overlay is up. Pass --port/--shuckie-port/--obs-port to override.
 *
 * Exits non-zero on the first failure, so it can gate a parity run.
 */
import { setTimeout as sleep } from "node:timers/promises";
import { MockPokeAByte } from "./server.ts";
import { ObsStub } from "./obs-stub.ts";
import { ShuckieStub } from "./shuckie-stub.ts";
import { ReplayDriver, prescanPaths } from "./replay.ts";

/**
 * The client's debounce loop calls requestAnimationFrame unconditionally; Node has none.
 * The shim records what the callback throws instead of letting it kill the process:
 * on disconnect the client nulls `_debouceMap` while a frame is already queued, so the
 * loop throws (known-legacy-bugs.md #29). That is a property of the shipped client, not
 * of the mock, and the self-test reports it rather than hiding or failing on it.
 */
const rafErrors: string[] = [];
if (typeof globalThis.requestAnimationFrame !== "function") {
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(() => {
      try {
        cb(Date.now());
      } catch (err) {
        rafErrors.push(String(err));
      }
    }, 16).unref() as unknown as number;
}

const { GameHookMapperClient } = await import("../../../src/renderer/packages/gameHookMapperClient.ts");

const argv = process.argv.slice(2);
const numFlag = (name: string, fallback: number) =>
  Number(argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback);
const fixture =
  argv.find((a) => !a.startsWith("--")) ??
  "tools/fixtures/raw/Pokemon Crystal - Deprecated Mapper/c-wigglytuff-2-11311.fixture.jsonl.gz";
const PORT = numFlag("port", 18085);
const SHUCKIE_PORT = numFlag("shuckie-port", 30258);
const OBS_PORT = numFlag("obs-port", 14455);
const BASE = `http://localhost:${PORT}`;
const SHUCKIE_BASE = `http://127.0.0.1:${SHUCKIE_PORT}`;

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}${detail && !ok ? ` -- ${detail}` : ""}`);
  if (!ok) failures++;
}

const mock = new MockPokeAByte({ port: PORT, log: () => {} });
const shuckie = new ShuckieStub({ port: SHUCKIE_PORT, log: () => {} });
const obs = new ObsStub({ port: OBS_PORT, log: () => {} });
const driver = new ReplayDriver(fixture, { state: mock.state, extraPaths: await prescanPaths(fixture) });
const header = await driver.loadHeader();

await mock.start();
await shuckie.start();
await obs.start();

try {
  // --- 1. Unloaded mapper answers with the PokeAByte problem body ----------------
  const unloaded = await fetch(`${BASE}/mapper`);
  check("GET /mapper while unloaded is HTTP 400", unloaded.status === 400, `got ${unloaded.status}`);
  const problem = (await unloaded.json()) as { title?: string; detail?: string };
  check("... with MAPPER_NOT_LOADED", problem.title === "MAPPER_NOT_LOADED", JSON.stringify(problem));
  check(
    "... and PokeAByte's detail text",
    problem.detail === "Please load a mapper file first.",
    String(problem.detail),
  );

  // --- 2. CORS reflects the origin (never "*") ----------------------------------
  const cors = await fetch(`${BASE}/mapper`, { headers: { Origin: "http://localhost:5173" } });
  check(
    "CORS reflects Origin with credentials",
    cors.headers.get("access-control-allow-origin") === "http://localhost:5173" &&
      cors.headers.get("access-control-allow-credentials") === "true",
    `${cors.headers.get("access-control-allow-origin")} / ${cors.headers.get("access-control-allow-credentials")}`,
  );

  // --- 3. The real client connects and builds its property tree -----------------
  const client = new GameHookMapperClient(BASE);
  let mapperLoadedCount = 0;
  let unloadedCount = 0;
  const changed: string[] = [];
  client.onMapperLoaded = () => {
    mapperLoadedCount++;
  };
  client.onMapperUnloaded = () => {
    unloadedCount++;
  };
  client.onPropertyChanged = (p) => {
    changed.push(p.path);
  };

  // Arm the mapper before the client connects so `Hello` carries the model, like a
  // PokeAByte that already had a mapper loaded when the overlay started.
  mock.loadMapper();
  const connected = await client.connect();
  check("client.connect() resolved true", connected === true);
  check("client sees the mapper loaded", client.mapperLoaded === true);
  check("onMapperLoaded fired once", mapperLoadedCount === 1, `fired ${mapperLoadedCount}x`);
  check(
    "meta round-trips",
    client.meta?.path === header.meta.path && client.meta?.gameName === header.meta.gameName,
    JSON.stringify(client.meta),
  );
  check(
    "property count matches the fixture",
    client._properties.length === header.paths.length,
    `${client._properties.length} vs ${header.paths.length}`,
  );
  check(
    "glossary round-trips",
    Object.keys(client.glossary ?? {}).length === Object.keys(header.glossary).length,
  );

  // Nested tree: "player.team.0.species" must become properties.player.team[0].species.
  const numericPath = header.paths.find((p) => /\.\d+\./.test(p));
  if (numericPath) {
    const segments = numericPath.split(".");
    let node: unknown = client.properties;
    for (const seg of segments) node = (node as Record<string, unknown>)?.[seg];
    check(`numeric path becomes an array (${numericPath})`, !!node && (node as { path?: string }).path === numericPath);
  }

  // --- 4. PropertiesChanged reaches .change() subscribers -----------------------
  const target = client.get(header.paths[0])!;
  let changeFired = 0;
  target.change(() => {
    changeFired++;
  });
  const dto = mock.state.byPath.get(header.paths[0])!;
  dto.value = 1234;
  dto.bytes = [4, 210];
  dto.fieldsChanged = ["value", "bytes"];
  mock.pushChanges([dto]);
  await sleep(120);
  check("PropertiesChanged updates the client value", target.value === 1234, String(target.value));
  check("PropertiesChanged fires .change()", changeFired === 1, `fired ${changeFired}x`);
  check("onPropertyChanged fires globally", changed.includes(header.paths[0]));

  // A batch that touches only `bytes` must NOT fire .change() (the client's rule).
  dto.bytes = [0, 1];
  dto.fieldsChanged = ["bytes"];
  mock.pushChanges([dto]);
  await sleep(120);
  check("a bytes-only change does not fire .change()", changeFired === 1, `fired ${changeFired}x`);

  // --- 5. Write endpoints are logged, applied and echoed ------------------------
  const writable = [...mock.state.byPath.values()].find((p) => !p.isReadOnly)!;
  await client.get(writable.path)!.set(7);
  await sleep(80);
  check("set-property-value is logged", mock.writeLog.at(-1)?.endpoint === "set-property-value");
  check(
    "... with the dotted path restored",
    mock.writeLog.at(-1)?.paths[0] === writable.path,
    String(mock.writeLog.at(-1)?.paths[0]),
  );
  check("... and applied to replay state", mock.state.byPath.get(writable.path)?.value === 7);
  check("... and echoed to the client", client.get(writable.path)?.value === 7);

  // The client re-fetches /mapper every 60 s and rebuilds its tree from the response,
  // so /mapper must serve current values -- a recorded snapshot would roll the UI back.
  const refetched = (await (await fetch(`${BASE}/mapper`)).json()) as {
    properties: { path: string; value: unknown }[];
  };
  check(
    "GET /mapper serves live values, not the recorded ones",
    refetched.properties.find((p) => p.path === writable.path)?.value === 7,
    String(refetched.properties.find((p) => p.path === writable.path)?.value),
  );

  await client.get(writable.path)!.setBytes([1, 2, 3], true);
  await sleep(80);
  check("set-property-bytes is logged", mock.writeLog.at(-1)?.endpoint === "set-property-bytes");
  check(
    "... freeze marks isFrozen",
    mock.state.byPath.get(writable.path)?.isFrozen === true &&
      (mock.writeLog.at(-1)?.body as { freeze?: boolean }).freeze === true,
  );

  await client.setBits([{ path: writable.path, value: "1", bits: "0" }]);
  await sleep(80);
  check("set-properties-by-bits is logged", mock.writeLog.at(-1)?.endpoint === "set-properties-by-bits");
  check(
    "... array body keeps every path",
    Array.isArray(mock.writeLog.at(-1)?.body) && mock.writeLog.at(-1)?.paths.length === 1,
  );

  // --- 6. Lifecycle ------------------------------------------------------------
  mock.unloadMapper();
  await sleep(120);
  check("InstanceReset reaches onMapperUnloaded", unloadedCount === 1, `fired ${unloadedCount}x`);
  mock.loadMapper();
  await sleep(250);
  check("MapperLoaded re-arms the client", mapperLoadedCount === 2, `fired ${mapperLoadedCount}x`);

  // --- 7. Stubs ----------------------------------------------------------------
  shuckie.frame = 4242;
  const stats = (await (await fetch(`${SHUCKIE_BASE}/stats`)).json()) as Record<string, unknown>;
  check("shuckie /stats shape", stats.total_elapsed_frames === 4242 && stats.time_current === null, JSON.stringify(stats));
  await fetch(`${SHUCKIE_BASE}/mark-start`, { method: "POST" });
  await fetch(`${SHUCKIE_BASE}/increment-counter?name=blackout_counter`, { method: "POST" });
  check("shuckie logs POSTs in order", shuckie.calls.map((c) => c.route).join(",") === "/mark-start,/increment-counter");

  const marker = await sendChapterMarker("IN - BROCK");
  check("obs stub records CreateRecordChapter", marker && obs.markers.at(-1)?.chapterName === "IN - BROCK");

  // --- 8. Replay drives batches in fixture order -------------------------------
  let batches = 0;
  let lastT = -1;
  let monotonic = true;
  const shortRun = new ReplayDriver(fixture, { untilMs: 5000, checkKeyframes: true });
  for await (const b of shortRun.batches()) {
    batches++;
    if (b.tMs < lastT) monotonic = false;
    lastT = b.tMs;
  }
  check("replay yields batches", batches > 0, `${batches} batches`);
  check("batches are time-ordered and de-duplicated by tMs", monotonic);
  check(
    "replayed values agree with the recorded keyframes",
    shortRun.keyframeMismatches.length === 0,
    `${shortRun.keyframeMismatches.length} mismatches`,
  );

  // Clearing `connected` first stops the client's requestAnimationFrame debounce loop.
  // Without it the loop outlives _deconstructMapper() and dereferences the now-null
  // _debouceMap -- an uncaught TypeError the real app also throws on every PokeAByte
  // disconnect (known-legacy-bugs.md #29), which oracle 9 will flag.
  client.connected = false;
  await client._signalrClient?.stop();
} finally {
  await Promise.all([mock.stop(), shuckie.stop(), obs.stop()]);
}

console.log(failures === 0 ? "\nmock-pokeabyte self-test: all checks passed" : `\nmock-pokeabyte self-test: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);

/** Mirrors gen1's logic/obs.ts handshake, without importing the browser-only module. */
async function sendChapterMarker(chapterName: string): Promise<boolean> {
  const { WebSocket } = await import("ws");
  return await new Promise<boolean>((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${OBS_PORT}`);
    const requestId = "chapter-selftest";
    const timer = setTimeout(() => {
      ws.close();
      resolve(false);
    }, 3000);
    ws.on("message", (data) => {
      const msg = JSON.parse(String(data)) as { op: number; d?: Record<string, unknown> };
      if (msg.op === 0) ws.send(JSON.stringify({ op: 1, d: { rpcVersion: 1 } }));
      else if (msg.op === 2)
        ws.send(JSON.stringify({ op: 6, d: { requestId, requestType: "CreateRecordChapter", requestData: { chapterName } } }));
      else if (msg.op === 7) {
        clearTimeout(timer);
        ws.close();
        resolve(true);
      }
    });
    ws.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}
