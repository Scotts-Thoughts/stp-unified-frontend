/**
 * Walks a fixture and writes the checkpoints the runner captures at.
 *
 *   npx tsx tools/parity/scan-fixture.ts <fixture.jsonl.gz> [--out=<dir>] [--min-gap=2000]
 *
 * A checkpoint is any transition of a *state* property (parity-harness.md section 6):
 * battle mode/type/result, the mapper's state field, the enemy and party-lead identity,
 * badge bits, beatChampion and playerId (reset / new game), plus the first and last
 * frame sample. Each one records the `leadInMs` the runner must start from: the last
 * keyframe before the enclosing battle or state change, so the app's own state machine
 * is driven through the same transitions the legacy app saw, not dropped into the middle.
 *
 * Property names differ per mapper family, so the watch list is regexes over all five
 * vocabularies rather than a fixed path list (mapper-matrix.md).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { readFixture, type FixtureHeader } from "./lib/fixture.ts";

/** Any transition of a matching path becomes a checkpoint. */
const WATCH: { name: string; re: RegExp }[] = [
  { name: "battle.mode", re: /^battle\.mode$/ },
  { name: "battle.type", re: /^battle\.type$/ },
  { name: "battle.result", re: /^battle\.result$/ },
  // gen3 keeps run state under pointers/stp_vars; gen4/5 expose meta.state.
  { name: "state", re: /^(meta\.state|pointers\.[A-Za-z_]*state|stp_vars\.[A-Za-z_]*state)$/i },
  // Enemy identity: DEPRECATED gen1/2 say enemyPokemon/otherPokemon, ST/STANDARD say enemy/wild.
  { name: "enemy.species", re: /^battle\.(enemyPokemon|otherPokemon|opponent|enemy|wild|wildPokemon)\.species$/ },
  { name: "enemy.level", re: /^battle\.(enemyPokemon|otherPokemon|opponent|enemy|wild|wildPokemon)\.level$/ },
  { name: "trainer.class", re: /^battle\.trainer\.class$/ },
  { name: "party.0.species", re: /^player\.(team|party)\.0\.species$/ },
  { name: "party.0.level", re: /^player\.(team|party)\.0\.level$/ },
  { name: "badges", re: /^player\.badges\./ },
  { name: "beatChampion", re: /^events\.beatChampion$/ },
  { name: "playerId", re: /^player\.playerId$/ },
];

/** A change to one of these opens a new "enclosing state change" for lead-in purposes. */
const ENCLOSING = new Set(["battle.mode", "state", "playerId"]);

export interface Checkpoint {
  /** Stable id, unique within the fixture: used as the capture folder name. */
  id: string;
  tMs: number;
  /** Which watch rule fired. */
  reason: string;
  path: string;
  from: unknown;
  to: unknown;
  /** Replay from here so the app sees the transitions leading into this state. */
  leadInMs: number;
  frame: number;
}

export interface ScanResult {
  fixture: string;
  mapperId: string;
  gameName: string;
  recordedAt: string;
  durationMs: number;
  properties: number;
  events: number;
  firstFrame: number | null;
  lastFrame: number | null;
  /** Paths the recording introduced mid-run; they must exist before playback starts. */
  extraPaths: { id: number; path: string }[];
  keyframesMs: number[];
  checkpoints: Checkpoint[];
}

export async function scanFixture(file: string, minGapMs = 2000): Promise<ScanResult> {
  let header: FixtureHeader | null = null;
  const values = new Map<string, unknown>();
  const watchOf = new Map<number, string>();
  const paths: string[] = [];
  const keyframesMs: number[] = [];
  const extraPaths: { id: number; path: string }[] = [];
  const checkpoints: Checkpoint[] = [];

  let events = 0;
  let firstFrame: number | null = null;
  let lastFrame: number | null = null;
  let frame = 0;
  let durationMs = 0;
  /** Start of the state span the current checkpoint sits in. */
  let enclosingStartMs = 0;
  let lastKeyframeBeforeEnclosing = 0;
  const seenIds = new Map<string, number>();

  const classify = (id: number, path: string) => {
    for (const w of WATCH) {
      if (w.re.test(path)) {
        watchOf.set(id, w.name);
        return;
      }
    }
  };

  for await (const item of readFixture(file)) {
    if ("header" in item) {
      header = item.header;
      paths.push(...header.paths);
      header.paths.forEach((p, id) => classify(id, p));
      for (const [id, dto] of Object.entries(header.initial)) values.set(paths[Number(id)] ?? dto.path, dto.value);
      continue;
    }
    const record = item.record;
    durationMs = Math.max(durationMs, record[1]);

    switch (record[0]) {
      case "P":
        extraPaths.push({ id: record[2], path: record[3] });
        while (paths.length <= record[2]) paths.push("");
        paths[record[2]] = record[3];
        classify(record[2], record[3]);
        break;
      case "F":
        frame = record[2];
        if (firstFrame === null) firstFrame = frame;
        lastFrame = frame;
        break;
      case "K":
        keyframesMs.push(record[1]);
        break;
      case "E": {
        events++;
        const [, tMs, id, delta] = record;
        if (!("value" in delta)) break;
        const path = paths[id];
        if (!path) break;
        const before = values.get(path);
        values.set(path, delta.value);
        const reason = watchOf.get(id);
        if (!reason) break;
        if (sameValue(before, delta.value)) break;

        if (ENCLOSING.has(reason)) {
          enclosingStartMs = tMs;
          lastKeyframeBeforeEnclosing = lastAtOrBefore(keyframesMs, tMs);
        }
        // Collapse bursts: one checkpoint per reason per minGapMs.
        const key = `${reason}`;
        const prev = seenIds.get(key);
        if (prev !== undefined && tMs - prev < minGapMs) break;
        seenIds.set(key, tMs);

        checkpoints.push({
          id: `${String(checkpoints.length).padStart(4, "0")}-${reason.replaceAll(".", "_")}-${tMs}`,
          tMs,
          reason,
          path,
          from: before ?? null,
          to: delta.value ?? null,
          leadInMs: Math.min(lastKeyframeBeforeEnclosing, enclosingStartMs),
          frame,
        });
        break;
      }
    }
  }

  if (!header) throw new Error(`Fixture ${file} has no header`);
  return {
    fixture: file,
    mapperId: header.mapperId,
    gameName: header.meta.gameName,
    recordedAt: header.recordedAt,
    durationMs,
    properties: paths.length,
    events,
    firstFrame,
    lastFrame,
    extraPaths,
    keyframesMs,
    checkpoints,
  };
}

function sameValue(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function lastAtOrBefore(sorted: number[], t: number): number {
  let best = 0;
  for (const v of sorted) {
    if (v <= t) best = v;
    else break;
  }
  return best;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const file = argv.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("usage: scan-fixture.ts <fixture.jsonl.gz> [--out=<dir>] [--min-gap=2000]");
    process.exit(2);
  }
  const minGap = Number(argv.find((a) => a.startsWith("--min-gap="))?.split("=")[1] ?? 2000);
  const outDir = argv.find((a) => a.startsWith("--out="))?.split("=")[1] ?? dirname(file);
  const result = await scanFixture(file, minGap);
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, basename(file).replace(/\.fixture\.jsonl\.gz$/, "") + ".checkpoints.json");
  writeFileSync(out, JSON.stringify(result, null, 2));
  const byReason = new Map<string, number>();
  for (const c of result.checkpoints) byReason.set(c.reason, (byReason.get(c.reason) ?? 0) + 1);
  console.log(
    `${basename(file)}: ${result.events} events, ${(result.durationMs / 1000).toFixed(0)}s, ` +
      `${result.properties} properties, ${result.keyframesMs.length} keyframes, ` +
      `${result.extraPaths.length} mid-run paths, frames ${result.firstFrame}..${result.lastFrame}`,
  );
  console.log(`${result.checkpoints.length} checkpoints: ${[...byReason].map(([k, v]) => `${k}=${v}`).join(" ")}`);
  console.log(`wrote ${out}`);
}
