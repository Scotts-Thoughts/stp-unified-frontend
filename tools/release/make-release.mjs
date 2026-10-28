/**
 * Turns a packaged Windows build into the files of a GitHub release (docs/updates.md):
 *
 *   manifest.json                 the build's resources/install-manifest.json, as is
 *   <pack>-<hash>.pack[.gz]       one per pack: its files back to back, in manifest order
 *   stp-overlay-<version>-win.zip the full download for a new install, when it exists
 *
 *   node tools/release/make-release.mjs [--app=dist/win-unpacked] [--out=dist/release] [--skip-existing=<dir>]
 *
 * `--skip-existing` leaves out packs already in <dir> (same name, so same content); the
 * updater's end-to-end test (tools/updates/e2e.ts) uses it to keep a second release small.
 *
 * Run after `electron-builder --win` (the release workflow, .github/workflows/release.yml).
 * Every file is re-hashed as it is packed, so a package changed after the manifest was
 * written fails here instead of failing every user's update.
 */
import { createHash } from "node:crypto";
import { copyFileSync, createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { finished } from "node:stream/promises";
import { createGzip } from "node:zlib";

const arg = (name, fallback) => {
    const found = process.argv.find((a) => a.startsWith(`--${name}=`));
    return resolve(found ? found.slice(name.length + 3) : fallback);
};
const appDir = arg("app", "dist/win-unpacked");
const outDir = arg("out", "dist/release");
const skipFlag = process.argv.find((a) => a.startsWith("--skip-existing="));
const skipDir = skipFlag ? resolve(skipFlag.slice("--skip-existing=".length)) : null;
const manifestPath = join(appDir, "resources", "install-manifest.json");
if (!existsSync(manifestPath)) {
    console.error(`no ${manifestPath}: build with electron-builder --win first (tools/build/after-pack.mjs writes it)`);
    process.exit(2);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
if (manifest.format !== 1) throw new Error(`unknown manifest format ${manifest.format}`);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const [name, pack] of Object.entries(manifest.packs)) {
    if (skipDir && existsSync(join(skipDir, pack.file))) continue;
    const files = manifest.files.filter((f) => f.pack === name).sort((a, b) => a.offset - b.offset);
    const target = createWriteStream(join(outDir, pack.file));
    const sink = pack.compressed ? createGzip({ level: 9 }) : null;
    if (sink) sink.pipe(target);
    const out = sink ?? target;
    let offset = 0;
    for (const file of files) {
        if (file.offset !== offset) throw new Error(`${name}: ${file.path} at offset ${file.offset}, expected ${offset}`);
        const hash = createHash("sha256");
        for await (const chunk of createReadStream(join(appDir, file.path))) {
            hash.update(chunk);
            if (!out.write(chunk)) await new Promise((r) => out.once("drain", r));
        }
        if (hash.digest("hex") !== file.sha256) throw new Error(`${file.path} changed after the manifest was written`);
        offset += file.size;
    }
    if (offset !== pack.size) throw new Error(`${name}: packed ${offset} bytes, manifest says ${pack.size}`);
    out.end();
    await finished(target);
    const bytes = statSync(join(outDir, pack.file)).size;
    console.log(`${pack.file.padEnd(48)} ${String(files.length).padStart(5)} files  ${(bytes / 2 ** 20).toFixed(1).padStart(7)} MB`);
}

copyFileSync(manifestPath, join(outDir, "manifest.json"));
const zip = join(dirname(appDir), `stp-overlay-${manifest.version}-win.zip`);
if (existsSync(zip)) copyFileSync(zip, join(outDir, `stp-overlay-${manifest.version}-win.zip`));
else console.warn(`no ${zip}; the release will have no full download`);
console.log(`release files for ${manifest.version} in ${outDir}`);
