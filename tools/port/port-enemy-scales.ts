/**
 * Copies a legacy app's `lib/enemy_sprite_scales.js` (a CommonJS module with one
 * table) into `games/genN/data/enemy_sprite_scales.json` (plan 2.2).
 *
 *   npx tsx tools/port/port-enemy-scales.ts <legacy-app-dir> <gen>
 *
 * The file is loaded with Node's own `require`, so the table is exactly what the
 * legacy `enemy_sprite_scale_manager.js` saw; the JSON is what
 * `core/logic/enemySpriteScales.ts` reads back, and what the dev-mode resize tool
 * rewrites (one file per generation, as before).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const [dir, gen] = process.argv.slice(2);
if (!dir || !gen) {
  console.error("usage: port-enemy-scales.ts <legacy-app-dir> <gen>");
  process.exit(2);
}
const require = createRequire(import.meta.url);
const table = require(join(resolve(dir), "lib", "enemy_sprite_scales.js")) as Record<string, unknown>;
if (!table || typeof table !== "object") throw new Error("enemy_sprite_scales.js did not export a table");

const REPO = resolve(import.meta.dirname, "..", "..");
const out = join(REPO, "src", "renderer", "games", gen, "data", "enemy_sprite_scales.json");
mkdirSync(join(out, ".."), { recursive: true });
writeFileSync(out, JSON.stringify(table, null, 4) + "\n");
console.log(`${Object.keys(table).length} species -> ${out}`);
