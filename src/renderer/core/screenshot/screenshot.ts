import { reactive } from "vue";
import { describeForReport } from "../report/context";
import { press } from "../shortcuts/build";
import { EMULATOR_BASE_URL } from "../stores/useEmulatorStatsStore";
import type { ShortcutAction } from "../shortcuts/types";

/**
 * The game screenshot (the camera button, ScreenshotButton.vue, and the `screenshot.game`
 * shortcut in every generation): the whole overlay as a 1920x1080 PNG with the game's own
 * picture drawn into the gameplay box, the way OBS layers the game over the overlay.
 *
 * - The game picture is Super Shuckie's `GET /screenshot` (docs/external-contracts.md §3): the
 *   raw screens at the console's own size, a DS's two stacked top first. It needs Super
 *   Shuckie's **Enable external commands**, nothing else.
 * - The overlay is the window's own picture (`screenshot:capture`, src/main/screenshot.ts),
 *   stretched to 1920x1080 if the window is another size.
 * - Each screen is scaled into its box with sharp pixels, and covers whatever the overlay draws
 *   there (the green box, gen1's settings panel), as in OBS.
 * - Saved to `<appRoot>/screenshots/<date> <time> <game>.png` and copied to the clipboard.
 */

/** A box on the 1920x1080 overlay, in CSS px. */
export interface ScreenBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Where the game's screens go. `bottom` is the DS touch screen, when the overlay shows it. */
export interface GameScreens {
    top: ScreenBox;
    bottom?: ScreenBox | null;
}

/**
 * The gameplay boxes, read off each generation's game-area picture (the green rectangle's
 * inside edge). Each is the console's screen at a whole-number scale.
 */
export const SCREEN_BOXES = {
    /** Game Boy, 160x144 at 7x: `images/ui/gamearea.svg`, `images/gen2/ui/gamearea.svg`. */
    gameBoy: { x: 400, y: 36, width: 1120, height: 1008 },
    /** Game Boy Advance, 240x160 at 5x: `images/gen3/ui/game_area.svg`. */
    gameBoyAdvance: { x: 360, y: 19, width: 1200, height: 800 },
    /** DS top screen, 256x192 at 4x: `images/gen4/ui/game_area.svg`, `images/gen5/ui/game_area.svg`. */
    dsTop: { x: 448, y: 19, width: 1024, height: 768 },
    /** The DS touch screen's box under the move pool (about 1.64x), gens 4 and 5 with Secondary Screen on: `images/gen5/ui/second_screen_game_area.svg`. */
    dsSecondScreen: { x: 1487, y: 748, width: 419, height: 314 },
} as const satisfies Record<string, ScreenBox>;

export type ScreenshotStatus = "idle" | "busy" | "done" | "error";

/** What the camera button shows: the last screenshot's outcome. */
export const screenshotState = reactive({
    status: "idle" as ScreenshotStatus,
    message: "",
});

const SCREENSHOT_URL = `${EMULATOR_BASE_URL}/screenshot`;
const WIDTH = 1920;
const HEIGHT = 1080;

/** Super Shuckie's picture, or an error worded for the user. */
async function fetchGamePicture(): Promise<ImageBitmap> {
    let response: Response;
    try {
        response = await fetch(SCREENSHOT_URL, { signal: AbortSignal.timeout(3000) });
    } catch {
        throw new Error("Super Shuckie didn't answer. Is it open, with Settings > Enable external commands on?");
    }
    if (!response.ok) {
        let reason = `HTTP ${response.status}`;
        try {
            const body = await response.json();
            if (typeof body?.error === "string") reason = body.error;
        } catch {
            // Not JSON: keep the status.
        }
        if (response.status === 404) reason = "this Super Shuckie has no /screenshot; update it";
        else if (response.status === 403) reason = "this Super Shuckie needs Settings > Allow bot control on for screenshots; update it, or turn that on";
        throw new Error(`Super Shuckie: ${reason}`);
    }
    return createImageBitmap(await response.blob());
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("The overlay's picture would not load"));
        image.src = src;
    });
}

/**
 * The part of Super Shuckie's picture that is the top screen and the part that is the bottom
 * one. A DS picture is two screens stacked (taller than wide); anything else is one screen.
 */
export function splitScreens(width: number, height: number): { top: ScreenBox; bottom: ScreenBox | null } {
    if (height > width) {
        const half = Math.floor(height / 2);
        return {
            top: { x: 0, y: 0, width, height: half },
            bottom: { x: 0, y: half, width, height: height - half },
        };
    }
    return { top: { x: 0, y: 0, width, height }, bottom: null };
}

/** The finished 1920x1080 picture as PNG bytes. */
export async function composeGameScreenshot(screens: GameScreens): Promise<Uint8Array> {
    const game = await fetchGamePicture();
    try {
        const overlay = await loadImage(await window.api.screenshot.capture());
        const canvas = document.createElement("canvas");
        canvas.width = WIDTH;
        canvas.height = HEIGHT;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("No canvas to draw on");

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(overlay, 0, 0, WIDTH, HEIGHT);

        // Sharp pixels for the game, as Super Shuckie and OBS's point filter show it.
        context.imageSmoothingEnabled = false;
        const parts = splitScreens(game.width, game.height);
        const draw = (from: ScreenBox, to: ScreenBox) =>
            context.drawImage(game, from.x, from.y, from.width, from.height, to.x, to.y, to.width, to.height);
        draw(parts.top, screens.top);
        if (parts.bottom && screens.bottom) draw(parts.bottom, screens.bottom);

        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("The picture would not encode");
        return new Uint8Array(await blob.arrayBuffer());
    } finally {
        game.close();
    }
}

/** Takes, saves and copies one screenshot; the outcome goes to `screenshotState`. */
export async function takeGameScreenshot(screens: GameScreens): Promise<string | null> {
    if (screenshotState.status === "busy") return null;
    screenshotState.status = "busy";
    screenshotState.message = "";
    try {
        const png = await composeGameScreenshot(screens);
        const game = describeForReport().game;
        const file = await window.api.screenshot.save(png, typeof game === "string" ? game : "");
        screenshotState.status = "done";
        screenshotState.message = file;
        console.log(`[screenshot] saved ${file}`);
        return file;
    } catch (error) {
        screenshotState.status = "error";
        screenshotState.message = error instanceof Error ? error.message : String(error);
        console.warn(`[screenshot] ${screenshotState.message}`);
        return null;
    }
}

export const SCREENSHOT_ACTION_ID = "screenshot.game";

/** The shortcut every generation lists; the camera button runs it too. `screens` is read at the press. */
export function screenshotAction(screens: () => GameScreens): ShortcutAction {
    return press(SCREENSHOT_ACTION_ID, "Save Game Screenshot", "Run", () => takeGameScreenshot(screens()));
}
