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
    address: number,
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

    constructor(connectionString = 'http://localhost:8085') {
        this._connectionString = connectionString

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

    async loadMapper() {
        console.debug('[GameHook Client] Loading mapper.')

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

        let mapper = await this._fetchMapper()

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
            if (this._signalrConnectionEstablished == false && this._signalrClient) {
                await this._signalrClient.start()
                console.debug('[GameHook Client] GameHook successfully established a SignalR connection.')
            }

            this.connected = true
            this.onConnected()
            console.debug('[GameHook Client] GameHook is now connected.')

            try {
                await this.loadMapper(); 
                this.onMapperLoaded();
            } catch {}

            this._startDebounceLoop()
            return true
        } catch (err) {
            this._deconstructMapper()

            console.error(err)
            this.onMapperLoadError(err)

            this._retryTimer = setTimeout(() => {
                this._retryTimer = null
                if (!this._stopping) this._establishConnection()
            }, 5000)

            return false
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

        function updateProperty(propertyChanged) {
            let property = that._propertiesMap?.get(propertyChanged.path);
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
                const changeArray = that._change[property.path]
                if (changeArray && changeArray.length > 0) {
                    changeArray.forEach(x => {
                        x(property, oldProperty)
                    }) 
                }

                // Trigger the property.once events if any.
                const onceArray = that._once[property.path]
                if (onceArray && onceArray.length > 0) {
                    onceArray.forEach(x => {
                        x(property, oldProperty)
                    })

                    that._once[property.path] = []
                }
            }

            // Trigger the global property changed event.
            if (that.onPropertyChanged) {
                that.onPropertyChanged(property, oldProperty, propertyChanged.fieldsChanged)
            }
        }

        this._signalrClient.on('PropertiesChanged', (propertiesChanged) => {
            try {       
                if (that._properties && that._properties.length > 0) {
                    for (const propertyChanged of propertiesChanged) {
                        let property = that._propertiesMap?.get(propertyChanged.path)
                        if (!property) {
                            console.warn(`[GameHook Client] Could not find a related property in PropertyUpdated event for: ${propertyChanged.path}`)
                            // Was `return`, which dropped the rest of the batch on the
                            // floor -- a stale batch racing a mapper reload, or one path
                            // the loaded tree lacks, left every later property unapplied.
                            continue
                        }
                        const debounced = that._debouceMap?.get(propertyChanged.path)
                        if (debounced) {
                            debounced.timeoutFrames = that._debouceTimeout
                            debounced.newProperty = propertyChanged
                        } else {
                            updateProperty(propertyChanged)
                        }
                    }
                } else {
                    console.debug('[GameHook Client] Mapper is not loaded, throwing away PropertiesChanged event.')
                }
            } catch (e) {
                console.error(e);
            }
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
                        updateProperty(value.newProperty)
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

    //For setting multiple bits within the same byte at the same time
    async setBits(propertyArray) {
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