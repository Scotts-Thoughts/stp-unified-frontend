/**
 * Renderer half of the control server (plan 1.8).
 *
 * `src/main/control-server.ts` owns the socket on 127.0.0.1:30159 and forwards every
 * request here; this module turns a route table into the JSON body the queuer reads.
 * The table itself is per generation (`games/genN/control.ts`), because the routes a
 * generation can honour and the `/status` field names it reports differ -- see
 * docs/external-contracts.md section 2.
 */

export type ControlReply = Record<string, unknown> & { ok: boolean };

export type ControlRoute = (query: Record<string, string>) => ControlReply | Promise<ControlReply>;

export interface ControlRoutes {
  /** Extra fields merged into `/status`, on top of the fields every generation reports. */
  status: () => Record<string, unknown>;
  routes: Record<string, ControlRoute>;
}

/** The queuer sends booleans as the strings "true"/"false". */
export function asBoolean(value: string | undefined): boolean | null {
  if (value === undefined) return null;
  return value === "true";
}

export function missing(parameter: string): ControlReply {
  return { ok: false, status: 400, error: `Missing ${parameter} parameter` };
}

/**
 * Binds a route table to the main process. Returns an unsubscribe function.
 *
 * `/status` is handled here rather than in the table so that the union fields
 * (`ok`, `ready`, `app`) are impossible to forget in a per-generation table.
 */
export function registerControlServer(getRoutes: () => ControlRoutes | null): () => void {
  if (!window.api?.onControlRequest) {
    console.warn("[control] preload API is missing; the queuer cannot drive this overlay.");
    return () => {};
  }
  return window.api.onControlRequest(async (route, query) => {
    const table = getRoutes();
    if (!table) return { ok: false, ready: false, error: "Overlay is not ready" };

    if (route === "/status") {
      return { ok: true, app: "stp-overlay", ...table.status() };
    }
    const handler = table.routes[route];
    if (!handler) return { ok: false, error: "Unknown endpoint" };
    return await handler(query);
  });
}
