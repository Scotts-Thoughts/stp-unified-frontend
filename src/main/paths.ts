import { app } from "electron";
import { dirname, isAbsolute, join, resolve } from "path";

/**
 * Where `./splits` and `./storage` live.
 *
 * Every legacy overlay resolves those two directories against `process.cwd()`, which
 * happens to be the repo when the queuer launches `npm run dev` from the app folder,
 * and happens to be wherever the user double-clicked when the app is packaged. Plan 1.7
 * replaces the accident with an explicit root that keeps the same layout in both cases:
 *
 *   dev       the repo (the folder holding package.json)      -> ./splits, ./storage as today
 *   packaged  the folder the executable sits in               -> next to the .exe
 *
 * `STP_APP_ROOT` overrides both, which is how the parity harness points a run at its
 * sandbox without depending on the working directory it was launched with.
 */
export function appRoot(): string {
  const override = process.env.STP_APP_ROOT;
  if (override) return resolve(override);
  if (app.isPackaged) return dirname(app.getPath("exe"));
  return app.getAppPath();
}

/** `<appRoot>/splits`, the root of every split CSV the autosplitter writes. */
export function splitsRoot(): string {
  return join(appRoot(), "splits");
}

/** `<appRoot>/storage`, the shipped defaults (`extraFiles` in a packaged build: next to the exe, like `resources/`). */
export function storageRoot(): string {
  return join(appRoot(), "storage");
}

/**
 * `<appRoot>/src/renderer`, the renderer's own source tree.
 *
 * Dev mode only. Two gen1 features edit shipped data by rewriting the file they were
 * loaded from, so the edit lands in git: the enemy-sprite resize tool
 * (`data/enemy_sprite_scales.json`) and, from Phase 2.2, the per-species style defaults.
 * The legacy code did it with `require("fs")` and `process.cwd()`; the root is explicit
 * now and a packaged build refuses the write (plan 1.6).
 */
export function rendererSourceRoot(): string {
  return join(appRoot(), "src", "renderer");
}

/** `%APPDATA%/<app name>/data`, the user-state tree (plan section 2 persistence rule). */
export function userDataRoot(): string {
  return join(app.getPath("userData"), "data");
}

/**
 * Resolves a caller-supplied relative path inside `root` and refuses anything that
 * escapes it. Every path the renderer sends over IPC crosses this. The one exception
 * is the control server's `/load-split-file`, whose `file` is an absolute path to a
 * CSV the queuer's user dragged in from anywhere on disk (legacy: `fs.readFileSync`
 * on it, verbatim); `src/main/control-server.ts` reads it as it is.
 */
export function resolveInside(root: string, relative: string): string {
  const target = isAbsolute(relative) ? resolve(relative) : resolve(root, relative);
  const rootResolved = resolve(root);
  if (target !== rootResolved && !target.startsWith(rootResolved + "\\") && !target.startsWith(rootResolved + "/")) {
    throw new Error(`Path escapes ${rootResolved}: ${relative}`);
  }
  return target;
}
