/**
 * gen3's enemy team panel ("Battle Graphic", trainer battles) as data for the shared
 * `core/overlay/EnemyTeamPanel.ts`: what the overlay computes (`enemyTeamView`, read exactly as the old template read
 * it, each value once per change) and the elements it draws (`enemyTeamLayout`). The panel reads the trainer data
 * (`enemyTrainer`) for species, level, moves and stats, and the mapper for faints and stat stages.
 */
import type { StyleValue } from "vue";
import type { EnemyChild, EnemyNode } from "~/core/overlay/EnemyTeamPanel";
import { ENEMY_STAT_LABELS, enemyLevelText, FAINTED_TEXT, rowOf, type EnemySlotView, type EnemyTeamView } from "~/core/overlay/enemyTeamView";
import { speedColorClass, speedLabel, speedOrder } from "~/core/logic/speedLabel";
import { gen3PreviewOf, trainerOptions, type PreviewPokemon, type PreviewTrainer } from "~/core/logic/trainerPreview";
import { moveCategoryOf, movePowerOf, orderSlots, predictGen3, SendOutOrderCache, strongestMove, type SendOutMon, type SendOutMove, type SendOutPlayer } from "~/core/logic/sendOutOrder";

/** The live battle's send-out order, frozen for the battle (the rows never move once the panel is up). */
const liveOrder = new SendOutOrderCache();

/** The move table by spelling-free name: the trainer tables say "Double Slap" / "Lock On", the move table
 * "DoubleSlap" / "Lock-On". */
const movesByKey = new WeakMap<object, Map<string, any>>();
function moveData(vm: any, name: unknown): any {
    const table = vm.generation_3_moves;
    const exact = table[name as string];
    if (exact) return exact;
    let index = movesByKey.get(table);
    if (!index) {
        index = new Map(Object.entries(table).map(([key, data]) => [key.toLowerCase().replace(/[^a-z0-9]/g, ""), data]));
        movesByKey.set(table, index);
    }
    return index.get(String(name).toLowerCase().replace(/[^a-z0-9]/g, ""));
}

function sendOutMove(vm: any, name: unknown): SendOutMove {
    const data = moveData(vm, name);
    const power = movePowerOf(data?.power);
    return { name: String(name), type: data?.type ?? "Normal", power, category: moveCategoryOf(data?.category, data?.type, power) };
}

function speciesTypes(vm: any, species: unknown): [string, string] {
    const dex = vm.game_data?.dexData?.[species as string];
    const type1 = dex?.type_1 ?? "Normal";
    return [type1, dex?.type_2 ?? type1];
}

/** A trainer's Pokémon as gen 3's send-out rule reads it (the trainer table: types, moves, and for the damage step
 * its level, Attack, Sp. Atk, ability and item). */
function sendOutMon(vm: any, mon: PreviewPokemon): SendOutMon {
    return {
        species: mon.species,
        types: speciesTypes(vm, mon.species),
        moves: mon.moves.filter(Boolean).map((name) => sendOutMove(vm, name)),
        level: Number(mon.level) || 1,
        attack: Number(mon.stats.attack) || 0,
        specialAttack: Number(mon.stats.special_attack) || 0,
        ability: mon.ability == null ? null : String(mon.ability),
        item: mon.item == null ? null : String(mon.item),
    };
}

/**
 * The order the trainer's AI sends its team out in against the player's Pokémon (core/logic/sendOutOrder.ts), as
 * party slots; null when the "Predicted Send-Out Order" setting is off. The player is the Pokémon in the party (its
 * Defense, Sp. Def, ability, item, the Defense/Special badge boosts, and its strongest move as the knock-out move);
 * the species pickers only stand in before there is one. `live` keeps the order for the battle.
 */
function sendOutOrder(vm: any, party: PreviewPokemon[], live: boolean): number[] | null {
    if (vm.send_out_order != true || !party.length) return null;
    const props = vm.game.properties;
    const lead = props.player.team[0];
    const inParty = lead?.species?.value;
    const species = inParty ?? (vm.evolution ? vm.selected_evolution_species : vm.starterString);
    const player: SendOutPlayer = {
        species: String(species),
        types: speciesTypes(vm, species),
        defense: Number(lead?.defense?.value) || 1,
        specialDefense: Number(lead?.specialDefense?.value) || 1,
        ability: lead?.ability?.value ?? null,
        item: lead?.itemHeld?.value ?? null,
        koMove: strongestMove([1, 2, 3, 4].map((i) => lead?.[`move${i}`]?.value).filter(Boolean).map((name) => sendOutMove(vm, name))),
        defenseBadge: props.player.badges?.badge5?.value == true,
        specialDefenseBadge: props.player.badges?.badge7?.value == true,
    };
    const mons = party.map((mon) => sendOutMon(vm, mon));
    const compute = () => predictGen3(mons, player);
    return live ? liveOrder.get(mons, String(species), compute) : compute();
}

/** The six stats in label order: label column, class part of the label and of the value. */
const STATS: [column: 1 | 2, label: string, value: string][] = [
    [1, "Hp", "Hp"], [1, "Atk", "Atk"], [1, "Def", "Def"], [2, "Spa", "Spa"], [2, "Spd", "Spd"], [2, "Spe", "Spe"],
];
/** The labels (decision 26), and in the EVs modes, where the values are the EV yields, with "EV" before them. */
const L = ENEMY_STAT_LABELS;
const LABELS = [L.hp, L.attack, L.defense, L.special_attack, L.special_defense, L.speed];
const EV_LABELS = LABELS.map((label) => "EV " + label);
/** The stage badges: the mapper's stage property, the badge's column and class. */
const MODS: [property: string, column: 1 | 2, cls: string][] = [
    ["modStageAttack", 1, "attackMod"], ["modStageDefense", 1, "defenseMod"], ["modStageSpecialAttack", 2, "specialAttackMod"],
    ["modStageSpecialDefense", 2, "specialDefenseMod"], ["modStageSpeed", 2, "speedMod"],
];
/** `enemyStatModification`'s stat name, the trainer data's field and the stage property, for Atk..Spe. */
const MODIFIED: [stat: string, field: string, stage: string][] = [
    ["attack", "atk", "modStageAttack"], ["defense", "def", "modStageDefense"], ["specialAttack", "spa", "modStageSpecialAttack"],
    ["specialDefense", "spd", "modStageSpecialDefense"], ["speed", "spe", "modStageSpeed"],
];
const EV_YIELDS = ["ev_yield_hp", "ev_yield_atk", "ev_yield_def", "ev_yield_spc_atk", "ev_yield_spc_def", "ev_yield_spd"];

export interface Gen3EnemySlot extends EnemySlotView {
    /** The trainer data has a Pokémon in this slot (otherwise nothing is drawn but the slot's wrapper). */
    present: boolean;
    /** The sprite shows once the trainer data has its species. */
    spriteShown: boolean;
    styles: { ui: StyleValue; statsArt: StyleValue; icons: StyleValue; species: StyleValue; text: StyleValue };
    types: { src: string; shown: boolean }[];
    /** The stage badges of Atk, Def, SpA, SpD, Spe. */
    mods: { text: unknown; shown: boolean }[];
    /** EVs / Detailed EVs: the labels say "EV" and the values are the EV yields. */
    evs: boolean;
}

export function enemyTeamView(vm: any): EnemyTeamView<Gen3EnemySlot> & { overlayColor: unknown } {
    const props = vm.game.properties;
    const batt = vm.batt;
    const enemy = batt.enemyPokemon;
    const evs = vm.stats == "EVs" || vm.stats == "Detailed EVs";
    const slots = vm.pkmnSlots.map((x: number): Gen3EnemySlot => {
        const pokemon = vm.enemyTrainer.pokemon[x];
        if (pokemon == undefined) return { slot: x, present: false } as Gen3EnemySlot;
        const mon = batt.trainer.team[x];
        const species = pokemon?.species;
        const speed = vm.speed_comparison(x, vm.enemyStatModification(x, enemy.partyPos.value, "speed", props.battle.trainer.team[x]?.speed.value, enemy.modStageSpeed.value, props.battle.enemyPokemon)).comparison;
        const icons = vm.enemyPkmnFaintTypes(mon);
        // Decision 26: a fainted Pokémon (in From Battle every Pokémon, as before) at half opacity; its sprite and icons
        // greyscale, as they were. Labels follow the slot's faint as they did (not in To Battle).
        const state = vm.g3stateVariable;
        const faded = (state == `Battle` || state == `From Battle`) && (mon.hp == 0 || state == `From Battle`);
        const labelFaded = state != "To Battle" && props.battle.trainer.team[x].hp.value == 0;
        const text = faded ? FAINTED_TEXT : vm.enemyPkmnText(mon);
        const type1 = vm.enemyType1(x);
        const type2 = vm.enemyType2(x);
        const moves = pokemon?.moves;
        const labelStyles = labelFaded ? LABELS.map(() => FAINTED_TEXT) : [
            vm.enemyHpOpacity(mon, x),
            ...MODIFIED.map(([, , stage]) => vm.enemyStatLabelOpacity(props.battle.enemyPokemon[stage].value, x)),
        ];
        const values = evs
            ? EV_YIELDS.map((field) => vm.game_data.dexData[pokemon?.species][field])
            : [pokemon?.hp, ...MODIFIED.map(([stat, field, stage]) =>
                vm.enemyStatModification(x, enemy.partyPos.value, stat, pokemon?.[field], enemy[stage].value, props.battle.enemyPokemon))];
        return {
            slot: x,
            present: true,
            speed: { label: speed, svgClass: vm.svgColorClass(speed, props.battle.trainer.team[x]) },
            spriteShown: species != undefined,
            sprite: {
                src: `images/gen3/pokemon/${species}.webp`,
                style: [vm.enemyPkmnFaint(mon, species), faded ? { opacity: ".5" } : null, { transform: vm.enemyTransformFor(species) }],
                species,
                resizing: vm.enemyResize.slot === x,
            },
            styles: { ui: vm.enemyPkmnUI(mon), statsArt: vm.fade_enemy_mon(mon), icons, species: faded ? FAINTED_TEXT : vm.enemyPkmnSpecies(mon), text },
            types: [
                { src: `images/gen3/elements/type-icons/${type1?.toLowerCase()}.webp`, shown: true },
                type1 != type2 ? { src: `images/gen3/elements/type-icons/${type2?.toLowerCase()}.webp`, shown: true } : { src: "", shown: false },
            ],
            species,
            level: pokemon?.level,
            ability: pokemon?.ability,
            moves: [0, 1, 2, 3].map((i) => moves[i]
                ? { known: true, icon: `images/gen3/elements/type-icons/${vm.generation_3_moves[moves[i]]?.type?.toLowerCase()}.webp`, name: moves[i] }
                : { known: false, name: moves[i] }),
            mods: MODS.map(([property]) => ({
                text: vm.stat_mod(enemy[property].value),
                shown: vm.g3stateVariable == `Battle` && enemy.partyPos.value == x && enemy[property].value != 0,
            })),
            evs,
            stats: values.map((value, i) => ({ value, labelStyle: labelStyles[i] })),
        };
    });
    // A double battle picks against a random target: no order.
    const table = vm.enemyTrainer?.is_double_battle ? null : gen3PreviewOf(vm.enemyTrainer);
    return {
        trainer: vm.special_trainer_names(vm.enemyTrainerName),
        crop: vm.battlePokemonCrop(),
        slots: orderSlots(slots, table ? sendOutOrder(vm, table.party, true) : null),
        speedShown: vm.speed_comparison_toggle == true,
        overlayColor: vm.overlay_color,
    };
}

/** The panel art's height for a team of n (the overlay's `battlePokemonCrop`). */
const HEIGHTS: Record<number, string> = { 1: "234px", 2: "401px", 3: "566px", 4: "736px", 5: "902px", 6: "1080px" };

/** The edition's trainer table: Emerald's, or FireRed/LeafGreen's. */
const trainerTable = (vm: any) => vm.gameSelection == "Emerald" ? vm.emeraldTrainers : vm.remakeTrainers;

/** The "Trainer" picker's options (the value is the table's trainer id). */
export function trainerPickerOptions(vm: any) {
    return trainerOptions(trainerTable(vm), (t) => t.trainer_name, (t) => t.trainer_location, (t) => !!t.pokemon?.length);
}

/** The picked trainer (`examined_trainer`), or null. */
export function previewTrainer(vm: any): PreviewTrainer | null {
    return gen3PreviewOf(trainerTable(vm)?.[vm.examined_trainer]);
}

/**
 * The trainer preview (decision 14) in the same panel: the picked trainer's team from the trainer table, with the
 * player's Speed as the speed label reads it (`get_stat('Speed', true)`).
 */
export function trainerPreviewView(vm: any, trainer: PreviewTrainer): EnemyTeamView<Gen3EnemySlot> & { overlayColor: unknown } {
    const evs = vm.stats == "EVs" || vm.stats == "Detailed EVs";
    const player_speed = vm.get_stat("Speed", true);
    const plain = { hp: 1 };
    const slots = trainer.party.map((mon, x): Gen3EnemySlot => {
        const dex = vm.game_data?.dexData?.[mon.species];
        const order = speedOrder(player_speed, mon.stats.speed);
        const s = mon.stats;
        return {
            slot: x,
            present: true,
            speed: { label: speedLabel(order, "enemy"), svgClass: speedColorClass(order, false) },
            spriteShown: true,
            sprite: {
                src: `images/gen3/pokemon/${mon.species}.webp`,
                style: [vm.enemyPkmnFaint(plain, mon.species), { transform: vm.enemyTransformFor(mon.species) }],
                species: mon.species,
                resizing: false,
            },
            styles: { ui: "opacity: 1", statsArt: undefined, icons: "filter: grayscale(0%) drop-shadow(0px 0px 1px #000000c5);", species: "opacity: .7", text: "opacity: 1" },
            types: [
                { src: `images/gen3/elements/type-icons/${dex?.type_1?.toLowerCase()}.webp`, shown: true },
                dex?.type_1 != dex?.type_2 ? { src: `images/gen3/elements/type-icons/${dex?.type_2?.toLowerCase()}.webp`, shown: true } : { src: "", shown: false },
            ],
            species: mon.species,
            level: mon.level,
            ability: mon.ability,
            moves: [0, 1, 2, 3].map((i) => mon.moves[i]
                ? { known: true, icon: `images/gen3/elements/type-icons/${vm.generation_3_moves[mon.moves[i]]?.type?.toLowerCase()}.webp`, name: mon.moves[i] }
                : { known: false, name: undefined }),
            mods: MODS.map(() => ({ text: "", shown: false })),
            evs,
            stats: (evs ? EV_YIELDS.map((field) => dex?.[field]) : [s.hp, s.attack, s.defense, s.special_attack, s.special_defense, s.speed])
                .map((value) => ({ value, labelStyle: undefined })),
        };
    });
    return {
        trainer: vm.special_trainer_names(trainer.name),
        crop: `height: ${HEIGHTS[trainer.party.length]}; filter: saturate(${vm.ui_saturation}) drop-shadow(0px 0px 1px #000000)`,
        slots: orderSlots(slots, trainerTable(vm)?.[vm.examined_trainer]?.is_double_battle ? null : sendOutOrder(vm, trainer.party, false)),
        speedShown: vm.speed_comparison_toggle == true,
        overlayColor: vm.overlay_color,
    };
}

function slotNodes(view: EnemyTeamView<Gen3EnemySlot> & { overlayColor: unknown }, slot: Gen3EnemySlot): EnemyChild[] {
    if (!slot.present) return [null, null];
    const x = slot.slot;
    const row = rowOf(slot);
    const { icons, text } = slot.styles;
    const labelClass = slot.evs ? "opacityTransition" : "enemy_stat_opacity_transition";
    const labels = slot.evs ? EV_LABELS : LABELS;
    return [
        {
            children: [
                { style: slot.styles.ui, children: [{ class: "enemyStatsArea colored-image", style: `--overlay-color: ${view.overlayColor}; --url: url(images/gen3/new_ui/enemy_ui/${row}.svg)` }] },
                { tag: "img", class: ["enemyStatsArea", slot.speed.svgClass], src: `images/gen3/new_ui/comp/${row}.svg` },
                { style: slot.styles.ui, children: [{ tag: "img", style: slot.styles.statsArt, class: "enemyStatsArea", src: `images/gen3/new_ui/enemy_stats/${row}.svg` }] },
            ],
        },
        {
            class: `ePkmnStyle ePkmn${row + 1}`,
            children: [
                {
                    tag: "img",
                    show: slot.spriteShown,
                    class: ["ePkmnSprite", { ePkmnSpriteResizing: slot.sprite.resizing }],
                    attrs: { "data-enemy-slot": x, "data-enemy-species": slot.sprite.species },
                    style: slot.sprite.style,
                    src: slot.sprite.src,
                },
                { tag: "img", class: "ePkmnTypeIcons ePkmnType_1 ds opacityTransition", style: icons, src: slot.types[0].src },
                slot.types[1].shown ? { tag: "img", style: icons, class: "ePkmnTypeIcons ePkmnType_2 ds opacityTransition", src: slot.types[1].src } : null,
                { class: "ePkmnSpecies opacityTransition", style: slot.styles.species, text: slot.species },
                ...slot.moves.map((move, i): EnemyChild => move.known
                    ? { tag: "img", class: `ds eMoveIconStyle moveIcon${i + 1} opacityTransition`, style: icons, src: move.icon }
                    : null),
                // Each name when its move is known (the legacy template tested the first move for all four).
                ...slot.moves.map((move, i): EnemyChild => move.known
                    ? { class: `ePkmnMoveStyle ePkmnMove${i + 1} opacityTransition`, style: text, text: move.name }
                    : null),
                ...slot.mods.map((mod, i): EnemyNode => ({
                    show: mod.shown,
                    class: `enemyMod ePkmnStatsLabelColumn${MODS[i][1]} ${MODS[i][2]}`,
                    text: mod.text,
                })),
                {
                    key: slot.evs ? 0 : 1,
                    children: [
                        ...STATS.map(([column, label], i): EnemyNode => ({
                            class: `ePkmnStatsLabelsStyle ePkmnStatsLabelColumn${column} ePkmn${label}Label ${labelClass}`,
                            style: slot.stats[i].labelStyle,
                            text: labels[i],
                        })),
                        ...STATS.map(([column, , value], i): EnemyNode => ({
                            class: `ePkmnStatsStyle ePkmnStatsLabelColumn${column} ePkmn${value} opacityTransition`,
                            style: text,
                            text: slot.stats[i].value,
                        })),
                    ],
                },
                { class: "ePkmnStatsStyle ePkmnLevel opacityTransition", style: text, text: enemyLevelText(slot.level) },
                { class: "ePkmnStatsStyle ePkmnAbility opacityTransition", style: text, text: slot.ability },
                { transition: "fade", show: view.speedShown, style: text, class: "ePkmnSpeedComparison", text: slot.speed.label },
            ],
        },
    ];
}

/** The panel inside the overlay's "Battle Graphic" branch. */
export function enemyTeamLayout(view: EnemyTeamView<Gen3EnemySlot> & { overlayColor: unknown }): EnemyChild[] {
    return [
        { class: "enemy_trainer_name", text: view.trainer },
        { class: "colored-image ds", style: [view.crop, { "--url": "url(images/gen3/ui/enemy.svg)" }] },
        ...view.slots.map((slot): EnemyNode => ({ class: "enemyGraphic", children: slotNodes(view, slot) })),
    ];
}
