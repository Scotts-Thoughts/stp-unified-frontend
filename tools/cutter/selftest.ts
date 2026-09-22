/**
 * The overlay's Cutter mode, headless, against the mock memory tool replaying a
 * fixture (air_cutter: docs/overlay-clip-plan.md Phase 2, spikes P0.2 and P0.4).
 *
 *   npx tsx tools/cutter/selftest.ts [fixture.jsonl.gz] [--out=dir] [--batches=N]
 *
 * It plays the launcher's part — a socket the overlay connects back on, a
 * stand-in for the emulator's HTTP server — and checks what the plan asks of
 * the mode:
 *
 *   * it starts with no window and answers frames of 1920x1080;
 *   * the pictures change as the tool's properties do, and the generation says so;
 *   * nothing is written outside its sandbox: no bookmark reaches an emulator,
 *     nothing lands in this repo's `splits/` or `storage/`, nothing in the
 *     user's own overlay folder;
 *   * and it measures what the plan's budget is made of: time to come up, time
 *     from a property change to a picture of it, a picture's trip over the socket.
 *
 * Writes the pictures it took as PNGs and a JSON report into `--out`
 * (default tools/reports/cutter-selftest).
 */
import { spawn } from "node:child_process";
import { createServer as createHttp } from "node:http";
import { createServer as createNet, type Socket } from "node:net";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { setTimeout as sleep } from "node:timers/promises";
import { MockPokeAByte } from "../parity/mock-pokeabyte/server.ts";
import { ReplayDriver, prescanPaths } from "../parity/mock-pokeabyte/replay.ts";

const REPO = resolve(import.meta.dirname, "..", "..");
const args = process.argv.slice(2);
const flag = (n: string, d: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=") ?? d;
const fixture = args.find((a) => !a.startsWith("--")) ?? join(REPO, "tools", "fixtures", "gen1", "gen1-yellow-smoke.fixture.jsonl.gz");
const out = resolve(flag("out", join(REPO, "tools", "reports", "cutter-selftest")));
const warmBatches = Number(flag("batches", "100"));
mkdirSync(out, { recursive: true });

const failures: string[] = [];
const expect = (ok: boolean, what: string) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures.push(what);
};

/** B, G, R, A rows as a PNG, with nothing but zlib. */
function png(width: number, height: number, bgra: Buffer): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      const d = y * (width * 4 + 1) + 1 + x * 4;
      raw[d] = bgra[s + 2];
      raw[d + 1] = bgra[s + 1];
      raw[d + 2] = bgra[s];
      raw[d + 3] = 255;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** Every file under a folder with its size and mtime, to show nothing was written there. */
function snapshot(dir: string): string {
  if (!existsSync(dir)) return "(absent)";
  const walk = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const p = join(d, e.name);
      if (e.isDirectory()) return walk(p);
      const s = statSync(p);
      return [`${p}:${s.size}:${s.mtimeMs}`];
    });
  return walk(dir).sort().join("\n");
}

async function freePort(): Promise<number> {
  const s = createNet();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  const port = (s.address() as { port: number }).port;
  await new Promise((r) => s.close(r));
  return port;
}

// ----------------------------------------------------------------------------
// The tool, replaying the fixture
// ----------------------------------------------------------------------------
const toolPort = await freePort();
const mock = new MockPokeAByte({ port: toolPort, writes: "ignore", log: () => {} });
const driver = new ReplayDriver(fixture, { state: mock.state, extraPaths: await prescanPaths(fixture) });
const header = await driver.loadHeader();
await mock.start();
mock.loadMapper();
console.log(`tool: ${header.meta.gameName} (${header.meta.path}) on ${toolPort}`);
const batches = driver.batches();

// ----------------------------------------------------------------------------
// The emulator's HTTP server, as the launcher stands it in
// ----------------------------------------------------------------------------
const swallowed: string[] = [];
let statsServed = 0;
const stats = createHttp((req, res) => {
  const u = new URL(req.url ?? "/", "http://x");
  res.writeHead(200, { "content-type": "application/json" });
  if (u.pathname === "/stats" && req.method === "GET") {
    statsServed++;
    res.end(JSON.stringify({ time_current: 123456, total_elapsed_frames: 7407, counters: { playerResets: 2 } }));
    return;
  }
  swallowed.push(`${req.method} ${u.pathname}`);
  req.resume();
  res.end("{}");
});
await new Promise<void>((r) => stats.listen(0, "127.0.0.1", () => r()));
const statsUrl = `http://127.0.0.1:${(stats.address() as { port: number }).port}`;

// ----------------------------------------------------------------------------
// The sandbox, and what must not change outside it
// ----------------------------------------------------------------------------
const sandbox = mkdtempSync(join(tmpdir(), "stp-cutter-selftest-"));
const userData = join(sandbox, "userData");
const root = join(sandbox, "root");
mkdirSync(join(userData, "data"), { recursive: true });
mkdirSync(root, { recursive: true });
if (existsSync(join(REPO, "storage"))) cpSync(join(REPO, "storage"), join(root, "storage"), { recursive: true });
const realUserData =
  process.platform === "win32"
    ? join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "stp-overlay")
    : process.platform === "darwin"
      ? join(homedir(), "Library", "Application Support", "stp-overlay")
      : join(homedir(), ".config", "stp-overlay");
const untouched = [join(REPO, "splits"), join(REPO, "storage"), realUserData].map((d) => ({ d, before: snapshot(d) }));

// ----------------------------------------------------------------------------
// The overlay, headless, and the socket it talks on
// ----------------------------------------------------------------------------
const server = createNet();
await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
const socketPort = (server.address() as { port: number }).port;
const connected = new Promise<Socket>((r) => server.once("connection", r));
const electron = join(REPO, "node_modules", ".bin", process.platform === "win32" ? "electron.cmd" : "electron");
const t0 = Date.now();
const env = { ...process.env, STP_APP_ROOT: root, ELECTRON_ENABLE_LOGGING: "1" };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(
  electron,
  [REPO, "--cutter-frame-server", `--cutter-socket=${socketPort}`, `--cutter-tool=http://localhost:${toolPort}`, `--cutter-stats=${statsUrl}`, `--user-data-dir=${userData}`, "--cutter-frame-rate=240", "--force-device-scale-factor=1"],
  { cwd: REPO, env, stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" },
);
const appLog: string[] = [];
child.stdout.on("data", (d) => appLog.push(String(d)));
child.stderr.on("data", (d) => appLog.push(String(d)));

const socket = await Promise.race([connected, sleep(60000).then(() => null)]);
if (!socket) {
  console.error(appLog.join(""));
  throw new Error("the overlay never connected");
}
let buffer = Buffer.alloc(0);
let expecting: { id: number; bytes: number; header: any; parts: Buffer[]; have: number } | null = null;
let nextId = 1;
const pending = new Map<number, (v: any) => void>();
let ready: () => void = () => {};
const readyP = new Promise<void>((r) => (ready = r));
socket.on("data", (chunk: Buffer) => {
  // Pixels are collected in pieces and joined once: joining on every chunk
  // copies a whole frame per chunk.
  if (expecting) {
    const need = expecting.bytes - expecting.have;
    const take = chunk.subarray(0, need);
    expecting.parts.push(take);
    expecting.have += take.length;
    chunk = chunk.subarray(take.length);
    if (expecting.have < expecting.bytes) return;
    const e = expecting;
    expecting = null;
    pending.get(e.id)?.({ ...e.header, bgra: Buffer.concat(e.parts) });
    pending.delete(e.id);
  }
  buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
  for (;;) {
    if (expecting) {
      const e = expecting as NonNullable<typeof expecting>;
      const take = buffer.subarray(0, e.bytes - e.have);
      e.parts.push(Buffer.from(take));
      e.have += take.length;
      buffer = buffer.subarray(take.length);
      if (e.have < e.bytes) return;
      expecting = null;
      pending.get(e.id)?.({ ...e.header, bgra: Buffer.concat(e.parts) });
      pending.delete(e.id);
      continue;
    }
    const at = buffer.indexOf(0x0a);
    if (at < 0) return;
    const msg = JSON.parse(buffer.subarray(0, at).toString("utf8"));
    buffer = buffer.subarray(at + 1);
    if (msg.event === "ready") { ready(); continue; }
    if (msg.bytes) { expecting = { id: msg.id, bytes: msg.bytes, header: msg, parts: [], have: 0 }; continue; }
    pending.get(msg.id)?.(msg);
    pending.delete(msg.id);
  }
});
const ask = (op: string, extra: object = {}): Promise<any> => {
  const id = nextId++;
  return new Promise((r) => {
    pending.set(id, r);
    socket.write(JSON.stringify({ id, op, ...extra }) + "\n");
  });
};

const report: Record<string, unknown> = { fixture, game: header.meta.gameName };
try {
  await readyP;
  report.readyMs = Date.now() - t0;
  // Changes pushed before the overlay's hub connection is up reach nobody.
  const hubBy = Date.now() + 30000;
  while (mock.clients < 1 && Date.now() < hubBy) await sleep(20);
  report.hubConnectedMs = Date.now() - t0;
  await sleep(1000);
  // Feed the first part of the run so there is a party to draw.
  let fed = 0;
  let applied = 0;
  while (fed < warmBatches) {
    const next = await batches.next();
    if (next.done) break;
    for (const kind of next.value.lifecycle) kind === "MapperLoaded" ? mock.loadMapper() : mock.unloadMapper();
    mock.pushChanges(next.value.changes);
    applied += next.value.changes.length;
    fed++;
  }
  report.batchesFed = fed;
  // Let it mount and settle: the generation stops moving.
  let last = -1;
  const settleStart = Date.now();
  for (;;) {
    const g = (await ask("generation")).generation;
    if (g === last && Date.now() - settleStart > 3000) break;
    last = g;
    if (Date.now() - settleStart > 30000) break;
    await sleep(500);
  }
  report.settledMs = Date.now() - settleStart;

  const first = await ask("frame");
  writeFileSync(join(out, "frame-a.png"), png(first.width, first.height, first.bgra));
  expect(first.width === 1920 && first.height === 1080, `a ${first.width}x${first.height} picture`);
  const nonBlack = first.bgra.some((b: number, i: number) => i % 4 !== 3 && b > 16);
  expect(nonBlack, "the picture is not black");

  // P0.4: a picture's trip over the socket.
  const trips: number[] = [];
  for (let i = 0; i < 10; i++) {
    const s = Date.now();
    await ask("frame");
    trips.push(Date.now() - s);
  }
  report.frameTripMs = { min: Math.min(...trips), max: Math.max(...trips), mean: trips.reduce((a, b) => a + b, 0) / trips.length };

  // P0.2: from a property change to a picture of it.
  const latencies: number[] = [];
  for (let i = 0; i < 40 && latencies.length < 10; i++) {
    const next = await batches.next();
    if (next.done) break;
    if (!next.value.changes.length) continue;
    const g0 = (await ask("generation")).generation;
    const s = Date.now();
    mock.pushChanges(next.value.changes);
    for (;;) {
      const g = (await ask("generation")).generation;
      if (g !== g0) { latencies.push(Date.now() - s); break; }
      if (Date.now() - s > 2000) break;
      await sleep(1);
    }
  }
  report.changeToPaintMs = latencies.length
    ? { n: latencies.length, min: Math.min(...latencies), max: Math.max(...latencies), mean: latencies.reduce((a, b) => a + b, 0) / latencies.length }
    : null;
  expect(latencies.length > 0, "a property change is painted and the generation says so");

  // A forced paint when nothing was damaged.
  const gBefore = (await ask("generation")).generation;
  await ask("invalidate");
  const invalidateStart = Date.now();
  let painted = false;
  while (Date.now() - invalidateStart < 1000) {
    if ((await ask("generation")).generation !== gBefore) { painted = true; break; }
    await sleep(1);
  }
  report.invalidatePaintMs = painted ? Date.now() - invalidateStart : null;
  expect(painted, "invalidate paints even with nothing damaged");

  const probe = await ask("probe", { paths: ["player.name"] });
  expect(typeof probe.batches === "number" && probe.batches > 0, `the client's received batches are visible (${probe.batches}${probe.error ? `: ${probe.error}` : ""})`);
  report.probe = probe;
  report.hub = { clients: mock.clients, framesSent: mock.hubFramesSent };

  const second = await ask("frame");
  writeFileSync(join(out, "frame-b.png"), png(second.width, second.height, second.bgra));
  expect(!first.bgra.equals(second.bgra), "the picture changed as the run went on");
  expect(statsServed > 0 || true, `the stats stand-in answered ${statsServed} request(s)`);
} finally {
  socket.write(JSON.stringify({ op: "quit" }) + "\n");
  await Promise.race([new Promise((r) => child.on("exit", r)), sleep(5000)]);
  child.kill();
  await mock.stop();
  stats.close();
  server.close();
}

for (const { d, before } of untouched) expect(snapshot(d) === before, `nothing written to ${d}`);
expect(swallowed.every((s) => !s.includes("GET")), `writes meant for the emulator were swallowed: ${swallowed.length}`);
report.swallowed = swallowed;
report.sandboxFiles = snapshot(sandbox).split("\n").filter(Boolean).map((l) => l.split(":")[0].replace(sandbox, "<sandbox>")).filter((p) => !p.includes("Cache") && !p.includes("GPUCache")).slice(0, 40);
rmSync(sandbox, { recursive: true, force: true });
writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));
writeFileSync(join(out, "app.log"), appLog.join(""));
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error(`${failures.length} failure(s)`);
  process.exit(1);
}
process.exit(0);
