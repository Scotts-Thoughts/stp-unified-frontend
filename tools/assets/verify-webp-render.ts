/**
 * The render half of the WebP conversion's proof (`to-webp.ts` is the data half):
 * each WebP and the PNG it replaces are decoded by Electron's own Chromium and drawn
 * over opaque black and over opaque white, and the two must agree -- colour
 * management, 16-bit handling and all, which dwebp against pngjs cannot see.
 *
 * "Agree" is within one level per channel, and that only on semi-transparent pixels.
 * Chromium premultiplies a PNG with rounding and a WebP with libwebp's truncation, so
 * where the source alpha is neither 0 nor 255 a lossless WebP composites one level
 * darker about half the time (measured 2026-09-24 on Electron 37: every differing
 * pixel semi-transparent, always the WebP lower, never by more than one). No encoding
 * avoids it short of rewriting the stored colours to game the decoder, and the parity
 * harness's pixel oracle already forgives two. `--tolerance=0` lists those files too.
 *
 *   npx tsx tools/assets/verify-webp-render.ts --webp-root=<staging tree>
 *   npx tsx tools/assets/verify-webp-render.ts --webp-root=<staging tree> --only="^gen[23]/"   (a regex)
 *
 * Pairs `<webp-root>/<rel>.webp` with `src/renderer/public/images/<rel>.png`, so it
 * runs before the PNGs are deleted. The window is a bare BrowserWindow over a local
 * page -- not the app, no network.
 */
import { mkdtempSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { _electron as electron } from "playwright-core";
import { installEvalShims } from "../parity/capture.ts";

const argv = process.argv.slice(2);
const flag = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const REPO = resolve(import.meta.dirname, "..", "..");
const PNG_ROOT = resolve(flag("root") ?? join(REPO, "src", "renderer", "public", "images"));
const WEBP_ROOT = resolve(flag("webp-root") ?? PNG_ROOT);
const ONLY = flag("only") ? new RegExp(flag("only")!) : null;
const BATCH = 8;
/** Largest per-channel difference on screen that counts as decoder rounding. */
const TOLERANCE = Number(flag("tolerance") ?? 1);
const VERBOSE = argv.includes("--verbose");

function walk(dir: string, into: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, into);
    else if (entry.name.endsWith(".webp")) into.push(full);
  }
  return into;
}

const pairs = walk(WEBP_ROOT)
  .map((webp) => {
    const rel = relative(WEBP_ROOT, webp).replaceAll("\\", "/");
    return { rel, webp, png: join(PNG_ROOT, rel.replace(/\.webp$/, ".png")) };
  })
  .filter((p) => (!ONLY || ONLY.test(p.rel)) && existsSync(p.png));
console.log(`${pairs.length} WebP/PNG pair(s)`);

const scratch = mkdtempSync(join(tmpdir(), "stp-webp-render-"));
writeFileSync(join(scratch, "index.html"), "<!doctype html><meta charset=utf-8><title>webp render check</title>");
writeFileSync(
  join(scratch, "main.cjs"),
  `const { app, BrowserWindow } = require("electron");
app.whenReady().then(() => {
  const win = new BrowserWindow({ show: false, webPreferences: { webSecurity: false } });
  win.loadFile(${JSON.stringify(join(scratch, "index.html"))});
});`,
);

const app = await electron.launch({
  executablePath: join(REPO, "node_modules", "electron", "dist", "electron.exe"),
  args: [join(scratch, "main.cjs"), `--user-data-dir=${join(scratch, "user-data")}`],
});
const page = await app.firstWindow();
await page.waitForLoadState("load");
await installEvalShims(page);

type Item = { rel: string; png: string; webp: string };
type Result = { rel: string; maxDelta: number; differing: number; detail: string; undecoded?: boolean } | null;

function checkBatch(items: Item[]): Promise<Result[]> {
  return page.evaluate(async (items) => {
    // What reaches the screen: the image composited over an opaque background, once
    // over black and once over white. Reading the image back on its own would go
    // through getImageData's un-premultiply, which turns a one-level difference at
    // alpha 4 into sixty.
    const composites = async (url: string) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      const over = (background: string) => {
        ctx.globalCompositeOperation = "copy";
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      };
      const result = { width: canvas.width, height: canvas.height, layers: [over("#000"), over("#fff")] };
      // Let go of the backing store and the decoded image now, not at the next GC.
      canvas.width = canvas.height = 0;
      img.src = "";
      return result;
    };
    return Promise.all(
      items.map(async ({ rel, png, webp }) => {
        try {
          const [a, b] = await Promise.all([composites(png), composites(webp)]);
          if (a.width !== b.width || a.height !== b.height) return { rel, maxDelta: 255, differing: 0, detail: `size ${b.width}x${b.height}, PNG ${a.width}x${a.height}` };
          let differing = 0;
          let maxDelta = 0;
          let first = -1;
          for (let layer = 0; layer < 2; layer++) {
            const [x, y] = [a.layers[layer], b.layers[layer]];
            for (let j = 0; j < x.length; j += 4) {
              const d = Math.max(Math.abs(x[j] - y[j]), Math.abs(x[j + 1] - y[j + 1]), Math.abs(x[j + 2] - y[j + 2]));
              if (!d) continue;
              if (first < 0) first = j / 4;
              differing++;
              maxDelta = Math.max(maxDelta, d);
            }
          }
          if (!differing) return null;
          return { rel, maxDelta, differing, detail: `${differing} composited pixel(s) differ, max delta ${maxDelta}, first at ${first % a.width},${Math.floor(first / a.width)}` };
        } catch (err) {
          return { rel, maxDelta: 255, differing: 0, detail: `could not decode: ${(err as Error).message}`, undecoded: true };
        }
      }),
    );
  }, items);
}

/**
 * A fresh document. One page left to decode thousands of images starts failing every
 * decode after a few thousand ("The source image cannot be decoded", small files
 * included) though each file decodes on its own, so the page is reloaded as it goes
 * and a decode failure is retried once on a fresh one before it counts.
 */
async function freshPage(): Promise<void> {
  await page.reload();
  await page.waitForLoadState("load");
  await installEvalShims(page);
}

const items = new Map(pairs.map((p) => [p.rel, { rel: p.rel, png: pathToFileURL(p.png).href, webp: pathToFileURL(p.webp).href }]));
let failed = 0;
let rounding = 0;
const retry: Item[] = [];
const tally = (r: Result, final: boolean) => {
  if (!r) return;
  if (r.undecoded && !final) {
    retry.push(items.get(r.rel)!);
    return;
  }
  if (r.maxDelta <= TOLERANCE) {
    rounding++;
    if (VERBOSE) console.log(`  rounding ${r.rel}: ${r.detail}`);
    return;
  }
  failed++;
  console.log(`  DIFF ${r.rel}: ${r.detail}`);
};
const all = [...items.values()];
for (let i = 0; i < all.length; i += BATCH) {
  if (i > 0 && (i / BATCH) % 50 === 0) await freshPage();
  for (const r of await checkBatch(all.slice(i, i + BATCH))) tally(r, false);
  if ((i / BATCH) % 50 === 0) console.log(`  ${Math.min(i + BATCH, all.length)}/${all.length}`);
}
if (retry.length) {
  console.log(`  retrying ${retry.length} decode failure(s) on a fresh page`);
  await freshPage();
  for (const item of retry) for (const r of await checkBatch([item])) tally(r, true);
}
await app.close();
rmSync(scratch, { recursive: true, force: true });
console.log(`\n${pairs.length - failed - rounding} identical, ${rounding} within ${TOLERANCE} level(s) (premultiply rounding), ${failed} beyond`);
process.exit(failed ? 1 : 0);
