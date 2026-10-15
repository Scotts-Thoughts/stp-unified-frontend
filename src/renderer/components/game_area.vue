<template>
	<!-- Logic only, no markup: the ROM starter, encounter flags, split comparison and Shuckie Bookmarks
	     subscriptions the old settings columns ran. Mounted first and in the old order, so they register
	     as they always did. -->
	<interface_1 />
	<interface_2 />
	<metrics />
	<encounters />

	<!-- The settings panel (core/settings/SettingsPanel.vue), described in games/gen1/settingsPanel.ts. The
	     templates below are the few pieces that stay markup: they render inside the panel, in its look. -->
	<settings-panel :panel="settingsPanel">
		<template #editor>
			<battle_testing />
		</template>
		<template #devtools>
			<label class="stp-row stp-toggle" title="Dev only. Packaged builds always apply enemy sprite styles.">
				<span class="stp-label">Enemy Sprite Styles</span>
				<input type="checkbox" :checked="enemyResize.styles_enabled" @change="enemyResize.setStylesEnabled($event.target.checked)">
			</label>
			<button v-if="!enemyResize.style_mode_active" class="stp-btn" @click="enemyResize.enterStyleMode()" title="Iterate every species: Enter saves + advances, Backspace discards + steps back, Escape exits.">Style Mode (Iterate Pokédex)</button>
			<button v-else class="stp-btn stp-btn-danger" @click="enemyResize.exitStyleMode()">Exit Style Mode</button>
			<div v-if="enemyResize.style_mode_active" class="stp-hint">{{ enemyResize.style_mode_index + 1 }} / {{ enemyResize.style_mode_species_list.length }} — <strong>{{ enemyResize.styleModeCurrentSpecies }}</strong></div>
		</template>
		<template #dvs>
			<dvs />
		</template>
	</settings-panel>
</template>

<script>
/**
 * gen1's settings area, inside the game-capture region (OBS lays the game over it). The panel is
 * the shared one (docs/ui-uniformity-plan.md stages 3-4); `.gen-1 .stp-settings` in style.css
 * places it.
 */
import { defineComponent, markRaw } from "vue"
import SettingsPanel from "~/core/settings/SettingsPanel.vue";
import { useEnemySpriteResizeStore } from "~/stores/useEnemySpriteResizeStore";
import { gen1SettingsPanel } from "~/games/gen1/settingsPanel";
import interface_1 from "./settings/interface_1.vue";
import interface_2 from "./settings/interface_2.vue";
import metrics from "./settings/metrics.vue";
import encounters from "./settings/encounters.vue";
import dvs from "./settings/dvs.vue";
import battle_testing from "./settings/battle_testing.vue";

export default defineComponent({
	components: {
		interface_1,
		interface_2,
		metrics,
		encounters,
		SettingsPanel,
		battle_testing,
		dvs,
	},
	inject: ["game"],
	data() {
		return {
			enemyResize: useEnemySpriteResizeStore(),
		};
	},
	computed: {
		// The settings panel's description (settingsPanel.ts). It reads nothing reactive itself, so it is
		// built once; the panel component reads the stores and the mapper through its closures as it renders.
		settingsPanel() {
			return markRaw(gen1SettingsPanel(() => this.game.properties));
		},
	},
});
</script>
