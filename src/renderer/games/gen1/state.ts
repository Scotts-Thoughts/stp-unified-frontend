import { watch } from "vue";
import { EnemyState } from "~/stores/types/EnemyState";
import { GameState } from "~/stores/types/GameState";
import { useMetaStore } from "~/stores/metaStore";

/**
 * gen1's game-state machine: keeps `meta.gameState`, `meta.currentSpecies` and
 * `meta.enemyState` in step with the mapper (plan 1.1, extracted from
 * `components/state.js`).
 *
 * Every rule and every mapper path below is gen1's, unchanged -- including the two that
 * compare a property *object* to a number (`screen.tiles.column1.tile6 == 127`,
 * `newProp == 0`), which work only because `GameHookProperty.toString()` returns the
 * value; and the enemy-state ladder's order, which is load-bearing because the branches
 * overlap. The raw `"Fainted"`-style strings became `EnemyState` members, which is a
 * value-identical substitution -- the enum is a string enum whose members are exactly
 * those literals -- and is what lets vue-tsc check the file at all.
 *
 * It stays under `games/gen1/` rather than `core/` precisely because of those paths:
 * plan 1.4 introduces the adapter that turns them into canonical keys, and only then can
 * a shared state machine exist. `components/state.vue` is the component that hosts this,
 * and it exists only so the call site keeps its position in the lifecycle order (the
 * subscriptions here must be registered before `Overlay.vue`'s) and its empty `<div>`
 * keeps its place in the DOM.
 */
export function useGameStateSync(game_properties: any): void {
    const meta = useMetaStore();

    const getCurrentSpecies = () => {
        if (meta.gameState === GameState.in_battle) {
            const battle_species = game_properties?.battle?.yourPokemon.species.value;
            if (!battle_species) {
                return meta.starter;
            }
            if (game_properties.player.team[0].species.value == "Backport") {
                return meta.starter;
            }
            return battle_species;
        } else if (meta.gameState === GameState.no_pokemon || game_properties?.player?.team[0].species.value == null) {
            return meta.starter;
        } else {
            const party_species = game_properties.player.team[0].species.value;
            if (!party_species) {
                return meta.starter
            }
            if (party_species == "Backport") {
                return meta.starter
            }
            return party_species;
        }
    };
    const updateCurrentSpecies = () => {
        meta.setCurrentSpecies(getCurrentSpecies());
    };

    watch(() => meta.gameState, updateCurrentSpecies);
    watch(() => meta.starter, updateCurrentSpecies);

    //Update the state to match the mapper's state
    meta.setGameState(game_properties.meta.state.value);

    meta.setCurrentSpecies(getCurrentSpecies());

    game_properties.meta.state.change(async (newProp) => {
        meta.setGameState(newProp.value);
    });

    // handle potential changes of current species:
    game_properties?.battle?.yourPokemon.species.change(updateCurrentSpecies);
    game_properties.player.team[0].species.change(updateCurrentSpecies);

    //Update the enemy state to track the enemy's Pokemon's condition
    if (game_properties.player.team[0].level.value == 0)
        meta.setEnemyState(EnemyState.not_in_battle);
    else if (game_properties.battle.type.value == "None")
        meta.setEnemyState(EnemyState.not_in_battle);
    else if (game_properties.battle.turnInfo.battleStart.value == 0)
        meta.setEnemyState(EnemyState.battle_starting);
    else if (game_properties.battle.lowHealthAlarm.value ==  "Disabled")
        meta.setEnemyState(EnemyState.battle_finished);
    else if  (game_properties.battle.enemyPokemon.hp.value == 0)
        meta.setEnemyState(EnemyState.fainted);
    else if  (game_properties.battle.enemyPokemon.hp.value > 0 && game_properties.screen.menu.currentItem.value == 0)
        meta.setEnemyState(EnemyState.pokemon_sent_out);
    else if  (game_properties.battle.enemyPokemon.hp.value > 0 && game_properties.screen.menu.currentItem.value > 0)
        meta.setEnemyState(EnemyState.pokemon);
    game_properties.battle.type.change((prop) => {
        if (prop.value == "Wild" || prop.value == "Trainer") {
            meta.setEnemyState(EnemyState.battle_starting);
        }
    });
    game_properties.screen.menu.currentItem.change(async (newProp, oldProp) => {
        if ((meta.enemyState === EnemyState.fainted || meta.enemyState === EnemyState.battle_starting) && newProp == 0) {
            meta.setEnemyState(EnemyState.pokemon_sent_out);
        }
        if ((meta.enemyState === EnemyState.pokemon_sent_out) && newProp > 0) {
            meta.setEnemyState(EnemyState.pokemon);
        }
    });
    game_properties.battle.turnInfo.battleStart.change((prop) => {
        if (prop.value != 0 && meta.gameState == "To Battle") {
            meta.setEnemyState(EnemyState.pokemon);
        }
    });
    game_properties.battle.enemyPokemon.hp.change(async (newProp, oldProp) => {
        if (newProp == 0 && meta.enemyState == EnemyState.pokemon) {
            meta.setEnemyState(EnemyState.fainting);
        }
    });
    game_properties.screen.tiles.column1.tile7.change((prop) => {
        if (prop == 127 &&
            game_properties.screen.tiles.column1.tile6 == 127 &&
            game_properties.screen.tiles.column1.tile5 == 127 &&
            game_properties.screen.tiles.column1.tile4 == 127 &&
            game_properties.screen.tiles.column1.tile3 == 127 &&
            game_properties.screen.tiles.column1.tile2 == 127 &&
            game_properties.screen.tiles.column1.tile1 == 127 &&
            meta.enemyState === EnemyState.fainting
        ) {
            meta.setEnemyState(EnemyState.fainted);
        }
    });

    game_properties.battle.turnInfo.trainerDefeated.change(async (prop) => {
        if (prop == 1) {
            meta.setEnemyState(EnemyState.battle_finished);
        }
    });
}
