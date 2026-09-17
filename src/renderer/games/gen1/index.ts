import type { GameModule } from "~/core/game/GameModule";
import { moduleBase } from "~/core/game/ModuleManifest";
import { gen1Manifest } from "./manifest";
import { autosplitter, deprecated_autosplitter, split_trainers } from "./data/splits";
import { gen1ControlRoutes } from "./control";
import { installGen1RunHooks } from "./hooks";
import { gen1Hotkeys } from "./hotkeys";
import { gen1ChapterMarkers } from "./markers";
import { useGameStateSync } from "./state";
import Overlay from "~/components/Overlay.vue";
import { useEmulatorStatsStore } from "~/core/stores/useEmulatorStatsStore";
import PokeData from "~/logic/PokeData";
import type { PokemonGame } from "~/logic/PokeDataTypes";
import { useSettingsStore } from "~/stores/useSettingsStore";

/**
 * Generation 1: Yellow, and Red/Blue (plan 1.4).
 *
 * Every field points at something that already existed as a loose gen1 file; the
 * module is the index that lets `core/` reach them without importing `games/gen1/`.
 *
 * Editions: no profile is registered for the "Yellow Legacy" hack mapper (decision 8),
 * so that edition was removed from the dropdown/grid; loading that mapper still lands
 * on the unsupported-mapper state rather than the hang in known-legacy-bugs.md #22.
 * The split prefix letters and the folder (= the mapper game name) are what
 * `useOverlaySettingsStore.gameLetter` and `metaStore.game` compute today; the store
 * stays the source of truth until Phase 3 routes it through here.
 */
export const gen1: GameModule = {
    ...moduleBase(gen1Manifest),
    features: {
        badgeBoosts: true,
        expBar: true,
        repelCounter: true,
        bonkCounter: true,
        shuckieTimer: true,
        encounterFlags: true,
    },
    hooks: {
        installRunHooks: installGen1RunHooks,
        installStateSync: useGameStateSync,
    },
    data: {
        splits: { autosplitter, deprecated_autosplitter, split_trainers },
    },
    hotkeys: gen1Hotkeys,
    control: (ctx) => gen1ControlRoutes(ctx.isReady),
    chapterMarkers: gen1ChapterMarkers,
    overlay: Overlay,
    cssClass: "gen-1",
    // The legacy keyhook component's empty <div> in #app (core/hotkeys/Hotkeys.vue).
    keyhookElement: true,
    // The 16:9 fit-to-window script at the bottom of the legacy index.html (core/window/scaleToFit.ts).
    scaleToFit: true,
    // Applied by main.ts as a <style> element (plan 3.1), after core/styles/base.css,
    // which index.html still links -- the same cascade order the two files had.
    styles: () => import("./style.css?inline").then((m) => m.default),
    // What main.ts used to do on mapper load, in the same order: point gen1's data
    // layer at the game, tell the overlay-settings store (which starts the species
    // load chain and, through useSettingsStore, the per-species files), then start the
    // 10 ms Super Shuckie poll. All three are gen1's own and must not run for a lifted
    // module -- they wrote data/<game>/<species>/*.json for a gen2 run.
    activate: (game) => {
        PokeData.setGame(game as PokemonGame);
        const overlay = useSettingsStore().overlay;
        overlay.setGame(game as PokemonGame);
        const emulator = useEmulatorStatsStore();
        emulator.startPolling({
            // Every reader of the stats is behind one of the two flags (timer.vue,
            // faults.vue, metrics.vue, hooks.ts), so with both off the poll is skipped.
            enabled: () => overlay.shuckie.timer || overlay.shuckie.counters,
            // Was components/Overlay.vue's `emulator.stats` watcher: when the Shuckie
            // timer toggle is on and the emulator reports no running timer, kick it
            // off. Covers replays (no 0->positive playerId flip) and users enabling the
            // flag mid-session; the store self-throttles repeated calls.
            afterPoll: () => {
                if (overlay.shuckie.timer) emulator.ensureStarted();
            },
        });
    },
    deactivate: () => useEmulatorStatsStore().stopPolling(),
    persistence: { legacyAppName: "stp-generation1-overlay" },
    logCopyVariant: "gen1",
};
