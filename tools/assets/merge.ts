/**
 * The asset merge (plan Phase 4): one image pool for five generations.
 *
 *   npx tsx tools/assets/merge.ts --report                  # 4.1: manifest + size report, copies nothing
 *   npx tsx tools/assets/merge.ts --apply                   # 4.2: copies gen2-5's trees into images/genN/
 *   npx tsx tools/assets/merge.ts --apply --gens=gen2,gen3  # a subset
 *
 * Walks gen1's tree (already this repo's `src/renderer/public/images/`) and the four legacy `app/images`
 * trees, hashes every file and writes `tools/assets/manifest.json`:
 * `{ relPath, sha1, size, foundIn: [gen...] }` per distinct (relPath, sha1), plus the
 * size report the plan asks for (4.7): bytes per tree, bytes shared byte-for-byte
 * between trees, and the unique bytes the pool holds -- which is what git stores,
 * since identical blobs are one object however many paths name them.
 *
 * Layout (4.2, as adjusted for lifted modules -- plan section 7e says why): gen1's
 * files stay at `images/<relPath>`, the tier the refactored gen1 code addresses, and
 * each lifted generation keeps its whole tree under `images/genN/<relPath>`, the
 * generation tier its verbatim component addresses with template-string URLs
 * (`images/gen5/pokemon/${species}.png`). A file whose relPath and bytes several
 * generations share is therefore present under each of their roots in the working
 * tree -- one blob in git -- and nothing is renamed, so the 21 same-name/different-
 * bytes pairs and the 21 case-only collisions the survey found never meet on disk.
 * Flattening the tiers is the sprite resolver's job (4.4), which comes with the
 * decomposition of the lifted components, not before.
 *
 * `--apply` copies byte-for-byte, skips files already present with the same bytes,
 * and never deletes: a stale file in `images/genN/` is reported, not removed.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const gens = (argv.find((a) => a.startsWith("--gens="))?.slice("--gens=".length) ?? "gen2,gen3,gen4,gen5").split(",").filter(Boolean);

const REPO = resolve(import.meta.dirname, "..", "..");
const POOL = join(REPO, "src", "renderer", "public", "images");
const SOURCES: Record<string, string> = {
  gen1: POOL,
  gen2: "A:\\Programs\\gen2-stp-frontend\\app\\images",
  gen3: "A:\\Programs\\gen3-stp-frontend\\app\\images",
  gen4: "A:\\Programs\\gen4-stp-frontend\\app\\images",
  gen5: "A:\\Programs\\gen5-stp-frontend\\app\\images",
};

interface Entry { relPath: string; sha1: string; size: number; foundIn: string[] }

function walk(dir: string, into: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    // gen1's pool holds the other generations' roots (after --apply) and the box art
    // the shell added (plan 3.2); those are not gen1's files.
    if (entry.isDirectory()) {
      if (dir === POOL && /^(gen[2-5]|box_art)$/.test(entry.name)) continue;
      walk(full, into);
    } else if (entry.isFile()) into.push(full);
  }
  return into;
}

const sha1 = (file: string): string => createHash("sha1").update(readFileSync(file)).digest("hex");

const entries = new Map<string, Entry>();
const perGen: Record<string, { files: number; bytes: number }> = {};
const byHash = new Map<string, number>();
for (const [gen, source] of Object.entries(SOURCES)) {
  if (!existsSync(source)) {
    console.warn(`${gen}: no image tree at ${source}`);
    continue;
  }
  const files = walk(source);
  let bytes = 0;
  for (const file of files) {
    const relPath = relative(source, file).replaceAll("\\", "/");
    const size = statSync(file).size;
    const hash = sha1(file);
    bytes += size;
    byHash.set(hash, size);
    const key = `${relPath}\u0000${hash}`;
    const entry = entries.get(key) ?? { relPath, sha1: hash, size, foundIn: [] };
    entry.foundIn.push(gen);
    entries.set(key, entry);
  }
  perGen[gen] = { files: files.length, bytes };
}

const manifest = [...entries.values()].sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : a.sha1.localeCompare(b.sha1)));
const totalBytes = Object.values(perGen).reduce((n, g) => n + g.bytes, 0);
const uniqueBytes = [...byHash.values()].reduce((n, s) => n + s, 0);
const sameNameDifferentBytes = new Map<string, Set<string>>();
for (const e of manifest) (sameNameDifferentBytes.get(e.relPath) ?? sameNameDifferentBytes.set(e.relPath, new Set()).get(e.relPath)!).add(e.sha1);
const collisions = [...sameNameDifferentBytes.entries()].filter(([, hashes]) => hashes.size > 1);
const lower = new Map<string, Set<string>>();
for (const e of manifest) (lower.get(e.relPath.toLowerCase()) ?? lower.set(e.relPath.toLowerCase(), new Set()).get(e.relPath.toLowerCase())!).add(e.relPath);
const caseOnly = [...lower.values()].filter((names) => names.size > 1);

const mb = (n: number) => (n / 1048576).toFixed(1) + " MB";
const report = {
  generatedAt: new Date().toISOString(),
  perGeneration: Object.fromEntries(Object.entries(perGen).map(([g, v]) => [g, { files: v.files, bytes: v.bytes, mb: mb(v.bytes) }])),
  totalBytes,
  uniqueBytes,
  sharedBytes: totalBytes - uniqueBytes,
  distinctFiles: byHash.size,
  sameNameDifferentBytes: collisions.map(([relPath, hashes]) => ({ relPath, variants: hashes.size })),
  caseOnlyCollisions: caseOnly.map((names) => [...names]),
};
mkdirSync(join(REPO, "tools", "assets"), { recursive: true });
writeFileSync(join(REPO, "tools", "assets", "manifest.json"), JSON.stringify({ report, entries: manifest }, null, 1));

console.log("per generation:");
for (const [g, v] of Object.entries(perGen)) console.log(`  ${g}: ${v.files} files, ${mb(v.bytes)}`);
console.log(`total ${mb(totalBytes)} across the five trees; ${mb(uniqueBytes)} distinct bytes (${byHash.size} distinct files) -- what git stores; ${mb(totalBytes - uniqueBytes)} is byte-identical repetition`);
console.log(`${collisions.length} relPath(s) with different bytes in different trees; ${caseOnly.length} case-only name collision(s)`);
console.log(`manifest: tools/assets/manifest.json (${manifest.length} entries)`);

if (!apply) process.exit(0);

let copied = 0, skipped = 0, copiedBytes = 0;
for (const gen of gens) {
  const source = SOURCES[gen];
  if (!source || gen === "gen1" || !existsSync(source)) continue;
  const root = join(POOL, gen);
  for (const file of walk(source)) {
    const target = join(root, relative(source, file));
    if (existsSync(target) && sha1(target) === sha1(file)) {
      skipped++;
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(file, target);
    copied++;
    copiedBytes += statSync(file).size;
  }
  // Files under images/genN/ that the legacy tree no longer has: reported, kept.
  if (existsSync(root)) {
    const stale = walk(root).map((f) => relative(root, f)).filter((rel) => !existsSync(join(source, rel)));
    if (stale.length) console.log(`${gen}: ${stale.length} file(s) under images/${gen}/ are not in the legacy tree any more (kept): ${stale.slice(0, 5).join(", ")}${stale.length > 5 ? "..." : ""}`);
  }
  console.log(`${gen}: copied into images/${gen}/`);
}
console.log(`\n${copied} file(s) copied (${mb(copiedBytes)}), ${skipped} already present`);
