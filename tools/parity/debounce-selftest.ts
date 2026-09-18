/**
 * Proves the client's debounce frame loop survives every way a connection can be
 * reached, by driving the shipped GameHookMapperClient against the mock PokeAByte.
 *
 *   npx tsx tools/parity/debounce-selftest.ts [--port=18087]
 *
 * The loop is what applies every debounced path (gen4: `battle.opponent.team*`,
 * `battle.opponent.active_pokemon*`, `player.team.0.species`, `meta.global_pointer`;
 * gen5 the same at 15 frames). `connect()` used to start it once, after its first
 * `_establishConnection()`; three ordinary paths left it dead for the session, and a
 * dead loop parks those properties for good, so the enemy team area kept drawing the
 * previous battle's `team_count` (empty slots at the first rival, a slot too many at
 * the second). Scott hit the first path in the legacy gen4 app and guarded it there
 * (its 2026-04-18 "vitamins" commit); the unified client was lifted from gen1's copy.
 *
 *   1. connect while PokeAByte has no mapper loaded -> `loadMapper()` throws after
 *      `_deconstructMapper()` nulled `_debouceMap`, and the loop's first tick threw
 *      (known-legacy-bugs.md #29);
 *   2. connect before PokeAByte is up -> `connect()` returns false and the 5 s retry
 *      that succeeds never started the loop;
 *   3. PokeAByte restarts mid-session -> the reconnect from `onclose` never did either.
 *
 * Each scenario pushes a `battle.opponent.team_count` change through the hub after
 * the mapper is loaded and the gen4 debounce list is set, then checks the value lands
 * within a second (the hold is ten frames). A sanity scenario with the mapper loaded
 * before the connection is included. Exits non-zero on the first failure.
 *
 * The port is deliberately not 8085 (a real PokeAByte may be up) nor the harness's
 * 18085 (a parity run may be).
 */
import { setTimeout as sleep } from "node:timers/promises";
import { MockPokeAByte } from "./mock-pokeabyte/server.ts";
import { ReplayDriver, prescanPaths } from "./mock-pokeabyte/replay.ts";

// Node has no requestAnimationFrame; a 16 ms timer stands in, and a throwing frame is
// recorded rather than allowed to kill the process (that throw was the bug).
const rafErrors: string[] = [];
let rafTicks = 0;
(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (cb: FrameRequestCallback) =>
  setTimeout(() => {
    rafTicks++;
    try {
      cb(Date.now());
    } catch (err) {
      rafErrors.push(String(err));
    }
  }, 16).unref() as unknown as number;

const { GameHookMapperClient } = await import("../../src/renderer/packages/gameHookMapperClient.ts");

const argv = process.argv.slice(2);
const PORT = Number(argv.find((a) => a.startsWith("--port="))?.split("=")[1] ?? 18087);
const BASE = `http://localhost:${PORT}`;
const FIXTURE = "tools/fixtures/gen4/gen4-platinum-smoke.fixture.jsonl.gz";
const GEN4_DEBOUNCE = ["battle.opponent.active_pokemon", "battle.opponent.team", "player.team.0.species", "meta.global_pointer"];

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}${detail && !ok ? ` -- ${detail}` : ""}`);
  if (!ok) failures++;
}

type Scenario = "mapper loaded before connect" | "no mapper at connect" | "PokeAByte up after the overlay" | "PokeAByte restarts mid-session";

async function run(scenario: Scenario): Promise<void> {
  console.log(`\n${scenario}`);
  const mock = new MockPokeAByte({ port: PORT, log: () => {} });
  const driver = new ReplayDriver(FIXTURE, { state: mock.state, extraPaths: await prescanPaths(FIXTURE) });
  await driver.loadHeader();
  const serverLate = scenario === "PokeAByte up after the overlay";
  if (!serverLate) await mock.start();
  if (scenario === "mapper loaded before connect" || scenario === "PokeAByte restarts mid-session") mock.loadMapper();

  const client = new GameHookMapperClient(BASE);
  client.onMapperLoadError = () => {};
  let connectError: unknown = null;
  let connected: unknown = null;
  try {
    connected = await client.connect();
  } catch (err) {
    connectError = err;
  }
  check("connect() did not throw", connectError === null, String(connectError));
  check(`connect() resolved ${serverLate ? "false" : "true"}`, connected === !serverLate, String(connected));

  try {
    if (scenario === "no mapper at connect") {
      mock.loadMapper();
      await sleep(500);
    } else if (serverLate) {
      await mock.start();
      mock.loadMapper();
      await sleep(6500); // the client's retry is 5 s
      check("the 5 s retry reconnected", client.connected === true);
    } else if (scenario === "PokeAByte restarts mid-session") {
      await mock.stop();
      await sleep(300);
      await mock.start();
      mock.loadMapper();
      await sleep(6500);
      check("the reconnect from onclose succeeded", client.connected === true);
    }
    check("mapper loaded in the client", client.mapperLoaded === true && client._properties.length > 0);

    client.setDebouncePaths(GEN4_DEBOUNCE, 10);
    const prop = client.get("battle.opponent.team_count")!;
    check("team_count is debounced", client._debouceMap?.has("battle.opponent.team_count") === true);
    const before = prop.value;
    const dto = { ...mock.state.snapshot().find((p) => p.path === "battle.opponent.team_count")!, value: 6, fieldsChanged: ["value", "bytes"] };
    const ticksBefore = rafTicks;
    mock.pushChanges([dto]);
    await sleep(1000);
    const ticks = rafTicks - ticksBefore;
    check("debounced team_count change landed within a second", prop.value === 6, `before ${before}, after ${prop.value}, ${ticks} frames`);
    check("no frame threw", rafErrors.length === 0, rafErrors[0]);
    // One chain at a 16 ms timer is well under 70 frames a second here; two would be over.
    check("exactly one frame chain is running", ticks > 0 && ticks < 70, `${ticks} frames in 1 s`);
  } finally {
    await client.disconnect();
    await sleep(200);
    // Without this the hub close from `disconnect()` re-ran the reconnect path, which
    // set `connected` again and left the old client's loop ticking into the next scenario.
    check("disconnect() stays disconnected", client.connected === false && client._debounceLoopRunning === false);
    await mock.stop();
    rafErrors.length = 0;
  }
}

for (const scenario of [
  "mapper loaded before connect",
  "no mapper at connect",
  "PokeAByte up after the overlay",
  "PokeAByte restarts mid-session",
] as Scenario[]) {
  await run(scenario);
}

// disconnect() while the 5 s retry is armed. With PokeAByte down, connect() resolves
// false and arms a retry; a disconnect() in that window must cancel it -- otherwise the
// retry lands on a torn-down client (no SignalR client to start, so it skips straight to
// connected = true, onConnected(), a mapper GET and the frame loop) and PokeAByte coming
// up afterwards "reconnects" an overlay the shell has already dropped.
{
  console.log("\ndisconnect() while the 5 s retry is armed");
  const mock = new MockPokeAByte({ port: PORT, log: () => {} });
  const driver = new ReplayDriver(FIXTURE, { state: mock.state, extraPaths: await prescanPaths(FIXTURE) });
  await driver.loadHeader();
  const client = new GameHookMapperClient(BASE);
  client.onMapperLoadError = () => {};
  let onConnectedCalls = 0;
  client.onConnected = () => { onConnectedCalls++; };
  const connected = await client.connect();
  check("connect() resolved false with PokeAByte down", connected === false, String(connected));
  await client.disconnect();
  await mock.start();
  mock.loadMapper();
  const ticksBefore = rafTicks;
  await sleep(6500);
  check("the armed retry did not reconnect after disconnect()", client.connected === false && onConnectedCalls === 0, `connected ${client.connected}, onConnected x${onConnectedCalls}`);
  check("no frame loop started after disconnect()", client._debounceLoopRunning === false && rafTicks === ticksBefore, `${rafTicks - ticksBefore} frames`);
  check("no mapper loaded after disconnect()", client.mapperLoaded !== true);
  await mock.stop();
  rafErrors.length = 0;
}

console.log(failures === 0 ? "\ndebounce self-test: all checks passed" : `\ndebounce self-test: ${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
