<template>
<div>
    <exp-bar ref="bar" :layout="expBarLayout" :timing="expBarTiming"></exp-bar>
</div>
</template>

<script>
/**
 * The experience bar and its level-up animation (plan 1.1). The bar and the animation itself are the shared
 * core/overlay/player/ExpBar.ts (laid out and timed in games/gen1/playerPanel.ts); this component decides when
 * the bar moves.
 *
 * Converted from a template-string component. The script block is deliberately plain
 * JavaScript, not `lang="ts"`: the animation assigns `null` to `style.transition`,
 * re-types `prevSpecies` from `undefined` to a string and reaches into
 * `game_properties` through the array form of `inject`, and every one of those needs a
 * cast to satisfy vue-tsc. Plan 1.1 asks for the template to be compiled ahead of time,
 * not for the logic to be rewritten; typing it is a later pass with the harness as the
 * net.
 */
import { defineComponent } from "vue";
import PokeData from "~/logic/PokeData";
import { useMetaStore } from "~/stores/metaStore";
import { expProgress } from "~/core/logic/expCurve";
import { ExpBar } from "~/core/overlay/player/ExpBar";
import { expBarLayout, expBarTiming } from "~/games/gen1/playerPanel";


export default defineComponent({
    components: { ExpBar },
    inject: ["game_properties"],
    data() {
        return {
            expBarLayout,
            expBarTiming,
            metaStore: useMetaStore(),
            expBarAnimation: true,
            prevSpecies:     undefined,
            oldExpValue:     0,
        }
    },
    computed: {
        /** The current (normalized) game state, e.g. "Overworld" or "Battle". */
        state() {
            return this.metaStore.gameState;
        },
    },
    methods: {
        /** Growth rate of the pokemon currently shown, falling back to the starter and then to "Medium Fast". */
        growthRate() {
            const species = this.metaStore.currentSpecies == 'Backport'
                ? this.metaStore.starter
                : this.metaStore.currentSpecies;
            return PokeData.findSpecies(species)?.growth_rate
                ?? PokeData.findSpecies(this.metaStore.starter)?.growth_rate
                ?? "Medium Fast";
        },
        calcExpStats(growthRate, exp) {
            return expProgress(growthRate, exp, "Medium Fast");
        },
    },
    mounted() {
        //EXP BAR
        const bar = this.$refs.bar;
        var expStats = this.calcExpStats(this.growthRate(), this.game_properties.player.team[0].expPoints.value);
        bar.setWidth((expStats.percent * 100) + "%");
        this.prevSpecies = this.metaStore.currentSpecies
        this.oldExpValue = this.game_properties.player.team[0].expPoints.value
        this.game_properties.player.team[0].expPoints.change(async (newProp, oldProp) => {
            if (this.game_properties.player.team[0].level.value == 100) {
                bar.setWidth("0%");
                return
            }
            if (newProp.value < this.oldExpValue) {
                bar.setTransition(null);
            }
            if (this.expBarAnimation == true) {
                const growthRate = this.growthRate();
                const oldExpStats = this.calcExpStats(growthRate, this.oldExpValue);
                const newExpStats = this.calcExpStats(growthRate, newProp.value);
                if (this.oldExpValue == newProp.value) {
                    return
                }
                if (this.state == `Overworld` || this.state == "No Pokemon") {
                    bar.setWidth((newExpStats.percent * 100) + "%");
                }
                else if (this.prevSpecies != this.metaStore.currentSpecies) {
                    this.prevSpecies = this.metaStore.currentSpecies;
                    bar.setWidth((newExpStats.percent * 100) + "%");
                }
                else {
                    await bar.animate(oldExpStats, newExpStats);
                }
                bar.setTransition(null);
                this.oldExpValue = newProp.value
            }
        })
    }
});
</script>
