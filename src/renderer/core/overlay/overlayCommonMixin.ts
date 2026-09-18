// @ts-nocheck -- verbatim legacy JS lifted from the overlays (see tools/parity/drift-check.ts); type it when it is rewritten, not while it is moved.
/**
 * What all four lifted overlays (gens 2-5) compute and watch identically: the `batt`,
 * `map` and `s1` shortcuts into the mapper tree, the weather flag, the field effect
 * that expires first, and the two watchers with no generation in them (the overlay
 * colour, the Shuckie Bookmarks switch).
 *
 * Byte-identical across the four overlays and moved out unchanged
 * (tools/parity/drift-check.ts). The state stays in each overlay's `data()`.
 */

import { setShuckieBookmarksEnabled } from "~/core/logic/shuckieBookmarks";
import type { ComponentOptionsMixin } from "vue";

export const overlayCommonMixin = {
    computed: {
        batt() {
            return this.game?.properties?.battle
        },
        map() {
            return this.game?.properties
        },
        s1() {
            return this.game?.properties?.player?.team[0]
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
    },
    watch: {
        overlay_color(newColor) {
            document.documentElement.style.setProperty('--overlay-color', newColor);
        },
        shuckie_bookmarks(enabled) {
            // Global, not this generation's MyStorage: the bookmarks are core's (core/logic/shuckieBookmarks.ts).
            setShuckieBookmarksEnabled(enabled);
        },
    },
} satisfies ComponentOptionsMixin;
