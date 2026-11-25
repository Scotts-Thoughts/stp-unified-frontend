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
 * - Enemy team and Trainers (`core/overlay/EnemyTeamPanel.ts`): a team whose panel runs past the line is drawn with
 *   shorter rows (`webcamRowLayout`), so up to four Pokémon keep their size.
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

/**
 * The line the enemy team's rows end at when they are fitted above the webcam (`webcamRowLayout`): the outer edge of
 * the DS second-screen area's black frame in Secondary Screen (`images/genN/ui/second_screen_game_area.svg`, gens 4-5),
 * and the same line in Webcam Mode, so the team's last row sits as far above it as the rows sit apart.
 */
export const WEBCAM_ROWS_LINE = 746;

/**
 * Where a generation's enemy team art draws its Pokémon rows (canvas px, outer edges of each row's frame, its black
 * outline included). `cornerTop` / `cornerBottom`: how far the frame's corners (rounded or angled, and gens 1-4's
 * highlight in the bottom left) reach into the row from its top and bottom edge; only the straight part between
 * them is stretched or squeezed, so the corners keep their shape.
 */
export interface EnemyRowArt {
    tops: readonly number[];
    height: number;
    cornerTop: number;
    cornerBottom: number;
}

/** One row of a fitted team: drawn from canvas y `from` (its regular top) at `to`, `height` tall. */
export interface FittedRow {
    from: number;
    to: number;
    height: number;
    /** `height` over the regular height. */
    scale: number;
}

export interface FittedRows {
    rows: FittedRow[];
    /** The space between rows, and between the last row and `WEBCAM_ROWS_LINE`. */
    gap: number;
}

/** How many rows of `art` a panel art cut to `crop` px tall shows. */
export function rowCount(art: EnemyRowArt, crop: number | undefined): number {
    if (crop === undefined) return 0;
    return art.tops.filter((top) => top < crop).length;
}

/**
 * Webcam Mode and Secondary Screen (Scott, 2026-11-25): a team whose `count` rows don't fit above `WEBCAM_ROWS_LINE`
 * (five or six Pokémon) is drawn with shorter rows, the first one's top where it was and one gap everywhere: between
 * the rows and between the last row and the line. The gap is the art's smallest gap between two rows. Heights are
 * whole pixels (a leftover pixel goes to the first rows), so the frames' edges stay sharp. `null`: the team fits as
 * it is (four or fewer Pokémon), and nothing changes.
 */
export function webcamRowLayout(art: EnemyRowArt, count: number): FittedRows | null {
    const n = Math.min(count, art.tops.length);
    if (n === 0) return null;
    let gap = Infinity;
    for (let k = 1; k < art.tops.length; k++) gap = Math.min(gap, art.tops[k] - (art.tops[k - 1] + art.height));
    if (!Number.isFinite(gap)) gap = 0;
    if (art.tops[n - 1] + art.height + gap <= WEBCAM_ROWS_LINE) return null;
    const room = WEBCAM_ROWS_LINE - art.tops[0] - n * gap;
    const base = Math.floor(room / n);
    const extra = room - base * n;
    let y = art.tops[0];
    const rows = art.tops.slice(0, n).map((from, k): FittedRow => {
        const height = base + (k < extra ? 1 : 0);
        const row = { from, to: y, height, scale: height / art.height };
        y += height + gap;
        return row;
    });
    return { rows, gap };
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
