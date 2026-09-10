/**
 * Reader for the queuer's fixture format (format 1, written by
 * A:\Dropbox\stp-projects\programs\queuer\fixture_recorder.js).
 *
 * Layout: gzip-compressed JSON lines. Line 1 is the header; every following line
 * is one record:
 *   ["E", tMs, pathId, {value?, bytes?, ...}]  property change (only changed fields)
 *   ["F", tMs, frame]                          Super Shuckie frame sample
 *   ["K", tMs, {pathId: value}]                keyframe -- VALUES ONLY, no bytes
 *   ["M", tMs, "MapperLoaded" | "InstanceReset"]
 *   ["P", tMs, pathId, path]                   path first seen mid-run
 *
 * Records are streamed, never all held in memory: a two-hour run is ~2.7M events.
 */
import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";

/** A property DTO exactly as PokeAByte 0.11.2 serialises it. */
export interface PropertyDto {
  path: string;
  type: string;
  memoryContainer: string | null;
  address: number;
  length: number;
  size: number | null;
  reference: string | null;
  bits: string | null;
  description: string | null;
  value: unknown;
  bytes: number[] | null;
  isFrozen: boolean;
  isReadOnly: boolean;
  fieldsChanged: string[];
}

export interface MapperMeta {
  id: string;
  gameName: string;
  gamePlatform: string;
  version: string;
  path: string;
}

export interface FixtureHeader {
  format: number;
  recordedAt: string;
  mapperId: string;
  replayName: string;
  item: Record<string, unknown> | null;
  meta: MapperMeta;
  glossary: Record<string, { key: unknown; value: unknown }[]>;
  paths: string[];
  initial: Record<string, PropertyDto>;
}

export type EventRecord = ["E", number, number, Partial<PropertyDto>];
export type FrameRecord = ["F", number, number];
export type KeyframeRecord = ["K", number, Record<string, unknown>];
export type LifecycleRecord = ["M", number, "MapperLoaded" | "InstanceReset"];
export type PathRecord = ["P", number, number, string];
export type FixtureRecord = EventRecord | FrameRecord | KeyframeRecord | LifecycleRecord | PathRecord;

export async function readHeader(file: string): Promise<FixtureHeader> {
  for await (const line of lines(file)) return JSON.parse(line) as FixtureHeader;
  throw new Error(`Fixture ${file} is empty`);
}

/** Streams every record after the header, in file order. */
export async function* readRecords(file: string): AsyncGenerator<FixtureRecord> {
  let first = true;
  for await (const line of lines(file)) {
    if (first) {
      first = false;
      continue;
    }
    if (!line) continue;
    yield JSON.parse(line) as FixtureRecord;
  }
}

/** Streams the header and then every record, so the file is read exactly once. */
export async function* readFixture(
  file: string,
): AsyncGenerator<{ header: FixtureHeader } | { record: FixtureRecord }> {
  let header: FixtureHeader | null = null;
  for await (const line of lines(file)) {
    if (!line) continue;
    if (!header) {
      header = JSON.parse(line) as FixtureHeader;
      yield { header };
      continue;
    }
    yield { record: JSON.parse(line) as FixtureRecord };
  }
  if (!header) throw new Error(`Fixture ${file} is empty`);
}

async function* lines(file: string): AsyncGenerator<string> {
  const stream = file.endsWith(".gz")
    ? createReadStream(file).pipe(createGunzip())
    : createReadStream(file);
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) yield line;
}
