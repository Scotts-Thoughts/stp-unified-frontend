/**
 * The updater's bookkeeping, with no Electron in it (tools/updates/selftest.ts runs it
 * under plain Node). docs/updates.md has the whole design; in short:
 *
 *   - a manifest (tools/build/update-manifest.mjs) lists every file of a build with its
 *     SHA-256 and the pack it ships in; the installed one is resources/install-manifest.json;
 *   - an update stages the files the target has and the install lacks in updates/staging/,
 *     then a helper script (apply.ps1) swaps them in while the app is closed;
 *   - every file the swap replaces or removes goes to updates/previous/, with the old
 *     manifest, and that is the one local rollback: the same swap, staged from previous/.
 *
 * Paths here are '/'-separated and relative to the install folder (the exe's folder).
 */

export const INSTALL_MANIFEST = "resources/install-manifest.json";
/** tools/build/after-pack.mjs's list of duplicate images, relative to the pool. */
export const IMAGE_COPIES = "resources/image-copies.json";
export const IMAGE_POOL = "resources/images/";

export const UPDATES = "updates";
export const STAGING = `${UPDATES}/staging`;
export const PREVIOUS = `${UPDATES}/previous`;
const PREVIOUS_NEW = `${UPDATES}/previous-new`;
const DISCARD = `${UPDATES}/discard`;
/** What `Roll back to previous version.cmd` runs; rewritten on every launch and every swap. */
export const ROLLBACK_OPS = `${UPDATES}/rollback-ops.txt`;
export const ROLLBACK_OPS_NEXT = `${UPDATES}/rollback-ops.next.txt`;

export interface ManifestFile {
    path: string;
    size: number;
    sha256: string;
    pack: string;
    /** Where the file starts in its pack's uncompressed stream. */
    offset: number;
}

export interface PackInfo {
    /** The release asset's name. */
    file: string;
    hash: string;
    compressed: boolean;
    /** Uncompressed bytes. */
    size: number;
    count: number;
}

export interface Manifest {
    format: 1;
    app: string;
    version: string;
    electron: string;
    built: string;
    packs: Record<string, PackInfo>;
    files: ManifestFile[];
}

export function parseManifest(text: string): Manifest {
    const manifest = JSON.parse(text.replace(/^﻿/, ""));
    if (!manifest || manifest.format !== 1 || manifest.app !== "stp-overlay" || !Array.isArray(manifest.files) || typeof manifest.packs !== "object") {
        throw new Error("not an stp-overlay update manifest");
    }
    for (const file of manifest.files) {
        if (typeof file.path !== "string" || !isSafePath(file.path) || typeof file.sha256 !== "string" || !manifest.packs[file.pack]) {
            throw new Error(`bad manifest entry ${JSON.stringify(file)}`);
        }
    }
    return manifest;
}

/** A manifest path may not leave the install folder or touch the updater's own folder. */
function isSafePath(path: string): boolean {
    if (path === "" || path.startsWith("/") || path.includes("\\") || /^[A-Za-z]:/.test(path)) return false;
    const parts = path.split("/");
    if (parts.some((p) => p === "" || p === "." || p === "..")) return false;
    return parts[0] !== UPDATES && parts[0] !== "splits" && parts[0] !== "reports";
}

/** "3.10.0" > "3.9.2". Versions are X.Y.Z; anything else sorts as 0.0.0. */
export function compareVersions(a: string, b: string): number {
    const parse = (v: string) => (/^\d+\.\d+\.\d+$/.test(v) ? v.split(".").map(Number) : [0, 0, 0]);
    const [x, y] = [parse(a), parse(b)];
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
}

const key = (f: ManifestFile) => `${f.path}\n${f.sha256}`;

/** Files of `target` that the install does not already have, at that path with that content. */
export function filesToStage(current: Manifest, target: Manifest): ManifestFile[] {
    const have = new Set(current.files.map(key));
    return target.files.filter((f) => !have.has(key(f)));
}

/** Files of `current` that the swap moves out to updates/previous/ (changed or gone in `target`). */
export function filesToRetire(current: Manifest, target: Manifest): ManifestFile[] {
    const keep = new Set(target.files.map(key));
    return current.files.filter((f) => !keep.has(key(f)));
}

/** image-copies.json's groups: pool-relative paths, the kept file first. */
export type CopyGroups = string[][];

export function parseCopyGroups(text: string | null): CopyGroups {
    if (!text) return [];
    try {
        const copies = JSON.parse(text.replace(/^﻿/, "")).copies;
        return Array.isArray(copies) ? copies : [];
    } catch {
        return [];
    }
}

/**
 * The duplicate images (hard links the app made from image-copies.json) that would be
 * wrong after the swap: a copy the target does not list as a copy of the same file, or a
 * copy of a file whose content changes. They are deleted before the swap, and the app
 * makes the target's copies on its next launch (restoreImageCopies in importLegacy.ts).
 */
export function staleCopies(current: Manifest, target: Manifest, currentCopies: CopyGroups, targetCopies: CopyGroups): string[] {
    const sha = (m: Manifest) => new Map(m.files.map((f) => [f.path, f.sha256]));
    const [before, after] = [sha(current), sha(target)];
    const targetKept = new Map<string, string>();
    for (const [kept, ...copies] of targetCopies) for (const copy of copies) targetKept.set(copy, kept);
    const stale: string[] = [];
    for (const [kept, ...copies] of currentCopies) {
        const unchanged = before.get(IMAGE_POOL + kept) === after.get(IMAGE_POOL + kept);
        for (const copy of copies) {
            if (!unchanged || targetKept.get(copy) !== kept) stale.push(IMAGE_POOL + copy);
        }
    }
    return stale;
}

/**
 * One line of the helper's op list (apply.ps1), tab-separated:
 *
 *   move <from> <to>     before `commit`: undone in reverse order if anything fails
 *   delete <path>        a file; a missing one is fine
 *   commit               the swap is done; what follows is clean-up, failures only logged
 *   rmdir <path>         a whole folder
 *   launch <exe> <args>  run after the swap, whether it worked or not
 */
export type Op = ["move", string, string] | ["delete", string] | ["commit"] | ["rmdir", string] | ["launch", ...string[]];

export function formatOps(ops: Op[]): string {
    return ops.map((op) => op.join("\t")).join("\r\n") + "\r\n";
}

export interface SwapInput {
    current: Manifest;
    target: Manifest;
    currentCopies: CopyGroups;
    targetCopies: CopyGroups;
    /** The target's files are in updates/previous/ (a rollback), not in updates/staging/. */
    fromPrevious: boolean;
    /** updates/previous/ exists now (when not rolling back from it, it is thrown away). */
    previousExists: boolean;
    /** The exe and arguments to start when the swap is over; empty starts nothing. */
    launch: string[];
}

/**
 * The swap from `current` to `target`. Files move, never copy: updates/ is inside the
 * install folder, so a move is a rename and the whole swap takes seconds.
 */
export function planSwap(input: SwapInput): Op[] {
    const { current, target } = input;
    const ops: Op[] = [];
    if (input.fromPrevious) ops.push(["move", PREVIOUS, STAGING]);
    else if (input.previousExists) ops.push(["move", PREVIOUS, DISCARD]);
    for (const copy of staleCopies(current, target, input.currentCopies, input.targetCopies)) ops.push(["delete", copy]);
    for (const file of filesToRetire(current, target)) ops.push(["move", file.path, `${PREVIOUS_NEW}/${file.path}`]);
    ops.push(["move", INSTALL_MANIFEST, `${PREVIOUS_NEW}/manifest.json`]);
    for (const file of filesToStage(current, target)) ops.push(["move", `${STAGING}/${file.path}`, file.path]);
    ops.push(["move", `${STAGING}/manifest.json`, INSTALL_MANIFEST]);
    ops.push(["move", PREVIOUS_NEW, PREVIOUS]);
    ops.push(["commit"]);
    ops.push(["rmdir", DISCARD]);
    ops.push(["rmdir", STAGING]);
    // The rollback file for the version this swap leaves behind (written beside it by the
    // app before the swap starts); a rollback run from the .cmd leaves none, and the app
    // writes a fresh one on its next launch.
    ops.push(["delete", ROLLBACK_OPS]);
    ops.push(["move", ROLLBACK_OPS_NEXT, ROLLBACK_OPS]);
    if (input.launch.length > 0) ops.push(["launch", ...input.launch]);
    return ops;
}
