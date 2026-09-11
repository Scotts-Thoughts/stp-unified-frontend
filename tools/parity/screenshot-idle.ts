/**
 * Launches the built app with no PokeAByte at all and screenshots the pre-mapper
 * screen (the box-art grid, plan 3.2) after a few seconds.
 *
 *   npx tsx tools/parity/screenshot-idle.ts [--out=tools/reports/idle.png] [--click=<edition name>]
 *
 * Uses a throwaway user-data dir under tools/sandbox/idle so the real profile is not
 * touched, and the harness's ports flag so a running PokeAByte is not contacted.
 */
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";

const argv = process.argv.slice(2);
const out = argv.find((a) => a.startsWith("--out="))?.slice(6) ?? "tools/reports/idle.png";
const click = argv.find((a) => a.startsWith("--click="))?.slice(8);
const REPO = resolve(import.meta.dirname, "..", "..");
const sandbox = join(REPO, "tools", "sandbox", "idle");
mkdirSync(join(sandbox, "userData"), { recursive: true });

const app = await electron.launch({
  executablePath: join(REPO, "node_modules", "electron", "dist", "electron.exe"),
  args: [REPO, `--user-data-dir=${join(sandbox, "userData")}`],
  cwd: sandbox,
  env: { ...process.env, STP_APP_ROOT: sandbox, STP_CONTROL_PORT: "30259", STP_POKEABYTE_URL: "http://localhost:18085" },
});
try {
  const page = await app.firstWindow();
  await page.waitForSelector("#app", { timeout: 30000 });
  await page.waitForTimeout(3000);
  if (click) {
    await page.click(`img[title="${click}"]`);
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: out });
  const state = await page.evaluate("JSON.stringify((window).__stpUserState ? (window).__stpUserState() : null)");
  console.log(`screenshot: ${out}; user state: ${state}`);
} finally {
  await app.close();
}
