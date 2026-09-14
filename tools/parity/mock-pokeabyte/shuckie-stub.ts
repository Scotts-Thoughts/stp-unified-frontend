/**
 * Super Shuckie stand-in on http://127.0.0.1:30158.
 *
 * gen1 polls /stats every 10 ms and gen5's ShuckieTimer reads the same shape, so the
 * stub answers from the replay's `F` frame samples and the virtual clock. Every POST
 * is logged in call order -- that log is oracle 8.
 *
 * It also plays a replay with no bookmarks yet (`/bookmarks`, `/add-bookmark`), so every
 * chapter marker the unified app sends becomes a bookmark (core/logic/shuckieBookmarks.ts).
 * Those go to {@link ShuckieStub.bookmarks}, not `calls`: the legacy apps never add one,
 * and oracle 8 compares against them. diff.ts checks them against the run's OBS markers.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export interface ShuckieCall {
  tMs: number;
  route: "/mark-start" | "/mark-end" | "/increment-counter" | string;
  query: Record<string, string>;
}

export interface ShuckieBookmark {
  tMs: number;
  id: number;
  name: string;
  type: string;
  in_frame: number;
}

export interface ShuckieOptions {
  port?: number;
  host?: string;
  log?: (msg: string) => void;
}

export class ShuckieStub {
  readonly calls: ShuckieCall[] = [];
  readonly bookmarks: ShuckieBookmark[] = [];
  /** Like Super Shuckie, a generation that moves once per bookmark and once more per new type. */
  private bookmarkGeneration = 1;
  private readonly bookmarkTypes = new Set<string>();
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
    this.bookmarks.length = 0;
    this.bookmarkGeneration = 1;
    this.bookmarkTypes.clear();
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
      bookmark_generation: this.bookmarkGeneration,
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
      this.json(res, this.stats());
      return;
    }

    if (req.method === "GET" && url.pathname === "/bookmarks") {
      this.json(res, {
        replay: "fixture",
        state: "playback",
        generation: this.bookmarkGeneration,
        editable: true,
        needs_upgrade: false,
        replay_version: 5,
        problem: null,
        open_range: null,
        active_type: null,
        bookmarks: this.bookmarks.map(({ tMs: _tMs, ...b }) => ({ ...b, type: { id: "0", name: b.type, color: "#000000", saved: true }, in_millis: 0, out_frame: null, out_millis: null, keyframe: false })),
        types: [...this.bookmarkTypes].map((name) => ({ id: "0", name, color: "#000000", saved: true })),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/add-bookmark") {
      const bookmark = { tMs: this.clockMs, id: this.bookmarks.length + 1, name: query.name ?? "", type: query.type ?? "", in_frame: Number(query.frame ?? this.frame) };
      this.bookmarks.push(bookmark);
      if (!this.bookmarkTypes.has(bookmark.type)) {
        this.bookmarkTypes.add(bookmark.type);
        this.bookmarkGeneration++;
      }
      this.bookmarkGeneration++;
      const { tMs: _tMs, ...body } = bookmark;
      this.json(res, body);
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

  private json(res: ServerResponse, body: unknown): void {
    const text = JSON.stringify(body);
    res.writeHead(200, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) });
    res.end(text);
  }
}
