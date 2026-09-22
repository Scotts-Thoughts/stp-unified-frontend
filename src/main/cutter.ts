import { app, BrowserWindow, session, type NativeImage } from "electron";
import { connect, type Socket } from "net";
import path from "path";
import { registerIpc } from "./ipc";

/**
 * The overlay as a picture source for the Cutter video editor
 * (air_cutter: docs/overlay-clip-plan.md §5.5).
 *
 * Two modes, both chosen on the command line and both leaving the ordinary app
 * untouched:
 *
 * * `--cutter-frame-server` — no window: the overlay renders offscreen at
 *   1920x1080, device scale 1, and every picture it paints is kept and handed
 *   over when asked. The editor's launcher (`extensions/stp-overlay/server/
 *   launch.js` in air_cutter) is the frame server the editor talks to; it runs
 *   this with `--cutter-socket=<port>` and asks for pictures over a local
 *   socket (below), because Electron's own stdio is not something to trust a
 *   binary protocol to on Windows.
 * * `--cutter-configure` — the ordinary window, for the overlay's own settings
 *   panel, fed by the same chain the editor uses.
 *
 * In both, the overlay reads the memory tool at `--cutter-tool=<url>` (an
 * *instance* of it, `…/instances/<port>`) instead of the constant, and the
 * emulator's stats endpoint at `--cutter-stats=<url>` — a stand-in the launcher
 * runs, answering from the recording and swallowing every write, so editing
 * never puts a bookmark into a recording. Nothing binds a fixed port: the
 * control server, the key hook, OBS and the legacy imports do not start, so a
 * live overlay on stream is undisturbed and several can run. Both writable
 * roots are the launcher's sandbox: `--user-data-dir` for the user state and
 * `STP_APP_ROOT` for `splits/` and `storage/`.
 */

export interface CutterArgs {
  mode: "frame-server" | "configure";
  /** The launcher's socket, on 127.0.0.1. */
  socket: number | null;
  /** The memory tool's base URL for this chain. */
  tool: string | null;
  /** The stats stand-in's base URL. */
  stats: string | null;
  /** Offscreen paint rate. */
  frameRate: number;
}

function flag(name: string): string | null {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

/** The Cutter mode this process was started in, or null for the ordinary app. */
export function cutterArgs(): CutterArgs | null {
  const serve = process.argv.includes("--cutter-frame-server");
  const configure = process.argv.includes("--cutter-configure");
  if (!serve && !configure) return null;
  const socket = Number(flag("cutter-socket"));
  return {
    mode: serve ? "frame-server" : "configure",
    socket: Number.isInteger(socket) && socket > 0 ? socket : null,
    tool: flag("cutter-tool"),
    stats: flag("cutter-stats"),
    frameRate: Math.max(1, Math.min(240, Number(flag("cutter-frame-rate")) || 60)),
  };
}

/** Every address the overlay has hard-coded for the emulator's HTTP server. */
const EMULATOR_URLS = ["http://127.0.0.1:30158/*", "http://localhost:30158/*"];
/** OBS's websocket: an overlay in the editor has no business marking chapters in a recording on stream. */
const OBS_URLS = ["ws://localhost:4455/*", "ws://127.0.0.1:4455/*"];

/**
 * Point the emulator's hard-coded address at the stand-in, and close OBS off.
 * The generations spell the address in a dozen places each; redirecting it here
 * keeps every one of them as it is.
 */
function redirectRequests(stats: string | null): void {
  const web = session.defaultSession.webRequest;
  web.onBeforeRequest({ urls: [...EMULATOR_URLS, ...OBS_URLS] }, (details, callback) => {
    if (details.url.startsWith("ws")) {
      callback({ cancel: true });
      return;
    }
    if (!stats) {
      callback({ cancel: true });
      return;
    }
    const u = new URL(details.url);
    callback({ redirectURL: stats.replace(/\/+$/, "") + u.pathname + u.search });
  });
}

/**
 * What the offscreen overlay has painted, and how many times: the generation
 * the editor asks to know whether its picture has changed.
 */
class Painted {
  image: NativeImage | null = null;
  generation = 0;
  width = 1920;
  height = 1080;

  keep(image: NativeImage): void {
    this.image = image;
    this.generation += 1;
    const size = image.getSize();
    this.width = size.width;
    this.height = size.height;
  }

  /** B, G, R, A, rows top to bottom — what `toBitmap` gives on every desktop — or black before the first paint. */
  bgra(): Buffer {
    if (!this.image) return Buffer.alloc(this.width * this.height * 4);
    const bitmap = this.image.toBitmap();
    const want = this.width * this.height * 4;
    return bitmap.length === want ? bitmap : Buffer.concat([bitmap, Buffer.alloc(Math.max(0, want - bitmap.length))]).subarray(0, want);
  }
}

/**
 * The launcher's side of the socket: one JSON request a line, each answered
 * with one JSON line — followed, for `frame`, by exactly `bytes` bytes of
 * B, G, R, A.
 *
 *   {"id":1,"op":"frame"}        -> {"id":1,"width":1920,"height":1080,"generation":7,"bytes":8294400} + pixels
 *   {"id":2,"op":"generation"}   -> {"id":2,"generation":7}
 *   {"id":3,"op":"invalidate"}   -> {"id":3}     (paint even if nothing was damaged)
 *   {"id":4,"op":"probe","paths":["a.b"]}
 *                                -> {"id":4,"batches":12,"bytes":[[1,2],null]}
 *                                   what the overlay's client has received of those
 *                                   properties, applied or held (gameHookMapperClient)
 *   {"op":"quit"}
 *
 * Unasked, the overlay says `{"event":"ready"}` once its page has loaded.
 */
function serve(socket: Socket, painted: Painted, window: BrowserWindow): void {
  let buffer = "";
  const reply = (header: object, pixels?: Buffer) => {
    socket.write(JSON.stringify(header) + "\n");
    if (pixels) socket.write(pixels);
  };
  socket.setEncoding("utf8");
  socket.on("data", (chunk: string) => {
    buffer += chunk;
    let at: number;
    while ((at = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, at).trim();
      buffer = buffer.slice(at + 1);
      if (!line) continue;
      let request: { id?: number; op?: string };
      try {
        request = JSON.parse(line);
      } catch {
        continue;
      }
      switch (request.op) {
        case "frame": {
          const pixels = painted.bgra();
          reply({ id: request.id, width: painted.width, height: painted.height, generation: painted.generation, bytes: pixels.length }, pixels);
          break;
        }
        case "generation":
          reply({ id: request.id, generation: painted.generation });
          break;
        case "invalidate":
          if (!window.isDestroyed()) window.webContents.invalidate();
          reply({ id: request.id });
          break;
        case "probe": {
          const paths = JSON.stringify((request as { paths?: string[] }).paths ?? []);
          window.webContents
            // As JSON: the client's property bytes may be reactive proxies,
            // which cannot be cloned out of the page.
            .executeJavaScript(`window.__cutterProbe ? JSON.stringify(window.__cutterProbe(${paths})) : null`)
            .then((text) => (typeof text === "string" ? JSON.parse(text) : null))
            .then((probed) => reply({ id: request.id, ...(probed ?? { batches: 0, bytes: [] }) }))
            .catch((e) => reply({ id: request.id, error: String(e) }));
          break;
        }
        case "quit":
          app.quit();
          break;
        default:
          reply({ id: request.id, error: `unknown op ${request.op}` });
      }
    }
  });
  socket.on("close", () => app.quit());
  socket.on("error", () => app.quit());
}

function loadRenderer(window: BrowserWindow): void {
  if (!app.isPackaged && process.env["ELECTRON_RENDERER_URL"]) {
    void window.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void window.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

/** The renderer is told the tool's address the only way it can be before it runs: its argv. */
function rendererArgs(args: CutterArgs): string[] {
  return args.tool ? [`--cutter-tool=${args.tool}`] : [];
}

/**
 * Run in a Cutter mode instead of as the ordinary app. Called before
 * `app.whenReady` so the command-line switches are in place in time.
 */
export function runCutter(args: CutterArgs): void {
  // One pixel is one pixel: an overlay painted at a laptop's 2x would come
  // back 3840x2160 and every rectangle the editor places would be wrong.
  app.commandLine.appendSwitch("force-device-scale-factor", "1");
  app.whenReady().then(() => {
    redirectRequests(args.stats);
    // The same main-process file helpers the app has, resolved against the
    // sandbox the launcher made (`STP_APP_ROOT`, `--user-data-dir`).
    let window: BrowserWindow | null = null;
    registerIpc(() => window);

    if (args.mode === "configure") {
      window = new BrowserWindow({
        width: 1920,
        height: 1080,
        useContentSize: true,
        autoHideMenuBar: true,
        title: "Overlay settings — Cutter",
        webPreferences: {
          preload: path.join(__dirname, "../preload/index.js"),
          sandbox: false,
          contextIsolation: false,
          nodeIntegration: true,
          additionalArguments: rendererArgs(args),
        },
      });
      window.on("closed", () => app.quit());
      loadRenderer(window);
      return;
    }

    const painted = new Painted();
    window = new BrowserWindow({
      show: false,
      width: 1920,
      height: 1080,
      useContentSize: true,
      frame: false,
      webPreferences: {
        offscreen: true,
        preload: path.join(__dirname, "../preload/index.js"),
        sandbox: false,
        contextIsolation: false,
        nodeIntegration: true,
        backgroundThrottling: false,
        additionalArguments: rendererArgs(args),
      },
    });
    window.webContents.setFrameRate(args.frameRate);
    // Said on stderr, which the launcher keeps: a chain whose page went away
    // is otherwise a mystery.
    window.webContents.on("did-start-navigation", (details) => {
      if (!details.isSameDocument) console.error(`[cutter] navigating to ${details.url}`);
    });
    window.webContents.on("render-process-gone", (_e, d) => console.error(`[cutter] renderer gone: ${d.reason}`));
    window.webContents.on("paint", (_event, _dirty, image) => painted.keep(image));
    const shown = window;
    if (args.socket) {
      const socket = connect(args.socket, "127.0.0.1");
      socket.on("connect", () => {
        serve(socket, painted, shown);
        shown.webContents.once("did-finish-load", () => socket.write(JSON.stringify({ event: "ready" }) + "\n"));
      });
      socket.on("error", (e) => {
        console.error(`[cutter] could not reach the launcher on ${args.socket}: ${e.message}`);
        app.quit();
      });
    }
    loadRenderer(window);
  });
  app.on("window-all-closed", () => app.quit());
}
