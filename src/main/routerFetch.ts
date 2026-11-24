import { request } from "http";

/**
 * The pkmn_yellow_xp_router's move-stats server (docs/external-contracts.md §10).
 *
 * The router answers on `http://127.0.0.1:30161` while it records a route. It sends no
 * CORS headers on purpose (so a web page in a browser can't read it), which is why the
 * renderer can't `fetch` it and asks main instead (routerClient.ts). Only the two paths
 * the router serves are passed through, and only to 127.0.0.1. Kept apart from the IPC
 * so `tools/parity/profile-router-selftest.ts` can run it without Electron.
 */
export const ROUTER_DEFAULT_PORT = 30161;
const PATHS = new Set(["/status", "/move-stats"]);

export interface RouterReply {
  ok: boolean;
  /** The HTTP status, or 0 when nothing answered. */
  status: number;
  body: unknown;
  error?: string;
}

export function getFromRouter(path: string, port = ROUTER_DEFAULT_PORT, timeoutMs = 2500): Promise<RouterReply> {
  return new Promise((done) => {
    if (!PATHS.has(path)) {
      done({ ok: false, status: 0, body: null, error: `not a router path: ${path}` });
      return;
    }
    const req = request(
      { host: "127.0.0.1", port, path, method: "GET", headers: { Host: `127.0.0.1:${port}` }, timeout: timeoutMs },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf-8");
          let body: unknown = null;
          try {
            body = JSON.parse(text);
          } catch {
            body = null;
          }
          const status = res.statusCode ?? 0;
          done({ ok: status === 200 && body !== null, status, body });
        });
        res.on("error", (e) => done({ ok: false, status: 0, body: null, error: e.message }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", (e) => done({ ok: false, status: 0, body: null, error: e.message }));
    req.end();
  });
}
