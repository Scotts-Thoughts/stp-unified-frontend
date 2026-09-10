/**
 * OBS WebSocket 5 stand-in on ws://localhost:4455.
 *
 * All five overlays hand-roll the protocol: they open a socket per marker, wait for
 * Hello (op 0), send Identify (op 1), and on Identified (op 2) send a
 * CreateRecordChapter request (op 6), closing on the matching RequestResponse (op 7).
 * The ordered list of chapter names is oracle 7.
 *
 * `password` turns on the auth challenge so the sha256 path in gen1's obs.ts is
 * exercised; without it Hello carries no `authentication` object, like an
 * unauthenticated OBS.
 */
import { createHash, randomBytes } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";

export interface ObsMarker {
  tMs: number;
  chapterName: string;
}

export interface ObsOptions {
  port?: number;
  host?: string;
  password?: string | null;
  log?: (msg: string) => void;
}

export class ObsStub {
  readonly markers: ObsMarker[] = [];
  readonly rejectedIdentifies: string[] = [];
  /** Driven by the runner: fixture-relative ms. */
  clockMs = 0;

  private wss: WebSocketServer | null = null;
  private readonly port: number;
  private readonly host: string;
  private readonly password: string | null;
  private readonly log: (msg: string) => void;

  constructor(opts: ObsOptions = {}) {
    this.port = opts.port ?? 4455;
    this.host = opts.host ?? "127.0.0.1";
    this.password = opts.password ?? null;
    this.log = opts.log ?? (() => {});
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.wss = new WebSocketServer({ port: this.port, host: this.host });
      this.wss.once("error", reject);
      this.wss.once("listening", resolve);
      this.wss.on("connection", (ws) => this.accept(ws));
    });
    this.log(`[obs] stub on ws://${this.host}:${this.port}`);
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (!this.wss) return resolve();
      this.wss.close(() => resolve());
    });
    this.wss = null;
  }

  reset(): void {
    this.markers.length = 0;
    this.rejectedIdentifies.length = 0;
  }

  private accept(ws: WebSocket): void {
    const salt = randomBytes(16).toString("base64");
    const challenge = randomBytes(16).toString("base64");
    const hello: Record<string, unknown> = { obsWebSocketVersion: "5.5.4", rpcVersion: 1 };
    if (this.password) hello.authentication = { challenge, salt };
    ws.send(JSON.stringify({ op: 0, d: hello }));

    ws.on("message", (data) => {
      let msg: { op?: number; d?: Record<string, unknown> };
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      const d = msg.d ?? {};
      if (msg.op === 1) {
        if (this.password) {
          const secret = createHash("sha256").update(this.password + salt, "utf8").digest("base64");
          const expected = createHash("sha256").update(secret + challenge, "utf8").digest("base64");
          if (d.authentication !== expected) {
            this.rejectedIdentifies.push(String(d.authentication ?? "<none>"));
            ws.close(4009, "Authentication failed.");
            return;
          }
        }
        ws.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
        return;
      }
      if (msg.op === 6) {
        const requestId = String(d.requestId ?? "");
        const requestType = String(d.requestType ?? "");
        const requestData = (d.requestData ?? {}) as Record<string, unknown>;
        if (requestType === "CreateRecordChapter") {
          this.markers.push({ tMs: this.clockMs, chapterName: String(requestData.chapterName ?? "") });
        }
        ws.send(
          JSON.stringify({
            op: 7,
            d: { requestType, requestId, requestStatus: { result: true, code: 100 } },
          }),
        );
        return;
      }
      if (msg.op === 8) {
        // GetRecordStatus is gen3's probe before it sends a marker.
        ws.send(JSON.stringify({ op: 7, d: { requestStatus: { result: true, code: 100 } } }));
      }
    });

    ws.on("error", (err) => this.log(`[obs] socket error: ${String(err)}`));
  }
}
