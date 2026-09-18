// @ts-nocheck -- verbatim legacy JS lifted from the overlays (see tools/parity/drift-check.ts); type it when it is rewritten, not while it is moved.
/**
 * Manual starter IVs for the IV generations (3-5): the spread the lab write uses
 * (`starter_ivs`), the per-stat field setter, the stored-spread loader, and the Hidden
 * Power readout (plan section "Manual DVs and IVs in every generation", 2026-09-17).
 *
 * Byte-identical across gens 3-5 and moved out unchanged (tools/parity/drift-check.ts);
 * the formulas are core/logic/starterIvs.ts. Each overlay keeps the state in its
 * `data()` (`iv_mode`, `manual_ivs`, `hidden_power_type`, `hidden_power_index`,
 * `hiddenpowers`) and its own write path (gen3 `setStartingAttributes`, gen4
 * `setStartingStats`, gen5 `apply_starter_ivs`). gen2 is DV-based and keeps its own
 * versions of these under the same names.
 */

import { clampIvs, clampStat, gen3HiddenPower, IV_MAX, IV_MODE, ivsFromHiddenPowerRow } from "~/core/logic/starterIvs";
import type { ComponentOptionsMixin } from "vue";

export const manualIvsMixin = {
    methods: {
        /**
         * The IVs the starter is written with (2026-09-17): the Hidden Power dropdowns' row
         * in Automatic (a stale index after a type change reads as the type's first row),
         * the six fields in Manual.
         */
        starter_ivs() {
            if (this.iv_mode == IV_MODE.manual) {
                return clampIvs(this.manual_ivs)
            }
            const rows = this.hiddenpowers[this.hidden_power_type]
            return ivsFromHiddenPowerRow(rows?.[this.hidden_power_index] ?? rows?.[0])
        },
        /** One Manual IV field: whole, 0-31, an emptied field is 31; the object is replaced so the settings watcher sees it. */
        set_manual_iv(stat, event) {
            const value = clampStat(event.target.value, IV_MAX)
            this.manual_ivs = { ...clampIvs(this.manual_ivs), [stat]: value }
            // A rejected entry (letters, 40, -1) is shown as what was kept.
            event.target.value = String(value)
        },
        /** A stored spread, assigned only when it differs from the current one, so the settings watcher does not re-save an unchanged spread on every starter switch. */
        load_manual_ivs(stored) {
            const next = clampIvs(stored)
            const current = clampIvs(this.manual_ivs)
            if (Object.keys(next).some((stat) => next[stat] !== current[stat])) {
                this.manual_ivs = next
            }
        },
    },
    computed: {
        /** The Hidden Power the Manual fields yield, for the readout under them (2026-09-17). */
        manualHiddenPower() {
            return gen3HiddenPower(clampIvs(this.manual_ivs))
        },
        /** The Hidden Power type the starter's spread yields, for the movepool row: the dropdown's in Automatic, the fields' in Manual. */
        starterHiddenPowerType() {
            return this.iv_mode == IV_MODE.manual ? this.manualHiddenPower.type : this.hidden_power_type
        },
    },
} satisfies ComponentOptionsMixin;
