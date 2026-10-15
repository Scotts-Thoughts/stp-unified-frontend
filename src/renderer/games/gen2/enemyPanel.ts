/**
 * gen2's enemy team panel ("Battle Graphic", trainer battles) as data for the shared
 * `core/overlay/EnemyTeamPanel.ts`: what the overlay computes (`enemyTeamView`, read exactly as the old template read
 * it, each value once per change) and the elements it draws (`enemyTeamLayout`).
 */
import type { StyleValue } from "vue";
import type { EnemyChild, EnemyNode } from "~/core/overlay/EnemyTeamPanel";
import { ENEMY_STAT_LABELS, enemyLevelText, FAINTED_TEXT, type EnemySlotView, type EnemyTeamView } from "~/core/overlay/enemyTeamView";
import { speedColorClass, speedLabel, speedOrder } from "~/core/logic/speedLabel";
import { previewOf, trainerOptions, type PreviewTrainer } from "~/core/logic/trainerPreview";

/** `stat_object`'s classes and labels, in its order (HP first). */
const ABRV = ["Hp", "Atk", "Def", "SpA", "SpD", "Spe"];
const L = ENEMY_STAT_LABELS;
const LABEL = [L.hp, L.attack, L.defense, L.special_attack, L.special_defense, L.speed];

export interface Gen2EnemySlot extends EnemySlotView {
    /** The slot's species has arrived (the slot stays in the DOM, hidden, until then). */
    shown: boolean;
    /** The speed picture behind the slot: shown while the slot is in the team. */
    speedPictureShown: boolean;
    styles: { species: StyleValue; statsArea: StyleValue; icons: StyleValue; text: StyleValue };
    /** Type 1 and type 2 (shown when it differs). */
    types: { src: string; shown: boolean }[];
    /** Which values the stats show: 0 base stats (EVs, Detailed EVs, Base Stats), 1 DVs (DVs, Hidden Power), 2 stats. */
    statMode: 0 | 1 | 2;
}

export function enemyTeamView(vm: any): EnemyTeamView<Gen2EnemySlot> {
    const props = vm.game.properties;
    const batt = vm.batt;
    const enemy = batt.enemyPokemon;
    const setting = vm.stats_setting;
    const statMode = setting == "EVs" || setting == "Detailed EVs" || setting == "Base Stats" ? 0
        : setting == "DVs" || setting == "Hidden Power" ? 1 : 2;
    const stages = vm.stat_object.map((stat: any) => stat.name != "Hp" ? enemy[`modStage${stat.mod_path}`].value : undefined);
    const enemyOut = vm.enemyState == "Pokemon" || vm.enemyState == "Fainting";
    const slots = vm.pkmnSlots.map((x: number): Gen2EnemySlot => {
        const mon = batt.trainer.team[x];
        const species = mon.species.value;
        const speed = vm.speed_comparison(x, vm.activeSlot(x, enemy.partyPos.value, "speed", props.battle.trainer.team[x]?.speed.value, "enemyPokemon")).comparison;
        const svgClass = vm.svgColorClass(speed, props.battle.trainer.team[x]);
        const type1 = vm.enemyType1(x);
        const type2 = vm.enemyType2(x);
        const icons = vm.enemyPkmnFaintTypes(mon);
        // Decision 26: a fainted Pokémon's text and labels at half opacity (its sprite, icons and art already were).
        const fainted = mon.hp.value == 0;
        const text = fainted ? FAINTED_TEXT : vm.enemyPkmnText(mon);
        let values: unknown[];
        if (statMode === 0) {
            values = vm.stat_object.map((stat: any) => vm.dexDataCrystal[species]?.[stat.base_stat_path]);
        } else if (statMode === 1) {
            values = vm.stat_object.map((stat: any) => stat.name != "Hp" ? mon[stat.dv].value
                : vm.hpDv(mon.dvAttack.value, mon.dvDefense.value, mon.dvSpeed.value, mon.dvSpecial.value));
        } else {
            values = vm.stat_object.map((stat: any) => stat.name != "Hp" ? vm.activeSlot(x, enemy.partyPos.value, stat.path, mon[stat.path].value, "enemyPokemon")
                : mon.maxHp.value);
        }
        return {
            slot: x,
            shown: species != null,
            speedPictureShown: props.battle.trainer.totalPokemon.value > x,
            speed: { label: speed, svgClass },
            sprite: {
                src: `images/gen2/pokemon/${species}.webp`,
                style: species != null ? [vm.enemyPkmnFaint(mon), { transform: vm.enemyTransformFor(species) }] : undefined,
                species,
                resizing: vm.enemyResize.slot === x,
            },
            species,
            level: props.battle.trainer.team[x]?.level,
            styles: { species: fainted ? FAINTED_TEXT : vm.enemyPkmnSpecies(mon), statsArea: vm.enemyPkmnFaintStatsBackground(mon), icons, text },
            types: [
                { src: `images/gen2/type-icons-circular/${type1.toLowerCase()}.webp`, shown: true },
                type1 != type2 ? { src: `images/gen2/type-icons-circular/${type2.toLowerCase()}.webp`, shown: true } : { src: "", shown: false },
            ],
            moves: [0, 1, 2, 3].map((i) => {
                const known = vm.enemy_trainer.party[x]?.moves[i] != null;
                return {
                    known,
                    icon: known ? `images/gen2/type-icons-circular/${vm.g2MoveData[vm.move_name(props.battle.trainer.team[x][`move${i + 1}`]?.value)]?.Type?.toLowerCase()}.webp` : undefined,
                    name: vm.move_name(mon[`move${i + 1}`]?.value),
                };
            }),
            stats: vm.stat_object.map((stat: any, i: number) => {
                const label = vm.stat_mod(stat.name != "Hp" ? stages[i] : 0, x);
                return {
                    value: values[i],
                    labelStyle: fainted ? FAINTED_TEXT : label.style,
                    stage: stat.name != "Hp" ? { text: label.mod, shown: enemyOut && enemy.partyPos.value == x && stages[i] != `0` } : undefined,
                };
            }),
            statMode,
        };
    });
    return {
        trainer: vm.capitalization_format(vm.fixTrainerName(batt.trainer.class.value, batt.trainer.id.value)) + "'s Team",
        crop: vm.battlePokemonCrop(),
        slots,
        speedShown: vm.speed_comparison_toggle == true,
    };
}

/** The panel art's height for a team of n (the overlay's `battlePokemonCrop`). */
const HEIGHTS: Record<number, string> = { 1: "242px", 2: "402px", 3: "562px", 4: "726px", 5: "886px", 6: "1080px" };
/** The stat cells' trainer-table fields, in `stat_object`'s order. */
const STAT_FIELDS = ["hp", "attack", "defense", "special_attack", "special_defense", "speed"] as const;

/** The "Trainer" picker's options: every trainer of `crystal_trainers` (Crystal's table, also used for Gold/Silver). */
export function trainerPickerOptions(vm: any) {
    return trainerOptions(vm.crystal_trainers, (t) => t.name, (t) => t.location, (t) => !!t.party?.length);
}

/** The picked trainer (`examined_trainer`, a `crystal_trainers` key), or null. */
export function previewTrainer(vm: any): PreviewTrainer | null {
    return previewOf(vm.examined_trainer_data);
}

/**
 * The trainer preview (decision 14) in the same panel: the picked trainer's team from the trainer table, with the
 * player's Speed as the battle will start it (paralysis, then the Plain Badge; the panel's own To Battle rule).
 * Stats show the base stats in the base-stat modes and the trainer's stats otherwise (the table has no DVs).
 */
export function trainerPreviewView(vm: any, trainer: PreviewTrainer): EnemyTeamView<Gen2EnemySlot> {
    const props = vm.game.properties;
    const setting = vm.stats_setting;
    const statMode = setting == "EVs" || setting == "Detailed EVs" || setting == "Base Stats" ? 0 : 2;
    const party_speed = vm.status_stat_penalty("Speed", props.player.team[0].speed.value);
    const player_speed = props.player.badges.badge3.value ? Math.floor(party_speed * 1.125) : party_speed;
    const slots = trainer.party.map((mon, x): Gen2EnemySlot => {
        const fake = { species: { value: mon.species }, hp: 1 };
        const dex = vm.dexDataCrystal[mon.species];
        const type1 = dex?.type_1 ?? "Normal";
        const type2 = dex?.type_2 ?? type1;
        const order = speedOrder(player_speed, mon.stats.speed);
        return {
            slot: x,
            shown: true,
            speedPictureShown: true,
            speed: { label: speedLabel(order, "enemy"), svgClass: speedColorClass(order, false) },
            sprite: {
                src: `images/gen2/pokemon/${mon.species}.webp`,
                style: [vm.enemyPkmnFaint(fake), { transform: vm.enemyTransformFor(mon.species) }],
                species: mon.species,
                resizing: false,
            },
            species: mon.species,
            level: mon.level,
            styles: { species: vm.enemyPkmnSpecies(fake), statsArea: vm.enemyPkmnFaintStatsBackground(fake), icons: "filter: grayscale(0%) drop-shadow(0px 0px 1px #000000c5);", text: vm.enemyPkmnText(fake) },
            types: [
                { src: `images/gen2/type-icons-circular/${type1.toLowerCase()}.webp`, shown: true },
                type1 != type2 ? { src: `images/gen2/type-icons-circular/${type2.toLowerCase()}.webp`, shown: true } : { src: "", shown: false },
            ],
            moves: [0, 1, 2, 3].map((i) => {
                const name = vm.move_name(mon.moves[i]);
                return { known: mon.moves[i] != null, icon: `images/gen2/type-icons-circular/${vm.g2MoveData[name]?.Type?.toLowerCase()}.webp`, name };
            }),
            stats: vm.stat_object.map((stat: any, i: number) => ({
                value: statMode === 0 ? dex?.[stat.base_stat_path] : mon.stats[STAT_FIELDS[i]],
                labelStyle: "opacity: .7;",
                stage: i > 0 ? { text: "", shown: false } : undefined,
            })),
            statMode,
        };
    });
    return {
        trainer: trainer.header ?? trainer.name + "'s Team",
        crop: `height: ${HEIGHTS[trainer.party.length]}; filter: saturate(${vm.ui_saturation}) drop-shadow(0px 0px 1px #000000)`,
        slots,
        speedShown: vm.speed_comparison_toggle == true,
    };
}

/**
 * The wild panel ("Show Wild Battles", decision 30): a wild battle's Pokémon, from the battle's own copy
 * (`battle.enemyPokemon`: species, level, moves, battle stats), drawn as a one-Pokémon trainer preview under a
 * "Wild <species>" header. null outside a wild battle. Its speed label is the preview's (the player's party Speed),
 * and it shows no stat stages or faint.
 */
export function wildPreview(vm: any): PreviewTrainer | null {
    const batt = vm.batt;
    if (batt.mode.value != "Wild") return null;
    const mon = batt.enemyPokemon;
    const species = mon.species?.value;
    if (species == null) return null;
    return {
        name: "",
        header: "Wild " + species,
        party: [{
            species,
            level: mon.level?.value,
            moves: [mon.move1, mon.move2, mon.move3, mon.move4].map((move: any) => move?.value).filter(Boolean),
            stats: {
                hp: mon.maxHp?.value, attack: mon.attack?.value, defense: mon.defense?.value,
                special_attack: mon.specialAttack?.value, special_defense: mon.specialDefense?.value, speed: mon.speed?.value,
            },
        }],
    };
}

function slotNodes(view: EnemyTeamView<Gen2EnemySlot>, slot: Gen2EnemySlot): EnemyNode {
    const x = slot.slot;
    const text = slot.styles.text;
    // Each stat after HP sits in a wrapper of its own (the old template's `v-for` + `v-if`); HP's wrapper is empty.
    const wrapped = (node: (i: number) => EnemyNode): EnemyNode[] => ABRV.map((_, i) => ({ children: [i > 0 ? node(i) : null] }));
    const value = (i: number): EnemyNode => ({ class: `ePkmnStatsStyle ePkmn${ABRV[i]} opacityTransition`, style: text, text: slot.stats[i].value });
    const values: EnemyNode = slot.statMode === 0
        ? { key: 0, children: ABRV.map((_, i) => value(i)) }
        : { key: slot.statMode, children: [value(0), ...wrapped(value)] };
    return {
        show: slot.shown,
        class: `ePkmnStyle ePkmn${x + 1}`,
        children: [
            slot.shown ? {
                tag: "img",
                class: ["ePkmnSprite", { ePkmnSpriteResizing: slot.sprite.resizing }],
                attrs: { "data-enemy-slot": x, "data-enemy-species": slot.sprite.species },
                style: slot.sprite.style,
                src: slot.sprite.src,
            } : null,
            { class: "ePkmnSpecies opacityTransition", style: slot.styles.species, text: slot.species },
            { tag: "img", class: "enemyStatsArea", style: slot.styles.statsArea, src: `images/gen2/stats/${x}.svg` },
            { tag: "img", class: "ePkmnTypeIcons ePkmnType_1 ds opacityTransition", style: slot.styles.icons, src: slot.types[0].src },
            slot.types[1].shown ? { tag: "img", style: slot.styles.icons, class: "ePkmnTypeIcons ePkmnType_2 ds opacityTransition", src: slot.types[1].src } : null,
            // Moves
            ...slot.moves.map((move, i): EnemyNode => ({
                children: [
                    move.known ? { tag: "img", class: `ds eMoveIconStyle moveIcon${i + 1} opacityTransition`, style: slot.styles.icons, src: move.icon } : null,
                    { class: `ePkmnMoveStyle ePkmnMove${i + 1} opacityTransition`, style: text, text: move.name },
                ],
            })),
            // Level
            { class: "ePkmnLevel opacityTransition", style: text, text: enemyLevelText(slot.level) },
            // Stat labels
            {
                children: [
                    { class: "ePkmnStatLabelStyle ePkmnLabelHp  opacityTransition", style: slot.stats[0].labelStyle, text: LABEL[0] },
                    ...wrapped((i) => ({ class: `ePkmnStatLabelStyle ePkmnLabel${ABRV[i]} opacityTransition`, style: slot.stats[i].labelStyle, text: LABEL[i] })),
                ],
            },
            // Base stats / DVs / stats
            values,
            // Modifiers
            ...wrapped((i) => ({
                children: [{ show: slot.stats[i].stage!.shown, class: `ePkmnModsStyle ePkmnMod${ABRV[i]}`, text: slot.stats[i].stage!.text }],
            })),
            { children: [{ transition: "fade", show: view.speedShown, style: text, class: "speed_comparison", text: slot.speed.label }] },
        ],
    };
}

/** The panel inside the overlay's "Battle Graphic" branch. */
export function enemyTeamLayout(view: EnemyTeamView<Gen2EnemySlot>): EnemyChild[] {
    return [
        { class: "trainerLabel", text: view.trainer },
        { class: "colored-image", style: [view.crop, { "--url": "url(images/gen2/ui/opponent.svg)" }] },
        ...view.slots.map((slot): EnemyNode => ({
            children: [{ tag: "img", show: slot.speedPictureShown, class: ["canvas", slot.speed.svgClass], src: `images/gen2/ui/speed_comp/${slot.slot}.svg` }],
        })),
        ...view.slots.map((slot) => ({ class: "enemyGraphic", children: [slotNodes(view, slot)] })),
    ];
}
