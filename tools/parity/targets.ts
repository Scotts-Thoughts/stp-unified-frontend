/**
 * Which app a parity run drives, and the sandbox it runs in.
 *
 * Legacy apps rewrite files inside their own source tree while running in dev mode
 * (known-legacy-bugs.md #25), so they are always launched from a copy under
 * tools/sandbox/, never from A:\Programs\genN-stp-frontend. The copy is made with
 * junctions for node_modules and the image trees, so it costs seconds, not gigabytes.
 */
import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

export const REPO = resolve(import.meta.dirname, "..", "..");
export const SANDBOX_ROOT = join(REPO, "tools", "sandbox");

export type Generation = "gen1" | "gen2" | "gen3" | "gen4" | "gen5";

export interface Target {
  /** "legacy:gen2@25", "legacy:gen2@37", "unified" */
  id: string;
  kind: "legacy" | "unified";
  generation: Generation;
  /** Electron binary: the legacy repo's own (25.x) or this repo's (37.x). */
  executablePath: string;
  /** Argument passed to Electron: an app directory (legacy) or a main script (unified). */
  appArg: string;
  /** Working directory -- ./splits and ./storage are cwd-relative in every app. */
  cwd: string;
  /** APPDATA for the run. Belt and braces: anything that reads %APPDATA% directly
   *  lands in the sandbox, but Electron does NOT derive userData from it. */
  appData: string;
  /**
   * Chromium --user-data-dir, which IS what decides where userData, localStorage and
   * the Electron profile go. Without it, `electron.exe <script>` falls back to the
   * shared %APPDATA%\Electron profile and consecutive runs see each other's state --
   * which is exactly how two identical runs came out with different split tables.
   */
  userDataDir: string;
  /** package.json "name" = the %APPDATA% folder the app writes to. */
  appName: string;
  /**
   * The overlay's own control server port. 30159 is the queuer's, and the only one it
   * talks to; the harness moves it when another overlay already owns 30159, which the
   * unified app honours through STP_CONTROL_PORT. Legacy apps hardcode it and cannot.
   */
  controlPort: number;
  electronMajor: number;
}

const LEGACY_DIRS: Record<Generation, string> = {
  gen1: "A:\\Programs\\gen1-stp-frontend",
  gen2: "A:\\Programs\\gen2-stp-frontend",
  gen3: "A:\\Programs\\gen3-stp-frontend",
  gen4: "A:\\Programs\\gen4-stp-frontend",
  gen5: "A:\\Programs\\gen5-stp-frontend",
};

const LEGACY_APP_NAMES: Record<Generation, string> = {
  gen1: "stp-generation1-overlay",
  gen2: "stp-generation2-overlay",
  gen3: "stp-generation3-overlay",
  gen4: "gen4-overlay-app",
  gen5: "gen5-overlay-app",
};

export function unifiedElectron(): string {
  return join(REPO, "node_modules", "electron", "dist", "electron.exe");
}

export function legacyElectron(gen: Generation): string {
  return join(LEGACY_DIRS[gen], "node_modules", "electron", "dist", "electron.exe");
}

/** "legacy:gen2@25" | "legacy:gen2@37" | "unified" */
export function parseTarget(spec: string): Target {
  if (spec === "unified") {
    const sandbox = join(SANDBOX_ROOT, "unified");
    return {
      id: spec,
      kind: "unified",
      generation: "gen1",
      executablePath: unifiedElectron(),
      // The repo root, not out/main/index.js: Electron then reads package.json, so the
      // app name, `main` and `app.isPackaged` are what a real launch sees.
      appArg: REPO,
      cwd: sandbox,
      appData: join(sandbox, "AppData"),
      userDataDir: join(sandbox, "userData"),
      appName: "stp-overlay",
      controlPort: 30159,
      electronMajor: 37,
    };
  }
  const m = /^legacy:(gen[1-5])@(25|37)$/.exec(spec);
  if (!m) throw new Error(`Unknown target "${spec}" (expected "unified" or "legacy:genN@25|37")`);
  const gen = m[1] as Generation;
  const major = Number(m[2]);
  const sandbox = join(SANDBOX_ROOT, `${gen}@${major}`);
  return {
    id: spec,
    kind: "legacy",
    generation: gen,
    executablePath: major === 25 ? legacyElectron(gen) : unifiedElectron(),
    appArg: join(sandbox, "app-tree"),
    cwd: sandbox,
    appData: join(sandbox, "AppData"),
    userDataDir: join(sandbox, "userData"),
    appName: LEGACY_APP_NAMES[gen],
    controlPort: 30159,
    electronMajor: major,
  };
}

export interface SandboxOptions {
  /** Wipe splits/, AppData/ and the collected outputs before the run. */
  clean?: boolean;
  log?: (msg: string) => void;
}

/**
 * Builds (or refreshes) the sandbox for a target and returns its path.
 *
 * The legacy tree is copied file-by-file except for node_modules and the image
 * directories, which are junctioned: the app only reads them, and copying 500 MB-1 GB
 * per run would dominate the run time.
 */
export function prepareSandbox(target: Target, opts: SandboxOptions = {}): string {
  const log = opts.log ?? (() => {});
  mkdirSync(target.cwd, { recursive: true });

  if (opts.clean) {
    // `storage/` goes too: gen1 writes per-species metrics into it (it is cwd-relative,
    // plan 1.7), so leaving it would carry state from the previous run into this one.
    for (const dir of ["splits", "AppData", "userData", "collected", "storage"]) {
      rmSync(join(target.cwd, dir), { recursive: true, force: true });
    }
  }
  for (const dir of ["splits", "AppData", "userData", "collected"]) {
    mkdirSync(join(target.cwd, dir), { recursive: true });
  }

  // Every app spawns keyhook.exe from its cwd; without it hotkeys are silently off
  // (known-legacy-bugs.md #23), which is a behaviour difference the oracles would see.
  const keyhook = join(REPO, "resources", "keyhook.exe");
  if (existsSync(keyhook) && !existsSync(join(target.cwd, "keyhook.exe"))) {
    cpSync(keyhook, join(target.cwd, "keyhook.exe"));
  }

  // ./storage holds shipped defaults; gen1 reads Storage.json from it.
  const storage = target.kind === "unified" ? join(REPO, "storage") : join(LEGACY_DIRS[target.generation], "storage");
  if (existsSync(storage) && !existsSync(join(target.cwd, "storage"))) {
    cpSync(storage, join(target.cwd, "storage"), { recursive: true });
  }

  if (target.kind === "legacy") {
    const appTree = join(target.cwd, "app-tree");
    if (!existsSync(appTree)) {
      log(`[sandbox] copying ${LEGACY_DIRS[target.generation]} -> ${appTree}`);
      copyLegacyTree(LEGACY_DIRS[target.generation], appTree, log);
    }
  }
  return target.cwd;
}

const JUNCTION_DIRS = ["node_modules", "images", "app/images", "src/renderer/public/images"];

function copyLegacyTree(from: string, to: string, log: (m: string) => void): void {
  mkdirSync(to, { recursive: true });
  const excludes = ["node_modules", ".git", "out", "dist", "splits"];
  const junctions = JUNCTION_DIRS.filter((d) => existsSync(join(from, d)));

  // robocopy is an order of magnitude faster than a JS walk on these trees; exit codes
  // 0-7 are success (8+ is a real failure).
  const args = [from, to, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/NP", "/MT:16", "/XD", ...excludes.map((d) => join(from, d)), ...junctions.map((d) => join(from, d))];
  try {
    execFileSync("robocopy", args, { stdio: "ignore" });
  } catch (err) {
    const code = (err as { status?: number }).status ?? 0;
    if (code >= 8) throw new Error(`robocopy failed with ${code} copying ${from}`);
  }

  for (const dir of junctions) {
    const linkPath = join(to, dir);
    mkdirSync(join(linkPath, ".."), { recursive: true });
    if (!existsSync(linkPath)) {
      try {
        symlinkSync(join(from, dir), linkPath, "junction");
      } catch {
        log(`[sandbox] junction failed for ${dir}; falling back to a copy`);
        cpSync(join(from, dir), linkPath, { recursive: true });
      }
    }
  }
  writeFileSync(
    join(to, "SANDBOX.txt"),
    `Copy of ${from} made by tools/parity/targets.ts.\n` +
      `Never edit: it is regenerated, and the original tree is a read-only input.\n` +
      `Junctioned (not copied): ${junctions.join(", ") || "none"}\n`,
  );
}

export { LEGACY_DIRS, LEGACY_APP_NAMES };
