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
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { _electron as electron, type ElectronApplication, type Page } from "playwright-core";
import { MockPokeAByte } from "./mock-pokeabyte/server.ts";
import { ObsStub } from "./mock-pokeabyte/obs-stub.ts";
import { ShuckieStub } from "./mock-pokeabyte/shuckie-stub.ts";
import { ReplayDriver } from "./mock-pokeabyte/replay.ts";
import { capture, finishAnimations, flushRender, installEvalShims, settle, waitForRenderIdle, type ConsoleEntry } from "./capture.ts";
import { scanFixture, type Checkpoint, type ScanResult } from "./scan-fixture.ts";
import { parseTarget, prepareSandbox, REPO, type Target } from "./targets.ts";
import { loadControlScript, runControlScript } from "./control-script.ts";
import { checkWriteLog } from "./profile-check.ts";

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
  // A run's output directory is exactly that run: cpSync into a reused --out dir
  // adds and overwrites but never deletes, and three files from an earlier gen1 run
  // once showed up as "only in candidate" against a gen2 baseline.
  rmSync(outDir, { recursive: true, force: true });
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
      // A load the page itself cancelled -- an <img> whose src changed before the
      // previous file arrived -- is not a failure. It shows up for the asset scheme
      // and not for file:// only because the main process is slower than the disk.
      if (request.failure()?.errorText === "net::ERR_ABORTED") return;
      consoleLog.push({
        type: "requestfailed",
        text: `${request.failure()?.errorText ?? "failed"} ${request.url()}`,
      });
    });

    await blockNetwork(page, ports, log);
    await installEvalShims(page);
    await installHubReceiptProbe(page);
    if (opts.redirectPorts) await installPortRedirect(page, ports);
    // clock.install() alone keeps ticking with real time; pauseAt() is what actually
    // freezes it, and without that the overlay's timer samples wall clock and two
    // identical runs disagree by tens of milliseconds. The clock and the URL rewrite
    // are init scripts, so the document has to be re-created for either to apply from
    // the app's first line.
    if (!opts.realtime) {
      // Installed a second *before* the pause instant. Between these two calls the
      // clock of the current (pre-reload) document runs on real time, and an app with
      // a 10 ms poll (gen4's Shuckie interval) can carry it past `recordedAt` before
      // pauseAt() lands -- "Cannot fast-forward to the past", once in a few runs. With
      // the install a second earlier the pause is always a forward move there. The
      // re-created document replays the log and gets `recordedAt` from the pauseAt
      // entry regardless, and the init script below pins its frame grid.
      const recordedAt = new Date(header.recordedAt).getTime();
      await page.clock.install({ time: new Date(recordedAt - 1000) });
      await page.clock.pauseAt(new Date(recordedAt));
      // Pin the animation-frame grid. The fake clock schedules requestAnimationFrame
      // for the next multiple of 16 of its *tick* counter, and the tick counter of a
      // re-created document is not zero at the pause: the clock replays its log there,
      // and between the `install` entry and the `pauseAt` entry it advances the ticks
      // by the real milliseconds that passed between the two calls above -- a few ms
      // of CDP round trips, different every run. Two runs then have their frame grids
      // a few ms apart, and an overlay timer that samples Date.now() on each frame
      // shows a different hundredth wherever a 10 ms boundary falls between the two
      // grids (docs/parity-harness.md 9.11). The app has not run a line yet when this
      // init script does, so aligning the ticks here, and putting the wall clock back
      // where it was, changes nothing the app could have observed.
      await page.addInitScript({
        content:
          "(function () {" +
          "  var c = globalThis.__pwClock && globalThis.__pwClock.controller;" +
          "  if (!c) return;" +
          "  var ticks = c.performanceNow();" +
          "  var pad = (16 - (ticks % 16)) % 16;" +
          "  if (!pad) return;" +
          "  c.runFor(pad).then(function () { c.setSystemTime(" + recordedAt + "); });" +
          "})()",
      });
      // Node's setImmediate is not one of the functions page.clock fakes, and gen4's
      // timer hops through it on every frame (`setImmediate(() =>
      // requestAnimationFrame(updateTime))`). A real setImmediate races the clock's
      // own real-time yield between two fake timers: when it loses, the clock has
      // already moved past the next frame boundary before the frame is requested, the
      // timer skips a frame, and the hundredths digit lags -- at a different
      // checkpoint every run. Routed through the (fake) setTimeout it fires one
      // virtual millisecond later, which is what "immediately, before the next frame"
      // means to the app (docs/parity-harness.md 9.12).
      await page.addInitScript({
        content:
          "(function () {" +
          "  if (typeof globalThis.setImmediate !== 'function') return;" +
          "  globalThis.setImmediate = function (cb) { var args = Array.prototype.slice.call(arguments, 1); return setTimeout(function () { cb.apply(null, args); }, 0); };" +
          "  globalThis.clearImmediate = function (id) { clearTimeout(id); };" +
          "})()",
      });
    }

    // Arm the mapper BEFORE the reload. That is what the queuer's launch order looks
    // like (PokeAByte already has the mapper loaded when the overlay starts), and it is
    // also the only deterministic order: a client that connects while no mapper is
    // loaded takes the swallowed-throw path in _establishConnection, leaves _debouceMap
    // null and then throws from its rAF loop on a frame boundary
    // (known-legacy-bugs.md #29), which lands in a different capture every run.
    mock.loadMapper();

    // The document before the reload is not part of the run: its failed connection
    // attempts to the real ports would leak into oracle 9 non-deterministically. Its
    // log is dropped the moment the new document is created -- not after the reload
    // settles, because by then the new document has already connected to the armed
    // mock and run its boot (gen5's settings watchers and the exception one of them
    // throws land within ~100 ms of #app appearing), and a reset there erased every
    // boot-time error from oracle 9 on both sides.
    page.once("framenavigated", () => { consoleLog.length = 0; });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#app", { timeout: 30000 });
    // Park the pointer. The Electron window is a real window under the real cursor,
    // and Chromium re-evaluates :hover whenever layout changes under a stationary
    // pointer -- so a range slider that happened to sit under the desktop cursor was
    // captured in its hover colours for six checkpoints of one run and in its normal
    // colours in the next. (0, 0) is the corner of the full-screen background canvas,
    // which nothing styles on hover. A synthetic move sets the position Chromium uses.
    await page.mouse.move(0, 0);
    // ...and then stop listening to the desktop altogether. The run's window is a real,
    // visible 1920x1080 window on the machine, and one run captured every panel's text
    // *selected* for two checkpoints -- a click-drag or Ctrl+A from whoever was at the
    // keyboard. Nothing in a run needs real input; the fixture is the only input.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.setIgnoreInputEvents", { ignore: true });
    await warmUp(page, mock, opts);

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
      await barrier(page, mock);
      // fastForward fires each due timer at most once, which is what a long gap between
      // fixture ticks means; runFor would replay thousands of 10 ms Shuckie polls.
      if (dt > 250) await page.clock.fastForward(dt);
      else await page.clock.runFor(dt);
      await barrier(page, mock);
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
        if (await ensureContentSize(app, log)) {
          await page.clock.runFor(32);
          clockT += 32;
          await flushRender(page);
        }
        clockT += await settleFor(page, mock, opts, 1200);
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
    await settleFor(page, mock, opts, 2000);

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
      await settleFor(page, mock, opts, 1200);
      writeFileSync(join(outDir, "status.json"), JSON.stringify(exchanges, null, 1));
      log(`[run] control script ${basename(scriptFile)}: ${exchanges.length} exchange(s)`);
    }

    writeFileSync(join(outDir, "writes.json"), JSON.stringify(mock.writeLog, null, 1));
    writeFileSync(join(outDir, "obs-markers.json"), JSON.stringify(obs?.markers ?? [], null, 1));
    writeFileSync(join(outDir, "shuckie-calls.json"), JSON.stringify(shuckie?.calls ?? [], null, 1));
    writeFileSync(join(outDir, "console-tail.json"), JSON.stringify(consoleLog, null, 1));

    // Oracle 5, second half: every write must be one the mapper profile declares
    // (plan 1.4). The verdict is written next to the log so a later diff or a human can
    // see it; the run itself keeps going, because a violation is a finding, not a crash.
    const profileCheck = checkWriteLog(header.mapperId, mock.writeLog);
    writeFileSync(join(outDir, "profile-check.json"), JSON.stringify(profileCheck, null, 1));
    if (profileCheck.violations.length) {
      log(`[run] profile ${profileCheck.profileId ?? "(none)"}: ${profileCheck.violations.length} undeclared write(s)`);
      for (const v of profileCheck.violations) log(`[run]   ${v}`);
    }
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
  // The main process's own output, for the launch that never shows a window.
  app.process().stdout?.on("data", (d: Buffer) => log(`[app] ${String(d).trimEnd()}`));
  app.process().stderr?.on("data", (d: Buffer) => {
    const text = String(d).trimEnd();
    // Chromium's INFO:CONSOLE lines duplicate what page.on("console") already records.
    if (!/INFO:CONSOLE/.test(text)) log(`[app] ${text}`);
  });

  const page = await app.firstWindow({ timeout: 60000 });
  // 1920x1080 content at zoom 1 is the parity claim; a display that cannot fit it
  // would silently rescale every rect.
  const bounds = await app.evaluate(async ({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows()[0];
    // Chromium opens a new window on the display the user is working on, and a
    // 1920x1080 content window does not survive every display: a 1080-tall one has
    // Windows shrink it, and one scaled 150% reports 1914x1063 whatever is asked
    // (`--force-device-scale-factor=1` pins the renderer, not the window frame). A
    // whole run came back 1914x1063 while someone was working at another monitor. So
    // the window goes to the primary display's work-area corner first -- the display
    // every green run has used -- and only then is sized and locked.
    const corner = screen.getPrimaryDisplay().workArea;
    win.setPosition(corner.x, corner.y);
    win.setContentSize(1920, 1080);
    win.webContents.setZoomFactor(1);
    // The window is taller than the display's work area, and Windows shrinks such a
    // window when it is activated or moved -- a run captured two checkpoints at
    // 1920x1067 with every rect scaled by 0.998. Lock it; the OS leaves a
    // non-resizable window alone, and `ensureContentSize` re-asserts it anyway.
    win.setResizable(false);
    win.setMinimumSize(win.getSize()[0], win.getSize()[1]);
    win.setMaximumSize(win.getSize()[0], win.getSize()[1]);
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

/**
 * Re-asserts the 1920x1080 content size before a capture and says so if it had drifted.
 * Returns true when it had to fix anything, so the caller can settle two more frames
 * for the layout to catch up.
 */
async function ensureContentSize(app: ElectronApplication, log: (m: string) => void): Promise<boolean> {
  const bounds = await app.evaluate(async ({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows()[0];
    const before = win.getContentBounds();
    if (before.width !== 1920 || before.height !== 1080) {
      // Back to the primary display first: on a scaled or short one the size call
      // alone lands at 1914x1063 again (see launch()).
      const corner = screen.getPrimaryDisplay().workArea;
      win.setPosition(corner.x, corner.y);
      win.setContentSize(1920, 1080);
      win.webContents.setZoomFactor(1);
    }
    return { before, after: win.getContentBounds() };
  });
  if (bounds.before.width === 1920 && bounds.before.height === 1080) return false;
  log(`[run] window content was ${bounds.before.width}x${bounds.before.height}; restored to ${bounds.after.width}x${bounds.after.height}`);
  return true;
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
async function warmUp(page: Page, mock: MockPokeAByte, opts: RunOptions): Promise<void> {
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 50));
    // Drain before the sweep as well as after: the app's boot (its __stpPendingBoot,
    // folded into the barrier's IPC count) must not complete *during* a sweep.
    await barrier(page, mock);
    if (!opts.realtime) await page.clock.runFor(WARM_UP_STEP_MS);
    await barrier(page, mock);
  }
}

/**
 * A whole number of animation frames (12 x 16).
 *
 * This was introduced as a fix for the hundredths-digit flake on the theory that the
 * fake clock schedules `requestAnimationFrame` 16 ms from whenever a chain starts, so
 * a timer constructed in an odd 200 ms step (200 mod 16 = 8) would tick out of phase
 * with one constructed in an even step. The clock actually schedules every frame for
 * the next multiple of 16 of its tick counter, so chains are on the grid whichever
 * step they start in; the flake was the grid itself moving between runs, and the init
 * script after `clock.pauseAt()` is what pins it (docs/parity-harness.md 9.11). The
 * 192 stays because a step that is a whole number of frames is the easier one to
 * reason about, and every other advance is fixed by the fixture or a multiple of 16
 * already (`settle`, `extraFrame`).
 */
const WARM_UP_STEP_MS = 192;

/**
 * Counts hub frames as the renderer receives them, so the runner can tell that a push
 * has been *applied* and not merely written to the socket.
 *
 * All listeners for one `message` event run in the same task, and this one is added in
 * the WebSocket constructor -- before SignalR assigns `onmessage` -- so it runs first.
 * That is fine: Node reads the counter from a later task, by which point every listener
 * for that event, SignalR's included, has run and the property values are in the store.
 *
 * Only the `/updates` socket is counted. The overlay also opens one to the OBS stub,
 * and counting those would let the barrier pass on frames the mapper never sent.
 */
async function installHubReceiptProbe(page: Page): Promise<void> {
  await page.addInitScript({
    content:
      "(function () {" +
      // In-flight fetches, for the same reason as the preload's __pendingIpc: a
      // /mapper or /stats response that lands mid-sweep anchors whatever the app
      // starts from it (the timer's rAF chain, a poll) at an intermediate fake time.
      "  window.__pendingFetch = 0;" +
      "  var nativeFetch = window.fetch;" +
      "  window.fetch = function () {" +
      "    window.__pendingFetch++;" +
      "    var done = function () { window.__pendingFetch--; };" +
      "    try {" +
      "      var p = nativeFetch.apply(this, arguments);" +
      "      p.then(done, done);" +
      "      return p;" +
      "    } catch (e) { done(); throw e; }" +
      "  };" +
      "  window.__hubRx = 0;" +
      "  var Native = window.WebSocket;" +
      "  function Counted(url, protocols) {" +
      "    var socket = protocols === undefined ? new Native(url) : new Native(url, protocols);" +
      "    if (String(url).indexOf('/updates') !== -1) {" +
      "      socket.addEventListener('message', function () { window.__hubRx++; });" +
      "    }" +
      "    return socket;" +
      "  }" +
      "  Counted.prototype = Native.prototype;" +
      "  Counted.CONNECTING = Native.CONNECTING;" +
      "  Counted.OPEN = Native.OPEN;" +
      "  Counted.CLOSING = Native.CLOSING;" +
      "  Counted.CLOSED = Native.CLOSED;" +
      "  window.WebSocket = Counted;" +
      "})()",
  });
}

/**
 * Everything already queued on the renderer's task queue has run, no main-process call
 * is still in flight, and every hub frame the mock has written has been processed.
 *
 * The CDP round trip alone only drains tasks; a `data:read` that has not answered yet
 * would resolve *after* the clock moved, and the overlay would stamp a different time
 * than it did last run. The pending-IPC count comes from the preload; polling it from
 * Node rather than with page.waitForFunction matters, because that helper polls with
 * page timers, which a paused fake clock never fires.
 *
 * `__stpPendingBoot` (main.ts) is folded into the IPC count: a module's boot runs on
 * dynamic imports, which are neither IPC nor fetch, and a boot that completes mid
 * clock-sweep anchors the overlay's animation-frame chain on whatever timer the sweep
 * had reached -- one hundredth behind the legacy app at a quarter of the checkpoints.
 *
 * The hub count closes the same hole for the *other* pipe. `mock.pushChanges()` writes
 * to a WebSocket, which reaches the renderer independently of CDP, so a change could
 * land on either side of the next `clock.runFor` -- and a new run that starts its timer
 * from a property change would stamp `started_at` a frame apart between two otherwise
 * identical runs. That showed up as the on-screen timer's hundredths digit differing at
 * 5 of 25 checkpoints, with an identical `virtualNow` at every one of them.
 */
async function barrier(page: Page, mock?: MockPokeAByte, timeoutMs = 5000): Promise<void> {
  await page.evaluate("0");
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const state = (await page
      .evaluate(
        "({" +
          " ipc: ((window.api && window.api.__pendingIpc) ? window.api.__pendingIpc() : 0) + (window.__stpPendingBoot || 0)," +
          " fetch: window.__pendingFetch || 0," +
          " hub: window.__hubRx || 0" +
          "})",
      )
      .catch(() => ({ ipc: 0, fetch: 0, hub: Number.POSITIVE_INFINITY }))) as { ipc: number; fetch: number; hub: number };
    const wanted = mock ? mock.hubFramesSent : 0;
    if (Number(state.ipc) === 0 && Number(state.fetch) === 0 && Number(state.hub) >= wanted) return;
    if (Date.now() > deadline) {
      console.warn(
        `[run] barrier timed out after ${timeoutMs} ms ` +
          `(${state.ipc} IPC, ${state.fetch} fetch pending, ${state.hub}/${wanted} hub frames); continuing`,
      );
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/**
 * Settle the app before a capture: advance the virtual clock past every debounce, then
 * wait out the things that are *not* on the virtual clock -- pending IPC and image and
 * font loading -- and let two more frames render on top of whatever that unblocked.
 */
async function settleFor(page: Page, mock: MockPokeAByte, opts: RunOptions, virtualMs: number): Promise<number> {
  if (opts.realtime) {
    await new Promise((r) => setTimeout(r, Math.min(virtualMs, 1500)));
    await page.evaluate(
      () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
    );
    await waitForRenderIdle(page);
    return 0;
  }
  // Drain *before* advancing, not only after. The caller pushes a batch of property
  // changes and comes straight here, so without this the clock sweep below is already
  // running when the hub frame arrives -- and `Date.now()` inside that handler returns
  // whatever intermediate value the sweep has reached, which depends on real-time
  // interleaving. That is how a new run stamped `metrics.timer.started_at` a few
  // milliseconds apart between two otherwise identical runs, and why the on-screen
  // timer's hundredths digit differed at 5 of 25 checkpoints while `virtualNow` and
  // `hubRx` at every capture were identical.
  await barrier(page, mock);
  await settle(page, virtualMs);
  await barrier(page, mock);
  await waitForRenderIdle(page);
  // An image that finished decoding during the wait still needs a frame to paint, and
  // with the clock paused a frame only happens when the clock moves.
  const extraFrame = 32;
  await page.clock.runFor(extraFrame);
  await finishAnimations(page);
  await flushRender(page);
  // The caller tracks where the virtual clock is, so report everything that was added.
  return virtualMs + extraFrame;
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
