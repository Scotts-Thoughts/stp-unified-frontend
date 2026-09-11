/**
 * Names a lifted component uses but never declares (plan 2.4).
 *
 *   npx tsx tools/port/check-undefined.ts src/renderer/games/gen4/Overlay.vue [more.vue|.js ...] [--allow=hash]
 *
 * A legacy classic `<script>` runs in sloppy mode, where an assignment to an
 * undeclared name silently creates a global and a read of one that was never
 * assigned throws only when that line runs. The lifted SFC is an ES module, strict,
 * where both are ReferenceErrors -- and gen2's lift shipped two of them (`loadCsvFile`,
 * behind the "Load Splits" buttons) that no fixture ever reached. This asks the
 * TypeScript checker instead of the app: the script block is type-checked as
 * JavaScript with the DOM library, and every "Cannot find name" is printed. Imports
 * that cannot be resolved here (`~/...`, `./data/*.js`) still *declare* their names,
 * so they do not show; only genuinely undeclared identifiers do.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const argv = process.argv.slice(2);
const files = argv.filter((a) => !a.startsWith("--"));
/** `--allow=hash,...`: names known to be undeclared in the legacy app too (a ReferenceError on both sides). */
const allow = new Set((argv.find((a) => a.startsWith("--allow="))?.slice("--allow=".length) ?? "").split(",").filter(Boolean));
if (!files.length) {
  console.error("usage: check-undefined.ts <Overlay.vue|file.js> ...");
  process.exit(2);
}

let problems = 0;
for (const file of files) {
  const abs = resolve(file);
  let text = readFileSync(abs, "utf8");
  // Reported lines are 1-based in the file: for an SFC the script text starts on the
  // <script> tag's own line, so its 0-based line 0 is that tag's 1-based line.
  let lineOffset = 1;
  if (abs.endsWith(".vue")) {
    const m = /<script[^>]*>([\s\S]*?)<\/script>/.exec(text);
    if (!m) throw new Error(`${file}: no <script> block`);
    lineOffset = text.slice(0, m.index).split("\n").length;
    text = m[1];
  }
  // The host hands file names to readFile/fileExists with forward slashes, whatever
  // `resolve` produced; compare in that form or the virtual file is never served.
  const virtualName = abs.replace(/\\/g, "/").replace(/\.vue$/, ".vue.js");
  const isVirtual = (name: string) => name.replace(/\\/g, "/").toLowerCase() === virtualName.toLowerCase();
  const options: ts.CompilerOptions = {
    allowJs: true,
    checkJs: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
    types: [],
    skipLibCheck: true,
  };
  const host = ts.createCompilerHost(options, true);
  const readFile = host.readFile;
  host.readFile = (name) => (isVirtual(name) ? text : readFile(name));
  const fileExists = host.fileExists;
  host.fileExists = (name) => isVirtual(name) || fileExists(name);
  const program = ts.createProgram([virtualName], options, host);
  const all = ts.getPreEmitDiagnostics(program);
  if (!program.getSourceFile(virtualName) || all.some((d) => d.code === 6053)) {
    throw new Error(`${file}: the checker did not load the script (${all.length} diagnostics)`);
  }
  const diagnostics = all.filter((d) => d.code === 2304 || d.code === 2552 || d.code === 2448);
  // Globals the Electron renderer has (nodeIntegration, Chromium) that lib.dom lacks.
  const RENDERER_GLOBALS = new Set(["EyeDropper", "setImmediate", "clearImmediate", "require", "process", "Buffer", "global"]);
  const seen = new Map<string, number[]>();
  for (const d of diagnostics) {
    // Only the file under test: an imported data module is type-checked too (it is JS
    // under checkJs) and reports its own names against its own text.
    if (!d.file || d.start === undefined || !isVirtual(d.file.fileName)) continue;
    const { line } = d.file.getLineAndCharacterOfPosition(d.start);
    const message = ts.flattenDiagnosticMessageText(d.messageText, " ");
    const name = /'([^']+)'/.exec(message)?.[1] ?? message;
    if (RENDERER_GLOBALS.has(name) || allow.has(name)) continue;
    (seen.get(name) ?? seen.set(name, []).get(name)!).push(line + lineOffset);
  }
  for (const [name, lines] of [...seen.entries()].sort()) {
    problems++;
    console.log(`${file}: '${name}' is never declared (${lines.length} use(s); first at line ${lines[0]})`);
  }
  if (!seen.size) console.log(`${file}: every name is declared`);
}
process.exit(problems ? 1 : 0);
