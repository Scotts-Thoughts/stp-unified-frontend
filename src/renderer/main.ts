import { createApp } from "vue/dist/vue.esm-bundler.js";
import { defineComponent } from "vue";
import { GameHookMapperClient } from "~/packages/gameHookMapperClient";
import no_mapper from "~/components/GameSelect.vue";
import { gen1 } from "~/games/gen1";
import keyhook from "~/core/hotkeys/Hotkeys.vue";
import { createPinia } from "pinia";
import { useSettingsStore } from "./stores/useSettingsStore";
import { loadLegacyStorage } from "~/logic/Storage";
import { flushUserState, loadUserState } from "~/core/persistence/userState";
import { registerControlServer } from "~/core/control/useControlServer";
import { buildCanonicalView } from "~/core/mapper/MapperAdapter";
import type { GameModule } from "~/core/game/GameModule";
import { detect, loadModule, type Detection } from "~/games/registry";
import { setActiveModule } from "~/core/game/active";
import { setActiveNamespace } from "~/core/persistence/userState";
import { useReplaySplitsStore } from "~/core/stores/useReplaySplitsStore";
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
let styleSequence = 0;

async function applyModuleStyles(module: GameModule): Promise<void> {
    // Two calls can overlap: the pre-mapper screen's gen1 sheet is still loading its
    // faces when a mapper is detected, and a mapper *switch* is an unload (gen1's
    // sheet again) followed within milliseconds by a load. Each call awaits twice,
    // so without this the earlier call could finish last and put gen1's class on
    // the container under the later module's sheet. The latest call wins; a
    // superseded one stops at its next await.
    const sequence = ++styleSequence;
    const css = await module.styles();
    if (sequence !== styleSequence) return;
    let style = document.getElementById("stp-gen-style") as HTMLStyleElement | null;
    if (!style) {
        style = document.createElement("style");
        style.id = "stp-gen-style";
        document.head.appendChild(style);
    }
    if (style.textContent !== css) style.textContent = css;

    // The legacy pages had their fonts in hand before the overlay's first render (the
    // loading screen already used them); a `<style>` swapped in late has not fetched
    // its faces yet. Chromium laid gen3's `<select>`s out with the fallback font's
    // baseline and did not revisit it when `play` arrived -- a half-pixel in the rect
    // of every `<br>` after a select, with the pixels themselves identical. So the
    // sheet's faces are loaded before the module is `ready`, as they were.
    const families = [...css.matchAll(/@font-face\s*\{[^}]*font-family:\s*([^;}]+)/g)].map((m) => m[1].trim().replace(/^["']|["']$/g, ""));
    await Promise.all([...new Set(families)].map((family) => document.fonts.load(`12px "${family}"`).catch(() => [])));
    if (sequence !== styleSequence) return;

    const container = document.getElementById("app-container");
    if (container && container.className !== module.cssClass) container.className = module.cssClass;
    const app = document.getElementById("app");
    if (app && app.className !== (module.appClass ?? "")) app.className = module.appClass ?? "";
}

/**
 * The fit-to-window scaling is a module flag (gen1, gen2, gen4 and gen5 had the
 * script; gen3 did not): a transformed `#app-container`, even at `scale(1)`, is a
 * composited layer whose text and inline boxes Chromium snaps to whole pixels, and
 * gen3's legacy DOM -- no scaling container at all -- lays its panels out on half
 * pixels. The stylesheet's `scale(1)` fallback is therefore switched off for a module
 * without the flag (`core/window/scaleToFit.ts`), not left in place.
 */
function applyScaleToFit(module: GameModule): void {
    if (module.scaleToFit) installScaleToFit();
    else removeScaleToFit();
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
            /** What `registry.detect` found for the loaded mapper (plan 1.4), with its module loaded (plan 3.1). */
            session: null as (Detection & { module: GameModule }) | null,
            /** The `/mapper` path of a mapper no module claims -- every hack mapper (decision 8). */
            unsupportedMapper: null as string | null,
            /**
             * Counts mapper loads and unloads. `onMapperLoaded` awaits the module's
             * import, `prepare()` and styles; an `InstanceReset` (or another load) that
             * lands in between makes that load stale, and a stale load must not mount
             * an overlay over a client whose properties are gone.
             */
            loadSequence: 0 as number,
        }
    },
    computed: {
        /** The active module, or gen1 for the pre-mapper screen (its styles and hotkeys, as today). */
        module(): GameModule {
            return this.session?.module ?? gen1;
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

        // The pre-mapper screen is styled by gen1's stylesheet, as it always was, and
        // scaled to the window as gen1's index.html script did.
        void applyModuleStyles(gen1);
        applyScaleToFit(gen1);

        // The user-state writes are debounced 250 ms; local storage was synchronous, so
        // without this a quit within that window would lose the last edit. Best-effort,
        // the same trade gen4 makes with its own beforeunload flush.
        window.addEventListener("beforeunload", () => { void flushUserState(); });
        // gen3/4/5 stopped their hub connection on unload so a reload (the queuer's
        // /reload) did not leave PokeAByte a dangling client (plan 3.3, gen3's disconnect()).
        window.addEventListener("beforeunload", () => { void this.mapper?.disconnect(); });

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

        // The memory tool's own address, unless the Cutter editor is running this
        // overlay against an instance of it (src/main/cutter.ts).
        const cutterTool: string | undefined = (window as any).api?.cutter?.toolUrl ?? undefined;
        this.mapper = new GameHookMapperClient(cutterTool);
        this.mapper.onMapperLoaded = async () => {
            const sequence = ++this.loadSequence;
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
            // The generation's module is a dynamic import (plan 3.1): gen1 is in the
            // bundle already, the others arrive as their own chunk on first detection.
            let module: GameModule;
            try {
                module = await loadModule(detection.manifest);
                if (sequence !== this.loadSequence) return;
                // gen4 and gen5 debounce four property groups by ten or fifteen frames (plan 2.4); the list is
                // the module's, applied now that the module is known and cleared for one
                // that declares none, so a mapper switch never inherits the previous list.
                this.mapper!.setDebouncePaths([...(module.debouncePaths ?? [])], module.debounceFrames ?? 10);

                // Everything the module needs in memory, then its presentation, then the
                // session -- the overlay mounts on the next tick after `ready`. What gen1
                // did here with its own data layer and settings store (PokeData.setGame,
                // overlay.setGame) is gen1's activate(); a lifted module has its own.
                //
                await Promise.all([this.overlayLoaded, module.prepare?.()]);
                if (sequence !== this.loadSequence) return;
                await applyModuleStyles(module);
                if (sequence !== this.loadSequence) return;
                setActiveModule(module.id);
                setActiveNamespace(module.id);
                if (module.id !== "gen1") this.settings.releaseCss();
                applyScaleToFit(module);
                this.session = { ...detection, module };
                module.activate?.(detection.game);
                // Every generation: the run's splits from the replay Super Shuckie is
                // playing back (core/stores/useReplaySplitsStore.ts, 2026-09-23).
                useReplaySplitsStore().startPolling();
                this.ready = true;
                // What the Cutter editor's export waits for before it takes a
                // picture (src/main/cutter.ts): an overlay, not a loading screen.
                (window as any).__cutterOverlayReady = true;
            } catch (err) {
                // The overlay stays on the pre-mapper screen; say why there rather than
                // leaving "Please load a mapper" over a mapper that is loaded.
                this.unsupportedMapper = `${detection.manifest.id} failed to load: ${err instanceof Error ? err.message : String(err)}`;
                console.error(`[main] ${this.unsupportedMapper}`, err);
            } finally {
                bootDone();
            }
        };
        this.mapper.onMapperUnloaded = () => {
            this.loadSequence++;
            this.ready = false;
            (window as any).__cutterOverlayReady = false;
            // Plan 3.1: on InstanceReset, tear down. The overlay component unmounts with
            // `ready`, and every `.change()` subscriber lives in it (gen1's hooks and
            // child components, a lifted component's `mounted`), so the client's
            // subscription tables go with it: the next mount registers its own. Kept,
            // they would fire twice after a reload -- once into the unmounted instance.
            this.mapper!.clearSubscriptions();
            this.session?.module.deactivate?.();
            useReplaySplitsStore().stopPolling();
            this.session = null;
            setActiveModule(null);
            setActiveNamespace(null);
            applyScaleToFit(gen1);
            void applyModuleStyles(gen1).then(() => this.settings.reapplyCss());
        };
        this.mapper.connect();

        // The queuer drives the overlay over http://127.0.0.1:30159 (plan 1.8). The
        // route table is the active module's (gen1's before a mapper is known, so
        // /status answers during boot as the queuer expects); a lifted module's routes
        // drive its mounted overlay component directly.
        this.unregisterControl = registerControlServer(
            () =>
                this.module.control({
                    isReady: () => this.ready,
                    mapperPath: () => (this.mapper?.meta?.path as string | undefined) ?? null,
                    overlay: () => this.$refs.overlay ?? null,
                }),
            () => ({
                generation: this.module.generation,
                mapperPath: (this.mapper?.meta?.path as string | undefined) ?? null,
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

// Every legacy overlay ran a *development* Vue (gen1 under Vite's dev server, gen2-5 a
// vendored `vue.global.js` dev build), and dev Vue rethrows an unhandled error: a
// render that throws aborts the patch, so the overlay froze at its last good frame
// with the error in the console. Production Vue would instead log it and replace the
// component's tree with a comment -- a blank overlay on a stream -- and an
// `errorHandler` (which this app had) does the same. This keeps the legacy
// semantics, and the harness sees the error as the same `pageerror` on both sides
// (gen3's `stageMultiplier` on a null stage was where the difference showed).
app.config.throwUnhandledErrorInProduction = true;

app.mount('#app');
