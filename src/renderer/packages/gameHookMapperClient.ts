import {HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel} from "@microsoft/signalr";
import { markRaw, reactive, toRaw } from "vue";

// main.ts keeps the client in its root component's data(), so Vue proxies the whole
// instance. That is what the overlay needs from `meta`, `properties` and each
// property object -- the templates read `game.properties.x.value` -- but it also
// used to reach the four internal tables: every SignalR batch did its Map lookups
// through instrumented proxies, and the debounce loop walked `_debouceMap` through
// the reactive Map iterator every frame (docs/performance-followups.md A). The
// tables are `markRaw`'d: nothing renders them, and the property objects they hold
// are stored as their reactive proxies so a write through them still triggers.

export enum GamePropertyType {
	binaryCodedDecimal = "binaryCodedDecimal",
	bitArray = "bitArray",
	bool = "bool",
	int = "int",
	string = "string",
	uint = "uint",
	bit = "bit"
}

type GameHookPropertyOwnAttributes = 
    "_client"
    | "path"
    | "memoryContainer"
    | "address"
    | "length"
    | "type"
    | "size"
    | "reference"
    | "bits"
    | "description"
    | "value"
    | "bytes"
    | "isFrozen"
    | "isReadOnly"
    | "fieldsChanged"
    | "set"
    | "setBytes"
    | "freeze"
    | "change"
    | "once"
    | "toString"

type GamehookPropertyData<T = any> = {
    path: string,
    memoryContainer: string | null,
    // GameHook allows a null address on a script-derived property; PokeAByte always
    // gives a number. Nothing in the app reads `.address`, so the wider type costs it
    // nothing.
    address: number | null,
    length: number,
    type: GamePropertyType | GameHookProperty,
    size: number | null,
    reference: string | null,
    bits: string | null,
    description: string | null,
    value: T,
    bytes: number[],
    isFrozen: boolean,
    isReadOnly: boolean,
    fieldsChanged: string[]
};

interface IGameHookProperty<T = any> {
    _client: GameHookMapperClient;
    set(value: any, freeze?: boolean): Promise<void>;
    setBytes(bytes: number[], freeze?: boolean): Promise<void>;
    freeze(freeze?: boolean): Promise<void>;
    /**
     * Register a function that is called whenever the property received an update that changes it's `value`.
     * @param fn The callback function that will be invoked, with both the new and old property values.
     */
    change<T>(fn: (newValue: GameHookProperty, oldValue: GameHookProperty) => any): void;
    once(fn: Function): void;
    toString(): string | null;
}

export type GameHookProperty = GamehookPropertyData & IGameHookProperty & {
    // Index signature for dynamic keys
    [key: Exclude<string, GameHookPropertyOwnAttributes>]: GameHookProperty;
};

const GameHookPropertyPrototype = {
    async set(this: GameHookProperty, value: any, freeze?: boolean) {
        await this._client._editPropertyValue(this.path, value, freeze);
    },
    async setBytes(this: GameHookProperty, bytes: number[], freeze?: boolean) {
        await this._client._editPropertyBytes(this.path, bytes, freeze);
    },
    async freeze(this: GameHookProperty, freeze: boolean = true) {
        await this._client._editPropertyBytes(this.path, this.bytes, freeze);
    },
    change(this: GameHookProperty, fn: Function) {
        if (!this._client._change[this.path]) {
            this._client._change[this.path] = [];
        }
        this._client._change[this.path].push(fn);
    },
    once(this: GameHookProperty, fn: Function) {
        if (!this._client._once[this.path]) {
            this._client._once[this.path] = [];
        }
        this._client._once[this.path].push(fn);
    },
    toString(this: GameHookProperty) {
        if (this.value === undefined || this.value === null) { return null }
        return this.value.toString();
    }
};

function createGameHookProperty(
    client: GameHookMapperClient,
    obj: GamehookPropertyData
): GameHookProperty {
    const instance = Object.create(GameHookPropertyPrototype) as GameHookProperty;
    instance._client = client;
    // Assign all properties from obj
    Object.assign(instance, obj);
    return instance;
}

/** The fields a `PropertiesChanged` entry (and a `/mapper` DTO) carries onto a property, `value` last. */
const UPDATED_FIELDS = [
    "memoryContainer", "address", "length", "size", "reference", "bits",
    "description", "bytes", "isFrozen", "isReadOnly", "value",
] as const;

function sameBytes(a: number[] | null | undefined, b: number[] | null | undefined): boolean {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

// ---------------------------------------------------------------------------
// GameHook support. GameHook has no single snapshot endpoint like PokeAByte's
// `/mapper` and no `PropertiesChanged`-shaped push, so the helpers below turn
// its `/properties` value tree, its per-path detail route and its bare
// `{path, value, bytes}` update frames into the same shapes the code above
// already knows how to apply.

/** `a.b.0.c` -> `{a:{b:{"0":{c: value}}}}`; numeric segments are object keys, never arrays. */
function isGameHookNode(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Flattens a GameHook `/properties` tree to `{path, value}` leaves, dot-joined. A leaf is never a plain object; a bitArray (an array) is a leaf. */
function flattenGameHookTree(tree: Record<string, unknown>, prefix = "", out: { path: string; value: unknown }[] = []): { path: string; value: unknown }[] {
    for (const key of Object.keys(tree)) {
        const value = tree[key];
        const path = prefix ? `${prefix}.${key}` : key;
        if (isGameHookNode(value)) {
            flattenGameHookTree(value, path, out);
        } else {
            out.push({ path, value });
        }
    }
    return out;
}

/** Deep-compares a value GameHook sent against what a property already holds (arrays/objects by content, everything else by identity). */
function gameHookValuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
        return JSON.stringify(a) === JSON.stringify(b);
    }
    return false;
}

/** Every path segment individually escaped, so a `.` inside a segment can never be mistaken for the next one; GameHook accepts `.` or `/` between segments and normalises to `.`. */
function encodeGameHookPath(path: string): string {
    return path.split(".").map(encodeURIComponent).join(".");
}

/** The instance index named at the end of an instance base (`…/instances/3` -> 3), or 0 when the base does not end in one. */
function gameHookInstanceIndex(base: string): number {
    const match = /\/instances\/(\d+)$/.exec(base);
    return match ? Number(match[1]) : 0;
}

/**
 * `/mappers`' `value` for an official mapper lists Windows path separators
 * (`gba\pokemon_emerald.xml`); a custom one already uses `/` (`custom/ST/...`). Both
 * become forward slashes here, and a leading `custom/` is dropped, so `meta.path`
 * matches the same detection patterns (`main.ts`, `games/*\/manifest.ts`) either way
 * -- `meta.key` is kept exactly as `/mappers` listed it elsewhere, since that is what
 * a load has to send back.
 */
function gameHookMetaPath(key: string): string {
    const forwardSlashed = key.replace(/\\/g, "/");
    return forwardSlashed.startsWith("custom/") ? forwardSlashed.slice("custom/".length) : forwardSlashed;
}

/** `http://host:port/instances/3` -> `ws://host:port/instances/3/ws` (https -> wss). */
function gameHookSocketUrl(base: string): string {
    return base.replace(/\/+$/, "").replace(/^http/, "ws") + "/ws";
}

/**
 * A property's type when its detail fetch failed and GameHook never got to say what
 * it is -- a best-effort guess from the tree's own value so `type` is never left
 * undefined. Never overrides a type GameHook actually reported.
 */
function gameHookGuessType(value: unknown): GamePropertyType {
    if (Array.isArray(value)) return GamePropertyType.bitArray;
    if (typeof value === "boolean") return GamePropertyType.bool;
    if (typeof value === "string") return GamePropertyType.string;
    return GamePropertyType.uint;
}

/** Runs `fn` over `items` with at most `limit` in flight, preserving input order in the result. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;
    async function worker(): Promise<void> {
        for (;;) {
            const i = next++;
            if (i >= items.length) return;
            results[i] = await fn(items[i]);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

/**
 * Copies a DTO's fields onto a property, writing only the ones that differ. Every
 * write goes through the property's reactive proxy and is a `trigger()`; a batch used
 * to make eleven of them per changed property when usually one or two fields moved.
 * `bytes` is a fresh array in every DTO, so it is compared by content; a `value` that
 * is an array or object (bitArray, a struct) is assigned when its identity changed,
 * as before.
 */
function applyPropertyFields(property: GameHookProperty, dto: GamehookPropertyData, deepValue = false): void {
    const raw = toRaw(property) as GameHookProperty;
    for (const field of UPDATED_FIELDS) {
        const next = dto[field];
        const current = raw[field];
        if (field === "bytes") {
            if (sameBytes(current as number[], next as number[])) continue;
        } else if (current === next) {
            continue;
        } else if (deepValue && field === "value" && typeof next === "object" && next !== null && typeof current === "object" && current !== null) {
            // The minute refresh: a bitArray or struct value that is equal by content
            // is left alone, so it does not re-render its dependents once a minute.
            if (JSON.stringify(current) === JSON.stringify(next)) continue;
        }
        (property as any)[field] = next;
    }
}

/**
 * The snapshot handlers receive as `oldProperty`, read off the raw object rather than
 * through the proxy: every updated field, plus the three an update never touches.
 */
function snapshotProperty(property: GameHookProperty): GamehookPropertyData {
    const raw = toRaw(property) as GameHookProperty;
    const snapshot = { path: raw.path, type: raw.type, fieldsChanged: raw.fieldsChanged } as GamehookPropertyData;
    for (const field of UPDATED_FIELDS) (snapshot as any)[field] = raw[field];
    return snapshot;
}

export class GameHookMapperClient {
    _connectionString: string;
    _signalrClient: HubConnection | null = null;
    _properties: GameHookProperty[] = markRaw([]);
    _propertiesMap: Map<string, GameHookProperty> | null = null;
    _debouceTimeout = 10;
    _debouceList: string[] = [];
    _debouceMap: Map<string, { property: GameHookProperty; timeoutFrames: number; newProperty: any }> | null = null;
    meta;
    properties: Record<string, GameHookProperty> = {};
    glossary;
    _change: Record<string, any[]> = markRaw({});
    _once: Record<string, any[]> = markRaw({});
    /**
     * The one pending 60 s mapper refresh. `loadMapper()` used to schedule its next
     * run without cancelling the previous timer, and it is called from every
     * `MapperLoaded` event and every reconnect as well, so each of those left one more
     * chain running for good -- and each chain's refresh rebuilds the whole property
     * tree, which re-renders the whole overlay (docs/performance-followups.md).
     */
    _refreshTimer: ReturnType<typeof setTimeout> | null = null;
    /**
     * The debounce frame loop (`debouce` in `connect()`) and whether a chain of it is
     * running. `connect()` used to start the loop exactly once, after its first
     * `_establishConnection()`, so any path that reached a connection some other way
     * left it dead for the session: a retry after PokeAByte came up late, a reconnect
     * after it restarted, and -- until the null guard in the loop -- a first
     * connection while PokeAByte had no mapper loaded, where the first tick threw. A
     * dead loop parks every debounced property forever (the `PropertiesChanged` handler
     * hands them to the loop), so `battle.opponent.team_count`, the enemy team and
     * `battle.opponent.active_pokemon` stopped updating and the enemy team area drew
     * the previous battle's slot count. Every successful `_establishConnection()` now
     * starts the loop through {@link _startDebounceLoop}, which is a no-op while a
     * chain is already running, so there is never more than one.
     */
    _debounceTick: (() => void) | null = null;
    _debounceLoopRunning = false;
    /** Set by `disconnect()`: the `onclose` that follows is ours, not a lost connection to reconnect. */
    _stopping = false;
    /**
     * The 5 s retry `_establishConnection()` arms when PokeAByte is down, so that
     * `disconnect()` can cancel it. Without the handle a retry landing after the shell
     * tore the client down found no SignalR client to start, went straight to
     * `connected = true`, `onConnected()`, a mapper GET and the frame loop -- and
     * PokeAByte coming up later "reconnected" an overlay that no longer existed.
     */
    _retryTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Which tool `_establishConnection()` last detected at `_connectionString`'s
     * origin, chosen fresh on every connect and every retry (never assumed to stay
     * the same across a reconnect). `null` before the first attempt.
     */
    _mode: "pokeabyte" | "gamehook" | null = null;
    /** GameHook instance base (`http://host:port/instances/<n>`), set once detected. */
    _gameHookBase: string | null = null;
    /** The live GameHook update socket, or null when not in GameHook mode or not connected. */
    _gameHookSocket: WebSocket | null = null;
    /** GameHook has no mapper-changed event; this polls `GET {base}/mapper` for one. */
    _gameHookPollTimer: ReturnType<typeof setInterval> | null = null;

    connected: boolean = false;
    private _options: { automaticRefreshMapperTimeMinutes: number; };

    get mapperLoaded() {
        return !this.meta ? false : true
    }

    get _signalrConnectionEstablished() {
        return this._signalrClient != null && this._signalrClient.state === HubConnectionState.Connected;
    }

    static decimalToHexdecimal(x: number, uppercase: boolean = true) {
        if (x == null) return null

        let stringValue = x.toString(16)

        // If the string is of odd length, we
        // need to introduce a leading zero.
        if (stringValue.length % 2) {
            stringValue = '0' + stringValue
        }

        if (uppercase) return stringValue.toUpperCase()
        else return stringValue
    }

    static hexdecimalToDecimal(x: string|null) {
        if (x == null) return null
        return parseInt(x, 16)
    }

    /**
     * Set only when the Cutter editor runs this overlay (src/main/cutter.ts): the
     * bytes of every property as the tool last sent them, whether applied yet or
     * still held by the debounce, and how many batches have arrived. Nothing else
     * reads it, and the ordinary app never makes it.
     */
    _received: Map<string, number[] | null> | null = null
    _receivedBatches = 0

    constructor(connectionString = 'http://localhost:8085') {
        this._connectionString = connectionString
        if (typeof window !== 'undefined' && (window as any).api?.cutter) {
            this._received = new Map()
            const client = this
            ;(window as any).__cutterProbe = (paths: string[]) => ({
                batches: client._receivedBatches,
                // The overlay is mounted on a loaded mapper (main.ts).
                ready: (window as any).__cutterOverlayReady === true,
                // Finite animations still running: what a pre-roll waits out.
                animations: document.getAnimations().filter((a) => {
                    const end = a.effect?.getComputedTiming().endTime
                    return a.playState === 'running' && typeof end === 'number' && Number.isFinite(end)
                }).length,
                bytes: paths.map((path) =>
                    client._received!.has(path)
                        ? client._received!.get(path)
                        : (client._propertiesMap?.get(path)?.bytes ?? null)),
            })
        }

        this._options = {
            automaticRefreshMapperTimeMinutes: 1
        }
    }

    _cancelRefresh() {
        if (this._refreshTimer !== null) {
            clearTimeout(this._refreshTimer)
            this._refreshTimer = null
        }
    }

    _deconstructMapper() {
        this._cancelRefresh()
        this.meta = null;
        this._properties = markRaw([]);
        this._propertiesMap = null;
        this._debouceMap = null;
        this.properties = {};
        this.glossary = null;
    }

    _scheduleRefresh() {
        this._cancelRefresh()
        this._refreshTimer = setTimeout(() => {
            this._refreshTimer = null
            // A transient failure (PokeAByte briefly unreachable, a non-JSON body) used
            // to end the chain for the session as an unhandled rejection. It is logged
            // and the next refresh is scheduled -- unless the fetch found no mapper, in
            // which case `_fetchMapper` has already torn the mapper down.
            this.refreshMapper().catch((err) => {
                console.warn('[GameHook Client] Mapper refresh failed:', err)
                if (this.mapperLoaded) this._scheduleRefresh()
            })
        }, this._options.automaticRefreshMapperTimeMinutes * 60000)
    }

    _buildDebounceMap(previous: typeof this._debouceMap = null) {
        const map = markRaw(new Map<string, { property: GameHookProperty; timeoutFrames: number; newProperty: any }>())
        this._debouceList.forEach(x => {
            this._properties.forEach(y => {
                if (y.path.startsWith(x)) {
                    map.set(y.path, previous?.get(y.path) ?? {
                        property: y,
                        timeoutFrames: -1,
                        newProperty: null
                    })
                }
            })
        })
        this._debouceMap = map
    }

    /** `GET /mapper`, or a throw after `_deconstructMapper()` on any other status (as `loadMapper()` always did). */
    async _fetchMapper() {
        return fetch(`${this._connectionString}/mapper`)
            .then(async (x) => {
                return { response: x, body: await x.json() }
            })
            .then(x => {
                if (x.response.status === 200) {
                    return x.body
                } else {
                    this._deconstructMapper()

                    if (x.body) {
                        throw x.body
                    } else {
                        throw new Error('Unknown error.')
                    }
                }
            })
    }

    get(path) {
        return this._propertiesMap?.get(path)
    }

    deboucePath(path) {
        this._debouceList.push(path)
    }

    /**
     * Replaces the debounced-path list (and the frame count an update is held for --
     * gen5 sets 15 where the others keep 10) and, if a mapper is loaded, rebuilds the
     * map against it (plan 2.4, gen4/gen5). The legacy gen4 app called `deboucePath()` before
     * `connect()`, so its map was built by the first `loadMapper()`; the unified app
     * knows which module's paths apply only once the mapper is loaded and detected
     * (main.ts), so the map is rebuilt then -- entries already counting down are kept
     * -- and every later `loadMapper()` builds it from the same list.
     */
    setDebouncePaths(paths: string[], frames = 10) {
        this._debouceList = [...paths]
        this._debouceTimeout = frames
        if (!this._properties || this._properties.length === 0) return
        this._buildDebounceMap(this._debouceMap)
    }

    /** The connection string's scheme+host+port, with any `/instances/<n>` path dropped. */
    _origin(): string {
        try {
            return new URL(this._connectionString).origin
        } catch {
            return this._connectionString
        }
    }

    /**
     * `GET {origin}/`: GameHook answers `{"version":"..."}` as JSON; PokeAByte's root
     * is an HTML page. Anything other than a 200 with a string `version` is PokeAByte
     * -- today's path. A network failure (the tool is down) rejects out of here and
     * into `_establishConnection`'s existing failure/5 s retry, which detects again
     * on its next attempt.
     */
    async _detectTool(): Promise<"pokeabyte" | "gamehook"> {
        const res = await fetch(`${this._origin()}/`, { headers: { Accept: "application/json" } })
        if (res.status === 200) {
            try {
                const body = await res.json()
                if (body && typeof body.version === "string") return "gamehook"
            } catch {
                // Not JSON -- PokeAByte's HTML root.
            }
        }
        return "pokeabyte"
    }

    /**
     * GameHook instance base: the connection string itself when it already names an
     * instance (`…/instances/3`, optional trailing slash -- the ordinary-mode override
     * and the Cutter frame server both pass one), otherwise instance 0 at the detected
     * origin, GameHook's default for one running emulator.
     */
    _gameHookInstanceBase(): string {
        const trimmed = this._connectionString.replace(/\/+$/, "")
        return /\/instances\/\d+$/.test(trimmed) ? trimmed : `${this._origin()}/instances/0`
    }

    async loadMapper() {
        console.debug('[GameHook Client] Loading mapper.')
        const mapper = this._mode === "gamehook" ? await this._fetchGameHookMapper() : await this._fetchMapper()
        this._applyMapperSnapshot(mapper)
        return this
    }

    /**
     * Shared by both transports: turns `{meta, glossary, properties}` -- a PokeAByte
     * `/mapper` body as-is, or GameHook's assembled equivalent from
     * `_fetchGameHookMapper` -- into the property tree, lookup map and debounce map,
     * exactly as `loadMapper()` always has.
     */
    _applyMapperSnapshot(mapper: { meta: any; glossary: any; properties: GamehookPropertyData[] }) {
        function assign(target: any, path: string[], value: any) {
            let lastKeyIndex = path.length - 1

            for (var i = 0; i < lastKeyIndex; ++i) {
                let key = path[i]
                if (!(key in target)) {
                    target[key] = /^\d+$/.test(path[i + 1]) ? [] : {}
                }

                target = target[key]
            }

            target[path[lastKeyIndex]] = value
        }

        this.meta = mapper.meta
        this.glossary = mapper.glossary

        // Translate properties from a flat array to a nested object. The tree is built
        // plain and assigned once: `properties` is what main.ts's `game` computed
        // depends on, and the overlay reads the property objects through it.
        const properties = markRaw(mapper.properties.map((x: GamehookPropertyData) => createGameHookProperty(this, x))) as GameHookProperty[];
        const tree: Record<string, GameHookProperty> = {};
        properties.forEach((x: { path: string; }) => assign(tree, x.path.split('.'), x));
        this._properties = properties;
        this.properties = tree;

        // The lookup table holds each property's reactive proxy (the same one the
        // overlay sees through `properties`), so `updateProperty` writes trigger.
        const map = markRaw(new Map<string, GameHookProperty>());
        properties.forEach(x => map.set(x.path, reactive(x) as GameHookProperty));
        this._propertiesMap = map;

        this._buildDebounceMap()

        this._scheduleRefresh()
    }

    /**
     * GameHook's analogue of `_fetchMapper`: it has no single snapshot endpoint, so
     * this assembles the same `{meta, glossary, properties}` shape `_applyMapperSnapshot`
     * expects from GameHook's separate `/mapper`, `/mappers` and `/properties` routes.
     * Throws after `_deconstructMapper()` on a non-200 `/mapper`, exactly as
     * `_fetchMapper` does for PokeAByte.
     */
    async _fetchGameHookMapper() {
        const base = this._gameHookBase!
        const mapperRes = await fetch(`${base}/mapper`)
        if (mapperRes.status !== 200) {
            this._deconstructMapper()
            let body: any = null
            try { body = await mapperRes.json() } catch { /* not JSON either */ }
            if (body) throw body
            throw new Error('Unknown error.')
        }
        const info = await mapperRes.json() as { id: string; name: string; platform: string; nativeProcessor: string; custom: boolean }

        // `/mapper` does not say which mapper *key* (e.g. "gba/pokemon_emerald.xml", or
        // a "custom/..." path) is loaded at our instance; `/mappers` is the only route
        // that ties a key to the instance indexes that have it loaded.
        const index = gameHookInstanceIndex(base)
        let key = info.id
        try {
            const mappersRes = await fetch(`${this._origin()}/mappers`)
            if (mappersRes.ok) {
                const mappers = await mappersRes.json() as { value: string; instances: number[] }[]
                const entry = Array.isArray(mappers) ? mappers.find((m) => Array.isArray(m.instances) && m.instances.includes(index)) : undefined
                if (entry?.value) key = entry.value
            }
        } catch (err) {
            console.warn("[GameHook Client] Could not read /mappers; falling back to /mapper's id as the key:", err)
        }

        const meta = {
            id: info.id,
            gameName: info.name,
            gamePlatform: info.platform,
            // The overlay's generation detection matches this against patterns written
            // for PokeAByte's own "custom/..." paths (main.ts, games/*/manifest.ts).
            path: gameHookMetaPath(key),
            key,
            nativeProcessor: info.nativeProcessor,
            custom: info.custom,
        }

        const treeRes = await fetch(`${base}/properties`)
        const tree = treeRes.ok ? await treeRes.json() : {}
        const leaves = flattenGameHookTree(tree)

        const properties = await mapWithConcurrency(leaves, 16, async ({ path, value }): Promise<GamehookPropertyData> => {
            try {
                const detailRes = await fetch(`${base}/properties/${encodeGameHookPath(path)}`)
                if (!detailRes.ok) throw new Error(String(detailRes.status))
                const d = await detailRes.json()
                return {
                    path,
                    memoryContainer: null,
                    address: d.address ?? null,
                    length: d.length ?? 0,
                    type: d.type,
                    size: null,
                    reference: d.reference ?? null,
                    bits: d.bits ?? null,
                    description: null,
                    value: d.value,
                    bytes: d.bytes ?? [],
                    isFrozen: false,
                    isReadOnly: false,
                    fieldsChanged: [],
                }
            } catch {
                // The detail fetch failed (a transient error, or a path `/properties`
                // named that `/properties/{path}` does not recognise); keep the
                // property with the value the tree already gave it rather than
                // dropping it from the mapper.
                return {
                    path,
                    memoryContainer: null,
                    address: null,
                    length: 0,
                    type: gameHookGuessType(value),
                    size: null,
                    reference: null,
                    bits: null,
                    description: null,
                    value,
                    bytes: [],
                    isFrozen: false,
                    isReadOnly: false,
                    fieldsChanged: [],
                }
            }
        })

        return { meta, glossary: null, properties }
    }

    /**
     * The minute refresh in GameHook mode: no full-detail endpoint to re-fetch, so
     * this takes GameHook's values-only `/properties` tree and applies each path's new
     * value onto the existing property, deep-compared exactly as `refreshMapper`
     * compares a bitArray or struct value from PokeAByte, and firing no handlers -- the
     * 2 s mapper poll and the update socket are what the app actually reacts to. A path
     * set that does not match the loaded tree can only mean the mapper changed
     * underneath the poll, so it falls back to a full `loadMapper()`.
     */
    async _refreshGameHookMapper() {
        const base = this._gameHookBase!
        const res = await fetch(`${base}/properties`)
        if (!res.ok) throw new Error(`GameHook /properties refresh failed: ${res.status}`)
        const tree = await res.json()
        const leaves = flattenGameHookTree(tree)
        const map = this._propertiesMap
        const samePathSet = !!map && map.size === leaves.length && leaves.every(({ path }) => map!.has(path))
        if (!samePathSet) return this.loadMapper()

        for (const { path, value } of leaves) {
            const property = map!.get(path)!
            const dto = snapshotProperty(property)
            dto.value = value
            applyPropertyFields(property, dto, true)
        }

        this._scheduleRefresh()

        return this
    }

    /**
     * The once-a-minute resync the reference GameHook client did by calling
     * `loadMapper()` again (docs/performance-followups.md B). PokeAByte pushes
     * `MapperLoaded` when the mapper changes and a lost connection reloads on
     * reconnect, so the refresh only ever confirms what `PropertiesChanged` already
     * delivered -- but a full reload replaced every property object and reassigned
     * `properties`, which re-rendered the whole overlay each minute and left any
     * property object a component had cached pointing at the old tree.
     *
     * Now the fetched values are written onto the *existing* objects, field by field
     * and only where they differ, like a `PropertiesChanged` batch but without the
     * change handlers (the old refresh fired none either). The tree, `properties`
     * and the debounce map are untouched, so nothing re-renders unless a value really
     * moved. A document whose property set differs from the loaded one -- which only a
     * mapper change could produce, and that comes with its own `MapperLoaded` -- falls
     * back to the full rebuild.
     */
    async refreshMapper() {
        if (this._mode === "gamehook") return this._refreshGameHookMapper()

        const mapper = await this._fetchMapper()
        const map = this._propertiesMap
        const dtos: GamehookPropertyData[] = mapper.properties ?? []
        const samePropertySet = !!map && map.size === dtos.length && dtos.every(x => map.has(x.path))
        if (!samePropertySet) return this.loadMapper()

        for (const dto of dtos) applyPropertyFields(map!.get(dto.path)!, dto, true)
        // `meta` is a handful of fields and `main.ts` depends on it, so it is compared;
        // the glossary (thousands of entries on the DS mappers) only changes with the
        // mapper, which arrives as a `MapperLoaded` and a full `loadMapper()`.
        if (JSON.stringify(mapper.meta) !== JSON.stringify(toRaw(this.meta))) this.meta = mapper.meta

        this._scheduleRefresh()

        return this
    }

    async _establishConnection() {
        // A retry or reconnect that lands after disconnect() has nothing to connect.
        if (this._stopping) return false
        try {
            // Detected fresh on every attempt, including a retry: the tool at
            // `_connectionString` could have changed between one attempt and the next
            // (PokeAByte closed, GameHook opened in its place, or vice versa).
            this._mode = await this._detectTool()

            if (this._mode === "gamehook") {
                this._gameHookBase = this._gameHookInstanceBase()
                const socket = await this._connectGameHookSocket()
                socket.onmessage = (ev) => this._handleGameHookMessage(ev)

                this.connected = true
                this.onConnected()
                console.debug('[GameHook Client] GameHook is now connected.')
            } else {
                if (this._signalrConnectionEstablished == false && this._signalrClient) {
                    await this._signalrClient.start()
                    console.debug('[GameHook Client] GameHook successfully established a SignalR connection.')
                }

                this.connected = true
                this.onConnected()
                console.debug('[GameHook Client] GameHook is now connected.')
            }

            try {
                await this.loadMapper();
                this.onMapperLoaded();
            } catch {}

            this._startDebounceLoop()
            if (this._mode === "gamehook") this._startGameHookPoll()
            return true
        } catch (err) {
            this._deconstructMapper()
            this._stopGameHookPoll()
            if (this._gameHookSocket) {
                const dead = this._gameHookSocket
                this._gameHookSocket = null
                try { dead.close() } catch { /* already going away */ }
            }

            console.error(err)
            this.onMapperLoadError(err)

            this._retryTimer = setTimeout(() => {
                this._retryTimer = null
                if (!this._stopping) this._establishConnection()
            }, 5000)

            return false
        }
    }

    /**
     * Opens the GameHook update socket and resolves once it is actually open, the way
     * `await this._signalrClient.start()` resolves once PokeAByte's hub handshake is
     * done -- a socket that never opens (GameHook down, or a 409 while continuous read
     * is off) rejects into `_establishConnection`'s usual failure/5 s retry instead of
     * being reported as connected. `this._gameHookSocket` is set here, before resolving,
     * so a close racing the caller's own bookkeeping is never mistaken for a stale one.
     */
    _connectGameHookSocket(): Promise<WebSocket> {
        return new Promise((resolve, reject) => {
            const socket = new WebSocket(gameHookSocketUrl(this._gameHookBase!))
            let settled = false
            socket.onopen = () => {
                settled = true
                this._gameHookSocket = socket
                resolve(socket)
            }
            socket.onerror = () => {
                if (!settled) {
                    settled = true
                    reject(new Error('GameHook: the update socket failed to connect.'))
                }
            }
            socket.onclose = () => {
                if (!settled) {
                    settled = true
                    reject(new Error('GameHook: the update socket closed before connecting.'))
                    return
                }
                this._onGameHookSocketClosed(socket)
            }
        })
    }

    /**
     * A GameHook update socket closing on its own -- the instance was removed,
     * continuous read was switched off, or the process went away -- handled exactly as
     * the SignalR transport's own `onclose` is: tear the mapper down, tell the app, and
     * try again through `_establishConnection` (which arms the usual 5 s retry if that
     * reconnect itself fails). A socket `disconnect()` closed on purpose has already
     * been cleared from `_gameHookSocket`, so it is not mistaken for a lost connection.
     */
    _onGameHookSocketClosed(socket: WebSocket) {
        if (this._gameHookSocket !== socket) return
        this._gameHookSocket = null
        if (this._stopping) return
        console.debug('[GameHook Client] GameHook connection lost. Attempting to reconnect...')

        this._stopGameHookPoll()
        this._deconstructMapper()
        this.onDisconnected()
        this.connected = false

        void this._establishConnection()
    }

    /**
     * One update frame: a JSON array of `{path, value, bytes}` for whatever changed
     * since the last read, no envelope. Turned into full DTOs and handed to the same
     * batch handler `PropertiesChanged` uses, so debounce, `.change()`/`.once()` and the
     * Cutter probe's received-batch count all behave identically either way. A frame
     * with nothing this client recognises still reaches the handler as an empty batch,
     * which still counts as received.
     */
    _handleGameHookMessage(ev: MessageEvent) {
        let entries: { path: string; value: unknown; bytes?: number[] }[] = []
        try {
            const data = typeof ev.data === "string" ? ev.data : String(ev.data)
            const parsed = JSON.parse(data)
            if (Array.isArray(parsed)) entries = parsed
        } catch (err) {
            console.warn('[GameHook Client] Unparsable update frame:', err)
        }
        this._handlePropertiesChanged(this._gameHookEntriesToDtos(entries))
    }

    /**
     * GameHook's push carries only what changed; `applyPropertyFields` assigns every
     * field in `UPDATED_FIELDS`, so a partial DTO would wipe a property's `address`,
     * `length` and the rest. Each entry becomes a snapshot of the property's current
     * fields with `value`/`bytes` replaced, and `fieldsChanged` computed by comparing
     * against what the property already holds, deep for arrays/objects -- GameHook does
     * not say which of its own fields moved. An entry whose path matches no loaded
     * property is dropped rather than guessed at.
     */
    _gameHookEntriesToDtos(entries: { path: string; value: unknown; bytes?: number[] }[]): GamehookPropertyData[] {
        const dtos: GamehookPropertyData[] = []
        for (const entry of entries) {
            if (!entry || typeof entry.path !== "string") continue
            const property = this._propertiesMap?.get(entry.path)
            if (!property) continue
            const nextBytes = entry.bytes ?? []
            const raw = toRaw(property) as GameHookProperty
            const fieldsChanged: string[] = []
            if (!gameHookValuesEqual(raw.value, entry.value)) fieldsChanged.push("value")
            if (!sameBytes(raw.bytes, nextBytes)) fieldsChanged.push("bytes")
            const dto = snapshotProperty(property)
            dto.value = entry.value
            dto.bytes = nextBytes
            dto.fieldsChanged = fieldsChanged
            dtos.push(dto)
        }
        return dtos
    }

    /** GameHook has no `MapperLoaded`/`InstanceReset`; this notices the same things by asking every 2 s. */
    _startGameHookPoll() {
        this._stopGameHookPoll()
        this._gameHookPollTimer = setInterval(() => { void this._pollGameHookMapper() }, 2000)
    }

    _stopGameHookPoll() {
        if (this._gameHookPollTimer !== null) {
            clearInterval(this._gameHookPollTimer)
            this._gameHookPollTimer = null
        }
    }

    async _pollGameHookMapper() {
        if (this._mode !== "gamehook" || !this._gameHookBase || this._stopping) return
        try {
            const res = await fetch(`${this._gameHookBase}/mapper`)
            if (res.status === 404) {
                if (this.mapperLoaded) {
                    this._deconstructMapper()
                    this.onMapperUnloaded()
                }
                return
            }
            if (!res.ok) return // An unexpected status: leave things as they are and try again next tick.
            const info = await res.json() as { id: string }
            const currentId = (this.meta as { id?: string } | null)?.id
            if (!this.mapperLoaded || info.id !== currentId) {
                await this.loadMapper()
                this.onMapperLoaded()
            }
        } catch (err) {
            console.warn('[GameHook Client] Mapper poll failed:', err)
        }
    }

    async connect() {
        var that = this
        this._stopping = false

        this._signalrClient = new HubConnectionBuilder()
            .withUrl(`${this._connectionString}/updates`)
            .configureLogging(LogLevel.Warning)
            .build()

        this._signalrClient.onclose(async () => {
            // A stop `disconnect()` asked for: nothing to recover, and reconnecting here
            // would set `connected` again and start the loop on a client being torn down.
            if (that._stopping) return
            console.debug('[GameHook Client] SignalR connection lost. Attempting to reconnect...')

            this._deconstructMapper()

            this.onDisconnected()
            this.connected = false

            await this._establishConnection()
        })

        this._signalrClient.on('PropertiesChanged', (propertiesChanged) => {
            that._handlePropertiesChanged(propertiesChanged)
        })

        function debouce() {
            // The map is null until a mapper is loaded (and again after it unloads);
            // the walk is over a raw Map (A), not a reactive iterator.
            const debounceMap = that._debouceMap
            if (debounceMap) {
                for (const value of debounceMap.values()) {
                    if (value.timeoutFrames > 0) {
                        value.timeoutFrames--
                    } else if (value.timeoutFrames === 0) {
                        that._updateProperty(value.newProperty)
                        value.timeoutFrames = -1
                    }
                }
            }
            if (that.connected === true)
                requestAnimationFrame(debouce)
            else
                that._debounceLoopRunning = false
        }
        this._debounceTick = debouce

        this._signalrClient.on('MapperLoaded', async () => { 
            try {
                await this.loadMapper(); 
                this.onMapperLoaded() 
            } catch {}
        });
        this._signalrClient.on('InstanceReset', () => { this.onMapperUnloaded() });
        this._signalrClient.on('Error', () => { });
        this._signalrClient.on('Hello', () => { });


        // A successful `_establishConnection()` has started the loop; this is the
        // no-op the first connection always was, kept so the flow reads as before.
        const result = await this._establishConnection()
        if (result === true) this._startDebounceLoop()
        return result
    }

    /**
     * Applies one already-full DTO to its property and fires `.change()`/`.once()`
     * and the global `onPropertyChanged`, exactly as the inline closure this was lifted
     * from did (plan: shared between the SignalR `PropertiesChanged` handler, the
     * debounce loop, and the GameHook update socket).
     */
    _updateProperty(propertyChanged: GamehookPropertyData) {
        let property = this._propertiesMap?.get(propertyChanged.path);
        if (!property) {
            return;
        }

        // Handlers receive the pre-update snapshot; it is taken off the raw
        // object, and the fields are written only where they differ (A, H).
        let oldProperty = snapshotProperty(property)
        applyPropertyFields(property, propertyChanged)

        // Only trigger the property's change events when
        // the value has changed.

        // This is functionally 'weird', but users are really
        // only interested in when the value changed.

        // If they need to know about other fields changing,
        // they can register to the global GameHook event handler.

        if (propertyChanged.fieldsChanged.includes('value')) {
            // Trigger the property.change events if any.
            const changeArray = this._change[property.path]
            if (changeArray && changeArray.length > 0) {
                changeArray.forEach(x => {
                    x(property, oldProperty)
                })
            }

            // Trigger the property.once events if any.
            const onceArray = this._once[property.path]
            if (onceArray && onceArray.length > 0) {
                onceArray.forEach(x => {
                    x(property, oldProperty)
                })

                this._once[property.path] = []
            }
        }

        // Trigger the global property changed event.
        if (this.onPropertyChanged) {
            this.onPropertyChanged(property, oldProperty, propertyChanged.fieldsChanged)
        }
    }

    /**
     * One batch of already-full DTOs, applied or handed to the debounce map -- the body
     * of the inline `PropertiesChanged` handler this was lifted from, unchanged, so
     * PokeAByte's SignalR push and GameHook's update socket behave identically once
     * each has turned its own wire format into this shape. Counts as a received batch
     * (`_receivedBatches`) even when `propertiesChanged` is empty, which is what lets
     * the Cutter probe count a GameHook frame that named no property this client knows.
     */
    _handlePropertiesChanged(propertiesChanged: GamehookPropertyData[]) {
        try {
            if (this._properties && this._properties.length > 0) {
                // What arrived, before any debounce holds it back: the evidence
                // the Cutter editor's export waits on (cutterProbe below).
                if (this._received) {
                    this._receivedBatches++
                    for (const changed of propertiesChanged) {
                        if (changed && changed.path) this._received.set(changed.path, changed.bytes ?? null)
                    }
                }
                for (const propertyChanged of propertiesChanged) {
                    let property = this._propertiesMap?.get(propertyChanged.path)
                    if (!property) {
                        console.warn(`[GameHook Client] Could not find a related property in PropertyUpdated event for: ${propertyChanged.path}`)
                        // Was `return`, which dropped the rest of the batch on the
                        // floor -- a stale batch racing a mapper reload, or one path
                        // the loaded tree lacks, left every later property unapplied.
                        continue
                    }
                    const debounced = this._debouceMap?.get(propertyChanged.path)
                    if (debounced) {
                        debounced.timeoutFrames = this._debouceTimeout
                        debounced.newProperty = propertyChanged
                    } else {
                        this._updateProperty(propertyChanged)
                    }
                }
            } else {
                console.debug('[GameHook Client] Mapper is not loaded, throwing away PropertiesChanged event.')
            }
        } catch (e) {
            console.error(e);
        }
    }

    /** Starts the debounce frame loop if connected and no chain of it is running. */
    _startDebounceLoop() {
        if (!this.connected || this._debounceLoopRunning || !this._debounceTick) return
        this._debounceLoopRunning = true
        this._debounceTick()
    }

    // The three write paths are gen4's (plan 3.3): a failed write is a console.warn
    // with PokeAByte's status and detail, not a thrown 'Unknown error' that no caller
    // caught (gen1/2/3/5 let it surface as an unhandled rejection). The first-dot
    // path replace stays: PokeAByte normalises both forms (known-legacy-bugs.md #24).
    async _editPropertyValue(path, value, freeze) {
        if (this._mode === "gamehook") return this._gameHookEditPropertyValue(path, value, freeze)

        path = path.replace('.', '/')

        const response = await fetch(`${this._connectionString}/mapper/set-property-value/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, value, freeze })
        })

        if (!response.ok) {
            const detail = await response.text().catch(() => '')
            console.warn(`[GameHook Client] Failed to set ${path} = ${value}: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ''}`)
        }
    }

    async _editPropertyBytes(path, bytes, freeze) {
        if (this._mode === "gamehook") return this._gameHookEditPropertyBytes(path, bytes, freeze)

        path = path.replace('.', '/')

        const response = await fetch(`${this._connectionString}/mapper/set-property-bytes/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, bytes, freeze })
        })

        if (!response.ok) {
            const detail = await response.text().catch(() => '')
            console.warn(`[GameHook Client] Failed to set bytes for ${path}: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ''}`)
        }
    }

    /** GameHook's write route: `POST {base}/properties/{path}` with exactly `{value}`. There is no freeze endpoint. */
    async _gameHookEditPropertyValue(path: string, value: any, freeze?: boolean) {
        if (freeze) console.warn('[GameHook Client] GameHook has no freeze endpoint; writing the value without freezing.')

        const response = await fetch(`${this._gameHookBase}/properties/${encodeGameHookPath(path)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value })
        })

        if (!response.ok) {
            const detail = await response.text().catch(() => '')
            console.warn(`[GameHook Client] Failed to set ${path} = ${value}: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ''}`)
        }
    }

    /** GameHook's write route with exactly `{bytes}`. There is no freeze endpoint. */
    async _gameHookEditPropertyBytes(path: string, bytes: number[], freeze?: boolean) {
        if (freeze) console.warn('[GameHook Client] GameHook has no freeze endpoint; writing the bytes without freezing.')

        const response = await fetch(`${this._gameHookBase}/properties/${encodeGameHookPath(path)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bytes })
        })

        if (!response.ok) {
            const detail = await response.text().catch(() => '')
            console.warn(`[GameHook Client] Failed to set bytes for ${path}: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ''}`)
        }
    }

    //For setting multiple bits within the same byte at the same time
    async setBits(propertyArray) {
        if (this._mode === "gamehook") return this._gameHookSetBits(propertyArray)

        const modifiedArray = propertyArray.map(item => ({
            ...item,
            path: item.path.replace(/\./g, '/')
        }));

        const response = await fetch(`${this._connectionString}/mapper/set-properties-by-bits/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(modifiedArray)
        })

        if (!response.ok) {
            const detail = await response.text().catch(() => '')
            console.warn(`[GameHook Client] Failed to set bits: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ''}`)
        }
    }

    /**
     * GameHook has no set-properties-by-bits endpoint -- no way to merge several
     * partial-byte writes into one so they land together without one clobbering
     * another. The nearest honest equivalent: write each item's value to its own path
     * in order, exactly as `_editPropertyValue` does. Unlike PokeAByte's endpoint this
     * is not atomic across items and carries no `bits` field (GameHook has no notion of
     * a partial-byte write), so a multi-item call that fails partway leaves some paths
     * written and others not -- a caller that relies on both landing together (gen1's
     * `starterDvs.ts`, gen2's manual DV writes) should treat GameHook as unsupported for
     * that write until GameHook grows a real by-bits route.
     */
    async _gameHookSetBits(propertyArray: { path: string; value: any; freeze?: boolean }[]) {
        for (const item of propertyArray) {
            try {
                await this._gameHookEditPropertyValue(item.path, item.value, item.freeze)
            } catch (err) {
                console.warn(`[GameHook Client] Failed to set bits for ${item.path}:`, err)
            }
        }
    }

    /**
     * gen3's: stop the SignalR connection and drop the mapper (plan 3.3). The legacy
     * gen3 called it from `beforeunload` so a reload did not leave PokeAByte a dangling
     * hub connection; main.ts does the same for every generation.
     */
    async disconnect() {
        this._stopping = true;
        this.connected = false;
        // The armed 5 s retry (PokeAByte was down) and the frame loop's tick die with the
        // client: a later _startDebounceLoop() finds no tick, a later retry finds _stopping.
        if (this._retryTimer) {
            clearTimeout(this._retryTimer);
            this._retryTimer = null;
        }
        this._debounceTick = null;
        // GameHook's poll and socket die with the client too: a later poll tick finds
        // _stopping, and clearing `_gameHookSocket` before closing it means the close
        // event below is never mistaken for a lost connection by `_onGameHookSocketClosed`.
        this._stopGameHookPoll();
        if (this._gameHookSocket) {
            const socket = this._gameHookSocket;
            this._gameHookSocket = null;
            try {
                socket.close();
            } catch (err) {
                console.warn('[GameHook Client] Error closing the GameHook update socket:', err);
            }
        }
        if (this._signalrClient) {
            try {
                await this._signalrClient.stop();
                console.debug('[GameHook Client] SignalR connection stopped.');
            } catch (err) {
                console.warn('[GameHook Client] Error stopping SignalR connection:', err);
            }
            this._signalrClient = null;
        }
        this._deconstructMapper();
    }

    /**
     * Drops every `.change()` / `.once()` subscription. The shell calls this when the
     * mapper unloads (`InstanceReset`): every subscriber lives in the overlay tree it
     * unmounts at that moment, and the next mount registers its own. It is *not* part
     * of `_deconstructMapper()`, which also runs on a SignalR reconnect -- there the
     * overlay stays mounted and the legacy handlers survived, keyed by path, to fire
     * on the reloaded properties.
     */
    clearSubscriptions() {
        this._change = markRaw({});
        this._once = markRaw({});
    }

    onConnected() { /* Override this with your own function. */ }
    onDisconnected() { /* Override this with your own function. */ }

    onMapperLoaded() { /* Override this with your own function. */ }
    onMapperUnloaded() { /* Override this with your own function. */ }
    onMapperLoadError: (err: any) => void = () => { }
    onPropertyChanged: (property: GameHookProperty, oldProperty: GamehookPropertyData, fieldsChanged: string[]) => void
        = () => {};
}