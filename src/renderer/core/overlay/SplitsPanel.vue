<template>
    <div v-if="view.title" :class="view.title.class">{{ view.title.text }}</div>
    <div v-if="summary?.labelFirst" class="battle_summary_label">{{ summary.header }}</div>
    <table :class="table.class" :style="TABLE" cellspacing="0">
        <tbody ref="rowsBody">
            <tr :style="headRowStyle">
                <td v-for="(text, i) in view.head" :class="table.headClass" :style="headStyles[i]">{{ text }}</td>
            </tr>
            <tr v-for="row in view.rows">
                <td v-if="table.icon" :class="table.icon.cellClass" :style="ICON_CELL"><img :class="table.icon.imgClass" :style="iconFit" :src="row.icon"></td>
                <td v-for="(value, i) in row.cells" :style="i === row.cells.length - 1 ? [bodyStyles[i], row.diffStyle] : bodyStyles[i]">{{ value }}</td>
            </tr>
        </tbody>
    </table>
    <template v-if="summary">
        <div v-if="!summary.labelFirst" class="battle_summary_label">{{ summary.header }}</div>
        <table class="battle_summary_table" :style="TABLE" cellspacing="0">
            <tbody ref="summaryBody">
                <tr :style="headRowStyle">
                    <td :style="HEAD + NAME">Metric</td>
                    <td :style="HEAD + LAST">Value</td>
                </tr>
                <template v-for="row in summary.rows">
                    <tr v-if="'section' in row" :class="summary.sectionClass" :style="sectionStyle">
                        <td :style="FONT + NAME">{{ row.section }}</td>
                        <td></td>
                    </tr>
                    <tr v-else>
                        <td :style="FONT + NAME"><template v-for="(line, i) in row.label"><br v-if="i > 0">{{ line }}</template></td>
                        <td :style="FONT + LAST">{{ row.value }}</td>
                    </tr>
                </template>
            </tbody>
        </table>
    </template>
    <div ref="art" :class="view.art.class" :style="[view.art.style, frameFit?.top]"></div>
    <div v-if="frameFit" :class="view.art.class" :style="[view.art.style, frameFit.bottom]"></div>
</template>

<script lang="ts">
import { defineComponent, markRaw, type PropType, type StyleValue } from "vue";
import type { SplitsSummary, SplitsTable, SplitsView } from "./splitsView";

// The one look (docs/ui-uniformity-plan.md decision 29): rows at their natural height (the table is a block as tall as
// its rows, so they never stretch, and its background ends with them, where the frame now ends), an underlined header
// with a 1px outline, 16px text. The name column takes the width the times leave; each `style.css` keeps the table's
// place and width and the icon's size.
const FONT = "font-size: 16px;";
const HEAD = FONT + " text-decoration: underline;";
// The icon keeps 3px above and below, so it never touches the next icon, the header or the frame (each style.css's own
// vertical padding was lost to a `td { padding: 0 }` rule or only set the top).
const ICON = " width: 40px; text-align: left; padding-left: 5px; padding-top: 3px; padding-bottom: 3px;";
const ICON_IMG = { display: "block" };
const NAME = " width: 100%; text-align: left; padding-left: 5px;";
const TIME = " text-align: right; padding-left: 8px; white-space: nowrap;";
const LAST = TIME + " padding-right: 7px;";

/**
 * The Splits panel on the right side, in all five generations (docs/ui-uniformity-plan.md step
 * 5.3): the splits table (First: this run's times; Followup: the loaded comparison, this run and
 * the difference), the battle summary in Followup + Summary, and the panel art. Each generation
 * builds the `view` in one computed (`splitsView.ts`); the overlay keeps the panel's title and
 * wrappers where they were.
 *
 * Every class is the one the generations' own tables had (`splits_table`, `splits_table_old`,
 * `second_screen_splits_table`, `battle_summary_table`, `battle_summary_label`, `scaled_icon`,
 * `splitIcon`, `movepool_header`…), since each `style.css` and the parity harness key on them.
 *
 * The art's frame is drawn to the rows' height (`art.frameBottom`): the picture is cut just above its bottom
 * border, and that border, drawn a second time, is moved up to meet the last row. The sides are straight there,
 * so only they get shorter; the header is untouched. A list too long for the frame shrinks its icons (and so its
 * rows) until the last row ends inside it (`fitIcons`).
 */
export default defineComponent({
    name: "SplitsPanel",
    props: {
        view: { type: Object as PropType<SplitsView>, required: true },
    },
    data() {
        return {
            FONT, HEAD, NAME, LAST, TABLE: "display: block; height: auto;", ICON_CELL: FONT + ICON,
            /** How far, in the art's px, the frame's bottom border moves up (0: drawn as the picture has it). */
            frameShift: 0,
            /** The icons' height cap, in the art's px, when the rows at their own size would run past the frame. */
            iconCap: null as number | null,
            /** The icons' height, in the art's px, when last seen uncapped. */
            naturalIcon: 0,
            resizeObserver: null as ResizeObserver | null,
        };
    },
    mounted() {
        this.resizeObserver = markRaw(new ResizeObserver(() => this.fitFrame()));
        this.observeRows();
    },
    updated() {
        this.observeRows();
    },
    beforeUnmount() {
        this.resizeObserver?.disconnect();
    },
    computed: {
        /** The two pieces' clips when the frame is shortened, else `null` (one piece, the whole picture). */
        frameFit(): { top: StyleValue; bottom: StyleValue } | null {
            const bottom = this.view.art.frameBottom;
            if (bottom === undefined || this.frameShift <= 0) return null;
            return {
                top: { "clip-path": `inset(0 0 ${1080 - (bottom - this.frameShift)}px 0)` },
                bottom: { "clip-path": `inset(${bottom}px 0 0 0)`, transform: `translateY(-${this.frameShift}px)` },
            };
        },
        /**
         * The icon is a block, so no line gap sits under it and the rest of the row stays the same height whatever
         * the icon's (`fitIcons` relies on that). When capped, `object-fit` keeps its shape inside the box `style.css`
         * gives it.
         */
        iconFit(): StyleValue {
            return this.iconCap === null
                ? ICON_IMG
                : { ...ICON_IMG, "max-height": `${this.iconCap}px`, "object-fit": "contain", "object-position": "left center" };
        },
        table(): SplitsTable {
            return this.view.table;
        },
        summary(): SplitsSummary | undefined {
            return this.view.summary;
        },
        headRowStyle(): StyleValue {
            return { "background-color": this.view.headerColor, outline: "1px solid #000" };
        },
        /** Each column's role: the icon (when there is one), the name, then times; the last also pads the right. */
        columnStyles(): string[] {
            const first = this.table.icon ? 1 : 0;
            return this.view.head.map((_, i) =>
                i < first ? ICON : i === first ? NAME : i === this.view.head.length - 1 ? LAST : TIME);
        },
        headStyles(): string[] {
            return this.columnStyles.map((role) => HEAD + role);
        },
        /** The body styles of the columns after the icon. */
        bodyStyles(): string[] {
            return this.columnStyles.slice(this.table.icon ? 1 : 0).map((role) => FONT + role);
        },
        sectionStyle(): StyleValue {
            const outline = { outline: "1px solid #000" };
            const color = this.summary?.sectionColor;
            return color === undefined ? outline : { "background-color": color, ...outline };
        },
    },
    methods: {
        rowBodies(): HTMLElement[] {
            return [this.$refs.rowsBody, this.$refs.summaryBody].filter((el): el is HTMLElement => el instanceof HTMLElement);
        },
        /** Watches the row bodies' size (rows added, fonts loaded) and fits the frame to them. */
        observeRows(): void {
            const observer = this.resizeObserver;
            if (!observer) return;
            observer.disconnect();
            for (const body of this.rowBodies()) observer.observe(body);
            this.fitFrame();
        },
        /**
         * Caps the icons' height so every row ends inside the frame. The icon sets a row's height, and the rest of
         * the row (cell padding, the line's gap under an inline picture) stays the same, so the cap is the share of
         * the room under the header each row may take, less that rest. A list that fits keeps its icons' own size.
         */
        fitIcons(box: DOMRect, bottom: number): void {
            const body = this.$refs.rowsBody;
            const rows = body instanceof HTMLTableSectionElement ? body.rows : null;
            const img = rows && rows.length > 1 ? rows[1].querySelector("img") : null;
            if (!this.table.icon || !rows || !img) {
                this.iconCap = null;
                return;
            }
            const scale = 1080 / box.height;
            // The height max-height caps: the picture's own, without the padding some style.css files give it, unless
            // the box is border-box (gen3), where the cap takes the padding in.
            const css = getComputedStyle(img);
            const pad = css.boxSizing === "border-box" ? 0 : parseFloat(css.paddingTop) + parseFloat(css.paddingBottom);
            const imgHeight = (img.getBoundingClientRect().height - pad) * scale;
            if (imgHeight === 0) return; // not loaded yet; the row's resize brings us back
            if (this.iconCap === null) this.naturalIcon = imgHeight;
            const rest = rows[1].getBoundingClientRect().height * scale - imgHeight;
            const room = bottom - (rows[0].getBoundingClientRect().bottom - box.top) * scale;
            const fit = Math.floor((room / (rows.length - 1) - rest) * 10) / 10;
            const cap = fit >= this.naturalIcon ? null : fit / scale;
            if (cap !== this.iconCap) this.iconCap = cap;
        },
        /** Moves the frame's bottom border up to the lowest row, never below where the picture has it. */
        fitFrame(): void {
            const bottom = this.view.art.frameBottom;
            const art = this.$refs.art;
            const bodies = this.rowBodies();
            if (bottom === undefined || !(art instanceof HTMLElement) || bodies.length === 0) {
                this.frameShift = 0;
                this.iconCap = null;
                return;
            }
            // In the art's own px: the picture is 1080 high, whatever scale the overlay is drawn at.
            const box = art.getBoundingClientRect();
            if (box.height === 0) return;
            this.fitIcons(box, bottom);
            const rowsBottom = Math.max(...bodies.map((body) => body.getBoundingClientRect().bottom));
            const shift = Math.max(0, bottom - Math.ceil(((rowsBottom - box.top) * 1080) / box.height));
            if (shift !== this.frameShift) this.frameShift = shift;
        },
    },
});
</script>
