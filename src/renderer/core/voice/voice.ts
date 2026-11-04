import { reactive } from "vue";
import type { VoiceEvent, VoiceKeyword } from "../../../shared/voiceCommands";
import { getUserState, setUserState } from "../persistence/userState";
import { runShortcutAction } from "../shortcuts/engine";
import { voiceCommand } from "./commands";

/**
 * Voice control (ARCHITECTURE §2 "voice"): say "Hey Rotom", then a command within a few
 * seconds ("show IVs", "show splits"...), and the overlay changes as if the setting had been
 * clicked. The microphone button (VoiceButton.vue) switches it on and off; the choice is
 * saved (`voice_control`, a global key) and the shell starts it at boot when it was left on.
 *
 * This side captures the microphone and sends it to main ~10 times a second; main's worker
 * thread (src/main/voice/) spots the phrases and sends back each one heard. Off by default,
 * so the parity harness never opens a microphone or loads the model.
 */

export const VOICE_KEY = "voice_control";

/** How long after "Hey Rotom" a command is taken. */
const LISTEN_MS = 5000;

export type VoiceStatus = "off" | "starting" | "waiting" | "listening" | "error";

export const voiceState = reactive({
    status: "off" as VoiceStatus,
    /** The error, while `status` is "error". */
    error: "",
    /** What the last command did, for the button's tooltip. */
    last: "",
});

/** The capture worklet: hands the main thread ~100 ms of mono audio at a time. */
const CAPTURE_WORKLET = `
class StpVoiceCapture extends AudioWorkletProcessor {
    constructor() {
        super();
        this.size = Math.round(sampleRate / 10);
        this.buffer = new Float32Array(this.size);
        this.filled = 0;
    }
    process(inputs) {
        const channel = inputs[0] && inputs[0][0];
        if (channel) {
            for (let i = 0; i < channel.length; i++) {
                this.buffer[this.filled++] = channel[i];
                if (this.filled === this.size) {
                    this.port.postMessage(this.buffer, [this.buffer.buffer]);
                    this.buffer = new Float32Array(this.size);
                    this.filled = 0;
                }
            }
        }
        return true;
    }
}
registerProcessor("stp-voice-capture", StpVoiceCapture);
`;

let session: { mic: MediaStream | null; context: AudioContext | null; unsubscribe: () => void } | null = null;
let listenTimer: ReturnType<typeof setTimeout> | null = null;

function api() {
    return window.api?.voice;
}

export function voiceEnabled(): boolean {
    return getUserState<boolean>(VOICE_KEY, false) === true;
}

/** The button: switch voice control on or off, and remember it. */
export function setVoiceEnabled(on: boolean): void {
    setUserState(VOICE_KEY, on ? true : null);
    if (on) void startVoice();
    else stopVoice();
}

/** The shell, once user state is loaded: start voice control if it was left on. */
export function startVoiceIfEnabled(): void {
    if (voiceEnabled()) void startVoice();
}

async function startVoice(): Promise<void> {
    const voice = api();
    if (session || !voice) return;
    voiceState.status = "starting";
    voiceState.error = "";
    const current = { mic: null as MediaStream | null, context: null as AudioContext | null, unsubscribe: voice.onEvent(onEvent) };
    session = current;
    try {
        await voice.start();
        const mic = await navigator.mediaDevices.getUserMedia({
            audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (session !== current) {
            mic.getTracks().forEach((t) => t.stop());
            return;
        }
        current.mic = mic;
        // 16 kHz is what the model takes, so the least audio crosses to main; the spotter
        // resamples whatever rate it is given.
        const context = new AudioContext({ sampleRate: 16000 });
        current.context = context;
        const blob = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: "application/javascript" }));
        try {
            await context.audioWorklet.addModule(blob);
        } finally {
            URL.revokeObjectURL(blob);
        }
        if (session !== current) return;
        const node = new AudioWorkletNode(context, "stp-voice-capture", { numberOfOutputs: 1, outputChannelCount: [1] });
        node.port.onmessage = (event: MessageEvent<Float32Array>) => voice.audio(event.data, context.sampleRate);
        context.createMediaStreamSource(mic).connect(node);
        // The node writes nothing to its output; connecting it is what keeps Chromium running it.
        node.connect(context.destination);
        await context.resume();
    } catch (err) {
        if (session !== current) return;
        fail(describe(err));
    }
}

function describe(err: unknown): string {
    if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError")) {
        return "The microphone is blocked. On Windows: Settings › Privacy & security › Microphone › let desktop apps use it.";
    }
    if (err instanceof DOMException && err.name === "NotFoundError") return "No microphone was found.";
    return err instanceof Error ? err.message.replace(/^Error invoking remote method 'voice:start': (Error: )?/, "") : String(err);
}

function fail(message: string): void {
    console.error(`[voice] ${message}`);
    teardown();
    voiceState.status = "error";
    voiceState.error = message;
}

function stopVoice(): void {
    teardown();
    voiceState.status = "off";
    voiceState.error = "";
}

function teardown(): void {
    const current = session;
    session = null;
    stopListening();
    if (!current) return;
    current.unsubscribe();
    current.mic?.getTracks().forEach((t) => t.stop());
    void current.context?.close();
    void api()?.stop();
}

function onEvent(event: VoiceEvent): void {
    if (!session) return;
    if (event.type === "error") fail(event.message);
    else if (event.type === "ready") {
        if (voiceState.status === "starting") voiceState.status = "waiting";
    } else if (event.type === "heard") heard(event.keyword);
}

function heard(keyword: VoiceKeyword): void {
    if (keyword === "wake") {
        voiceState.status = "listening";
        stopListening();
        listenTimer = setTimeout(() => {
            listenTimer = null;
            if (voiceState.status === "listening") voiceState.status = "waiting";
        }, LISTEN_MS);
        return;
    }
    // A command without "Hey Rotom" just before it is ignored.
    if (voiceState.status !== "listening") return;
    stopListening();
    voiceState.status = "waiting";
    const command = voiceCommand(keyword);
    if (!command) return;
    const action = runShortcutAction(command.actions);
    voiceState.last = action ? `Heard "${keyword.replace(/_/g, " ")}": ${command.label}` : `Heard "${keyword.replace(/_/g, " ")}", but there is nothing to change until a game is loaded`;
    console.log(`[voice] ${voiceState.last}`);
}

function stopListening(): void {
    if (listenTimer !== null) clearTimeout(listenTimer);
    listenTimer = null;
}
