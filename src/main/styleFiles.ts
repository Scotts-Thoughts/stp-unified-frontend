import { readdirSync, readFileSync } from "fs";
import path from "path";

/**
 * `<rendererRoot>/<sourceDir>/*.json` by file name, each parsed — `null` for a file
 * that says `null` (a style removed) — or null when there is no such folder (a packaged
 * overlay). `sourceDir` is `games/genN/data/style`.
 *
 * Used by the Cutter editor (`cutter:style_files`) and by every unpackaged run
 * (`source:style_files`, src/main/ipc.ts): there a style edit is written back into these
 * files, but the renderer bundle only holds them as they were when it was built, so
 * without this a refresh of a built-from-source app went back to the build's styles.
 */
export function liveStyleFiles(sourceDir: string, rendererRoot: string): Record<string, unknown> | null {
  if (!/^games\/gen\d\/data\/style$/.test(sourceDir)) return null;
  const dir = path.join(rendererRoot, ...sourceDir.split("/"));
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith(".json") && n !== "index.json");
  } catch {
    return null;
  }
  const out: Record<string, unknown> = {};
  for (const name of names) {
    try {
      out[name.slice(0, -".json".length)] = JSON.parse(readFileSync(path.join(dir, name), "utf8"));
    } catch {
      // A file being written as it is read: the bundled one stands in.
    }
  }
  return out;
}
