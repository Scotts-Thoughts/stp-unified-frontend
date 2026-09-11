/**
 * Converts a legacy `default_style_settings.js` blob into per-species JSON files
 * (plan 2.2 / 5.2, decision 10).
 *
 *   npx tsx tools/port/port-style-defaults.ts <legacy default_style_settings.js> <gen>
 *
 * Writes `src/renderer/games/<gen>/data/style/<Key>.json`, one file per top-level key,
 * plus `index.json` listing the keys, so the loader can `import.meta.glob` them and the
 * dev-mode write-back (`source:write`) rewrites one species at a time. Values are
 * copied verbatim -- including the run counters and the whole `split_data` history the
 * legacy app stored under the species key because its MyStorage routes every
 * species-keyed value through the style manager. That is what the legacy app reads
 * today, so it is what parity compares against; separating metrics from style is a
 * Phase 5.2 change for Scott to approve.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [file, gen] = process.argv.slice(2);
if (!file || !gen) {
  console.error("usage: port-style-defaults.ts <default_style_settings.js> <gen>");
  process.exit(2);
}
const REPO = resolve(import.meta.dirname, "..", "..");
const outDir = join(REPO, "src", "renderer", "games", gen, "data", "style");

const text = readFileSync(file, "utf-8");
const start = text.indexOf("= {");
const end = text.lastIndexOf("};");
if (start === -1 || end === -1) throw new Error("no object literal found");
const blob = JSON.parse(text.slice(start + 2, end + 1)) as Record<string, unknown>;

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const keys = Object.keys(blob);
let bytes = 0;
for (const key of keys) {
  const name = key.replace(/[<>:"/\|?*]/g, "_");
  const json = JSON.stringify(blob[key], null, 2) + "\n";
  writeFileSync(join(outDir, `${name}.json`), json);
  bytes += json.length;
}
writeFileSync(join(outDir, "index.json"), JSON.stringify(keys, null, 2) + "\n");
console.log(`${keys.length} species -> ${outDir} (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
