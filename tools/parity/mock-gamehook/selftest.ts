/**
 * Proves the mock is indistinguishable from a real GameHook instance to the code that
 * matters: it drives the real GameHookMapperClient (the same file the app ships)
 * against MockGameHook and asserts detection, meta (including the Windows
 * backslash/forward-slash mapper-key shapes a real build lists), the property tree,
 * update batches, debounce, a lost-socket reconnect, the mapper poll, writes and a
 * clean disconnect.
 *
 *   npx tsx tools/parity/mock-gamehook/selftest.ts [--port=61458]
 *
 * Exits non-zero on the first failure, so it can gate a parity run. The port is
 * deliberately not GameHook's real default (61358): the protocol is what is under
 * test, and this has to run while a real GameHook is up.
 */
import { setTimeout as sleep } from "node:timers/promises";
import { createServer } from "node:http";
import { MockGameHook } from "./server.ts";

// Node has no requestAnimationFrame; the client's debounce loop calls it
// unconditionally. A 16 ms timer stands in, and a throwing frame is recorded rather
// than allowed to kill the process (mirrors tools/parity/mock-pokeabyte/selftest.ts).
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

// Activates the client's Cutter-probe bookkeeping (`_received`/`_receivedBatches`),
// normally only present when the Cutter editor runs the overlay (src/main/cutter.ts).
// Nothing here calls `window.__cutterProbe` itself, so the `document.getAnimations()`
// inside it is never reached and no DOM stand-in is needed.
(globalThis as { window?: unknown }).window = { api: { cutter: { toolUrl: "x" } } };

const { GameHookMapperClient } = await import("../../../src/renderer/packages/gameHookMapperClient.ts");

const argv = process.argv.slice(2);
const PORT = Number(argv.find((a) => a.startsWith("--port="))?.split("=")[1] ?? 61458);

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}${detail && !ok ? ` -- ${detail}` : ""}`);
  if (!ok) failures++;
}

// An official mapper's key lists Windows path separators on a real build; a custom
// one already uses forward slashes.
const OFFICIAL_KEY = "gba\\pokemon_emerald.xml";
const CUSTOM_KEY = "custom/ST/gen4/pokemon_platinum_ne.xml";
const RUBY_KEY = "gba\\pokemon_ruby.xml";

const mock = new MockGameHook({ port: PORT, log: () => {} });
mock.registerMapper(OFFICIAL_KEY, { id: "pokemon_emerald", name: "Pokémon Emerald", platform: "gba", custom: false });
mock.registerMapper(CUSTOM_KEY, { id: "pokemon_platinum_ne", name: "Pokémon Platinum (NE)", platform: "nds", custom: true });
mock.registerMapper(RUBY_KEY, { id: "pokemon_ruby", name: "Pokémon Ruby", platform: "gba", custom: false });

const SEEDS_EMERALD = [
  { path: "player.name", type: "string" as const, value: "RED", bytes: [82, 69, 68] },
  { path: "player.team.0.species", type: "uint" as const, value: 1, bytes: [1, 0], address: 0x1000, length: 2, region: "wram" },
  { path: "player.team.0.level", type: "uint" as const, value: 5, bytes: [5], address: 0x1010, length: 1, region: "wram" },
  { path: "patch.flags.bit0", type: "bool" as const, value: false, bytes: [0] },
  { path: "battle.data", type: "bitArray" as const, value: [1, 0, 1, 0], bytes: [10] },
];
mock.loadMapper(0, OFFICIAL_KEY, SEEDS_EMERALD);
mock.loadMapper(1, CUSTOM_KEY, [{ path: "player.name", type: "string" as const, value: "BLU", bytes: [66, 76, 85] }]);

await mock.start();

try {
  // --- 1. Detection --------------------------------------------------------------
  const gh = new GameHookMapperClient(mock.instanceBase(0));
  check("detects GameHook from GET /", (await gh._detectTool()) === "gamehook");

  const html = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<html><body>PokeAByte</body></html>");
  });
  await new Promise<void>((resolve) => html.listen(0, "127.0.0.1", resolve));
  const htmlPort = (html.address() as { port: number }).port;
  const pk = new GameHookMapperClient(`http://127.0.0.1:${htmlPort}`);
  check("detects PokeAByte from an HTML root", (await pk._detectTool()) === "pokeabyte");
  await new Promise<void>((resolve) => html.close(() => resolve()));

  // --- 2. Connect, meta, the property tree, detail fields -------------------------
  let mapperLoadedCount = 0;
  let unloadedCount = 0;
  const changedGlobally: string[] = [];
  gh.onMapperLoaded = () => {
    mapperLoadedCount++;
  };
  gh.onMapperUnloaded = () => {
    unloadedCount++;
  };
  gh.onPropertyChanged = (p) => {
    changedGlobally.push(p.path);
  };

  const connected = await gh.connect();
  check("connect() resolved true", connected === true);
  check("client is in GameHook mode", gh._mode === "gamehook");
  check("mapper is loaded", gh.mapperLoaded === true);
  check("onMapperLoaded fired once", mapperLoadedCount === 1, `fired ${mapperLoadedCount}x`);
  check(
    "meta.path strips the backslashes an official Windows key lists",
    gh.meta?.path === "gba/pokemon_emerald.xml",
    JSON.stringify(gh.meta),
  );
  check("meta.key is kept exactly as /mappers listed it", gh.meta?.key === OFFICIAL_KEY, gh.meta?.key);
  check("meta.gameName round-trips", gh.meta?.gameName === "Pokémon Emerald", gh.meta?.gameName);
  check("property count matches the seeded tree", gh._properties.length === SEEDS_EMERALD.length, String(gh._properties.length));

  const species = gh.get("player.team.0.species")!;
  check(
    "a numeric path segment becomes an array, reachable through properties.*",
    (gh.properties as any).player?.team?.[0]?.species?.path === "player.team.0.species",
  );
  check(
    "a property's detail fields round-trip",
    species.address === 0x1000 && species.length === 2 && species.value === 1,
    JSON.stringify({ address: species.address, length: species.length, value: species.value }),
  );

  // A custom mapper's key already uses forward slashes; only the "custom/" prefix is stripped.
  const custom = new GameHookMapperClient(mock.instanceBase(1));
  await custom.connect();
  check("custom mapper: meta.path has 'custom/' stripped", custom.meta?.path === "ST/gen4/pokemon_platinum_ne.xml", custom.meta?.path);
  check("custom mapper: meta.key is untouched", custom.meta?.key === CUSTOM_KEY, custom.meta?.key);
  await custom.disconnect();

  // A connection string with no /instances/<n> path falls back to instance 0.
  const bare = new GameHookMapperClient(mock.origin);
  await bare.connect();
  check("a bare origin defaults to /instances/0", bare.meta?.id === "pokemon_emerald", bare.meta?.id);
  await bare.disconnect();

  // --- 3. Update batches -----------------------------------------------------------
  let changeFired = 0;
  species.change(() => {
    changeFired++;
  });
  const batchesBefore = gh._receivedBatches;

  mock.pushChanges(0, [{ path: "player.team.0.species", value: 1, bytes: [1, 0] }]); // unchanged value
  await sleep(80);
  check("a same-value push does not fire .change()", changeFired === 0, `fired ${changeFired}x`);
  check("... but still counts a received batch", gh._receivedBatches === batchesBefore + 1, String(gh._receivedBatches));

  mock.pushChanges(0, [{ path: "player.team.0.species", value: 2, bytes: [2, 0] }]);
  await sleep(80);
  check("a changed value fires .change()", changeFired === 1, `fired ${changeFired}x`);
  check("... and the property's value updates", species.value === 2, String(species.value));
  check("... and onPropertyChanged fires globally", changedGlobally.includes("player.team.0.species"));
  check(
    "... and _received holds the bytes GameHook sent",
    JSON.stringify(gh._received?.get("player.team.0.species")) === JSON.stringify([2, 0]),
  );

  mock.pushChanges(0, [{ path: "player.team.0.species", value: 2, bytes: [3, 0] }]); // bytes-only change
  await sleep(80);
  check("a bytes-only change does not fire .change()", changeFired === 1, `fired ${changeFired}x`);
  check("... but does update bytes", JSON.stringify(species.bytes) === JSON.stringify([3, 0]), JSON.stringify(species.bytes));

  mock.sendRawFrame(0, [{ path: "no.such.path", value: 1, bytes: [1] }]);
  await sleep(80);
  check("a batch naming no known path still counts as received", gh._receivedBatches === batchesBefore + 4, String(gh._receivedBatches));

  // --- 4. Debounce -----------------------------------------------------------------
  gh.setDebouncePaths(["player.team.0"], 10);
  const levelBefore = gh.get("player.team.0.level")!.value;
  mock.pushChanges(0, [{ path: "player.team.0.level", value: 9, bytes: [9] }]);
  await sleep(30);
  check(
    "a debounced path is held, not applied immediately",
    gh.get("player.team.0.level")!.value === levelBefore,
    String(gh.get("player.team.0.level")!.value),
  );
  // The hold is 10 frames of the client's own ~16 ms rAF-driven loop (~160 ms); a full
  // second of margin, as tools/parity/debounce-selftest.ts also gives it, so a slow
  // CI box or a GC pause never makes this flaky.
  await sleep(1000);
  check(
    "... and released once its hold expires",
    gh.get("player.team.0.level")!.value === 9,
    String(gh.get("player.team.0.level")!.value),
  );
  gh.setDebouncePaths([]); // Clear it: the write tests below should not be held.

  // --- 5. Writes ---------------------------------------------------------------------
  const warnings: string[] = [];
  const realWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
  try {
    await gh.get("player.name")!.set("GREEN");
    await sleep(50);
    check(
      "set() posts {value} to the property's own route",
      mock.writeLog.at(-1)?.path === "player.name" && JSON.stringify(mock.writeLog.at(-1)?.body) === JSON.stringify({ value: "GREEN" }),
      JSON.stringify(mock.writeLog.at(-1)),
    );

    await gh.get("player.name")!.setBytes([7, 8, 9]);
    await sleep(50);
    check(
      "setBytes() posts {bytes}",
      JSON.stringify(mock.writeLog.at(-1)?.body) === JSON.stringify({ bytes: [7, 8, 9] }),
      JSON.stringify(mock.writeLog.at(-1)),
    );

    await gh.get("player.name")!.freeze(true);
    await sleep(50);
    check("freeze() still writes (GameHook has no freeze endpoint)", mock.writeLog.at(-1)?.status === 200);
    check(
      "... and warns once about the missing freeze endpoint",
      warnings.some((w) => w.includes("no freeze endpoint")),
      warnings.join(" | "),
    );

    const before = mock.writeLog.length;
    await gh.setBits([
      { path: "player.team.0.level", value: 11 },
      { path: "player.team.0.species", value: 3 },
    ]);
    await sleep(80);
    check(
      "setBits() writes each item to its own path in order",
      mock.writeLog.length === before + 2 &&
        mock.writeLog[before].path === "player.team.0.level" &&
        mock.writeLog[before + 1].path === "player.team.0.species",
      JSON.stringify(mock.writeLog.slice(before)),
    );
  } finally {
    console.warn = realWarn;
  }

  // --- 6. A lost socket reconnects and reloads ----------------------------------------
  let reconnectDisconnected = false;
  gh.onDisconnected = () => {
    reconnectDisconnected = true;
  };
  mapperLoadedCount = 0;
  mock.dropSockets(0);
  await sleep(500);
  check("a 1001 close notifies onDisconnected", reconnectDisconnected === true);
  check(
    "... and reconnects and reloads the mapper",
    mapperLoadedCount === 1 && gh.mapperLoaded === true,
    `fired ${mapperLoadedCount}x, loaded=${gh.mapperLoaded}`,
  );

  // --- 7. The 2 s mapper poll notices an unload and a different mapper ----------------
  mock.unloadMapper(0);
  await sleep(2300);
  check(
    "the 2 s poll notices an unload",
    unloadedCount === 1 && gh.mapperLoaded === false,
    `unloaded ${unloadedCount}x, loaded=${gh.mapperLoaded}`,
  );

  mock.loadMapper(0, RUBY_KEY, [{ path: "player.name", type: "string", value: "SAPPHIRE_TEST", bytes: [1] }]);
  mapperLoadedCount = 0;
  await sleep(2300);
  check(
    "the 2 s poll notices a different mapper",
    mapperLoadedCount === 1 && gh.meta?.id === "pokemon_ruby",
    `fired ${mapperLoadedCount}x, id=${gh.meta?.id}`,
  );

  // --- 8. disconnect() leaves no timers or sockets ------------------------------------
  await gh.disconnect();
  await sleep(50);
  check("disconnect() clears the update socket", gh._gameHookSocket === null);
  check("disconnect() clears the mapper poll", gh._gameHookPollTimer === null);
  check("disconnect() clears the retry timer", gh._retryTimer === null);
  check("the mock has no open sockets left for that instance", mock.socketCount(0) === 0, String(mock.socketCount(0)));
  check("no requestAnimationFrame callback threw", rafErrors.length === 0, rafErrors.join(" | "));
} finally {
  await mock.stop();
}

console.log(failures === 0 ? "\nmock-gamehook self-test: all checks passed" : `\nmock-gamehook self-test: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
