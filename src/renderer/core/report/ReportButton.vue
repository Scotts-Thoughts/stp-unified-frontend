<template>
    <button
        type="button"
        class="stp-report-btn"
        :class="{ 'stp-report-btn-saved': savedName !== null }"
        :disabled="step !== 'idle'"
        :title="savedName !== null ? `Saved to the reports folder: ${savedName}` : 'Report a problem: screenshot, log and settings in one zip to send to Scott'"
        @click="start"
    >
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path d="M3 1.5v13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none" />
            <path d="M3.8 2.2h8.7l-2.2 3.3 2.2 3.3H3.8z" fill="currentColor" />
        </svg>
        <span>{{ savedName !== null ? "Saved" : "Report" }}</span>
    </button>

    <Teleport to="body">
        <div
            v-if="step === 'draw' || step === 'details' || step === 'saving'"
            class="stp-report-layer"
            @keydown.stop
            @keyup.stop
            @keypress.stop
        >
            <img :src="screenshot" class="stp-report-shot" draggable="false" alt="" @load="sizeCanvas" ref="shot" />
            <canvas
                ref="canvas"
                class="stp-report-canvas"
                :class="{ 'stp-report-canvas-live': step === 'draw' }"
                @pointerdown="penDown"
                @pointermove="penMove"
                @pointerup="penUp"
                @pointercancel="penUp"
            ></canvas>

            <div v-if="step === 'draw'" class="stp-report-bar">
                <span class="stp-report-hint">
                    Draw on the screenshot to show the problem. <kbd>Enter</kbd> continue · <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo · <kbd>Esc</kbd> cancel
                </span>
                <button type="button" class="stp-report-action" :disabled="strokes.length === 0" @click="undo">Undo</button>
                <button type="button" class="stp-report-action" :disabled="strokes.length === 0" @click="clearDrawing">Clear</button>
                <button type="button" class="stp-report-action" @click="cancel">Cancel</button>
                <button type="button" class="stp-report-action stp-report-primary" @click="toDetails">Continue</button>
            </div>

            <div v-if="step === 'details' || step === 'saving'" class="stp-report-backdrop">
                <form class="stp-report-dialog" @submit.prevent="save">
                    <h2>Report a problem</h2>
                    <label>
                        <span>Title</span>
                        <input
                            ref="title"
                            v-model="title"
                            type="text"
                            maxlength="120"
                            placeholder="What went wrong, in a few words"
                            :disabled="step === 'saving'"
                            @keydown.enter.prevent="focusDescription"
                        />
                    </label>
                    <label>
                        <span>Description</span>
                        <textarea
                            ref="description"
                            v-model="description"
                            rows="8"
                            placeholder="What were you doing, what did you expect, and what happened instead?"
                            :disabled="step === 'saving'"
                        ></textarea>
                    </label>
                    <p class="stp-report-note">
                        The zip holds this text, the screenshot (plain and with your drawing), the overlay's log and your
                        overlay settings. It is saved in the <b>reports</b> folder, which opens when it is done.
                    </p>
                    <p v-if="error" class="stp-report-error">{{ error }}</p>
                    <div class="stp-report-buttons">
                        <button type="button" class="stp-report-action" :disabled="step === 'saving'" @click="cancel">Cancel</button>
                        <button type="button" class="stp-report-action" :disabled="step === 'saving'" @click="backToDrawing">Back to drawing</button>
                        <button type="submit" class="stp-report-action stp-report-primary" :disabled="step === 'saving' || title.trim() === ''">
                            {{ step === "saving" ? "Saving…" : "Save report" }}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </Teleport>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { describeForReport, flushForReport } from "./context";
import "./report.css";

type Step = "idle" | "capturing" | "draw" | "details" | "saving";
type Point = [number, number];

/**
 * The Report button (top right of the settings panel and of the start screen) and the
 * steps behind it:
 *
 *   1. main takes the window's picture and the log as they are (src/main/report.ts);
 *   2. the picture fills the window and the user draws on it; Enter goes on;
 *   3. a title and description; Save writes `reports/<date> <title>.zip`.
 *
 * The layer is teleported to `<body>`: the settings panel is `position: fixed` inside a
 * scaled container, and the layer has to cover the whole window. Keyboard shortcuts are
 * suspended while it is open, so typing a title cannot press one, and key events stop at
 * the layer so the overlays' own key handlers never see them.
 */
export default defineComponent({
    name: "ReportButton",
    data() {
        return {
            step: "idle" as Step,
            screenshot: "",
            strokes: [] as Point[][],
            drawing: null as Point[] | null,
            title: "",
            description: "",
            error: "",
            savedName: null as string | null,
            savedTimer: null as ReturnType<typeof setTimeout> | null,
        };
    },
    beforeUnmount() {
        if (this.step !== "idle") this.finish(false);
        if (this.savedTimer) clearTimeout(this.savedTimer);
    },
    methods: {
        async start() {
            if (this.step !== "idle") return;
            this.step = "capturing";
            this.error = "";
            try {
                this.screenshot = await window.api.report.capture();
            } catch (error) {
                console.error("[report] could not take the screenshot:", error);
                this.step = "idle";
                return;
            }
            this.strokes = [];
            this.drawing = null;
            this.title = "";
            this.description = "";
            this.step = "draw";
            window.api.shortcuts.suspend();
            window.addEventListener("keydown", this.onKey, true);
        },
        /** Ends the report: `false` tells main to drop what it captured. */
        finish(saved: boolean) {
            window.removeEventListener("keydown", this.onKey, true);
            window.api.shortcuts.resume();
            if (!saved) void window.api.report.cancel();
            this.step = "idle";
            this.screenshot = "";
            this.strokes = [];
            this.drawing = null;
        },
        cancel() {
            this.finish(false);
        },
        /**
         * Enter, Esc and Ctrl+Z for the drawing step. In the dialog, Ctrl+Enter saves from
         * either field and Esc goes back to the drawing.
         */
        onKey(event: KeyboardEvent) {
            if (this.step === "draw") {
                if (event.key === "Enter") this.toDetails();
                else if (event.key === "Escape") this.cancel();
                else if (event.key.toLowerCase() === "z" && (event.ctrlKey || event.metaKey)) this.undo();
                else return;
            } else if (this.step === "details") {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) void this.save();
                else if (event.key === "Escape") this.backToDrawing();
                else return;
            } else return;
            event.preventDefault();
            event.stopPropagation();
        },

        // --- drawing -------------------------------------------------------------
        canvas(): HTMLCanvasElement | null {
            return (this.$refs.canvas as HTMLCanvasElement | undefined) ?? null;
        },
        /** The canvas draws at the picture's own resolution, whatever the window's zoom. */
        sizeCanvas() {
            const shot = this.$refs.shot as HTMLImageElement | undefined;
            const canvas = this.canvas();
            if (!shot || !canvas) return;
            canvas.width = shot.naturalWidth;
            canvas.height = shot.naturalHeight;
            this.redraw();
        },
        toCanvas(event: PointerEvent): Point {
            const canvas = this.canvas()!;
            const box = canvas.getBoundingClientRect();
            return [((event.clientX - box.left) / box.width) * canvas.width, ((event.clientY - box.top) / box.height) * canvas.height];
        },
        penDown(event: PointerEvent) {
            if (this.step !== "draw" || event.button !== 0) return;
            (event.target as HTMLElement).setPointerCapture(event.pointerId);
            this.drawing = [this.toCanvas(event)];
            this.strokes.push(this.drawing);
            this.redraw();
        },
        penMove(event: PointerEvent) {
            if (!this.drawing) return;
            this.drawing.push(this.toCanvas(event));
            this.redraw();
        },
        penUp() {
            this.drawing = null;
        },
        undo() {
            this.drawing = null;
            this.strokes.pop();
            this.redraw();
        },
        clearDrawing() {
            this.drawing = null;
            this.strokes = [];
            this.redraw();
        },
        paint(context: CanvasRenderingContext2D, width: number) {
            context.strokeStyle = "#ff2a2a";
            context.fillStyle = "#ff2a2a";
            context.lineWidth = Math.max(3, width / 320);
            context.lineCap = "round";
            context.lineJoin = "round";
            for (const stroke of this.strokes) {
                if (stroke.length === 1) {
                    context.beginPath();
                    context.arc(stroke[0][0], stroke[0][1], context.lineWidth / 2, 0, Math.PI * 2);
                    context.fill();
                    continue;
                }
                context.beginPath();
                context.moveTo(stroke[0][0], stroke[0][1]);
                for (const [x, y] of stroke.slice(1)) context.lineTo(x, y);
                context.stroke();
            }
        },
        redraw() {
            const canvas = this.canvas();
            const context = canvas?.getContext("2d");
            if (!canvas || !context) return;
            context.clearRect(0, 0, canvas.width, canvas.height);
            this.paint(context, canvas.width);
        },
        /** The picture with the drawing on it, or null when nothing was drawn. */
        annotated(): string | null {
            const shot = this.$refs.shot as HTMLImageElement | undefined;
            if (!shot || this.strokes.length === 0) return null;
            const canvas = document.createElement("canvas");
            canvas.width = shot.naturalWidth;
            canvas.height = shot.naturalHeight;
            const context = canvas.getContext("2d");
            if (!context) return null;
            context.drawImage(shot, 0, 0);
            this.paint(context, canvas.width);
            return canvas.toDataURL("image/png");
        },

        // --- details ---------------------------------------------------------------
        toDetails() {
            this.drawing = null;
            this.step = "details";
            void this.$nextTick(() => (this.$refs.title as HTMLInputElement | undefined)?.focus());
        },
        backToDrawing() {
            this.error = "";
            this.step = "draw";
        },
        focusDescription() {
            (this.$refs.description as HTMLTextAreaElement | undefined)?.focus();
        },
        async save() {
            if (this.step !== "details") return;
            if (this.title.trim() === "") {
                this.error = "Please give the report a title.";
                (this.$refs.title as HTMLInputElement | undefined)?.focus();
                return;
            }
            this.step = "saving";
            this.error = "";
            try {
                await flushForReport();
                const file = await window.api.report.save({
                    title: this.title,
                    description: this.description,
                    annotated: this.annotated(),
                    context: describeForReport(),
                });
                this.finish(true);
                this.showSaved(file.split(/[\\/]/).pop() ?? file);
            } catch (error) {
                console.error("[report] could not save the report:", error);
                this.error = `Could not save the report: ${error instanceof Error ? error.message : String(error)}`;
                this.step = "details";
            }
        },
        showSaved(name: string) {
            this.savedName = name;
            if (this.savedTimer) clearTimeout(this.savedTimer);
            this.savedTimer = setTimeout(() => {
                this.savedName = null;
                this.savedTimer = null;
            }, 8000);
        },
    },
});
</script>
