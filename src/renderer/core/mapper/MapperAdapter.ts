import type { MapperIdentity, MapperProfile } from "./MapperProfile";

/**
 * Resolves a profile against a loaded mapper (plan 1.4).
 *
 * The output of {@link buildCanonicalView} is a tree shaped by the profile's canonical
 * keys whose leaves are the mapper client's **own `GameHookProperty` objects** -- not
 * copies, not wrappers. That is what keeps the layer invisible to parity: `.value`,
 * `.bytes`, `.change()` and `.set()` are the same objects and the same methods the
 * overlay used before, with the same timing. All the profile adds is *which* object
 * sits under *which* name.
 *
 * Rebuild it whenever `mapper.properties` is reassigned: the client rebuilds its whole
 * tree on every 60 s mapper refresh. A Vue `computed` over `mapper.properties` does that
 * for free, and cheaply -- the build reads only container keys, never `.value`, so value
 * changes do not invalidate it.
 */

/** Walks a dotted mapper path down the client's tree. */
export function resolvePath(root: any, path: string): unknown {
    let node = root;
    for (const segment of path.split(".")) {
        if (node === null || node === undefined) return undefined;
        node = node[segment];
    }
    return node;
}

/**
 * Builds the canonical view.
 *
 * Keys are processed shortest first so a container key (`player.badges`) aliases the
 * mapper's real container before the leaves under it are visited. When the walk for a
 * longer key reaches a node that is already a real mapper object, it continues *into*
 * it: the child it wants already exists there. If that child is not the object the
 * leaf's own path resolves to, the profile contradicts itself and this throws, because
 * silently picking one would be exactly the kind of mismatch the layer exists to prevent.
 *
 * Undeclared keys resolve to `undefined`, like an undeclared path on the raw tree did.
 */
export function buildCanonicalView(profile: MapperProfile, properties: any): Record<string, any> {
    const view: Record<string, any> = {};
    if (!properties) return view;

    const keys = Object.keys(profile.reads).sort((a, b) => a.split(".").length - b.split(".").length || (a < b ? -1 : 1));
    for (const key of keys) {
        const target = resolvePath(properties, profile.reads[key].path);
        // A key this mapper file does not have leaves no trace: gen4's one profile
        // vocabulary covers three mappers, and Platinum has no `variables.*` at all.
        // Creating an empty `variables` container for it would turn the legacy
        // `properties?.variables?.game_started.change(...)` (a short-circuit on the
        // missing container) into a TypeError on the missing leaf.
        if (target === undefined) continue;
        const segments = key.split(".");
        let node: any = view;
        for (let i = 0; i < segments.length - 1; i++) {
            const segment = segments[i];
            if (!(segment in node)) node[segment] = /^\d+$/.test(segments[i + 1]) ? [] : {};
            node = node[segment];
            if (node === null || node === undefined) break;
        }
        if (node === null || node === undefined) continue;
        const last = segments[segments.length - 1];
        if (last in node && node[last] !== undefined && node[last] !== target) {
            throw new Error(
                `MapperProfile ${profile.id}: "${key}" resolves to a different object than its container already holds`,
            );
        }
        if (!(last in node)) node[last] = target;
    }
    return view;
}

/** True when the loaded mapper's `/mapper` meta.path matches one of the profile's patterns. */
export function matchesPath(profile: MapperProfile, metaPath: string | null | undefined): boolean {
    if (!metaPath) return false;
    return profile.pathPatterns.some((pattern) => pattern.test(metaPath));
}

/**
 * The game-name value the identity rule reads, or `null`.
 *
 * `properties` is the client's property tree (for `source: "property"`) and
 * `mapperMeta` the `/mapper` response's `meta` block (for `source: "mapperMeta"`).
 */
export function readIdentity(identity: MapperIdentity, properties: any, mapperMeta: any): string | null {
    if (identity.source === "property") {
        const property = resolvePath(properties, identity.path) as { value?: unknown } | undefined;
        const value = property?.value;
        return value === undefined || value === null ? null : String(value);
    }
    const value = mapperMeta ? mapperMeta[identity.path] : undefined;
    return value === undefined || value === null ? null : String(value);
}

/** True when the identity rule's value is one of the profile's accepted values. */
export function matchesIdentity(profile: MapperProfile, properties: any, mapperMeta: any): boolean {
    const value = readIdentity(profile.identity, properties, mapperMeta);
    return value !== null && profile.identity.values.includes(value);
}
