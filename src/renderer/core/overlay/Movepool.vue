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
    <slot></slot>
    <div v-if="!view.titleFirst" :class="view.titleClass">{{ view.title }}</div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from "vue";
import { movepoolFitStyle } from "../logic/movepoolFit";
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
 */
export default defineComponent({
    name: "Movepool",
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
        tableStyle(): string | undefined {
            const rows = this.view.groups.reduce((sum, group) => sum + group.rows.length, 0);
            return movepoolFitStyle(rows, this.view.fit);
        },
    },
});
</script>
