import { createApp } from "vue/dist/vue.esm-bundler.js";
import { defineComponent } from "vue";
import { GameHookMapperClient } from "~/packages/gameHookMapperClient";
import no_mapper from "~/components/GameSelect.vue";
import keyhook from "~/core/hotkeys/Hotkeys.vue";
import { createPinia } from "pinia";
import { useSettingsStore } from "./stores/useSettingsStore";
import { loadLegacyStorage } from "~/logic/Storage";
import { flushUserState, loadUserState } from "~/core/persistence/userState";
import { registerControlServer } from "~/core/control/useControlServer";
import { buildCanonicalView } from "~/core/mapper/MapperAdapter";
import type { GameModule } from "~/core/game/GameModule";
import { detect, MODULES, type Detection } from "~/games/registry";
import { setActiveModule } from "~/core/game/active";
import { initEnv } from "~/core/env";
import { installScaleToFit, removeScaleToFit } from "~/core/window/scaleToFit";

/**
 * Applies a module's presentation to the document (plan 3.1, brought forward for
 * Phase 2): the `.gen-N` class on `#app-container` and the module's stylesheet as a
 * `<style>` after `core/styles/base.css`. Each stylesheet carries its own @font-face
 * declarations, so swapping the text swaps the faces too.
 *
 * Asset roots are not handled here: a lifted module's `images/...` references are
 * rewritten to `images/genN/...` at port time (tools/port/lift_assets.py), next to
 * gen1's own images. A `<base href>` was tried first and redirected every other URL
 * in the document too.
 */
async function applyModuleStyles(module: GameModule): Promise<void> {
    const css = await module.styles();
    let style = document.getElementById("stp-gen-style") as HTMLStyleElement | null;
    if (!style) {
        style = document.createElement("style");
        style.id = "stp-gen-style";
        document.head.appendChild(style);
    }
    if (style.textContent !== css) style.textContent = css;

    const container = document.getElementById("app-container");
    if (container && container.className !== module.cssClass) container.className = module.cssClass;
}

const main = defineComponent({
    components: {
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
            /** What `registry.detect` found for the loaded mapper (plan 1.4). */
            session: null as Detection | null,
            /** The `/mapper` path of a mapper no module claims -- every hack mapper (decision 8). */
            unsupportedMapper: null as string | null,
        }
    },
    computed: {
        /** The active module, or gen1 for the pre-mapper screen (its styles and hotkeys, as today). */
        module(): GameModule {
            return this.session?.module ?? MODULES[0];
        },
        /**
         * The F-key table passed to <keyhook/> (plan 1.1). gen1's is bound before any
         * mapper is known, exactly as gen1 did; a lifted module returns `{}` here and
         * binds its own from its overlay.
         */
        hotkeys() {
            return this.module.hotkeys();
        },
        overlayComponent() {
            return this.session?.module.overlay ?? null;
        },
        /**
         * What the overlay is handed instead of the raw mapper client: the detected
         * module, and `properties` as the profile's canonical view over the client's
         * tree (plan 1.4). It is a computed so the view is rebuilt when the client
         * reassigns `properties` on its 60 s mapper refresh; value changes do not
         * invalidate it, because the build never reads `.value`.
         *
         * `setBits` is the one client method the lifted gen2 component calls besides
         * reading properties (gen4 does too); it is forwarded, not re-implemented.
         */
        game() {
            if (!this.session || !this.mapper) return null;
            const client = this.mapper;
            return {
                module: this.session.module,
                profile: this.session.profile,
                game: this.session.game,
                properties: buildCanonicalView(this.session.profile, client.properties),
                meta: client.meta,
                setBits: (properties: unknown[]) => client.setBits(properties),
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
        this.overlayLoaded = Promise.all([initEnv(), loadLegacyStorage(), loadUserState()])
            .then(() => this.settings.overlay.load())
            .catch((err) => console.error("[main] Failed to load the overlay settings:", err));

        // The pre-mapper screen is styled by gen1's stylesheet, as it always was.
        void applyModuleStyles(MODULES[0]);

        // The user-state writes are debounced 250 ms; local storage was synchronous, so
        // without this a quit within that window would lose the last edit. Best-effort,
        // the same trade gen4 makes with its own beforeunload flush.
        window.addEventListener("beforeunload", () => { void flushUserState(); });

        // The boot counter is for the parity harness: from connect() to `ready` the
        // app is driven by real-time pipes the harness cannot all see -- the SignalR
        // handshake, the /mapper fetch, and a module's prepare() and styles(), which
        // are dynamic imports -- and a boot that finishes mid clock-sweep anchors the
        // overlay's animation-frame chain off the frame grid, one hundredth behind the
        // legacy app for the whole run. Counted as one unit, start to finish, so the
        // runner never sweeps while any of it is in flight.
        (window as any).__stpPendingBoot = ((window as any).__stpPendingBoot ?? 0) + 1;
        let booted = false;
        const bootDone = () => {
            if (booted) return;
            booted = true;
            (window as any).__stpPendingBoot -= 1;
        };

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
                this.mapper!.setDebouncePaths([]);
                bootDone();
                return;
            }
            this.unsupportedMapper = null;
            const module = detection.module;
            // gen4 debounces four property groups by ten frames (plan 2.4); the list is
            // the module's, applied now that the module is known and cleared for one
            // that declares none, so a mapper switch never inherits the previous list.
            this.mapper!.setDebouncePaths([...(module.debouncePaths ?? [])]);

            // Everything the module needs in memory, then its presentation, then the
            // session -- the overlay mounts on the next tick after `ready`. What gen1
            // did here with its own data layer and settings store (PokeData.setGame,
            // overlay.setGame) is gen1's activate(); a lifted module has its own.
            //
            try {
                await Promise.all([this.overlayLoaded, module.prepare?.()]);
                await applyModuleStyles(module);
                setActiveModule(module.id);
                if (module.id !== "gen1") this.settings.releaseCss();
                if (module.scaleToFit) installScaleToFit();
                else removeScaleToFit();
                this.session = detection;
                module.activate?.(detection.game);
                this.ready = true;
            } finally {
                bootDone();
            }
        };
        this.mapper.onMapperUnloaded = () => {
            this.ready = false
            this.session?.module.deactivate?.();
            this.session = null;
            setActiveModule(null);
            removeScaleToFit();
            void applyModuleStyles(MODULES[0]).then(() => this.settings.reapplyCss());
        };
        this.mapper.connect();

        // The queuer drives the overlay over http://127.0.0.1:30159 (plan 1.8). The
        // route table is the active module's (gen1's before a mapper is known, so
        // /status answers during boot as the queuer expects); a lifted module's routes
        // drive its mounted overlay component directly.
        this.unregisterControl = registerControlServer(() =>
            this.module.control({
                isReady: () => this.ready,
                mapperPath: () => (this.mapper?.meta?.path as string | undefined) ?? null,
                overlay: () => this.$refs.overlay ?? null,
            }),
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
