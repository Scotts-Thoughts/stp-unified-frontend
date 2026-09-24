import { readFileSync } from "fs";
import { basename, extname } from "path";
import { readReplayFileBookmarks } from "./replayFile";
import { splitsFromBookmarks, type SplitRow } from "../shared/splitBookmarks";

/**
 * The split comparison the right panel shows the current run against, read from a
 * file the user (or the queuer's `/load-split-file`) named.
 *
 * Two kinds of file (2026-09-23): a Super Shuckie `.replay`, whose `SPLIT` bookmarks
 * are that run's simple splits (`src/shared/splitBookmarks.ts`), and the legacy simple
 * split CSV, read as gen2-5 always read it -- `fs.readFileSync`, skip the header, column
 * 2 is the trainer and column 3 the time. The rows come out in the same shape either
 * way, so every generation's `previous_splits` code is untouched by which one it was.
 *
 * Throws with a reason the user can act on (a v3 replay, a recording never closed, a
 * missing file); the callers turn that into an error reply or a console line.
 */
export interface SplitComparison {
  /** The file as given. */
  file: string;
  /** Its base name, for the settings panel's "loaded: ..." line. */
  name: string;
  source: "replay" | "csv";
  rows: SplitRow[];
  /** For a replay: its format version and how many bookmarks it holds in all. */
  replay?: { version: number; bookmarks: number };
}

export function isReplayFile(file: string): boolean {
  return extname(file).toLowerCase() === ".replay";
}

export async function loadSplitComparison(file: string): Promise<SplitComparison> {
  if (!file) throw new Error("Missing file parameter");
  if (isReplayFile(file)) {
    const result = await readReplayFileBookmarks(file);
    if (!result.ok) throw new Error(`${basename(file)}: ${result.error}`);
    return {
      file,
      name: basename(file),
      source: "replay",
      rows: splitsFromBookmarks(result.table.bookmarks),
      replay: { version: result.version, bookmarks: result.table.bookmarks.length },
    };
  }
  const text = readFileSync(file, "utf-8");
  const rows = text
    .split("\n")
    .slice(1)
    .filter((row) => row !== "")
    .map((row) => {
      const columns = row.split(",");
      return { trainer: columns[2], time: columns[3] };
    });
  return { file, name: basename(file), source: "csv", rows };
}
