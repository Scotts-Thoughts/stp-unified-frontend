import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http";
import { readFileSync } from "fs";
import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";

/**
 * The overlay control server on http://127.0.0.1:30159.
 *
 * The recording queuer ("Mirror Move") drives every overlay through this, and
 * docs/external-contracts.md section 2 is the contract: route names, query parameters,
 * response shapes and the per-generation `/status` field names, all of which the queuer
 * branches on today. gen2-5 run this inside the renderer; the unified app runs one copy
 * in the main process (plan 1.8), which is also what lets `/quit` and `/reload` work
 * without a renderer round trip.
 *
 * `/status` returns the **union** of every generation's fields -- `starter` *and*
 * `starterString`, `right_panel` *and* `right_ui` -- so each of the queuer's existing
 * per-gen branches keeps working unchanged.
 *
 * Port 30159 is single-tenant: only one overlay can run at a time.
 */

/**
 * 30159 is the queuer's port and the only one it will talk to. `STP_CONTROL_PORT`
 * exists so the parity harness can drive a scripted control session on a machine where
 * another overlay already owns 30159; nothing else should ever set it.
 */
const PORT = Number(process.env.STP_CONTROL_PORT ?? 30159);
const HOST = "127.0.0.1";

/** Routes answered in the main process; everything else is forwarded to the renderer. */
const MAIN_ROUTES = new Set(["/quit", "/reload", "/load-split-file"]);

/** How long a renderer round trip may take before the queuer gets an error instead of a hang. */
const RENDERER_TIMEOUT_MS = 5000;

/** gen2-5 wait 200 ms before closing or reloading, so the HTTP response is delivered first. */
const CLOSE_DELAY_MS = 200;

export interface ControlReply {
  ok: boolean;
  [key: string]: unknown;
}

interface Pending {
  resolve: (value: ControlReply) => void;
  timer: NodeJS.Timeout;
}

export class ControlServer {
  private server: Server | null = null;
  private readonly pending = new Map<number, Pending>();
  private sequence = 0;

  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  start(): void {
    ipcMain.on("control-reply", (_event, payload: { id: number; reply: ControlReply }) => {
      const entry = this.pending.get(payload?.id);
      if (!entry) return;
      clearTimeout(entry.timer);
      this.pending.delete(payload.id);
      entry.resolve(payload.reply ?? { ok: false, error: "empty reply" });
    });

    this.server = createServer((req, res) => {
      void this.handle(req, res);
    });
    this.server.on("error", (err: NodeJS.ErrnoException) => {
      // Another overlay owns the port. Say so once and keep running: the overlay itself
      // is still usable, only the queuer's remote control is not.
      if (err.code === "EADDRINUSE") {
        console.error(
          `[control] port ${PORT} is already in use -- another overlay is running. ` +
            `The queuer will not be able to drive this one.`,
        );
        return;
      }
      console.error("[control] server error", err);
    });
    this.server.listen(PORT, HOST, () => {
      console.log(`Overlay control server listening on http://${HOST}:${PORT}`);
    });
  }

  stop(): void {
    for (const [, entry] of this.pending) clearTimeout(entry.timer);
    this.pending.clear();
    this.server?.close();
    this.server = null;
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");

    const parsed = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
    const route = parsed.pathname;
    const query = Object.fromEntries(parsed.searchParams.entries());

    try {
      const reply = MAIN_ROUTES.has(route)
        ? await this.handleInMain(route, query)
        : await this.askRenderer(route, query);
      // A route's `status` is the HTTP status it wants, not part of the body: gen2-5 set
      // `res.statusCode = 400` and sent `{ ok: false, error }`, and the queuer reads
      // `error` from that body. Oracle 6 compares the bodies.
      const { status, ...body } = reply;
      if (typeof status === "number") res.statusCode = status;
      else if (reply.ok === false && reply.error === "Unknown endpoint") res.statusCode = 404;
      res.end(JSON.stringify(body));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    }
  }

  private async handleInMain(route: string, query: Record<string, string>): Promise<ControlReply> {
    const window = this.getWindow();
    switch (route) {
      case "/quit":
        setTimeout(() => window?.close(), CLOSE_DELAY_MS);
        return { ok: true, message: "Quitting overlay..." };
      case "/reload":
        setTimeout(() => window?.webContents.reload(), CLOSE_DELAY_MS);
        return { ok: true, message: "Reloading overlay..." };
      case "/load-split-file": {
        // gen2-5 read and parse the CSV in the renderer; here the file read stays in
        // main (plan 1.6) and only the parsed rows cross to the renderer. The column
        // layout is the legacy one: index 2 is the trainer, index 3 the time.
        if (!query.file) return { ok: false, status: 400, error: "Missing file parameter" };
        const text = readFileSync(query.file, "utf-8");
        const rows = text.split("\n").slice(1).filter((row) => row !== "");
        const splits = rows.map((row) => {
          const columns = row.split(",");
          return { trainer: columns[2], time: columns[3] };
        });
        const reply = await this.askRenderer("/load-split-file", { ...query, __splits: JSON.stringify(splits) });
        return reply.ok ? { ok: true, splits_loaded: splits.length } : reply;
      }
      default:
        return { ok: false, error: "Unknown endpoint" };
    }
  }

  private askRenderer(route: string, query: Record<string, string>): Promise<ControlReply> {
    const window = this.getWindow();
    if (!window || window.isDestroyed()) {
      return Promise.resolve({ ok: false, ready: false, error: "No overlay window" });
    }
    const id = ++this.sequence;
    return new Promise<ControlReply>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, error: `Renderer did not answer ${route} within ${RENDERER_TIMEOUT_MS} ms` });
      }, RENDERER_TIMEOUT_MS);
      this.pending.set(id, { resolve, timer });
      window.webContents.send("control-request", { id, route, query });
    });
  }
}
