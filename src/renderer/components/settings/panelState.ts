import { reactive } from "vue";

/**
 * The few things gen1's settings panel shows that live in no store (games/gen1/settingsPanel.ts).
 * The logic-only components that own them keep them current: `interface_1.vue` (the Shuckie
 * Bookmarks switch, global user state that isn't reactive) and `metrics.vue` (the loaded split
 * comparison, whose rows live in components/Overlay.vue). The shortcut actions read the same
 * object, so the Keyboard Shortcuts window sees what the panel sees.
 */
export const gen1PanelState = reactive({
    /** Mirrors `shuckieBookmarksEnabled()`, for the panel to re-render when a key flips it. */
    shuckieBookmarks: false,
    /** The file the split comparison came from ("Comparing Against"). */
    comparisonName: null as string | null,
    /** Whether a split comparison is loaded (enables "Clear Loaded Splits"). */
    hasComparison: false,
    /** "Pokemon Editor" (Show Advanced Settings): shows the move/item editor. Not saved, like gens 2-5's switch. */
    editor: false,
});
