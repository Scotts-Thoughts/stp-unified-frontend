/**
 * What the updater (src/main/updater/index.ts) tells the Updates window and the Updates
 * button (src/renderer/core/updates/), on `updates:state` and from `updates:get-state`.
 */
export interface UpdateRelease {
    version: string;
    name: string;
    notes: string;
    /** ISO date. */
    published: string;
    /** The release's GitHub page. */
    page: string;
}

export type UpdateJob =
    | { kind: "preparing"; version: string }
    | { kind: "downloading"; version: string; received: number; total: number }
    | { kind: "ready"; version: string }
    | { kind: "restarting"; version: string };

export interface UpdateState {
    /** False in development, on a Mac, under the parity harness, or without an install manifest. */
    enabled: boolean;
    /** Why it is off, in words for the window. */
    disabledReason: string | null;
    current: string;
    /** The version a local rollback puts back, or null when there is none. */
    previous: string | null;
    /** The newest release, when it is newer than `current`. */
    available: string | null;
    checking: boolean;
    /** ISO date of the last successful check. */
    lastChecked: string | null;
    /** Newest first; only releases the updater can install. */
    releases: UpdateRelease[];
    job: UpdateJob | null;
    /** The last thing that went wrong (a failed check, download or install). */
    error: string | null;
    /** Set once after an update or rollback was installed: the version that was put in. */
    justInstalled: string | null;
}
