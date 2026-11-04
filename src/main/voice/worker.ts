import { parentPort, workerData } from "worker_threads";
import { join } from "path";
import type { VoiceEvent, VoiceKeyword } from "../../shared/voiceCommands";

/**
 * The voice thread (ARCHITECTURE §2 "voice"): a sherpa-onnx keyword spotter fed the
 * microphone audio the overlay sends (src/main/voice/index.ts). It runs in a worker thread
 * so decoding never holds up the main process. sherpa-onnx is its WebAssembly build: one
 * package for Windows and the Mac, no native files to ship. About 2% of one core while
 * listening, ~0.5 s to load (measured 2026-10-31, `npm run parity:voice`).
 *
 * In:  { samples: Float32Array, sampleRate: number }   a chunk of mono audio, about 100 ms
 *      { ping: number }                                 the self-test's "done yet?"
 * Out: VoiceEvent                                       "ready", each keyword heard, or an error
 *      { type: "pong", ping }                           the answer, after every chunk before it
 */

interface Data {
    modelDir: string;
    keywords: string;
}

interface Spotter {
    createStream(): Stream;
    isReady(stream: Stream): boolean;
    decode(stream: Stream): void;
    reset(stream: Stream): void;
    getResult(stream: Stream): { keyword: string };
}

interface Stream {
    acceptWaveform(sampleRate: number, samples: Float32Array): void;
    free(): void;
}

const port = parentPort!;
const post = (event: VoiceEvent) => port.postMessage(event);

let spotter: Spotter;
let stream: Stream;

try {
    const { modelDir, keywords } = workerData as Data;
    const sherpa = require("sherpa-onnx") as { createKws(config: unknown): Spotter };
    const file = (name: string) => join(modelDir, name);
    spotter = sherpa.createKws({
        featConfig: { samplingRate: 16000, featureDim: 80 },
        modelConfig: {
            transducer: { encoder: file("encoder.int8.onnx"), decoder: file("decoder.int8.onnx"), joiner: file("joiner.int8.onnx") },
            tokens: file("tokens.txt"),
            numThreads: 1,
            provider: "cpu",
            debug: 0,
        },
        maxActivePaths: 4,
        numTrailingBlanks: 1,
        keywordsScore: 1.0,
        keywordsThreshold: 0.25,
        keywords,
    });
    stream = spotter.createStream();
    post({ type: "ready" });
} catch (err) {
    post({ type: "error", message: `The speech model did not load: ${err instanceof Error ? err.message : String(err)}` });
    process.exit(1);
}

/**
 * Adds noise far below anything audible (about -90 dB). Exact digital silence -- a muted
 * microphone, or the quiet between test clips -- gives the model features of minus infinity
 * and spoils the stream for the speech after it: without this, phrases after a second of
 * zeros went unheard or were heard as the wrong one. Kaldi-style models expect this dither.
 * The noise comes from a fixed seed, so the same audio is always heard the same way and the
 * self-test is repeatable.
 */
let seed = 0x5eed;
function dither(samples: Float32Array): void {
    for (let i = 0; i < samples.length; i++) {
        // mulberry32
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        samples[i] += (((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5) * 6e-5;
    }
}

/**
 * After a phrase is heard the stream hears worse: on recorded clips, the phrase after a
 * detection was missed about half the time, while a stream that started in a pause heard every
 * "Hey Rotom ... show IVs" clip. Resetting the stream at the detection, or starting a new one
 * there (mid-word), made it worse still, and a new stream needs a moment before it hears
 * anything, so one started between "Hey Rotom" and the command missed the command.
 *
 * So nothing happens at a detection. After a command, the stream is replaced at the next
 * pause; after the wake phrase, only once the overlay's 5 s command window is over with no
 * command heard. A pause is QUIET_CHUNKS chunks (~100 ms each) in a row near the quietest
 * level heard lately.
 */
const QUIET_CHUNKS = 3;
/** The overlay takes a command for 5 s after "Hey Rotom" (core/voice/voice.ts); a little longer here. */
const WAKE_WINDOW_SECONDS = 6;
let renewAtPause = false;
/** Seconds of audio since the wake phrase, while waiting for its command; null otherwise. */
let sinceWake: number | null = null;
let quietRun = 0;
/** The background level: follows a quieter chunk at once and a louder one slowly. */
let floor = 0;

function quiet(samples: Float32Array): boolean {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    const level = Math.sqrt(sum / Math.max(1, samples.length));
    floor = floor === 0 || level < floor ? level : floor + (level - floor) * 0.02;
    return level < floor * 3 + 1e-3;
}

port.on("message", (chunk: { samples: Float32Array; sampleRate: number } | { ping: number }) => {
    // `npm run parity:voice` pings after a clip to know every chunk before it was decoded.
    if ("ping" in chunk) {
        port.postMessage({ type: "pong", ping: chunk.ping });
        return;
    }
    dither(chunk.samples);
    quietRun = quiet(chunk.samples) ? quietRun + 1 : 0;
    if (sinceWake !== null) {
        sinceWake += chunk.samples.length / chunk.sampleRate;
        if (sinceWake > WAKE_WINDOW_SECONDS) {
            sinceWake = null;
            renewAtPause = true;
        }
    }
    if (renewAtPause && quietRun >= QUIET_CHUNKS) {
        renewAtPause = false;
        (stream as Stream).free();
        stream = spotter.createStream();
    }
    // The spotter resamples to the model's 16 kHz itself.
    stream.acceptWaveform(chunk.sampleRate, chunk.samples);
    while (spotter.isReady(stream)) {
        spotter.decode(stream);
        const keyword = spotter.getResult(stream).keyword;
        if (keyword) {
            // The decoder starts looking for the next phrase by itself, so "Hey Rotom, show
            // IVs" in one breath is heard as both.
            post({ type: "heard", keyword: keyword as VoiceKeyword });
            if (keyword === "wake") {
                sinceWake = 0;
                renewAtPause = false;
            } else {
                sinceWake = null;
                renewAtPause = true;
            }
        }
    }
});
