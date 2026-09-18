// @ts-nocheck -- verbatim legacy JS lifted from the overlays (see tools/parity/drift-check.ts); type it when it is rewritten, not while it is moved.
/**
 * Nature helpers shared by the overlays with natures (gens 3-5): which stat a nature
 * raises or lowers, the nature a raised/lowered pair names, and the dropdown labels.
 *
 * Byte-identical across gens 3-5 and moved out unchanged (tools/parity/drift-check.ts).
 * The tables they read stay each generation's own in its `data()`: `natures`,
 * `neutralNatureByStat`, `neutralStatByNature`, and the current `pkmnNature`.
 */

import type { ComponentOptionsMixin } from "vue";

export const naturesMixin = {
    methods: {
        natureLabels(nature) {
            let output = nature + ": ";
            // let pad = 7 - nature.length;
            // output+="-".repeat(pad) + ": "
            switch(this.natures[nature].raises) {
                case "Attack":
                    output+= "+Attack";
                    break;
                case "Defense":
                    output+= "+Defense";
                    break;
                case "Special Attack":
                    output+= "+Sp. Atk";
                    break;
                case "Special Defense":
                    output+= "+Sp. Def";
                    break;
                case "Speed":
                    output+= "+Speed";
                    break;
                default:
                    output+= "Neutral";
                    break;
            }
            switch(this.natures[nature].lowers) {
                case "Attack":
                    output+= " | -Attack";
                    break;
                case "Defense":
                    output+= " | -Defense";
                    break;
                case "Special Attack":
                    output+= " | -Sp. Atk";
                    break;
                case "Special Defense":
                    output+= " | -Sp. Def";
                    break;
                case "Speed":
                    output+= " | -Speed";
                    break;
                default:
                    break;
            }
            return output;
        },
        // --- Button-grid nature selector (two-way synced with the pkmnNature dropdown) ---
        // Stat currently raised by the selected nature (diagonal stat for neutral natures).
        natureRaisedStat() {
            const data = this.natures[this.pkmnNature];
            if (!data) return null;
            return data.raises === "Neutral" ? this.neutralStatByNature[this.pkmnNature] : data.raises;
        },
        // Stat currently lowered by the selected nature (diagonal stat for neutral natures).
        natureLoweredStat() {
            const data = this.natures[this.pkmnNature];
            if (!data) return null;
            return data.lowers === "Neutral" ? this.neutralStatByNature[this.pkmnNature] : data.lowers;
        },
        // Find the nature name matching a raised/lowered stat pair (same stat => neutral).
        natureFromStats(raise, lower) {
            if (raise === lower) return this.neutralNatureByStat[raise];
            for (const [name, data] of Object.entries(this.natures)) {
                if (data.raises === raise && data.lowers === lower) return name;
            }
            return this.pkmnNature;
        },
        // Clicking a "raises" button keeps the current lowered stat and updates the dropdown.
        selectNatureRaise(stat) {
            this.pkmnNature = this.natureFromStats(stat, this.natureLoweredStat());
        },
        // Clicking a "lowers" button keeps the current raised stat and updates the dropdown.
        selectNatureLower(stat) {
            this.pkmnNature = this.natureFromStats(this.natureRaisedStat(), stat);
        },
    },
} satisfies ComponentOptionsMixin;
