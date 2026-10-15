/**
 * gen4's on-stream player pieces as data for the shared components in core/overlay/player/.
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
    style: { "--url": `url(images/gen4/new_ui/${picture})` },
    frame: true,
});
const label = (text: string, place: string): FaultsNode => ({ class: `fault_label ${place}`, text });
const value = (count: "resets" | "blackouts", place: string, id: string): FaultsNode =>
    ({ id, class: `faults_value ${place}`, sizeBy: count, count });

/** The faults box: one group per mode, each with its frame, labels and counts. */
export const faultsLayout: readonly FaultsNode[] = [{
    style: { position: "absolute" },
    children: [
        { show: ["None"], children: [
            frame("timer.svg"), label("faults", "timer_reset_label"), value("resets", "timer_reset_value", "reset_counter_single"),
        ] },
        { show: ["Blackouts"], children: [
            frame("timer.svg"), label("blackouts", "timer_reset_label"), value("blackouts", "timer_reset_value", "reset_counter_single"),
        ] },
        { show: ["Resets"], children: [
            frame("timer.svg"), label("resets", "timer_reset_label"), value("resets", "timer_reset_value", "reset_counter_single"),
        ] },
        { show: ["Both"], children: [
            frame("timer_2.svg"),
            label("resets", "timer_2_reset_label"),
            label("blackouts", "blackout_2_reset_label"),
            value("resets", "timer_2_reset_value", "reset_counter"),
            value("blackouts", "timer_2_blackout_value", "blackout_counter"),
        ] },
    ],
}];

/** The faults count's font size by digit count (core/logic/faultMode.ts faultFontSize): gen1's 75 / 65 / 44 px, scaled to
 * this box's 68 px. */
export const faultsFontSizes = [68, 59, 40] as const;

/**
 * The stat tiles (core/overlay/player/StatTiles.ts), one `<div>` per stat: the stage modifier in battle, the label
 * (the vitamin's name in Vitamins mode) and the mode's value cell. `vm` is the overlay; every value is read the way
 * its template did, and `get_stat()` (all six stats) once instead of once per tile.
 */
export function statTiles(vm: any): StatChild[] {
    const mode = vm.stats_setting;
    const arrangement = vm.ui_stat_arrangement_modifier;
    const opacity = vm.statLabelOpacity();
    const team0 = vm.game.properties.player.team[0];
    const stats = mode == "Automatic" ? vm.get_stat() : null;
    const show = toDisplayString;
    return vm.stat_object.map((stat: any): StatNode => {
        const cells: StatChild[] = [];
        if (stat.name != "Hp" && vm.game.properties.meta.state.value == "Battle" && !vm.not_valid_battle_state) {
            cells.push({ key: "mod", children: [{
                class: `playerMods hp_spe_${stat.mod_abrv}Mod`,
                style: "font-family: play;",
                text: vm.stageModifiers(vm.game.properties.battle.player.active_pokemon.modifiers[stat.path].value),
            }] });
        }
        const labelClass = `stat_label_style stat_row_${stat[`${arrangement}label_row`]} stat_column_${stat.label_column}`;
        cells.push(mode != "Vitamins"
            ? { key: "label", style: { opacity: opacity[stat.name] }, class: labelClass, text: stat.label }
            : { key: "vitamin", style: { opacity: opacity[stat.name] }, class: labelClass, text: stat.vitamin });

        const place = `stat_row_${stat[`${arrangement}value_row`]} stat_column_${stat.value_column}`;
        const value = (key: string, extra: string, text: unknown, id?: string): StatNode =>
            ({ key, class: `stat_value_style ${place}${extra}`, id, text });
        const ev = () => team0.evs[stat.path].value;
        switch (mode) {
            case "Base Stats":   cells.push(value("base", "", vm.get_base_stat(stat.path))); break;
            case "IVs":          cells.push(value("iv", " dv", show(vm.get_iv(`${stat.name}`)) + "/31")); break;
            case "EVs":          cells.push(value("ev", " evs", show(ev()) + "/255")); break;
            case "Vitamins":     cells.push(value("vitamins", " evs", vm.vitamins_remaining(ev()))); break;
            case "Detailed EVs": cells.push(value("detailed", " evs", show(ev()) + "/255")); break;
            case "Automatic":    cells.push(value("auto", "", stats[stat.abrv], stat.abrv)); break;
            case "Base Stats Median":
                cells.push({ key: "median", class: `average_value_style ${place}`, text: vm.average_median_stats(stat.object_identifier).median });
                break;
            case "Base Stats Average":
                cells.push({ key: "average", class: `average_value_style ${place}`, text: vm.average_median_stats(stat.object_identifier).average });
                break;
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

/**
 * The badge rows (core/overlay/player/BadgeRow.ts), each badge in a `<div>` while owned: HG/SS's Johto or Kanto
 * row (only the one showing is built: the other's badges may not exist in the mapper), and the Sinnoh row, whose
 * boxes exist in every game but hold a picture only in Diamond/Pearl and Platinum.
 */
export function badgeRow(vm: any) {
    const game = vm.game.properties.meta.game_name.value;
    const row = (badges: any[], itemStyle: string | null = null) => ({ mode: "if" as const, imgClass: "badge", itemStyle, badges });
    const hgss = (indexes: number[], itemStyle: string | null) => row(indexes.map((x) => ({
        owned: vm.hgss_badge_check(x) == true,
        src: `images/gen4/new_ui/johto/${x}.webp`,
    })), itemStyle);
    const sinnohPictures = game == "Platinum" || game == "Diamond and Pearl";
    return {
        johto: game == "HeartGold and SoulSilver" && vm.kanto_badges == false ? hgss(vm.johto_badge_indexes, null) : null,
        kanto: game == "HeartGold and SoulSilver" && vm.kanto_badges != false ? hgss(vm.kanto_badge_indexes, "position: absolute; top: 1px;") : null,
        sinnoh: row(vm.badges.map((x: number) => {
            const owned = vm.game.properties.player.badges[x].value == true && vm.game.properties.meta.state != `No Pokemon`
                && vm.game.properties.meta.global_pointer.value != 0;
            return { owned, src: owned && sinnohPictures ? `images/gen4/new_ui/sinnoh/${x}.webp` : null };
        })),
    };
}

/** The stats header's shared names (core/logic/statFormat.ts). */
export const statHeaders = statsHeaderNames("IVs", "EVs");

/* ---- The player's move list and the pop-up boxes (core/overlay/player/MoveList.ts, PopupBox.ts) ---- */

export interface MoveListData {
    /** In a battle: the power cell is the battle one (the template's first `v-if`, key 0), else the party one (key 1). */
    battle: boolean;
    /** Slots 1-4; `null`: no move in the slot. Every move out of PP: Struggle in slot 1, then three `null`s. */
    rows: readonly (MoveRow | null)[];
}

/**
 * The Struggle row (every move out of PP, pokeplatinum `BattleSystem_CheckInvalidMoves` == `STRUGGLING_ALL`). Its data
 * says Normal, power 50, accuracy 0 (never misses), physical, but `BattleSystem_ApplyTypeChart` and
 * `BattleSystem_CalcEffectiveness` return early for MOVE_STRUGGLE: no STAB, no type chart, so the "???" icon and 50.
 */
function struggleRow(vm: any): MoveRow {
    return {
        icon: "images/gen4/type-icons-circular/curse.webp",
        name: "Struggle",
        power: 50,
        category: vm.moveCategoryIcon("Struggle"),
        accuracy: `${moveText(vm.getAccuracy(vm.platinum_moves["Struggle"]?.Accuracy, "Struggle"))}%`,
        pp: "-",
    };
}

/**
 * The move list (the overlay's `player_move_list`): each value worked out once per change, in the order the old
 * template asked for them (`getAccuracy` reads `get_stat`, which writes `stat_fix_*`).
 */
export function playerMoveList(vm: any): MoveListData {
    const props = vm.game.properties;
    const battle = props.meta.state.value == "Battle";
    const known = [1, 2, 3, 4].filter((slot) => vm.getMoveObject(slot)?.move.value != null);
    if (allMovesOutOfPp(known.map((slot) => vm.getPP(slot)))) {
        return { battle, rows: [struggleRow(vm), null, null, null] };
    }
    const rows = [1, 2, 3, 4].map((slot): MoveRow | null => {
        if (!(vm.getMoveObject(slot)?.move.value != null)) return null;
        const icon = `images/gen4/type-icons-circular/${vm.getMoveType(slot)}.webp`;
        const move = vm.getMove(slot);
        const power = battle
            ? vm.typeEffectiveness(props.battle.player.active_pokemon.moves[slot - 1].move.value)
            : vm.typeEffectiveness(props.player.team[0].moves[slot - 1].move.value);
        const category = vm.moveCategoryIcon(move);
        const accuracy = `${moveText(vm.getAccuracy(vm.platinum_moves[move]?.Accuracy, move))}%`;
        return { icon, name: move, power, category, accuracy, pp: vm.getPP(slot) };
    });
    return { battle, rows };
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

/** One table per move slot, laid out 1 2 / 3 4; slot 1's type cell says g4mp_types (sic, no rule matches it). */
export function moveListLayout(list: MoveListData): MoveChild[] {
    return list.rows.map((row, i): MoveNode => {
        const slot = i + 1;
        return { tag: "table", class: "posAbs g4movepool", style: `top: ${slot <= 2 ? 900 : 986}px; left: ${slot % 2 == 1 ? 457 : 966}px;`,
            children: [{ tag: "tbody", children: [
                slot <= 2 ? moveHeaders : null,
                row && { tag: "tr", children: [
                    { tag: "th", class: slot == 1 ? "align_left g4mp_types" : "align_left g4mp_type", children: [
                        { tag: "img", class: "moveset_typeIcons centered-content dropshadow", src: row.icon },
                    ] },
                    { tag: "th", class: "align_left g4mp_move", text: row.name },
                    { tag: "th", key: list.battle ? 0 : 1, class: "align_right g4mp_power", text: row.power },
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
    accuracy: { transition: "fade1", frameClass: "colored-image ds", frame: "images/gen4/new_ui/accuracy.svg",
        labelClass: "genericLabels mod_label accuracyModLabel", label: "accuracy", valueClass: "popUpsStyle accuracyMod" },
    evasion: { transition: "fade1", frameClass: "colored-image ds", frame: "images/gen4/new_ui/evasion.svg",
        labelClass: "genericLabels mod_label evasionModLabel", label: "evasion", valueClass: "popUpsStyle evasionMod" },
} satisfies Record<string, PopupBoxLayout>;

/** Each pop-up box's props (the overlay's `battle_popups`): when it shows and its value, worked out once per change. */
export function battlePopups(vm: any): Record<keyof typeof popupBoxes, PopupBoxProps> {
    const props = vm.game.properties;
    const modifiers = props.battle.player.active_pokemon.modifiers;
    const tint = `filter: saturate(${vm.ui_saturation})`;
    const box = (stat: "accuracy" | "evasion"): PopupBoxProps => ({
        ...popupBoxes[stat], frameStyle: tint, value: formatStage(modifiers[stat].value),
        shown: modifiers[stat].value != null && modifiers[stat].value != 0 && props.meta.state.value == `Battle`,
    });
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
        src1: `images/gen4/type-icons/${vm.ui_type_icons_modifier}/${type1?.toLowerCase()}.webp`,
        src2: `images/gen4/type-icons/${vm.ui_type_icons_modifier}/${type2?.toLowerCase()}.webp`,
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
