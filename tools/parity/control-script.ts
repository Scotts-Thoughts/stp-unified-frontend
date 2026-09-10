/**
 * Oracle 6: a scripted control-server session.
 *
 * The queuer drives every overlay through http://127.0.0.1:30159 in a fixed order per
 * queue item (docs/external-contracts.md section 2). This replays that order against a
 * running overlay and records what came back, including a `/status` after every call,
 * so the whole session -- not just the final state -- is comparable between the legacy
 * app and the unified one.
 */
import { readFileSync } from "node:fs";

export interface ControlCall {
  route: string;
  query?: Record<string, string>;
  /** Skipped for generations that cannot honour the route (the queuer's own guards). */
  skipFor?: string[];
  comment?: string;
}

export interface ControlScript {
  name: string;
  calls: ControlCall[];
}

export interface ControlExchange {
  route: string;
  query: Record<string, string>;
  httpStatus: number;
  body: unknown;
  /** `/status` taken immediately afterwards, which is what the queuer polls. */
  status: unknown;
}

export function loadControlScript(file: string): ControlScript {
  return JSON.parse(readFileSync(file, "utf8")) as ControlScript;
}

export async function runControlScript(
  script: ControlScript,
  opts: { port?: number; generation?: string; log?: (msg: string) => void } = {},
): Promise<ControlExchange[]> {
  const port = opts.port ?? 30159;
  const base = `http://127.0.0.1:${port}`;
  const log = opts.log ?? (() => {});
  const out: ControlExchange[] = [];

  for (const call of script.calls) {
    if (opts.generation && call.skipFor?.includes(opts.generation)) {
      log(`[control] skipping ${call.route} for ${opts.generation}`);
      continue;
    }
    const query = call.query ?? {};
    const url = new URL(call.route, base);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

    const exchange: ControlExchange = { route: call.route, query, httpStatus: 0, body: null, status: null };
    try {
      const response = await fetch(url);
      exchange.httpStatus = response.status;
      exchange.body = await response.json().catch(() => null);
    } catch (err) {
      exchange.httpStatus = -1;
      exchange.body = { error: String(err) };
    }
    // `/quit` and `/reload` take the window away; do not poll after them.
    if (call.route !== "/quit" && call.route !== "/reload" && call.route !== "/status") {
      try {
        const status = await fetch(`${base}/status`);
        exchange.status = await status.json().catch(() => null);
      } catch (err) {
        exchange.status = { error: String(err) };
      }
    }
    out.push(exchange);
    log(`[control] ${call.route} -> ${exchange.httpStatus}`);
  }
  return out;
}
