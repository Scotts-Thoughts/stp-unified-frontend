/**
 * Minimum SignalR server the @microsoft/signalr JS client (7.x) is happy with:
 * negotiate + WebSocket transport + the JSON hub protocol.
 *
 * Framing: every message is JSON followed by the 0x1E record separator. One frame
 * may carry several messages, so the parser splits on 0x1E rather than assuming one.
 */
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";

const SEP = "\u001e";

export interface HubClient {
  send(target: string, ...args: unknown[]): void;
  ping(): void;
  close(): void;
  readonly open: boolean;
}

export interface HubOptions {
  /** Called once the JSON handshake is complete and the client can receive invocations. */
  onConnected?: (client: HubClient) => void;
  onDisconnected?: (client: HubClient) => void;
  /** Client -> server invocations. The overlays never send any; logged for diagnosis. */
  onInvocation?: (target: string, args: unknown[], client: HubClient) => void;
  log?: (msg: string) => void;
}

/**
 * Handles `/updates` for an existing http.Server: the negotiate POST is answered by
 * `handleNegotiate`, the upgrade by `handleUpgrade`.
 */
export class SignalRHub {
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly clients = new Set<HubClient>();
  private readonly tokens = new Set<string>();

  constructor(private readonly opts: HubOptions = {}) {}

  get clientCount(): number {
    return this.clients.size;
  }

  /** POST /updates/negotiate?negotiateVersion=1 */
  negotiate(negotiateVersion: number): Record<string, unknown> {
    const connectionId = randomUUID();
    const connectionToken = randomUUID();
    this.tokens.add(connectionToken);
    this.tokens.add(connectionId);
    // negotiateVersion 0 clients use connectionId as the ?id=; version 1 use the token.
    return negotiateVersion >= 1
      ? {
          negotiateVersion: 1,
          connectionId,
          connectionToken,
          availableTransports: [{ transport: "WebSockets", transferFormats: ["Text", "Binary"] }],
        }
      : {
          negotiateVersion: 0,
          connectionId,
          availableTransports: [{ transport: "WebSockets", transferFormats: ["Text", "Binary"] }],
        };
  }

  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.wss.handleUpgrade(req, socket, head, (ws) => this.accept(ws));
  }

  private accept(ws: WebSocket): void {
    let handshakeDone = false;
    const client: HubClient = {
      get open() {
        return ws.readyState === ws.OPEN;
      },
      send: (target, ...args) => {
        if (ws.readyState !== ws.OPEN) return;
        ws.send(JSON.stringify({ type: 1, target, arguments: args }) + SEP);
      },
      ping: () => {
        if (ws.readyState !== ws.OPEN) return;
        ws.send(JSON.stringify({ type: 6 }) + SEP);
      },
      close: () => ws.close(),
    };

    ws.on("message", (data) => {
      for (const raw of String(data).split(SEP)) {
        if (!raw) continue;
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(raw);
        } catch {
          this.opts.log?.(`[hub] unparsable frame: ${raw.slice(0, 120)}`);
          continue;
        }
        if (!handshakeDone) {
          // Handshake request: {"protocol":"json","version":1}
          if (msg.protocol !== "json") {
            ws.send(JSON.stringify({ error: `Unsupported protocol '${String(msg.protocol)}'` }) + SEP);
            ws.close();
            return;
          }
          handshakeDone = true;
          ws.send("{}" + SEP);
          this.clients.add(client);
          this.opts.onConnected?.(client);
          continue;
        }
        switch (msg.type) {
          case 1: // Invocation
          case 4: // StreamInvocation
            this.opts.onInvocation?.(String(msg.target), (msg.arguments as unknown[]) ?? [], client);
            break;
          case 6: // Ping -- the client pings us too; answer in kind.
            client.ping();
            break;
          case 7: // Close
            ws.close();
            break;
        }
      }
    });

    ws.on("close", () => {
      if (this.clients.delete(client)) this.opts.onDisconnected?.(client);
    });
    ws.on("error", (err) => this.opts.log?.(`[hub] socket error: ${String(err)}`));
  }

  /** Fan-out to every handshaken client. */
  broadcast(target: string, ...args: unknown[]): void {
    for (const c of this.clients) c.send(target, ...args);
  }

  pingAll(): void {
    for (const c of this.clients) c.ping();
  }

  closeAll(): void {
    for (const c of this.clients) c.close();
    this.clients.clear();
    this.wss.close();
  }
}
