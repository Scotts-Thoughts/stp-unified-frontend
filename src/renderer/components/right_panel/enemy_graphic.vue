

<template>
<div>
    <!-- The enemy team panel (core/overlay/EnemyTeamPanel.ts), laid out in games/gen1/enemyPanel.ts. A slot whose data
         hasn't arrived yet would show "null" and "Lv:0"; it is hidden like gen2's (v-show keeps it in the DOM). -->
    <enemy-team-panel :view="enemy_team_view" :layout="enemy_team_layout" />
</div>
</template>

<script lang="ts">
import { get_enemy_pkmn_styles } from "../../methods/enemy";
import PokeData from "~/logic/PokeData";
import { status_penalty } from "~/logic/statusPenalty";
import { capitalize_words, move_name } from "../../methods/text_functions";
import { useMetaStore } from "~/stores/metaStore";
import { formatStage } from "~/core/logic/statFormat";
import { defineComponent, inject } from "vue";
import {  useOverlaySettingsStore } from "~/stores/useOverlaySettingsStore";
import { useEnemySpriteResizeStore } from "~/stores/useEnemySpriteResizeStore";
import { GameHookProperty } from "~/packages/gameHookMapperClient";
import { EnemyTeamPanel } from "~/core/overlay/EnemyTeamPanel";
import { speedColorClass, speedLabel, speedLabelOrder, speedOrder } from "~/core/logic/speedLabel";
import { enemyTeamLayout, enemyTeamView, trainerPreviewView, type Gen1EnemyTeam } from "~/games/gen1/enemyPanel";
export default defineComponent({
    name: "EnemyGraphics",
    components: { EnemyTeamPanel },
    props: [
        "enemy_pkmn_faint_types",
        /** The right panel's "Trainers" mode: `{ key, trainer }` of the picked trainer (core/logic/trainerPreview.ts). */
        "preview",
    ],
    data() {
        return {
            game_properties: inject<Record<string, GameHookProperty>>("game_properties", {}),
            meta: useMetaStore(),
            overlay: useOverlaySettingsStore(),
            resize: useEnemySpriteResizeStore(),
        }
    },
    computed: {
        /** What the enemy team panel shows, worked out once per change (games/gen1/enemyPanel.ts). */
        enemy_team_view(): Gen1EnemyTeam {
            return this.preview ? trainerPreviewView(this, this.preview.trainer, this.preview.key) : enemyTeamView(this);
        },
        enemy_team_layout() {
            return enemyTeamLayout;
        },
        showtrainerArtwork() {
            // TODO: I think this logic can be drastically simplified, but i'm not sure. - Ion.
            return this.trainer_artwork() != null 
                && this.meta.gameState != 'No Pokemon' 
                && this.meta.gameState != 'Overworld' 
                && this.meta.gameState != 'From Battle' 
                && (this.game_properties.battle.type as unknown  as GameHookProperty).value == 'Trainer' 
                && (this.overlay.right_panel.mode === 'Automatic' || this.overlay.right_panel.mode === 'Trainers');
        },
        party() {
            const result: any[] = [];
            for (let i = 0; i < this.game_properties.battle.trainer.totalPokemon.value; i++) {
                result.push([
                    i,
                    {
                        style: this.get_enemy_pkmn_styles(this.battle.trainer.team[i]),
                    }
                ]);
            }
            return result;
        },
        battle() {
            return this.game_properties.battle;
        },
        //Sets the crop on the UI image for the enemy team so that unused party slots are not present
        battle_pokemon_crop() {
            return this.crop_for(this.game_properties.battle.trainer.totalPokemon.value);
        },
    },
    methods: {
        /** The panel art cut to a team of `totalPokemon`. */
        crop_for(totalPokemon: number): string {
            const heights = {
                1: "242px",
                2: "402px",
                3: "562px",
                4: "722px",
                5: "886px",
                6: "1080px"
            };
            return `height: ${heights[totalPokemon] ?? "242px"};`;
        },
        move_name,
        capitalize_words,
        get_enemy_pkmn_styles,
        /** Path of the type icon for a move of the enemy pokemon. Unknown moves fall back to the normal type. */
        move_icon(rawMoveName) {
            const move = PokeData.findMove(this.move_name(rawMoveName));
            return 'images/elements/type-icons/' + (move?.type ?? "Normal").toLowerCase() + '.webp';
        },
        speed_comparison(enemy_slot, enemy_speed_incoming) {
            const trainer = this.game_properties.battle.trainer.class.value
            const trainer_number = this.game_properties.battle.trainer.number.value
            const trainerData = PokeData.getTrainer(`${trainer} ${trainer_number}`);
            let enemy_hp = this.game_properties.battle.trainer.team[enemy_slot].hp.value
            let player_speed = this.game_properties.battle.yourPokemon.speed.value
            let enemy_speed = enemy_speed_incoming
            // The live Speed is unreadable until the battle data is in; compare the party Speed then
            if (enemy_speed == null || !Number.isFinite(Number(enemy_speed))) {
                enemy_speed = this.game_properties.battle.trainer.team[enemy_slot]?.speed?.value
            }
            if (this.meta.gameState == 'To Battle') {
                // Before the battle data is populated, compare against the trainer data and apply the Soul Badge boost.
                // Paralysis is applied before the badge (pokered LoadBattleMonFromParty)
                const koga_badge = this.game_properties.player.badges.badge5.value
                const party_speed = status_penalty("Speed", this.game_properties.player.team[0].speed.value, this.game_properties.player.team[0].statusCondition?.value)
                enemy_speed = trainerData?.party?.[enemy_slot]?.stats?.speed
                player_speed = koga_badge ? Math.floor(party_speed * 1.125) : party_speed
            }
            let object = {
                comparison: "Outspeeds",
                color: "background-color: rgba(255, 63, 63, 0.6)",
            }
            const order = speedOrder(player_speed, enemy_speed)
            object.comparison = speedLabel(order, "enemy")
            if (order > 0) {
                object.color = "background-color: rgba(28, 255, 58, 0.4)"
            }
            else if (order == 0) {
                object.color = "background-color: rgba(255, 255, 0, 0.5)"
            }
            if (enemy_hp == 0) {
                object.color = "background-color: rgba(28, 255, 58, 0.5); opacity: 0.0; filter: grayscale(100%)"
            }
            return object
        },
        svgColorClass(speed_comparison, enemy_data) {
            return speedColorClass(speedLabelOrder(speed_comparison, "enemy") ?? -1, enemy_data.hp.value == 0);
        },
        fixTrainerName(trainerName, trainerNumber) {
            const gameName = this.meta.game;
            const rival1Teams = [
                "rival 1's team",
                "rival 1A's team",
                "rival 2's team"];
            const rival2Teams = [
                "rival 3's team",
                "rival 4's team",
                "rival 4's team",
                "rival 4's team",
                "rival 5's team",
                "rival 5's team",
                "rival 5's team",
                "rival 6's team",
                "rival 6's team",
                "rival 6's team",
            ];

            if (gameName == "Yellow") {
                if (trainerName == "RIVAL1") {
                    return rival1Teams[trainerNumber - 1];
                }
                if (trainerName == "RIVAL2") {
                    return rival2Teams[trainerNumber - 1];
                }
                if (trainerName == "RIVAL3") {
                    return "champion's team";
                }
            }
            if (gameName == "Red and Blue") {
                if (trainerName == "RIVAL1" && (trainerNumber == 1 || trainerNumber == 2 || trainerNumber == 3)) {
                    return "rival1's team";
                }
                else if (trainerName == "RIVAL1" && (trainerNumber == 4 || trainerNumber == 5 || trainerNumber == 6)) {
                    return "rival1a's team";
                }
                else if (trainerName == "RIVAL1" && (trainerNumber == 7 || trainerNumber == 8 || trainerNumber == 9)) {
                    return "rival2's team";
                }
                else if (trainerName == "RIVAL2" && (trainerNumber == 1 || trainerNumber == 2 || trainerNumber == 3)) {
                    return "rival3's team";
                }
                else if (trainerName == "RIVAL2" && (trainerNumber == 4 || trainerNumber == 5 || trainerNumber == 6)) {
                    return "rival4's team";
                }
                else if (trainerName == "RIVAL2" && (trainerNumber == 7 || trainerNumber == 8 || trainerNumber == 9)) {
                    return "rival5's team";
                }
                else if (trainerName == "RIVAL2" && (trainerNumber == 10 || trainerNumber == 11 || trainerNumber == 12)) {
                    return "rival6's team";
                }
                else if (trainerName == "RIVAL3") {
                    return "champion's team";
                }
            }
            return trainerName.toLowerCase() + "'s team";                
        },
        enemyType1(slotNumber) {
            const pkmn_species = this.game_properties.battle.trainer.team[slotNumber].species.value
            if (pkmn_species == null) {
                return "Normal"
            }
            return PokeData.findSpecies(pkmn_species)?.type_1 ?? "Normal"
        },
        enemyType2(slotNumber) {
            const pkmn_species = this.game_properties.battle.trainer.team[slotNumber].species.value
            const type_1 = this.enemyType1(slotNumber)
            if (pkmn_species == null) {
                return "Normal"
            }
            const type_2 = PokeData.findSpecies(pkmn_species)?.type_2 ?? type_1
            if (type_1 == type_2 && this.meta.starter == 'Pumpkaboo' && this.game_properties.patch.backport.prop_2.value == 8 && this.game_properties.battle.enemyPokemon.partyPos.value == slotNumber) {
                return 'Ghost'
            }
            return type_2
        },
        enemyType3(slotNumber) {
            const pkmn_species = this.game_properties.battle.trainer.team[slotNumber].species.value
            const type1 = PokeData.findSpecies(pkmn_species)?.type_1 ?? "Normal";
            const type2 = PokeData.findSpecies(pkmn_species)?.type_2 ?? "Normal";
            if (type2 != null && type1 != type2 && this.meta.starter == 'Pumpkaboo' && this.game_properties.patch.backport.prop_2.value == 8 && this.game_properties.battle.enemyPokemon.partyPos.value == slotNumber) {
                return 'Ghost'
            }
            else {
                return "Normal"
            }
        },
        /** False while a team slot's species hasn't arrived (null or empty), so the slot stays hidden. */
        slot_has_species(slot: number): boolean {
            const species = this.game_properties.battle.trainer.team[slot]?.species?.value;
            return species != null && species !== "";
        },
        stat_mod(modifer, slot) {
            let mod = modifer
            const mod_string = formatStage(mod)
            let style_string = ""

            if (mod == 0) {
                style_string = 'opacity: .7;'
            }
            if (mod > 0) {
                style_string = 'opacity: .1;'
            }
            if (mod < 0) {
                style_string = 'opacity: .1;'
            }

            if (this.game_properties.battle.trainer.team[slot].hp.value == 0) {
                style_string = 'opacity: .3;'
            }
            if (slot != this.game_properties.battle.enemyPokemon.partyPos.value && this.game_properties.battle.trainer.team[slot].hp.value > 0) {
                style_string = 'opacity: .7;'
            }

            let object = {
                mod: mod_string,
                style: style_string,
            }
            // return { mod: -1, style: 'opacity: .7;' }
            // console.log(object)
            return object
        },
        // STAGE MULTIPLIERS
        //edge case management (prevent flickering of the stat values due to overlay stage multipliers being applied on Pokemon that are not yet in battle)
        //determine which Pokemon is currently in battle and display only their stage multipliers
        activeSlot(activePkmn, currentSlot, statLabel, stat, side) {
            if (this.meta.enemyState == "Fainted" || this.meta.gameState == "From Battle") {
                return stat;
            } else if (this.meta.enemyState == "Pokemon" || this.meta.enemyState == "Pokemon Sent Out" || this.meta.enemyState == "Fainting") {
                if (activePkmn == currentSlot && this.meta.gameState == "Battle") {
                    return this.game_properties.battle[side][statLabel].value;
                }
                return stat;
            }
            return stat;
        },
        enemy_crit_rate(pkmnData, slot) {
            const species = pkmnData?.species.value;
            const base_speed = PokeData.findSpecies(species)?.base_stats.speed;
            if (base_speed) {
                // The active enemy's Focus Energy shifts the rate right instead of left (pokered CriticalHitTest)
                const pumped = this.meta.gameState == "Battle"
                    && slot == this.game_properties.battle.enemyPokemon.partyPos.value
                    && this.game_properties.battle.enemyPokemon.effects?.focusEnergy?.value == true
                const rate = pumped ? Math.floor(Math.floor(base_speed / 2) / 4) : Math.floor(base_speed / 2)
                return Math.round(Math.round((rate / 256) * 10000) / 100)
            }
            return 0;
        },
        trainer_artwork(): string|undefined { //pick the trainer graphic based on the trainer class and number
            const trainerClass = this.game_properties.battle.trainer.class
            const trainerNumber = this.game_properties.battle.trainer.number
            if (this.game_properties.meta.gameName.value == "Yellow") {
                switch (`${trainerClass}_${trainerNumber}`) {
                    case "LT.SURGE_1": return "images/trainers/ltsurge.webp";
                    case "SABRINA_1": return "images/trainers/sabrina.webp";
                    case "BLAINE_1": return "images/trainers/blaine.webp";
                    case "RIVAL1_1": return "images/trainers/RIVAL1.webp";
                    case "RIVAL1_2": return "images/trainers/RIVAL1.webp";
                    case "RIVAL1_3": return "images/trainers/RIVAL2.webp";
                    case "RIVAL1_4": return "images/trainers/RIVAL2.webp";
                    case "RIVAL1_5": return "images/trainers/RIVAL2.webp";
                    case "RIVAL1_6": return "images/trainers/RIVAL2.webp";
                    case "RIVAL1_7": return "images/trainers/RIVAL2.webp";
                    case "RIVAL2_1": return "images/trainers/RIVAL2.webp";
                    case "ROCKET_42": return "images/trainers/JESSIE_JAMES_1.webp";
                    case "ROCKET_44": return "images/trainers/JESSIE_JAMES_2.webp";
                    case "ROCKET_45": return "images/trainers/JESSIE_JAMES_2.webp";
                    case "JR TRAINER F_5": return "images/trainers/JR TRAINER F_5.webp";
                    case "YOUNGSTER_1": return "images/trainers/BEN.webp";
                    case "POKEMANIAC_7": return "images/trainers/POKEMANIAC_7.webp";
                    case "SUPER NERD_2": return "images/trainers/FOSSIL_NERD.webp";
                    case "LASS_10": return "images/trainers/ODDISH_LASS.webp";
                    case "FISHER_7": return "images/trainers/SIKE.webp";
                    case "JR TRAINER F_10": return "images/trainers/JR TRAINER F_10.webp";
                    case "ROCKET_5": return "images/trainers/dig_rocket.webp";
                    case "ROCKET_38": return "images/trainers/ROCKET_38.webp";
                    case "HIKER_9": return "images/trainers/HIKER_9.webp";
                    case "LASS_3": return "images/trainers/LASS_3.webp";
                    case "JR TRAINER F_1": return "images/trainers/GOLDEEN.webp";
                    case "ROCKET_25": return "images/trainers/HYPNO_SANDWICH.webp";
                    case "JR TRAINER F_3": return "images/trainers/JR TRAINER F_3.webp";
                    case "CHANNELER_10": return "images/trainers/AGATHAJR.webp";
                    case "BROCK_1": return "images/trainers/brock.webp";
                    case "MISTY_1": return "images/trainers/misty.webp";
                    case "ERIKA_1": return "images/trainers/erika.webp";
                    case "KOGA_1": return "images/trainers/koga.webp";
                    case "LORELEI_1": return "images/trainers/lorelei.webp";
                    case "BRUNO_1": return "images/trainers/bruno.webp";
                    case "AGATHA_1": return "images/trainers/agatha.webp";
                    case "LANCE_1": return "images/trainers/lance.webp";
                    case "HIKER_2": return "images/trainers/elixir_hiker.webp";
                    default: return;
                }
            }
            if (this.game_properties.meta.gameName.value == "Red and Blue") {
                switch (`${trainerClass}_${trainerNumber}`) {
                    case "LT.SURGE_1": return "images/trainers/Red_and_Blue/ltsurge.webp";
                    case "SABRINA_1": return "images/trainers/Red_and_Blue/sabrina.webp";
                    case "BLAINE_1": return "images/trainers/Red_and_Blue/blaine.webp";
                    case "RIVAL1_1": return "images/trainers/Red_and_Blue/RIVAL1.webp";
                    case "RIVAL1_2": return "images/trainers/Red_and_Blue/RIVAL1.webp";
                    case "RIVAL1_3": return "images/trainers/Red_and_Blue/RIVAL1.webp";
                    case "RIVAL1_4": return "images/trainers/Red_and_Blue/RIVAL1.webp";
                    case "RIVAL1_5": return "images/trainers/Red_and_Blue/RIVAL1.webp";
                    case "RIVAL1_6": return "images/trainers/Red_and_Blue/RIVAL1.webp";
                    case "RIVAL1_7": return "images/trainers/Red_and_Blue/RIVAL2.webp";
                    case "RIVAL1_8": return "images/trainers/Red_and_Blue/RIVAL2.webp";
                    case "RIVAL1_9": return "images/trainers/Red_and_Blue/RIVAL2.webp";
                    case "RIVAL2_1": return "images/trainers/Red_and_Blue/RIVAL2.webp";
                    case "RIVAL2_2": return "images/trainers/Red_and_Blue/RIVAL2.webp";
                    case "RIVAL2_3": return "images/trainers/Red_and_Blue/RIVAL2.webp";
                    case "JR TRAINER F_5": return "images/trainers/Red_and_Blue/JR TRAINER F_5.webp";
                    case "YOUNGSTER_1": return "images/trainers/Red_and_Blue/BEN.webp";
                    case "POKEMANIAC_7": return "images/trainers/Red_and_Blue/POKEMANIAC_7.webp";
                    case "SUPER NERD_2": return "images/trainers/Red_and_Blue/FOSSIL_NERD.webp";
                    case "LASS_10": return "images/trainers/Red_and_Blue/ODDISH_LASS.webp";
                    case "JR TRAINER F_10": return "images/trainers/Red_and_Blue/JR TRAINER F_10.webp";
                    case "ROCKET_5": return "images/trainers/dig_rocket.webp";
                    case "ROCKET_38": return "images/trainers/Red_and_Blue/ROCKET_38.webp";
                    case "HIKER_9": return "images/trainers/Red_and_Blue/HIKER_9.webp";
                    case "LASS_3": return "images/trainers/Red_and_Blue/LASS_3.webp";
                    case "JR TRAINER F_1": return "images/trainers/Red_and_Blue/GOLDEEN.webp";
                    case "ROCKET_25": return "images/trainers/Red_and_Blue/HYPNO_SANDWICH.webp";
                    case "JR TRAINER F_3": return "images/trainers/Red_and_Blue/JR TRAINER F_3.webp";
                    case "CHANNELER_10": return "images/trainers/Red_and_Blue/AGATHAJR.webp";
                    case "BROCK_1": return "images/trainers/Red_and_Blue/brock.webp";
                    case "MISTY_1": return "images/trainers/Red_and_Blue/misty.webp";
                    case "ERIKA_1": return "images/trainers/Red_and_Blue/erika.webp";
                    case "KOGA_1": return "images/trainers/Red_and_Blue/koga.webp";
                    case "LORELEI_1": return "images/trainers/lorelei.webp";
                    case "BRUNO_1": return "images/trainers/bruno.webp";
                    case "AGATHA_1": return "images/trainers/agatha.webp";
                    case "LANCE_1": return "images/trainers/lance.webp";
                    case "ROCKET_1": return "images/trainers/Red_and_Blue/mtmoon_rocket_boss.webp";
                    case "HIKER_2": return "images/trainers/Red_and_Blue/elixir_hiker.webp";
                    default: return;
                }
            }
            return;
        }
    },
});
</script>