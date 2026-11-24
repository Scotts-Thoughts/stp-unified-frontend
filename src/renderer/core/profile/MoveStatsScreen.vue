<template>
    <div id="stp-move-stats" class="ms-screen" role="dialog" aria-label="Move stats">
        <div class="ms-head">
            <img class="ms-picture" :src="pictureSrc" alt="" draggable="false" @error="pictureBroken = true" />
            <h2 class="ms-title">{{ profile ? profile.name : "No profile" }}: move stats</h2>
            <span class="ms-spacer"></span>
            <button class="ms-button" @click="$emit('close')">Close (Esc)</button>
        </div>

        <div v-if="!profile" class="ms-empty">Make a profile with “New profile”. Battles the router records are added to it.</div>
        <template v-else>
            <div class="ms-tabs" role="tablist">
                <button
                    v-for="b in tabs"
                    :key="b.key"
                    :class="['ms-tab', { 'ms-tab-on': b.key === current }]"
                    role="tab"
                    :aria-selected="b.key === current"
                    @click="current = b.key"
                >
                    {{ b.label }}
                </button>
            </div>

            <div class="ms-body">
                <div v-if="!bucket || bucketEmpty" class="ms-empty">No battles counted for {{ currentLabel }} yet.</div>
                <template v-else>
                    <section v-for="side in sides" :key="side.key" class="ms-section">
                        <h3 class="ms-heading">{{ side.title }}</h3>
                        <div v-if="side.summary" class="ms-note ms-summary">{{ side.summary }}</div>
                        <div v-if="!side.main.length && !side.quiet.length" class="ms-note">No moves recorded.</div>
                        <table v-if="side.main.length" class="ms-table">
                            <thead>
                                <tr>
                                    <th class="ms-left">Move</th>
                                    <th>Uses</th>
                                    <th>Hit rate</th>
                                    <th>Expected</th>
                                    <th>Listed</th>
                                    <th>{{ side.key === 'player' ? 'Crits' : 'Crits taken' }}</th>
                                    <th>{{ side.key === 'player' ? 'Effect' : 'Effects on you' }}</th>
                                    <th>Luck</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="row in side.main" :key="row.name">
                                    <td class="ms-left"><span class="ms-type" :style="{ background: row.colour }"></span>{{ row.name }}</td>
                                    <td>{{ row.uses }}</td>
                                    <td>{{ row.hitRate }}</td>
                                    <td>{{ row.expected }}</td>
                                    <td>{{ row.listed }}</td>
                                    <td>{{ row.crits }}</td>
                                    <td :title="row.effectTitle">{{ row.effect }}</td>
                                    <td><span v-if="row.luck" :class="['ms-chip', `ms-chip-${row.luck}`]">{{ luckLabels[row.luck] }}</span></td>
                                </tr>
                            </tbody>
                        </table>
                        <details v-if="side.quiet.length" class="ms-quiet">
                            <summary>Never-miss and no-luck moves ({{ side.quiet.length }})</summary>
                            <table class="ms-table">
                                <tbody>
                                    <tr v-for="row in side.quiet" :key="row.name">
                                        <td class="ms-left"><span class="ms-type" :style="{ background: row.colour }"></span>{{ row.name }}</td>
                                        <td>{{ row.uses }} uses</td>
                                        <td>{{ row.crits }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </details>
                    </section>

                    <section class="ms-section">
                        <h3 class="ms-heading">Runs</h3>
                        <table class="ms-table ms-runs">
                            <thead>
                                <tr>
                                    <th class="ms-left">Date</th>
                                    <th class="ms-left">Pokémon</th>
                                    <th class="ms-left">Game</th>
                                    <th>Battles counted</th>
                                    <th>Not counted</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="run in runs" :key="run.run_id" :class="{ 'ms-removed': run.removed }">
                                    <td class="ms-left">{{ formatDate(run.started) }}</td>
                                    <td class="ms-left">{{ run.species || "?" }}</td>
                                    <td class="ms-left">{{ run.game }}</td>
                                    <td>{{ run.battle_ids.length }}</td>
                                    <td :title="'Battles seen while re-filming mode or a test run was on, or after the run was removed'">{{ run.skipped_battle_ids.length }}</td>
                                    <td class="ms-right">
                                        <span v-if="run.removed" class="ms-note">Removed</span>
                                        <template v-else-if="confirmRun === run.run_id">
                                            <button class="ms-button ms-danger" @click="removeRun(run.run_id)">Remove</button>
                                            <button class="ms-button" @click="confirmRun = null">Cancel</button>
                                        </template>
                                        <button v-else class="ms-button" @click="confirmRun = run.run_id">Remove from profile</button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </section>
                </template>
            </div>
        </template>
    </div>
</template>

<script lang="ts">
/**
 * The move-stats screen (move-stats spec §4.2): a full-window panel over the start
 * screen with one tab per game bucket, the active profile's moves and the enemy's
 * moves against it, and the runs that fed the bucket. Esc or the button closes it.
 */
import { defineComponent } from "vue";
import { BUCKETS, bucketLabel } from "./buckets";
import { critLuck, effectLuck, LUCK_LABELS, moveLuck, sortedMoves, type Luck, type MoveCounts, type SideCounts } from "./counts";
import { DEFAULT_PICTURE, pictureUrl } from "./pictures";
import { activeProfile, loadProfiles, profileState, removeRunFromProfile } from "./profiles";
import { typeColour } from "./typeColours";

interface Row {
    name: string;
    colour: string;
    uses: number;
    hitRate: string;
    expected: string;
    listed: string;
    crits: string;
    effect: string;
    effectTitle: string;
    luck: Luck | null;
}

const pct = (n: number, of: number, digits = 0) => (of > 0 ? `${((100 * n) / of).toFixed(digits)}%` : "—");
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function row(name: string, c: MoveCounts, mine: boolean): Row {
    const accRolls = n(c.acc_rolls);
    const critRolls = n(c.crit_rolls);
    const effectRolls = n(c.effect_rolls);
    const critLabel = critLuck(c, mine);
    let crits = critRolls > 0 ? `${n(c.crits)} / ${critRolls} (${pct(n(c.crits), critRolls)}) · exp ${pct(n(c.expected_crits), critRolls)}` : "—";
    if (critLabel && critLabel !== "on-par") crits += ` · ${LUCK_LABELS[critLabel].toLowerCase()}`;
    let effect = effectRolls > 0 ? `${n(c.effects)} of ${effectRolls} · exp ${n(c.expected_effects).toFixed(1)}` : "—";
    const effectLabel = effectLuck(c, mine);
    if (effectLabel && effectLabel !== "on-par" && n(c.acc_rolls) >= effectRolls) effect += ` · ${LUCK_LABELS[effectLabel].toLowerCase()}`;
    if (n(c.effect_blocked) > 0) effect += ` (${n(c.effect_blocked)} blocked)`;
    const kind = c.effect_kind ? c.effect_kind.replace(/_/g, " ") : "";
    const chance = c.listed_effect_chance != null ? `${Math.round(n(c.listed_effect_chance))}% ` : "";
    return {
        name,
        colour: typeColour(c.type),
        uses: n(c.uses),
        hitRate: accRolls > 0 ? `${pct(n(c.hits), accRolls)} (${n(c.hits)}/${accRolls})` : "—",
        expected: pct(n(c.expected_hits), accRolls),
        listed: c.listed_accuracy != null ? `${c.listed_accuracy}%` : "—",
        crits,
        effect,
        effectTitle: kind ? `${chance}chance: ${kind}. Blocked = the effect couldn't happen (already statused, stat at its limit, immune).` : "",
        luck: moveLuck(c, mine),
    };
}

function rows(side: SideCounts | undefined, mine: boolean): { main: Row[]; quiet: Row[] } {
    const { main, quiet } = sortedMoves(side ?? {});
    return { main: main.map(([k, c]) => row(k, c, mine)), quiet: quiet.map(([k, c]) => row(k, c, mine)) };
}

export default defineComponent({
    props: {
        /** The bucket to open on: the game loaded or last picked. */
        initialBucket: { type: String as () => string | null, default: null },
    },
    emits: ["close"],
    data() {
        return {
            current: this.initialBucket as string | null,
            confirmRun: null as string | null,
            luckLabels: LUCK_LABELS,
            pictureBroken: false,
        };
    },
    computed: {
        profile() {
            void profileState.activeId;
            return activeProfile();
        },
        pictureSrc(): string {
            return pictureUrl(this.pictureBroken ? DEFAULT_PICTURE : this.profile?.picture);
        },
        /** Buckets with data, plus the one opened on, in the overlay's game order. */
        tabs() {
            const have = new Set(Object.keys(this.profile?.buckets ?? {}));
            if (this.current) have.add(this.current);
            const list = BUCKETS.filter((b) => have.has(b.key));
            return list.length ? list : BUCKETS.slice(0, 1);
        },
        currentLabel(): string {
            return this.current ? bucketLabel(this.current) : "";
        },
        bucket() {
            return this.current ? (this.profile?.buckets[this.current] ?? null) : null;
        },
        bucketEmpty(): boolean {
            const b = this.bucket;
            return !b || (Object.keys(b.player).length === 0 && Object.keys(b.enemy).length === 0 && b.runs.length === 0);
        },
        sides() {
            const b = this.bucket;
            const other = b?.other ?? {};
            const me = rows(b?.player, true);
            const them = rows(b?.enemy, false);
            const crits = n(other.enemy_crits);
            const misses = n(other.enemy_misses);
            return [
                { key: "player", title: "Your moves", summary: "", ...me },
                { key: "enemy", title: "Enemy moves", summary: crits || misses ? `Crits taken: ${crits} · Enemy misses: ${misses}` : "", ...them },
            ];
        },
        runs() {
            return [...(this.bucket?.runs ?? [])].sort((a, b) => b.started.localeCompare(a.started));
        },
    },
    watch: {
        tabs: {
            immediate: true,
            handler(list: { key: string }[]) {
                if (!this.current || !list.some((b) => b.key === this.current)) this.current = list[0]?.key ?? null;
            },
        },
    },
    mounted() {
        void loadProfiles();
        window.addEventListener("keydown", this.onKey, true);
    },
    unmounted() {
        window.removeEventListener("keydown", this.onKey, true);
    },
    methods: {
        onKey(e: KeyboardEvent) {
            if (e.key === "Escape") {
                e.stopPropagation();
                this.$emit("close");
            }
        },
        formatDate(iso: string): string {
            const d = new Date(iso);
            return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
        },
        async removeRun(runId: string) {
            if (this.profile && this.current) await removeRunFromProfile(this.profile.id, this.current, runId);
            this.confirmRun = null;
        },
    },
});
</script>

<style scoped>
/* New classes only (ms-*). Laid out on the 1920x1080 canvas, over the start screen. */
.ms-screen {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    padding: 32px 48px;
    background: #0d0d0d;
    color: #e8e8e8;
    font-family: play, sans-serif;
    font-size: 18px;
    user-select: text;
}
.ms-head {
    display: flex;
    align-items: center;
    gap: 14px;
}
.ms-picture {
    width: 56px;
    height: 56px;
    object-fit: contain;
}
.ms-title {
    font-size: 30px;
    font-weight: 700;
}
.ms-spacer {
    flex: 1;
}
.ms-button {
    height: 34px;
    padding: 0 14px;
    border: 1px solid #ffffff30;
    border-radius: 6px;
    background: #2a2a2a;
    color: #e8e8e8;
    font-family: inherit;
    font-size: 16px;
    cursor: pointer;
}
.ms-button:hover {
    background: #3a3a3a;
}
.ms-danger {
    color: #ff8a80;
}
.ms-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 18px 0 12px;
}
.ms-tab {
    padding: 6px 14px;
    border: 1px solid #ffffff25;
    border-radius: 16px;
    background: transparent;
    color: #b8b8b8;
    font-family: inherit;
    font-size: 16px;
    cursor: pointer;
}
.ms-tab-on {
    border-color: #11ce18;
    color: #11ce18;
    font-weight: 700;
}
.ms-body {
    flex: 1;
    overflow-y: auto;
    padding-right: 8px;
}
.ms-empty {
    margin-top: 40px;
    color: #9a9a9a;
    font-size: 20px;
    text-align: center;
}
.ms-section {
    margin-bottom: 26px;
}
.ms-heading {
    margin-bottom: 8px;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: #9a9a9a;
}
.ms-note {
    color: #8c8c8c;
}
.ms-summary {
    margin-bottom: 6px;
}
.ms-table {
    width: 100%;
    border-collapse: collapse;
}
.ms-table th,
.ms-table td {
    padding: 5px 10px;
    text-align: right;
    white-space: nowrap;
}
.ms-table th {
    font-size: 15px;
    font-weight: 700;
    color: #8c8c8c;
    border-bottom: 1px solid #ffffff20;
}
.ms-table tbody tr:nth-child(odd) {
    background: #ffffff08;
}
.ms-table .ms-left {
    text-align: left;
}
.ms-table .ms-right {
    text-align: right;
}
.ms-type {
    display: inline-block;
    width: 12px;
    height: 12px;
    margin-right: 8px;
    border-radius: 3px;
    vertical-align: -1px;
}
.ms-quiet {
    margin-top: 10px;
    color: #a8a8a8;
}
.ms-quiet summary {
    cursor: pointer;
    margin-bottom: 6px;
}
.ms-chip {
    display: inline-block;
    padding: 1px 10px;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 700;
}
.ms-chip-very-lucky {
    background: #11ce18;
    color: #062b07;
}
.ms-chip-lucky {
    background: #11ce1840;
    color: #7cf07f;
}
.ms-chip-on-par {
    background: #ffffff18;
    color: #c8c8c8;
}
.ms-chip-unlucky {
    background: #ff5a4a40;
    color: #ff9a8f;
}
.ms-chip-very-unlucky {
    background: #ff5a4a;
    color: #2b0804;
}
.ms-removed td {
    color: #6a6a6a;
    text-decoration: line-through;
}
.ms-removed td:last-child {
    text-decoration: none;
}
</style>
