/**
 * Launches the unified app exactly as run.ts does (same args, env and sandbox) and
 * prints the main process's stdout/stderr while waiting for the first window -- for
 * when `firstWindow` times out and the run log says nothing about why.
 *
 *   npx tsx tools/parity/launch-probe.ts
 */
import { _electron as electron } from "playwright-core";
import { parseTarget, prepareSandbox } from "./targets.ts";
import { join } from "node:path";

const target = parseTarget("unified");
prepareSandbox(target, (m) => console.log(m));
const app = await electron.launch({
  executablePath: target.executablePath,
  args: [target.appArg, "--force-device-scale-factor=1", `--user-data-dir=${target.userDataDir}`],
  cwd: target.cwd,
  env: {
    ...process.env,
    APPDATA: target.appData,
    LOCALAPPDATA: join(target.appData, "Local"),
    NODE_ENV: "production",
    ELECTRON_ENABLE_LOGGING: "1",
    STP_APP_ROOT: target.cwd,
    STP_CONTROL_PORT: "30259",
  },
  timeout: 60000,
});
app.process().stdout?.on("data", (d) => process.stdout.write(`[app stdout] ${d}`));
app.process().stderr?.on("data", (d) => process.stdout.write(`[app stderr] ${d}`));
const started = Date.now();
try {
  const page = await app.firstWindow({ timeout: 60000 });
  console.log(`first window after ${Date.now() - started} ms: ${page.url()}`);
  // Never let the probe reach a real PokeAByte (see screenshot-idle.ts).
  await page.route("**/*", (route) => {
    const protocol = new URL(route.request().url()).protocol;
    return protocol === "file:" || protocol === "data:" || protocol === "blob:" ? route.continue() : route.abort("blockedbyclient");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#app", { timeout: 30000 });
  console.log(`#app after ${Date.now() - started} ms`);
} catch (err) {
  console.log(`no window: ${(err as Error).message}`);
} finally {
  await app.close();
}
