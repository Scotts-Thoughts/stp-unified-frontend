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

/** What every generation's `/status` reports besides its own table (external-contracts.md section 2). */
export interface ControlStatusContext {
  generation: number;
  mapperPath: string | null;
}

/**
 * The union `/status` (docs/external-contracts.md section 2): each generation's own
 * fields, `app`, `generation` and `mapper_path`, and both spellings of the two names
 * the queuer branches on -- `starter` / `starterString` and `right_panel` / `right_ui`
 * -- so that each of its per-generation branches reads a field that exists. A table's
 * own fields are never overwritten; only the missing spelling is added.
 */
export function unionStatus(fields: Record<string, unknown>, ctx: ControlStatusContext): Record<string, unknown> {
  const out: Record<string, unknown> = { app: "stp-overlay", generation: ctx.generation, mapper_path: ctx.mapperPath, ...fields };
  for (const [a, b] of [["starter", "starterString"], ["right_panel", "right_ui"]] as const) {
    if (a in out && !(b in out)) out[b] = out[a];
    else if (b in out && !(a in out)) out[a] = out[b];
  }
  return out;
}

/**
 * Binds a route table to the main process. Returns an unsubscribe function.
 *
 * `/status` is handled here rather than in the table so that the union fields
 * (`ok`, `ready`, `app`, the aliases) are impossible to forget in a per-generation table.
 */
export function registerControlServer(getRoutes: () => ControlRoutes | null, context: () => ControlStatusContext): () => void {
  if (!window.api?.onControlRequest) {
    console.warn("[control] preload API is missing; the queuer cannot drive this overlay.");
    return () => {};
  }
  return window.api.onControlRequest(async (route, query) => {
    const table = getRoutes();
    if (!table) return { ok: false, ready: false, error: "Overlay is not ready" };

    if (route === "/status") {
      return { ok: true, ...unionStatus(table.status(), context()) };
    }
    const handler = table.routes[route];
    if (!handler) return { ok: false, error: "Unknown endpoint" };
    return await handler(query);
  });
}
