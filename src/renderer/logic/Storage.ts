/**
 * The pre-refactor `storage/Storage.json` (577 KB of per-species presets and run
 * counters), read once at startup.
 *
 * It is a **read-only migration source**: `logic/legacyStorage.ts` is the only consumer,
 * and it only ever looks entries up (`findLegacySpeciesEntry`). gen1 nevertheless loaded
 * it through `createWatchedObject`, a Proxy that debounced 250 ms and wrote the whole
 * file back on any mutation -- machinery for a write path that does not exist. Plan 1.6
 * replaces it with a plain read over IPC, which also removes the last `require("fs")`
 * from this module.
 *
 * The read is asynchronous, and `findLegacySpeciesEntry` is called synchronously from
 * the species-load chain, so `loadLegacyStorage()` must be awaited before the overlay
 * settings load -- `main.ts` does that, and it is the whole reason this is a separate
 * function rather than a top-level await.
 */

export type LegacyStorage = {
  application_settings?: Record<string, unknown>;
  games?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
};

/** Populated by {@link loadLegacyStorage}; empty until then, and empty if the file is absent. */
export const JsonStorage: LegacyStorage = {};

let loaded: Promise<void> | null = null;

export function loadLegacyStorage(): Promise<void> {
  if (loaded) return loaded;
  loaded = (async () => {
    try {
      const raw = await window.api.storage.read("Storage.json");
      if (!raw) return;
      Object.assign(JsonStorage, JSON.parse(raw) as LegacyStorage);
    } catch (err) {
      // A missing or corrupt Storage.json has always meant "no presets to migrate".
      console.warn("[Storage] could not read storage/Storage.json:", err);
    }
  })();
  return loaded;
}

/** True once the file has been read (or found to be missing). */
export function legacyStorageLoaded(): boolean {
  return loaded !== null;
}
