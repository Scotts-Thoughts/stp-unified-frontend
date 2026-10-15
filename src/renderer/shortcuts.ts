import { createApp } from "vue";
import ShortcutsMenu from "~/core/shortcuts/ShortcutsMenu.vue";

/** Entry of the Keyboard Shortcuts window (shortcuts.html); nothing of the overlay loads here. */
createApp(ShortcutsMenu).mount("#shortcuts");
