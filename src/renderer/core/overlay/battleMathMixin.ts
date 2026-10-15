// @ts-nocheck -- verbatim legacy JS lifted from the overlays (see tools/parity/drift-check.ts); type it when it is rewritten, not while it is moved.
/**
 * Pure battle-math helpers the lifted overlays share: Curse's type, the species string
 * a mapper value maps to, stage-modifier colours, vitamins left, Return/Frustration
 * power from friendship. (The unused `speedComparison` went in 2026-10; the speed label is
 * core/logic/speedLabel.ts.)
 *
 * Each was byte-identical across the overlays that defined it (gens 3-5 for most,
 * gens 2/3 for `enemyPkmnFaintCheck`) and was moved
 * out unchanged (tools/parity/drift-check.ts). A generation that had no copy gains it
 * unused; one that needs a different formula overrides it in its own `methods`, which
 * the drift check reports as a difference to be explained.
 */

import type { ComponentOptionsMixin } from "vue";

// `vitamins_remaining` assigns these without declaring them, as the legacy script did; the
// lift declares them as module-level `let`s, and so does this module (assigned before read).
let usableVitamins, vitaminsUsed;

export const battleMathMixin = {
    methods: {
        curseType(x) {
            if (x == `Curse`) {
                return "???"
            }
            else {
                return x
            }
        },
        species(x) {
            if (x != null && x.value != null)
                return x.value.name
            else
                return null
        },
        stageModColor(x) {
            if (x == 0)
                return "rgb(0, 0, 0);"
            else if (x < 0)
                return "rgb(107, 0, 0);"
            else (x > 0)
                return "rgb(0, 66, 14);"
        },
        vitamins_remaining(evs, label) { //statExp = mapper.properties.player.team[0].statExpAttack.value
            vitaminsUsed = (evs / 10)
            usableVitamins = Math.ceil(10 - vitaminsUsed)
            if (usableVitamins < 0) {
                return 0
            }
            else {
                return usableVitamins
            }
        },
        g3ReturnPowerCalc(slotNumber) {
            if (slotNumber.friendship.value < 2.5) { var friendshipValue = 2.5 }
            else { var friendshipValue = slotNumber.friendship.value }
            var specialMovePower = Math.floor(friendshipValue/2.5)
            return specialMovePower
        },
        g3FrustrationPowerCalc(slotNumber) {
            var friendshipValue = slotNumber.friendship.value
            var specialMovePower = Math.floor((255 - friendshipValue)/2.5)
            if (specialMovePower == 0) {
                specialMovePower = 1
            }
            return specialMovePower
        },
        enemyPkmnFaintCheck(pkmnData) {
            if (pkmnData.hp == 0) {
                return false
            }
            else {
                return true
            }
        },
    },
} satisfies ComponentOptionsMixin;
