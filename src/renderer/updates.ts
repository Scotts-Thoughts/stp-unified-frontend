import { createApp } from "vue";
import UpdatesWindow from "~/core/updates/UpdatesWindow.vue";

/** Entry of the Updates window (updates.html); nothing of the overlay loads here. */
createApp(UpdatesWindow).mount("#updates");
