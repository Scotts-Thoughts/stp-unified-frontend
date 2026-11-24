/**
 * "Copy Solo Style" in the Evolution group (gens 3-5, the generations with evolution lines).
 *
 * A species has two stored looks: its solo look (`<Game>_<Species>`, used while Evolution is off) and its look inside
 * its evolution line (`<Game>_<FullyEvolved>-line-<Species>`, used while Evolution is on). This copies the first into
 * the second for the species picked in "Evolution Family Style", so a Pokémon already styled on its own doesn't have
 * to be styled again for its evolution box.
 *
 * The copy goes through the overlay's own `loadEvolutionStyle`: the solo look is loaded into the overlay (which fills
 * in the generation's defaults for anything the solo entry doesn't store, so the result looks exactly like the solo
 * overlay), those values are written to the line key, and the line look is loaded back. `loadEvolutionStyle` holds
 * `is_loading_evolution_style` while it runs, so the save watchers don't write the solo values anywhere else.
 *
 * `storage` is the generation's `MyStorage` (core never imports games/, ARCHITECTURE §10).
 */

/** The look fields `loadEvolutionStyle` reads from a species key in every one of gens 3-5 (`frame`: gen3 only). */
export const SOLO_LOOK_FIELDS: readonly string[] = [
    "overlay_color",
    "ui_saturation",
    "imageXOffset",
    "imageYOffset",
    "imageScale",
    "imageFlip",
    "imageSat",
    "imageRotation",
    "frame",
    "backgroundTexture",
    "backgroundBlur",
    "backgroundHue",
    "backgroundScale",
    "backgroundUrl",
    "backgroundFlip",
    "backgroundXFlip",
    "use_custom_background",
    "backgroundXOffset",
    "backgroundYOffset",
    "backgroundBrightness",
    "backgroundContrast",
    "backgroundSaturation",
];

/** True when a stored species value holds at least one look field (an entry with only, say, an ability isn't a style). */
export function hasStoredLook(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;
    return SOLO_LOOK_FIELDS.some((field) => field in (value as Record<string, unknown>));
}

export function soloStyleCopyMixin(storage: Record<string, any>) {
    return {
        methods: {
            /** The species whose solo look the button would copy, or null while Evolution is off. */
            soloStyleCopySpecies(this: any): string | null {
                if (!this.evolution || !this.selected_evolution_species) return null;
                return this.selected_evolution_species;
            },
            /** Whether the picked species has a solo style to copy (the button only shows when it does). */
            hasSoloStyleToCopy(this: any): boolean {
                const species = this.soloStyleCopySpecies();
                if (!species) return false;
                return hasStoredLook(storage[this.getStorageKey(species, false)]);
            },
            copySoloStyleToEvolutionLine(this: any) {
                if (!this.hasSoloStyleToCopy()) return;
                const species = this.soloStyleCopySpecies();
                const lineKey = this.getStorageKey(species, true);

                this.loadEvolutionStyle(species, false);
                const look: Record<string, unknown> = {};
                for (const field of SOLO_LOOK_FIELDS) {
                    if (this[field] !== undefined) look[field] = this[field];
                }
                storage[lineKey] = { ...(storage[lineKey] || {}), ...look };
                this.loadEvolutionStyle(species, true);
            },
        },
    };
}
