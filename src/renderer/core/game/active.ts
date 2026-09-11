import { ref } from "vue";

/**
 * Which GameModule owns the document right now (plan 3.1, brought forward).
 *
 * `null` before a mapper is detected and after one unloads: the pre-mapper screen,
 * which gen1's stores style. gen1's `useSettingsStore` writes `--overlay-color` and
 * `--style_ui_saturation` onto `<html>` on every run-config change, and it is created
 * by the shell for every generation -- so with gen2 active it overwrote the colour
 * gen2's own component had just set (`#a8a878` -> `#000000`) and added a property gen2
 * never sets. Anything generation-specific that reaches the document checks here first.
 */
export const activeModuleId = ref<string | null>(null);

export function setActiveModule(id: string | null): void {
    activeModuleId.value = id;
}

/** True when `id` owns the document, or nothing does yet and `id` is the pre-mapper default. */
export function ownsDocument(id: string, preMapperDefault = "gen1"): boolean {
    return activeModuleId.value === id || (activeModuleId.value === null && id === preMapperDefault);
}
