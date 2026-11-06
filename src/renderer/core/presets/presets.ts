import { nextTick } from "vue";
import { choiceOptions } from "../settings/toActions";
import type { ChoiceControl, SettingControl, SettingsPanelSpec, SliderControl, ToggleControl } from "../settings/types";

/**
 * Per-Pokémon presets: a named copy of a game + species' run and style settings, one JSON file each,
 * at `<userData>/data/presets/<game>/<species>/<name>.json` (ARCHITECTURE §7).
 *
 * The settings panel is the list of what a preset holds: every toggle, choice and slider, by its
 * control id (ids are never renamed, so an old file keeps working), unless the control says
 * `preset: false`. Loading goes through the controls' own `set`, so it does what clicking them does:
 * watchers run and the species' saved settings are overwritten. What isn't a plain control
 * (UI color, manual IVs...) is the generation's `PresetHost`.
 */

export const PRESET_FORMAT = "stp-overlay-preset";
export const PRESET_VERSION = 1;

/** The generation's side of presets; `SettingsPanelSpec.presets`. */
export interface PresetHost {
    /** The game the settings are stored under; a preset belongs to one game + species. */
    game(): string;
    species(): string;
    hasSpecies(name: string): boolean;
    setSpecies(name: string): void;
    /** True while the overlay is loading a species' settings; nothing it sets then is saved. */
    loading(): boolean;
    /** Settings the panel has no plain control for. */
    captureExtra(): Record<string, unknown>;
    /** Runs once the species is set, before the controls (e.g. writes stored looks a control then loads). */
    prepare(extra: Record<string, unknown>): void;
    /** Runs after the controls. */
    applyExtra(extra: Record<string, unknown>): void;
}

export interface Preset {
    format: typeof PRESET_FORMAT;
    version: number;
    game: string;
    species: string;
    controls: Record<string, unknown>;
    extra: Record<string, unknown>;
}

type PresetControl = ToggleControl | ChoiceControl | SliderControl;

function isPresetControl(control: SettingControl): control is PresetControl {
    return (control.kind === "toggle" || control.kind === "choice" || control.kind === "slider") && control.preset !== false;
}

/** In column order, which is also the order they load in: a control another depends on comes first. */
function presetControls(panel: SettingsPanelSpec): PresetControl[] {
    return panel.columns.flatMap((column) => column.groups.flatMap((group) => group.controls.filter(isPresetControl)));
}

/** "always" keeps a value while its control is hidden (the Hidden Power spread in Manual IV mode). */
function inPlay(control: PresetControl): boolean {
    return control.preset === "always" || !control.available || !!control.available();
}

export function capturePreset(panel: SettingsPanelSpec, host: PresetHost): Preset {
    const controls: Record<string, unknown> = {};
    for (const control of presetControls(panel)) {
        if (!inPlay(control)) continue;
        const value = control.get();
        controls[control.id] = control.kind === "toggle" ? !!value : value;
    }
    return { format: PRESET_FORMAT, version: PRESET_VERSION, game: host.game(), species: host.species(), controls, extra: host.captureExtra() };
}

/**
 * Past the watchers a change starts, including the `$nextTick` ones that end a species load. Anything
 * set before that is lost: the settings' save watchers skip while `loading()` is true, and a texture
 * change resets plain filters set in the same tick (overlayCommonMixin's `backgroundTexture` watcher).
 */
async function settle(host: PresetHost): Promise<void> {
    for (let i = 0; i < 50; i++) {
        await nextTick();
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (!host.loading()) return;
    }
}

/** Why a preset can't load, worded for the panel. */
export function refusal(host: PresetHost, preset: Preset): string | null {
    if (preset.game !== host.game()) return `This preset is for ${preset.game}. Select that game first.`;
    if (!host.hasSpecies(preset.species)) return `${preset.species} isn't in ${preset.game}.`;
    return null;
}

/** Sets everything; returns the labels of saved values that no longer fit (a removed dropdown option). */
export async function applyPreset(panel: SettingsPanelSpec, host: PresetHost, preset: Preset): Promise<string[]> {
    const refused = refusal(host, preset);
    if (refused) throw new Error(refused);
    if (preset.species !== host.species()) {
        host.setSpecies(preset.species);
        await settle(host);
    }
    host.prepare(preset.extra);
    await settle(host);

    const skipped: string[] = [];
    for (const control of presetControls(panel)) {
        if (!(control.id in preset.controls) || !inPlay(control)) continue;
        const value = preset.controls[control.id];
        if (control.kind === "toggle") {
            if (!!control.get() === !!value) continue;
            control.set(!!value);
        } else if (control.kind === "slider") {
            if (Number(control.get()) === Number(value)) continue;
            control.set(Number(value));
        } else {
            if (String(control.get()) === String(value)) continue;
            const options = typeof control.options === "function" ? control.options() : control.options;
            const option = choiceOptions(options).find((o) => String(o.value) === String(value));
            if (!option) {
                skipped.push(control.actionLabel ?? (typeof control.label === "string" ? control.label : control.id));
                continue;
            }
            control.set(option.value);
        }
        await settle(host);
    }
    host.applyExtra(preset.extra);
    await settle(host);
    return skipped;
}

/** Reads a preset's text. Throws with a reason fit for the panel. */
export function parsePreset(text: string): Preset {
    let value: any;
    try {
        value = JSON.parse(text);
    } catch {
        throw new Error("That file isn't a preset.");
    }
    if (value?.format !== PRESET_FORMAT || typeof value.game !== "string" || typeof value.species !== "string" || typeof value.controls !== "object" || value.controls === null) {
        throw new Error("That file isn't a preset.");
    }
    if (typeof value.version !== "number" || value.version > PRESET_VERSION) {
        throw new Error("That preset is from a newer version of the overlay.");
    }
    return { ...value, extra: value.extra ?? {} };
}

export function serializePreset(preset: Preset): string {
    return JSON.stringify(preset, null, 2) + "\n";
}

/** A name safe as a file or folder on Windows and a Mac; "" when nothing usable is left. */
export function safeFileName(name: string): string {
    const cleaned = name
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
        .trim()
        .replace(/[. ]+$/, "");
    return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(cleaned) ? `${cleaned}_` : cleaned;
}

/** Relative to the presets folder. */
export function presetFolder(game: string, species: string): string {
    return `${safeFileName(game)}/${safeFileName(species)}`;
}

function dataPath(game: string, species: string, name?: string): string {
    return `presets/${presetFolder(game, species)}${name === undefined ? "" : `/${name}.json`}`;
}

export async function listPresets(game: string, species: string): Promise<string[]> {
    const entries = await window.api.data.list(dataPath(game, species));
    return entries
        .filter((entry) => !entry.directory && entry.name.toLowerCase().endsWith(".json"))
        .map((entry) => entry.name.slice(0, -".json".length))
        .sort((a, b) => a.localeCompare(b));
}

export async function readPreset(game: string, species: string, name: string): Promise<Preset> {
    const text = await window.api.data.read(dataPath(game, species, name));
    if (text === null) throw new Error(`The preset "${name}" is gone.`);
    return parsePreset(text);
}

export async function writePreset(preset: Preset, name: string): Promise<void> {
    await window.api.data.write(dataPath(preset.game, preset.species, name), serializePreset(preset));
}

export async function deletePreset(game: string, species: string, name: string): Promise<void> {
    await window.api.presets.remove(`${presetFolder(game, species)}/${name}.json`);
}

function sameContent(a: string, b: string): boolean {
    try {
        return serializePreset(JSON.parse(a)) === serializePreset(JSON.parse(b));
    } catch {
        return false;
    }
}

/**
 * Keeps a file the user loaded with the other presets and returns its name. A different preset that
 * already has the name is left alone: this one becomes "name (2)".
 */
export async function importPreset(preset: Preset, fileName: string): Promise<string> {
    const base = safeFileName(fileName.replace(/\.json$/i, "")) || "Imported";
    const text = serializePreset(preset);
    const taken = await listPresets(preset.game, preset.species);
    for (let n = 1; ; n++) {
        const name = n === 1 ? base : `${base} (${n})`;
        if (!taken.includes(name)) {
            await writePreset(preset, name);
            return name;
        }
        const existing = await window.api.data.read(dataPath(preset.game, preset.species, name));
        if (existing !== null && sameContent(existing, text)) return name;
    }
}
