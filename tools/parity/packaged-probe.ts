/**
 * Smoke-tests a packaged build (plan 3.5): launches `dist/win-unpacked/stp-overlay.exe`
 * the way a double-click would -- no STP_APP_ROOT, an unrelated working directory --
 * with the network blocked, and reports what the packaged layout resolved:
 *
 *   - the renderer loaded from resources/app/out/renderer
 *   - the image pool: ensureImagePool()'s junction and the box-art grid's images
 *   - the shipped defaults: storage/Storage.json readable through the storage IPC
 *   - keyhook.exe in the package and found by the main process
 *   - the control server answering /status on STP_CONTROL_PORT
 *
 *   npx tsx tools/parity/packaged-probe.ts [--exe=<path>]
 *
 * Nothing here is a parity claim; the harness runs the app from `out/` and this only
 * proves the packaged shape puts the same files where the main process looks.
 */
import { existsSync, lstatSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";

const REPO = resolve(import.meta.dirname, "..", "..");
const exeFlag = process.argv.find((a) => a.startsWith("--exe="));
const exe = resolve(exeFlag ? exeFlag.slice("--exe=".length) : join(REPO, "dist", "win-unpacked", "stp-overlay.exe"));
const CONTROL_PORT = 30259;

if (!existsSync(exe)) {
  console.error(`no packaged build at ${exe} -- npm run build:unpack first`);
  process.exit(2);
}

const sandbox = join(REPO, "tools", "sandbox", "packaged");
rmSync(sandbox, { recursive: true, force: true });
for (const dir of ["AppData", "userData", "cwd"]) mkdirSync(join(sandbox, dir), { recursive: true });

const mainLog: string[] = [];
const failures: string[] = [];
const check = (ok: boolean, what: string): void => {
  console.log(`  ${ok ? "ok " : "FAIL"} ${what}`);
  if (!ok) failures.push(what);
};

console.log(`launching ${exe}`);
const app = await electron.launch({
  executablePath: exe,
  args: ["--force-device-scale-factor=1", `--user-data-dir=${join(sandbox, "userData")}`],
  cwd: join(sandbox, "cwd"),
  env: {
    ...process.env,
    APPDATA: join(sandbox, "AppData"),
    LOCALAPPDATA: join(sandbox, "AppData", "Local"),
    ELECTRON_ENABLE_LOGGING: "1",
    STP_CONTROL_PORT: String(CONTROL_PORT),
  },
  timeout: 60000,
});
const onOutput = (d: Buffer): void => {
  for (const line of String(d).split(/\r?\n/)) {
    if (!line.trim() || /INFO:CONSOLE/.test(line)) continue;
    mainLog.push(line);
    console.log(`  [app] ${line}`);
  }
};
app.process().stdout?.on("data", onOutput);
app.process().stderr?.on("data", onOutput);

const consoleErrors: string[] = [];
try {
  const page = await app.firstWindow({ timeout: 60000 });
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
  // Never let the probe reach a real PokeAByte (see screenshot-idle.ts).
  await page.route("**/*", (route) => {
    const protocol = new URL(route.request().url()).protocol;
    return protocol === "file:" || protocol === "data:" || protocol === "blob:" ? route.continue() : route.abort("blockedbyclient");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".game-select .gameToggleImg", { timeout: 30000 });
  // The grid's images are the pool's; give the file loads a moment.
  await page.waitForTimeout(1500);

  console.log("checks");
  check(/\/resources\/app\/out\/renderer\/index\.html$/.test(page.url()), `renderer loaded from resources/app/out/renderer (${page.url()})`);

  const packagedRoot = dirname(exe);
  const junction = join(packagedRoot, "resources", "app", "out", "renderer", "images");
  const junctionOk = existsSync(junction) && lstatSync(junction).isSymbolicLink();
  check(junctionOk, `image pool junction ${junction}`);
  check(existsSync(join(packagedRoot, "resources", "images", "gen2")), "resources/images carries the generation trees");

  const tiles = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLImageElement>(".game-select .gameToggleImg")).map((img) => ({
      src: img.getAttribute("src"),
      loaded: img.complete && img.naturalWidth > 0,
    })),
  );
  const unloaded = tiles.filter((t) => !t.loaded);
  // gen1 Yellow/Red/Blue ("Yellow Legacy" is dev-only) + gen2 2 + gen3 2 + gen4 3 + gen5 4.
  check(tiles.length === 14, `box-art grid shows ${tiles.length} tiles (14 expected)`);
  check(unloaded.length === 0, `every tile image loaded${unloaded.length ? `: ${unloaded.map((t) => t.src).join(", ")} did not` : ""}`);

  const storage = await page.evaluate(async () => {
    try {
      const raw = await (window as any).api.storage.read("Storage.json");
      return raw ? `${raw.length} chars` : "empty";
    } catch (err) {
      return `error: ${String(err)}`;
    }
  });
  check(/chars$/.test(storage), `storage/Storage.json readable through the storage IPC (${storage})`);

  let status: Record<string, unknown> | null = null;
  try {
    const res = await fetch(`http://127.0.0.1:${CONTROL_PORT}/status`);
    status = (await res.json()) as Record<string, unknown>;
  } catch (err) {
    status = { error: String(err) };
  }
  check(status?.ok === true && status?.app === "stp-overlay", `control server /status on ${CONTROL_PORT}: ${JSON.stringify(status)}`);

  // The antivirus on this machine quarantines the exe from the working tree; a build
  // made while it was gone ships without it and says nothing.
  check(existsSync(join(packagedRoot, "resources", "keyhook.exe")), "resources/keyhook.exe is in the package");
  const keyhookLine = mainLog.find((l) => /keyhook/i.test(l));
  check(!keyhookLine || !/not found|Could not start/.test(keyhookLine), `keyhook.exe${keyhookLine ? ` -- ${keyhookLine.trim()}` : " started without complaint"}`);

  const blocked = consoleErrors.filter((e) => !/blockedbyclient|ERR_BLOCKED_BY_CLIENT|Failed to fetch|WebSocket|negotiate|signalr|ERR_FAILED/i.test(e));
  check(blocked.length === 0, `no renderer errors beyond the blocked network${blocked.length ? `:\n      ${blocked.join("\n      ")}` : ""}`);
} catch (err) {
  failures.push(`probe threw: ${(err as Error).message}`);
  console.log(`  FAIL ${(err as Error).message}`);
} finally {
  await app.close().catch(() => {});
}

console.log(failures.length ? `\n${failures.length} check(s) failed` : "\npackaged build: all checks passed");
process.exit(failures.length ? 1 : 0);
