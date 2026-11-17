/**
 * Webcam Mode (all five generations, 2026-11-17): the right panel stops above the bottom right corner of the
 * overlay, so the streamer's webcam can sit there. Each generation saves its own `webcam_mode` switch (gen1:
 * `right_panel.webcam_mode`); this file holds the line every panel stops at and the arithmetic, so the five
 * generations leave the same space.
 *
 * Numbers are in the 1920×1080 canvas the panel art is drawn on.
 *
 * - Movepool (`core/overlay/Movepool.vue`): the table loses the rows below the line and fits its moves into what is
 *   left (`movepoolFitStyle`); the art's bottom border moves up to the line. Tutor and Form rows are left out, so the
 *   level-up and TM/HM rows keep a readable size.
 * - Splits (`core/overlay/SplitsPanel.vue`): the frame's bottom border never sits below the line, and a list too long
 *   for that shrinks its icons, as it already did for its own frame.
 * - Enemy team and Trainers (`core/overlay/EnemyTeamPanel.ts`): a team whose panel runs past the line is drawn smaller,
 *   anchored at the top right, so up to four Pokémon keep their size.
 */

import trainerArtBoxes from "./trainerArtBoxes.json";

/** Where the inner edge of a frame's bottom border sits in Webcam Mode. The border itself ends about 10px lower. */
export const WEBCAM_FRAME_BOTTOM = 730;

/** The lowest y a panel without a movable border (the enemy team) may reach in Webcam Mode. */
export const WEBCAM_PANEL_BOTTOM = 740;

/** How far up a frame whose bottom border's inner edge is at `frameBottom` moves in Webcam Mode (0: it already fits). */
export function webcamFrameShift(frameBottom: number): number {
    return Math.max(0, frameBottom - WEBCAM_FRAME_BOTTOM);
}

/**
 * The vertical scale that keeps a panel running from `top` to `bottom` (canvas px) above the webcam, its top edge where
 * it is: 1 when it fits. `top` is the panel's top edge, level with the top of the game area, which must not move.
 */
export function webcamPanelScale(bottom: number | undefined, top = 0): number {
    if (bottom === undefined || !(bottom > WEBCAM_PANEL_BOTTOM)) return 1;
    return (WEBCAM_PANEL_BOTTOM - top) / (bottom - top);
}

/** Space kept between the enemy team's last row and a trainer picture under it. */
const ART_GAP = 6;
/** Less room than this under the team and the trainer picture is not drawn in Webcam Mode (teams of four or more). */
export const WEBCAM_ART_MIN_HEIGHT = 120;

/**
 * Where a trainer picture goes in Webcam Mode (Scott, 2026-11-17): its shape never changes and it never covers the
 * team. The picture (a full 1920x1080 canvas, the trainer at the bottom right) is scaled evenly to fit between the
 * team's last row (`teamBottom`, canvas px) and `WEBCAM_PANEL_BOTTOM`, its bottom right corner kept where the picture
 * has it across and moved up to the webcam line. `null`: no room, or a picture with no measured box
 * (`trainerArtBoxes.json`, made by `tools/assets/trainer-art-boxes.ts`), so it is not drawn.
 */
export function webcamArtStyle(src: unknown, teamBottom: number | undefined): Record<string, string> | null {
    const box = typeof src === "string" ? (trainerArtBoxes as Record<string, number[]>)[src.replace(/^\.?\//, "")] : undefined;
    if (!box || teamBottom === undefined) return null;
    const [, top, right, bottom] = box;
    const room = WEBCAM_PANEL_BOTTOM - Math.min(teamBottom, WEBCAM_PANEL_BOTTOM) - ART_GAP;
    if (room < WEBCAM_ART_MIN_HEIGHT) return null;
    const scale = Math.min(1, room / (bottom - top));
    return {
        transform: `translate(0px, ${WEBCAM_PANEL_BOTTOM - bottom}px) scale(${scale})`,
        "transform-origin": `${right}px ${bottom}px`,
    };
}

/** `webcamArtStyle`, or a style that hides the picture when it has no room. */
export function webcamArtStyleOrHidden(src: unknown, teamBottom: number | undefined): Record<string, string> {
    return webcamArtStyle(src, teamBottom) ?? { display: "none" };
}

/** The `height: NNNpx` in an enemy panel's art crop style (every generation writes one), or `undefined`. */
export function cropHeight(crop: unknown): number | undefined {
    const text = Array.isArray(crop) ? crop.filter((x) => typeof x === "string").join(";") : crop;
    if (typeof text !== "string") return undefined;
    const match = /(?:^|[;\s])height:\s*([\d.]+)px/.exec(text);
    return match ? Number(match[1]) : undefined;
}
