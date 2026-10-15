<template>
<div>

            <!-- Keyed by the texture path so swapping textures cross-fades old/new instead of popping -->
            <transition name="styleFade">
                <img class="canvas" ref="background_texture" :key="currentTexturePath" :src="currentTexturePath" :style="background_texture_style">
            </transition>
            <img class="canvas" :src="`images/gen5/elements/pokeball.webp`">
            <!-- Keyed by the displayed species so starter changes, evolution-dropdown swaps and
                 mid-run evolutions cross-fade old/new art. No inline opacity here: it would
                 override the styleFade classes, so the fade is left entirely to the transition -->
            <species-art ref="pokemon_art" img-class="pokemon_art" v-bind="species_art_look" transition="styleFade" :art-key="displayedPokemonSpecies" :src="`images/gen5/pokemon/${displayedPokemonSpecies}.webp`"></species-art>
            <div class="colored-image ds" :style="hp_tracker_style" style="--url: url(images/gen5/ui/game_area.svg)"></div>
            <!-- The faults box (core/overlay/player/FaultsBox.ts, laid out in playerPanel.ts): its frame here, its labels and counts after the Ability and Held Item boxes. -->
            <faults-box :layout="faults_layout.frames" :mode="blackouts_resets" :frame-style="`filter: saturate(${ui_saturation}) drop-shadow(0px 1px 1px)`"></faults-box>
            
            <div class="colored-image ds" :style="`filter: saturate(${ui_saturation}) drop-shadow(0px 1px 1px)`" style="--url: url(images/gen5/ui/moveset.svg)"></div>

            <img v-show="selected_game == 'Black' || selected_game == 'White'" class="canvas" :src="`images/gen5/progress.webp`">
            <img v-show="selected_game == 'Black 2' || selected_game == 'White 2'" class="canvas" :src="`images/gen5/bw2_progress.webp`">

            <div class="colored-image ds" :style="`filter: saturate(${ui_saturation}) drop-shadow(0px 1px 1px)`" style="--url: url(images/gen5/ui/stats.svg)"></div>
            <div class="colored-image ds" :style="`filter: saturate(${ui_saturation}) drop-shadow(0px 1px 1px)`" style="--url: url(images/gen5/ui/stats.svg)"></div>
            <img class="canvas colored-image ds " :src="`images/gen5/ui/exp_bar.svg`">
            <img class="canvas colored-image ds " :src="`images/gen5/ui/nature_friendship.svg`">
            <div class="colored-image ds" :style="`filter: saturate(${ui_saturation}) drop-shadow(0px 1px 1px)`" style="--url: url(images/gen5/ui/ability_helditem.svg)"></div>
            <img class="canvas colored-image ds" :src="`images/gen5/ui/stats_values.svg`">
            <div v-if="show_nature_changes == true && (stats_setting == 'Automatic' || stats_setting == 'Base Stats')">
                <img class="canvas colored-image ds " :src="`images/gen5/ui/nature arrows/raises/${natures[pkmnNature].raises}.svg`">
                <img class="canvas colored-image ds " :src="`images/gen5/ui/nature arrows/lowers/${natures[pkmnNature].lowers}.svg`">
            </div>
            <img class="canvas" :src="`images/gen5/ui/move_backgrounds.webp`">
            <game-clock v-if="shuckie_timer == true" shuckie :hidden="timer_frame_live"></game-clock>
            <div v-else="">
                <game-clock wrapper-class="gametime" :hidden="timer_frame_live"></game-clock>
            </div>
            <!-- The clock in its own process (core/overlay/ClockFrame.ts); the ones above show until it is up. -->
            <clock-frame :gen="5" @live="timer_frame_live = $event"></clock-frame>

            <!-- The settings panel (core/settings/SettingsPanel.vue), described in settingsPanel.ts. The templates below
                 are the few pieces that stay markup: they render inside the panel, in its look. -->
            <settings-panel :panel="settingsPanel">
                <template #editor>
                    <button class="stp-btn" @click="add_testing_items()">Add Testing Items</button>
                    <button class="stp-btn" @click="set_options()">Set Options</button>
                    <button class="stp-btn" @click="write_byte_data(set_starter_stats_object)">Recalculate Stats</button>
                    <span class="stp-label stp-label-block">Moves</span>
                    <input class="stp-input" type="text" v-model="move1_replacement" placeholder="Move 1">
                    <input class="stp-input" type="text" v-model="move2_replacement" placeholder="Move 2">
                    <input class="stp-input" type="text" v-model="move3_replacement" placeholder="Move 3">
                    <input class="stp-input" type="text" v-model="move4_replacement" placeholder="Move 4">
                    <button class="stp-btn" @click="update_moveset">Update Party Moves</button>
                    <button class="stp-btn" @click="update_battle_moveset">Update Battle Moves</button>
                    <span class="stp-label stp-label-block">Items</span>
                    <input class="stp-input" type="text" v-model="item1_replacement" placeholder="Item 1">
                    <input class="stp-input" type="text" v-model="item2_replacement" placeholder="Item 2">
                    <input class="stp-input" type="text" v-model="item3_replacement" placeholder="Item 3">
                    <input class="stp-input" type="text" v-model="item4_replacement" placeholder="Item 4">
                    <button class="stp-btn" @click="update_items">Update Items</button>
                    <span class="stp-label stp-label-block">Held Item</span>
                    <input class="stp-input" type="text" v-model="held_item_replacement" placeholder="Held Item">
                    <button class="stp-btn" @click="update_held_item">Update Held Item</button>
                </template>
                <template #devtools>
                    <div class="stp-hint">{{ isInDevMode ? "Development mode: changes save to the defaults" : "Production mode: changes save locally" }}</div>
                    <button v-if="isInDevMode" class="stp-btn" @click="exportStyleSettingsAsDefaults()">Export All Settings as Defaults</button>
                    <button class="stp-btn" @click="resetCurrentPokemonToDefaults()">Reset Current Pokémon to Defaults</button>
                    <confirm-button class="stp-btn stp-btn-danger" label="Reset ALL to Defaults" confirm-label="Click again to reset ALL" @confirm="resetAllStyleSettingsToDefaults()"></confirm-button>
                    <button class="stp-btn" @click="print_texture_settings()">Log Color Settings</button>
                    <label v-if="isInDevMode" class="stp-row stp-toggle" title="Dev only. Packaged builds always use enemy sprite styles.">
                        <span class="stp-label">Enemy Sprite Styles</span>
                        <input type="checkbox" v-model="enemy_sprite_styles_enabled">
                    </label>
                    <template v-if="isInDevMode">
                        <button v-if="!style_mode_active" class="stp-btn" @click="enterStyleMode()" title="Iterate every species: Enter saves + advances, Backspace discards + steps back, Escape exits.">Style Mode (Iterate Pokédex)</button>
                        <button v-else class="stp-btn stp-btn-danger" @click="exitStyleMode()">Exit Style Mode</button>
                        <div v-if="style_mode_active" class="stp-hint">{{ style_mode_index + 1 }} / {{ style_mode_species_list.length }} — <strong>{{ styleModeCurrentSpecies() }}</strong></div>
                    </template>
                </template>
                <template #formNote>
                    <div class="stp-hint">Each form styles separately.<template v-if="pokemon_form_note"> {{ pokemon_form_note }}</template></div>
                </template>
                <template #battleFormNote>
                    <div class="stp-hint">Each form styles separately. Shown outside battle for styling; in battle the game's form takes over.</div>
                </template>
                <template #ivs>
                    <div v-if="iv_mode == 'Automatic'" class="stp-ivgrid">
                        <span>HP</span><span>{{ hiddenpowers[hidden_power_type]?.[hidden_power_index]?.[0] }}</span>
                        <span>Atk</span><span>{{ hiddenpowers[hidden_power_type]?.[hidden_power_index]?.[1] }}</span>
                        <span>Def</span><span>{{ hiddenpowers[hidden_power_type]?.[hidden_power_index]?.[2] }}</span>
                        <span>SpA</span><span>{{ hiddenpowers[hidden_power_type]?.[hidden_power_index]?.[4] }}</span>
                        <span>SpD</span><span>{{ hiddenpowers[hidden_power_type]?.[hidden_power_index]?.[5] }}</span>
                        <span>Spe</span><span>{{ hiddenpowers[hidden_power_type]?.[hidden_power_index]?.[3] }}</span>
                    </div>
                    <template v-else>
                        <div class="stp-ivgrid">
                            <span>HP</span><input type="text" class="manual_iv_input" :value="manual_ivs.hp" @change="set_manual_iv('hp', $event)">
                            <span>Atk</span><input type="text" class="manual_iv_input" :value="manual_ivs.atk" @change="set_manual_iv('atk', $event)">
                            <span>Def</span><input type="text" class="manual_iv_input" :value="manual_ivs.def" @change="set_manual_iv('def', $event)">
                            <span>SpA</span><input type="text" class="manual_iv_input" :value="manual_ivs.spa" @change="set_manual_iv('spa', $event)">
                            <span>SpD</span><input type="text" class="manual_iv_input" :value="manual_ivs.spd" @change="set_manual_iv('spd', $event)">
                            <span>Spe</span><input type="text" class="manual_iv_input" :value="manual_ivs.spe" @change="set_manual_iv('spe', $event)">
                        </div>
                        <div class="stp-hint">Hidden Power: {{ manualHiddenPower.type }} ({{ manualHiddenPower.power }})</div>
                    </template>
                </template>
                <template #natureGrid>
                    <div class="nature_grid">
                        <div class="nature_grid_row">
                            <span class="nature_grid_label nature_grid_raise">+</span>
                            <button v-for="stat in natureStats" :key="'raise-' + stat.key" class="nature_grid_btn" :class="{ 'nature_grid_raise_on': natureRaisedStat() === stat.key }" @click="selectNatureRaise(stat.key)">{{stat.short}}</button>
                        </div>
                        <div class="nature_grid_row">
                            <span class="nature_grid_label nature_grid_lower">−</span>
                            <button v-for="stat in natureStats" :key="'lower-' + stat.key" class="nature_grid_btn" :class="{ 'nature_grid_lower_on': natureLoweredStat() === stat.key }" @click="selectNatureLower(stat.key)">{{stat.short}}</button>
                        </div>
                    </div>
                </template>
            </settings-panel>

            <!-- RNG Configuration Modal -->
            <div v-if="showRNGModal" class="popup-overlay" @click="closeRNGModal">
                <div class="popup-menu rng-modal" @click.stop="">
                    <div class="popup-header">
                        <h3>RNG Configuration</h3>
                        <button class="popup-close" @click="closeRNGModal">×</button>
                    </div>
                    <div class="rng-modal-body">
                        <div v-for="npc in rng_npcs" :key="npc.key" class="rng-npc-block">
                            <div class="rng-npc-header">
                                <span class="rng-npc-title">{{ npc.label }}</span>
                                <button class="smallButtonStyle increment" @click="addRNGTrip(npc.key)" title="Add trip">+</button>
                            </div>
                            <div v-for="(trip, idx) in rng_config[npc.key]" :key="idx" class="rng-trip-row">
                                <span class="rng-trip-label">Trip {{ idx + 1 }}:</span>
                                <select class="dropdownMenu rng-trip-select" v-model="rng_config[npc.key][idx]">
                                    <option v-for="(val, name) in rngOptionsFor(npc.key)" :key="name" :value="name">{{ name }}</option>
                                </select>
                                <button v-if="idx > 0" class="smallButtonStyle2 decrement" @click="removeRNGTrip(npc.key, idx)" title="Remove trip">-</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- OVERLAY COMPONENTS -->
            <!-- Type Icons -->
            <type-badges v-if="!run_complete" v-bind="type_badges"></type-badges>

            <!-- Stats -->
            <div class="posAbs">
                <div class="stats_header">{{stats_header}}</div>
                <div class="growth_rate">{{growth_rate}}</div>
                <!-- Nature and Friendship / Total (core/overlay/player/InfoRow.ts, built in playerPanel.ts) -->
                <info-row v-bind="info_rows.nature"></info-row>
                <info-row v-bind="info_rows.total"></info-row>
                <div class="stats_container" id="stats">
                    <!--  New Stats -->
                    <div style="z-index: 100000;">
                        <stat-tiles :nodes="stat_tiles"></stat-tiles>
                    </div>
                </div>
            </div>

            <!--------- BADGE ICONS ---------------------------------------------------------------------------------------------------------------------->
            <div>
                <badge-row v-bind="badge_row"></badge-row>
            </div>

            <!-- Moveset -->
            
            <!-- One table per move slot, laid out 1 2 / 3 4 (core/overlay/player/MoveList.ts, laid out in playerPanel.ts) -->
            <move-list :list="player_move_list" :layout="move_list_layout"></move-list>

            <!-- Right Hand Information Area -->
            <transition name="fade1">
                <!-- Style Mode (dev only): replaces the live right panel with a
                     dummy slot-0 enemy graphic so every species can be styled.
                     Layout mirrors the live "Enemy Team Display" block below
                     (single slot) with dummy stats/moves so all surrounding
                     graphics render. -->
                <div v-if="isInDevMode && style_mode_active" style="position: absolute;" key="style_mode">
                    <div class="trainerLabel">{{ styleModeCurrentSpecies() }} {{ style_mode_index + 1 }}/{{ style_mode_species_list.length }}</div>
                    <div class="colored-image ds" :style="`height: 233px; filter: saturate(${ui_saturation}) drop-shadow(0px 0px 1px #000000)`" style="--url: url(images/gen5/ui/opponent.svg)"></div>
                    <div>
                        <img class="canvas eFaintTransition red-svg" style="left: -1px;" :src="`images/gen5/ui/speed_comp/0.svg`">
                        <div class="colored-image" :style="`--overlay-color: ${overlay_color}; --url: url(images/gen5/ui/enemy_ui/0.svg)`"></div>
                        <img :src="`images/gen5/enemy-area/stats/${ui_type_color_modifier}/0.svg`" class="enemyPng eFaintTransition">
                    </div>
                    <div class="enemyGraphic">
                        <div class="eFaintTransition">
                            <div class="border slots ePkmnStyle ePkmn0">
                                <div>
                                    <div>
                                        <img class="ePkmnSprite ePkmnSpriteResizing" :data-enemy-slot="0" :data-enemy-species="styleModeCurrentSpecies()" :style="{ transform: enemyTransformFor(styleModeCurrentSpecies()), filter: `drop-shadow(${getEnemySpriteFlipped(styleModeCurrentSpecies()) ? -2 : 2}px 2px 2px #000) saturate(1.1)` }" :src="`images/gen5/pokemon/${speciesSpecialCharacters(styleModeCurrentSpecies())}.webp`">
                                        <div class="border ePkmnTyping">
                                            <img class="icons moveIcon" :src="`images/gen5/type-icons-circular/${g5PokemonData[styleModeCurrentSpecies()]?.type_1?.toLowerCase()}.webp`">
                                            <img v-show="g5PokemonData[styleModeCurrentSpecies()]?.type_1 != g5PokemonData[styleModeCurrentSpecies()]?.type_2" class="icons moveIcon" :src="`images/gen5/type-icons-circular/${g5PokemonData[styleModeCurrentSpecies()]?.type_2?.toLowerCase()}.webp`">
                                        </div>
                                        <div class="ePkmnLvlSpecies">{{ styleModeCurrentSpecies() }}</div>
                                        <div class="ePkmnLevel" style="opacity: .7;">Lv: 50</div>
                                        <div class="ePkmnAbility" style="opacity: .7;">{{ g5PokemonData[styleModeCurrentSpecies()]?.abilities?.[0] ?? '' }}</div>
                                        <div class="speed_comparison">Outsped</div>

                                        <div class="enemyStatLabel eStatLabel eLabelLeft eLabel1">Hp:</div>
                                        <div class="enemyStatLabel eStatLabel eLabelLeft eLabel2">Atk:</div>
                                        <div class="enemyStatLabel eStatLabel eLabelLeft eLabel3">Def:</div>
                                        <div class="enemyStatLabel eStatLabel eLabelRight eLabel1">Spe:</div>
                                        <div class="enemyStatLabel eStatLabel eLabelRight eLabel2">SpA:</div>
                                        <div class="enemyStatLabel eStatLabel eLabelRight eLabel3">SpD:</div>

                                        <div class="align_right eStatValue eValueLeft eValue1">{{ g5PokemonData[styleModeCurrentSpecies()]?.base_hp      ?? 100 }}</div>
                                        <div class="align_right eStatValue eValueLeft eValue2">{{ g5PokemonData[styleModeCurrentSpecies()]?.base_atk     ?? 50 }}</div>
                                        <div class="align_right eStatValue eValueLeft eValue3">{{ g5PokemonData[styleModeCurrentSpecies()]?.base_def     ?? 50 }}</div>
                                        <div class="align_right eStatValue eValueRight eValue1">{{ g5PokemonData[styleModeCurrentSpecies()]?.base_spd     ?? 50 }}</div>
                                        <div class="align_right eStatValue eValueRight eValue2">{{ g5PokemonData[styleModeCurrentSpecies()]?.base_spc_atk ?? 50 }}</div>
                                        <div class="align_right eStatValue eValueRight eValue3">{{ g5PokemonData[styleModeCurrentSpecies()]?.base_spc_def ?? 50 }}</div>
                                        <div class="border ePkmnMoves">
                                            <table class="enemyMovesetTable">
                                                <tbody><tr v-for="(dummy, i) in style_mode_dummy_moves">
                                                    <th><img class="icons moveIcon" :src="`images/gen5/type-icons-circular/${dummy.type}.webp`"></th>
                                                    <th class="align_left" style="font-size: 14px;">{{ dummy.name }}</th>
                                                </tr>
                                            </tbody></table>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- Enemy Team Display -->
                <!-- Decision 27: only Automatic and Trainers show it (Movepool and Splits keep their panel). It follows the
                     setting, not a post-battle Splits, which waits for enemy_graphic to end, as before. -->
                <div v-else-if="enemy_graphic == true && battlePokemonCrop != false && !second_screen_mode && (right_ui == 'Automatic' || right_ui == 'Trainers')" style="position: absolute;" key="1">
                    <!-- The enemy team panel (core/overlay/EnemyTeamPanel.ts), laid out in enemyPanel.ts. -->
                    <enemy-team-panel :view="enemy_team_view" :layout="enemy_team_layout"></enemy-team-panel>
                </div>
                <!-- Show Wild Battles (decision 30): the wild Pokémon in the same panel, during the battle. -->
                <div v-else-if="!second_screen_mode && (right_ui == 'Automatic' || right_ui == 'Trainers') && wild_pokemon_view" style="position: absolute;" key="9">
                    <enemy-team-panel :view="wild_pokemon_view" :layout="enemy_team_layout"></enemy-team-panel>
                </div>
                <!-- Second Screen Mode -->
                <div v-else-if="second_screen_mode" key="2">
                    <div class="posAbs movepoolLabel">Splits</div>
                    <div v-if="secondScreenSplitsView">
                        <splits-panel :view="secondScreenSplitsView" />
                    </div>
                    <div v-if="second_screen_mode == true" class="colored-image ds" :style="hp_tracker_style" style="--url: url(images/gen5/ui/second_screen_game_area.svg)"></div>
                </div>
                <!-- Trainers (decision 14): the picked trainer's team in the same panel, outside a trainer battle. -->
                <div v-else-if="right_panel_mode == 'Trainers' && trainer_preview_view" style="position: absolute;" key="8">
                    <enemy-team-panel :view="trainer_preview_view" :layout="enemy_team_layout"></enemy-team-panel>
                </div>
                <!-- Splits -->
                <div v-else-if="right_panel_mode == 'Splits'" key="7" :style="`filter: drop-shadow(0px 1px 1px)`" class="posAbs">
                    <div class="posAbs movepoolLabel">Splits</div>
                    <div v-if="splitsView">
                        <splits-panel :view="splitsView" />
                    </div>
                </div>
                <!-- Movepool -->
                <!-- Movepool, Automatic, and Trainers with no trainer picked (or no table: Black 2 / White 2). -->
                <div v-else="" key="6" :style="evolution_transitioning ? `filter: drop-shadow(0px 1px 1px); opacity: ${movepoolOpacity}; transition: ${movepoolTransition};` : `filter: drop-shadow(0px 1px 1px);`">
                    <movepool :view="movepoolView">
                        <div class="colored-image ds" :style="`filter: saturate(${ui_saturation})`" style="--url: url(images/gen5/ui/movepool.svg)"></div>
                    </movepool>
                </div>
            </transition>

            <!--------- BATTLE POP UPS -------------------------------------------------------------------------------------------------------------------->
            <div v-if="!not_valid_battle_state" style="position: absolute;">
                <popup-box v-bind="battle_popups.accuracy"></popup-box>
                <popup-box v-bind="battle_popups.evasion"></popup-box>
            </div>

            <!-- Exp bar -->
            <exp-bar ref="expBar" :layout="exp_bar_layouts.bar" :label="exp_label" :timing="exp_bar_timing"></exp-bar>

            <!-- Misc -->
            <div class="posAbs labelAbility" style="font-family: play; top: 817px; left: 507px;">
                <div class="posAbs ">Ability:</div>
                <div class="posAbs" style="left: 487px; width: 200px;">Held Item:</div>
            </div>
            <div v-if="game.properties.meta.state.value == 'No Pokemon'" class="ability">{{pkmn_ability}}</div>
            <div v-else-if="game.properties.meta.state.value != 'No Pokemon'" class="ability">{{pokemon_dynamic_ability}}</div>
            <div class="heldItem">{{heldItem}}</div>
            <div class="genericLabels timerLabel">time played at 4x game speed</div>

            <!-- Faults -->
            <faults-box :layout="faults_layout.counts" :mode="blackouts_resets" :resets="fault_resets" :blackouts="fault_blackouts" :font-sizes="faults_font_sizes"></faults-box>
            <!-- Gametime -->
            <transition name="fade1">
                <div v-show="run_complete" style="position: relative; top: 59px;">
                    <div class="colored-image ds" :style="`filter: saturate(${ui_saturation}) drop-shadow(0px 1px 1px)`" style="--url: url(images/gen5/ui/gametime.svg)"></div>
                    <div class="genericLabels gametimeLabel">gametime</div>
                    <div id="gametime_display" style="top: 699px; font-size: 38px;" class="resets">
                        <div>{{simple_data[7]}}</div>
                    </div>
                </div>
            </transition>

            <!-- Enemy sprite resize handle. Dev mode only — packaged builds just
                 read enemy_sprite_scales.js and don't expose any resize UI.
                 Teleported to body so it floats above every in-app overlay. -->
            <teleport to="body" v-if="isInDevMode">
                <div v-if="enemyResize.species && enemySpriteHandlePosition()" class="ePkmnSpriteResizeHandle" :style="enemySpriteHandlePosition()" @mousedown="onEnemyResizeHandleMouseDown($event)" title="Drag to resize. Enter saves, Escape cancels."></div>
            </teleport>
        
</div>
</template>

<script>
/**
 * gen5's overlay: Black & White, Black 2 & White 2 (plan 2.4, lifted 2026-09-11).
 *
 * This is the component object from the legacy `frontend.js` (10,465 lines, one
 * `Vue.createApp` call) and the `#app` markup from its `index.html`, brought in as an
 * SFC with the infrastructure swapped for the shared core and *nothing else changed*
 * (tools/port/lift-gen5.py does the swaps and asserts each one):
 *
 *   - `this.mapper.X`   -> `this.game.X`: the session main.ts builds -- the profile's
 *                          canonical view as `properties`, plus `setBits`. The
 *                          component no longer constructs or connects a client; what
 *                          was its `onMapperLoaded` callback runs at the top of
 *                          `mounted`, in the same order, and its four `deboucePath`
 *                          calls (15 frames) are the module's `debouncePaths`. gen5's
 *                          own computed `game` (its game_variables entry) is
 *                          `game_data` now, so the prop does not shadow it.
 *   - `MyStorage`       -> games/gen5/storage.ts (the file-backed layered store, with
 *                          gen5's key rule, style-field filter, three-layer read and
 *                          1 s debounced write).
 *   - keyhook block     -> games/gen5/actions.ts through core/shortcuts; the second-screen
 *                          key sender -> core/window/virtualKeys.ts (decision 9).
 *   - control server    -> games/gen5/control.ts, bound by main.ts (plan 1.8).
 *   - OBS marker method -> core/logic/obs.ts (the same exchange, plan 1.9).
 *   - logData/logCopy   -> games/gen5/splits.js over the splits IPC; the three split
 *                          folders the legacy file created at load are created there too.
 *   - Timer / PubSub    -> games/gen5/logic/, as ES modules with their bodies as they were. The
 *                          timer component (components/Timer.js) became core/overlay/player/GameClock.vue.
 *   - `<script src>`    -> imports of games/gen5/data/**.js.
 *   - set-game-icon     -> the shell, from the detected game (src/renderer/main.ts).
 *   - openFolder        -> the splits IPC.
 *   - `images/...`      -> `images/gen5/...` everywhere (template, script,
 *                          stylesheet, data): the generation's tree sits next to gen1's
 *                          images, under the same document-relative root, until Phase 4
 *                          merges the pools (tools/port/lift_assets.py says why not a scheme).
 *
 * The template is the browser-normalised innerHTML Vue's runtime compiler saw
 * (tools/port/extract-template.ts), so the compiled DOM is the legacy DOM. The
 * script stays plain JavaScript, as it was. Decomposing this into the shared stores
 * is the Phase 2.4 refactor proper, to be done with the harness as the net, exactly
 * as gen1's was in Phase 1.
 */
import { computed, defineComponent, markRaw, shallowRef } from "vue";
import { ClockFrame } from "~/core/overlay/ClockFrame";
import { FaultsBox } from "~/core/overlay/player/FaultsBox";
import { MoveList } from "~/core/overlay/player/MoveList";
import { PopupBox } from "~/core/overlay/player/PopupBox";
import { battlePopups, moveListLayout, playerMoveList } from "./playerPanel";
import GameClock from "~/core/overlay/player/GameClock.vue";
import { faultsLayout, faultsFontSizes, statTiles, expBarLayouts, expBarTiming, expBarLabel, badgeRow, statHeaders } from "./playerPanel";
import { StatTiles } from "~/core/overlay/player/StatTiles";
import { ExpBar } from "~/core/overlay/player/ExpBar";
import { BadgeRow } from "~/core/overlay/player/BadgeRow";
import { expProgress } from "~/core/logic/expCurve";
import ConfirmButton from "~/core/overlay/ConfirmButton.vue";
import SettingsPanel from "~/core/settings/SettingsPanel.vue";
import Movepool from "~/core/overlay/Movepool.vue";
import SplitsPanel from "~/core/overlay/SplitsPanel.vue";
import { EnemyTeamPanel } from "~/core/overlay/EnemyTeamPanel";
import { speedColorClass, speedLabel, speedLabelOrder } from "~/core/logic/speedLabel";
import { enemyTeamLayout, enemyTeamView, previewTrainer, trainerPickerOptions, trainerPreviewView, wildPreview } from "./enemyPanel";
import { readRightPanelMode, rightPanelModeMixin } from "~/core/overlay/rightPanelMode";
import { searchTrainers } from "~/core/logic/trainerPreview";
import { splitDiffColor, splitsHead } from "~/core/overlay/splitsView";
import { crossOutActive, struckMoves } from "~/core/logic/unobtainableMoves";
import { gen5SettingsPanel } from "./settingsPanel";
import { findKeyIgnoringCase } from "~/core/logic/caseInsensitiveLookup";
import { gen45OhkoAccuracy, isOhkoMove, ohkoPowerText } from "~/core/logic/ohkoAccuracy";
import {
    electroBallPower,
    flailReversalPower,
    gyroBallPower,
    heavySlamPower,
    punishmentPower,
    storedPowerPower,
    trumpCardPower,
    wringOutPower,
} from "~/core/logic/movePower";
import { gen45TurnOrder, gen45TurnOrderSpeed } from "~/core/logic/battleSpeed";
import { moveAccuracy as calcMoveAccuracy } from "~/core/logic/moveAccuracy";
import { bindShortcuts } from "~/core/shortcuts/engine";
import { addSplitBookmark, sendChapterMarker, shuckieBookmarksEnabled } from "~/core/logic/shuckieBookmarks";
import { pickSplitComparison } from "~/core/logic/splitComparison";
import { checkMapperForChapterMarkerProperties } from "~/core/logic/chapterMarkerProperties";
import { markReminderMoves } from "~/core/logic/moveReminder";
import { clampIvs, IV_MODE } from "~/core/logic/starterIvs";
import { formatStage } from "~/core/logic/statFormat";
import { revealSplitFolder, splitPath } from "~/core/persistence/splitFiles";
import { sendVirtualKey } from "~/core/window/virtualKeys";
import { enemySpriteStyleMixin } from "~/core/overlay/enemySpriteStyleMixin";
import { formattersMixin } from "~/core/overlay/formattersMixin";
import { naturesMixin } from "~/core/overlay/naturesMixin";
import { manualIvsMixin } from "~/core/overlay/manualIvsMixin";
import { speciesArtMixin } from "~/core/overlay/speciesArtMixin";
import { overlayCommonMixin } from "~/core/overlay/overlayCommonMixin";
import { SpeciesArt } from "~/core/overlay/player/SpeciesArt";
import { TypeBadges } from "~/core/overlay/player/TypeBadges";
import { InfoRow } from "~/core/overlay/player/InfoRow";
import { typeBadges, infoRows } from "./playerPanel";
import { battleMathMixin } from "~/core/overlay/battleMathMixin";
import { dsPairMixin } from "~/core/overlay/dsPairMixin";
import { MyStorage, StyleSettingsUtils } from "./storage";
import { enemySpriteScaleManager } from "./enemySprites";
import { gen5Actions } from "./actions";
import { logData, logCopy, transition } from "./splits.js";
import { Timer } from "./logic/Timer.js";
import PubSub from "./logic/PubSub.js";
import { POKEMON_FORMS, POKEMON_FORM_LABELS, POKEMON_FORM_INFO, BATTLE_ONLY_FORMS, baseSpeciesOf, BATTLE_FORM_VARIANTS, BATTLE_FORM_LABELS } from "./forms.js";
import { ability_glossary } from "./data/references/abilities.js";
import { auto_save_settings } from "./data/auto_save_settings.js";
import { autosplitter } from "./data/autosplitter.js";
import { black_moves } from "./data/moves/black.js";
import { cross_generation_moves } from "./data/moves/cross_generation_moves.js";
import { default_colors } from "./data/default_colors.js";
import { demo_split_data } from "./data/demo_split_data.js";
import { g5tmhmMapping } from "./data/g5tmhmMapping.js";
import { game_variables } from "./data/game_variables.js";
import { hiddenPowerTypes } from "./data/hiddenPowerTypes.js";
import { hiddenpower_type_selector } from "./data/hiddenpower.js";
import { hiddenpowers } from "./data/hiddenpower-all.js";
import { natural_gift } from "./data/moves/natural_gift.js";
import { natures } from "./data/natures.js";
import { pokedex_black2_white2 } from "./data/pokedex/black2_white2.js";
import { pokedex_black_white } from "./data/pokedex/black_white.js";
import { post_game_moves } from "./data/post_game_moves.js";
import { stageModifiersData } from "./data/stageModifiers.js";
import { textures } from "./data/textures.js";
import { tmhm } from "./data/misc/tmhm.js";
import { trainers_black } from "./data/trainers/black.js";
import { typeBoostingItems } from "./data/typeBoostingItems.js";
import { typeData } from "./data/type-effectiveness.js";
import { typeEffectivenessArray } from "./data/type effectiveness array.js";
import { unobtainable_moves_object } from "./data/moves/unobtainable_moves.js";

// Implicit globals of the legacy classic script, see tools/port/lift-gen5.py.
let attack, basePower, battle_end, damageMax, damageMin, debugging_mode, defense, fling_power, gen3abilities, h, level, m, maxPercentage, minPercentage, nature, newColor, part1, part2, part3, part4, pid, power, shuckie_blackouts, shuckie_resets, specialA, specialD, stab, starterType, timecode, type, type1, type2, typeString, usableVitamins, vitaminsUsed;

// The movepool rows come from black.js, whose keys are lower-case (`move`, `type`), but
// movepoolPower/movepoolType/movepoolTypeColor were copied from gen4, whose rows say `Move`/`Type`,
// so their Hidden Power, Return and Frustration branches never ran (known-legacy-bugs, 2026-10-14).
const rowMove = (row) => row.move ?? row.Move;
const rowType = (row) => row.type ?? row.Type;

export default defineComponent({
    mixins: [enemySpriteStyleMixin({ enemySpriteScaleManager }), formattersMixin, naturesMixin, manualIvsMixin, speciesArtMixin, overlayCommonMixin, battleMathMixin, dsPairMixin, rightPanelModeMixin("right_ui")],
    components: {
        ClockFrame,
        FaultsBox,
        MoveList,
        PopupBox,
        GameClock,
        ConfirmButton,
        SettingsPanel,
        Movepool,
        SplitsPanel,
        EnemyTeamPanel,
        StatTiles,
        ExpBar,
        BadgeRow,
        SpeciesArt,
        TypeBadges,
        InfoRow,
    },
    props: ["game"],
    provide() {
        // What <live-text> shows (core/overlay/LiveText.ts): the Super Shuckie time,
        // which changes every poll. Read here through computeds the child renders, so
        // this component's own render is not a dependent of them and does not re-run at
        // that rate (docs/performance-followups.md, third pass).
        // The overlay's own timer comes the same way: logic/Timer.js publishes its text on `time_update` every
        // frame, and only the clock's two lines (core/overlay/player/GameClock.vue) read it. (Until 2026-10-14 a
        // `components/Timer.js` child subscribed and drew the clock itself.)
        const timerText = shallowRef(["0", ".00"])
        this._onTimeUpdate = (value) => { timerText.value = value }
        PubSub.subscribe("time_update", this._onTimeUpdate)
        return {
            liveText: {
                shuckie_clock:  computed(() => this.formatMilliseconds(this.emulatorStats?.time_current)),
                shuckie_frames: computed(() => "." + this.getCentiseconds(this.emulatorStats?.time_current)),
                timer_clock:    computed(() => timerText.value[0]),
                timer_frames:   computed(() => timerText.value[1]),
            },
            // What <clock-frame> posts to the out-of-process clock (core/overlay/ClockFrame.ts), read
            // the same way: the overlay's render never depends on the timer fields or the polls.
            clockState: computed(() => this.timer_frame_state),
        };
    },
    data() {
        return {
            ready                        : false,
            isInDevMode                  : StyleSettingsUtils.isDevMode(), // Track if running in development mode
            mapper                       : null,
            debugging_mode               : true,
            enemy_sprite_styles_enabled  : true, // Dev-only toggle: when false (and in dev mode), bypass enemy sprite resize/offset/flip for legacy/native rendering. Packaged builds always apply styles.

            // Style Mode (dev only): iterate through every species in g5PokemonData
            // showing each one in slot 0 of the enemy graphic with the resize handle
            // active. Enter commits + advances; Backspace discards + goes back.
            style_mode_active         : false,
            style_mode_index          : 0,
            style_mode_species_list   : [],
            // Dummy move types for the style-mode moveset preview, so the icon
            // slots render with plausible variety rather than four blanks.
            style_mode_dummy_moves    : [
                { name: 'Tackle',     type: 'normal' },
                { name: 'Water Gun',  type: 'water'  },
                { name: 'Ember',      type: 'fire'   },
                { name: 'Vine Whip',  type: 'grass'  },
            ],
            state                        : "No Pokemon",
            editor                       : false,
            game_variables               : null,
            autosplitter_toggle          : true,
            evolution                    : MyStorage["evolution"] ?? false,
            evolution_splits_label       : MyStorage["evolution_splits_label"] ?? "",
            selected_evolution_species   : null,  // Currently selected species in evolution family for styling
            evolution_family_list        : [],    // List of species in the current evolution family
            last_known_species           : null,  // Track last known species for evolution detection
            last_known_personality_value : null,  // Track last known personality value for evolution detection
            evolution_transitioning      : false, // Flag to track if evolution transition is in progress
            evolution_old_species        : null,  // Species before evolution (for transition)
            evolution_new_species        : null,  // Species after evolution (for transition)
            evolution_transition_progress: 0,     // Progress of evolution transition (0-1)
            show_evolved_base_stats      : false, // Flag to show base stats of evolved species until next battle
            evolved_species_for_stats    : null,  // Species to show base stats for
            is_loading_evolution_style   : false, // Flag to prevent watchers from saving during style loading
            evolved_base_stats           : false, // Flag to show base stats of evolved species until next battle
            selected_game                : MyStorage['selected_game'] ?? "Black",
            starter_choice               : "Tepig",
            refilming_mode               : false,
            show_advanced_settings       : MyStorage['show_advanced_settings'] ?? false,

            // RNG modal lookup tables (item name -> patch value)
            stpRoute5BerryGirl: {
                "Random Berry": 0,
                "Pomeg Berry": 1,
                "Kelpsey Berry": 2,
                "Qualot Berry": 3,
                "Hondew Berry": 4,
                "Grepa Berry": 5,
                // "Tamato Berry": 6, // unobtainable in regular gameplay, use PokeAByte to obtain it
            },
            stpPWTShards: {
                "Random Shard": 0,
                "Red Shard": 1,
                "Blue Shard": 2,
                "Yellow Shard": 3,
                "Green Shard": 4,
            },

            // RNG modal state
            showRNGModal: false,
            rng_npcs: [
                { key: "stpRoute5BerryGirl", label: "Route 5 Berry Girl", mapIndex: 18, bagCategory: "berries", patchProp: "stpRoute5BerryGirl", defaultItem: "Random Berry" },
                { key: "stpPWTShards",       label: "PWT Shards",         mapIndex: 36, bagCategory: "items",   patchProp: "stpPWTShards",       defaultItem: "Random Shard" },
            ],
            rng_config: MyStorage['rng_config'] ?? {
                stpRoute5BerryGirl: ["Random Berry"],
                stpPWTShards:       ["Random Shard"],
            },
            rng_trip_index: {
                stpRoute5BerryGirl: 0,
                stpPWTShards:       0,
            },

            // Shadow Stitch Settings
            second_screen_mode: MyStorage['second_screen_mode'] ?? false,
            live_hp: MyStorage['live_hp'] ?? false,
            stop_timer_after_n_dialogue: MyStorage['stop_timer_after_n_dialogue'] ?? false,

            // Settings
            // Decision 27 (core/overlay/rightPanelMode.ts): an old or unknown value reads as Automatic.
            right_ui                     : readRightPanelMode(MyStorage['right_ui']).mode,
            // Decision 30: the wild panel, off by default.
            show_wild_battles            : MyStorage['show_wild_battles']      ?? false,
            previous_label               : MyStorage['previous_label']         ?? "Previous",
            current_label                : MyStorage['current_label']          ?? "Current",
            collect_split_data           : MyStorage['collect_split_data']     ?? true,
            previous_splits              : MyStorage['previous_splits']         ?? [],
            previous_splits_source       : MyStorage['previous_splits_source']  ?? null,
            current_splits               : MyStorage['current_splits']          ?? [],
            /** The row the last battle's simple split would be (trainer key, time, id), for its replay bookmark. */
            last_simple_split            : null,
            toggle_compare_splits        : MyStorage['toggle_compare_splits']   ?? 'First',
            demo_splits                  : false,
            automatic_post_battle_splits : MyStorage['automatic_post_battle_splits'] ?? true,
            unobtainable_moves_toggle    : MyStorage['unobtainable_moves_toggle']    ?? "Always Cross Out",
            second_screen_toggle         : MyStorage['second_screen_toggle']         ?? false,
            banned_hidden_power          : MyStorage['banned_hidden_power']          ?? true,
            prepare_for_splits           : false,

            emulatorStatsInterval        : null,
            emulatorStats                : null,
            failCounter                  : 0,
            
            shuckie_timer                : MyStorage['shuckie_timer']                ?? false,
            shuckie_counters             : MyStorage['shuckie_counters']             ?? false,
            shuckie_bookmarks            : shuckieBookmarksEnabled(),

            // Fix for Resets and Blackouts incrementing twice instead of just once
            disallow_faults: false,
            disallow_delay : 2000,
            
            // Editor variables
            move1_replacement: MyStorage['move1_replacement'] ?? "",
            move2_replacement: MyStorage['move2_replacement'] ?? "",
            move3_replacement: MyStorage['move3_replacement'] ?? "",
            move4_replacement: MyStorage['move4_replacement'] ?? "",
            held_item_replacement: MyStorage['held_item_replacement'] ?? "",
            item1_replacement: MyStorage['item1_replacement'] ?? "Rare Candy",
            item2_replacement: MyStorage['item2_replacement'] ?? "PP Up",
            item3_replacement: MyStorage['item3_replacement'] ?? "Full Restore",
            item4_replacement: MyStorage['item4_replacement'] ?? "Max Elixir",

            // POKEMON CONFIG (components) ---------------------------------//
            starter                : "Druddigon",
            pkmnNature             : "Adamant",
            pkmn_gender            : "Female",
            pkmn_ability           : null,
            hidden_power_type      : "Dark",
            hidden_power_index     : 0,
            // The starter's IVs (2026-09-17, core/logic/starterIvs.ts): `Automatic` is the Hidden
            // Power dropdowns, `Manual` the six fields. Per starter, shared across an evolution
            // family, like hidden_power_type. Either way they land in set_starter_stats_object.ivs.
            iv_mode                : IV_MODE.automatic,
            manual_ivs             : clampIvs(null),
            overlayNew             : "Chimchar",
            overlayOld             : "Chimchar",
            testStatus             : MyStorage['testStatus']           ?? false,
            wild_pokemon_display   : false,
            stats_setting          : MyStorage['stats_setting']        ?? "Automatic",
            expBarToggle           : MyStorage['expBarToggle']         ?? true,
            show_nature_changes    : MyStorage['show_nature_changes']  ?? true,
            show_tutor_moves       : MyStorage['show_tutor_moves']     ?? true,
            
            stat_fix_toggle        : true,
            stat_fix_lvl           : 0,
            stat_fix_hp            : 0,
            stat_fix_atk           : 0,
            stat_fix_def           : 0,
            stat_fix_spe           : 0,
            stat_fix_spa           : 0,
            stat_fix_spd           : 0,

            held_item_fix: "",
            fix_ability: "",
            move_fix_name_1: "",
            move_fix_name_2: "",
            move_fix_name_3: "",
            move_fix_name_4: "",
            move_fix_pp_1: null,
            move_fix_pp_2: null,
            move_fix_pp_3: null,
            move_fix_pp_4: null,
            move_fix_power_1: 0,
            move_fix_power_2: 0,
            move_fix_power_3: 0,
            move_fix_power_4: 0,
            fix_friendship: 0,

            set_starter_stats_object: {
                ivs: {
                    hp: 31,
                    atk: 31,
                    def: 31,
                    spe: 31,
                    spa: 31,
                    spd: 31,
                },
                gender: 10,
                nature: 'Hardy',
                ability: 0,
            },

            simple_natures: {
                "0" : "Hardy",
                "1" : "Lonely",
                "2" : "Brave",
                "3" : "Adamant",
                "4" : "Naughty",
                "5" : "Bold",
                "6" : "Docile",
                "7" : "Relaxed",
                "8" : "Impish",
                "9" : "Lax",
                "10": "Timid",
                "11": "Hasty",
                "12": "Serious",
                "13": "Jolly",
                "14": "Naive",
                "15": "Modest",
                "16": "Mild",
                "17": "Quiet",
                "18": "Bashful",
                "19": "Rash",
                "20": "Calm",
                "21": "Gentle",
                "22": "Sassy",
                "23": "Careful",
                "24": "Quirky",
            },
            // Button-grid nature selector (mirrors the dropdown). Order/labels match the natures' "raises"/"lowers" strings.
            natureStats: [
                { key: "Attack",          short: "Atk" },
                { key: "Defense",         short: "Def" },
                { key: "Special Attack",  short: "SpA" },
                { key: "Special Defense", short: "SpD" },
                { key: "Speed",           short: "Spe" },
            ],
            // Neutral natures don't store a stat, so map them onto the diagonal both ways.
            neutralNatureByStat: {
                "Attack": "Hardy",
                "Defense": "Docile",
                "Speed": "Serious",
                "Special Attack": "Bashful",
                "Special Defense": "Quirky",
            },
            neutralStatByNature: {
                "Hardy": "Attack",
                "Docile": "Defense",
                "Serious": "Speed",
                "Bashful": "Special Attack",
                "Quirky": "Special Defense",
            },
            hiddenPowerTypes : {
                15: "Dark",
                8 : "Fire",
                6 : "Ghost",
                11: "Electric",
                10: "Grass",
                9 : "Water",
                4 : "Rock",
                1 : "Flying",
                0 : "Fighting",
                3 : "Ground",
                13: "Ice",
                12: "Psychic",
                5 : "Bug",
                7 : "Steel",
                14: "Dragon",
                2 : "Poison",
            },
            pokemon_list: [],
            // Battle-only form shown outside battle so it can be styled ahead of a run ("" = base
            // form); in battle the game's own form takes over (see active_battle_form)
            battle_form: MyStorage['battle_form'] ?? "",
            
            // USER CONFIG (components) ------------------------------------------------------------------------// 
            typeCalcs: true,

            //CSS styling values
            statLabelOpacityValue: 0.1, //used when a stage modifier is applied

            //DATA ---------------------------------------------------------------------------------------------//
            stageModifiersData        : stageModifiersData,
            typeEffectivenessArray    : typeEffectivenessArray,
            typeData                  : typeData,
            typeBoostingItems         : typeBoostingItems,
            hiddenPowerTypes          : hiddenPowerTypes,
            textures                  : textures,
            default_colors            : default_colors,
            autosplitter              : autosplitter,
            post_game_moves           : post_game_moves,
            auto_save_settings        : auto_save_settings,
            natures                   : natures,
            hiddenpower_type_selector : hiddenpower_type_selector,
            game_variables            : game_variables,
            natural_gift              : natural_gift,
            cross_generation_moves    : cross_generation_moves,
            hiddenpowers              : hiddenpowers,
            ability_glossary          : ability_glossary,
            demo_split_data           : demo_split_data,
            unobtainable_moves_object : unobtainable_moves_object,

            // Data (New as of 2024-06-02)
            // These files contain the most up-to-date data for both trainers and pokemon.
            // The frontend is not currently using these paths and it needs to be updated so that it can.
            // This will enable game switching within generation 4 and it will allow this frontend to eventually be used for generation 5.
            pokedex_black_white   : pokedex_black_white,
            pokedex_black2_white2 : pokedex_black2_white2,
            trainers_black : trainers_black,
            tmhm           : tmhm,
            g5tmhmMapping  : g5tmhmMapping,
            black_moves    : black_moves,

            //LOOPS
            badges:          [0, 1, 2, 3, 4, 5, 6, 7],
            badgeBoosts:     ["badge1", "badge3", "badge5", "badge7"],
            moves:           ["move1","move2","move3","move4",],
            pkmnSlots:       [0, 1, 2, 3, 4, 5],
            // The trainer the "Trainers" right panel previews (a trainer-table id), and the picker's search text.
            examined_trainer: MyStorage['examined_trainer'] ?? "",
            search_trainers:  "",
            modifier_values: ["attack","defense","special_attack","special_defense","speed"],
            simple_natures: {
                "0" : "Hardy",
                "1" : "Lonely",
                "2" : "Brave",
                "3" : "Adamant",
                "4" : "Naughty",
                "5" : "Bold",
                "6" : "Docile",
                "7" : "Relaxed",
                "8" : "Impish",
                "9" : "Lax",
                "10": "Timid",
                "11": "Hasty",
                "12": "Serious",
                "13": "Jolly",
                "14": "Naive",
                "15": "Modest",
                "16": "Mild",
                "17": "Quiet",
                "18": "Bashful",
                "19": "Rash",
                "20": "Calm",
                "21": "Gentle",
                "22": "Sassy",
                "23": "Careful",
                "24": "Quirky",
            },
            stat_object:     [
                {abrv: "Hp",  name: "Hp",              name_stat_exp: "Hp",      label: "HP",   vitamin: "HP Up",   path: "hp",              mod_path: "Hp",             mod_abrv: "hp",  base_stat_path: "base_hp",      object_identifier: "hp",      dv: "dvHp",      hp_spe_label_row: 1, hp_spd_label_row: 1, label_column: 1, stat_row: 1, value_column: 2,}, 
                {abrv: "Atk", name: "Attack",          name_stat_exp: "Attack",  label: "Atk.", vitamin: "Protein", path: "attack",          mod_path: "Attack",         mod_abrv: "atk", base_stat_path: "base_atk",     object_identifier: "atk",     dv: "dvAttack",  hp_spe_label_row: 2, hp_spd_label_row: 2, label_column: 1, stat_row: 2, value_column: 2,}, 
                {abrv: "Def", name: "Defense",         name_stat_exp: "Defense", label: "Def.", vitamin: "Iron",    path: "defense",         mod_path: "Defense",        mod_abrv: "def", base_stat_path: "base_def",     object_identifier: "def",     dv: "dvDefense", hp_spe_label_row: 3, hp_spd_label_row: 3, label_column: 1, stat_row: 3, value_column: 2,}, 
                {abrv: "SpA", name: "Special Attack",  name_stat_exp: "Special", label: "SpA.", vitamin: "Calcium", path: "special_attack",  mod_path: "SpecialAttack",  mod_abrv: "spA", base_stat_path: "base_spc_atk", object_identifier: "spc_atk", dv: "dvSpecial", hp_spe_label_row: 1, hp_spd_label_row: 2, label_column: 3, stat_row: 2, value_column: 4,}, 
                {abrv: "SpD", name: "Special Defense", name_stat_exp: "Special", label: "SpD.", vitamin: "Zinc",    path: "special_defense", mod_path: "SpecialDefense", mod_abrv: "spD", base_stat_path: "base_spc_def", object_identifier: "spc_def", dv: "dvSpecial", hp_spe_label_row: 2, hp_spd_label_row: 3, label_column: 3, stat_row: 3, value_column: 4,}, 
                {abrv: "Spe", name: "Speed",           name_stat_exp: "Speed",   label: "Spe.", vitamin: "Carbos",  path: "speed",           mod_path: "Speed",          mod_abrv: "spe", base_stat_path: "base_spd",     object_identifier: "spd",     dv: "dvSpeed",   hp_spe_label_row: 3, hp_spd_label_row: 1, label_column: 3, stat_row: 1, value_column: 4,}, 
            ],

            //VARIABLES THAT TRACK IN GAME PROGRESS ------------------------------------------------------------//
            playerId      : -1,
            resets        : 0,
            trainerBattles: 0,
            wildEncounters: 0,
            blackout: false,
            run_complete: MyStorage['run_complete'] ?? false,

            //STATE MANAGEMENT ---------------------------------------------------------------------------------//
            gameStarted:  true, //tracks if the player has a save game or not
            playerID:     999,
            expBarState: {
                species:   "",
                expPoints: 0,
            },
            expBarAnimation: true,
            slotTimingFix:   false,
            enemyModColour:  [0, "background: #d84444;"],
            enemyState:      "Pokemon",
            field_array:     ["Reflect", 0],
            last_initiated_field_effect: "Reflect",

            encounters_route_1: MyStorage["encounters_route_1"] ?? false,
            encounters_route_2: MyStorage["encounters_route_2"] ?? false,

            encounters_route_19: MyStorage["encounters_route_19"] ?? false,
            encounters_route_20: MyStorage["encounters_route_20"] ?? false,
            encounters_flocessy_ranch: MyStorage["encounters_flocessy_ranch"] ?? false,

            encounters_woobat     : MyStorage["encounters_woobat"]     ?? false,
            encounters_roggenrola : MyStorage["encounters_roggenrola"] ?? false,
            encounters_pidove     : MyStorage["encounters_pidove"]     ?? true,
            encounters_tympole    : MyStorage["encounters_tympole"]    ?? false,
            encounters_timburr    : MyStorage["encounters_timburr"]    ?? false,

            encounters_psyduck   : MyStorage["encounters_psyduck"]   ?? true,
            encounters_pidove    : MyStorage["encounters_pidove"]    ?? true,

            //Pokemon settings for local storage
            overlay_color: MyStorage["overlay_color"] ?? "#000000",
            imageXOffset : MyStorage["imageXOffset"]  ?? 0,
            imageYOffset : MyStorage["imageYOffset"]  ?? 0,
            imageScale   : MyStorage["imageScale"]    ?? 1,
            imageFlip    : MyStorage["imageFlip"]     ?? false,

            // Enemy sprite resize tool (Ctrl+Click on an enemy sprite)
            enemyResize        : { species: null, slot: null, baseSize: 108, spriteEl: null },
            enemyScaleVersion  : 0,

            imageSat     : MyStorage["imageSat"]      ?? 100,
            imageRotation: MyStorage["imageRotation"] ?? 0,

            //background texture settings
            backgroundBlur       : MyStorage["backgroundBlur"]        ?? 0,
            backgroundHue        : MyStorage["backgroundHue"]         ?? 0,
            backgroundScale      : MyStorage["backgroundScale"]       ?? 100,
            backgroundUrl        : MyStorage["backgroundUrl"]         ?? "",
            backgroundFlip       : MyStorage["backgroundFlip"]        ?? false,
            backgroundXFlip      : MyStorage["backgroundXFlip"]       ?? false,
            use_custom_background: MyStorage["use_custom_background"] ?? false,
            backgroundXOffset    : MyStorage["backgroundXOffset"]     ?? 0,
            backgroundYOffset    : MyStorage["backgroundYOffset"]     ?? 0,
            backgroundTexture    : MyStorage["backgroundTexture"]     ?? 'Bug',
            backgroundBrightness : MyStorage["backgroundBrightness"]  ?? 100,
            backgroundContrast   : MyStorage["backgroundContrast"]    ?? 100,
            backgroundSaturation : MyStorage["backgroundSaturation"]  ?? 100,

            //backed up pokemon specific settings
            // The subset of pokemon_settings that is visual styling. A battle-only form being
            // displayed keeps these on its own storage key; everything else in pokemon_settings
            // (counters, nature, ability, encounters...) stays on the solo Pokemon's key
            visual_style_settings: [
                "overlay_color", "imageXOffset", "imageYOffset", "imageScale", "imageFlip", "imageSat", "imageRotation",
                "backgroundBlur", "backgroundHue", "backgroundScale", "backgroundUrl", "use_custom_background",
                "backgroundXOffset", "backgroundYOffset", "backgroundTexture", "backgroundBrightness",
                "backgroundContrast", "backgroundSaturation", "backgroundFlip", "backgroundXFlip", "ui_saturation",
            ],
            pokemon_settings: [
                "overlay_color",
                "imageXOffset",
                "imageYOffset",
                "imageScale",
                "imageFlip",
                "imageSat",
                "imageRotation",

                "backgroundBlur",
                "backgroundHue",
                "backgroundScale",
                "backgroundUrl",
                "use_custom_background",
                "backgroundXOffset",
                "backgroundYOffset",
                "backgroundTexture",
                "backgroundBrightness",
                "backgroundContrast",
                "backgroundSaturation",
                "backgroundFlip",
                "backgroundXFlip",

                "attempt_number",
                "pb_time",
                "pkmnNature",
                "pkmn_ability",
                "hidden_power_type",
                "hidden_power_index",
                "iv_mode",
                "manual_ivs",
                "pkmn_gender",
                "finished_run_count",
                "evolution_splits_label",
                "playerResets",
                "blackout_counter",
                "ui_saturation",
                "frame",
                "encounters_route_1",
                "encounters_route_2",
                "encounters_woobat",
                "encounters_roggenrola",
                "encounters_pidove",
                "encounters_tympole",
                "encounters_timburr",
                "encounters_route_19",
                "encounters_route_20",
                "encounters_flocessy_ranch",
                "encounters_psyduck",
                "encounters_pidove",

            ],
            timer_startTimeOffset: MyStorage["timer_startTimeOffset"] ?? "00:00:00.00",
            time_split_start:      MyStorage['time_split_start']      ?? "00:00:00:00",
            battle_start:          MyStorage['battle_start']          ?? 0,
            timer:                 new Timer(MyStorage),
            timer_frame_live:      false, // the out-of-process clock is showing (core/overlay/ClockFrame.ts)
            timer_frame_version:   0,     // bumped by Timer.onChange: its storage is not reactive

            //resets
            playerId                 : MyStorage["playerId"] ?? 0,
            playerName               : "",
            resetCatcher             : "NINTEN",
            playerResets             : MyStorage["playerResets"] ?? 0,
            blackout_counter         : MyStorage["blackout_counter"] ?? 0,
            resetCounter             : true,
            game_over                : false,
            hallOfFameReset          : false,
            finished_logs            : false,
            pb_time                  : "None",
            split_logStr             : "",
            attempt_number           : 0,
            finished_run_count       : 0,
            split_data               : MyStorage["split_data"]          ?? [],
            simple_data_str          : MyStorage["simple_data_str"]     ?? "",
            simple_data              : MyStorage["simple_data"]         ?? "",
            n_dialogue_gametime      : MyStorage["n_dialogue_gametime"] ?? "",
            testRun                  : MyStorage['testRun']             ?? false,
            copy_overlay_pokemon_from: "",
            copy_overlay_pokemon_to  : "",

            // buffer properties
            buffer_battle_level          : 0,
            buffer_battle_exp            : 0,
            buffer_battle_attack         : 0,
            buffer_battle_defense        : 0,
            buffer_battle_speed          : 0,
            buffer_battle_special_attack : 0,
            buffer_battle_special_defense: 0,
            buffer_battle_friendship     : 0,

            // UI
            ui_saturation:                MyStorage["ui_saturation"]                ?? .6,
            ui_type_colors:               MyStorage["ui_type_colors"]               ?? "Current",
            ui_type_color_modifier:       MyStorage["ui_type_color_modifier"]       ?? "current_",
            ui_type_icons:                MyStorage["ui_type_icons"]                ?? "2024",
            ui_type_icons_modifier:       MyStorage["ui_type_icons_modifier"]       ?? "2024/",
            ui_stats_styling:             MyStorage["ui_stats_styling"]             ?? "2024",
            ui_stats_styling_modifier:    MyStorage["ui_stats_styling_modifier"]    ?? "",
            ui_stat_arrangement:          MyStorage['ui_stat_arrangement']          ?? "HP, Atk, Def, Spe, SpA, SpD",
            ui_stat_arrangement_modifier: MyStorage['ui_stat_arrangement_modifier'] ?? "hp_spe_",
        }
    },
    created() {
        // Log the current mode for style settings
        console.log(`[StyleSettings] App initialized in ${this.isInDevMode ? 'DEVELOPMENT' : 'PRODUCTION'} mode`);
        console.log(`[StyleSettings] ${this.isInDevMode ? 'Style changes will be saved to the defaults file' : 'User style overrides will be saved locally'}`);
        
        if (MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`]) {  
            this.overlay_color          = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`].overlay_color           ?? this.default_colors[g5PokemonData[this.starter].type_1];
            this.ui_saturation          = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`].ui_saturation           ?? .6;
            this.imageXOffset           = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`].imageXOffset            ?? 0;
            this.imageYOffset           = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`].imageYOffset            ?? 0;
            this.imageScale             = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`].imageScale              ?? 1;
            this.imageFlip              = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`].imageFlip               ?? false;
            this.imageSat               = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`].imageSat                ?? 100
            this.imageRotation          = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`].imageRotation           ?? 0

            this.backgroundBlur         = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`].backgroundBlur          ?? 0
            this.backgroundHue          = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`].backgroundHue           ?? 0
            this.backgroundScale        = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`].backgroundScale         ?? 100
            this.backgroundUrl          = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`].backgroundUrl           ?? ""
            this.use_custom_background  = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`].use_custom_background   ?? false
            this.backgroundXOffset      = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`].backgroundXOffset       ?? 0
            this.backgroundYOffset      = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`].backgroundYOffset       ?? 0
            this.backgroundTexture      = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`].backgroundTexture       ?? `${this.g5PokemonData[this.starter].type_1}`
            
            this.pkmn_ability           = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`]?.pkmn_ability           ?? g5PokemonData[this.starter].abilities[0]
            this.attempt_number         = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`]?.attempt_number         ?? 0
            this.finished_run_count     = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`]?.finished_run_count     ?? 0
            this.playerResets           = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`]?.playerResets           ?? 0
            this.blackout_counter       = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`]?.blackout_counter       ?? 0
            this.evolution              = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`]?.evolution              ?? false
            this.evolution_splits_label = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`]?.evolution_splits_label ?? ""
            this.frame                  = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`]?.frame                  ?? 0
            this.encounters_route_1     = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`]?.encounters_route_1     ?? false
            this.encounters_route_2     = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`]?.encounters_route_2     ?? false
            this.encounters_woobat      = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`]?.encounters_woobat      ?? false
            this.encounters_roggenrola  = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`]?.encounters_roggenrola  ?? false
            this.encounters_pidove      = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`]?.encounters_pidove      ?? true
            this.encounters_tympole     = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`]?.encounters_tympole     ?? false
            this.encounters_timburr     = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`]?.encounters_timburr     ?? false
            this.encounters_route_19       = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`]?.encounters_route_19    ?? false
            this.encounters_route_20       = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`]?.encounters_route_20    ?? false
            this.encounters_flocessy_ranch = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`]?.encounters_flocessy_ranch ?? false
            this.encounters_psyduck        = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`]?.encounters_psyduck    ?? false
            this.encounters_pidove         = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`]?.encounters_pidove     ?? true
        }
        for (let i = 0; i < this.pokemon_settings.length; i++) {
            let propName = this.pokemon_settings[i];
            this.$watch(
                () => this[propName],
                (newValue) => {
                    // Skip saving if we're currently loading evolution styles to prevent overwriting
                    if (this.is_loading_evolution_style) {
                        return;
                    }
                    
                    // Shared evolution family properties (ability, nature, gender, hidden power) 
                    // should be saved to the evolution family storage key when evolution is enabled
                    // These settings apply to all members of the evolution family
                    const sharedEvolutionFamilyProperties = ['pkmnNature', 'pkmn_ability', 'pkmn_gender', 'hidden_power_type', 'hidden_power_index', 'iv_mode', 'manual_ivs'];
                    const isSharedFamilyProperty = sharedEvolutionFamilyProperties.includes(propName);
                    
                    let storageKey;
                    if (this.evolution && isSharedFamilyProperty) {
                        // Use evolution family storage key for shared properties (e.g., "Black_Unfezant-line")
                        storageKey = this.getEvolutionFamilyStorageKey(this.starter);
                    } else {
                        // Use the appropriate storage key based on evolution mode for other properties
                        // If evolution is enabled and selected_evolution_species is set, use evolution line storage
                        // Otherwise, use individual species storage
                        // This ensures styles are saved to the correct location (e.g., "Black_Unfezant-line-Pidove" vs "Black_Pidove")
                        storageKey = this.getCurrentStorageKey();
                        // A battle-only form being displayed keeps its visual styles on its own key
                        if (this.visual_style_settings.includes(propName)) {
                            storageKey = this.getStyleStorageKey();
                        }
                    }
                    
                    // Ensure that MyStorage[storageKey] is an object
                    if (!MyStorage[storageKey]) {
                        MyStorage[storageKey] = {};
                    }

                    // Set the new value
                    MyStorage[storageKey] = {
                            ...MyStorage[storageKey],
                            [propName]: newValue
                    };
                },
                // flush: 'sync' -- the precedence Vue 3.2 gave these; see tools/port/lift-gen5.py.
                { flush: 'sync' }
            );
        }
        for (let i = 0; i < this.auto_save_settings.length; i++) {
            let propName = this.auto_save_settings[i];
            this.$watch(
                () => this[propName], // Using a function to return the property's value
                (newValue) => {
                    MyStorage[`${propName}`] = newValue;
                }
            );
        }
        // A trainer battle ends the post-battle Splits: enemy_graphic on, Style Mode off, and an opponent team count
        // other than 0 (the condition of the old write inside the battlePokemonCrop computed). Decision 27: it ends
        // only the override; it used to set the setting itself to Automatic, a "Splits" picked by the operator too.
        this.$watch(
            () => this.right_panel_override == "Splits" && this.enemy_graphic == true
                && !(this.isInDevMode && this.style_mode_active)
                && this.game.properties.battle.opponent.team_count.value != 0,
            (leave_splits) => {
                if (leave_splits) {
                    this.clear_right_panel_override()
                }
            },
            { immediate: true }
        );
    },
    watch: {
        enemy_graphic(newValue) {
            if (newValue == false && this.prepare_for_splits == true) {
                this.prepare_for_splits = false
                this.show_post_battle_splits()
            }
        },
        // backgroundTexture(newValue) {
        //     const game = this.selected_game
        //     const starter = this.starter
        //     console.log(game, starter, MyStorage[`${game}_${starter}`].backgroundTexture, newValue)
        //     if (MyStorage[`${game}_${starter}`].backgroundTexture !== newValue) {
        //         this.backgroundBlur         = this.default_texture_settings('backgroundBlur', 0)
        //         this.backgroundHue          = this.default_texture_settings('backgroundHue', 0)
        //         this.backgroundScale        = this.default_texture_settings('backgroundScale', 100)
        //         this.backgroundUrl          = this.default_texture_settings('backgroundUrl', "")
        //         this.backgroundFlip         = this.default_texture_settings('backgroundFlip', false)
        //         this.use_custom_background  = this.default_texture_settings('use_custom_background', false)
        //         this.backgroundXOffset      = this.default_texture_settings('backgroundXOffset', 0)
        //         this.backgroundYOffset      = this.default_texture_settings('backgroundYOffset', 0)
        //         this.backgroundBrightness   = this.default_texture_settings('backgroundBrightness', 100)
        //         this.backgroundContrast     = this.default_texture_settings('backgroundContrast', 100)
        //         this.backgroundSaturation   = this.default_texture_settings('backgroundSaturation', 100)
        //     }
        // },
        current_splits: {
            handler: function (newVal, oldVal) {
                MyStorage['current_splits'] = newVal
            },
            deep: true,
        },
        previous_splits: {
            handler: function (newVal, oldVal) {
                MyStorage['previous_splits'] = newVal
            },
            deep: true,
        },
        previous_splits_source(newVal) {
            MyStorage['previous_splits_source'] = newVal
        },
        encounters_route_1(newValue) {
            if (this.game.properties.overworld.map_index.value == 317) {
                this.game.properties.overworld.encounters_enabled.set(newValue, false)
            }
        },
        encounters_route_2(newValue) {
            if (this.game.properties.overworld.map_index.value == 319) {
                this.game.properties.overworld.encounters_enabled.set(newValue, false)
            }
        },
        encounters_route_19(newValue) {
            if (this.game.properties.overworld.map_index.value == 320) {
                this.game.properties.overworld.encounters_enabled.set(newValue, false)
            }
        },
        encounters_route_20(newValue) {
            if (this.game.properties.overworld.map_index.value == 321) {
                this.game.properties.overworld.encounters_enabled.set(newValue, false)
            }
        },
        encounters_flocessy_ranch(newValue) {
            if (this.game.properties.overworld.map_index.value == 322) {
                this.game.properties.overworld.encounters_enabled.set(newValue, false)
            }
        },
        // encounters_psyduck(newValue) {
        //     const variable = this.game.properties.patch.encounter_psyduck.value
        //     if (variable == 2) {
        //         return;
        //     }
        //     switch (newValue) {
        //         case true:
        //             this.game.properties.patch.encounter_psyduck.set(1, false)
        //             break;
        //         case false:
        //             this.game.properties.patch.encounter_psyduck.set(0, false)
        //             break;
        //     }
        // },
        // encounters_pidove(newValue) {
        //     const variable = this.game.properties.patch.encounter_pidove.value
        //     if (variable == 2) {
        //         return;
        //     }
        //     switch (newValue) {
        //         case true:
        //             this.game.properties.patch.encounter_pidove.set(1, false)
        //             break;
        //         case false:
        //             this.game.properties.patch.encounter_pidove.set(0, false)
        //             break;
        //     }
        // },
        encounters_woobat(newValue) {
            const variable = this.game.properties.patch.encounter_woobat.value
            if (variable == 2) {
                return;
            }
            switch (newValue) {
                case true:
                    this.game.properties.patch.encounter_woobat.set(1, false)
                    break;
                case false:
                    this.game.properties.patch.encounter_woobat.set(0, false)
                    break;
            }
        },
        encounters_roggenrola(newValue) {
            const variable = this.game.properties.patch.encounter_roggenrola.value
            if (variable == 2) {
                return;
            }
            switch (newValue) {
                case true:
                    this.game.properties.patch.encounter_roggenrola.set(1, false)
                    break;
                case false:
                    this.game.properties.patch.encounter_roggenrola.set(0, false)
                    break;
            }
        },
        encounters_tympole(newValue) {
            const variable = this.game.properties.patch.encounter_tympole.value
            if (variable == 2) {
                return;
            }
            switch (newValue) {
                case true:
                    this.game.properties.patch.encounter_tympole.set(1, false)
                    break;
                case false:
                    this.game.properties.patch.encounter_tympole.set(0, false)
                    break;
            }
        },
        encounters_timburr(newValue) {
            const variable = this.game.properties.patch.encounter_timburr.value
            if (variable == 2) {
                return;
            }
            switch (newValue) {
                case true:
                    this.game.properties.patch.encounter_timburr.set(1, false)
                    break;
                case false:
                    this.game.properties.patch.encounter_timburr.set(0, false)
                    break;
            }
        },
        encounters_pidove(newValue) {
            const variable = this.game.properties.patch.encounter_pidove.value
            if (variable == 2) {
                return;
            }
            switch (newValue) {
                case true:
                    this.game.properties.patch.encounter_pidove.set(1, false)
                    break;
                case false:
                    this.game.properties.patch.encounter_pidove.set(0, false)
                    break;
            }
        },
        encounters_psyduck(newValue) {
            const variable = this.game.properties.patch.encounter_psyduck.value
            if (variable == 2) {
                return;
            }
            switch (newValue) {
                case true:
                    this.game.properties.patch.encounter_psyduck.set(1, false)
                    break;
                case false:
                    this.game.properties.patch.encounter_psyduck.set(0, false)
                    break;
            }
        },
        hidden_power_type(newValue) {
            this.hidden_power_index = 0
            this.apply_starter_ivs()
        },
        hidden_power_index(newValue) {
            this.apply_starter_ivs()
        },
        iv_mode() {
            this.apply_starter_ivs()
        },
        manual_ivs() {
            this.apply_starter_ivs()
        },
        pkmnNature(newValue) {
            this.set_starter_stats_object.nature = newValue
        },
        pkmn_ability(newValue) {
            for (const [key, value] of Object.entries(ability_glossary)) {
                if (value === newValue) {
                    this.set_starter_stats_object.ability = key;
                    return;
                }
            }
            this.set_starter_stats_object.ability = 0;
        },
        evolution(newValue) {
            // When evolution checkbox is toggled, update evolution family list
            if (newValue) {
                this.updateEvolutionFamilyList();
                
                // Prevent enabling evolution for single-species families
                if (this.evolution_family_list.length <= 1) {
                    this.evolution = false;
                    console.log(`[Evolution] Cannot enable evolution for ${this.starter} - single-species evolution family`);
                    return;
                }
                
                // Set default selected evolution species to the starter
                if (!this.selected_evolution_species && this.evolution_family_list.length > 1) {
                    this.selected_evolution_species = this.starter;
                    this.loadEvolutionStyle(this.selected_evolution_species, true);
                    
                    // Save selected evolution species to storage
                    const game_name = this.game?.properties?.meta?.game_name?.value || this.selected_game;
                    if (!MyStorage[`${game_name}_${this.starter}`]) {
                        MyStorage[`${game_name}_${this.starter}`] = {};
                    }
                    MyStorage[`${game_name}_${this.starter}`] = {
                        ...MyStorage[`${game_name}_${this.starter}`],
                        selected_evolution_species: this.starter
                    };
                } else if (this.selected_evolution_species) {
                    // Load styles for the already selected species
                    this.loadEvolutionStyle(this.selected_evolution_species, true);
                }
            } else {
                // When disabled, load individual species styles
                this.loadEvolutionStyle(this.starter, false);
            }

            // Persist the flag under every family member's individual storage key.
            // The flag is loaded from `${game}_${starter}` and mid-run evolution changes
            // this.starter to the evolved stage, so every stage needs the flag or a
            // restart mid-run silently drops evolution mode and scatters split files
            // into per-stage folders.
            const evolution_game_name = this.game?.properties?.meta?.game_name?.value || this.selected_game;
            for (const member of this.getEvolutionFamily(this.starter)) {
                // Every form of a member too: a Burmy's cloak decides which Wormadam it becomes
                for (const variant of this.formVariants(member)) {
                    MyStorage[`${evolution_game_name}_${variant}`] = {
                        ...(MyStorage[`${evolution_game_name}_${variant}`] || {}),
                        evolution: newValue
                    };
                }
            }
        },
        selected_evolution_species(newValue, oldValue) {
            // When a different evolution family species is selected in the dropdown:
            // 1. The Pokemon art will automatically update via displayedPokemonSpecies computed property
            // 2. Load its styles from evolution line storage (e.g., "Unfezant-line-Pidove")
            // 3. If there's a transition (oldValue exists), perform a fade transition
            // 4. Save the selection to storage
            if (newValue && this.evolution) {
                // Load evolution line styles first (before transition) to ensure styles are loaded
                // The flag in loadEvolutionStyle will prevent watchers from overwriting
                this.loadEvolutionStyle(newValue, true);
                
                // If we're changing from one species to another (not initial load), perform transition
                if (oldValue && oldValue !== newValue) {
                    this.performEvolutionTransition(oldValue, newValue);
                }
                
                // Save selected evolution species to storage
                const game_name = this.game?.properties?.meta?.game_name?.value || this.selected_game;
                if (!MyStorage[`${game_name}_${this.starter}`]) {
                    MyStorage[`${game_name}_${this.starter}`] = {};
                }
                MyStorage[`${game_name}_${this.starter}`] = {
                    ...MyStorage[`${game_name}_${this.starter}`],
                    selected_evolution_species: newValue
                };
            }
        },
        active_battle_form(newValue, oldValue) {
            // The displayed battle-only form changed (weather / Zen Mode / Relic Song in battle, the
            // battle ending, or the styling dropdown): load that form's stored styles.
            // loadEvolutionStyle raises is_loading_evolution_style so the style watchers don't save
            // the incoming values over another form's storage. A null oldValue means the solo
            // Pokemon itself just changed, and the starter watcher loads the styles for that.
            if (newValue && oldValue && newValue !== oldValue) {
                this.loadDisplayedStyles();
            }
        },
        starter(newValue, oldValue) {
            // A form saved under Black 2 / White 2 (fused Kyurem, Therian genie, Resolute Keldeo)
            // has no entry in the base games' pokedex, so fall back to the species it belongs to
            if (this.game && newValue in POKEMON_FORM_INFO && !this.g5PokemonData?.[newValue]) {
                this.starter = POKEMON_FORM_INFO[newValue].base
                return
            }
            const starter = newValue
            const game = this.game?.properties.meta.game_name.value
            const state = this.game?.properties.meta.state.value
            MyStorage['starter'] = newValue
            
            // Update evolution family list when starter changes
            this.updateEvolutionFamilyList();
            
            // If evolution is enabled, load selected_evolution_species from storage or default to starter
            if (this.evolution && this.evolution_family_list.length > 0) {
                // Load selected evolution species from storage
                const stored_evolution_species = MyStorage[`${game}_${starter}`]?.selected_evolution_species;
                if (stored_evolution_species && this.evolution_family_list.includes(stored_evolution_species)) {
                    this.selected_evolution_species = stored_evolution_species;
                } else {
                    // Default to starter if not set or invalid
                    this.selected_evolution_species = starter;
                    // Save it
                    if (!MyStorage[`${game}_${starter}`]) {
                        MyStorage[`${game}_${starter}`] = {};
                    }
                    MyStorage[`${game}_${starter}`] = {
                        ...MyStorage[`${game}_${starter}`],
                        selected_evolution_species: starter
                    };
                }
                
                // Load evolution line styles for the selected species
                this.loadEvolutionStyle(this.selected_evolution_species, true);
            } else {
                // Load individual species styles
                if (!MyStorage[`${game}_${starter}`]) {
                    MyStorage[`${game}_${starter}`] = {};
                }
                this.loadEvolutionStyle(starter, false);
            }
            
            // A battle-only form picked for styling belongs to one species; drop a stale pick and
            // show the picked form's own styles on top of the base load above
            if (this.battle_form && BATTLE_ONLY_FORMS[this.battle_form] !== newValue) {
                this.battle_form = "";
            }
            if (this.active_battle_form && this.active_battle_form !== this.starter) {
                this.loadEvolutionStyle(this.active_battle_form, false);
            }

            // Keep frame setting from individual storage for now
            this.frame = MyStorage[`${game}_${starter}`]?.frame ?? false
            
            // Load shared evolution family settings (ability, nature, gender, hidden power) if evolution is enabled
            // Otherwise, load from individual species storage
            if (this.evolution) {
                const evolutionFamilyStorageKey = this.getEvolutionFamilyStorageKey(starter);
                const familyStored = MyStorage[evolutionFamilyStorageKey] || {};
                
                // Load from evolution family storage, fallback to individual storage, then defaults
                this.pkmnNature = familyStored.pkmnNature ?? MyStorage[`${game}_${starter}`]?.pkmnNature ?? "Hardy";
                this.pkmn_ability = familyStored.pkmn_ability ?? MyStorage[`${game}_${starter}`]?.pkmn_ability ?? this.g5PokemonData[starter]?.abilities?.[0] ?? null;
                this.pkmn_gender = familyStored.pkmn_gender ?? MyStorage[`${game}_${starter}`]?.pkmn_gender ?? "Female";
                this.hidden_power_type = familyStored.hidden_power_type ?? MyStorage[`${game}_${starter}`]?.hidden_power_type ?? "Dark";
                this.hidden_power_index = familyStored.hidden_power_index ?? MyStorage[`${game}_${starter}`]?.hidden_power_index ?? 0;
                this.iv_mode = familyStored.iv_mode ?? MyStorage[`${game}_${starter}`]?.iv_mode ?? IV_MODE.automatic;
                this.load_manual_ivs(familyStored.manual_ivs ?? MyStorage[`${game}_${starter}`]?.manual_ivs);
            } else {
                // Evolution is disabled, load from individual species storage
                this.pkmnNature = MyStorage[`${game}_${starter}`]?.pkmnNature ?? "Hardy";
                this.pkmn_ability = MyStorage[`${game}_${starter}`]?.pkmn_ability ?? this.g5PokemonData[starter]?.abilities?.[0] ?? null;
                this.pkmn_gender = MyStorage[`${game}_${starter}`]?.pkmn_gender ?? "Female";
                this.hidden_power_type = MyStorage[`${game}_${starter}`]?.hidden_power_type ?? "Dark";
                this.hidden_power_index = MyStorage[`${game}_${starter}`]?.hidden_power_index ?? 0;
                this.iv_mode = MyStorage[`${game}_${starter}`]?.iv_mode ?? IV_MODE.automatic;
                this.load_manual_ivs(MyStorage[`${game}_${starter}`]?.manual_ivs);
            }
            this.apply_starter_ivs();
            
            //! FIX_LATER Fix this implementation later
            // this.ability           = MyStorage[`${game}_${starter}`]?.ability          ?? this.g5PokemonData[starter].abilities[0],
            this.encounters_route_1 = MyStorage[`${game}_${starter}`]?.encounters_route_1 ?? false
            this.encounters_route_2 = MyStorage[`${game}_${starter}`]?.encounters_route_2 ?? false
            this.encounters_route_19 = MyStorage[`${game}_${starter}`]?.encounters_route_19 ?? false
            this.encounters_route_20 = MyStorage[`${game}_${starter}`]?.encounters_route_20 ?? false
            this.encounters_flocessy_ranch = MyStorage[`${game}_${starter}`]?.encounters_flocessy_ranch ?? false
            
            // Evolution management
            if (this.evolution != true) {
                this.evolution              = MyStorage[`${game}_${starter}`]?.evolution              ?? false
                this.evolution_splits_label = MyStorage[`${game}_${starter}`]?.evolution_splits_label ?? ""

                this.attempt_number     = MyStorage[`${game}_${starter}`]?.attempt_number     ?? 0
                this.finished_run_count = MyStorage[`${game}_${starter}`]?.finished_run_count ?? 0
                this.playerResets       = MyStorage[`${game}_${starter}`]?.playerResets       ?? 0
                this.blackout_counter   = MyStorage[`${game}_${starter}`]?.blackout_counter   ?? 0
            }
            else {

            }

            // When the solo Pokemon changes, write it to PokeAByte's mapper.
            if (oldValue !== newValue) {
                this.update_rom_starter_and_intro_mon();
            }

            // Swapping a species' form re-stamps that species if it is already in the party. Deferred
            // so the ability this watcher just loaded has reached set_starter_stats_object first.
            if (oldValue !== newValue && newValue in POKEMON_FORM_INFO) {
                this.$nextTick(() => this.applyPokemonForm(newValue));
            }
        },
        ui_stat_arrangement(newValue) {
            if (newValue == 'HP, Atk, Def, SpA, SpD, Spe') {
                this.ui_stat_arrangement_modifier = "hp_spe_"
            }
            if (newValue == 'HP, Atk, Def, Spe, SpA, SpD') {
                this.ui_stat_arrangement_modifier = "hp_spd_"
            }
        },
        ui_type_colors(newValue) {
            if (newValue == 'Current') {
                this.ui_type_color_modifier = "current_"
            }
            if (newValue == 'Legacy') {
                this.ui_type_color_modifier = "legacy_"
            }
        },
        playerId(newValue) {
            MyStorage["playerId"] = newValue
            this.game_over = false;
            MyStorage["playerResets"] = 0
            this.playerResets = 0;
            this.finished_logs == false;
            MyStorage["blackout_counter"] = 0
            this.blackout_counter = 0;
        },    
        async playerResets(newProp) {
            if (this.playerResets < 0) {
                this.playerResets = 0;
            }
            MyStorage["playerResets"] = this.playerResets
        },
        blackout_counter(newProp) {
            if (this.blackout_counter < 0) {
                this.blackout_counter = 0;
            }
            MyStorage["blackout_counter"] = this.blackout_counter
        },
        playerNameChoice() {
            this.overlay_color = `lch(75% 100 ${hash(this.playerNameChoice) % 360})`
            MyStorage["playerNameChoice"] = this.playerNameChoice
            MyStorage["overlay_color"] = this.overlay_color
        },
        playerName(newName) {
            MyStorage['playerName'] = newName;
        },
    },
    computed: {
        // The settings panel's description (settingsPanel.ts). It reads nothing reactive itself, so it is
        // built once; the panel component reads the overlay through its closures as it renders.
        settingsPanel() {
            return markRaw(gen5SettingsPanel(this));
        },
        // Standing in the Overworld on the starter's spot before the first battle: base stats and the
        // ability are shown instead of the party's. x and y change with every step there, so the three
        // places that ask (get_stat, pokemon_dynamic_ability, stats_header) read this answer instead and
        // the overlay re-renders only when it flips.
        on_starter_spot() {
            const state = this.game.properties.meta.state.value
            return !!(state == `Overworld` 
                && this.game.properties.overworld.map_index == 391 
                && (this.game.properties.player.team[0].level.value == 0 || this.game.properties.player.team[0].level.value == 5)
                && this.game.properties.overworld.x == 360448 
                && this.game.properties.overworld.y == 491520
                && (
                    this.game.properties.player.team[0].exp.value == 237 ||
                    this.game.properties.player.team[0].exp.value == 100 ||
                    this.game.properties.player.team[0].exp.value == 125 ||
                    this.game.properties.player.team[0].exp.value == 135 ||
                    this.game.properties.player.team[0].exp.value == 156 ||
                    this.game.properties.player.team[0].exp.value == 65 ||
                    this.game.properties.player.team[0].exp.value == 0
                ))
        },
        // average_median_stats() for each stat the panel shows, recomputed only when the dex changes
        average_median_by_stat() {
            const by_stat = {}
            for (const stat_label of ['hp', 'atk', 'def', 'spc_atk', 'spc_def', 'spd']) {
                by_stat[stat_label] = this.average_median_stats_of(stat_label)
            }
            return by_stat
        },
        /** What the out-of-process clock needs (core/overlay/ClockFrame.ts): the Timer's storage fields and Super Shuckie's time. */
        timer_frame_state() {
            this.timer_frame_version // re-read when the Timer reports a change
            // MyStorage itself, not `this.timer.storage`: through the reactive `timer` Vue would wrap the
            // storage proxy and probe it with Symbol keys, which its get trap cannot take.
            const storage = MyStorage
            return {
                mode: this.shuckie_timer ? 'emulator' : 'local',
                startTime: storage.timer_startTime ?? 0,
                pause: storage.timer_pause ?? true,
                pauseTime: storage.timer_pause_time ?? 0,
                emulatorMs: this.emulatorStats?.time_current ?? null,
            }
        },
        /** The faults box's layout and count font sizes (core/overlay/player/FaultsBox.ts); its counts and mode are overlayCommonMixin's. */
        faults_layout() {
            return faultsLayout
        },
        /** The player's move list and the pop-up boxes (core/overlay/player/MoveList.ts, PopupBox.ts), worked out in playerPanel.ts. */
        player_move_list() {
            return playerMoveList(this)
        },
        move_list_layout() {
            return moveListLayout
        },
        battle_popups() {
            return battlePopups(this)
        },
        faults_font_sizes() {
            return faultsFontSizes
        },
        /** The stat tiles, exp bar and badge row (core/overlay/player/), built in playerPanel.ts. */
        stat_tiles() {
            return statTiles(this)
        },
        exp_label() {
            return expBarLabel(this)
        },
        exp_bar_layouts() {
            return expBarLayouts
        },
        exp_bar_timing() {
            return expBarTiming
        },
        badge_row() {
            return badgeRow(this)
        },
        /** The type badges and the Nature / Total rows (core/overlay/player/TypeBadges.ts, InfoRow.ts), worked out once per change in playerPanel.ts. */
        type_badges() {
            return typeBadges(this)
        },
        info_rows() {
            return infoRows(this)
        },
        /**
         * The movepool table's rows, computed once per displayed species. The template
         * called getMovepool() once per row group on every render, and each call resolved
         * every learnset entry against the moves table by a case-insensitive key scan
         * (docs/performance-followups.md, third pass).
         */
        movepoolRows() {
            return this.getMovepool(this.g5PokemonData, this.black_moves, this.g5tmhmMapping, this.displayedPokemonSpecies)
        },
        /**
         * The moves the "Unobtainable Moves" setting crosses out (core/logic/unobtainableMoves.ts): the run
         * rules' bans and, on the first attempt with "HP Banned for 1st Run" on, Hidden Power everywhere;
         * the edition's unobtainable TMs and tutor moves in those rows.
         */
        movepoolStruck() {
            const active = crossOutActive(this.unobtainable_moves_toggle, {
                starterObtained: this.game.properties.meta.state.value != "No Pokemon",
                firstBadge: this.game.properties.player.badges[0].value == true,
            })
            const lists = this.unobtainable_moves_object
            const firstRun = (this.attempt_number > 1 || this.banned_hidden_power == false) ? [] : (lists['First Playthrough'] || [])
            return struckMoves(active, { everywhere: [...(lists['Banned'] || []), ...firstRun], machines: lists[this.selected_game] })
        },
        /**
         * What the shared movepool table (core/overlay/Movepool.vue) shows: gen5's own Hidden Power,
         * Curse, Return/Frustration, form and damage-class rules, built once per change instead of
         * per row per render.
         */
        movepoolView() {
            const prefix = this.ui_type_color_modifier
            const row = (x, way, first) => ({
                way, move: this.move_name(x.move), type: this.movepoolType(x),
                typeColor: `var(--${prefix}${this.movepoolTypeColor(x)?.toLowerCase()})`,
                dc: this.getMoveCategory(x.category)[0],
                dcColor: `var(--${prefix}${this.getMoveCategory(x.category, x)[1].toLowerCase()})`,
                power: this.movepoolPower(x), accuracy: x.accuracy, pp: x.pp, first,
            })
            const rows = this.movepoolRows
            const struck = this.movepoolStruck
            const groups = [
                { struck: struck.everywhere, rows: rows.level.map((x, index) => row(x, x.Level, index === 0)) },
                { struck: struck.everywhere, rows: rows.form.map(x => row(x, "Form")) },
                { struck: struck.machines, rows: rows.tmhm.map(x => row(x, x.Move == 'Whirlpool' ? "HM05" : x.tmhm)) },
            ]
            if (this.show_tutor_moves && (this.selected_game == 'Black 2' || this.selected_game == 'White 2')) {
                groups.push({ struck: struck.machines, rows: rows.tutor.map(x => row(x, "Tutor")) })
            }
            return {
                title: "Movepool",
                titleClass: "posAbs movepoolLabel",
                titleFirst: true,
                dc: true,
                headerColor: `var(--${prefix}${this.starting_type_fix})`,
                // 993px of the 1000px table less the 17px header; rows at 19px/14px, and a long list's font
                // shrinks once its rows are under 17px, a little slower than the rows.
                fit: { containerHeight: 976, lineHeight: 19, fontSize: 14, shrinkFactor: 0.77, fontFrom: 17 },
                groups,
            }
        },
        /** What the shared Splits panel (core/overlay/SplitsPanel.vue) shows in the chosen mode, if any. */
        splitsView() {
            const mode = this.toggle_compare_splits
            if (mode !== "First" && mode !== "Followup") return undefined
            return {
                table: { class: "splits_table", icon: { imgClass: "icons splitIcon" } },
                head: splitsHead(mode, this.previous_label, this.current_label),
                headerColor: `var(--${this.ui_type_color_modifier}${this.starting_type_fix})`,
                rows: (this.compare_splits ?? []).map(split => ({
                    icon: `images/gen5/split_images/${this.getSplitImageName(split.imageTrainer || split.trainer)}.webp`,
                    cells: mode === "First" ? [split.trainer, "", "", split.current_time]
                        : [split.trainer, split.previous_time == "0:00" ? "-" : split.previous_time, split.current_time, split.difference],
                    diffStyle: mode === "First" ? undefined : splitDiffColor(split.difference),
                })),
                art: { class: "colored-image ds", style: [`filter: saturate(${this.ui_saturation})`, "--url: url(images/gen5/ui/splits.svg)"] },
            }
        },
        /** The second-screen layout's copy of the Splits panel: its own table and icon classes and art. */
        secondScreenSplitsView() {
            const view = this.splitsView
            return view && {
                ...view,
                table: { class: "second_screen_splits_table", icon: { imgClass: "icons splitIcon_2" } },
                art: { class: "colored-image ds", style: [`filter: saturate(${this.ui_saturation})`, "--url: url(images/gen5/ui/second_screen_splits.svg)"] },
            }
        },
        /**
         * The game-name folder that splits are written into.
         * Mirrors the logic in logData/logCopy so the "Open Splits Folder"
         * button always points at the active game's directory.
         */
        current_game_folder() {
            return this.game?.properties?.meta?.game_name?.value || this.selected_game;
        },
        /**
         * Check if the current Pokemon has multiple evolution stages
         * Returns true if evolution family has more than one species
         * Used to show/hide evolution checkbox (hide for single-species families like Registeel)
         */
        hasMultipleEvolutionStages() {
            // Get the evolution family for the current starter
            const evolutionFamily = this.getEvolutionFamily(this.starter);
            return evolutionFamily && evolutionFamily.length > 1;
        },
        pokemon_dynamic_ability() {
            const state = this.game.properties.meta.state.value
            let pokemon_data = this.n_battle_data_fix
            if (state == 'From Battle') {
                return this.fix_ability
            }
            else if (this.on_starter_spot) {
                return this.pkmn_ability
            }
            else if (state == 'Battle') {
                return this.game.properties.battle.player.active_pokemon.ability_temp.value
            }
            return pokemon_data.ability.value
        },
        n_battle_data_fix_friendship() {
            const state = this.game.properties.meta.state.value
            const slot_1_species = this.game.properties.player.team[0].species.value
            const player_team_count = this.game.properties.player.team_count.value
            const computed_slot = player_team_count - 1
            let pokemon_data = this.game.properties.battle.player.active_pokemon
            switch (state) {
                case 'Battle':
                    pokemon_data = this.game.properties.battle.player.team[0]
                    break
                case 'From Battle':
                    pokemon_data = this.game.properties.battle.player.team[0]
                    break
                case 'To Battle':
                    pokemon_data = this.game.properties.player.team[0]
                    break
                case 'Overworld':
                    pokemon_data = this.game.properties.player.team[0]
                    break
            }
            let wrong_slot = false
            if ((slot_1_species == 'Reshiram' && this.starter != 'Reshiram' || slot_1_species == 'Zekrom' && this.starter != 'Zekrom')) {
                wrong_slot = true
            }
            if ((state == 'Battle' || state == 'From Battle') && wrong_slot == true && ((this.game.properties.battle.opponent.trainer.value == 'N' && this.game.properties.battle.opponent.id.value == 587) || (this.game.properties.battle.opponent.trainer.value == 'Ghetsis' && this.game.properties.battle.opponent.id.value == 232))) {
                pokemon_data = this.game.properties.battle.player.team[computed_slot]
            }
            if ((state == 'To Battle' || state == 'Overworld') && wrong_slot == true && this.game.properties.overworld.map_index == 278) {
                pokemon_data = this.game.properties.player.team[computed_slot]
            }
            return pokemon_data
        },
        n_battle_data_fix() {
            const state = this.game.properties.meta.state.value
            const slot_1_species = this.game.properties.player.team[0].species.value
            const player_team_count = this.game.properties.player.team_count.value
            const computed_slot = player_team_count - 1
            let pokemon_data = this.game.properties.battle.player.active_pokemon
            switch (state) {
                case 'Battle':
                    pokemon_data = this.game.properties.battle.player.active_pokemon
                    break
                case 'From Battle':
                    pokemon_data = this.game.properties.battle.player.active_pokemon
                    break
                case 'To Battle':
                    pokemon_data = this.game.properties.player.team[0]
                    break
                case 'Overworld':
                    pokemon_data = this.game.properties.player.team[0]
                    break
            }
            let wrong_slot = false
            if ((slot_1_species == 'Reshiram' && this.starter != 'Reshiram' || slot_1_species == 'Zekrom' && this.starter != 'Zekrom')) {
                wrong_slot = true
            }
            if ((state == 'Battle' || state == 'From Battle') 
                && wrong_slot == true 
                && (this.game.properties.battle.opponent.id.value == 587 || this.game.properties.battle.opponent.id.value == 232)) {
                    pokemon_data = this.game.properties.battle.player.pkmn_ram[`pokemon_${computed_slot}_ram`]
            }
            if ((state == 'To Battle' || state == 'Overworld') && wrong_slot == true && this.game.properties.overworld.map_index == 278) {
                pokemon_data = this.game.properties.player.team[computed_slot]
            }
            return pokemon_data
        },
        n_battle_data_pp_fix() {
            const state = this.game.properties.meta.state.value
            const slot_1_species = this.game.properties.player.team[0].species.value
            const player_team_count = this.game.properties.player.team_count.value
            const computed_slot = player_team_count - 1
            let pokemon_data = this.game.properties.battle.player.pkmn_ram.pokemon_0_ram
            switch (state) {
                case 'Battle':
                    pokemon_data = this.game.properties.battle.player.pkmn_ram.pokemon_0_ram
                    break
                case 'From Battle':
                    pokemon_data = this.game.properties.battle.player.pkmn_ram.pokemon_0_ram
                    break
                case 'To Battle':
                    pokemon_data = this.game.properties.player.team[0]
                    break
                case 'Overworld':
                    pokemon_data = this.game.properties.player.team[0]
                    break
            }
            let wrong_slot = false
            if ((slot_1_species == 'Reshiram' && this.starter != 'Reshiram' || slot_1_species == 'Zekrom' && this.starter != 'Zekrom')) {
                wrong_slot = true
            }
            if ((state == 'Battle' || state == 'From Battle') && wrong_slot == true && ((this.game.properties.battle.opponent.trainer.value == 'N' && this.game.properties.battle.opponent.id.value == 587) || (this.game.properties.battle.opponent.trainer.value == 'Ghetsis' && this.game.properties.battle.opponent.id.value == 232))) {
                pokemon_data = this.game.properties.battle.player.pkmn_ram[`pokemon_${computed_slot}_ram`]
            }
            if ((state == 'To Battle' || state == 'Overworld') && wrong_slot == true && this.game.properties.overworld.map_index == 278) {
                pokemon_data = this.game.properties.player.team[computed_slot]
            }
            return pokemon_data
        },
        n_battle_data_fix_team() {
            const state = this.game.properties.meta.state.value
            const slot_1_species = this.game.properties.player.team[0].species.value
            const player_team_count = this.game.properties.player.team_count.value
            const computed_slot = player_team_count - 1
            let pokemon_data = this.game.properties.battle.player.team[0]
            let wrong_slot = false
            if ((slot_1_species == 'Reshiram' && this.starter != 'Reshiram' || slot_1_species == 'Zekrom' && this.starter != 'Zekrom')) {
                wrong_slot = true
            }
            if ((state == 'Battle' || state == 'From Battle') && wrong_slot == true && ((this.game.properties.battle.opponent.trainer.value == 'N' && this.game.properties.battle.opponent.id.value == 587) || (this.game.properties.battle.opponent.trainer.value == 'Ghetsis' && this.game.properties.battle.opponent.id.value == 232))) {
                pokemon_data = this.game.properties.battle.player.team[computed_slot]
            }
            if ((state == 'To Battle' || state == 'Overworld') && wrong_slot == true && this.game.properties.overworld.map_index == 278) {
                pokemon_data = this.game.properties.player.team[computed_slot]
            }
            return pokemon_data
        },
        enemy_graphic() {
            if (this.single_battle == false) {
                return false
            }
            let state = this.game.properties.meta.state.value
            let battle_type = this.game.properties.battle.opponent.trainer.value == '--' ? 'Wild' : 'Trainer'
            if (battle_type == 'Wild') {
                return false
            }

            let trainer = this.game?.properties.battle.opponent.trainer?.value ?? "none"
            let id = this.game?.properties.battle.opponent.id.value
            
            let show = false
            let delay = false
            switch (trainer) {
                // case "School Kid Christine": delay = true; break; // test case
                case "Cress":    delay = true; break;
                case "Chili":    delay = true; break;
                case "Cilan":    delay = true; break;
                case "Lenora":   delay = true; break;
                case "Burgh":    delay = true; break;
                case "Elesa":    delay = true; break;
                case "Clay":     delay = true; break;
                case "Skyla":    delay = true; break;
                case "Cheren":   delay = true; break;
                case "Roxie":    delay = true; break;
                case "Brycen":   delay = true; break;
                case "Drayden":  delay = true; break;
                case "Marlon":   delay = true; break;
                case "Iris":     delay = true; break;
                case "Shauntal": delay = true; break;
                case "Marshall": delay = true; break;
                case "Grimsley": delay = true; break;
                case "Caitlin":  delay = true; break;
                case "Ghetsis":  delay = true; break;
                case "N": {
                    if (id == 587) {
                        delay = true; break;
                    }
                    else {
                        break;
                    }
                }
                default: delay = false; break;
            }
            if (this.game.properties.battle.opponent.trainer.value != null) {
                show = true
            }

            // console.log(show, delay, trainer, this.game.properties.battle.opponent.trainer.value, this.game.properties.meta.state.value)
            if (state == `Battle`) {
                return true
            }
            else if (state == `To Battle`) {
                if (this.game.properties.overworld.map_index.value == 317) {
                    return false
                }
                else {
                    return true
                }
            }
            else if (delay == true && state == `From Battle`) {
                return true
            }
            else {
                return false
            }
        },
        second_screen_check() {
            if (this.second_screen_toggle == false) {
                return false
            }
            const state = this.game.properties.meta.state.value
            if ((state == "To Battle" || state == "Battle") && this.game.properties.battle.opponent.team_count.value < 5) {
                sendVirtualKey(0x83)
                return true
            }
            else {
                sendVirtualKey(0x84)
                return false
            }
        },
        hp_tracker_style() {
            const state = this.game.properties.meta.state.value
            const hp = this.game.properties.player.team[0].stats.hp.value
            const hp_max = this.game.properties.player.team[0].stats.hp_max.value
            const hp_percentage = hp / hp_max
            const status_condition = this.game.properties.player.team[0].status_condition.value
            if (state == "Overworld" && hp_percentage != 1) {
                return "--overlay-color: rgb(255, 98, 98);"
            }
            else if (status_condition != null) {
                return "--overlay-color: rgb(98, 192, 255);"
            }
            else {
                return "--overlay-color: #39b54a;"
            }
        },
        compare_splits() {
            debugging_mode = false
            if (debugging_mode == true) { console.log("compare_splits starting...") }
            if (debugging_mode == true) { console.log("...") }
            if (this.collect_split_data == true) {
                if (!this.game_data?.splits) {
                    return []
                }

                const trainersToSkip = (this.selected_game === "Black 2" || this.selected_game === "White 2")
                    ? ["Bianca", "Alder"]
                    : ["Bianca", "Cheren", "Alder"];
                const trioTrainers = ["Chili", "Cilan", "Cress"];
                const final_n_battle_id = 587;

                // First mode: use default order, no CSV needed
                if (this.toggle_compare_splits === 'First') {
                    const result = []
                    const completedTrainers = new Set()
                    let trioHandled = false

                    // Add completed splits first, in the order they were completed
                    for (const cur_split of this.effective_current_splits) {
                        if (!this.game_data.splits.includes(cur_split.trainer)) continue
                        if (trainersToSkip.includes(cur_split.trainer)) continue
                        if (completedTrainers.has(cur_split.trainer)) continue
                        if (cur_split.trainer === "N" && cur_split.id !== final_n_battle_id) continue

                        if (trioTrainers.includes(cur_split.trainer)) {
                            if (trioHandled) continue
                            trioHandled = true
                        }

                        result.push({trainer: cur_split.trainer, imageTrainer: cur_split.trainer, current_time: this.convertSecondsToDuration(this.convertDurationToSeconds(cur_split.time))})
                        completedTrainers.add(cur_split.trainer)
                    }

                    // Add remaining uncompleted splits in default order
                    for (const trainer of this.game_data.splits) {
                        if (trainersToSkip.includes(trainer)) continue
                        if (completedTrainers.has(trainer)) continue

                        if (trioTrainers.includes(trainer)) {
                            if (trioHandled) continue
                            trioHandled = true
                        }

                        result.push({trainer: trainer, imageTrainer: trainer, current_time: "-"})
                    }
                    return result
                }

                // Followup mode: compare against loaded CSV splits
                if (debugging_mode == true) { console.log("collect_split_data == true") }
                const result = []

                let lastPushedTrainer = null; // Keep track of the last pushed trainer
                let trioTrainerProcessed = false; // Track if we've already processed a trio trainer
                if (debugging_mode == true) { console.log("lastPushedTrainer:", lastPushedTrainer) }

                // Build default_splits from the active game's splits order so per-version
                // differences (e.g. White → Iris at gym 8, Black → Drayden) are respected.
                let default_splits = [
                    { trainer: "Trio", id: null, time: "0", previous_time: "0", current_time: "0", difference: "0" },
                    ...this.game_data.splits.map(trainer => ({
                        trainer,
                        id: trainer === "N" ? 587 : null,
                        time: "0", previous_time: "0", current_time: "0", difference: "0",
                    })),
                ]
                let previous_splits_data = this.previous_splits.length == 0 ? default_splits : this.previous_splits
                const isUsingDefaultSplits = this.previous_splits.length == 0
                
                // Check if any trio trainer (Chili/Cilan/Cress) exists in current or previous splits
                // Treat all three as equivalent - they're the same gym leader slot
                const chiliInCurrent = this.effective_current_splits.find(y => y.trainer === "Chili")
                const cilanInCurrent = this.effective_current_splits.find(y => y.trainer === "Cilan")
                const cressInCurrent = this.effective_current_splits.find(y => y.trainer === "Cress")
                const chiliInPrevious = isUsingDefaultSplits ? null : previous_splits_data.find(y => y.trainer === "Chili")
                const cilanInPrevious = isUsingDefaultSplits ? null : previous_splits_data.find(y => y.trainer === "Cilan")
                const cressInPrevious = isUsingDefaultSplits ? null : previous_splits_data.find(y => y.trainer === "Cress")
                
                // Check if ANY trio trainer exists (they're all equivalent)
                const anyTrioInCurrent = chiliInCurrent || cilanInCurrent || cressInCurrent
                const anyTrioInPrevious = chiliInPrevious || cilanInPrevious || cressInPrevious
                
                // Determine which specific trainer (for display purposes)
                let currentTrioTrainer = null
                if (chiliInCurrent) currentTrioTrainer = "Chili"
                else if (cilanInCurrent) currentTrioTrainer = "Cilan"
                else if (cressInCurrent) currentTrioTrainer = "Cress"
                
                let previousTrioTrainer = null
                if (!isUsingDefaultSplits) {
                    if (chiliInPrevious) previousTrioTrainer = "Chili"
                    else if (cilanInPrevious) previousTrioTrainer = "Cilan"
                    else if (cressInPrevious) previousTrioTrainer = "Cress"
                }
                
                for (const x of previous_splits_data) {
                    // Final N battle is ID 587
                    let trainer = x.trainer
                    const final_n_battle_id = 587
                    
                    // Handle "Trio" combined split
                    if (trainer === "Trio") {
                        // Only show "Trio" if no specific trio trainer exists in current or previous splits
                        if (anyTrioInCurrent || anyTrioInPrevious) {
                            continue // Skip "Trio" if we have a specific trainer
                        } else {
                            // Show "Trio" when no specific trainer exists
                            const default_string = "-"
                            const prev = x.time ? this.convertDurationToSeconds(x.time) : 0
                            if (trainer !== lastPushedTrainer && !trainersToSkip.includes(trainer)) {
                                result.push({trainer: trainer, imageTrainer: trainer, previous_time: this.convertSecondsToDuration(prev), current_time: default_string, difference: default_string}) 
                                lastPushedTrainer = trainer;
                            }
                            continue
                        }
                    }
                    
                    // Process all trainers, but only process N if his current split ID is 587
                    if (this.game_data.splits.includes(trainer)) {
                        const default_string = "-"
                        let cur_split = this.effective_current_splits.find(y => y.trainer === trainer)
                        let displayTrainerName = trainer // Default to the trainer name
                        let imageTrainerName = trainer // For image lookup - use base trainer name
                        
                        // Special handling for trio trainers - treat all three as equivalent
                        // When we encounter ANY trio trainer in previous_splits_data, process it as the "first gym" slot
                        if (trainer === "Chili" || trainer === "Cilan" || trainer === "Cress") {
                            // If we've already processed a trio trainer, skip all others
                            if (trioTrainerProcessed) {
                                continue
                            }
                            
                            // Determine what to show and use
                            if (currentTrioTrainer) {
                                // Player has defeated a trio trainer - always show that one
                                cur_split = this.effective_current_splits.find(y => y.trainer === currentTrioTrainer)
                                imageTrainerName = currentTrioTrainer
                                
                                if (previousTrioTrainer && previousTrioTrainer !== currentTrioTrainer) {
                                    // Different trainers: show "Current (Previous)"
                                    displayTrainerName = `${currentTrioTrainer} (${previousTrioTrainer})`
                                    // Use previous trainer's time for comparison (from the split we're currently processing)
                                    // x already contains the previous trainer's data since we're iterating through previous_splits_data
                                } else {
                                    // Same trainer or no previous: show just the name
                                    displayTrainerName = currentTrioTrainer
                                }
                                trioTrainerProcessed = true
                            } else if (previousTrioTrainer) {
                                // No current battle, but split file loaded - show previous trainer
                                // We're processing ANY trio trainer entry from previous_splits_data
                                // Since all three are equivalent, we process whichever one we encounter
                                displayTrainerName = previousTrioTrainer
                                imageTrainerName = previousTrioTrainer
                                // cur_split remains undefined - will show default values
                                trioTrainerProcessed = true
                                // Continue to process this entry below
                            } else {
                                // No current and no previous - should show "Trio" instead
                                continue
                            }
                            
                            // Process this entry (we've set up cur_split, displayTrainerName, etc. above)
                            // Continue to the processing logic below
                        }
                        
                        // Debug logging for N
                        if (trainer === "N") {
                            cur_split = this.effective_current_splits.find(y => y.trainer === trainer && y.id === final_n_battle_id)
                        }

                        // Ensure x.time is valid before converting
                        const prev = x.time ? this.convertDurationToSeconds(x.time) : 0
                        
                        // Check if this is a trio trainer
                        const isTrioTrainer = trainer === "Chili" || trainer === "Cilan" || trainer === "Cress"
                        
                        if (cur_split == undefined) { 
                            // For trio trainers, use a consistent identifier for lastPushedTrainer
                            const trainerKey = isTrioTrainer ? "Trio" : trainer
                            if (trainerKey !== lastPushedTrainer && !trainersToSkip.includes(trainer)) {
                                result.push({trainer: displayTrainerName, imageTrainer: imageTrainerName, previous_time: this.convertSecondsToDuration(prev), current_time: default_string, difference: default_string}) 
                                lastPushedTrainer = trainerKey; // Update the last pushed trainer
                            }
                            continue
                        }
                        
                        // For N, only process if current split ID is 587, otherwise show default values
                        if (trainer === "N" && cur_split.id !== final_n_battle_id) {
                            if (trainer !== lastPushedTrainer && !trainersToSkip.includes(trainer)) {
                                result.push({trainer: displayTrainerName, imageTrainer: imageTrainerName, previous_time: this.convertSecondsToDuration(prev), current_time: default_string, difference: default_string}) 
                                lastPushedTrainer = trainer;
                            }
                            continue
                        }
                        // Ensure cur_split.time is valid before converting
                        if (!cur_split.time || typeof cur_split.time !== 'string') {
                            if (trainer !== lastPushedTrainer && !trainersToSkip.includes(trainer)) {
                                result.push({trainer: displayTrainerName, imageTrainer: imageTrainerName, previous_time: this.convertSecondsToDuration(prev), current_time: default_string, difference: default_string}) 
                                lastPushedTrainer = trainer;
                            }
                            continue
                        }
                        
                        const cur = this.convertDurationToSeconds(cur_split.time)
                        const diff = cur - prev;
                        const diff_abs = Math.abs(diff);
                        const diff_sign = Math.sign(diff);
                        const diff_m = Math.floor(diff_abs / 60);
                        const diff_s = diff_abs % 60;
                        var diff_str = `${diff_sign === -1 ? "-" : "+"}${diff_m}:${diff_s.toString().padStart(2, "0")}`;
                        if (diff_str == "+0:00") { diff_str = "0:00" }
                        
                        // For trio trainers, check if we've already processed one (to avoid duplicates)
                        const isTrioTrainerCheck = trainer === "Chili" || trainer === "Cilan" || trainer === "Cress"
                        const trainerKey = isTrioTrainerCheck ? "Trio" : trainer
                        const shouldPush = (trainerKey !== lastPushedTrainer && !trainersToSkip.includes(trainer)) || (trainer === "N" && cur_split.id === final_n_battle_id)
                        
                        // For trio trainers: only push if this is the one we determined should be shown
                        // (trioTrainerProcessed is set to true when we determine which trio trainer to show)
                        // For non-trio trainers, always allow pushing
                        let canPushTrio = true
                        if (isTrioTrainerCheck) {
                            // Only push if we've determined this is the trio trainer to show
                            // trioTrainerProcessed will be true if we're processing the correct trio trainer
                            canPushTrio = trioTrainerProcessed
                        }
                        
                        if (shouldPush && canPushTrio) {
                            // Format previous time - if prev is 0 and no split file, show "-"
                            const prevTimeDisplay = (prev === 0 && isUsingDefaultSplits) ? "-" : this.convertSecondsToDuration(prev)
                            result.push({trainer: displayTrainerName, imageTrainer: imageTrainerName, previous_time: prevTimeDisplay, current_time: this.convertSecondsToDuration(cur), difference: diff_str})
                            lastPushedTrainer = trainerKey; // Update the last pushed trainer
                        }
                    }
                }
                return result
            }
        },
        g5PokemonData() {
            const game = this.game.properties.meta.game_name.value
            switch (game) {
                case "Black"   : return this.pokedex_black_white
                case "White"   : return this.pokedex_black_white
                case "Black 2" : return this.pokedex_black2_white2
                case "White 2" : return this.pokedex_black2_white2
                default        : return this.pokedex_black_white
            }
        },
        faults() {
            return this.blackout_counter + this.playerResets
        },
        voltorb_flip() {
            const voltorb_flip_trigger = this.game.properties.screen.voltorb_flip.activate_voltorb_flip.value
            const map = this.game.properties.overworld.map_name.value 
            if (voltorb_flip_trigger == 160 && map == 'Goldenrod City - Map 31') {
                return true
            }
            else {
                return false
            }
        },
        stats_header() {
            const toggle    = true
            const stat_type = this.stats_setting
            const year      = this.ui_stats_styling_modifier
            const state     = this.game.properties.meta.state.value
            const level     = this.game.properties.player.team[0].level.value
            if (level > 100) {
                return 'Base Stats'
            }
            if (stat_type == 'Base Stats Average') {
                return statHeaders.averages
            }
            if (stat_type == 'Base Stats Median') {
                return statHeaders.medians
            }
            // stat_fix_lvl 
            if (year == '2023') {
                if (this.game.properties.flags.got_tm27_return.value == false) {
                    return `IVs`
                }
                switch (state) {
                    case "Base Stats":  return `Base Stats`
                    case "Overworld":   return `Level ${this.game.properties.player.team[0].level.value}`
                    case "To Battle":   return `Level ${this.game.properties.player.team[0].level.value}`
                    case "From Battle": return `Level ${this.stat_fix_lvl}`
                    case "Battle":      return `Level ${this.game.properties.battle.player.active_pokemon.level.value}`
                }
            }
            else {
                if (this.selected_game == 'Platinum' && this.game.properties.flags?.got_tm27_return?.value == false && state == 'Overworld') {
                    return `IVs`
                }
                switch (stat_type) {
                    case "Base Stats":   return `Base Stats`
                    case "IVs":          return statHeaders.individual
                    case "Hidden Power": return `Hidden Power ${this.hpType}`
                    case "EVs":          return statHeaders.effort
                    case "Vitamins":     return `Vitamins`
                    case "Detailed EVs": {
                        let ev_hp  = this.game.properties.player.team[0].evs.hp.value
                        let ev_atk = this.game.properties.player.team[0].evs.attack.value
                        let ev_def = this.game.properties.player.team[0].evs.defense.value
                        let ev_spa = this.game.properties.player.team[0].evs.special_attack.value
                        let ev_spd = this.game.properties.player.team[0].evs.special_defense.value
                        let ev_spe = this.game.properties.player.team[0].evs.speed.value
                        let total = ev_hp + ev_atk + ev_def + ev_spa + ev_spd + ev_spe
                        return `${total}/510 (${this.decimalToPercentage(total/510)}%)`
                    }
                    case "Automatic":    {
                        if (this.not_valid_battle_state && state == "Battle") {
                            return `Base Stats`
                        }
                        switch (state) {
                            case "No Pokemon":  return `Base Stats`
                            case "Overworld":   {
                                if (this.on_starter_spot) {
                                    return `Base Stats`
                                }
                                return `Level ${this.n_battle_data_fix.level.value}`
                            }
                            case "To Battle":   return `Level ${this.n_battle_data_fix.level.value}`
                            case "From Battle": return `Level ${this.stat_fix_lvl}`
                            case "Battle":      return `Level ${this.n_battle_data_fix.level.value}`
                        }
                    }
                    case "Badge Boosts": return `Level ${this.game.properties.player.team[0].level.value}`
                }
            }
        },
        growth_rate() {
            return this.g5PokemonData[this.starter].growth_rate
        },
        gametimeSplit() {
            h = this.game.properties.game_time.hours.value
            m = this.game.properties.game_time.minutes.value
            timecode = h + ":" + m.toString().padStart(2, "0")
            return timecode
        },
        game_data() {
            try {
                if (!this.game?.properties?.meta?.game_name?.value) {
                    return null;
                }
                
                const game = this.game.properties.meta.game_name.value;
                
                if (!this.game_variables || !this.game_variables[game]) {
                    return null;
                }
                
                return this.game_variables[game];
            } catch (error) {
                return null;
            }
        },
        /** The enemy team panel (core/overlay/EnemyTeamPanel.ts), worked out once per change in enemyPanel.ts. */
        enemy_team_view() {
            return enemyTeamView(this)
        },
        enemy_team_layout() {
            return enemyTeamLayout
        },
        /** The trainer preview (decision 14): the picker's options, the picked trainer and its panel (enemyPanel.ts). */
        trainer_options() {
            return trainerPickerOptions(this)
        },
        filtered_trainer_list() {
            return searchTrainers(this.trainer_options, this.search_trainers)
        },
        trainer_preview() {
            return previewTrainer(this)
        },
        trainer_preview_view() {
            const trainer = this.trainer_preview
            return trainer ? trainerPreviewView(this, trainer) : null
        },
        // "Show Wild Battles" (decision 30): the wild Pokémon in the enemy panel, or null (enemyPanel.ts wildPreview).
        wild_pokemon_view() {
            const wild = this.show_wild_battles == true ? wildPreview(this) : null
            return wild ? trainerPreviewView(this, wild) : null
        },
        enemy_mon_static() {
            // const opponent_id = this.game.properties.battle.opponent?.id?.value
            // const object      = this.selected_game == 'Platinum' ? this.platinum_trainers[opponent_id].party : 
            //     this.selected_game == 'HeartGold and SoulSilver' ? this.trainers_hgss[opponent_id].party :
            //     this.trainers_dp[opponent_id].party
            // return object
            return this.game.properties.battle.opponent.team
        },
        enemy_2_mon_static() {
            const opponent_id = this.game.properties.battle.opponent_2.id.value
            const object      = this.platinum_trainers[opponent_id].party
            return object
        },
        heldItem() {
            const state = this.game.properties.meta.state.value
            if (state == 'From Battle') {
                return this.held_item_fix
            }
            var pokemon_data = this.n_battle_data_fix_friendship

            // Berry Fix
            if (state == 'Battle') {
                return this.game.properties.battle.player.active_pokemon.held_item.value
            }
            return pokemon_data.held_item.value
        },
        single_battle() {
            // Double battles and multi-battles
            if (!this.game || !this.game.properties || !this.game.properties.battle || 
                !this.game.properties.battle.other || !this.game.properties.battle.opponent) {
                return false
            }
            let battle_header = this.game.properties.battle.other.battle_header.value
            if (battle_header == 0) { 
                return false 
            }
            let trainer_id = this.game.properties.battle.opponent.id.value
            switch (trainer_id) {
                case 62 : return false
                case 63 : return false
                case 401: return false
                case 402: return false
            }
            // let battle_end = this.game.properties.battle.other.battle_end.value
            // if (battle_end == 15) { 
            //     return false 
            // }
            // Rotation battles
            let trainer_name = this.game.properties.battle.opponent.trainer.value
            switch (trainer_name) {
                case '--'     : return false
                case 'Charles': return false
                case 'Elm'    : return false
                case 'Eileen' : return false
                case 'Lou'    : return false
                case 'Johnny' : return false
                case 'Kiyo'   : return false
                case 'Glinda' : return false
            }
            return true
        },
        battlePokemonCrop() {
            let totalPokemon = 0
            const heights = {
                1: "233px",
                2: "399px",
                3: "566px",
                4: "733px",
                5: "898px",
                6: "1080px"
              };
            totalPokemon = this.game.properties.battle.opponent.team_count.value;
            if (totalPokemon == 0) { 
                return false 
            }
            // let game = this.game.properties.meta.game_name.value
            // let opponent_2            = this.game.properties.battle.opponent_2?.trainer.value
            // let opponent_team_count   = this.game.properties.battle.opponent.team_count.value;
            // let opponent_2_team_count = this.game.properties.battle.opponent_2?.team_count.value;
            // if (opponent_2 && game != "HeartGold and SoulSilver") {
            //     totalPokemon = opponent_team_count + opponent_2_team_count
            // }
            return `height: ${heights[totalPokemon]}; filter: saturate(${this.ui_saturation}) drop-shadow(0px 0px 1px #000000)`;
        },
        solo_mon() {
            const state = this.game.properties.meta.state.value
            if (state == `Battle` || state == `From Battle`) {
                return this.game?.properties?.battle?.player?.active_pokemon
            }
            else if (state == `No Pokemon` || this.game?.properties?.player?.team[0]?.species?.value == null || this.game?.properties?.battle?.player?.team_count?.value == 0) {
                var data = this.g5PokemonData[this.starter]
                return {
                    species: { value: this.starter },
                    status_condition: { value: null },
                    ...data
                }
            }
            else {
                return this.game?.properties?.player?.team[0]
            }
        },
        solo_mon_exp() {
            if (this.game.properties.meta.state.value == `Battle`) {
                return this.game?.properties?.battle?.player?.active_pokemon
            }
            else if (this.game.properties.meta.state.value == `No Pokemon` || this.game?.properties?.player?.team[0]?.species?.value == null || this.game?.properties?.battle?.player?.team_count?.value == 0) {
                // var data = this.g5PokemonData[this.starter]
                // return {
                //     species: { value: data["name"] },
                //     ...data
                // }
                return this.g5PokemonData[this.starter]
            }
            else {
                return this.game?.properties?.player?.team[0]
            }
        },
        moveRouting() {
            const gamestate    = this.game.properties.meta.state.value
            const team_pid     = this.game?.properties.battle.player.active_pokemon.internals.personality_value.value
            const battle_pid   = this.game?.properties.player.team[0].internals.personality_value.value
            const battle_moves = this.game.properties.battle.player.active_pokemon.moves
            const team_moves   = this.game.properties.player.team[0].moves
            if (gamestate == `Overworld` && team_pid != battle_pid) {
                return team_moves
            }
            if (gamestate == `Battle`) {
                return battle_moves
            }
            if (gamestate == `From Battle`) {
                return team_moves
            }
            if (gamestate == `No Pokemon`) {
                return team_moves
            }
        },
        enemyTrainer() {
            return this.remakeTrainers[this.game.properties.battle.trainer.id.value]
        },
        battEn() {
            return this.game?.properties?.battle?.opponent?.active_pokemon
        },
        s1dynamic() {
            if (this.game.properties.meta.state.value == `Battle`) {
                return this.game?.properties?.battle?.player?.active_pokemon
            }
            else {
                return this.game?.properties?.player?.team[0]
            }
        },
        typeHeaderColor() {
            return
            // if (this.game.properties.meta.state.value == `Battle`) { return this.game.properties.battle.yourPokemon.type2.value }
            // if (this.game.properties.meta.state.value == `Overworld`) { return this.g5PokemonData[this.game.properties.player.team[0].species.value].type_2 }
            // if (this.game.properties.meta.state.value == `No Pokemon`) { return this.g5PokemonData[this.starter].type_2}
            // else { return }
            // else { return this.g5PokemonData[this.starter].type_2}
        },
        //BATTLE FADE
        battle_fade() {
            if (
            (this.batt.trainer.class.value == "WILL" ||
            // this.batt.trainer.class.value == "CLAIR" ||
            this.batt.trainer.class.value == "KOGA" ||
            this.batt.trainer.class.value == "BRUNO" ||
            this.batt.trainer.class.value == "KAREN" ||
            this.batt.trainer.class.value == "CHAMPION") &&
            (this.game.properties.meta.state.value == "To Battle" ||
            this.game.properties.meta.state.value == "Battle" ||
            this.game.properties.meta.state.value == "From Battle")
            ) {
                return true
            }
            else if (
            this.game.properties.meta.state.value == "To Battle" ||
            this.game.properties.meta.state.value == "Battle") {
                return true
            }
            else {
                return false
            }
        },
        // SCREENS
        screen_weather() { // [statusReflect, reflectCount, statusLightScreen, LightScreenCount, weather, weatherCount, showPopUp]
            var fieldArray = [null, null, null, null, null, null, false]
            if (this.batt.field.weather.value != null) {
                fieldArray[4] = this.batt.field.weather.value
                fieldArray[5] = this.batt.field.weather_count.value
                fieldArray[6] = true
            }
            if (this.batt.field.player.reflect.value == true) {
                fieldArray[2] = "Reflect"
                fieldArray[3] = this.batt.field.player.reflect_count.value
                fieldArray[6] = true
            }
            if (this.batt.field.player.lightscreen.value == true) {
                fieldArray[0] = "Light Screen"
                fieldArray[1] = this.batt.field.player.lightscreen_count.value
                fieldArray[6] = true
            }
            return fieldArray
        },
        //SELECT THE RELEVANT FIELD MOVE
        field_selector() {
            var reflect = [this.batt.field.player?.reflect_count?.value, this.batt.field?.player?.reflect?.value, "Reflect"]
            var lightscreen = [this.batt.field?.player?.lightscreen_count?.value, this.batt.field?.player?.lightscreen?.value, "Light Screen"]
            var safeguard = [this.batt.field?.player?.safeguard_count?.value, this.batt.field?.player?.safeguard?.value, "Safeguard"]
            var weather = [this.batt.field?.weather_count?.value, this.weather_boolean, this.pascalCaseSpace(this.capitalization_format(this.batt.field?.weather?.value?.toLowerCase()))]
            var comparison = [reflect, lightscreen, safeguard, weather]
            var maxArr = [0, false, ""]
            for(var i = 0; i < comparison.length; i++) {
                if ((comparison[i][0])) {
                    if(maxArr[0] < comparison[i][0]) {
                        maxArr = comparison[i];
                    }
                }
            }
            return maxArr
        },
        pkmnGrowthRate() {
            if (this.g5PokemonData[this.starter].growth_rate == `GROWTH_MEDIUM_SLOW`) { return "Medium Slow" }
            if (this.g5PokemonData[this.starter].growth_rate == `GROWTH_MEDIUM_FAST`) { return "Medium Fast" }
            if (this.g5PokemonData[this.starter].growth_rate == `GROWTH_SLOW`) { return "Slow" }
            if (this.g5PokemonData[this.starter].growth_rate == `GROWTH_FAST`) { return "Fast" }
            if (this.g5PokemonData[this.starter].growth_rate == `GROWTH_FLUCTUATING`) { return "Fluctuating" }
            if (this.g5PokemonData[this.starter].growth_rate == `GROWTH_ERRATIC`) { return "Erratic" }
        },
        field_effect_array() {
            var effect_array = [
                ["Reflect", false, 0,],
                ["Light Screen", false, 0,],
                ["Safeguard", false, 0,],
                [this.game.properties.battle.field.weather.value, false, 0,],
            ]
            if (this.game.properties.meta.state.value == `Battle`) {
                effect_array[0][1] = this.batt.field.player.reflect?.value
                effect_array[0][2] = this.batt.field.player.reflect_count?.value
                effect_array[1][1] = this.batt.field.player.lightscreen?.value
                effect_array[1][2] = this.batt.field.player.lightscreen_count?.value
                effect_array[2][1] = this.batt.field.player.safeguard?.value
                effect_array[2][2] = this.batt.field.player.safeguard_count?.value
                effect_array[3][1] = this.batt.field.weather?.value
                effect_array[3][2] = this.batt.field.weather_count?.value
            }
            return effect_array
        },
        starting_type_fix() {
            if (this.g5PokemonData[this.starter]?.type_1?.toLowerCase() != this.g5PokemonData[this.starter]?.type_2?.toLowerCase()) {
                return this.g5PokemonData[this.starter]?.type_1?.toLowerCase()
            }
            else {
                return this.g5PokemonData[this.starter]?.type_2?.toLowerCase()
            }
        },
        dropdownDownMenuKeys() {
            return {
                textures: Object.keys(this.textures)
            }
        },
        currentTexturePath() {
            if (!this.backgroundTexture || !this.textures[this.backgroundTexture]) {
                return this.textures['Bug']?.path || '';
            }
            return this.textures[this.backgroundTexture].path;
        },
        statsDisplaySpecies() {
            // Return the species to display stats for
            // A battle-only form being displayed has its own base stats (Zen Mode, Pirouette)
            if (this.active_battle_form && this.active_battle_form !== this.starter) {
                return this.active_battle_form;
            }
            // If showing evolved base stats (temporary after evolution), use the evolved species
            if (this.show_evolved_base_stats && this.evolved_species_for_stats) {
                return this.evolved_species_for_stats;
            }
            // When evolution is enabled, use the selected evolution family species for base stats
            if (this.evolution && this.selected_evolution_species) {
                return this.selected_evolution_species;
            }
            return this.starter;
        },
        form_base_species() {
            return baseSpeciesOf(this.starter)
        },
        pokemon_form_options() {
            // Only the forms the dex in play knows - Black / White have no fused Kyurem, Therian
            // genies or Resolute Keldeo - so ask the dex rather than hard-coding the game names
            const forms = POKEMON_FORMS[POKEMON_FORM_INFO[this.starter]?.base]
            if (!forms) return []
            return Object.keys(forms)
                .filter(species => this.g5PokemonData?.hasOwnProperty(species))
                .map(species => ({ species, label: POKEMON_FORM_LABELS[species] ?? species }))
        },
        show_pokemon_forms() {
            return this.pokemon_form_options.length > 1
        },
        pokemon_form: {
            // Forms are real pokedex entries, so the dropdown just moves `starter` between them
            // the way gen4 does for Wormadam's cloaks: base stats, movepool and the style storage
            // key all follow the species, and each form styles independently
            get() {
                return this.starter
            },
            set(species) {
                this.starter = species
            }
        },
        pokemon_form_note() {
            // In-game rules that can undo a stamped form, so the user knows what to hold or avoid
            switch (this.starter) {
                case "Giratina (Origin)": return "Hold the Griseous Orb - without it the game reverts Giratina to Altered Forme."
                case "Shaymin (Sky)":     return "Reverts to Land Forme at night or when frozen."
                case "Keldeo (Resolute)": return "Tied to knowing Secret Sword - forgetting it reverts Keldeo to Ordinary Form."
            }
            if (this.form_base_species === "Rotom" && this.starter !== "Rotom") {
                const move = this.g5PokemonData?.[this.starter]?.form_change_learnset?.[0]
                return move ? `${move} is only taught by the in-game form change (Shopping Mall Nine).` : ""
            }
            return ""
        },
        battle_form_options() {
            // The base form plus the battle-only forms the dex in play knows for the solo Pokemon
            const variants = this.battleFormVariants(this.starter)
            if (variants.length === 0) return []
            return [this.starter, ...variants].map(species => ({ species, label: BATTLE_FORM_LABELS[species] ?? species }))
        },
        show_battle_forms() {
            return this.battle_form_options.length > 1
        },
        active_battle_form() {
            // The pokedex entry to display for a species with battle-only forms (Castform's weather
            // forms, Zen Mode Darmanitan, Pirouette Meloetta); null for everything else. In battle
            // the game's own form wins, read through the battler's types, which follow the form and
            // already account for Cloud Nine / Air Lock. Outside battle it's the form picked for
            // styling in the settings panel, which the user sets back to the base form before a run.
            const variants = this.battleFormVariants(this.starter)
            if (variants.length === 0) return null
            const battler = this.batt?.player?.active_pokemon
            if (this.game?.properties?.meta?.state?.value === "Battle" && battler?.species?.value === this.starter) {
                const typing = (type_1, type_2) => !type_2 || type_2 === type_1 || type_2 === "???" ? type_1 : `${type_1}/${type_2}`
                const battler_typing = typing(battler.type_1?.value, battler.type_2?.value)
                return variants.find(form => typing(this.g5PokemonData[form].type_1, this.g5PokemonData[form].type_2) === battler_typing) ?? this.starter
            }
            return variants.includes(this.battle_form) ? this.battle_form : this.starter
        },
        displayedPokemonSpecies() {
            // Return the Pokemon species to display in the art
            // A battle-only form being displayed (weather Castform, Zen Darmanitan, Pirouette Meloetta) wins
            if (this.active_battle_form && this.active_battle_form !== this.starter) {
                return this.active_battle_form;
            }
            // When evolution is enabled, use selected_evolution_species from dropdown
            // Otherwise, use starter
            if (this.evolution && this.selected_evolution_species) {
                return this.selected_evolution_species;
            }
            return this.starter;
        },
    },

    methods: {
        /**
         * The OBS chapter markers hook mapper properties by path at mount time. If the
         * mapper PokeAByte has loaded is missing one of them, that marker silently never
         * fires for the whole session (gen3's check, its 2026-09 working tree). The walk
         * is core's (core/logic/chapterMarkerProperties.ts); the table is the paths this
         * overlay's `mounted` subscribes for its markers.
         */
        checkMapperForChapterMarkerProperties() {
            checkMapperForChapterMarkerProperties(this.game, {
                'flags.new_game':                           'RESET marker',
                'player.name':                              'RESET marker',
                'battle.other.battle':                      'BLACKOUT markers',
                'battle.opponent.trainer':                  'trainer IN / OUT markers',
                'meta.state':                               '"Rare Candy Used" marker',
                'player.team.0.level':                      '"Rare Candy Used" marker',
                'battle.opponent.party_position':           '"Next Pokemon" marker',
                'battle.opponent.active_pokemon.stats.hp':  '"Enemy Fainted" marker',
            });
        },
                /**
         * Send an OBS WebSocket 5 "CreateRecordChapter" request (Add Chapter Marker).
         * Connects to ws://localhost:4455 (or MyStorage.obs_websocket_url), identifies,
         * sends the chapter name, then closes. Fails silently if OBS is not running.
         * Optional: set MyStorage.obs_websocket_password if OBS has authentication enabled.
         * @param {string} chapterName - Name for the chapter marker (e.g. "Overworld", "Battle")
         */
        sendObsChapterMarker(chapterName) {
            // Byte-for-byte the same obs-websocket v5 exchange as gen1's and gen2's; the
            // shared client reads the url/password from the same key names (plan 1.9). The
            // same marker goes to Super Shuckie as a replay bookmark (core/logic/shuckieBookmarks.ts).
            sendChapterMarker(chapterName);
        },
        async update_rom_starter_and_intro_mon() {
            // A form shares its species id with the base Pokemon and the mapper's species glossary
            // only knows base names, so the patch gets the base name - the form travels in the form
            // byte that write_byte_data stamps when the solo Pokemon is handed over.
            const starter = baseSpeciesOf(this.starter)
            // Write the solo Pokemon's species to PokeAByte's mapper (frozen) so the
            // ROM patch forces it as the starter. Guarded in case the mapper isn't ready yet.
            this.game?.properties?.patch?.stpStarterSpecies?.set(starter, true)
            this.unlocked_difficulty_keys();
        },
        async unlocked_difficulty_keys() {
            this.game?.properties?.options?.difficulty_keys?.set('Unlocked', false)
        },
        set_hm_encounters() {
            if (this.selected_game == "Black" || this.selected_game == "White") {
                if (this.encounters_woobat) {
                    this.game.properties.patch.encounter_woobat.set(1, false)
                }
                if (this.encounters_roggenrola) {
                    this.game.properties.patch.encounter_roggenrola.set(1, false)
                }
                if (this.encounters_pidove) {
                    this.game.properties.patch.encounter_pidove.set(1, false)
                }
                if (this.encounters_tympole) {
                    this.game.properties.patch.encounter_tympole.set(1, false)
                }
                if (this.encounters_timburr) {
                    this.game.properties.patch.encounter_timburr.set(1, false)
                }
            }
            if (this.selected_game == "Black 2" || this.selected_game == "White 2") {
                if (this.encounters_psyduck) {
                    this.game.properties.patch.encounter_psyduck.set(1, false)
                }
                if (this.encounters_pidove) {
                    this.game.properties.patch.encounter_pidove.set(1, false)
                }
            }
        },
        // ============ Style Settings Management Methods ============
        /**
         * Export current localStorage settings to the defaults file (dev mode only)
         * This migrates your existing style settings to become the new app defaults
         */
        exportStyleSettingsAsDefaults() {
            return StyleSettingsUtils.exportCurrentAsDefaults();
        },
        
        /**
         * Reset the current Pokemon's style settings to defaults
         */
        resetCurrentPokemonToDefaults() {
            const storageKey = this.getStyleStorageKey();
            StyleSettingsUtils.resetToDefaults(storageKey);
            // Reload the styles
            this.loadDisplayedStyles();
            console.log(`[StyleSettings] Reset "${storageKey}" to defaults and reloaded`);
        },
        
        /**
         * Reset all style settings to defaults (removes all user overrides)
         */
        resetAllStyleSettingsToDefaults() {
            StyleSettingsUtils.resetAllToDefaults();
            // Reload current styles
            this.loadDisplayedStyles();
            console.log('[StyleSettings] All style settings reset to defaults and reloaded');
        },
        
        /**
         * Check if running in development mode
         */
        isDevMode() {
            return StyleSettingsUtils.isDevMode();
        },
        
        /**
         * Check if current Pokemon has user overrides
         */
        currentPokemonHasUserOverrides() {
            const storageKey = this.getStyleStorageKey();
            return StyleSettingsUtils.hasUserOverrides(storageKey);
        },
        // ============ End Style Settings Management Methods ============
        
        // Add this method to your Vue app methods section (around line 4182)
        async fetchEmulatorStats() {
            try {
                const response = await fetch('http://127.0.0.1:30158/stats');
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const text = await response.text();
                // The reactive assignment is skipped when the body is byte-identical to the
                // previous poll: the new object would equal the old in every field, and
                // replacing it re-evaluated every `emulatorStats` binding 100 times a second
                // while the emulator sat idle (docs/performance-followups.md).
                if (text !== this._lastEmulatorStatsText) {
                    this._lastEmulatorStatsText = text;
                    // Store the stats object in Vue data
                    this.emulatorStats = JSON.parse(text);
                }
                const stats = this.emulatorStats;
                
                // Update timer without pausing - sync the timer's startTime to match emulator
                if (stats.time) {
                    // Parse the time string from emulator (format: "hh:mm:ss.ms")
                    const timeRegex = /(\d+):(\d{2}):(\d{2})\.(\d{2})/;
                    const timeArray = stats.time.match(timeRegex)?.slice(1,5).map(x => parseInt(x)) ?? [0,0,0,0];
                    const timeOffsetMs = timeArray[0] * 3600000 + timeArray[1] * 60000 + timeArray[2] * 1000 + timeArray[3] * 10;
                    
                    // Sync timer without pausing - set the startTime so current time matches emulator time
                    const currentPauseState = this.timer.storage.timer_pause;
                    this.timer.storage.timer_startTime = Date.now() - timeOffsetMs;
                    
                    // If timer was paused, also update pause_time
                    if (currentPauseState) {
                        this.timer.storage.timer_pause_time = Date.now();
                    }
                }
                
                return stats;
            } catch (error) {
                console.error('Error fetching emulator stats:', error);
                this.failCounter += 1;
                if (this.failCounter >= 10 ) {
                    window.clearInterval(this.emulatorStatsInterval);
                }
                return null;
            }
        },
        // Add these methods to your Vue app methods section
        async sendEmulatorStart() {
            if (this.timer_startTimeOffset != "00:00:00.00") {
                // convert the timer_startTimeOffset to milliseconds
                const offset = this.timer_startTimeOffset.split(":").map(x => parseInt(x)).reduce((acc, curr) => acc * 60 + curr, 0) * 1000;
                try {
                    const response = await fetch(`http://127.0.0.1:30158/mark-start?offset=${offset}`, {
                        method: 'POST'
                    });
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    console.log('Emulator start command sent successfully');
                    return true;
                } catch (error) {
                    console.error('Error sending start command:', error);
                    return false;
                }
            }
            else {
                try {
                    const response = await fetch('http://127.0.0.1:30158/mark-start', {
                        method: 'POST'
                    });
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    console.log('Emulator start command sent successfully');
                    return true;
                } catch (error) {
                    console.error('Error sending start command:', error);
                    return false;
                }
            }
        },

        async sendEmulatorEnd() {
            try {
                const response = await fetch('http://127.0.0.1:30158/mark-end', {
                    method: 'POST'
                });
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                console.log('Emulator end command sent successfully');
                return true;
            } catch (error) {
                console.error('Error sending end command:', error);
                return false;
            }
        },
        async incrementEmulatorCounter(counter_name) {
            try {
                const response = await fetch(`http://127.0.0.1:30158/increment-counter?name=${counter_name}`, {
                    method: 'POST'
                });
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                console.log('Emulator start command sent successfully');
                return true;
            } catch (error) {
                console.error('Error sending start command:', error);
                return false;
            }
        },
        async incrementEmulatorCounterByAmount(counter_name, amount) {
            try {
                const response = await fetch(`http://127.0.0.1:30158/increment-counter?name=${counter_name}&by=${amount}`, {
                    method: 'POST'
                });
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                console.log('Emulator start command sent successfully');
                return true;
            } catch (error) {
                console.error('Error sending start command:', error);
                return false;
            }
        },
        // Evolution family helper functions
        getFullyEvolvedSpecies(species) {
            // Get the fully evolved species from the evolution family.
            // Families are ordered base -> final and "method": null marks the BASE form
            // (how that member is obtained), so the fully evolved species is the last member.
            const evolution_family = this.g5PokemonData[species]?.evolution_family;
            if (!evolution_family || evolution_family.length === 0) {
                return species; // If no evolution family, return the species itself
            }
            for (let i = evolution_family.length - 1; i >= 0; i--) {
                if (evolution_family[i].species != null) {
                    return evolution_family[i].species;
                }
            }
            return species;
        },
        getEvolutionFamily(species) {
            // Get the list of species in the evolution family
            const evolution_family = this.g5PokemonData[species]?.evolution_family;
            if (!evolution_family || evolution_family.length === 0) {
                return [species]; // If no evolution family, return just the species
            }
            // A form's entry lists its family under base names ("Wormadam (Sandy)" lists "Wormadam"),
            // so put the selected form in its base's slot: the list then contains the starter itself
            // and the evolution dropdown, style keys and art warming follow the form
            const form_base = POKEMON_FORM_INFO[species]?.base;
            return evolution_family.map(member => member.species).filter(s => s != null).map(s => s === form_base ? species : s);
        },
        getStorageKey(species, useEvolutionLine = false) {
            // Get the storage key for a species
            // If useEvolutionLine is true, use "FullyEvolved-line-Species" format
            // Otherwise, use just the species name
            if (!useEvolutionLine) {
                return `${this.game?.properties?.meta?.game_name?.value || this.selected_game}_${species}`;
            }
            
            const fullyEvolved = this.getFullyEvolvedSpecies(species);
            return `${this.game?.properties?.meta?.game_name?.value || this.selected_game}_${fullyEvolved}-line-${species}`;
        },
        getEvolutionFamilyStorageKey(species) {
            // Get the storage key for the entire evolution family (shared settings like ability, nature, gender)
            // Format: "Game_FullyEvolved-line" (e.g., "Black_Unfezant-line")
            const fullyEvolved = this.getFullyEvolvedSpecies(species);
            return `${this.game?.properties?.meta?.game_name?.value || this.selected_game}_${fullyEvolved}-line`;
        },
        getSplitFileName() {
            // Get the filename for split files
            // If evolution is enabled, use "FullyEvolved-line" format
            // Otherwise, use the species name
            if (!this.evolution) {
                return this.starter;
            }
            const fullyEvolved = this.getFullyEvolvedSpecies(this.starter);
            return `${fullyEvolved}-line`;
        },
        getStyleStorageKey() {
            // Where the visual style properties live: a battle-only form being displayed keeps its
            // own key (the same key Style Mode uses for that pokedex entry); everything else follows
            // getCurrentStorageKey
            if (this.active_battle_form && this.active_battle_form !== this.starter) {
                return this.getStorageKey(this.active_battle_form, false);
            }
            return this.getCurrentStorageKey();
        },
        loadDisplayedStyles() {
            // Reload the visual styles for whatever is on screen: a battle-only form being
            // displayed, otherwise the evolution-line or individual species entry
            if (this.active_battle_form && this.active_battle_form !== this.starter) {
                this.loadEvolutionStyle(this.active_battle_form, false);
            } else if (this.evolution && this.selected_evolution_species) {
                this.loadEvolutionStyle(this.selected_evolution_species, true);
            } else {
                this.loadEvolutionStyle(this.starter, false);
            }
        },
        battleFormVariants(species) {
            // The battle-only forms of `species` that exist in the dex in play (empty for most species)
            return (BATTLE_FORM_VARIANTS[species] ?? []).filter(form => this.g5PokemonData?.[form]);
        },
        getCurrentStorageKey() {
            // Get the current storage key based on whether evolution is enabled and which species is selected
            if (this.evolution && this.selected_evolution_species) {
                return this.getStorageKey(this.selected_evolution_species, true);
            }
            return this.getStorageKey(this.starter, false);
        },
        calculate_zoroark(pokemon_ram_data) {
            const starting_enemy_ram_address = 0x226A220 + (0x560 * 2)
            const illusion_indirect_enemy_mon_address_start = pokemon_ram_data.illusion_pointer.value
            if (illusion_indirect_enemy_mon_address_start == 0) {
                return null
            }
            const slot_number = Math.floor((illusion_indirect_enemy_mon_address_start - starting_enemy_ram_address) / 220)
            const illusion_data = this.game.properties.battle.opponent.pkmn_ram[`pokemon_${slot_number}_ram`]
            const type_1 = illusion_data.type_1.value
            const type_2 = illusion_data.type_2.value
            return {
                "type_1": type_1,
                "type_2": type_2,
            }
        },
        toggle_encounters() {
            this.encounters_route_1 = !this.encounters_route_1
            this.encounters_route_2 = !this.encounters_route_2
            this.encounters_route_19 = !this.encounters_route_19
            this.encounters_route_20 = !this.encounters_route_20
            this.encounters_flocessy_ranch = !this.encounters_flocessy_ranch
            if (this.game.properties.overworld.map_index.value == 317) {
                this.game.properties.overworld.encounters_enabled.set(this.encounters_route_1, false)
            }
            if (this.game.properties.overworld.map_index.value == 319) {
                this.game.properties.overworld.encounters_enabled.set(this.encounters_route_2, false)
            }
            if (this.game.properties.overworld.map_index.value == 124) {
                this.game.properties.overworld.encounters_enabled.set(this.encounters_route_19, false)
            }
            if (this.game.properties.overworld.map_index.value == 125) {
                this.game.properties.overworld.encounters_enabled.set(this.encounters_route_20, false)
            }
            if (this.game.properties.overworld.map_index.value == 130) {
                this.game.properties.overworld.encounters_enabled.set(this.encounters_flocessy_ranch, false)
            }
        },
        calculate_ev_benefit(stat_name) {
            const state = this.game.properties.meta.state.value
            if (state == 'No Pokemon') {
                return
            }

            let level = this.game.properties.player.team[0].level.value
            let species = this.starter
            let nature = this.game.properties.player.team[0].nature.value
            let nature_modifiers = this.natures[nature]

            let iv_hp = this.game.properties.player.team[0].ivs.hp.value
            let iv_atk = this.game.properties.player.team[0].ivs.attack.value
            let iv_def = this.game.properties.player.team[0].ivs.defense.value
            let iv_spa = this.game.properties.player.team[0].ivs.special_attack.value
            let iv_spd = this.game.properties.player.team[0].ivs.special_defense.value
            let iv_spe = this.game.properties.player.team[0].ivs.speed.value
            
            function calculate_hp(iv, effort_value, level, base_stat) {
                return Math.floor((2 * base_stat + iv + Math.floor(effort_value / 4)) * level / 100) + level + 10
            }
            function calculate_other_stat(iv, effort_value, level, base_stat, nature_modifier) {
                return Math.floor((Math.floor((2 * base_stat + iv + Math.floor(effort_value / 4)) * level / 100) + 5) * nature_modifier)
            }

            switch (stat_name) {
                case 'hp': {
                    let current_stat = this.get_stat().Hp
                    let no_ev_stat   = calculate_hp(iv_hp, 0, level, this.g5PokemonData[species].base_stats?.hp ?? 1)
                    let difference   = current_stat - no_ev_stat
                    return difference
                }
                case 'attack': {
                    let current_stat = this.get_stat().Atk
                    let no_ev_stat   = calculate_other_stat(iv_atk, 0, level, this.g5PokemonData[species].base_stats.attack, nature_modifiers?.nature_attack ?? 1)
                    let difference   = current_stat - no_ev_stat
                    return difference
                }
                case 'defense': {
                    let current_stat = this.get_stat().Def
                    let no_ev_stat   = calculate_other_stat(iv_def, 0, level, this.g5PokemonData[species].base_stats.defense, nature_modifiers?.nature_defense ?? 1)
                    let difference   = current_stat - no_ev_stat
                    return difference
                }
                case 'special_attack': {
                    let current_stat = this.get_stat().SpA
                    let no_ev_stat   = calculate_other_stat(iv_spa, 0, level, this.g5PokemonData[species].base_stats.special_attack, nature_modifiers?.nature_specialAttack ?? 1)
                    let difference   = current_stat - no_ev_stat
                    return difference
                }
                case 'special_defense': {
                    let current_stat = this.get_stat().SpD
                    let no_ev_stat   = calculate_other_stat(iv_spd, 0, level, this.g5PokemonData[species].base_stats.special_defense, nature_modifiers?.nature_specialDefense ?? 1)
                    let difference   = current_stat - no_ev_stat
                    return difference
                }
                case 'speed': {
                    let current_stat = this.get_stat().Spe
                    let no_ev_stat   = calculate_other_stat(iv_spe, 0, level, this.g5PokemonData[species].base_stats.speed, nature_modifiers?.nature_speed ?? 1)
                    let difference   = current_stat - no_ev_stat
                    return difference
                }
                default: {
                    return
                }
            }
        },
        print_texture_settings() {
            const string = `
                'backgroundBlur'       : ${this.backgroundBlur},
                'backgroundHue'        : ${this.backgroundHue},
                'backgroundScale'      : ${this.backgroundScale},
                'backgroundUrl'        : "${this.backgroundUrl}",
                'backgroundFlip'       : ${this.backgroundFlip},
                'use_custom_background': ${this.use_custom_background},
                'backgroundXOffset'    : ${this.backgroundXOffset},
                'backgroundYOffset'    : ${this.backgroundYOffset},
                'backgroundBrightness' : ${this.backgroundBrightness},
                'backgroundContrast'   : ${this.backgroundContrast},
                'backgroundSaturation' : ${this.backgroundSaturation},
            `
            console.log(string)
        },
        default_texture_settings(setting_name_string, fallback_value) {
            const texture = this.backgroundTexture
            const data = this.textures[texture]
            const return_value = data[setting_name_string] ?? fallback_value
            
            // Try to convert to number if it's a numeric string
            if (!isNaN(return_value) && !isNaN(parseFloat(return_value))) {
                return parseFloat(return_value)
            }
            
            return return_value
        },
        convertDurationToSeconds(duration) {
            // Handle null, undefined, or non-string values
            if (!duration || typeof duration !== 'string') {
                return 0;
            }
            const parts = duration.split(':').map(part => parseInt(part, 10));
            if (parts.length === 1) {
                return parts[0];
            } else if (parts.length === 2) {
                return parts[0] * 60 + parts[1];
            } else if (parts.length === 3) {
                return parts[0] * 3600 + parts[1] * 60 + parts[2];
            }
            return 0;
        },
        async load_splits() {
            // A replay's SPLIT bookmarks or a split CSV, picked and parsed in main (2026-09-23).
            const comparison = await pickSplitComparison();
            if (!comparison) return;
            this.previous_splits_source = comparison.name;
            const parsedRows = comparison.rows;

            // For N, only keep the final battle row (last N occurrence in the CSV).
            // Position is anchored at that row so N lands in its natural place (e.g. before Ghetsis in B/W).
            let lastNIndex = -1;
            for (let i = parsedRows.length - 1; i >= 0; i--) {
                if (parsedRows[i].trainer === "N") { lastNIndex = i; break; }
            }

            // Preserve CSV order: first occurrence sets position, last occurrence wins on time.
            const results = [];
            const indexByTrainer = new Map();
            for (let i = 0; i < parsedRows.length; i++) {
                const {trainer, time} = parsedRows[i];
                if (trainer === "N" && i !== lastNIndex) continue;

                if (indexByTrainer.has(trainer)) {
                    results[indexByTrainer.get(trainer)].time = time;
                } else {
                    indexByTrainer.set(trainer, results.length);
                    results.push({trainer: trainer, time: time});
                }
            }

            this.previous_splits = results;
        },
        clear_splits() {
            this.previous_splits = [];
            this.previous_splits_source = null;
        },
        // The battle data of the enemy that is out. battle.opponent.active_pokemon is pinned to the first
        // party slot in the gen5 mapper; the mapper script sets party_position from the active pointer.
        activeOpponent() {
            const opponent = this.game.properties.battle.opponent
            return opponent.pkmn_ram?.[`pokemon_${opponent.party_position?.value ?? 0}_ram`] ?? opponent.active_pokemon
        },
        // The active enemy's status. The battle structure's status is not mapped (pokemon_black.xml
        // battle_structure, commented out), so this is the party copy of the active slot.
        activeOpponentStatus() {
            const opponent = this.game.properties.battle.opponent
            return opponent.team?.[opponent.party_position?.value ?? 0]?.status_condition?.value ?? null
        },
        // The two turn-order Speeds, the same values the Outspeeds/Underspeeds label compares
        // (core/logic/battleSpeed.ts), for Gyro Ball, Electro Ball and Payback.
        activeTurnOrderSpeeds() {
            const enemy_slot = this.game.properties.battle.opponent.party_position?.value
            return {
                player: this.get_stat().Spe,
                enemy: this.getEnemyStat('speed', this.activeOpponent()?.stats?.speed?.value, enemy_slot),
            }
        },
        // -1 when the active enemy moves before the player, 0 on a speed tie, 1 when the player moves first.
        activeTurnOrder() {
            const enemy_slot = this.game.properties.battle.opponent.party_position?.value
            const player = this.game.properties.battle.player.active_pokemon
            const speeds = this.activeTurnOrderSpeeds()
            return gen45TurnOrder(
                { speed: speeds.player, ability: player?.ability_temp?.value, item: player?.held_item?.value },
                { speed: speeds.enemy, ability: this.game.properties.battle.opponent.team?.[enemy_slot]?.ability?.value, item: this.enemy_held_item(enemy_slot) },
                false,
            )
        },
        // Eviolite needs a species that can still evolve (gen5; no decomp; from knowledge). evolution_family
        // is one flat list per family that also holds later-generation evolutions, so "not the last entry"
        // gave Eviolite to branch finals (Vileplume, Slowbro, Gardevoir...) and to Primeape, Persian and others.
        canStillEvolve(species) {
            const BRANCH_FINALS = [
                'Vileplume', 'Poliwrath', 'Slowbro', 'Hitmonlee', 'Hitmonchan', 'Vaporeon', 'Jolteon', 'Flareon',
                'Espeon', 'Umbreon', 'Leafeon', 'Beautifly', 'Gardevoir', 'Ninjask', 'Glalie', 'Huntail', 'Wormadam',
            ]
            if (BRANCH_FINALS.includes(species)) { return false }
            const family = this.g5PokemonData?.[species]?.evolution_family ?? []
            const index = family.findIndex(f => f.species === species)
            return index >= 0 && family.slice(index + 1).some(f => this.g5PokemonData?.[f.species])
        },
        enemy_held_item(x) {
            const team   = this.game?.properties?.battle?.opponent?.team
            const active = this.activeOpponent()
            const activePid = active?.internals?.personality_value?.value
            const party_pos = this.game.properties.battle.opponent.party_position.value
            const slotPid   = team?.[x]?.internals?.personality_value?.value
            const slotSpecies   = team?.[x]?.species?.value
            const activeSpecies = active?.species?.value
            const posMatch = party_pos === x
            const pidMatch     = activePid != null && activePid === slotPid
            const speciesMatch = activeSpecies != null && activeSpecies === slotSpecies
            // if (pidMatch || speciesMatch) {
            //     const tempItem = active?.held_item?.value
            //     if (tempItem != null) { return tempItem }
            // }
            return posMatch ? active.held_item?.value : team?.[x]?.held_item?.value
        },
        held_item_icon(itemName) {
            if (!itemName || itemName === "None") { return null }
            const normalize = (s) => s.toLowerCase().replace(/['']/g, "").replace(/\s+/g, "-")
            const legacyMap = {
                "NeverMeltIce":  "hold-item_never-melt-ice",
                "BlackGlasses":  "hold-item_black-glasses",
                "SilverPowder":  "hold-item_silver-powder",
                "TwistedSpoon":  "hold-item_twisted-spoon",
                "Never-Melt Ice":"hold-item_never-melt-ice",
                "Polkadot Bow":  "hold-item_silk-scarf",
                "Pink Bow":      "hold-item_silk-scarf",
            }
            if (legacyMap[itemName]) {
                return `images/gen5/inventory_sprites/${legacyMap[itemName]}.webp`
            }
            const suffixes = [
                { end: " Berry",   prefix: "berry" },
                { end: " Plate",   prefix: "plate" },
                { end: " Gem",     prefix: "gem" },
                { end: " Mail",    prefix: "mail" },
                { end: " Ball",    prefix: "ball" },
                { end: " Incense", prefix: "incense" },
                { end: " Flute",   prefix: "flute" },
                { end: " Shard",   prefix: "shard" },
                { end: " Fossil",  prefix: "fossil" },
            ]
            for (const { end, prefix } of suffixes) {
                if (itemName.endsWith(end)) {
                    const base = normalize(itemName.slice(0, -end.length))
                    return `images/gen5/inventory_sprites/${prefix}_${base}.webp`
                }
            }
            return `images/gen5/inventory_sprites/hold-item_${normalize(itemName)}.webp`
        },
        enemy_form(x, species) {
            const pokemon_data = this.game.properties.battle.opponent.team[x]
            const form = pokemon_data.flags.alternate_form.value
            const gender = pokemon_data.gender.value
            switch (species) {
                case "Basculin": {
                    // Basculin.webp is the Red-Striped art (form 0), the same file the solo art uses
                    if (form == 0) { return "" }
                    if (form == 1) { return " (Blue Striped)" }
                }
                case "Deerling": {
                    if (form == 0) { return "-spring" }
                    if (form == 1) { return "-summer" }
                    if (form == 2) { return "-autumn" }
                    if (form == 3) { return "-winter" }
                }
                case "Sawsbuck": {
                    if (form == 0) { return "-spring" }
                    if (form == 1) { return "-summer" }
                    if (form == 2) { return "-autumn" }
                    if (form == 3) { return "-winter" }
                }
                case "Burmy": {
                    if (form == 0) { return "-plant" }
                    if (form == 1) { return "-sandy" }
                    if (form == 2) { return "-trash" }
                }
                case "Wormadam": {
                    if (form == 0) { return "-plant" }
                    if (form == 1) { return "-sandy" }
                    if (form == 2) { return "-trash" }
                }
                case "Shellos": {
                    if (form == 0) { return "-west" }
                    if (form == 1) { return "-east" }
                }
                case "Gastrodon": {
                    if (form == 0) { return "-west" }
                    if (form == 1) { return "-east" }
                }
                case "Giratina": {
                    if (form == 0) { return "-altered" }
                    if (form == 1) { return "-origin" }
                }
                case "Unfezant": {
                    if      (gender == false) { return "-male" }
                    else if (gender == true)  { return "-female" }
                    else return ""
                }
                case "Jellicent": {
                    if      (gender == false) { return "-male" }
                    else if (gender == true)  { return "-female" }
                    else return ""
                }
            }
            return ""
        },
        update_buffer_moves() {
            this.held_item_fix = this.game.properties.battle.player.pkmn_ram.pokemon_0_ram.held_item.value
            this.fix_ability = this.game.properties.battle.player.pkmn_ram.pokemon_0_ram.ability.value
            this.move_fix_name_1 = this.game.properties.battle.player.pkmn_ram.pokemon_0_ram.moves[`move1`]?.move.value
            this.move_fix_name_2 = this.game.properties.battle.player.pkmn_ram.pokemon_0_ram.moves[`move2`]?.move.value
            this.move_fix_name_3 = this.game.properties.battle.player.pkmn_ram.pokemon_0_ram.moves[`move3`]?.move.value
            this.move_fix_name_4 = this.game.properties.battle.player.pkmn_ram.pokemon_0_ram.moves[`move4`]?.move.value
            this.move_fix_pp_1 = this.game.properties.battle.player.pkmn_ram.pokemon_0_ram.moves[`move1`]?.pp.value
            this.move_fix_pp_2 = this.game.properties.battle.player.pkmn_ram.pokemon_0_ram.moves[`move2`]?.pp.value
            this.move_fix_pp_3 = this.game.properties.battle.player.pkmn_ram.pokemon_0_ram.moves[`move3`]?.pp.value
            this.move_fix_pp_4 = this.game.properties.battle.player.pkmn_ram.pokemon_0_ram.moves[`move4`]?.pp.value
        },
        async set_options() {
            this.game.properties.options.text_speed.setBytes([0xC2], false)
        },
        update_moveset() {
            const byteArrayDecrypted = this.game.properties.player.team[0].raw.bytes.slice()
            const move_data = this.black_moves
            // Clear bad egg flag
            byteArrayDecrypted[0x04] = 0x00;
            byteArrayDecrypted[0x05] = 0x00;

            function split_to_little_endian_bytes(value) {
                // Ensure the value is a 16-bit integer (0-65535)
                const uint16 = value & 0xFFFF;
                // Extract the low byte (least significant byte)
                const lowByte = uint16 & 0xFF;
                // Extract the high byte (most significant byte)
                const highByte = (uint16 >> 8) & 0xFF;
                // Return in little endian format: [lowByte, highByte]
                return [lowByte, highByte];
            }
            var move1 = this.move_name(this.move1_replacement)
            var move2 = this.move_name(this.move2_replacement)
            var move3 = this.move_name(this.move3_replacement)
            var move4 = this.move_name(this.move4_replacement)
            var pp1   = move_data[this.move_name(move1)]?.pp ?? 0
            var pp2   = move_data[this.move_name(move2)]?.pp ?? 0
            var pp3   = move_data[this.move_name(move3)]?.pp ?? 0
            var pp4   = move_data[this.move_name(move4)]?.pp ?? 0
            var move1_bytes = split_to_little_endian_bytes(move_data[this.move_name(this.move1_replacement)]?.rom_id ?? 0)
            var move2_bytes = split_to_little_endian_bytes(move_data[this.move_name(this.move2_replacement)]?.rom_id ?? 0)
            var move3_bytes = split_to_little_endian_bytes(move_data[this.move_name(this.move3_replacement)]?.rom_id ?? 0)
            var move4_bytes = split_to_little_endian_bytes(move_data[this.move_name(this.move4_replacement)]?.rom_id ?? 0)
            if (move1 != "") {
                byteArrayDecrypted[0x28] = move1_bytes[0];
                byteArrayDecrypted[0x29] = move1_bytes[1];
                byteArrayDecrypted[0x30] = pp1;
                this.move_fix_name_1 = move1
                this.move_fix_pp_1 = pp1
            }
            if (move2 != "") {
                byteArrayDecrypted[0x2A] = move2_bytes[0];
                byteArrayDecrypted[0x2B] = move2_bytes[1];
                byteArrayDecrypted[0x31] = pp2;
                this.move_fix_name_2 = move2
                this.move_fix_pp_2 = pp2
            }
            if (move3 != "") {
                byteArrayDecrypted[0x2C] = move3_bytes[0];
                byteArrayDecrypted[0x2D] = move3_bytes[1];
                byteArrayDecrypted[0x32] = pp3;
                this.move_fix_name_3 = move3
                this.move_fix_pp_3 = pp3
            }
            if (move4 != "") {
                byteArrayDecrypted[0x2E] = move4_bytes[0];
                byteArrayDecrypted[0x2F] = move4_bytes[1];
                byteArrayDecrypted[0x33] = pp4;
                this.move_fix_name_4 = move4
                this.move_fix_pp_4 = pp4
            }

            // Reencrypt the data
            let byteArrayReencrypted = this.encrypt_byte_data(byteArrayDecrypted)

            // Write the reencrypted data to the decrypted_mon_0 property
            this.game.properties.player.decrypted_mon_0.setBytes(byteArrayReencrypted, false)
        },
        update_held_item() {
            this.game.properties.player.team[0].held_item.set(this.held_item_replacement, false)
            this.held_item_fix = this.held_item_replacement
        },
        write_byte_data(data_object) {
            console.log("Writing byte data... for ", this.starter)
            const starter = this.starter
            // A battle-only form is handed over as its base species - the game would revert it anyway
            const pokedex = this.g5PokemonData[BATTLE_ONLY_FORMS[starter] ?? starter]

            const byteArrayDecrypted = this.game.properties.player.team[0].raw.bytes.slice()
            
            // Clear bad egg flag
            byteArrayDecrypted[0x04] = 0x00;
            byteArrayDecrypted[0x05] = 0x00;

            // Gender
            const gender = this.pkmn_gender == 'Male' ? 254 : 1
            // Ability
            const ability_name = this.ability_glossary[data_object.ability]
            const ability_index = pokedex.abilities.indexOf(ability_name)
            byteArrayDecrypted[0x15] = parseInt(data_object.ability) // Set current ability
            // Set PID
            byteArrayDecrypted[0x00] = gender // Gender
            switch (ability_index) {
                case 0: { 
                    byteArrayDecrypted[0x02] = 0x00; // Clear ability slot so that the ability can't change during evolution
                    byteArrayDecrypted[0x42] = 0 // Clear Hidden Ability Flag
                    break; 
                }
                case 1: { 
                    byteArrayDecrypted[0x02] = 0x01; // Set ability slot so that the ability can't change during evolution
                    byteArrayDecrypted[0x42] = 0 // Clear Hidden Ability Flag
                    break; 
                }
                case 2: { 
                    byteArrayDecrypted[0x02] = 0x00; // Documentation says that this is cleared for hidden abilities (unconfirmed)
                    byteArrayDecrypted[0x42] = 1 // Set Hidden Ability Flag
                    break; 
                }
            }

            // IVs
            const iv = data_object.ivs // Grab data from the data_object
            const iv_raw = (iv.hp << 0) | (iv.atk << 5) | (iv.def << 10) | (iv.spe << 15) | (iv.spa << 20) | (iv.spd << 25) | ((byteArrayDecrypted[0x3B] & 0xC0) << 24) // Find the raw value
            byteArrayDecrypted[0x38] = (iv_raw >> 0) & 0xFF; // set byte 1
            byteArrayDecrypted[0x39] = (iv_raw >> 8) & 0xFF; // set byte 2 
            byteArrayDecrypted[0x3A] = (iv_raw >> 16) & 0xFF; // set byte 3
            byteArrayDecrypted[0x3B] = (iv_raw >> 24) & 0xFF; // set byte 4

            // Fateful encounter flag. Shaymin needs it for the Gracidea to work in gen 4 / 5.
            const base_species = baseSpeciesOf(starter)
            if (["Deoxys", "Mew", "Meloetta", "Shaymin"].includes(base_species)) {
                byteArrayDecrypted[0x40] = byteArrayDecrypted[0x40] | 0x01
            }

            // Alternate form (byte 0x40, bits 3-7): a form is a byte on its species, not a species
            // of its own. The stats below are computed from the form's own base stats.
            if (starter in POKEMON_FORM_INFO) {
                byteArrayDecrypted[0x40] = (byteArrayDecrypted[0x40] & 0x07) | (POKEMON_FORM_INFO[starter].form << 3)
            }

            // Nature
            const nature_data = this.natures[data_object.nature]
            const nature_index = nature_data.modulo_value
            byteArrayDecrypted[0x41] = nature_index // Set Nature

            // Stats
            function calculate_hp(iv, ev, level, base_stat) {
                return Math.floor((2 * base_stat + iv + Math.floor(ev / 4)) * level / 100) + level + 10
            }
            function calculate_other_stat(iv, ev, level, base_stat, nature_modifier) {
                return Math.floor((Math.floor((2 * base_stat + iv + Math.floor(ev / 4)) * level / 100) + 5) * nature_modifier)
            }
            
            const base_stats = pokedex.base_stats
            const level  = byteArrayDecrypted[0x8C]
            const ev_hp  = byteArrayDecrypted[0x18]
            const ev_atk = byteArrayDecrypted[0x19]
            const ev_def = byteArrayDecrypted[0x1A]
            const ev_spe = byteArrayDecrypted[0x1B]
            const ev_spa = byteArrayDecrypted[0x1C]
            const ev_spd = byteArrayDecrypted[0x1D]
            let hp  = calculate_hp(iv.hp, ev_hp, level, base_stats.hp)
            let atk = calculate_other_stat(iv.atk, ev_atk, level, base_stats.attack,          nature_data.nature_attack)
            let def = calculate_other_stat(iv.def, ev_def, level, base_stats.defense,         nature_data.nature_defense)
            let spe = calculate_other_stat(iv.spe, ev_spe, level, base_stats.speed,           nature_data.nature_speed)
            let spa = calculate_other_stat(iv.spa, ev_spa, level, base_stats.special_attack,  nature_data.nature_specialAttack)
            let spd = calculate_other_stat(iv.spd, ev_spd, level, base_stats.special_defense, nature_data.nature_specialDefense)

            byteArrayDecrypted[0x8E] = hp  // set current hp
            byteArrayDecrypted[0x90] = hp  // set max hp
            byteArrayDecrypted[0x92] = atk // set attack
            byteArrayDecrypted[0x94] = def // set defense
            byteArrayDecrypted[0x96] = spe // set speed
            byteArrayDecrypted[0x98] = spa // set special_attack
            byteArrayDecrypted[0x9A] = spd // set special_defense

            // Reencrypt the data
            let byteArrayReencrypted = this.encrypt_byte_data(byteArrayDecrypted)

            // Write the reencrypted data to the decrypted_mon_0 property
            this.game.properties.player.decrypted_mon_0.setBytes(byteArrayReencrypted, false)
            console.log("Finished writing byte data... for ", this.starter)
        },
        encrypt_byte_data(array) {
            const decryptedData = new Uint8Array(array);

            function prngNext(prngSeed) {
                const newSeed = (0x41C64E6D * prngSeed + 0x6073) >>> 0;
                const value = (newSeed >>> 16) & 0xFFFF;
                return { newSeed, value };
            }

            const shuffleOrders = {
                0:  [0, 1, 2, 3],
                1:  [0, 1, 3, 2],
                2:  [0, 2, 1, 3],
                3:  [0, 3, 1, 2],
                4:  [0, 2, 3, 1],
                5:  [0, 3, 2, 1],
                6:  [1, 0, 2, 3],
                7:  [1, 0, 3, 2],
                8:  [2, 0, 1, 3],
                9:  [3, 0, 1, 2],
                10: [2, 0, 3, 1],
                11: [3, 0, 2, 1],
                12: [1, 2, 0, 3],
                13: [1, 3, 0, 2],
                14: [2, 1, 0, 3],
                15: [3, 1, 0, 2],
                16: [2, 3, 0, 1],
                17: [3, 2, 0, 1],
                18: [1, 2, 3, 0],
                19: [1, 3, 2, 0],
                20: [2, 1, 3, 0],
                21: [3, 1, 2, 0],
                22: [2, 3, 1, 0],
                23: [3, 2, 1, 0]
            };

            let encryptedData = new Uint8Array(220);
            let dataView = new DataView(encryptedData.buffer);

            let pid = (decryptedData[0] |
                    (decryptedData[1] << 8) |
                    (decryptedData[2] << 16) |
                    (decryptedData[3] << 24)) >>> 0;

            // Copy unencrypted first 8 bytes
            for (let i = 0; i < 8; i++) {
                encryptedData[i] = decryptedData[i];
            }

            // Shuffle the blocks FORWARD
            const shuffleId = ((pid & 0x3E000) >> 0xD) % 24;
            let shuffleOrder = shuffleOrders[shuffleId];
            let dataCopy = decryptedData.slice(0x08, 0x88);
            let checksum = 0
            for (let i = 0x08; i < 0x88; i += 2) {
                checksum += (decryptedData[i] | (decryptedData[i + 1] << 8)) & 0xFFFF
            }
            checksum = checksum & 0xFFFF
            encryptedData[0x06] = checksum & 0xFF
            encryptedData[0x07] = (checksum >> 8) & 0xFF

            for (let i = 0; i < 4; i++) {
                encryptedData.set(
                    dataCopy.slice(i * 0x20, i * 0x20 + 0x20),
                    0x08 + shuffleOrder[i] * 0x20
                );
            }

            // Encrypt block data (XOR with PRNG seeded by checksum)
            let prngSeed = checksum
            for (let i = 0x08; i < 0x88; i += 2) {
                let prngFunction = prngNext(prngSeed);
                let key = prngFunction.value;
                prngSeed = Number((0x41c64e6dn * BigInt(prngSeed) + 0x6073n) & 0xffffffffn);

                let data = (encryptedData[i] | (encryptedData[i + 1] << 8)) ^ key;
                dataView.setUint16(i, data, true);
            }

            // Encrypt battle stats (XOR with PRNG seeded by PID)
            prngSeed = pid;
            for (let i = 0x88; i < 0xDB; i += 2) {
                let prngFunction = prngNext(prngSeed);
                let key = prngFunction.value;
                prngSeed = Number((0x41c64e6dn * BigInt(prngSeed) + 0x6073n) & 0xffffffffn);

                let data = (decryptedData[i] | (decryptedData[i + 1] << 8)) ^ key;
                dataView.setUint16(i, data, true);
            }
            return [...encryptedData];
        },
        openFolder(folderName, game_name, path = "", path2 = "") {
            // Was require("fs") + `start ""` from the renderer; the main process creates
            // the folder under <appRoot>/splits and opens it (plan 1.6/1.7). The only
            // caller passes `splits` as the folder name.
            revealSplitFolder(splitPath(game_name, path, path2));
        },
        openSplitsFolder() {
            // Open the folder the current run's splits are written into: named after the
            // fully evolved line when evolution is enabled (e.g. Gothitelle-line), under
            // refilmed/ when refilming mode is on. Mirrors the paths logData/logCopy use.
            const splitFileName = this.getSplitFileName();
            if (this.refilming_mode == true) {
                this.openFolder('splits', this.current_game_folder, 'refilmed', splitFileName);
            } else {
                this.openFolder('splits', this.current_game_folder, splitFileName);
            }
        },
        closeRNGModal() {
            this.showRNGModal = false;
            MyStorage['rng_config'] = this.rng_config;
        },
        async write_rng_initial_trips() {
            // Reset every NPC's trip index and write trip 1's patch value to PokeAByte.
            // Called when the player receives their starter.
            for (const npc of this.rng_npcs) {
                this.rng_trip_index[npc.key] = 0;
                const value = this.rngPatchValueForTrip(npc.key, 0);
                const prop = this.game?.properties?.patch?.[npc.patchProp];
                console.log(`[RNG] init trip for ${npc.key}: writing ${value} to patch.${npc.patchProp} (prop exists: ${!!prop?.set})`);
                if (prop?.set) {
                    await prop.set(value, false);
                }
            }
        },
        setup_rng_bag_watchers() {
            // Watch bag.items (shards) and bag.berries (berries) for quantity increases.
            // When the total for a category grows while standing on a configured NPC's map,
            // advance that NPC's trip and write the next trip's patch value (or 0 when
            // the configured trip list is exhausted).
            const readBagCategoryTotal = (category) => {
                let total = 0;
                const root = this.game?.properties?.bag?.[category];
                if (root) {
                    for (const k of Object.keys(root)) {
                        total += root[k]?.quantity?.value ?? 0;
                    }
                }
                return total;
            };

            const lastBagTotals = {
                items:   readBagCategoryTotal('items'),
                berries: readBagCategoryTotal('berries'),
            };

            const advanceRNGForCategory = async (category) => {
                const previous = lastBagTotals[category];
                const current = readBagCategoryTotal(category);
                lastBagTotals[category] = current;
                console.log(`[RNG] bag change fired: category=${category} previous=${previous} current=${current}`);
                if (current <= previous) {
                    console.log(`[RNG] no increase, not advancing`);
                    return;
                }
                const currentMap = this.game?.properties?.overworld?.map_index?.value;
                console.log(`[RNG] currentMap=${currentMap}`);
                if (currentMap == null) return;
                for (const npc of this.rng_npcs) {
                    if (npc.bagCategory !== category) continue;
                    if (npc.mapIndex !== currentMap) {
                        console.log(`[RNG] npc ${npc.key} expects mapIndex=${npc.mapIndex}, on ${currentMap} — skip`);
                        continue;
                    }
                    const tripsConfigured = this.rng_config[npc.key]?.length ?? 0;
                    this.rng_trip_index[npc.key] = (this.rng_trip_index[npc.key] ?? 0) + 1;
                    const nextValue = this.rng_trip_index[npc.key] < tripsConfigured
                        ? this.rngPatchValueForTrip(npc.key, this.rng_trip_index[npc.key])
                        : 0;
                    const prop = this.game?.properties?.patch?.[npc.patchProp];
                    console.log(`[RNG] advancing ${npc.key} -> trip ${this.rng_trip_index[npc.key]}/${tripsConfigured}, writing ${nextValue} to patch.${npc.patchProp} (prop exists: ${!!prop?.set})`);
                    if (prop?.set) {
                        await prop.set(nextValue, false);
                    }
                }
            };

            // Debounce so one pickup that touches both item+quantity (or several slots)
            // doesn't advance the trip more than once.
            const rngBagCheckTimers = { items: null, berries: null };
            const scheduleRNGBagCheck = (category) => {
                if (rngBagCheckTimers[category]) clearTimeout(rngBagCheckTimers[category]);
                rngBagCheckTimers[category] = setTimeout(() => {
                    rngBagCheckTimers[category] = null;
                    advanceRNGForCategory(category);
                }, 100);
            };

            let attached = { items: 0, berries: 0 };
            for (const category of ['items', 'berries']) {
                const root = this.game?.properties?.bag?.[category];
                if (!root) {
                    console.warn(`[RNG] mapper.properties.bag.${category} does not exist — no listeners attached for this category`);
                    continue;
                }
                for (const k of Object.keys(root)) {
                    const slot = root[k];
                    if (slot?.quantity?.change) { slot.quantity.change(() => scheduleRNGBagCheck(category)); attached[category]++; }
                    if (slot?.item?.change)     { slot.item.change(() => scheduleRNGBagCheck(category)); attached[category]++; }
                }
            }
            console.log(`[RNG] bag watcher setup complete: listeners attached items=${attached.items}, berries=${attached.berries}; initial totals`, lastBagTotals);
        },
        async add_testing_items() {
            await this.game.properties.bag.money.set(200000, false)

            await this.game.properties.bag.items[0].item.set("Max Repel", false)
            await this.game.properties.bag.items[0].quantity.set(99, false)
            await this.game.properties.bag.items[1].item.set("Charcoal", false)
            await this.game.properties.bag.items[1].quantity.set(1, false)
            await this.game.properties.bag.items[2].item.set("Silk Scarf", false)
            await this.game.properties.bag.items[2].quantity.set(1, false)
            await this.game.properties.bag.items[3].item.set("Mystic Water", false)
            await this.game.properties.bag.items[3].quantity.set(1, false)
            await this.game.properties.bag.items[4].item.set("Miracle Seed", false)
            await this.game.properties.bag.items[4].quantity.set(1, false)
            await this.game.properties.bag.items[5].item.set("Fire Gem", false)
            await this.game.properties.bag.items[5].quantity.set(10, false)
            await this.game.properties.bag.items[6].item.set("Water Gem", false)
            await this.game.properties.bag.items[6].quantity.set(10, false)
            await this.game.properties.bag.items[7].item.set("Electric Gem", false)
            await this.game.properties.bag.items[7].quantity.set(10, false)
            await this.game.properties.bag.items[8].item.set("Grass Gem", false)
            await this.game.properties.bag.items[8].quantity.set(10, false)
            await this.game.properties.bag.items[9].item.set("Ice Gem", false)
            await this.game.properties.bag.items[9].quantity.set(10, false)
            await this.game.properties.bag.items[10].item.set("Fighting Gem", false)
            await this.game.properties.bag.items[10].quantity.set(10, false)
            await this.game.properties.bag.items[11].item.set("Poison Gem", false)
            await this.game.properties.bag.items[11].quantity.set(10, false)
            await this.game.properties.bag.items[12].item.set("Ground Gem", false)
            await this.game.properties.bag.items[12].quantity.set(10, false)
            await this.game.properties.bag.items[13].item.set("Flying Gem", false)
            await this.game.properties.bag.items[13].quantity.set(10, false)
            await this.game.properties.bag.items[14].item.set("Psychic Gem", false)
            await this.game.properties.bag.items[14].quantity.set(10, false)
            await this.game.properties.bag.items[15].item.set("Bug Gem", false)
            await this.game.properties.bag.items[15].quantity.set(10, false)
            await this.game.properties.bag.items[16].item.set("Rock Gem", false)
            await this.game.properties.bag.items[16].quantity.set(10, false)
            await this.game.properties.bag.items[17].item.set("Ghost Gem", false)
            await this.game.properties.bag.items[17].quantity.set(10, false)
            await this.game.properties.bag.items[18].item.set("Dragon Gem", false)
            await this.game.properties.bag.items[18].quantity.set(10, false)
            await this.game.properties.bag.items[19].item.set("Dark Gem", false)
            await this.game.properties.bag.items[19].quantity.set(10, false)
            await this.game.properties.bag.items[20].item.set("Steel Gem", false)
            await this.game.properties.bag.items[20].quantity.set(10, false)
            await this.game.properties.bag.items[21].item.set("Normal Gem", false)
            await this.game.properties.bag.items[21].quantity.set(10, false)

            await this.game.properties.bag.medicine[0].item.set("Rare Candy", false)
            await this.game.properties.bag.medicine[0].quantity.set(99, false)
            await this.game.properties.bag.medicine[1].item.set("Max Elixir", false)
            await this.game.properties.bag.medicine[1].quantity.set(99, false)
            await this.game.properties.bag.medicine[2].item.set("PP Up", false)
            await this.game.properties.bag.medicine[2].quantity.set(99, false)
            await this.game.properties.bag.medicine[3].item.set("Full Restore", false)
            await this.game.properties.bag.medicine[3].quantity.set(99, false)
            await this.game.properties.bag.medicine[4].item.set("Full Heal", false)
            await this.game.properties.bag.medicine[4].quantity.set(99, false)

            for (let i = 1; i < 96; i++) {
                if (i.toString().length == 1) { 
                    i = `0${i}` 
                }
                await this.game.properties.bag.tmhm[i - 1].item.set(`TM${i}`, false)
            }
            for (let i = 1; i < 7; i++) {
                if (i.toString().length == 1) { 
                    i = `0${i}` 
                }
                await this.game.properties.bag.tmhm[95 + (i - 1)].item.set(`HM${i}`, false)
            }
        },
        fade_stats(slot) {
            const enemy_hp = this.game.properties.battle.opponent.pkmn_ram[`pokemon_${slot}_ram`]?.stats?.hp?.value
            if (enemy_hp > 0) {
                return
            }
            else {
                return `opacity: .6;`
            }
        },
        fade_enemy_mon(slot) {
            const state = this.game.properties.meta.state.value
            const enemy_hp = this.game.properties.battle.opponent.pkmn_ram[`pokemon_${slot}_ram`]?.stats?.hp?.value
            if (enemy_hp > 0 || state == "To Battle") {
                return
            }
            else {
                return `filter: grayscale(100%);`
            }
        },
        fade_enemy_mon_text(slot) {
            const state = this.game.properties.meta.state.value
            const enemy_hp = this.game.properties.battle.opponent.pkmn_ram[`pokemon_${slot}_ram`]?.stats?.hp?.value
            if (enemy_hp > 0 || state == "To Battle") {
                return
            }
            else {
                return `opacity: 0.3;`
            }
        },
        fade_enemy_mon_comparison(slot) {
            const state = this.game.properties.meta.state.value
            const enemy_hp = this.game.properties.battle.opponent.pkmn_ram[`pokemon_${slot}_ram`]?.stats?.hp?.value
            if (enemy_hp > 0 || state == "To Battle") {
                return
            }
            else {
                return `opacity: .3; filter: grayscale(100%) drop-shadow(0px 1px 2px #000000);`
            }
        },
        speed_comparison(enemy_slot, enemy_speed_incoming) {
            let object = {
                comparison: "Outspeeds",
                color: "background-color: rgba(255, 63, 63, 0.6)",
            }
            // if (this.game.properties.battle.mode.value == 'Wild') { return object }

            const state          = this.game.properties.meta.state.value
            const trainer        = this.capitalization_format(this.game.properties.battle.opponent.trainer.value)
            const trainer_number = this.game.properties.battle.opponent.trainer.bytes
            let player_speed     = this.get_stat().Spe
            // let enemy_speed      = this.game.properties.battle.opponent.pkmn_ram[`pokemon_${enemy_slot}_ram`].stats.speed.value
            let enemy_speed      = this.getEnemyStat("speed", this.game.properties.battle.opponent.pkmn_ram[`pokemon_${enemy_slot}_ram`].stats.speed.value, enemy_slot)
            let enemy_hp         = 1
            // Who moves first: Lagging Tail and Stall as the game orders them (core/logic/battleSpeed.ts).
            // Trick Room is not in the gen5 mapper.
            const player = state == 'Battle' ? this.game.properties.battle.player.active_pokemon : this.game.properties.player.team[0]
            const order = gen45TurnOrder(
                { speed: player_speed, ability: state == 'Battle' ? player?.ability_temp?.value : player?.ability?.value, item: player?.held_item?.value },
                { speed: enemy_speed, ability: this.game.properties.battle.opponent.team?.[enemy_slot]?.ability?.value, item: this.enemy_held_item(enemy_slot) },
                false,
            )

            object.comparison = speedLabel(order, "enemy")
            if (order > 0) {
                object.color      = "background-color: rgba(28, 255, 58, 0.4)"
            }
            else if (order == 0) {
                object.color      = "background-color: rgba(255, 255, 0, 0.5)"
            }
            if (enemy_hp == 0) {
                object.color      = "background-color: rgba(28, 255, 58, 0.5); opacity: 0.0; filter: grayscale(100%)"
            }
            return object
        },
        // Cloud Nine or Air Lock on the field switches every weather effect off.
        weatherSuppressed() {
            const opponent = this.game.properties.battle.opponent
            const abilities = [this.game.properties.battle.player.active_pokemon?.ability_temp?.value, opponent.team?.[opponent.party_position?.value]?.ability?.value]
            return this.game.properties.meta.state.value == 'Battle' && abilities.some(a => a == 'Cloud Nine' || a == 'Air Lock')
        },
        // Attack-stat abilities (pokeplatinum BattleSystem_CalcMoveDamage): Huge/Pure Power x2, Hustle x1.5, Guts x1.5 with any status.
        attackAbilityModifier(attack, ability, status) {
            let value = attack
            if (ability == 'Huge Power' || ability == 'Pure Power') { value = value * 2 }
            if (ability == 'Hustle') { value = Math.floor(value * 1.5) }
            if (ability == 'Guts' && status) { value = Math.floor(value * 1.5) }
            return value
        },
        // Marvel Scale: Defense x1.5 with any status (pokeplatinum BattleSystem_CalcMoveDamage), before the stage.
        defenseAbilityModifier(defense, ability, status) {
            return ability == 'Marvel Scale' && status ? Math.floor(defense * 1.5) : defense
        },
        // Defeatist (gen5; no decomp; from knowledge): Attack and Sp. Atk halved at or below half HP.
        defeatistActive(ability, hp, hp_max) {
            const cur = Number(hp)
            const max = Number(hp_max)
            return ability == 'Defeatist' && max > 0 && cur <= Math.floor(max / 2)
        },
        svgColorClass(speed_comparison, enemy_data) {
            return speedColorClass(speedLabelOrder(speed_comparison, "enemy") ?? -1, enemy_data?.stats.hp?.value == 0)
        },
        // async update_rom_starter_and_intro_mon() {
        //     let starter = this.starter
        //     let game = this.selected_game
        //     if (game == "Platinum") {
        //         await Promise.all([
        //             this.game.properties.patch.stpStarterSpecies.set(starter, false), 
        //         ])
        //     }
        //     if (game == "HeartGold and SoulSilver") {
        //         //! NOT IMPLEMENTED YET WITHIN THE PATCH
        //     }
        // },
        async update_items() {
            var item1 = this.item1_replacement
            var item2 = this.item2_replacement
            var item3 = this.item3_replacement
            var item4 = this.item4_replacement
            await this.game.properties.bag.medicine[0].item.set(item1, false)
            await this.game.properties.bag.medicine[0].quantity.set(99, false)
            await this.game.properties.bag.medicine[1].item.set(item2, false)
            await this.game.properties.bag.medicine[1].quantity.set(99, false)
            await this.game.properties.bag.medicine[2].item.set(item3, false)
            await this.game.properties.bag.medicine[2].quantity.set(99, false)
            await this.game.properties.bag.medicine[3].item.set(item4, false)
            await this.game.properties.bag.medicine[3].quantity.set(99, false)
        },
        async update_battle_moveset() {
            if (this.game.properties.meta.state.value == "Battle") {
                const move_data = this.cross_generation_moves.g4
                var move1 = this.move_name(this.move1_replacement)
                var move2 = this.move_name(this.move2_replacement)
                var move3 = this.move_name(this.move3_replacement)
                var move4 = this.move_name(this.move4_replacement)
                var pp1   = move_data[this.move_name(move1)]
                var pp2   = move_data[this.move_name(move2)]
                var pp3   = move_data[this.move_name(move3)]
                var pp4   = move_data[this.move_name(move4)]
                if (move1 != "") {
                    await this.game.properties.battle.player.active_pokemon.moves[0].move.set(move1, false)
                    await this.game.properties.battle.player.active_pokemon.moves[0].pp.set(pp1["PP"], false)
                    await this.game.properties.battle.player.team[0].moves[0].move.set(move1, false)
                    await this.game.properties.battle.player.team[0].moves[0].pp.set(pp1["PP"], false)
                }
                if (move2 != "") {
                    await this.game.properties.battle.player.active_pokemon.moves[1].move.set(move2, false)
                    await this.game.properties.battle.player.active_pokemon.moves[1].pp.set(pp2["PP"], false)
                    await this.game.properties.battle.player.team[0].moves[1].move.set(move2, false)
                    await this.game.properties.battle.player.team[0].moves[1].pp.set(pp2["PP"], false)
                }
                if (move3 != "") {
                    await this.game.properties.battle.player.active_pokemon.moves[2].move.set(move3, false)
                    await this.game.properties.battle.player.active_pokemon.moves[2].pp.set(pp3["PP"], false)
                    await this.game.properties.battle.player.team[0].moves[2].move.set(move3, false)
                    await this.game.properties.battle.player.team[0].moves[2].pp.set(pp3["PP"], false)
                }
                if (move4 != "") {
                    await this.game.properties.battle.player.active_pokemon.moves[3].move.set(move4, false)
                    await this.game.properties.battle.player.active_pokemon.moves[3].pp.set(pp4["PP"], false)
                    await this.game.properties.battle.player.team[0].moves[3].move.set(move4, false)
                    await this.game.properties.battle.player.team[0].moves[3].pp.set(pp4["PP"], false)
                }
            }
            else { return }
        },
        hgss_badge_check(x) {
            const badge          = this.game.properties.player.badges[x].value
            const state          = this.game.properties.meta.state.value          
            if (badge == true && state!= `No Pokemon`) {
                return true
            }
            else {
                return false
            }
        },
        // The stats panel's Average and Median modes call this from the template, six times per render;
        // each call walks and sorts the whole dex, so the six answers are a computed (average_median_by_stat).
        average_median_stats(stat_label) {
            return this.average_median_by_stat[stat_label] ?? this.average_median_stats_of(stat_label)
        },
        average_median_stats_of(stat_label) {
            let sum = 0;
            let count = 0;
            let values = [];
            
            // Map the stat_label to the correct base_stats property name
            const statMapping = {
                'hp': 'hp',
                'atk': 'attack',
                'def': 'defense', 
                'spc_atk': 'special_attack',
                'spc_def': 'special_defense',
                'spd': 'speed'
            };
            
            const actualStatName = statMapping[stat_label];
            
            for (let pokemon of Object.values(this.g5PokemonData)) {
                let stat = pokemon.base_stats[actualStatName];
                sum += stat;
                count++;
                values.push(stat);
            }
            
            let average = sum / count;
            
            values.sort((a, b) => a - b);
            let median;
            let midIndex = Math.floor(values.length / 2);
            
            if (values.length % 2 === 0) {
                median = (values[midIndex - 1] + values[midIndex]) / 2;
            } else {
                median = values[midIndex];
            }
            return {
                average: Math.round(average),
                median : Math.round(median),
            };
        },
        get_iv(stat_name) {
            const state = this.game.properties.meta.state.value
            let iv_hp  = this.game.properties.player.team[0].ivs.hp.value
            let iv_atk = this.game.properties.player.team[0].ivs.attack.value
            let iv_def = this.game.properties.player.team[0].ivs.defense.value
            let iv_spa = this.game.properties.player.team[0].ivs.special_attack.value
            let iv_spd = this.game.properties.player.team[0].ivs.special_defense.value
            let iv_spe = this.game.properties.player.team[0].ivs.speed.value
            switch (stat_name) {
                case "Hp":
                    return iv_hp
                case "Attack":
                    return iv_atk
                case "Defense":
                    return iv_def
                case "Special Attack":
                    return iv_spa
                case "Special Defense":
                    return iv_spd
                case "Speed":
                    return iv_spe
            }
        },
        get_stat() {
            const logging      = false
            const state        = this.game.properties.meta.state.value
            const held_item    = state == 'Battle' ? this.game.properties.battle.player.active_pokemon.held_item.value : this.game.properties.player.team[0].held_item.value
            const pokemon_data = this.n_battle_data_fix

            // Use actual current species when available (especially important when evolution is enabled)
            const slot_1_species = this.game.properties.player.team[0].species.value
            let species = (state != 'No Pokemon' && slot_1_species) ? slot_1_species : this.starter
            const not_fully_evolved = this.canStillEvolve(species)
            
            var status_condition = this.game.properties.player.team[0].status_condition.value
            
            function choice_specs(stat) {
                return Math.floor(stat * 1.5)
            }

            let HP  = 0
            let Atk = 0
            let Def = 0
            let SpA = 0
            let SpD = 0
            let SpE = 0
            let final_stat_hp  = 0
            let final_stat_atk = 0
            let final_stat_def = 0
            let final_stat_spa = 0
            let final_stat_spd = 0
            let final_stat_spe = 0

            // Fix for Reshiram or Zekrom being added to the player's team
            const player_team_count = this.game.properties.player.team_count.value
            const computed_slot = player_team_count - 1
            let wrong_slot = false
            let player_ability = state == 'Battle' ? this.game.properties.battle.player.active_pokemon.ability_temp.value : this.game.properties.player.team[0].ability.value

            if ((slot_1_species == 'Reshiram' && this.starter != 'Reshiram' || slot_1_species == 'Zekrom' && this.starter != 'Zekrom')) {
                wrong_slot = true
            }
            if (state == `No Pokemon` && this.evolution) {
                final_stat_hp  = this.g5PokemonData[this.selected_evolution_species].base_stats.hp
                final_stat_atk = this.g5PokemonData[this.selected_evolution_species].base_stats.attack
                final_stat_def = this.g5PokemonData[this.selected_evolution_species].base_stats.defense
                final_stat_spa = this.g5PokemonData[this.selected_evolution_species].base_stats.special_attack
                final_stat_spd = this.g5PokemonData[this.selected_evolution_species].base_stats.special_defense
                final_stat_spe = this.g5PokemonData[this.selected_evolution_species].base_stats.speed
            }
            else if (state == `No Pokemon` && !this.evolution) {
                final_stat_hp  = this.g5PokemonData[this.starter].base_stats.hp
                final_stat_atk = this.g5PokemonData[this.starter].base_stats.attack
                final_stat_def = this.g5PokemonData[this.starter].base_stats.defense
                final_stat_spa = this.g5PokemonData[this.starter].base_stats.special_attack
                final_stat_spd = this.g5PokemonData[this.starter].base_stats.special_defense
                final_stat_spe = this.g5PokemonData[this.starter].base_stats.speed
            }
            else if (this.on_starter_spot) {
                final_stat_hp  = this.g5PokemonData[this.starter].base_stats.hp
                final_stat_atk = this.g5PokemonData[this.starter].base_stats.attack
                final_stat_def = this.g5PokemonData[this.starter].base_stats.defense
                final_stat_spa = this.g5PokemonData[this.starter].base_stats.special_attack
                final_stat_spd = this.g5PokemonData[this.starter].base_stats.special_defense
                final_stat_spe = this.g5PokemonData[this.starter].base_stats.speed
            }
            else if (state == `Overworld` || state == `To Battle`) {
                HP = this.live_hp ? pokemon_data.stats.hp.value : pokemon_data.stats.hp_max.value
                Atk = this.attackAbilityModifier(pokemon_data.stats.attack.value, player_ability, status_condition)
                Def = this.defenseAbilityModifier(pokemon_data.stats.defense.value, player_ability, status_condition)
                SpA = held_item == 'Choice Specs' ? choice_specs(pokemon_data.stats.special_attack.value) : pokemon_data.stats.special_attack.value
                if (this.defeatistActive(player_ability, pokemon_data.stats.hp?.value, pokemon_data.stats.hp_max?.value)) {
                    Atk = Math.floor(Atk / 2)
                    SpA = Math.floor(SpA / 2)
                }
                SpD = pokemon_data.stats.special_defense.value
                // The Speed it will have on entering battle (core/logic/battleSpeed.ts): items, status
                SpE = gen45TurnOrderSpeed(5, {
                    speed: pokemon_data.stats.speed.value,
                    ability: player_ability, item: held_item, species, status: status_condition,
                })

                // if (ability == 'Slow Start' && turn_count < 5) { // We need the turn counter to be mapped for this ability to be implemented
                //     Atk = Math.floor(Atk * 0.5)
                //     SpE = Math.floor(SpE * 0.5)
                // }

                final_stat_hp  = HP
                final_stat_atk = Atk
                final_stat_def = Def
                final_stat_spa = SpA
                final_stat_spd = SpD
                final_stat_spe = SpE
            }
            else if (state == `Battle`) {
                this.stat_fix_toggle = true
                const weather = this.game.properties.battle.field.weather.value
                // const weather_count = this.game.properties.battle.field.weather_count.value
                // Gen5's Simple doubles each stage change as it is applied, so the stored stage already counts it
                // (gen4 doubled the stage when it was used; no decompilation for gen5, from knowledge)
                function simple_stage(modifier) {
                    return Number(modifier) || 0
                }
                const mod_atk = simple_stage(pokemon_data?.modifiers.attack.value)
                const mod_def = simple_stage(pokemon_data?.modifiers.defense.value)
                const mod_spa = simple_stage(pokemon_data?.modifiers.special_attack.value)
                const mod_spd = simple_stage(pokemon_data?.modifiers.special_defense.value)
                const mod_spe = simple_stage(pokemon_data?.modifiers.speed.value)
                HP  = this.live_hp ? pokemon_data.stats.hp.value : pokemon_data.stats.hp_max.value
                Atk = pokemon_data.stats.attack.value
                Def = pokemon_data.stats.defense.value
                SpA = held_item == 'Choice Specs' ? choice_specs(pokemon_data.stats.special_attack.value) : pokemon_data.stats.special_attack.value
                SpD = pokemon_data.stats.special_defense.value
                SpE = pokemon_data.stats.speed.value

                // if (ability == 'Slow Start' && turn_count < 5) { // We need the turn counter to be mapped for this ability to be implemented
                //     Atk = Math.floor(Atk * 0.5)
                //     SpE = Math.floor(SpE * 0.5)
                // }

                // Hustle, Huge Power, Pure Power, Guts -- independent of paralysis; Marvel Scale; Defeatist
                Atk = this.attackAbilityModifier(Atk, player_ability, status_condition)
                Def = this.defenseAbilityModifier(Def, player_ability, status_condition)
                if (this.defeatistActive(player_ability, pokemon_data.stats.hp?.value, pokemon_data.stats.hp_max?.value)) {
                    Atk = Math.floor(Atk / 2)
                    SpA = Math.floor(SpA / 2)
                }
                let battle_hp  = HP
                let battle_atk = Math.floor(Atk * this.stageModifiersData.stats[mod_atk])
                let battle_def = Math.floor(Def * this.stageModifiersData.stats[mod_def])
                let battle_spa = Math.floor(SpA * this.stageModifiersData.stats[mod_spa])
                let battle_spd = Math.floor(SpD * this.stageModifiersData.stats[mod_spd])
                // The Speed the game compares for turn order (core/logic/battleSpeed.ts)
                let battle_spe = gen45TurnOrderSpeed(5, {
                    speed: SpE,
                    stage: pokemon_data?.modifiers.speed.value,
                    ability: player_ability, item: held_item, species, status: status_condition,
                    weather, weatherSuppressed: this.weatherSuppressed(),
                })
                if (weather == "Sandstorm") {
                    const type_1 = this.game.properties.battle.player.active_pokemon.type_1.value
                    const type_2 = this.game.properties.battle.player.active_pokemon.type_2.value
                    if (type_1 == "Rock" || type_2 == "Rock") {
                        battle_spd = Math.floor(battle_spd * 1.5)
                    }
                }
                this.stat_fix_lvl = pokemon_data.level.value
                this.stat_fix_hp  = HP
                this.stat_fix_atk = Atk
                this.stat_fix_def = Def
                this.stat_fix_spa = SpA
                this.stat_fix_spd = SpD
                this.stat_fix_spe = gen45TurnOrderSpeed(5, { speed: SpE, ability: player_ability, item: held_item, species, status: status_condition })

                final_stat_hp  = battle_hp
                final_stat_atk = battle_atk
                final_stat_def = battle_def
                final_stat_spa = battle_spa
                final_stat_spd = battle_spd
                final_stat_spe = battle_spe
            }
            else if (state == `From Battle`) {
                final_stat_hp  = this.stat_fix_hp
                final_stat_atk = this.stat_fix_atk
                final_stat_def = this.stat_fix_def
                final_stat_spa = this.stat_fix_spa
                final_stat_spd = this.stat_fix_spd
                final_stat_spe = this.stat_fix_spe
            }
            else {
                final_stat_hp  = this.g5PokemonData[this.starter].base_stats.hp
                final_stat_atk = this.g5PokemonData[this.starter].base_stats.attack
                final_stat_def = this.g5PokemonData[this.starter].base_stats.defense
                final_stat_spa = this.g5PokemonData[this.starter].base_stats.special_attack
                final_stat_spd = this.g5PokemonData[this.starter].base_stats.special_defense
                final_stat_spe = this.g5PokemonData[this.starter].base_stats.speed
            }

            // Calculate the effect of held items
            // Speed items (Power items, Macho Brace, Iron Ball, Choice Scarf, Quick Powder) are in the
            // Speed above (core/logic/battleSpeed.ts); Choice Specs is in SpA above.
            if (state != 'No Pokemon') {
                if (held_item == 'Choice Band' && player_ability != 'Klutz') {
                    final_stat_atk = Math.floor(final_stat_atk * 1.5)
                }
                else if (held_item == 'Eviolite' && not_fully_evolved == true) {
                    final_stat_def = Math.floor(final_stat_def * 1.5)
                    final_stat_spd = Math.floor(final_stat_spd * 1.5)
                }
                else if (species == 'Pikachu' && held_item == 'Light Ball') {
                    final_stat_atk = Math.floor(final_stat_atk * 2)
                    final_stat_spa = Math.floor(final_stat_spa * 2)
                }
                else if (species == 'Ditto' && held_item == 'Metal Powder') {
                    final_stat_def = Math.floor(final_stat_def * 2)
                }
                else if ((species == 'Marowak' || species == 'Cubone') && held_item == 'Thick Club') {
                    final_stat_atk = Math.floor(final_stat_atk * 2)
                }
                else if (species == 'Clamperl' && held_item == 'DeepSeaTooth') {
                    final_stat_spa = Math.floor(final_stat_spa * 2)
                }
                else if (species == 'Clamperl' && held_item == 'DeepSeaScale') {
                    final_stat_spd = Math.floor(final_stat_spd * 2)
                }
                else if ((species == 'Latias' || species == 'Latios') && held_item == 'Soul Dew') {
                    final_stat_spa = Math.floor(final_stat_spa * 1.5)
                    final_stat_spd = Math.floor(final_stat_spd * 1.5)
                }
            }

            if (final_stat_hp > 9999 || final_stat_atk > 9999 || final_stat_def > 9999 || final_stat_spa > 9999 || final_stat_spd > 9999 || final_stat_spe > 9999) {
                final_stat_hp  = this.g5PokemonData[this.starter].base_stats.hp
                final_stat_atk = this.g5PokemonData[this.starter].base_stats.attack
                final_stat_def = this.g5PokemonData[this.starter].base_stats.defense
                final_stat_spa = this.g5PokemonData[this.starter].base_stats.special_attack
                final_stat_spd = this.g5PokemonData[this.starter].base_stats.special_defense
                final_stat_spe = this.g5PokemonData[this.starter].base_stats.speed
            }
            if (final_stat_hp == 0 || final_stat_atk == 0 || final_stat_def == 0 || final_stat_spa == 0 || final_stat_spd == 0 || final_stat_spe == 0) {
                final_stat_hp  = this.g5PokemonData[this.starter].base_stats.hp
                final_stat_atk = this.g5PokemonData[this.starter].base_stats.attack
                final_stat_def = this.g5PokemonData[this.starter].base_stats.defense
                final_stat_spa = this.g5PokemonData[this.starter].base_stats.special_attack
                final_stat_spd = this.g5PokemonData[this.starter].base_stats.special_defense
                final_stat_spe = this.g5PokemonData[this.starter].base_stats.speed
            }
            // Return the calculated stats
            return {
                "Hp" : final_stat_hp,
                "Atk": final_stat_atk,
                "Def": final_stat_def,
                "SpA": final_stat_spa,
                "SpD": final_stat_spd,
                "Spe": final_stat_spe,
            }
        },
        get_acc_eva_mod(mod_type) {
            let pokemon_data = this.game.properties.battle.player.active_pokemon.modifiers
            
            // Fix for Reshiram or Zekrom being added to the player's team
            const state = this.game.properties.meta.state.value
            const slot_1_species = this.game.properties.player.team[0].species.value
            let wrong_slot = false
            if ((slot_1_species == 'Reshiram' && this.starter != 'Reshiram' || slot_1_species == 'Zekrom' && this.starter != 'Zekrom')) {
                wrong_slot = true
            }
            if (state == 'Battle' && wrong_slot == true && this.game.properties.battle.opponent.trainer.value == 'N' && this.game.properties.battle.opponent.id.value == 587) {
                const player_team_count = this.game.properties.player.team_count.value
                const computed_slot = player_team_count - 1
                pokemon_data = this.game.properties.battle.player.pkmn_ram[`pokemon_${computed_slot}_ram`].modifiers
            }
            return this.stage_modifiers(pokemon_data[mod_type].value).toString()
        },
        statLabelOpacity() {
            let pokemon_data = this.game.properties.battle.player.active_pokemon
            
            // Fix for Reshiram or Zekrom being added to the player's team
            const state = this.game.properties.meta.state.value
            const slot_1_species = this.game.properties.player.team[0].species.value
            const player_team_count = this.game.properties.player.team_count.value
            const computed_slot = player_team_count - 1
            let wrong_slot = false
            if ((slot_1_species == 'Reshiram' && this.starter != 'Reshiram' || slot_1_species == 'Zekrom' && this.starter != 'Zekrom')) {
                wrong_slot = true
            }
            if (state == 'Battle' && wrong_slot == true && (this.game.properties.battle.opponent.id.value == 587 || this.game.properties.battle.opponent.id.value == 232)) {
                pokemon_data = this.game.properties.battle.player.pkmn_ram[`pokemon_${computed_slot}_ram`]
            }

            let default_opacity = .63
            let faded_opacity = .1
            let mod_atk = pokemon_data.modifiers.attack.value != '0'          && state == 'Battle' && !this.not_valid_battle_state ? faded_opacity : default_opacity
            let mod_def = pokemon_data.modifiers.defense.value != '0'         && state == 'Battle' && !this.not_valid_battle_state ? faded_opacity : default_opacity
            let mod_spa = pokemon_data.modifiers.special_attack.value != '0'  && state == 'Battle' && !this.not_valid_battle_state ? faded_opacity : default_opacity
            let mod_spd = pokemon_data.modifiers.special_defense.value != '0' && state == 'Battle' && !this.not_valid_battle_state ? faded_opacity : default_opacity
            let mod_spe = pokemon_data.modifiers.speed.value != '0'           && state == 'Battle' && !this.not_valid_battle_state ? faded_opacity : default_opacity
            let object = {
                "HP":              default_opacity,
                "Attack":          mod_atk,
                "Defense":         mod_def,
                "Speed":           mod_spe,
                "Special Attack":  mod_spa,
                "Special Defense": mod_spd,
            }
            return object
        },
        get_base_stat_total() {
            const starter = this.starter
            const data    = this.g5PokemonData[starter]
            const hp      = data.base_stats.hp
            const atk     = data.base_stats.attack
            const def     = data.base_stats.defense
            const spa     = data.base_stats.speed
            const spd     = data.base_stats.special_attack
            const spe     = data.base_stats.special_defense
            const total   = hp + atk + def + spa + spd + spe
            return total
        },
        copy_overlay_properties() {
            const copy_from = this.copy_overlay_pokemon_from.trim()
            const copy_to = this.copy_overlay_pokemon_to.trim()
            const game_name = this.game?.properties.meta.game_name.value
            
            // Validation
            if (!copy_from || !copy_to) {
                console.log("Please enter both source and destination Pokemon names.")
                return
            }
            
            if (copy_from === copy_to) {
                console.log("Source and destination Pokemon cannot be the same.")
                return
            }
            
            const from_key = `${game_name}_${copy_from}`
            const to_key = `${game_name}_${copy_to}`
            
            // Check if source Pokemon has data
            if (!MyStorage[from_key]) {
                console.log(`The Pokemon "${copy_from}" does not have overlay data stored for it.`)
                return
            }
            
            // Initialize destination Pokemon data if it doesn't exist
            if (!MyStorage[to_key]) {
                MyStorage[to_key] = {}
            }
            
            // List of all styling properties to copy
            const stylingProperties = [
                // Overlay color and UI settings
                'overlay_color',
                'ui_saturation',
                
                // Background texture settings
                'backgroundTexture',
                'backgroundBlur',
                'backgroundHue',
                'backgroundScale',
                'backgroundUrl',
                'backgroundFlip',
                'backgroundXFlip',
                'use_custom_background',
                'backgroundXOffset',
                'backgroundYOffset',
                'backgroundBrightness',
                'backgroundContrast',
                'backgroundSaturation',
                
                // Evolution settings (optional - user might want to copy these too)
                'evolution',
                'evolution_splits_label'
            ]
            
            // Copy properties from source to destination in MyStorage
            stylingProperties.forEach(prop => {
                if (MyStorage[from_key].hasOwnProperty(prop)) {
                    MyStorage[to_key][prop] = MyStorage[from_key][prop]
                }
            })
            
            // Update Vue data properties for immediate visual update
            // Only update if the destination Pokemon is currently selected
            if (this.starter === copy_to) {
                stylingProperties.forEach(prop => {
                    if (MyStorage[from_key].hasOwnProperty(prop)) {
                        this[prop] = MyStorage[from_key][prop]
                    }
                })
            }
            
            // Save the input values for persistence
            MyStorage['copy_overlay_pokemon_from'] = copy_from
            MyStorage['copy_overlay_pokemon_to'] = copy_to
            
            console.log(`Successfully copied overlay settings from "${copy_from}" to "${copy_to}".`)
        },
        copyCurrentStylesToAllFamilyMembers() {
            // Copy all style settings from the currently selected evolution family member
            // to all other members of the evolution family
            if (!this.evolution || !this.selected_evolution_species || this.evolution_family_list.length <= 1) {
                console.log("Evolution mode must be enabled and you must have multiple species in the evolution family.")
                return
            }
            
            const game_name = this.game?.properties?.meta?.game_name?.value || this.selected_game;
            const sourceSpecies = this.selected_evolution_species;
            const sourceStorageKey = this.getStorageKey(sourceSpecies, true); // Evolution line storage
            
            // Initialize source storage if it doesn't exist
            if (!MyStorage[sourceStorageKey]) {
                MyStorage[sourceStorageKey] = {};
            }
            
            // List of all styling properties to copy
            // This includes all properties from pokemon_settings that affect visual styling
            const stylingProperties = [
                // Overlay color and UI settings
                'overlay_color',
                'ui_saturation',
                
                // Pokemon image settings
                'imageXOffset',
                'imageYOffset',
                'imageScale',
                'imageFlip',
                'imageSat',
                'imageRotation',
                
                // Background texture settings
                'backgroundTexture',
                'backgroundBlur',
                'backgroundHue',
                'backgroundScale',
                'backgroundUrl',
                'backgroundFlip',
                'backgroundXFlip',
                'use_custom_background',
                'backgroundXOffset',
                'backgroundYOffset',
                'backgroundBrightness',
                'backgroundContrast',
                'backgroundSaturation'
            ]
            
            // Build the source data object with all current values
            const sourceData = {};
            stylingProperties.forEach(prop => {
                if (this[prop] !== undefined) {
                    sourceData[prop] = this[prop];
                }
            });
            
            // First, save current values to source storage key to ensure consistency
            // Get existing data (handles null case when key doesn't exist)
            const sourceExistingData = MyStorage[sourceStorageKey];
            MyStorage[sourceStorageKey] = {
                ...(sourceExistingData || {}),
                ...sourceData
            };
            
            // Copy to all other members of the evolution family
            let copiedCount = 0;
            const copiedValues = {}; // Store what we're copying for debugging
            this.evolution_family_list.forEach(targetSpecies => {
                if (targetSpecies !== sourceSpecies) {
                    const targetStorageKey = this.getStorageKey(targetSpecies, true); // Evolution line storage
                    
                    // Get existing data (might be null if key doesn't exist)
                    const existingData = MyStorage[targetStorageKey] || {};
                    
                    // Copy all properties at once - merge existing with new source data
                    const mergedData = {
                        ...existingData,
                        ...sourceData
                    };
                    
                    // Save to storage - this will trigger the Proxy's set trap
                    MyStorage[targetStorageKey] = mergedData;
                    
                    // Store for debugging
                    copiedValues[targetSpecies] = { ...sourceData };
                    
                    // Verify what was actually saved (re-read from storage to confirm)
                    const verifiedData = MyStorage[targetStorageKey];
                    
                    copiedCount++;
                    // Debug: Log what was copied for this species
                    console.log(`Copied to ${targetSpecies} (key: ${targetStorageKey}):`, copiedValues[targetSpecies]);
                    // Verify what was actually saved
                    console.log(`Verified storage for ${targetSpecies}:`, verifiedData);
                }
            });
            
            console.log(`Successfully copied style settings from "${sourceSpecies}" (key: ${sourceStorageKey}) to ${copiedCount} other family member(s).`);
        },
        load_all_settings() {
            const game_name                    = this.game.properties.meta.game_name.value
            const stored_starter               = MyStorage["starter"]                ?? "Heatran"
            // A form saved under Black 2 / White 2 (fused Kyurem, Therian genie, Resolute Keldeo)
            // has no entry in the base games' pokedex, so fall back to the species it belongs to
            this.starter                       = stored_starter in POKEMON_FORM_INFO && !this.g5PokemonData?.[stored_starter]
                                                     ? POKEMON_FORM_INFO[stored_starter].base
                                                     : stored_starter
            this.show_advanced_settings        = MyStorage['show_advanced_settings'] ?? false
            if (game_name == "HeartGold and SoulSilver") {
                this.starter_choice = MyStorage["starter_choice"] ?? "Chikorita"
            }
            else {
                this.starter_choice = MyStorage["starter_choice"] ?? "Turtwig"
            }

            this.graphicOverlay =             MyStorage['graphicOverlay']             ?? true
            this.gameArea =                   MyStorage['gameArea']                   ?? false
            this.pokeballFloor =              MyStorage['pokeballFloor']              ?? false
            this.dynamicOverlay =             MyStorage['dynamicOverlay']             ?? false
            this.gametime =                   MyStorage['gametime']                   ?? false
            this.pick =                       MyStorage['pick']                       ?? true
            this.typeCalcs =                  MyStorage['typeCalcs']                  ?? true
            this.moveset =                    MyStorage['moveset']                    ?? true
            this.dynamicPower =               MyStorage['dynamicPower']               ?? false
            this.resets =                     MyStorage['resets']                     ?? false
            this.stats =                      MyStorage['stats']                      ?? true
            this.movepool =                   MyStorage['movepool']                   ?? false
            this.inventory =                  MyStorage['inventory']                  ?? false
            this.battleStats =                MyStorage['battleStats']                ?? false
            this.battleInfo =                 MyStorage['battleInfo']                 ?? false
            this.conditions =                 MyStorage['conditions']                 ?? false
            this.expBar =                     MyStorage['expBar']                     ?? false
            this.splits =                     MyStorage['splits']                     ?? false
            this.tooltips =                   MyStorage['tooltips']                   ?? false
            this.btcInfo =                    MyStorage['btcInfo']                    ?? false
            this.returnPower =                MyStorage['returnPower']                ?? true
            this.gamestate =                  MyStorage['gamestate']                  ?? true
            this.labels =                     MyStorage['labels']                     ?? true
            this.tutor_moves =                MyStorage['tutor_moves']                ?? false
            this.showSpecialTrainerGraphics = MyStorage['showSpecialTrainerGraphics'] ?? true
            this.testRun =                    MyStorage['testRun']                    ?? false
            this.simple_data_str =            MyStorage['simple_data_str']            ?? ""
            this.simple_data =                MyStorage['simple_data']                ?? ""
            this.time_split_start =           MyStorage['time_split_start']           ?? "00:00:00:00"
            this.battle_start =               MyStorage['battle_start']               ?? 0
            this.encounters_route_1        = MyStorage[`${game_name}_${this.starter}`]?.encounters_route_1        ?? false
            this.encounters_route_2        = MyStorage[`${game_name}_${this.starter}`]?.encounters_route_2        ?? false
            this.encounters_woobat         = MyStorage[`${game_name}_${this.starter}`]?.encounters_woobat         ?? false
            this.encounters_roggenrola     = MyStorage[`${game_name}_${this.starter}`]?.encounters_roggenrola     ?? false
            this.encounters_pidove         = MyStorage[`${game_name}_${this.starter}`]?.encounters_pidove         ?? true
            this.encounters_tympole        = MyStorage[`${game_name}_${this.starter}`]?.encounters_tympole        ?? false
            this.encounters_timburr        = MyStorage[`${game_name}_${this.starter}`]?.encounters_timburr        ?? false
            this.encounters_route_19       = MyStorage[`${game_name}_${this.starter}`]?.encounters_route_19       ?? false
            this.encounters_route_20       = MyStorage[`${game_name}_${this.starter}`]?.encounters_route_20       ?? false
            this.encounters_flocessy_ranch = MyStorage[`${game_name}_${this.starter}`]?.encounters_flocessy_ranch ?? false
            this.encounters_psyduck        = MyStorage[`${game_name}_${this.starter}`]?.encounters_psyduck        ?? true
            this.editor =                     MyStorage['editor']                     ?? false
            this.debugging_mode =             MyStorage['debugging_mode']             ?? true
            this.enemy_sprite_styles_enabled = MyStorage['enemy_sprite_styles_enabled'] ?? true
            this.held_item_replacement =      MyStorage['held_item_replacement']      ?? ""
            this.move1_replacement =          MyStorage['move1_replacement']          ?? ""
            this.move2_replacement =          MyStorage['move2_replacement']          ?? ""
            this.move3_replacement =          MyStorage['move3_replacement']          ?? ""
            this.move4_replacement =          MyStorage['move4_replacement']          ?? ""

            const evolution_family = this.g5PokemonData[this.starter]?.evolution_family ?? [ {species: null, method: null,}, {species: null, method: null,}, {species: null, method: null,}, ]
            this.evolution =               MyStorage[`${game_name}_${this.starter}`]?.evolution              ?? false
            this.evolution_splits_label =  MyStorage[`${game_name}_${this.starter}`]?.evolution_splits_label ?? ""
            this.copy_overlay_pokemon_from = MyStorage['copy_overlay_pokemon_from'] ?? ""
            this.copy_overlay_pokemon_to   = MyStorage['copy_overlay_pokemon_to']   ?? ""

            // Update evolution family list
            this.updateEvolutionFamilyList();
            
            // Load styles based on whether evolution is enabled
            if (this.evolution && this.evolution_family_list.length > 0) {
                // Load shared evolution family settings (ability, nature, gender, hidden power)
                // These are stored in the evolution family storage key (e.g., "Black_Unfezant-line")
                const evolutionFamilyStorageKey = this.getEvolutionFamilyStorageKey(this.starter);
                const familyStored = MyStorage[evolutionFamilyStorageKey] || {};
                
                // Load shared family settings
                this.pkmnNature = familyStored.pkmnNature ?? MyStorage[`${game_name}_${this.starter}`]?.pkmnNature ?? "Hardy";
                this.pkmn_ability = familyStored.pkmn_ability ?? MyStorage[`${game_name}_${this.starter}`]?.pkmn_ability ?? this.g5PokemonData[this.starter]?.abilities?.[0] ?? null;
                this.pkmn_gender = familyStored.pkmn_gender ?? MyStorage[`${game_name}_${this.starter}`]?.pkmn_gender ?? "Female";
                this.hidden_power_type = familyStored.hidden_power_type ?? MyStorage[`${game_name}_${this.starter}`]?.hidden_power_type ?? "Dark";
                this.hidden_power_index = familyStored.hidden_power_index ?? MyStorage[`${game_name}_${this.starter}`]?.hidden_power_index ?? 0;
                this.iv_mode = familyStored.iv_mode ?? MyStorage[`${game_name}_${this.starter}`]?.iv_mode ?? IV_MODE.automatic;
                this.load_manual_ivs(familyStored.manual_ivs ?? MyStorage[`${game_name}_${this.starter}`]?.manual_ivs);
                
                // Load selected evolution species from storage
                const stored_evolution_species = MyStorage[`${game_name}_${this.starter}`]?.selected_evolution_species;
                if (stored_evolution_species && this.evolution_family_list.includes(stored_evolution_species)) {
                    this.selected_evolution_species = stored_evolution_species;
                } else {
                    // Default to starter if not set or invalid
                    this.selected_evolution_species = this.starter;
                    // Save it
                    if (!MyStorage[`${game_name}_${this.starter}`]) {
                        MyStorage[`${game_name}_${this.starter}`] = {};
                    }
                    MyStorage[`${game_name}_${this.starter}`] = {
                        ...MyStorage[`${game_name}_${this.starter}`],
                        selected_evolution_species: this.starter
                    };
                }
                
                // Load evolution line styles for the selected species (this will also load the shared settings if they're in the individual storage)
                this.loadEvolutionStyle(this.selected_evolution_species, true);
            } else {
                // Evolution is disabled, load individual species styles
                //Pokemon settings for local storage
                this.overlay_color = MyStorage[`${game_name}_${this.starter}`]?.overlay_color ?? this.default_colors[`${this.g5PokemonData[this.starter].type_1}`]
                this.imageXOffset =  MyStorage[`${game_name}_${this.starter}`]?.imageXOffset ?? 0
                this.imageYOffset =  MyStorage[`${game_name}_${this.starter}`]?.imageYOffset ?? 0
                this.imageScale =    MyStorage[`${game_name}_${this.starter}`]?.imageScale ?? 1
                this.imageFlip =     MyStorage[`${game_name}_${this.starter}`]?.imageFlip ?? false
                this.imageSat =      MyStorage[`${game_name}_${this.starter}`]?.imageSat ?? 100
                this.imageRotation = MyStorage[`${game_name}_${this.starter}`]?.imageRotation ?? 0

                //background texture settings
                this.backgroundBlur =        MyStorage[`${game_name}_${this.starter}`]?.backgroundBlur ?? 0
                this.backgroundHue =         MyStorage[`${game_name}_${this.starter}`]?.backgroundHue ?? 0
                this.backgroundScale =       MyStorage[`${game_name}_${this.starter}`]?.backgroundScale ?? 100
                this.backgroundUrl =         MyStorage[`${game_name}_${this.starter}`]?.backgroundUrl ?? ""
                this.backgroundFlip =        MyStorage[`${game_name}_${this.starter}`]?.backgroundFlip ?? false
                this.backgroundXFlip =        MyStorage[`${game_name}_${this.starter}`]?.backgroundXFlip ?? false
                this.use_custom_background = MyStorage[`${game_name}_${this.starter}`]?.use_custom_background ?? false
                this.backgroundXOffset =     MyStorage[`${game_name}_${this.starter}`]?.backgroundXOffset ?? 0
                this.backgroundYOffset =     MyStorage[`${game_name}_${this.starter}`]?.backgroundYOffset ?? 0
                this.backgroundTexture =     MyStorage[`${game_name}_${this.starter}`]?.backgroundTexture ?? `${this.g5PokemonData[this.starter].type_1}`
                this.backgroundBrightness =  MyStorage[`${game_name}_${this.starter}`]?.backgroundBrightness ?? 100
                this.backgroundContrast =    MyStorage[`${game_name}_${this.starter}`]?.backgroundContrast ?? 100
                this.backgroundSaturation =  MyStorage[`${game_name}_${this.starter}`]?.backgroundSaturation ?? 100
                this.apply_texture_look()
                
                //UI styling
                this.ui_saturation =  MyStorage[`${game_name}_${this.starter}`]?.ui_saturation ?? .6
            }

            //main pokemon settings
            this.pkmnNature   = MyStorage[`${game_name}_${this.starter}`]?.pkmnNature            ?? "Hardy"

            if (this.g5PokemonData[this.starter].abilities.indexOf(this.pkmn_ability) == -1 && !MyStorage[`${game_name}_${this.starter}`]?.pkmn_ability) {
                this.pkmn_ability = this.g5PokemonData[this.starter].abilities[0]
            }
            else {
                this.pkmn_ability = MyStorage[`${game_name}_${this.starter}`]?.pkmn_ability          ?? this.g5PokemonData[this.starter]?.abilities[0] ?? null
            }
            this.set_starter_stats_object.gender = this.pkmn_gender;
            this.set_starter_stats_object.nature = this.pkmnNature;
            this.set_starter_stats_object.ability = this.pkmn_ability;
            this.apply_starter_ivs();
        },
        reset() {
            this.backgroundBlur =        0,
            this.backgroundHue =         0,
            this.backgroundScale =       100,
            this.backgroundUrl =         "",
            this.use_custom_background = false,
            this.backgroundXOffset =     0,
            this.backgroundYOffset =     0,
            this.backgroundTexture =     this.g5PokemonData[this.starter]?.type_1?.toLowerCase(),
            this.backgroundBrightness =  100,
            this.backgroundContrast =    100,
            this.backgroundSaturation =  100,
            this.apply_texture_look()
        },
        increment(property) {
            this[property]++;
            if (this.shuckie_counters == true) { 
                this.incrementEmulatorCounter(property) 
            }
        },
        decrement(property) {
            if (this[property] == 0) {
                return 0
            }
            this[property]--;

            if (this.shuckie_counters == true) { 
                if (this.emulatorStats?.counters?.[property] == undefined || this.emulatorStats?.counters?.[property] <= 0) {
                    return
                }
                this.incrementEmulatorCounterByAmount(property, -1) 
            }
        },
        async color_picker() {
            var color = await this.colorPick()
            this.set_pokemon_prop("overlay_color", color)
            this.overlay_color = color
        },
        set_pokemon_prop(property_name, value) {
            // Only ever called for style properties, so a displayed battle-only form routes to its own key
            const storageKey = this.getStyleStorageKey();
            MyStorage[storageKey] = {
                ...MyStorage[storageKey],
                [property_name]: value,
            }
        },
        updateEvolutionFamilyList() {
            // Update the evolution family list when starter changes
            this.evolution_family_list = this.getEvolutionFamily(this.starter);

            // Preload the family's art so a mid-run evolution cross-fades into a decoded image
            // instead of fading in a blank one. Only the family, never the full dex - gen5's
            // images/pokemon is ~400MB and images/textures ~9MB per texture, far too much to warm.
            for (const family_species of this.evolution_family_list) {
                const family_art = new Image();
                family_art.src = `images/gen5/pokemon/${family_species}.webp`;
            }

            // A species' other forms (and battle-only forms) aren't part of its evolution family, so
            // warm every form's art while any of them is selected - swapping forms then cross-fades
            // into a decoded image
            for (const form_species of [...this.formVariants(this.starter), ...this.battleFormVariants(this.starter)]) {
                if (form_species === this.starter) continue;
                const form_art = new Image();
                form_art.src = `images/gen5/pokemon/${form_species}.webp`;
            }

            // If the evolution family has only one member (e.g., Registeel), disable evolution
            if (this.evolution_family_list.length <= 1) {
                if (this.evolution) {
                    this.evolution = false;
                    console.log(`[Evolution] Disabled evolution for ${this.starter} - single-species evolution family`);
                }
                return;
            }
            
            // Set default selected evolution species to the starter if not set
            if (this.evolution && this.evolution_family_list.length > 1) {
                if (!this.selected_evolution_species || !this.evolution_family_list.includes(this.selected_evolution_species)) {
                    this.selected_evolution_species = this.starter;
                }
            }
        },
        loadEvolutionStyle(species, useEvolutionLine = false) {
            // Set flag to prevent watchers from saving during loading
            this.is_loading_evolution_style = true;
            
            // Load styles for a species, either from evolution line storage or individual storage
            const game_name = this.game?.properties?.meta?.game_name?.value || this.selected_game;
            const storageKey = useEvolutionLine ? this.getStorageKey(species, true) : this.getStorageKey(species, false);
            
            // Debug: Log what we're trying to load
            console.log(`Loading styles for ${species} (useEvolutionLine: ${useEvolutionLine}, key: ${storageKey})`);
            console.log(`Storage data for ${species}:`, MyStorage[storageKey]);
            
            // Load overlay and image settings
            this.overlay_color = MyStorage[storageKey]?.overlay_color ?? this.default_colors[this.g5PokemonData[species]?.type_1] ?? this.default_colors.Normal;
            this.ui_saturation = MyStorage[storageKey]?.ui_saturation ?? 0.6;
            this.imageXOffset = MyStorage[storageKey]?.imageXOffset ?? 0;
            this.imageYOffset = MyStorage[storageKey]?.imageYOffset ?? 0;
            this.imageScale = MyStorage[storageKey]?.imageScale ?? 1;
            this.imageFlip = MyStorage[storageKey]?.imageFlip ?? false;
            this.imageSat = MyStorage[storageKey]?.imageSat ?? 100;
            this.imageRotation = MyStorage[storageKey]?.imageRotation ?? 0;
            
            // Load background texture settings
            // Use 'in' operator to check if property exists in storage, to handle 0 and false values correctly
            const stored = MyStorage[storageKey] || {};
            
            this.backgroundTexture = 'backgroundTexture' in stored ? stored.backgroundTexture : `${this.g5PokemonData[species]?.type_1}`;
            this.backgroundBlur = 'backgroundBlur' in stored ? stored.backgroundBlur : 0;
            this.backgroundHue = 'backgroundHue' in stored ? stored.backgroundHue : 0;
            this.backgroundScale = 'backgroundScale' in stored ? stored.backgroundScale : 100;
            this.backgroundUrl = 'backgroundUrl' in stored ? stored.backgroundUrl : "";
            this.backgroundFlip = 'backgroundFlip' in stored ? stored.backgroundFlip : false;
            this.backgroundXFlip = 'backgroundXFlip' in stored ? stored.backgroundXFlip : false;
            this.use_custom_background = 'use_custom_background' in stored ? stored.use_custom_background : false;
            this.backgroundXOffset = 'backgroundXOffset' in stored ? stored.backgroundXOffset : 0;
            this.backgroundYOffset = 'backgroundYOffset' in stored ? stored.backgroundYOffset : 0;
            this.backgroundBrightness = 'backgroundBrightness' in stored ? stored.backgroundBrightness : 100;
            this.backgroundContrast = 'backgroundContrast' in stored ? stored.backgroundContrast : 100;
            this.backgroundSaturation = 'backgroundSaturation' in stored ? stored.backgroundSaturation : 100;
            this.apply_texture_look();
            
            // Load shared evolution family settings (ability, nature, gender, hidden power) if using evolution line
            if (useEvolutionLine) {
                const familyStorageKey = this.getEvolutionFamilyStorageKey(species);
                const familyStored = MyStorage[familyStorageKey] || {};
                
                // Load ability, nature, gender, and hidden power from family storage
                // Use 'in' operator to check if property exists, handling null/undefined correctly
                if ('pkmnNature' in familyStored) {
                    this.pkmnNature = familyStored.pkmnNature;
                }
                if ('pkmn_ability' in familyStored) {
                    this.pkmn_ability = familyStored.pkmn_ability;
                } else if (this.pkmn_ability === null || this.pkmn_ability === undefined) {
                    // Only default to first ability if not set at all
                    this.pkmn_ability = this.g5PokemonData[species]?.abilities?.[0] ?? null;
                }
                if ('pkmn_gender' in familyStored) {
                    this.pkmn_gender = familyStored.pkmn_gender;
                }
                if ('hidden_power_type' in familyStored) {
                    this.hidden_power_type = familyStored.hidden_power_type;
                }
                if ('hidden_power_index' in familyStored) {
                    this.hidden_power_index = familyStored.hidden_power_index;
                }
                if ('iv_mode' in familyStored) {
                    this.iv_mode = familyStored.iv_mode;
                }
                if ('manual_ivs' in familyStored) {
                    this.load_manual_ivs(familyStored.manual_ivs);
                }
            }
            
            // Debug: Log what was actually loaded
            console.log(`Loaded background settings for ${species}:`, {
                backgroundTexture: this.backgroundTexture,
                backgroundXOffset: this.backgroundXOffset,
                backgroundYOffset: this.backgroundYOffset,
                backgroundScale: this.backgroundScale,
                backgroundBrightness: this.backgroundBrightness,
                backgroundContrast: this.backgroundContrast,
                backgroundSaturation: this.backgroundSaturation,
                backgroundBlur: this.backgroundBlur,
                backgroundHue: this.backgroundHue,
                backgroundFlip: this.backgroundFlip
            });
            
            // Clear flag after loading is complete, use $nextTick to ensure all watchers have fired
            this.$nextTick(() => {
                this.is_loading_evolution_style = false;
            });
        },
        async performEvolutionTransition(oldSpecies, newSpecies) {
            // Perform smooth fade transition between old and new overlays
            this.evolution_transitioning = true;
            this.evolution_old_species = oldSpecies;
            this.evolution_new_species = newSpecies;
            
            // Get old and new styles
            const oldStorageKey = this.getStorageKey(oldSpecies, true);
            const newStorageKey = this.getStorageKey(newSpecies, true);
            const game_name = this.game?.properties?.meta?.game_name?.value || this.selected_game;
            
            const oldOverlayColor = MyStorage[oldStorageKey]?.overlay_color ?? this.default_colors[this.g5PokemonData[oldSpecies]?.type_1] ?? this.default_colors.Normal;
            const newOverlayColor = MyStorage[newStorageKey]?.overlay_color ?? this.default_colors[this.g5PokemonData[newSpecies]?.type_1] ?? this.default_colors.Normal;
            
            // Transition duration in milliseconds
            const duration = 1000; // 1 second
            const startTime = Date.now();
            
            // If overlay colors are the same, skip color transition
            const colorsMatch = oldOverlayColor === newOverlayColor;
            
            // Perform fade transition
            return new Promise((resolve) => {
                const animate = () => {
                    const elapsed = Date.now() - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    this.evolution_transition_progress = progress;
                    
                    // Fade Pokemon art (handled via opacity in template)
                    // Fade movepool (handled via opacity in template)
                    // Overlay color transition is handled by CSS transition on the .colored-image::after element
                    
                    if (progress < 1) {
                        requestAnimationFrame(animate);
                    } else {
                        // Transition complete
                        this.evolution_transitioning = false;
                        this.evolution_transition_progress = 0;
                        this.evolution_old_species = null;
                        this.evolution_new_species = null;
                        
                        // Update Pokemon art source after transition
                        this.$nextTick(() => {
                            // Art source will update automatically via :src binding
                            resolve();
                        });
                    }
                };
                
                // Styles should already be loaded by the watcher before this is called
                // If colors match, still do a quick transition for Pokemon art
                // If colors don't match, CSS transitions will handle the color fade
                
                animate();
            });
        },
        species_function(object) {
            return Object.values(object).map(entry => entry.species);
        },
        eHPType(valueToReturn, moveValue, slotIndex) {
            if (moveValue == "Hidden Power") {
                return this.hiddenPowerTypeCalc(this.game.properties.battle.opponent.team[slotIndex])
            }
            else {
                return valueToReturn
            }
        },
        enemyFaint(slotIndex) {
            return
            let opponent = 1
            if (slotIndex >= 6) { 
                slotIndex = slotIndex - 6
                opponent = 2
            }
            let fainted = false
            const enemy_hp = opponent == 2 ? this.game.properties.battle.opponent_2.team[slotIndex].stats.hp.value : this.game.properties.battle.opponent.team[slotIndex].stats.hp.value
            if (enemy_hp == 0) {
                fainted = true
            }
            if (fainted == true) {
                return "opacity: .35; filter: grayscale(100%);"
            }
            else {
                return
            }
        },
        async newRun() {
            this.compared_splits = []
            this.current_splits  = []

            this.expBarState.species = this.starter;
            this.expBarState.expPoints = 0;

            this.starter_received = false,

            this.timer.setTimer(this.timer_startTimeOffset)
            
            this.playerResets = 0
            this.finished_logs = false
            this.blackout_counter = 0
            this.playerId = 0
            this.run_complete = false
        },
        formVariants(species) {
            // Every pokedex key that is a form of `species` (itself included) and exists in the
            // dex in play; a species without forms is just itself
            const base = POKEMON_FORM_INFO[species]?.base
            if (!base) return [species]
            return Object.keys(POKEMON_FORMS[base]).filter(form => this.g5PokemonData?.[form])
        },
        resolveIncomingSpecies(rawName) {
            // The emulator reports species by name and keeps the form in a separate byte, so every
            // Rotom arrives as a bare "Rotom". The user's Solo Pokemon selection wins when it is a
            // form of the reported species (its byte gets stamped on hand-over); otherwise the form
            // byte the game holds picks the entry, which is how a Burmy that evolved wearing a Sandy
            // cloak lands on "Wormadam (Sandy)". Species without forms pass through.
            const forms = POKEMON_FORMS[rawName]
            if (!forms) return rawName
            if (POKEMON_FORM_INFO[this.starter]?.base === rawName) return this.starter
            const form_byte = this.game?.properties?.player?.team?.[0]?.flags?.alternate_form?.value
            const from_game = Object.keys(forms).find(species => forms[species] === form_byte)
            return from_game && this.g5PokemonData?.[from_game] ? from_game : rawName
        },
        applyPokemonForm(species) {
            // gen5 party data is read out of a synthetic decrypted container that the mapper's
            // preprocessor fills from encrypted RAM, so setting player.team[0].flags.alternate_form
            // would only touch PokeAByte's mirror and never reach the game. (gen4 can set its
            // equivalent directly because its party bytes sit unencrypted in the default
            // namespace.) The decrypt/re-encrypt round trip in write_byte_data is the only write
            // that lands, and it sets the form byte alongside the form's stats and ability.
            const info = POKEMON_FORM_INFO[species]
            if (!info) return
            const party_mon = this.game?.properties?.player?.team?.[0]
            if (party_mon?.species?.value !== info.base) return
            // Nothing to stamp when the game already holds this form (a Burmy that just evolved
            // into a cloaked Wormadam arrives here that way) - re-stamping would also refill HP
            if (party_mon.flags?.alternate_form?.value === info.form) return
            this.write_byte_data(this.set_starter_stats_object)
        },
        getSplitImageName(trainer) {
            if (!trainer) return ""
            const mapped = this.game_data?.opponentImageMap?.[trainer] ?? trainer
            return mapped.toLowerCase()
        },
        getTrainerGraphic() {
            if (this.enemy_graphic == true) {
                let graphic = `images/gen5/trainers/Cress.webp`
                let trainer = this.game.properties.battle.opponent.trainer.value
                let bytes = this.game.properties.battle.opponent.trainer.bytes
                let id_value = this.game.properties.battle.opponent.id.value
                let displayGraphicState = true
                if (this.selected_game == `Black` || this.selected_game == `White`) {
                    switch (trainer) {
                        case "Cress":    graphic = `images/gen5/trainers/Cress.webp`;    break;
                        case "Cilan":    graphic = `images/gen5/trainers/Cilan.webp`;    break;
                        case "Chili":    graphic = `images/gen5/trainers/Chili.webp`;    break;
                        case "Lenora":   graphic = `images/gen5/trainers/Lenora.webp`;   break;
                        case "Burgh":    graphic = `images/gen5/trainers/Burgh.webp`;         break;
                        case "Elesa":    graphic = `images/gen5/trainers/Elesa.webp`;    break;
                        case "Clay":     graphic = `images/gen5/trainers/Clay.webp`;     break;
                        case "Skyla":    graphic = `images/gen5/trainers/Skyla.webp`;    break;
                        case "Drayden":  graphic = `images/gen5/trainers/Drayden.webp`;  break;
                        case "Iris":     displayGraphicState = false; break;
                        case "Zinzolin": graphic = `images/gen5/trainers/Zinzolin.webp`; break;
                        case "Shauntal": { 
                            if (this.selected_game == `Black` || this.selected_game == `White`) {
                                if (id_value == 563) {
                                    displayGraphicState = false; break;
                                }
                                graphic = `images/gen5/trainers/Shauntal.webp`; break;
                            }
                            if (this.selected_game == `Black 2` || this.selected_game == `White 2`) {
                                if (id_value == 38) {
                                    displayGraphicState = false; break;
                                }
                                graphic = `images/gen5/trainers/Shauntal.webp`; break;
                            }

                        }
                        case "Marshal":  { 
                            if (this.selected_game == `Black` || this.selected_game == `White`) {
                                if (id_value == 564) {
                                    displayGraphicState = false; break;
                                }
                                graphic = `images/gen5/trainers/Marshal.webp`;  break;
                            }
                            if (this.selected_game == `Black 2` || this.selected_game == `White 2`) {
                                if (id_value == 39) {
                                    displayGraphicState = false; break;
                                }
                                graphic = `images/gen5/trainers/Shauntal.webp`; break;
                            }
                        }
                        case "Grimsley": { 
                            if (this.selected_game == `Black` || this.selected_game == `White`) {
                                if (id_value ==  565) {
                                    displayGraphicState = false; break;
                                }
                                graphic = `images/gen5/trainers/Grimsley.webp`; break;
                            }
                            if (this.selected_game == `Black 2` || this.selected_game == `White 2`) {
                                if (id_value == 40) {
                                    displayGraphicState = false; break;
                                }
                                graphic = `images/gen5/trainers/Shauntal.webp`; break;
                            }
                        }
                        case "Caitlin":  { 
                            if (this.selected_game == `Black` || this.selected_game == `White`) {
                                if (id_value == 566) {
                                    displayGraphicState = false; break;
                                }
                                graphic = `images/gen5/trainers/Caitlin.webp`;  break;
                            }
                            if (this.selected_game == `Black 2` || this.selected_game == `White 2`) {
                                if (id_value == 41) {
                                    displayGraphicState = false; break;
                                }
                                graphic = `images/gen5/trainers/Shauntal.webp`; break;
                            }
                        }
                        case "Cheren": {
                            switch (this.game.properties.battle.opponent.team_count.value) {
                                case 1: graphic = `images/gen5/trainers/Cheren_12.webp`; break;
                                case 2: graphic = `images/gen5/trainers/Cheren_12.webp`; break;
                                case 3: graphic = `images/gen5/trainers/Cheren_12.webp`; break;
                                case 4: graphic = `images/gen5/trainers/Cheren_4.webp`; break;
                                case 5: displayGraphicState = false; break;
                                case 6: displayGraphicState = false; break;
                                default: graphic = `images/gen5/trainers/Cheren_12.webp`; break;
                            }
                            break;
                        }    
                        case "Bianca": {
                            switch (this.game.properties.battle.opponent.team_count.value) {
                                case 1: graphic = `images/gen5/trainers/Bianca_12.webp`; break;
                                case 2: graphic = `images/gen5/trainers/Bianca_12.webp`; break;
                                case 3: graphic = `images/gen5/trainers/Bianca_12.webp`; break;
                                case 4: graphic = `images/gen5/trainers/Bianca_4.webp`; break;
                                case 5: displayGraphicState = false; break;
                                case 6: displayGraphicState = false; break;
                                default: graphic = `images/gen5/trainers/Bianca_12.webp`; break;
                            }
                            break;
                        }   
                        case "N": {
                            switch (this.game.properties.battle.opponent.team_count.value) {
                                case 1: graphic = `images/gen5/trainers/N_1.webp`; break;
                                case 2: graphic = `images/gen5/trainers/N_1.webp`; break;
                                case 3: graphic = `images/gen5/trainers/N_3.webp`; break;
                                case 4: graphic = `images/gen5/trainers/N_4.webp`; break;
                                case 5: displayGraphicState = false; break;
                                case 6: displayGraphicState = false; break;
                                default: graphic = `images/gen5/trainers/Bianca_12.webp`; break;
                            }
                            break;
                        }   
                        default: displayGraphicState = false; break;
                    } 
                }
                else if (this.selected_game == `Black 2` || this.selected_game == `White 2`) {
                    switch (trainer) {
                        case "Cheren": {
                            switch (this.game.properties.battle.opponent.team_count.value) {
                                case 1: graphic = `images/gen5/trainers/bw2/Cheren_12.webp`; break;
                                case 2: graphic = `images/gen5/trainers/bw2/Cheren_12.webp`; break;
                                case 3: graphic = `images/gen5/trainers/bw2/Cheren_3.webp`; break;
                                case 4: graphic = `images/gen5/trainers/bw2/Cheren_4.webp`; break;
                                case 5: displayGraphicState = false; break;
                                case 6: displayGraphicState = false; break;
                                default: graphic = `images/gen5/trainers/Cheren_12.webp`; break;
                            }
                            break;
                        }   
                        case "Roxie":    graphic = `images/gen5/trainers/bw2/Roxie.webp`;     break;
                        case "Burgh": {
                            switch (this.game.properties.battle.opponent.team_count.value) {
                                case 1: displayGraphicState = false; break;
                                case 2: displayGraphicState = false; break;
                                case 3: graphic = `images/gen5/trainers/Burgh.webp`; break;
                                case 4: graphic = `images/gen5/trainers/Burgh_4.webp`; break;
                                case 5: displayGraphicState = false; break;
                                case 6: displayGraphicState = false; break;
                                default: graphic = `images/gen5/trainers/Burgh.webp`; break;
                            }
                            break;
                        } 
                        case "Elesa": {
                            switch (this.game.properties.battle.opponent.team_count.value) {
                                case 1: displayGraphicState = false; break;
                                case 2: displayGraphicState = false; break;
                                case 3: graphic = `images/gen5/trainers/bw2/Elesa.webp`; break;
                                case 4: graphic = `images/gen5/trainers/bw2/Elesa_4.webp`; break;
                                case 5: displayGraphicState = false; break;
                                case 6: displayGraphicState = false; break;
                                default: graphic = `images/gen5/trainers/Elesa.webp`; break;
                            }
                            break;
                        } 
                        case "Clay": {
                            switch (this.game.properties.battle.opponent.team_count.value) {
                                case 1: displayGraphicState = false; break;
                                case 2: displayGraphicState = false; break;
                                case 3: graphic = `images/gen5/trainers/Clay.webp`; break;
                                case 4: graphic = `images/gen5/trainers/Clay_4.webp`; break;
                                case 5: displayGraphicState = false; break;
                                case 6: displayGraphicState = false; break;
                                default: graphic = `images/gen5/trainers/Clay.webp`; break;
                            }
                            break;
                        } 
                        case "Skyla": {
                            switch (this.game.properties.battle.opponent.team_count.value) {
                                case 1: displayGraphicState = false; break;
                                case 2: displayGraphicState = false; break;
                                case 3: graphic = `images/gen5/trainers/Skyla.webp`; break;
                                case 4: graphic = `images/gen5/trainers/Skyla_4.webp`; break;
                                case 5: displayGraphicState = false; break;
                                case 6: displayGraphicState = false; break;
                                default: graphic = `images/gen5/trainers/Skyla.webp`; break;
                            }
                            break;
                        } 
                        case "Drayden": {
                            switch (this.game.properties.battle.opponent.team_count.value) {
                                case 1: displayGraphicState = false; break;
                                case 2: displayGraphicState = false; break;
                                case 3: graphic = `images/gen5/trainers/Drayden.webp`; break;
                                case 4: graphic = `images/gen5/trainers/Drayden_4.webp`; break;
                                case 5: displayGraphicState = false; break;
                                case 6: displayGraphicState = false; break;
                                default: graphic = `images/gen5/trainers/Drayden.webp`; break;
                            }
                            break;
                        } 
                        case "Marlon": {
                            switch (this.game.properties.battle.opponent.team_count.value) {
                                case 1: displayGraphicState = false; break;
                                case 2: displayGraphicState = false; break;
                                case 3: graphic = `images/gen5/trainers/bw2/Marlon.webp`; break;
                                case 4: graphic = `images/gen5/trainers/bw2/Marlon_4.webp`; break;
                                case 5: displayGraphicState = false; break;
                                case 6: displayGraphicState = false; break;
                                default: graphic = `images/gen5/trainers/bw2/Marlon.webp`; break;
                            }
                            break;
                        } 
                        // case "Iris":     graphic = `images/gen5/trainers/bw2/Iris.webp`;   break;
                        case "Colress": {
                            switch (this.game.properties.battle.opponent.team_count.value) {
                                // case 1: graphic = `images/gen5/trainers/Colress.webp`; break;
                                // case 2: graphic = `images/gen5/trainers/Colress.webp`; break;
                                case 3: graphic = `images/gen5/trainers/Colress.webp`; break;
                                // case 4: graphic = `images/gen5/trainers/Cheren_4.webp`; break;
                                case 5: graphic = `images/gen5/trainers/Colress_5.webp`; break;
                                // case 6: graphic = `images/gen5/trainers/Colress.webp`; break;
                                default: graphic = `images/gen5/trainers/Colress.webp`; break;
                            }
                            break;
                        }  
                        case "Shauntal": {
                            switch (this.game.properties.battle.opponent.team_count.value) {
                                case 1: graphic = `images/gen5/trainers/Shauntal.webp`; break;
                                case 2: graphic = `images/gen5/trainers/Shauntal.webp`; break;
                                case 3: graphic = `images/gen5/trainers/Shauntal.webp`; break;
                                case 4: graphic = `images/gen5/trainers/Shauntal.webp`; break;
                                case 5: graphic = displayGraphicState = false; break;
                                case 6: graphic = displayGraphicState = false; break;
                                default: graphic = `images/gen5/trainers/Shauntal.webp`; break;
                            } 
                            break;
                        }
                        case "Marshal": {
                            switch (this.game.properties.battle.opponent.team_count.value) {
                                case 1: graphic = `images/gen5/trainers/Marshal.webp`; break;
                                case 2: graphic = `images/gen5/trainers/Marshal.webp`; break;
                                case 3: graphic = `images/gen5/trainers/Marshal.webp`; break;
                                case 4: graphic = `images/gen5/trainers/Marshal.webp`; break;
                                case 5: graphic = displayGraphicState = false; break;
                                case 6: graphic = displayGraphicState = false; break;
                                default: graphic = `images/gen5/trainers/Marshal.webp`; break;
                            } 
                            break;
                        }
                        case "Grimsley": {
                            switch (this.game.properties.battle.opponent.team_count.value) {
                                case 1: graphic = `images/gen5/trainers/Grimsley.webp`; break;
                                case 2: graphic = `images/gen5/trainers/Grimsley.webp`; break;
                                case 3: graphic = `images/gen5/trainers/Grimsley.webp`; break;
                                case 4: graphic = `images/gen5/trainers/Grimsley.webp`; break;
                                case 5: graphic = displayGraphicState = false; break;
                                case 6: graphic = displayGraphicState = false; break;
                                default: graphic = `images/gen5/trainers/Grimsley.webp`; break;
                            } 
                            break;
                        }
                        case "Caitlin": {
                            switch (this.game.properties.battle.opponent.team_count.value) {
                                case 1: graphic = `images/gen5/trainers/Caitlin.webp`; break;
                                case 2: graphic = `images/gen5/trainers/Caitlin.webp`; break;
                                case 3: graphic = `images/gen5/trainers/Caitlin.webp`; break;
                                case 4: graphic = `images/gen5/trainers/Caitlin.webp`; break;
                                case 5: graphic = displayGraphicState = false; break;
                                case 6: graphic = displayGraphicState = false; break;
                                default: graphic = `images/gen5/trainers/Caitlin.webp`; break;
                            } 
                            break;
                        }
                        case "Rival": {
                            switch (this.game.properties.battle.opponent.team_count.value) {
                                case 1: graphic = `images/gen5/trainers/bw2/Hugh_12.webp`; break;
                                case 2: graphic = `images/gen5/trainers/bw2/Hugh_12.webp`; break;
                                case 3: graphic = `images/gen5/trainers/bw2/Hugh_3.webp`; break;
                                case 4: graphic = `images/gen5/trainers/bw2/Hugh_4.webp`; break;
                                case 5: displayGraphicState = false; break;
                                case 6: displayGraphicState = false; break;
                                default: graphic = `images/gen5/trainers/bw2/Hugh_12.webp`; break;
                            }
                            break;
                        }   
                        default: displayGraphicState = false; break;
                    } 
                }
                return {
                    state: displayGraphicState,
                    graphic: graphic,
                    name: trainer,
                }
            }
            else {
                return {
                    state: false,
                    graphic: ``,
                    name: "Error - there is no trainer graphic to display. Use 'v-if' to disable rendering of this code through the .state property of this object.",
                }
            }
        },
        get_friendship() {
            if (this.game.properties.meta.state.value == "From Battle") {
                return this.fix_friendship + "/255"
            }
            const pokemon_data = this.n_battle_data_fix_friendship
            var return_value = pokemon_data.friendship.value
            this.fix_friendship = return_value
            return return_value + "/255"
        },
        getMoveCategory(category, move) {
            var move = move
            var categoryText = category
            if (this.ready == false) { return ["", "",]}
            if (category == "Physical") { return [category, "Physical"] }
            if (category == "Special")  { return [category, "Special"] }
            if (category == "Status")   { return [category, "Status"] }
            else {return [category, "Physical"]}
        },
        getStat(stat) { //stat = the name of the stat ie. "hp", "attack", "defense", etc.
            const state = this.game.properties.meta.state.value
            const battle_ram = this.game.properties.battle.player.active_pokemon
            var ability = this.game.properties.battle.player.active_pokemon.ability.value
            var currentStat = 0
            var modifier = 0
            var stageModification = 1
            var return_value = 0
            if (state == `Battle`) {
                currentStat = this.game?.properties?.battle?.player?.active_pokemon?.stats[stat].value
                modifier = this.game?.properties?.battle?.player?.active_pokemon?.modifiers[stat].value == null ? 0 
                    : this.game?.properties?.battle?.player?.active_pokemon?.modifiers[stat].value
                if (ability == 'Simple') {
                        switch (modifier) {
                            case -4: modifier = -6; break;
                            case -5: modifier = -6; break;
                            case -6: modifier = -6; break;
                            case 4:  modifier = 6;  break;
                            case 5:  modifier = 6;  break;
                            case 6:  modifier = 6;  break;
                            default: modifier = modifier * 2; break;
                        }
                }
                stageModification = this.stageModifiersData.stats[modifier] == undefined ? 1 
                    : this.stageModifiersData.stats[modifier]
                return_value = Math.floor(currentStat * stageModification)
                //assign buffer values
                this.buffer_battle_level           = battle_ram.level.value
                this.buffer_battle_exp             = battle_ram.exp.value
                this.buffer_battle_hp              = battle_ram.stats.hp_max.value
                switch (stat) {
                    case 'attack':          this.buffer_battle_attack          = return_value; break;
                    case 'defense':         this.buffer_battle_defense         = return_value; break;
                    case 'speed':           this.buffer_battle_speed           = return_value; break;
                    case 'special_attack':  this.buffer_battle_special_attack  = return_value; break;
                    case 'special_defense': this.buffer_battle_special_defense = return_value; break;
                }
            }
            else if (state == `From Battle`) {
                switch (stat) {
                    case 'attack':          return_value = this.buffer_battle_attack;          break;
                    case 'defense':         return_value = this.buffer_battle_defense;         break;
                    case 'speed':           return_value = this.buffer_battle_speed;           break;
                    case 'special_attack':  return_value = this.buffer_battle_special_attack;  break;
                    case 'special_defense': return_value = this.buffer_battle_special_defense; break;
                }
            }
            else if (state == `No Pokemon`) {
                var statName = ""
                switch (stat) {
                    case "attack":          statName = "base_atk";     break;
                    case "defense":         statName = "base_def";     break;
                    case "speed":           statName = "base_spd";     break;
                    case "special_attack":  statName = "base_spc_atk"; break;
                    case "special_defense": statName = "base_spc_def"; break;
                }
                return_value = this.g5PokemonData[this.starter][statName]
            }
            else if (state == `Overworld` || state == `To Battle`) {
                return_value = this.game?.properties?.player?.team[0].stats[stat].value
                if (stat == 'speed' && this.game.properties.player.team[0].status_condition.value == 'Paralyzed') {
                    return_value = Math.floor(return_value / 4)
                }
            }
            return return_value
        },
        getEnemyStat(statName, statValue, slotIndex) { //stat = the name of the stat ie. "hp", "attack", "defense", etc.
            const weather = this.game.properties.battle?.field?.weather?.value
            const ability = this.game?.properties?.battle?.opponent?.team?.[slotIndex]?.ability?.value
            const species = this.game?.properties?.battle?.opponent?.team?.[slotIndex]?.species?.value
            const held_item = this.enemy_held_item(slotIndex)
            if (statName == 'speed') {
                // The Speed the game compares for turn order (core/logic/battleSpeed.ts)
                const in_battle = this.game.properties.meta.state.value == `Battle`
                const active = in_battle && this.game.properties.battle.opponent.party_position == slotIndex
                const speed = gen45TurnOrderSpeed(5, {
                    speed: this.game?.properties?.battle?.opponent?.team?.[slotIndex]?.stats?.speed?.value,
                    stage: active ? this.game?.properties?.battle?.opponent?.pkmn_ram?.[`pokemon_${slotIndex}_ram`]?.modifiers?.speed?.value : 0,
                    ability, item: held_item, species,
                    // The party copy's status: the battle structure's is not mapped (pokemon_black.xml battle_structure)
                    status: this.game?.properties?.battle?.opponent?.team?.[slotIndex]?.status_condition?.value,
                    weather: in_battle ? weather : null,
                    weatherSuppressed: this.weatherSuppressed(),
                })
                return speed == 0 || speed > 1500 ? statValue : speed
            }
            let weatherMod = 1
            if (statName == 'speed') {
                if (weather == 'Sun' && ability == 'Chlorophyll') {
                    weatherMod = 2
                }
                else if (weather == 'Rain' && ability == 'Swift Swim') {
                    weatherMod = 2
                }
                else if (weather == 'Sandstorm' && ability == 'Sand Rush') {
                    weatherMod = 2
                }
            }
            if (statName == 'special_defense') {
                let type1 = this.g5PokemonData?.[species]?.type_1
                let type2 = this.g5PokemonData?.[species]?.type_2
                if (weather == 'Sandstorm' && (type1 == 'Rock' || type2 == 'Rock')) {
                    weatherMod = 1.5
                }
            }
            // Held-item stat modifiers (Choice Band/Specs/Scarf and Eviolite)
            let itemMod = 1
            if (ability != 'Klutz') {
                if (statName == 'attack' && held_item == 'Choice Band') {
                    itemMod = 1.5
                }
                else if (statName == 'special_attack' && held_item == 'Choice Specs') {
                    itemMod = 1.5
                }
                else if (statName == 'speed' && held_item == 'Choice Scarf') {
                    itemMod = 1.5
                }
                else if (held_item == 'Eviolite' && (statName == 'defense' || statName == 'special_defense')) {
                    if (this.canStillEvolve(species)) {
                        itemMod = 1.5
                    }
                }
            }
            let currentStat = 0
            if (this.game.properties.meta.state.value == `Battle` && this.game.properties.battle.opponent.party_position == slotIndex) {
                currentStat = this.game?.properties?.battle?.opponent?.team?.[slotIndex]?.stats?.[statName]?.value

                let modifier = this.game?.properties?.battle?.opponent?.pkmn_ram?.[`pokemon_${slotIndex}_ram`]?.modifiers?.[statName]?.value
                let stageModification = this.stageModifiersData?.stats?.[modifier]
                if (stageModification == null) {
                    return Math.floor(currentStat * weatherMod * itemMod)
                }
                let calculated_stats = Math.floor(currentStat * stageModification * weatherMod * itemMod)
                if (calculated_stats == 0 || calculated_stats > 1500) {
                    return statValue
                }
                return calculated_stats
            }
            else {
                return Math.floor(this.game?.properties?.battle?.opponent?.team?.[slotIndex]?.stats?.[statName]?.value * weatherMod * itemMod)
            }
        },
        enemyMove(slot, moveNumber) {
            if (this.game.properties.meta.state.value == `Battle`) {
                return this.enemy_mon_static[slot].moves[moveNumber]
            }
            else {
                return
            }
        },
        getMove(moveNumber) {
            const state = this.game.properties.meta.state.value
            const pokemon_data = this.n_battle_data_fix
            let move = undefined
            if (state == `Battle`) {
                move = pokemon_data.moves[`move${moveNumber}`]?.move.value
            }
            else if (state == `From Battle`) {
                move = this[`move_fix_name_${moveNumber}`]
            }
            else {
                move = pokemon_data.moves[`${moveNumber - 1}`]?.move.value
            }
            return move
        },
        getMoveType(x) {
            const move = this.black_moves[this.getMove(x)]?.move
            if (move == 'Natural Gift') {
                return this.moveType(move).toLowerCase()
            }
            else {
                return this.moveType(move).toLowerCase()
            }
        },
        getMoveObject(moveNumber) {
            const state = this.game.properties.meta.state.value
            const species = this.game.properties.player.team[0].species.value
            const team_move = this.game.properties.player.team[0].moves[`${moveNumber}`]
            const battle_move = this.game.properties.battle.player.active_pokemon?.moves[`move${moveNumber}`]?.move.value
            if (state == `Battle` || state == `From Battle` || (state == `No Pokemon` && species != null)) {
                if (battle_move?.move?.value) {
                    return battle_move
                }
            }
            else if (state == `Overworld`) {
                if (team_move?.move.value) {
                    return team_move
                }
            }
            else if (state == `No Pokemon`) {
                return {
                    move: {
                        value: null,
                    },
                    pp: null,
                    ppUp: null,
                }
            }
        },
        getPP(moveNumber) {
            const state = this.game.properties.meta.state.value
            if (state == 'No Pokemon') {
                return
            }
            const pokemon_data = this.n_battle_data_pp_fix
            let pp_value
            switch (state) {
                case 'Battle':
                    pp_value = pokemon_data.moves[`move${moveNumber}`]?.pp.value
                    break
                case 'From Battle':
                    pp_value = this[`move_fix_pp_${moveNumber}`]
                    break
                case 'To Battle':
                    pp_value = pokemon_data.moves[moveNumber - 1]?.pp.value
                    break
                case 'Overworld':
                    pp_value = pokemon_data.moves[moveNumber - 1]?.pp.value
                    break
            }
            return pp_value
        },
        getMoveProperty(move, property) {
            if (move) {
                return this.black_moves[move][property]
            }
        },
        getSoloMonType(pkmn, type) { //type == type_1 or type_2
            // const species = pkmn
            // A battle-only form being displayed for styling shows its own typing outside battle
            const species = (this.active_battle_form && this.active_battle_form !== this.starter) ? this.active_battle_form : this.starter
            var held_item = ""
            if (this.starter == 'Arceus') {
                return this.arceus_plate_check()
            }
            if (this.game.properties.meta?.state?.value == `From Battle`) {
                return this.g5PokemonData[species][type]
            }
            if (this.game.properties.meta.state.value == `From Battle`) {
                return this.g5PokemonData[species][type]
            }
            if (this.game.properties.meta.state.value == `Battle`) {
                typeString = "type_1"
                if (type == "type_2") {
                    typeString = "type_2"
                    return this.n_battle_data_fix[typeString]?.value
                }
                return this.n_battle_data_fix[typeString]?.value
            }
            if (this.game.properties.meta?.state?.value == `No Pokemon` || this.game.properties.meta?.state?.value == `Overworld` || this.game.properties.meta?.state?.value == `To Battle`) {
                return this.g5PokemonData[species][type]
            }
        },
        move_name(move_string) { //converts move strings so that they are formatted correctly
            if (move_string != undefined || move_string != "") {
                if (move_string.toLowerCase() == "vicegrip")     { return "ViceGrip" }
                if (move_string.toLowerCase() == "doubleslap")   { return "DoubleSlap" }
                if (move_string.toLowerCase() == "double-edge")  { return "Double-Edge" }
                if (move_string.toLowerCase() == "solarbeam")    { return "SolarBeam" }
                if (move_string.toLowerCase() == "extremespeed") { return "ExtremeSpeed" }
                if (move_string.toLowerCase() == "dynamicpunch") { return "DynamicPunch" }
                if (move_string.toLowerCase() == "thunderpunch") { return "ThunderPunch" }
                if (move_string.toLowerCase() == "bubblebeam")   { return "BubbleBeam" }
                if (move_string.toLowerCase() == "grasswhistle") { return "GrassWhistle" }
                if (move_string.toLowerCase() == "softboiled")   { return "Softboiled" }
                if (move_string.toLowerCase() == "sand-attack")  { return "Sand-Attack" }
                if (move_string.toLowerCase() == "mud-slap")     { return "Mud-Slap" }
                if (move_string.toLowerCase() == "featherdance") { return "FeatherDance" }
                if (move_string.toLowerCase() == "poisonpowder") { return "PoisonPowder" }
                if (move_string.toLowerCase() == "dragonbreath") { return "DragonBreath" }
                if (move_string.toLowerCase() == "ancientpower") { return "AncientPower" }
                if (move_string.toLowerCase() == "smellingsalt") { return "SmellingSalt" }
                if (move_string.toLowerCase() == "selfdestruct") { return "Selfdestruct" }
                if (move_string.toLowerCase() == "smokescreen")  { return "SmokeScreen" }
                if (move_string.toLowerCase() == "sonicboom")    { return "SonicBoom" }
                if (move_string.toLowerCase() == "will-o-wisp")  { return "Will-O-Wisp" }
                if (move_string.toLowerCase() == "u-turn")       { return "U-turn" }
                else { return move_string }
            }
            else { return move_string }
        },
        enemyDynamic(activePkmn, currentSlot) {
            if (activePkmn == currentSlot && this.game.properties.meta.state.value == "Battle") {
                return this.game?.properties?.battle?.opponent?.active_pokemon
            }
            else { 
                return this.game?.properties?.battle?.trainer?.team[activePkmn]
            }
        },

        //SPLITS
        currentSplit(splitData) {
            var arrayLength = splitData.length
            var split = splitData[arrayLength]["realtime.end"]
            return this.formatDuration(split)
        },
        lastSplit(splitData) {
            var arrayLength = splitData.length
            var splitNumber = arrayLength - 1
            var split = splitData[splitNumber]["realtime.end"]
            return this.formatDuration(split)
        },

        //AUTOMATION MOVEPOOL GRAPHIC
        dataSearch(dataObject, pointerValue) {
            if (!pointerValue) return ""
            const key = findKeyIgnoringCase(dataObject, pointerValue)
            return dataObject[key] || "ERROR"
        },
        formChangeMoves(pkmn) {
            // Moves an in-game form change teaches (Rotom's appliance moves), minus anything the
            // species already learns by level so the base Rotom doesn't list ThunderShock twice
            const level_moves = (pkmn?.level_up_learnset ?? []).map(entry => entry[1])
            return (pkmn?.form_change_learnset ?? []).filter(move => !level_moves.includes(move))
        },
        getMovepool(gen3PkmnData, moveData, tmhmMapping, species) {
            const pkmn = this.dataSearch(gen3PkmnData, species)
            let obj = {
                level: markReminderMoves(pkmn.level_up_learnset.map(x => {
                    return {
                        ...{Level: x[0]},
                        ...this.dataSearch(moveData, x[1]) //searching for index 1
                    }
                })), 
                tmhm: pkmn.tm_hm_learnset.map(x => {
                    return {
                        ...{tmhm: tmhmMapping.find(y => y.Move == x)?.tmhmIndex??"ERR"},
                        ...this.dataSearch(moveData, x)
                    }
                }),     
                tutor: pkmn.tutor_learnset.map(x => {
                    return this.dataSearch(moveData, x)
                }),
                form: this.formChangeMoves(pkmn).map(x => {
                    return this.dataSearch(moveData, x)
                }),    
            }
            // console.log(obj)
            return obj
        }, 

        // MOVE ACCURACY
        getAccuracy(accuracy, move) {
            // const weather   = this.game.properties.battle.field.weather.value
            const state     = this.game.properties.meta.state.value
            const pokemon_data = this.n_battle_data_fix
            const held_item = this.game.properties.player.team[0].held_item.value
            const move_category = this.black_moves[move]?.category
            const listed_accuracy = accuracy
            var ability = state != 'Battle' ? this.game.properties.player?.team[0]?.ability?.value : this.game.properties.battle.player.active_pokemon.ability_temp.value
            if (accuracy == '-') {
                return '—'
            }
            if (isOhkoMove(move)) {
                // One-hit KO moves skip the accuracy calculation: no stages, items or Compound
                // Eyes, only Sturdy, No Guard and the level difference (core/logic/ohkoAccuracy.ts).
                if (state != `Battle`) {
                    return accuracy
                }
                const opponent = this.activeOpponent()
                return gen45OhkoAccuracy(5, accuracy, pokemon_data.level?.value, opponent.level?.value, this.game.properties.battle.player.active_pokemon.ability?.value, opponent.ability?.value) ?? accuracy
            }
            if (ability == 'No Guard') {
                return '—'
            }
            if (ability == 'Victory Star') {
                accuracy = accuracy * (4506/4096)
            }
            if (ability == 'Compound Eyes') {
                accuracy = accuracy * 1.3
            }

            // if (weather == 'Hail' && move == 'Blizzard' && state == 'Battle') {
            //     return `—`
            // }
            let calculated_accuracy
            if (state == `Overworld` || state == `To Battle`) {
                let item_modifier = 1
                let ability_modifier = 1
                switch (held_item) {
                    case "Wide Lens": item_modifier = 4505/4096; break;
                    case "Zoom Lens": item_modifier = 4915/4096; break;
                    default: item_modifier = 1; break;
                }
                if (move_category == "Physical" && ability == "Hustle") {
                    ability_modifier = 3277/4096
                }
                if (item_modifier == 1 && ability_modifier == 1) {
                    calculated_accuracy = accuracy 
                }
                else {
                    calculated_accuracy = Math.floor(accuracy * item_modifier * ability_modifier) <= 100 ? Math.floor(accuracy * item_modifier * ability_modifier) : 100
                }
                if (calculated_accuracy >= 100) { 
                    calculated_accuracy = 100 
                }
                return Math.floor(calculated_accuracy)
            }
            else if (state == `Battle`) {
                const opponent = this.activeOpponent()
                // The target's No Guard: the move cannot miss
                if (opponent.ability?.value == 'No Guard') {
                    return '—'
                }
                // One combined stage, then the modifiers chained as gen5 does (core/logic/moveAccuracy.ts).
                // Weather is left out while gen5's weather stays off (see typeEffectiveness).
                const enemy_slot = this.game.properties.battle.opponent.party_position?.value
                const enemy_moves_first = gen45TurnOrder(
                    { speed: this.get_stat().Spe, ability: pokemon_data.ability_temp?.value, item: pokemon_data.held_item?.value },
                    { speed: this.getEnemyStat('speed', opponent.stats?.speed, enemy_slot), ability: this.game.properties.battle.opponent.team?.[enemy_slot]?.ability?.value, item: this.enemy_held_item(enemy_slot) },
                    false,
                ) < 0
                return calcMoveAccuracy(5, {
                    accuracy: listed_accuracy,
                    accuracyStage: pokemon_data.modifiers.accuracy?.value,
                    evasionStage: opponent.modifiers.evasion?.value,
                    physical: move_category == "Physical",
                    userAbility: this.game.properties.battle.player.active_pokemon.ability.value,
                    targetAbility: this.game.properties.battle.opponent.team?.[enemy_slot]?.ability?.value,
                    userItem: pokemon_data.held_item?.value,
                    targetItem: this.enemy_held_item(enemy_slot),
                    targetMovedFirst: enemy_moves_first,
                }) ?? '—'
            }

            if (accuracy > 100) {
                accuracy = 100
            }
            else return Math.floor(accuracy)
        },
        
        
        // STAGE MULTIPLIERS
        enemyStatModification(activePkmn, currentSlot, statLabel, stat, modifier, pkmnData) {
            var modData = this.stageModifiersData.find(x => x.modType === "stat")
            var modified_stat = stat
            var status_paralysis = 1
            var status_burn = 1
            var mod_ability = 1
            var mod_weather = 1

            if (pkmnData.status1.value == "Paralyzed" && statLabel == "speed") { status_paralysis = .25 } // sets modifier for paralysis if the Pokemon is paralyzed
            if (pkmnData.status1.value == "Burned" && statLabel == "attack")   { status_burn = .25 }      // sets modifier for burn if the Pokemon is burned

            //ABILITIES
            //Guts
            if (pkmnData.ability?.value.toLowerCase() == "guts" && statLabel == "attack" && 
            (pkmnData.status1.value == "Burned" || pkmnData.status_condition.value == "Paralyzed" || pkmnData.status_condition.value == "Poisoned" || pkmnData.status_condition.value == "Badly Poisoned" || pkmnData.status_condition.value == "Badly Posioned")) {
                mod_ability = 1.5 
            }
            //Marvel Scale
            if (pkmnData.ability?.value.toLowerCase() == "marvel scale" && statLabel == "defense" && pkmnData.status_condition.value != null) {
                mod_ability = 1.5 
            }
            //Chlorophyll
            if (pkmnData.ability?.value.toLowerCase() == "chlorophyll" && statLabel == "speed" && this.game.properties.battle.field.weather.value == "Sun") {
                mod_weather = 2 
            }
            //Swift Swim
            if (pkmnData.ability?.value.toLowerCase() == "swift swim" && statLabel == "speed" && this.game.properties.battle.field.weather.value == "Rain") {
                mod_weather = 2 
            }
            //Torrent
            //Blaze
            //Overgrow

            //CALCULATES THE CORRECT STAT
            if (activePkmn == currentSlot && this.game.properties.meta.state.value == "Battle") {
                modified_stat = Math.floor(stat * modData[modifier] * status_paralysis * status_burn * mod_ability * mod_weather)
            }

            //RETURNS THE CORRECT VALUE
            if (this.enemyState == "Fainted" || this.game.properties.meta.state.value == "From Battle") {
                return stat
            }
            if (this.enemyState == "Pokemon" || this.enemyState == "Fainting") {
                return modified_stat
            }
            return modified_stat
        },
        paralysis(speed) {
            if (this.s1.status_condition.value == `Paralyzed`) {
                return Math.floor(speed * 0.25)
            }
            else {
                return speed
            }
        },
        ability(ability, statname, statValue) {
            if (ability == `Hustle` && statname == `attack`) {
                return Math.floor(statValue * 1.5)
            }
            else if (ability == `Huge Power` && statname == `attack`) {
                return Math.floor(statValue * 2)
            }
            else if (ability == `Marvel Scale` && this.s1.status_condition.value != null && statname == `defense`) {
                return Math.floor(statValue * 1.5)
            }
            else if (ability == `Chlorophyll` && this.batt.field.weather.value == `Sun` && statname == `speed`) {
                return Math.floor(statValue * 1.5)
            }
            else if (ability == `Swift Swin` && this.batt.field.weather.value == `Rain` && statname == `speed`) {
                return Math.floor(statValue * 1.5)
            }
            else if (ability == `Guts` && statname == `attack` && (this.s1.status_condition.value == "Paralyzed" || this.s1.status_condition.value == "Poisoned" || this.s1.status_condition.value == "Burned")) {
                return Math.floor(statValue * 1.5)
            }
            else { 
                return statValue
            }
        },

        getStarterArt: function () {
            return `images/gen5/pokemon/${this.starter}.webp`
        },
        
        
        //GENERAL FUNCTIONS
        nullCheck(y) {
            if (y != null || y != undefined || y != "null")
                return y
            else
                return ""
            },
        pokemon(y, x) {
            if (y != null)
                var pkmnData = this.gen3data.find(x => x.dexNumber === y.toString())
                return pkmnData[x]
        },
        stage_modifiers(y) {
            return formatStage(y)
        },
        abilityDescription(y) {
            return gen3abilities[y]
        },
        
        //DAMAGE CALCULATIONS
        damageRange(x, y, z) {
            level = this.game.properties.battle.player.active_pokemon.level.value
            attack = this.game.properties.battle.player.active_pokemon.attack.value
            defense = this.game.properties.battle.opponent.active_pokemon.defense.value
            specialA = this.game.properties.battle.player.active_pokemon.special.value
            specialD = this.game.properties.battle.opponent.active_pokemon.special.value
            power = x
            stab = 1.5
            type1 = y
            type2 = z
            const randomMax = 1
            const randomMin = 217 / 255
            damageMax = ((((((2 * level / 5) + 2) * power * attack) / defense) / 50) + 2) * stab * type1 * type2 * randomMax
            damageMin = ((((((2 * level / 5) + 2) * power * attack) / defense) / 50) + 2) * stab * type1 * type2 * randomMin
            return damageMin.toString() + "-" + damageMax.toString()
        },
        
        gameTimeHMS(h, m, s) {
            if (h <= 0) {
                if (m <= 0) return `${s}`;
                if (s < 10) s = "0" + s.toString();
                return `${m}:${s}`;
            }
            if (s < 10) s = "0" + s.toString();
            if (m < 10) m = "0" + m.toString();
            return `${h}:${m}:${s}`;
        },
        
        
        //EXPERIENCE FUNCTIONS
        growthRate() {
            var growthRate = this.g5PokemonData[this.starter].growth_rate
            if (growthRate == "GROWTH_MEDIUM_SLOW") {
                return "Medium Slow"
            }
            else if (growthRate == "GROWTH_MEDIUM_FAST") {
                return "Medium Fast"
            }
            else if (growthRate == "GROWTH_FAST") {
                return "Fast"
            }
            else if (growthRate == "GROWTH_SLOW") {
                return "Slow"
            }
            else if (growthRate == "GROWTH_FLUCTUATING") {
                return "Fluctuating"
            }
            else if (growthRate == "GROWTH_ERRATIC") {
                return "Erratic"
            }
            else {
                return this.g5PokemonData[this.starter].growth_rate
            }
        },
        calcExpStats(growthRate, exp) {
            const progress = expProgress(growthRate, exp)
            // gen5's own guard: past level 100's threshold the bar shows empty, not "NaN%"
            if (isNaN(progress.percent)) progress.percent = 0
            return progress
        }, 

        // MOVE MANAGEMENT
        movePower(y, slot) { //y = move1.value, slot = 1..4 (for Trump Card's PP)
            if (y) {
                let pokemon_data = this.n_battle_data_fix
                let friendship = this.n_battle_data_fix_friendship.friendship.value
                const state = this.game.properties.meta.state.value
                var move = this.black_moves[y]
                if (y == "Return") {
                    if (friendship < 2.5)
                        var friendshipValue = 2.5 
                    else 
                        var friendshipValue = friendship
                    var specialMovePower = Math.floor(friendshipValue/2.5)
                    return specialMovePower
                }
                else if ((y == "Flail" || y == "Reversal") && state == 'Overworld') {
                    // The game's HP fractions, not rounded percentages (core/logic/movePower.ts)
                    return flailReversalPower(5, pokemon_data.stats.hp.value, pokemon_data.stats.hp_max.value) ?? "—"
                }
                else if ((y == "Flail" || y == "Reversal") && state == 'Battle') {
                    // The game's HP fractions, not rounded percentages (core/logic/movePower.ts)
                    return flailReversalPower(5, this.game.properties.battle.player.team[0].stats.hp.value, this.game.properties.battle.player.team[0].stats.hp_max.value) ?? "—"
                }
                else if ((y == "Water Spout" || y == "Eruption") && state == 'Overworld') {
                    var power = (150 * pokemon_data.stats.hp.value) / pokemon_data.stats.hp_max.value
                    if (power < 1) {
                        return 1
                    }
                    return Math.floor(power)
                }
                else if ((y == "Water Spout" || y == "Eruption") && state == 'Battle') {
                    var power = (150 * this.game.properties.battle.player.team[0].stats.hp.value) / this.game.properties.battle.player.team[0].stats.hp_max.value
                    if (power < 1) {
                        return 1
                    }
                    return Math.floor(power)
                }
                else if (y == "Frustration") {
                    if (pokemon_data.friendship.value > 252.5)
                        var friendshipValue = 252.5 
                    else 
                        var friendshipValue = pokemon_data.friendship.value
                    var specialMovePower = Math.floor((255-friendshipValue)/2.5)
                    return specialMovePower
                }
                else if (y == "Low Kick" || y == "Grass Knot") {
                    if (this.game.properties.meta.state.value == `Overworld` || this.game.properties.meta.state.value == `To Battle`) { return "—"}
                    const __opp_species = this.activeOpponent().species.value
                    const __opp_entry   = this.g5PokemonData[__opp_species]
                    const __opp_weight  = __opp_entry?.weight
                    if (typeof __opp_weight !== 'number' || !Number.isFinite(__opp_weight)) { return "—" }
                    if (__opp_weight < 10) { return 20 }
                    if (__opp_weight < 25) { return 40 }
                    if (__opp_weight < 50) { return 60 }
                    if (__opp_weight < 100) { return 80 }
                    if (__opp_weight < 200) { return 100 }
                    return 120
                }
                else if (y == "Hidden Power") {
                    return this.hiddenPowerPowerCalc(pokemon_data)
                }
                else if (y == "Facade" && ["Paralyzed", "Poisoned", "Burned", "Badly Poisoned"].includes(this.s1.status_condition.value)) { // toxic too
                    return move.power * 2
                }
                // Gyro Ball / Electro Ball from both turn-order Speeds (stages, paralysis, items...), as the
                // game's monSpeedValues (pokeplatinum BtlCmd_CalcGyroBallPower; Electro Ball gen5, from knowledge)
                else if (y == "Gyro Ball" || y == "Electro Ball") {
                    if (state != 'Battle') { return "—" }
                    const speeds = this.activeTurnOrderSpeeds()
                    const power = y == "Gyro Ball" ? gyroBallPower(speeds.player, speeds.enemy) : electroBallPower(speeds.player, speeds.enemy)
                    return power ?? "—"
                }
                // Heavy Slam / Heat Crash: the user's weight over the target's (gen5; no decomp; from knowledge)
                else if (y == "Heavy Slam" || y == "Heat Crash") {
                    if (state != 'Battle') { return "—" }
                    const user_species = this.game.properties.battle.player.active_pokemon.species?.value ?? this.starter
                    return heavySlamPower(this.g5PokemonData[user_species]?.weight, this.g5PokemonData[this.activeOpponent().species.value]?.weight) ?? "—"
                }
                // Wring Out / Crush Grip: from the target's HP (gen5; no decomp; from knowledge)
                else if (y == "Wring Out" || y == "Crush Grip") {
                    if (state != 'Battle') { return "—" }
                    const target = this.activeOpponent()
                    return wringOutPower(5, target.stats.hp?.value, target.stats.hp_max?.value) ?? "—"
                }
                // Stored Power: 20 + 20 per raised stage of the user, all seven stats (gen5; no decomp; from knowledge)
                else if (y == "Stored Power") {
                    if (state != 'Battle') { return 20 }
                    const stages = this.game.properties.battle.player.active_pokemon.modifiers
                    return storedPowerPower(['attack', 'defense', 'special_attack', 'special_defense', 'speed', 'accuracy', 'evasion'].map(stat => stages?.[stat]?.value))
                }
                // Trump Card: the PP left after this use, one PP or two against Pressure (pokeplatinum BtlCmd_CalcTrumpCardPower)
                else if (y == "Trump Card") {
                    const moves = this.n_battle_data_fix?.moves
                    const pp = state == 'Battle' ? moves?.[`move${slot}`]?.pp?.value : moves?.[slot - 1]?.pp?.value
                    if (pp == null) { return "—" }
                    const pressure = state == 'Battle' && this.game.properties.battle.opponent.team?.[this.game.properties.battle.opponent.party_position?.value]?.ability?.value == 'Pressure'
                    return trumpCardPower(Math.max(0, pp - (pressure ? 2 : 1))) ?? "—"
                }
                // Beat Up: one hit per healthy party member, 5 + its base Attack / 10 (gen5; no decomp; from knowledge)
                else if (y == "Beat Up") {
                    const team = this.game.properties.player.team
                    const count = this.game.properties.player.team_count?.value ?? 1
                    let total = 0
                    for (let i = 0; i < count; i++) {
                        const member = team?.[i]
                        if (!member?.species?.value || member.stats?.hp?.value == 0 || member.status_condition?.value != null) { continue }
                        const base_attack = this.g5PokemonData[member.species.value]?.base_stats?.attack
                        if (base_attack != null) { total += 5 + Math.floor(base_attack / 10) }
                    }
                    return total > 0 ? total : "—"
                }
                // Doubled against the active enemy's state (gen5; no decomp; from knowledge): Hex against any
                // status, Venoshock against poison, Brine at half HP or less (pokeplatinum effect script 221:
                // curHP <= maxHP / 2), Wake-Up Slap against sleep, SmellingSalt against paralysis, Payback when
                // the enemy moves first. The status is the party copy's (activeOpponentStatus).
                else if (state == 'Battle' && ["Hex", "Venoshock", "Brine", "Wake-Up Slap", "SmellingSalt", "Payback"].includes(y) && Number.isFinite(move?.power)) {
                    const target = this.activeOpponent()
                    const status = this.activeOpponentStatus()
                    let doubled = false
                    switch (y) {
                        case "Hex":          doubled = status != null; break
                        case "Venoshock":    doubled = status == "Poisoned" || status == "Badly Poisoned"; break
                        case "Brine":        doubled = Number(target.stats.hp?.value) <= Math.floor(Number(target.stats.hp_max?.value) / 2); break
                        case "Wake-Up Slap": doubled = status == "Asleep"; break
                        case "SmellingSalt": doubled = status == "Paralyzed"; break
                        case "Payback":      doubled = this.activeTurnOrder() < 0; break
                    }
                    return doubled ? move.power * 2 : move.power
                }
                else if (y == "Natural Gift") {
                    if (pokemon_data.held_item.value == null) { return "—" }
                    var held_item = pokemon_data.held_item.value
                    power = this.natural_gift[held_item]?.power ?? "—"
                    return power
                }
                // Punishment: 60 + 20 per raised stage of the target, all seven stats, at most 200
                // (pokeplatinum BtlCmd_CalcPunishmentPower; accuracy and evasion were left out)
                else if (y == "Punishment") {
                    if (state != 'Battle') { return 60 }
                    const stages = this.activeOpponent().modifiers
                    return punishmentPower(['attack', 'defense', 'special_attack', 'special_defense', 'speed', 'accuracy', 'evasion'].map(stat => stages?.[stat]?.value))
                }
                else if (y == "Fling") {
                    // was an undeclared assignment, a ReferenceError in the component's strict-mode script
                    return this.get_fling_power()
                }

                // Wise Glasses is in determineItemBoost

                if (move.power == "—") { return "—"}
                if (move.power == 0) { return "—"}
                if (move.power == 1) { return "—"}
                else
                    if (move) return move.power
            }
            return null
        },
        get_fling_power(held_item_2) {
            let pokemon_data = this.game.properties.player.team[0]
            const state = this.game.properties.meta.state.value
            if (state == 'Battle') {
                pokemon_data = this.n_battle_data_fix
            }
            const switch_item = pokemon_data.held_item.value
            switch (switch_item) {
                case "Master Ball"    : return "—";
                case "Ultra Ball"     : return "—";
                case "Great Ball"     : return "—";
                case "Poké Ball"      : return "—";
                case "Safari Ball"    : return "—";
                case "Ball"           : return "—";
                case "Dive Ball"      : return "—";
                case "Nest Ball"      : return "—";
                case "Repeat Ball"    : return "—";
                case "Timer Ball"     : return "—";
                case "Luxury Ball"    : return "—";
                case "Premier Ball"   : return "—";
                case "Dusk Ball"      : return "—";
                case "Heal Ball"      : return "—";
                case "Quick Ball"     : return "—";
                case "Cherish Ball"   : return "—";
                case "Potion"         : return 30;
                case "Antidote"       : return 30;
                case "Burn Heal"      : return 30;
                case "Ice Heal	Ice"  : return 30;
                case "Awakening"      : return 30;
                case "Paralyze Heal"  : return 30;
                case "Full Restore"   : return 30;
                case "Max Potion"     : return 30;
                case "Hyper Potion"   : return 30;
                case "Super Potion"   : return 30;
                case "Full Heal"      : return 30;
                case "Revive"         : return 30;
                case "Max Revive"     : return 30;
                case "Fresh Water"    : return 30;
                case "Soda Pop"       : return 30;
                case "Lemonade"       : return 30;
                case "Moomoo Milk"    : return 30;
                case "Energy Powder"  : return 30;
                case "Energy Root"    : return 30;
                case "Heal Powder"    : return 30;
                case "Revival Herb"   : return 30;
                case "Ether"          : return 30;
                case "Max Ether"      : return 30;
                case "Elixir"         : return 30;
                case "Max Elixir"     : return 30;
                case "Lava Cookie"    : return 30;
                case "Berry Juice"    : return 30;
                case "Sacred Ash"     : return 30;
                case "HP Up"          : return 30;
                case "Protein"        : return 30;
                case "Iron"           : return 30;
                case "Carbos"         : return 30;
                case "Calcium"        : return 30;
                case "Rare Candy"     : return 30;
                case "PP Up"          : return 30;
                case "Zinc"           : return 30;
                case "PP Max"         : return 30;
                case "Old Gateau"     : return 30;
                case "Guard Spec."    : return 30;
                case "Dire Hit"       : return 30;
                case "X Attack"       : return 30;
                case "X Defense"      : return 30;
                case "X Speed"        : return 30;
                case "X Accuracy"     : return 30;
                case "X Special"      : return 30;
                case "X Sp. Def"      : return 30;
                case "Poké Doll"      : return 30;
                case "Fluffy Tail"    : return 30;
                case "Blue Flute"     : return 30;
                case "Yellow Flute"   : return 30;
                case "Red Flute"      : return 30;
                case "Black Flute"    : return 30;
                case "White Flute"    : return 30;
                case "Shoal Salt"     : return 30;
                case "Shoal Shell"    : return 30;
                case "Red Shard"      : return 30;
                case "Blue Shard"     : return 30;
                case "Yellow Shard"   : return 30;
                case "Green Shard"    : return 30;
                case "Super Repel"    : return 30;
                case "Max Repel"      : return 30;
                case "Escape Rope"    : return 30;
                case "Repel"          : return 30;
                case "Sun Stone"      : return 30;
                case "Moon Stone"     : return 30;
                case "Fire Stone"     : return 30;
                case "Thunderstone"   : return 30;
                case "Water Stone"    : return 30;
                case "Leaf Stone"     : return 30;
                case "TinyMushroom"   : return 30;
                case "Big Mushroom"   : return 30;
                case "Pearl"          : return 30;
                case "Big Pearl"      : return 30;
                case "Stardust"       : return 30;
                case "Star Piece"     : return 30;
                case "Nugget"         : return 30;
                case "Heart Scale"    : return 30;
                case "Honey"          : return 30;
                case "Growth Mulch"   : return 30;
                case "Damp Mulch"     : return 30;
                case "Stable Mulch"   : return 30;
                case "Gooey Mulch"    : return 30;
                case "Root Fossil"    : return 100;
                case "Claw Fossil"    : return 100;
                case "Helix Fossil"   : return 100;
                case "Dome Fossil"    : return 100;
                case "Old Amber"      : return 100;
                case "Armor Fossil"   : return 100;
                case "Skull Fossil"   : return 100;
                case "Rare Bone"      : return 100;
                case "Shiny Stone"    : return 80;
                case "Dusk Stone"     : return 80;
                case "Dawn Stone"     : return 80;
                case "Oval Stone"     : return 80;
                case "Odd Keystone"   : return 80;
                case "Griseous Orb"   : return 60;
                case "Douse Drive"    : return 70;
                case "Shock Drive"    : return 70;
                case "Burn Drive"     : return 70;
                case "Chill Drive"    : return 70;
                case "Sweet Heart"    : return 30;
                case "Adamant Orb"    : return 60;
                case "Lustrous Orb"   : return 60;
                case "Greet Mail"     : return 0;
                case "Favored Mail"   : return 0;
                case "RSVP Mail"      : return 0;
                case "Thanks Mail"    : return 0;
                case "Inquiry Mail"   : return 0;
                case "Like Mail"      : return 0;
                case "Reply Mail"     : return 0;
                case "BridgeMail S"   : return 0;
                case "BridgeMail D"   : return 0;
                case "BridgeMail T"   : return 0;
                case "BridgeMail V"   : return 0;
                case "BridgeMail M"   : return 0;
                case "Cheri Berry"    : return 10;
                case "Chesto Berry"   : return 10;
                case "Pecha Berry"    : return 10;
                case "Rawst Berry"    : return 10;
                case "Aspear Berry"   : return 10;
                case "Leppa Berry"    : return 10;
                case "Oran Berry"     : return 10;
                case "Persim Berry"   : return 10;
                case "Lum Berry"      : return 10;
                case "Sitrus Berry"   : return 10;
                case "Figy Berry"     : return 10;
                case "Wiki Berry"     : return 10;
                case "Mago Berry"     : return 10;
                case "Aguav Berry"    : return 10;
                case "Iapapa Berry"   : return 10;
                case "Razz Berry"     : return 10;
                case "Bluk Berry"     : return 10;
                case "Nanab Berry"    : return 10;
                case "Wepear Berry"   : return 10;
                case "Pinap Berry"    : return 10;
                case "Pomeg Berry"    : return 10;
                case "Kelpsy Berry"   : return 10;
                case "Qualot Berry"   : return 10;
                case "Hondew Berry"   : return 10;
                case "Grepa Berry"    : return 10;
                case "Tamato Berry"   : return 10;
                case "Cornn Berry"    : return 10;
                case "Magost Berry"   : return 10;
                case "Rabuta Berry"   : return 10;
                case "Nomel Berry"    : return 10;
                case "Spelon Berry"   : return 10;
                case "Pamtre Berry"   : return 10;
                case "Watmel Berry"   : return 10;
                case "Durin Berry"    : return 10;
                case "Belue Berry"    : return 10;
                case "Occa Berry"     : return 10;
                case "Passho Berry"   : return 10;
                case "Wacan Berry"    : return 10;
                case "Rindo Berry"    : return 10;
                case "Yache Berry"    : return 10;
                case "Chople Berry"   : return 10;
                case "Kebia Berry"    : return 10;
                case "Shuca Berry"    : return 10;
                case "Coba Berry"     : return 10;
                case "Payapa Berry"   : return 10;
                case "Tanga Berry"    : return 10;
                case "Charti Berry"   : return 10;
                case "Kasib Berry"    : return 10;
                case "Haban Berry"    : return 10;
                case "Colbur Berry"   : return 10;
                case "Babiri Berry"   : return 10;
                case "Chilan Berry"   : return 10;
                case "Liechi Berry"   : return 10;
                case "Ganlon Berry"   : return 10;
                case "Salac Berry"    : return 10;
                case "Petaya Berry"   : return 10;
                case "Apicot Berry"   : return 10;
                case "Lansat Berry"   : return 10;
                case "Starf Berry"    : return 10;
                case "Enigma Berry"   : return 10;
                case "Micle Berry"    : return 10;
                case "Custap Berry"   : return 10;
                case "Jaboca Berry"   : return 10;
                case "Rowap Berry"    : return 10;
                case "BrightPowder"   : return 10; 
                case "White Herb"     : return 10;
                case "Macho Brace"    : return 60;
                case "Exp. Share"     : return 0;
                case "Quick Claw"     : return 80;
                case "Soothe Bell"    : return 10;
                case "Mental Herb"    : return 10;
                case "Choice Band"    : return 10;
                case "King's Rock"    : return 30;
                case "SilverPowder"   : return 10;
                case "Amulet Coin"    : return 30;
                case "Cleanse Tag"    : return 30;
                case "Soul Dew"       : return 30;
                case "DeepSeaTooth"   : return 90;
                case "DeepSeaScale"   : return 30;
                case "Smoke Ball"     : return 30;
                case "Everstone"      : return 30;
                case "Focus Band"     : return 10;
                case "Lucky Egg"      : return 30;
                case "Scope Lens"     : return 30;
                case "Metal Coat"     : return 30;
                case "Leftovers"      : return 10;
                case "Dragon Scale"   : return 30;
                case "Light Ball"     : return 30;
                case "Soft Sand"      : return 10;
                case "Hard Stone"     : return 100;
                case "Miracle Seed"   : return 30;
                case "BlackGlasses"   : return 30;
                case "Black Belt"     : return 30;
                case "Magnet"         : return 30;
                case "Mystic Water"   : return 30;
                case "Sharp Beak"     : return 50;
                case "Poison Barb"    : return 80;
                case "NeverMeltIce"   : return 30;
                case "Spell Tag"      : return 30;
                case "TwistedSpoon"   : return 30;
                case "Charcoal"       : return 30;
                case "Dragon Fang"    : return 70;
                case "Silk Scarf"     : return 10;
                case "Up-Grade"       : return 30;
                case "Shell Bell"     : return 30;
                case "Sea Incense"    : return 10;
                case "Lax Incense"    : return 10;
                case "Lucky Punch"    : return 40;
                case "Metal Powder"   : return 10;
                case "Thick Club"     : return 90;
                case "Stick"          : return "ERR";
                case "Red Scarf"      : return 0;
                case "Blue Scarf"     : return 0;
                case "Pink Scarf"     : return 0;
                case "Green Scarf"    : return 0;
                case "Yellow Scarf"   : return 0;
                case "Wide Lens"      : return 10;
                case "Muscle Band"    : return 10;
                case "Wise Glasses"   : return 10;
                case "Expert Belt"    : return 10;
                case "Light Clay"     : return 30;
                case "Life Orb"       : return 30;
                case "Power Herb"     : return 10;
                case "Toxic Orb"      : return 30;
                case "Flame Orb"      : return 30;
                case "Quick Powder"   : return 10;
                case "Focus Sash"     : return 10;
                case "Zoom Lens"      : return 10;
                case "Metronome"      : return 30;
                case "Iron Ball"      : return 130;
                case "Lagging Tail"   : return 10;
                case "Destiny Knot"   : return 10;
                case "Black Sludge"   : return 30;
                case "Rock"           : return 10;
                case "Smooth Rock"    : return 10;
                case "Heat Rock"      : return 60;
                case "Damp Rock"      : return 60;
                case "Grip Claw"      : return 90;
                case "Choice Scarf"   : return 10;
                case "Sticky Barb"    : return 80;
                case "Power Bracer"   : return 70;
                case "Power Belt"     : return 70;
                case "Power Lens"     : return 70;
                case "Power Band"     : return 70;
                case "Power Anklet"   : return 70;
                case "Power Weight"   : return 70;
                case "Shed Shell"     : return 10;
                case "Big Root"       : return 10;
                case "Choice Specs"   : return 10;
                case "Flame Plate"    : return 90;
                case "Splash Plate"   : return 90;
                case "Zap Plate"      : return 90;
                case "Meadow Plate"   : return 90;
                case "Icicle Plate"   : return 90;
                case "Fist Plate"     : return 90;
                case "Toxic Plate"    : return 90;
                case "Earth Plate"    : return 90;
                case "Sky Plate"      : return 90;
                case "Mind Plate"     : return 90;
                case "Insect Plate"   : return 90;
                case "Stone Plate"    : return 90;
                case "Spooky Plate"   : return 90;
                case "Draco Plate"    : return 90;
                case "Dread Plate"    : return 90;
                case "Iron Plate"     : return 90;
                case "Odd Incense"    : return 10;
                case "Rock Incense"   : return 10;
                case "Full Incense"   : return 10;
                case "Wave Incense"   : return 10;
                case "Rose Incense"   : return 10;
                case "Luck Incense"   : return 10;
                case "Pure Incense"   : return 10;
                case "Protector"      : return 80;
                case "Electirizer"    : return 80;
                case "Magmarizer"     : return 80;
                case "Dubious Disc"   : return 50;
                case "Reaper Cloth"   : return 10;
                case "Razor Claw"     : return 80;
                case "Razor Fang"     : return 30;
                case "TM01"           : return 0;
                case "TM02"           : return 0;
                case "TM03"           : return 0;
                case "TM04"           : return 0;
                case "TM05"           : return 0;
                case "TM06"           : return 0;
                case "TM07"           : return 0;
                case "TM08"           : return 0;
                case "TM09"           : return 0;
                case "TM10"           : return 0;
                case "TM11"           : return 0;
                case "TM12"           : return 0;
                case "TM13"           : return 0;
                case "TM14"           : return 0;
                case "TM15"           : return 0;
                case "TM16"           : return 0;
                case "TM17"           : return 0;
                case "TM18"           : return 0;
                case "TM19"           : return 0;
                case "TM20"           : return 0;
                case "TM21"           : return 0;
                case "TM22"           : return 0;
                case "TM23"           : return 0;
                case "TM24"           : return 0;
                case "TM25"           : return 0;
                case "TM26"           : return 0;
                case "TM27"           : return 0;
                case "TM28"           : return 0;
                case "TM29"           : return 0;
                case "TM30"           : return 0;
                case "TM31"           : return 0;
                case "TM32"           : return 0;
                case "TM33"           : return 0;
                case "TM34"           : return 0;
                case "TM35"           : return 0;
                case "TM36"           : return 0;
                case "TM37"           : return 0;
                case "TM38"           : return 0;
                case "TM39"           : return 0;
                case "TM40"           : return 0;
                case "TM41"           : return 0;
                case "TM42"           : return 0;
                case "TM43"           : return 0;
                case "TM44"           : return 0;
                case "TM45"           : return 0;
                case "TM46"           : return 0;
                case "TM47"           : return 0;
                case "TM48"           : return 0;
                case "TM49"           : return 0;
                case "TM50"           : return 0;
                case "TM51"           : return 0;
                case "TM52"           : return 0;
                case "TM53"           : return 0;
                case "TM54"           : return 0;
                case "TM55"           : return 0;
                case "TM56"           : return 0;
                case "TM57"           : return 0;
                case "TM58"           : return 0;
                case "TM59"           : return 0;
                case "TM60"           : return 0;
                case "TM61"           : return 0;
                case "TM62"           : return 0;
                case "TM63"           : return 0;
                case "TM64"           : return 0;
                case "TM65"           : return 0;
                case "TM66"           : return 0;
                case "TM67"           : return 0;
                case "TM68"           : return 0;
                case "TM69"           : return 0;
                case "TM70"           : return 0;
                case "TM71"           : return 0;
                case "TM72"           : return 0;
                case "TM73"           : return 0;
                case "TM74"           : return 0;
                case "TM75"           : return 0;
                case "TM76"           : return 0;
                case "TM77"           : return 0;
                case "TM78"           : return 0;
                case "TM79"           : return 0;
                case "TM80"           : return 0;
                case "TM81"           : return 0;
                case "TM82"           : return 0;
                case "TM83"           : return 0;
                case "TM84"           : return 0;
                case "TM85"           : return 0;
                case "TM86"           : return 0;
                case "TM87"           : return 0;
                case "TM88"           : return 0;
                case "TM89"           : return 0;
                case "TM90"           : return 0;
                case "TM91"           : return 0;
                case "TM92"           : return 0;
                case "HM01"           : return 0;
                case "HM02"           : return 0;
                case "HM03"           : return 0;
                case "HM04"           : return 0;
                case "HM05"           : return 0;
                case "HM06"           : return 0;
                case "Explorer Kit"   : return 0;
                case "Loot Sack"      : return 0;
                case "Rule Book"      : return 0;
                case "Poké Radar"     : return 0;
                case "Point Card"     : return 0;
                case "Journal"        : return 0;
                case "Seal Case"      : return 0;
                case "Fashion Case"   : return 0;
                case "Seal Bag"       : return 0;
                case "Pal Pad	Pal"  : return 0;
                case "Works Key"      : return 0;
                case "Old Charm"      : return 0;
                case "Galactic Key"   : return 0;
                case "Red Chain"      : return 0;
                case "Town Map"       : return 0;
                case "Vs. Seeker"     : return 0;
                case "Coin Case"      : return 0;
                case "Old Rod"        : return 0;
                case "Good Rod"       : return 0;
                case "Super Rod"      : return 0;
                case "Sprayduck"      : return 0;
                case "Poffin Case"    : return 0;
                case "Bicycle"        : return 0;
                case "Suite Key"      : return 0;
                case "Oak's Letter"   : return 0;
                case "Lunar Wing"     : return 0;
                case "Member Card"    : return 0;
                case "Azure Flute"    : return 0;
                case "S.S. Ticket"    : return 0;
                case "Contest Passho" : return 0;
                case "Magma Stone"    : return 0;
                case "Parcel"         : return 0;
                case "Coupon 1"       : return 0;
                case "Coupon 2"       : return 0;
                case "Coupon 3"       : return 0;
                case "Storage Key"    : return 0;
                case "Secret Potion"  : return 0;
                case "Vs. Recorder"   : return 0;
                case "Gracidea"       : return 0;
                case "Secret Key"     : return 0;
                case "Apricorn Box"   : return 0;
                case "Unown Report"   : return 0;
                case "Berry Pots"     : return 0;
                case "Dowsing MCHN"   : return 0;
                case "Blue Card"      : return 0;
                case "Slowpoke Tail"  : return 0;
                case "Clear Bell"     : return 0;
                case "Card Key"       : return 0;
                case "Basement Key"   : return 0;
                case "Squirt Bottle"  : return 0;
                case "Red Scale"      : return 0;
                case "Lost Item"      : return 0;
                case "Pass"           : return 0;
                case "Machine Part"   : return 0;
                case "Silver Wing"    : return 0;
                case "Rainbow Wing"   : return 0;
                case "Mystery Egg"    : return 0;
                case "Red Apricorn"   : return 0;
                case "Blu Apricorn"   : return 0;
                case "Ylw Apricorn"   : return 0;
                case "Grn Apricorn"   : return 0;
                case "Pnk Apricorn"   : return 0;
                case "Wht Apricorn"   : return 0;
                case "Blk Apricorn"   : return 0;
                case "Fast Ball"      : "—";
                case "Level Ball"     : "—";
                case "Lure Ball"      : "—";
                case "Heavy Ball"     : "—";
                case "Love Ball"      : "—";
                case "Friend Ball"    : "—";
                case "Moon Ball"      : "—";
                case "Sport Ball"     : "—";
                case "Park Ball"      : "—";
                case "Photo Album"    : return 0;
                case "GB Sounds"      : return 0;
                case "Tidal Bell"     : return 0;
                case "RageCandyBar"   : return 30;
                case "Data Card 01"   : return 0;
                case "Data Card 02"   : return 0;
                case "Data Card 03"   : return 0;
                case "Data Card 04"   : return 0;
                case "Data Card 05"   : return 0;
                case "Data Card 06"   : return 0;
                case "Data Card 07"   : return 0;
                case "Data Card 08"   : return 0;
                case "Data Card 09"   : return 0;
                case "Data Card 10"   : return 0;
                case "Data Card 11"   : return 0;
                case "Data Card 12"   : return 0;
                case "Data Card 13"   : return 0;
                case "Data Card 14"   : return 0;
                case "Data Card 15"   : return 0;
                case "Data Card 16"   : return 0;
                case "Data Card 17"   : return 0;
                case "Data Card 18"   : return 0;
                case "Data Card 19"   : return 0;
                case "Data Card 20"   : return 0;
                case "Data Card 21"   : return 0;
                case "Data Card 22"   : return 0;
                case "Data Card 23"   : return 0;
                case "Data Card 24"   : return 0;
                case "Data Card 25"   : return 0;
                case "Data Card 26"   : return 0;
                case "Data Card 27"   : return 0;
                case "Jade Orb"       : return 0;
                case "Lock Capsule"   : return 0;
                case "Red Orb IV"     : return 0;
                case "Blue Orb IV"    : return 0;
                case "Enigma Stone"   : return 0;
                case "Prism Scale"    : return 30;
                case "Eviolite"       : return 40;
                case "Float Stone"    : return 30;
                case "Rocky Helmet"   : return 60;
                case "Air Balloon"    : return 10;
                case "Red Card"       : return 10;
                case "Ring Target"    : return 10;
                case "Binding Band"   : return 30;
                case "Absorb Bulb"    : return 30;
                case "Cell Battery"   : return 30;
                case "Eject Button"   : return 30;
                case "Fire Gem"       : return 0;
                case "Water Gem"      : return 0;
                case "Electric Gem"   : return 0;
                case "Grass Gem"      : return 0;
                case "Ice Gem"        : return 0;
                case "Fighting Gem"   : return 0;
                case "Poison Gem"     : return 0;
                case "Ground Gem"     : return 0;
                case "Flying Gem"     : return 0;
                case "Psychic Gem"    : return 0;
                case "Bug Gem"        : return 0;
                case "Rock Gem"       : return 0;
                case "Ghost Gem"      : return 0;
                case "Dragon Gem"     : return 0;
                case "Dark Gem"       : return 0;
                case "Steel Gem"      : return 0;
                case "Normal Gem"     : return 0;
                case "Health Wing"    : return "ERR";
                case "Muscle Wing"    : return "ERR";
                case "Resist Wing"    : return "ERR";
                case "Genius Wing"    : return "ERR";
                case "Clever Wing"    : return "ERR";
                case "Swift Wing"     : return "ERR";
                case "Pretty Wing"    : return "ERR";
                case "Cover Fossil"   : return 100;
                case "Plume Fossil"   : return 100;
                case "Liberty Pass"   : return 0;
                case "Pass Orb"       : return 0;
                case "Dream Ball"     : return 0;
                case "Poké Toy"       : return 0;
                case "Prop Case"      : return 0;
                case "Dragon Skull"   : return 0;
                case "Balm Mushroom"  : return 30;
                case "Big Nugget"     : return 30;
                case "Pearl String"   : return 30;
                case "Comet Shard"    : return 30;
                case "Relic Copper"   : return 30;
                case "Relic Silver"   : return 30;
                case "Relic Gold"     : return 30;
                case "Relic Vase"     : return 30;
                case "Relic Band"     : return 30;
                case "Relic Statue"   : return 30;
                case "Relic Crown"    : return 30;
                case "Casteliacone"   : return 30;
                case "Dire Hit"       : return 30;
                case "X Speed"        : return 30;
                case "X Special"      : return 30;
                case "X Sp. Def"      : return 30;
                case "X Defend"       : return 30;
                case "X Attack"       : return 30;
                case "X Accuracy"     : return 30;
                case "X Speed"        : return 30;
                case "X Special"      : return 30;
                case "X Sp. Def"      : return 30;
                case "X Defend"       : return 30;
                case "X Attack"       : return 30;
                case "X Accuracy"     : return 30;
                case "X Speed"        : return 30;
                case "X Special"      : return 30;
                case "X Sp. Def"      : return 30;
                case "X Defend"       : return 30;
                case "X Attack"       : return 30;
                case "X Accuracy"     : return 30;
                case "Ability Urge"   : return 0;
                case "Item Drop"      : return 0;
                case "Item Urge"      : return 0;
                case "Reset Urge"     : return 0;
                case "Dire Hit 3"     : return 0;
                case "Light Stone"    : return 0;
                case "Dark Stone"     : return 0;
                case "TM93"           : return 0;
                case "TM94"           : return 0;
                case "TM95"           : return 0;
                case "Xtransceiver"   : return 0;
                case "God Stone"      : return 0;
                case "Gram 1"         : return 0;
                case "Gram 2"         : return 0;
                case "Gram 3"         : return 0;
                case "Xtransceiver"   : return 0;
                case "Medal Box"      : return 0;
                case "DNA Splicers"   : return 0;
                case "DNA Splicers"   : return 0;
                case "Permit"         : return 0;
                case "Oval Charm"     : return 0;
                case "Shiny Charm"    : return 0;
                case "Plasma Card"    : return 0;
                case "Grubby Hanky"   : return 0;
                case "Colress Machine": return 0;
                case "Dropped Item"   : return 0;
                case "Dropped Item"   : return 0;
                case "Reveal Glass"   : return 0;
                default: return 0;
            }
        },
        moveCategory(move) { //move = move.value
            if (move) {
                var move = this.black_moves[move]
                if (move) return move.category
            }
            return ""
        },
        moveCategoryIcon(move) { //move = move.value
            if (move) {
                var move = this.black_moves[move]
                if (move) return `images/gen5/damageCategory/${move.category}.webp`
            }
            return ""
        },
        movepoolPower(moveObject) {
            if (this.game.properties.meta.state.value == "No Pokemon") {
                return moveObject.power
            }
            if (rowMove(moveObject) == `Hidden Power`) {
                return this.hiddenPowerPowerCalc(this.game.properties.player.team[0])
            }
            if (rowMove(moveObject) == `Return`) {
                // if (this.game.properties.battle.player.team_count.value == 0) {
                //     return "-"
                // }
                return this.g3ReturnPowerCalc(this.game.properties.player.team[0])
            }
            if (rowMove(moveObject) == `Frustration`) {
                // if (this.game.properties.battle.player.team_count.value == 0) {
                //     return "-"
                // }
                return this.g3FrustrationPowerCalc(this.game.properties.player.team[0])
            }
            else { return moveObject.power }
        },
        /**
         * Puts the current spread into set_starter_stats_object, which write_byte_data stamps on
         * the starter at level 5. Called by the Hidden Power, mode and field watchers, and after
         * a starter's settings load -- the watchers alone missed a stored choice equal to the
         * one already on screen.
         */
        apply_starter_ivs() {
            this.set_starter_stats_object.ivs = this.starter_ivs()
        },
        movepoolTypeColor(moveObject) {
            if (rowMove(moveObject) == `Hidden Power` && this.game.properties.meta.state.value == "No Pokemon") {
                return this.starterHiddenPowerType
            }
            if (rowMove(moveObject) == `Hidden Power` && this.game.properties.meta.state.value != "No Pokemon") {
                return this.hiddenPowerTypeCalc(this.game.properties.player.team[0])
            }
            if (this.game.properties.meta.state.value == "No Pokemon") {
                return moveObject.type
            }
            if (rowType(moveObject) == `Curse`) {
                return "Curse"
            }
            return moveObject.type
        },
        movepoolType(moveObject) {
            if (rowMove(moveObject) == `Hidden Power` && this.game.properties.meta.state.value == "No Pokemon") {
                return this.starterHiddenPowerType
            }
            if (rowMove(moveObject) == `Hidden Power` && this.game.properties.meta.state.value != "No Pokemon") {
                return this.hiddenPowerTypeCalc(this.game.properties.player.team[0])
            }
            if (this.game.properties.meta.state.value == "No Pokemon") {
                return moveObject.type
            }
            if (rowType(moveObject) == `Curse`) {
                return "???"
            }
            if (rowMove(moveObject) == `Hidden Power`) {
                return this.starterHiddenPowerType
            }
            return moveObject.type
        },
        weatherModifier(weather, move, moveType, player_ability) {
            if (weather == "Sun" && moveType == "Water") {
                return .5
            }
            else if (weather == "Sun" && moveType == "Fire") {
                return 1.5
            }
            else if (weather == "Rain" && moveType == "Water") {
                return 1.5
            }
            else if (weather == "Rain" && moveType == "Fire") {
                return .5
            }
            else if (weather == "Rain" && move == "SolarBeam") {
                return .5
            }
            else if (weather == "Sandstorm") {
                return 1
            }
            else if (weather == "Sandstorm" && player_ability == "Sand Force") {
                if (moveType == "Rock" || moveType == "Ground" || moveType == "Steel") {
                    return 1.3
                }
                return 1
            }
            else {
                return 1
            }
        },
        moveType(y) { //y = move1.value
            if (y == "Hidden Power") {
                var move = this.hiddenPowerTypeCalc(this.game.properties.player.team[0])
                return move
            }
            else if (y != null && y == "Weather Ball") {
                if (this.batt.field.weather.value == `Sun`) {
                    return "Fire" }
                if (this.batt.field.weather.value == `Sandstorm`) {
                    return "Rock" }
                if (this.batt.field.weather.value == `Rain`) {
                    return "Water" }
                if (this.batt.field.weather.value == `Hail`) {
                    return "Ice" }
                return "Normal"
            }
            else if (y == 'Natural Gift') {
                if (this.game.properties.player.team[0].held_item.value == null) { return "Normal" }
                var held_item = this.game.properties.player.team[0].held_item.value
                return this.natural_gift[held_item]?.type ?? "Normal"
            }
            else if (y == 'Techno Blast') {
                let held_item = this.game.properties.player.team[0].held_item.value
                let species = this.game.properties.player.team[0].species.value
                if (species == "Genesect") {
                    switch (held_item) {
                        case "Shock Drive": return "Electric"; break;
                        case "Burn Drive":  return "Fire"; break;
                        case "Chill Drive": return "Ice"; break;
                        case "Douse Drive": return "Water"; break;
                        default: return "Normal"; break;
                    }
                }
                else {
                    return "Normal"
                }
            }
            else if (y) {
                var move = this.black_moves[y]
                if (move) return move.type
            }
            return null
        },
        

        //y = mod stage, x = stat value
        stageMultiplier(y,x) { 
            // if (this.game.properties.battle.turnInfo.battleOutcome.bytes == 0 && y != 0 && y != null && y != undefined && this.game.properties.battle.yourPokemon.species != null) {
            if (this.game.properties.meta.state.value == "Battle") {
                var multiplier = this.stageModifiersData.find(x => x.modType === "stat")
                var statValue = Math.floor(x * multiplier[y.toString()])
                // if (statValue > 999) {
                //     return 999
                // }
                // else
                //     return statValue
                return statValue
            }
            else
                return x    
        },
        
        //x = stat modifier property (not the value of the property. [ex. battle.modStageAttack])
        // statLabelOpacity(modifier) {
        //     if (this.game.properties.player.team[0].internals.personality_value.value == null)
        //         return
        //     else if (this.game.properties.meta.state.value == "Battle" && this.game.properties.battle.outcome.value == null)
        //         if (modifier.value != 0)
        //             return `opacity: ${this.statLabelOpacityValue};`
        //     else
        //         return
        // },
        enemyStatLabelOpacity(modifier, slot) {
            return `opacity: ${this.statLabelOpacityValue};`
            if (this.game.properties.battle.opponent.party_position.value == slot) {
                if (this.game.properties.battle.opponent.team[0].internals.personality_value.value == null)
                    return
                else if (this.game.properties.meta.state.value == "Battle") {
                    if (modifier.value != 0)
                        return `opacity: ${this.statLabelOpacityValue};`
                }
            }
            else
                return
        },
        enemyStatusLabelOpacity(status, slot) {
            return `opacity: ${this.statLabelOpacityValue};`
            if (this.game.properties.battle.opponent.party_position.value == slot) {
                if (this.game.properties.battle.opponent.team[0].internals.personality_value.value == null)
                    return
                else if (this.game.properties.meta.state.value == "Battle") {
                    if (status.bytes != 0x00)
                        return `opacity: ${this.statLabelOpacityValue};`
                }
            }
            else
                return
        },
        hiddenPowerTypeCalc(slot) {
            let ivHpBit  = slot.ivs.hp.value
            let ivAtkBit = slot.ivs.attack.value
            let ivDefBit = slot.ivs.defense.value
            let ivSpeBit = slot.ivs.speed.value
            let ivSpABit = slot.ivs.special_attack.value
            let ivSpDBit = slot.ivs.special_defense.value
            ivHpBit  = this.getLSB(ivHpBit)
            ivAtkBit = this.getLSB(ivAtkBit)
            ivDefBit = this.getLSB(ivDefBit)
            ivSpeBit = this.getLSB(ivSpeBit)
            ivSpABit = this.getLSB(ivSpABit)
            ivSpDBit = this.getLSB(ivSpDBit)
            type = this.hiddenPowerTypes[(Math.floor(((ivHpBit + (2 * ivAtkBit) + (4 * ivDefBit) + (8 * ivSpeBit) + (16 * ivSpABit) + (32 * ivSpDBit)) * 5)/21))]
            return type
        },
        hiddenPowerPowerCalc(slot) {
            let ivHpBit  = slot.ivs.hp.value
            let ivAtkBit = slot.ivs.attack.value
            let ivDefBit = slot.ivs.defense.value
            let ivSpeBit = slot.ivs.speed.value
            let ivSpABit = slot.ivs.special_attack.value
            let ivSpDBit = slot.ivs.special_defense.value
            if (![ivHpBit, ivAtkBit, ivDefBit, ivSpeBit, ivSpABit, ivSpDBit].every(Number.isFinite)) { return "—" }
            ivHpBit  = this.getSecondLSB(ivHpBit)
            ivAtkBit = this.getSecondLSB(ivAtkBit)
            ivDefBit = this.getSecondLSB(ivDefBit)
            ivSpeBit = this.getSecondLSB(ivSpeBit)
            ivSpABit = this.getSecondLSB(ivSpABit)
            ivSpDBit = this.getSecondLSB(ivSpDBit)
            basePower = Math.floor((((ivHpBit + (2 * ivAtkBit) + (4 * ivDefBit) + (8 * ivSpeBit) + (16 * ivSpABit) + (32 * ivSpDBit)) * 40)/63) + 30 )
            return basePower
        },
        determineSTAB(x, attackingType) { //x = move1.value, attackingType = the move's type after Normalize
            var pkmnType1 = this.g5PokemonData[this.starter].type_1
            var pkmnType2 = this.g5PokemonData[this.starter].type_2
            if (this.starter == 'Arceus') {
                pkmnType1 = this.arceus_plate_check()
            }
            // In battle, the battler's own types (Zen Mode, Soak, Reflect Type, Color Change, Conversion)
            if (this.game.properties.meta.state.value == 'Battle') {
                const battler = this.game.properties.battle.player.active_pokemon
                if (battler?.type_1?.value) {
                    pkmnType1 = battler.type_1.value
                    pkmnType2 = battler.type_2?.value ?? pkmnType1
                }
            }
            var moveType  = attackingType ?? this.moveType(x)
            if (pkmnType1 == moveType || pkmnType2 == moveType)
                return 1.5
            else
                return 1
        }, 
        determineItemBoost(x, pkmn_object) { //x - move1.value
            if (pkmn_object.species.value == null) { return }
            if (pkmn_object.ability.value == 'Klutz') {
                return 1
            }
            var heldItemValue = pkmn_object.held_item?.value
            var itemType = this.typeBoostingItems[heldItemValue]
            var move_category = this.moveCategory(x)
            var modifier = 1
            if (itemType == this.moveType(x)) {
                modifier = 1.2
            }
            // A Gem boosts only moves of its own type ("Fire Gem" -> Fire), 1.5x, and is used up
            if (heldItemValue?.endsWith(" Gem") && heldItemValue.slice(0, -4) == this.moveType(x)) {
                modifier = 1.5
            }
            if (move_category == "Special" && heldItemValue == "Wise Glasses") {
                modifier = 1.1
            }
            if (move_category == "Physical" && heldItemValue == "Muscle Band") {
                modifier = 1.1
            }
            if (heldItemValue == "Life Orb") {
                modifier = 1.3
            }
            return modifier
        },
        abilityModifier(ability, attackingType, controller) {
            const state = this.game.properties.meta.state.value
            var healthPercentage = 0
            if (controller == 'player' && (state != 'Battle' || state != 'From Battle')) { 
                healthPercentage = this.game.properties.player.team[0].stats.hp / this.game.properties.player.team[0].stats.hp_max
            }
            else {
                healthPercentage = this.game.properties.battle[controller].active_pokemon.stats.hp / this.game.properties.battle[controller].active_pokemon.stats.hp_max
            }
            // curHP <= maxHP / 3 (pokeplatinum BattleSystem_CalcMoveDamage); was 0.3, which left out 30-33%
            if (healthPercentage <= 1/3) {
                if (ability == `Torrent` && attackingType == `Water`) {
                    return 1.5
                }
                else if (ability == `Blaze` && attackingType == `Fire`) {
                    return 1.5
                }
                else if (ability == `Overgrow` && attackingType == `Grass`) {
                    return 1.5
                }
                else if (ability == `Swarm` && attackingType == `Bug`) {
                    return 1.5
                }
                else {
                    return 1
                }
            }
            else {
                return 1
            }
        },
        burnModifier(x) {
            if (this.game.properties.meta.state.value == "No Pokemon") { return 1 }
            var attackingCategory = this.moveCategory(x)
            if (attackingCategory == "Physical" && (this.solo_mon.status_condition?.value ?? this.game.properties.player.team[0].status_condition?.value) == `Burned` && this.game.properties.player.team[0].ability?.value != `Guts`) {
                return 0.5
                }
            else {
                return 1
            }
        },
        enemy_move_power(move_name, enemy_mon) { //y = move1.value
            const state = this.game.properties.meta.state.value
            if (state != 'Battle') { return }
            if (move_name) {
                var move = this.generation4_moves_new[move_name]
                if (move_name == "Return") {
                    if (enemy_mon.friendship.value < 2.5)
                        var friendshipValue = 2.5 
                    else 
                        var friendshipValue = enemy_mon.friendship.value
                    var specialMovePower = Math.floor(friendshipValue/2.5)
                    return specialMovePower
                }
                else if (move_name == "Flail" || move_name == "Reversal") {
                    // The game's HP fractions, not rounded percentages (core/logic/movePower.ts)
                    return flailReversalPower(5, enemy_mon.hp.value, enemy_mon.hp_max.value) ?? "—"
                }
                else if (move_name == "Water Spout" || move_name == "Eruption") {
                    var power = (150 * enemy_mon.hp.value) / enemy_mon.hp_max.value
                    if (power < 1) {
                        return 1
                    }
                    return Math.floor(power)
                }
                else if (move_name == "Frustration") {
                    if (enemy_mon.friendship.value > 252.5)
                        var friendshipValue = 252.5 
                    else 
                        var friendshipValue = enemy_mon.friendship.value
                    var specialMovePower = Math.floor((255-friendshipValue)/2.5)
                    return specialMovePower
                }
                else if (move_name == "Low Kick" || move_name == "Grass Knot") {
                    if (this.game.properties.meta.state.value == `Overworld` || this.game.properties.meta.state.value == `To Battle`) { return "—"}
                    const __plr_species = this.game.properties.battle.player.active_pokemon.species.value
                    const __plr_entry   = this.g5PokemonData[__plr_species]
                    const __plr_weight  = __plr_entry?.weight
                    console.log("[LowKick/GrassKnot ENEMY-side DEBUG]", { move: move_name, species: __plr_species, entryFound: !!__plr_entry, weight: __plr_weight, typeofWeight: typeof __plr_weight })
                    if (__plr_weight < 10) { return 20 }
                    if (__plr_weight < 25) { return 40 }
                    if (__plr_weight < 50) { return 60 }
                    if (__plr_weight < 100) { return 80 }
                    if (__plr_weight < 200) { return 100 }
                    if (__plr_weight >= 200) { return 120 }
                }
                else if (move_name == "Hidden Power") {
                    return this.hiddenPowerPowerCalc(enemy_mon)
                }
                else if (move_name == "Facade" && ["Paralyzed", "Poisoned", "Burned", "Badly Poisoned"].includes(enemy_mon.status_condition.value)) { // toxic too
                    return move.power * 2
                }
                else if (move_name == "Gyro Ball") {
                    const target_speed = this.game.properties.battle.player.active_pokemon.stats.speed.value
                    const user_speed = this.game.properties.battle.opponent.active_pokemon.stats.speed.value
                    var base_power = Math.min(((25 * target_speed) / user_speed) + 1)
                    if (base_power > 150) { base_power = 150 }
                    return base_power
                }
                if (move.power == "—") { return "—"}
                if (move.power == 0) { return "—"}
                else
                    if (move) return move.power
            }
            return null
        },
        enemy_effective_power(move_name, enemy_mon, slot) {
            if (this.game.properties.meta.state.value != 'Battle' || this.game.properties.meta.state.value != 'From Battle') { return }
            if (enemy_mon.species?.value == null) { return }
            switch(move_name) {
                case "Curse": return "—";
                case null: return;
                case undefined: return;
            }
            const species = enemy_mon.species.value
            const move_data = this.generation4_moves_new[move_name]
            const move_type = move_data.type
            const move_base_power = this.enemy_move_power(move_name, enemy_mon) ?? move_data.power
            if (move_base_power == 1) { return "—" }
            const move_category = move_data.category
            const user_type_1 = this.g5PokemonData[species].type_1
            const user_type_2 = this.g5PokemonData[species].type_2
            const target_type_1 = this.game.properties.battle.player.active_pokemon.type_1.value
            const target_type_2 = this.game.properties.battle.player.active_pokemon.type_2.value
            if (move_base_power == "—" || move_base_power == "-") { return "—" }
            var move_effective_power = move_base_power
            var modifier_effectiveness_1 = this.typeData.find(x => x.moveType == move_type)[target_type_1]
            var modifier_effectiveness_2 = target_type_2 && move_type && (target_type_1 != target_type_2) ? this.typeData.find(x => x.moveType == move_type)[target_type_2]
                : 1
            var modifier_stab = move_type == user_type_1 ? 1.5 
                : move_type == user_type_2 ? 1.5 
                : 1
            var modifier_ability = this.abilityModifier(this.game.properties.battle.opponent.active_pokemon.ability.value, move_type, 'opponent')
            // Mold Breaker, Teravolt and Turboblaze ignore the target's ability
            if (this.game.properties.battle.player.active_pokemon.ability.value == 'Levitate' && move_type == 'Ground' && !['Mold Breaker', 'Teravolt', 'Turboblaze'].includes(enemy_mon.ability?.value)) {
                modifier_ability = 0 
            }
            var modifier_item = this.determineItemBoost(move_name, enemy_mon)
            var modifier_weather = this.weatherModifier(this.game.properties.battle.field.weather.value, move_name, move_type)
            var modifier_burn = 1
            if (move_category == "Physical" && enemy_mon.status_condition?.value == `Burned` && enemy_mon.ability?.value != `Guts`) {
                modifier_burn = 0.5
                }
            else {
                modifier_burn = 1
            }
            //Calculate effective power
            if (this.typeCalcs == true && this.game.properties.meta.state.value == "Battle") { //Handles type effectiveness calculations in battle
                return Math.floor(move_base_power * modifier_stab * modifier_effectiveness_1 * modifier_effectiveness_2 * modifier_ability * modifier_item * modifier_weather * modifier_burn)
            }
        },
        typeEffectiveness(x, slot) { //x = move1.value
            if (this.game.properties.meta.state.value == "From Battle") {
                return this[`move_fix_power_${slot}`]
            }
            const state = this.game.properties.meta.state.value
            const species = this.starter
            var enemy_party_position = this.game.properties.battle.opponent.party_position.value
            var enemy_pokemon_data = this.game.properties.battle.opponent.pkmn_ram[`pokemon_${enemy_party_position}_ram`]

            if (x == "Curse") {
                return "—"
            }
            if (x == null || x == undefined || x == "") {
                return
            }
            var attackingType = this.moveType(x)
            var power = this.movePower(x, slot)
            var defendingType1 = enemy_pokemon_data?.type_1?.value ?? "Normal"
            var defendingType2 = enemy_pokemon_data?.type_2?.value ?? "Normal"

            if (enemy_pokemon_data && (enemy_pokemon_data.species.value == 'Zorua' || enemy_pokemon_data.species.value == 'Zoroark')) {
                if (this.calculate_zoroark(enemy_pokemon_data) != null) {
                    defendingType1 = this.calculate_zoroark(enemy_pokemon_data).type_1
                    defendingType2 = this.calculate_zoroark(enemy_pokemon_data).type_2
                }
            }

            var defendingType1Effectiveness = 1
            var defendingType2Effectiveness = 1

            var player_ability_modifier = 1
            var player_ability = state == 'Battle' ? this.game.properties.battle.player.active_pokemon.ability_temp.value : this.game.properties.player.team[0].ability.value
            if (player_ability == 'Normalize') {
                attackingType = 'Normal'
            }
            // Sheer Force: damaging moves with a secondary effect, as gen5 spells them (black.js: "ThunderPunch",
            // "DragonBreath"...). Gen5 has no decompilation: the list is from knowledge, gen 1-5 moves only.
            var sheer_force_moves = [
                "Acid", "Acid Spray", "Air Slash", "AncientPower", "Astonish", "Aurora Beam", "Bite", "Blaze Kick",
                "Blizzard", "Blue Flare", "Body Slam", "Bolt Strike", "Bone Club", "Bounce", "Bubble", "BubbleBeam",
                "Bug Buzz", "Bulldoze", "Charge Beam", "Confusion", "Constrict", "Cross Poison", "Crunch",
                "Crush Claw", "Dark Pulse", "Discharge", "Dizzy Punch", "Dragon Rush", "DragonBreath", "DynamicPunch",
                "Earth Power", "Electroweb", "Ember", "Energy Ball", "Extrasensory", "Fake Out", "Fiery Dance",
                "Fire Blast", "Fire Fang", "Fire Punch", "Flame Charge", "Flame Wheel", "Flamethrower", "Flare Blitz",
                "Flash Cannon", "Focus Blast", "Force Palm", "Freeze Shock", "Gunk Shot", "Headbutt", "Heart Stamp",
                "Heat Wave", "Hurricane", "Hyper Fang", "Ice Beam", "Ice Burn", "Ice Fang", "Ice Punch",
                "Icicle Crash", "Icy Wind", "Inferno", "Iron Head", "Iron Tail", "Lava Plume", "Leaf Tornado", "Lick",
                "Low Sweep", "Luster Purge", "Metal Claw", "Meteor Mash", "Mirror Shot", "Mist Ball", "Mud Bomb",
                "Mud Shot", "Mud-Slap", "Muddy Water", "Needle Arm", "Night Daze", "Octazooka", "Ominous Wind",
                "Poison Fang", "Poison Jab", "Poison Sting", "Poison Tail", "Powder Snow", "Psybeam", "Psychic",
                "Razor Shell", "Relic Song", "Rock Climb", "Rock Slide", "Rock Smash", "Rock Tomb", "Rolling Kick",
                "Sacred Fire", "Scald", "Searing Shot", "Secret Power", "Seed Flare", "Shadow Ball", "Signal Beam",
                "Silver Wind", "Sky Attack", "Sludge", "Sludge Bomb", "Sludge Wave", "Smog", "Snarl", "Snore",
                "Spark", "Steamroller", "Steel Wing", "Stomp", "Struggle Bug", "Thunder", "Thunder Fang",
                "ThunderPunch", "ThunderShock", "Thunderbolt", "Tri Attack", "Twineedle", "Twister", "Volt Tackle",
                "Water Pulse", "Waterfall", "Zap Cannon", "Zen Headbutt",
            ]
            // Iron Fist: pokeplatinum sPunchingMoves (battle_lib.c), the same 15 moves in gen5 -- not Sucker Punch
            var punching_moves = [
                "Ice Punch", "Fire Punch", "ThunderPunch", "Mach Punch", "Focus Punch", "Dizzy Punch", "DynamicPunch",
                "Hammer Arm", "Mega Punch", "Comet Punch", "Meteor Mash", "Shadow Punch", "Drain Punch",
                "Bullet Punch", "Sky Uppercut",
            ]
            if (player_ability == "Iron Fist" && punching_moves.includes(x)) {
                player_ability_modifier = 1.2
            }
            else if (player_ability == "Sheer Force" && sheer_force_moves.includes(x.toString())) {
                player_ability_modifier = 5325/4096 // 1.300048828125
            }
            // Outside the in-battle calculation the enemy data is left over from the last battle, so its ability does not count
            var in_battle_calc = this.typeCalcs == true && state == "Battle" && (this.single_battle == true || this.game.properties.battle.opponent.trainer.value == '--')
            // Mold Breaker, Teravolt and Turboblaze ignore the target's ability
            var target_ability = !in_battle_calc || ['Mold Breaker', 'Teravolt', 'Turboblaze'].includes(player_ability) ? null : enemy_pokemon_data?.ability.value
            // Rivalry: x1.25 against the same gender, x0.75 against the other, nothing if either is genderless
            // (pokeplatinum BattleSystem_CalcMoveDamage; gen5 the same, from knowledge). The mapper's gender bit is
            // "female"; its genderless property reads the same bit, so genderless comes from the dex gender ratio (255).
            var rivalry_modifier = 1
            if (in_battle_calc && player_ability == 'Rivalry') {
                const player_species = this.game.properties.battle.player.active_pokemon.species?.value
                const player_gender = this.game.properties.battle.player.team?.[0]?.gender?.value ?? this.game.properties.player.team[0].gender?.value
                const enemy_gender = this.game.properties.battle.opponent.team?.[enemy_party_position]?.gender?.value
                const genderless = [player_species, enemy_pokemon_data?.species?.value].some(sp => this.g5PokemonData[sp]?.gender_ratio == 255)
                if (!genderless && player_gender != null && enemy_gender != null) {
                    rivalry_modifier = Boolean(player_gender) == Boolean(enemy_gender) ? 1.25 : 0.75
                }
            }

            // var player_ability = this.game.properties.player.team[0].ability.value
            // var player_status = this.game.properties.battle.player.pkmn_ram.pokemon_0_ram
            // Flare Boost (burned, special) / Toxic Boost (poisoned, physical): x1.5 power (gen5; no decomp; from
            // knowledge). The battle structure's status is not mapped, so this is the party copy's, as in get_stat.
            var flare_boost = 1
            const player_status = this.game.properties.player.team[0].status_condition?.value
            if (player_ability == 'Flare Boost' && player_status == 'Burned' && this.moveCategory(x) == 'Special') {
                flare_boost = 1.5
            }
            if (player_ability == 'Toxic Boost' && (player_status == 'Poisoned' || player_status == 'Badly Poisoned') && this.moveCategory(x) == 'Physical') {
                flare_boost = 1.5
            }

            if (state == 'Battle') {
                if (defendingType1 && attackingType) {
                    defendingType1Effectiveness = this.typeData.find(x => x.moveType == attackingType)[defendingType1]
                }
                if (defendingType2 && attackingType && (defendingType1 != defendingType2)) {
                    defendingType2Effectiveness = this.typeData.find(x => x.moveType == attackingType)[defendingType2]
                }
                // Filter / Solid Rock: x0.75 on the whole super-effective hit (see the return below), not per type
            }
            
            var multi_hit_modifier = 1;
            const double_hit_moves = [
                "Bonemerang",
                "Double Hit",
                "Double Iron Bash",
                "Double Kick",
                "Dragon Darts",
                "Dual Chop",
                "Dual Wingbeat",
                "Gear Grind",
                "Tachyon Cutter",
                "Triple Dive",
                "Twin Beam",
                "Twineedle",
            ];
            const triple_hit_moves = [
                "Surging Strikes",
                "Triple Dive",
                "Water Shuriken",
            ];
            if (double_hit_moves.includes(x)) {
                multi_hit_modifier = 2;
            }
            if (triple_hit_moves.includes(x)) {
                multi_hit_modifier = 3;
            }
            // Triple Kick: 10, 20 and 30 power, shown as the total like the two-hit moves
            if (x == "Triple Kick") {
                multi_hit_modifier = 6;
            }

            if (player_ability == 'Scrappy' && (attackingType == 'Fighting' || attackingType == 'Normal')) {
                if (defendingType1 == 'Ghost') {
                    defendingType1Effectiveness = 1
                }
                if (defendingType2 == 'Ghost') {
                    defendingType2Effectiveness = 1
                }
            }

            var ability = this.abilityModifier(this.game.properties.player.team[0].ability.value, attackingType, 'player')

            if (target_ability == 'Levitate' && attackingType == 'Ground') {
                ability = 0
            }
            if (target_ability == 'Sap Sipper' && attackingType == 'Grass') {
                ability = 0
            }
            if (target_ability == 'Storm Drain' && attackingType == 'Water') {
                ability = 0
            }
            if (target_ability == 'Dry Skin' && attackingType == 'Water') {
                ability = 0
            }
            if (target_ability == 'Lightningrod' && attackingType == 'Electric') {
                ability = 0
            }
            if (target_ability == 'Flash Fire' && attackingType == 'Fire') {
                ability = 0
            }
            if (target_ability == 'Heatproof' && attackingType == 'Fire') {
                ability = 0.5
            }
            if (target_ability == 'Motor Drive' && attackingType == 'Electric') {
                ability = 0
            }
            // Water Absorb / Volt Absorb: immune; Thick Fat halves Fire and Ice; Dry Skin takes Fire x1.25
            // (pokeplatinum BattleSystem_TriggerImmunityAbility / BattleSystem_CalcMoveDamage; gen5 the same)
            if ((target_ability == 'Water Absorb' && attackingType == 'Water') || (target_ability == 'Volt Absorb' && attackingType == 'Electric')) {
                ability = 0
            }
            if (target_ability == 'Thick Fat' && (attackingType == 'Ice' || attackingType == 'Fire')) {
                ability = 0.5
            }
            if (target_ability == 'Dry Skin' && attackingType == 'Fire') {
                ability = 1.25
            }
            // Multiscale (gen5): half damage while the target is at full HP
            var multiscale_modifier = 1
            if (target_ability == 'Multiscale' && enemy_pokemon_data?.stats?.hp?.value == enemy_pokemon_data?.stats?.hp_max?.value) {
                multiscale_modifier = 0.5
            }
            var recklessMoves = [
                "Axe Kick",
                "Brave Bird",
                "Double-Edge",
                "Double Edge",
                "Flare Blitz",
                "Head Charge",
                "Head Smash",
                "High Jump Kick",
                "Hi Jump Kick",
                "Jump Kick",
                "Submission",
                "Supercell Slam",
                "Take Down",
                "Wave Crash",
                "Wild Charge",
            ]
            if (in_battle_calc && enemy_pokemon_data?.ability.value == 'Reckless' && recklessMoves.includes(x)) {
                ability = 1.2
            }

            var player_item = ""
            var enemy_item = ""
            switch (state) {
                case "Battle": {
                    player_item = this.n_battle_data_fix_friendship
                    enemy_item = enemy_pokemon_data?.held_item?.value ?? ""
                    break
                }
                default: {
                    player_item = this.n_battle_data_fix_friendship
                    break
                }
            }
            let itemBoost = this.determineItemBoost(x, player_item)

            var enemy_item_modifier = 1
            if (enemy_item == "Air Balloon" && attackingType == "Ground") {
                enemy_item_modifier = 0
            }
            if (target_ability == 'Levitate' && attackingType == 'Ground' && enemy_item == "Iron Ball") {
                ability = 1 
            }
            if (attackingType == 'Ground' && defendingType1 == 'Flying' && enemy_item == "Iron Ball") {
                defendingType1Effectiveness = 1 
            }
            if (attackingType == 'Ground' && defendingType2 == 'Flying' && enemy_item == "Iron Ball") {
                defendingType2Effectiveness = 1 
            }

            if (species == 'Mime Jr.' && player_item.held_item.value == 'Odd Incense' && attackingType == "Psychic") {
                itemBoost = 1.2
            }
            else if (species == 'Bonsly' && player_item.held_item.value == 'Rock Incense' && attackingType == "Rock") {
                itemBoost = 1.2
            }
            else if (species == 'Budew' && player_item.held_item.value == 'Rose Incense' && attackingType == "Grass") {
                itemBoost = 1.2
            }
            else if (species == 'Azurill' && player_item.held_item.value == 'Sea Incense' && attackingType == "Water") {
                itemBoost = 1.2
            }
            else if (species == 'Mantyke' && player_item.held_item.value == 'Wave Incense' && attackingType == "Water") {
                itemBoost = 1.2
            }
            else if (player_item.held_item.value == null && x == 'Acrobatics') {
                itemBoost = 2
            }

            var stabModifier = this.determineSTAB(x, attackingType)
            if (player_ability == "Adaptability" && stabModifier == 1.5) {
                stabModifier = 2
            }

            var expert_belt_check = player_item.held_item.value
            var expert_belt_modifier = 1
            if (defendingType1Effectiveness * defendingType2Effectiveness > 1 && expert_belt_check == 'Expert Belt') {
                expert_belt_modifier = 1.2
            }

            var weatherBoost = this.weatherModifier(this.game.properties.battle.field.weather.value, x, this.moveType(x), player_ability)
            var weatherBoost = 1

            var burnModifier = this.burnModifier(x)
            if (player_ability == "Tinted Lens") {
                var type_multiple = defendingType1Effectiveness * defendingType2Effectiveness
                if (type_multiple == 0) {}
                else if (type_multiple < 1) {
                    defendingType1Effectiveness = 1
                    defendingType2Effectiveness = type_multiple * 2
                }
            }
            if (power <= 60 && player_ability == "Technician") {
                power = power * 1.5
            }

            // console.log(x, power, stabModifier, attackingType, defendingType1, defendingType2, defendingType1Effectiveness, defendingType2Effectiveness, flare_boost, ability, itemBoost, enemy_item_modifier, weatherBoost, burnModifier, expert_belt_modifier, player_ability_modifier)
            // One-hit KO moves show "KO", or 0 when the type chart or the target's ability leaves them no effect
            // (core/logic/ohkoAccuracy.ts; gen4's rule, Wonder Guard included)
            if (isOhkoMove(x)) {
                const type_product = defendingType1Effectiveness * defendingType2Effectiveness
                const ohko_power = !in_battle_calc ? ohkoPowerText()
                    : target_ability == 'Wonder Guard' && type_product <= 1 ? 0
                    : ohkoPowerText(type_product * ability)
                this[`move_fix_power_${slot}`] = ohko_power
                return ohko_power
            }
            if (in_battle_calc) { //Handles type effectiveness calculations in battle
                if (power == "—") {
                    this[`move_fix_power_${slot}`] = "—"
                    return "—" 
                }
                if (power == "-") {
                    this[`move_fix_power_${slot}`] = "—"
                    return "—"
                }
                const type_product = defendingType1Effectiveness * defendingType2Effectiveness
                // Wonder Guard: only super-effective moves hit
                if (target_ability == 'Wonder Guard' && type_product <= 1) {
                    this[`move_fix_power_${slot}`] = 0
                    return 0
                }
                const filter_modifier = (target_ability == 'Filter' || target_ability == 'Solid Rock') && type_product > 1 ? 0.75 : 1
                let effective_power = Math.floor(power * stabModifier * defendingType1Effectiveness * defendingType2Effectiveness * flare_boost * ability * itemBoost * enemy_item_modifier * weatherBoost * burnModifier * expert_belt_modifier * player_ability_modifier * multi_hit_modifier * filter_modifier * multiscale_modifier * rivalry_modifier)
                if (!Number.isFinite(effective_power)) {
                    this[`move_fix_power_${slot}`] = "—"
                    return "—"
                }
                this[`move_fix_power_${slot}`] = effective_power
                return effective_power
            }
            else { //handles out of battle cases
                if (power == "—") { 
                    this[`move_fix_power_${slot}`] = power
                    return power 
                }
                if (power == "-") { 
                    this[`move_fix_power_${slot}`] = "—"
                    return "—" 
                }
                else {
                    let effective_power = Math.floor(power * stabModifier * ability * itemBoost * burnModifier * player_ability_modifier * multi_hit_modifier)
                    if (!Number.isFinite(effective_power)) {
                        this[`move_fix_power_${slot}`] = "—"
                        return "—"
                    }
                    this[`move_fix_power_${slot}`] = effective_power
                    return effective_power
                }
            }
        },

        /* === Style Mode (dev only) ==========================================
         * Iterate every species in g5PokemonData. Each species is shown in
         * slot 0 of the enemy graphic in resize mode. Enter commits and
         * advances; Backspace discards live edits and steps back. Existing
         * style settings load automatically per species.
         */
        _styleModeBuildList() {
            const all = Object.keys(this.g5PokemonData || {});
            return all.filter((name) => {
                if (!name) return false;
                if (name === '—' || name === 'Egg') return false;
                return true;
            });
        },
    },

//--------- PROGRAM MOUNTED ---------------------------------------------------------------------------------------------------------------//
    unmounted() {
        // The shell unmounts this component when the mapper unloads (plan 3.1: on
        // InstanceReset, tear down) and mounts a fresh one on the next load; the state
        // the legacy component kept across a mapper reload is what `load_all_settings`
        // reads back from the store, as after its own `/reload`. The legacy component
        // lived as long as its page and never had to undo anything; without this an
        // unmounted instance kept its hotkeys, its 10 ms Super Shuckie poll, its timer
        // loop and its dev-mode listeners, all driving dead state next to the live
        // instance's. The mapper subscriptions are the client's; main.ts clears them
        // at the same moment.
        this._unmounted = true;
        this.unbindHotkeys?.();
        clearInterval(this.emulatorStatsInterval);
        this.timer.stop();
        PubSub.unsubscribe("time_update", this._onTimeUpdate);
        clearInterval(this._ownedItemsInterval);
        if (this._devKeydown) window.removeEventListener('keydown', this._devKeydown);
        if (this._devMousedown) window.removeEventListener('mousedown', this._devMousedown, true);
    },
    mounted: async function () {
        // The Timer writes its storage outside Vue's reactivity; this is how the clock frame hears of a change.
        this.timer.onChange = () => { this.timer_frame_version++ }
        const that = this
        // main.ts owns the mapper client and mounts this component once the mapper is
        // loaded and detected, so what was the onMapperLoaded callback runs here, in the
        // same order: ready, then the next-tick startup work, then the subscriptions.
        {
            this.ready = true
            this.checkMapperForChapterMarkerProperties()
            this.$nextTick(() => {
                if (this.$refs.expBar) {
                    const species = this.game.properties.player.team[0].species.value ?? this.starter;
                    const expPoints = (this.game.properties.meta.state.value == 'Battle' ? this.game.properties.battle.player.active_pokemon.exp.value :
                        this.game.properties.player.team[0].exp.value) ?? 0;
                    const growthRate = this.g5PokemonData[species]?.growth_rate ?? "Error Growth Rate";
                    const expStats = this.calcExpStats(growthRate, expPoints);
                    this.$refs.expBar.setWidth((expStats.percent * 100) + "%");
                    this.expBarState.species = species;
                    this.expBarState.expPoints = expPoints;
                }
            })
        }
        // The client's debounce list (a 15-frame timeout, four `deboucePath` calls) is
        // the module's `debouncePaths`/`debounceFrames` in games/gen5/index.ts, applied
        // by main.ts before this component mounts.

        // In mounted hook (around line 6897)
        // Poll for emulator stats continuously
        this.emulatorStatsInterval = setInterval(async () => {
            // gen4's gate (Phase 2): every reader of `emulatorStats` -- the timer text, the
            // fault counters, the split log -- is behind one of the two flags, so with both
            // off nothing observes the pause and the idle overlay stops making 100 requests
            // a second (docs/performance-followups.md).
            if (this.ready && (this.shuckie_timer || this.shuckie_counters)) { // Only poll when mapper is ready and a shuckie feature is on
                await this.fetchEmulatorStats();
            }
        }, 10); // 100ms = 10 times per second (adjust as needed)

        this.load_all_settings()
        this.pokemon_list = this.species_function(this.g5PokemonData)
        this.timer.update();
        
        // Initialize evolution family list
        this.updateEvolutionFamilyList();

        // Initial tracking of personality value and species
        this.last_known_personality_value = this.game.properties.player.team[0].internals.personality_value.value;
        this.last_known_species = this.game.properties.player.team[0].species.value;
        
        // Track personality value changes
        this.game.properties.player.team[0].internals.personality_value.change(async (newProp, oldProp) => {
            // Update tracked personality value
            this.last_known_personality_value = newProp.value;
        });

        // Species change handler - handles both normal species changes and evolution
        this.game.properties.player.team[0].species.change(async (newProp, oldProp) => {
            const currentPersonalityValue = this.game.properties.player.team[0].internals.personality_value.value;
            const state = this.game.properties.meta.state.value
            
            // Check if this is an evolution (same personality value, different species, evolution enabled)
            if (this.evolution == true && newProp.value != oldProp.value && 
                currentPersonalityValue === this.last_known_personality_value &&
                this.last_known_personality_value != null) {
                
                const evolution_family_raw = this.g5PokemonData[this.starter]?.evolution_family;
                if (evolution_family_raw && evolution_family_raw.length > 0) {
                    const evolution_family = evolution_family_raw.map(obj => obj.species).filter(s => s != null);
                    const evolved = evolution_family.includes(newProp.value);
                    
                    if (evolved == true) {
                        // Store old species for transition. The evolved species goes through the
                        // form byte so a Burmy that evolved in a cloak lands on the matching Wormadam.
                        const oldSpecies = this.starter;
                        const newSpecies = this.resolveIncomingSpecies(newProp.value);

                        // Only proceed if both oldProp and newSpecies are valid
                        // Check that oldProp has a valid species (not 0x00 0x00 bytes)
                        let oldPropValid = false;
                        if (oldProp && oldProp.value != null && oldProp.value !== undefined) {
                            // Check if bytes is valid (not 0x00 0x00)
                            if (oldProp.bytes != null) {
                                if (Array.isArray(oldProp.bytes)) {
                                    // Array format: [0x00, 0x00] is invalid
                                    oldPropValid = !(oldProp.bytes.length === 2 && oldProp.bytes[0] === 0x00 && oldProp.bytes[1] === 0x00);
                                } else {
                                    // Number format: 0x00 or 0x0000 is invalid
                                    oldPropValid = oldProp.bytes !== 0x00 && oldProp.bytes !== 0;
                                }
                            } else {
                                // If bytes is null/undefined but value exists, consider it valid
                                oldPropValid = true;
                            }
                        }
                        
                        // Only proceed if newSpecies is valid and within the evolution family
                        if (oldPropValid && newSpecies && newSpecies !== undefined && newSpecies !== null && newSpecies != oldSpecies &&
                            evolution_family && evolution_family.includes(newProp.value)) {
                            console.log("Evolving to:", newSpecies)
                            console.log("Showing base stats.")
                            this.stats_setting = "Base Stats";
                            
                            // Preserve attempt_number, finished_run_count, resets, and blackouts when evolving
                            const preservedAttemptNumber = this.attempt_number;
                            const preservedFinishedRunCount = this.finished_run_count;
                            const preservedResets = this.playerResets;
                            const preservedBlackouts = this.blackout_counter;
                            
                            // Update starter
                            this.starter = newSpecies;
                            this.last_known_species = newSpecies;
                            
                            // Restore preserved values after starter update (before watcher loads from storage)
                            this.attempt_number = preservedAttemptNumber;
                            this.finished_run_count = preservedFinishedRunCount;
                            this.playerResets = preservedResets;
                            this.blackout_counter = preservedBlackouts;
                            
                            // Save preserved values to storage for the new species
                            const game = this.game?.properties.meta.game_name.value;
                            if (!MyStorage[`${game}_${newSpecies}`]) {
                                MyStorage[`${game}_${newSpecies}`] = {};
                            }
                            MyStorage[`${game}_${newSpecies}`] = {
                                ...MyStorage[`${game}_${newSpecies}`],
                                attempt_number: preservedAttemptNumber,
                                finished_run_count: preservedFinishedRunCount,
                                playerResets: preservedResets,
                                blackout_counter: preservedBlackouts
                            };
                            
                            // Update the dropdown to the new evolved species
                            // This will trigger the watcher to load the new species' styles
                            this.selected_evolution_species = newSpecies;
                            
                            // Show base stats of new evolved species until next battle
                            this.show_evolved_base_stats = true;
                            this.evolved_species_for_stats = newSpecies;
                            
                            // Perform fade transition
                            await this.performEvolutionTransition(oldSpecies, newSpecies);
                            
                            // Update personality value tracking
                            this.last_known_personality_value = currentPersonalityValue;
                            return; // Don't process as normal species change
                        }
                    }
                }
            }
            
            // Normal species change handling (not an evolution)
            this.last_known_species = newProp.value;
            this.last_known_personality_value = currentPersonalityValue;
            
            if ((state == "Battle" || state == "From Battle") && this.game.properties.battle.player.pkmn_ram.pokemon_0_ram.stats.hp.value != 0) {
                this.starter = this.resolveIncomingSpecies(newProp.value)
            }
            else if (state == "Overworld" && this.game.properties.overworld.map_index.value == 278 && newProp.value == 'Reshiram') {
                // Special handling for Reshiram
            }
            else if (state == "Overworld") {
                this.starter = this.resolveIncomingSpecies(newProp.value)
            }
        })
        this.game.properties.player.team[0].level.change(async (newProp, oldProp) => {
            const map = this.game.properties.overworld.map_index.value
            if ((this.selected_game == "Black" || this.selected_game == "White") && newProp.value == 5 && map == 391) {
                this.write_byte_data(this.set_starter_stats_object)
                await this.write_rng_initial_trips()
                this.set_hm_encounters()
            }
            else if ((this.selected_game == "Black 2" || this.selected_game == "White 2") && newProp.value == 5 && map == 117) {
                this.write_byte_data(this.set_starter_stats_object)
                await this.write_rng_initial_trips()
                this.set_hm_encounters()
            }
        })

        this.setup_rng_bag_watchers()

        //EXP BAR ANIMATION FUNCTION
        /* exp bar initialization */ 
        {
            const function_logging = false
            const species = this.game.properties.player.team[0].species.value ?? this.starter;
            if (function_logging == true) { console.log(species) }
            const expPoints = (this.game.properties.meta.state.value == 'Battle' ? this.game.properties.battle.player.active_pokemon.exp.value :
                this.game.properties.player.team[0].exp.value) ?? 0;
            if (function_logging == true) { console.log(expPoints) }
            const growthRate = this.g5PokemonData[species]?.growth_rate ?? "Error Growth Rate";
            if (function_logging == true) { console.log(growthRate) }
            let expStats = this.calcExpStats(growthRate, expPoints);
            if (function_logging == true) { console.log(expStats) }
            const width = (expStats.percent * 100) + "%";
            if (this.$refs.expBar) {
                this.$refs.expBar.setWidth(width)
            }
            if (function_logging == true) { console.log(width) }

            this.expBarState.species = species;
            this.expBarState.expPoints = expPoints;
        }


        // Resets
        if (this.selected_game == "Black" || this.selected_game == "White" || this.selected_game == "Black 2" || this.selected_game == "White 2") {
            this.game.properties?.flags?.new_game.change(async (newProp, oldProp) => {
                // console.log("New Game Flag Changed")
                // console.log(newProp)
                // console.log(this.timer.formatted_time[0])
                // This should resolve the issue in Cynthia's chamber where the timer would restart when resetting against her
                if (this.shuckie_timer == true) {
                    if (this.emulatorStats.time_current == null) {
                        console.log("Sending emulator start")
                        this.sendEmulatorStart();
                        console.log("Setting options...")
                        this.set_options()
                        this.attempt_number++
                    }
                }
                else {
                    if (newProp.value == true && parseInt(this.timer.formatted_time[0]) == 0) {
                        // this.startTime()
                        this.timer.startTime(this.timer_startTimeOffset);
                        console.log("Setting options...")
                        this.set_options()
                        this.attempt_number++
                    }
                }
            })
        }
        this.game.properties.player.name.change(async (newProp, oldProp) => {
            // console.log(newProp)
            // console.log(oldProp)
            const overlay_timer = parseInt(this.timer.formatted_time[0])
            const shuckie_timer = this.emulatorStats?.time_current
            const timer_check = this.shuckie_timer ? shuckie_timer : overlay_timer

            if (timer_check > 0 && newProp.value == "" && oldProp.value != "") {
                this.blackout = false;
                if (this.disallow_faults == false && this.run_complete == false) { 
                    this.playerResets++ 
                    this.sendObsChapterMarker("RESET")
                    if (this.shuckie_counters) { this.incrementEmulatorCounter("playerResets") }
                }
                this.disallow_faults_function()
            }
        })

        // Fix for Black2 and White2 resetting the encounter rate when you pass through the Flocessy Ranch Gate
        this.game.properties.overworld.encounters_enabled.change(async (newProp, oldProp) => {
            if (this.selected_game == "Black 2" || this.selected_game == "White 2") {
                // console.log(newProp.value)
                if (newProp.value == true && this.encounters_route_19 == false && this.game.properties.overworld.map_index.value == 124) {
                    this.game.properties.overworld.encounters_enabled.set(false, false)
                }
                if (newProp.value == true && this.encounters_route_20 == false && this.game.properties.overworld.map_index.value == 125) {
                    this.game.properties.overworld.encounters_enabled.set(false, false)
                }
                if (newProp.value == true && this.encounters_flocessy_ranch == false && this.game.properties.overworld.map_index.value == 130) {
                    this.game.properties.overworld.encounters_enabled.set(false, false)
                }
            }
        })
        // Options
        this.game.properties.overworld.map_index.change(async (newProp, oldProp) => {
            // console.log(newProp.value)
            // console.log(oldProp.value)
            // Black and White
            if (newProp.value == 391 && oldProp.value == 0) {
                this.set_options()
            }
            // Black2 and White2
            if (newProp.value == 51 && oldProp.value == 0) {
                this.set_options()
            }

            // Black and White
            if (newProp.value == 317 && this.encounters_route_1 == false) {
                this.game.properties.overworld.encounters_enabled.set(false, false)
            }
            if (newProp.value == 319 && this.encounters_route_2 == false) {
                this.game.properties.overworld.encounters_enabled.set(false, false)
            }
            // Black2 and White2
            if (newProp.value == 124 && this.encounters_route_19 == false) {
                this.game.properties.overworld.encounters_enabled.set(false, false)
            }
            if (newProp.value == 125 && this.encounters_route_20 == false) {
                this.game.properties.overworld.encounters_enabled.set(false, false)
            }
            if (newProp.value == 130 && this.encounters_flocessy_ranch == false) {
                this.game.properties.overworld.encounters_enabled.set(false, false)
            }

            // Black and White
            if (newProp.value == 350 || newProp.value == 351) {
                this.stats_setting = "Vitamins";
            }
            else {
                this.stats_setting = "Automatic";
            }
            // Black2 and White2
            // not implemented yet
        })

        //Blackouts
        this.game.properties.battle.player.pkmn_ram.pokemon_0_ram.stats.hp.change((newProp, oldProp) => {
            const state = this.game.properties.meta.state.value
            if (newProp.value == 0 && state == `Battle` && this.game.properties.battle.opponent.trainer.value != '--') {
                this.blackout = true;
            }
        });

        //Styling for stats in case they go above 999
        const stat_size_3_digit = "56px"
        const stat_size_4_digit = "43px"
        //! BUG - if you refresh with any display other than Automatic or Base Stats it will resize the values incorrectly based on the attack value rather the text size
        if (document.getElementById("Atk") && this.get_stat()["Atk"].toString().length <= 3) { document.getElementById("Atk").style.fontSize = stat_size_3_digit }
        if (document.getElementById("Atk") && this.get_stat()["Atk"].toString().length >= 4) { document.getElementById("Atk").style.fontSize = stat_size_4_digit }
        if (document.getElementById("Def") && this.get_stat()["Def"].toString().length <= 3) { document.getElementById("Def").style.fontSize = stat_size_3_digit }
        if (document.getElementById("Def") && this.get_stat()["Def"].toString().length >= 4) { document.getElementById("Def").style.fontSize = stat_size_4_digit }
        if (document.getElementById("SpA") && this.get_stat()["SpA"].toString().length <= 3) { document.getElementById("SpA").style.fontSize = stat_size_3_digit }
        if (document.getElementById("SpA") && this.get_stat()["SpA"].toString().length >= 4) { document.getElementById("SpA").style.fontSize = stat_size_4_digit }
        if (document.getElementById("SpD") && this.get_stat()["SpD"].toString().length <= 3) { document.getElementById("SpD").style.fontSize = stat_size_3_digit }
        if (document.getElementById("SpD") && this.get_stat()["SpD"].toString().length >= 4) { document.getElementById("SpD").style.fontSize = stat_size_4_digit }
        if (document.getElementById("Spe") && this.get_stat()["Spe"].toString().length <= 3) { document.getElementById("Spe").style.fontSize = stat_size_3_digit }
        if (document.getElementById("Spe") && this.get_stat()["Spe"].toString().length >= 4) { document.getElementById("Spe").style.fontSize = stat_size_4_digit }
        this.game.properties.battle.player.pkmn_ram.pokemon_0_ram.modifiers.attack.change(async () => {
            if (this.get_stat()["Atk"].toString().length <= 3) { document.getElementById("Atk").style.fontSize = stat_size_3_digit }
            if (this.get_stat()["Atk"].toString().length >= 4) { document.getElementById("Atk").style.fontSize = stat_size_4_digit }
        })
        this.game.properties.battle.player.pkmn_ram.pokemon_0_ram.modifiers.defense.change(async () => {
            if (this.get_stat()["Def"].toString().length <= 3) { document.getElementById("Def").style.fontSize = stat_size_3_digit }
            if (this.get_stat()["Def"].toString().length >= 4) { document.getElementById("Def").style.fontSize = stat_size_4_digit }
        })
        this.game.properties.battle.player.pkmn_ram.pokemon_0_ram.modifiers.special_attack.change(async () => {
            if (this.get_stat()["SpA"].toString().length <= 3) { document.getElementById("SpA").style.fontSize = stat_size_3_digit }
            if (this.get_stat()["SpA"].toString().length >= 4) { document.getElementById("SpA").style.fontSize = stat_size_4_digit }
        })
        this.game.properties.battle.player.pkmn_ram.pokemon_0_ram.modifiers.special_defense.change(async () => {
            if (this.get_stat()["SpD"].toString().length <= 3) { document.getElementById("SpD").style.fontSize = stat_size_3_digit }
            if (this.get_stat()["SpD"].toString().length >= 4) { document.getElementById("SpD").style.fontSize = stat_size_4_digit }
        })
        this.game.properties.battle.player.pkmn_ram.pokemon_0_ram.modifiers.speed.change(async () => {
            if (this.get_stat()["Spe"].toString().length <= 3) { document.getElementById("Spe").style.fontSize = stat_size_3_digit }
            if (this.get_stat()["Spe"].toString().length >= 4) { document.getElementById("Spe").style.fontSize = stat_size_4_digit }
        })

        //*Autosplitter
        const log_split = (x) => {
            const time = this.timer.formatted_time;
            const opponent = this.game.properties.battle.opponent.trainer.value;
            console.log(`Autosplitter - Battle Ended: Split: ${opponent} at ${time[0]}${time[1]} (Gametime: ${this.gametimeSplit})`)
        }
        const autosplitter_process = () => {
            if (this.autosplitter_toggle == true) {
                battle_end = Date.now()
                //data to be collected with the autosplitter
                let player_name  = this.game.properties.player.name.value
                let pokemon      = this.starter
                let trainer_name = this.game.properties.battle.opponent.trainer.value
                let trainer_id           = this.game.properties.battle.opponent.id.value
                const formattedTime = this.timer.formatted_time;
                let real_time_hmmss = formattedTime[0]
                let resets               = this.playerResets.toString()
                let blackouts            = this.blackout_counter.toString()
                let level                = this.game.properties.player.team[0].level.value.toString()
                let game_time            = this.gametimeSplit.toString()
                let battle_duration      = (battle_end - this.battle_start)/1000 
                let move1     = this.game.properties.player.team[0].moves[0].move.value
                let move2     = this.game.properties.player.team[0].moves[1].move.value
                let move3     = this.game.properties.player.team[0].moves[2].move.value
                let move4     = this.game.properties.player.team[0].moves[3].move.value

                const time = this.timer.getTime();

                let realTime = this.padTime(time.hours) + ":" + this.padTime(time.minutes) + ":" + this.padTime(time.seconds) + "." + this.padTime(time.ms)

                let shuckie_time_hhmmss = this.formatMilliseconds(this.emulatorStats?.time_current)
                let shuckie_time_cs = this.getCentiseconds(this.emulatorStats?.time_current)
                let shuckie_rt = this.shuckie_timer ?shuckie_time_hhmmss + "." + shuckie_time_cs : realTime

                //what split data is logged to file
                let simple_data = [
                    player_name, pokemon, trainer_name, shuckie_rt, 
                    resets, blackouts, level, game_time, battle_duration, 
                    move1, move2, move3, move4
                ]
                let simple_data_str = simple_data.join(",") + "\n";
                MyStorage["simple_data_str"] = simple_data_str
                MyStorage["simple_data"] = simple_data
                this.simple_data_str = simple_data_str
                this.simple_data = simple_data
                // Normalize trainer name: convert "Leader Cress" to "Cress" using autosplitter mapping
                let normalizedTrainerName = trainer_name
                if (this.game_data && this.game_data.gameName && autosplitter[this.game_data.gameName]) {
                    // Find the simple split name that maps to this trainer name
                    const simpleSplits = autosplitter["Simple Splits"]
                    for (const simpleName of simpleSplits) {
                        if (autosplitter[this.game_data.gameName][simpleName] === trainer_name) {
                            normalizedTrainerName = simpleName
                            break
                        }
                    }
                }
                // The row this battle's simple split would be, with the key and time current_splits
                // gets; the simple-split sites write it into the replay (2026-09-23).
                this.last_simple_split = { trainer: normalizedTrainerName, time: this.shuckie_timer ? shuckie_rt : real_time_hmmss, id: trainer_id }
                if (this.collect_split_data == true && this.game.properties.meta.state.value == "From Battle" && this.game.properties.battle.opponent.trainer.value != '--') {
                    if (this.shuckie_timer) { 
                        this.current_splits.push({
                            trainer: normalizedTrainerName, 
                            time:    shuckie_rt,
                            id:      trainer_id,
                        })
                    }
                    else {
                        this.current_splits.push({
                            trainer: normalizedTrainerName, 
                            time:    real_time_hmmss,
                            id:      trainer_id,
                        })
                    }
                }
            }
        }

        this.game.properties.battle.other.battle.change(async (newProp, oldProp) => {
            const game = this.game.properties.meta.game_name.value
            if (this.blackout == true) {
                if (game == 'Black' || game == 'White') {
                    if (newProp.value == -1893922566 && oldProp.value == 21828) {
                        if (this.disallow_faults == false && this.run_complete == false) { 
                            this.blackout_counter++ 
                            this.sendObsChapterMarker("BLACKOUT")
                            if (this.shuckie_counters) { this.incrementEmulatorCounter("blackout_counter") }
                        }
                        this.disallow_faults_function()
                    }
                }
                else if (game == "Black 2" || game == "White 2") {
                    if (newProp.value == -1892153091 && oldProp.value == 21828) {
                        if (this.disallow_faults == false && this.run_complete == false) { 
                            this.blackout_counter++ 
                            this.sendObsChapterMarker("BLACKOUT")
                            if (this.shuckie_counters) { this.incrementEmulatorCounter("blackout_counter") }
                        }
                        this.disallow_faults_function()
                    }
                }
            }
        })

        
        // IN / OUT BATTLE CHAPTER MARKERS
        // Fire on any trainer-slot transition into or out of a real value, with no meta.state
        // gating so plot battles (Bianca/Cheren/N) that skip "To Battle" or chain into a
        // post-battle cutscene still mark cleanly. Dedupe on (direction, trainer) so multi-phase
        // fights where the trainer property bounces don't spam duplicate markers, but a genuine
        // hand-off to a different trainer still fires.
        let lastBattleMarker = null
        const isTrainerValue = (v) => v != null && v !== "" && v !== "--"
        this.game.properties.battle.opponent.trainer.change(async (newProp, oldProp) => {
            const newIsTrainer = isTrainerValue(newProp.value)
            const oldIsTrainer = isTrainerValue(oldProp.value)
            let direction = null
            let trainer = null
            if (newIsTrainer) {
                direction = "IN"
                trainer = newProp.value
            } else if (oldIsTrainer) {
                direction = "OUT"
                trainer = oldProp.value
            }
            if (direction == null) return
            if (lastBattleMarker?.direction === direction && lastBattleMarker?.trainer === trainer) return
            lastBattleMarker = { direction, trainer }
            this.sendObsChapterMarker(direction + " - " + trainer)
        })

        this.game.properties.meta.state.change(async (newProp, oldProp) => {
            if (newProp.value == "From Battle" && oldProp.value == "Battle") {
                this.update_buffer_moves()
            }
            
            // If we're showing evolved base stats and state changes to Battle (not from Battle),
            // hide the evolved base stats display
            if (this.show_evolved_base_stats && (newProp.value == "To Battle" || newProp.value == "Battle") && oldProp.value != "From Battle") {
                this.show_evolved_base_stats = false;
                this.stats_setting = "Automatic";
                this.evolved_species_for_stats = null;
            }
            
            autosplitter_process()
            if (newProp.value == 'From Battle') {
                let trainer = this.game.properties.battle.opponent.trainer.value
                let id = this.game.properties.battle.opponent.id.value
                let gameName = this.game?.properties?.meta?.game_name?.value || this.selected_game
                let game_name = gameName
                if (trainer == 'Pokemon Trainer -' || trainer == null || trainer == undefined || trainer == '--') { return }
                // Get the split file name (either "FullyEvolved-line" or "Species")
                const splitFileName = this.getSplitFileName();
                
                //write split data
                const simpleSplit = () => {
                    log_split()
                    // The same split into the replay (2026-09-23), keyed like current_splits (gen5's trainer id marks the instance).
                    addSplitBookmark(this.last_simple_split?.trainer, this.last_simple_split?.time, this.last_simple_split?.id)
                    logData(gameName, this.simple_data_str, this.attempt_number, splitFileName, this.testRun, this.evolution, splitFileName, this.refilming_mode)
                    this.split_data.push(this.simple_data)
                    // split_data is no longer persisted (2026-09-17): it is only ever pushed to, the
                    // CSV split files are the record, and storing the whole history under the bare key
                    // and again inside every species' entry grew user_state.json to 324 MB, which every
                    // settings write re-serialised (docs/performance-followups.md, known-legacy-bugs.md #43).
                }
                if (this.game_data && this.game_data.splits.includes(trainer) && !this.game_data.finalBattle.includes(trainer)) {
                    simpleSplit();
                    if (this.automatic_post_battle_splits == true && this.game_data.post_battle_splits.includes(trainer)) {
                        if (trainer == "N") {
                            if (id == 586 || id == 587) {
                                this.prepare_for_splits = true
                                // this.right_ui = "Splits"
                            }
                        }
                        else {
                            this.prepare_for_splits = true
                            // this.right_ui = "Splits"
                        }
                    }
                }
        
                if (this.game_data && this.game_data.champion.includes(trainer)) {
                    this.hallOfFameReset = true;
                }

                //final battle: always log the final-battle (e.g. Ghetsis) simple split when it's defeated.
                if (this.game_data && (this.game_data.finalBattle.includes(trainer) || trainer == 'Alder')) {
                    if (this.automatic_post_battle_splits == true && this.game_data?.post_battle_splits?.includes(trainer)) {
                        this.prepare_for_splits = true
                        // this.right_ui = "Splits"
                    }
                    log_split();
                    addSplitBookmark(this.last_simple_split?.trainer, this.last_simple_split?.time, this.last_simple_split?.id)
                    this.split_data.push(this.simple_data)
                    // split_data is no longer persisted (2026-09-17): it is only ever pushed to, the
                    // CSV split files are the record, and storing the whole history under the bare key
                    // and again inside every species' entry grew user_state.json to 324 MB, which every
                    // settings write re-serialised (docs/performance-followups.md, known-legacy-bugs.md #43).

                    if (this.stop_timer_after_n_dialogue) {
                        // Toggle on: record the Ghetsis split now, but the run doesn't end until the
                        // N dialogue. The battle_party_data_start listener below stops the timer, logs
                        // a separate "Hall of Fame" split, and finalizes the run copy.
                        logData(gameName, this.simple_data_str, this.attempt_number, splitFileName, this.testRun, this.evolution, splitFileName, this.refilming_mode)
                            .catch(error => {
                                console.error("Error:", error);
                            });
                    } else {
                        // Toggle off: defeating Ghetsis ends the run, as before.
                        this.timer.stopTime();
                        if (this.shuckie_timer == true) { this.sendEmulatorEnd(); }
                        this.run_complete = true
                        if (this.testRun == false) {
                            this.finished_run_count++
                        };
                        //use then so that logCopy doesn't touch any files until logData finishes
                        logData(gameName, this.simple_data_str, this.attempt_number, splitFileName, this.testRun, this.evolution, splitFileName, this.refilming_mode)
                        .then(() => {
                                // Test-run attempt files live in test_runs/, so there is nothing
                                // valid to copy into finishes/ for a test run.
                                if (this.testRun == false) {
                                    logCopy(gameName, this.attempt_number, splitFileName, this.finished_run_count, this.refilming_mode);
                                }
                            })
                            .catch(error => {
                                console.error("Error:", error);
                            });
                    }
                }
            }
        });

        if (this.stop_timer_after_n_dialogue === true) {
            this.game.properties.battle.other.battle_party_data_start.change(async (newProp, oldProp) => {
                const hall_of_fame_map = 278
                const cur_map = this.game.properties.overworld.map_index.value
                const n_fade_to_black_magic = 61792
                console.log("N_Dialogue: ", hall_of_fame_map, cur_map, n_fade_to_black_magic, newProp.value)
                if (cur_map == hall_of_fame_map && newProp.value == n_fade_to_black_magic) {
                    autosplitter_process()
                    let gameName = this.game?.properties?.meta?.game_name?.value || this.selected_game
                    let game_name = gameName
                    // The last battle fought is still Ghetsis here, so autosplitter_process() labels
                    // this split "Ghetsis". This split marks the run end at the N dialogue, so relabel
                    // it "Hall of Fame" (the Ghetsis split itself is logged when Ghetsis is defeated).
                    this.simple_data = [...this.simple_data]
                    this.simple_data[2] = "Hall of Fame"
                    this.simple_data_str = this.simple_data.join(",") + "\n"
                    // this.stopTime()
                    this.timer.stopTime();
                    if (this.shuckie_timer == true) { this.sendEmulatorEnd(); }
                    // if (this.automatic_post_battle_splits == true && this.game_data?.post_battle_splits?.includes(trainer)) {
                    //     this.prepare_for_splits = true
                    //     // this.right_ui = "Splits"
                    // }
                    this.run_complete = true
                    if (this.testRun == false) {
                        this.finished_run_count++
                    };
                    log_split();
                    // The run's end as its own split in the replay, under the relabelled name.
                    addSplitBookmark(this.simple_data[2], this.simple_data[3])
                    
                    //use then so that logCopy doesn't touch any files until logData finishes
                    const splitFileName = this.getSplitFileName();
                    logData(gameName, this.simple_data_str, this.attempt_number, splitFileName, this.testRun, this.evolution, splitFileName, this.refilming_mode)
                    .then(() => {
                            // Test-run attempt files live in test_runs/, so there is nothing
                            // valid to copy into finishes/ for a test run.
                            if (this.testRun == false) {
                                logCopy(gameName, this.attempt_number, splitFileName, this.finished_run_count, this.refilming_mode);
                            }
                        })
                        .catch(error => {
                            console.error("Error:", error);
                        });
                    this.split_data.push(this.simple_data)
                    // split_data is no longer persisted (2026-09-17): it is only ever pushed to, the
                    // CSV split files are the record, and storing the whole history under the bare key
                    // and again inside every species' entry grew user_state.json to 324 MB, which every
                    // settings write re-serialised (docs/performance-followups.md, known-legacy-bugs.md #43).
                }
            });
        }

        // NEW MOVE LEARNED CHAPTER MARKER
        // In Battle state we read from battle.player.active_pokemon; otherwise from player.team[0].
        // A new move is detected when the multiset diff has exactly one move added AND the previous
        // set had at least one move — this filters out game resets, lead swaps, and the first starter.
        const readMoveContext = () => {
            const state = this.game?.properties?.meta?.state?.value;
            const source = (state == 'Battle')
                ? this.game?.properties?.battle?.player?.active_pokemon
                : this.game?.properties?.player?.team?.[0];
            if (!source) return { species: null, moves: [null, null, null, null] };
            return {
                species: source.species?.value ?? null,
                moves: [
                    source.moves?.[0]?.move?.value ?? null,
                    source.moves?.[1]?.move?.value ?? null,
                    source.moves?.[2]?.move?.value ?? null,
                    source.moves?.[3]?.move?.value ?? null,
                ],
            };
        };

        let lastMoveContext = readMoveContext();
        let moveCheckTimer = null;

        const checkForNewMove = () => {
            const previous = lastMoveContext;
            const current = readMoveContext();
            lastMoveContext = current;

            // Species changed (lead swap, evolution, fresh game): refresh snapshot, don't fire.
            if (previous.species !== current.species) return;

            const oldMoves = previous.moves.filter(m => m != null && m !== '');
            const newMoves = current.moves.filter(m => m != null && m !== '');

            const oldCounts = {};
            oldMoves.forEach(m => oldCounts[m] = (oldCounts[m] || 0) + 1);
            const newCounts = {};
            newMoves.forEach(m => newCounts[m] = (newCounts[m] || 0) + 1);
            const added = [];
            for (const m of Object.keys(newCounts)) {
                const diff = newCounts[m] - (oldCounts[m] || 0);
                for (let i = 0; i < diff; i++) added.push(m);
            }

            if (oldMoves.length >= 1 && added.length === 1) {
                const newMove = added[0];
                const chapterName = "New Move - " + newMove;
                console.log("Chapter Detected: " + chapterName);
                this.sendObsChapterMarker(chapterName);
            }
        };

        // Debounce so 4 simultaneous slot changes (battle struct populating, lead swap)
        // collapse into a single diff against the pre-burst snapshot.
        const scheduleMoveCheck = () => {
            if (moveCheckTimer) clearTimeout(moveCheckTimer);
            moveCheckTimer = setTimeout(() => {
                moveCheckTimer = null;
                checkForNewMove();
            }, 100);
        };

        for (let i = 0; i < 4; i++) {
            this.game.properties.player.team[0]?.moves?.[i]?.move?.change(() => scheduleMoveCheck());
            this.game.properties.battle.player.active_pokemon?.moves?.[i]?.move?.change(() => scheduleMoveCheck());
        }

        // CRITICAL ITEM CHAPTER MARKERS
        // Fires "Item - <name>" when the player obtains a critical item across any of the gen5
        // bag pockets (items / medicine / balls / tmhm / berries / battle_items / key_items)
        // or onto a team member's held slot. Uses the mapper's exact item casing.
        const vitaminItems = new Set([
            'HP Up', 'Protein', 'Iron', 'Carbos', 'Calcium', 'Zinc',
            'PP Up', 'PP Max', 'Rare Candy'
        ]);
        // Type boosters (held-item damage multipliers). Sourced from typeBoostingItems with the
        // mapper-correct casing already baked in.
        const typeBoosterItems = new Set(Object.keys(typeBoostingItems));
        // Gems (gen5 single-use type boosters).
        const gemItems = new Set([
            'Normal Gem', 'Fire Gem', 'Water Gem', 'Electric Gem', 'Grass Gem', 'Ice Gem',
            'Fighting Gem', 'Poison Gem', 'Ground Gem', 'Flying Gem', 'Psychic Gem',
            'Bug Gem', 'Rock Gem', 'Ghost Gem', 'Dragon Gem', 'Dark Gem', 'Steel Gem'
        ]);
        // Power / battle held items that meaningfully change a run. Casing matches the gen5 mapper.
        const powerHeldItems = new Set([
            'Choice Band', 'Choice Scarf', 'Choice Specs',
            'Life Orb', 'Expert Belt', 'Wise Glasses', 'Muscle Band',
            'Macho Brace', 'Zoom Lens', 'Wide Lens', 'Scope Lens',
            'Razor Claw', 'Razor Fang', 'Quick Claw', "King's Rock",
            'Bright Powder', 'Light Ball', 'Lucky Punch', 'Stick',
            'Thick Club', 'Metal Powder', 'Quick Powder',
            'DeepSeaScale', 'DeepSeaTooth',
            'Light Clay', 'Damp Rock', 'Heat Rock', 'Smooth Rock', 'Icy Rock',
            'Toxic Orb', 'Flame Orb', 'Iron Ball', 'Lagging Tail', 'Sticky Barb',
            'Black Sludge', 'Big Root', 'Shell Bell', 'Leftovers',
            'Mental Herb', 'White Herb', 'Power Herb',
            'Focus Sash', 'Focus Band',
            'Lax Incense', 'Sea Incense', 'Wave Incense', 'Odd Incense',
            'Rock Incense', 'Rose Incense', 'Full Incense', 'Pure Incense',
            'Lucky Egg', 'Amulet Coin', 'Cleanse Tag', 'Soothe Bell',
            'Metronome', 'Eviolite',
            'Float Stone', 'Air Balloon', 'Rocky Helmet', 'Eject Button',
            'Red Card', 'Binding Band', 'Ring Target', 'Absorb Bulb', 'Cell Battery'
        ]);
        // EV-training held items.
        const evBoosterItems = new Set([
            'Power Weight', 'Power Bracer', 'Power Belt',
            'Power Lens', 'Power Band', 'Power Anklet'
        ]);
        // Berries with battle effects (status cures, healing, pinch, type-resist, jaboca/rowap).
        // Filler/contest/EV-reduction berries are intentionally omitted as they're not run-critical.
        const berryItems = new Set([
            'Cheri Berry', 'Chesto Berry', 'Pecha Berry', 'Rawst Berry', 'Aspear Berry',
            'Leppa Berry', 'Oran Berry', 'Persim Berry', 'Lum Berry', 'Sitrus Berry',
            'Figy Berry', 'Wiki Berry', 'Mago Berry', 'Aguav Berry', 'Iapapa Berry',
            'Occa Berry', 'Passho Berry', 'Wacan Berry', 'Rindo Berry', 'Yache Berry',
            'Chople Berry', 'Kebia Berry', 'Shuca Berry', 'Coba Berry', 'Payapa Berry',
            'Tanga Berry', 'Charti Berry', 'Kasib Berry', 'Haban Berry', 'Colbur Berry',
            'Babiri Berry', 'Chilan Berry',
            'Liechi Berry', 'Ganlon Berry', 'Salac Berry', 'Petaya Berry', 'Apicot Berry',
            'Lansat Berry', 'Starf Berry', 'Enigma Berry',
            'Micle Berry', 'Custap Berry', 'Jaboca Berry', 'Rowap Berry'
        ]);
        // Pre-evolution stones / soft-evolution items that gate access to forms.
        const evolutionItems = new Set([
            'Fire Stone', 'Water Stone', 'Thunder Stone', 'Leaf Stone', 'Moon Stone',
            'Sun Stone', 'Shiny Stone', 'Dusk Stone', 'Dawn Stone', 'Oval Stone',
            'Everstone',
            'Up-Grade', 'Dubious Disc', 'Reaper Cloth', 'Magmarizer', 'Electirizer',
            'Protector', 'Dragon Scale', 'Prism Scale'
        ]);
        // Any new entry into the tmhm pocket fires (TMs are always interesting). Of the HMs we
        // only fire HM03 Surf — match prior-gen spec. Detection is via name prefix because the
        // gen5 mapper might serve "HM01" or "HM01 Cut" or "Cut" depending on glossary configuration.
        const hmBlocklist = new Set([
            'HM01', 'HM02', 'HM04', 'HM05', 'HM06',
            'Cut', 'Fly', 'Strength', 'Waterfall', 'Dive'
        ]);
        const isBlockedHm = (name) => {
            if (hmBlocklist.has(name)) return true;
            return /^HM(?!03)\d{2}\b/.test(String(name));
        };

        const isCriticalGenericItem = (name) =>
            vitaminItems.has(name) ||
            typeBoosterItems.has(name) ||
            gemItems.has(name) ||
            powerHeldItems.has(name) ||
            evBoosterItems.has(name) ||
            berryItems.has(name) ||
            evolutionItems.has(name);

        // Pockets keyed by gen5 mapper structure. Each pocket is iterated by Object.keys to absorb
        // size differences without hardcoding slot counts.
        const allPockets = ['items', 'medicine', 'balls', 'tmhm', 'berries', 'battle_items', 'key_items'];
        const tmhmPocket = 'tmhm';

        // For each item name, decide whether a new acquisition is critical. tmhm pocket items
        // are always critical (minus the blocked HMs).
        const isCriticalForPocket = (name, pocket) => {
            if (name == null || name === '') return false;
            if (pocket === tmhmPocket) return !isBlockedHm(name);
            if (pocket === 'berries') return true;
            return isCriticalGenericItem(name);
        };

        // Combined ownership snapshot = all pocket item names ∪ team-held items. A "new acquisition"
        // is a name that wasn't recently observed in either source. Pocket reshuffles caused by
        // using/selling other items don't fire because the name was already in the set.
        const readOwnedItems = () => {
            // Map of name -> pocket where first observed (so we can apply pocket-specific filters).
            const map = new Map();
            const bag = this.game?.properties?.bag;
            if (bag) {
                for (const pocket of allPockets) {
                    const slots = bag[pocket];
                    if (!slots) continue;
                    for (const k of Object.keys(slots)) {
                        const v = slots[k]?.item?.value;
                        if (v != null && v !== '' && !map.has(v)) map.set(v, pocket);
                    }
                }
            }
            const team = this.game?.properties?.player?.team;
            if (team) {
                for (let i = 0; i < 6; i++) {
                    const v = team[i]?.held_item?.value;
                    if (v != null && v !== '' && !map.has(v)) map.set(v, 'held');
                }
            }
            return map;
        };

        // Per-item "last seen owned" timestamps. An item is treated as a new acquisition only if
        // it hasn't been observed within OWNERSHIP_MEMORY_MS. A held↔bag move fires two property
        // changes that can be spaced apart; the timestamp window bridges that gap.
        const OWNERSHIP_MEMORY_MS = 2000;
        const lastSeenOwned = new Map();
        {
            const now = Date.now();
            for (const name of readOwnedItems().keys()) lastSeenOwned.set(name, now);
        }

        // Periodic tick keeps timestamps fresh for items the player is currently sitting on with
        // no other activity. Without this, a long-held item taken off the Pokemon would look new.
        this._ownedItemsInterval = setInterval(() => {
            const now = Date.now();
            for (const name of readOwnedItems().keys()) {
                if (lastSeenOwned.has(name)) lastSeenOwned.set(name, now);
            }
        }, 500);

        let ownedCheckTimer = null;
        const checkForNewOwnedItems = () => {
            const now = Date.now();
            const current = readOwnedItems();
            for (const [name, pocket] of current) {
                if (!isCriticalForPocket(name, pocket)) continue;
                const lastSeen = lastSeenOwned.get(name);
                const isNewlyAcquired = (lastSeen == null) || ((now - lastSeen) > OWNERSHIP_MEMORY_MS);
                if (isNewlyAcquired) {
                    const chapterName = "Item - " + name;
                    console.log("Chapter Detected: " + chapterName);
                    this.sendObsChapterMarker(chapterName);
                }
                lastSeenOwned.set(name, now);
            }
        };

        const scheduleOwnedCheck = () => {
            // Refresh timestamps for items currently observed AND within the memory window.
            // Stale entries are not refreshed so genuine re-acquisitions after a long absence fire.
            const now = Date.now();
            for (const name of readOwnedItems().keys()) {
                const lastSeen = lastSeenOwned.get(name);
                if (lastSeen != null && (now - lastSeen) <= OWNERSHIP_MEMORY_MS) {
                    lastSeenOwned.set(name, now);
                }
            }
            if (ownedCheckTimer) clearTimeout(ownedCheckTimer);
            ownedCheckTimer = setTimeout(() => {
                ownedCheckTimer = null;
                checkForNewOwnedItems();
            }, 100);
        };

        // Wire change watchers across every pocket slot the mapper exposes, plus held items.
        const bagRoot = this.game?.properties?.bag;
        if (bagRoot) {
            for (const pocket of allPockets) {
                const slots = bagRoot[pocket];
                if (!slots) continue;
                for (const k of Object.keys(slots)) {
                    const itemProp = slots[k]?.item;
                    if (itemProp && typeof itemProp.change === 'function') {
                        itemProp.change(() => scheduleOwnedCheck());
                    }
                }
            }
        }
        for (let i = 0; i < 6; i++) {
            const heldProp = this.game.properties.player.team[i]?.held_item;
            if (heldProp && typeof heldProp.change === 'function') {
                heldProp.change(() => scheduleOwnedCheck());
            }
        }

        // RARE CANDY USED CHAPTER MARKER
        // Fires "Rare Candy Used" when (in Overworld) the lead's level increments by 1 AND the
        // total Rare Candy count across bag.medicine decrements by 1 within a short window.
        // The two property updates are independent and can land in either order, so we pair them
        // via timestamps and fire once when both have happened recently.
        let lastCandyDecrementAt = 0;
        let lastLeadLevelUpAt = 0;
        const CANDY_PAIR_WINDOW_MS = 1000;

        const tryFireCandyUsed = () => {
            if (this.game?.properties?.meta?.state?.value !== 'Overworld') return;
            const now = Date.now();
            if (now - lastCandyDecrementAt > CANDY_PAIR_WINDOW_MS) return;
            if (now - lastLeadLevelUpAt > CANDY_PAIR_WINDOW_MS) return;
            // Consume both timestamps so a single match fires once.
            lastCandyDecrementAt = 0;
            lastLeadLevelUpAt = 0;
            console.log("Chapter Detected: Rare Candy Used");
            this.sendObsChapterMarker("Rare Candy Used");
        };

        // Lead level increment.
        this.game.properties.player.team[0]?.level?.change((newProp, oldProp) => {
            if ((newProp?.value ?? 0) === (oldProp?.value ?? 0) + 1) {
                lastLeadLevelUpAt = Date.now();
                tryFireCandyUsed();
            }
        });

        // Total Rare Candy count across bag.medicine. Sum-based detection is robust to slot
        // shifts that can happen when the last candy in a slot is consumed.
        const readRareCandyCount = () => {
            let total = 0;
            const medicine = this.game?.properties?.bag?.medicine;
            if (medicine) {
                for (const k of Object.keys(medicine)) {
                    const slot = medicine[k];
                    if (slot?.item?.value === 'Rare Candy') {
                        total += slot?.quantity?.value ?? 0;
                    }
                }
            }
            return total;
        };

        let lastRareCandyCount = readRareCandyCount();
        let candyCheckTimer = null;
        const checkRareCandyDelta = () => {
            const current = readRareCandyCount();
            const previous = lastRareCandyCount;
            lastRareCandyCount = current;
            if (current === previous - 1) {
                lastCandyDecrementAt = Date.now();
                tryFireCandyUsed();
            }
        };
        const scheduleCandyCheck = () => {
            if (candyCheckTimer) clearTimeout(candyCheckTimer);
            candyCheckTimer = setTimeout(() => {
                candyCheckTimer = null;
                checkRareCandyDelta();
            }, 100);
        };

        const medicineRoot = this.game?.properties?.bag?.medicine;
        if (medicineRoot) {
            for (const k of Object.keys(medicineRoot)) {
                const slot = medicineRoot[k];
                if (slot?.item?.change) slot.item.change(() => scheduleCandyCheck());
                if (slot?.quantity?.change) slot.quantity.change(() => scheduleCandyCheck());
            }
        }

        // NEXT POKEMON CHAPTER MARKER (Battle only)
        // Fires "Next Pokemon" whenever battle.opponent.party_position changes during Battle.
        if (!this.game.properties.battle.opponent.party_position) {
            console.error('[OBS chapter marker] battle.opponent.party_position missing from mapper - "Next Pokemon" markers disabled for this session.');
        }
        this.game.properties.battle.opponent.party_position?.change((newProp, oldProp) => {
            if (this.game?.properties?.meta?.state?.value !== 'Battle') return;
            if (newProp?.value === oldProp?.value) return;
            console.log("Chapter Detected: Next Pokemon");
            this.sendObsChapterMarker("Next Pokemon");
        });

        // ENEMY FAINTED CHAPTER MARKER (Battle only)
        // Fires "Enemy Fainted" when battle.opponent.active_pokemon.stats.hp transitions to 0.
        this.game.properties.battle.opponent.active_pokemon?.stats?.hp?.change((newProp, oldProp) => {
            if (this.game?.properties?.meta?.state?.value !== 'Battle') return;
            if (newProp?.value !== 0) return;
            if (oldProp?.value === 0) return;
            console.log("Chapter Detected: Enemy Fainted");
            this.sendObsChapterMarker("Enemy Fainted");
        });

        this.game.properties.player.team[0].exp.change(async (newProp, oldProp) => {
            if (this.expBarAnimation == true) {
                const species = this.game.properties.player.team[0].species.value ?? this.starter;
                const growthRate = this.g5PokemonData[species]?.growth_rate ?? this.g5PokemonData[this.starter].growth_rate;
                const expPoints = newProp.value;
                const newExpStats = this.calcExpStats(growthRate, expPoints);

                this.expBarState.species = species;
                this.expBarState.expPoints = expPoints;

                if (this.$refs.expBar) {
                    this.$refs.expBar.setWidth((newExpStats.percent * 100) + "%");
                }
            }
        })
        this.game.properties.battle.player.active_pokemon.exp.change(async (newProp, oldProp) => {
            if (this.game.properties.meta.state.value == "Battle") {
                if (this.expBarAnimation == true) {
                    const prevSpecies = this.expBarState.species;
                    const prevExpPoints = this.expBarState.expPoints;
                    const prevGrowthRate = this.g5PokemonData[prevSpecies].growth_rate;
                    const prevExpStats = this.calcExpStats(prevGrowthRate, prevExpPoints);

                    const newSpecies = this.game.properties.player.team[0].species.value;
                    const newExpPoints = newProp.value;
                    const newGrowthRate = this.g5PokemonData[newSpecies].growth_rate;
                    const newExpStats = this.calcExpStats(newGrowthRate, newExpPoints);

                    if (newExpPoints > 1640000) { return } // max exp is 1,640,000

                    this.expBarState.species = newSpecies;
                    this.expBarState.expPoints = newExpPoints;
    
                    // did we switch out?
                    if (prevSpecies != newSpecies) {
                        // dont animate, just set newExpStats.percent
                        if (this.$refs.expBar) {
                            this.$refs.expBar.setWidth((newExpStats.percent * 100) + "%");
                        }
                    } 
                    // same pokemon but exp changed
                    else {
                        if (prevExpPoints == newExpPoints) { 
                            return
                        }

                        // animate (core/overlay/player/ExpBar.ts, timed in playerPanel.ts)
                        if (this.$refs.expBar) {
                            await this.$refs.expBar.animate(prevExpStats, newExpStats);
                        }
                    }
                    if (this.$refs.expBar) {
                        this.$refs.expBar.setTransition(null);
                    }
                }
            }
        })
        //keybinds
        this.unbindHotkeys = bindShortcuts({ actions: gen5Actions(this), namespace: "gen5", title: "Generation 5", gameLoaded: true });

        // The control server (port 30159) lives in the main process and is bound to
        // games/gen5/control.ts by main.ts; the client is main.ts's too, so the
        // beforeunload cleanup that closed both is gone with them.

        // Enemy sprite resize tool is dev-only. Packaged builds consume
        // enemy_sprite_scales.js read-only — no listeners attached.
        if (this.isInDevMode) {
            window.addEventListener('keydown', this._devKeydown = (e) => {
                // Style mode owns Enter/Backspace/Escape: Enter commits + advances,
                // Backspace discards + steps back, Escape exits.
                if (this.style_mode_active) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.styleModeAdvance();
                        return;
                    }
                    if (e.key === 'Backspace') {
                        e.preventDefault();
                        this.styleModeBack();
                        return;
                    }
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        this.exitStyleMode();
                        return;
                    }
                    // Fall through so arrow keys / F1 still nudge/flip the current sprite.
                }
                if (!this.enemyResize.species) return;
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.commitEnemySpriteResize();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this.cancelEnemySpriteResize();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.nudgeEnemySpriteY(e.shiftKey ? -10 : -1);
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.nudgeEnemySpriteY(e.shiftKey ? 10 : 1);
                } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    this.nudgeEnemySpriteX(e.shiftKey ? -10 : -1);
                } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    this.nudgeEnemySpriteX(e.shiftKey ? 10 : 1);
                } else if (e.key === 'F1') {
                    e.preventDefault();
                    this.toggleEnemySpriteFlip();
                }
            });

            // Ctrl+Click on an enemy sprite enters resize mode. Listen in capture
            // phase at the window level so the click is received even if a higher
            // overlay (trainer graphic, canvas etc.) sits on top of the sprite.
            window.addEventListener('mousedown', this._devMousedown = (e) => {
                if (!e.ctrlKey) return;
                if (e.button !== 0) return;
                const els = document.elementsFromPoint(e.clientX, e.clientY);
                const sprite = els.find((el) => el && el.classList && el.classList.contains('ePkmnSprite'));
                if (!sprite) return;
                const slot = parseInt(sprite.dataset.enemySlot, 10);
                const species = sprite.dataset.enemySpecies;
                if (!species || Number.isNaN(slot)) return;
                e.preventDefault();
                e.stopPropagation();
                this.enemyResize = { species, slot, baseSize: 108, spriteEl: sprite };
                this.enemyScaleVersion++;
            }, true);
        }
    },
});
</script>
