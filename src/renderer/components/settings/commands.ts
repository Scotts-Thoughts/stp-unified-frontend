import PubSub from "~/logic/PubSub";
import { useOverlaySettingsStore } from "~/stores/useOverlaySettingsStore";
import { useSpeciesMetricsStore, type SpeciesMetrics } from "~/stores/useSpeciesMetricsStore";
import { useGameSpeciesData } from "~/stores/useGameSpeciesData";
import { useMetaStore } from "~/stores/metaStore";
import { useEmulatorStatsStore } from "~/core/stores/useEmulatorStatsStore";
import { setShuckieBookmarksEnabled } from "~/core/logic/shuckieBookmarks";
import { revealSplitFolder, splitPath } from "~/core/persistence/splitFiles";
import { pickSplitComparison } from "~/core/logic/splitComparison";

/**
 * What gen1's settings buttons do, shared by the panels and the shortcut actions
 * (games/gen1/actions.ts), so a key and a click run the same code. Moved out of the
 * panels' methods unchanged (2026-10-14).
 */

/** Counters that are mirrored to the Shuckie emulator when the "Shuckie Counters" option is on. */
const EMULATOR_COUNTERS: Partial<Record<keyof SpeciesMetrics, string>> = {
    resets: "playerResets",
    blackouts: "blackout_counter",
};

/** Play/Pause: the overlay's timer, or the emulator's when the Shuckie Timer switch is on. */
export function toggleTimer(): void {
    if (useOverlaySettingsStore().shuckie.timer) {
        useEmulatorStatsStore().sendStart();
        return;
    }
    useSpeciesMetricsStore().toggleTimer();
}

/** Set Timer: the overlay's timer to the offset, or the emulator's timer started (gen3's mapping). */
export function setTimer(): void {
    if (useOverlaySettingsStore().shuckie.timer) {
        useEmulatorStatsStore().sendStart();
        return;
    }
    useSpeciesMetricsStore().resetTimer();
}

/** Global user state, not reactive: the Interface panel hears about a change made by a key here. */
export const SHUCKIE_BOOKMARKS_CHANGED = "@settings/shuckie_bookmarks";

export function setShuckieBookmarks(enabled: boolean): void {
    setShuckieBookmarksEnabled(enabled);
    PubSub.publish(SHUCKIE_BOOKMARKS_CHANGED, enabled);
}

export function openSplitsFolder(): void {
    // Was methods/file_system_functions.openFolder, which built the path with
    // require("fs") in the renderer; the folder is still created before opening.
    const meta = useMetaStore();
    // meta.game is null only before a mapper loads, which the panel never saw either.
    revealSplitFolder(splitPath(meta.game as string, meta.starter, "finishes"));
}

export function newRun(): void {
    PubSub.publish("@run/cleared");
}

export function incrementMetric(property: keyof SpeciesMetrics): void {
    const metrics = useSpeciesMetricsStore();
    const value = metrics[property];
    if (typeof value === "number") {
        metrics.update(property, (value + 1) as any);
        const counter = EMULATOR_COUNTERS[property];
        if (counter && useOverlaySettingsStore().shuckie.counters) {
            useEmulatorStatsStore().incrementCounter(counter);
        }
    }
}

export function decrementMetric(property: keyof SpeciesMetrics): void {
    const metrics = useSpeciesMetricsStore();
    const value = metrics[property];
    if (typeof value === "number") {
        if (value <= 0) {
            return;
        }
        metrics.update(property, (value - 1) as any);
        const counter = EMULATOR_COUNTERS[property];
        if (counter && useOverlaySettingsStore().shuckie.counters) {
            const emulator = useEmulatorStatsStore();
            const emulatorValue = emulator.stats?.counters?.[counter];
            if (emulatorValue != null && emulatorValue > 0) {
                emulator.incrementCounterBy(counter, -1);
            }
        }
    }
}

/**
 * The comparison: a replay's SPLIT bookmarks or a split CSV, picked and parsed in
 * main (core/logic/splitComparison.ts, 2026-09-23); the overlay takes the rows
 * off the same event the queuer's /load-split-file publishes.
 */
export async function loadSplitComparison(): Promise<void> {
    const comparison = await pickSplitComparison();
    if (comparison) PubSub.publish("@splits/previous_loaded", { rows: comparison.rows, name: comparison.name });
}

/**
 * "Clear Loaded Splits" (2026-10-14, as gen5 had it): drops the comparison through the same
 * event a load publishes, so components/Overlay.vue empties its rows and source and the panel
 * forgets the file name.
 */
export function clearSplitComparison(): void {
    PubSub.publish("@splits/previous_loaded", { rows: [], name: null });
}

/** "Color Picker": the screen colour under the cursor becomes the UI colour (was interface_3.vue). */
export async function pickUiColor(): Promise<void> {
    useGameSpeciesData().ui.color = await new (globalThis as any).EyeDropper().open().then((res: { sRGBHex: string }) => res.sRGBHex);
}

/** Re-read the style from disk (or the legacy preset), discarding unsaved edits. */
export function reloadStyle(): void {
    const meta = useMetaStore();
    useGameSpeciesData().reloadStyle(meta.game, meta.starter);
}

/** "Set ROM Starter": the Solo Pokemon panel owns the mapper write and listens for this. */
export const SET_ROM_STARTER = "@settings/set_rom_starter";

export function setRomStarter(): void {
    PubSub.publish(SET_ROM_STARTER);
}
