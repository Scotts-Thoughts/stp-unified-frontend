<template>
    <div>Game:</div>
    <select v-model="settings.edition" class="dropdownMenu dropdown_menu_column3">
        <option>Yellow</option>
        <option v-if="isRelease == false">Yellow Legacy</option>
        <option>Red</option>
        <option>Blue</option>
    </select><br>
    <br>
    <div>Timer Setting:</div>
    <button class="buttonStyle buttonStyle_column3" @click="toggle_timer">Play/Pause</button>
    <button class="buttonStyle set_button_style" @click="set_timer">Set Timer</button>
    <input type="text" class="inputContainer" v-model="metrics.timer_override" placeholder="00:00:00.00"/><br>
    <br>
    <div>Super Shuckie:</div>
    <table>
        <tbody>
            <tr><td>Shuckie Timer:</td><td>   <input class="checkBoxStyle" type="checkbox" v-model="settings.shuckie.timer"/></td></tr>
            <tr><td>Shuckie Counters:</td><td><input class="checkBoxStyle" type="checkbox" v-model="settings.shuckie.counters"/></td></tr>
            <tr><td>Shuckie Bookmarks:</td><td><input class="checkBoxStyle" type="checkbox" :checked="shuckieBookmarks" @change="set_shuckie_bookmarks($event.target.checked)"/></td></tr>
        </tbody>
    </table>
    <br>
    <button class="buttonStyle buttonStyle_column3" @click="open_splits_folder">Open Splits Folder</button>
    <br>
    <br>
    <div v-if="isRelease == false">
        <table>
            <tbody>
                <tr><td>Test run:</td><td>        <input class="checkBoxStyle" type="checkbox" v-model="runConfig.advanced.test_run"/></td></tr>
                <tr><td>Refilming mode:</td><td>  <input class="checkBoxStyle" type="checkbox" v-model="runConfig.advanced.refilming_mode"/></td></tr>
                <tr><td>No attempt/split:</td><td><input class="checkBoxStyle" type="checkbox" v-model="runConfig.advanced.no_attempt"/></td></tr>
                <tr title="Dev only. Packaged builds always apply enemy sprite styles."><td>Enemy Sprite Styles:</td><td><input class="checkBoxStyle" type="checkbox" :checked="enemyResize.styles_enabled" @change="enemyResize.setStylesEnabled($event.target.checked)"/></td></tr>
                <tr><td>Style Mode:</td><td>
                    <button v-if="!enemyResize.style_mode_active" class="buttonStyle" style="font-size: 11px;" @click="enemyResize.enterStyleMode()" title="Iterate every species: Enter saves + advances, Backspace discards + steps back, Escape exits.">Start</button>
                    <button v-else class="buttonStyle" style="font-size: 11px; color: #f44;" @click="enemyResize.exitStyleMode()">Exit</button>
                </td></tr>
                <tr v-if="enemyResize.style_mode_active"><td colspan="2" style="font-size: 11px;">{{ enemyResize.style_mode_index + 1 }} / {{ enemyResize.style_mode_species_list.length }} — <strong>{{ enemyResize.styleModeCurrentSpecies }}</strong></td></tr>
            </tbody>
        </table>
        <table v-if="runConfig.advanced.refilming_mode">
            <tbody>
                <tr><td>Attempt:</td><td><input class="inputContainer" type="number" min="0" v-model.number="runConfig.advanced.refilmed_attempt"/></td></tr>
                <tr><td>Finish:</td><td> <input class="inputContainer" type="number" min="0" v-model.number="runConfig.advanced.refilmed_finish"/></td></tr>
            </tbody>
        </table>
        <br>
    </div>
    <div v-if="runConfig.advanced.test_run == true">
        <battle_testing />
    </div>
    <div v-if="isRelease == false">
        <div>Debugging:</div>
        <table>
            <tbody>
                <tr><td>State:</td><td>{{meta.gameState}}</td></tr>
                <tr><td>Mapper State:</td><td>{{game_properties.meta.state.value}}</td></tr>
                <tr><td>Enemy State:</td><td>{{meta.enemyState}}</td></tr>
                <tr><td></td><td></td></tr>
                <tr><td>blackout:</td><td>{{metrics.blackout_pending}}</td></tr>
                <tr><td>save file id:</td><td>{{metrics.player_id}}</td></tr>
                <tr><td>run finished:</td><td>{{metrics.run_finished}}</td></tr>
            </tbody>
        </table>
    </div>
</template>

<script>
/**
 * The Interface settings panel: game and species pickers, the timer and Super Shuckie
 * switches, the splits folder button and the dev-only style controls (plan 1.1).
 *
 * The two Super Shuckie switches (2026-09-13) are what gens 2-5 show under "Show
 * Advanced Settings": they were dev-only here, so a packaged gen1 could not use the
 * emulator's timer or counters at all. With the timer switch on, Play/Pause and Set
 * Timer drive the emulator's timer (`/mark-start`, as gen3's buttons do) instead of the
 * overlay's own, which the panel would otherwise silently keep changing. The third switch,
 * Shuckie Bookmarks, is global user state rather than a gen1 setting: every generation's
 * chapter markers become replay bookmarks through core (`core/logic/shuckieBookmarks.ts`).
 *
 * Converted from a template-string component. Plain JavaScript rather than `lang="ts"`
 * for the same reason as `left_panel/exp_bar.vue`: the template reads `$event.target.checked`
 * and `game_properties` through the array form of `inject`, both of which vue-tsc rejects
 * without rewriting the logic. Plan 1.1 compiles the template ahead of time; retyping the
 * body is a later pass with the harness as the net.
 */
import { useMetaStore } from "~/stores/metaStore";
import battle_testing from "./battle_testing.vue";
import { useOverlaySettingsStore } from "~/stores/useOverlaySettingsStore";
import { useGameSpeciesData } from "~/stores/useGameSpeciesData";
import { useSpeciesMetricsStore } from "~/stores/useSpeciesMetricsStore";
import { useEnemySpriteResizeStore } from "~/stores/useEnemySpriteResizeStore";
import { useEmulatorStatsStore } from "~/core/stores/useEmulatorStatsStore";
import { shuckieBookmarksEnabled, setShuckieBookmarksEnabled } from "~/core/logic/shuckieBookmarks";
import { defineComponent } from "vue";
import { revealSplitFolder, splitPath } from "~/core/persistence/splitFiles";
import { IS_RELEASE } from "~/core/env";


export default defineComponent({
    inject: ["game_properties"],
    components: {
        battle_testing,
    },
    data() {
        return {
            meta: useMetaStore(),
            settings: useOverlaySettingsStore(),
            runConfig: useGameSpeciesData(),
            metrics: useSpeciesMetricsStore(),
            enemyResize: useEnemySpriteResizeStore(),
            emulator: useEmulatorStatsStore(),
            shuckieBookmarks: shuckieBookmarksEnabled(),
            isRelease: IS_RELEASE,
        }
    },
    methods: {
        set_shuckie_bookmarks(enabled) {
            this.shuckieBookmarks = enabled;
            setShuckieBookmarksEnabled(enabled);
        },
        /** Play/Pause: the overlay's timer, or the emulator's when the Shuckie Timer switch is on. */
        toggle_timer() {
            if (this.settings.shuckie.timer) {
                this.emulator.sendStart();
                return;
            }
            this.metrics.toggleTimer();
        },
        /** Set Timer: the overlay's timer to the offset, or the emulator's timer started (gen3's mapping). */
        set_timer() {
            if (this.settings.shuckie.timer) {
                this.emulator.sendStart();
                return;
            }
            this.metrics.resetTimer();
        },
        open_splits_folder() {
            // Was methods/file_system_functions.openFolder, which built the path with
            // require("fs") in the renderer; the folder is still created before opening.
            revealSplitFolder(splitPath(this.meta.game, this.meta.starter, 'finishes'))
        }
    }
});
</script>
