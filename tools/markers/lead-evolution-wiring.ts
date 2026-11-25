/**
 * Runs gen4's mid-run evolution wiring (core/overlay/leadEvolutionMixin.ts plus the gen4 Overlay.vue
 * handlers that call it) over a replay's memory log (memlog.cjs output) and prints what the overlay
 * would have done: every evolution it follows, every starter change, and the tracked lead value.
 *
 *   npx tsx --tsconfig tsconfig.web.json tools/markers/lead-evolution-wiring.ts --mem <log.csv>
 *       --starter Yanma [--game "HeartGold and SoulSilver"] [--evolution true]
 *       [--start-ms N]          mount the overlay at this replay ms (a restart mid-run)
 *       [--debounce-frames 10]  the client's hold on player.team.0.species (gen4 index.ts)
 *       [--expect Yanmega@2878762]  exit 1 unless the overlay follows that evolution within 3 s
 *       [--expect-none]         exit 1 if the overlay follows any evolution
 *
 * The handlers are copied from gen4's Overlay.vue (species, personality value, meta.state, and the
 * starter watcher's evolution part) on Vue's own reactivity, so watchers run on the same scheduler.
 * The client's debounce is emulated on the replay clock: a debounced path is applied after
 * `debounce-frames` + 1 display frames (60 Hz) with no newer change. Each other change is applied in log
 * order as it lands, with its callbacks called, as gameHookMapperClient does.
 */
import fs from "node:fs";
import { reactive, watch, nextTick } from "vue";
import { leadEvolutionMixin } from "../../src/renderer/core/overlay/leadEvolutionMixin";
import * as hgssModule from "../../src/renderer/games/gen4/data/pokedex/heartgold_soulsilver.js";
import * as platModule from "../../src/renderer/games/gen4/data/pokedex/platinum.js";
// The dex files are plain .js under a package without "type": "module"; tsx may hand them over as CommonJS.
const pokedex_hgss = (hgssModule as any).pokedex_hgss ?? (hgssModule as any).default?.pokedex_hgss;
const pokedex_plat = (platModule as any).pokedex_plat ?? (platModule as any).default?.pokedex_plat;

const args: Record<string, string> = {};
for (let i = 2; i < process.argv.length; i++) {
	const k = process.argv[i].slice(2);
	const v = process.argv[i + 1];
	if (v === undefined || v.startsWith("--")) args[k] = "true";
	else { args[k] = v; i++; }
}
const GAME = args.game ?? "HeartGold and SoulSilver";
const DEX: any = GAME === "Platinum" ? pokedex_plat : pokedex_hgss;
const DEBOUNCED = ["player.team.0.species"];
const HOLD_MS = ((+(args["debounce-frames"] ?? 10)) + 1) * 1000 / 60;
const START_MS = +(args["start-ms"] ?? 0);

// --- the property tree --------------------------------------------------------------------------------
const listeners = new Map<string, Function[]>();
const root: any = {};
const nodeAt = (path: string): any => {
	let n = root;
	for (const k of path.split(".")) {
		if (!Object.prototype.hasOwnProperty.call(n, k)) {
			const child: any = {};
			Object.defineProperty(child, "value", { enumerable: false, writable: true, value: null });
			Object.defineProperty(child, "bytes", { enumerable: false, writable: true, value: null });
			Object.defineProperty(child, "__path", { enumerable: false, writable: true, value: "" });
			Object.defineProperty(child, "change", { enumerable: false, value: (fn: Function) => { const l = listeners.get(child.__path) ?? []; l.push(fn); listeners.set(child.__path, l); } });
			n[k] = child;
		}
		n = n[k];
	}
	n.__path = path;
	return n;
};
const WANT = /^(player\.team\.0\.|meta\.(state|game_name)$|overworld\.map_index$|battle\.player\.pkmn_ram)/;
const events: [number, number, string, any][] = [];
for (const line of fs.readFileSync(args.mem, "utf8").split("\n")) {
	const a = line.indexOf(","), b = line.indexOf(",", a + 1);
	if (a < 0 || b < 0) continue;
	const path = line.slice(a + 1, b);
	if (!WANT.test(path)) continue;
	const key = line.slice(0, a), at = key.indexOf("@");
	events.push([+key.slice(0, at), +key.slice(at + 1), path, JSON.parse(line.slice(b + 1))]);
}
for (const e of events) nodeAt(e[2]);
nodeAt("meta.game_name").value = GAME;
for (const p of ["player.team.0.species", "player.team.0.internals.personality_value", "meta.state", "overworld.map_index"]) nodeAt(p);

// --- the overlay (the parts the evolution check reads and writes) --------------------------------------
// --seed '{"<game>_Yanmega":{"selected_evolution_species":"Yanma"}}': stored values from an earlier session.
const storage: Record<string, any> = args.seed ? JSON.parse(args.seed) : {};
const log: string[] = [];
let nowMs = 0, nowFrame = 0;
const say = (s: string) => log.push(`${nowFrame}@${Math.round(nowMs)} ${s}`);
const followed: { species: string; ms: number }[] = [];

const mixin = leadEvolutionMixin(storage, { dex: (vm: any) => vm.g4PokemonData, flagsInEvoStateKey: true });
const vm: any = reactive({
	game: { properties: root },
	starter: args.starter,
	evolution: args.evolution === undefined ? true : args.evolution === "true" ? true : args.evolution === "false" ? false : args.evolution,
	evolution_splits_label: "",
	selected_evolution_species: args.starter,
	evolution_family_list: [] as string[],
	last_known_species: null,
	last_known_personality_value: null,
	evolution_lead_pvs: [] as number[],
	evolution_transitioning: false,
	stats_setting: "Automatic",
	show_evolved_base_stats: false,
	evolved_species_for_stats: null,
	attempt_number: 3, finished_run_count: 0, playerResets: 0, blackout_counter: 0,
	get g4PokemonData() { return DEX; },
	resolveIncomingSpecies(raw: any) { return raw; },
	getEvolutionFamily(species: string) {
		const fam = DEX[species]?.evolution_family;
		return fam?.length ? fam.map((m: any) => m.species).filter((s: any) => s != null) : [species];
	},
	updateEvolutionFamilyList() {
		this.evolution_family_list = this.getEvolutionFamily(this.starter);
		if (this.evolution_family_list.length <= 1 && this.evolution) this.evolution = false;
	},
	getEvolutionStateStorageKey() { return `evoState_${GAME}_${this.starter}`; },
	async performEvolutionTransition(oldSpecies: string, newSpecies: string) {
		say(`transition ${oldSpecies} -> ${newSpecies}`);
	},
	...mixin.methods,
});
// Methods called through the proxy, as Vue binds them.
for (const k of Object.keys(mixin.methods)) vm[k] = (mixin.methods as any)[k].bind(vm);
const origCheck = vm.checkLeadEvolution;
vm.checkLeadEvolution = async (oldProp: any = null) => {
	const evolved = vm.leadEvolvedSpecies(oldProp);
	const ok = await origCheck(oldProp);
	if (ok) { say(`EVOLUTION followed -> ${evolved}`); followed.push({ species: evolved, ms: nowMs }); }
	return ok;
};

// starter watcher: gen4 Overlay.vue `starter(newValue, oldValue)`, its evolution parts
watch(() => vm.starter, (newValue: string, oldValue: string) => {
	say(`starter ${oldValue} -> ${newValue}`);
	vm.trackEvolutionLead();
	vm.updateEvolutionFamilyList();
	if (vm.evolution && vm.evolution_family_list.length > 0) {
		const stored = storage[`${GAME}_${newValue}`]?.selected_evolution_species;
		vm.selected_evolution_species = stored && vm.evolution_family_list.includes(stored) ? stored : newValue;
	}
	if (vm.evolution != true) {
		const key = vm.getEvolutionStateStorageKey();
		vm.evolution = storage[key]?.evolution ?? storage[`${GAME}_${newValue}`]?.evolution ?? false;
		vm.attempt_number = storage[`${GAME}_${newValue}`]?.attempt_number ?? 0;
		say(`  evolution flag reloaded for ${newValue}: ${vm.evolution}, attempt ${vm.attempt_number}`);
	}
});
watch(() => JSON.stringify(vm.evolution_lead_pvs), (v: any, o: any) => say(`evolution_lead_pvs ${o} -> ${v}`));

function mount() {
	say(`mount: starter ${vm.starter}, lead ${root.player.team[0].species.value} pv ${root.player.team[0].internals.personality_value.value}`);
	storage[`evoState_${GAME}_${vm.starter}`] = { evolution: vm.evolution };
	vm.updateEvolutionFamilyList();
	vm.last_known_personality_value = root.player.team[0].internals.personality_value.value;
	vm.last_known_species = vm.resolveIncomingSpecies(root.player.team[0].species.value);
	vm.trackEvolutionLead();
	const OLD = args.code === "old";
	nodeAt("player.team.0.internals.personality_value").change(async (newProp: any) => {
		vm.last_known_personality_value = newProp.value;
		if (OLD) return;
		vm.trackEvolutionLead();
		vm.checkLeadEvolution();
	});
	nodeAt("player.team.0.species").change(async (newProp: any, oldProp: any) => {
		const currentPersonalityValue = root.player.team[0].internals.personality_value.value;
		const state = root.meta.state.value;
		const incomingSpecies = vm.resolveIncomingSpecies(newProp.value);
		if (OLD) {
			// gen4 Overlay.vue before 3f90daa6: the check ran only here and needed a real old species.
			const normalizedOld = vm.resolveIncomingSpecies(oldProp?.value);
			if (vm.evolution == true && incomingSpecies != normalizedOld &&
				currentPersonalityValue === vm.last_known_personality_value && vm.last_known_personality_value != null) {
				const family = (DEX[vm.starter]?.evolution_family ?? []).map((o: any) => o.species).filter((s: any) => s != null);
				let oldPropValid = false;
				if (oldProp && oldProp.value != null) {
					oldPropValid = Array.isArray(oldProp.bytes) ? !(oldProp.bytes.length === 2 && oldProp.bytes[0] === 0 && oldProp.bytes[1] === 0) : true;
				}
				if (family.includes(incomingSpecies) && oldPropValid && incomingSpecies != vm.starter) {
					const oldSpecies = vm.starter;
					vm.starter = incomingSpecies;
					vm.last_known_species = incomingSpecies;
					vm.selected_evolution_species = incomingSpecies;
					say(`EVOLUTION followed -> ${incomingSpecies} (old code), from ${oldSpecies}`);
					followed.push({ species: incomingSpecies, ms: nowMs });
					vm.last_known_personality_value = currentPersonalityValue;
					return;
				}
			}
		} else {
			vm.trackEvolutionLead();
			if (await vm.checkLeadEvolution(oldProp)) return;
		}
		if (newProp.value) {
			vm.last_known_species = incomingSpecies;
			vm.last_known_personality_value = currentPersonalityValue;
			let shouldUpdateStarter = false;
			if (vm.evolution && vm.evolution_family_list.length > 0) {
				if (vm.evolution_family_list.includes(incomingSpecies)) shouldUpdateStarter = true;
			} else shouldUpdateStarter = true;
			if (shouldUpdateStarter) {
				if ((state == "Battle" || state == "From Battle") && root.battle?.player?.pkmn_ram?.pokemon_0_ram?.stats?.hp?.value != 0) vm.starter = incomingSpecies;
				else if (state == "Overworld") vm.starter = incomingSpecies;
			}
		}
	});
	nodeAt("meta.state").change(() => { vm.checkLeadEvolution(); });
}

// --- the clock: log order, debounced paths held -------------------------------------------------------
const pending = new Map<string, { due: number; value: any; frame: number }>();
const apply = async (path: string, value: any) => {
	const n = nodeAt(path);
	const old = { value: n.value, bytes: n.bytes };
	if (old.value === value) return;
	n.value = value;
	n.bytes = value == null || value === 0 ? [0, 0] : null;
	for (const fn of listeners.get(path) ?? []) await fn({ value, bytes: n.bytes }, old);
	await nextTick();
};
const flushDue = async (upTo: number) => {
	for (const [path, p] of [...pending].sort((a, b) => a[1].due - b[1].due)) {
		if (p.due > upTo) continue;
		pending.delete(path);
		const keep = nowMs; nowMs = p.due;
		await apply(path, p.value);
		nowMs = Math.max(keep, nowMs);
	}
};

(async () => {
	const origLog = console.log; console.log = () => {};
	let mounted = false;
	for (const [frame, ms, path, value] of events) {
		await flushDue(ms);
		nowFrame = frame; nowMs = ms;
		if (!mounted && ms >= START_MS) {
			await flushDue(Infinity);
			mount(); mounted = true; await nextTick();
		}
		if (!mounted) { nodeAt(path).value = value; continue; }
		if (DEBOUNCED.some((d) => path.startsWith(d))) { pending.set(path, { due: ms + HOLD_MS, value, frame }); continue; }
		await apply(path, value);
	}
	await flushDue(Infinity);
	console.log = origLog;
	process.stdout.write(log.join("\n") + "\n");
	process.stdout.write(`final: starter ${vm.starter}, selected ${vm.selected_evolution_species}, evolution ${vm.evolution}, lead pvs ${JSON.stringify(vm.evolution_lead_pvs ?? vm.evolution_lead_pv)}\n`);
	if (args.expect) {
		const [sp, at] = args.expect.split("@");
		// Followed means the art shows it at the end too (selected_evolution_species is what the art draws).
		const hit = vm.selected_evolution_species === sp ? followed.find((f) => f.species === sp && f.ms >= +at && f.ms <= +at + 3000) : undefined;
		if (vm.selected_evolution_species !== sp) process.stdout.write(`art shows ${vm.selected_evolution_species}\n`);
		const others = followed.filter((f) => f !== hit);
		process.stdout.write(hit ? `PASS: followed ${sp} at ${Math.round(hit.ms)}\n` : `FAIL: ${sp} near ${at} not followed\n`);
		if (others.length) process.stdout.write(`FAIL: other evolutions followed: ${others.map((f) => `${f.species}@${Math.round(f.ms)}`).join(", ")}\n`);
		process.exit(hit && !others.length ? 0 : 1);
	}
	if (args["expect-none"]) {
		process.stdout.write(followed.length ? `FAIL: followed ${followed.map((f) => f.species).join(", ")}\n` : "PASS: no evolution followed\n");
		process.exit(followed.length ? 1 : 0);
	}
})();
