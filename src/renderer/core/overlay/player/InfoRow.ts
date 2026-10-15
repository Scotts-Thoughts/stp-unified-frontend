import { defineComponent, h, toDisplayString, type PropType } from "vue";

/** One caption and its value beside the stat tiles (Nature, Friendship / Total), as a generation's computed builds it. */
export interface InfoRowProps {
    labelClass: string;
    label: string;
    valueClass: string;
    value: unknown;
    /** Both inside a `<div>` with this key, the element a template `v-if` branch would be: a different key makes a
     * new element. Omitted: no wrapper. */
    branch?: string | number;
}

/**
 * A caption and its value in the stats box (C9 of docs/ui-audit/C-onstream-player.md): two `<div>`s, the value shown
 * as an interpolation shows it. Positions stay in each generation's `style.css`. gens 4-5 draw their Nature and
 * Friendship / Total rows with it; gen2's Held Item and gen3's rows keep their markup, because their captions sit
 * elsewhere in the overlay than their values (gen3) or the value has its own fade (gen2).
 */
export const InfoRow = defineComponent({
    name: "InfoRow",
    props: {
        labelClass: { type: String, required: true },
        label: { type: String, required: true },
        valueClass: { type: String, required: true },
        value: { type: null as unknown as PropType<unknown>, default: null },
        branch: { type: [String, Number] as PropType<string | number>, default: undefined },
    },
    render() {
        const row = [
            h("div", { class: this.labelClass }, this.label),
            h("div", { class: this.valueClass }, toDisplayString(this.value)),
        ];
        return this.branch === undefined ? row : h("div", { key: this.branch }, row);
    },
});
