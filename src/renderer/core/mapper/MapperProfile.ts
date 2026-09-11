/**
 * The mapper translation layer's data (plan section 2, "Mapper translation layer";
 * plan 1.4 / 2.3).
 *
 * Scott's requirement: keep today's mappers, but make it possible for a different
 * mapper to supply the same data later without touching overlay logic. So stores,
 * hooks and components read **canonical keys** -- named for what the overlay means --
 * and a profile, one file per mapper, says which mapper path each key comes from.
 *
 * gen1's own path vocabulary *is* the canonical vocabulary (plan 2.3: "canonical keys
 * are reused from gen1 wherever the meaning is the same"), so gen1's two profiles are
 * identity maps over the 224 paths `docs/gen1-inventory.md` measured. A gen2 profile
 * maps the keys that mean the same thing to gen2's paths and adds keys for what only
 * gen2 has; a STANDARD-mapper profile for gen1 would be a new file, a new fixture and a
 * parity run, with no logic change.
 *
 * Profiles are plain data with no Vue or app imports, on purpose: the parity harness
 * loads them under `tsx` to check the PokeAByte write log against `writes`.
 */

/** Where a canonical key's value comes from in this mapper. */
export interface PropertyRef {
    /** The mapper path, in PokeAByte's dotted form (`player.team.0.hp`). */
    path: string;
}

/** How the overlay writes a key. Matches the three PokeAByte write endpoints. */
export type WriteKind = "value" | "bytes" | "bits";

export interface WriteRef extends PropertyRef {
    kinds: WriteKind[];
}

/**
 * How to recognise the game this mapper is for.
 *
 * `property` reads a value out of the loaded mapper's own properties (gen1/gen2:
 * `meta.gameName` = "Yellow"); `mapperMeta` reads the `/mapper` response's `meta` block
 * (gen3's emerald mappers have no meta properties at all, so only `meta.gameName` =
 * "STP Pokemon Emerald" identifies them).
 */
export interface MapperIdentity {
    source: "property" | "mapperMeta";
    path: string;
    /** The accepted values, verbatim -- gen3 has five spellings and gen4 seven. */
    values: string[];
}

export interface MapperProfile {
    /** Stable id, `"gen1/yellow-deprecated"`. */
    id: string;
    /** Matched against the `/mapper` response's `meta.path` first. */
    pathPatterns: RegExp[];
    /** Fallback when the path does not match, and the source of the game name. */
    identity: MapperIdentity;
    /**
     * Canonical key -> mapper path. A key may name a *container* (`player.badges`) as
     * well as a leaf: the adapter aliases the container to the mapper's real object, so
     * dynamic accesses the static inventory cannot see (`badges['badge' + x]`) keep
     * working. The leaves under an aliased container are still listed, because the
     * list is what the profile *claims* to cover.
     */
    reads: Record<string, PropertyRef>;
    /** Canonical key -> mapper path + the write kinds the overlay uses on it. */
    writes: Record<string, WriteRef>;
    /** Keys this mapper cannot provide; the feature that needs them turns off. */
    unsupported?: string[];
}

/** An identity `reads` map: every key comes from the path of the same name. */
export function identityReads(paths: readonly string[]): Record<string, PropertyRef> {
    const reads: Record<string, PropertyRef> = {};
    for (const path of paths) reads[path] = { path };
    return reads;
}

/** An identity `writes` map from `path -> kinds`. */
export function identityWrites(table: Readonly<Record<string, WriteKind[]>>): Record<string, WriteRef> {
    const writes: Record<string, WriteRef> = {};
    for (const [path, kinds] of Object.entries(table)) writes[path] = { path, kinds };
    return writes;
}
