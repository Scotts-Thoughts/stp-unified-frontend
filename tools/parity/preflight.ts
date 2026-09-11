/**
 * Checks that a parity run can start: the single-tenant ports are free, the Electron
 * binaries exist, and the unified app has been built.
 *
 *   npx tsx tools/parity/preflight.ts [target...]
 *
 * Prints what to close, rather than making the run fail halfway through.
 */
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { legacyElectron, parseTarget, REPO, unifiedElectron, type Generation } from "./targets.ts";

const PORTS: { port: number; host: string; what: string; neededBy: string }[] = [
  { port: 8085, host: "localhost", what: "PokeAByte", neededBy: "every target" },
  { port: 30158, host: "127.0.0.1", what: "Super Shuckie", neededBy: "gen1/gen5 (or pass --no-shuckie)" },
  { port: 4455, host: "127.0.0.1", what: "OBS WebSocket", neededBy: "chapter markers (or pass --no-obs)" },
  { port: 30159, host: "127.0.0.1", what: "an overlay control server", neededBy: "every target (or pass --redirect-ports, which moves it to 30259)" },
];

export async function portFree(port: number, host: string): Promise<boolean> {
  return await new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, host, () => server.close(() => resolve(true)));
  });
}

/** Best-effort: names the process holding a port so the operator knows what to close. */
function holder(port: number): string {
  try {
    const out = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | ` +
          `ForEach-Object { (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName + ' (pid ' + $_.OwningProcess + ')' } | Select-Object -First 1`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return out || "unknown process";
  } catch {
    return "unknown process";
  }
}

export interface PreflightResult {
  ok: boolean;
  problems: string[];
  notes: string[];
}

export async function preflight(targets: string[]): Promise<PreflightResult> {
  const problems: string[] = [];
  const notes: string[] = [];

  for (const p of PORTS) {
    if (await portFree(p.port, p.host)) {
      notes.push(`port ${p.port} free (${p.what})`);
    } else {
      problems.push(`port ${p.port} is held by ${holder(p.port)} -- close ${p.what}; needed by ${p.neededBy}`);
    }
  }

  const unified = unifiedElectron();
  if (existsSync(unified)) notes.push(`Electron 37 at ${unified}`);
  else problems.push(`Electron missing at ${unified} -- run npm ci`);

  for (const spec of targets) {
    let target;
    try {
      target = parseTarget(spec);
    } catch (err) {
      problems.push(String(err));
      continue;
    }
    if (!existsSync(target.executablePath)) {
      problems.push(`${spec}: Electron missing at ${target.executablePath} -- run npm ci in that repo`);
    }
    if (target.kind === "unified" && !existsSync(join(REPO, "out", "main", "index.js"))) {
      problems.push(`${spec}: out/main/index.js missing -- run npm run build (never the dev server, its origin changes localStorage scoping)`);
    }
  }
  return { ok: problems.length === 0, problems, notes };
}

export function legacyElectronVersion(gen: Generation): string | null {
  const pkg = join(legacyElectron(gen), "..", "..", "package.json");
  if (!existsSync(pkg)) return null;
  try {
    return JSON.parse(execFileSync("node", ["-p", `JSON.stringify(require(${JSON.stringify(pkg)}))`], { encoding: "utf8" })).version;
  } catch {
    return null;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const targets = process.argv.slice(2);
  const result = await preflight(targets);
  for (const n of result.notes) console.log(`  ok   ${n}`);
  for (const p of result.problems) console.log(`BLOCK  ${p}`);
  console.log(result.ok ? "\npreflight: ready" : `\npreflight: ${result.problems.length} blocker(s)`);
  process.exit(result.ok ? 0 : 1);
}
