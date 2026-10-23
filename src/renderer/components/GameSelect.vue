<template>
    <div class="game-select">
        <report-button></report-button>
        <header class="gs-header">
            <h1 class="gs-title">Scott's Thoughts Overlay</h1>
            <div class="gs-status">
                <span class="gs-status-dot" aria-hidden="true"></span>
                <span>Please load a mapper in PokeAByte...</span>
            </div>
            <div v-if="unsupportedMapper" class="gs-warning">Unsupported mapper: {{ unsupportedMapper }}</div>
            <p class="gs-hint">
                Pick the game you are about to play. The overlay starts by itself when PokeAByte loads that game's mapper.
            </p>
            <div class="gs-selection">
                <template v-if="selected">
                    Selected: <strong>{{ selected.edition.name }}</strong> <span class="gs-selection-gen">(Generation {{ selected.manifest.generation }})</span>
                </template>
                <template v-else>No game selected yet</template>
            </div>
        </header>

        <div class="gs-generations">
            <section v-for="manifest in manifests" :key="manifest.id" :class="['generation', { 'gs-current': manifest.id === selectedGeneration }]">
                <h2 class="generationLabel">Generation {{ manifest.generation }}</h2>
                <div class="gameToggle">
                    <div
                        v-for="edition in visibleEditions(manifest)"
                        :key="edition.name"
                        :class="['gs-tile', { selected: isSelected(manifest, edition) }]"
                        role="radio"
                        :aria-checked="isSelected(manifest, edition)"
                        @click="select(manifest, edition)"
                    >
                        <img
                            :src="`images/box_art/${edition.boxArt}`"
                            :title="edition.name"
                            :alt="edition.name"
                            class="gameToggleImg"
                            draggable="false"
                        />
                        <div class="gs-caption">{{ edition.name }}</div>
                    </div>
                </div>
            </section>
        </div>
    </div>
</template>

<script lang="ts">
/**
 * The pre-mapper screen (plan 3.2, decided 2026-09-02): the box-art grid gen3-5
 * showed while PokeAByte had no mapper loaded, for every generation. It lists every
 * edition of every manifest, fourteen tiles. A click stores the edition where that
 * generation reads it -- gen1's overlay settings store, or the lifted component's own
 * user-state key (`ModuleManifest.editionKey`) in that generation's section of the
 * user state -- and sets the taskbar icon to the edition's. The streamed overlay is
 * untouched: the edition is a user setting, distinct from the game the mapper detects
 * (plan 3.1).
 *
 * One tile is highlighted, not one per generation (2026-09-13). Every generation keeps
 * its own stored edition, and the first version of this screen showed all five of
 * them selected at once -- five green borders, and a click on a sixth tile added
 * another instead of moving the selection. The grid now also remembers *which*
 * generation the user picked last (`selected_generation`, a global user-state key),
 * and only that generation's edition is drawn as selected; the other generations'
 * stored editions are untouched, so each still opens on the edition it was last set
 * to when its mapper loads.
 *
 * The art is one file per edition under `images/box_art/` (the shell's own folder,
 * not a generation's pool): a front box shot for a single game, and the two boxes
 * side by side for an edition that covers a pair (Gold & Silver, FireRed and
 * LeafGreen, Diamond and Pearl, HeartGold and SoulSilver), so a pair's tile is twice
 * as wide and still one `.gameToggleImg` -- `tools/parity/packaged-probe.ts` counts
 * those, and `screenshot-idle.ts` clicks by the `title`.
 */
import { defineComponent } from "vue";
import type { Edition } from "~/core/game/GameModule";
import type { ModuleManifest } from "~/core/game/ModuleManifest";
import { IS_RELEASE } from "~/core/env";
import { getUserState, setUserState } from "~/core/persistence/userState";
import { MANIFESTS } from "~/games/registry";
import ReportButton from "~/core/report/ReportButton.vue";
import { useOverlaySettingsStore } from "~/stores/useOverlaySettingsStore";

const SELECTED_GENERATION_KEY = "selected_generation";

export default defineComponent({
    components: { ReportButton },
    props: {
        /** The `/mapper` path of a mapper no module claims (main.ts), shown as a warning. */
        unsupportedMapper: { type: String as () => string | null, default: null },
    },
    data() {
        return {
            settings: useOverlaySettingsStore(),
            manifests: MANIFESTS,
            // A read of the user state is not reactive; bumping this after a click is.
            revision: 0,
        };
    },
    computed: {
        /** The generation whose tile is highlighted: the one the user picked last, or none yet. */
        selectedGeneration(): string | null {
            void this.revision;
            const id = getUserState<string | null>(SELECTED_GENERATION_KEY, null);
            return this.manifests.some((m) => m.id === id) ? id : null;
        },
        /** The highlighted tile, for the header line. */
        selected(): { manifest: ModuleManifest; edition: Edition } | null {
            const manifest = this.manifests.find((m) => m.id === this.selectedGeneration);
            if (!manifest) return null;
            const name = this.currentEdition(manifest);
            const edition = this.visibleEditions(manifest).find((e) => e.name === name);
            return edition ? { manifest, edition } : null;
        },
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
            return manifest.id === this.selectedGeneration && this.currentEdition(manifest) === edition.name;
        },
        select(manifest: ModuleManifest, edition: Edition): void {
            if (manifest.id === "gen1") {
                this.settings.edition = edition.name as typeof this.settings.edition;
            } else if (manifest.editionKey) {
                setUserState(manifest.editionKey, edition.name, manifest.id);
            }
            setUserState(SELECTED_GENERATION_KEY, manifest.id);
            this.revision++;
            window.api.set_game_icon(edition.icon);
        },
    },
});
</script>

<style scoped>
/* Laid out on the 1920x1080 canvas of #app-container (base.css), which scaleToFit
   fits to the window; the screen sits on the black body with gen1's `play` face,
   under `.gen-1`, so the screen's own classes carry a `gs-` prefix that no
   generation's sheet uses (gen1 has a `.header`). Tiles are sized by height so a
   pair's composite is simply twice as wide; the height, the side padding and the
   group gap are set so gens 1-3 share the first row and gens 4-5 the second. */
.game-select {
    --tile-h: 160px;
    --accent: #11ce18;
    /* the Report button's corner */
    position: relative;
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    padding: 48px 48px 56px;
    color: #ffffff;
    font-family: play, sans-serif;
    user-select: none;
}

.gs-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    text-align: center;
}
.gs-title {
    font-size: 40px;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-shadow: 0 2px 8px #000000c0;
}
.gs-status {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 20px;
    color: #c8c8c8;
}
.gs-status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 8px var(--accent);
    animation: pulse 1.6s ease-in-out infinite;
}
@keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.35; transform: scale(0.8); }
}
.gs-warning {
    font-size: 18px;
    color: #ffb14a;
}
.gs-hint {
    margin-top: 6px;
    font-size: 17px;
    color: #8c8c8c;
}
.gs-selection {
    font-size: 19px;
    color: #d0d0d0;
}
.gs-selection strong {
    color: var(--accent);
    font-weight: 700;
}
.gs-selection-gen {
    color: #9a9a9a;
}

/* The generation groups flow left to right and wrap, centred as a block. */
.gs-generations {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-content: center;
    gap: 40px 48px;
    flex: 1;
    margin-top: 24px;
}
.generation {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.generationLabel {
    font-size: 17px;
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #9a9a9a;
}
.generation.gs-current .generationLabel {
    color: var(--accent);
}
.gameToggle {
    display: flex;
    align-items: flex-start;
    gap: 14px;
}

.gs-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    transition: transform 0.15s;
}
.gs-tile:hover {
    transform: translateY(-3px);
}
.gameToggleImg {
    display: block;
    height: var(--tile-h);
    width: auto;
    border-radius: 6px;
    opacity: 0.6;
    filter: saturate(0.7) drop-shadow(0 3px 6px #000000c0);
    box-shadow: 0 0 0 2px transparent;
    transition: opacity 0.15s, filter 0.15s, box-shadow 0.15s;
}
.gs-tile:hover .gameToggleImg {
    opacity: 0.9;
    filter: saturate(1) drop-shadow(0 6px 10px #000000c0);
}
.gs-tile.selected .gameToggleImg {
    opacity: 1;
    filter: saturate(1) drop-shadow(0 6px 10px #000000c0);
    box-shadow: 0 0 0 3px var(--accent), 0 0 16px 2px #11ce1880;
}
.gs-caption {
    font-size: 15px;
    color: #8c8c8c;
    transition: color 0.15s;
}
.gs-tile:hover .gs-caption {
    color: #d0d0d0;
}
.gs-tile.selected .gs-caption {
    color: var(--accent);
    font-weight: 700;
}
</style>
