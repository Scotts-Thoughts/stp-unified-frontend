/**
 * Stand-in for PokeAByte 0.11.2, indistinguishable from the real thing to the five
 * overlay mapper clients. Route names, the MAPPER_NOT_LOADED problem body, the
 * slash/dot path handling and the reflected-origin CORS all follow
 * A:\Programs\PokeAByte\src (MapperController.cs, ApiHelper.cs, UpdateHub.cs, Startup.cs).
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { SignalRHub } from "./signalr.ts";
import { ReplayState } from "./replay.ts";
import type { PropertyDto } from "../lib/fixture.ts";

export interface WriteLogEntry {
  /** Fixture-relative milliseconds when the app sent it. */
  tMs: number;
  endpoint: "set-property-value" | "set-property-bytes" | "set-properties-by-bits" | "set-property-frozen";
  body: unknown;
  /** Paths after the server's slash -> dot normalisation, in call order. */
  paths: string[];
}

export interface MockOptions {
  port?: number;
  host?: string;
  /** "apply" mutates replay state and echoes the change; "ignore" only logs. */
  writes?: "apply" | "ignore";
  log?: (msg: string) => void;
}

const NOT_LOADED = {
  type: "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  title: "MAPPER_NOT_LOADED",
  status: 400,
  detail: "Please load a mapper file first.",
};

export class MockPokeAByte {
  readonly state = new ReplayState();
  readonly writeLog: WriteLogEntry[] = [];
  /** Set by the runner so write-log entries carry the fixture timestamp. */
  clockMs = 0;

  private server: Server | null = null;
  private hub!: SignalRHub;
  private loaded = false;
  private readonly port: number;
  private readonly host: string;
  private readonly writes: "apply" | "ignore";
  private readonly log: (msg: string) => void;
  private hubConnections = 0;

  constructor(opts: MockOptions = {}) {
    // The overlays hardcode http://localhost:8085, and PokeAByte's AllowedHosts
    // rejects 127.0.0.1, so the mock listens on localhost only, same as the real one.
    this.port = opts.port ?? 8085;
    this.host = opts.host ?? "localhost";
    this.writes = opts.writes ?? "apply";
    this.log = opts.log ?? (() => {});
  }

  get clients(): number {
    return this.hubConnections;
  }

  /**
   * Hub frames written to the currently connected renderer.
   *
   * The runner waits for the page's own received-frame count to reach this before it
   * advances the virtual clock; see `SignalRHub.sentToCurrentClient`.
   */
  get hubFramesSent(): number {
    return this.hub.sentToCurrentClient;
  }

  get mapperLoaded(): boolean {
    return this.loaded;
  }

  async start(): Promise<void> {
    this.hub = new SignalRHub({
      log: this.log,
      onConnected: (client) => {
        this.hubConnections++;
        // UpdateHub.OnConnectedAsync always sends Hello, with null while unloaded.
        client.send("Hello", this.loaded ? this.mapperModel() : null);
      },
      onDisconnected: () => {
        this.hubConnections--;
      },
      onInvocation: (target) => this.log(`[mock] unexpected client invocation ${target}`),
    });

    this.server = createServer((req, res) => this.handle(req, res));
    this.server.on("upgrade", (req, socket, head) => {
      if ((req.url ?? "").startsWith("/updates")) this.hub.handleUpgrade(req, socket, head as Buffer);
      else socket.destroy();
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", (err: NodeJS.ErrnoException) => {
        reject(
          err.code === "EADDRINUSE"
            ? new Error(
                `Port ${this.port} is taken -- a real PokeAByte is running. Close it before a parity run.`,
              )
            : err,
        );
      });
      this.server!.listen(this.port, this.host, resolve);
    });
    this.log(`[mock] PokeAByte stand-in on http://${this.host}:${this.port}`);
  }

  async stop(): Promise<void> {
    this.hub?.closeAll();
    await new Promise<void>((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
    });
    this.server = null;
  }

  /** Arms the mapper and tells connected clients, exactly as a real mapper load does. */
  loadMapper(): void {
    this.loaded = true;
    this.hub.broadcast("MapperLoaded", this.mapperModel());
  }

  /** Mirrors PokeAByte unloading an instance. */
  unloadMapper(): void {
    this.loaded = false;
    this.hub.broadcast("InstanceReset");
  }

  /** Pushes one PropertiesChanged with full DTOs, as PokeAByte does per tick. */
  pushChanges(changes: PropertyDto[]): void {
    if (!this.loaded || changes.length === 0) return;
    this.hub.broadcast(
      "PropertiesChanged",
      changes.map((p) => ({ ...p, bytes: p.bytes ? p.bytes.slice() : p.bytes })),
    );
  }

  ping(): void {
    this.hub.pingAll();
  }

  private mapperModel() {
    return {
      meta: this.state.header?.meta ?? null,
      properties: this.state.snapshot(),
      glossary: this.state.header?.glossary ?? {},
    };
  }

  // ---------------------------------------------------------------- HTTP

  private handle(req: IncomingMessage, res: ServerResponse): void {
    // Startup.cs: SetIsOriginAllowed(_ => true) + AllowCredentials -- reflect, never "*".
    const origin = req.headers.origin;
    res.setHeader("Access-Control-Allow-Origin", origin ?? "*");
    if (origin) res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] ?? "*");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://${this.host}:${this.port}`);
    const route = stripEndingRoute(decodeURIComponent(url.pathname));

    if (req.method === "POST" && route === "/updates/negotiate") {
      const version = Number(url.searchParams.get("negotiateVersion") ?? "0");
      json(res, 200, this.hub.negotiate(Number.isNaN(version) ? 0 : version));
      return;
    }

    if (req.method === "GET") {
      this.handleGet(route, res);
      return;
    }
    if (req.method === "POST" || req.method === "PUT") {
      void readBody(req).then((body) => this.handleWrite(route, body, res));
      return;
    }
    json(res, 404, { status: 404 });
  }

  private handleGet(route: string, res: ServerResponse): void {
    if (route === "/mapper") {
      json(res, this.loaded ? 200 : 400, this.loaded ? this.mapperModel() : NOT_LOADED);
      return;
    }
    if (route === "/mapper/meta") {
      json(res, this.loaded ? 200 : 400, this.loaded ? this.state.header.meta : NOT_LOADED);
      return;
    }
    if (route === "/mapper/properties") {
      json(res, this.loaded ? 200 : 400, this.loaded ? this.state.snapshot() : NOT_LOADED);
      return;
    }
    if (route === "/mapper/glossary") {
      json(res, this.loaded ? 200 : 400, this.loaded ? this.state.header.glossary : NOT_LOADED);
      return;
    }
    if (route.startsWith("/mapper/properties/") || route.startsWith("/mapper/values/")) {
      if (!this.loaded) return json(res, 400, NOT_LOADED);
      const prefix = route.startsWith("/mapper/properties/") ? "/mapper/properties/" : "/mapper/values/";
      const prop = this.state.byPath.get(fromRouteToPath(route.slice(prefix.length)));
      if (!prop) return json(res, 404, { status: 404 });
      return json(res, 200, prefix === "/mapper/values/" ? prop.value : prop);
    }
    if (route.startsWith("/mapper/glossary/")) {
      if (!this.loaded) return json(res, 400, NOT_LOADED);
      const item = this.state.header.glossary?.[route.slice("/mapper/glossary/".length)];
      return json(res, item ? 200 : 404, item ?? { status: 404 });
    }
    // The queuer probes these before launching an overlay.
    if (route === "/mapper-service/get-metadata") {
      return json(res, this.loaded ? 200 : 404, this.loaded ? this.state.header.meta : { status: 404 });
    }
    if (route === "/mapper-service/get-mappers") {
      const meta = this.state.header?.meta;
      return json(
        res,
        200,
        meta ? [{ id: meta.id, name: meta.gameName, path: meta.path, displayName: meta.gameName }] : [],
      );
    }
    json(res, 404, { status: 404 });
  }

  private handleWrite(route: string, body: unknown, res: ServerResponse): void {
    if (route === "/mapper-service/change-mapper") {
      this.loadMapper();
      return json(res, 200, {});
    }
    if (route === "/mapper-service/unload-mapper") {
      this.unloadMapper();
      return json(res, 200, {});
    }

    const endpoint = route.startsWith("/mapper/") ? route.slice("/mapper/".length) : "";
    if (
      endpoint !== "set-property-value" &&
      endpoint !== "set-property-bytes" &&
      endpoint !== "set-properties-by-bits" &&
      endpoint !== "set-property-frozen"
    ) {
      return json(res, 404, { status: 404 });
    }
    if (!this.loaded) return json(res, 400, NOT_LOADED);

    const items = (Array.isArray(body) ? body : [body]) as {
      path?: string;
      value?: unknown;
      bytes?: number[];
      freeze?: boolean;
    }[];
    const paths = items.map((i) => fromRouteToPath(stripEndingRoute(String(i.path ?? ""))));

    this.writeLog.push({ tMs: this.clockMs, endpoint, body, paths });

    for (const [i, item] of items.entries()) {
      const prop = this.state.byPath.get(paths[i]);
      if (!prop) return json(res, 404, { status: 404 });
      if (prop.isReadOnly) return json(res, 400, "Property is read only.");
      if (this.writes === "ignore") continue;

      const changed: string[] = ["bytes", "value"];
      if (endpoint === "set-property-bytes" || endpoint === "set-properties-by-bits") {
        if (Array.isArray(item.bytes)) prop.bytes = item.bytes.slice();
        if ("value" in item) prop.value = item.value;
      } else if (endpoint === "set-property-value") {
        prop.value = item.value;
      }
      if (item.freeze !== undefined) {
        prop.isFrozen = !!item.freeze;
        // PokeAByte emits the duplicated token; the clients ignore it either way.
        changed.push("isFrozen", "frozen");
      }
      prop.fieldsChanged = changed;
      this.pushChanges([prop]);
    }
    json(res, 200, {});
  }
}

function stripEndingRoute(route: string): string {
  return route.endsWith("/") ? route.slice(0, -1) : route;
}

/** ApiHelper.FromRouteToPath: every "/" and "%2F" becomes ".". */
function fromRouteToPath(route: string): string {
  return route.replaceAll("/", ".").replaceAll("%2F", ".");
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  const isProblem = status === 400 && (body as { title?: string })?.title === "MAPPER_NOT_LOADED";
  res.writeHead(status, {
    "Content-Type": isProblem ? "application/problem+json; charset=utf-8" : "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}
