<template>
	<!--
		gen1's `components/keyhook.js` rendered `<div></div>` in exactly this position
		inside #app, and the layout oracle compares every element under #app-container,
		so the empty div stays even though the component is behaviour-only.
	-->
	<div></div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { bindHotkeys, type HotkeyTable } from "./KeyHook";

export default defineComponent({
	props: {
		/** The generation's F-key table; see `games/genN/hotkeys.ts`. */
		table: {
			type: Object as () => HotkeyTable,
			required: true,
		},
	},
	data() {
		return {
			unbind: null as (() => void) | null,
		};
	},
	mounted() {
		this.unbind = bindHotkeys(this.table);
	},
	watch: {
		/** The table changes when the active GameModule does (plan 3.1). */
		table(next: HotkeyTable) {
			this.unbind?.();
			this.unbind = bindHotkeys(next);
		},
	},
	unmounted() {
		this.unbind?.();
		this.unbind = null;
	},
});
</script>
