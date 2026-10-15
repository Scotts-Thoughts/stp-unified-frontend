<script>
/**
 * Logic only (no markup since 2026-10-14): the settings panel is games/gen1/settingsPanel.ts,
 * rendered by components/game_area.vue, which still mounts this component first, where the old
 * Interface column was, so its subscription registers in the same order.
 *
 * What it keeps: the Shuckie Bookmarks switch is global user state rather than a gen1 setting
 * (every generation's chapter markers become replay bookmarks through core,
 * `core/logic/shuckieBookmarks.ts`), and user state is not reactive, so this mirrors it into the
 * panel's state (`panelState.ts`) and follows a change made by a key (`setShuckieBookmarks`).
 *
 * The Super Shuckie Timer and Counters switches (2026-09-13) are what gens 2-5 show under "Show
 * Advanced Settings", as gen1's panel now does too. With the timer switch on, Play/Pause and Set
 * Timer drive the emulator's timer (`/mark-start`, as gen3's buttons do) instead of the overlay's own
 * (commands.ts).
 */
import { defineComponent } from "vue";
import { shuckieBookmarksEnabled } from "~/core/logic/shuckieBookmarks";
import PubSub from "~/logic/PubSub";
import { SHUCKIE_BOOKMARKS_CHANGED } from "./commands";
import { gen1PanelState } from "./panelState";


export default defineComponent({
    created() {
        gen1PanelState.shuckieBookmarks = shuckieBookmarksEnabled();
        // The switch is global user state, which is not reactive; a shortcut can flip it too.
        PubSub.subscribe(SHUCKIE_BOOKMARKS_CHANGED, this.shuckie_bookmarks_changed);
    },
    unmounted() {
        PubSub.unsubscribe(SHUCKIE_BOOKMARKS_CHANGED, this.shuckie_bookmarks_changed);
    },
    methods: {
        shuckie_bookmarks_changed(enabled) {
            gen1PanelState.shuckieBookmarks = enabled;
        },
    },
    render() {
        return null;
    },
});
</script>
