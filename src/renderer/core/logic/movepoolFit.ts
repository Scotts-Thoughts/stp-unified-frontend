/**
 * How the movepool table fits its rows into the right panel, in all five generations (Scott's decision 28,
 * docs/ui-uniformity-plan.md §6.2): a list that fits keeps the generation's normal row height and leaves
 * space below; a list too long for the panel shrinks its rows to fill it exactly, and its font with them.
 *
 * Until 2026-10-15 each generation had its own rule: gen1 shrank only Mew (a fixed 15px), gen2 shrank on
 * overflow, gen3 and gen5 stretched lists of 20 rows or more to fill the panel, gen4 from 12 rows. The
 * numbers below each generation's own (`MovepoolFit` in its view) are what its short lists showed and
 * how its long lists shrank, so only the stretching went.
 */
export interface MovepoolFit {
    /** Height in px the rows may fill: the table's height less the header row and the first row's padding. */
    containerHeight: number;
    /** Normal row line height in px. */
    lineHeight: number;
    /** Normal font size in px. */
    fontSize: number;
    /**
     * How fast the font shrinks with the rows: `fontSize * (rowLineHeight / fontFrom) ^ shrinkFactor`,
     * never above `fontSize`. 0 keeps the font, 1 shrinks it in step with the rows.
     */
    shrinkFactor: number;
    /** The row line height below which the font starts to shrink (default `lineHeight`). */
    fontFrom?: number;
    /**
     * The normal size is the stylesheet's own (gens 1-2), so a list that fits gets no inline style;
     * otherwise the normal size is written out.
     */
    normalFromCss?: boolean;
}

/** The table's inline style for `rows` move rows, or `undefined` for none. */
export function movepoolFitStyle(rows: number, fit: MovepoolFit): string | undefined {
    if (rows * fit.lineHeight <= fit.containerHeight) {
        return fit.normalFromCss ? undefined : `line-height: ${fit.lineHeight}px; font-size: ${fit.fontSize}px;`;
    }
    const lineHeight = fit.containerHeight / rows;
    const fontSize = Math.min(fit.fontSize, fit.fontSize * Math.pow(lineHeight / (fit.fontFrom ?? fit.lineHeight), fit.shrinkFactor));
    return `line-height: ${lineHeight}px; font-size: ${fontSize}px;`;
}
