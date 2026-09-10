/**
 * Super Shuckie stand-in on http://127.0.0.1:30158.
 *
 * gen1 polls /stats every 10 ms and gen5's ShuckieTimer reads the same shape, so the
 * stub answers from the replay's `F` frame samples and the virtual clock. Every POST
 * is logged in call order -- that log is oracle 8.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export interface ShuckieCall {
  tMs: number;
  route: "/mark-start" | "/mark-end" | "/increment-counter" | string;
  query: Record<string, string>;
}

export interface ShuckieOptions {
  port?: number;
  host?: string;
  log?: (msg: string) => void;
}

export class ShuckieStub {
  readonly calls: ShuckieCall[] = [];
  /** Driven by the runner: fixture-relative ms, used for tMs and time_current. */
  clockMs = 0;
  /** Latest `F` sample from the replay. */
  frame = 0;
  /** null until /mark-start, as the real server reports before a run is timed. */
  private startedAtMs: number | null = null;
  private readonly counters: Record<string, number> = {};
  private server: Server | null = null;
  private readonly port: number;
  private readonly host: string;
  private readonly log: (msg: string) => void;

  constructor(opts: ShuckieOptions = {}) {
    this.port = opts.port ?? 30158;
    this.host = opts.host ?? "127.0.0.1";
    this.log = opts.log ?? (() => {});
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => this.handle(req, res));
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(this.port, this.host, resolve);
    });
    this.log(`[shuckie] stub on http://${this.host}:${this.port}`);
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
    });
    this.server = null;
  }

  reset(): void {
    this.calls.length = 0;
    this.startedAtMs = null;
    for (const k of Object.keys(this.counters)) delete this.counters[k];
  }

  private stats(): Record<string, unknown> {
    return {
      time_current: this.startedAtMs === null ? null : this.clockMs - this.startedAtMs,
      total_elapsed_frames: this.frame,
      is_playing_back: true,
      is_playback_finished: false,
      counters: { ...this.counters },
    };
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const origin = req.headers.origin;
    res.setHeader("Access-Control-Allow-Origin", origin ?? "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://${this.host}:${this.port}`);
    const query = Object.fromEntries(url.searchParams.entries());

    if (req.method === "GET" && url.pathname === "/stats") {
      const text = JSON.stringify(this.stats());
      res.writeHead(200, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) });
      res.end(text);
      return;
    }

    if (req.method === "POST") {
      this.calls.push({ tMs: this.clockMs, route: url.pathname, query });
      switch (url.pathname) {
        case "/mark-start":
          this.startedAtMs = this.clockMs - Number(query.offset ?? 0);
          break;
        case "/mark-end":
          break;
        case "/increment-counter": {
          const name = query.name ?? "";
          this.counters[name] = (this.counters[name] ?? 0) + Number(query.by ?? 1);
          break;
        }
      }
      res.writeHead(200, { "Content-Type": "application/json" }).end("{}");
      return;
    }

    res.writeHead(404).end();
  }
}
