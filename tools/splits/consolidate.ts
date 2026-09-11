/**
 * Copies the five legacy apps' `splits/` trees into this app's `splits/` (plan 3.7).
 *
 *   npx tsx tools/splits/consolidate.ts [--dry-run] [--gens=gen1,gen2,gen3,gen4,gen5]
 *
 * Every folder name is preserved -- including gen3's four spellings of two games
 * (`Emerald/`, `FireRed and LeafGreen/`, `FRLG/`, `FireRed/`, known-legacy-bugs.md #11)
 * and gen5's gen4 leftovers (`Platinum/`, `HGSS/`, #17) -- because the autosplitters
 * keep writing to those names and the `/load-split-file` route reads them back.
 * Nothing is renamed and nothing in the legacy trees is touched.
 *
 * Where two apps have a file at the same relative path (gen4's and gen5's `HGSS/` and
 * `Platinum/`): identical bytes are copied once; different bytes keep the first
 * generation's file and the later one lands next to it as `<name>.from-genN<ext>`,
 * listed in the report, so no run's history is lost and none is overwritten.
 *
 * Idempotent: a file already present with the same bytes is skipped, so the tool can
 * run again after the legacy apps have written more.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, extname, join, relative, resolve } from "node:path";

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const gens = (argv.find((a) => a.startsWith("--gens="))?.slice("--gens=".length) ?? "gen1,gen2,gen3,gen4,gen5").split(",").filter(Boolean);

const LEGACY: Record<string, string> = {
  gen1: "A:\\Programs\\gen1-stp-frontend\\splits",
  gen2: "A:\\Programs\\gen2-stp-frontend\\splits",
  gen3: "A:\\Programs\\gen3-stp-frontend\\splits",
  gen4: "A:\\Programs\\gen4-stp-frontend\\splits",
  gen5: "A:\\Programs\\gen5-stp-frontend\\splits",
};
const REPO = resolve(import.meta.dirname, "..", "..");
const TARGET = join(REPO, "splits");

function walk(dir: string, into: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, into);
    else if (entry.isFile()) into.push(full);
  }
  return into;
}

function sha1(file: string): string {
  return createHash("sha1").update(readFileSync(file)).digest("hex");
}

const report = { copied: 0, identical: 0, conflicts: [] as string[], folders: new Set<string>(), bytes: 0 };
/** relPath -> the generation and source file that claimed that path first in this run. */
const placed = new Map<string, { gen: string; file: string }>();

for (const gen of gens) {
  const source = LEGACY[gen];
  if (!source || !existsSync(source)) {
    console.warn(`${gen}: no splits tree at ${source}`);
    continue;
  }
  let count = 0;
  for (const file of walk(source)) {
    const rel = relative(source, file);
    report.folders.add(rel.split(/[\\/]/)[0]);
    let target = join(TARGET, rel);
    const earlier = placed.get(rel);
    const existing = earlier?.file ?? (existsSync(target) && statSync(target).isFile() ? target : null);
    if (existing) {
      if (sha1(existing) === sha1(file)) {
        report.identical++;
        continue;
      }
      const ext = extname(rel);
      const conflictRel = rel.slice(0, rel.length - ext.length) + `.from-${gen}` + ext;
      report.conflicts.push(`${rel} (${earlier?.gen ?? "existing"} kept, ${gen} -> ${conflictRel})`);
      target = join(TARGET, conflictRel);
      if (existsSync(target) && sha1(target) === sha1(file)) {
        report.identical++;
        continue;
      }
    } else {
      placed.set(rel, { gen, file });
    }
    if (!dryRun) {
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(file, target);
    }
    report.copied++;
    report.bytes += statSync(file).size;
    count++;
  }
  console.log(`${gen}: ${count} file(s) ${dryRun ? "would be " : ""}copied from ${source}`);
}

console.log(`\n${dryRun ? "[dry run] " : ""}${report.copied} copied (${(report.bytes / 1048576).toFixed(1)} MB), ${report.identical} already present, ${report.conflicts.length} conflict(s)`);
console.log(`top-level folders: ${[...report.folders].sort().join(", ")}`);
for (const c of report.conflicts) console.log(`  conflict: ${c}`);
