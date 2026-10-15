/**
 * gen5's enemy team panel (trainer battles) as data for the shared `core/overlay/EnemyTeamPanel.ts`: what the overlay
 * computes (`enemyTeamView`, read exactly as the old template read it, each value once per change) and the elements
 * it draws (`enemyTeamLayout`). Species, level and ability come from the trainer data (`enemy_mon_static`); stats,
 * moves and stat stages from the mapper.
 */
import { toDisplayString, type StyleValue } from "vue";
import type { EnemyChild, EnemyNode } from "~/core/overlay/EnemyTeamPanel";
import { ENEMY_STAT_LABELS as L, enemyLevelText, FAINTED_TEXT, type EnemySlotView, type EnemyTeamView } from "~/core/overlay/enemyTeamView";
import { speedColorClass, speedLabel, speedOrder } from "~/core/logic/speedLabel";
import { previewOf, trainerOptions, type PreviewTrainer } from "~/core/logic/trainerPreview";
import { trainers_black } from "./data/trainers_black.js";

/**
 * The stats in label order (decision 26: HP, Atk., Def. on the left, SpA., SpD., Spe. on the right): label, side and
 * row (the position classes), and the stat (its modifier hides the label; HP's label always shows).
 */
const STATS: [label: string, side: "Left" | "Right", row: 1 | 2 | 3, stat: string][] = [
    [L.hp, "Left", 1, "hp_max"], [L.attack, "Left", 2, "attack"], [L.defense, "Left", 3, "defense"],
    [L.special_attack, "Right", 1, "special_attack"], [L.special_defense, "Right", 2, "special_defense"], [L.speed, "Right", 3, "speed"],
];

export interface Gen5EnemySlot extends EnemySlotView {
    present: boolean;
    /** The slot's styles: `fade_stats`, `fade_enemy_mon_comparison`, `fade_enemy_mon`, `fade_enemy_mon_text`, `enemyFaint`. */
    styles: { stats: StyleValue; comparison?: StyleValue; mon?: StyleValue; text?: StyleValue; faint: StyleValue };
    types: { src: string; shown: boolean }[];
    /** Each stat label after HP is hidden while that stat has a stage (its badge shows instead). */
    labelsShown: boolean[];
    /** In battle: the stage badges (`modifier_values`). */
    mods: { name: string; text: unknown; shown: boolean }[] | null;
}

export interface Gen5EnemyTeam extends EnemyTeamView<Gen5EnemySlot> {
    double: boolean;
    overlayColor: unknown;
    /** The stats art's colour folder (`ui_type_color_modifier`). */
    statsArt: unknown;
    /** `getTrainerGraphic()`'s art, when it has one. */
    art: string | null;
    secondScreen: boolean;
}

export function enemyTeamView(vm: any): Gen5EnemyTeam {
    const props = vm.game.properties;
    const opponent = props.battle.opponent;
    const slots = vm.pkmnSlots.map((x: number): Gen5EnemySlot => {
        // Decision 26: a fainted Pokémon (greyscale, as before) and its art at half opacity (were .3 and .6).
        const stats = vm.fade_stats(x) ? "opacity: .5;" : undefined;
        const faint = vm.enemyFaint(x);
        if (!(x < opponent.team_count.value)) return { slot: x, present: false, styles: { stats, faint } } as Gen5EnemySlot;
        const mon = vm.enemy_mon_static[x];
        const team = opponent.team[x];
        const modifiers = opponent.pkmn_ram[`pokemon_${x}_ram`].modifiers;
        const speed = vm.speed_comparison(x, opponent.team[x]?.stats.speed.value).comparison;
        const species = mon?.species?.value;
        const entry = vm.g5PokemonData[mon?.species];
        return {
            slot: x,
            present: true,
            styles: { stats, comparison: vm.fade_enemy_mon_comparison(x), mon: vm.fade_enemy_mon(x), text: vm.fade_enemy_mon_text(x) ? FAINTED_TEXT : undefined, faint },
            speed: { label: speed, svgClass: vm.svgColorClass(speed, opponent.team[x]) },
            sprite: {
                src: `images/gen5/pokemon/${vm.speciesSpecialCharacters(mon?.species)}${vm.enemy_form(x, mon?.species.value)}.webp`,
                style: { transform: vm.enemyTransformFor(species), filter: `drop-shadow(${vm.getEnemySpriteFlipped(species) ? -1 : 1}px 1px 2px)` },
                species,
                resizing: vm.enemyResize.slot === x,
            },
            types: [
                { src: `images/gen5/type-icons-circular/${entry?.type_1?.toLowerCase()}.webp`, shown: true },
                { src: `images/gen5/type-icons-circular/${vm.g5PokemonData[mon?.species]?.type_2?.toLowerCase()}.webp`, shown: entry?.type_1 != vm.g5PokemonData[mon?.species]?.type_2 },
            ],
            species: mon?.species,
            level: mon?.level,
            ability: mon?.ability,
            labelsShown: STATS.map(([, , , stat], i) => i === 0 || modifiers?.[stat].value == 0),
            stats: STATS.map(([, , , stat], i) => ({
                value: toDisplayString(i === 0 ? team.stats.hp_max : vm.getEnemyStat(stat, team.stats[stat], x)),
            })),
            moves: [0, 1, 2, 3].map((i) => {
                const move = team.moves[i].move.value;
                return { known: move != null, icon: `images/gen5/type-icons-circular/${vm.black_moves[move]?.type?.toLowerCase()}.webp`, name: move };
            }),
            mods: props.meta.state.value == "Battle" ? vm.modifier_values.map((name: string) => ({
                name,
                shown: modifiers?.[name].value != 0,
                text: vm.stage_modifiers(modifiers?.[name].value),
            })) : null,
        };
    });
    const graphic = vm.getTrainerGraphic();
    return {
        double: props.battle.opponent_2?.value != null,
        trainer: props.battle.opponent_2?.value == null ? toDisplayString(opponent.trainer.value) + "'s Team" : "Double Battle Team",
        crop: vm.battlePokemonCrop,
        overlayColor: vm.overlay_color,
        statsArt: vm.ui_type_color_modifier,
        slots,
        art: graphic.state == true ? graphic.graphic : null,
        secondScreen: !!vm.second_screen_check,
    };
}

/** The panel art's height for a team of n (the overlay's `battlePokemonCrop`). */
const HEIGHTS: Record<number, string> = { 1: "233px", 2: "399px", 3: "566px", 4: "733px", 5: "898px", 6: "1080px" };

/** The edition's trainer table: Black and White share one; Black 2 / White 2 have none. */
const trainerTable = (vm: any): Record<string, any> | null =>
    vm.selected_game == "Black" || vm.selected_game == "White" ? trainers_black : null;

/** "a Youngster" + "Jimmy" -> "Youngster Jimmy". */
const trainerName = (t: any) => `${String(t.trainer_class ?? "").replace(/^an? /, "")} ${t.name ?? ""}`.trim();

/** The "Trainer" picker's options (the value is the table's trainer id). */
export function trainerPickerOptions(vm: any) {
    return trainerOptions(trainerTable(vm), trainerName, (t) => t.location, (t) => !!t.party?.length);
}

/** The picked trainer (`examined_trainer`), or null. */
export function previewTrainer(vm: any): PreviewTrainer | null {
    const entry = trainerTable(vm)?.[vm.examined_trainer];
    return previewOf(entry, entry ? trainerName(entry) : undefined);
}

/**
 * The trainer preview (decision 14) in the same panel: the picked trainer's team from the trainer table, with the
 * player's turn-order Speed (`get_stat().Spe`) against the table's Speed.
 */
export function trainerPreviewView(vm: any, trainer: PreviewTrainer): Gen5EnemyTeam {
    const player_speed = vm.get_stat().Spe;
    const slots = trainer.party.map((mon, x): Gen5EnemySlot => {
        const order = speedOrder(player_speed, mon.stats.speed);
        const entry = vm.g5PokemonData[mon.species];
        const stats = mon.stats as unknown as Record<string, unknown>;
        return {
            slot: x,
            present: true,
            styles: { stats: undefined, comparison: undefined, mon: undefined, text: undefined, faint: undefined },
            speed: { label: speedLabel(order, "enemy"), svgClass: speedColorClass(order, false) },
            sprite: {
                src: `images/gen5/pokemon/${vm.speciesSpecialCharacters(mon.species)}.webp`,
                style: { transform: vm.enemyTransformFor(mon.species), filter: `drop-shadow(${vm.getEnemySpriteFlipped(mon.species) ? -1 : 1}px 1px 2px)` },
                species: mon.species,
                resizing: false,
            },
            types: [
                { src: `images/gen5/type-icons-circular/${entry?.type_1?.toLowerCase()}.webp`, shown: true },
                { src: `images/gen5/type-icons-circular/${entry?.type_2?.toLowerCase()}.webp`, shown: entry?.type_1 != entry?.type_2 },
            ],
            species: mon.species,
            level: mon.level,
            ability: mon.ability,
            labelsShown: STATS.map(() => true),
            stats: STATS.map(([, , , stat]) => ({ value: stats[stat === "hp_max" ? "hp" : stat] })),
            moves: [0, 1, 2, 3].map((i) => ({
                known: mon.moves[i] != null,
                icon: `images/gen5/type-icons-circular/${vm.black_moves[mon.moves[i]]?.type?.toLowerCase()}.webp`,
                name: mon.moves[i],
            })),
            mods: null,
        };
    });
    return {
        double: false,
        trainer: trainer.header ?? trainer.name + "'s Team",
        crop: `height: ${HEIGHTS[trainer.party.length]}; filter: saturate(${vm.ui_saturation}) drop-shadow(0px 0px 1px #000000)`,
        overlayColor: vm.overlay_color,
        statsArt: vm.ui_type_color_modifier,
        slots,
        art: null,
        secondScreen: false,
    };
}

/**
 * The wild panel ("Show Wild Battles", decision 30): during a wild battle (state Battle, opponent trainer "--", as
 * `enemy_graphic` tells one), the wild Pokémon from the opponent's party in memory (`battle.opponent.team`, which is
 * `battle.wild` in the mapper), drawn as a trainer preview under a "Wild <species>" header. null otherwise. The speed
 * label is the preview's (the player's `get_stat().Spe` against the wild Pokémon's Speed); no stat stages, no faint.
 */
export function wildPreview(vm: any): PreviewTrainer | null {
    const props = vm.game.properties;
    const opponent = props.battle.opponent;
    if (props.meta.state.value != "Battle" || opponent.trainer?.value != "--") return null;
    const count = opponent.team_count.value ?? 0;
    const party: PreviewTrainer["party"] = [];
    for (let x = 0; x < count && x < 6; x++) {
        const mon = opponent.team[x];
        const species = mon?.species?.value;
        if (species == null) continue;
        party.push({
            species,
            level: mon.level?.value,
            ability: mon.ability?.value,
            moves: [0, 1, 2, 3].map((i) => mon.moves?.[i]?.move?.value).filter(Boolean),
            stats: {
                hp: mon.stats?.hp_max?.value, attack: mon.stats?.attack?.value, defense: mon.stats?.defense?.value,
                special_attack: mon.stats?.special_attack?.value, special_defense: mon.stats?.special_defense?.value, speed: mon.stats?.speed?.value,
            },
        });
    }
    if (party.length === 0) return null;
    return { name: "", header: "Wild " + party.map((mon) => mon.species).join(" & "), party };
}

function slotNodes(slot: Gen5EnemySlot): EnemyNode {
    const x = slot.slot;
    return {
        class: "eFaintTransition",
        style: slot.styles.faint,
        children: [!slot.present ? null : {
            class: `border slots ePkmnStyle ePkmn${x}`,
            children: [{
                style: slot.styles.mon,
                class: "eFaintTransition",
                children: [{
                    style: slot.styles.text,
                    class: "eFaintTransition",
                    children: [
                        {
                            tag: "img",
                            class: ["ePkmnSprite", { ePkmnSpriteResizing: slot.sprite.resizing }],
                            attrs: { "data-enemy-slot": x, "data-enemy-species": slot.sprite.species },
                            style: slot.sprite.style,
                            src: slot.sprite.src,
                        },
                        {
                            class: "border ePkmnTyping",
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

/** The panel inside the overlay's enemy team branch. */
export function enemyTeamLayout(view: Gen5EnemyTeam): EnemyChild[] {
    return [
        { key: view.double ? 1 : 0, class: "trainerLabel", text: view.trainer },
        { class: "colored-image ds", style: [view.crop, { "--url": "url(images/gen5/ui/opponent.svg)" }] },
        ...view.slots.map((slot): EnemyNode => ({
            style: slot.styles.stats,
            children: [!slot.present ? null : {
                children: [
                    { tag: "img", class: ["canvas eFaintTransition", slot.speed.svgClass], style: [slot.styles.comparison, { left: "-1px" }], src: `images/gen5/ui/speed_comp/${slot.slot}.svg` },
                    { class: "colored-image", style: `--overlay-color: ${view.overlayColor}; --url: url(images/gen5/ui/enemy_ui/${slot.slot}.svg)` },
                    { tag: "img", src: `images/gen5/enemy-area/stats/${view.statsArt}/${slot.slot}.svg`, style: slot.styles.mon, class: "enemyPng eFaintTransition" },
                ],
            }],
        })),
        { class: "enemyGraphic", children: view.slots.map(slotNodes) },
        view.art === null ? null : { tag: "img", src: view.art, style: "position: absolute; top: 0px;" },
        view.secondScreen ? { tag: "img", class: "canvas", src: "images/gen5/ui/second_screen.webp" } : null,
    ];
}
