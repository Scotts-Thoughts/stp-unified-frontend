<template>
    <div class="game-select">
        <div>Game:</div>
        <div v-for="manifest in manifests" :key="manifest.id" class="generation">
            <div class="generationLabel">Generation {{ manifest.generation }}</div>
            <div class="gameToggle">
                <img
                    v-for="edition in visibleEditions(manifest)"
                    :key="edition.name"
                    :src="`images/box_art/${edition.boxArt}`"
                    :title="edition.name"
                    :class="['gameToggleImg', { selected: isSelected(manifest, edition) }]"
                    @click="select(manifest, edition)"
                />
            </div>
        </div>
    </div>
</template>

<script lang="ts">
/**
 * The pre-mapper screen: the box-art grid gen3-5 showed while PokeAByte had no mapper
 * loaded, for every generation (plan 3.2, decided 2026-09-02). It lists every edition
 * of every manifest, thirteen tiles, and a click stores the edition where that
 * generation reads it -- gen1's overlay settings store, or the lifted component's own
 * user-state key (`ModuleManifest.editionKey`) in that generation's section of the
 * user state -- and sets the taskbar icon to the
 * edition's. The streamed overlay is untouched: the edition is a user setting,
 * distinct from the game the mapper detects (plan 3.1).
 *
 * gen1 and gen2 tiles are placeholders (the legacy window icons) until Scott supplies
 * art in the gen3-5 style (decision 16). "Yellow Legacy" shows only in a dev build, as
 * gen1's dropdown did (known-legacy-bugs.md #22).
 */
import { defineComponent } from "vue";
import type { Edition } from "~/core/game/GameModule";
import type { ModuleManifest } from "~/core/game/ModuleManifest";
import { IS_RELEASE } from "~/core/env";
import { getUserState, setUserState } from "~/core/persistence/userState";
import { MANIFESTS } from "~/games/registry";
import { useOverlaySettingsStore } from "~/stores/useOverlaySettingsStore";

export default defineComponent({
    data() {
        return {
            settings: useOverlaySettingsStore(),
            manifests: MANIFESTS,
            // A read of the user state is not reactive; bumping this after a click is.
            revision: 0,
        };
    },
    methods: {
        visibleEditions(manifest: ModuleManifest): Edition[] {
            return manifest.editions.filter((edition) => !edition.devOnly || !IS_RELEASE);
        },
        currentEdition(manifest: ModuleManifest): string | null {
            if (manifest.id === "gen1") return this.settings.edition;
            void this.revision;
            return manifest.editionKey ? getUserState<string | null>(manifest.editionKey, null, manifest.id) : null;
        },
        isSelected(manifest: ModuleManifest, edition: Edition): boolean {
            return this.currentEdition(manifest) === edition.name;
        },
        select(manifest: ModuleManifest, edition: Edition): void {
            if (manifest.id === "gen1") {
                this.settings.edition = edition.name as typeof this.settings.edition;
            } else if (manifest.editionKey) {
                setUserState(manifest.editionKey, edition.name, manifest.id);
                this.revision++;
            }
            window.api.set_game_icon(edition.icon);
        },
    },
});
</script>

<style scoped>
/* gen4's `.gameToggle` rules, one row per generation; the labels are given a colour
   because the shell's pre-mapper screen sits on the black body of base.css. */
.game-select {
    pointer-events: auto;
    padding: 16px;
    color: #ffffff;
    font-family: play, sans-serif;
    font-size: 20px;
}
.generation {
    margin-top: 10px;
}
.generationLabel {
    margin-bottom: 4px;
    opacity: 0.85;
}
.gameToggle {
    pointer-events: auto;
    position: relative;
    display: flex;
    gap: 4px;
    filter: drop-shadow(0px 0px 2px #000000c5);
}
.gameToggleImg {
    width: 120px;
    height: 120px;
    object-fit: cover;
    cursor: pointer;
    border-radius: 6px;
    opacity: 0.45;
    filter: grayscale(70%);
    transition: opacity 0.15s, filter 0.15s, transform 0.15s, box-shadow 0.15s;
    box-sizing: border-box;
    border: 2px solid transparent;
}
.gameToggleImg:hover {
    opacity: 0.85;
    filter: grayscale(20%);
    transform: scale(1.05);
}
.gameToggleImg.selected {
    opacity: 1;
    filter: none;
    border-color: #11ce18;
    box-shadow: 0 0 6px #11ce18;
    transform: scale(1.05);
}
</style>
