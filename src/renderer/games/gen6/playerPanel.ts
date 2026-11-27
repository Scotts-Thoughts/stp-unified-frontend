/**
 * The 3DS overlay's on-stream player pieces as data for the shared components in core/overlay/player/. The classes
 * and art are gen 5's (the two generations share one look: games/gen6/layout.ts), so each tree here mirrors
 * games/gen5/playerPanel.ts; the values come from the overlay's own `solo` model (Overlay.vue) instead of gen 5's
 * mapper paths.
 */
import { toDisplayString } from "vue";
import type { FaultsNode } from "~/core/overlay/player/FaultsBox";
import type { MoveChild, MoveNode, MoveRow } from "~/core/overlay/player/MoveList";
import type { PopupBoxLayout, PopupBoxProps } from "~/core/overlay/player/PopupBox";
import type { ExpBarLayout, ExpBarTiming } from "~/core/overlay/player/ExpBar";
import type { TypeBadgesLayout } from "~/core/overlay/player/TypeBadges";
import type { InfoRowProps } from "~/core/overlay/player/InfoRow";
import type { StatChild, StatNode } from "~/core/overlay/player/StatTiles";
import { statEvGauge, type EvGaugeLayout } from "~/core/overlay/player/evGauge";
import { evGaugeState, evTotal } from "~/core/logic/evGauge";
import { formatStage, statsHeaderNames } from "~/core/logic/statFormat";
import { allMovesOutOfPp } from "~/core/logic/struggle";
import { STAT_KEYS, type StatKey } from "./logic/battle";
import type { BadgeLayout } from "./games";

const frame = (frames: string, picture: string): FaultsNode => ({
    class: "colored-image ds",
    style: { "--url": `url(${frames}/ui/${picture})` },
    frame: true,
});
const labelled = (text: string, labelClass: string, count: "resets" | "blackouts", valueClass: string, id: string): FaultsNode[] => [
    { class: `genericLabels ${labelClass}`, text },
    { id, class: valueClass, sizeBy: count, children: [{ count }] },
];

/**
 * How far each badge layout moves the badge box's bottom edge, and the faults box under it, from gen 5's (gen 5 px):
 * the box is sized to the badges in it. The frames are images/gen6/ui/timer[_2]-<layout>.svg, drawn by
 * tools/gen6/make-badge-boxes.py with the same numbers (keep them equal). Gen 7 ("none") keeps gen 5's box.
 */
export const BADGE_BOX_DY: Record<BadgeLayout, number> = { case: 40, row: -48, stamps: 0, none: 0 };

/** X/Y's badge case: two rows of four cells filling the taller box's inside (x 58..390, y 121..253). */
export const BADGE_CELLS = { left: 58, top: 121, width: 83, height: 66, pad: 4 } as const;
/**
 * OR/AS: gen 3's badge row. Each badge's x range in gen 3's canvas (its picture is cut at that width and at gen 3's
 * row height, y 117..161, which centres the badges: tools/gen6/import-badges.py), drawn at gen 3's size (one gen 5 px
 * per gen 3 px) so all eight match. The row is spread to HOENN_ROW.left..right, the box's inside less an inset for its
 * round ends, keeping gen 3's order and spacing pattern, and centred on the inside's middle line, HOENN_ROW.middle
 * (measured in a capture: the shortened box shows y ~117.5..165.5 under the timer).
 */
export const HOENN_GEN3_BOXES = [[32, 69], [72, 109], [114, 145], [150, 184], [187, 223], [225, 259], [263, 297], [296, 327]] as const;
const HOENN_ROW = { left: 69, right: 378, middle: 141.5, height: 44 } as const;

/**
 * Gen 7's island stamps: one row of four cells across gen 7's box, which is kept as is (its angled sides would not
 * stretch well, and four round stamps fill it): its inside shows x ~48..399, y 117 (under the timer) to 215. The
 * stamps' pictures are cut close (tools/gen6/import-badges.py), so the four nearly touch across the box's middle.
 */
export const STAMP_CELLS = { left: 51.5, top: 123, width: 86, height: 86, pad: 0 } as const;

/** Where badge n sits in the badge box (gen 5 coordinates: the zone scales them), fitted to its place (`.tds-badge`). */
export function badgeCellStyle(n: number, layout: BadgeLayout): string {
    if (layout === "row") {
        const boxes = HOENN_GEN3_BOXES, r = HOENN_ROW;
        const centre = (i: number) => (boxes[i][0] + boxes[i][1]) / 2;
        const half = (i: number) => (boxes[i][1] - boxes[i][0]) / 2;
        const last = boxes.length - 1;
        // Gen 3's centres stretched so the first badge starts at r.left and the last ends at r.right.
        const stretch = (r.right - r.left - half(0) - half(last)) / (centre(last) - centre(0));
        const [x0, x1] = boxes[n];
        const left = r.left + half(0) + (centre(n) - centre(0)) * stretch - half(n);
        return `left: ${left}px; top: ${r.middle - r.height / 2}px; width: ${x1 - x0}px; height: ${r.height}px;`;
    }
    if (layout === "stamps") {
        const c = STAMP_CELLS;
        return `left: ${c.left + n * c.width + c.pad}px; top: ${c.top}px; width: ${c.width - 2 * c.pad}px; height: ${c.height}px;`;
    }
    const c = BADGE_CELLS;
    const left = c.left + (n % 4) * c.width + c.pad;
    const top = c.top + Math.floor(n / 4) * c.height + c.pad / 2;
    return `left: ${left}px; top: ${top}px; width: ${c.width - 2 * c.pad}px; height: ${c.height - c.pad}px;`;
}

/**
 * The faults box (core/overlay/player/FaultsBox.ts): gen 5's frames and its labels and counts. The frames carry the
 * badge box sized for the game's badges; Overlay.vue moves the counts by the same `BADGE_BOX_DY`.
 */
export function faultsLayout(layout: BadgeLayout, frames: string) {
    const name = (picture: string) => (BADGE_BOX_DY[layout] === 0 ? `${picture}.svg` : `${picture}-${layout}.svg`);
    return {
        frames: [{ children: [
            { ...frame(frames, name("timer")), show: ["None", "Resets", "Blackouts"] },
            { ...frame(frames, name("timer_2")), show: ["Both"] },
        ] }] as readonly FaultsNode[],
        counts: FAULT_COUNTS,
    };
}
const FAULT_COUNTS = [{ children: [
    { only: ["None"], children: labelled("faults", "resetsLabel", "resets", "resets", "reset_counter") },
    { only: ["Resets"], children: labelled("resets", "resetsLabel", "resets", "resets", "reset_counter") },
    { only: ["Blackouts"], children: labelled("blackouts", "resetsLabel", "blackouts", "resets", "reset_counter") },
    { only: ["Both"], children: [
        ...labelled("resets", "resetsLabel_2", "resets", "resets_2", "reset_counter"),
        ...labelled("blackouts", "resetsLabel_3", "blackouts", "resets_3", "blackout_counter"),
    ] },
] }] as readonly FaultsNode[];
export const faultsFontSizes = [68, 59, 40] as const;

/** Where gen 5's coloured stat tiles are, for the EV gauge (core/overlay/player/evGauge.ts). `side` is wider than gen 5's
    16 so the gauge clears gen 6's round tile corners (images/gen6/ui/stats_values.svg, ~25px radius); the tiles are 63
    tall and higher up than gen 5's (games/gen6/style.css, "The stats panel's rows"). */
export const evGaugeLayout: EvGaugeLayout = { left: [22, 225], top: [58, 125, 192], width: 197, height: 63, side: 24 };

export interface StatTile {
    key: StatKey;
    /** The value's element id (gen 5's: the harness and the stats sizing find the tile by it). */
    abrv: string;
    label: string;
    modClass: string;
    row: 1 | 2 | 3;
    labelColumn: 1 | 3;
    valueColumn: 2 | 4;
}

/** The six tiles in gen 5's arrangement: HP, Atk., Def. on the left; Spe., SpA., SpD. on the right. */
export const STAT_TILES: readonly StatTile[] = [
    { key: "hp", abrv: "Hp", label: "HP", modClass: "hp", row: 1, labelColumn: 1, valueColumn: 2 },
    { key: "attack", abrv: "Atk", label: "Atk.", modClass: "atk", row: 2, labelColumn: 1, valueColumn: 2 },
    { key: "defense", abrv: "Def", label: "Def.", modClass: "def", row: 3, labelColumn: 1, valueColumn: 2 },
    { key: "special_attack", abrv: "SpA", label: "SpA.", modClass: "spA", row: 2, labelColumn: 3, valueColumn: 4 },
    { key: "special_defense", abrv: "SpD", label: "SpD.", modClass: "spD", row: 3, labelColumn: 3, valueColumn: 4 },
    { key: "speed", abrv: "Spe", label: "Spe.", modClass: "spe", row: 1, labelColumn: 3, valueColumn: 4 },
];

export const statHeaders = statsHeaderNames("IVs", "EVs");

/** The stats header: the mode's name, or "Level N" over the regular stats. */
export function statsHeader(vm: any): string {
    const solo = vm.solo;
    switch (vm.stats_setting) {
        case "Base Stats": return "Base Stats";
        case "IVs": return statHeaders.individual;
        case "EVs": return statHeaders.effort;
    }
    return solo.present && solo.level > 0 && solo.level <= 100 ? `Level ${solo.level}` : "Base Stats";
}

/**
 * The stat tiles (core/overlay/player/StatTiles.ts): the stage badge in battle, the label, and the mode's value.
 * Automatic shows the stat with its stage applied (the stage itself is the badge); with no Pokemon, the base stats.
 */
export function statTiles(vm: any): StatChild[] {
    const solo = vm.solo;
    const header = String(vm.stats_header);
    const mode = header === "Base Stats" ? "Base Stats" : vm.stats_setting;
    const base = vm.base_stats;
    const gauge = mode === "Automatic" && vm.show_ev_gauge != false && header.startsWith("Level");
    const total = gauge ? evTotal(STAT_KEYS.map((key) => solo.evs[key])) : 0;
    return STAT_TILES.map((stat): StatNode => {
        const cells: StatChild[] = [];
        const stage = solo.stages[stat.key] ?? 0;
        const staged = stat.key !== "hp" && solo.inBattle && stage !== 0 && mode === "Automatic";
        if (stat.key !== "hp" && solo.inBattle && mode === "Automatic") {
            cells.push({ key: "mod", children: [{
                class: `playerMods hp_spd_${stat.modClass}Mod`,
                style: "font-family: play;",
                text: formatStage(stage),
            }] });
        }
        cells.push({
            key: "label",
            // .63 like gens 1-5's stat_label_opacity(); .1 while the stat has a stage change.
            style: { opacity: staged ? 0.1 : 0.63 },
            class: `stat_label_style stat_row_${stat.row} stat_column_${stat.labelColumn}`,
            text: stat.label,
        });
        const place = `stat_row_${stat.row} stat_column_${stat.valueColumn}`;
        const value = (key: string, cls: string, text: unknown): StatNode => ({ key, id: stat.abrv, class: cls, text });
        switch (mode) {
            case "Base Stats": cells.push(value("base", `stat_value_style ${place} stat_value_large`, base?.[stat.key])); break;
            case "IVs": cells.push(value("iv", `stat_value_style ${place} dv`, toDisplayString(solo.ivs[stat.key]) + "/31")); break;
            case "EVs": cells.push(value("ev", `stat_value_style ${place} evs`, toDisplayString(solo.evs[stat.key]) + "/252")); break;
            default:
                cells.push(value("auto", `stat_value_style ${place} stat_value_large`, solo.shownStats[stat.key]));
                if (gauge) cells.push(statEvGauge(evGaugeState(solo.evs[stat.key], "ev", total), evGaugeLayout, stat.valueColumn, stat.row));
        }
        return { children: cells };
    });
}

export const expBarLayouts: Record<"bar", ExpBarLayout> = {
    bar: { wrapper: "expBar", label: "exp_label", outer: "expMeterOuter expMeterStyle", inner: "expMeterInner expMeterStyle" },
};
export const expBarTiming: ExpBarTiming = { maxDuration: 500 };

/* ---- The player's move list ---- */

export interface MoveListData {
    rows: readonly (MoveRow | null)[];
}

const typeIcon = (type: unknown) => `images/gen5/type-icons-circular/${String(type ?? "undefined").toLowerCase()}.webp`;
const categoryIcon = (category: unknown) => `images/gen5/damageCategory/${category ?? "Status"}.webp`;

/** The move list (the overlay's `player_move_list`): each value worked out once per change. */
export function playerMoveList(vm: any): MoveListData {
    const solo = vm.solo;
    const known = solo.moves.filter((m: any) => m.name);
    if (solo.present && known.length && allMovesOutOfPp(known.map((m: any) => m.pp))) {
        // Struggle: typeless in effect, power 50, never misses (as gens 4-5 show it).
        return { rows: [{ icon: typeIcon("curse"), name: "Struggle", power: 50, category: categoryIcon("Physical"), accuracy: "-%", pp: "-" }, null, null, null] };
    }
    const rows = [0, 1, 2, 3].map((slot): MoveRow | null => {
        const move = solo.moves[slot];
        if (!move?.name) return null;
        const shown = vm.moveFacts(move.name);
        return { icon: typeIcon(shown.type), name: move.name, power: shown.power, category: categoryIcon(shown.category), accuracy: `${shown.accuracy}%`, pp: move.pp };
    });
    return { rows };
}

const moveHeaders: MoveNode = { tag: "tr", class: "g4movepool_header", children: [
    { tag: "th", class: "align_center g4mp_type", text: "Type" },
    { tag: "th", class: "align_left g4mp_move", text: "Move" },
    { tag: "th", class: "align_right g4mp_power", text: "Pwr." },
    { tag: "th", class: "align_center g4mp_category", text: "DC" },
    { tag: "th", class: "align_right g4mp_accuracy", text: "Acc." },
    { tag: "th", class: "align_right g4mp_pp", text: "PP" },
] };

/** One table per move slot, laid out 1 2 / 3 4, at gen 5's places (the moveset zone scales them). */
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
                    { tag: "th", class: "align_right g4mp_power", text: row.power },
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

/** The accuracy and evasion boxes: lowercase captions, signed stages. */
export const popupBoxes = {
    accuracy: { transition: "fade1", frameClass: "colored-image ds", frame: "ui/accuracy.svg",
        labelClass: "genericLabels accuracyModLabel", label: "accuracy", valueClass: "popUpsStyle accuracyMod" },
    evasion: { transition: "fade1", frameClass: "colored-image ds", frame: "ui/evasion.svg",
        labelClass: "genericLabels evasionModLabel", label: "evasion", valueClass: "popUpsStyle evasionMod" },
} satisfies Record<string, PopupBoxLayout>;

export function battlePopups(vm: any): Record<keyof typeof popupBoxes, PopupBoxProps> {
    const tint = `filter: saturate(${vm.ui_saturation})`;
    const box = (stat: "accuracy" | "evasion"): PopupBoxProps => {
        const stage = Number(vm.solo.stages[stat]) || 0;
        return { ...popupBoxes[stat], frame: `${vm.game_info.frames}/${popupBoxes[stat].frame}`, frameStyle: tint, value: formatStage(stage), shown: stage !== 0 && vm.solo.inBattle };
    };
    return { accuracy: box("accuracy"), evasion: box("evasion") };
}

/** The type badges: the second type only when it differs. */
export const typeBadgesLayout: TypeBadgesLayout = {
    wrappers: ["posAbs type_icons_boundingBox center"],
    imgs: [{ type: 1, class: "type_icons" }, { type: 2, class: "type_icons", ifDual: true }],
};

export function typeBadges(vm: any) {
    const entry = vm.shown_entry;
    const type1 = entry?.type_1 ?? "Normal";
    const type2 = entry?.type_2 ?? type1;
    return {
        layout: typeBadgesLayout,
        src1: `images/gen5/type-icons/2024/${String(type1).toLowerCase()}.webp`,
        src2: `images/gen5/type-icons/2024/${String(type2).toLowerCase()}.webp`,
        dual: type1 != type2,
    };
}

/** The Nature and Friendship / Total rows (core/overlay/player/InfoRow.ts). */
export function infoRows(vm: any): { nature: InfoRowProps; total: InfoRowProps } {
    const solo = vm.solo;
    const mode = String(vm.stats_header) === "Base Stats" ? "Base Stats" : vm.stats_setting;
    const row = (branch: number, label: string, value: unknown): InfoRowProps =>
        ({ labelClass: "friendship_label", label, valueClass: "friendship_value", value, branch });
    const sum = (values: Record<string, unknown> | null | undefined) => STAT_KEYS.reduce((total, key) => total + (Number(values?.[key]) || 0), 0);
    let total: InfoRowProps;
    if (mode == "Base Stats") total = row(0, "Total:", sum(vm.base_stats));
    else if (mode == "IVs") total = row(2, "Total:", sum(solo.ivs));
    else if (mode == "EVs") total = row(3, "Total:", sum(solo.evs));
    else total = row(4, "Friendship:", solo.present ? solo.friendship : "");
    return {
        nature: { labelClass: "nature_label", label: "Nature:", valueClass: "nature_value", value: solo.present ? solo.nature : "" },
        total,
    };
}
