import { copyFileSync, cpSync, existsSync, linkSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
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
    if (!existsSync(pool)) return;
    restoreImageCopies(pool);
    if (existsSync(link)) return;
    try {
        symlinkSync(pool, link, "junction");
    } catch (err) {
        console.error(`[images] could not junction ${link} -> ${pool}:`, err);
    }
}

/**
 * The package ships each identical image once (tools/build/after-pack.mjs), listing
 * every group of identical files in `resources/image-copies.json`, the kept file
 * first. This puts the dropped copies back where the renderer looks for them: as
 * hard links (a second name for the same file, no extra disk space) or, on a drive
 * that has none (FAT/exFAT), as plain copies. Copies already there are skipped, so
 * after the first launch this only checks: one listing per folder, ~6 ms for 2,488
 * copies in 68 folders, where an existsSync per copy took ~60 ms on every launch.
 */
function restoreImageCopies(pool: string): void {
    const manifest = join(process.resourcesPath, "image-copies.json");
    if (!existsSync(manifest)) return;
    let groups: string[][];
    try {
        groups = JSON.parse(readFileSync(manifest, "utf-8")).copies;
    } catch (err) {
        console.error(`[images] could not read ${manifest}:`, err);
        return;
    }
    const listings = new Map<string, Set<string>>();
    const present = (relative: string): boolean => {
        const slash = relative.lastIndexOf("/");
        const folder = slash < 0 ? "" : relative.slice(0, slash);
        let names = listings.get(folder);
        if (!names) {
            names = new Set(existsSync(join(pool, folder)) ? readdirSync(join(pool, folder)) : []);
            listings.set(folder, names);
        }
        return names.has(relative.slice(slash + 1));
    };
    let linked = 0;
    let copied = 0;
    let failed = 0;
    for (const [kept, ...copies] of groups) {
        for (const copy of copies) {
            if (present(copy)) continue;
            const target = join(pool, copy);
            try {
                mkdirSync(dirname(target), { recursive: true });
                try {
                    linkSync(join(pool, kept), target);
                    linked++;
                } catch {
                    copyFileSync(join(pool, kept), target);
                    copied++;
                }
            } catch (err) {
                failed++;
                console.error(`[images] could not restore ${copy} from ${kept}:`, err);
            }
        }
    }
    if (linked || copied || failed) {
        console.log(`[images] restored duplicate images: ${linked} hard-linked, ${copied} copied${failed ? `, ${failed} failed` : ""}`);
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
