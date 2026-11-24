<template>
    <div id="stp-profile-bar" class="pf-bar">
        <img class="pf-picture" :src="pictureSrc" :alt="active ? active.name : 'No profile'" draggable="false" @error="pictureFailed" />

        <template v-if="mode === 'view'">
            <select v-if="profiles.length" id="stp-profile-select" class="pf-select" :value="activeId ?? ''" @change="choose(($event.target as HTMLSelectElement).value)">
                <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <span v-else class="pf-none">No profile yet</span>
            <button class="pf-button" @click="startNew">New profile</button>
            <button v-if="active" class="pf-button" @click="startEdit">Rename</button>
            <button v-if="active" class="pf-button pf-danger" @click="mode = 'delete'">Delete</button>
        </template>

        <template v-else-if="mode === 'delete'">
            <span class="pf-question">Delete {{ active?.name }} and all of its move stats?</span>
            <button class="pf-button pf-danger" @click="confirmDelete">Delete</button>
            <button class="pf-button" @click="mode = 'view'">Cancel</button>
        </template>

        <template v-else>
            <input
                ref="nameInput"
                v-model="draftName"
                class="pf-input"
                maxlength="40"
                placeholder="Profile name"
                @keydown.enter="saveDraft"
                @keydown.esc="mode = 'view'"
            />
            <input v-model="draftPicture" class="pf-input pf-picture-input" list="stp-profile-pictures" placeholder="Picture (a Pokémon)" @keydown.enter="saveDraft" />
            <datalist id="stp-profile-pictures">
                <option v-for="name in pictures" :key="name" :value="name"></option>
            </datalist>
            <button class="pf-button" @click="saveDraft">{{ mode === 'new' ? 'Create' : 'Save' }}</button>
            <button class="pf-button" @click="mode = 'view'">Cancel</button>
        </template>

        <span class="pf-spacer"></span>

        <span class="pf-router" :title="routerTitle">
            <span :class="['pf-dot', `pf-dot-${link}`]" aria-hidden="true"></span>
            <span>{{ routerText }}</span>
        </span>
        <button id="stp-move-stats-button" class="pf-button pf-primary" @click="$emit('open-stats')">Move stats</button>
    </div>
</template>

<script lang="ts">
/**
 * The profile bar at the top of the start screen (move-stats spec §4.1): the active
 * player profile's picture and name, switching and managing profiles, the router's
 * status dot and the "Move stats" button. The on-stream overlay shows none of it.
 *
 * The dot asks the router's `/status` every few seconds while the start screen is up:
 * green when it records the game picked on this screen, amber when it records another
 * game, grey when it isn't running (its server only answers while recording).
 */
import { defineComponent, nextTick } from "vue";
import { DEFAULT_PICTURE, PROFILE_PICTURES, pictureUrl } from "./pictures";
import { activeProfile, createProfile, deleteProfile, loadProfiles, profileState, setActiveProfile, updateProfile } from "./profiles";
import { checkRouterStatus, routerState } from "./tracker";
import { bucketLabel, bucketForRouterGame } from "./buckets";

const STATUS_MS = 5_000;

export default defineComponent({
    props: {
        /** The bucket of the edition picked on the start screen, or null. */
        bucket: { type: String as () => string | null, default: null },
    },
    emits: ["open-stats"],
    data() {
        return {
            mode: "view" as "view" | "new" | "edit" | "delete",
            draftName: "",
            draftPicture: "",
            pictures: PROFILE_PICTURES,
            pictureBroken: false,
            timer: null as ReturnType<typeof setInterval> | null,
        };
    },
    computed: {
        profiles() {
            return profileState.profiles;
        },
        activeId(): string | null {
            return profileState.activeId;
        },
        active() {
            void profileState.activeId;
            return activeProfile();
        },
        pictureSrc(): string {
            return pictureUrl(this.pictureBroken ? DEFAULT_PICTURE : this.active?.picture);
        },
        link(): string {
            return routerState.link === "unknown" ? "off" : routerState.link;
        },
        routerText(): string {
            if (routerState.link === "same") return `Router: recording ${routerState.game}`;
            if (routerState.link === "other") return `Router: recording ${routerState.game ?? "another game"}`;
            return "Router: not recording";
        },
        routerTitle(): string {
            if (routerState.link === "other") {
                const theirs = bucketForRouterGame(routerState.game);
                const ours = this.bucket ? bucketLabel(this.bucket) : "no game";
                return `The router records ${theirs ? bucketLabel(theirs) : routerState.game}, but ${ours} is picked here. Its battles won't be added until both agree.`;
            }
            if (routerState.link === "same") return "Battles the router records are added to the active profile.";
            return "Start recording in the router to add battles to the active profile.";
        },
    },
    watch: {
        "active.picture"() {
            this.pictureBroken = false;
        },
        bucket() {
            void checkRouterStatus(this.bucket);
        },
    },
    mounted() {
        void loadProfiles();
        void checkRouterStatus(this.bucket);
        this.timer = setInterval(() => void checkRouterStatus(this.bucket), STATUS_MS);
    },
    unmounted() {
        if (this.timer) clearInterval(this.timer);
    },
    methods: {
        pictureFailed() {
            this.pictureBroken = true;
        },
        choose(id: string) {
            setActiveProfile(id);
        },
        startNew() {
            this.draftName = "";
            this.draftPicture = DEFAULT_PICTURE;
            this.mode = "new";
            void nextTick(() => (this.$refs.nameInput as HTMLInputElement | undefined)?.focus());
        },
        startEdit() {
            this.draftName = this.active?.name ?? "";
            this.draftPicture = this.active?.picture ?? DEFAULT_PICTURE;
            this.mode = "edit";
            void nextTick(() => (this.$refs.nameInput as HTMLInputElement | undefined)?.focus());
        },
        async saveDraft() {
            const name = this.draftName.trim();
            if (!name) return;
            const picture = this.pictures.includes(this.draftPicture) ? this.draftPicture : DEFAULT_PICTURE;
            if (this.mode === "new") await createProfile(name, picture);
            else if (this.active) await updateProfile(this.active.id, { name, picture });
            this.mode = "view";
        },
        async confirmDelete() {
            if (this.active) await deleteProfile(this.active.id);
            this.mode = "view";
        },
    },
});
</script>

<style scoped>
/* New classes only (pf-*): the start screen's own gs-* classes are left as they were. */
.pf-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 64px;
    margin: 0 0 18px;
    padding: 8px 16px;
    border-radius: 10px;
    background: #ffffff10;
    font-size: 18px;
    color: #e0e0e0;
    user-select: none;
}
.pf-picture {
    width: 48px;
    height: 48px;
    object-fit: contain;
    filter: drop-shadow(0 2px 4px #000000a0);
}
.pf-select,
.pf-input {
    height: 36px;
    padding: 0 10px;
    border: 1px solid #ffffff30;
    border-radius: 6px;
    background: #1c1c1c;
    color: #ffffff;
    font-family: inherit;
    font-size: 18px;
    user-select: text;
}
.pf-select {
    min-width: 220px;
}
.pf-picture-input {
    width: 220px;
}
.pf-none,
.pf-question {
    color: #c8c8c8;
}
.pf-button {
    height: 36px;
    padding: 0 14px;
    border: 1px solid #ffffff30;
    border-radius: 6px;
    background: #2a2a2a;
    color: #e8e8e8;
    font-family: inherit;
    font-size: 17px;
    cursor: pointer;
}
.pf-button:hover {
    background: #3a3a3a;
}
.pf-danger {
    color: #ff8a80;
}
.pf-primary {
    border-color: #11ce18;
    color: #11ce18;
    font-weight: 700;
}
.pf-spacer {
    flex: 1;
}
.pf-router {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #b0b0b0;
}
.pf-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #6a6a6a;
}
.pf-dot-same {
    background: #11ce18;
    box-shadow: 0 0 8px #11ce18;
}
.pf-dot-other {
    background: #ffb14a;
    box-shadow: 0 0 8px #ffb14a;
}
</style>
