/**
 * The 3DS overlay's layout (docs/gen6-3ds-overlay-plan.md §3, mockup A): one 1920x1080 canvas, the 3DS top screen
 * at exactly 3x in the middle, the bottom screen in a 4:3 slot at the bottom right.
 *
 * The panels are gen 5's own art and markup, drawn inside "zones": full-canvas boxes scaled and moved as a whole
 * (`zoneStyle`), so every element inside a zone keeps gen 5's coordinates and classes and the two generations
 * share one look. Each zone is anchored so the 13px side margins and the top (20) and bottom (1063: see BOTTOM_LINE) lines of
 * gens 4-5 hold here too. Numbers are canvas px unless they say "gen 5".
 */

export const CANVAS = { width: 1920, height: 1080 } as const;
/** Outer margin, and the gap between a column and the game border. */
export const SIDE = 13;
export const TOP_LINE = 20;
/* The bottom line is 1063, one below gens 4-5's 1062, so the margin under the bottom screen's edge (rows 1063..1079)
   is 17 rows, the same as the margin above the top screen's edge (rows 0..16). */
export const BOTTOM_LINE = 1063;

/** The top screen: 400x240 at 3x, inside a 2px black border (358..1562 x 17..741). */
export const TOP_SCREEN = { x: 360, y: 19, width: 1200, height: 720 } as const;
/** The bottom screen: 404x303 (exactly 4:3), inside a 2px black border (1499..1907 x 756..1063). */
export const BOTTOM_SCREEN = { x: 1501, y: 758, width: 404, height: 303 } as const;
const BORDER = 2;
export const TOP_SCREEN_OUTER_BOTTOM = TOP_SCREEN.y + TOP_SCREEN.height + BORDER; // 741

/** A side column's width: what is left of the top screen, less the two margins. */
export const COLUMN = TOP_SCREEN.x - BORDER - 2 * SIDE; // 332
export const RIGHT_COLUMN_X = TOP_SCREEN.x + TOP_SCREEN.width + BORDER + SIDE; // 1575

/** Gen 5's left panels are 420 wide (x 13..433). */
export const LEFT_SCALE = COLUMN / 420;
/** Gen 5's right panel frame is 415 wide (x 1489..1904), from y 18. */
/* Its outline reaches x 1486.59..1907.41 (movepool.svg); that outer edge is what fills the column, so the panel ends
   on the bottom screen's right edge instead of overhanging it by ~3px. */
export const RIGHT_SCALE = COLUMN / (1907.41 - 1486.59);
const GEN5_RIGHT = { x: 1486.59, y: 18 } as const;

/**
 * The stats panel (bottom left) is the mirror of the bottom screen's slot (bottom right): the same width and height
 * (408x307 with its border, 756..1063; the frame's outline sits 1px inside, see FRAME_BOTTOM). Gen 5's stats frame, outline included, is x 12..434 and y 765..1063; scaled to
 * 408 wide it would be 288 tall, so gen 6's own frame (images/gen6/ui/stats.svg, tools/gen6/make-rounded-ui.py) has
 * its top edge 17.5 gen 5 px higher, at 747.5, and the header moves up (games/gen6/style.css).
 */
export const STATS_WIDTH = BOTTOM_SCREEN.width + 2 * BORDER; // 408
export const STATS_SCALE = STATS_WIDTH / 422;
/* The frames' black edge is 1px and the bottom screen's is 2px, so the frames' outlines sit 1px inside the screen's outer
   edge (top 757, bottom 1062): the lit parts then match exactly (758..1060 for both). */
const FRAME_BOTTOM = BOTTOM_LINE - 1; // 1062
const STATS_TOP = BOTTOM_SCREEN.y - BORDER + 1; // 757
/** How much higher the stats panel's top is than gen 5's frame at the column's scale: the ball, type pill and art
 *  move up by it. */
const STATS_RISE = FRAME_BOTTOM - (1063 - 765) * LEFT_SCALE - STATS_TOP;

/** Gen 5's moveset band runs x 449..1471 (its frame 3px outside that); here its frame starts 13px after the stats
 *  panel and the band ends 13px before the bottom screen's border. */
const BOTTOM_X0 = SIDE + STATS_WIDTH + SIDE + 3;
const BOTTOM_X1 = BOTTOM_SCREEN.x - BORDER - SIDE - 3;
export const BOTTOM_SCALE = (BOTTOM_X1 - BOTTOM_X0) / 1022;
// Gen 5: ability band y 807..859 (outline 806..860), moveset frame y 880..1060 (outline 877..1063). Gen 6's moveset
// frame is MOVESET_TRIM gen 5 px shorter at the top (images/gen6/ui/moveset.svg, tools/gen6/make-rounded-ui.py MAPS),
// so it hugs its header row, and its bottom stays on the bottom line.
export const MOVESET_TRIM = 12;
/* The frame's outline bottom (gen 5's 1063) sits on the bottom line, level with the stats panel's and the bottom
   screen's outer edges (it was a pixel lower when gen 5's 1060 fill edge was pinned to canvas 1060). */
const MOVESET_OUTER_TOP = FRAME_BOTTOM - (1063 - 877 - MOVESET_TRIM) * BOTTOM_SCALE;
/** The ability band is centred in the space between the top screen's border and the moveset frame. */
const ABILITY_CENTRE_Y = (TOP_SCREEN_OUTER_BOTTOM + MOVESET_OUTER_TOP) / 2;

export interface Zone {
    scale: number;
    /** Where gen 5's canvas origin lands. */
    x: number;
    y: number;
}

/** A zone that puts gen 5's point (gx, gy) at (x, y), scaled. */
function zone(scale: number, gx: number, gy: number, x: number, y: number): Zone {
    return { scale, x: x - gx * scale, y: y - gy * scale };
}

export const ZONES = {
    /** Timer, badges, faults: anchored to the top line. */
    leftTop: zone(LEFT_SCALE, SIDE, TOP_LINE, SIDE, TOP_LINE),
    /** Stats, exp bar, nature rows: anchored to the bottom line, as wide as the bottom screen's slot. */
    leftBottom: zone(STATS_SCALE, 12, 1063, SIDE, FRAME_BOTTOM),
    /** The Poke Ball and the type pill on it: flush to the canvas edge, behind the stats, raised with the stats' top. */
    ball: zone(LEFT_SCALE, 0, BOTTOM_LINE, 0, BOTTOM_LINE - STATS_RISE),
    /** The ability and held item band. */
    ability: zone(BOTTOM_SCALE, 449, 833, BOTTOM_X0, ABILITY_CENTRE_Y),
    /** The moveset. */
    moveset: zone(BOTTOM_SCALE, 449, 1063, BOTTOM_X0, FRAME_BOTTOM),
    /** The right panel: movepool, enemy team, splits and trainer preview take turns in it. */
    right: zone(RIGHT_SCALE, GEN5_RIGHT.x, GEN5_RIGHT.y, RIGHT_COLUMN_X, GEN5_RIGHT.y),
} as const;

export function zoneStyle(z: Zone): string {
    return `transform: translate(${z.x.toFixed(4)}px, ${z.y.toFixed(4)}px) scale(${z.scale.toFixed(6)});`;
}

/** A canvas y as the right zone's own (gen 5) y. */
export function rightZoneY(canvasY: number): number {
    return (canvasY - ZONES.right.y) / ZONES.right.scale;
}

/**
 * Where the right panel stops, in the right zone's gen 5 coordinates. Gens 4-5 stop their shortened panels at fixed
 * lines (core/logic/webcamMode.ts: 730, 740, 746); here the panel's frame ends level with the top screen's border and
 * the enemy rows end one gap above the bottom screen's border.
 */
export const RIGHT_PANEL_LINES = {
    /** The inner edge of a frame's bottom border. The movepool and splits frames' outer edge is 8 gen 5 px lower
     *  (movepool.svg: 1055 inside, 1063 outside), which puts it level with the game border's outer edge. */
    frameBottom: Math.floor(rightZoneY(TOP_SCREEN_OUTER_BOTTOM) - 8),
    panelBottom: Math.floor(rightZoneY(TOP_SCREEN_OUTER_BOTTOM)),
    rowsLine: Math.floor(rightZoneY(BOTTOM_SCREEN.y - BORDER)),
} as const;

/** Where the species art stands: its feet on the Poke Ball, ART_SIZE tall, centred on the ball (mockup A). */
export const ART_SIZE = 440;
const BALL_FEET_GEN5_Y = 690;
const ART_FEET_Y = BOTTOM_LINE - STATS_RISE - (BOTTOM_LINE - BALL_FEET_GEN5_Y) * LEFT_SCALE;
export const ART_BOX = {
    left: Math.round((482 * LEFT_SCALE - ART_SIZE) / 2 + 6),
    top: Math.round(ART_FEET_Y - ART_SIZE),
    size: ART_SIZE,
} as const;
