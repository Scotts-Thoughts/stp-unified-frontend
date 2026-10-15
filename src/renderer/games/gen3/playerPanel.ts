/**
 * gen3's on-stream player pieces as data for the shared components in core/overlay/player/.
 */
import { toDisplayString } from "vue";
import type { FaultsNode } from "~/core/overlay/player/FaultsBox";
import { toDisplayString as moveText } from "vue";
import type { MoveChild, MoveNode, MoveRow } from "~/core/overlay/player/MoveList";
import type { PopupBoxLayout, PopupBoxProps } from "~/core/overlay/player/PopupBox";
import { formatStage } from "~/core/logic/statFormat";
import { statsHeaderNames } from "~/core/logic/statFormat";
import type { ExpBarLayout, ExpBarTiming } from "~/core/overlay/player/ExpBar";
import type { TypeBadgesLayout } from "~/core/overlay/player/TypeBadges";
import type { StatChild, StatNode } from "~/core/overlay/player/StatTiles";

const frame = (picture: string): FaultsNode => ({
    class: "colored-image ds",
    style: { "--url": `url(images/gen3/new_ui/${picture})` },
    frame: true,
});
const label = (text: string, place: string): FaultsNode => ({ class: `fault_label ${place}`, text });
const value = (count: "resets" | "blackouts", place: string, id: string): FaultsNode =>
    ({ id, class: `faults_value ${place}`, sizeBy: count, count });

/** The faults box: one group per mode, each with its frame, labels and counts. */
export const faultsLayout: readonly FaultsNode[] = [{
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
 * The stage modifiers in battle (core/overlay/player/StatTiles.ts): two blocks beside the stat tiles, one line per
 * stat, in the order of the current stat arrangement. Shown only outside Wally's tutorial (the overlay's `v-if`).
 */
export function statMods(vm: any): StatChild[] {
    const battle = vm.g3stateVariable == "Battle";
    const stage = (stat: string) => toDisplayString(vm.stageModifiers(vm.game.properties.battle.yourPokemon[`modStage${stat}`].value));
    const lines = (stats: string[]): StatChild[] =>
        stats.flatMap((stat, i): StatChild[] => [i == 0 ? stage(stat) : " " + stage(stat), { tag: "br" }]);
    const block = (key: string, special: string[]): StatNode => ({ key, children: [
        { class: "aDMods", show: battle, children: lines(["Attack", "Defense"]) },
        { class: "sSASDMods", show: battle, children: lines(special) },
    ] });
    const arrangement = vm.ui_stat_arrangement_modifier;
    return [
        arrangement == "hp_spe_" ? block("hp_spe_", ["SpecialAttack", "SpecialDefense", "Speed"]) : null,
        arrangement == "hp_spd_" ? block("hp_spd_", ["Speed", "SpecialAttack", "SpecialDefense"]) : null,
    ];
}

/**
 * The stat tiles (core/overlay/player/StatTiles.ts): the six labels (the vitamins' names in Vitamins and Comparison
 * modes), then the six stats' value cells for the current mode. `vm` is the overlay; every value is read the way
 * its template did, once per stat. Texts keep the template's spaces (" Stat: ").
 */
export function statTiles(vm: any): StatChild[] {
    const mode = vm.stats;
    const arrangement = vm.ui_stat_arrangement_modifier;
    const opacity = vm.stat_label_opacity();
    const team0 = vm.game.properties.player.team[0];
    const show = toDisplayString;
    const labels = vm.stat_object.map((stat: any): StatNode => {
        const cls = `stat_label_style stat_row_${stat[`${arrangement}label_row`]} stat_column_${stat.label_column}`;
        const style = { opacity: opacity?.[stat.name] };
        return { children: [mode != "Comparison" && mode != "Vitamins"
            ? { key: "label", style, class: cls, text: stat.label }
            : { key: "vitamin", style, class: cls, text: stat.vitamin }] };
    });
    const values = vm.stat_object.map((stat: any): StatNode => {
        const row = stat[`${arrangement}value_row`];
        const value = (key: string, extra: string, text: unknown, id?: string): StatNode =>
            ({ key, class: `stat_value_style stat_row_${row} stat_column_${stat.value_column}${extra}`, id, text });
        const detailed = (key: string, extra: string, text: string): StatNode =>
            ({ key, class: `stat_value_style detailed_ev_stat_row_${row} stat_column_${stat.value_column} ${extra}`, text });
        const ev = () => team0[`ev${stat.name_ev}`].value;
        const cells: StatChild[] = [];
        switch (mode) {
            case "Base Stats":
                cells.push(value("base", "", vm.statsDisplaySpecies == "Deoxys" ? vm.deoxys_form_base_stats[stat.name] :
                    vm.game_data.dexData[vm.statsDisplaySpecies][stat.base_stat_path]));
                break;
            case "IVs":       cells.push(value("iv", " dv", show(vm.get_iv(`${stat.name}`)) + "/31")); break;
            case "EVs":       cells.push(value("ev", " evs", ev())); break;
            case "Vitamins":  cells.push(value("vitamins", " evs", vm.vitamins_remaining(ev()))); break;
            case "Automatic": cells.push(value("auto", "", vm.get_stat(`${stat.name}`), `${stat.abrv}`)); break;
            case "Detailed EVs":
                cells.push(
                    detailed("dev1", "devs", show(ev()) + "/255"),
                    detailed("dev2", "percentage_evs", show(vm.decimalToPercentage(ev() / 255)) + "%"),
                    detailed("dev3", "ev_stats_gained", " Stats: " + show(Math.floor(ev() / 4))),
                );
                break;
            case "Badge Boosts":
                cells.push(
                    detailed("bb1", "devs", " Stat: " + show(team0[stat.path].value)),
                    detailed("bb2", "percentage_evs", " Boost: " + show(vm.get_bb_stat(`${stat.name}`))),
                    detailed("bb3", "ev_stats_gained", " Result: " + show(vm.get_stat(`${stat.name}`))),
                );
                break;
            case "Base Stats Average": cells.push(value("average", "", vm.average_median_stats(stat.object_identifier).average)); break;
            case "Base Stats Median":  cells.push(value("median", "", vm.average_median_stats(stat.object_identifier).median)); break;
            case "Comparison": {
                const td = (style: string, text: unknown): StatNode => ({ tag: "td", style, text });
                cells.push(
                    { key: "comparison", class: `stat_value_style comparison_row_${row} comparison_column_${stat.value_column} stat_avrg`, children: [
                        { tag: "table", class: "comparison_table", children: [{ tag: "tbody", children: [
                            { tag: "tr", children: [td("text-align: left; opacity: 0.65;", stat.label), { tag: "td", style: "text-align: right;" }] },
                            { tag: "tr", children: [td("text-align: left;", "Avrg:"), td("text-align: right;", vm.average_median_stats(stat.object_identifier).average)] },
                            { tag: "tr", children: [td("text-align: left;", "Medn:"), td("text-align: right;", vm.average_median_stats(stat.object_identifier).median)] },
                        ] }] },
                    ] },
                    { key: "starter", class: `stat_comparison_value_style stat_row_${row} stat_column_${stat.value_column}`,
                        text: vm.game_data.dexData[vm.starterString][stat.base_stat_path] },
                );
                break;
            }
        }
        return { children: cells };
    });
    return [...labels, ...values];
}

/** The exp bar: no wrapper class, the label after the bar. */
export const expBarLayouts: Record<"bar", ExpBarLayout> = {
    bar: { outer: "expMeterOuter", inner: "expMeterInner", label: "labelEXP", labelAfter: true },
};
/** Every change takes 200 ms; after a level-up the bar stays empty until the next change. */
export const expBarTiming: ExpBarTiming = { maxDuration: 650, fixedDuration: 200, refill: false };

/**
 * The exp label: "Exp:", as in every generation (decision 22; it showed the progress into the level, "37%", once
 * there was a Pokemon). The "labels" setting still hides it.
 */
export function expBarLabel(vm: any): string | null {
    return vm.labels == true ? "Exp:" : null;
}

/** The badge row (core/overlay/player/BadgeRow.ts): the region's eight, each in a `<div>` while owned. */
export function badgeRow(vm: any) {
    const region = vm.game_data.region.toLowerCase();
    return {
        mode: "if" as const,
        imgClass: "badge",
        badges: vm.badges.map((x: string) => ({
            owned: vm.game.properties.player.badges[x].value == true && vm.g3stateVariable != "Base Stats",
            src: `images/gen3/new_ui/badges/${region}/${x}.webp`,
        })),
    };
}

/** The stats header's shared names (core/logic/statFormat.ts). */
export const statHeaders = statsHeaderNames("IVs", "EVs");

/* ---- The player's move list and the pop-up boxes (core/overlay/player/MoveList.ts, PopupBox.ts) ---- */

/** One move slot (`v-for` item): its slot name ("move1"...) and the row, `null` when the slot is empty. */
interface MoveItem {
    /** The Wally tutorial's `:key`. */
    key?: unknown;
    slot: string;
    row: MoveRow | null;
}

export interface MoveListData {
    /** The Moveset toggle (`#moveset` is hidden with `v-show`). */
    shown: boolean;
    /**
     * Which of the old template's `v-if` branches is on screen (its key): 0 Wally's tutorial (buffered moves),
     * 1 / 2 Struggle (every move out of PP: party / battle), 3 Ditto in battle (the battle moves), 4 the moves.
     */
    branch: 0 | 1 | 2 | 3 | 4;
    /** Struggle's accuracy (branches 1 and 2). */
    struggleAccuracy?: unknown;
    items: readonly MoveItem[];
}

/** The move list (the overlay's `player_move_list`): each value worked out once per change. */
export function playerMoveList(vm: any): MoveListData {
    const shown = vm.moveset == true;
    const props = vm.game.properties;
    const state = vm.g3stateVariable;
    const team0 = props.player.team[0];
    const battleMon = props.battle.yourPokemon;
    const hasTeam = () => props.player.teamCount.value > 0 && props.player.teamCount.value < 10;
    const outOfPp = (mon: any) => mon.move1pp.value === 0 && mon.move2pp.value === 0 && mon.move3pp.value === 0 && mon.move4pp.value === 0;
    if (vm.wallyTutorialActive && vm.wallyTutorialBuffer) {
        return { shown, branch: 0, items: vm.wallyTutorialBuffer.moves.map((m: any): MoveItem => ({
            key: m?.slot, slot: m?.slot, row: m ? { name: m.name, power: m.power, accuracy: m.accuracy, pp: m.pp, icon: m.icon } : null,
        })) };
    }
    if (state != "Base Stats" && hasTeam() && outOfPp(team0)) {
        return { shown, branch: 1, struggleAccuracy: vm.moveAccuracyDynamic("Struggle"), items: [] };
    }
    if (state == "Battle" && hasTeam() && outOfPp(battleMon)) {
        return { shown, branch: 2, struggleAccuracy: vm.moveAccuracyDynamic("Struggle"), items: [] };
    }
    if (vm.starterString == "Ditto" && state == "Battle") {
        return { shown, branch: 3, items: vm.pkmnMoves.map((x: string): MoveItem => {
            if (!(team0.level.value > 0 && battleMon[x].value != null)) return { slot: x, row: null };
            const move = battleMon[x].value;
            return { slot: x, row: {
                name: vm.move_name(vm.camelCase(move)),
                power: vm.typeEffectiveness(move),
                accuracy: vm.moveAccuracyDynamic(move),
                pp: moveText(battleMon[x + "pp"]),
                icon: vm.moveTypeIcon(move),
            } };
        }) };
    }
    return { shown, branch: 4, items: vm.pkmnMoves.map((x: string): MoveItem => {
        if (!(team0.level.value > 0 && team0[x].value != null)) return { slot: x, row: null };
        const move = vm.get_player_move(x);
        return { slot: x, row: {
            name: move,
            power: vm.typeEffectiveness(move),
            accuracy: vm.moveAccuracyDynamic(move),
            pp: vm.get_player_move_pp(x),
            icon: vm.moveTypeIcon(move),
        } };
    }) };
}

const percentSign: MoveNode = { tag: "span", class: "movesetPercentage", text: "%" };
const moveCells = (slot: string, row: MoveRow): MoveChild[] => [
    { class: `movesetFontSize moveStyle ${slot}`, text: row.name },
    { class: `movesetSmallFontSize movePowerStyle movesetFontSize ${slot}power`, text: row.power },
    { class: `movesetSmallFontSize moveAccuracyStyle movesetFontSize ${slot}acc`, children: [moveText(row.accuracy), percentSign] },
    { class: `movesetSmallFontSize movePPStyle movesetFontSize ${slot}pp`, text: row.pp },
    { tag: "img", class: `movesetFontSize ${slot}icon`, src: row.icon },
];

/**
 * The column headers (Title Case like the movepool's; one set over each column of moves), then `#moveset`. The
 * Struggle row (every move out of PP, pokeemerald `AreAllMovesUnusable`): power 50 and the "???" icon, because
 * `Cmd_typecalc` skips Struggle (no STAB, no type chart) although its table type is Normal.
 */
export function moveListLayout(list: MoveListData): MoveChild[] {
    const headers = ["Type", "Move", "Pwr.", "Acc.", "PP", "Type", "Move", "Pwr.", "Acc.", "PP"];
    const struggle = list.branch == 1 || list.branch == 2;
    return [
        ...headers.map((text, i): MoveNode => ({ class: `movesetLabel movesetLabelColumn${i + 1}`, text })),
        { show: list.shown, id: "moveset", children: [{ key: list.branch, children: struggle
            ? moveCells("move1", { name: "Struggle", power: "50", accuracy: list.struggleAccuracy, pp: "-", icon: "images/gen3/elements/type-icons/curse.webp" })
            : list.items.map((item): MoveNode => ({
                key: list.branch == 0 ? item.key as MoveNode["key"] : undefined,
                children: [item.row && { children: moveCells(item.slot, item.row) }],
            })),
        }] },
    ];
}

/**
 * The pop-up boxes (`battle_popups`). The repel and Vs. Seeker counters use the accuracy and evasion boxes. Captions
 * lowercase with no colon, stages signed (decision 20).
 */
export const popupBoxes = {
    accuracy: { transition: "fadeBattle", frameClass: "colored-image ds", frame: "images/gen3/new_ui/accuracy.svg",
        labelClass: "accEvaStyle accEvaLabel accuracyLabel", label: "accuracy", valueClass: "accEvaStyle accEvaMod accuracyMod" },
    evasion: { transition: "fadeBattle", frameClass: "colored-image ds", frame: "images/gen3/new_ui/evasion.svg",
        labelClass: "accEvaStyle accEvaLabel evasionLabel", label: "evasion", valueClass: "accEvaStyle accEvaMod evasionMod" },
    field: { transition: "fadeBattle", frameClass: "colored-image ds", frame: "images/gen3/ui/field.svg",
        bodyClass: "playerFieldEffectsLarge", labelClass: "field_header", label: "field", valueClass: "field_effect" },
    repel: { transition: "fadeBattle", frameClass: "colored-image", frame: "images/gen3/new_ui/accuracy.svg",
        labelClass: "accEvaStyle accEvaLabel accuracyLabel", labelStyle: "font-size: 14px;", label: "repel steps",
        valueClass: "accEvaStyle accEvaMod accuracyMod" },
    vsSeeker: { transition: "fadeBattle", frameClass: "colored-image", frame: "images/gen3/ui/evasion.svg",
        labelClass: "accEvaStyle accEvaLabel evasionLabel", labelStyle: "font-size: 14px;", label: "vs. seeker",
        valueClass: "accEvaStyle accEvaMod evasionMod" },
} satisfies Record<string, PopupBoxLayout>;

/**
 * Each pop-up box's props (the overlay's `battle_popups`): when it shows and its value, worked out once per change.
 * The repel and Vs. Seeker boxes are `null` while their toggle is off (the template does not draw them then).
 */
export function battlePopups(vm: any): Record<"accuracy" | "evasion" | "field", PopupBoxProps> & Record<"repel" | "vsSeeker", PopupBoxProps | null> {
    const props = vm.game.properties;
    const state = vm.g3stateVariable;
    const inBattle = state == "Battle" || state == "From Battle";
    const mon = vm.batt.yourPokemon;
    const tint = `filter: saturate(${vm.ui_saturation})`;
    const expiring = vm.field_effect_first_expiring;
    return {
        accuracy: { ...popupBoxes.accuracy, frameStyle: tint, value: formatStage(mon?.modStageAccuracy?.value),
            shown: inBattle && mon?.modStageAccuracy?.value != `0` },
        evasion: { ...popupBoxes.evasion, frameStyle: tint, value: formatStage(mon?.modStageEvasion?.value),
            shown: inBattle && mon?.modStageEvasion?.value != `0` },
        field: { ...popupBoxes.field, frameStyle: tint, shown: inBattle && expiring[2] != 0,
            value: `${moveText(expiring[0])}: ${moveText(expiring[2])}` },
        repel: vm.repel_counter != true ? null : { ...popupBoxes.repel, frameStyle: tint,
            shown: state == "Overworld" && props.overworld.repelCount?.value > 0, value: props.overworld.repelCount?.value },
        vsSeeker: vm.vs_seeker != true ? null : { ...popupBoxes.vsSeeker, frameStyle: tint,
            shown: state == "Overworld" && props.events.got_vs_seeker.value == true && props.events.sys_vs_seeker_charging.value == true,
            value: props.player.vsSeeker.stepsUntilCharged.value },
    };
}

/** The type badges: a centred picture for a single type, two for a dual type. */
export const typeBadgesLayout: TypeBadgesLayout = {
    wrappers: ["typeIconContainer"],
    imgs: [
        { type: 1, id: "monoType", class: "types", show: "mono" },
        { type: 1, id: "type1", class: "types", show: "dual" },
        { type: 2, id: "type2", class: "types", show: "dual" },
    ],
};

/** The type badges' pictures (core/overlay/player/TypeBadges.ts): the overlay's getStarterType1/2. */
export function typeBadges(vm: any) {
    return {
        layout: typeBadgesLayout,
        src1: vm.getStarterType1,
        src2: vm.getStarterType2,
        dual: vm.getStarterType1 != vm.getStarterType2,
    };
}

/**
 * The Friendship box's caption and value (`labelFriendship`, `friendship`). "Total:" in the Base Stats, IVs and EVs
 * modes as in gens 4-5 (decision 25 of docs/ui-uniformity-plan.md): the base-stat total, the IV total of 186, the EV
 * total of 510; otherwise Friendship of 255 (Wally's tutorial: the buffered Pokemon's).
 */
export function friendshipRow(vm: any): { label: string; value: string } {
    const mode = vm.stats;
    const team0 = vm.game.properties.player.team[0];
    if (mode == "Base Stats" || vm.stats_header == "Base Stats") {
        const species = vm.evolution ? vm.selected_evolution_species : vm.starterString;
        return { label: "Total:", value: String(vm.game_data?.dexData?.[species]?.base_stats ? vm.get_base_stat_total() : 0) };
    }
    if (mode == "IVs") {
        const ivs = ["ivHp", "ivAttack", "ivDefense", "ivSpecialAttack", "ivSpecialDefense", "ivSpeed"];
        const total = ivs.reduce((sum, path) => sum + (Number(team0[path]?.value) || 0), 0);
        return { label: "Total:", value: `${total}/186` };
    }
    if (mode == "EVs" || mode == "Detailed EVs") return { label: "Total:", value: `${vm.ev_total}/510` };
    if (vm.wallyTutorialActive && vm.wallyTutorialBuffer) {
        return { label: "Friendship:", value: `${vm.wallyTutorialBuffer.friendship}/255` };
    }
    return { label: "Friendship:", value: `${team0.friendship}/255` };
}
