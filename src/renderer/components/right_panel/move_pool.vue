<template>
    <div class="movepool-container">
        <movepool :view="view">
            <div class="tinted-box" style="--url: url(images/ui/movepool.svg); --drop-shadow: 0px 0px 1px #000;"></div>
        </movepool>
    </div>
</template>

<script lang="ts">
import { defineComponent, inject } from "vue";
import PokeData from "~/logic/PokeData";
import { PokemonMove, PokemonMovePool } from "~/logic/PokeDataTypes";
import { useMetaStore } from "~/stores/metaStore";
import { useOverlaySettingsStore } from "~/stores/useOverlaySettingsStore";
import { GameHookProperty } from "~/packages/gameHookMapperClient";
import { unobtainable_moves } from "~/games/gen1/data/unobtainable_moves";
import Movepool from "~/core/overlay/Movepool.vue";
import { crossOutActive, struckMoves, type StruckMoves } from "~/core/logic/unobtainableMoves";
import type { MovepoolRow, MovepoolView } from "~/core/overlay/movepoolView";

export default defineComponent({
    components: { movepool: Movepool },
    data() {
        return {
            meta: useMetaStore(),
            settings: useOverlaySettingsStore(),
            game_properties: inject<Record<string, any>>("game_properties", {}),
        };
    },
    computed: {
        moves(): PokemonMovePool {
            const species = this.meta.currentSpecies === 'Backport'
                ? this.meta.starter
                : this.meta.currentSpecies || this.meta.starter;
            const result = PokeData.getMovepool(species);
            // Show the starters movepool when the current species is unknown to the data set.
            return result.level.length || result.tmhm.length ? result : PokeData.getMovepool(this.meta.starter);
        },
        starter_type_2(): string {
            return (PokeData.findSpecies(this.meta.starter)?.type_2 ?? "Normal").toLowerCase();
        },
        /** The "Unobtainable Moves" setting's crossed-out moves (core/logic/unobtainableMoves.ts). */
        struck(): StruckMoves {
            const active = crossOutActive(this.settings.right_panel.movepool.unobtainable_moves, {
                starterObtained: (this.game_properties.meta?.state as GameHookProperty | undefined)?.value != "No Pokemon",
                firstBadge: this.game_properties.player?.badges?.badge1?.value == true,
            });
            return struckMoves(active, { everywhere: unobtainable_moves.Banned });
        },
        /** The rows for the shared table (core/overlay/Movepool.vue). */
        view(): MovepoolView {
            const row = (x: PokemonMove, way: unknown, first?: boolean): MovepoolRow => ({
                way,
                move: x.move,
                type: x.type,
                typeClass: `background-${x.type.toLowerCase()}`,
                // gen1's data gives one-hit KO moves power 1, the game's placeholder.
                power: x.power && x.power !== 1 ? x.power : '-',
                accuracy: x.accuracy ?? '-',
                pp: x.pp,
                first,
            });
            return {
                title: "Movepool",
                titleClass: "movepoolLabel",
                titleFirst: false,
                dc: false,
                headerClass: `movepool_header background-${this.starter_type_2}`,
                // 966px table, less the 19px header and the first row's 1px. Only Mew (60 rows) overflows;
                // its font stays about 15px, as gen1's own Mew rule had it.
                fit: { containerHeight: 946, lineHeight: 20, fontSize: 16, shrinkFactor: 0.25, normalFromCss: true },
                groups: [
                    { rows: this.moves.level.map((x, index) => row(x, x.Level, index === 0)), struck: this.struck.everywhere },
                    { rows: this.moves.tmhm.map((x) => row(x, x.tmhm)), struck: this.struck.machines },
                ],
            };
        },
    },
});
</script>
