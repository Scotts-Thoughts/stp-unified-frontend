/**
 * Builds a synthetic fixture from a PokeAByte mapper XML plus a scenario script, in
 * exactly the format the queuer's recorder writes.
 *
 *   npx tsx tools/parity/make-fixture.ts <mapper.xml> <mapper-id> <scenario.json> --out=<file.jsonl.gz>
 *
 * Why: the Phase 0 checklist needs a gen1 fixture to prove gen1-vs-gen1 parity, and
 * recording one needs an emulator, a ROM and Scott (plan 0.2, decision 6). A synthetic
 * fixture is a real PokeAByte property tree -- every path, type, reference and address
 * comes from the shipped mapper -- driven through a scripted sequence of states.
 *
 * It is NOT a substitute for a recorded run: the values are chosen, so it proves the
 * app is *deterministic and unchanged by a refactor*, not that it is *correct*. Every
 * synthetic fixture is written with `"synthetic": true` in its header so no report can
 * mistake one for a recording.
 */
import { createWriteStream, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createGzip } from "node:zlib";
import { parseMapperXml, type MapperProperty } from "./lib/mapper-xml.ts";
import type { PropertyDto } from "./lib/fixture.ts";

export interface Scenario {
  replayName: string;
  /** Recorded-at timestamp; the runner installs the fake clock at this instant. */
  recordedAt?: string;
  /** The queue item the recorder stores for context. */
  item?: Record<string, unknown>;
  /** Values applied before the first event; also what GET /mapper serves at t=0. */
  initial: Record<string, unknown>;
  /** Ordered timeline. Every step becomes one batch of `E` records at `tMs`. */
  steps: { tMs: number; comment?: string; set?: Record<string, unknown>; frame?: number }[];
  /** Emitted as `M` records. */
  lifecycle?: { tMs: number; kind: "MapperLoaded" | "InstanceReset" }[];
  /** Frame samples between steps, in fixture milliseconds. */
  frameIntervalMs?: number;
  /** Emulator frames per second, for the synthesised `F` samples. */
  framesPerSecond?: number;
}

/** Bytes are what a real PokeAByte would have read; for a synthetic run any faithful
 *  little-endian encoding of the numeric value is enough, and strings get their chars. */
function encodeBytes(prop: MapperProperty, value: unknown): number[] {
  const length = Math.max(1, prop.length || 1);
  if (typeof value === "number") {
    const bytes: number[] = [];
    let v = Math.max(0, Math.trunc(value));
    for (let i = 0; i < length; i++) {
      bytes.unshift(v & 0xff);
      v >>>= 8;
    }
    return bytes;
  }
  if (typeof value === "boolean") return [value ? 1 : 0];
  if (typeof value === "string") {
    const bytes = [...value].slice(0, length).map((c) => c.charCodeAt(0) & 0xff);
    while (bytes.length < length) bytes.push(0x50); // gen1 string terminator
    return bytes;
  }
  return new Array(length).fill(0);
}

function defaultValue(prop: MapperProperty): unknown {
  if (prop.staticValue !== null) {
    return /^-?\d+$/.test(prop.staticValue) ? Number(prop.staticValue) : prop.staticValue;
  }
  if (prop.type === "bool") return false;
  if (prop.type === "string") return "";
  // A referenced int with no value reads as the glossary entry for 0 in a fresh save,
  // which the mock resolves the same way PokeAByte does: null when 0 is not listed.
  return prop.reference ? null : 0;
}

export function buildFixture(mapperFile: string, mapperId: string, scenario: Scenario) {
  const mapper = parseMapperXml(mapperFile, mapperId);
  const byPath = new Map(mapper.properties.map((p) => [p.path, p]));

  for (const path of [...Object.keys(scenario.initial), ...scenario.steps.flatMap((s) => Object.keys(s.set ?? {}))]) {
    if (!byPath.has(path)) {
      throw new Error(`Scenario sets "${path}", which ${mapperId} does not define. Fix the scenario, not the mapper.`);
    }
  }

  const paths = mapper.properties.map((p) => p.path);
  const ids = new Map(paths.map((p, i) => [p, i]));
  const initial: Record<string, PropertyDto> = {};
  const current = new Map<string, unknown>();

  for (const [i, prop] of mapper.properties.entries()) {
    const value = path_in(scenario.initial, prop.path) ? scenario.initial[prop.path] : defaultValue(prop);
    current.set(prop.path, value);
    initial[String(i)] = {
      path: prop.path,
      type: prop.type,
      memoryContainer: prop.memoryContainer,
      address: prop.address,
      length: prop.length,
      size: prop.size,
      reference: prop.reference,
      bits: prop.bits,
      description: prop.description,
      value,
      bytes: encodeBytes(prop, value),
      isFrozen: false,
      isReadOnly: prop.staticValue !== null,
      fieldsChanged: [],
    };
  }

  const header = {
    format: 1,
    synthetic: true,
    generator: "tools/parity/make-fixture.ts",
    recordedAt: scenario.recordedAt ?? "2026-01-01T00:00:00.000Z",
    mapperId,
    replayName: scenario.replayName,
    item: scenario.item ?? null,
    meta: mapper.meta,
    glossary: mapper.glossary,
    paths,
    initial,
  };

  const records: unknown[][] = [];
  const fps = scenario.framesPerSecond ?? 60;
  const frameInterval = scenario.frameIntervalMs ?? 250;
  const lastT = Math.max(0, ...scenario.steps.map((s) => s.tMs));

  // `F` samples: the recorder polls Super Shuckie every 250 ms and writes a record
  // whenever the frame counter moved.
  const frameTimes: number[] = [];
  for (let t = 0; t <= lastT; t += frameInterval) frameTimes.push(t);

  const timeline: { tMs: number; emit: () => void }[] = [];
  for (const t of frameTimes) {
    timeline.push({ tMs: t, emit: () => records.push(["F", t, Math.max(1, Math.round((t / 1000) * fps))]) });
  }
  for (const life of scenario.lifecycle ?? []) {
    timeline.push({ tMs: life.tMs, emit: () => records.push(["M", life.tMs, life.kind]) });
  }
  for (const step of scenario.steps) {
    timeline.push({
      tMs: step.tMs,
      emit: () => {
        for (const [path, value] of Object.entries(step.set ?? {})) {
          if (JSON.stringify(current.get(path)) === JSON.stringify(value)) continue;
          current.set(path, value);
          records.push(["E", step.tMs, ids.get(path)!, { value, bytes: encodeBytes(byPath.get(path)!, value) }]);
        }
      },
    });
  }
  timeline.sort((a, b) => a.tMs - b.tMs);
  for (const entry of timeline) entry.emit();

  // Keyframes: every 60 s and at the end, values only -- exactly what the recorder writes.
  const keyframeTimes = new Set<number>();
  for (let t = 60000; t <= lastT; t += 60000) keyframeTimes.add(t);
  keyframeTimes.add(lastT);
  const withKeyframes: unknown[][] = [];
  const replayed = new Map(mapper.properties.map((p) => [p.path, initial[String(ids.get(p.path)!)].value]));
  let nextKeyframe = [...keyframeTimes].sort((a, b) => a - b);
  for (const record of records) {
    while (nextKeyframe.length && (record[1] as number) > nextKeyframe[0]) {
      withKeyframes.push(["K", nextKeyframe.shift()!, snapshot(replayed, ids)]);
    }
    if (record[0] === "E") replayed.set(paths[record[2] as number], (record[3] as { value: unknown }).value);
    withKeyframes.push(record);
  }
  for (const t of nextKeyframe) withKeyframes.push(["K", t, snapshot(replayed, ids)]);

  return { header, records: withKeyframes, lastFrame: Math.max(1, Math.round((lastT / 1000) * fps)) };
}

function snapshot(values: Map<string, unknown>, ids: Map<string, number>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [path, value] of values) out[String(ids.get(path)!)] = value;
  return out;
}

function path_in(record: Record<string, unknown>, path: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, path);
}

export async function writeFixture(outFile: string, built: ReturnType<typeof buildFixture>): Promise<void> {
  mkdirSync(dirname(outFile), { recursive: true });
  const gzip = createGzip({ level: 9 });
  const file = createWriteStream(outFile);
  const done = new Promise<void>((res, rej) => {
    file.on("finish", res);
    file.on("error", rej);
  });
  gzip.pipe(file);
  gzip.write(JSON.stringify(built.header) + "\n");
  for (const record of built.records) gzip.write(JSON.stringify(record) + "\n");
  gzip.end();
  await done;

  writeFileSync(
    outFile.replace(/\.jsonl\.gz$/, ".meta.json"),
    JSON.stringify(
      {
        file: outFile,
        synthetic: true,
        mapperId: built.header.mapperId,
        replayName: built.header.replayName,
        events: built.records.filter((r) => r[0] === "E").length,
        properties: built.header.paths.length,
        lastFrame: built.lastFrame,
        durationSec: Math.round(Math.max(0, ...built.records.map((r) => r[1] as number)) / 1000),
        bytes: statSync(outFile).size,
      },
      null,
      2,
    ),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const positional = argv.filter((a) => !a.startsWith("--"));
  if (positional.length < 3) {
    console.error("usage: make-fixture.ts <mapper.xml> <mapper-id> <scenario.json> --out=<file.fixture.jsonl.gz>");
    process.exit(2);
  }
  const out = argv.find((a) => a.startsWith("--out="))?.split("=").slice(1).join("=");
  if (!out) {
    console.error("--out is required");
    process.exit(2);
  }
  const scenario = JSON.parse(readFileSync(resolve(positional[2]), "utf8")) as Scenario;
  const built = buildFixture(resolve(positional[0]), positional[1], scenario);
  await writeFixture(resolve(out), built);
  console.log(
    `${scenario.replayName}: ${built.header.paths.length} properties, ` +
      `${built.records.filter((r) => r[0] === "E").length} events, ` +
      `${(statSync(resolve(out)).size / 1024).toFixed(0)} KB -> ${out}`,
  );
}
