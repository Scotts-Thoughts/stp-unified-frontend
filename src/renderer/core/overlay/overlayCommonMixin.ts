// @ts-nocheck -- verbatim legacy JS lifted from the overlays (see tools/parity/drift-check.ts); type it when it is rewritten, not while it is moved.
/**
 * What all four lifted overlays (gens 2-5) compute and watch identically: the `batt`,
 * `map` and `s1` shortcuts into the mapper tree, the weather flag, the field effect
 * that expires first, and the two watchers with no generation in them (the overlay
 * colour, the Shuckie Bookmarks switch).
 *
 * Byte-identical across the four overlays and moved out unchanged
 * (tools/parity/drift-check.ts). The state stays in each overlay's `data()` -- apart
 * from `replaySplits`, which is core's store and lives here with the one computed that
 * reads it: `effective_current_splits`, what every `compare_splits` takes as the current
 * run (2026-09-23). `open_shortcuts_menu` is new (2026-10-14): the Keyboard Shortcuts
 * button every lifted overlay has (core/shortcuts, docs/shortcuts-menu-plan.md). The faults box's counts and mode
 * (`fault_resets`, `fault_blackouts`, `blackouts_resets`) replaced each overlay's copies on 2026-10-14
 * (core/overlay/player/FaultsBox.ts). `background_texture_style` replaced each template's inline background
 * filter/transform on 2026-10-15 (core/overlay/backgroundTexture.ts), and `apply_texture_look` gives an
 * unstyled background its texture's default look (core/overlay/textureLooks.ts); the `backgroundTexture`
 * watcher does the same when a texture is picked. `species_art_look` (2026-10-15) hands the species art's sliders
 * to core/overlay/player/SpeciesArt.ts.
 */

import { backgroundTextureStyle } from "./backgroundTexture";
import { hasUntouchedFilters, lookAfterTextureChange, textureLook, texturePath } from "./textureLooks";
import { faultMode } from "~/core/logic/faultMode";
import { setShuckieBookmarksEnabled } from "~/core/logic/shuckieBookmarks";
import { openShortcutsMenu } from "~/core/shortcuts/engine";
import { useReplaySplitsStore } from "~/core/stores/useReplaySplitsStore";
import type { ComponentOptionsMixin } from "vue";

export const overlayCommonMixin = {
    data() {
        return {
            /** The run's splits from the replay Super Shuckie is playing back (core/stores/useReplaySplitsStore.ts). */
            replaySplits: useReplaySplitsStore(),
        };
    },
    computed: {
        /**
         * What the splits panel shows as the current run: the autosplitter's rows, or --
         * while Super Shuckie plays a replay back -- that replay's SPLIT bookmarks up to
         * the playback frame, so a scrub to any point shows the splits reached by then.
         */
        effective_current_splits() {
            return this.replaySplits.playingBack ? this.replaySplits.currentSplits : this.current_splits
        },
        batt() {
            return this.game?.properties?.battle
        },
        map() {
            return this.game?.properties
        },
        s1() {
            return this.game?.properties?.player?.team[0]
        },
        /**
         * The background texture's filter and transform, scaled up to cover the canvas
         * (core/overlay/backgroundTexture.ts). `backgroundXFlip` is the vertical flip (crossed legacy
         * name); every generation has it since 2026-10-15 (gen4/gen5 gained it, ui-uniformity decision 12).
         */
        background_texture_style() {
            const d = this.$data
            return backgroundTextureStyle({
                blur: d.backgroundBlur, hue: d.backgroundHue, brightness: d.backgroundBrightness,
                contrast: d.backgroundContrast, saturation: d.backgroundSaturation, scale: d.backgroundScale,
                flip: d.backgroundFlip, flipY: d.backgroundXFlip, offsetX: d.backgroundXOffset, offsetY: d.backgroundYOffset,
            })
        },
        weather_boolean() {
            if (this.batt.field?.weather?.value == "Sun" || this.batt.field?.weather?.value == "Rain" || this.batt.field?.weather?.value == "Sandstorm") {
                return true
            }
            else {
                return false
            }
        },
        field_effect_first_expiring() {
            var field_effect_most_recent_array = ["Reflect", false, 6,]
            for(var i = 0; i < this.field_effect_array.length; i++) {
                if (this.field_effect_array[i][2] < field_effect_most_recent_array[2] && this.field_effect_array[i][2] != 0) {
                    field_effect_most_recent_array = this.field_effect_array[i]
                }
            }
            if (this.field_effect_array[0][2] == 0 && this.field_effect_array[1][2] == 0 && this.field_effect_array[2][2] == 0 && this.field_effect_array[3][2] == 0) {
                field_effect_most_recent_array = [this.last_initiated_field_effect, false, 0]
            }
            return field_effect_most_recent_array
        },
        /**
         * The faults box's counts (core/overlay/player/FaultsBox.ts): Super Shuckie's counters when they are on,
         * else the overlay's own. Primitives (2026-09-25): a computed that yields the same number as before
         * triggers nothing, so a Super Shuckie poll that replaced `emulatorStats` does not re-render the overlay.
         */
        fault_resets() {
            return this.shuckie_counters ? (this.emulatorStats?.counters?.playerResets ?? 0) : this.playerResets
        },
        fault_blackouts() {
            return this.shuckie_counters ? (this.emulatorStats?.counters?.blackout_counter ?? 0) : this.blackout_counter
        },
        /** Which faults the box shows: "None" ("faults"), "Resets", "Blackouts" or "Both" (core/logic/faultMode.ts). */
        blackouts_resets() {
            return faultMode(this.fault_resets, this.fault_blackouts)
        },
        /** The species art's saved adjustments, as core/overlay/player/SpeciesArt.ts's props. */
        species_art_look() {
            return {
                scale: this.imageScale, flip: this.imageFlip, offsetX: this.imageXOffset, offsetY: this.imageYOffset,
                rotation: this.imageRotation, saturation: this.imageSat,
            }
        },
    },
    watch: {
        overlay_color(newColor) {
            document.documentElement.style.setProperty('--overlay-color', newColor);
        },
        shuckie_bookmarks(enabled) {
            // Global, not this generation's MyStorage: the bookmarks are core's (core/logic/shuckieBookmarks.ts).
            setShuckieBookmarksEnabled(enabled);
        },
        /** Picking a texture shows it in its default look unless the filters were styled by hand (core/overlay/textureLooks.ts). */
        backgroundTexture(newTexture, oldTexture) {
            const look = lookAfterTextureChange(texturePath(this.textures, oldTexture), texturePath(this.textures, newTexture), {
                brightness: this.backgroundBrightness, contrast: this.backgroundContrast,
                saturation: this.backgroundSaturation, blur: this.backgroundBlur,
            })
            if (!look) return
            this.backgroundBrightness = look.brightness
            this.backgroundContrast = look.contrast
            this.backgroundSaturation = look.saturation
            this.backgroundBlur = look.blur
        },
    },
    methods: {
        /** The "Keyboard Shortcuts" button: opens (or focuses) the Keyboard Shortcuts window. */
        open_shortcuts_menu() {
            openShortcutsMenu();
        },
        /**
         * Gives an unstyled background its texture's default look (core/overlay/textureLooks.ts).
         * Called at the end of each species load and each style reset, after the texture and
         * the four filters have been set; leaves a background with any filter changed alone.
         */
        apply_texture_look() {
            if (!hasUntouchedFilters(this.backgroundBrightness, this.backgroundContrast, this.backgroundSaturation, this.backgroundBlur)) return
            const look = textureLook(texturePath(this.textures, this.backgroundTexture))
            if (!look) return
            this.backgroundBrightness = look.brightness
            this.backgroundContrast = look.contrast
            this.backgroundSaturation = look.saturation
            this.backgroundBlur = look.blur
        },
    },
} satisfies ComponentOptionsMixin;
