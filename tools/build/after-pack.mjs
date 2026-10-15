/**
 * electron-builder's afterPack hook (`build.afterPack` in package.json): ships each
 * image in the pool once.
 *
 * Many images are byte-identical across the generation folders -- one texture under
 * gen3/, gen4/ and gen5/textures, the same artwork under every genN/pokemon -- 1.4 GB
 * of the 2.7 GB pool when this was written (2026-10-14). The renderer builds those
 * paths per generation, so the source tree keeps every copy. Here, after
 * `extraResources` has copied the pool into the package and before the zip is made,
 * each group of identical files keeps its first path (sorted) and loses the rest.
 * `resources/image-copies.json` lists every group, and the packaged app puts the
 * dropped copies back as hard links on first launch (`restoreImageCopies` in
 * src/main/importLegacy.ts). No image is changed.
 *
 * Runs whenever electron-builder packs (`build:unpack`, `build:win`); `--prepackaged`
 * skips it, and zips a tree that came through here already.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Read by src/main/importLegacy.ts under the same name. */
const MANIFEST = "image-copies.json";

export async function afterPack(context) {
    const resources = context.packager.getResourcesDir(context.appOutDir);
    const pool = join(resources, "images");
    if (!existsSync(pool)) throw new Error(`[after-pack] no image pool at ${pool}`);

    const groups = duplicateGroups(pool);
    let dropped = 0;
    let bytes = 0;
    for (const [, ...copies] of groups) {
        for (const copy of copies) {
            const file = join(pool, copy);
            bytes += statSync(file).size;
            rmSync(file);
            dropped++;
        }
    }
    writeFileSync(join(resources, MANIFEST), JSON.stringify({ format: 1, copies: groups }));
    console.log(`  • [after-pack] image pool: dropped ${dropped} duplicate files (${(bytes / 2 ** 20).toFixed(0)} MB) in ${groups.length} groups, listed in resources/${MANIFEST}`);
}

/** Every set of byte-identical files under `pool`, as '/'-separated relative paths, the kept one first. */
function duplicateGroups(pool) {
    const bySize = new Map();
    for (const path of listFiles(pool, "")) {
        const size = statSync(join(pool, path)).size;
        if (!bySize.has(size)) bySize.set(size, []);
        bySize.get(size).push(path);
    }
    const groups = [];
    for (const sameSize of bySize.values()) {
        if (sameSize.length < 2) continue;
        const byHash = new Map();
        for (const path of sameSize) {
            const hash = createHash("sha256").update(readFileSync(join(pool, path))).digest("hex");
            if (!byHash.has(hash)) byHash.set(hash, []);
            byHash.get(hash).push(path);
        }
        for (const group of byHash.values()) {
            if (group.length > 1) groups.push(group.sort());
        }
    }
    return groups.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

function listFiles(root, prefix) {
    const out = [];
    for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) out.push(...listFiles(root, path));
        else if (entry.isFile()) out.push(path);
    }
    return out;
}
