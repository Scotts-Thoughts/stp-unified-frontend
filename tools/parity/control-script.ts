/**
 * Oracle 6: a scripted control-server session.
 *
 * The queuer drives every overlay through http://127.0.0.1:30159 in a fixed order per
 * queue item (docs/external-contracts.md section 2). This replays that order against a
 * running overlay and records what came back, including a `/status` after every call,
 * so the whole session -- not just the final state -- is comparable between the legacy
 * app and the unified one.
 *
 * A script is a list of calls. `skipFor` / `onlyFor` mirror the queuer's own
 * per-generation guards (`isGen1`, `isGen2`, `isGen4` in its `configureOverlay`), so
 * the same script issues against genN exactly the calls the queuer issues against genN
 * -- the generation is the *fixture's*, whichever app answers. A query value may be a
 * placeholder the queuer computes per item:
 *
 *   $expectedGame   `expectedSelectedGameFromMapperId(item.mapperId)`, the string it
 *                   sends to /set-game (null for gen1 -- the call is skipped, as there)
 *   $rightPanel     "Automatic" for gen4/gen5, "Battle Graphic" otherwise
 */
import { readFileSync } from "node:fs";

export interface ControlCall {
  route: string;
  query?: Record<string, string>;
  /** Skipped for generations that cannot honour the route (the queuer's own guards). */
  skipFor?: string[];
  /** Issued only for these generations (the other branch of the same guards). */
  onlyFor?: string[];
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

/**
 * The queuer's `expectedSelectedGameFromMapperId` (main.js), verbatim: the
 * `selected_game` it expects `/status` to report for a mapper, and what it sends to
 * `/set-game` when the overlay reports something else. `null` means "no mapping --
 * skip" (gen1, BDSP).
 */
export function expectedSelectedGame(mapperId: string): string | null {
  const lower = (mapperId || "").toLowerCase();

  // Gen5 — check the "2" variants first since they also contain "black"/"white"
  if (/black[_\s-]*2|b2w2|bw2/.test(lower)) return "Black 2";
  if (/white[_\s-]*2/.test(lower)) return "White 2";
  if (lower.includes("black") && !lower.includes("white")) return "Black";
  if (lower.includes("white") && !lower.includes("black")) return "White";

  // Gen4
  if (lower.includes("platinum")) return "Platinum";
  if (lower.includes("heartgold") || lower.includes("soulsilver") || /\bhgss\b/.test(lower)) {
    return "HeartGold and SoulSilver";
  }
  const isBdsp = lower.includes("brilliant") || lower.includes("shining") || /\bbdsp\b/.test(lower);
  if (!isBdsp && (lower.includes("diamond") || lower.includes("pearl"))) {
    return "Diamond and Pearl";
  }

  // Gen3
  if (lower.includes("firered") || lower.includes("leafgreen") || /\bfrlg\b/.test(lower)) {
    return "FireRed and LeafGreen";
  }
  if (lower.includes("emerald")) return "Emerald";

  // Gen2
  if (lower.includes("crystal")) return "Crystal";
  if ((lower.includes("gold") && !lower.includes("heartgold")) ||
      (lower.includes("silver") && !lower.includes("soulsilver"))) {
    return "Gold & Silver";
  }

  return null;
}

export interface RunControlOptions {
  port?: number;
  /** The fixture's generation ("gen1".."gen5"): selects the queuer's call shape. */
  generation?: string;
  /** The fixture's mapper id, for `$expectedGame`. */
  mapperId?: string;
  log?: (msg: string) => void;
}

/** Fills the placeholders of one call's query; `null` means the call is skipped. */
function resolveQuery(call: ControlCall, opts: RunControlOptions): Record<string, string> | null {
  const query: Record<string, string> = {};
  for (const [key, raw] of Object.entries(call.query ?? {})) {
    let value: string | null = raw;
    if (raw === "$expectedGame") value = expectedSelectedGame(opts.mapperId ?? "");
    else if (raw === "$rightPanel") value = opts.generation === "gen4" || opts.generation === "gen5" ? "Automatic" : "Battle Graphic";
    if (value === null) return null;
    query[key] = value;
  }
  return query;
}

export async function runControlScript(script: ControlScript, opts: RunControlOptions = {}): Promise<ControlExchange[]> {
  const port = opts.port ?? 30159;
  const base = `http://127.0.0.1:${port}`;
  const log = opts.log ?? (() => {});
  const out: ControlExchange[] = [];

  for (const call of script.calls) {
    if (opts.generation && call.skipFor?.includes(opts.generation)) {
      log(`[control] skipping ${call.route} for ${opts.generation}`);
      continue;
    }
    if (opts.generation && call.onlyFor && !call.onlyFor.includes(opts.generation)) {
      log(`[control] skipping ${call.route} for ${opts.generation} (only ${call.onlyFor.join(", ")})`);
      continue;
    }
    const query = resolveQuery(call, opts);
    if (query === null) {
      log(`[control] skipping ${call.route}: no value for its placeholder (${opts.mapperId ?? "no mapper"})`);
      continue;
    }
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
