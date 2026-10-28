/**
 * The updater's swap, without Electron: builds a small fake install folder, plans swaps
 * with src/main/updater/plan.ts and runs them through the real apply.ps1 (Windows only):
 *
 *   1. update A -> B from updates/staging (changed, added and removed files, a duplicate
 *      image that goes stale), keeping A's replaced files in updates/previous;
 *   2. roll back B -> A from updates/previous, then forward again;
 *   3. a swap that fails half-way (a staged file missing) is undone completely.
 *
 * The user's splits/ folder must come through every step untouched.
 *
 *   npm run updates:selftest
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, linkSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
    compareVersions,
    filesToStage,
    formatOps,
    parseManifest,
    planSwap,
    staleCopies,
    type CopyGroups,
    type Manifest,
} from "../../src/main/updater/plan";

const REPO = resolve(import.meta.dirname, "..", "..");
const SCRIPT = join(REPO, "src", "main", "updater", "apply.ps1");
const root = join(REPO, "tools", "sandbox", "updates-selftest");

let failures = 0;
const check = (ok: boolean, what: string) => {
    console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`);
    if (!ok) failures++;
};

const sha = (data: string) => createHash("sha256").update(data).digest("hex");

/** A manifest for `files` (path -> contents), packed the way update-manifest.mjs does. */
function manifestOf(version: string, files: Record<string, string>): Manifest {
    const packs: Manifest["packs"] = {};
    const list = Object.keys(files)
        .sort()
        .map((path) => {
            const pack = path.startsWith("resources/images/") ? "images" : path.startsWith("resources/") ? "app" : "runtime";
            const info = (packs[pack] ??= { file: `${pack}.pack`, hash: "", compressed: pack !== "images", size: 0, count: 0 });
            const entry = { path, size: Buffer.byteLength(files[path]), sha256: sha(files[path]), pack, offset: info.size };
            info.size += entry.size;
            info.count++;
            return entry;
        });
    return { format: 1, app: "stp-overlay", version, electron: "37.2.3", built: "", packs, files: list };
}

const COPIES_A: CopyGroups = [["gen3/textures/t.webp", "gen4/textures/t.webp"], ["gen3/pokemon/p.webp", "gen5/pokemon/p.webp"]];
const COPIES_B: CopyGroups = [["gen3/textures/t.webp", "gen4/textures/t.webp"], ["gen3/pokemon/p.webp", "gen5/pokemon/p.webp"]];

const A: Record<string, string> = {
    "stp-overlay.exe": "EXE-1",
    "resources/app/out/main/index.js": "code A",
    "resources/app/package.json": '{"version":"1.0.0"}',
    "resources/images/gen3/textures/t.webp": "texture A",
    "resources/images/gen3/pokemon/p.webp": "pokemon",
    "storage/old.json": "old",
    "resources/image-copies.json": JSON.stringify({ format: 1, copies: COPIES_A }),
};
const B: Record<string, string> = {
    "stp-overlay.exe": "EXE-1",
    "resources/app/out/main/index.js": "code B",
    "resources/app/out/main/chunk.js": "new chunk",
    "resources/app/package.json": '{"version":"1.1.0"}',
    "resources/images/gen3/textures/t.webp": "texture B",
    "resources/images/gen3/pokemon/p.webp": "pokemon",
    "resources/image-copies.json": JSON.stringify({ format: 1, copies: COPIES_B }),
};
const mA = manifestOf("1.0.0", A);
const mB = manifestOf("1.1.0", B);

function write(path: string, data: string) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), data);
}

/** The duplicate images as the app makes them: hard links to the kept file. */
function linkCopies(groups: CopyGroups) {
    for (const [kept, ...copies] of groups) {
        for (const copy of copies) {
            const target = join(root, "resources/images", copy);
            if (existsSync(target)) continue;
            mkdirSync(dirname(target), { recursive: true });
            linkSync(join(root, "resources/images", kept), target);
        }
    }
}

function listAll(dir: string, prefix = ""): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const path = prefix ? `${prefix}/${e.name}` : e.name;
        return e.isDirectory() ? listAll(join(dir, e.name), path) : [path];
    });
}

/** The install holds exactly `files` (besides updates/, splits/, the manifest and image copies). */
function installIs(files: Record<string, string>, manifest: Manifest, copies: CopyGroups): boolean {
    const copyPaths = new Set(copies.flatMap(([, ...c]) => c.map((p) => `resources/images/${p}`)));
    const present = listAll(root).filter((p) => !p.startsWith("updates/") && !p.startsWith("splits/") && !copyPaths.has(p));
    const expected = [...Object.keys(files), "resources/install-manifest.json"].sort();
    if (JSON.stringify(present.sort()) !== JSON.stringify(expected)) {
        console.log(`      have ${JSON.stringify(present)}\n      want ${JSON.stringify(expected)}`);
        return false;
    }
    const installed = parseManifest(readFileSync(join(root, "resources/install-manifest.json"), "utf-8"));
    return installed.version === manifest.version && Object.entries(files).every(([p, d]) => readFileSync(join(root, p), "utf-8") === d);
}

function runOps(name: string, ops: ReturnType<typeof planSwap>): { ok: boolean; committed: boolean } {
    const file = join(root, "updates", name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, formatOps(ops));
    rmSync(join(root, "updates", "last-result.json"), { force: true });
    const run = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", SCRIPT, "-AppRoot", root, "-Ops", file], { encoding: "utf-8" });
    if (run.status !== 0) console.log(run.stdout, run.stderr);
    return JSON.parse(readFileSync(join(root, "updates", "last-result.json"), "utf-8"));
}

if (process.platform !== "win32") {
    console.log("apply.ps1 needs Windows; only the pure checks ran");
}

console.log("pure checks");
check(compareVersions("3.10.0", "3.9.9") > 0 && compareVersions("1.0.0", "1.0.0") === 0, "versions compare by number");
check(filesToStage(mA, mB).map((f) => f.path).sort().join() === "resources/app/out/main/chunk.js,resources/app/out/main/index.js,resources/app/package.json,resources/images/gen3/textures/t.webp", "only changed and new files are staged");
check(JSON.stringify(staleCopies(mA, mB, COPIES_A, COPIES_B)) === JSON.stringify(["resources/images/gen4/textures/t.webp"]), "only the copy of a changed image goes stale");
let threw = false;
try {
    parseManifest(JSON.stringify({ ...mA, files: [{ ...mA.files[0], path: "../evil.exe" }] }));
} catch {
    threw = true;
}
check(threw, "a manifest path outside the install folder is refused");

if (process.platform === "win32") {
    rmSync(root, { recursive: true, force: true });
    for (const [path, data] of Object.entries(A)) write(path, data);
    write("resources/install-manifest.json", JSON.stringify(mA));
    write("splits/run.csv", "split data");
    linkCopies(COPIES_A);

    console.log("1. update 1.0.0 -> 1.1.0");
    for (const f of filesToStage(mA, mB)) write(`updates/staging/${f.path}`, B[f.path]);
    write("updates/staging/manifest.json", JSON.stringify(mB));
    let result = runOps("ops.txt", planSwap({ current: mA, target: mB, currentCopies: COPIES_A, targetCopies: COPIES_B, fromPrevious: false, previousExists: false, launch: [] }));
    check(result.ok && result.committed, "the swap reports success");
    linkCopies(COPIES_B);
    check(installIs(B, mB, COPIES_B), "the install is 1.1.0");
    check(readFileSync(join(root, "resources/images/gen4/textures/t.webp"), "utf-8") === "texture B", "the stale duplicate image was remade from the new file");
    check(readFileSync(join(root, "updates/previous/resources/app/out/main/index.js"), "utf-8") === "code A", "1.0.0's replaced code is kept in updates/previous");
    check(existsSync(join(root, "updates/previous/storage/old.json")), "1.0.0's removed file is kept in updates/previous");
    check(!existsSync(join(root, "updates/previous/stp-overlay.exe")), "an unchanged file is not kept twice");
    check(parseManifest(readFileSync(join(root, "updates/previous/manifest.json"), "utf-8")).version === "1.0.0", "updates/previous has 1.0.0's manifest");
    check(!existsSync(join(root, "updates/staging")), "updates/staging is gone");
    check(readFileSync(join(root, "splits/run.csv"), "utf-8") === "split data", "splits/ untouched");

    console.log("2. roll back to 1.0.0, then forward to 1.1.0");
    result = runOps("rollback.txt", planSwap({ current: mB, target: mA, currentCopies: COPIES_B, targetCopies: COPIES_A, fromPrevious: true, previousExists: true, launch: [] }));
    check(result.ok && result.committed, "the rollback reports success");
    linkCopies(COPIES_A);
    check(installIs(A, mA, COPIES_A), "the install is 1.0.0 again");
    check(readFileSync(join(root, "resources/images/gen4/textures/t.webp"), "utf-8") === "texture A", "the duplicate image follows the rollback");
    check(parseManifest(readFileSync(join(root, "updates/previous/manifest.json"), "utf-8")).version === "1.1.0", "updates/previous now holds 1.1.0");
    result = runOps("forward.txt", planSwap({ current: mA, target: mB, currentCopies: COPIES_A, targetCopies: COPIES_B, fromPrevious: true, previousExists: true, launch: [] }));
    linkCopies(COPIES_B);
    check(result.ok && installIs(B, mB, COPIES_B), "rolling forward again gives 1.1.0");
    check(readFileSync(join(root, "splits/run.csv"), "utf-8") === "split data", "splits/ untouched");

    console.log("3. a swap that fails half-way is undone");
    rmSync(join(root, "updates/previous/resources/app/package.json"));
    result = runOps("broken.txt", planSwap({ current: mB, target: mA, currentCopies: COPIES_B, targetCopies: COPIES_A, fromPrevious: true, previousExists: true, launch: [] }));
    check(!result.ok && !result.committed, "the swap reports failure");
    linkCopies(COPIES_B);
    check(installIs(B, mB, COPIES_B), "the install is still exactly 1.1.0");
    check(existsSync(join(root, "updates/previous/resources/app/out/main/index.js")) && !existsSync(join(root, "updates/staging")), "updates/previous is back where it was");
    check(readFileSync(join(root, "updates/apply.log"), "utf-8").includes("undid"), "apply.log records the undo");
}

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
