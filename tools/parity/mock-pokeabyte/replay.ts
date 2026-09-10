/**
 * Replay engine: turns a recorded fixture into the property state PokeAByte would
 * be serving, plus the batches of PropertiesChanged the hub would be pushing.
 *
 * Two deliberate departures from docs/parity-harness.md section 3:
 *
 * 1. Seeking replays every `E` from t=0 rather than starting at the last `K`.
 *    Keyframes written by fixture_recorder.js carry **values only** -- no `bytes` --
 *    so a keyframe seek would leave every `bytes` array stale, and the overlays read
 *    bytes (gen5's decrypted_mon_0, gen4's bit flags, every battle-summary byte read).
 *    A full pass over a 20 MB fixture costs a couple of seconds; wrong bytes cost a
 *    silent parity failure. Keyframes are still verified against the replayed values
 *    (`checkKeyframes`) as a consistency check on the recording.
 *
 * 2. Records are streamed, so the driver is a forward-only async generator. A run
 *    captures every checkpoint in one pass instead of seeking per checkpoint.
 */
import {
  readFixture,
  type FixtureHeader,
  type FixtureRecord,
  type PropertyDto,
} from "../lib/fixture.ts";

export interface Batch {
  /** Fixture-relative milliseconds. */
  tMs: number;
  /** Full property DTOs, exactly what the hub pushes in one PropertiesChanged. */
  changes: PropertyDto[];
  /** Super Shuckie frame samples that landed on this tick. */
  frames: number[];
  /** Hub lifecycle events on this tick. */
  lifecycle: ("MapperLoaded" | "InstanceReset")[];
}

/** Live property state; the same objects are handed to /mapper and to the hub. */
export class ReplayState {
  header!: FixtureHeader;
  /** path -> the DTO PokeAByte would currently serve. */
  readonly byPath = new Map<string, PropertyDto>();
  /** fixture path-id -> path. */
  paths: string[] = [];
  /** last `F` sample, i.e. Super Shuckie's total_elapsed_frames. */
  frame = 0;
  tMs = 0;

  loadHeader(header: FixtureHeader): void {
    this.header = header;
    this.paths = header.paths.slice();
    this.byPath.clear();
    for (const [id, dto] of Object.entries(header.initial)) {
      const path = this.paths[Number(id)] ?? dto.path;
      this.byPath.set(path, { ...dto, path, fieldsChanged: [] });
    }
  }

  /**
   * Registers a path that the recording only saw mid-run. The legacy client aborts
   * the whole batch on the first unknown path (parity-harness.md section 8), so every
   * such path must already exist in /mapper before the batch that mentions it.
   */
  registerPath(id: number, path: string, seed?: Partial<PropertyDto>): void {
    while (this.paths.length <= id) this.paths.push("");
    this.paths[id] = path;
    if (this.byPath.has(path)) return;
    this.byPath.set(path, {
      path,
      type: "int",
      memoryContainer: null,
      address: 0,
      length: 1,
      size: null,
      reference: null,
      bits: null,
      description: null,
      value: null,
      bytes: null,
      isFrozen: false,
      isReadOnly: false,
      fieldsChanged: [],
      ...seed,
    });
  }

  /** Applies one `E` delta and returns the updated DTO (the same object each time). */
  applyDelta(id: number, delta: Partial<PropertyDto>): PropertyDto | null {
    const path = this.paths[id];
    if (!path) return null;
    const dto = this.byPath.get(path);
    if (!dto) return null;
    Object.assign(dto, delta);
    dto.fieldsChanged = Object.keys(delta);
    return dto;
  }

  /** Snapshot for GET /mapper -- deep enough that later mutation cannot leak back. */
  snapshot(): PropertyDto[] {
    return [...this.byPath.values()].map((p) => ({
      ...p,
      bytes: p.bytes ? p.bytes.slice() : p.bytes,
      fieldsChanged: [],
    }));
  }
}

export interface DriverOptions {
  /** Stop after this many fixture-milliseconds. */
  untilMs?: number;
  /** Verify every `K` keyframe against the replayed values and report mismatches. */
  checkKeyframes?: boolean;
  /**
   * Paths the fixture only introduces mid-run (from `prescanPaths`). They are
   * registered before the first batch, because the legacy client drops the whole
   * batch on its first unknown path.
   */
  extraPaths?: { id: number; path: string }[];
  /** Share state with the mock server instead of owning a private copy. */
  state?: ReplayState;
}

/**
 * Streams a fixture into batches. The header is applied to `state` before the first
 * batch is yielded, and `P` paths are registered on the batch boundary *before* the
 * batch that first mentions them.
 */
export class ReplayDriver {
  readonly state: ReplayState;
  readonly keyframeMismatches: { tMs: number; path: string; expected: unknown; actual: unknown }[] = [];

  constructor(
    private readonly file: string,
    private readonly opts: DriverOptions = {},
  ) {
    this.state = opts.state ?? new ReplayState();
  }

  get header(): FixtureHeader {
    return this.state.header;
  }

  /** Reads only the header, so callers can inspect meta/glossary before playing. */
  async loadHeader(): Promise<FixtureHeader> {
    for await (const item of readFixture(this.file)) {
      if ("header" in item) {
        this.loadState(item.header);
        return item.header;
      }
    }
    throw new Error(`Fixture ${this.file} has no header`);
  }

  async *batches(): AsyncGenerator<Batch> {
    let pending: Batch | null = null;
    for await (const item of readFixture(this.file)) {
      if ("header" in item) {
        this.loadState(item.header);
        continue;
      }
      const record = item.record;
      const tMs = record[1];
      if (this.opts.untilMs !== undefined && tMs > this.opts.untilMs) break;

      if (pending && pending.tMs !== tMs) {
        yield pending;
        pending = null;
      }
      if (!pending) pending = { tMs, changes: [], frames: [], lifecycle: [] };
      this.state.tMs = tMs;
      this.applyRecord(record, pending);
    }
    if (pending) yield pending;
  }

  private loadState(header: FixtureHeader): void {
    this.state.loadHeader(header);
    for (const p of this.opts.extraPaths ?? []) this.state.registerPath(p.id, p.path);
  }

  private applyRecord(record: FixtureRecord, batch: Batch): void {
    switch (record[0]) {
      case "E": {
        const dto = this.state.applyDelta(record[2], record[3]);
        // An unknown id means the recording lost a `P` record; skipping keeps the
        // replay going rather than desyncing every later batch.
        if (dto) batch.changes.push(dto);
        break;
      }
      case "P":
        this.state.registerPath(record[2], record[3]);
        break;
      case "F":
        this.state.frame = record[2];
        batch.frames.push(record[2]);
        break;
      case "M":
        batch.lifecycle.push(record[2]);
        break;
      case "K":
        if (this.opts.checkKeyframes) this.checkKeyframe(record[1], record[2]);
        break;
    }
  }

  private checkKeyframe(tMs: number, snap: Record<string, unknown>): void {
    for (const [id, expected] of Object.entries(snap)) {
      const path = this.state.paths[Number(id)];
      if (!path) continue;
      const actual = this.state.byPath.get(path)?.value;
      if (!Object.is(actual, expected) && JSON.stringify(actual) !== JSON.stringify(expected)) {
        this.keyframeMismatches.push({ tMs, path, expected, actual });
      }
    }
  }
}

/**
 * One streaming pre-pass that collects the `P` paths a fixture introduces mid-run,
 * so they can be registered before playback starts.
 */
export async function prescanPaths(file: string): Promise<{ id: number; path: string }[]> {
  const found: { id: number; path: string }[] = [];
  for await (const item of readFixture(file)) {
    if ("header" in item) continue;
    if (item.record[0] === "P") found.push({ id: item.record[2], path: item.record[3] });
  }
  return found;
}
