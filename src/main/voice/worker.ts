import { parentPort, workerData } from "worker_threads";
import { join } from "path";
import { findVoiceKeywords, normalizeHeard, type VoiceEvent } from "../../shared/voiceCommands";

/**
 * The voice thread (ARCHITECTURE §2 "voice"): a sherpa-onnx speech recognizer fed the
 * microphone audio the overlay sends (src/main/voice/index.ts), whose text is searched for
 * "Hey Rotom" and the commands (src/shared/voiceCommands.ts). The text stays in this thread and
 * is thrown away. It runs in a worker thread so decoding never holds up the main process.
 * sherpa-onnx is its WebAssembly build: one package for Windows and the Mac, no native files to
 * ship. About 5% of one core while listening, ~0.5 s to load (measured 2026-11-05).
 *
 * In:  { samples: Float32Array, sampleRate: number }   a chunk of mono audio, about 100 ms
 *      { ping: number }                                 the self-test's "done yet?"
 * Out: VoiceEvent                                       "ready", each keyword heard, or an error
 *      { type: "pong", ping }                           the answer, after every chunk before it
 */

interface Data {
    modelDir: string;
}

interface Recognizer {
    createStream(): Stream;
    isReady(stream: Stream): boolean;
    decode(stream: Stream): void;
    isEndpoint(stream: Stream): boolean;
    reset(stream: Stream): void;
    getResult(stream: Stream): { text: string };
}

interface Stream {
    acceptWaveform(sampleRate: number, samples: Float32Array): void;
}

const port = parentPort!;
const post = (event: VoiceEvent) => port.postMessage(event);

let recognizer: Recognizer;
let stream: Stream;

try {
    const { modelDir } = workerData as Data;
    const sherpa = require("sherpa-onnx") as { createOnlineRecognizer(config: unknown): Recognizer };
    const file = (name: string) => join(modelDir, name);
    recognizer = sherpa.createOnlineRecognizer({
        featConfig: { sampleRate: 16000, featureDim: 80 },
        modelConfig: {
            transducer: { encoder: file("encoder.int8.onnx"), decoder: file("decoder.int8.onnx"), joiner: file("joiner.int8.onnx") },
            tokens: file("tokens.txt"),
            numThreads: 1,
            provider: "cpu",
            debug: 0,
        },
        decodingMethod: "greedy_search",
        enableEndpoint: 1,
    });
    stream = recognizer.createStream();
    post({ type: "ready" });
} catch (err) {
    post({ type: "error", message: `The speech model did not load: ${err instanceof Error ? err.message : String(err)}` });
    process.exit(1);
}

/**
 * Adds noise far below anything audible (about -90 dB). Exact digital silence -- a muted
 * microphone, or the quiet between test clips -- gives the model features of minus infinity
 * and spoils the stream for the speech after it. Kaldi-style models expect this dither. The
 * noise comes from a fixed seed, so the same audio is always heard the same way and the
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
 * The model's text only ever grows, but its last word may still be growing, so the text is
 * searched once it has stood still this long, and at the end of each utterance. Someone who
 * keeps talking past a command still gets it: waiting for the end of the utterance alone could
 * take 20 s, past the overlay's 5 s command window.
 */
const SETTLED_SECONDS = 0.5;

/** The utterance so far. */
let text = "";
/** How much of `text` has been used: each thing said is sent once. */
let used = 0;
let stillFor = 0;
let searched = true;

function search(): void {
    searched = true;
    const { keywords, end } = findVoiceKeywords(text.slice(used));
    used += end;
    // Everything found is sent, wake phrase first as said, so "Hey Rotom, show IVs" in one
    // breath is both. The overlay ignores a command with no wake phrase just before it.
    for (const keyword of keywords) post({ type: "heard", keyword });
}

port.on("message", (chunk: { samples: Float32Array; sampleRate: number } | { ping: number }) => {
    // `npm run parity:voice` pings after a clip to know every chunk before it was decoded.
    if ("ping" in chunk) {
        port.postMessage({ type: "pong", ping: chunk.ping });
        return;
    }
    dither(chunk.samples);
    // The recognizer resamples to the model's 16 kHz itself.
    stream.acceptWaveform(chunk.sampleRate, chunk.samples);
    while (recognizer.isReady(stream)) recognizer.decode(stream);

    const now = normalizeHeard(recognizer.getResult(stream).text);
    if (now === text) {
        stillFor += chunk.samples.length / chunk.sampleRate;
    } else {
        text = now;
        stillFor = 0;
        searched = false;
    }
    const ended = recognizer.isEndpoint(stream);
    if (!searched && (ended || stillFor >= SETTLED_SECONDS)) search();
    if (ended) {
        recognizer.reset(stream);
        text = "";
        used = 0;
        stillFor = 0;
        searched = true;
    }
});
