<template>
	<div class="menu">
		<header class="head">
			<div class="title-row">
				<h1>Keyboard Shortcuts</h1>
				<span v-if="catalog" class="subtitle">{{ catalog.title }}</span>
			</div>
			<p v-if="catalog && !catalog.gameLoaded" class="note">
				No game is loaded yet. These are Generation 1's shortcuts, which also work on the game-select screen.
				Load a game to see its own.
			</p>
			<div v-if="catalog" class="tools">
				<input
					v-model="search"
					class="search"
					type="search"
					placeholder="Search actions or keys"
					spellcheck="false"
				/>
				<button class="secondary" type="button" @click="resetAll">Reset all to defaults</button>
			</div>
		</header>

		<main v-if="!catalog" class="empty">
			<p>Waiting for the overlay. Load a game and its shortcuts appear here.</p>
		</main>

		<main v-else class="groups">
			<p v-if="visibleGroups.length === 0" class="empty">Nothing matches "{{ search }}".</p>
			<section v-for="group in visibleGroups" :key="group.name" class="group">
				<h2>{{ group.name }}</h2>
				<div
					v-for="row in group.rows"
					:key="row.id"
					class="row"
					:class="{ unavailable: !row.available, recording: recording === row.id }"
				>
					<div class="label">
						<span>{{ row.label }}</span>
						<span v-if="!row.available" class="hint">not available right now</span>
						<span v-if="errorFor === row.id" class="error">{{ error }}</span>
						<span v-if="pending && pending.id === row.id" class="prompt">
							{{ display(pending.accelerator) }} is used by "{{ pending.holderLabel }}".
							<button type="button" class="link" @click="confirmMove">Move it here</button>
							<button type="button" class="link" @click="pending = null">Cancel</button>
						</span>
					</div>
					<div class="keys">
						<button
							type="button"
							class="key"
							:class="{ unbound: !row.binding, failed: isFailed(row), conflict: row.conflict }"
							:title="keyTitle(row)"
							@click="startRecording(row.id)"
						>
							<template v-if="recording === row.id">Press a key… (Esc cancels)</template>
							<template v-else-if="row.binding">{{ display(row.binding) }}</template>
							<template v-else>Set key</template>
						</button>
						<button
							v-if="row.binding"
							type="button"
							class="icon"
							title="Remove this shortcut"
							@click="clear(row.id)"
						>Clear</button>
						<button
							v-if="row.binding !== row.defaultBinding"
							type="button"
							class="icon"
							:title="row.defaultBinding ? `Back to ${display(row.defaultBinding)}` : 'Back to no shortcut'"
							@click="reset(row.id)"
						>Default</button>
					</div>
				</div>
			</section>
		</main>

		<footer class="foot">
			Shortcuts work while any program has focus. A key bound here stops reaching other programs while the
			overlay runs. Plain letters and digits need Ctrl or Alt; F-keys and numpad keys work on their own.
		</footer>
	</div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import type { ShortcutCatalog, ShortcutRow } from "../../../shared/shortcuts";
import { acceleratorFromEvent, displayAccelerator, refusalReason } from "./accelerators";

/**
 * The Keyboard Shortcuts window (docs/shortcuts-menu-plan.md §4.4). It holds no state of
 * its own: it shows the catalog the overlay publishes (through main) and sends edits
 * back; the overlay persists them and republishes.
 *
 * Recording a key suspends the shortcuts (`shortcuts.suspend`), or pressing a key that is
 * already bound would run its action as well as record it.
 */
export default defineComponent({
	data() {
		return {
			catalog: null as ShortcutCatalog | null,
			search: "",
			/** The row whose key is being recorded. */
			recording: null as string | null,
			/** A key another action holds, waiting for "Move it here". */
			pending: null as { id: string; accelerator: string; holderLabel: string } | null,
			error: "",
			errorFor: null as string | null,
			detach: [] as (() => void)[],
		};
	},
	computed: {
		visibleGroups(): { name: string; rows: ShortcutRow[] }[] {
			if (!this.catalog) return [];
			const needle = this.search.trim().toLowerCase();
			const groups: { name: string; rows: ShortcutRow[] }[] = [];
			for (const row of this.catalog.rows) {
				if (needle) {
					const haystack = `${row.group} ${row.label} ${row.binding ? displayAccelerator(row.binding) : ""}`.toLowerCase();
					if (!haystack.includes(needle)) continue;
				}
				let group = groups.find((g) => g.name === row.group);
				if (!group) groups.push((group = { name: row.group, rows: [] }));
				group.rows.push(row);
			}
			return groups;
		},
	},
	async mounted() {
		const shortcuts = window.api.shortcuts;
		this.detach.push(shortcuts.onCatalog((catalog) => (this.catalog = catalog)));
		this.catalog = (await shortcuts.getCatalog()) ?? this.catalog;
		// What is available follows the game and species; ask again whenever the window is looked at.
		window.addEventListener("focus", this.onFocus);
		window.addEventListener("blur", this.onBlur);
		window.addEventListener("keydown", this.onKeyDown, true);
		shortcuts.refresh();
	},
	unmounted() {
		this.stopRecording();
		window.removeEventListener("focus", this.onFocus);
		window.removeEventListener("blur", this.onBlur);
		window.removeEventListener("keydown", this.onKeyDown, true);
		for (const detach of this.detach) detach();
	},
	methods: {
		display(accelerator: string): string {
			return displayAccelerator(accelerator);
		},
		isFailed(row: ShortcutRow): boolean {
			return !!row.binding && !!this.catalog?.failed?.includes(row.binding);
		},
		keyTitle(row: ShortcutRow): string {
			if (this.isFailed(row)) return "The overlay can't listen for this key, so this shortcut is off.";
			if (row.conflict) return "An action earlier in the list already uses this key, so this one is off.";
			return "Click, then press the key or combination to use";
		},
		onFocus() {
			window.api.shortcuts.refresh();
		},
		onBlur() {
			// Recording must not outlive the window's focus: shortcuts stay off until it ends.
			this.stopRecording();
		},
		startRecording(id: string) {
			if (this.recording === id) {
				this.stopRecording();
				return;
			}
			this.pending = null;
			this.error = "";
			this.errorFor = null;
			if (!this.recording) window.api.shortcuts.suspend();
			this.recording = id;
		},
		stopRecording() {
			if (!this.recording) return;
			this.recording = null;
			window.api.shortcuts.resume();
		},
		onKeyDown(event: KeyboardEvent) {
			const id = this.recording;
			if (!id) return;
			event.preventDefault();
			event.stopPropagation();
			const plain = !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey;
			if (event.code === "Escape" && plain) {
				this.stopRecording();
				return;
			}
			const accelerator = acceleratorFromEvent(event);
			if (!accelerator) return; // only modifiers so far
			this.stopRecording();
			const refusal = refusalReason(accelerator);
			if (refusal) {
				this.error = refusal;
				this.errorFor = id;
				return;
			}
			const holder = this.catalog?.rows.find((r) => r.id !== id && r.binding === accelerator);
			if (holder) {
				this.pending = { id, accelerator, holderLabel: holder.label };
				return;
			}
			window.api.shortcuts.edit({ type: "set", id, accelerator });
		},
		confirmMove() {
			if (!this.pending) return;
			const { id, accelerator } = this.pending;
			this.pending = null;
			window.api.shortcuts.edit({ type: "set", id, accelerator, steal: true });
		},
		clear(id: string) {
			this.pending = null;
			window.api.shortcuts.edit({ type: "clear", id });
		},
		reset(id: string) {
			this.pending = null;
			window.api.shortcuts.edit({ type: "reset", id });
		},
		resetAll() {
			if (!window.confirm("Put every shortcut for this generation back to its default?")) return;
			this.pending = null;
			window.api.shortcuts.edit({ type: "reset-all" });
		},
	},
});
</script>

<style>
:root {
	--bg: #f6f6f4;
	--panel: #ffffff;
	--text: #1d1d1f;
	--muted: #6b6b70;
	--line: #e3e3e0;
	--accent: #2f6fde;
	--key-bg: #eef1f6;
	--danger: #c0392b;
	--warn: #a46a00;
	color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
	:root {
		--bg: #1b1b1d;
		--panel: #242427;
		--text: #ececee;
		--muted: #9a9aa2;
		--line: #333338;
		--accent: #6b9cff;
		--key-bg: #30323a;
		--danger: #ff7a6b;
		--warn: #e0a83a;
	}
}
html, body {
	margin: 0;
	background: var(--bg);
	color: var(--text);
	font: 14px/1.4 "Segoe UI", system-ui, -apple-system, sans-serif;
}
.menu {
	display: flex;
	flex-direction: column;
	height: 100vh;
}
.head {
	padding: 16px 20px 12px;
	border-bottom: 1px solid var(--line);
	background: var(--panel);
}
.title-row {
	display: flex;
	align-items: baseline;
	gap: 12px;
}
h1 {
	margin: 0;
	font-size: 20px;
	font-weight: 600;
}
.subtitle {
	color: var(--muted);
}
.note {
	margin: 8px 0 0;
	color: var(--warn);
}
.tools {
	display: flex;
	gap: 10px;
	margin-top: 12px;
}
.search {
	flex: 1;
	min-width: 0;
	padding: 7px 10px;
	border: 1px solid var(--line);
	border-radius: 6px;
	background: var(--bg);
	color: var(--text);
	font: inherit;
}
button {
	font: inherit;
	color: inherit;
	cursor: pointer;
}
.secondary {
	padding: 6px 12px;
	border: 1px solid var(--line);
	border-radius: 6px;
	background: var(--panel);
}
.groups {
	flex: 1;
	overflow-y: auto;
	padding: 4px 20px 20px;
}
.empty {
	padding: 24px 20px;
	color: var(--muted);
}
.group h2 {
	margin: 18px 0 6px;
	font-size: 12px;
	font-weight: 600;
	letter-spacing: .06em;
	text-transform: uppercase;
	color: var(--muted);
}
.row {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 6px 10px;
	border-radius: 6px;
	background: var(--panel);
	margin-bottom: 4px;
}
.row.unavailable .label > span:first-child {
	color: var(--muted);
}
.row.recording {
	outline: 2px solid var(--accent);
}
.label {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
}
.hint {
	font-size: 12px;
	color: var(--muted);
}
.error {
	font-size: 12px;
	color: var(--danger);
}
.prompt {
	font-size: 12px;
	color: var(--warn);
}
.link {
	border: none;
	background: none;
	padding: 0 0 0 6px;
	color: var(--accent);
	text-decoration: underline;
}
.keys {
	display: flex;
	align-items: center;
	gap: 6px;
	flex-shrink: 0;
}
.key {
	min-width: 120px;
	padding: 5px 10px;
	border: 1px solid var(--line);
	border-radius: 6px;
	background: var(--key-bg);
	font-family: Consolas, "SF Mono", monospace;
	font-size: 13px;
	text-align: center;
}
.key.unbound {
	background: transparent;
	color: var(--muted);
	font-family: inherit;
}
.key.failed,
.key.conflict {
	border-color: var(--danger);
	color: var(--danger);
	text-decoration: line-through;
}
.icon {
	padding: 4px 8px;
	border: none;
	border-radius: 6px;
	background: transparent;
	color: var(--muted);
	font-size: 12px;
}
.icon:hover,
.secondary:hover {
	color: var(--accent);
}
.foot {
	padding: 10px 20px;
	border-top: 1px solid var(--line);
	background: var(--panel);
	color: var(--muted);
	font-size: 12px;
}
</style>
