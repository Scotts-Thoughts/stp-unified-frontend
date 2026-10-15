<script lang="ts">
/**
 * Logic only since 2026-10-14: the New Run, split comparison and counter controls are in the settings
 * panel (games/gen1/settingsPanel.ts, over commands.ts). components/game_area.vue still mounts this
 * where the old column was, so its `@splits/previous_loaded` subscription registers in the same order
 * (after components/Overlay.vue's, which keeps the rows). It keeps the panel's "Comparing Against" file
 * name and whether a comparison is loaded (`panelState.ts`).
 */
import { defineComponent } from "vue";
import PubSub from "~/logic/PubSub";
import { getUserState } from "~/core/persistence/userState";
import { gen1PanelState } from "./panelState";

export default defineComponent({
    created() {
        /** The file the split comparison came from (components/Overlay.vue keeps the rows). */
        gen1PanelState.comparisonName = getUserState<string | null>("previous_splits_source", null);
        gen1PanelState.hasComparison = getUserState<unknown[]>("previous_splits", []).length > 0;
        PubSub.subscribe("@splits/previous_loaded", this.comparison_loaded);
    },
    unmounted() {
        PubSub.unsubscribe("@splits/previous_loaded", this.comparison_loaded);
    },
    methods: {
        comparison_loaded(payload: unknown) {
            const name = Array.isArray(payload) ? null : (payload as { name?: string | null } | null)?.name ?? null;
            gen1PanelState.comparisonName = name;
            const rows = Array.isArray(payload) ? payload : (payload as { rows?: unknown } | null)?.rows;
            gen1PanelState.hasComparison = Array.isArray(rows) && rows.length > 0;
        },
    },
    render() {
        return null;
    },
});
</script>
