import { defineComponent, h, type PropType } from "vue";

/** The stats in a hidden power spread, in the data's order (games/genN/data/hiddenpower-all.js). */
const SPREAD_STATS = ["hp", "atk", "def", "spe", "spa", "spd"];

/**
 * A dropdown of hidden power spreads with each number in its stat's colour, closed and open.
 *
 * It is a real `<select>` (saved values, shortcuts and `select.value` work as for any other),
 * using Chrome's customizable select (`appearance: base-select` in settings.css), which is what
 * lets an option hold coloured spans. It is written with `h()` because Vue's template checks
 * reject a `<span>` inside an `<option>`.
 *
 * Trap: `<selectedcontent>` copies the chosen option once and does not follow later edits to it
 * (checked on Electron 37), so the closed dropdown would keep showing the previous type's spread.
 * The key below rebuilds the whole select whenever the list changes.
 */
export default defineComponent({
    name: "StatSpreadSelect",
    props: {
        options: { type: Array as PropType<{ value: unknown; label?: string }[]>, required: true },
        value: { type: String, required: true },
        placeholder: { type: Object as PropType<{ value: string; label: string } | null>, default: null },
    },
    emits: ["change"],
    render() {
        const spread = (label: string) =>
            label.split(",").flatMap((part, i) => [
                ...(i > 0 ? [","] : []),
                h("span", { class: `stp-stat-${SPREAD_STATS[i]}` }, part),
            ]);
        return h(
            "select",
            {
                key: this.options.map((o) => o.label).join("|"),
                class: "stp-select stp-select-spread",
                value: this.value,
                onChange: (event: Event) => this.$emit("change", (event.target as HTMLSelectElement).value),
            },
            [
                h("button", { type: "button" }, [h("selectedcontent")]),
                ...(this.placeholder ? [h("option", { value: this.placeholder.value, disabled: true }, this.placeholder.label)] : []),
                ...this.options.map((o) => h("option", { value: String(o.value) }, spread(String(o.label ?? o.value)))),
            ],
        );
    },
});
