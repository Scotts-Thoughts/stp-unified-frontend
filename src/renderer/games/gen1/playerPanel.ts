/**
 * gen1's on-stream player pieces as data for the shared components in core/overlay/player/.
 */
import type { FaultsNode } from "~/core/overlay/player/FaultsBox";
import { toDisplayString as moveText } from "vue";
import type { MoveChild, MoveNode, MoveRow } from "~/core/overlay/player/MoveList";
import type { PopupBoxLayout } from "~/core/overlay/player/PopupBox";
import { statsHeaderNames } from "~/core/logic/statFormat";
import type { ExpBarLayout, ExpBarTiming } from "~/core/overlay/player/ExpBar";
import type { TypeBadgesLayout } from "~/core/overlay/player/TypeBadges";

const frame = (picture: string): FaultsNode => ({
    class: "tinted-box",
    style: { "--drop-shadow": "0px 0px 1px #000000", "--url": `url(images/ui/${picture})` },
});

/** The faults box (components/left_panel/faults.vue): frames, then labels, then counts, in one element. */
export const faultsLayout: readonly FaultsNode[] = [{
    children: [
        { ...frame("timer_2.svg"), show: ["None", "Resets", "Blackouts"] },
        { ...frame("timer.svg"), show: ["Both"] },

        { show: ["None"], class: "genericLabels resetsLabel_1", text: "faults" },
        { show: ["Resets"], class: "genericLabels resetsLabel_1", text: "resets" },
        { show: ["Blackouts"], class: "genericLabels blackoutLabel_1", text: "blackouts" },
        { show: ["Both"], children: [
            { class: "genericLabels resetsLabel", text: "resets" },
            { class: "genericLabels blackoutLabel", text: "blackouts" },
        ] },

        { show: ["None", "Resets"], children: [
            { class: "faults_style resets_1", sizeBy: "resets", children: [{ id: "reset_counter", count: "resets" }] },
        ] },
        { show: ["Blackouts"], children: [
            { class: "faults_style blackouts_1", id: "reset_counter", sizeBy: "blackouts", count: "blackouts" },
        ] },
        { show: ["Both"], children: [
            { class: "faults_style resets", children: [{ id: "reset_counter", sizeBy: "resets", count: "resets" }] },
            { class: "faults_style blackouts", id: "reset_counter", sizeBy: "blackouts", count: "blackouts" },
        ] },
    ],
}];

/** The faults count's font size by digit count (core/logic/faultMode.ts faultFontSize). */
export const faultsFontSizes = [75, 65, 44] as const;

/** The exp bar (components/left_panel/exp_bar.vue); its "Exp:" label is in the stats panel (`.expLabelGen1`). */
export const expBarLayout: ExpBarLayout = {
    wrapper: "expBar",
    outer: "expMeterStyle expMeterOuter",
    inner: "expMeterStyle expMeterInner",
    innerId: "exp-bar",
};
export const expBarTiming: ExpBarTiming = { maxDuration: 600 };

/** The badge row (components/left_panel/badges.vue): eight badges shown with `v-show`. */
export const badgeRow = { mode: "show", imgClass: "canvas" } as const;
export const badgeImage = (n: number) => `images/badges/progress bar/badge${n}.webp`;

/** The stats header's shared names (core/logic/statFormat.ts). */
export const statHeaders = statsHeaderNames("DVs", "Stat Experience");

/* ---- The player's move list and the pop-up boxes (core/overlay/player/MoveList.ts, PopupBox.ts) ---- */

/** gen1's move list (components/left_panel/move_set.vue `move_list`). */
export interface MoveListData {
    /** A Pokemon is out (the game state is not "No Pokemon"). */
    shown: boolean;
    /** Every move is out of PP: the one Struggle row instead of the moves. */
    struggle: { power: unknown; accuracy: unknown } | null;
    /** move1..move4; `null`: no move in that slot. */
    rows: readonly (MoveRow | null)[];
}

const moveCell = (kind: string, slot: string) => `movesetStyling ${kind} ${slot}`;
const percentSign: MoveNode = { tag: "span", style: "font-size: 20px;", text: "%" };

/** The column headers (Title Case like the movepool's), then the moves in `.movesetContainer`. */
export function moveListLayout(list: MoveListData): MoveChild[] {
    const struggle = list.struggle;
    return [
        { class: "movesetLabel labelMoves", text: "Move" },
        { class: "movesetLabel labelPwr", text: "Pwr." },
        { class: "movesetLabel labelAcc", text: "Acc." },
        { class: "movesetLabel labelPP", text: "PP" },
        !list.shown ? null : { class: "movesetContainer", children: struggle ? [{ key: 0, children: [
            { tag: "img", class: moveCell("iconStyling", "move1icon"), src: "images/elements/type-icons/normal.webp" },
            { class: moveCell("moveStyling", "move1"), text: "Struggle" },
            { class: moveCell("powerStyling", "move1"), text: struggle.power },
            { class: moveCell("accuracyStyling", "move1"), children: [moveText(struggle.accuracy), percentSign] },
            { class: moveCell("ppStyling", "move1"), text: "-" },
        ] }] : list.rows.map((row, i): MoveNode => {
            const slot = `move${i + 1}`;
            return { children: [row && { children: [
                { tag: "img", class: moveCell("iconStyling", `${slot}icon`), src: row.icon },
                { class: moveCell("moveStyling", slot), text: row.name },
                { key: row.powerKey as MoveNode["key"], class: moveCell("powerStyling", slot), text: row.power },
                // "100%" with no space, like gens 2-5 and the Struggle row (the old template's line break gave "100 %")
                { class: moveCell("accuracyStyling", slot), children: [moveText(row.accuracy), percentSign] },
                { class: moveCell("ppStyling", slot), text: row.pp },
            ] }] };
        }) },
    ];
}

const popupFrame = (picture: string) => `images/ui/${picture}`;

/** The pop-up boxes (components/left_panel/pop_ups.vue, repel_counter.vue, bonk_counter.vue). */
export const popupBoxes = {
    accuracy: { transition: "fade", lazy: true, frameClass: "tinted-box", frame: popupFrame("accuracy.svg"),
        labelClass: "accuracyLabel", label: "accuracy", valueClass: "popUpsStyle accuracyMod" },
    evasion: { transition: "fade", lazy: true, frameClass: "tinted-box", frame: popupFrame("evasion.svg"),
        labelClass: "evasionLabel2", label: "evasion", valueClass: "popUpsStyle evasionMod" },
    /** The caption is the screen's ("screen" / "screens"), so it comes with the value. */
    screens: { transition: "fade", lazy: true, frameClass: "tinted-box", frame: popupFrame("screens.svg"),
        labelClass: "screensLabel", valueClass: "popUpsStyle screensValue" },
    /** One box when the faults box is single, the `_1` box beside a double faults box. */
    repel: { transition: "fade", lazy: true, frameClass: "tinted-box", frame: popupFrame("repel.svg"),
        labelClass: "repelLabel", label: "repel steps", valueClass: "popUpsStyle repelSteps" },
    repelBesideBoth: { transition: "fade", lazy: true, frameClass: "tinted-box", frame: popupFrame("repel_2.svg"),
        labelClass: "repelLabel_1", label: "repel steps", valueClass: "popUpsStyle repelSteps_1" },
    bonks: { transition: "fade", lazy: true, frameClass: "tinted-box", frame: popupFrame("bonks.svg"),
        labelClass: "bonksLabel", label: "bonks", valueClass: "popUpsStyle bonksValue" },
    bonksBesideBoth: { transition: "fade", lazy: true, frameClass: "tinted-box", frame: popupFrame("bonks_2.svg"),
        labelClass: "bonksLabel_1", label: "bonks", valueClass: "popUpsStyle bonksValue_1" },
    itemCount: { transition: "fade", lazy: true, frameClass: "tinted-box", frame: popupFrame("bonks.svg"),
        labelClass: "bonksLabel", label: "item count", valueClass: "popUpsStyle bonksValue" },
    itemCountBesideBoth: { transition: "fade", lazy: true, frameClass: "tinted-box", frame: popupFrame("bonks_2.svg"),
        labelClass: "bonksLabel_1", label: "item count", valueClass: "popUpsStyle bonksValue_1" },
} satisfies Record<string, PopupBoxLayout>;

/** The type badges (components/left_panel/type_icons.vue): the second type only when it differs. */
export const typeBadgesLayout: TypeBadgesLayout = {
    wrappers: ["typeContainer", "type"],
    imgs: [{ type: 1 }, { type: 2, ifDual: true }],
};
