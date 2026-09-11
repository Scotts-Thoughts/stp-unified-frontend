import { cpSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { app } from "electron";
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
