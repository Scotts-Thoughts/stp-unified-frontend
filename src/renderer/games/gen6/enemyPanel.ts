/**
 * The 3DS overlay's enemy team panel as data for the shared `core/overlay/EnemyTeamPanel.ts`. The element tree, the
 * classes and the art are gen 5's (`games/gen5/enemyPanel.ts`); the values are read from the battle itself: every
 * Pokemon of the opposing side has a battle record in memory (`battle.opponent_team`), so the panel needs no trainer
 * table. That is also why there is no "Trainers" preview here: these games have no trainer table in the app.
 */
import { toDisplayString, type StyleValue } from "vue";
import { SQUEEZED_TYPE_ICON, type EnemyChild, type EnemyNode } from "~/core/overlay/EnemyTeamPanel";
import { ENEMY_STAT_LABELS as L, enemyLevelText, FAINTED_TEXT, rowOf, type EnemySlotView, type EnemyTeamView } from "~/core/overlay/enemyTeamView";
import { speedColorClass, speedLabel, speedOrder } from "~/core/logic/speedLabel";
import { formatStage } from "~/core/logic/statFormat";
import { fitTrainerHeader } from "~/core/logic/trainerHeader";
import type { EnemyRowArt } from "~/core/logic/webcamMode";
import { withStage, type StatKey } from "./logic/battle";
import { dexEntry, speciesArtPath } from "./logic/species";
import type { GameData } from "./data";

/** Where `images/gen6/ui/opponent.svg` draws its rows (gen 5's numbers: the right zone keeps gen 5's coordinates). */
export const ENEMY_ROW_ART: EnemyRowArt = { tops: [68, 234, 401, 567, 734, 901], height: 162, cornerTop: 24, cornerBottom: 24 };

/** The panel art's height for a team of n. */
const HEIGHTS: Record<number, string> = { 1: "233px", 2: "399px", 3: "566px", 4: "733px", 5: "898px", 6: "1080px" };

const STATS: [label: string, side: "Left" | "Right", row: 1 | 2 | 3, stat: StatKey][] = [
    [L.hp, "Left", 1, "hp"], [L.attack, "Left", 2, "attack"], [L.defense, "Left", 3, "defense"],
    [L.special_attack, "Right", 2, "special_attack"], [L.special_defense, "Right", 3, "special_defense"], [L.speed, "Right", 1, "speed"],
];
const STAGED: StatKey[] = ["attack", "defense", "special_attack", "special_defense", "speed"];

/** One Pokemon of a side as the overlay reads it out of battle memory (Overlay.vue `readBattler`). */
export interface Battler {
    slot: number;
    species: string;
    level: number;
    ability: string | null;
    heldItem: string | null;
    hp: number;
    hpMax: number;
    stats: Record<StatKey, number>;
    stages: Record<string, number>;
    moves: { name: string | null; pp: number; ppMax: number }[];
}

export interface ThreeDsEnemySlot extends EnemySlotView {
    present: boolean;
    styles: { stats: StyleValue; comparison?: StyleValue; mon?: StyleValue; text?: StyleValue };
    types: { src: string; shown: boolean }[];
    labelsShown: boolean[];
    mods: { name: string; text: unknown; shown: boolean }[] | null;
}

export interface ThreeDsEnemyTeam extends EnemyTeamView<ThreeDsEnemySlot> {
    overlayColor: unknown;
    /** The game's frame pictures (games.ts `frames`). */
    frames: string;
}

const typeIcon = (type: unknown) => `images/gen5/type-icons-circular/${String(type ?? "undefined").toLowerCase()}.webp`;

function slotView(data: GameData, mon: Battler, playerSpeed: number): ThreeDsEnemySlot {
    const entry = dexEntry(data, mon.species);
    const fainted = !(mon.hp > 0);
    const order = speedOrder(playerSpeed, withStage(mon.stats.speed, mon.stages.speed));
    return {
        slot: mon.slot,
        present: true,
        styles: {
            stats: fainted ? "opacity: .5;" : undefined,
            comparison: fainted ? "opacity: .3; filter: grayscale(100%) drop-shadow(0px 1px 2px #000000);" : undefined,
            mon: fainted ? "filter: grayscale(100%);" : undefined,
            text: fainted ? FAINTED_TEXT : undefined,
        },
        speed: { label: speedLabel(order, "enemy"), svgClass: speedColorClass(order, fainted) },
        sprite: { src: speciesArtPath(data, mon.species), style: { filter: "drop-shadow(1px 1px 2px)" }, species: mon.species, resizing: false },
        types: [
            { src: typeIcon(entry?.type_1), shown: true },
            { src: typeIcon(entry?.type_2), shown: entry?.type_1 != entry?.type_2 },
        ],
        species: mon.species,
        level: mon.level,
        ability: mon.ability ?? "",
        // A stat's label gives way to its stage badge, as in gen 5; HP has no stage.
        labelsShown: STATS.map(([, , , stat]) => stat === "hp" || !mon.stages[stat]),
        stats: STATS.map(([, , , stat]) => ({ value: toDisplayString(stat === "hp" ? mon.hpMax : withStage(mon.stats[stat], mon.stages[stat])) })),
        moves: [0, 1, 2, 3].map((i) => {
            const name = mon.moves[i]?.name ?? null;
            return { known: name != null, icon: typeIcon(name ? data.moves[name]?.type : null), name };
        }),
        mods: STAGED.map((name) => ({ name, shown: !!mon.stages[name], text: formatStage(mon.stages[name]) })),
    };
}

/** The panel for the opposing side: a trainer's team, or the wild Pokemon under a "Wild <species>" header. */
export function enemyTeamView(vm: any, team: readonly Battler[], header: string): ThreeDsEnemyTeam {
    const data: GameData = vm.tables;
    const playerSpeed = Number(vm.solo.shownStats.speed) || 0;
    return {
        trainer: header,
        crop: `height: ${HEIGHTS[Math.max(1, Math.min(6, team.length))]}; filter: saturate(${vm.ui_saturation}) drop-shadow(0px 0px 1px #000000)`,
        overlayColor: vm.overlay_color,
        frames: vm.game_info.frames,
        slots: team.slice(0, 6).map((mon, row) => ({ ...slotView(data, mon, playerSpeed), row })),
    };
}

function slotNodes(slot: ThreeDsEnemySlot): EnemyNode {
    return {
        class: "eFaintTransition",
        children: [!slot.present ? null : {
            class: `border slots ePkmnStyle ePkmn${rowOf(slot)}`,
            children: [{
                style: slot.styles.mon,
                class: "eFaintTransition",
                children: [{
                    style: slot.styles.text,
                    class: "eFaintTransition",
                    children: [
                        {
                            tag: "img",
                            class: ["ePkmnSprite", { ePkmnSpriteResizing: !!slot.sprite.resizing }],
                            attrs: { "data-enemy-slot": slot.slot, "data-enemy-species": slot.sprite.species },
                            style: slot.sprite.style,
                            src: slot.sprite.src,
                        },
                        {
                            class: "border ePkmnTyping",
                            squeezeSize: SQUEEZED_TYPE_ICON,
                            squeezeOrigin: "right bottom",
                            children: [
                                { tag: "img", class: "icons moveIcon", src: slot.types[0].src },
                                { tag: "img", show: slot.types[1].shown, class: "icons moveIcon", src: slot.types[1].src },
                            ],
                        },
                        { class: "ePkmnLvlSpecies", text: slot.species },
                        { class: "ePkmnLevel", style: "opacity: .7;", text: enemyLevelText(slot.level) },
                        { class: "ePkmnAbility", style: "opacity: .7;", text: slot.ability },
                        { class: "speed_comparison", text: slot.speed.label },
                        ...STATS.map(([label, side, row], i): EnemyNode => ({
                            ...(i === 0 ? {} : { show: slot.labelsShown[i] }),
                            class: `enemyStatLabel eStatLabel eLabel${side} eLabel${row}`,
                            text: label,
                        })),
                        ...STATS.map(([, side, row], i): EnemyNode => ({
                            class: `align_right eStatValue eValue${side} eValue${row}`,
                            text: slot.stats[i].value,
                        })),
                        {
                            class: "border ePkmnMoves",
                            children: [{
                                tag: "table",
                                class: "enemyMovesetTable",
                                children: [{
                                    tag: "tbody",
                                    children: slot.moves.map((move): EnemyNode => ({
                                        tag: "tr",
                                        show: move.known,
                                        children: [
                                            { tag: "th", children: [{ tag: "img", class: "icons moveIcon", src: move.icon }] },
                                            { tag: "th", class: "align_left", style: "font-size: 14px;", text: move.name },
                                        ],
                                    })),
                                }],
                            }],
                        },
                        slot.mods === null ? null : {
                            class: "ePkmnStats",
                            children: [{
                                class: "enemyStatModTable",
                                children: slot.mods.map((mod): EnemyNode => ({ children: [{ show: mod.shown, class: ["enemyMod", `e_${mod.name}`], text: mod.text }] })),
                            }],
                        },
                    ],
                }],
            }],
        }],
    };
}

/** The panel inside the overlay's enemy team branch (gen 5's tree). */
export function enemyTeamLayout(view: ThreeDsEnemyTeam): EnemyChild[] {
    return [
        { key: 0, class: "trainerLabel", text: fitTrainerHeader(view.trainer, 24) },
        { frame: true, class: "colored-image ds", style: [view.crop, { "--url": `url(${view.frames}/ui/opponent.svg)` }] },
        ...view.slots.map((slot): EnemyNode => ({
            style: slot.styles.stats,
            children: [!slot.present ? null : {
                children: [
                    { tag: "img", class: ["canvas eFaintTransition", slot.speed.svgClass], style: [slot.styles.comparison, { left: "-1px" }], src: `${view.frames}/ui/speed_comp/${rowOf(slot)}.svg` },
                    { class: "colored-image", style: `--overlay-color: ${view.overlayColor}; --url: url(${view.frames}/ui/enemy_ui/${rowOf(slot)}.svg)` },
                    { tag: "img", src: `${view.frames}/enemy-area/stats/current_/${rowOf(slot)}.svg`, style: slot.styles.mon, class: "enemyPng eFaintTransition" },
                ],
            }],
        })),
        { class: "enemyGraphic", children: view.slots.map(slotNodes) },
    ];
}
