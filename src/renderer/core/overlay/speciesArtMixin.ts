// @ts-nocheck -- verbatim legacy JS lifted from the overlays (see tools/parity/drift-check.ts); type it when it is rewritten, not while it is moved.
/**
 * Species-art state shared by gens 3-5: the evolution-transition opacity and
 * transition computeds for the art and the movepool, and the reset of a species'
 * image adjustments to their defaults.
 *
 * Byte-identical across gens 3-5 and moved out unchanged (tools/parity/drift-check.ts).
 * The state stays in each overlay's `data()`: `evolution_transitioning`,
 * `evolution_transition_progress`, `imageXOffset`, `imageYOffset`, `imageScale`,
 * `imageFlip`, `imageSat`, `imageRotation`.
 */

import type { ComponentOptionsMixin } from "vue";

export const speciesArtMixin = {
    methods: {
        resetPokemon() {
            this.imageXOffset  = 0
            this.imageYOffset  = 0
            this.imageScale    = 1
            this.imageFlip     = false
            this.imageSat      = 100
            this.imageRotation = 0
        },
    },
    computed: {
        pokemonArtOpacity() {
            // Return opacity for Pokemon art during evolution transition
            if (this.evolution_transitioning) {
                // Fade out old, fade in new
                return 1 - this.evolution_transition_progress;
            }
            return 1;
        },
        pokemonArtTransition() {
            // Return transition style for Pokemon art
            if (this.evolution_transitioning) {
                return 'opacity 1s ease-in-out';
            }
            return '';
        },
        movepoolOpacity() {
            // Return opacity for movepool during evolution transition only
            // Battle transitions are handled by Vue's transition component
            if (this.evolution_transitioning) {
                return 1 - this.evolution_transition_progress;
            }
            
            // For non-evolution transitions, don't set opacity (let Vue transition handle it)
            // Return 1 so it's visible when rendered, Vue transition will handle fade in/out
            return 1;
        },
        movepoolTransition() {
            // Return transition style for movepool
            // During evolution transitions, use longer transition
            if (this.evolution_transitioning) {
                return 'opacity 1s ease-in-out';
            }
            
            // For battle state changes, return empty string to use default in template
            // The template will fall back to 'opacity 0.5s ease-in-out' if this is empty
            return '';
        },
    },
} satisfies ComponentOptionsMixin;
