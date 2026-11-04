import { existsSync } from "fs";
import { join } from "path";
import { Worker } from "worker_threads";
import { app, ipcMain, systemPreferences, type BrowserWindow } from "electron";
import { appRoot } from "../paths";
import { spotterKeywords, type VoiceEvent } from "../../shared/voiceCommands";
import workerPath from "./worker?modulePath";

/**
 * Voice control's main-process side (ARCHITECTURE §2 "voice"). The overlay captures the
 * microphone (core/voice/voice.ts) and sends it here as ~100 ms chunks; a worker thread
 * (worker.ts) spots the phrases in src/shared/voiceCommands.ts and each one heard goes back
 * to the overlay as `voice:event`. Nothing runs, and the model is not loaded, until the
 * overlay asks (`voice:start`, only while voice control is switched on); `voice:stop` ends
 * the thread and frees its memory.
 *
 * `voice:audio` is a fire-and-forget send, like the shortcut channels, so the parity
 * harness's idle counter never waits on it.
 */

const MODEL = join("resources", "voice", "kws-zipformer-gigaspeech-3.3M");

/** The model folder: next to the exe (extraFiles) or in the repo; the harness's STP_APP_ROOT sandbox has none, so fall back to the app. */
function modelDir(): string {
    const candidates = [join(appRoot(), MODEL), join(app.getAppPath(), MODEL)];
    return candidates.find((dir) => existsSync(join(dir, "tokens.txt"))) ?? candidates[0];
}

let worker: Worker | null = null;

/** Ends the voice thread. index.ts calls it on a reload of the overlay (whose next boot starts it again) and on quit. */
export function stopVoice(): void {
    const w = worker;
    worker = null;
    if (w) void w.terminate();
}

export function registerVoiceIpc(getWindow: () => BrowserWindow | null): void {
    const send = (event: VoiceEvent) => {
        const win = getWindow();
        if (win && !win.isDestroyed()) win.webContents.send("voice:event", event);
    };

    ipcMain.handle("voice:start", async () => {
        if (worker) return;
        // The Mac asks once for the microphone; Windows has its own privacy switch, which
        // shows up in the overlay as getUserMedia failing.
        if (process.platform === "darwin" && systemPreferences.getMediaAccessStatus("microphone") !== "granted") {
            const allowed = await systemPreferences.askForMediaAccess("microphone");
            if (!allowed) throw new Error("Microphone access is turned off for this app in System Settings › Privacy & Security.");
        }
        const w = new Worker(workerPath, { workerData: { modelDir: modelDir(), keywords: spotterKeywords() } });
        worker = w;
        w.on("message", (event: VoiceEvent) => {
            if (worker === w) send(event);
        });
        w.on("error", (err) => {
            console.error("[voice]", err);
            if (worker === w) send({ type: "error", message: err.message });
        });
        w.on("exit", (code) => {
            if (worker !== w) return;
            worker = null;
            if (code !== 0) send({ type: "error", message: `The voice thread stopped (exit code ${code}).` });
        });
    });

    ipcMain.on("voice:audio", (_event, samples: Float32Array, sampleRate: number) => {
        worker?.postMessage({ samples, sampleRate });
    });

    ipcMain.handle("voice:stop", () => stopVoice());
}
