/**
 * The updater end to end, with the real packaged app (Windows; `npm run build:unpack` first):
 *
 *   - two fake releases made from dist/win-unpacked: 9.0.0, and 9.1.0 with changed code,
 *     one changed image, a new file and a removed one, each turned into release files by
 *     tools/release/make-release.mjs;
 *   - a local server that answers like GitHub (STP_UPDATE_FEED) and counts what is downloaded;
 *   - an install of 9.0.0 in tools/sandbox/updates-e2e/install, launched with Playwright,
 *     native dialogs answered by a stub in the main process.
 *
 * Steps: the start-up prompt updates 9.0.0 -> 9.1.0 (only the app pack and the changed
 * image's bytes are downloaded); the local rollback; installing 9.1.0 from the list again
 * (nothing downloaded: it comes from updates/previous); a corrupted download is refused and
 * changes nothing; installing 9.0.0 from GitHub with no local copy; and the .cmd's op list.
 * After every step the install is compared file by file with its manifest, and the user's
 * splits/ folder must be untouched.
 *
 * The app is kept off the network: the memory tool points at a dead port, the control
 * server and clock page are moved/off, and every copy the updater relaunches is killed.
 *
 *   npm run updates:e2e [-- --keep]   (--keep reuses the releases made by an earlier run)
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, createReadStream, existsSync, linkSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join, resolve } from "node:path";
import { _electron as electron, type ElectronApplication } from "playwright-core";
import { parseManifest, type Manifest } from "../../src/main/updater/plan";
// @ts-expect-error plain JS build helper
import { writeUpdateManifest } from "../build/update-manifest.mjs";

const REPO = resolve(import.meta.dirname, "..", "..");
const BUILD = join(REPO, "dist", "win-unpacked");
const SANDBOX = join(REPO, "tools", "sandbox", "updates-e2e");
const INSTALL = join(SANDBOX, "install");
const keep = process.argv.includes("--keep");

if (process.platform !== "win32") {
    console.error("the updater only runs on Windows");
    process.exit(2);
}
if (!existsSync(join(BUILD, "resources", "install-manifest.json"))) {
    console.error(`no packaged build with an install manifest in ${BUILD}; run npm run build:unpack first`);
    process.exit(2);
}

let failures = 0;
const check = (ok: boolean, what: string) => {
    console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`);
    if (!ok) failures++;
};

// ---- fake releases -------------------------------------------------------------------------

const electronVersion = parseManifest(readFileSync(join(BUILD, "resources", "install-manifest.json"), "utf-8")).electron;

/** A copy of the build made of hard links (no disk space), the given files written fresh. */
function linkTree(from: string, to: string, prefix = "") {
    mkdirSync(join(to, prefix), { recursive: true });
    for (const entry of readdirSync(join(from, prefix), { withFileTypes: true })) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) linkTree(from, to, path);
        else if (entry.isFile()) linkSync(join(from, path), join(to, path));
    }
}

/** Replaces a file with new contents without touching the hard-linked original. */
function replace(dir: string, path: string, data: Buffer | string) {
    const file = join(dir, path);
    if (existsSync(file)) unlinkSync(file);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, data);
}

function setVersion(dir: string, version: string) {
    const packageFile = join(dir, "resources", "app", "package.json");
    const json = JSON.parse(readFileSync(packageFile, "utf-8"));
    replace(dir, "resources/app/package.json", JSON.stringify({ ...json, version }, null, 2));
    // A hard link to the build's manifest: unlink it, or writing it would change the build's too.
    unlinkSync(join(dir, "resources", "install-manifest.json"));
    writeUpdateManifest(dir, version, electronVersion);
}

const CHANGED_CODE = "resources/app/out/main/index.js";
const IMAGE_DIR = "resources/images/gen3/textures";
const CHANGED_IMAGE = `${IMAGE_DIR}/${readdirSync(join(BUILD, IMAGE_DIR)).sort()[0]}`;
const OLD_FILE = "resources/app/e2e-only-in-9.0.0.txt";
const NEW_FILE = "resources/app/e2e-only-in-9.1.0.txt";

const V1 = join(SANDBOX, "v9.0.0");
const V2 = join(SANDBOX, "v9.1.0");
const REL1 = join(SANDBOX, "release-9.0.0");
const REL2 = join(SANDBOX, "release-9.1.0");

if (!keep || !existsSync(join(REL2, "manifest.json"))) {
    console.log("making the two releases");
    rmSync(SANDBOX, { recursive: true, force: true });
    linkTree(BUILD, V1);
    replace(V1, OLD_FILE, "only in 9.0.0\n");
    setVersion(V1, "9.0.0");
    linkTree(BUILD, V2);
    replace(V2, CHANGED_CODE, readFileSync(join(BUILD, CHANGED_CODE), "utf-8") + "\n// updater e2e: 9.1.0\n");
    replace(V2, CHANGED_IMAGE, Buffer.concat([readFileSync(join(BUILD, CHANGED_IMAGE)), Buffer.from("e2e")]));
    replace(V2, NEW_FILE, "only in 9.1.0\n");
    setVersion(V2, "9.1.0");
    execFileSync(process.execPath, [join(REPO, "tools/release/make-release.mjs"), `--app=${V1}`, `--out=${REL1}`], { stdio: "inherit" });
    execFileSync(process.execPath, [join(REPO, "tools/release/make-release.mjs"), `--app=${V2}`, `--out=${REL2}`, `--skip-existing=${REL1}`], { stdio: "inherit" });
}
const m1 = parseManifest(readFileSync(join(REL1, "manifest.json"), "utf-8"));
const m2 = parseManifest(readFileSync(join(REL2, "manifest.json"), "utf-8"));

// ---- the fake GitHub -------------------------------------------------------------------------

let corrupt = false;
let served = 0;
const requested = new Set<string>();

const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const port = (server.address() as AddressInfo).port;
    if (url.pathname === "/releases.json") {
        const release = (version: string, dir: string, manifest: Manifest, date: string) => ({
            tag_name: `v${version}`,
            name: `v${version}`,
            body: `v${version} test release\n\nMade by tools/updates/e2e.ts.`,
            draft: false,
            prerelease: false,
            published_at: date,
            html_url: `https://github.com/Scotts-Thoughts/stp-unified-frontend/releases/tag/v${version}`,
            assets: ["manifest.json", ...Object.values(manifest.packs).map((p) => p.file)].map((name) => {
                const file = existsSync(join(dir, name)) ? join(dir, name) : join(REL1, name);
                return { name, size: statSync(file).size, browser_download_url: `http://127.0.0.1:${port}/dl/${version}/${name}` };
            }),
        });
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify([release("9.1.0", REL2, m2, "2026-10-28T12:00:00Z"), release("9.0.0", REL1, m1, "2026-10-27T12:00:00Z")]));
        return;
    }
    const match = /^\/dl\/([\d.]+)\/(.+)$/.exec(url.pathname);
    const dir = match?.[1] === "9.1.0" ? REL2 : REL1;
    const name = match ? decodeURIComponent(match[2]) : "";
    const file = existsSync(join(dir, name)) ? join(dir, name) : join(REL1, name);
    if (!match || !existsSync(file)) {
        res.statusCode = 404;
        res.end();
        return;
    }
    if (name !== "manifest.json") requested.add(name);
    const size = statSync(file).size;
    const range = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? "");
    const [start, end] = range ? [Number(range[1]), Math.min(Number(range[2]), size - 1)] : [0, size - 1];
    res.statusCode = range ? 206 : 200;
    if (range) res.setHeader("content-range", `bytes ${start}-${end}/${size}`);
    res.setHeader("content-length", String(end - start + 1));
    let flipped = false;
    const stream = createReadStream(file, { start, end });
    stream.on("data", (chunk: Buffer) => {
        if (name !== "manifest.json") served += chunk.length;
        if (corrupt && !flipped && name !== "manifest.json") {
            chunk = Buffer.from(chunk);
            chunk[chunk.length >> 1] ^= 0xff;
            flipped = true;
        }
        res.write(chunk);
    });
    stream.on("end", () => res.end());
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const feed = `http://127.0.0.1:${(server.address() as AddressInfo).port}/releases.json`;

// ---- the install and the app -------------------------------------------------------------------

const USER_DATA = join(SANDBOX, "userData");
rmSync(INSTALL, { recursive: true, force: true });
rmSync(USER_DATA, { recursive: true, force: true });
cpSync(V1, INSTALL, { recursive: true });
replace(INSTALL, "splits/my run.csv", "split,time\n1,0:42\n");
mkdirSync(USER_DATA, { recursive: true });

const env = {
    ...process.env,
    STP_UPDATE_FEED: feed,
    STP_TOOL_URL: "http://127.0.0.1:1",
    STP_CONTROL_PORT: "30359",
    STP_TIMER_FRAME: "off",
    APPDATA: join(SANDBOX, "AppData"),
    LOCALAPPDATA: join(SANDBOX, "AppData", "Local"),
};

function skip(version: string | null) {
    writeFileSync(join(USER_DATA, "updates.json"), JSON.stringify(version ? { skipped: version } : {}));
}

/** Launches the installed app with every native dialog answered `answer` (and recorded). */
async function launch(answer = 0): Promise<ElectronApplication> {
    const app = await electron.launch({
        executablePath: join(INSTALL, "stp-overlay.exe"),
        args: ["--force-device-scale-factor=1", `--user-data-dir=${USER_DATA}`],
        cwd: SANDBOX,
        env,
        timeout: 60000,
    });
    await app.evaluate(({ dialog }, answer) => {
        const seen: string[] = [];
        (globalThis as Record<string, unknown>).__dialogs = seen;
        dialog.showMessageBox = (async (...args: unknown[]) => {
            const options = (args.length > 1 ? args[1] : args[0]) as { message: string };
            seen.push(options.message);
            return { response: answer, checkboxChecked: false };
        }) as typeof dialog.showMessageBox;
    }, answer);
    return app;
}

const dialogs = (app: ElectronApplication) => app.evaluate(() => (globalThis as Record<string, unknown>).__dialogs as string[]);

/** apply.ps1's "done:" lines in updates/apply.log so far. */
function doneLines(): string[] {
    const log = join(INSTALL, "updates", "apply.log");
    return existsSync(log) ? readFileSync(log, "utf-8").split(/\r?\n/).filter((l) => / done: /.test(l)) : [];
}

/**
 * Waits for the app to quit and apply.ps1 to finish, then kills the copy it started.
 * The result comes from apply.log: last-result.json is read and deleted by that copy
 * as soon as it starts, often before this could see it.
 */
async function waitForSwap(app: ElectronApplication): Promise<{ ok: boolean; committed: boolean; error: string | null }> {
    const before = doneLines().length;
    const exited = new Promise<void>((r) => app.process().once("exit", () => r()));
    await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error("the app did not quit to install")), 180000))]);
    for (let i = 0; i < 240 && doneLines().length === before; i++) await new Promise((r) => setTimeout(r, 500));
    const line = doneLines()[before];
    await killRelaunched();
    if (!line) return { ok: false, committed: false, error: "apply.ps1 never finished (no done: line in apply.log)" };
    return { ok: / ok=True/.test(line), committed: / committed=True/.test(line), error: / ok=True/.test(line) ? null : line };
}

/** apply.ps1 starts the app again; stop that copy (it is not under the test's control). */
async function killRelaunched() {
    const script = `$exe = '${join(INSTALL, "stp-overlay.exe").replace(/'/g, "''")}'; for ($i = 0; $i -lt 40; $i++) { $p = @(Get-Process stp-overlay -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe }); if ($p.Count -gt 0) { Start-Sleep -Seconds 2; $p | Stop-Process -Force; break }; Start-Sleep -Milliseconds 250 }`;
    spawnSync("powershell.exe", ["-NoProfile", "-Command", script]);
    await new Promise((r) => setTimeout(r, 1500));
    spawnSync("powershell.exe", ["-NoProfile", "-Command", `Get-Process stp-overlay -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '${INSTALL.replace(/'/g, "''")}*' } | Stop-Process -Force`]);
}

function sha256(path: string): string {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function listFiles(dir: string, prefix = ""): string[] {
    return readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap((e) => {
        const path = prefix ? `${prefix}/${e.name}` : e.name;
        if (e.isDirectory()) return listFiles(dir, path);
        return e.isFile() ? [path] : [];
    });
}

/** The install is exactly `manifest`'s files (plus the updater's, the user's and the image copies). */
function installMatches(manifest: Manifest): boolean {
    const installed = parseManifest(readFileSync(join(INSTALL, "resources", "install-manifest.json"), "utf-8"));
    if (installed.version !== manifest.version) {
        console.log(`      installed manifest is ${installed.version}`);
        return false;
    }
    const copies = new Set<string>(
        (JSON.parse(readFileSync(join(INSTALL, "resources", "image-copies.json"), "utf-8")).copies as string[][]).flatMap(([, ...c]) => c.map((p) => `resources/images/${p}`)),
    );
    const expected = new Map(manifest.files.map((f) => [f.path, f.sha256]));
    const extra = listFiles(INSTALL).filter((p) => !expected.has(p) && !copies.has(p) && !p.startsWith("updates/") && !p.startsWith("splits/") && p !== "resources/install-manifest.json");
    const wrong = manifest.files.filter((f) => !existsSync(join(INSTALL, f.path)) || statSync(join(INSTALL, f.path)).size !== f.size || sha256(join(INSTALL, f.path)) !== f.sha256);
    if (extra.length || wrong.length) console.log(`      extra: ${extra.slice(0, 5).join(", ")}  wrong/missing: ${wrong.slice(0, 5).map((f) => f.path).join(", ")}`);
    return extra.length === 0 && wrong.length === 0;
}

const splitsIntact = () => readFileSync(join(INSTALL, "splits", "my run.csv"), "utf-8") === "split,time\n1,0:42\n";
const mb = (n: number) => `${(n / 2 ** 20).toFixed(1)} MB`;
const changedPacks = Object.entries(m2.packs).filter(([name, p]) => m1.packs[name]?.hash !== p.hash).map(([, p]) => p.file);
const appPackSize = statSync(join(REL2, m2.packs.app.file)).size;
const imageSize = statSync(join(V2, CHANGED_IMAGE)).size;

try {
    console.log(`\nreleases: 9.0.0 and 9.1.0; packs that differ: ${changedPacks.join(", ")}`);
    check(changedPacks.length === 2 && !changedPacks.some((p) => p.startsWith("runtime-")), "only the app pack and one image pack differ (the exe did not change)");

    console.log("\n1. the start-up prompt updates 9.0.0 -> 9.1.0");
    skip(null);
    served = 0;
    requested.clear();
    let app = await launch(0);
    let report = await waitForSwap(app);
    check(report.ok && report.committed, `apply.ps1 swapped the files${report.error ? ` (${report.error})` : ""}`);
    check(installMatches(m2), "the install is exactly 9.1.0");
    check(splitsIntact(), "splits/ untouched");
    check([...requested].every((name) => changedPacks.includes(name)), `only changed packs were downloaded (${[...requested].join(", ")})`);
    check(served <= appPackSize + imageSize + 2 * 2 ** 20, `downloaded ${mb(served)}: the app pack (${mb(appPackSize)}) and the changed image (${mb(imageSize)}), not the 1.3 GB install`);
    check(existsSync(join(INSTALL, "updates", "previous", OLD_FILE)), "9.0.0's removed file is kept for the rollback");
    check(existsSync(join(INSTALL, "updates", "rollback-ops.txt")), "the .cmd's rollback list is in place");

    console.log("\n2. the local rollback puts back 9.0.0");
    skip("9.1.0");
    served = 0;
    app = await launch(0);
    let page = await app.firstWindow();
    await page.waitForFunction(() => !!window.api?.updates);
    const state = await page.evaluate(() => window.api.updates.getState());
    check(state.enabled && state.current === "9.1.0" && state.previous === "9.0.0", `the app knows it is 9.1.0 and can roll back to 9.0.0 (${state.current}/${state.previous}, ${state.disabledReason ?? "enabled"})`);
    void page.evaluate(() => window.api.updates.rollback()).catch(() => {});
    report = await waitForSwap(app);
    check(report.ok && report.committed, `apply.ps1 swapped the files${report.error ? ` (${report.error})` : ""}`);
    check(installMatches(m1), "the install is exactly 9.0.0");
    check(served === 0, "nothing was downloaded");
    check(splitsIntact(), "splits/ untouched");

    console.log("\n3. installing 9.1.0 from the list uses updates/previous, not the network");
    served = 0;
    requested.clear();
    app = await launch(0);
    page = await app.firstWindow();
    await page.waitForFunction(() => !!window.api?.updates);
    await page.evaluate(() => window.api.updates.check());
    void page.evaluate(() => window.api.updates.install("9.1.0")).catch(() => {});
    report = await waitForSwap(app);
    check(report.ok && report.committed, `apply.ps1 swapped the files${report.error ? ` (${report.error})` : ""}`);
    check(installMatches(m2), "the install is exactly 9.1.0");
    check(served === 0, `nothing was downloaded (${mb(served)})`);

    console.log("\n4. a corrupted download is refused and changes nothing");
    rmSync(join(INSTALL, "updates", "previous"), { recursive: true, force: true });
    skip("9.1.0");
    corrupt = true;
    app = await launch(0);
    page = await app.firstWindow();
    await page.waitForFunction(() => !!window.api?.updates);
    await page.evaluate(() => window.api.updates.check());
    const failed = await page.evaluate(() => window.api.updates.install("9.0.0"));
    check(!!failed.error && /did not download correctly/.test(failed.error) && failed.job === null, `the download fails with a clear error (${failed.error})`);
    check((await dialogs(app)).every((m) => !/ready to install/.test(m)), "no restart was offered");
    await app.close();
    check(installMatches(m2), "the install is still exactly 9.1.0");
    corrupt = false;

    console.log("\n5. installing the older 9.0.0 from GitHub with no local copy");
    served = 0;
    requested.clear();
    app = await launch(0);
    page = await app.firstWindow();
    await page.waitForFunction(() => !!window.api?.updates);
    await page.evaluate(() => window.api.updates.check());
    void page.evaluate(() => window.api.updates.install("9.0.0")).catch(() => {});
    report = await waitForSwap(app);
    check(report.ok && report.committed, `apply.ps1 swapped the files${report.error ? ` (${report.error})` : ""}`);
    check(installMatches(m1), "the install is exactly 9.0.0");
    check(served > 0 && served <= statSync(join(REL1, m1.packs.app.file)).size + imageSize + 2 * 2 ** 20, `downloaded ${mb(served)}: only the app pack and one image`);
    check(splitsIntact(), "splits/ untouched");

    console.log("\n6. the .cmd's op list rolls back without the app");
    const ops = join(INSTALL, "updates", "rollback-ops.txt");
    check(existsSync(ops), "rollback-ops.txt is there after the update");
    const before = doneLines().length;
    spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(INSTALL, "updates", "apply.ps1"), "-AppRoot", INSTALL, "-Ops", ops]);
    const cmdDone = doneLines()[before] ?? "";
    await killRelaunched();
    check(/ ok=True committed=True/.test(cmdDone), `apply.ps1 swapped the files (${cmdDone.trim()})`);
    check(installMatches(m2), "the install is exactly 9.1.0 again");
    check(splitsIntact(), "splits/ untouched");
} catch (err) {
    failures++;
    console.error("FAIL", err);
    await killRelaunched();
} finally {
    server.close();
}

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
