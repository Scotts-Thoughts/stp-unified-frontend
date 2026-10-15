<script lang="ts">
import { defineComponent, inject } from "vue";
import PokeData from "~/logic/PokeData";
import { GameHookProperty } from "~/packages/gameHookMapperClient";
import { useOverlaySettingsStore } from "~/stores/useOverlaySettingsStore";
import PubSub from "~/logic/PubSub";
import { SET_ROM_STARTER } from "./commands";

/**
 * The ROM starter (logic only since 2026-10-14). The Solo Pokemon picker and the "Set ROM Starter"
 * button are in the settings panel (games/gen1/settingsPanel.ts); this component, mounted by
 * components/game_area.vue where the old Solo Pokemon column was, still owns the mapper write: it
 * follows the store's `starter`, answers the button and shortcut (`SET_ROM_STARTER`), and writes the
 * solo Pokemon again after a reset (ARCHITECTURE §4).
 */

/** Species byte that the ROM patch uses for every backported species. */
const BACKPORT_SPECIES_BYTE = 0xBF;

export default defineComponent({
    data() {
        return {
            game_properties: inject<Record<string, GameHookProperty>>("game_properties", {}),
            overlaySettings: useOverlaySettingsStore(),
            /** Whether the next time the ROM loses the solo Pokemon it is written again (see `mounted`). */
            rom_starter_resync_armed: true,
        }
    },
    watch: {
        /**
         * The ROM starter follows the solo Pokemon, as in gens 2-5 (2026-09-18): every change of
         * the store's `starter` -- the panel's picker or the queuer's `/set-starter` -- is written
         * to the patch, where gen1 used to wait for the button.
         */
        "overlaySettings.starter"() {
            this.rom_starter_resync_armed = true;
            this.set_rom_starter();
        },
    },
    created() {
        // The "Set ROM Starter" button and shortcut (commands.ts setRomStarter): this component owns the mapper write.
        PubSub.subscribe(SET_ROM_STARTER, this.set_rom_starter);
    },
    unmounted() {
        PubSub.unsubscribe(SET_ROM_STARTER, this.set_rom_starter);
    },
    methods: {
        async set_rom_starter() {
            const starter = this.overlaySettings.starter;
            if (!PokeData.findSpecies(starter)) {
                console.warn(`[settings] Cannot set the ROM starter, unknown species: ${starter}`);
                return;
            }
            // Backported species are not one of the original 151, the ROM patch uses a placeholder species for them.
            if (PokeData.isBackportSpecies(starter)) {
                await this.game_properties.patch.hChosenStarter.setBytes([BACKPORT_SPECIES_BYTE], false);
                return;
            }
            await this.game_properties.patch.hChosenStarter.set(starter, false);
        },
        /** Whether the ROM's starter byte holds the solo Pokemon; null when the solo Pokemon is unknown. */
        rom_holds_starter(property: GameHookProperty): boolean | null {
            const starter = this.overlaySettings.starter;
            const species = PokeData.findSpecies(starter);
            if (!species) {
                return null;
            }
            if (PokeData.isBackportSpecies(starter)) {
                return property.bytes?.[0] === BACKPORT_SPECIES_BYTE;
            }
            return PokeData.findSpecies(property.value) === species;
        },
    },
    mounted() {
        // Sync the ROM starter to the solo Pokemon on load, as gens 2-5 do: the overlay settings are
        // read before the overlay mounts, so the watcher never sees the persisted starter arrive.
        this.set_rom_starter();

        // Automatic re-sync after a reset, as gen3/gen4 re-set the ROM starter on a new game
        // (2026-10-09). The patch only writes hChosenStarter in `Init`, which every reset runs:
        // stp-pokered puts back $FF (default starters), stp-pokeyellow SPECIES_STARTER (Backport
        // or Mew). So a change that leaves the byte off the solo Pokemon is a reset, and the solo
        // Pokemon is written again. Armed again once the byte holds it (or the solo Pokemon
        // changes): one write per reset, never a loop if a write does not stick.
        this.game_properties.patch?.hChosenStarter?.change((property: GameHookProperty) => {
            const holds = this.rom_holds_starter(property);
            if (holds == null) {
                return;
            }
            if (holds) {
                this.rom_starter_resync_armed = true;
                return;
            }
            if (!this.rom_starter_resync_armed) {
                return;
            }
            this.rom_starter_resync_armed = false;
            this.set_rom_starter();
        });
    },
    render() {
        return null;
    },
});
</script>
