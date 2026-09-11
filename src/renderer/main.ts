import { createApp } from "vue/dist/vue.esm-bundler.js";
import { defineComponent } from "vue";
import PokeData from "~/logic/PokeData.js";
import { GameHookMapperClient } from "~/packages/gameHookMapperClient";
import frontend from "~/components/Overlay.vue";
import no_mapper from "~/components/GameSelect.vue";
import keyhook from "~/core/hotkeys/Hotkeys.vue";
import { PokemonGame } from "~/logic/PokeDataTypes.js";
import { createPinia } from "pinia";
import { useSettingsStore } from "./stores/useSettingsStore";
import { useEmulatorStatsStore } from "~/core/stores/useEmulatorStatsStore";
import { loadLegacyStorage } from "~/logic/Storage";
import { flushUserState, loadUserState } from "~/core/persistence/userState";
import { registerControlServer } from "~/core/control/useControlServer";
import { buildCanonicalView } from "~/core/mapper/MapperAdapter";
import { detect, MODULES, type Detection } from "~/games/registry";

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
            /**
             * The F-key table passed to <keyhook/> (plan 1.1). Bound at startup, before
             * any mapper is known, exactly as gen1 did; Phase 3.1 rebinds it per
             * detected module.
             */
            hotkeys: MODULES[0].hotkeys(),
            /** What `registry.detect` found for the loaded mapper (plan 1.4). */
            session: null as Detection | null,
            /** The `/mapper` path of a mapper no module claims -- every hack mapper (decision 8). */
            unsupportedMapper: null as string | null,
        }
    },
    computed: {
        /**
         * What the overlay is handed instead of the raw mapper client: the detected
         * module, and `properties` as the profile's canonical view over the client's
         * tree (plan 1.4). It is a computed so the view is rebuilt when the client
         * reassigns `properties` on its 60 s mapper refresh; value changes do not
         * invalidate it, because the build never reads `.value`.
         */
        game() {
            if (!this.session || !this.mapper) return null;
            return {
                module: this.session.module,
                profile: this.session.profile,
                game: this.session.game,
                properties: buildCanonicalView(this.session.profile, this.mapper.properties),
                meta: this.mapper.meta,
            };
        },
    },
    created() {
        // Load the overlay settings right away, so that the game and species dropdowns on the "no mapper" screen
        // reflect the last session and changes made there are not overwritten later.
        //
        // Both files have to be read before the overlay settings load: that starts the
        // species-load chain, which reads the legacy presets synchronously through
        // findLegacySpeciesEntry (plan 1.6), and the user state has to be in memory
        // before anything reads it synchronously (plan 1.10). `ready` only turns true
        // after this resolves, so no component can observe an empty cache.
        this.overlayLoaded = Promise.all([loadLegacyStorage(), loadUserState()])
            .then(() => this.settings.overlay.load())
            .catch((err) => console.error("[main] Failed to load the overlay settings:", err));

        // The user-state writes are debounced 250 ms; local storage was synchronous, so
        // without this a quit within that window would lose the last edit. Best-effort,
        // the same trade gen4 makes with its own beforeunload flush.
        window.addEventListener("beforeunload", () => { void flushUserState(); });

        this.mapper = new GameHookMapperClient();
        this.mapper.onMapperLoaded = async () => {
            // Which generation, which profile, which game -- from the mapper's path
            // first and its identity property second (plan 1.4). For gen1 the game is
            // the same `meta.gameName.value` this read directly before.
            const detection = detect(this.mapper!.meta?.path, this.mapper!.properties, this.mapper!.meta);
            if (!detection) {
                // A hack mapper, or one no module ships a profile for (decision 8).
                // gen1 used to call PokeData.setGame here and throw (known-legacy-bugs.md
                // #22), leaving the overlay stuck on "Please load a mapper" with no clue.
                this.unsupportedMapper = (this.mapper!.meta?.path as string | undefined) ?? "unknown mapper";
                console.warn(`[main] no GameModule claims the loaded mapper: ${this.unsupportedMapper}`);
                return;
            }
            this.unsupportedMapper = null;
            this.session = detection;
            const gameName = detection.game as PokemonGame;
            PokeData.setGame(gameName);

            await this.overlayLoaded;
            this.settings.overlay.setGame(gameName);
            useEmulatorStatsStore().startPolling();
            this.ready = true;
        };
        this.mapper.onMapperUnloaded = () => {
            this.ready = false
            this.session = null;
            useEmulatorStatsStore().stopPolling();
        };
        this.mapper.connect();

        // The queuer drives the overlay over http://127.0.0.1:30159 (plan 1.8). gen1 had
        // no control server, so this is purely additive; the routes live in
        // games/gen1/control.ts because they are per generation.
        // Registered at startup, before a mapper is known, so /status answers during
        // boot as the queuer expects; Phase 3.1 swaps the table per detected module.
        this.unregisterControl = registerControlServer(() =>
            MODULES[0].control(
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
