/**
 * Turns slices of a replay's memory log (memlog.cjs output) into a make-fixture scenario, so the real app can be run
 * over what the game really had in memory (tools/parity/run.ts). Each window's changes become steps on the replay's
 * own clock, shifted so the windows sit back to back; the jump between windows is one step that sets every value
 * that changed in the gap. Paths the mapper lacks are dropped.
 *
 *   npx tsx tools/markers/mem-to-scenario.ts --mem <log.csv> --mapper <mapper.xml> --mapper-id ST/gen4/x.xml
 *       --windows 30000-60000,2690000-2710000 --name h-yanmega-dnf [--paths <regex>] --out <scenario.json>
 *       [--initial <snapshot.json>]   memlog.cjs --snapshot: every property's value where the log begins, for a
 *                                     replay that starts mid-game (most values never change, so no log line has them)
 */
import fs from "node:fs";
import { parseMapperXml } from "../parity/lib/mapper-xml.ts";

const args: Record<string, string> = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].slice(2)] = process.argv[i + 1];
const mapper = parseMapperXml(args.mapper, args["mapper-id"]);
const known = new Set(mapper.properties.map((p) => p.path));
const want = new RegExp(args.paths ?? ".");
const windows = args.windows.split(",").map((w) => w.split("-").map(Number) as [number, number]);

const state = new Map<string, unknown>();
if (args.initial) {
	const snapshot = JSON.parse(fs.readFileSync(args.initial, "utf8")) as { values: Record<string, unknown> };
	for (const [path, value] of Object.entries(snapshot.values)) if (known.has(path) && want.test(path)) state.set(path, value);
}
const initial: Record<string, unknown> = {};
const steps: { tMs: number; frame: number; comment?: string; set: Record<string, unknown> }[] = [];
let w = 0, offset = 0, entered = -1, gap: Record<string, unknown> = {};
const GAP_MS = 2000;
const push = (tMs: number, frame: number, path: string, value: unknown) => {
	const last = steps[steps.length - 1];
	if (last && last.tMs === tMs) last.set[path] = value;
	else steps.push({ tMs, frame, set: { [path]: value } });
};
for (const line of fs.readFileSync(args.mem, "utf8").split("\n")) {
	const a = line.indexOf(","), b = line.indexOf(",", a + 1);
	if (a < 0 || b < 0) continue;
	const path = line.slice(a + 1, b);
	if (!known.has(path) || !want.test(path)) continue;
	const key = line.slice(0, a), at = key.indexOf("@");
	const frame = +key.slice(0, at), ms = +key.slice(at + 1);
	const value = JSON.parse(line.slice(b + 1));
	while (w < windows.length && ms > windows[w][1]) w++;
	if (w >= windows.length) break;
	if (ms < windows[w][0]) {
		if (entered < 0) state.set(path, value);
		else gap[path] = value;
		continue;
	}
	if (entered !== w) {
		if (entered < 0) {
			for (const [p, v] of state) initial[p] = v;
			offset = windows[w][0];
		} else {
			// Entering a later window: one step with everything that changed while skipped.
			const prevEnd = steps.length ? steps[steps.length - 1].tMs : 0;
			steps.push({ tMs: prevEnd + GAP_MS, frame, comment: `jump to replay ${windows[w][0]} ms`, set: gap });
			offset = windows[w][0] - (prevEnd + 2 * GAP_MS);
			gap = {};
		}
		entered = w;
	}
	push(ms - offset, frame, path, value);
}
const scenario = { replayName: args.name, framesPerSecond: 240, initial, steps };
fs.writeFileSync(args.out, JSON.stringify(scenario, null, 1));
console.log(`${steps.length} steps, ${Object.keys(initial).length} initial values, last at ${steps[steps.length - 1]?.tMs} ms -> ${args.out}`);
