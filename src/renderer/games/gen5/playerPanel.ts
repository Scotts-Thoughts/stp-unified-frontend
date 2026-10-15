/**
 * gen5's on-stream player pieces as data for the shared components in core/overlay/player/.
 */
import { toDisplayString } from "vue";
import type { FaultsNode } from "~/core/overlay/player/FaultsBox";
import { toDisplayString as moveText } from "vue";
import type { MoveChild, MoveNode, MoveRow } from "~/core/overlay/player/MoveList";
import type { PopupBoxLayout, PopupBoxProps } from "~/core/overlay/player/PopupBox";
import { allMovesOutOfPp } from "~/core/logic/struggle";
import { formatStage } from "~/core/logic/statFormat";
import { statsHeaderNames } from "~/core/logic/statFormat";
import type { ExpBarLayout, ExpBarTiming } from "~/core/overlay/player/ExpBar";
import type { TypeBadgesLayout } from "~/core/overlay/player/TypeBadges";
import type { InfoRowProps } from "~/core/overlay/player/InfoRow";
import type { StatChild, StatNode } from "~/core/overlay/player/StatTiles";

const frame = (picture: string): FaultsNode => ({
    class: "colored-image ds",
    style: { "--url": `url(images/gen5/ui/${picture})` },
    frame: true,
});
/** A label and its count, the count's number in a plain inner element. */
const labelled = (text: string, labelClass: string, count: "resets" | "blackouts", valueClass: string, id: string): FaultsNode[] => [
    { class: `genericLabels ${labelClass}`, text },
    { id, class: valueClass, sizeBy: count, children: [{ count }] },
];

/**
 * The faults box, in two places in the overlay: the frame among the panel pictures, the labels and counts after the
 * Ability and Held Item boxes. One box ("faults", "resets" or "blackouts") until both counts are above zero, as in
 * gens 1-4 (decision 17).
 */
export const faultsLayout = {
    frames: [{ children: [
        { ...frame("timer.svg"), show: ["None", "Resets", "Blackouts"] },
        { ...frame("timer_2.svg"), show: ["Both"] },
    ] }] as readonly FaultsNode[],
    counts: [{ children: [
        { only: ["None"], children: labelled("faults", "resetsLabel", "resets", "resets", "reset_counter") },
        { only: ["Resets"], children: labelled("resets", "resetsLabel", "resets", "resets", "reset_counter") },
        { only: ["Blackouts"], children: labelled("blackouts", "resetsLabel", "blackouts", "resets", "reset_counter") },
        { only: ["Both"], children: [
            ...labelled("resets", "resetsLabel_2", "resets", "resets_2", "reset_counter"),
            ...labelled("blackouts", "resetsLabel_3", "blackouts", "resets_3", "blackout_counter"),
        ] },
    ] }] as readonly FaultsNode[],
};

/** The faults count's font size by digit count (core/logic/faultMode.ts faultFontSize): gen1's 75 / 65 / 44 px, scaled to
 * this box's 68 px. */
export const faultsFontSizes = [68, 59, 40] as const;

/**
 * The stat tiles (core/overlay/player/StatTiles.ts), one `<div>` per stat: the stage modifier in battle, the label
 * (the vitamin's name in Vitamins mode) and the mode's value cells. `vm` is the overlay; every value is read the way
 * its template did, and `get_stat()` (all six stats) once instead of once per tile.
 */
export function statTiles(vm: any): StatChild[] {
    const mode = vm.stats_setting;
    const opacity = vm.statLabelOpacity();
    const team0 = vm.game.properties.player.team[0];
    const stats = mode == "Automatic" ? vm.get_stat() : null;
    const show = toDisplayString;
    return vm.stat_object.map((stat: any): StatNode => {
        const cells: StatChild[] = [];
        if (stat.name != "Hp" && vm.game.properties.meta.state.value == "Battle" && !vm.not_valid_battle_state) {
            cells.push({ key: "mod", children: [{
                class: `playerMods hp_spd_${stat.mod_abrv}Mod`,
                style: "font-family: play;",
                text: vm.stage_modifiers(vm.n_battle_data_fix.modifiers[stat.path].value),
            }] });
        }
        const labelClass = `stat_label_style stat_row_${stat[`stat_row`]} stat_column_${stat.label_column}`;
        cells.push(mode != "Vitamins"
            ? { key: "label", style: { opacity: opacity[stat.name] }, class: labelClass, text: stat.label }
            : { key: "vitamin", style: { opacity: opacity[stat.name] }, class: labelClass, text: stat.vitamin });

        const place = `stat_row_${stat[`stat_row`]} stat_column_${stat.value_column}`;
        const value = (key: string, cls: string, text: unknown): StatNode => ({ key, id: stat.abrv, class: cls, text });
        const detailed = (key: string, extra: string, text: string): StatNode =>
            value(key, `stat_value_style detailed_ev_stat_row_${stat[`stat_row`]} stat_column_${stat.value_column} ${extra}`, text);
        const ev = () => team0.evs[stat.path].value;
        switch (mode) {
            case "Base Stats": cells.push(value("base", `stat_value_style ${place}`, vm.g5PokemonData[vm.statsDisplaySpecies]?.base_stats[stat.path])); break;
            case "IVs":        cells.push(value("iv", `stat_value_style ${place} dv`, show(vm.get_iv(`${stat.name}`)) + "/31")); break;
            case "EVs":        cells.push(value("ev", `stat_value_style ${place} evs`, show(ev()) + "/255")); break;
            case "Vitamins":   cells.push(value("vitamins", `stat_value_style ${place} evs`, vm.vitamins_remaining(ev()))); break;
            case "Detailed EVs":
                cells.push(
                    detailed("dev1", "devs", show(ev()) + "/255"),
                    detailed("dev2", "percentage_evs", show(vm.decimalToPercentage(ev() / 255)) + "%"),
                    detailed("dev3", "ev_stats_gained", "+" + show(vm.calculate_ev_benefit(stat.path))),
                );
                break;
            case "Base Stats Median":  cells.push(value("median", `average_value_style ${place}`, vm.average_median_stats(stat.object_identifier).median)); break;
            case "Base Stats Average": cells.push(value("average", `average_value_style ${place}`, vm.average_median_stats(stat.object_identifier).average)); break;
            case "Automatic":          cells.push(value("auto", `stat_value_style ${place}`, stats[stat.abrv])); break;
        }
        return { children: cells };
    });
}

/** The exp bar. */
export const expBarLayouts: Record<"bar", ExpBarLayout> = {
    bar: { wrapper: "expBar", label: "exp_label", outer: "expMeterOuter expMeterStyle", inner: "expMeterInner expMeterStyle" },
};
export const expBarTiming: ExpBarTiming = { maxDuration: 500 };

export function expBarLabel(_vm: any): string {
    return "Exp:";
}

/** The badge row (core/overlay/player/BadgeRow.ts): each badge in a `<div>` while owned. */
export function badgeRow(vm: any) {
    const game = vm.selected_game;
    return {
        mode: "if" as const,
        imgClass: "badge",
        badges: vm.badges.map((x: number) => {
            const owned = vm.game.properties.player.badges[x].value == true && vm.game.properties.meta.state != `No Pokemon`;
            const src = !owned ? null
                : game == "Black" || game == "White" ? `images/gen5/badges/${x}.webp`
                : game == "Black 2" || game == "White 2" ? `images/gen5/badges/bw2/${x}.webp`
                : null;
            return { owned, src };
        }),
    };
}

/** The stats header's shared names (core/logic/statFormat.ts). */
export const statHeaders = statsHeaderNames("IVs", "EVs");

/* ---- The player's move list and the pop-up boxes (core/overlay/player/MoveList.ts, PopupBox.ts) ---- */

export interface MoveListData {
    /**
     * Which power cell the template drew: the battle one (Battle / From Battle, key 0), the party one (Overworld /
     * To Battle, key 1), or none in any other state.
     */
    powerCell: 0 | 1 | null;
    /** Slots 1-4; `null`: no move in the slot. Every move out of PP: Struggle in slot 1, then three `null`s. */
    rows: readonly (MoveRow | null)[];
}

/**
 * The Struggle row (every move out of PP). There is no gen5 decompilation; gen4's values are used (pokeplatinum:
 * typeless in effect, power 50, never misses, physical), so the "???" icon and 50, as in gen4.
 */
function struggleRow(vm: any): MoveRow {
    return {
        icon: "images/gen5/type-icons-circular/curse.webp",
        name: "Struggle",
        power: 50,
        category: vm.moveCategoryIcon("Struggle"),
        accuracy: `${moveText(vm.getAccuracy(vm.black_moves["Struggle"]?.accuracy, "Struggle"))}%`,
        pp: "-",
    };
}

/**
 * The move list (the overlay's `player_move_list`): each value worked out once per change, in the order the old
 * template asked for them (`typeEffectiveness` writes `move_fix_power_*`).
 */
export function playerMoveList(vm: any): MoveListData {
    const state = vm.game.properties.meta.state.value;
    const powerCell = state == "Battle" || state == "From Battle" ? 0 : state == "Overworld" || state == "To Battle" ? 1 : null;
    const known = [1, 2, 3, 4].filter((slot) => vm.getMove(`${slot}`));
    if (allMovesOutOfPp(known.map((slot) => vm.getPP(`${slot}`)))) {
        return { powerCell, rows: [struggleRow(vm), null, null, null] };
    }
    const rows = [1, 2, 3, 4].map((slot): MoveRow | null => {
        if (!vm.getMove(`${slot}`)) return null;
        const icon = `images/gen5/type-icons-circular/${vm.getMoveType(`${slot}`)}.webp`;
        const move = vm.getMove(`${slot}`);
        const moves = vm.n_battle_data_fix.moves;
        const power = powerCell === 0 ? vm.typeEffectiveness(moves[`move${slot}`]?.move.value, slot)
            : powerCell === 1 ? vm.typeEffectiveness(moves[slot - 1]?.move.value, slot)
            : undefined;
        const category = vm.moveCategoryIcon(move);
        const accuracy = `${moveText(vm.getAccuracy(vm.black_moves[move]?.accuracy, move))}%`;
        return { icon, name: move, power, category, accuracy, pp: vm.getPP(`${slot}`) };
    });
    return { powerCell, rows };
}

/** The column headers, on the top row's two tables. */
const moveHeaders: MoveNode = { tag: "tr", class: "g4movepool_header", children: [
    { tag: "th", class: "align_center g4mp_type", text: "Type" },
    { tag: "th", class: "align_left g4mp_move", text: "Move" },
    { tag: "th", class: "align_right g4mp_power", text: "Pwr." },
    { tag: "th", class: "align_center g4mp_category", text: "DC" },
    { tag: "th", class: "align_right g4mp_accuracy", text: "Acc." },
    { tag: "th", class: "align_right g4mp_pp", text: "PP" },
] };

/** One table per move slot, laid out 1 2 / 3 4; slot 1's type cell says g4mp_types (sic), the others g4mp_type. */
export function moveListLayout(list: MoveListData): MoveChild[] {
    return list.rows.map((row, i): MoveNode => {
        const slot = i + 1;
        return { tag: "table", key: slot, class: "posAbs g4movepool", style: `top: ${slot <= 2 ? 900 : 986}px; left: ${slot % 2 == 1 ? 457 : 966}px;`,
            children: [{ tag: "tbody", children: [
                slot <= 2 ? moveHeaders : null,
                row && { tag: "tr", children: [
                    { tag: "th", class: `align_left ${slot == 1 ? "g4mp_types" : "g4mp_type"}`, children: [
                        { tag: "img", class: "moveset_typeIcons centered-content dropshadow", src: row.icon },
                    ] },
                    { tag: "th", class: "align_left g4mp_move", text: row.name },
                    list.powerCell === null ? null : { tag: "th", key: list.powerCell, class: "align_right g4mp_power", text: row.power },
                    { tag: "th", class: "align_right g4mp_category", children: [
                        { tag: "img", class: "centered-content dropshadow", src: row.category },
                    ] },
                    { tag: "th", class: "align_right g4mp_accuracy", text: row.accuracy },
                    { tag: "th", class: "align_right g4mp_pp", text: row.pp },
                ] },
            ] }],
        };
    });
}

/** The accuracy and evasion boxes (`battle_popups`): captions lowercase with no colon, stages signed (decision 20). */
export const popupBoxes = {
    accuracy: { transition: "fade1", frameClass: "colored-image ds", frame: "images/gen5/ui/accuracy.svg",
        labelClass: "genericLabels accuracyModLabel", label: "accuracy", valueClass: "popUpsStyle accuracyMod" },
    evasion: { transition: "fade1", frameClass: "colored-image ds", frame: "images/gen5/ui/evasion.svg",
        labelClass: "genericLabels evasionModLabel", label: "evasion", valueClass: "popUpsStyle evasionMod" },
} satisfies Record<string, PopupBoxLayout>;

/** Each pop-up box's props (the overlay's `battle_popups`): when it shows and its value, worked out once per change. */
export function battlePopups(vm: any): Record<keyof typeof popupBoxes, PopupBoxProps> {
    const tint = `filter: saturate(${vm.ui_saturation})`;
    const box = (stat: "accuracy" | "evasion"): PopupBoxProps => {
        const stage = vm.get_acc_eva_mod(stat);
        return { ...popupBoxes[stat], frameStyle: tint, value: stage,
            shown: stage != 0 && vm.game.properties.meta.state == `Battle` };
    };
    return { accuracy: box("accuracy"), evasion: box("evasion") };
}

/** The type badges: the second type only when it differs. */
export const typeBadgesLayout: TypeBadgesLayout = {
    wrappers: ["posAbs type_icons_boundingBox center"],
    imgs: [{ type: 1, class: "type_icons" }, { type: 2, class: "type_icons", ifDual: true }],
};

/** The type badges' pictures (core/overlay/player/TypeBadges.ts): the overlay's getSoloMonType, once per type. */
export function typeBadges(vm: any) {
    const species = vm.game.properties.player.team[0].species.value ?? vm.starter;
    const type1 = vm.getSoloMonType(species, "type_1");
    const type2 = vm.getSoloMonType(species, "type_2");
    return {
        layout: typeBadgesLayout,
        src1: `images/gen5/type-icons/${vm.ui_type_icons_modifier}/${type1?.toLowerCase()}.webp`,
        src2: `images/gen5/type-icons/${vm.ui_type_icons_modifier}/${type2?.toLowerCase()}.webp`,
        dual: type1 != type2,
    };
}

/**
 * The Nature and Friendship / Total rows (core/overlay/player/InfoRow.ts). "Total:" is the base-stat, IV or EV total
 * in those modes; each `branch` is one of the old template's `v-if` branches.
 */
export function infoRows(vm: any): { nature: InfoRowProps; total: InfoRowProps } {
    const mode = vm.stats_setting;
    const row = (branch: number, label: string, value: unknown): InfoRowProps =>
        ({ labelClass: "friendship_label", label, valueClass: "friendship_value", value, branch });
    let total: InfoRowProps;
    if (mode == "Base Stats" || vm.stats_header == "Base Stats") total = row(0, "Total:", vm.get_base_stat_total());
    else if (mode == "Base Stats Detailed") total = row(1, "Total:", vm.get_base_stat_total());
    else if (mode == "IVs") total = row(2, "Total:", vm.get_iv_total());
    else if (mode == "EVs") total = row(3, "Total:", vm.get_effort_values());
    else total = row(4, "Friendship:", vm.get_friendship());
    return {
        nature: { labelClass: "nature_label", label: "Nature:", valueClass: "nature_value", value: vm.pkmnNature },
        total,
    };
}
