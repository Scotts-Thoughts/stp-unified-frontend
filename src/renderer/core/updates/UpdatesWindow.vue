<template>
	<div class="updates">
		<header class="head">
			<h1>Updates</h1>
			<p class="current">
				You have version <b>{{ state ? state.current : "…" }}</b>.
				<span v-if="state && state.lastChecked" class="muted">Last checked {{ formatTime(state.lastChecked) }}.</span>
			</p>
			<div v-if="state && state.enabled" class="tools">
				<button type="button" :disabled="state.checking || busy" @click="check">
					{{ state.checking ? "Checking…" : "Check for updates" }}
				</button>
			</div>
		</header>

		<main v-if="!state" class="body">
			<p class="muted">Loading…</p>
		</main>

		<main v-else-if="!state.enabled" class="body">
			<section class="card">
				<p>{{ state.disabledReason }}</p>
			</section>
		</main>

		<main v-else class="body">
			<section v-if="state.justInstalled" class="card ok">
				<p>Version {{ state.justInstalled }} is installed.</p>
			</section>

			<section v-if="state.error" class="card error">
				<p>{{ state.error }}</p>
			</section>

			<section v-if="state.job" class="card">
				<template v-if="state.job.kind === 'preparing'">
					<p>Getting ready to download version {{ state.job.version }}…</p>
				</template>
				<template v-else-if="state.job.kind === 'downloading'">
					<p>
						Downloading version {{ state.job.version }}:
						{{ formatBytes(state.job.received) }} of {{ formatBytes(state.job.total) }}
					</p>
					<div class="bar"><div class="fill" :style="{ width: percent(state.job) + '%' }"></div></div>
					<div class="row-buttons">
						<button type="button" class="secondary" @click="cancel">Stop</button>
					</div>
				</template>
				<template v-else-if="state.job.kind === 'ready'">
					<p>
						Version {{ state.job.version }} is downloaded. The overlay closes and opens again to install it,
						which takes a few seconds.
					</p>
					<div class="row-buttons">
						<button type="button" class="primary" @click="restart">Restart and install</button>
					</div>
				</template>
				<template v-else>
					<p>Installing version {{ state.job.version }}. The overlay opens again when it is done.</p>
				</template>
			</section>

			<section v-else-if="state.available" class="card highlight">
				<p>Version <b>{{ state.available }}</b> is available.</p>
				<div class="row-buttons">
					<button type="button" class="primary" :disabled="busy" @click="install(state.available)">Update to {{ state.available }}</button>
				</div>
			</section>

			<section v-else-if="state.lastChecked && !state.error" class="card">
				<p>You have the newest version.</p>
			</section>

			<section class="card">
				<h2>Roll back</h2>
				<template v-if="state.previous">
					<p>
						The version you had before, <b>{{ state.previous }}</b>, is kept on this computer. Rolling back puts it
						back without downloading anything, and you can return to {{ state.current }} the same way.
					</p>
					<div class="row-buttons">
						<button type="button" :disabled="busy || jobRunning" @click="rollback">Roll back to {{ state.previous }}</button>
					</div>
					<p class="muted small">
						If an update stops the overlay from starting at all, run
						<b>Roll back to previous version.cmd</b> in the <b>updates</b> folder next to stp-overlay.exe.
					</p>
				</template>
				<p v-else class="muted">There is no previous version on this computer yet. One is kept after the next update.</p>
			</section>

			<section class="card">
				<h2>All versions</h2>
				<p class="muted small">Any version published on GitHub can be installed, newer or older. Only the files that differ are downloaded.</p>
				<p v-if="state.releases.length === 0" class="muted">{{ state.checking ? "Loading the list…" : "No versions found yet." }}</p>
				<ul class="releases">
					<li v-for="release in state.releases" :key="release.version" class="release">
						<div class="release-head">
							<span class="version">{{ release.version }}</span>
							<span v-if="release.version === state.current" class="tag">Installed</span>
							<span v-else-if="release.version === state.previous" class="tag">Previous</span>
							<span v-if="release === state.releases[0]" class="tag new">Newest</span>
							<span class="date muted">{{ formatDate(release.published) }}</span>
							<span class="spacer"></span>
							<a v-if="release.page" href="#" class="link" @click.prevent="openPage(release.page)">Release page</a>
							<button
								v-if="release.version !== state.current"
								type="button"
								:disabled="busy || jobRunning"
								@click="install(release.version)"
							>
								Install
							</button>
						</div>
						<p v-if="notesOf(release)" class="notes">{{ notesOf(release) }}</p>
					</li>
				</ul>
			</section>
		</main>
	</div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import type { UpdateJob, UpdateRelease, UpdateState } from "../../../shared/updates";

/**
 * The Updates window (updates.html). It holds no state of its own: the updater in main
 * (src/main/updater/index.ts) owns everything and sends the whole state on each change;
 * the buttons only ask main, which confirms with a native dialog before it does anything.
 */
export default defineComponent({
	name: "UpdatesWindow",
	data() {
		return {
			state: null as UpdateState | null,
			busy: false,
			unsubscribe: null as (() => void) | null,
		};
	},
	computed: {
		jobRunning(): boolean {
			const job = this.state?.job;
			return !!job && job.kind !== "ready";
		},
	},
	async mounted() {
		this.unsubscribe = window.api.updates.onState((state) => {
			this.state = state;
		});
		this.state = await window.api.updates.getState();
	},
	beforeUnmount() {
		this.unsubscribe?.();
	},
	methods: {
		async run(action: () => Promise<UpdateState>) {
			this.busy = true;
			try {
				this.state = await action();
			} finally {
				this.busy = false;
			}
		},
		check() {
			return this.run(() => window.api.updates.check());
		},
		install(version: string) {
			return this.run(() => window.api.updates.install(version));
		},
		rollback() {
			return this.run(() => window.api.updates.rollback());
		},
		restart() {
			return this.run(() => window.api.updates.restart());
		},
		cancel() {
			window.api.updates.cancel();
		},
		openPage(url: string) {
			window.api.updates.openPage(url);
		},
		percent(job: UpdateJob): number {
			return job.kind === "downloading" && job.total > 0 ? Math.min(100, (job.received / job.total) * 100) : 0;
		},
		notesOf(release: UpdateRelease): string {
			// The workflow uses the commit message as the notes; its first line is the title.
			const lines = release.notes.trim().split(/\r?\n/);
			return lines.slice(lines[0]?.includes(release.version) ? 1 : 0).join("\n").trim();
		},
		formatBytes(bytes: number): string {
			if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`;
			if (bytes < 1024 * 1024 * 1024) return `${(bytes / 2 ** 20).toFixed(1)} MB`;
			return `${(bytes / 2 ** 30).toFixed(2)} GB`;
		},
		formatDate(iso: string): string {
			const date = new Date(iso);
			return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
		},
		formatTime(iso: string): string {
			const date = new Date(iso);
			return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
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
	--ok: #1e7b3a;
	--danger: #c0392b;
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
		--ok: #6fd28a;
		--danger: #ff7a6b;
	}
}
html, body {
	margin: 0;
	background: var(--bg);
	color: var(--text);
	font: 14px/1.4 "Segoe UI", system-ui, -apple-system, sans-serif;
}
.updates {
	display: flex;
	flex-direction: column;
	height: 100vh;
}
.head {
	padding: 16px 20px 12px;
	border-bottom: 1px solid var(--line);
	background: var(--panel);
}
.head h1 {
	margin: 0 0 4px;
	font-size: 20px;
}
.current {
	margin: 0;
}
.tools {
	margin-top: 10px;
}
.body {
	flex: 1;
	overflow-y: auto;
	padding: 16px 20px 24px;
}
.card {
	margin: 0 0 14px;
	padding: 12px 14px;
	border: 1px solid var(--line);
	border-radius: 8px;
	background: var(--panel);
}
.card p {
	margin: 0 0 6px;
}
.card p:last-child {
	margin-bottom: 0;
}
.card h2 {
	margin: 0 0 8px;
	font-size: 15px;
}
.card.ok {
	border-color: var(--ok);
	color: var(--ok);
}
.card.error {
	border-color: var(--danger);
	color: var(--danger);
}
.card.highlight {
	border-color: var(--accent);
}
.muted {
	color: var(--muted);
}
.small {
	font-size: 12px;
}
button {
	padding: 5px 12px;
	border: 1px solid var(--line);
	border-radius: 6px;
	background: var(--panel);
	color: var(--text);
	font: inherit;
	cursor: pointer;
}
button:hover:not(:disabled) {
	border-color: var(--accent);
}
button:disabled {
	opacity: 0.5;
	cursor: default;
}
button.primary {
	border-color: var(--accent);
	background: var(--accent);
	color: #fff;
}
.row-buttons {
	display: flex;
	gap: 8px;
	margin: 8px 0 6px;
}
.bar {
	height: 8px;
	margin: 8px 0;
	border-radius: 4px;
	background: var(--line);
	overflow: hidden;
}
.fill {
	height: 100%;
	background: var(--accent);
	transition: width 0.2s linear;
}
.releases {
	margin: 8px 0 0;
	padding: 0;
	list-style: none;
}
.release {
	padding: 8px 0;
	border-top: 1px solid var(--line);
}
.release-head {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}
.version {
	font-weight: 600;
}
.tag {
	padding: 1px 6px;
	border-radius: 4px;
	background: var(--line);
	font-size: 11px;
}
.tag.new {
	background: var(--accent);
	color: #fff;
}
.date {
	font-size: 12px;
}
.spacer {
	flex: 1;
}
.link {
	color: var(--accent);
	font-size: 12px;
}
.notes {
	margin: 6px 0 0;
	white-space: pre-wrap;
	color: var(--muted);
	font-size: 12px;
}
</style>
