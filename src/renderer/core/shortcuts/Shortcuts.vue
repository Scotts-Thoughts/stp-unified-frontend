<template>
	<!--
		gen1's `components/keyhook.js` rendered `<div></div>` in exactly this position
		inside #app, and the layout oracle compares every element under #app-container,
		so the empty div stays for gen1 even though the component is behaviour-only
		(`GameModule.keyhookElement`). The other generations bind their shortcuts from
		their own overlay, and gen3's #app is a CSS grid in which the div would take a
		cell, so for them this renders nothing.
	-->
	<div v-if="placeholder"></div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from "vue";
import type { GameModule } from "../game/GameModule";
import { bindShortcuts } from "./engine";

/**
 * The shell's shortcut binder: binds the active module's actions
 * (`GameModule.shortcuts`), which only gen1 provides -- on the box-art screen too, as its
 * F-keys always were. A lifted generation (gen2-5) binds its own from its overlay's
 * `mounted`, because its actions close over the component instance.
 */
export default defineComponent({
	props: {
		module: {
			type: Object as PropType<GameModule>,
			required: true,
		},
		/** False on the box-art screen. */
		gameLoaded: {
			type: Boolean,
			default: false,
		},
		/** Render the legacy empty div (gen1); see the template. */
		placeholder: {
			type: Boolean,
			default: false,
		},
	},
	data() {
		return {
			unbind: null as (() => void) | null,
		};
	},
	mounted() {
		this.bind();
	},
	watch: {
		module() {
			this.bind();
		},
		gameLoaded() {
			this.bind();
		},
	},
	unmounted() {
		this.unbind?.();
		this.unbind = null;
	},
	methods: {
		bind() {
			this.unbind?.();
			this.unbind = null;
			const actions = this.module.shortcuts?.();
			if (!actions) return;
			this.unbind = bindShortcuts({
				actions,
				namespace: this.module.id,
				title: `Generation ${this.module.generation}`,
				gameLoaded: this.gameLoaded,
			});
		},
	},
});
</script>
