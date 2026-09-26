/**
 * Stand-in for a GameHook instance (see the STP task brief for the verified routes),
 * indistinguishable to the client under test: `GET /`, `GET /mappers`,
 * `{base}/mapper`, `{base}/properties[/…]`, and the raw WebSocket at `{base}/ws`.
 * `{base}` is `http://host:port/instances/<index>`.
 *
 * Two things about a real GameHook build (verified on this machine, Windows) are
 * reproduced here because the client has to cope with them: `/mappers` lists an
 * official mapper's `value` with backslash path separators
 * (`gba\pokemon_emerald.xml`) while a custom one already uses `/`
 * (`custom/ST/gen4/...`), and a write's `bytes` are decoded back into `value` the same
 * way `tools/parity/mock-pokeabyte/server.ts` does for PokeAByte, so a `setBytes` has
 * something to read back.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";

export type GameHookPropertyType = "int" | "uint" | "bool" | "string" | "bitArray" | "binaryCodedDecimal" | "bit";

export interface GameHookPropertySeed {
  path: string;
  type: GameHookPropertyType;
  value: unknown;
  bytes: number[];
  address?: number | null;
  length?: number;
  region?: string | null;
  bits?: string | null;
  reference?: string | null;
  readOnly?: boolean;
}

interface PropertyState {
  path: string;
  type: GameHookPropertyType;
  value: unknown;
  bytes: number[];
  address: number | null;
  length: number;
  region: string | null;
  bits: string | null;
  reference: string | null;
  readOnly: boolean;
}

export interface MapperCatalogEntry {
  id: string;
  name: string;
  platform: string;
  custom: boolean;
}

interface Instance {
  index: number;
  mapper: (MapperCatalogEntry & { key: string; nativeProcessor: string }) | null;
  properties: Map<string, PropertyState>;
  continuousRead: boolean;
  sockets: Set<WebSocket>;
}

export interface MockGameHookOptions {
  port?: number;
  host?: string;
  log?: (msg: string) => void;
}

export interface WriteLogEntry {
  path: string;
  body: unknown;
  status: number;
}

export class MockGameHook {
  readonly writeLog: WriteLogEntry[] = [];

  private server: Server | null = null;
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly port: number;
  private readonly host: string;
  private readonly log: (msg: string) => void;
  private readonly instances = new Map<number, Instance>();
  /** Every mapper `/mappers` can list, keyed by its `value`; independent of being loaded anywhere. */
  private readonly mapperCatalog = new Map<string, MapperCatalogEntry>();

  constructor(opts: MockGameHookOptions = {}) {
    this.port = opts.port ?? 61358;
    this.host = opts.host ?? "127.0.0.1";
    this.log = opts.log ?? (() => {});
  }

  get origin(): string {
    return `http://${this.host}:${this.port}`;
  }

  instanceBase(index: number): string {
    return `${this.origin}/instances/${index}`;
  }

  private instance(index: number): Instance {
    let inst = this.instances.get(index);
    if (!inst) {
      inst = { index, mapper: null, properties: new Map(), continuousRead: true, sockets: new Set() };
      this.instances.set(index, inst);
    }
    return inst;
  }

  /** Registers a mapper so `/mappers` can list it, independent of loading it anywhere. */
  registerMapper(key: string, info: MapperCatalogEntry): void {
    this.mapperCatalog.set(key, info);
  }

  /** Loads a mapper (already `registerMapper`'d) at an instance, with the given properties. */
  loadMapper(index: number, key: string, seeds: GameHookPropertySeed[]): void {
    const info = this.mapperCatalog.get(key);
    if (!info) throw new Error(`registerMapper('${key}') before loadMapper`);
    const inst = this.instance(index);
    inst.mapper = { ...info, key, nativeProcessor: "Big Endian" };
    inst.properties = new Map(
      seeds.map((s) => [
        s.path,
        {
          path: s.path,
          type: s.type,
          value: s.value,
          bytes: s.bytes,
          address: s.address ?? null,
          length: s.length ?? s.bytes.length,
          region: s.region ?? null,
          bits: s.bits ?? null,
          reference: s.reference ?? null,
          readOnly: s.readOnly ?? false,
        },
      ]),
    );
  }

  unloadMapper(index: number): void {
    const inst = this.instances.get(index);
    if (inst) inst.mapper = null;
  }

  setContinuousRead(index: number, on: boolean): void {
    const inst = this.instance(index);
    inst.continuousRead = on;
    if (!on) this.dropSockets(index);
  }

  /**
   * Closes every open socket for an instance with 1001, without touching its mapper or
   * continuous-read flag -- the shape of a benign restart the client's own reconnect
   * has to recover from, not an unload.
   */
  dropSockets(index: number, code = 1001): void {
    const inst = this.instances.get(index);
    if (!inst) return;
    for (const ws of inst.sockets) ws.close(code);
    inst.sockets.clear();
  }

  /** How many sockets are currently open for an instance -- what `disconnect()` should leave at 0. */
  socketCount(index: number): number {
    return this.instances.get(index)?.sockets.size ?? 0;
  }

  /** Changes properties and, if continuous read is on and a socket is open, pushes one update frame. */
  pushChanges(index: number, changes: { path: string; value: unknown; bytes: number[] }[]): void {
    const inst = this.instances.get(index);
    if (!inst) return;
    for (const c of changes) {
      const prop = inst.properties.get(c.path);
      if (prop) {
        prop.value = c.value;
        prop.bytes = c.bytes;
      }
    }
    if (!inst.continuousRead || inst.sockets.size === 0) return;
    const frame = JSON.stringify(changes.map((c) => ({ path: c.path, value: c.value, bytes: c.bytes })));
    for (const ws of inst.sockets) ws.send(frame);
  }

  /** Sends an arbitrary frame verbatim, bypassing property validation -- for a batch naming an unknown path. */
  sendRawFrame(index: number, frame: unknown[]): void {
    const inst = this.instances.get(index);
    if (!inst) return;
    const text = JSON.stringify(frame);
    for (const ws of inst.sockets) ws.send(text);
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => this.handle(req, res));
    this.server.on("upgrade", (req, socket, head) => this.handleUpgrade(req, socket, head as Buffer));
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", (err: NodeJS.ErrnoException) => {
        reject(err.code === "EADDRINUSE" ? new Error(`Port ${this.port} is taken.`) : err);
      });
      this.server!.listen(this.port, this.host, resolve);
    });
    this.log(`[mock-gamehook] on ${this.origin}`);
  }

  async stop(): Promise<void> {
    for (const inst of this.instances.values()) for (const ws of inst.sockets) ws.terminate();
    await new Promise<void>((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
    });
    this.server = null;
  }

  // ---------------------------------------------------------------- HTTP

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const origin = req.headers.origin;
    res.setHeader("Access-Control-Allow-Origin", origin ?? "*");
    if (origin) res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] ?? "*");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    const url = new URL(req.url ?? "/", this.origin);
    const route = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;

    if (req.method === "GET") return this.handleGet(route, res);
    if (req.method === "POST") {
      void readBody(req).then((body) => this.handlePost(route, body, res));
      return;
    }
    json(res, 404, { status: 404 });
  }

  private handleGet(route: string, res: ServerResponse): void {
    if (route === "/") return json(res, 200, { version: "1.0.0-mock" });

    if (route === "/mappers") {
      const list = [...this.mapperCatalog.entries()].map(([value, info]) => {
        const instances = [...this.instances.values()].filter((i) => i.mapper?.key === value).map((i) => i.index);
        return { value, id: info.id, name: info.name, platform: info.platform, custom: info.custom, loaded: instances.length > 0, instances };
      });
      return json(res, 200, list);
    }

    const m = /^\/instances\/(\d+)(\/.*)?$/.exec(route);
    if (!m) return json(res, 404, { status: 404 });
    const index = Number(m[1]);
    const sub = m[2] ?? "";
    const inst = this.instances.get(index);

    if (sub === "/mapper") {
      if (!inst?.mapper) return notLoaded(res);
      const { id, name, platform, nativeProcessor, custom } = inst.mapper;
      return json(res, 200, { id, name, platform, nativeProcessor, custom });
    }
    if (sub === "/properties") {
      if (!inst?.mapper) return notLoaded(res);
      return json(res, 200, buildTree(inst.properties));
    }
    if (sub.startsWith("/properties/")) {
      if (!inst?.mapper) return notLoaded(res);
      const path = fromRoutePath(sub.slice("/properties/".length));
      const prop = inst.properties.get(path);
      if (!prop) return json(res, 404, { status: 404, code: "property_not_found" });
      return json(res, 200, {
        name: path.split(".").pop(),
        type: prop.type,
        address: prop.address,
        length: prop.length,
        region: prop.region,
        bits: prop.bits,
        reference: prop.reference,
        value: prop.value,
        bytes: prop.bytes,
        rawBytesHex: prop.bytes.map((b) => b.toString(16).padStart(2, "0")).join(""),
      });
    }
    json(res, 404, { status: 404 });
  }

  private handlePost(route: string, body: unknown, res: ServerResponse): void {
    const m = /^\/instances\/(\d+)\/properties\/(.+)$/.exec(route);
    if (!m) return json(res, 404, { status: 404 });
    const index = Number(m[1]);
    const path = fromRoutePath(m[2]);
    const inst = this.instances.get(index);
    if (!inst?.mapper) return notLoaded(res);

    const prop = inst.properties.get(path);
    if (!prop) {
      this.writeLog.push({ path, body, status: 404 });
      return json(res, 404, { status: 404, code: "property_not_found" });
    }
    if (prop.readOnly) {
      this.writeLog.push({ path, body, status: 422 });
      return json(res, 422, { status: 422, code: "property_write_failed" });
    }
    if (!inst.continuousRead) {
      this.writeLog.push({ path, body, status: 409 });
      return json(res, 409, { status: 409, code: "continuous_read_disabled" });
    }

    const b = (body ?? {}) as { value?: unknown; bytes?: number[] };
    if (Array.isArray(b.bytes)) {
      prop.bytes = b.bytes.slice();
      const decoded = decodeGameHookBytes(prop.type, prop.bytes);
      if (decoded !== undefined) prop.value = decoded;
    } else if ("value" in b) {
      prop.value = b.value;
    } else {
      this.writeLog.push({ path, body, status: 422 });
      return json(res, 422, { status: 422, code: "property_write_failed" });
    }
    this.writeLog.push({ path, body, status: 200 });
    // A write is "a read in which something changed": pushed exactly as a poll tick
    // would push it, over the same path/value/bytes frame `pushChanges` sends.
    this.pushChanges(index, [{ path, value: prop.value, bytes: prop.bytes }]);
    json(res, 200, { success: true });
  }

  private handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const url = new URL(req.url ?? "/", this.origin);
    const route = url.pathname.replace(/\/+$/, "");
    const m = /^\/instances\/(\d+)\/ws$/.exec(route);
    const inst = m ? this.instances.get(Number(m[1])) : undefined;
    if (!inst || !inst.continuousRead) {
      // GameHook refuses the upgrade with 409 while continuous read is off, or the
      // instance does not exist.
      socket.write("HTTP/1.1 409 Conflict\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      inst.sockets.add(ws);
      ws.on("close", () => inst.sockets.delete(ws));
    });
  }
}

function notLoaded(res: ServerResponse): void {
  json(res, 404, {
    type: "https://tools.ietf.org/html/rfc9110#section-15.5.1",
    title: "MAPPER_NOT_LOADED",
    status: 404,
    detail: "No mapper is loaded on this instance.",
    code: "mapper_not_loaded",
  });
}

/** `a.b.0.c` -> `{a:{b:{"0":{c: value}}}}`: numeric segments are object keys, never arrays. */
function buildTree(properties: Map<string, PropertyState>): Record<string, unknown> {
  const tree: Record<string, unknown> = {};
  for (const [path, prop] of properties) {
    const segments = path.split(".");
    let node = tree;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      if (typeof node[seg] !== "object" || node[seg] === null || Array.isArray(node[seg])) node[seg] = {};
      node = node[seg] as Record<string, unknown>;
    }
    node[segments[segments.length - 1]] = prop.value;
  }
  return tree;
}

/** The server's own "/" -> "." normalisation, mirrored here for the request side. */
function fromRoutePath(routeTail: string): string {
  return decodeURIComponent(routeTail).replace(/\//g, ".");
}

/**
 * Decodes written bytes back into a value for `int`/`uint`, little-endian -- so a
 * `setBytes` write has something sensible to read back, the same courtesy
 * `tools/parity/mock-pokeabyte/server.ts` extends PokeAByte's writes. (A real GameHook
 * build has been seen to sign-extend a 4-byte `uint`'s value where the bytes
 * themselves are correct; that is a GameHook quirk the client is told not to work
 * around, and this mock does not reproduce it.)
 */
function decodeGameHookBytes(type: GameHookPropertyType, bytes: number[]): unknown {
  if ((type !== "int" && type !== "uint") || bytes.length === 0) return undefined;
  let n = 0;
  for (let i = bytes.length - 1; i >= 0; i--) n = n * 256 + (bytes[i] & 0xff);
  if (type === "int" && bytes[bytes.length - 1] & 0x80) n -= 2 ** (8 * bytes.length);
  return n;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(text) });
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
