/**
 * gen1's enemy team panel as data for the shared `core/overlay/EnemyTeamPanel.ts`: what
 * `components/right_panel/enemy_graphic.vue` computes (`enemyTeamView`, read exactly as its old template read it)
 * and the elements it draws (`enemyTeamLayout`).
 */
import { toDisplayString, type StyleValue } from "vue";
import type { EnemyChild, EnemyNode } from "~/core/overlay/EnemyTeamPanel";
import { enemyLevelText, FAINTED_PICTURE, FAINTED_TEXT, type EnemySlotView, type EnemyTeamView } from "~/core/overlay/enemyTeamView";
import { speedColorClass, speedLabel, speedOrder } from "~/core/logic/speedLabel";
import { previewOf, trainerOptions, type PreviewTrainer } from "~/core/logic/trainerPreview";
import { trainers } from "~/data/trainers/trainers";
import { ref } from "vue";
import { get_enemy_pkmn_styles } from "~/methods/enemy";
import PokeData from "~/logic/PokeData";
import { status_penalty } from "~/logic/statusPenalty";

export interface Gen1EnemySlot extends EnemySlotView {
    /** The slot's species has arrived (it stays in the DOM, hidden, until then). */
    shown: boolean;
    /** Which sprite element: 0 Yellow, 1 Red and Blue, null none. */
    spriteKey: 0 | 1 | null;
    /** `get_enemy_pkmn_styles` (methods/enemy.js): the faint styles of the text, the species and level, the stats art. */
    styles: { text: StyleValue; species: StyleValue; statsArea: StyleValue; icons: StyleValue };
    /** Type 1, type 2 (when it differs), the ghost icon (Pumpkaboo backport). */
    types: { src: string; shown: boolean }[];
    /** The stage badges of Attack, Defense, Special and Speed. */
    mods: { text: unknown; shown: boolean }[];
}

export interface Gen1EnemyTeam extends EnemyTeamView<Gen1EnemySlot> {
    /** The trainer's art over the panel, when it has one. */
    art: string | null;
}

/** Stat label classes and text, in gen1's order (gen1 has one Special, and shows the crit rate). */
const LABELS: [string, string][] = [["Hp", "HP"], ["Atk", "Atk."], ["Def", "Def."], ["Spc", "Spc."], ["Spe", "Spe."], ["Crit", "Crit."]];
/** Stat value classes; the `ePkmnSpc` cell shows Speed and `ePkmnSpe` Special, as the old template did. */
const VALUES = ["Hp", "Atk", "Def", "Spc", "Spe", "Crit"];
/** The stage badges: the mapper's stage property and the badge's class. */
const MODS: [string, string][] = [["modEnemyStageAttack", "Atk"], ["modEnemyStageDefense", "Def"], ["modEnemyStageSpecial", "Spc"], ["modEnemyStageSpeed", "Spd"]];

/** What `enemy_graphic.vue`'s `view` computed returns; `vm` is that component. */
export function enemyTeamView(vm: any): Gen1EnemyTeam {
    const props = vm.game_properties;
    const battle = vm.battle;
    const enemy = battle.enemyPokemon;
    const game = vm.meta.game;
    const enemyOut = vm.meta.enemyState == "Pokemon" || vm.meta.enemyState == "Pokemon Sent Out" || vm.meta.enemyState == "Fainting";
    const slots = vm.party.map(([x, pokemon]: [number, { style: any }]): Gen1EnemySlot => {
        const team = props.battle.trainer.team[x];
        const speciesValue = team?.species?.value;
        const speed = vm.speed_comparison(x, vm.activeSlot(x, enemy.partyPos.value, "speed", team?.speed, "enemyPokemon")).comparison;
        const icons = vm.enemy_pkmn_faint_types(battle.trainer.team[x]);
        const type1 = vm.enemyType1(x);
        const type2 = vm.enemyType2(x);
        const stage = (value: unknown) => vm.stat_mod(value, x);
        // Decision 26: a fainted Pokémon's text, labels and stats art at half opacity (the sprite and icons already were).
        const fainted = team?.hp?.value == 0;
        const labelStages = [0, enemy.modEnemyStageAttack.value, enemy.modEnemyStageDefense.value, enemy.modEnemyStageSpecial.value, enemy.modEnemyStageSpeed.value, 0];
        const values = [
            team?.maxHp,
            vm.activeSlot(x, enemy.partyPos.value, "attack", team?.attack, "enemyPokemon"),
            vm.activeSlot(x, enemy.partyPos.value, "defense", team?.defense, "enemyPokemon"),
            vm.activeSlot(x, enemy.partyPos.value, "speed", team?.speed, "enemyPokemon"),
            vm.activeSlot(x, enemy.partyPos.value, "special", team?.special, "enemyPokemon"),
            toDisplayString(vm.enemy_crit_rate(team, x)) + "%",
        ];
        return {
            slot: x,
            shown: vm.slot_has_species(x),
            spriteKey: game == "Yellow" ? 0 : game == "Red and Blue" ? 1 : null,
            sprite: {
                src: (game == "Yellow" ? "images/pokemon/" : "images/pokemon/Red_and_Blue/") + team?.species + ".webp",
                style: [pokemon.style.faint, { transform: vm.resize.transformFor(speciesValue) }],
                species: speciesValue,
                resizing: vm.resize.resize.slot === x,
            },
            species: toDisplayString(team?.species),
            level: team?.level,
            styles: fainted
                ? { text: FAINTED_TEXT, species: FAINTED_TEXT, statsArea: FAINTED_PICTURE, icons }
                : { text: pokemon.style.text, species: pokemon.style.species, statsArea: pokemon.style.faint_stats_background, icons },
            types: [
                { src: "images/elements/type-icons/" + type1.toLowerCase() + ".webp", shown: true },
                { src: "images/elements/type-icons/" + type2.toLowerCase() + ".webp", shown: type1 != type2 },
                { src: "images/elements/type-icons/ghost.webp", shown: vm.enemyType3(x) == "Ghost" },
            ],
            moves: [1, 2, 3, 4].map((n) => {
                const move = team["move" + n]?.value;
                return { known: move != null, icon: move != null ? vm.move_icon(move) : undefined, name: vm.move_name(move) };
            }),
            stats: values.map((value, i) => ({
                value: toDisplayString(value),
                labelStyle: fainted ? FAINTED_TEXT : stage(labelStages[i]).style,
            })),
            mods: MODS.map(([property]) => ({
                text: stage(enemy[property].value).mod,
                shown: enemyOut && enemy.partyPos.value == x && enemy[property].value != "0",
            })),
            speed: { label: speed, svgClass: vm.svgColorClass(speed, battle.trainer.team[x]) },
        };
    });
    return {
        trainer: vm.capitalize_words(vm.fixTrainerName(battle.trainer.class.value, battle.trainer.number)),
        crop: vm.battle_pokemon_crop,
        slots,
        speedShown: vm.overlay.right_panel.speed_comparison,
        art: vm.showtrainerArtwork ? vm.trainer_artwork() : null,
    };
}

/** The settings panel's "Search Trainers" text (not saved). */
export const trainerSearch = ref("");

/** The "Trainer" picker's options for an edition ("Yellow", "Red and Blue"). */
export function gen1TrainerOptions(game: string | null) {
    return trainerOptions((trainers as Record<string, Record<string, unknown>>)[game ?? ""], (t) => t.name, (t) => t.location, (t) => !!t.party?.length);
}

/** The picked trainer, for `enemy_graphic.vue`'s `preview`, or null when there is none with a team. */
export function gen1PreviewTrainer(game: string | null, key: string): { key: string; trainer: PreviewTrainer } | null {
    const trainer = previewOf((trainers as Record<string, Record<string, any>>)[game ?? ""]?.[key]);
    return trainer ? { key, trainer } : null;
}

/** A not-fainted, not-in-battle slot's styles (methods/enemy.js and right_panel.vue's icon style, outside a battle). */
const ICONS = "filter: grayscale(0%) drop-shadow(0px 0px 1px #000000c5);";

/**
 * The trainer preview (core/logic/trainerPreview.ts) in the same panel: the picked trainer's team from the trainer
 * table, as it will be sent out, with the player's Speed as the game will see it at the start of the battle
 * (paralysis, then the Thunder Badge boost, as pokered LoadBattleMonFromParty).
 */
export function trainerPreviewView(vm: any, trainer: PreviewTrainer, key: string): Gen1EnemyTeam {
    const props = vm.game_properties;
    const game = vm.meta.game;
    const party_speed = status_penalty("Speed", props.player.team[0].speed.value, props.player.team[0].statusCondition?.value);
    const player_speed = props.player.badges.badge5.value ? Math.floor(party_speed * 1.125) : party_speed;
    const split = key.lastIndexOf(" ");
    const slots = trainer.party.map((mon, x): Gen1EnemySlot => {
        const style = get_enemy_pkmn_styles({ species: mon.species, hp: { value: 1 } });
        const data = PokeData.findSpecies(mon.species);
        const type1 = data?.type_1 ?? "Normal";
        const type2 = data?.type_2 ?? type1;
        const baseSpeed = data?.base_stats.speed;
        const order = speedOrder(player_speed, mon.stats.speed);
        return {
            slot: x,
            shown: true,
            spriteKey: game == "Yellow" ? 0 : game == "Red and Blue" ? 1 : null,
            sprite: {
                src: (game == "Yellow" ? "images/pokemon/" : "images/pokemon/Red_and_Blue/") + mon.species + ".webp",
                style: [style.faint, { transform: vm.resize.transformFor(mon.species) }],
                species: mon.species,
                resizing: false,
            },
            species: mon.species,
            level: mon.level,
            styles: { text: style.text, species: style.species, statsArea: style.faint_stats_background, icons: ICONS },
            types: [
                { src: "images/elements/type-icons/" + type1.toLowerCase() + ".webp", shown: true },
                { src: "images/elements/type-icons/" + type2.toLowerCase() + ".webp", shown: type1 != type2 },
                { src: "images/elements/type-icons/ghost.webp", shown: false },
            ],
            moves: [0, 1, 2, 3].map((i) => {
                const move = mon.moves[i];
                return { known: move != null, icon: move != null ? vm.move_icon(move) : undefined, name: vm.move_name(move) };
            }),
            // The cells as the live panel fills them: `ePkmnSpc` shows Speed, `ePkmnSpe` Special.
            stats: [mon.stats.hp, mon.stats.attack, mon.stats.defense, mon.stats.speed, mon.stats.special_attack,
                (baseSpeed ? Math.round(Math.round((Math.floor(baseSpeed / 2) / 256) * 10000) / 100) : 0) + "%"]
                .map((value) => ({ value: toDisplayString(value), labelStyle: "opacity: .7;" })),
            mods: MODS.map(() => ({ text: "", shown: false })),
            speed: { label: speedLabel(order, "enemy"), svgClass: speedColorClass(order, false) },
        };
    });
    return {
        trainer: vm.capitalize_words(vm.fixTrainerName(key.slice(0, split), Number(key.slice(split + 1)))),
        crop: vm.crop_for(trainer.party.length),
        slots,
        speedShown: vm.overlay.right_panel.speed_comparison,
        art: null,
    };
}

const fading = (cls: string, style: StyleValue, text: unknown): EnemyNode => ({ class: cls + " opacityTransition", style, text });

function slotNodes(view: Gen1EnemyTeam, slot: Gen1EnemySlot): EnemyNode {
    const x = slot.slot;
    const sprite: EnemyChild = slot.spriteKey === null ? null : {
        tag: "img",
        key: slot.spriteKey,
        class: ["ePkmnSprite", { ePkmnSpriteResizing: slot.sprite.resizing }],
        attrs: { "data-enemy-slot": x, "data-enemy-species": slot.sprite.species },
        style: slot.sprite.style,
        src: slot.sprite.src,
    };
    const typeClasses = ["ePkmnTypeIcons ePkmnType_1 ds opacityTransition", "ePkmnTypeIcons ePkmnType_2 ds opacityTransition", "ePkmnTypeIcons ePkmnType_3 ds opacityTransition"];
    return {
        class: "ePkmnStyle",
        show: slot.shown,
        children: [
            sprite,
            fading("ePkmnSpecies", slot.styles.species, slot.species),
            fading("ePkmnLevel", slot.styles.species, enemyLevelText(slot.level)),
            ...slot.types.map((type, i): EnemyChild => type.shown ? { tag: "img", class: typeClasses[i], style: slot.styles.icons, src: type.src } : null),
            // Moves
            { tag: "img", class: ["canvas", slot.speed.svgClass], src: "images/ui/speed_comp/" + x + ".svg" },
            { tag: "img", class: "enemyStatsArea opacityTransition", style: slot.styles.statsArea, src: "images/stats/" + x + ".svg" },
            ...slot.moves.map((move, i): EnemyNode => ({
                children: [
                    move.known ? { tag: "img", class: "ds eMoveIconStyle moveIcon" + (i + 1) + " opacityTransition", style: slot.styles.icons, src: move.icon } : null,
                    { class: "ePkmnMoveStyle ePkmnMove" + (i + 1) + " opacityTransition", style: slot.styles.text, text: move.name },
                ],
            })),
            // Stats
            ...LABELS.map(([cls, label], i) => fading("ePkmnStatLabelStyle ePkmnLabel" + cls, slot.stats[i].labelStyle!, label)),
            ...VALUES.map((cls, i) => fading("ePkmnStatsStyle ePkmn" + cls, slot.styles.text, slot.stats[i].value)),
            // Modifiers
            ...slot.mods.map((mod, i): EnemyNode => ({
                children: [{ class: "ePkmnModsStyle ePkmnMod" + MODS[i][1], show: mod.shown, text: mod.text }],
            })),
            {
                children: [{ transition: "fade", show: view.speedShown, style: slot.styles.text, class: "speed_comparison", text: slot.speed.label }],
            },
        ],
    };
}

/** `enemy_graphic.vue`'s elements inside its root `<div>`. */
export function enemyTeamLayout(view: Gen1EnemyTeam): EnemyChild[] {
    return [
        { class: "trainerLabel", text: view.trainer },
        { class: "tinted-box", style: [view.crop, { "--url": "url(images/ui/opponent.svg)" }] },
        { class: "enemyGraphic", children: view.slots.map((slot) => slotNodes(view, slot)) },
        view.art === null ? null : { key: "1", style: "position: absolute;", children: [{ tag: "img", class: "canvas", src: view.art }] },
    ];
}
