import { reactive } from "vue";
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
 * - Saved to `<appRoot>/screenshots/<name>.png` (`screenshotName`) and copied to the clipboard.
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
    /**
     * Where the two screens are in Super Shuckie's picture, when they are not two equal halves: the 3DS's bottom
     * screen is narrower than its top one (`N3DS_PICTURE`). Omitted: `splitScreens`.
     */
    source?: { top: ScreenBox; bottom: ScreenBox | null };
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
    /** The DS touch screen under the move pool, 256x192 at 1.640625x, gens 4 and 5 with Secondary Screen on: `images/gen{4,5}/ui/second_screen_game_area.svg`. */
    dsSecondScreen: { x: 1486, y: 747, width: 420, height: 315 },
    /** 3DS top screen, 400x240 at 3x: `images/gen6/ui/game_area.svg` (gens 6 and 7). */
    n3dsTop: { x: 360, y: 19, width: 1200, height: 720 },
    /** The 3DS bottom screen at the bottom right, 320x240 at 1.2625x (exactly 4:3): `images/gen6/ui/second_screen_game_area.svg`. */
    n3dsBottom: { x: 1501, y: 758, width: 404, height: 303 },
} as const satisfies Record<string, ScreenBox>;

/**
 * The 3DS's screens in Super Shuckie's `/screenshot` picture: stacked top to bottom, each left-aligned on black
 * (supershuckie-frontend `encode_screens_png`), so the 320-wide bottom screen has 80 black columns to its right.
 */
export const N3DS_PICTURE = {
    top: { x: 0, y: 0, width: 400, height: 240 },
    bottom: { x: 0, y: 240, width: 320, height: 240 },
} as const;

/** What the file name says about the run, from the generation (its `screenshotAction`). */
export interface ScreenshotFacts {
    /** The solo Pokémon as it is now (after evolving), as the overlay spells it. */
    species: string;
    /** The Finished Runs counter. */
    finishes: number;
    /** The run's real time in whole seconds: the clock the overlay shows (Super Shuckie's when its timer is on). */
    seconds: number;
}

/** Whole seconds from a clock reading, or from Super Shuckie's milliseconds when its timer is on. */
export function runSeconds(shuckieTimer: boolean, shuckieMs: number | null | undefined, clock: { hours?: number; minutes?: number; seconds?: number }): number {
    if (shuckieTimer && typeof shuckieMs === "number" && Number.isFinite(shuckieMs)) return Math.max(0, Math.floor(shuckieMs / 1000));
    const n = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
    return Math.max(0, n(clock.hours) * 3600 + n(clock.minutes) * 60 + Math.floor(n(clock.seconds)));
}

/**
 * The file name, without `.png`: `YYYYMMDD-HHMMSS-<species>-<finishes>-<H><MM><SS>`, the date and
 * time the picture was taken, then the run clock with no padding on the hours (2:13:34 is 21334,
 * 0:05:07 is 0507). Scott's example: `20261124-213659-Yanmega-1-21334`.
 */
export function screenshotName(when: Date, facts: ScreenshotFacts): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    const date = `${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}`;
    const time = `${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`;
    const species = String(facts.species ?? "").replace(/[<>:"/\\|?*\u0000-\u001f\s]/g, "") || "Unknown";
    const finishes = Number.isFinite(facts.finishes) ? Math.max(0, Math.floor(facts.finishes)) : 0;
    const total = Number.isFinite(facts.seconds) ? Math.max(0, Math.floor(facts.seconds)) : 0;
    const clock = `${Math.floor(total / 3600)}${pad(Math.floor(total / 60) % 60)}${pad(total % 60)}`;
    return `${date}-${time}-${species}-${finishes}-${clock}`;
}

export type ScreenshotStatus = "idle" | "busy" | "done" | "error";

/** What the camera button shows: the last screenshot's outcome. */
export const screenshotState = reactive({
    status: "idle" as ScreenshotStatus,
    message: "",
    /** Counts finished screenshots, so the button can show each outcome for a few seconds. */
    finished: 0,
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
        const parts = screens.source ?? splitScreens(game.width, game.height);
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
export async function takeGameScreenshot(screens: GameScreens, facts: ScreenshotFacts): Promise<string | null> {
    if (screenshotState.status === "busy") return null;
    screenshotState.status = "busy";
    screenshotState.message = "";
    try {
        const name = screenshotName(new Date(), facts);
        const png = await composeGameScreenshot(screens);
        const file = await window.api.screenshot.save(png, name);
        screenshotState.status = "done";
        screenshotState.message = file;
        screenshotState.finished++;
        console.log(`[screenshot] saved ${file}`);
        return file;
    } catch (error) {
        screenshotState.status = "error";
        screenshotState.message = error instanceof Error ? error.message : String(error);
        screenshotState.finished++;
        console.warn(`[screenshot] ${screenshotState.message}`);
        return null;
    }
}

export const SCREENSHOT_ACTION_ID = "screenshot.game";

/** The settings panel's "Open Screenshots Folder" button (next to Open Splits Folder in every generation). */
export function openScreenshotsFolder(): Promise<string> {
    return window.api.screenshot.reveal();
}

/**
 * The shortcut every generation lists; the camera button runs it too. `screens` and `facts` are
 * read at the press. A `facts` that throws (a game half loaded) still saves, named "Unknown-0-000".
 */
export function screenshotAction(screens: () => GameScreens, facts: () => ScreenshotFacts): ShortcutAction {
    return press(SCREENSHOT_ACTION_ID, "Save Game Screenshot", "Run", () => {
        let known: ScreenshotFacts;
        try {
            known = facts();
        } catch {
            known = { species: "", finishes: 0, seconds: 0 };
        }
        return takeGameScreenshot(screens(), known);
    });
}
