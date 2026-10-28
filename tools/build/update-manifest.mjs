/**
 * The update manifest: every file of a packaged Windows build, its SHA-256, and the
 * pack it ships in (docs/updates.md). after-pack.mjs writes it into the package as
 * `resources/install-manifest.json`, so the installed app knows exactly what it is made
 * of; tools/release/make-release.mjs turns the same file into the release's
 * `manifest.json` and pack assets; src/main/updater/ compares two of them to download
 * only what changed.
 *
 * Packs are chosen so that a release usually changes one or two of them:
 *
 *   runtime            Electron itself (the exe, DLLs, locales). Changes with Electron.
 *   app                resources/app (the code and data tables), image-copies.json, storage/.
 *   icons              resources/icons.
 *   images-<folder>    one per image folder; gens 2-5 one level deeper (images-gen3-textures).
 *
 * runtime and app are gzip-compressed; icons and images are stored raw (WebP/PNG do not
 * compress further), which lets the updater fetch single files out of them with HTTP
 * range requests. A pack's `hash` covers its file list and contents, and names its asset,
 * so an unchanged pack has the same asset name in every release.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** The manifest's path inside a package; read by src/main/updater/ under the same name. */
export const INSTALL_MANIFEST = "resources/install-manifest.json";

const COMPRESSED = new Set(["runtime", "app"]);

/** The pack a package-relative ('/'-separated) path belongs to. */
export function packOf(path) {
    if (path.startsWith("resources/images/")) {
        const parts = path.split("/").slice(2);
        if (parts.length === 1) return "images";
        if (/^gen\d$/.test(parts[0]) && parts.length > 2) return safe(`images-${parts[0]}-${parts[1]}`);
        return safe(`images-${parts[0]}`);
    }
    if (path.startsWith("resources/icons/")) return "icons";
    if (path.startsWith("resources/") || path.startsWith("storage/")) return "app";
    return "runtime";
}

/** Pack names become release asset names, which GitHub mangles outside these characters. */
function safe(name) {
    return name.replace(/[^A-Za-z0-9_-]/g, "_");
}

/** Hashes every file under `appOutDir` and writes `resources/install-manifest.json`. */
export function writeUpdateManifest(appOutDir, version, electron) {
    const files = listFiles(appOutDir, "")
        .filter((path) => path !== INSTALL_MANIFEST)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
        .map((path) => {
            const data = readFileSync(join(appOutDir, path));
            return { path, size: data.length, sha256: createHash("sha256").update(data).digest("hex"), pack: packOf(path), offset: 0 };
        });

    const packs = {};
    for (const file of files) {
        const pack = (packs[file.pack] ??= { file: "", hash: "", compressed: COMPRESSED.has(file.pack), size: 0, count: 0, digest: createHash("sha256") });
        file.offset = pack.size;
        pack.size += file.size;
        pack.count++;
        pack.digest.update(`${file.path}\t${file.size}\t${file.sha256}\n`);
    }
    for (const [name, pack] of Object.entries(packs)) {
        pack.hash = pack.digest.digest("hex");
        delete pack.digest;
        pack.file = `${name}-${pack.hash.slice(0, 16)}.pack${pack.compressed ? ".gz" : ""}`;
    }

    const manifest = { format: 1, app: "stp-overlay", version, electron, built: new Date().toISOString(), packs, files };
    writeFileSync(join(appOutDir, INSTALL_MANIFEST), JSON.stringify(manifest));
    const total = files.reduce((sum, f) => sum + f.size, 0);
    console.log(`  • [after-pack] update manifest: ${files.length} files (${(total / 2 ** 20).toFixed(0)} MB) in ${Object.keys(packs).length} packs, written to ${INSTALL_MANIFEST}`);
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
