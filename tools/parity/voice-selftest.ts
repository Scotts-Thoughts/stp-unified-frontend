/**
 * Voice control's self-test (ARCHITECTURE §2 "voice"). Run `npm run build` first: it drives the
 * built worker, the same file the app runs.
 *
 *   npm run parity:voice
 *
 * 1. Every voice command (core/voice/commands.ts) finds a shortcut action in every generation,
 *    and what the model really wrote (HEARD_EXAMPLES) is read as the right command, or as nothing.
 * 2. The clips in tools/fixtures/voice/ are played through the speech model on one stream,
 *    100 ms at a time as the microphone sends them, with 1.5 s of faint noise after each, twice
 *    (the second time in reverse order, so each clip follows different ones). Then:
 *      - the chatter clips are heard as nothing (no false alarms: "show me the money",
 *        "hey Robert, a rotten tomato");
 *      - no clip is heard as a command other than its own;
 *      - "Hey Rotom" and then the clip's command are both heard in at least MIN_RATE of plays.
 *    `<voice>-seq_<command>.wav` is "Hey Row-tom." (it is said "ROH-tom"; the voices guess
 *    "Rotom" wrong), a 0.7 s pause, then the command; zira-wake_ivs is both in one breath.
 *
 * 3. scott-takes.wav, a real voice (see SCOTT_TAKES), is played through the same way.
 *
 * Step 2's clips are Windows' text-to-speech voices (David, Zira), not a real person: a pass
 * means nothing got worse, not that a real voice is heard well. Step 3 is one real voice, so
 * nor does it show that other people are heard well. The worker's dither is seeded, so a run
 * gives the same result every time. Also prints the CPU the model used.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { Worker } from "node:worker_threads";
import { createPinia, setActivePinia } from "pinia";
import { VOICE_COMMANDS } from "../../src/renderer/core/voice/commands.ts";
import { findVoiceKeywords, normalizeHeard } from "../../src/shared/voiceCommands.ts";

let failures = 0;
const fail = (msg: string) => {
    failures++;
    console.log(`FAIL ${msg}`);
};

// ---- 1. commands -> actions --------------------------------------------------------------

function standIn(): any {
    const fn = function () {
        return standIn();
    };
    return new Proxy(fn, {
        get: (_t, key) => {
            if (key === Symbol.toPrimitive) return () => "";
            if (key === Symbol.iterator) return function* () {};
            if (key === "length") return 0;
            if (key === "then") return undefined;
            return standIn();
        },
        apply: () => standIn(),
    });
}

setActivePinia(createPinia());
const vm = standIn();
const lists: Record<string, { id: string }[]> = {
    gen1: (await import("../../src/renderer/games/gen1/actions.ts")).gen1Actions?.() ?? [],
    gen2: (await import("../../src/renderer/games/gen2/actions.ts")).gen2Actions(vm),
    gen3: (await import("../../src/renderer/games/gen3/actions.ts")).gen3Actions(vm),
    gen4: (await import("../../src/renderer/games/gen4/actions.ts")).gen4Actions(vm),
    gen5: (await import("../../src/renderer/games/gen5/actions.ts")).gen5Actions(vm),
};
for (const [gen, actions] of Object.entries(lists)) {
    const ids = new Set(actions.map((a) => a.id));
    for (const command of VOICE_COMMANDS) {
        const found = command.actions.find((id) => ids.has(id));
        if (!found) fail(`${gen}: "${command.keyword}" finds none of ${command.actions.join(", ")}`);
    }
}
console.log(`commands: ${VOICE_COMMANDS.length} commands checked in ${Object.keys(lists).length} generations`);

/** What the model really wrote, and what that should count as. Add to this when a phrase changes. */
const HEARD_EXAMPLES: [string, string][] = [
    // Scott, 2026-11-05.
    ["HE WROTE HIM SHOW IVIES", "wake,ivs"],
    ["HE RHODOM SHOW IVIZ", "wake,ivs"],
    ["HE RHODOM SHOW I VIS", "wake,ivs"],
    ["HE RHOD EM SHOW IVISE", "wake,ivs"],
    ["HEYRODOM SHOW IVIES", "wake,ivs"],
    ["HE RODE HIM SHOW EVIZ", "wake,evs"],
    ["HE WROTE HIM SHOWY VIZ", "wake,evs"],
    ["HEYRODHAM SHOW YEVIZ", "wake,evs"],
    ["HEY RHODHAM SHOWY V'S", "wake,evs"],
    ["HE RODOM SHOY VHES", "wake,evs"],
    ["HEY RHODEM SHOWY VIVIZ", "wake,evs"],
    ["HAYRODOM SHOWY VIVISE", "wake,evs"],
    ["HEYRODOM SHOW YEVHE'S", "wake,evs"],
    ["HE RHODEM SHOW SPLITZ", "wake,splits"],
    ["HE WROTE A RESET RIGHT PANEL", "wake,automatic_right_panel"],
    ["HEYRODOM SHOW BAY STATS", "wake,base_stats"],
    ["HE ROTUM SHOI VIZ", "wake,ivs"],
    ["HE WROTE HIM SHY VS", "wake,evs"],
    ["IRODOM SHOWY VIZ", "wake,evs"],
    // Heard for both IVs and EVs: nothing, rather than a guess.
    ["HE RHODOM SHOEVIZ", "wake"],
    ["HE RHODOM SHROIVIZ", "wake"],
    // Text-to-speech clips.
    ["HEY ROTAM", "wake"],
    ["HE ROM", "wake"],
    ["HEY RHOM", "wake"],
    ["HARO TOM", "wake"],
    ["HAY WROTE TOM", "wake"],
    ["SHOW E EVIZ", "evs"],
    ["SHOW YE EVIES", "evs"],
    ["SHOW E V S", "evs"],
    ["SHOW IVYS", "ivs"],
    ["SHOW AVIZ", "ivs"],
    ["SHOW REGULAR STATS", "regular_stats"],
    ["RESET WRITE PANEL", "automatic_right_panel"],
    // Everyday speech: not commands.
    ["HEY ROBERT A ROTTEN TOMATO", ""],
    ["SHOW ME THE MONEY", ""],
    ["SHOW I", ""],
    ["SHOW VIDEOS", ""],
    ["SHOW A VIDEO", ""],
    ["SHOW DEVICES", ""],
    ["SHOW EVERYTHING", ""],
    ["RESET THE GAME", ""],
];
for (const [text, want] of HEARD_EXAMPLES) {
    const got = findVoiceKeywords(normalizeHeard(text)).keywords.join(",");
    if (got !== want) fail(`"${text}": read as [${got}], should be [${want}]`);
}
console.log(`matching: ${HEARD_EXAMPLES.length} examples checked`);

// ---- 2. clips through the built worker ---------------------------------------------------

/** 2026-10-31: this run 97%; 88% with shuffled order and random noise. Lower only with a reason. */
const MIN_RATE = 0.85;

/** Each clip's command, from its name; null for chatter. */
const COMMAND_OF: Record<string, string> = {
    ivs: "ivs", dvs: "ivs", evs: "evs", regular: "regular_stats", base: "base_stats", auto: "automatic_right_panel", splits: "splits",
};
function commandOf(name: string): string | null {
    if (name.endsWith("-chatter")) return null;
    if (name === "zira-wake_ivs") return "ivs";
    const command = COMMAND_OF[name.replace(/^.*-seq_/, "")];
    if (!command) throw new Error(`tools/fixtures/voice/${name}.wav: no command for that name (see COMMAND_OF)`);
    return command;
}

/** A 16-bit PCM mono WAV as floats. */
function readWav(path: string): { samples: Float32Array; sampleRate: number } {
    const buf = readFileSync(path);
    let offset = 12;
    let sampleRate = 0;
    while (offset + 8 <= buf.length) {
        const id = buf.toString("ascii", offset, offset + 4);
        const size = buf.readUInt32LE(offset + 4);
        if (id === "fmt ") {
            if (buf.readUInt16LE(offset + 8) !== 1 || buf.readUInt16LE(offset + 10) !== 1 || buf.readUInt16LE(offset + 22) !== 16) {
                throw new Error(`${path}: not 16-bit PCM mono`);
            }
            sampleRate = buf.readUInt32LE(offset + 12);
        } else if (id === "data") {
            const samples = new Float32Array(size / 2);
            for (let i = 0; i < samples.length; i++) samples[i] = buf.readInt16LE(offset + 8 + i * 2) / 32768;
            return { samples, sampleRate };
        }
        offset += 8 + size + (size & 1);
    }
    throw new Error(`${path}: no data chunk`);
}

const root = resolve(import.meta.dirname, "../..");
const workerFile = readdirSync(join(root, "out/main")).find((f) => /^worker-.*\.js$/.test(f));
if (!workerFile) {
    console.log("FAIL no out/main/worker-*.js: run `npm run build` first");
    process.exit(1);
}

const worker = new Worker(join(root, "out/main", workerFile), {
    workerData: { modelDir: join(root, "resources/voice/asr-zipformer-en-20M") },
});
let heard: string[] = [];
let pong: ((n: number) => void) | null = null;
const ready = new Promise<void>((resolveReady, reject) => {
    worker.on("message", (m: { type: string; keyword?: string; message?: string; ping?: number }) => {
        if (m.type === "ready") resolveReady();
        else if (m.type === "heard") heard.push(m.keyword!);
        else if (m.type === "pong") pong?.(m.ping!);
        else if (m.type === "error") reject(new Error(m.message));
    });
    worker.on("error", reject);
});
const t0 = Date.now();
await ready;
console.log(`model loaded in ${Date.now() - t0} ms`);

let ping = 0;
const drained = () => new Promise<void>((done) => {
    const n = ++ping;
    pong = (got) => got === n && done();
    worker.postMessage({ ping: n });
});

const dir = join(root, "tools/fixtures/voice");
const names = readdirSync(dir).filter((f) => f.endsWith(".wav")).map((f) => f.slice(0, -4)).filter((n) => n !== "scott-takes").sort();
/** Faint noise (about -55 dB) after each clip, from a fixed seed: a quiet room, not digital silence. */
let noiseSeed = 1;
const noise = () => {
    noiseSeed = (noiseSeed * 1103515245 + 12345) >>> 0;
    return (noiseSeed / 4294967296 - 0.5) * 0.004;
};

let audioSeconds = 0;
let plays = 0;
let both = 0;
const cpuStart = worker.performance?.eventLoopUtilization?.();
const wallStart = performance.now();

/** Plays a clip as the microphone would; `heard` then holds what came of it. */
async function play(name: string): Promise<void> {
    const { samples, sampleRate } = readWav(join(dir, `${name}.wav`));
    heard = [];
    const chunk = Math.round(sampleRate / 10);
    const padded = new Float32Array(samples.length + Math.round(sampleRate * 1.5));
    padded.set(samples);
    for (let i = samples.length; i < padded.length; i++) padded[i] = noise();
    for (let i = 0; i < padded.length; i += chunk) worker.postMessage({ samples: padded.slice(i, i + chunk), sampleRate });
    await drained();
    audioSeconds += padded.length / sampleRate;
}

for (const order of [names, [...names].reverse()]) {
    for (const name of order) {
        const command = commandOf(name);
        await play(name);

        const got = `[${heard.join(", ")}]`;
        if (command === null) {
            if (heard.length > 0) fail(`${name}: chatter heard as ${got}`);
            else console.log(`ok   ${name.padEnd(22)} ${got}`);
            continue;
        }
        plays++;
        const wrong = heard.filter((k) => k !== "wake" && k !== command);
        if (wrong.length > 0) fail(`${name}: heard ${got}, a command other than ${command}`);
        const hit = heard.join(",") === `wake,${command}`;
        if (hit) both++;
        console.log(`${hit ? "ok  " : "miss"} ${name.padEnd(22)} ${got}`);
    }
}
const rate = both / plays;
const rateLine = `"Hey Rotom" + command heard in ${both}/${plays} plays (${(rate * 100).toFixed(0)}%, need ${(MIN_RATE * 100).toFixed(0)}%)`;
if (rate < MIN_RATE) fail(rateLine);
else console.log(rateLine);

// ---- 3. a real voice ---------------------------------------------------------------------

/**
 * scott-takes.wav: Scott, 2026-11-05, saying "Hey Rotom" and a command, in this order. `need` is
 * how many takes must be heard; SHOEVIZ, which could be either, costs a few of IVs and EVs. Only
 * the order is strict: a command heard out of place would have run the wrong setting.
 */
const SCOTT_TAKES = [
    { keyword: "ivs", takes: 10, need: 8 },
    { keyword: "evs", takes: 10, need: 8 },
    { keyword: "splits", takes: 2, need: 2 },
    { keyword: "automatic_right_panel", takes: 1, need: 1 },
    { keyword: "base_stats", takes: 1, need: 1 },
];
await play("scott-takes");
const scottCommands = heard.filter((k) => k !== "wake");
const scottWakes = heard.length - scottCommands.length;
const totalTakes = SCOTT_TAKES.reduce((sum, s) => sum + s.takes, 0);
console.log(`real voice: "Hey Rotom" ${scottWakes}/${totalTakes}; ${SCOTT_TAKES.map((s) => `${s.keyword} ${scottCommands.filter((k) => k === s.keyword).length}/${s.takes}`).join(", ")}`);
console.log(`real voice heard: ${heard.join(" ")}`);
const position = scottCommands.map((k) => SCOTT_TAKES.findIndex((s) => s.keyword === k));
if (position.some((p, i) => p < 0 || (i > 0 && p < position[i - 1]))) fail("real voice: a command was heard out of place, so the wrong setting would have run");
for (const s of SCOTT_TAKES) {
    const count = scottCommands.filter((k) => k === s.keyword).length;
    if (count < s.need) fail(`real voice: ${s.keyword} heard ${count} times, need ${s.need}`);
    if (count > s.takes) fail(`real voice: ${s.keyword} heard ${count} times from ${s.takes} takes`);
}
if (scottWakes < totalTakes - 2) fail(`real voice: "Hey Rotom" heard ${scottWakes} times of ${totalTakes}`);
const wallMs = performance.now() - wallStart;
const busy = cpuStart ? worker.performance.eventLoopUtilization(cpuStart) : null;
const busyMs = busy ? busy.active : wallMs;
console.log(`decoding: ${busyMs.toFixed(0)} ms busy for ${audioSeconds.toFixed(1)} s of audio = ${((busyMs / 1000 / audioSeconds) * 100).toFixed(1)}% of one core`);
await worker.terminate();

console.log(failures === 0 ? "voice self-test passed" : `${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
