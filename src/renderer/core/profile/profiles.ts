/**
 * Player profiles (move-stats spec §4.5): one file each in
 * `<userData>/data/profiles/<id>.json`, read and written through main's file IPC
 * like the rest of the user data (so the Report zip takes them too). The active
 * profile's id is the global user-state key `active_profile`.
 *
 * Nothing is written until the user makes a profile or the router reports a battle,
 * so a start with no router changes no file.
 */
import { reactive } from "vue";
import { getUserState, setUserState } from "../persistence/userState";
import { DEFAULT_PICTURE } from "./pictures";
import { normaliseProfile, PROFILE_FORMAT, removeRun, type Profile } from "./merge";

const FOLDER = "profiles";
const ACTIVE_KEY = "active_profile";

export const profileState = reactive({
    loaded: false,
    profiles: [] as Profile[],
    activeId: null as string | null,
});

let loading: Promise<void> | null = null;

function fileFor(id: string): string {
    return `${FOLDER}/${id}.json`;
}

function newId(): string {
    return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Reads every profile file once; later calls wait for the first. */
export function loadProfiles(): Promise<void> {
    loading ??= (async () => {
        const found: Profile[] = [];
        try {
            const entries = await window.api.data.list(FOLDER);
            for (const entry of entries) {
                if (entry.directory || !entry.name.endsWith(".json")) continue;
                try {
                    const raw = await window.api.data.read(`${FOLDER}/${entry.name}`);
                    const profile = raw ? normaliseProfile(JSON.parse(raw)) : null;
                    if (profile) found.push(profile);
                } catch (err) {
                    console.warn(`[profiles] could not read ${FOLDER}/${entry.name}:`, err);
                }
            }
        } catch (err) {
            console.warn("[profiles] could not list the profiles folder:", err);
        }
        found.sort((a, b) => a.created.localeCompare(b.created) || a.name.localeCompare(b.name));
        profileState.profiles = found;
        const stored = getUserState<string | null>(ACTIVE_KEY, null);
        profileState.activeId = found.some((p) => p.id === stored) ? stored : (found[0]?.id ?? null);
        profileState.loaded = true;
    })();
    return loading;
}

export function activeProfile(): Profile | null {
    return profileState.profiles.find((p) => p.id === profileState.activeId) ?? null;
}

export async function saveProfile(profile: Profile): Promise<void> {
    await window.api.data.write(fileFor(profile.id), JSON.stringify(profile, null, 2));
}

export function setActiveProfile(id: string): void {
    if (!profileState.profiles.some((p) => p.id === id)) return;
    profileState.activeId = id;
    setUserState(ACTIVE_KEY, id);
}

export async function createProfile(name: string, picture = DEFAULT_PICTURE): Promise<Profile> {
    await loadProfiles();
    const profile: Profile = { format: PROFILE_FORMAT, id: newId(), name: name.trim() || "Player", picture, created: new Date().toISOString(), buckets: {} };
    profileState.profiles.push(profile);
    await saveProfile(profile);
    setActiveProfile(profile.id);
    return profile;
}

/** The active profile, made ("Player 1") when there is none yet, for the first battle the router reports. */
export async function ensureActiveProfile(): Promise<Profile> {
    await loadProfiles();
    return activeProfile() ?? (await createProfile("Player 1"));
}

export async function updateProfile(id: string, change: { name?: string; picture?: string }): Promise<void> {
    const profile = profileState.profiles.find((p) => p.id === id);
    if (!profile) return;
    if (change.name !== undefined && change.name.trim()) profile.name = change.name.trim();
    if (change.picture !== undefined) profile.picture = change.picture;
    await saveProfile(profile);
}

export async function deleteProfile(id: string): Promise<void> {
    await window.api.profiles.remove(id);
    profileState.profiles = profileState.profiles.filter((p) => p.id !== id);
    if (profileState.activeId === id) {
        profileState.activeId = profileState.profiles[0]?.id ?? null;
        setUserState(ACTIVE_KEY, profileState.activeId);
    }
}

export async function removeRunFromProfile(id: string, bucket: string, runId: string): Promise<void> {
    const profile = profileState.profiles.find((p) => p.id === id);
    if (profile && removeRun(profile, bucket, runId)) await saveProfile(profile);
}
