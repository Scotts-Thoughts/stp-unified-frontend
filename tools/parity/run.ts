/**
 * Parity run: launch one overlay under Playwright-for-Electron, replay one fixture
 * into it through the mock PokeAByte, and capture every checkpoint.
 *
 *   npx tsx tools/parity/run.ts <target> <fixture.jsonl.gz> [options]
 *
 *   <target>            unified | legacy:genN@25 | legacy:genN@37
 *   --out=<dir>         capture root (default tools/baselines/<target>/<fixture>)
 *   --checkpoints=<f>   checkpoints.json from scan-fixture (default: alongside the fixture)
 *   --only=<id,id>      capture only these checkpoint ids
 *   --realtime          drive the wall clock instead of the virtual one (debugging only)
 *   --no-screenshots    skip oracle 2 while iterating on the others
 *   --no-shuckie        do not start the Super Shuckie stub (covers the "not running" path)
 *   --no-obs            do not start the OBS stub
 *   --writes=ignore     log PokeAByte writes without applying them
 *   --control[=<file>]  after the replay, drive the control server with a scripted queuer
 *                       session (default tools/parity/control-scripts/queuer-item.json)
 *                       and record it as oracle 6
 *   --keep-open         leave the app running after the replay (manual inspection)
 *   --redirect-ports    bind the stubs to spare ports and rewrite the app's URLs to match
 *
 * Ports 8085, 30158, 30159 and 4455 are single-tenant: close PokeAByte, Super Shuckie
 * and any running overlay first. The run fails fast and says so if one is taken.
 *
 * `--redirect-ports` is the escape hatch for a machine that is mid-session: the stubs
 * bind 18085/30258/14455 and an init script rewrites those hosts inside the renderer's
 * fetch/XHR/WebSocket. It changes URL strings only, so every oracle still holds. The
 * unified app's own control server moves to 30259 as well (STP_CONTROL_PORT); the legacy
 * apps hardcode 30159 in their renderers and cannot be moved, so legacy targets still
 * need that port free.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { _electron as electron, type ElectronApplication, type Page } from "playwright-core";
import { MockPokeAByte } from "./mock-pokeabyte/server.ts";
import { ObsStub } from "./mock-pokeabyte/obs-stub.ts";
import { ShuckieStub } from "./mock-pokeabyte/shuckie-stub.ts";
import { ReplayDriver } from "./mock-pokeabyte/replay.ts";
import { capture, installEvalShims, settle, type ConsoleEntry } from "./capture.ts";
import { scanFixture, type Checkpoint, type ScanResult } from "./scan-fixture.ts";
import { parseTarget, prepareSandbox, REPO, type Target } from "./targets.ts";
import { loadControlScript, runControlScript } from "./control-script.ts";

/** Canonical ports the overlays hardcode, and the spares --redirect-ports uses. */
const CANONICAL_PORTS = { pokeabyte: 8085, shuckie: 30158, obs: 4455, control: 30159 };
const SPARE_PORTS = { pokeabyte: 18085, shuckie: 30258, obs: 14455, control: 30259 };

const DEFAULT_CONTROL_SCRIPT = join(REPO, "tools", "parity", "control-scripts", "queuer-item.json");

const SIGNALR_PING_MS = 15000;

/**
 * How far the virtual clock is allowed to move in one step.
 *
 * Determinism needs the renderer to have *applied* every property change for time T
 * before the clock reads T. Hub messages arrive on the renderer's IO thread while
 * page.clock advances over CDP -- two transports with no ordering guarantee -- so the
 * runner batches pushes into a window, drains them with a CDP round trip, and only
 * then advances. Without this, two identical runs disagree on the timer display,
 * because Timer.update() samples Date.now() at a different point in the message stream.
 */
const CLOCK_STEP_MS = 50;

export interface RunOptions {
  target: string;
  fixture: string;
  out?: string;
  checkpointsFile?: string;
  only?: string[];
  realtime?: boolean;
  screenshots?: boolean;
  shuckie?: boolean;
  obs?: boolean;
  writes?: "apply" | "ignore";
  keepOpen?: boolean;
  redirectPorts?: boolean;
  /** Path to a control script, or true for the default queuer session. */
  control?: string | boolean;
  log?: (msg: string) => void;
}

export interface RunResult {
  target: string;
  fixture: string;
  outDir: string;
  checkpoints: string[];
  writes: number;
  obsMarkers: number;
  shuckieCalls: number;
  consoleErrors: number;
}

export async function run(opts: RunOptions): Promise<RunResult> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const target = parseTarget(opts.target);
  const fixtureName = basename(opts.fixture).replace(/\.fixture\.jsonl\.gz$/, "");
  const outDir = opts.out ?? join(REPO, "tools", "baselines", target.id.replaceAll(":", "_"), fixtureName);

  const scan = await loadCheckpoints(opts, fixtureName, log);
  const wanted = opts.only?.length
    ? scan.checkpoints.filter((c) => opts.only!.includes(c.id))
    : scan.checkpoints;
  log(`[run] ${target.id} x ${fixtureName}: ${wanted.length}/${scan.checkpoints.length} checkpoints`);

  prepareSandbox(target, { clean: true, log });
  mkdirSync(outDir, { recursive: true });

  const ports = opts.redirectPorts ? SPARE_PORTS : CANONICAL_PORTS;
  if (opts.redirectPorts) {
    log(`[run] --redirect-ports: stubs on ${JSON.stringify(ports)}`);
    // Only the unified app can be told to listen elsewhere; gen2-5 hardcode 30159.
    if (target.kind === "unified") target.controlPort = ports.control;
  }
  const mock = new MockPokeAByte({ port: ports.pokeabyte, writes: opts.writes ?? "apply", log });
  const shuckie = opts.shuckie === false ? null : new ShuckieStub({ port: ports.shuckie, log });
  const obs = opts.obs === false ? null : new ObsStub({ port: ports.obs, log });
  const driver = new ReplayDriver(opts.fixture, { state: mock.state, extraPaths: scan.extraPaths });
  const header = await driver.loadHeader();

  await mock.start();
  await shuckie?.start();
  await obs?.start();

  let app: ElectronApplication | null = null;
  const consoleLog: ConsoleEntry[] = [];
  const captured: string[] = [];

  try {
    const launched = await launch(target, log);
    app = launched.app;
    const page = launched.page;

    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") {
        consoleLog.push({ type: msg.type(), text: msg.text() });
      }
    });
    page.on("pageerror", (err) => consoleLog.push({ type: "pageerror", text: String(err) }));
    // "Failed to load resource" in the console does not say *which* resource; without
    // the URL a missing asset is impossible to chase down from a report.
    page.on("requestfailed", (request) => {
      consoleLog.push({
        type: "requestfailed",
        text: `${request.failure()?.errorText ?? "failed"} ${request.url()}`,
      });
    });

    await blockNetwork(page, ports, log);
    await installEvalShims(page);
    if (opts.redirectPorts) await installPortRedirect(page, ports);
    // clock.install() alone keeps ticking with real time; pauseAt() is what actually
    // freezes it, and without that the overlay's timer samples wall clock and two
    // identical runs disagree by tens of milliseconds. The clock and the URL rewrite
    // are init scripts, so the document has to be re-created for either to apply from
    // the app's first line.
    if (!opts.realtime) {
      await page.clock.install({ time: new Date(header.recordedAt) });
      await page.clock.pauseAt(new Date(header.recordedAt));
    }

    // Arm the mapper BEFORE the reload. That is what the queuer's launch order looks
    // like (PokeAByte already has the mapper loaded when the overlay starts), and it is
    // also the only deterministic order: a client that connects while no mapper is
    // loaded takes the swallowed-throw path in _establishConnection, leaves _debouceMap
    // null and then throws from its rAF loop on a frame boundary
    // (known-legacy-bugs.md #29), which lands in a different capture every run.
    mock.loadMapper();

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#app", { timeout: 30000 });
    // The document before the reload is not part of the run; its failed connection
    // attempts to the real ports would otherwise leak into oracle 9 non-deterministically.
    consoleLog.length = 0;

    await warmUp(page, opts);

    const pending = [...wanted].sort((a, b) => a.tMs - b.tMs);
    let nextPing = SIGNALR_PING_MS;
    /** Virtual time the renderer's clock currently reads. */
    let clockT = 0;
    const startedAt = Date.now();

    const advanceTo = async (t: number) => {
      const dt = t - clockT;
      if (dt <= 0) return;
      clockT = t;
      if (opts.realtime) {
        const wait = startedAt + t - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        return;
      }
      // Drain: everything pushed for the old time is applied before the clock moves.
      await barrier(page);
      // fastForward fires each due timer at most once, which is what a long gap between
      // fixture ticks means; runFor would replay thousands of 10 ms Shuckie polls.
      if (dt > 250) await page.clock.fastForward(dt);
      else await page.clock.runFor(dt);
      await barrier(page);
    };

    for await (const batch of driver.batches()) {
      // A checkpoint must be captured with the clock exactly at its time, and a long
      // gap must not be crossed in one silent leap.
      if (batch.tMs - clockT >= CLOCK_STEP_MS || (pending.length && pending[0].tMs <= batch.tMs)) {
        await advanceTo(batch.tMs);
      }

      mock.clockMs = batch.tMs;
      if (shuckie) {
        shuckie.clockMs = batch.tMs;
        if (batch.frames.length) shuckie.frame = batch.frames[batch.frames.length - 1];
      }
      if (obs) obs.clockMs = batch.tMs;

      while (batch.tMs >= nextPing) {
        mock.ping();
        nextPing += SIGNALR_PING_MS;
      }

      for (const kind of batch.lifecycle) {
        if (kind === "MapperLoaded") mock.loadMapper();
        else mock.unloadMapper();
      }
      mock.pushChanges(batch.changes);

      while (pending.length && pending[0].tMs <= batch.tMs) {
        const cp = pending.shift()!;
        await settleFor(page, opts, 1200);
        clockT += opts.realtime ? 0 : 1200;
        const dir = join(outDir, cp.id);
        await capture({
          page,
          dir,
          meta: { checkpoint: cp.id, target: target.id, fixture: fixtureName, tMs: cp.tMs, frame: cp.frame },
          console: consoleLog.splice(0),
          screenshot: opts.screenshots !== false,
        });
        writeFileSync(join(dir, "checkpoint.json"), JSON.stringify(cp, null, 1));
        captured.push(cp.id);
        log(`[run]   captured ${cp.id} (t=${(cp.tMs / 1000).toFixed(1)}s)`);
      }
    }

    // Everything the app did over the whole run, not per checkpoint.
    await settleFor(page, opts, 2000);

    if (opts.control) {
      const scriptFile = typeof opts.control === "string" ? opts.control : DEFAULT_CONTROL_SCRIPT;
      // The overlay's control server runs on real time, so the virtual clock has to be
      // nudged for any setTimeout the routes schedule; the exchanges themselves are
      // request/response and do not depend on it.
      const exchanges = await runControlScript(loadControlScript(scriptFile), {
        port: target.controlPort,
        generation: target.kind === "unified" ? "unified" : target.generation,
        log,
      });
      await settleFor(page, opts, 1200);
      writeFileSync(join(outDir, "status.json"), JSON.stringify(exchanges, null, 1));
      log(`[run] control script ${basename(scriptFile)}: ${exchanges.length} exchange(s)`);
    }

    writeFileSync(join(outDir, "writes.json"), JSON.stringify(mock.writeLog, null, 1));
    writeFileSync(join(outDir, "obs-markers.json"), JSON.stringify(obs?.markers ?? [], null, 1));
    writeFileSync(join(outDir, "shuckie-calls.json"), JSON.stringify(shuckie?.calls ?? [], null, 1));
    writeFileSync(join(outDir, "console-tail.json"), JSON.stringify(consoleLog, null, 1));
    collectFiles(target, outDir, log);
    writeFileSync(
      join(outDir, "run.json"),
      JSON.stringify(
        {
          target: target.id,
          electronMajor: target.electronMajor,
          fixture: opts.fixture,
          mapperId: header.mapperId,
          gameName: header.meta.gameName,
          checkpoints: captured,
          realtime: !!opts.realtime,
          writes: opts.writes ?? "apply",
          shuckie: !!shuckie,
          obs: !!obs,
          ranAt: new Date().toISOString(),
        },
        null,
        1,
      ),
    );

    if (opts.keepOpen) {
      log("[run] --keep-open: the app is still running. Ctrl-C to stop.");
      await new Promise(() => {});
    }
  } finally {
    await app?.close().catch(() => {});
    await Promise.all([mock.stop(), shuckie?.stop(), obs?.stop()]);
  }

  return {
    target: target.id,
    fixture: fixtureName,
    outDir,
    checkpoints: captured,
    writes: mock.writeLog.length,
    obsMarkers: obs?.markers.length ?? 0,
    shuckieCalls: shuckie?.calls.length ?? 0,
    consoleErrors: consoleLog.filter((c) => c.type !== "warning").length,
  };
}

async function launch(target: Target, log: (m: string) => void): Promise<{ app: ElectronApplication; page: Page }> {
  if (!existsSync(target.executablePath)) {
    throw new Error(`Electron not found at ${target.executablePath} -- run npm ci in that repo first.`);
  }
  log(`[run] launching ${target.executablePath} ${target.appArg} (cwd ${target.cwd})`);
  const app = await electron.launch({
    executablePath: target.executablePath,
    args: [target.appArg, "--force-device-scale-factor=1", `--user-data-dir=${target.userDataDir}`],
    cwd: target.cwd,
    env: {
      ...process.env,
      APPDATA: target.appData,
      LOCALAPPDATA: join(target.appData, "Local"),
      NODE_ENV: "production",
      ELECTRON_ENABLE_LOGGING: "1",
      // ./splits and ./storage resolve against this instead of the working directory
      // the harness happened to launch with (plan 1.7).
      STP_APP_ROOT: target.cwd,
      ...(target.controlPort === CANONICAL_PORTS.control ? {} : { STP_CONTROL_PORT: String(target.controlPort) }),
    },
    timeout: 60000,
  });

  const page = await app.firstWindow({ timeout: 60000 });
  // 1920x1080 content at zoom 1 is the parity claim; a display that cannot fit it
  // would silently rescale every rect.
  const bounds = await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setContentSize(1920, 1080);
    win.webContents.setZoomFactor(1);
    return win.getContentBounds();
  });
  if (bounds.width !== 1920 || bounds.height !== 1080) {
    throw new Error(
      `Content size is ${bounds.width}x${bounds.height}, not 1920x1080. ` +
        `The display cannot fit the overlay -- use a larger/virtual display for parity runs.`,
    );
  }
  return { app, page };
}

/** Fails every request that is not a stub, so hidden CDN/font loads become errors. */
async function blockNetwork(page: Page, ports: typeof CANONICAL_PORTS, log: (m: string) => void): Promise<void> {
  const allowed = new Set<string>();
  for (const host of ["localhost", "127.0.0.1"]) {
    for (const port of Object.values(ports)) allowed.add(`${host}:${port}`);
    // The overlay's own control server, and the dev server the queuer launches on.
    allowed.add(`${host}:30159`);
    allowed.add(`${host}:5173`);
  }
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === "file:" || url.protocol === "data:" || url.protocol === "blob:") return route.continue();
    if (allowed.has(url.host)) return route.continue();
    log(`[run] BLOCKED ${route.request().url()}`);
    return route.abort("blockedbyclient");
  });
}

/**
 * Rewrites the hardcoded stub hosts inside the renderer. Patching fetch, XHR and the
 * WebSocket constructor covers every path the five apps use (the mapper client and
 * SignalR use fetch/XHR + WebSocket; the Shuckie store uses fetch; the OBS marker
 * helper constructs a WebSocket directly).
 */
async function installPortRedirect(page: Page, ports: typeof CANONICAL_PORTS): Promise<void> {
  const map: Record<string, string> = {};
  for (const key of Object.keys(CANONICAL_PORTS) as (keyof typeof CANONICAL_PORTS)[]) {
    if (CANONICAL_PORTS[key] === ports[key]) continue;
    for (const host of ["localhost", "127.0.0.1"]) {
      map[`${host}:${CANONICAL_PORTS[key]}`] = `${host}:${ports[key]}`;
    }
  }
  if (Object.keys(map).length === 0) return;

  await page.addInitScript((portMap: Record<string, string>) => {
    const rewrite = (input: unknown): unknown => {
      if (typeof input !== "string") return input;
      let out = input;
      for (const [from, to] of Object.entries(portMap)) out = out.split(from).join(to);
      return out;
    };
    const nativeFetch = window.fetch;
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === "string") return nativeFetch(rewrite(input) as string, init);
      if (input instanceof URL) return nativeFetch(new URL(rewrite(input.href) as string), init);
      return nativeFetch(new Request(rewrite(input.url) as string, input), init);
    }) as typeof window.fetch;

    const nativeOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: unknown[]) {
      // @ts-expect-error variadic passthrough
      return nativeOpen.call(this, method, rewrite(String(url)) as string, ...rest);
    };

    const NativeWebSocket = window.WebSocket;
    const Patched = function (this: unknown, url: string | URL, protocols?: string | string[]) {
      return new NativeWebSocket(rewrite(String(url)) as string, protocols);
    } as unknown as typeof WebSocket;
    Patched.prototype = NativeWebSocket.prototype;
    Object.assign(Patched, {
      CONNECTING: NativeWebSocket.CONNECTING,
      OPEN: NativeWebSocket.OPEN,
      CLOSING: NativeWebSocket.CLOSING,
      CLOSED: NativeWebSocket.CLOSED,
    });
    window.WebSocket = Patched;
  }, map);
}

/**
 * Boot settles on real time, not virtual: reading the overlay settings goes over IPC to
 * the main process and back, and gen1 decides whether to write its encounter flags to
 * the ROM based on whether that read has finished (`settings.loading` in
 * components/settings/encounters.js -- known-legacy-bugs.md #30). Advancing only the
 * fake clock would let the replay start mid-boot, and the write log would differ run to
 * run. So the warm-up interleaves real sleeps with clock steps until the app stops
 * doing anything.
 */
async function warmUp(page: Page, opts: RunOptions): Promise<void> {
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 50));
    if (!opts.realtime) await page.clock.runFor(200);
    await barrier(page);
  }
}

/** One CDP round trip: everything already queued on the renderer's task queue has run. */
async function barrier(page: Page): Promise<void> {
  await page.evaluate("0");
}

async function settleFor(page: Page, opts: RunOptions, virtualMs: number): Promise<void> {
  if (opts.realtime) {
    await new Promise((r) => setTimeout(r, Math.min(virtualMs, 1500)));
    await page.evaluate(
      () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
    );
    return;
  }
  await settle(page, virtualMs);
}

/** Files under userData that the overlay itself writes (plan section 2 persistence rule). */
const APP_DATA_ENTRIES = ["data", "dev-window-state.json", "settings.json", "storage"];

/** Oracles 3 and 4: the split CSVs and the app-data tree, exactly as written. */
function collectFiles(target: Target, outDir: string, log: (m: string) => void): void {
  const collected = join(outDir, "files");
  mkdirSync(collected, { recursive: true });
  const splits = join(target.cwd, "splits");
  if (existsSync(splits)) cpSync(splits, join(collected, "splits"), { recursive: true });
  // Only what the APP writes. Everything else under userData belongs to Chromium's own
  // profile -- caches, DIPS, DevToolsActivePort, the DPAPI-encrypted Local State key,
  // the leveldb log framing -- and differs byte-for-byte between two identical runs.
  // localStorage is not read off disk either: capture.ts dumps it from the page, decoded.
  const appData = target.userDataDir;
  if (!existsSync(appData)) {
    log(`[run] no app data at ${appData}`);
    return;
  }
  for (const name of APP_DATA_ENTRIES) {
    const from = join(appData, name);
    if (existsSync(from)) cpSync(from, join(collected, "appdata", name), { recursive: true });
  }
}

async function loadCheckpoints(opts: RunOptions, fixtureName: string, log: (m: string) => void): Promise<ScanResult> {
  const candidate =
    opts.checkpointsFile ?? join(REPO, "tools", "reports", `${fixtureName}.checkpoints.json`);
  if (existsSync(candidate)) return JSON.parse(readFileSync(candidate, "utf8")) as ScanResult;
  log(`[run] no checkpoints at ${candidate}; scanning the fixture`);
  const scan = await scanFixture(opts.fixture);
  mkdirSync(join(REPO, "tools", "reports"), { recursive: true });
  writeFileSync(candidate, JSON.stringify(scan, null, 2));
  return scan;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const positional = argv.filter((a) => !a.startsWith("--"));
  if (positional.length < 2) {
    console.error("usage: run.ts <target> <fixture.jsonl.gz> [--out=dir] [--only=id,id] [--realtime] [--no-screenshots]");
    process.exit(2);
  }
  const strFlag = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
  const result = await run({
    target: positional[0],
    fixture: positional[1],
    out: strFlag("out"),
    checkpointsFile: strFlag("checkpoints"),
    only: strFlag("only")?.split(",").filter(Boolean),
    realtime: argv.includes("--realtime"),
    screenshots: !argv.includes("--no-screenshots"),
    shuckie: !argv.includes("--no-shuckie"),
    obs: !argv.includes("--no-obs"),
    writes: (strFlag("writes") as "apply" | "ignore") ?? "apply",
    keepOpen: argv.includes("--keep-open"),
    redirectPorts: argv.includes("--redirect-ports"),
    control: strFlag("control") ?? argv.includes("--control"),
  });
  console.log(
    `\n${result.target} x ${result.fixture}: ${result.checkpoints.length} captures, ${result.writes} writes, ` +
      `${result.obsMarkers} OBS markers, ${result.shuckieCalls} Shuckie calls, ${result.consoleErrors} console errors`,
  );
  console.log(`captures in ${result.outDir}`);
}
