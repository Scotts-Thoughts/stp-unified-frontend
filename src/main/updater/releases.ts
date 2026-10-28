import { compareVersions, parseManifest, type Manifest } from "./plan";

/** Where releases come from (.github/workflows/release.yml publishes them). */
const REPO = "Scotts-Thoughts/stp-unified-frontend";

/**
 * The release list: GitHub's releases API, or `STP_UPDATE_FEED`, a URL serving the same
 * JSON (tools/updates/e2e.ts points it at a local server to test the updater end to end).
 */
function feedUrl(): string {
    return process.env.STP_UPDATE_FEED || `https://api.github.com/repos/${REPO}/releases?per_page=100`;
}

export interface ReleaseAsset {
    url: string;
    size: number;
}

export interface Release {
    version: string;
    name: string;
    notes: string;
    published: string;
    page: string;
    assets: Record<string, ReleaseAsset>;
}

const HEADERS = { "User-Agent": "stp-overlay-updater", Accept: "application/vnd.github+json" };

/** Every published release that the updater can install (it has a manifest.json), newest first. */
export async function listReleases(signal?: AbortSignal): Promise<Release[]> {
    const response = await fetch(feedUrl(), { headers: HEADERS, signal });
    if (!response.ok) {
        const limited = response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0";
        throw new Error(limited ? "GitHub's limit on update checks was reached; try again in an hour" : `GitHub answered ${response.status} ${response.statusText}`);
    }
    const body = (await response.json()) as unknown;
    if (!Array.isArray(body)) throw new Error("unexpected answer from GitHub");
    const releases: Release[] = [];
    for (const raw of body) {
        const match = /^v(\d+\.\d+\.\d+)$/.exec(String(raw?.tag_name ?? ""));
        if (!match || raw.draft) continue;
        const assets: Record<string, ReleaseAsset> = {};
        for (const asset of Array.isArray(raw.assets) ? raw.assets : []) {
            if (typeof asset?.name === "string" && typeof asset.browser_download_url === "string") {
                assets[asset.name] = { url: asset.browser_download_url, size: Number(asset.size) || 0 };
            }
        }
        if (!assets["manifest.json"]) continue;
        releases.push({
            version: match[1],
            name: String(raw.name || raw.tag_name),
            notes: String(raw.body ?? ""),
            published: String(raw.published_at ?? ""),
            page: String(raw.html_url ?? ""),
            assets,
        });
    }
    return releases.sort((a, b) => compareVersions(b.version, a.version));
}

export async function fetchManifest(release: Release, signal?: AbortSignal): Promise<Manifest> {
    const response = await fetch(release.assets["manifest.json"].url, { headers: { "User-Agent": HEADERS["User-Agent"] }, signal });
    if (!response.ok) throw new Error(`could not download the manifest of ${release.version} (${response.status})`);
    const manifest = parseManifest(await response.text());
    if (manifest.version !== release.version) throw new Error(`release ${release.version} has the manifest of ${manifest.version}`);
    for (const pack of Object.values(manifest.packs)) {
        if (!release.assets[pack.file]) throw new Error(`release ${release.version} is missing ${pack.file}`);
    }
    return manifest;
}
