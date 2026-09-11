/**
 * Oracle 5, second half: every PokeAByte write a run made must be one the mapper
 * profile declares (plan 1.4: "the harness's write-log oracle checks each profile's
 * writes").
 *
 *   npx tsx tools/parity/profile-check.ts <run-dir>
 *
 * The run's `run.json` names the mapper (`mapperId`); the profile whose `pathPatterns`
 * match it is the one that has to cover the write log. A write to an undeclared path,
 * or of an undeclared kind, is a failure: it means a component reaches the mapper
 * behind the profile's back, which is exactly what the translation layer exists to
 * make impossible. `run.ts` calls this after collecting the log; it is also a
 * standalone command for re-checking an old run.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { allProfiles } from "../../src/renderer/games/profiles";
import type { MapperProfile, WriteKind } from "../../src/renderer/core/mapper/MapperProfile";
import type { WriteLogEntry } from "./mock-pokeabyte/server.ts";

const KIND_OF_ENDPOINT: Record<WriteLogEntry["endpoint"], WriteKind> = {
  "set-property-value": "value",
  "set-property-bytes": "bytes",
  "set-properties-by-bits": "bits",
  // A freeze re-sends the property's own bytes; the client's `freeze()` calls the bytes endpoint.
  "set-property-frozen": "bytes",
};

export interface ProfileCheckResult {
  profileId: string | null;
  writes: number;
  violations: string[];
}

export function profileFor(mapperId: string): MapperProfile | null {
  return allProfiles().find((p) => p.pathPatterns.some((re) => re.test(mapperId))) ?? null;
}

export function checkWriteLog(mapperId: string, log: WriteLogEntry[]): ProfileCheckResult {
  const profile = profileFor(mapperId);
  if (!profile) {
    return { profileId: null, writes: log.length, violations: [`no profile claims mapper "${mapperId}"`] };
  }
  const violations: string[] = [];
  for (const entry of log) {
    const kind = KIND_OF_ENDPOINT[entry.endpoint];
    for (const path of entry.paths) {
      const declared = profile.writes[path];
      if (!declared) {
        violations.push(`t=${entry.tMs} ${entry.endpoint} ${path}: not in ${profile.id}'s writes`);
      } else if (!declared.kinds.includes(kind)) {
        violations.push(
          `t=${entry.tMs} ${entry.endpoint} ${path}: ${profile.id} declares [${declared.kinds.join(", ")}], not "${kind}"`,
        );
      }
    }
  }
  return { profileId: profile.id, writes: log.length, violations };
}

export function checkRun(runDir: string): ProfileCheckResult {
  const run = JSON.parse(readFileSync(join(runDir, "run.json"), "utf-8")) as { mapperId: string };
  const writesPath = join(runDir, "writes.json");
  const log = existsSync(writesPath) ? (JSON.parse(readFileSync(writesPath, "utf-8")) as WriteLogEntry[]) : [];
  return checkWriteLog(run.mapperId, log);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: profile-check.ts <run-dir>");
    process.exit(2);
  }
  const result = checkRun(dir);
  console.log(`profile ${result.profileId ?? "(none)"}: ${result.writes} write(s), ${result.violations.length} violation(s)`);
  for (const v of result.violations) console.log("  - " + v);
  process.exit(result.violations.length ? 1 : 0);
}
