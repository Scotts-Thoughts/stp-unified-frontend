/**
 * gen2's on-stream player pieces as data for the shared components in core/overlay/player/.
 */
import { toDisplayString } from "vue";
import type { FaultsNode } from "~/core/overlay/player/FaultsBox";
import { toDisplayString as moveText } from "vue";
import type { MoveChild, MoveNode } from "~/core/overlay/player/MoveList";
import type { PopupBoxLayout, PopupBoxProps } from "~/core/overlay/player/PopupBox";
import { allMovesOutOfPp } from "~/core/logic/struggle";
import { formatStage } from "~/core/logic/statFormat";
import { statsHeaderNames } from "~/core/logic/statFormat";
import type { ExpBarLayout, ExpBarTiming } from "~/core/overlay/player/ExpBar";
import type { TypeBadgesLayout } from "~/core/overlay/player/TypeBadges";
import type { StatChild, StatNode } from "~/core/overlay/player/StatTiles";

const frame = (picture: string): FaultsNode => ({
    class: "colored-image ds",
    style: { "--url": `url(images/gen2/ui/${picture})` },
    frame: true,
});

/**
 * The faults box, in three places in the overlay: the frames among the panel pictures, the labels with the move
 * headers, and the counts with the battle pop-ups.
 */
const frames: readonly FaultsNode[] = [
    { ...frame("timer_2.svg"), show: ["None"] },
    { ...frame("timer_2.svg"), show: ["Blackouts"] },
    { ...frame("timer_2.svg"), show: ["Resets"] },
    { ...frame("timer.svg"), show: ["Both"] },
];

const labels: readonly FaultsNode[] = [
    { show: ["None"], children: [{ class: "genericLabels resetsLabel_1", text: "faults" }] },
    { show: ["Resets"], children: [{ class: "genericLabels resetsLabel_1", text: "resets" }] },
    { show: ["Blackouts"], children: [{ class: "genericLabels blackoutLabel_1", text: "blackouts" }] },
    { show: ["Both"], children: [
        { class: "genericLabels resetsLabel", text: "resets" },
        { class: "genericLabels blackoutLabel", text: "blackouts" },
    ] },
];

const resetsSingle: FaultsNode = { class: "faults_style resets_1", sizeBy: "resets", children: [{ id: "reset_counter", count: "resets" }] };

const counts: readonly FaultsNode[] = [{
    children: [
        { show: ["None"], children: [resetsSingle] },
        { show: ["Resets"], children: [resetsSingle] },
        { show: ["Blackouts"], children: [{ class: "faults_style blackouts_1", id: "reset_counter", sizeBy: "blackouts", count: "blackouts" }] },
        { show: ["Both"], children: [
            { class: "faults_style resets", children: [{ id: "reset_counter", sizeBy: "resets", count: "resets" }] },
            { class: "faults_style blackouts", id: "reset_counter", sizeBy: "blackouts", count: "blackouts" },
        ] },
    ],
}];

export const faultsLayout = { frames, labels, counts };

/** The faults count's font size by digit count (core/logic/faultMode.ts faultFontSize): gen1's, the box being gen1's. */
export const faultsFontSizes = [75, 65, 44] as const;

/**
 * The stat tiles (core/overlay/player/StatTiles.ts), one `<div>` per stat: the stage modifier in battle, the label
 * (the vitamin's name in Vitamins mode) and the mode's value cells. `vm` is the overlay; every value is read the
 * way its template did, once per stat.
 */
export function statTiles(vm: any): StatChild[] {
    const mode = vm.stats_setting;
    const arrangement = vm.ui_stat_arrangement_modifier;
    const opacity = vm.statLabelOpacity();
    const team0 = vm.game.properties.player.team[0];
    const hiddenPower = mode == "Hidden Power"
        ? [60, 70, 80].map((level) => vm.calculate_stat(vm.starter, level))
        : [];
    return vm.stat_object.map((stat: any): StatNode => {
        const cells: StatChild[] = [];
        if (stat.name != "Hp" && vm.g2stateVariable == "Battle") {
            cells.push({ key: "mod", children: [{
                class: `mod_style ${arrangement}mod_${stat.mod_abrv}`,
                style: "font-family: play;",
                text: vm.stageModifiers(vm.batp()[`modStage${stat.mod_path}`]),
            }] });
        }
        const labelClass = `stat_label_style stat_row_${stat[`${arrangement}label_row`]} stat_column_${stat.label_column}`;
        cells.push(mode != "Vitamins"
            ? { key: "label", style: { opacity: opacity[stat.name] }, class: labelClass, text: stat.label }
            : { key: "vitamin", style: { opacity: opacity[stat.name] }, class: labelClass, text: stat.vitamin });

        const row = stat[`${arrangement}value_row`];
        const value = (key: string, extra: string, text: unknown): StatNode =>
            ({ key, class: `stat_value_style stat_row_${row} stat_column_${stat.value_column}${extra}`, text });
        const detailed = (key: string, extra: string, text: string): StatNode =>
            ({ key, class: `stat_value_style detailed_ev_stat_row_${row} stat_column_${stat.value_column} ${extra}`, text });
        const statExp = () => team0[`statExp${stat.name_stat_exp}`].value;
        const show = toDisplayString;
        switch (mode) {
            case "Base Stats": cells.push(value("base", "", vm.dexDataCrystal[vm.starter][stat.base_stat_path])); break;
            case "DVs":        cells.push(value("dv", " dv", show(vm.get_dv(`${stat.name}`)) + "/15")); break;
            case "EVs":        cells.push(value("ev", " evs", statExp())); break;
            case "Vitamins":   cells.push(value("vitamins", " evs", vm.statExp(statExp()))); break;
            case "Automatic":  cells.push(value("auto", "", vm.get_stat(`${stat.name}`))); break;
            case "Hidden Power":
                cells.push(
                    detailed("hp60", "devs", "Lv60: " + show(hiddenPower[0][stat.abrv])),
                    detailed("hp70", "percentage_evs", "Lv70: " + show(hiddenPower[1][stat.abrv])),
                    detailed("hp80", "ev_stats_gained", "Lv80: " + show(hiddenPower[2][stat.abrv])),
                );
                break;
            case "Detailed EVs": {
                const exp = statExp();
                cells.push(
                    detailed("dev1", "devs", show(exp) + "/65535"),
                    detailed("dev2", "percentage_evs", show(vm.decimalToPercentage(exp / 65535)) + "%"),
                    detailed("dev3", "ev_stats_gained", "Stats: " + show(Math.floor(Math.sqrt(exp) / 4))),
                );
                break;
            }
            case "Badge Boosts":
                cells.push(
                    detailed("bb1", "devs", "Stat: " + show(team0[stat.path].value)),
                    detailed("bb2", "percentage_evs", "Boost: " + show(vm.get_bb_stat(`${stat.name}`))),
                    detailed("bb3", "ev_stats_gained", "Result: " + show(vm.get_stat(`${stat.name}`))),
                );
                break;
        }
        return { children: cells };
    });
}

/** The two exp bars: the 2024 style's in the stats panel, the 2023 style's under the move list. */
export const expBarLayouts: Record<"y2024" | "y2023", ExpBarLayout> = {
    y2024: { wrapper: "expBar", label: "posAbs exp_label_2024", outer: "posAbs expMeterStyle expMeterOuter_2024", inner: "expMeterStyle expMeterInner_2024" },
    y2023: { wrapper: "expBar", label: "posAbs exp_label", outer: "posAbs expMeterOuter", inner: "expMeterInner" },
};
export const expBarTiming: ExpBarTiming = { maxDuration: 650, levelUpWait: 250 };

/** The 2024 bar's label: "Exp:" in every state, as in every generation (decision 22; it showed "37%" outside Base Stats). */
export function expBarLabel(_vm: any): string {
    return "Exp:";
}

/** The badge rows (core/overlay/player/BadgeRow.ts): Johto's and Kanto's eight, shown with `v-show`. */
export function badgeRow(vm: any) {
    const row = (names: readonly string[]) => ({
        mode: "show" as const,
        imgClass: "canvas",
        badges: names.map((badge) => ({
            owned: vm.game.properties.player.badges[badge].value == true,
            src: `images/gen2/badges/progress bar/${badge}.webp`,
        })),
    });
    return { johto: row(vm.progressBadges), kanto: row(vm.progressBadges2) };
}

/** The stats header's shared names (core/logic/statFormat.ts). */
export const statHeaders = statsHeaderNames("DVs", "Stat Experience");

/* ---- The player's move list and the pop-up boxes (core/overlay/player/MoveList.ts, PopupBox.ts) ---- */

/** One move slot: a battle and an overworld copy of the type icon (`v-show`), and the copy of each cell on screen. */
interface MoveSlot {
    battle: boolean;
    overworldIcon: string | null;
    overworldIconShown: boolean;
    battleIcon: string | null;
    /** `undefined`: the cell is empty (neither of its `v-if` branches). */
    name: unknown;
    /** The power cell, or in damage-range mode the damage cell: its `:key` and text. */
    powerKey: unknown;
    power: unknown;
    percent: unknown;
    accuracy: unknown;
    pp: unknown;
}

export interface MoveListData {
    /** The damage-range toggle as stored (the template compared it `== true` / `== false`). */
    damageRanges: unknown;
    /** move1..move4; `null`: no move in the slot (`s1[move].value` is empty). Out of PP: Struggle, then three `null`s. */
    rows: readonly (MoveSlot | null)[];
}

/**
 * Struggle's type icon: pokecrystal's table lists it as Normal, but BattleCommand_Stab returns early for STRUGGLE, and
 * that command is where gen2 applies STAB, the type chart, weather and badge type boosts, so it hits every type at 1x
 * with power 50: the "???" icon, as gen3's row.
 */
const struggleIcon = "images/gen2/type-icons-circular/curse.webp";

/** The Struggle row (every move out of PP): power 50, PP "-". */
function struggleSlot(vm: any, battle: boolean, ranges: unknown): MoveSlot {
    const slot: MoveSlot = {
        battle, overworldIcon: struggleIcon, overworldIconShown: !battle, battleIcon: struggleIcon, name: "Struggle",
        powerKey: undefined, power: undefined, percent: undefined, accuracy: undefined, pp: undefined,
    };
    if (ranges == true) {
        slot.powerKey = 50;
        if (!battle) {
            slot.power = slot.percent = "N/A";
        } else {
            const props = vm.game.properties;
            const damage = vm.damage_calculation(props.battle.yourPokemon, props.battle.enemyPokemon, "Struggle", "Player");
            slot.power = `${moveText(damage.damageMin)}-${moveText(damage.damageMax)}`;
            slot.percent = `${moveText(damage.minPercentage)}-${moveText(damage.maxPercentage)}%`;
        }
    }
    if (ranges == false) {
        slot.powerKey = slot.power = 50;
        slot.accuracy = `${moveText(vm.moveAccuracyEvasionDynamic("Struggle"))}%`;
        slot.pp = "-";
    }
    return slot;
}

/**
 * The move list (the overlay's `player_move_list`): each value worked out once per change. The old template ran
 * `typeEffectiveness` twice per cell (`:key` and text) and `damage_calculation` twice per damage cell.
 */
export function playerMoveList(vm: any): MoveListData {
    const state = vm.g2stateVariable;
    const ranges = vm.damage_ranges;
    const s1 = vm.s1;
    const battleMon = vm.game.properties.battle.yourPokemon;
    const battle = state == "Battle";
    // Every move out of PP (core/logic/struggle.ts): the PP the list shows, the battle copy's in battle
    const known = vm.pkmnMoves.filter((move: string) => s1[move].value);
    const pps = known.map((move: string) => battle
        ? (battleMon[move].value != null ? battleMon[move + "pp"].value : null)
        : s1[move + "pp"].value);
    if (allMovesOutOfPp(pps)) {
        return { damageRanges: ranges, rows: [struggleSlot(vm, battle, ranges), null, null, null] };
    }
    const rows = vm.pkmnMoves.map((move: string): MoveSlot | null => {
        if (!s1[move].value) return null;
        const overworldIcon = vm.moveTypeIcon(s1[move].value);
        const slot: MoveSlot = {
            battle,
            overworldIcon,
            overworldIconShown: !battle && overworldIcon != null,
            battleIcon: vm.moveTypeIcon(vm.batp()[move].value),
            name: undefined, powerKey: undefined, power: undefined, percent: undefined, accuracy: undefined, pp: undefined,
        };
        const battleMove = battleMon[move].value;
        if (!battle && s1[move].value != null) slot.name = vm.move_name(vm.camelCase(s1[move].value));
        else if (battle && battleMove != null) slot.name = vm.move_name(vm.camelCase(battleMove));
        if (ranges == true) {
            slot.powerKey = vm.typeEffectiveness(battle ? battleMove : s1[move].value);
            if (!battle) {
                slot.power = "N/A";
                if (s1[move].value != null) slot.percent = "N/A";
            } else {
                const damage = vm.damage_calculation(battleMon, vm.game.properties.battle.enemyPokemon, s1[move].value, "Player");
                slot.power = `${moveText(damage.damageMin)}-${moveText(damage.damageMax)}`;
                if (battleMove != null) slot.percent = `${moveText(damage.minPercentage)}-${moveText(damage.maxPercentage)}%`;
            }
        }
        if (ranges == false) {
            slot.powerKey = slot.power = vm.typeEffectiveness(battle ? battleMove : s1[move].value);
            if (!battle && s1[move].value != null) {
                slot.accuracy = `${moveText(vm.moveAccuracyEvasionDynamic(s1[move].value))}%`;
                slot.pp = s1[move + "pp"].value;
            } else if (battle && battleMove != null) {
                slot.accuracy = `${moveText(vm.moveAccuracyEvasionDynamic(battleMove))}%`;
                slot.pp = battleMon[move.toString() + "pp"].value;
            }
        }
        return slot;
    });
    return { damageRanges: ranges, rows };
}

/** The cell on screen: the overworld copy is the `v-if` branch (key 0), the battle copy the `v-else(-if)` (key 1). */
const shownCopy = (row: MoveSlot, text: unknown): MoveChild =>
    text === undefined ? null : { key: row.battle ? 1 : 0, text };

export const moveListLayout = {
    /** The column headers (Title Case like the movepool's), in `.resetsContainer` beside the faults labels. */
    headers: (list: MoveListData): MoveChild[] => [
        { class: "timerTitle moves_header", text: "Move" },
        { show: list.damageRanges == true, children: [
            { class: "timerTitle moves_header", style: "left: 225px;", text: "Dmg." },
            { class: "timerTitle moves_header", style: "left: 298px;", text: "Range" },
        ] },
        { show: list.damageRanges == false, children: [
            { class: "timerTitle moves_header", style: "left: 208px;", text: "Pwr." },
            { class: "timerTitle moves_header", style: "left: 278px;", text: "Acc." },
            { class: "timerTitle moves_header", style: "left: 328px;", text: "PP" },
        ] },
    ],
    /** The moves: one `<tr>` per slot in `.movesetContainer`. */
    moves: (list: MoveListData): MoveChild[] => [{ tag: "table", children: [{ tag: "tbody", children: list.rows.map((row): MoveNode => {
        if (!row) return { tag: "tr", children: [] };
        const ranges = list.damageRanges == true;
        const powers = list.damageRanges == false;
        const power = (cls: string): MoveNode => ({ key: row.powerKey as MoveNode["key"], class: cls, text: row.power });
        return { tag: "tr", children: [
            { tag: "th", children: [
                { tag: "img", show: row.overworldIconShown, class: "movesetIcon", src: row.overworldIcon },
                { tag: "img", show: row.battle, class: "movesetIcon", src: row.battleIcon },
            ] },
            { tag: "th", class: "movesetName", children: [shownCopy(row, row.name)] },
            ranges ? { tag: "th", children: [power("moveset_damage_min")] } : null,
            ranges ? { tag: "th", class: "moveset_damage_min_percent", children: [shownCopy(row, row.percent)] } : null,
            powers ? { tag: "th", children: [power("movesetPower")] } : null,
            powers ? { tag: "th", class: "movesetAccuracy", children: [shownCopy(row, row.accuracy)] } : null,
            powers ? { tag: "th", class: "movesetPP", children: [shownCopy(row, row.pp)] } : null,
        ] };
    }) }] }],
};

const popupFrame = (picture: string) => `images/gen2/ui/${picture}`;

/**
 * The pop-up boxes (`battle_popups`). Accuracy, evasion and field are inside the Battle Pop Ups toggle; bonks and repel
 * follow only their own toggles. Captions lowercase with no colon, stages signed (decision 20).
 */
export const popupBoxes = {
    accuracy: { transition: "fade2", id: "accuracy", frameClass: "colored-image ds", frame: popupFrame("accuracy.svg"),
        labelClass: "accEvaStyle accEvaLabel accuracyLabel", label: "accuracy", valueClass: "accEvaStyle accEvaMod accuracyMod" },
    bonks: { transition: "fade2", lazy: true, id: "bonks", frameClass: "colored-image", frame: popupFrame("bonks.svg"),
        labelClass: "genericLabels bonksLabel", label: "bonks", valueClass: "popUpsStyle bonksValue" },
    bonksBesideBoth: { transition: "fade2", lazy: true, frameClass: "colored-image", frame: popupFrame("bonks_2.svg"),
        labelClass: "genericLabels bonksLabel_1", label: "bonks", valueClass: "popUpsStyle bonksValue_1" },
    repel: { transition: "fade2", lazy: true, frameClass: "colored-image", frame: popupFrame("repel.svg"),
        labelClass: "genericLabels repelLabel", label: "repel steps", valueClass: "popUpsStyle repelSteps" },
    repelBesideBoth: { transition: "fade2", lazy: true, frameClass: "colored-image", frame: popupFrame("repel_2.svg"),
        labelClass: "genericLabels repelLabel_1", label: "repel steps", valueClass: "popUpsStyle repelSteps_1" },
    evasion: { transition: "fade2", id: "evasion", frameClass: "colored-image ds", frame: popupFrame("evasion.svg"),
        labelClass: "accEvaStyle accEvaLabel evasionLabel", label: "evasion", valueClass: "accEvaStyle accEvaMod evasionMod" },
    field: { transition: "fade2", frameClass: "colored-image ds", frame: popupFrame("screens.svg"),
        labelClass: "accEvaStyle accEvaLabel screenLabel", label: "field", valueClass: "accEvaStyle accEvaMod screenTurns" },
} satisfies Record<string, PopupBoxLayout>;

/** Each pop-up box's props (the overlay's `battle_popups`): when it shows and its value, worked out once per change. */
export function battlePopups(vm: any): Record<keyof typeof popupBoxes, PopupBoxProps> {
    const state = vm.g2stateVariable;
    const inBattle = state == "Battle" || state == "From Battle";
    const mon = vm.batt.yourPokemon;
    const stagesRead = mon?.modStageAccuracy?.bytes < 0x0E;
    const tint = `filter: saturate(${vm.ui_saturation})`;
    const shadowTint = `${tint} drop-shadow(0px 0px 1px #000000)`;
    const both = vm.blackouts_resets == "Both";
    const bonk = vm.bonk == true && state == "Overworld";
    const bonks = () => vm.game.properties.patch.steps.bonks.value;
    const repel = vm.repel_counter == true && state == "Overworld" && vm.game.properties.squidgyExtras.repelStepsRemaining?.value > 0;
    const repelSteps = () => vm.game.properties.squidgyExtras.repelStepsRemaining.value;
    const expiring = vm.field_effect_first_expiring;
    return {
        accuracy: { ...popupBoxes.accuracy, frameStyle: shadowTint, value: formatStage(mon?.modStageAccuracy?.value),
            shown: Boolean(vm.battle_fade == true && mon?.modStageAccuracy?.value != 0 && inBattle && stagesRead) },
        bonks: { ...popupBoxes.bonks, frameStyle: tint, shown: bonk && !both, value: bonk && !both ? bonks() : null },
        bonksBesideBoth: { ...popupBoxes.bonksBesideBoth, frameStyle: tint, shown: bonk && both, value: bonk && both ? bonks() : null },
        repel: { ...popupBoxes.repel, frameStyle: tint, shown: repel && !both, value: repel && !both ? repelSteps() : null },
        repelBesideBoth: { ...popupBoxes.repelBesideBoth, frameStyle: tint, shown: repel && both, value: repel && both ? repelSteps() : null },
        evasion: { ...popupBoxes.evasion, frameStyle: shadowTint, value: formatStage(mon?.modStageEvasion?.value),
            shown: Boolean(vm.battle_fade == true && mon?.modStageEvasion?.value != 0 && inBattle && stagesRead) },
        field: { ...popupBoxes.field, frameStyle: shadowTint, shown: Boolean(inBattle && expiring[2] != 0 && stagesRead),
            value: `${moveText(expiring[0])}: ${moveText(expiring[2])}` },
    };
}

/** The type badges, both pictures hidden with the type icons toggle and the second for a single type. */
export const typeBadgesLayout: TypeBadgesLayout = {
    wrappers: ["typeIconContainer"],
    imgs: [{ type: 1, class: "type1", show: "any" }, { type: 2, class: "type1", show: "dual" }],
};

/** The type badges' pictures (core/overlay/player/TypeBadges.ts): the battle types in battle, else the species'. */
export function typeBadges(vm: any) {
    const type1 = vm.type1();
    const type2 = vm.type2();
    return {
        layout: typeBadgesLayout,
        src1: `images/gen2/type-icons/${vm.ui_type_icons_modifier}${type1.toLowerCase()}.webp`,
        src2: `images/gen2/type-icons/${vm.ui_type_icons_modifier}${type2.toLowerCase()}.webp`,
        dual: type1 != type2,
        shown: vm.typeIcons == true,
    };
}
