/**
 * Standalone mock: serves a fixture as if a real PokeAByte were running, so the
 * overlay can be driven by hand during development.
 *
 *   npx tsx tools/parity/mock-pokeabyte/cli.ts <fixture.jsonl.gz> [--speed=1] [--writes=apply|ignore] [--no-shuckie] [--no-obs]
 *
 * `--speed=0` loads the mapper and holds the first frame, which is all the smoke
 * test in the Phase 0 checklist needs.
 */
import { setTimeout as sleep } from "node:timers/promises";
import { MockPokeAByte } from "./server.ts";
import { ObsStub } from "./obs-stub.ts";
import { ShuckieStub } from "./shuckie-stub.ts";
import { ReplayDriver, prescanPaths } from "./replay.ts";

const args = process.argv.slice(2);
const fixture = args.find((a) => !a.startsWith("--"));
if (!fixture) {
  console.error("usage: cli.ts <fixture.jsonl.gz> [--speed=N] [--writes=apply|ignore] [--no-shuckie] [--no-obs]");
  process.exit(2);
}
const flag = (name: string, fallback: string) =>
  args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? fallback;
const speed = Number(flag("speed", "1"));
const writes = flag("writes", "apply") as "apply" | "ignore";
const log = (m: string) => console.log(m);

const mock = new MockPokeAByte({ writes, log });
const shuckie = args.includes("--no-shuckie") ? null : new ShuckieStub({ log });
const obs = args.includes("--no-obs") ? null : new ObsStub({ log });

// One shared ReplayState: whatever the driver applies is what /mapper serves.
const driver = new ReplayDriver(fixture, {
  state: mock.state,
  extraPaths: await prescanPaths(fixture),
});
await driver.loadHeader();

await mock.start();
await shuckie?.start();
await obs?.start();
console.log(
  `[cli] serving ${driver.header.meta.gameName} (${driver.header.meta.path}) -- ${driver.header.paths.length} properties`,
);
mock.loadMapper();

const stop = async () => {
  await Promise.all([mock.stop(), shuckie?.stop(), obs?.stop()]);
  console.log(`[cli] writes: ${mock.writeLog.length}, obs markers: ${obs?.markers.length ?? 0}`);
  process.exit(0);
};
process.on("SIGINT", stop);

if (speed <= 0) {
  console.log("[cli] --speed=0: holding the first frame. Ctrl-C to stop.");
  await new Promise(() => {});
}

const pingTimer = setInterval(() => mock.ping(), 15000);
let last = 0;
const startedAt = Date.now();
for await (const batch of driver.batches()) {
  const target = startedAt + batch.tMs / speed;
  const wait = target - Date.now();
  if (wait > 0) await sleep(wait);
  mock.clockMs = batch.tMs;
  if (shuckie) {
    shuckie.clockMs = batch.tMs;
    if (batch.frames.length) shuckie.frame = batch.frames[batch.frames.length - 1];
  }
  if (obs) obs.clockMs = batch.tMs;
  for (const kind of batch.lifecycle) {
    if (kind === "MapperLoaded") mock.loadMapper();
    else mock.unloadMapper();
  }
  mock.pushChanges(batch.changes);
  if (batch.tMs - last > 10000) {
    last = batch.tMs;
    console.log(`[cli] t=${(batch.tMs / 1000).toFixed(0)}s`);
  }
}
clearInterval(pingTimer);
console.log("[cli] replay finished; holding the final state. Ctrl-C to stop.");
await new Promise(() => {});
