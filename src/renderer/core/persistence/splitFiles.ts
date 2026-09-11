/**
 * Split-file writes, over IPC instead of `require("fs")` in the renderer (plan 1.6).
 *
 * Paths are relative to `<appRoot>/splits` (plan 1.7), which is where every legacy app
 * writes today -- `./splits/...` resolved against the working directory. Nothing about
 * the layout, the file names or the bytes changes; only who calls `fs`.
 *
 * **Ordering.** The legacy code is already asynchronous (`fs.mkdir`/`writeFile`/
 * `appendFile`/`copyFile` with callbacks) and therefore already racy, but it races
 * inside one process. Over IPC the window is wider, and `logCopy` copies files that
 * `logData` may still be writing. Everything here is therefore funnelled through one
 * promise chain, so operations complete in the order they were issued -- strictly safer
 * than the legacy behaviour, and the split-CSV oracle compares the finished bytes.
 */

/** Serialises every operation; each call appends to the chain and returns its own end. */
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation, operation);
  // A failure must not poison later writes, so the chain continues either way.
  queue = result.catch(() => undefined);
  return result;
}

/** Joins path segments with "/" -- the IPC layer resolves them against the splits root. */
export function splitPath(...segments: (string | number)[]): string {
  return segments
    .map((segment) => String(segment).replace(/^[\\/]+|[\\/]+$/g, ""))
    .filter((segment) => segment !== "" && segment !== ".")
    .join("/");
}

/**
 * Appends `body` to a split CSV, writing `header` first when the file is new.
 *
 * Same sequence as the legacy `logData`: mkdir -p, then either write-header-then-append
 * or append.
 */
export async function appendSplitCsv(relative: string, header: string, body: string): Promise<void> {
  await enqueue(async () => {
    try {
      const exists = await window.api.splits.exists(relative);
      if (!exists) await window.api.splits.write(relative, header, false);
      await window.api.splits.write(relative, body, true);
    } catch (err) {
      console.error(err);
    }
  });
}

/** Copies an attempt file into the finishes folder; missing sources are logged, as today. */
export async function copySplitFile(from: string, to: string): Promise<void> {
  await enqueue(async () => {
    try {
      await window.api.splits.copy(from, to);
    } catch (err) {
      console.error(err);
    }
  });
}

/** Reads a split CSV back, for the split-comparison panel. */
export function readSplitCsv(relative: string): Promise<string | null> {
  return enqueue(() => window.api.splits.read(relative).catch(() => null));
}

/**
 * The entries of a folder under the splits root, files and folders alike, by name --
 * gen3's `logCopy` numbers a finished run by listing `finishes/` (`fs.readdirSync`).
 * A missing folder lists as empty, which is what its `existsSync` guard made it.
 * Queued like the writes, so a copy issued earlier is on disk before it is counted.
 */
export function listSplitFolder(relative: string): Promise<string[]> {
  return enqueue(async () => (await window.api.splits.list(relative)).map((entry: { name: string }) => entry.name));
}

/** Creates a folder under the splits root (gen5 makes three at load, known-legacy-bugs.md #17). */
export function ensureSplitFolder(relative: string): Promise<unknown> {
  return enqueue(() => window.api.splits.mkdir(relative));
}

/** Creates the folder and opens it in Explorer (the "open splits folder" button). */
export function revealSplitFolder(relative: string): Promise<string> {
  return enqueue(() => window.api.splits.reveal(relative));
}

/** Waits for every queued operation to finish. Used by tests and by shutdown paths. */
export function flushSplitFiles(): Promise<unknown> {
  return queue;
}
