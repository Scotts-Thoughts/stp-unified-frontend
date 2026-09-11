/**
 * Extracts a legacy overlay's in-DOM Vue template exactly as Vue compiled it
 * (plan 2.4, the template half of "lift the component").
 *
 *   npx tsx tools/port/extract-template.ts <legacy-app-dir> <out.html>
 *
 * gen2-5 mount Vue on `#app` with no `template` option, so Vue compiles
 * `container.innerHTML` -- the markup *after* the browser's HTML parser has
 * normalised it: `<tbody>` inserted into tables, self-closing tags expanded,
 * attribute entities re-escaped, tag names lowercased. An SFC's `<template>` is parsed
 * from raw text by Vue's own parser, so putting the raw index.html markup in one would
 * compile a subtly different tree and every nth-child key in the layout oracle would
 * shift. Running the file through a real Chromium and reading `innerHTML` back gives
 * the exact string the runtime compiler saw.
 *
 * Scripts and stylesheets are stripped first so nothing executes and nothing loads.
 * The output is the *content* of the app's `v-else` wrapper (gen5's is a `v-else-if`; the overlay proper --
 * `.mainContainer` and its siblings), since the unified shell provides the ready gate
 * and the wrapper. Anything after the `v-else` wrapper (gen2's dev-only `<Teleport>`)
 * is appended after it.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";

const [dir, out] = process.argv.slice(2);
if (!dir || !out) {
  console.error("usage: extract-template.ts <legacy-app-dir> <out.html>");
  process.exit(2);
}
const html = readFileSync(join(resolve(dir), "index.html"), "utf-8")
  .replace(/<script[\s\S]*?<\/script>/gi, "")
  .replace(/<link[^>]*>/gi, "");

const REPO = resolve(import.meta.dirname, "..", "..");

// A throwaway Electron app: one hidden window, no preload, loads the stripped file.
const work = mkdtempSync(join(tmpdir(), "stp-extract-"));
writeFileSync(join(work, "index.html"), html);
writeFileSync(
  join(work, "main.js"),
  `const { app, BrowserWindow } = require("electron");
   app.whenReady().then(() => {
     const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
     win.loadFile(require("path").join(__dirname, "index.html"));
   });`,
);
writeFileSync(join(work, "package.json"), JSON.stringify({ name: "stp-extract", main: "main.js" }));

const app = await electron.launch({
  executablePath: join(REPO, "node_modules", "electron", "dist", "electron.exe"),
  args: [work],
});
try {
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  const result = await page.evaluate(
    "(function () {" +
      "  var app = document.getElementById('app');" +
      "  if (!app) return { error: 'no #app' };" +
      "  var children = Array.prototype.slice.call(app.children);" +
      "  var elseIndex = -1;" +
      "  for (var i = 0; i < children.length; i++) if (children[i].hasAttribute('v-else') || children[i].hasAttribute('v-else-if')) { elseIndex = i; break; }" +
      "  if (elseIndex === -1) return { error: 'no v-else wrapper under #app' };" +
      "  var wrapper = children[elseIndex];" +
      "  var after = children.slice(elseIndex + 1).map(function (c) { return c.outerHTML; });" +
      "  return { inner: wrapper.innerHTML, after: after, wrapperAttrs: wrapper.getAttributeNames() };" +
      "})()",
  ) as { error?: string; inner?: string; after?: string[]; wrapperAttrs?: string[] };
  if (result.error) throw new Error(result.error);
  const body = [result.inner!, ...result.after!].join("\n");
  writeFileSync(out, body);
  console.log(`wrote ${out}: ${body.length} chars, v-else wrapper attrs [${result.wrapperAttrs!.join(", ")}], ${result.after!.length} sibling(s) after it`);
} finally {
  await app.close();
  rmSync(work, { recursive: true, force: true });
}
