import { createApp } from "vue/dist/vue.esm-bundler.js";
import { defineComponent } from "vue";
import PokeData from "~/logic/PokeData.js";
import { GameHookMapperClient } from "~/packages/gameHookMapperClient";
import frontend from "~/components/Overlay.vue";
import no_mapper from "~/components/GameSelect.vue";
import keyhook from "~/core/hotkeys/Hotkeys.vue";
import { gen1Hotkeys } from "~/games/gen1/hotkeys";
import { PokemonGame } from "~/logic/PokeDataTypes.js";
import { createPinia } from "pinia";
import { useSettingsStore } from "./stores/useSettingsStore";
import { useEmulatorStatsStore } from "./stores/useEmulatorStatsStore";
import { loadLegacyStorage } from "~/logic/Storage";
import { registerControlServer } from "~/core/control/useControlServer";
import { gen1ControlRoutes } from "~/games/gen1/control";

const main = defineComponent({
    components: {
        frontend,
        no_mapper,
        keyhook,
    },
    data() {
        return {
            settings: useSettingsStore(),
            ready: false as boolean,
            mapper: null as GameHookMapperClient|null,
            /** Resolves once the overlay settings have been read from disk. */
            overlayLoaded: null as Promise<void> | null,
            /** Detaches the control-server bridge; see `created`. */
            unregisterControl: null as (() => void) | null,
            /** gen1's F-key table, passed to <keyhook/> (plan 1.1). */
            hotkeys: gen1Hotkeys(),
        }
    },
    created() {
        // Load the overlay settings right away, so that the game and species dropdowns on the "no mapper" screen
        // reflect the last session and changes made there are not overwritten later.
        //
        // storage/Storage.json comes first and must finish first: loading the overlay
        // settings starts the species-load chain, which reads the legacy presets
        // synchronously through findLegacySpeciesEntry (plan 1.6).
        this.overlayLoaded = loadLegacyStorage()
            .then(() => this.settings.overlay.load())
            .catch((err) => console.error("[main] Failed to load the overlay settings:", err));

        this.mapper = new GameHookMapperClient();
        this.mapper.onMapperLoaded = async () => {
            const gameName = this.mapper!.properties.meta.gameName.value as PokemonGame;
            PokeData.setGame(gameName);

            await this.overlayLoaded;
            this.settings.overlay.setGame(gameName);
            useEmulatorStatsStore().startPolling();
            this.ready = true;
        };
        this.mapper.onMapperUnloaded = () => {
            this.ready = false
            useEmulatorStatsStore().stopPolling();
        };
        this.mapper.connect();

        // The queuer drives the overlay over http://127.0.0.1:30159 (plan 1.8). gen1 had
        // no control server, so this is purely additive; the routes live in
        // games/gen1/control.ts because they are per generation.
        this.unregisterControl = registerControlServer(() =>
            gen1ControlRoutes(
                () => this.ready,
                () => (this.mapper?.meta?.path as string | undefined) ?? null,
            ),
        );
    },
    unmounted() {
        this.unregisterControl?.();
    },
});

const pinia = createPinia();
export const app = createApp(main);
app.use(pinia);

app.config.errorHandler = ((err: any) => {
    console.error(err);
});

app.mount('#app');
