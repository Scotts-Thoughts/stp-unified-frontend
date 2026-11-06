/**
 * Self-test of core/presets/presets.ts against a fake overlay that behaves like gen2-5's in the ways
 * that matter: a species change loads that species' settings a tick later and ignores saves meanwhile,
 * dropdown options depend on other controls, and a texture change resets plain filters.
 *
 *   npm run parity:presets
 */
import assert from "node:assert/strict";
import { nextTick, reactive, watch } from "vue";
import { applyPreset, capturePreset, parsePreset, refusal, safeFileName, serializePreset, type PresetHost } from "../../src/renderer/core/presets/presets";
import type { SettingsPanelSpec } from "../../src/renderer/core/settings/types";

const SPREADS: Record<string, string[]> = { Dark: ["0", "1"], Fire: ["0", "1", "2", "3"] };
const ABILITIES: Record<string, string[]> = { Houndoom: ["Early Bird", "Flash Fire"], Staryu: ["Illuminate", "Natural Cure"] };

function makeOverlay() {
    /** What the species remember: the point of "a preset replaces the species' settings". */
    const storage: Record<string, Record<string, unknown>> = {};
    const vm = reactive({
        game: "Platinum", starter: "Houndoom", loading: false,
        ability: "Early Bird", hp: "Dark", index: "0", ivMode: "Automatic",
        timer: false, texture: "Water", brightness: 100, color: "#000000", ivs: 31, panel: "Automatic",
        counter: 7,
    });
    const load = (species: string) => {
        vm.loading = true;
        const saved = storage[species] ?? {};
        vm.ability = (saved.ability as string) ?? ABILITIES[species][0];
        vm.hp = (saved.hp as string) ?? "Dark";
        vm.index = (saved.index as string) ?? "0";
        vm.color = (saved.color as string) ?? "#000000";
        // Not over at the next tick: a late end must still be waited for, or what a preset sets now is never saved.
        setTimeout(() => { vm.loading = false; }, 5);
    };
    watch(() => vm.starter, load);
    for (const field of ["ability", "hp", "index", "color"] as const) {
        watch(() => vm[field], (value) => {
            if (vm.loading) return;
            (storage[vm.starter] ??= {})[field] = value;
        }, { flush: "sync" });
    }
    // overlayCommonMixin's rule: a plain filter becomes the new texture's look.
    watch(() => vm.texture, () => { if (vm.brightness === 100) vm.brightness = 80; });

    const panel: SettingsPanelSpec = {
        showAdvanced: () => true,
        isDev: () => false,
        columns: [
            { groups: [{ title: "Advanced", controls: [
                { kind: "toggle", id: "shuckie.timer", get: () => vm.timer, set: (v) => { vm.timer = v; } },
                { kind: "toggle", id: "settings.debugging_mode", preset: false, get: () => false, set: () => { throw new Error("preset: false was set"); } },
            ] }] },
            { groups: [{ title: "Counters", controls: [
                { kind: "counter", id: "counter.attempts", get: () => vm.counter, increment: () => vm.counter++, decrement: () => vm.counter-- },
            ] }] },
            { groups: [{ title: "Pokemon", controls: [
                { kind: "choice", id: "ivs.mode", options: ["Automatic", "Manual"], get: () => vm.ivMode, set: (v) => { vm.ivMode = v; } },
                { kind: "choice", id: "hidden_power.type", preset: "always", available: () => vm.ivMode === "Automatic", options: ["Dark", "Fire"], get: () => vm.hp, set: (v) => { vm.hp = v; } },
                { kind: "choice", id: "hidden_power.index", preset: "always", available: () => vm.ivMode === "Automatic", options: () => SPREADS[vm.hp], get: () => vm.index, set: (v) => { vm.index = v; } },
                { kind: "choice", id: "ability", options: () => ABILITIES[vm.starter], get: () => vm.ability, set: (v) => { vm.ability = v; } },
                { kind: "toggle", id: "encounters.other_game", available: () => false, get: () => true, set: () => { throw new Error("an unavailable control was set"); } },
            ] }] },
            { groups: [{ title: "Style", controls: [
                { kind: "choice", id: "right_panel", options: ["Automatic", "Splits"], get: () => vm.panel, set: (v) => { vm.panel = v; } },
                { kind: "choice", id: "style.background_texture", options: ["Water", "Fire"], get: () => vm.texture, set: (v) => { vm.texture = v; } },
                { kind: "slider", id: "slider.backgroundBrightness", min: 0, max: 200, get: () => vm.brightness, set: (v) => { vm.brightness = v; } },
            ] }] },
        ],
    };
    const host: PresetHost = {
        game: () => vm.game,
        species: () => vm.starter,
        hasSpecies: (name) => name in ABILITIES,
        setSpecies: (name) => { vm.starter = name; },
        loading: () => vm.loading,
        captureExtra: () => ({ color: vm.color, ivs: vm.ivs }),
        prepare: () => {},
        applyExtra: (extra) => { vm.color = extra.color as string; vm.ivs = extra.ivs as number; },
    };
    return { vm, panel, host, storage };
}

async function main(): Promise<void> {
    const a = makeOverlay();
    Object.assign(a.vm, { timer: true, hp: "Fire", index: "3", ability: "Flash Fire", texture: "Fire", color: "#123456", ivs: 12, panel: "Splits" });
    await nextTick();
    a.vm.brightness = 100; // a hand-picked plain filter on a texture whose look isn't plain
    await nextTick();
    const preset = parsePreset(serializePreset(capturePreset(a.panel, a.host)));

    assert.equal(preset.game, "Platinum");
    assert.equal(preset.species, "Houndoom");
    assert.ok(!("settings.debugging_mode" in preset.controls), "preset: false is left out");
    assert.ok(!("counter.attempts" in preset.controls), "run counters are left out");
    assert.ok(!("encounters.other_game" in preset.controls), "an unavailable control is left out");

    // Everything different, on another species: loading must switch and bring all of it back.
    const b = makeOverlay();
    b.vm.starter = "Staryu";
    await new Promise((resolve) => setTimeout(resolve, 20));
    b.vm.counter = 3;
    assert.deepEqual(await applyPreset(b.panel, b.host, preset), []);
    for (const field of ["starter", "timer", "hp", "index", "ability", "texture", "color", "ivs", "panel"] as const) {
        assert.equal(b.vm[field], a.vm[field], `${field} after load`);
    }
    assert.equal(b.vm.brightness, 100, "a plain filter survives its texture's look");
    assert.equal(b.vm.counter, 3, "a load leaves the run counters alone");
    // Saved for next time: the species' own settings now hold the preset's values.
    assert.deepEqual(b.storage.Houndoom, { hp: "Fire", index: "3", ability: "Flash Fire", color: "#123456" });

    // The Hidden Power spread comes back even while Manual IVs hide its dropdowns.
    const c = makeOverlay();
    Object.assign(c.vm, { ivMode: "Manual", hp: "Fire", index: "2" });
    await nextTick();
    const manual = capturePreset(c.panel, c.host);
    assert.equal(manual.controls["hidden_power.index"], "2");
    const d = makeOverlay();
    await applyPreset(d.panel, d.host, manual);
    assert.equal(d.vm.index, "2");

    // A value that no longer fits is reported, and the rest still loads.
    const e = makeOverlay();
    const stale = { ...preset, controls: { ...preset.controls, ability: "Removed Ability" } };
    assert.deepEqual(await applyPreset(e.panel, e.host, stale), ["ability"]);
    assert.equal(e.vm.hp, "Fire");

    // Another game is refused, and refusing changes nothing.
    const f = makeOverlay();
    f.vm.game = "HeartGold and SoulSilver";
    assert.equal(refusal(f.host, preset), "This preset is for Platinum. Select that game first.");
    await assert.rejects(applyPreset(f.panel, f.host, preset), /Select that game first/);
    assert.equal(f.vm.timer, false);

    assert.throws(() => parsePreset("not json"), /isn't a preset/);
    assert.throws(() => parsePreset("{}"), /isn't a preset/);
    assert.throws(() => parsePreset(JSON.stringify({ ...preset, version: 99 })), /newer version/);

    assert.equal(safeFileName('a/b:c?'), "a_b_c_");
    assert.equal(safeFileName("  run 2.  "), "run 2");
    assert.equal(safeFileName("CON"), "CON_");
    assert.equal(safeFileName("..."), "");
    assert.equal(safeFileName("Nidoran♀"), "Nidoran♀");

    console.log("presets self-test passed");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
