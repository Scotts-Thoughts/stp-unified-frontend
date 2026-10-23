<template>
	<transition name="fade">
		<!-- Style Mode (dev only): replaces the right panel with a dummy slot-0
		     enemy graphic so every species can be styled. Layout mirrors the
		     live enemy_graphic.vue component (single slot) with dummy stats
		     and moves so all surrounding graphics render. -->
		<div v-if="resize.style_mode_active" key="style_mode" style="position: absolute;">
			<div class="trainerLabel">{{ resize.styleModeCurrentSpecies }} {{ resize.style_mode_index + 1 }}/{{ resize.style_mode_species_list.length }}</div>
			<div class="tinted-box" style="height: 242px;" :style="`--url: url(images/ui/opponent.svg);`"></div>
			<div class="enemyGraphic">
				<div class="ePkmnStyle">
					<img v-if="meta.game == 'Yellow'" class="ePkmnSprite ePkmnSpriteResizing"
						:data-enemy-slot="0"
						:data-enemy-species="resize.styleModeCurrentSpecies"
						:style="{ transform: resize.transformFor(resize.styleModeCurrentSpecies), filter: `drop-shadow(${resize.getFlipped(resize.styleModeCurrentSpecies) ? -2 : 2}px 2px 2px #000000c5) saturate(1.1)` }"
						:src="'images/pokemon/' + resize.styleModeCurrentSpecies + '.webp'"/>
					<img v-else-if="meta.game == 'Red and Blue'" class="ePkmnSprite ePkmnSpriteResizing"
						:data-enemy-slot="0"
						:data-enemy-species="resize.styleModeCurrentSpecies"
						:style="{ transform: resize.transformFor(resize.styleModeCurrentSpecies), filter: `drop-shadow(${resize.getFlipped(resize.styleModeCurrentSpecies) ? -2 : 2}px 2px 2px #000000c5) saturate(1.1)` }"
						:src="'images/pokemon/Red_and_Blue/' + resize.styleModeCurrentSpecies + '.webp'"/>
					<div class="ePkmnSpecies opacityTransition">{{ resize.styleModeCurrentSpecies }}</div>
					<div class="ePkmnLevel opacityTransition">Lv:50</div>

					<img class="ePkmnTypeIcons ePkmnType_1 ds opacityTransition"
						:src="'images/elements/type-icons/' + styleModeType(1).toLowerCase() + '.webp'"/>
					<img v-if="styleModeType(1) != styleModeType(2)" class="ePkmnTypeIcons ePkmnType_2 ds opacityTransition"
						:src="'images/elements/type-icons/' + styleModeType(2).toLowerCase() + '.webp'"/>

					<img class="canvas red-svg" :src="'images/ui/speed_comp/0.svg'"/>
					<img class="enemyStatsArea opacityTransition" :src="'images/stats/0.svg'"/>

					<img v-for="(dummy, i) in style_mode_dummy_moves"
						:class="'ds eMoveIconStyle moveIcon' + (i + 1) + ' opacityTransition'"
						:src="'images/elements/type-icons/' + dummy.type + '.webp'"/>
					<div v-for="(dummy, i) in style_mode_dummy_moves"
						:class="'ePkmnMoveStyle ePkmnMove' + (i + 1) + ' opacityTransition'">{{ dummy.name }}</div>

					<div class="ePkmnStatLabelStyle ePkmnLabelHp   opacityTransition" style="opacity: .7;">HP</div>
					<div class="ePkmnStatLabelStyle ePkmnLabelAtk  opacityTransition" style="opacity: .7;">Atk.</div>
					<div class="ePkmnStatLabelStyle ePkmnLabelDef  opacityTransition" style="opacity: .7;">Def.</div>
					<div class="ePkmnStatLabelStyle ePkmnLabelSpc  opacityTransition" style="opacity: .7;">Spc.</div>
					<div class="ePkmnStatLabelStyle ePkmnLabelSpe  opacityTransition" style="opacity: .7;">Spe.</div>
					<div class="ePkmnStatLabelStyle ePkmnLabelCrit opacityTransition" style="opacity: .7;">Crit.</div>

					<div class="ePkmnStatsStyle ePkmnHp   opacityTransition">{{ styleModeStat('hp')              }}</div>
					<div class="ePkmnStatsStyle ePkmnAtk  opacityTransition">{{ styleModeStat('attack')          }}</div>
					<div class="ePkmnStatsStyle ePkmnDef  opacityTransition">{{ styleModeStat('defense')         }}</div>
					<!-- Live enemy_graphic.vue maps .ePkmnSpc -> speed and .ePkmnSpe -> special.
					     We mirror that here so the dummy aligns the same way visually. -->
					<div class="ePkmnStatsStyle  ePkmnSpc  opacityTransition">{{ styleModeStat('speed')           }}</div>
					<div class="ePkmnStatsStyle ePkmnSpe  opacityTransition">{{ styleModeStat('special_attack')  }}</div>
					<div class="ePkmnStatsStyle ePkmnCrit opacityTransition">—%</div>
				</div>
			</div>
		</div>
		<div v-else-if="settings.right_panel_mode == 'Movepool'" key=0>
			<movepool />
		</div>
		<div v-else-if="settings.right_panel_mode == 'Splits'" key=5>
			<div key=3>
				<div class="split_label">Splits</div>
				<div v-if="splitsView">
					<div><splits-panel :view="splitsView" /></div>
				</div>
			</div>
		</div>		
		<div v-else-if="(settings.right_panel_mode == 'Automatic' || settings.right_panel_mode == 'Trainers') && (meta.gameState == 'To Battle' || meta.gameState == 'Battle') && (battle_type == 'Trainer' || (battle_type == 'Wild' && settings.right_panel.wild_battles))" style="position: absolute;" key=1>
			<enemy_graphic v-if="(game_properties.battle.type as GameHookProperty).value == 'Trainer'" :enemy_pkmn_faint_types />
			<wild_pokemon v-else-if="(game_properties.battle.type as GameHookProperty).value == 'Wild'"  :enemy_pkmn_faint_types />
		</div>
		<!-- Trainers (decision 14): the picked trainer's team in the enemy panel, outside a trainer battle. -->
		<div v-else-if="settings.right_panel_mode == 'Trainers' && trainer_preview" style="position: absolute;" key=6>
			<enemy_graphic :enemy_pkmn_faint_types :preview="trainer_preview" />
		</div>
		<div v-else key=3>
			<movepool/>
		</div>
	</transition>
</template>

<script lang="ts">
import { defineComponent, inject } from "vue";
import { useOverlaySettingsStore } from "~/stores/useOverlaySettingsStore";
import { useEnemySpriteResizeStore } from "~/stores/useEnemySpriteResizeStore";
import { GameHookProperty } from "~/packages/gameHookMapperClient";
import { useMetaStore } from "~/stores/metaStore";
import { trainer_name_lookup } from "~/autosplitter/trainer_name_lookup";
import { convertDurationToSeconds, convertSecondsToDuration, formatSplitTime } from "~/utils/timehelpers";
import { split_trainers } from "~/games/gen1/data/splits";
import { battle_summary } from "~/autosplitter/battle_summary";
import { useBattleStore } from "~/stores/useBattleStore";
import { useGameSpeciesData } from "~/stores/useGameSpeciesData";
import SplitsPanel from "~/core/overlay/SplitsPanel.vue";
import { splitDiffColor, splitsHead, type SplitsRow, type SplitsSummaryRow, type SplitsView } from "~/core/overlay/splitsView";
import movepool from "./right_panel/move_pool.vue"
import enemy_graphic from "./right_panel/enemy_graphic.vue"
import wild_pokemon from "./right_panel/wild_pokemon.vue"
import PokeData from "~/logic/PokeData";
import { gen1PreviewTrainer } from "~/games/gen1/enemyPanel";

export default defineComponent({
	props: [ "current_splits", "previous_splits", "collect_split_data"],
	components: {
		movepool,
		SplitsPanel,
		enemy_graphic,
		wild_pokemon
	},
	data() {
		return {
			meta: useMetaStore(),
			settings: useOverlaySettingsStore(),
			resize: useEnemySpriteResizeStore(),
			battle: useBattleStore(),
			runConfig: useGameSpeciesData(),
			game_properties: inject<Record<string, GameHookProperty>>("game_properties", {}),
			trainer_name_lookup,
            battle_summary_header: "Battle Summary",
			style_mode_dummy_moves: [
				{ name: "Tackle",    type: "normal" },
				{ name: "Water Gun", type: "water"  },
				{ name: "Ember",     type: "fire"   },
				{ name: "Vine Whip", type: "grass"  },
			] as { name: string; type: string }[],
		}
	},
	computed: {
		/** The trainer the "Trainers" mode previews (games/gen1/enemyPanel.ts), or null. */
		trainer_preview() {
			return gen1PreviewTrainer(this.meta.game, this.settings.right_panel.trainer.examined);
		},
		/** "Trainer", "Wild" or "None". */
		battle_type(): string {
			return (this.game_properties.battle?.type as unknown as GameHookProperty)?.value ?? "None";
		},
		compare_splits() {
            if (this.collect_split_data != true) {
                return;
            }
            const result: any[] = []
            const game = this.game_properties.meta.gameName.value
            const addedTrainers = new Set(); // Keep track of the trainers that have been added to the result
            for (const x of this.previous_splits) {
                if (split_trainers[game].includes(x.trainer)) {
                    const default_string = "-"
                    const cur_split = this.current_splits.find(y => y.trainer === x.trainer)
                    const prev = convertDurationToSeconds(x.time)
                    if (cur_split == undefined) {
                        if (!addedTrainers.has(x.trainer)) { // Check if the trainer has already been added to the result
                            result.push({ 
								trainer: x.trainer, 
								previous_time: convertSecondsToDuration(prev), 
								current_time: default_string, 
								difference: default_string 
							});
                            addedTrainers.add(x.trainer); // Add the trainer to the set of added trainers
                        }
                        continue
                    }
                    const cur = convertDurationToSeconds(cur_split.time)
                    const diff = cur - prev;
                    const diff_abs = Math.abs(diff);
                    const diff_sign = Math.sign(diff);
                    const diff_m = Math.floor(diff_abs / 60);
                    const diff_s = diff_abs % 60;
                    var diff_str = `${diff_sign === -1 ? "-" : "+"}${diff_m}:${diff_s.toString().padStart(2, "0")}`;
                    if (diff_str == "+0:00") { diff_str = "0:00" }
                    if (!addedTrainers.has(x.trainer)) { // Check if the trainer has already been added to the result
                        result.push({ trainer: x.trainer, previous_time: convertSecondsToDuration(prev), current_time: convertSecondsToDuration(cur), difference: diff_str })
                        addedTrainers.add(x.trainer); // Add the trainer to the set of added trainers
                    }
                }
            }
            return result
        },
		/** The "first run" rows: completed splits, then the ones still to come (plan 1.1). */
		first_splits(): { trainer: string; current_time: string }[] {
			const game = this.game_properties.meta.gameName.value;
			const optional = ["Rival1a-Route 22"];
			const completedSplits = this.current_splits
				.filter(split => split_trainers[game].includes(split.trainer))
				.map(split => { return { trainer: split.trainer, current_time: formatSplitTime(split.time) } });
			const upcomingSplits = split_trainers[game]
				.filter(trainer => !optional.includes(trainer))
				.filter(trainer => !completedSplits.some(split => split.trainer === trainer))
				.map(x => ({ trainer: x, current_time: "-" }));
			return [
				...completedSplits,
				...upcomingSplits
			];
		},
		/** What the shared Splits panel (core/overlay/SplitsPanel.vue) shows in the chosen mode, if any. */
		splitsView(): SplitsView | undefined {
			const mode: string = this.settings.right_panel.splits.mode;
			if (mode !== "First" && mode !== "Followup" && mode !== "Followup + Summary") return undefined;
			const lookup = this.trainer_name_lookup;
			const type = (PokeData.findSpecies(this.meta.starter)?.type_2 ?? "Normal").toLowerCase();
			const labels = this.runConfig.config.labels;
			const icon = (trainer: string) => 'images/split_images/' + lookup.basic[trainer]?.trainer + '.webp';
			const compared: any[] = this.compare_splits ?? [];
			const view: SplitsView = {
				table: mode === "Followup + Summary" ? { class: "splits_table_old" } : { class: "splits_table", icon: { cellClass: "scaled_icon" } },
				head: splitsHead(mode, labels.split_previous, labels.split_current),
				headerColor: `var(--${type})`,
				rows: mode === "First"
					? this.first_splits.map((split): SplitsRow => ({
						icon: icon(split.trainer),
						cells: [lookup.detailed[split.trainer]?.trainer, "", "", split.current_time],
					}))
					: compared.map((split): SplitsRow => ({
						icon: mode === "Followup" ? icon(split.trainer) : undefined,
						cells: [lookup.basic[split.trainer]?.trainer, split.previous_time, split.current_time, split.difference],
						diffStyle: splitDiffColor(split.difference),
					})),
				art: { class: "tinted-box", style: "--url: url(images/ui/movepool.svg)", frameBottom: 1037 },
			};
			if (mode === "Followup + Summary") {
				const stats = this.battle.statistics as Record<string, any>;
				const metric = (stat: { name: string; data_name: string }): SplitsSummaryRow =>
					({ label: [stat.name], value: stats[stat.data_name] != 0 ? stats[stat.data_name] : "-" });
				view.summary = {
					header: this.battle_summary_header,
					labelFirst: true,
					sectionClass: `background-${type}`,
					rows: [
						{ label: ["Battle Duration", "(real-time)"], value: stats.battle_duration ? stats.battle_duration : "-" },
						{ label: ["Experience Per Second"], value: stats.exp_per_second != 0 ? stats.exp_per_second : "-" },
						...battle_summary.global.map(metric),
						{ section: "Player:" },
						...battle_summary.player.map(metric),
						{ section: "Enemy:" },
						...battle_summary.enemy.map(metric),
					],
				};
				view.art = { class: "tinted-box", style: "--url: url(images/ui/ui_splits.svg)" };
			}
			return view;
		},
	},
	methods: {
		enemy_pkmn_faint_types(pkmnData) {
            if (this.meta.gameState == `To Battle`) {
                return "filter: grayscale(0%) drop-shadow(0px 0px 1px #000000c5);"
            } else if (pkmnData?.hp == 0 || this.meta.gameState == `From Battle`) {
                return "filter: grayscale(100%) drop-shadow(0px 0px 1px #000000c5); opacity: .5; "
            }
            return "filter: grayscale(0%) drop-shadow(0px 0px 1px #000000c5);"
        },
		styleModeType(which: 1 | 2): string {
			const species = this.resize.styleModeCurrentSpecies;
			if (!species) return "Normal";
			try {
				const data = PokeData.getSpecies(species);
				return (which === 1 ? data.type_1 : data.type_2) ?? "Normal";
			} catch (e) {
				return "Normal";
			}
		},
		styleModeStat(stat: "hp" | "attack" | "defense" | "speed" | "special_attack" | "special_defense"): number {
			const species = this.resize.styleModeCurrentSpecies;
			if (!species) return 50;
			try {
				return PokeData.getSpecies(species).base_stats[stat] ?? 50;
			} catch (e) {
				return 50;
			}
		},
	}
})
</script>