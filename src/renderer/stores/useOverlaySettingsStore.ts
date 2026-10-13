import { defineStore } from "pinia";
import { PokemonGame } from "~/logic/PokeDataTypes";
import { loadAppSettings, saveAppSettings } from "./helper/files";
import { deepMerge } from "./helper/merge";
import { StatsPanelMode } from "./types/StatsPanelMode";
import { RightPanelMode } from "./types/RightPanelMode";
import { SplitsMode } from "./types/SplitsMode";
import { OverlayPopupSettings } from "./types/OverlayPopupSettings";
import { BonksSettings } from "./types/BonksSettings";

/**
 * General overlay settings, that apply regardless of game and starer species.
 * Saved automatically when changes are made, at the appropriate app-settings directory of the user.
 */
export type OverlaySettings = ReturnType<typeof defaultOverlaySettings>;

/**
 * The edition the user is playing. "Red" and "Blue" share the "Red and Blue" mapper, so this is only used for
 * labelling split files (the `Y`/`R`/`B` prefix) and for the game dropdown.
 */
export type GameEdition = "Yellow" | "Red" | "Blue";

const SETTINGS_FILE = "overlay_settings.json";

export const useOverlaySettingsStore = defineStore('overlay_settings', {
	state: () => defaultOverlaySettings(),
	getters: {
		// Useful shorthands:
		left_panel(state) {
			return state.visualization.left_panel;
		},
		pop_ups(state) {
			return state.visualization.pop_ups;
		},
		right_panel(state) {
			return state.visualization.right_panel;
		},
		right_panel_mode(state) {
			return state.visualization.right_panel.mode_override
				?? state.visualization.right_panel.mode;
		},
		/** Single letter prefix used in the names of the split files. */
		gameLetter(state): "Y" | "R" | "B" {
			switch (state.edition) {
				case "Red": return "R";
				case "Blue": return "B";
				default: return "Y";
			}
		},
	},
	actions: {
		async save() {
			// The post-battle splits override is state of the *run*, not a setting: written
			// out with the rest it came back on the next launch and put the splits over an
			// Automatic right panel before the game had even started (2026-09-13).
			const snapshot = JSON.parse(JSON.stringify(this.$state)) as OverlaySettings;
			snapshot.visualization.right_panel.mode_override = null;
			await saveAppSettings<OverlaySettings>("", SETTINGS_FILE, snapshot);
		},
		async load() {
			const loaded = await loadAppSettings<Partial<OverlaySettings>>("", SETTINGS_FILE);
			if (!loaded) {
				return;
			}
			const merged = deepMerge(defaultOverlaySettings(), loaded);
			// A file written before save() dropped the override still carries it.
			merged.visualization.right_panel.mode_override = null;
			// Replace the state in one go so that subscribers get a single, synchronous notification.
			this.$patch((state) => { Object.assign(state, merged); });
		},
		setRightPanelOverride(mode: RightPanelMode) {
			this.visualization.right_panel.mode_override = mode;
		},
		setRightPanelMode(mode: RightPanelMode) {
			this.visualization.right_panel.mode = mode;
		},
		setStatsPanelMode(mode: StatsPanelMode) {
			this.visualization.left_panel.stats.mode = mode;
		},
		clearRightPanelOverride() {
			this.visualization.right_panel.mode_override = null;
		},
		/**
		 * Set the game that the loaded mapper is for. Also makes sure that the selected edition is one that
		 * belongs to that game.
		 */
		setGame(value: PokemonGame | null) {
			this.game = value;
			if (value === "Yellow" && this.edition !== "Yellow") {
				this.edition = "Yellow";
			}
			if (value === "Red and Blue" && this.edition !== "Red" && this.edition !== "Blue") {
				this.edition = "Red";
			}
		},
		setEdition(value: GameEdition) {
			this.edition = value;
		},
		setStarter(value: string) {
			this.starter = value;
		},
	}
});

function defaultOverlaySettings() {
	return {
		/** The game that is currently being played and that Poke-A-Byte has a mapper loaded for. */
		game: null as PokemonGame | null,
		/** The edition selected by the user, see {@link GameEdition}. */
		edition: "Yellow" as GameEdition,
		/** The starter chosen for the run. */
		starter: "Venomoth",
		/**
		 * Super Shuckie (`core/stores/useEmulatorStatsStore`, http://127.0.0.1:30158): show the
		 * emulator's run timer instead of the overlay's, and its reset/blackout counters instead
		 * of the overlay's. gens 2-5 keep the same two switches once per generation; gen1 kept
		 * them per game and species in `useGameSpeciesData.advanced` until 2026-09-13, which
		 * meant re-ticking them for every species.
		 */
		shuckie: {
			timer: false as boolean,
			counters: false as boolean,
		},
		/**
		 * Every Poké Ball catches (the patch's `hStpCatchRate`, non-zero = on). Once per
		 * generation, as gen2's `toggle_wGuaranteedCatches`. The patch clears the byte on
		 * boot, so `settings/encounters.vue` writes it again whenever the ROM disagrees.
		 */
		guaranteed_catches: false as boolean,
		starter_search: "",
		keyboard_shortcuts: {},
		visualization: {
			left_panel: {
				stats: {
					mode: StatsPanelMode.automatic,
				}
			},
			pop_ups: {
				enabled: true as boolean,
				bonks: { enabled: false, mode: "Bonks" } as BonksSettings,
				repel: { enabled: false } as OverlayPopupSettings,
				accuracy: { enabled: true } as OverlayPopupSettings,
				evasion: { enabled: true } as OverlayPopupSettings,
				field: { enabled: true } as OverlayPopupSettings,
			},
			right_panel: {
				speed_comparison: true as boolean,
				/** The preferred mode for the right-hand panel. */
				mode: RightPanelMode.automatic,
				/**
				 * Temporary override for the right hand panel, used for post-battle splits. Set
				 * after a key trainer battle, cleared when the next trainer battle starts, on
				 * New Run and when a new run starts; never saved to disk (see save()).
				 */
				mode_override: null as RightPanelMode | null,
				/** When true the F17-F19 hotkeys are NOT allowed to change the right hand panel mode. */
				hotkeys: true as boolean,
				/** Whether to automatically switch to "splits" after a battle. */
				post_battle_splits: true as boolean,
				/** Whether or not to show battle details in the right panel (on mode == Automatic) on wild pokemon encounters */
				wild_battles: false as boolean,
				/** Movepool settings */
				movepool: {},
				/** Splits settings */
				splits: { mode: SplitsMode.first },
				/** Trainer battle settings */
				trainer: {},
				/** Wild encounter battle settings */
				wild_pokemon: {},
				/** Inventory settings */
				inventory: {},
			}
		}
	};
}
