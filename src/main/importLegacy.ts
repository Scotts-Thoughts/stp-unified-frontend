import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { app } from "electron";
import { isGlobalKey, parseUserStateFile, serializeUserState, type UserStateSections } from "../shared/userStateFormat";
import { readLegacyLocalStorage } from "./localStorageImport";
import { userDataRoot } from "./paths";

/**
 * First-launch import of gen1's user data (plan 2.6, decision 3, the file-based half).
 *
 * gen1 already kept everything in files -- `%APPDATA%/stp-generation1-overlay/data/`,
 * with `overlay_settings.json`, `<game>/<species>/settings.json` and `metrics.json`
 * -- and the unified app keeps the same tree under its own name, `stp-overlay`. So
 * the import is a copy: once, when this app's `data/` does not exist yet and the
 * legacy one does. Nothing in the legacy folder is touched.
 *
 * gen2-5 kept theirs in `localStorage` (Chromium's LevelDB under each app's
 * userData); that half of the importer is still to come (plan 2.6).
 */
export function importLegacyUserData(): void {
    const target = userDataRoot();
    if (existsSync(target) && readdirSync(target).length > 0) return;
    const legacy = join(dirname(app.getPath("userData")), "stp-generation1-overlay", "data");
    if (!existsSync(legacy)) return;
    try {
        cpSync(legacy, target, { recursive: true, errorOnExist: false });
        console.log(`[import] copied gen1's user data from ${legacy} to ${target}`);
    } catch (err) {
        console.error(`[import] could not copy gen1's user data from ${legacy}:`, err);
    }
}

/**
 * The image pool in a packaged build (plan 3.5 / Phase 4). The renderer addresses
 * images relative to its document (`out/renderer/images/...`); in development that
 * folder is a junction to `src/renderer/public/images` made by the build, and
 * electron-builder ships the pool as `resources/images` instead (`extraResources`),
 * so the packaged app makes the same junction once, on first launch.
 */
export function ensureImagePool(): void {
    if (!app.isPackaged) return;
    const link = join(app.getAppPath(), "out", "renderer", "images");
    const pool = join(process.resourcesPath, "images");
    if (existsSync(link) || !existsSync(pool)) return;
    try {
        symlinkSync(pool, link, "junction");
    } catch (err) {
        console.error(`[images] could not junction ${link} -> ${pool}:`, err);
    }
}

/** The legacy apps' userData folder names (= their package.json names), by generation. */
const LEGACY_APPS: Record<string, string> = {
    gen1: "stp-generation1-overlay",
    gen2: "stp-generation2-overlay",
    gen3: "stp-generation3-overlay",
    gen4: "gen4-overlay-app",
    gen5: "gen5-overlay-app",
};

/**
 * First-launch import of the legacy apps' `localStorage` (plan 2.6, decision 3): each
 * generation's section of `data/user_state.json` is seeded, once, from its legacy
 * app's `Local Storage/leveldb` -- the same key names, the same values, so the lifted
 * components find exactly what their `MyStorage` used to find. The global keys (OBS,
 * sprite-scale overrides) come from the first generation that has them. A generation
 * whose section already exists is left alone, so this never overwrites a run's state;
 * one whose legacy profile is absent is simply not seeded.
 */
export function importLegacyLocalStorage(): void {
    const dir = userDataRoot();
    const file = join(dir, "user_state.json");
    let sections: UserStateSections = {};
    if (existsSync(file)) {
        try {
            sections = parseUserStateFile(JSON.parse(readFileSync(file, "utf-8")));
        } catch (err) {
            console.error(`[import] ${file} is unreadable; nothing imported:`, err);
            return;
        }
    }
    const profiles = dirname(app.getPath("userData"));
    let changed = false;
    for (const [gen, appName] of Object.entries(LEGACY_APPS)) {
        if (sections[gen]) continue;
        let values: Record<string, unknown> | null;
        try {
            values = readLegacyLocalStorage(join(profiles, appName), (m) => console.log(m));
        } catch (err) {
            console.error(`[import] ${appName}: could not read its localStorage:`, err);
            continue;
        }
        if (!values) continue;
        const global = (sections.global ??= {});
        const own: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(values)) {
            if (isGlobalKey(key)) {
                if (!(key in global)) global[key] = value;
            } else {
                own[key] = value;
            }
        }
        sections[gen] = own;
        changed = true;
        console.log(`[import] ${gen}: ${Object.keys(own).length} key(s) from ${appName}`);
    }
    if (!changed) return;
    try {
        mkdirSync(dir, { recursive: true });
        writeFileSync(file, serializeUserState(sections));
    } catch (err) {
        console.error(`[import] could not write ${file}:`, err);
    }
}
