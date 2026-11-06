import type { PresetHost } from "~/core/presets/presets";
import { GEN4_STYLE_PROPERTIES, MyStorage } from "./storage";

/** Fields with no plain panel control: the color picker's value and the custom background and frame flags. */
const EXTRA_FIELDS = ["overlay_color", "backgroundUrl", "use_custom_background", "frame"] as const;

/** Shared by a whole evolution family, so one member's copy isn't part of its look. */
const FAMILY_SHARED = new Set(["pkmnNature", "pkmn_ability", "pkmn_gender", "hidden_power_type", "hidden_power_index"]);

/**
 * gen4's side of presets (core/presets/presets.ts). With Evolution on each family member has its own
 * stored look, so a preset carries them all: otherwise a refilm would change look at the first evolution.
 */
export function gen4PresetHost(vm: any): PresetHost {
    return {
        game: () => vm.game?.properties?.meta?.game_name?.value || vm.selected_game,
        species: () => vm.starter,
        hasSpecies: (name) => vm.pokemon_list.includes(name),
        setSpecies: (name) => { vm.starter = vm.normalizeSpeciesName(name); },
        loading: () => !!vm.is_loading_evolution_style,
        captureExtra() {
            const extra: Record<string, unknown> = { manual_ivs: vm.manual_ivs };
            for (const field of EXTRA_FIELDS) extra[field] = vm[field];
            if (vm.evolution) {
                const looks: Record<string, Record<string, unknown>> = {};
                for (const member of vm.evolution_family_list) {
                    const stored = MyStorage[vm.getStorageKey(member, true)];
                    if (!stored) continue;
                    const look: Record<string, unknown> = {};
                    for (const prop of GEN4_STYLE_PROPERTIES) if (prop in stored && !FAMILY_SHARED.has(prop)) look[prop] = stored[prop];
                    looks[member] = look;
                }
                extra.family_looks = looks;
            }
            return extra;
        },
        prepare(extra) {
            const looks = (extra.family_looks ?? {}) as Record<string, Record<string, unknown>>;
            for (const [member, look] of Object.entries(looks)) {
                const key = vm.getStorageKey(member, true);
                MyStorage[key] = { ...MyStorage[key], ...look };
            }
        },
        applyExtra(extra) {
            for (const field of EXTRA_FIELDS) if (field in extra) vm[field] = extra[field];
            vm.load_manual_ivs(extra.manual_ivs);
        },
    };
}
