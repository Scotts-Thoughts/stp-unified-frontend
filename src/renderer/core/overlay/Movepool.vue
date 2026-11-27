<template>
    <div v-if="view.titleFirst" :class="view.titleClass">{{ view.title }}</div>
    <table class="movepoolDemo" cellspacing="0" :style="tableStyle">
        <tbody>
            <tr :class="view.headerClass" :style="headerStyle">
                <th class="movepool_header movepool_way">Way</th>
                <th class="movepool_header movepool_move">Move</th>
                <th class="movepool_header movepool_type">Type</th>
                <th v-if="view.dc" class="movepool_header movepool_type">DC</th>
                <th class="movepool_header movepool_tableC">Pwr.</th>
                <th class="movepool_header movepool_tableC">Acc.</th>
                <th class="movepool_header movepool_tableC">PP</th>
            </tr>
            <template v-for="group in view.groups">
                <tr v-for="row in group.rows" :class="{ 'first-row': row.first }" :style="group.struck.has(row.name ?? String(row.move)) ? STRUCK : STRIKABLE">
                    <td class="movepool_way">{{ row.way }}</td>
                    <td class="movepool_move">{{ row.move }}</td>
                    <td class="movepool_type" :class="row.typeClass" :style="row.typeColor === undefined ? undefined : { 'background-color': row.typeColor }">{{ row.type }}</td>
                    <td v-if="view.dc" class="movepool_type" :style="{ 'background-color': row.dcColor }">{{ row.dc }}</td>
                    <td class="movepool_tableC">{{ row.power }}</td>
                    <td class="movepool_tableC">{{ row.accuracy }}%</td>
                    <td class="movepool_tableC">{{ row.pp }}</td>
                </tr>
            </template>
        </tbody>
    </table>
    <slot v-if="!artCut"></slot>
    <template v-else>
        <art-piece :extra="artCut.top"><slot></slot></art-piece>
        <art-piece :extra="artCut.bottom"><slot></slot></art-piece>
    </template>
    <div v-if="!view.titleFirst" :class="view.titleClass">{{ view.title }}</div>
</template>

<script lang="ts">
import { defineComponent, type PropType, type StyleValue } from "vue";
import { movepoolFitStyle } from "../logic/movepoolFit";
import { webcamFrameShift } from "../logic/webcamMode";
import { ArtPiece } from "./ArtPiece";
import type { MovepoolView } from "./movepoolView";

/**
 * The movepool table on the right panel, in all five generations (docs/ui-uniformity-plan.md
 * step 5.1). Each generation builds the `view` in one computed (`movepoolView.ts`); the art
 * behind the table is the default slot, between the table and a title that comes last.
 *
 * Every class is the one the generations' own tables had (`movepoolDemo`, `movepool_header`,
 * `movepool_way/_move/_type/_tableC`, `first-row`, and the title class from the view), since
 * each `style.css` and the parity harness key on them. The cross-out stays an inline style for
 * the same reason: the harness keys elements by their classes. Every row can be crossed out, and
 * fades over 1.5 s either way.
 *
 * In Webcam Mode (`view.webcam`, `core/logic/webcamMode.ts`) the table is shortened and the art is drawn twice, as the
 * Splits panel draws its own: cut just above its bottom border, and that border moved up to meet the cut. With Webcam
 * Mode off the element tree is what it was.
 */
export default defineComponent({
    name: "Movepool",
    components: { ArtPiece },
    props: {
        view: { type: Object as PropType<MovepoolView>, required: true },
    },
    data() {
        return {
            STRIKABLE: "transition: opacity 1.5s;",
            STRUCK: "transition: opacity 1.5s; opacity: 0.4; text-decoration: line-through;",
        };
    },
    computed: {
        headerStyle(): Record<string, string> {
            return this.view.headerColor === undefined
                ? { outline: "2px solid #000" }
                : { "background-color": this.view.headerColor, outline: "2px solid #000" };
        },
        /** How far up the table's bottom and the art's bottom border move in Webcam Mode (0: off). */
        webcamShift(): number {
            const webcam = this.view.webcam;
            return webcam ? webcamFrameShift(webcam.frameBottom, webcam.limit) : 0;
        },
        tableStyle(): string | undefined {
            const rows = this.view.groups.reduce((sum, group) => sum + group.rows.length, 0);
            const shift = this.webcamShift;
            if (shift === 0 || !this.view.webcam) return movepoolFitStyle(rows, this.view.fit);
            const fit = { ...this.view.fit, containerHeight: this.view.fit.containerHeight - shift };
            const rowStyle = movepoolFitStyle(rows, fit, true) ?? "";
            return `${rowStyle} height: ${this.view.webcam.tableHeight - shift}px;`.trim();
        },
        /** The art's two pieces in Webcam Mode, else `null` (the slot as the generation wrote it). */
        artCut(): { top: StyleValue; bottom: StyleValue } | null {
            const webcam = this.view.webcam;
            const shift = this.webcamShift;
            if (!webcam || shift === 0) return null;
            return {
                top: { "clip-path": `inset(0 0 ${1080 - (webcam.frameBottom - shift)}px 0)` },
                bottom: { "clip-path": `inset(${webcam.frameBottom}px 0 0 0)`, transform: `translateY(-${shift}px)` },
            };
        },
    },
});
</script>
