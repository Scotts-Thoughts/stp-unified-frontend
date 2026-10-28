import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { copyFile, mkdir, open, rename, rm, writeFile, type FileHandle } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { filesToStage, parseManifest, PREVIOUS, STAGING, type Manifest, type ManifestFile } from "./plan";
import type { Release } from "./releases";

/**
 * Puts every file the target version needs, and the install lacks, in updates/staging/
 * (docs/updates.md). Each file comes from the cheapest place that has it:
 *
 *   1. updates/staging/ already (an earlier download that was stopped or not installed);
 *   2. a file with the same content in the install or in updates/previous/ (copied);
 *   3. the release. A compressed pack (runtime, app) is downloaded whole; from a raw pack
 *      (icons, images) only the byte ranges of the files needed, with HTTP range requests.
 *
 * Every file is checked against its SHA-256 before it counts.
 */

const RANGE_GAP = 1 << 20;

export interface DownloadPlan {
    /** Files to copy from a local file with the same content. */
    local: { file: ManifestFile; from: string }[];
    /** Files to download, by pack. */
    remote: Map<string, ManifestFile[]>;
    /** Bytes the download will fetch. */
    bytes: number;
    /** Files of the target that are already staged. */
    staged: number;
}

interface Context {
    root: string;
    current: Manifest;
    target: Manifest;
    release: Release;
}

export function readPreviousManifest(root: string): Manifest | null {
    try {
        return parseManifest(readFileSync(join(root, PREVIOUS, "manifest.json"), "utf-8"));
    } catch {
        return null;
    }
}

/** Where to fetch each needed file from; with `verify`, staged files are re-hashed (slow), otherwise trusted by size. */
export async function planDownload(ctx: Context, verify: boolean): Promise<DownloadPlan> {
    const { root, current, target, release } = ctx;
    const staging = join(root, STAGING);
    const sources = new Map<string, string>();
    for (const f of current.files) if (!sources.has(f.sha256)) sources.set(f.sha256, join(root, f.path));
    const previous = readPreviousManifest(root);
    for (const f of previous?.files ?? []) if (!sources.has(f.sha256)) sources.set(f.sha256, join(root, PREVIOUS, f.path));

    const plan: DownloadPlan = { local: [], remote: new Map(), bytes: 0, staged: 0 };
    for (const file of filesToStage(current, target)) {
        const staged = join(staging, file.path);
        if (sizeOf(staged) === file.size && (!verify || (await hashFile(staged)) === file.sha256)) {
            plan.staged++;
            continue;
        }
        const from = sources.get(file.sha256);
        if (from && sizeOf(from) === file.size) {
            plan.local.push({ file, from });
            continue;
        }
        if (!plan.remote.has(file.pack)) plan.remote.set(file.pack, []);
        plan.remote.get(file.pack)!.push(file);
    }
    for (const [name, files] of plan.remote) {
        const pack = target.packs[name];
        plan.bytes += pack.compressed ? release.assets[pack.file]?.size || pack.size : rangesOf(files).reduce((sum, r) => sum + r.end - r.start, 0);
    }
    return plan;
}

export async function runDownload(ctx: Context, plan: DownloadPlan, onProgress: (received: number) => void, signal: AbortSignal): Promise<void> {
    const staging = join(ctx.root, STAGING);
    let received = 0;
    const progress = (n: number) => {
        received += n;
        onProgress(received);
    };

    for (const { file, from } of plan.local) {
        if (signal.aborted) throw new Error("stopped");
        const to = join(staging, file.path);
        await mkdir(dirname(to), { recursive: true });
        await copyFile(from, `${to}.part`);
        if ((await hashFile(`${to}.part`)) !== file.sha256) {
            await rm(`${to}.part`, { force: true });
            throw new Error(`${file.path}: the local copy has changed; check for updates again`);
        }
        await rename(`${to}.part`, to);
    }

    for (const [name, files] of plan.remote) {
        const pack = ctx.target.packs[name];
        const url = ctx.release.assets[pack.file].url;
        const wanted = files.slice().sort((a, b) => a.offset - b.offset);
        for (const f of wanted.filter((f) => f.size === 0)) await writeStaged(staging, f, Buffer.alloc(0));
        const nonEmpty = wanted.filter((f) => f.size > 0);
        if (nonEmpty.length === 0) continue;

        if (pack.compressed) {
            const response = await get(url, signal);
            const raw = Readable.fromWeb(response.body as never);
            const gunzip = createGunzip();
            raw.on("data", (chunk: Buffer) => progress(chunk.length));
            raw.on("error", (err) => gunzip.destroy(err));
            raw.pipe(gunzip);
            try {
                await extract(gunzip, 0, nonEmpty, staging);
            } finally {
                raw.destroy();
            }
            continue;
        }
        const ranges = rangesOf(nonEmpty);
        for (let i = 0; i < ranges.length; i++) {
            const range = ranges[i];
            const response = await get(url, signal, `bytes=${range.start}-${range.end - 1}`);
            const body = Readable.fromWeb(response.body as never);
            try {
                if (response.status === 206) {
                    await extract(body, range.start, range.files, staging, progress);
                } else {
                    // The server ignored the range and is sending the whole pack: take everything from it.
                    await extract(body, 0, ranges.slice(i).flatMap((r) => r.files), staging, progress);
                    break;
                }
            } finally {
                body.destroy();
            }
        }
    }

    await writeFile(join(staging, "manifest.json"), JSON.stringify(ctx.target));
}

interface Range {
    start: number;
    end: number;
    files: ManifestFile[];
}

/** The needed files of a raw pack as byte ranges, neighbours less than RANGE_GAP apart merged. */
function rangesOf(files: ManifestFile[]): Range[] {
    const ranges: Range[] = [];
    for (const f of files.slice().sort((a, b) => a.offset - b.offset)) {
        const last = ranges[ranges.length - 1];
        if (last && f.offset - last.end <= RANGE_GAP) {
            last.end = Math.max(last.end, f.offset + f.size);
            last.files.push(f);
        } else ranges.push({ start: f.offset, end: f.offset + f.size, files: [f] });
    }
    return ranges;
}

async function get(url: string, signal: AbortSignal, range?: string): Promise<Response> {
    const headers: Record<string, string> = { "User-Agent": "stp-overlay-updater" };
    if (range) headers.Range = range;
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const response = await fetch(url, { headers, signal });
            if (response.ok && response.body) return response;
            lastError = new Error(`download failed: ${response.status} ${response.statusText}`);
        } catch (err) {
            if (signal.aborted) throw new Error("stopped");
            lastError = err;
        }
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
    throw lastError;
}

/**
 * Writes the `wanted` files (sorted by offset) out of `stream`, which starts at byte
 * `start` of the pack, into staging; stops reading once the last one is complete.
 * `onChunk` counts what was read (a gzip stream's progress is counted before it, in
 * compressed bytes).
 */
async function extract(stream: AsyncIterable<Buffer>, start: number, wanted: ManifestFile[], staging: string, onChunk?: (n: number) => void): Promise<void> {
    let pos = start;
    let index = 0;
    let out: { file: ManifestFile; handle: FileHandle; hash: ReturnType<typeof createHash>; written: number } | null = null;
    try {
        for await (const chunk of stream) {
            onChunk?.(chunk.length);
            let at = 0;
            while (at < chunk.length && index < wanted.length) {
                const file = wanted[index];
                const here = pos + at;
                if (here < file.offset) {
                    at += Math.min(chunk.length - at, file.offset - here);
                    continue;
                }
                if (!out) {
                    const path = join(staging, file.path);
                    await mkdir(dirname(path), { recursive: true });
                    out = { file, handle: await open(`${path}.part`, "w"), hash: createHash("sha256"), written: 0 };
                }
                const take = Math.min(chunk.length - at, file.offset + file.size - here);
                const slice = chunk.subarray(at, at + take);
                await out.handle.write(slice);
                out.hash.update(slice);
                out.written += take;
                at += take;
                if (out.written === file.size) {
                    await out.handle.close();
                    const path = join(staging, file.path);
                    const ok = out.hash.digest("hex") === file.sha256;
                    out = null;
                    if (!ok) {
                        await rm(`${path}.part`, { force: true });
                        throw new Error(`${file.path} did not download correctly`);
                    }
                    await rename(`${path}.part`, path);
                    index++;
                }
            }
            pos += chunk.length;
            if (index >= wanted.length) break;
        }
    } finally {
        if (out) await out.handle.close().catch(() => {});
    }
    if (index < wanted.length) throw new Error("the download ended early");
}

async function writeStaged(staging: string, file: ManifestFile, data: Buffer): Promise<void> {
    const path = join(staging, file.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
}

function sizeOf(path: string): number {
    try {
        return statSync(path).size;
    } catch {
        return -1;
    }
}

function hashFile(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = createHash("sha256");
        createReadStream(path)
            .on("data", (chunk) => hash.update(chunk))
            .on("end", () => resolve(hash.digest("hex")))
            .on("error", reject);
    });
}

/** Throws away a staging folder that holds another version's download. */
export async function resetStagingFor(root: string, version: string): Promise<void> {
    const marker = join(root, STAGING, "manifest.json");
    if (!existsSync(marker)) return;
    try {
        if (parseManifest(readFileSync(marker, "utf-8")).version === version) return;
    } catch {
        // unreadable: throw it away with the rest
    }
    await rm(join(root, STAGING), { recursive: true, force: true });
}

export { hashFile, sizeOf };
