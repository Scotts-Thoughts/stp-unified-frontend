import { copyFileSync, cpSync, existsSync, linkSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { app, dialog, session } from "electron";
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
 * electron-builder ships the pool as `resources/images` instead (`extraResources`).
 * The pool stays there because every update manifest lists it there. A junction gets
 * the renderer to it at no cost per image, but it can't always exist (see
 * `linkImagePool`), and then the requests are sent there instead.
 * The user is told if images are still missing: on its own, this failure looks like
 * a broken overlay with nothing to explain it.
 */
export function ensureImagePool(): void {
    if (!app.isPackaged) return;
    const link = join(app.getAppPath(), "out", "renderer", "images");
    const pool = join(process.resourcesPath, "images");
    if (!existsSync(pool)) {
        console.error(`[images] no image pool at ${pool}`);
        dialog.showErrorBox("The overlay's images are missing", `This folder is missing:\n${pool}\n\nThe overlay will open without its images. Download the overlay again and unzip all of it.`);
        return;
    }
    const failed = restoreImageCopies(pool);
    if (failed > 0) {
        dialog.showErrorBox("Some overlay images could not be set up", `${failed} images could not be created in:\n${pool}\n\nThe overlay needs about 3 GB of free space and a folder it can write to. Free up some space or move the overlay to another folder, then start it again.`);
    }
    if (!linkImagePool(link, pool)) redirectImagesToPool(pool);
}

/**
 * Makes `link` a junction to `pool`, replacing a stale one; false if that isn't possible.
 *
 * A junction holds an absolute path, so moving or renaming the install, or the drive
 * getting a new letter, leaves one that points at nothing (or at the folder it was
 * copied from). Junctions also exist only on NTFS, so an exFAT or FAT32 drive, usual
 * for a portable SSD, can't have one at all. A real folder at `link` (Explorer turns a
 * junction into one when it copies an install) is left alone and not trusted: updates
 * only change the pool, so that copy goes out of date.
 */
function linkImagePool(link: string, pool: string): boolean {
    try {
        const entry = lstatSync(link, { throwIfNoEntry: false });
        if (entry && !entry.isSymbolicLink()) return false;
        if (entry) {
            if (existsSync(link) && realpathSync(link) === realpathSync(pool)) return true;
            // Removes the link only, never what it points at (rm -r would follow it).
            unlinkSync(link);
        }
        symlinkSync(pool, link, "junction");
        return true;
    } catch (err) {
        console.error(`[images] could not junction ${link} -> ${pool}:`, err);
        return false;
    }
}

/**
 * Without a junction: answers the renderer's `.../out/renderer/images/...` requests from
 * the pool. Each image then costs a trip through this process, so this is only the
 * fallback. Electron keeps one onBeforeRequest listener per session; the other one
 * (cutter.ts) belongs to a mode that never reaches ensureImagePool().
 */
function redirectImagesToPool(pool: string): void {
    const marker = "/out/renderer/images/";
    const poolUrl = pathToFileURL(pool).href;
    session.defaultSession.webRequest.onBeforeRequest({ urls: [`file:///*${marker}*`] }, (details, callback) => {
        const at = details.url.indexOf(marker);
        callback(at < 0 ? {} : { redirectURL: `${poolUrl}/${details.url.slice(at + marker.length)}` });
    });
    console.log(`[images] no junction here; loading images from ${pool} directly`);
}

/**
 * The package ships each identical image once (tools/build/after-pack.mjs), listing
 * every group of identical files in `resources/image-copies.json`, the kept file
 * first. This puts the dropped copies back where the renderer looks for them: as
 * hard links (a second name for the same file, no extra disk space) or, on a drive
 * that has none (FAT/exFAT), as plain copies. Copies already there are skipped, so
 * after the first launch this only checks: one listing per folder, ~6 ms for 2,488
 * copies in 68 folders, where an existsSync per copy took ~60 ms on every launch.
 * Returns how many copies could not be made.
 */
function restoreImageCopies(pool: string): number {
    const manifest = join(process.resourcesPath, "image-copies.json");
    if (!existsSync(manifest)) return 0;
    let groups: string[][];
    try {
        groups = JSON.parse(readFileSync(manifest, "utf-8")).copies;
    } catch (err) {
        console.error(`[images] could not read ${manifest}:`, err);
        return 0;
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
    return failed;
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
