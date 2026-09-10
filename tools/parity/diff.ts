/**
 * The nine oracles. Compares a candidate run against a baseline run and writes a
 * report; exit code 1 means at least one oracle differs.
 *
 *   npx tsx tools/parity/diff.ts <baseline-dir> <candidate-dir> [--out=tools/reports/<name>] [--tolerant-pixels]
 *
 * Pixel tolerance is decided by the runs themselves: two runs on the same Electron
 * major are compared at zero tolerance; 25 vs 37 falls back to pixelmatch with
 * anti-aliasing skipped, and the report says which mode was used, because the 25<->37
 * renderer delta is recorded drift, not a regression (parity-harness.md section 4).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import type { StyleEntry } from "./capture.ts";

export interface Difference {
  oracle: number;
  name: string;
  checkpoint?: string;
  detail: string;
  /** Trimmed to keep reports readable; the full values stay in the capture dirs. */
  baseline?: string;
  candidate?: string;
}

export interface DiffReport {
  baseline: string;
  candidate: string;
  pixelMode: "exact" | "tolerant" | "skipped";
  checkpoints: { id: string; differences: number }[];
  differences: Difference[];
  passed: boolean;
}

const ORACLE_NAMES: Record<number, string> = {
  1: "computed styles + layout",
  2: "pixels",
  3: "split CSVs",
  4: "app data",
  5: "PokeAByte writes",
  6: "control server /status",
  7: "OBS chapter markers",
  8: "Super Shuckie calls",
  9: "console",
};

export function diff(baselineDir: string, candidateDir: string, opts: { outDir?: string; tolerantPixels?: boolean } = {}): DiffReport {
  const differences: Difference[] = [];
  const baseRun = readJson<{ electronMajor?: number }>(join(baselineDir, "run.json")) ?? {};
  const candRun = readJson<{ electronMajor?: number }>(join(candidateDir, "run.json")) ?? {};
  const sameElectron = baseRun.electronMajor === candRun.electronMajor;
  const pixelMode: DiffReport["pixelMode"] = opts.tolerantPixels || !sameElectron ? "tolerant" : "exact";
  const outDir = opts.outDir ?? join(candidateDir, "diff");
  mkdirSync(outDir, { recursive: true });

  // --- per-checkpoint oracles: 1, 2, 4 (localStorage) and 9 ---------------------
  const checkpoints = listCheckpoints(baselineDir);
  const candidateCheckpoints = new Set(listCheckpoints(candidateDir));
  const perCheckpoint: { id: string; differences: number }[] = [];

  for (const id of checkpoints) {
    const before = differences.length;
    if (!candidateCheckpoints.has(id)) {
      differences.push({ oracle: 0, name: "missing checkpoint", checkpoint: id, detail: "not captured in the candidate run" });
      perCheckpoint.push({ id, differences: 1 });
      continue;
    }
    diffStyles(join(baselineDir, id), join(candidateDir, id), id, differences);
    diffPixels(join(baselineDir, id), join(candidateDir, id), id, pixelMode, outDir, differences);
    diffJsonFile(join(baselineDir, id, "storage.json"), join(candidateDir, id, "storage.json"), 4, "localStorage", id, differences);
    diffConsole(join(baselineDir, id, "console.json"), join(candidateDir, id, "console.json"), id, differences);
    perCheckpoint.push({ id, differences: differences.length - before });
  }
  for (const id of candidateCheckpoints) {
    if (!checkpoints.includes(id)) {
      differences.push({ oracle: 0, name: "extra checkpoint", checkpoint: id, detail: "not present in the baseline run" });
    }
  }

  // --- whole-run oracles: 3, 4 (files), 5, 6, 7, 8, 9 --------------------------
  diffTree(join(baselineDir, "files", "splits"), join(candidateDir, "files", "splits"), 3, differences);
  diffTree(join(baselineDir, "files", "appdata"), join(candidateDir, "files", "appdata"), 4, differences);
  diffJsonFile(join(baselineDir, "writes.json"), join(candidateDir, "writes.json"), 5, "write log", undefined, differences, stripTiming);
  diffJsonFile(join(baselineDir, "status.json"), join(candidateDir, "status.json"), 6, "control server", undefined, differences);
  diffJsonFile(join(baselineDir, "obs-markers.json"), join(candidateDir, "obs-markers.json"), 7, "chapter markers", undefined, differences, stripTiming);
  diffJsonFile(join(baselineDir, "shuckie-calls.json"), join(candidateDir, "shuckie-calls.json"), 8, "shuckie calls", undefined, differences, stripTiming);
  diffConsole(join(baselineDir, "console-tail.json"), join(candidateDir, "console-tail.json"), undefined, differences);

  const report: DiffReport = {
    baseline: baselineDir,
    candidate: candidateDir,
    pixelMode,
    checkpoints: perCheckpoint,
    differences,
    passed: differences.length === 0,
  };
  writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 1));
  return report;
}

// ---------------------------------------------------------------- oracle 1

function diffStyles(baseDir: string, candDir: string, checkpoint: string, out: Difference[]): void {
  const a = readJson<Record<string, StyleEntry>>(join(baseDir, "styles.json"));
  const b = readJson<Record<string, StyleEntry>>(join(candDir, "styles.json"));
  if (!a || !b) {
    out.push({ oracle: 1, name: ORACLE_NAMES[1], checkpoint, detail: "styles.json missing on one side" });
    return;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let reported = 0;
  for (const key of keys) {
    if (reported >= 40) {
      out.push({ oracle: 1, name: ORACLE_NAMES[1], checkpoint, detail: `... and more (${keys.size} elements compared)` });
      break;
    }
    const ea = a[key];
    const eb = b[key];
    if (!ea || !eb) {
      out.push({
        oracle: 1,
        name: ORACLE_NAMES[1],
        checkpoint,
        detail: `element only in ${ea ? "baseline" : "candidate"}: ${key}`,
      });
      reported++;
      continue;
    }
    if (JSON.stringify(ea.rect) !== JSON.stringify(eb.rect)) {
      out.push({
        oracle: 1,
        name: ORACLE_NAMES[1],
        checkpoint,
        detail: `rect differs: ${key}`,
        baseline: JSON.stringify(ea.rect),
        candidate: JSON.stringify(eb.rect),
      });
      reported++;
    }
    if (ea.text !== eb.text) {
      out.push({
        oracle: 1,
        name: ORACLE_NAMES[1],
        checkpoint,
        detail: `text differs: ${key}`,
        baseline: String(ea.text),
        candidate: String(eb.text),
      });
      reported++;
    }
    for (const prop of new Set([...Object.keys(ea.styles), ...Object.keys(eb.styles)])) {
      if (ea.styles[prop] !== eb.styles[prop]) {
        out.push({
          oracle: 1,
          name: ORACLE_NAMES[1],
          checkpoint,
          detail: `${prop} differs: ${key}`,
          baseline: ea.styles[prop],
          candidate: eb.styles[prop],
        });
        reported++;
        if (reported >= 40) break;
      }
    }
  }
}

// ---------------------------------------------------------------- oracle 2

function diffPixels(
  baseDir: string,
  candDir: string,
  checkpoint: string,
  mode: DiffReport["pixelMode"],
  outDir: string,
  out: Difference[],
): void {
  const aPath = join(baseDir, "screen.png");
  const bPath = join(candDir, "screen.png");
  if (!existsSync(aPath) || !existsSync(bPath)) return;
  const a = PNG.sync.read(readFileSync(aPath));
  const b = PNG.sync.read(readFileSync(bPath));
  if (a.width !== b.width || a.height !== b.height) {
    out.push({
      oracle: 2,
      name: ORACLE_NAMES[2],
      checkpoint,
      detail: "screenshot size differs",
      baseline: `${a.width}x${a.height}`,
      candidate: `${b.width}x${b.height}`,
    });
    return;
  }
  const out_ = new PNG({ width: a.width, height: a.height });
  const changed = pixelmatch(a.data, b.data, out_.data, a.width, a.height, {
    threshold: mode === "tolerant" ? 0.1 : 0,
    includeAA: mode !== "tolerant",
  });
  if (changed > 0) {
    const png = join(outDir, `${checkpoint}.pixels.png`);
    writeFileSync(png, PNG.sync.write(out_));
    out.push({
      oracle: 2,
      name: ORACLE_NAMES[2],
      checkpoint,
      detail: `${changed} pixels differ (${mode} mode); diff image ${relative(process.cwd(), png)}`,
    });
  }
}

// ---------------------------------------------------------------- oracles 3, 4

function diffTree(baseDir: string, candDir: string, oracle: number, out: Difference[]): void {
  const a = existsSync(baseDir) ? walk(baseDir) : new Map<string, string>();
  const b = existsSync(candDir) ? walk(candDir) : new Map<string, string>();
  for (const rel of new Set([...a.keys(), ...b.keys()])) {
    const fa = a.get(rel);
    const fb = b.get(rel);
    if (!fa || !fb) {
      out.push({
        oracle,
        name: ORACLE_NAMES[oracle],
        detail: `file only in ${fa ? "baseline" : "candidate"}: ${rel}`,
      });
      continue;
    }
    const ba = readFileSync(fa);
    const bb = readFileSync(fb);
    if (ba.equals(bb)) continue;
    // JSON is compared after normalisation; CSVs and everything else byte-for-byte.
    if (rel.endsWith(".json")) {
      const na = normaliseJson(ba.toString("utf8"));
      const nb = normaliseJson(bb.toString("utf8"));
      if (na === nb) continue;
      out.push({ oracle, name: ORACLE_NAMES[oracle], detail: `JSON differs: ${rel}`, baseline: trim(na), candidate: trim(nb) });
      continue;
    }
    out.push({
      oracle,
      name: ORACLE_NAMES[oracle],
      detail: `bytes differ: ${rel} (${ba.length} vs ${bb.length} bytes)`,
      baseline: trim(ba.toString("utf8")),
      candidate: trim(bb.toString("utf8")),
    });
  }
}

// ---------------------------------------------------------------- oracles 4-8

type Normaliser = (value: unknown) => unknown;

function diffJsonFile(
  basePath: string,
  candPath: string,
  oracle: number,
  label: string,
  checkpoint: string | undefined,
  out: Difference[],
  normalise?: Normaliser,
): void {
  if (!existsSync(basePath) && !existsSync(candPath)) return;
  const a = readJson<unknown>(basePath);
  const b = readJson<unknown>(candPath);
  const na = JSON.stringify(normalise ? normalise(a) : a);
  const nb = JSON.stringify(normalise ? normalise(b) : b);
  if (na === nb) return;
  out.push({
    oracle,
    name: `${ORACLE_NAMES[oracle]} (${label})`,
    checkpoint,
    detail: "sequence differs",
    baseline: trim(na),
    candidate: trim(nb),
  });
}

/** Timing columns are wall-clock even under the fake clock, so the sequence is the claim. */
function stripTiming(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((entry) => {
    if (entry && typeof entry === "object") {
      const { tMs: _drop, ...rest } = entry as Record<string, unknown>;
      return rest;
    }
    return entry;
  });
}

// ---------------------------------------------------------------- oracle 9

function diffConsole(basePath: string, candPath: string, checkpoint: string | undefined, out: Difference[]): void {
  const a = readJson<{ type: string; text: string }[]>(basePath) ?? [];
  const b = readJson<{ type: string; text: string }[]>(candPath) ?? [];
  const baseline = new Set(a.filter((e) => e.type !== "warning").map((e) => e.text));
  for (const entry of b) {
    if (entry.type === "warning") continue;
    if (baseline.has(entry.text)) continue;
    out.push({
      oracle: 9,
      name: ORACLE_NAMES[9],
      checkpoint,
      detail: "console error the baseline did not have",
      candidate: trim(entry.text),
    });
  }
}

// ---------------------------------------------------------------- helpers

function listCheckpoints(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, "meta.json")))
    .map((e) => e.name)
    .sort();
}

function walk(dir: string, base = dir, into = new Map<string, string>()): Map<string, string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, into);
    else if (statSync(full).isFile()) into.set(relative(base, full).replaceAll("\\", "/"), full);
  }
  return into;
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function normaliseJson(text: string): string {
  try {
    return JSON.stringify(sortKeys(JSON.parse(text)));
  } catch {
    return text;
  }
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

function trim(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const positional = argv.filter((a) => !a.startsWith("--"));
  if (positional.length < 2) {
    console.error("usage: diff.ts <baseline-dir> <candidate-dir> [--out=dir] [--tolerant-pixels]");
    process.exit(2);
  }
  const report = diff(positional[0], positional[1], {
    outDir: argv.find((a) => a.startsWith("--out="))?.split("=")[1],
    tolerantPixels: argv.includes("--tolerant-pixels"),
  });
  const byOracle = new Map<number, number>();
  for (const d of report.differences) byOracle.set(d.oracle, (byOracle.get(d.oracle) ?? 0) + 1);
  console.log(`${basename(report.baseline)} vs ${basename(report.candidate)} -- pixels: ${report.pixelMode}`);
  for (const [oracle, count] of [...byOracle].sort((x, y) => x[0] - y[0])) {
    console.log(`  oracle ${oracle} (${ORACLE_NAMES[oracle] ?? "structure"}): ${count} difference(s)`);
  }
  for (const d of report.differences.slice(0, 25)) {
    console.log(`  - [${d.oracle}] ${d.checkpoint ? d.checkpoint + " " : ""}${d.detail}`);
    if (d.baseline !== undefined) console.log(`      baseline:  ${d.baseline}`);
    if (d.candidate !== undefined) console.log(`      candidate: ${d.candidate}`);
  }
  console.log(report.passed ? "\nPARITY: all oracles green" : `\nPARITY: ${report.differences.length} difference(s)`);
  process.exit(report.passed ? 0 : 1);
}
