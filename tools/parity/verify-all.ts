/**
 * The whole regression check in one command: the unified app on every fixture, each
 * run diffed against its standing baseline, one line per generation at the end.
 *
 *   npm run parity:all                      run + diff every fixture
 *   npm run parity:all -- --only=gen3,gen4  a subset (by generation or fixture name)
 *   npm run parity:all -- --baselines       (re)capture the legacy baselines instead
 *   npm run parity:all -- --gen1-worktree=<dir>
 *                                           where gen1's baseline comes from: a built
 *                                           `git worktree` of the previous commit
 *                                           (docs/parity-harness.md, "unified@<dir>")
 *   npm run parity:all -- --tag=<name>      report dirs tools/reports/<fixture>.<name>
 *
 * The matrix is every `*.fixture.jsonl.gz` under tools/fixtures/ (recorded and
 * synthetic alike); a fixture's generation comes from the mapper its .meta.json names.
 * A gen2-5 baseline is the legacy app in its sandbox (`legacy:genN@37`); gen1 has no
 * legacy app the harness can drive, so its baseline is this app at the previous commit.
 * Baselines live where run.ts puts a run without --out: tools/baselines/<target>/<fixture>.
 *
 * Every run gets --redirect-ports (no port has to be free) and --control (oracle 6).
 * A launch that times out on `firstWindow` -- the antivirus stalling keyhook.exe's
 * first spawn after a restore -- is retried once; that is the one failure that has
 * never been the app's.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { diff } from "./diff.ts";
import { generationOf } from "./profile-check.ts";
import { REPO } from "./targets.ts";

interface FixtureEntry {
  file: string;
  name: string;
  generation: string;
  mapperId: string;
}

function findFixtures(dir: string, out: FixtureEntry[] = []): FixtureEntry[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      findFixtures(path, out);
      continue;
    }
    if (!entry.endsWith(".fixture.jsonl.gz")) continue;
    const meta = path.replace(/\.fixture\.jsonl\.gz$/, ".fixture.meta.json");
    const mapperId = existsSync(meta) ? ((JSON.parse(readFileSync(meta, "utf8")) as { mapperId?: string }).mapperId ?? "") : "";
    out.push({ file: path, name: basename(entry, ".fixture.jsonl.gz"), generation: generationOf(mapperId) ?? "unknown", mapperId });
  }
  return out;
}

function baselineTarget(generation: string, gen1Worktree: string | undefined): string | null {
  if (generation === "gen1") return gen1Worktree ? `unified@${gen1Worktree}` : null;
  if (/^gen[2-5]$/.test(generation)) return `legacy:${generation}@37`;
  return null;
}

/** tools/baselines/<target id>/<fixture>, target id as run.ts spells it (":" -> "_"). */
function baselineDir(generation: string, fixture: string, gen1Worktree: string | undefined): string | null {
  const root = join(REPO, "tools", "baselines");
  if (generation === "gen1") {
    if (gen1Worktree) return join(root, `unified@${basename(gen1Worktree)}`, fixture);
    // Whatever worktree captured it last: the newest unified@* baseline for this fixture.
    if (!existsSync(root)) return null;
    const candidates = readdirSync(root)
      .filter((d) => d.startsWith("unified@") && existsSync(join(root, d, fixture, "run.json")))
      .map((d) => join(root, d, fixture))
      .sort((a, b) => statSync(join(b, "run.json")).mtimeMs - statSync(join(a, "run.json")).mtimeMs);
    return candidates[0] ?? null;
  }
  const target = baselineTarget(generation, gen1Worktree);
  return target ? join(root, target.replaceAll(":", "_"), fixture) : null;
}

function runOnce(target: string, fixture: string, outDir: string, log: string): { ok: boolean; summary: string } {
  const tsx = join(REPO, "node_modules", "tsx", "dist", "cli.mjs");
  const args = [tsx, join(REPO, "tools", "parity", "run.ts"), target, fixture, `--out=${outDir}`, "--redirect-ports", "--control"];
  try {
    const output = execFileSync(process.execPath, args, { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
    const summary = output.split("\n").reverse().find((l) => /captures, /.test(l)) ?? "";
    return { ok: true, summary: summary.trim() };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message: string };
    const text = `${e.stdout ?? ""}\n${e.stderr ?? ""}`;
    const reason = text.split("\n").filter((l) => l.trim() && !/^\[run\]   captured|INFO:CONSOLE/.test(l)).slice(-3).join(" | ");
    return { ok: false, summary: `${log}: ${reason.slice(0, 300)}` };
  }
}

function runWithRetry(target: string, fixture: string, outDir: string): { ok: boolean; summary: string } {
  let result = runOnce(target, fixture, outDir, "attempt 1");
  if (!result.ok) {
    console.log(`    ${result.summary}`);
    console.log("    retrying once");
    result = runOnce(target, fixture, outDir, "attempt 2");
  }
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const flag = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
  const only = flag("only")?.split(",").filter(Boolean) ?? [];
  const captureBaselines = argv.includes("--baselines");
  const gen1Worktree = flag("gen1-worktree");
  const tag = flag("tag");

  const fixtures = findFixtures(join(REPO, "tools", "fixtures")).filter(
    (f) => only.length === 0 || only.includes(f.generation) || only.includes(f.name),
  );
  if (fixtures.length === 0) {
    console.error("no fixtures matched");
    process.exit(2);
  }
  fixtures.sort((a, b) => a.generation.localeCompare(b.generation) || a.name.localeCompare(b.name));
  console.log(`${captureBaselines ? "capturing baselines for" : "verifying"} ${fixtures.length} fixture(s): ${fixtures.map((f) => `${f.name} (${f.generation})`).join(", ")}`);

  const lines: string[] = [];
  let failed = 0;
  for (const f of fixtures) {
    const rel = relative(REPO, f.file);
    if (captureBaselines) {
      const target = baselineTarget(f.generation, gen1Worktree);
      if (!target) {
        lines.push(`SKIP  ${f.name} (${f.generation}): no baseline target${f.generation === "gen1" ? " -- pass --gen1-worktree=<built worktree of the previous commit>" : ""}`);
        continue;
      }
      const dir = baselineDir(f.generation, f.name, gen1Worktree)!;
      console.log(`\n== ${f.name}: ${target} -> ${relative(REPO, dir)}`);
      const result = runWithRetry(target, rel, dir);
      if (!result.ok) failed++;
      lines.push(`${result.ok ? "DONE " : "FAIL "} ${f.name} (${f.generation}): ${result.summary}`);
      continue;
    }

    const baseline = baselineDir(f.generation, f.name, gen1Worktree);
    const outDir = join(REPO, "tools", "reports", tag ? `${f.name}.${tag}` : f.name);
    console.log(`\n== ${f.name} (${f.generation}): unified -> ${relative(REPO, outDir)}`);
    const result = runWithRetry("unified", rel, outDir);
    if (!result.ok) {
      failed++;
      lines.push(`FAIL  ${f.name} (${f.generation}): ${result.summary}`);
      continue;
    }
    console.log(`    ${result.summary}`);
    if (!baseline || !existsSync(join(baseline, "run.json"))) {
      failed++;
      lines.push(`NOBASE ${f.name} (${f.generation}): no baseline at ${baseline ? relative(REPO, baseline) : "(none)"} -- npm run parity:all -- --baselines${f.generation === "gen1" ? " --gen1-worktree=<dir>" : ""}`);
      continue;
    }
    const report = diff(baseline, outDir, { outDir: join(REPO, "tools", "reports", `${basename(outDir)}.diff`) });
    if (report.passed) {
      lines.push(`GREEN ${f.name} (${f.generation}): all oracles green vs ${relative(REPO, baseline)}`);
    } else {
      failed++;
      const byOracle = new Map<number, number>();
      for (const d of report.differences) byOracle.set(d.oracle, (byOracle.get(d.oracle) ?? 0) + 1);
      const detail = [...byOracle.entries()].map(([o, n]) => `oracle ${o}: ${n}`).join(", ");
      lines.push(`RED   ${f.name} (${f.generation}): ${report.differences.length} difference(s) -- ${detail} (tools/reports/${basename(outDir)}.diff)`);
    }
  }

  console.log("\n" + lines.join("\n"));
  console.log(failed ? `\n${failed} of ${fixtures.length} not green` : `\nall ${fixtures.length} green`);
  process.exit(failed ? 1 : 0);
}
