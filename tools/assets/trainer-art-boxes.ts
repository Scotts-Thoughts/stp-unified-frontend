/**
 * The visible bounds of every trainer picture (the full-canvas 1920×1080 art a trainer shows in the right panel), for
 * Webcam Mode (`core/logic/webcamMode.ts`), which fits the picture into the space under the enemy team without changing
 * its shape. Writes `src/renderer/core/logic/trainerArtBoxes.json`: `{ "images/…/x.webp": [left, top, right, bottom] }`
 * in canvas px, the box of every pixel more than 1/16 opaque.
 *
 *   npx tsx tools/assets/trainer-art-boxes.ts
 *
 * Run it again after adding or changing a trainer picture: one without a box is not drawn in Webcam Mode. Needs Edge
 * (Playwright's `msedge` channel) to decode the WebPs the way the overlay does.
 */
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";

const REPO = join(import.meta.dirname, "..", "..");
const PUBLIC = join(REPO, "src", "renderer", "public");
const FOLDERS = ["images/trainers", "images/gen2/trainers", "images/gen3/trainers", "images/gen4/trainers", "images/gen5/trainers"];
const OUT = join(REPO, "src", "renderer", "core", "logic", "trainerArtBoxes.json");

// A blank page of our own (a file: page may load file: pictures), transparent, with one picture drawn at 1920x1080.
const host = join(mkdtempSync(join(tmpdir(), "trainer-art-")), "host.html");
writeFileSync(host, `<!doctype html><html style="background:transparent"><body style="margin:0;background:transparent">` +
    `<img id="art" style="display:block;width:1920px;height:1080px"></body></html>`);
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const boxes: Record<string, [number, number, number, number]> = {};
try {
    await page.goto(pathToFileURL(host).href);
    for (const folder of FOLDERS) {
        for (const file of readdirSync(join(PUBLIC, folder)).filter((f) => /\.(webp|png)$/i.test(f)).sort()) {
            const path = `${folder}/${file}`;
            const size = await page.evaluate(async (url) => {
                const img = document.getElementById("art") as HTMLImageElement;
                img.src = url;
                await img.decode().catch(() => undefined);
                return [img.naturalWidth, img.naturalHeight];
            }, pathToFileURL(join(PUBLIC, path)).href);
            if (size[0] !== 1920 || size[1] !== 1080) {
                console.warn(`skipped ${path}: ${size.join("x")}, not a 1920x1080 canvas`);
                continue;
            }
            const png = PNG.sync.read(await page.screenshot({ omitBackground: true }));
            let left = 1920, top = 1080, right = -1, bottom = -1;
            for (let y = 0; y < 1080; y++) {
                for (let x = 0; x < 1920; x++) {
                    if (png.data[(y * 1920 + x) * 4 + 3] > 16) {
                        if (x < left) left = x;
                        if (x > right) right = x;
                        if (y < top) top = y;
                        if (y > bottom) bottom = y;
                    }
                }
            }
            if (right < 0) {
                console.warn(`skipped ${path}: empty`);
                continue;
            }
            boxes[path] = [left, top, right + 1, bottom + 1];
        }
    }
} finally {
    await browser.close();
    rmSync(dirname(host), { recursive: true, force: true });
}
writeFileSync(OUT, JSON.stringify(boxes, null, 1).replace(/\[\n\s+(\d+),\n\s+(\d+),\n\s+(\d+),\n\s+(\d+)\n\s+\]/g, "[$1, $2, $3, $4]") + "\n");
console.log(`${Object.keys(boxes).length} boxes -> ${OUT}`);
