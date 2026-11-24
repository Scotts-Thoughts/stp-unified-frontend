import "../../styles/player.css";
import type { StatNode } from "./StatTiles";
import type { EvGaugeState } from "../../logic/evGauge";

/**
 * Where a generation's stat tiles are, in the coordinates of the stat labels' containing block: the coloured tiles
 * are part of the background artwork, so the gauge is placed by number. Measured from harness captures.
 */
export interface EvGaugeLayout {
    /** Each tile column's left edge (left column, right column). */
    left: readonly [number, number];
    /** Each tile row's top edge (rows 1-3). */
    top: readonly [number, number, number];
    /** A tile's width and height. */
    width: number;
    height: number;
    /** Gap between the tile's side and the gauge (Black/White's cut corners need more). */
    side: number;
}

const PILL = 6;
const PILL_STEP = PILL + 1;
const PILLS_WIDTH = PILL_STEP * 10;
/** Gap between the gauge's bottom and the tile's. */
const BOTTOM = 3;
const HEIGHT = 4;

const px = (n: number) => `${n}px`;

/**
 * One tile's EV gauge (core/logic/evGauge.ts works out the fills and colour): a thin see-through case holding ten
 * pills and a bar. Every size is a whole pixel so the pills come out identical, and each fill's gradient is shifted
 * so the colour runs once across the whole gauge. Looks: core/styles/player.css.
 */
export function evGaugeNode(state: EvGaugeState, layout: EvGaugeLayout, column: 1 | 2, row: 1 | 2 | 3): StatNode {
    const width = layout.width - 2 * layout.side;
    const barWidth = width - PILLS_WIDTH;
    const fill = (offset: number, w: number, frac: number): StatNode => ({
        class: "ev_gauge_fill",
        style: {
            width: px(Math.round(w * frac)),
            "background-size": `${width}px 100%`,
            "background-position": `${-offset}px 0`,
        },
    });
    const pills: StatNode[] = state.pills.map((frac, k) => ({
        class: "ev_gauge_pill",
        style: { left: px(1 + k * PILL_STEP), width: px(PILL) },
        children: [fill(k * PILL_STEP, PILL, frac)],
    }));
    const bar: StatNode = {
        class: "ev_gauge_pill",
        style: { left: px(1 + PILLS_WIDTH), width: px(barWidth) },
        children: [fill(PILLS_WIDTH, barWidth, state.bar)],
    };
    return {
        key: "evgauge",
        class: `ev_gauge ev_gauge_${state.colour}`,
        style: {
            left: px(layout.left[column - 1] + layout.side - 1),
            top: px(layout.top[row - 1] + layout.height - BOTTOM - HEIGHT - 1),
            width: px(width + 2),
            height: px(HEIGHT + 2),
        },
        children: [...pills, bar],
    };
}

/** The gauge for the tile whose value sits in `valueColumn` (2: left tiles, 4: right tiles) and `row` (1-3). */
export function statEvGauge(state: EvGaugeState, layout: EvGaugeLayout, valueColumn: number, row: number): StatNode {
    return evGaugeNode(state, layout, valueColumn > 2 ? 2 : 1, (row >= 3 ? 3 : row <= 1 ? 1 : 2) as 1 | 2 | 3);
}
