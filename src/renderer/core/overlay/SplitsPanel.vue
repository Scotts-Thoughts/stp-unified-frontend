<template>
    <div v-if="view.title" :class="view.title.class">{{ view.title.text }}</div>
    <div v-if="summary?.labelFirst" class="battle_summary_label">{{ summary.header }}</div>
    <table :class="table.class" :style="TABLE" cellspacing="0">
        <tbody>
            <tr :style="headRowStyle">
                <td v-for="(text, i) in view.head" :class="table.headClass" :style="headStyles[i]">{{ text }}</td>
            </tr>
            <tr v-for="row in view.rows">
                <td v-if="table.icon" :class="table.icon.cellClass" :style="ICON_CELL"><img :class="table.icon.imgClass" :src="row.icon"></td>
                <td v-for="(value, i) in row.cells" :style="i === row.cells.length - 1 ? [bodyStyles[i], row.diffStyle] : bodyStyles[i]">{{ value }}</td>
            </tr>
        </tbody>
    </table>
    <template v-if="summary">
        <div v-if="!summary.labelFirst" class="battle_summary_label">{{ summary.header }}</div>
        <table class="battle_summary_table" :style="TABLE" cellspacing="0">
            <tbody>
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
    <div :class="view.art.class" :style="view.art.style"></div>
</template>

<script lang="ts">
import { defineComponent, type PropType, type StyleValue } from "vue";
import type { SplitsSummary, SplitsTable, SplitsView } from "./splitsView";

// The one look (docs/ui-uniformity-plan.md decision 29): rows at their natural height (the table is a block, so its
// rows never stretch over the box `style.css` gives it), an underlined header with a 1px outline, 16px text. The name
// column takes the width the times leave; each `style.css` keeps the table's place and size and the icon's size.
const FONT = "font-size: 16px;";
const HEAD = FONT + " text-decoration: underline;";
const ICON = " width: 40px; text-align: left; padding-left: 5px;";
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
 */
export default defineComponent({
    name: "SplitsPanel",
    props: {
        view: { type: Object as PropType<SplitsView>, required: true },
    },
    data() {
        return { FONT, HEAD, NAME, LAST, TABLE: "display: block;", ICON_CELL: FONT + ICON };
    },
    computed: {
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
});
</script>
