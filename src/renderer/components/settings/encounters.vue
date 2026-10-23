<script>
/**
 * The encounter flags' writes to the ROM (plan 1.1; known-legacy-bugs.md #30 for the race in
 * `mounted`). Logic only since 2026-10-14: the checkboxes are in the settings panel
 * (games/gen1/settingsPanel.ts, "Encounters" and "Forced HM Users"); components/game_area.vue
 * still mounts this where the old Encounters block was, so its watchers and mapper
 * subscriptions register in the same order.
 *
 * Converted from a template-string component. Plain JavaScript rather than `lang="ts"`,
 * as with `left_panel/exp_bar.vue`: the panel reads and writes mapper properties through
 * the array form of `inject`, which vue-tsc cannot follow without rewriting the logic.
 */
import { defineComponent } from "vue";
import { useMetaStore } from "~/stores/metaStore.js";
import { useGameSpeciesData } from "~/stores/useGameSpeciesData";
import { useOverlaySettingsStore } from "~/stores/useOverlaySettingsStore";
import { useSettingsStore } from "~/stores/useSettingsStore";


/** Flags that live in `patch.encounter_flags` of the mapper, grouped by game. */
const ENCOUNTER_FLAGS = {
    "Yellow": [
        "EVENT_ENCOUNTER_ROUTE1_TEST",
        "EVENT_ENCOUNTER_VIRIDIAN_FOREST_PIDGEY",
        "EVENT_ENCOUNTER_ROUTE3_SPEAROW",
        "EVENT_ENCOUNTER_MTMOON_SANDSHREW",
        "EVENT_ENCOUNTER_ROUTE16_DODUO",
    ],
    "Red and Blue": [
        "EVENT_ENCOUNTER_ROUTE3_SPEAROW",
        "EVENT_ENCOUNTER_MTMOON_GEODUDE",
        "EVENT_ENCOUNTER_MTMOON_PARAS",
        "EVENT_ENCOUNTER_ROUTE6_CUT_USER",
        "EVENT_ENCOUNTER_ROUTE16_DODUO",
    ],
};

/** The settings a new Red and Blue run starts with turned on. */
const RED_BLUE_DEFAULTS_ON = {
    wEarlyEncountersNoMoon: true,
    EVENT_ENCOUNTER_MTMOON_GEODUDE: true,
    EVENT_ENCOUNTER_MTMOON_PARAS: true,
    EVENT_ENCOUNTER_ROUTE16_DODUO: true,
};

const MT_MOON_MAPS =["Mt Moon - 1", "Mt Moon - 2", "Mt Moon - 3"];

export default defineComponent({
    inject: ["game"],
    data() {
        return {
            meta: useMetaStore(),
            runConfig: useGameSpeciesData(),
            overlaySettings: useOverlaySettingsStore(),
            settings: useSettingsStore(),
            /** Snapshot of the encounter settings that were last written to the ROM. */
            lastApplied: null,
        }
    },
    created() {
        this.$watch(
            () => this.runConfig.config.gameSpecific,
            this.on_encounter_settings_changed,
            { deep: true }
        );
        // Once the settings of a species have finished loading, make sure every flag exists.
        this.$watch(
            () => this.settings.loading,
            (loading) => {
                if (!loading) {
                    this.initialize_encounter_settings();
                }
            }
        );
        this.$watch(
            () => this.overlaySettings.guaranteed_catches,
            this.sync_guaranteed_catches
        );
    },
    methods: {
        /**
         * Encounter settings default to off, except in Red and Blue, which start with No Moon and the
         * Geodude, Paras and Doduo flags on (2026-10-22).
         */
        default_encounter_settings() {
            const defaults = { wEarlyEncounters: false, wEarlyEncountersNoMoon: false };
            for (const flags of Object.values(ENCOUNTER_FLAGS)) {
                for (const flag of flags) {
                    defaults[flag] = false;
                }
            }
            if (this.overlaySettings.game === "Red and Blue") {
                Object.assign(defaults, RED_BLUE_DEFAULTS_ON);
            }
            return defaults;
        },
        /** Add any missing encounter setting with its default value. */
        initialize_encounter_settings() {
            const current = this.runConfig.config.gameSpecific;
            for (const [key, value] of Object.entries(this.default_encounter_settings())) {
                if (!(key in current)) {
                    current[key] = value;
                }
            }
        },
        /**
         * Called on every change of the encounter settings. Settings that were just loaded from disk are only
         * remembered, settings changed by the user are written to the ROM right away (only the ones that changed).
         */
        on_encounter_settings_changed(newSettings) {
            const snapshot = { ...(newSettings ?? {}) };
            if (this.settings.loading || this.lastApplied === null) {
                this.lastApplied = snapshot;
                return;
            }
            const changed = Object.keys(snapshot).filter(key => snapshot[key] !== this.lastApplied[key]);
            this.lastApplied = snapshot;
            for (const key of changed) {
                this.write_encounter_setting(key, snapshot[key]);
            }
        },
        /** Write a single encounter setting to the ROM. */
        write_encounter_setting(key, value) {
            const game = this.game.properties.meta.gameName.value;
            if (key === "wEarlyEncounters") {
                this.game.properties.patch.wEarlyEncounters.set(value == true ? "On" : "Off", false);
                return;
            }
            if (key === "wEarlyEncountersNoMoon") {
                return; // Only used by the overlay itself, see the map change handler below.
            }
            if ((ENCOUNTER_FLAGS[game] ?? []).includes(key)) {
                this.game.properties.patch.encounter_flags?.[key]?.set(value == true, false);
            }
        },
        /** Write all encounter settings to the ROM. */
        set_encounters() {
            this.initialize_encounter_settings();
            const game = this.game.properties.meta.gameName.value;
            const encounterSettings = this.runConfig.config.gameSpecific;
            const early_encounters_value = encounterSettings.wEarlyEncounters == true ? "On" : "Off";
            this.game.properties.patch.wEarlyEncounters.set(early_encounters_value, false)
            if (game == 'Yellow') {
                this.game.setBits([ // Set bits can only be called on properties that share the same address
                    { path: 'patch.encounter_flags.EVENT_ENCOUNTER_ROUTE1_TEST', value: encounterSettings.EVENT_ENCOUNTER_ROUTE1_TEST == true, freeze: false },
                ])
                this.game.setBits([
                    { path: 'patch.encounter_flags.EVENT_ENCOUNTER_VIRIDIAN_FOREST_PIDGEY', value: encounterSettings.EVENT_ENCOUNTER_VIRIDIAN_FOREST_PIDGEY == true, freeze: false },
                    { path: 'patch.encounter_flags.EVENT_ENCOUNTER_ROUTE3_SPEAROW', value: encounterSettings.EVENT_ENCOUNTER_ROUTE3_SPEAROW == true, freeze: false },
                    { path: 'patch.encounter_flags.EVENT_ENCOUNTER_MTMOON_SANDSHREW', value: encounterSettings.EVENT_ENCOUNTER_MTMOON_SANDSHREW == true, freeze: false },
                    { path: 'patch.encounter_flags.EVENT_ENCOUNTER_ROUTE16_DODUO', value: encounterSettings.EVENT_ENCOUNTER_ROUTE16_DODUO == true, freeze: false },
                ])
            } else if (game == 'Red and Blue') {
                this.game.setBits([ // Set bits can only be called on properties that share the same address
                    { path: 'patch.encounter_flags.EVENT_ENCOUNTER_ROUTE3_SPEAROW', value: encounterSettings.EVENT_ENCOUNTER_ROUTE3_SPEAROW == true, freeze: false },
                    { path: 'patch.encounter_flags.EVENT_ENCOUNTER_MTMOON_GEODUDE', value: encounterSettings.EVENT_ENCOUNTER_MTMOON_GEODUDE == true, freeze: false },
                    { path: 'patch.encounter_flags.EVENT_ENCOUNTER_MTMOON_PARAS', value: encounterSettings.EVENT_ENCOUNTER_MTMOON_PARAS == true, freeze: false },
                    { path: 'patch.encounter_flags.EVENT_ENCOUNTER_ROUTE6_CUT_USER', value: encounterSettings.EVENT_ENCOUNTER_ROUTE6_CUT_USER == true, freeze: false },
                ])
                this.game.setBits([
                    { path: 'patch.encounter_flags.EVENT_ENCOUNTER_ROUTE16_DODUO', value: encounterSettings.EVENT_ENCOUNTER_ROUTE16_DODUO == true, freeze: false },
                ])
            }
        },
        /**
         * Write the guaranteed catches setting to the ROM when the ROM's byte disagrees with it.
         * The patch reads any non-zero byte as on, and clears it on boot and on every reset.
         */
        sync_guaranteed_catches() {
            const property = this.game.properties.patch?.hStpCatchRate;
            if (property == null || property.value == null) {
                return;
            }
            const wanted = this.overlaySettings.guaranteed_catches == true;
            if ((property.value != 0) !== wanted) {
                property.set(wanted ? 1 : 0, false);
            }
        },
    },
    mounted: async function () {
        if (!this.settings.loading) {
            this.initialize_encounter_settings();
        }
        // Guaranteed catches, as gen2 does it: synced on load, and written again whenever the
        // ROM's byte changes away from the setting (the patch clears it on every reset).
        // The ROM's changes are answered a second late: in Red/Blue the byte (0xFFFC) is the top of
        // the boot stack until Init moves SP, and writing it then corrupts a return address and
        // crashes the game on every hard reset with the setting off.
        this.sync_guaranteed_catches();
        this.game.properties.patch?.hStpCatchRate?.change(() => {
            clearTimeout(this.catchRateTimer);
            this.catchRateTimer = setTimeout(() => this.sync_guaranteed_catches(), 1000);
        });
        //HM Encounters
        this.game.properties.overworld.map.change((newValue, oldValue) => {
            const encounterSettings = this.runConfig.config.gameSpecific;
            const alakazamYellow = this.meta.game == "Yellow" && this.meta.starter == "Alakazam";
            if (newValue.value == "Pallet Town" && oldValue.value == "Pallet Town - Oak's Lab" && this.game.properties.events.got_pokedex.value == false) {
                this.set_encounters()
            }
            else if (encounterSettings.wEarlyEncountersNoMoon && MT_MOON_MAPS.includes(newValue.value)) {
                this.game.properties.patch.wEarlyEncounters.set("Off", false)
            }
            // Alakazam Yellow exception
            else if (alakazamYellow && MT_MOON_MAPS.includes(newValue.value)) {
                this.game.properties.patch.wEarlyEncounters.set("Off", false)
            }
            else if (newValue.value == "Viridian Forest" && alakazamYellow && this.game.properties?.trainers?.viridianForest?.bugcatcher2?.value == false) {
                this.game.properties.patch.wEarlyEncounters.set("Off", false)
            }
        })
    },
    beforeUnmount() {
        clearTimeout(this.catchRateTimer);
    },
    render() {
        return null;
    },
});
</script>
