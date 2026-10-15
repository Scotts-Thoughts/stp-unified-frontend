import type { ShortcutCatalog, ShortcutEdit, ShortcutRow } from "../../../shared/shortcuts";
import { getUserState, loadUserState, setUserState } from "../persistence/userState";
import { normalizeAccelerator, refusalReason } from "./accelerators";
import type { ShortcutAction } from "./types";

/**
 * The shortcut engine (docs/shortcuts-menu-plan.md §4.2): binds one generation's actions
 * to keys, registers those keys with main, runs an action when its key is pressed, and
 * applies the Keyboard Shortcuts window's edits.
 *
 * Bindings are stored per generation in `user_state.json` under `shortcuts`, as changes
 * from the defaults only: `{ [actionId]: accelerator | null }`, null meaning "default
 * cleared". Nothing is written until the user changes something -- a write on mount would
 * show up in every harness run (oracle 4).
 *
 * Only one generation is bound at a time. The shell binds gen1's actions (on the box-art
 * screen too, as the F-keys always were); a lifted overlay binds its own from `mounted`.
 * The latest `bindShortcuts` wins, and an unbind only clears what it bound.
 */

const STORAGE_KEY = "shortcuts";

type Overrides = Record<string, string | null>;

export interface BindOptions {
    actions: ShortcutAction[];
    /** The `user_state.json` section the bindings live in: the module id. */
    namespace: string;
    /** The window's heading: "Generation 1". */
    title: string;
    /** False on the box-art screen. */
    gameLoaded: boolean;
}

interface Bound extends BindOptions {
    token: object;
    overrides: Overrides;
    byAccelerator: Map<string, ShortcutAction>;
    rows: ShortcutRow[];
}

let current: Bound | null = null;
let listening = false;

/** The action every generation has: open this menu. Unbound by default. */
const openMenuAction: ShortcutAction = {
    id: "app.open_shortcuts_menu",
    label: "Open the Keyboard Shortcuts window",
    group: "App",
    run: () => openShortcutsMenu(),
};

/** Opens (or focuses) the Keyboard Shortcuts window. */
export function openShortcutsMenu(): void {
    window.api?.shortcuts?.openMenu();
}

function api() {
    return window.api?.shortcuts;
}

function readOverrides(namespace: string): Overrides {
    const stored = getUserState<unknown>(STORAGE_KEY, null, namespace);
    const overrides: Overrides = {};
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return overrides;
    for (const [id, value] of Object.entries(stored as Record<string, unknown>)) {
        if (value === null) overrides[id] = null;
        else if (typeof value === "string") {
            const normalized = normalizeAccelerator(value);
            if (normalized) overrides[id] = normalized;
        }
    }
    return overrides;
}

function defaultOf(action: ShortcutAction): string | null {
    return normalizeAccelerator(action.defaultShortcut ?? null);
}

function bindingOf(bound: Bound, action: ShortcutAction): string | null {
    return action.id in bound.overrides ? bound.overrides[action.id] : defaultOf(action);
}

function isAvailable(action: ShortcutAction): boolean {
    if (!action.available) return true;
    try {
        return action.available() !== false;
    } catch {
        return false;
    }
}

/** Works out the key map, registers it with main and publishes the catalog. */
function apply(bound: Bound): void {
    bound.byAccelerator = new Map();
    bound.rows = bound.actions.map((action) => {
        const binding = bindingOf(bound, action);
        let conflict = false;
        if (binding) {
            if (bound.byAccelerator.has(binding)) conflict = true;
            else bound.byAccelerator.set(binding, action);
        }
        return {
            id: action.id,
            label: action.label,
            group: action.group,
            binding,
            defaultBinding: defaultOf(action),
            available: true,
            conflict,
        };
    });
    api()?.register([...bound.byAccelerator.keys()]);
    publish(bound);
}

function publish(bound: Bound): void {
    const byId = new Map(bound.actions.map((a) => [a.id, a]));
    const catalog: ShortcutCatalog = {
        title: bound.title,
        namespace: bound.namespace,
        gameLoaded: bound.gameLoaded,
        rows: bound.rows.map((row) => ({ ...row, available: isAvailable(byId.get(row.id)!) })),
    };
    api()?.publishCatalog(catalog);
}

function persist(bound: Bound): void {
    const value = Object.keys(bound.overrides).length > 0 ? { ...bound.overrides } : null;
    setUserState(STORAGE_KEY, value, bound.namespace);
}

/** Records `binding` for `id` as an override, or drops the override when it is the default. */
function setOverride(bound: Bound, action: ShortcutAction, binding: string | null): void {
    if (binding === defaultOf(action)) delete bound.overrides[action.id];
    else bound.overrides[action.id] = binding;
}

/** Unbinds every action other than `except` that is on `accelerator`. */
function releaseKey(bound: Bound, accelerator: string, except: string): void {
    for (const other of bound.actions) {
        if (other.id !== except && bindingOf(bound, other) === accelerator) setOverride(bound, other, null);
    }
}

function applyEdit(edit: ShortcutEdit): void {
    const bound = current;
    if (!bound) return;
    const action = "id" in edit ? bound.actions.find((a) => a.id === edit.id) : undefined;
    switch (edit.type) {
        case "set": {
            if (!action) return;
            const accelerator = normalizeAccelerator(edit.accelerator);
            if (!accelerator || refusalReason(accelerator)) return;
            const holder = bound.actions.find((a) => a.id !== action.id && bindingOf(bound, a) === accelerator);
            if (holder && !edit.steal) return;
            releaseKey(bound, accelerator, action.id);
            setOverride(bound, action, accelerator);
            break;
        }
        case "clear":
            if (!action) return;
            setOverride(bound, action, null);
            break;
        case "reset": {
            if (!action) return;
            const fallback = defaultOf(action);
            if (fallback) releaseKey(bound, fallback, action.id);
            delete bound.overrides[action.id];
            break;
        }
        case "reset-all":
            bound.overrides = {};
            break;
        default:
            return;
    }
    persist(bound);
    apply(bound);
}

function onPressed(accelerator: string): void {
    const action = current?.byAccelerator.get(accelerator);
    if (!action || !isAvailable(action)) return;
    try {
        const result = action.run();
        if (result instanceof Promise) result.catch((err) => console.error(`[shortcuts] ${action.id}:`, err));
    } catch (err) {
        console.error(`[shortcuts] ${action.id}:`, err);
    }
}

function listen(): void {
    if (listening) return;
    const shortcuts = api();
    if (!shortcuts) return;
    listening = true;
    shortcuts.onPressed(onPressed);
    shortcuts.onEdit(applyEdit);
    shortcuts.onRefresh(() => {
        if (current) publish(current);
    });
}

/**
 * Binds a generation's actions; returns the unbind. The app-wide "open this window"
 * action is added to every list.
 */
export function bindShortcuts(options: BindOptions): () => void {
    const token = {};
    let cancelled = false;
    const actions = [...options.actions, openMenuAction];
    // Bindings are user state: wait for the file (a no-op once it is loaded).
    void loadUserState().then(() => {
        if (cancelled) return;
        listen();
        current = {
            ...options,
            actions,
            token,
            overrides: readOverrides(options.namespace),
            byAccelerator: new Map(),
            rows: [],
        };
        apply(current);
    });
    return () => {
        cancelled = true;
        if (current?.token !== token) return;
        current = null;
        api()?.register([]);
    };
}
