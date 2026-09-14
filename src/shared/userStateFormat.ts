/**
 * The shape of `data/user_state.json`, shared by the renderer that reads and writes it
 * (`core/persistence/userState.ts`) and the main process that seeds it from the legacy
 * apps' `localStorage` on first launch (`main/importLegacy.ts`, plan 2.6).
 *
 * Format 2 is one section per generation plus a global one: each legacy app had its
 * own `localStorage`, and the lifted components read their keys verbatim (gen4 and
 * gen5 both keep `starter` and `selected_game`, in different vocabularies). Two things
 * are global because they should be shared: the OBS url and password, and the
 * `enemyScale_<Species>` overrides (a species is the same species across games). A
 * file from before the namespaces -- one flat object -- reads as gen1's section plus
 * the globals, which is what it was.
 */
export const USER_STATE_FORMAT = 2;
export const GLOBAL_NAMESPACE = "global";

export type UserStateSections = Record<string, Record<string, unknown>>;

/**
 * Keys every generation shares; everything else is per generation. `selected_generation`
 * is the box-art grid's one highlighted tile (components/GameSelect.vue): which
 * generation's stored edition the user picked last. `shuckie_bookmarks` is the switch for
 * the Super Shuckie bookmark at every chapter marker (core/logic/shuckieBookmarks.ts).
 */
export function isGlobalKey(key: string): boolean {
    return key === "obs_websocket_url" || key === "obs_websocket_password" || key === "selected_generation" || key === "shuckie_bookmarks" || key.startsWith("enemyScale_");
}

/** Turns the parsed file into sections: format 2 as is; a flat pre-namespace file as gen1's plus the globals. */
export function parseUserStateFile(parsed: unknown): UserStateSections {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const record = parsed as Record<string, unknown>;
    if (record.format === USER_STATE_FORMAT) {
        const sections: UserStateSections = {};
        for (const [name, value] of Object.entries(record)) {
            if (name === "format") continue;
            if (value && typeof value === "object" && !Array.isArray(value)) sections[name] = value as Record<string, unknown>;
        }
        return sections;
    }
    const global: Record<string, unknown> = {};
    const gen1: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) (isGlobalKey(key) ? global : gen1)[key] = value;
    return { [GLOBAL_NAMESPACE]: global, gen1 };
}

/** The file's text for a set of sections. */
export function serializeUserState(sections: UserStateSections): string {
    return JSON.stringify({ format: USER_STATE_FORMAT, ...sections }, null, 4);
}
