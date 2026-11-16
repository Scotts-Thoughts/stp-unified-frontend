/**
 * Runs a generation's real chapter-marker wiring (games/genN/chapterMarkers.ts) over a replay's memory log
 * (memlog.cjs output) and prints the markers it writes: `frame,replayMs,marker`.
 *
 *   npx tsx --tsconfig tsconfig.web.json tools/markers/run-wiring.ts --gen gen4 --game Platinum --mem <log.csv>
 *       [--bookmarks <bookmarks.csv>]   frame -> replay ms from the replay's bookmarks, for logs without @ms
 *       [--ms-per-frame 4.1667]         otherwise (a 4x run: 240 game frames per real second)
 *       [--module <file.ts>]            run another wiring function (its first exported function) instead
 *
 * The property tree is built from every path in the log: nodes with `.value` and `.change(fn)`, updated one
 * change at a time in log order with the callbacks called as each lands, as gameHookMapperClient does. Timers
 * run on the replay's clock. See README.md beside this file.
 */
import fs from "node:fs";

const args: Record<string, string> = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].slice(2)] = process.argv[i + 1];

interface Node { value: any; change(fn: Function): void; [k: string]: any }
const listeners = new Map<string, Function[]>();
const root: any = {};
const nodeAt = (path: string): Node => {
	let n = root;
	for (const k of path.split(".")) {
		if (!Object.prototype.hasOwnProperty.call(n, k)) {
			const child: any = {};
			Object.defineProperty(child, "value", { enumerable: false, writable: true, value: undefined });
			Object.defineProperty(child, "change", { enumerable: false, value: (fn: Function) => { const l = listeners.get(child.__path) ?? []; l.push(fn); listeners.set(child.__path, l); } });
			Object.defineProperty(child, "__path", { enumerable: false, writable: true, value: "" });
			n[k] = child;
		}
		n = n[k];
	}
	n.__path = path;
	return n;
};

// frame -> ms
let msOf = (frame: number) => frame * +(args["ms-per-frame"] ?? 1000 / 240);
if (args.bookmarks) {
	const pts = fs.readFileSync(args.bookmarks, "utf8").trim().split(/\r?\n/).map((l) => l.split(",").slice(0, 2).map(Number)).filter((p) => p[0] > 0).sort((a, b) => a[0] - b[0]);
	msOf = (f) => {
		let lo = 0, hi = pts.length - 1;
		if (f <= pts[0][0]) return pts[0][1] - (pts[0][0] - f) * 1000 / 240;
		if (f >= pts[hi][0]) return pts[hi][1] + (f - pts[hi][0]) * 1000 / 240;
		while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m][0] <= f) lo = m; else hi = m; }
		const [f0, m0] = pts[lo], [f1, m1] = pts[hi];
		return m0 + (m1 - m0) * (f - f0) / (f1 - f0);
	};
}

const events: [number, number, string, any][] = [];
for (const line of fs.readFileSync(args.mem, "utf8").split("\n")) {
	const a = line.indexOf(","), b = line.indexOf(",", a + 1);
	if (a < 0 || b < 0) continue;
	const key = line.slice(0, a), at = key.indexOf("@");
	const frame = +(at < 0 ? key : key.slice(0, at));
	const ms = at < 0 ? msOf(frame) : +key.slice(at + 1);
	events.push([frame, ms, line.slice(a + 1, b), JSON.parse(line.slice(b + 1))]);
}

// virtual clock
let nowMs = 0, nowFrame = 0, seq = 0;
const timers: { due: number; seq: number; fn: () => void; dead?: boolean }[] = [];
const clock = {
	now: () => nowMs,
	setTimeout: (fn: () => void, ms: number) => { const t = { due: nowMs + ms, seq: seq++, fn }; timers.push(t); return t; },
	clearTimeout: (t: any) => { if (t) t.dead = true; },
};
let lastFrame = 0, lastMs = 0, rate = 240 / 1000; // frames per ms between the last change and the next
const runTimers = (upTo: number) => {
	for (;;) {
		let best: any = null;
		for (const t of timers) if (!t.dead && t.due <= upTo && (!best || t.due < best.due || (t.due === best.due && t.seq < best.seq))) best = t;
		if (!best) break;
		best.dead = true;
		const keepMs = nowMs, keepFrame = nowFrame;
		nowMs = Math.max(nowMs, best.due);
		nowFrame = lastFrame + Math.round((nowMs - lastMs) * rate);
		best.fn();
		nowMs = Math.max(keepMs, nowMs); nowFrame = keepFrame;
		for (let i = timers.length - 1; i >= 0; i--) if (timers[i].dead) timers.splice(i, 1);
	}
};

const out: string[] = [];
const send = (marker: string) => out.push(`${nowFrame},${Math.round(nowMs)},${marker}`);

(async () => {
	// The first frame's values are the tree's starting state (the overlay mounts on a loaded mapper).
	const first = events.length ? events[0][0] : 0;
	for (const [, , path] of events) nodeAt(path);
	let i = 0;
	for (; i < events.length && events[i][0] === first; i++) nodeAt(events[i][2]).value = events[i][3];
	nowFrame = first; nowMs = events.length ? events[0][1] : 0;
	const origLog = console.log; console.log = () => {};
	const { pathToFileURL } = await import("node:url");
	const mod = await import(args.module ? pathToFileURL(args.module).href : `../../src/renderer/games/${args.gen}/chapterMarkers.ts`);
	const wire = Object.values(mod).find((v) => typeof v === "function") as Function;
	wire({ props: root, selectedGame: args.game, send, clock });
	for (; i < events.length; i++) {
		const [frame, ms, path, value] = events[i];
		if (ms > lastMs) rate = (frame - lastFrame) / (ms - lastMs);
		runTimers(ms);
		nowFrame = frame; nowMs = Math.max(nowMs, ms);
		lastFrame = frame; lastMs = nowMs;
		const n = nodeAt(path);
		const oldValue = n.value;
		if (oldValue === value) continue;
		n.value = value;
		for (const fn of listeners.get(path) ?? []) fn({ value }, { value: oldValue });
	}
	runTimers(Infinity);
	console.log = origLog;
	process.stdout.write(out.join("\n") + "\n");
})();
