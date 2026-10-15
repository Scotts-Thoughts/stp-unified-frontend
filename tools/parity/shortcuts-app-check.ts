/**
 * The keyboard shortcuts in the built app (2026-10-14, docs/shortcuts-menu-plan.md), one
 * generation per fixture, through run() with --redirect-ports (no live PokeAByte is
 * contacted, nothing on the machine has to be closed). After the replay it:
 *
 *   - opens the Keyboard Shortcuts window and checks it lists the generation's actions;
 *   - records Ctrl+Alt+K on an unbound toggle there, checks the window shows it and
 *     user_state.json has it, then presses Ctrl+Alt+K for real (through Windows, as a
 *     keyboard or Stream Deck would) and checks the toggle flipped;
 *   - presses one of the generation's original F-keys and checks its console line, and that
 *     the focused window got the key too (the keyboard hook only watches, so the emulator
 *     still sees F24);
 *   - holds that F-key down through a burst of auto-repeats and checks it fired once;
 *   - gen1 only: moves F15 to another action through the "Move it here" prompt, and checks
 *     a bare letter is refused;
 *   - reloads the overlay (the page re-reads user_state.json, as after a restart) and checks the
 *     recorded key is still bound and still works;
 *   - "Reset all to defaults" clears the saved bindings.
 *
 *   npm run build && npx tsx tools/parity/shortcuts-app-check.ts [--only=gen1,gen4] [--out=<dir>]
 *
 * Windows only: the real key presses go through user32 `keybd_event` from PowerShell, and
 * they are global, so don't type while it runs. Each press first brings the Keyboard
 * Shortcuts window to the front, and none is sent if that fails, so no key reaches another
 * program (the keyboard hook passes every key on). Run it on its own, like any harness run.
 * gen2's fixture is the gitignored recording in tools/fixtures/raw/; without it gen2 is skipped.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { run } from "./run.ts";
import { REPO } from "./targets.ts";

const argv = process.argv.slice(2);
const only = argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const outRoot = argv.find((a) => a.startsWith("--out="))?.slice(6) ?? join(REPO, "tools", "reports", "shortcuts-app");
mkdirSync(outRoot, { recursive: true });

if (process.platform !== "win32") {
  console.error("shortcuts-app-check presses real keys through Windows; it only runs there.");
  process.exit(2);
}

const ps1 = join(outRoot, "send-keys.ps1");
writeFileSync(
  ps1,
  `param([string]$title, [string]$codes, [int]$repeats = 0)
Add-Type -Namespace W -Name K -UsingNamespace System.Text -MemberDefinition @'
[DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string c, string t);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
[DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr p);
[DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
[DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool f);
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
'@
function Title($h) { $s = New-Object System.Text.StringBuilder 256; [void][W.K]::GetWindowText($h, $s, 256); $s.ToString() }
$h = [W.K]::FindWindow([NullString]::Value, $title)
if ($h -eq [IntPtr]::Zero) { Write-Output "no window titled $title; no keys sent"; exit 3 }
$fg = [W.K]::GetForegroundWindow()
if ($fg -ne $h) {
  $me = [W.K]::GetCurrentThreadId()
  $them = [W.K]::GetWindowThreadProcessId($fg, [IntPtr]::Zero)
  [void][W.K]::AttachThreadInput($me, $them, $true)
  [void][W.K]::ShowWindow($h, 9)
  [void][W.K]::BringWindowToTop($h)
  [void][W.K]::SetForegroundWindow($h)
  [void][W.K]::AttachThreadInput($me, $them, $false)
  Start-Sleep -Milliseconds 300
}
$fg = [W.K]::GetForegroundWindow()
if ($fg -ne $h) { Write-Output "could not bring '$title' to the front ('$(Title $fg)' is); no keys sent"; exit 4 }
$vks = $codes.Split(",") | ForEach-Object { [byte][int]$_ }
if ($repeats -gt 0) {
  for ($i = 0; $i -le $repeats; $i++) { [W.K]::keybd_event($vks[0], 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 33 }
  [W.K]::keybd_event($vks[0], 0, 2, [UIntPtr]::Zero)
} else {
  foreach ($vk in $vks) { [W.K]::keybd_event($vk, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 30 }
  [array]::Reverse($vks)
  foreach ($vk in $vks) { [W.K]::keybd_event($vk, 0, 2, [UIntPtr]::Zero); Start-Sleep -Milliseconds 30 }
}
`,
);
/**
 * The test's own window, by a title nothing else has. Every key press first brings it to
 * the front and is not sent at all if that fails: the keyboard hook passes keys on, so a
 * press would otherwise reach whatever is in front (an emulator, say).
 */
const TARGET = `stp shortcuts check ${process.pid}`;
const sendKeys = (codes: number[], repeats = 0): void => {
  try {
    execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1, TARGET, codes.join(","), String(repeats)],
      { windowsHide: true, stdio: "pipe" });
  } catch (err) {
    throw new Error(`key press refused: ${String((err as { stdout?: Buffer }).stdout ?? err).trim()}`);
  }
};
/** Real key presses through Windows: each key down in order, then up in reverse. */
const keys = (...vks: number[]) => sendKeys(vks);
/** A held key as Windows reports it: one key-down, `repeats` more 33 ms apart (auto-repeat), one key-up. */
const hold = (vk: number, repeats: number) => sendKeys([vk], repeats);
const CTRL = 0x11, ALT = 0x12, K = 0x4b, F15 = 0x7e;

interface Case {
  fixture: string;
  /** The unbound toggle Ctrl+Alt+K is recorded on, and how to read what it toggles. */
  label: string;
  read: (page: Page) => Promise<unknown>;
  /** An original F-key and the console line it prints. */
  vk: number;
  line: string;
}

/** gen1: a Pinia store's state; gen2-5: a field of the mounted overlay component. */
const readGen1 = (path: string) => (page: Page) =>
  page.evaluate((p) => {
    const pinia = (document.querySelector("#app") as any).__vue_app__.config.globalProperties.$pinia;
    return p.split(".").reduce((o: any, k) => o?.[k], pinia.state.value);
  }, path);
const readVm = (field: string) => (page: Page) =>
  page.evaluate((f) => (document.querySelector("#app") as any)._vnode.component.refs.overlay[f], field);

const CASES: Record<string, Case> = {
  gen1: {
    fixture: "tools/fixtures/gen1/gen1-yellow-smoke.fixture.jsonl.gz",
    label: "Toggle: Show repel counter",
    read: readGen1("overlay_settings.visualization.pop_ups.repel.enabled"),
    vk: F15,
    line: "Key: F15 pressed. Base Stats displayed.",
  },
  gen2: {
    fixture: "tools/fixtures/raw/Pokemon Crystal - Deprecated Mapper/c-wigglytuff-2-11311.fixture.jsonl.gz",
    label: "Toggle: Show Advanced Settings",
    read: readVm("show_advanced_settings"),
    vk: 0x7c,
    line: "Key: F13 pressed: DVs displayed.",
  },
  gen3: {
    fixture: "tools/fixtures/gen3/gen3-firered-smoke.fixture.jsonl.gz",
    label: "Toggle: Show Advanced Settings",
    read: readVm("show_advanced_settings"),
    vk: 0x85,
    line: "Key: F22 pressed: IVs displayed.",
  },
  gen4: {
    fixture: "tools/fixtures/gen4/gen4-platinum-smoke.fixture.jsonl.gz",
    label: "Toggle: Show Tutor Moves",
    read: readVm("show_tutor_moves"),
    vk: 0x7f,
    line: "Key: F16 pressed. Stats are displaying automatically now.",
  },
  gen5: {
    fixture: "tools/fixtures/gen5/gen5-black-smoke.fixture.jsonl.gz",
    label: "Toggle: Show Advanced Settings",
    read: readVm("show_advanced_settings"),
    vk: 0x7c,
    line: "Key: F13 pressed: IVs displayed.",
  },
};

let failures = 0;
for (const [gen, c] of Object.entries(CASES)) {
  if (only && !only.includes(gen)) continue;
  const fixture = join(REPO, c.fixture);
  if (!existsSync(fixture)) {
    console.log(`${gen}: skipped, no fixture at ${c.fixture}`);
    continue;
  }
  const results: Record<string, unknown> = {};
  const check = (name: string, pass: boolean, detail?: unknown) => {
    results[name] = pass ? "ok" : { FAIL: detail ?? true };
    if (!pass) failures++;
  };

  await run({
    target: "unified",
    fixture,
    out: join(outRoot, gen),
    redirectPorts: true,
    screenshots: false,
    afterReplay: async (page: Page) => {
      const consoleLines: string[] = [];
      page.on("console", (m) => consoleLines.push(m.text()));
      const wait = (ms: number) => page.waitForTimeout(ms);

      // Open the window as the button does.
      const opened = page.context().waitForEvent("page", { timeout: 15000 });
      await page.evaluate(() => (window as any).api.shortcuts.openMenu());
      const menu = await opened;
      await menu.waitForSelector(".row", { timeout: 15000 });
      await menu.evaluate((t) => (document.title = t), TARGET);
      const title = await menu.locator(".subtitle").textContent();
      const rows = await menu.locator(".row").count();
      check("window lists the actions", rows > 40, { rows });
      check("window title", title === `Generation ${gen.slice(3)}`, title);
      await menu.setViewportSize({ width: 820, height: 900 });
      await menu.screenshot({ path: join(outRoot, `menu-${gen}.png`) });

      // Record Ctrl+Alt+K on an unbound toggle, then press it for real.
      const key = () => menu.locator(".row", { hasText: c.label }).locator("button.key");
      await key().click();
      await menu.keyboard.press("Control+Alt+KeyK");
      await wait(800);
      const shown = await key().textContent();
      check("recorded key shows in the window", shown?.trim() === "Ctrl + Alt + K", shown);
      const saved = await page.evaluate(() => (window as any).__stpUserState().shortcuts);
      check("binding saved to user_state", JSON.stringify(saved ?? {}).includes("Ctrl+Alt+K"), saved);
      const before = await c.read(page);
      keys(CTRL, ALT, K);
      await wait(800);
      const after = await c.read(page);
      check("real Ctrl+Alt+K runs the action", before !== after && typeof after === "boolean", { before, after });

      // An original F-key still fires (its console text comes from the old table), and the
      // focused program (here the window) receives it as well.
      await menu.evaluate(() => {
        (window as any).__seen = [];
        window.addEventListener("keydown", (e) => (window as any).__seen.push(e.key));
      });
      const focused = await menu.evaluate(() => document.hasFocus());
      keys(c.vk);
      await wait(800);
      check("original F-key fires", consoleLines.includes(c.line), consoleLines.slice(-5));
      const fName = `F${c.vk - 0x7c + 13}`;
      const seen: string[] = await menu.evaluate(() => (window as any).__seen);
      check("the focused window got the F-key too", focused && seen.includes(fName), { focused, seen });

      // Held through 15 auto-repeats, it fires once.
      const fired = () => consoleLines.filter((l) => l.startsWith(`Key: ${fName} `)).length;
      const firedBefore = fired();
      hold(c.vk, 15);
      await wait(800);
      const firedHeld = fired() - firedBefore;
      check("a held F-key fires once", firedHeld === 1, { firedHeld });

      if (gen === "gen1") {
        // Move F15 to "Stats: Automatic" through the conflict prompt.
        const row = menu.locator(".row", { hasText: "Stats: Automatic" }).filter({ hasNotText: "Badge" }).first();
        await row.locator("button.key").click();
        // Playwright's keyboard stops at F12; send F15 the way Chromium receives it.
        const cdp = await menu.context().newCDPSession(menu);
        for (const type of ["rawKeyDown", "keyUp"]) {
          await cdp.send("Input.dispatchKeyEvent", { type, key: "F15", code: "F15", windowsVirtualKeyCode: 0x7e, nativeVirtualKeyCode: 0x7e } as any);
        }
        await menu.waitForSelector(".prompt", { timeout: 5000 });
        await menu.locator(".prompt button", { hasText: "Move it here" }).click();
        await wait(800);
        const oldHolder = await menu.locator(".row", { hasText: "Stats: Base Stats" }).first().locator("button.key").textContent();
        check("old holder lost F15", oldHolder?.trim() === "Set key", oldHolder);
        const linesBefore = consoleLines.length;
        keys(F15);
        await wait(800);
        const mode = await readGen1("overlay_settings.visualization.left_panel.stats.mode")(page);
        check("F15 now runs the new action", mode === "Automatic" && !consoleLines.slice(linesBefore).some((l) => l.startsWith("Key: F15")), { mode });
        await menu.locator(".row", { hasText: "Toggle: Show bonk/item counter" }).locator("button.key").click();
        await menu.keyboard.press("KeyR");
        await wait(300);
        check("bare letter refused", (await menu.locator(".error").count()) === 1);
      }

      const errors = consoleLines.filter((l) => /\[shortcuts\]|Error/.test(l));
      check("no shortcut errors in the console", errors.length === 0, errors);

      // Still bound after a reload, which re-reads user_state.json from disk. The harness's
      // clock is paused once the replay ends; the reloaded page needs real time to boot.
      await page.clock.resume();
      await page.reload({ waitUntil: "domcontentloaded" });
      let mounted = false;
      for (let i = 0; i < 60 && !mounted; i++) {
        await wait(500);
        mounted = await page
          .evaluate(() => !!(document.querySelector("#app") as any)?._vnode?.component?.refs?.overlay)
          .catch(() => false);
      }
      check("overlay back after a reload", mounted);
      await wait(1500);
      const reloaded = await page.evaluate(() => (window as any).__stpUserState().shortcuts);
      check("binding read back after a reload", JSON.stringify(reloaded ?? {}).includes("Ctrl+Alt+K"), reloaded);
      const beforeReloadPress = await c.read(page);
      keys(CTRL, ALT, K);
      await wait(800);
      const afterReloadPress = await c.read(page);
      check("Ctrl+Alt+K still works after a reload", beforeReloadPress !== afterReloadPress && typeof afterReloadPress === "boolean",
        { beforeReloadPress, afterReloadPress });

      menu.once("dialog", (d) => d.accept());
      await menu.locator("button", { hasText: "Reset all to defaults" }).click();
      await wait(800);
      const afterReset = await page.evaluate(() => (window as any).__stpUserState().shortcuts);
      check("reset all clears the saved bindings", afterReset === undefined, afterReset);
      await menu.close();
    },
  });
  console.log(`${gen}: ${JSON.stringify(results, null, 1)}`);
}
console.log(failures === 0 ? "\nall shortcut app checks passed" : `\n${failures} shortcut app check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
