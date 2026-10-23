/**
 * gen4's enemy team panel (trainer battles) as data for the shared `core/overlay/EnemyTeamPanel.ts`: what the overlay
 * computes (`enemyTeamView`, read exactly as the old template read it, each value once per change) and the elements
 * it draws (`enemyTeamLayout`). The slots read the trainer data (`enemy_mon_static`); a Platinum or D/P double battle
 * against two trainers adds the second trainer's team (`enemy_2_mon_static`) after the first.
 */
import { toDisplayString, type StyleValue } from "vue";
import type { EnemyChild, EnemyNode } from "~/core/overlay/EnemyTeamPanel";
import { ENEMY_STAT_LABELS as L, enemyLevelText, FAINTED_PICTURE, rowOf, type EnemySlotView, type EnemyTeamView } from "~/core/overlay/enemyTeamView";
import { speedColorClass, speedLabel, speedOrder } from "~/core/logic/speedLabel";
import { previewOf, trainerOptions, type PreviewTrainer } from "~/core/logic/trainerPreview";
import { moveCategoryOf, movePowerOf, orderSlots, predictGen4, SendOutOrderCache, type SendOutMon, type SendOutPlayer } from "~/core/logic/sendOutOrder";

/** The live battle's send-out order, frozen for the battle (the rows never move once the panel is up). */
const liveOrder = new SendOutOrderCache();

function speciesTypes(vm: any, species: unknown): [string, string] {
    const entry = vm.g4PokemonData[species as string];
    const type1 = entry?.type_1 ?? "Normal";
    return [type1, entry?.type_2 ?? type1];
}

/** A trainer table Pokémon (`enemy_mon_static`, the preview's party) as gen 4's send-out rule reads it: types, moves,
 * and for the damage step its level, Attack, Sp. Atk, ability and item; Hidden Power's type when it is known. */
function sendOutMon(vm: any, mon: any, hiddenPowerType: string | null = null): SendOutMon {
    const species = String(mon?.species?.value ?? mon?.species);
    return {
        species,
        types: speciesTypes(vm, species),
        moves: (mon?.moves ?? []).filter(Boolean).map((name: string) => {
            const data = vm.generation4_moves_new?.[name];
            const power = movePowerOf(data?.power);
            return { name, type: data?.type ?? "Normal", power, category: moveCategoryOf(data?.category, data?.type, power) };
        }),
        level: Number(mon?.level) || 1,
        attack: Number(mon?.stats?.attack) || 0,
        specialAttack: Number(mon?.stats?.special_attack) || 0,
        ability: mon?.ability ?? null,
        item: mon?.held_item ?? mon?.item ?? null,
        hiddenPowerType,
    };
}

/**
 * The order the trainer's AI sends its team out in against the player's Pokémon (core/logic/sendOutOrder.ts), as
 * party slots; null when the "Predicted Send-Out Order" setting is off. The player is the Pokémon in the party (its
 * Defense, Sp. Def, ability and item); the species pickers only stand in before there is one. `live` keeps the order
 * for the battle.
 */
function sendOutOrder(vm: any, party: SendOutMon[], live: boolean): number[] | null {
    if (vm.send_out_order != true || !party.length) return null;
    const lead = vm.game.properties.player.team[0];
    const species = lead?.species?.value ?? (vm.evolution ? vm.selected_evolution_species : vm.starter);
    const player: SendOutPlayer = {
        species: String(species),
        types: speciesTypes(vm, species),
        defense: Number(lead?.stats?.defense?.value) || 1,
        specialDefense: Number(lead?.stats?.special_defense?.value) || 1,
        ability: lead?.ability?.value ?? null,
        item: lead?.held_item?.value ?? null,
    };
    const compute = () => predictGen4(party, player);
    return live ? liveOrder.get(party, String(species), compute) : compute();
}

/**
 * The first trainer's stats in label order (decision 26: HP, Atk., Def., SpA., SpD., Spe.; drawn HP|Spe, Atk|SpA, Def|SpD like the player's stats): label column, class part,
 * label, and the modifier's / `getEnemyStat`'s stat name. Each class's place is in style.css.
 */
const STATS: [column: 1 | 2, cls: string, label: string, stat: string][] = [
    [1, "Hp", L.hp, "hp"], [1, "Atk", L.attack, "attack"], [1, "Def", L.defense, "defense"],
    [2, "Spa", L.special_attack, "special_attack"], [2, "Spd", L.special_defense, "special_defense"], [2, "Spe", L.speed, "speed"],
];

/** The stage badge cells (`modifier_values`). */
interface StageCells {
    status: { text: unknown; shown: boolean };
    mods: { name: string; text: unknown; shown: boolean }[];
}

export interface Gen4EnemySlot extends EnemySlotView {
    present: boolean;
    /** `enemyFaint(x)`: the whole slot's style. */
    faint: StyleValue;
    ui: StyleValue;
    types: { src: string; shown: boolean }[];
    /** Battle or From Battle: the stats are shown. */
    statsShown: boolean;
    /** In battle and out: the status and stage badges. */
    stages: StageCells | null;
}

/** A Pokémon of the second trainer in a two-trainer double battle (Platinum, D/P). */
export interface Gen4SecondSlot {
    present: boolean;
    /** `enemyFaint(x + 6)`. */
    faint: StyleValue;
    /** Its `ePkmnN` class number: the slot after the first trainer's team. */
    position: number;
    sprite: string;
    species: unknown;
    level: unknown;
    ability: unknown;
    types: { src: string; shown: boolean }[];
    /** In battle: the labels (in two orders, by whether the player's Pokémon has HP), the values, then the raw stats. */
    stats: { labels: StyleValue[]; playerUp: boolean; values: unknown[]; raw: unknown[] } | null;
    stages: StageCells | null;
    moves: { known: boolean; icon?: string; name: unknown; power?: unknown }[];
}

export interface Gen4EnemyTeam extends EnemyTeamView<Gen4EnemySlot> {
    /** "Double Battle Team" for a second trainer, else the trainer's name. */
    double: boolean;
    overlayColor: unknown;
    second: Gen4SecondSlot[];
    /** `getTrainerGraphic()`'s art, when it has one. */
    art: string | null;
}

function stageCells(vm: any, active: any, statusText: (value: unknown) => unknown, modsOf: any): StageCells {
    return {
        status: {
            shown: vm.statusConditionConverter(active.status_condition?.value) != ``,
            text: statusText(active.status_condition?.value),
        },
        mods: vm.modifier_values.map((name: string) => ({
            name,
            shown: active.modifiers?.[name].value != 0,
            text: vm.stageModifiers(modsOf.modifiers[name].value),
        })),
    };
}

export function enemyTeamView(vm: any): Gen4EnemyTeam {
    const props = vm.game.properties;
    const battle = props.battle;
    const state = props.meta.state.value;
    const types = (data: any) => {
        const entry = vm.g4PokemonData[data?.species];
        return [
            { src: `images/gen4/type-icons-circular/${entry?.type_1?.toLowerCase()}.webp`, shown: true },
            { src: `images/gen4/type-icons-circular/${vm.g4PokemonData[data?.species]?.type_2?.toLowerCase()}.webp`, shown: entry?.type_1 != vm.g4PokemonData[data?.species]?.type_2 },
        ];
    };
    const moveIcon = (x: number, i: number) => `images/gen4/type-icons-circular/${vm.eHPType(vm.platinum_moves[vm.enemyMove(x, i)]?.Type?.toLowerCase(), vm.enemyMove(x, i), x)}.webp`;
    const slots = vm.pkmnSlots.map((x: number): Gen4EnemySlot => {
        // Decision 26: a fainted Pokémon greyscale at half opacity (was .35).
        const faint = vm.enemyFaint(x) ? FAINTED_PICTURE : undefined;
        if (!(x < battle.opponent.team_count.value)) return { slot: x, present: false, faint } as Gen4EnemySlot;
        const mon = vm.enemy_mon_static[x];
        const species = mon?.species?.value || mon?.species;
        const speed = vm.speed_comparison(x, vm.getEnemyStat("speed", mon?.stats.speed, x)).comparison;
        const active = battle.opponent.active_pokemon;
        const statsShown = state == "Battle" || state == "From Battle";
        return {
            slot: x,
            present: true,
            faint,
            ui: vm.enemyPkmnUI(battle.opponent.team[x]),
            speed: { label: speed, svgClass: vm.svgColorClass(speed, battle.opponent.team[x]) },
            sprite: {
                src: `images/gen4/pokemon/${vm.speciesSpecialCharacters(mon?.species)}.webp`,
                style: { transform: vm.enemyTransformFor(species), filter: `drop-shadow(${vm.getEnemySpriteFlipped(species) ? -2 : 2}px 2px 2px #000) saturate(1.1)` },
                species,
                resizing: vm.enemyResize.slot === x,
            },
            species: mon?.species,
            level: mon?.level,
            ability: mon?.ability,
            types: types(mon),
            statsShown,
            stats: statsShown ? STATS.map(([, , , stat], i) => ({
                labelStyle: i === 0 ? vm.enemyStatusLabelOpacity(active.status_condition, x) : vm.enemyStatLabelOpacity(active.modifiers?.[stat], x),
                value: i === 0 ? mon?.stats.hp : vm.getEnemyStat(stat, mon?.stats[stat], x),
            })) : [],
            stages: state == "Battle" && battle.opponent.party_position.value == x
                ? stageCells(vm, active, (value) => vm.enemy_status(value), active) : null,
            moves: [0, 1, 2, 3].map((i) => mon?.moves[i] != undefined
                ? { known: true, icon: moveIcon(x, i), name: mon?.moves[i] }
                : { known: false, name: undefined }),
        };
    });
    const second = vm.pkmnSlots.map((x: number): Gen4SecondSlot => {
        const faint = vm.enemyFaint(x + 6) ? FAINTED_PICTURE : undefined;
        if (!(x < battle.opponent_2.team_count.value && battle.opponent_2.trainer.value != null && props.meta.game_name.value != "HeartGold and SoulSilver")) {
            return { present: false, faint } as Gen4SecondSlot;
        }
        const mon = vm.enemy_2_mon_static[x];
        const active = battle.opponent_2.active_pokemon;
        const playerUp = state == "Battle" && battle.player.active_pokemon.stats.hp.value > 0;
        const label = (stat: string) => vm.enemyStatLabelOpacity(active.modifiers?.[stat], x);
        const status = () => vm.enemyStatusLabelOpacity(active.status_condition, x);
        return {
            present: true,
            faint,
            position: x + battle.opponent.team_count.value,
            sprite: `images/gen4/pokemon/${vm.speciesSpecialCharacters(vm.enemy_2_mon_static?.[x]?.species)}.webp`,
            species: mon?.species,
            level: mon?.level,
            ability: mon?.ability,
            types: types(mon),
            stats: state == "Battle" ? {
                playerUp,
                labels: playerUp
                    ? [status(), label("attack"), label("defense"), label("speed"), label("special_attack"), label("special_defense")]
                    : [status(), label("attack"), label("defense"), label("special_attack"), label("special_defense"), label("speed")],
                values: [mon?.stats.hp, ...["attack", "defense", "speed", "special_attack", "special_defense"].map((stat) => vm.getEnemyStat(stat, mon?.stats[stat], x))],
                raw: [mon?.stats.hp, mon?.stats.attack, mon?.stats.defense, mon?.stats.special_attack, mon?.stats.special_defense, mon?.stats.speed],
            } : null,
            // As the legacy template: the second trainer's badges show the first trainer's stages, and its status is always "BRN" (D9 of the UI audit).
            stages: state == "Battle" && battle.opponent_2.party_position.value == x
                ? stageCells(vm, active, () => "BRN", battle.opponent.active_pokemon) : null,
            moves: [0, 1, 2, 3].map((i) => mon?.moves[i] != undefined
                ? { known: true, icon: moveIcon(x, i), name: mon?.moves[i], power: vm.enemy_effective_power(mon?.moves[i], battle.opponent_2.team[x], x) }
                : { known: false, name: undefined }),
        };
    });
    const graphic = vm.getTrainerGraphic();
    const double = battle.opponent_2.value != null;
    // A double battle picks against a random target: no order.
    const count = double || trainerTable(vm)?.[battle.opponent.id.value]?.is_double_battle ? 0 : Math.min(6, battle.opponent.team_count.value ?? 0);
    const party = vm.pkmnSlots.slice(0, count).map((x: number) => {
        const mon = vm.enemy_mon_static[x];
        const hiddenPower = mon?.moves?.includes("Hidden Power") ? vm.eHPType(null, "Hidden Power", x) : null;
        return sendOutMon(vm, mon, hiddenPower);
    });
    return {
        double,
        trainer: battle.opponent_2.value == null ? vm.get_trainer_name(battle.opponent.trainer.value, battle.opponent.id.value) : "Double Battle Team",
        crop: vm.battlePokemonCrop,
        overlayColor: vm.overlay_color,
        slots: orderSlots(slots, sendOutOrder(vm, party, true)),
        second,
        art: graphic.state == true ? graphic.graphic : null,
    };
}

/** The panel art's height for a team of n (the overlay's `battlePokemonCrop`). */
const HEIGHTS: Record<number, string> = { 1: "233px", 2: "399px", 3: "566px", 4: "733px", 5: "898px", 6: "1080px" };

/** The edition's trainer table (data/trainers/). */
const trainerTable = (vm: any) => vm.selected_game == "Platinum" ? vm.platinum_trainers
    : vm.selected_game == "HeartGold and SoulSilver" ? vm.trainers_hgss : vm.trainers_dp;

/** The "Trainer" picker's options (the value is the table's trainer id). */
export function trainerPickerOptions(vm: any) {
    return trainerOptions(trainerTable(vm), (t) => t.name, (t) => t.location, (t) => !!t.party?.length);
}

/** The picked trainer (`examined_trainer`), or null. */
export function previewTrainer(vm: any): PreviewTrainer | null {
    const id = vm.examined_trainer;
    const entry = trainerTable(vm)?.[id];
    return previewOf(entry, entry ? vm.get_trainer_name(entry.name, Number(id)) : undefined);
}

/**
 * The trainer preview (decision 14) in the same panel: the picked trainer's team from the trainer table, its stats
 * shown as in battle, with the player's turn-order Speed (`get_stat().Spe`) against the table's Speed.
 */
export function trainerPreviewView(vm: any, trainer: PreviewTrainer): Gen4EnemyTeam {
    const player_speed = vm.get_stat().Spe || 0;
    const slots = trainer.party.map((mon, x): Gen4EnemySlot => {
        const order = speedOrder(player_speed, mon.stats.speed);
        const entry = vm.g4PokemonData[mon.species];
        return {
            slot: x,
            present: true,
            faint: undefined,
            ui: "opacity: 1",
            speed: { label: speedLabel(order, "enemy"), svgClass: speedColorClass(order, false) },
            sprite: {
                src: `images/gen4/pokemon/${vm.speciesSpecialCharacters(mon.species)}.webp`,
                style: { transform: vm.enemyTransformFor(mon.species), filter: `drop-shadow(${vm.getEnemySpriteFlipped(mon.species) ? -2 : 2}px 2px 2px #000) saturate(1.1)` },
                species: mon.species,
                resizing: false,
            },
            species: mon.species,
            level: mon.level,
            ability: mon.ability,
            types: [
                { src: `images/gen4/type-icons-circular/${entry?.type_1?.toLowerCase()}.webp`, shown: true },
                { src: `images/gen4/type-icons-circular/${entry?.type_2?.toLowerCase()}.webp`, shown: entry?.type_1 != entry?.type_2 },
            ],
            statsShown: true,
            stats: STATS.map(([, , , stat]) => ({ value: (mon.stats as unknown as Record<string, unknown>)[stat], labelStyle: undefined })),
            stages: null,
            moves: [0, 1, 2, 3].map((i) => mon.moves[i] != null
                ? { known: true, icon: `images/gen4/type-icons-circular/${vm.platinum_moves[mon.moves[i]]?.Type?.toLowerCase()}.webp`, name: mon.moves[i] }
                : { known: false, name: undefined }),
        };
    });
    // The wild panel (a header, no trainer) keeps its order; so does a double battle.
    const ordered = !trainer.header && !trainerTable(vm)?.[vm.examined_trainer]?.is_double_battle;
    return {
        double: false,
        trainer: trainer.header ?? trainer.name,
        crop: `height: ${HEIGHTS[trainer.party.length]}; filter: saturate(${vm.ui_saturation}) drop-shadow(0px 0px 1px #000000)`,
        overlayColor: vm.overlay_color,
        slots: orderSlots(slots, ordered ? sendOutOrder(vm, trainer.party.map((mon) => sendOutMon(vm, mon)), false) : null),
        second: [],
        art: null,
    };
}

/**
 * The wild panel ("Show Wild Battles", decision 30): during a wild battle (`battle.mode` "Wild", state Battle), the wild
 * Pokémon from the opponent's party in memory (`battle.opponent.team`, which is `battle.wild` in the mapper), drawn as
 * a trainer preview under a "Wild <species>" header. null otherwise. The speed label is the preview's (the player's
 * `get_stat().Spe` against the wild Pokémon's Speed); no stat stages, no faint.
 */
export function wildPreview(vm: any): PreviewTrainer | null {
    const props = vm.game.properties;
    const battle = props.battle;
    if (props.meta.state.value != "Battle" || battle.mode?.value != "Wild") return null;
    const count = battle.opponent.team_count.value ?? 0;
    const party: PreviewTrainer["party"] = [];
    for (let x = 0; x < count && x < 6; x++) {
        const mon = battle.opponent.team[x];
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

const typing = (types: { src: string; shown: boolean }[]): EnemyNode => ({
    style: "left: 2px;",
    class: "border ePkmnTyping",
    children: [
        { tag: "img", class: "icons moveIcon", src: types[0].src },
        { tag: "img", show: types[1].shown, class: "icons moveIcon", src: types[1].src },
    ],
});

const stageTable = (stages: StageCells | null): EnemyChild => stages === null ? null : {
    class: "ePkmnStats",
    children: [{
        class: "enemyStatModTable",
        children: [
            { show: stages.status.shown, class: "enemyMod stcd", text: stages.status.text },
            ...stages.mods.map((mod): EnemyNode => ({ children: [{ show: mod.shown, class: ["enemyMod", `e_${mod.name}`], text: mod.text }] })),
        ],
    }],
};

function slotNodes(view: Gen4EnemyTeam, slot: Gen4EnemySlot): EnemyNode {
    const x = slot.slot;
    return {
        class: "eFaintTransition",
        style: slot.faint,
        children: [!slot.present ? null : {
            class: `border slots ePkmnStyle ePkmn${rowOf(slot)}`,
            children: [
                {
                    tag: "img",
                    class: ["ePkmnSprite", { ePkmnSpriteResizing: slot.sprite.resizing }],
                    attrs: { "data-enemy-slot": x, "data-enemy-species": slot.sprite.species },
                    style: slot.sprite.style,
                    src: slot.sprite.src,
                },
                { class: "ePkmnLvlSpecies", text: slot.species },
                { class: "ePkmnLevel", text: enemyLevelText(slot.level) },
                { class: "ePkmnAbility", text: slot.ability },
                typing(slot.types),
                !slot.statsShown ? null : {
                    class: "border ePkmnStats",
                    children: [
                        ...STATS.map(([column, cls, label], i): EnemyNode => ({
                            class: `ePkmnStatsLabelsStyle ePkmnStatsLabelColumn${column} ePkmn${cls}Label`,
                            style: slot.stats[i].labelStyle,
                            text: label,
                        })),
                        ...STATS.map(([column, cls], i): EnemyNode => ({
                            class: `ePkmnStatsStyle ePkmnStatsLabelColumn${column} ePkmn${cls} opacityTransition`,
                            text: slot.stats[i].value,
                        })),
                    ],
                },
                stageTable(slot.stages),
                {
                    class: "border ePkmnMoves",
                    children: [
                        {
                            tag: "table",
                            class: "enemyMovesetTable",
                            children: [{
                                tag: "tbody",
                                children: slot.moves.map((move): EnemyNode => ({
                                    tag: "tr",
                                    children: [move.known ? { tag: "th", children: [{ tag: "img", class: "icons moveIcon", src: move.icon }] } : null],
                                })),
                            }],
                        },
                        ...slot.moves.map((move, i): EnemyChild => move.known ? { class: `ePkmnMoveStyle ePkmnMove${i + 1}`, text: move.name } : null),
                    ],
                },
                { transition: "fade", class: "ePkmnSpeedComparison", text: slot.speed.label },
            ],
        }],
    };
}

function secondNodes(slot: Gen4SecondSlot): EnemyNode {
    const stats = slot.stats;
    return {
        class: "eFaintTransition",
        style: slot.faint,
        children: [!slot.present ? null : {
            class: `border slots ePkmnStyle ePkmn${slot.position}`,
            children: [
                { tag: "img", class: "ePkmnSprite", src: slot.sprite },
                { class: "ePkmnLvlSpecies", text: toDisplayString(slot.species) + " " + enemyLevelText(slot.level) },
                { class: "ePkmnAbility", style: "opacity: .7;", text: slot.ability },
                typing(slot.types),
                stats === null ? null : {
                    class: "border ePkmnStats",
                    children: [
                        {
                            key: stats.playerUp ? 0 : 1,
                            children: (stats.playerUp ? [L.hp, L.attack, L.defense, L.speed, L.special_attack, L.special_defense] : [L.hp, L.attack, L.defense, L.special_attack, L.special_defense, L.speed])
                                .map((label, i): EnemyNode => ({ class: "enemyStatLabel", style: stats.labels[i], text: label })),
                        },
                        ...stats.values.map((value): EnemyNode => ({ text: value })),
                        { children: stats.raw.map((value): EnemyNode => ({ text: value })) },
                    ],
                },
                stageTable(slot.stages),
                {
                    class: "border ePkmnMoves",
                    children: [{
                        tag: "table",
                        class: "enemyMovesetTable",
                        children: [{
                            tag: "tbody",
                            children: slot.moves.map((move): EnemyNode => ({
                                tag: "tr",
                                children: move.known ? [
                                    { tag: "th", children: [{ tag: "img", class: "icons moveIcon", src: move.icon }] },
                                    { tag: "th", class: "align_left", style: "font-size: 14px;", text: move.name },
                                    { tag: "th", style: "opacity: 1; font-size: 14px;", class: "align_right", children: [{ text: move.power }] },
                                ] : [null, null, null],
                            })),
                        }],
                    }],
                },
            ],
        }],
    };
}

/** The panel inside the overlay's enemy team branch. */
export function enemyTeamLayout(view: Gen4EnemyTeam): EnemyChild[] {
    return [
        { key: view.double ? 1 : 0, class: "trainerLabel", text: view.trainer },
        { class: "colored-image ds", style: [view.crop, { "--url": "url(images/gen4/new_ui/enemy.svg)" }] },
        ...view.slots.map((slot): EnemyNode => ({
            children: [!slot.present ? null : {
                children: [
                    { style: slot.ui, children: [{ class: "enemyStatsArea colored-image", style: `--overlay-color: ${view.overlayColor}; --url: url(images/gen4/new_ui/enemy_moves/${rowOf(slot)}.svg)` }] },
                    { tag: "img", class: ["enemyStatsArea eFaintTransition", slot.speed.svgClass], style: slot.faint, src: `images/gen4/new_ui/comp/${rowOf(slot)}.svg` },
                    { tag: "img", src: `images/gen4/new_ui/stats/${rowOf(slot)}.svg`, class: "enemyPng eFaintTransition", style: slot.faint },
                ],
            }],
        })),
        {
            class: "enemyGraphic",
            children: [...view.slots.map((slot) => slotNodes(view, slot)), ...view.second.map(secondNodes)],
        },
        view.art === null ? null : { tag: "img", src: view.art, style: "position: absolute; top: 0px;" },
    ];
}
