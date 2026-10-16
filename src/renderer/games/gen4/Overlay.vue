<template>
<div>

            <!-- Keyed by the texture path so swapping textures cross-fades old/new instead of popping -->
            <transition name="styleFade">
                <img class="canvas" ref="background_texture" :key="textures[backgroundTexture]" :src="textures[backgroundTexture]" :style="background_texture_style">
            </transition>
            <img class="canvas" :src="`images/gen4/elements/pokeball.webp`">
            <!-- Keyed by the displayed species so starter changes, evolution-dropdown swaps and
                 mid-run evolutions cross-fade old/new art. No inline opacity here: it would
                 override the styleFade classes, so the fade is left entirely to the transition -->
            <species-art ref="pokemon_art" img-class="pokemon_art" v-bind="species_art_look" transition="styleFade" :art-key="displayedPokemonSpecies" :src="`images/gen4/pokemon/${displayedPokemonSpecies}.webp`"></species-art>
            <img class="canvas colored-image ds" src="images/gen4/ui/game_area.svg">
            <div class="colored-image ds" :style="`filter: saturate(${ui_saturation}) drop-shadow(0px 1px 1px)`" style="--url: url(images/gen4/ui/timer.svg)"></div>
            <div class="colored-image ds" :style="`filter: saturate(${ui_saturation}) drop-shadow(0px 1px 1px)`" style="--url: url(images/gen4/ui/moveset.svg)"></div>
            <div class="colored-image ds" :style="`filter: saturate(${ui_saturation}) drop-shadow(0px 1px 1px)`" style="--url: url(images/gen4/ui/moveset.svg)"></div>
            <div class="colored-image ds" :style="`filter: saturate(${ui_saturation}) drop-shadow(0px 1px 1px)`" style="--url: url(images/gen4/ui/stats.svg)"></div>
            <div class="colored-image ds" :style="`filter: saturate(${ui_saturation}) drop-shadow(0px 1px 1px)`" style="--url: url(images/gen4/ui/ability.svg)"></div>
            <div class="colored-image ds" :style="`filter: saturate(${ui_saturation}) drop-shadow(0px 1px 1px)`" style="--url: url(images/gen4/ui/heldItem.svg)"></div>
            <!-- The "gametime" box shows where the type badges were once an HG/SS run ends (decision 24): 59px lower than its picture, as gen5's -->
            <div v-show="run_complete" class="colored-image ds" :style="`filter: saturate(${ui_saturation}) drop-shadow(0px 1px 1px)`" style="--url: url(images/gen4/ui/gametime.svg); top: 59px;"></div>
            <img class="canvas colored-image ds" :src="`images/gen4/ui/stats_values.svg`">
            <div v-if="show_nature_changes == true && (stats_setting == 'Automatic' || stats_setting == 'Base Stats')">
                <img class="canvas colored-image ds" :src="`images/gen4/ui/nature arrows/raises/${natures[pkmnNature].raises}.svg`">
                <img class="canvas colored-image ds" :src="`images/gen4/ui/nature arrows/lowers/${natures[pkmnNature].lowers}.svg`">
            </div>

            <img class="canvas" :src="`images/gen4/ui/move_backgrounds.webp`">

            <!-- FAULTS COUNTERS (core/overlay/player/FaultsBox.ts, laid out in playerPanel.ts) -->
            <faults-box :layout="faults_layout" :mode="blackouts_resets" :resets="fault_resets" :blackouts="fault_blackouts" :font-sizes="faults_font_sizes" :frame-style="`filter: saturate(${ui_saturation}) drop-shadow(0px 0px 1px #000000)`"></faults-box>
            <game-clock :shuckie="shuckie_timer == true" :hidden="timer_frame_live"></game-clock>
            <!-- The clock in its own process (core/overlay/ClockFrame.ts); the two above show until it is up. -->
            <clock-frame :gen="4" @live="timer_frame_live = $event"></clock-frame>

            <div>
                <img v-if="game.properties.meta.game_name.value == 'Diamond and Pearl'" class="canvas" :src="`images/gen4/new_ui/progress sinnoh.webp`">
                <img v-else-if="game.properties.meta.game_name.value == 'Platinum'" class="canvas" :src="`images/gen4/new_ui/progress sinnoh.webp`">
                <img style="top: 1px; position: absolute;" v-else-if="game.properties.meta.game_name.value == 'HeartGold and SoulSilver' && kanto_badges == true" class="canvas" :src="`images/gen4/new_ui/progress kanto.webp`">
                <img style="top: 1px; position: absolute;" v-else-if="game.properties.meta.game_name.value == 'HeartGold and SoulSilver'" class="canvas" :src="`images/gen4/new_ui/progress johto.webp`">
            </div>

            <!-- The settings panel (core/settings/SettingsPanel.vue), described in settingsPanel.ts. The templates below
                 are the few pieces that stay markup: they render inside the panel, in its look. -->
            <settings-panel :panel="settingsPanel">
                <template #editor>
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
                </template>
                <template #devtools>
                    <div class="stp-hint">{{ isInDevMode ? "Development mode: changes save to the defaults" : "Production mode: changes save locally" }}</div>
                    <button v-if="isInDevMode" class="stp-btn" @click="exportStyleSettingsAsDefaults()">Export All Settings as Defaults</button>
                    <button class="stp-btn" @click="resetCurrentPokemonToDefaults()">Reset Current Pokémon to Defaults</button>
                    <confirm-button class="stp-btn stp-btn-danger" label="Reset ALL to Defaults" confirm-label="Click again to reset ALL" @confirm="resetAllStyleSettingsToDefaults()"></confirm-button>
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
            <div v-if="game.properties.meta.game_name.value == 'HeartGold and SoulSilver'">
                <div v-if="kanto_badges == false" style="position: absolute; top: 1px;">
                    <badge-row v-bind="badge_row.johto"></badge-row>
                </div>
                <div v-else="">
                    <badge-row v-bind="badge_row.kanto"></badge-row>
                </div>
            </div>
            <div>
                <badge-row v-bind="badge_row.sinnoh"></badge-row>
            </div>


            <!-- Moveset -->
            
            <!-- One table per move slot, laid out 1 2 / 3 4 (core/overlay/player/MoveList.ts, laid out in playerPanel.ts) -->
            <move-list :list="player_move_list" :layout="move_list_layout"></move-list>

            <!-- Right Hand Information Area -->
            <transition name="fadeBattle">
                <!-- Style Mode (dev only): replaces the live right panel with a
                     dummy slot-0 enemy graphic so every species can be styled.
                     Layout mirrors the live "Enemy Team Display" block below
                     (single slot) with dummy stats/moves so all surrounding
                     graphics render. -->
                <div v-if="isInDevMode && style_mode_active" style="position: absolute;" key="style_mode">
                    <div class="trainerLabel">{{ styleModeCurrentSpecies() }} {{ style_mode_index + 1 }}/{{ style_mode_species_list.length }}</div>
                    <div class="colored-image ds" :style="`height: 233px; filter: saturate(${ui_saturation}) drop-shadow(0px 0px 1px #000000)`" style="--url: url(images/gen4/new_ui/enemy.svg)"></div>
                    <div>
                        <div>
                            <div class="enemyStatsArea colored-image" :style="`--overlay-color: ${overlay_color}; --url: url(images/gen4/new_ui/enemy_moves/0.svg)`"></div>
                        </div>
                        <img class="enemyStatsArea eFaintTransition red-svg" :src="`images/gen4/new_ui/comp/0.svg`">
                        <img :src="`images/gen4/new_ui/stats/0.svg`" class="enemyPng eFaintTransition">
                    </div>
                    <div class="enemyGraphic">
                        <div class="eFaintTransition">
                            <div class="border slots ePkmnStyle ePkmn0">
                                <img class="ePkmnSprite ePkmnSpriteResizing" :data-enemy-slot="0" :data-enemy-species="styleModeCurrentSpecies()" :style="{ transform: enemyTransformFor(styleModeCurrentSpecies()), filter: `drop-shadow(${getEnemySpriteFlipped(styleModeCurrentSpecies()) ? -2 : 2}px 2px 2px #000) saturate(1.1)` }" :src="`images/gen4/pokemon/${speciesSpecialCharacters(styleModeCurrentSpecies())}.webp`">
                                <div class="ePkmnLvlSpecies">{{ styleModeCurrentSpecies() }}</div>
                                <div class="ePkmnLevel">Level: 50</div>
                                <div class="ePkmnAbility">{{ g4PokemonData[styleModeCurrentSpecies()]?.abilities?.[0] ?? '' }}</div>
                                <div style="left: 2px;" class="border ePkmnTyping">
                                    <img class="icons moveIcon" :src="`images/gen4/type-icons-circular/${g4PokemonData[styleModeCurrentSpecies()]?.type_1?.toLowerCase()}.webp`">
                                    <img v-show="g4PokemonData[styleModeCurrentSpecies()]?.type_1 != g4PokemonData[styleModeCurrentSpecies()]?.type_2" class="icons moveIcon" :src="`images/gen4/type-icons-circular/${g4PokemonData[styleModeCurrentSpecies()]?.type_2?.toLowerCase()}.webp`">
                                </div>
                                <div class="border ePkmnStats">
                                    <div class="ePkmnStatsLabelsStyle ePkmnStatsLabelColumn1 ePkmnHpLabel">Hp:</div>
                                    <div class="ePkmnStatsLabelsStyle ePkmnStatsLabelColumn1 ePkmnAtkLabel">Atk:</div>
                                    <div class="ePkmnStatsLabelsStyle ePkmnStatsLabelColumn1 ePkmnDefLabel">Def:</div>
                                    <div class="ePkmnStatsLabelsStyle ePkmnStatsLabelColumn2 ePkmnSpeLabel">Spe:</div>
                                    <div class="ePkmnStatsLabelsStyle ePkmnStatsLabelColumn2 ePkmnSpaLabel">SpA:</div>
                                    <div class="ePkmnStatsLabelsStyle ePkmnStatsLabelColumn2 ePkmnSpdLabel">SpD:</div>

                                    <div class="ePkmnStatsStyle ePkmnStatsLabelColumn1 ePkmnHp  opacityTransition">{{ g4PokemonData[styleModeCurrentSpecies()]?.base_hp      ?? 100 }}</div>
                                    <div class="ePkmnStatsStyle ePkmnStatsLabelColumn1 ePkmnAtk opacityTransition">{{ g4PokemonData[styleModeCurrentSpecies()]?.base_atk     ?? 50 }}</div>
                                    <div class="ePkmnStatsStyle ePkmnStatsLabelColumn1 ePkmnDef opacityTransition">{{ g4PokemonData[styleModeCurrentSpecies()]?.base_def     ?? 50 }}</div>
                                    <div class="ePkmnStatsStyle ePkmnStatsLabelColumn2 ePkmnSpe opacityTransition">{{ g4PokemonData[styleModeCurrentSpecies()]?.base_spd     ?? 50 }}</div>
                                    <div class="ePkmnStatsStyle ePkmnStatsLabelColumn2 ePkmnSpa opacityTransition">{{ g4PokemonData[styleModeCurrentSpecies()]?.base_spc_atk ?? 50 }}</div>
                                    <div class="ePkmnStatsStyle ePkmnStatsLabelColumn2 ePkmnSpd opacityTransition">{{ g4PokemonData[styleModeCurrentSpecies()]?.base_spc_def ?? 50 }}</div>
                                </div>
                                <div class="border ePkmnMoves">
                                    <table class="enemyMovesetTable">
                                        <tbody><tr v-for="(dummy, i) in style_mode_dummy_moves">
                                            <th><img class="icons moveIcon" :src="`images/gen4/type-icons-circular/${dummy.type}.webp`"></th>
                                        </tr>
                                    </tbody></table>
                                    <div v-for="(dummy, i) in style_mode_dummy_moves" :class="`ePkmnMoveStyle ePkmnMove${i + 1}`">{{ dummy.name }}</div>
                                </div>
                                <div class="ePkmnSpeedComparison">Outsped</div>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- Enemy Team Display -->
                <!-- Decision 27: only Automatic and Trainers show it (Movepool and Splits keep their panel). It follows the
                     setting, not a post-battle Splits, so a gym leader's team stays up until enemy_graphic ends, as before. -->
                <div v-else-if="enemy_graphic == true && (right_ui == 'Automatic' || right_ui == 'Trainers')" style="position: absolute;" key="1">
                    <!-- The enemy team panel (core/overlay/EnemyTeamPanel.ts), laid out in enemyPanel.ts. -->
                    <enemy-team-panel :view="enemy_team_view" :layout="enemy_team_layout"></enemy-team-panel>
                </div>
                <!-- Show Wild Battles (decision 30): the wild Pokémon in the same panel, during the battle. -->
                <div v-else-if="(right_ui == 'Automatic' || right_ui == 'Trainers') && wild_pokemon_view" style="position: absolute;" key="9">
                    <enemy-team-panel :view="wild_pokemon_view" :layout="enemy_team_layout"></enemy-team-panel>
                </div>
                <!-- Trainers (decision 14): the picked trainer's team in the same panel, outside a trainer battle. -->
                <div v-else-if="right_panel_mode == 'Trainers' && trainer_preview_view" style="position: absolute;" key="8">
                    <enemy-team-panel :view="trainer_preview_view" :layout="enemy_team_layout"></enemy-team-panel>
                </div>
                <!-- Splits -->
                <div v-else-if="right_panel_mode == 'Splits'" key="3" class="posAbs">
                    <div v-if="splitsView">
                        <splits-panel :view="splitsView" />
                    </div>
                </div>
                <!-- Movepool -->
                <div v-else="" key="7" :style="evolution_transitioning ? `filter: drop-shadow(0px 1px 1px); opacity: ${movepoolOpacity}; transition: ${movepoolTransition};` : `filter: drop-shadow(0px 1px 1px);`">
                    <movepool :view="movepoolView">
                        <div class="colored-image ds" :style="`filter: saturate(${ui_saturation})`" style="--url: url(images/gen4/ui/movepool.svg)"></div>
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
            <div class="posAbs labelAbility" style="font-family: play; top: 813px; left: 496px;">
                <div class="posAbs ">Ability:</div>
                <div class="posAbs" style="left: 487px; width: 200px;">Held Item:</div>
            </div>
            <div v-if="game.properties.meta.state.value == 'No Pokemon'" class="ability">{{pkmn_ability}}</div>
            <div v-else-if="game.properties.meta.state.value != 'No Pokemon'" class="ability">{{game.properties.player?.team[0]?.ability?.value}}</div>
            <div class="heldItem">{{heldItem}}</div>
            <div class="genericLabels timerLabel">time played at 4x game speed</div>

            <!-- Voltorb Flip -->
            <div class="posAbs" v-if="game.properties.meta.game_name.value == 'HeartGold and SoulSilver'">
                <transition name="fade1">
                    <div v-if="voltorb_flip == true">
                        <div class="colored-image ds" :style="`filter: saturate(${ui_saturation}) drop-shadow(0px 1px 1px)`" style="--url: url(images/gen4/new_ui/voltorb_flip.svg)"></div>
                        <!-- <div class="colored-image ds" :style="`filter: saturate(${ui_saturation}) drop-shadow(0px 1px 1px)`" style="--url: url(images/gen4/ui/coins.svg)"></div>
                        <div  class="genericLabels voltorb_flip_data coinsLabel">coins:</div>
                        <div  class="genericLabels voltorb_flip_data coinsValue">{{game.properties.bag.coins.value}}</div>
                        <div  class="genericLabels voltorb_flip_data roundLabel">round:</div>
                        <div  class="genericLabels voltorb_flip_data roundValue">{{game.properties.screen.voltorb_flip.information.round_coins.value}}</div> -->
                        <table class="voltorb_flip"> 
                            <tbody><tr>
                                <td><img :src="`images/gen4/voltorb_flip/${game.properties.screen.voltorb_flip.value.row_1.a.value}.webp`" :style="voltorb_flip_style(game.properties.screen.voltorb_flip.value.row_1.a.value)"></td>
                                <td><img :src="`images/gen4/voltorb_flip/${game.properties.screen.voltorb_flip.value.row_1.b.value}.webp`" :style="voltorb_flip_style(game.properties.screen.voltorb_flip.value.row_1.b.value)"></td>
                                <td><img :src="`images/gen4/voltorb_flip/${game.properties.screen.voltorb_flip.value.row_1.c.value}.webp`" :style="voltorb_flip_style(game.properties.screen.voltorb_flip.value.row_1.c.value)"></td>
                                <td><img :src="`images/gen4/voltorb_flip/${game.properties.screen.voltorb_flip.value.row_1.d.value}.webp`" :style="voltorb_flip_style(game.properties.screen.voltorb_flip.value.row_1.d.value)"></td>
                                <td><img :src="`images/gen4/voltorb_flip/${game.properties.screen.voltorb_flip.value.row_1.e.value}.webp`" :style="voltorb_flip_style(game.properties.screen.voltorb_flip.value.row_1.e.value)"></td>
                            </tr>
                            <tr>
                                <td><img :src="`images/gen4/voltorb_flip/${game.properties.screen.voltorb_flip.value.row_2.a.value}.webp`" :style="voltorb_flip_style(game.properties.screen.voltorb_flip.value.row_2.a.value)"></td>
                                <td><img :src="`images/gen4/voltorb_flip/${game.properties.screen.voltorb_flip.value.row_2.b.value}.webp`" :style="voltorb_flip_style(game.properties.screen.voltorb_flip.value.row_2.b.value)"></td>
                                <td><img :src="`images/gen4/voltorb_flip/${game.properties.screen.voltorb_flip.value.row_2.c.value}.webp`" :style="voltorb_flip_style(game.properties.screen.voltorb_flip.value.row_2.c.value)"></td>
                                <td><img :src="`images/gen4/voltorb_flip/${game.properties.screen.voltorb_flip.value.row_2.d.value}.webp`" :style="voltorb_flip_style(game.properties.screen.voltorb_flip.value.row_2.d.value)"></td>
                                <td><img :src="`images/gen4/voltorb_flip/${game.properties.screen.voltorb_flip.value.row_2.e.value}.webp`" :style="voltorb_flip_style(game.properties.screen.voltorb_flip.value.row_2.e.value)"></td>
                            </tr>
                            <tr>
                                <td><img :src="`images/gen4/voltorb_flip/${game.properties.screen.voltorb_flip.value.row_3.a.value}.webp`" :style="voltorb_flip_style(game.properties.screen.voltorb_flip.value.row_3.a.value)"></td>
                                <td><img :src="`images/gen4/voltorb_flip/${game.properties.screen.voltorb_flip.value.row_3.b.value}.webp`" :style="voltorb_flip_style(game.properties.screen.voltorb_flip.value.row_3.b.value)"></td>
                                <td><img :src="`images/gen4/voltorb_flip/${game.properties.screen.voltorb_flip.value.row_3.c.value}.webp`" :style="voltorb_flip_style(game.properties.screen.voltorb_flip.value.row_3.c.value)"></td>
                                <td><img :src="`images/gen4/voltorb_flip/${game.properties.screen.voltorb_flip.value.row_3.d.value}.webp`" :style="voltorb_flip_style(game.properties.screen.voltorb_flip.value.row_3.d.value)"></td>
                                <td><img :src="`images/gen4/voltorb_flip/${game.properties.screen.voltorb_flip.value.row_3.e.value}.webp`" :style="voltorb_flip_style(game.properties.screen.voltorb_flip.value.row_3.e.value)"></td>
                            </tr>
                            <tr>
                                <td><img :src="`images/gen4/voltorb_flip/${game.properties.screen.voltorb_flip.value.row_4.a.value}.webp`" :style="voltorb_flip_style(game.properties.screen.voltorb_flip.value.row_4.a.value)"></td>
                                <td><img :src="`images/gen4/voltorb_flip/${game.properties.screen.voltorb_flip.value.row_4.b.value}.webp`" :style="voltorb_flip_style(game.properties.screen.voltorb_flip.value.row_4.b.value)"></td>
                                <td><img :src="`images/gen4/voltorb_flip/${game.properties.screen.voltorb_flip.value.row_4.c.value}.webp`" :style="voltorb_flip_style(game.properties.screen.voltorb_flip.value.row_4.c.value)"></td>
                                <td><img :src="`images/gen4/voltorb_flip/${game.properties.screen.voltorb_flip.value.row_4.d.value}.webp`" :style="voltorb_flip_style(game.properties.screen.voltorb_flip.value.row_4.d.value)"></td>
                                <td><img :src="`images/gen4/voltorb_flip/${game.properties.screen.voltorb_flip.value.row_4.e.value}.webp`" :style="voltorb_flip_style(game.properties.screen.voltorb_flip.value.row_4.e.value)"></td>
                            </tr>
                            <tr>
                                <td><img :src="`images/gen4/voltorb_flip/${game.properties.screen.voltorb_flip.value.row_5.a.value}.webp`" :style="voltorb_flip_style(game.properties.screen.voltorb_flip.value.row_5.a.value)"></td>
                                <td><img :src="`images/gen4/voltorb_flip/${game.properties.screen.voltorb_flip.value.row_5.b.value}.webp`" :style="voltorb_flip_style(game.properties.screen.voltorb_flip.value.row_5.b.value)"></td>
                                <td><img :src="`images/gen4/voltorb_flip/${game.properties.screen.voltorb_flip.value.row_5.c.value}.webp`" :style="voltorb_flip_style(game.properties.screen.voltorb_flip.value.row_5.c.value)"></td>
                                <td><img :src="`images/gen4/voltorb_flip/${game.properties.screen.voltorb_flip.value.row_5.d.value}.webp`" :style="voltorb_flip_style(game.properties.screen.voltorb_flip.value.row_5.d.value)"></td>
                                <td><img :src="`images/gen4/voltorb_flip/${game.properties.screen.voltorb_flip.value.row_5.e.value}.webp`" :style="voltorb_flip_style(game.properties.screen.voltorb_flip.value.row_5.e.value)"></td>
                            </tr>
                        </tbody></table>
                    </div>
                </transition>   
            </div>

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

            <!-- Gametime -->
            <transition name="fade1">
                <div v-show="run_complete">
                    <div class="genericLabels gametimeLabel">gametime</div>
                    <div id="gametime_display" style="top: 701px; left: 119px; font-size: 35px; width: 210px; border: 1px solid #ff000000;" class="resets">
                        <div>{{simple_data[7]}}</div>
                    </div>
                </div>
            </transition>

            <!-- Enemy sprite resize handle (dev mode only). Teleported to body. -->
            <teleport to="body" v-if="isInDevMode">
                <div v-if="enemyResize.species && enemySpriteHandlePosition()" class="ePkmnSpriteResizeHandle" :style="enemySpriteHandlePosition()" @mousedown="onEnemyResizeHandleMouseDown($event)" title="Drag to resize. Arrows move (Shift = 10px). F1 flips. Enter saves, Escape cancels."></div>
            </teleport>
        
</div>
</template>

<script>
/**
 * gen4's overlay: Platinum, Diamond & Pearl, HeartGold & SoulSilver (plan 2.4,
 * lifted 2026-09-11).
 *
 * This is the component object from the legacy `frontend.js` (10,140 lines, one
 * `Vue.createApp` call) and the `#app` markup from its `index.html`, brought in as an
 * SFC with the infrastructure swapped for the shared core and *nothing else changed*
 * (tools/port/lift-gen4.py does the swaps and asserts each one):
 *
 *   - `this.mapper.X`   -> `this.game.X`: the session main.ts builds -- the profile's
 *                          canonical view as `properties`, plus `setBits`. The
 *                          component no longer constructs or connects a client; what
 *                          was its `onMapperLoaded` callback runs at the top of
 *                          `mounted`, in the same order, and its four `deboucePath`
 *                          calls are the module's `debouncePaths`. gen4's own computed
 *                          `game` (its game_variables entry) is `game_data` now, so the
 *                          prop does not shadow it.
 *   - `MyStorage`       -> games/gen4/storage.ts (the file-backed layered store, with
 *                          gen4's key rule, style-field filter and debounced write).
 *   - keyhook block     -> games/gen4/actions.ts through core/shortcuts.
 *   - control server    -> games/gen4/control.ts, bound by main.ts (plan 1.8).
 *   - OBS marker method -> core/logic/obs.ts (the same exchange, plan 1.9).
 *   - logData/logCopy   -> games/gen4/splits.js over the splits IPC.
 *   - `<script src>`    -> imports of games/gen4/data/**.js.
 *   - set-game-icon     -> the shell, from the detected game (src/renderer/main.ts).
 *   - openFolder        -> the splits IPC.
 *   - `images/...`      -> `images/gen4/...` everywhere (template, script,
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
import { computed, defineComponent, markRaw } from "vue";
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
import { gen4SettingsPanel } from "./settingsPanel";
import { findKeyIgnoringCase } from "~/core/logic/caseInsensitiveLookup";
import { gen45OhkoAccuracy, isOhkoMove, ohkoPowerText } from "~/core/logic/ohkoAccuracy";
import { flailReversalPower, gyroBallPower, punishmentPower, trumpCardPower, wringOutPower } from "~/core/logic/movePower";
import { gen45TurnOrder, gen45TurnOrderSpeed } from "~/core/logic/battleSpeed";
import { moveAccuracy as calcMoveAccuracy } from "~/core/logic/moveAccuracy";
import { bindShortcuts } from "~/core/shortcuts/engine";
import { addSplitBookmark, sendChapterMarker, shuckieBookmarksEnabled } from "~/core/logic/shuckieBookmarks";
import { pickSplitComparison } from "~/core/logic/splitComparison";
import { checkMapperForChapterMarkerProperties } from "~/core/logic/chapterMarkerProperties";
import { markReminderMoves } from "~/core/logic/moveReminder";
import { formatStage } from "~/core/logic/statFormat";
import { clampIvs, IV_MODE } from "~/core/logic/starterIvs";
import { revealSplitFolder, splitPath } from "~/core/persistence/splitFiles";
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
import { gen4Actions } from "./actions";
// loadCsvFile: only `load_temp_splits` (legacy, unreferenced) still uses it; the comparison picker is core's.
import { loadCsvFile, logData, logCopy, transition } from "./splits.js";
import { auto_save_settings } from "./data/auto_save_settings.js";
import { autosplitter } from "./data/autosplitter.js";
import { cross_generation_moves } from "./data/moves/cross_generation_moves.js";
import { default_colors } from "./data/default_colors.js";
import { g4MoveData } from "./data/g4MoveData.js";
import { g4PokemonData } from "./data/g4PokemonDataPlat.js";
import { g4tmhmMapping } from "./data/g4tmhmMapping.js";
import { game_variables } from "./data/game_variables.js";
import { generation4_moves_new } from "./data/moves.js";
import { hiddenPowerTypes } from "./data/hiddenPowerTypes.js";
import { hiddenpower_type_selector } from "./data/hiddenpower.js";
import { hiddenpowers } from "./data/hiddenpower-all.js";
import { natural_gift } from "./data/moves/natural_gift.js";
import { natures } from "./data/natures.js";
import { platinum_moves } from "./data/platinum_moves.js";
// `platinum_trainers.js` was a byte-identical copy of `trainers/platinum.js` (known-legacy-bugs.md #15),
// both loaded; the one table serves both names (docs/performance-followups.md, third pass).
import { trainers_plat as platinum_trainers } from "./data/trainers/platinum.js";
import { pokedex_dp } from "./data/pokedex/diamond_pearl.js";
import { pokedex_hgss } from "./data/pokedex/heartgold_soulsilver.js";
import { pokedex_plat } from "./data/pokedex/platinum.js";
import { POKEMON_FORMS, POKEMON_FORM_INFO, DEFAULT_FORM_ALIASES } from "./forms.js";
import { post_game_moves } from "./data/post_game_moves.js";
import { stageModifiersData } from "./data/stageModifiers.js";
import { textures } from "./data/textures.js";
import { tmhm } from "./data/misc/tmhm.js";
import { trainers_dp } from "./data/trainers/diamond_pearl.js";
import { trainers_hgss } from "./data/trainers/heartgold_soulsilver.js";
import { trainers_plat } from "./data/trainers/platinum.js";
import { typeBoostingItems } from "./data/typeBoostingItems.js";
import { typeData } from "./data/type-effectiveness.js";
import { typeEffectivenessArray } from "./data/type effectiveness array.js";
import { unobtainable_moves } from "./data/moves/unobtainable_moves.js";

// Implicit globals of the legacy classic script, see tools/port/lift-gen4.py.
let attack, basePower, battle_end, calculated_stats, damageMax, damageMin, debugging_mode, defense, encounters_off, encounters_on, fling_power, gen3abilities, h, level, m, maxPercentage, minPercentage, modifier_table, nature, newColor, part1, part2, part3, part4, pid, power, shuckie_blackouts, shuckie_resets, specialA, specialD, stab, stageModification, starterType, timecode, turn_count, type, type1, type2, typeString, usableVitamins, vitaminsUsed;

export default defineComponent({
    mixins: [enemySpriteStyleMixin({ enemySpriteScaleManager }), formattersMixin, naturesMixin, manualIvsMixin, speciesArtMixin, overlayCommonMixin, battleMathMixin, dsPairMixin, rightPanelModeMixin("right_ui")],
    components: { ClockFrame, FaultsBox, MoveList, PopupBox, GameClock, ConfirmButton, SettingsPanel, Movepool, SplitsPanel, EnemyTeamPanel, StatTiles, ExpBar, BadgeRow, SpeciesArt, TypeBadges, InfoRow },
    props: ["game"],
    provide() {
        // What <live-text> shows (core/overlay/LiveText.ts): the Super Shuckie time and the timer text,
        // which change every poll or frame. Read here through computeds the child renders, so
        // this component's own render is not a dependent of them and does not re-run at
        // that rate (docs/performance-followups.md, third pass).
        return {
            liveText: {
                shuckie_clock:  computed(() => this.formatMilliseconds(this.emulatorStats?.time_current)),
                shuckie_frames: computed(() => "." + this.getCentiseconds(this.emulatorStats?.time_current)),
                timer_clock:    computed(() => this.timer_formatted_time[0]),
                timer_frames:   computed(() => this.timer_formatted_time[1]),
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
            // Dev-only opt-out so footage stays congruent with content filmed before the resize feature shipped.
            // Packaged builds ignore this flag and always apply the styles.
            enemy_sprite_styles_enabled  : MyStorage['enemy_sprite_styles_enabled'] ?? true,

            // Style Mode (dev only): iterate every species in g4PokemonData
            // showing each in slot 0 with the resize handle active.
            // Enter commits + advances; Backspace discards + steps back.
            style_mode_active            : false,
            style_mode_index             : 0,
            style_mode_species_list      : [],
            style_mode_dummy_moves       : [
                { name: 'Tackle',     type: 'normal' },
                { name: 'Water Gun',  type: 'water'  },
                { name: 'Ember',      type: 'fire'   },
                { name: 'Vine Whip',  type: 'grass'  },
            ],

            mapper                       : null,
            state                        : "No Pokemon",
            editor                       : false,

            // Enemy sprite resize tool (Ctrl+Click on an enemy sprite, dev-only)
            enemyResize                  : { species: null, slot: null, baseSize: 108, spriteEl: null },
            enemyScaleVersion            : 0,
            game_variables               : null,
            autosplitter_toggle          : true,
            evolution                    : false,
            evolution_splits_label       : "",

            emulatorStatsInterval        : null,
            emulatorStats                : null,

            shuckie_timer                : MyStorage['shuckie_timer']                ?? false,
            shuckie_counters             : MyStorage['shuckie_counters']             ?? false,
            shuckie_bookmarks            : shuckieBookmarksEnabled(),

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
            is_validating_starter        : false, // Flag to prevent recursive updates in starter watcher
            is_validating_evolution_species: false, // Flag to prevent recursive updates in selected_evolution_species watcher
            frame                        : false,
            selected_game                : MyStorage['selected_game'] ?? "Platinum",
            starter_choice               : "Turtwig",
            refilming_mode               : false,
            show_advanced_settings       : MyStorage['show_advanced_settings']        ?? false,
            legacy_starter_assignment    : MyStorage['legacy_starter_assignment']     ?? false,
            catch_rate                   : MyStorage['catch_rate'] ?? false,
            previous_splits              : MyStorage['previous_splits']     ?? [],
            previous_splits_source       : MyStorage['previous_splits_source'] ?? null,
            current_splits               : MyStorage['current_splits']      ?? [],
            collect_split_data           : MyStorage["collect_split_data"]  ?? true,
            previous_label               : MyStorage['previous_label'] ?? "Previous",
            current_label                : MyStorage['current_label']  ?? "Current",
            automatic_post_battle_splits : MyStorage['automatic_post_battle_splits'] ?? true,
            split_type                   : MyStorage['split_type']       ?? "First",
            right_ui: "Automatic",
            debugging_mode               : MyStorage['debugging_mode']     ?? true,
            collect_split_data           : MyStorage['collect_split_data'] ?? true,
            unobtainable_moves_toggle    : MyStorage['unobtainable_moves_toggle'] ?? "Always Cross Out",
            banned_hidden_power          : MyStorage['banned_hidden_power']       ?? true,

            // Fix for Resets and Blackouts incrementing twice instead of just once
            disallow_faults: false,
            disallow_delay : 2000,
            
            // Editor variables
            move1_replacement: "",
            move2_replacement: "",
            move3_replacement: "",
            move4_replacement: "",
            item1_replacement: "Rare Candy",
            item2_replacement: "PP Up",
            item3_replacement: "Full Restore",
            item4_replacement: "Max Elixir",

            // POKEMON CONFIG (components) ---------------------------------//
            starter                : "Heatran",
            pkmnNature             : "Adamant",
            pkmn_gender            : "Female",
            pkmn_ability           : null,
            hidden_power_type      : "Dark",
            hidden_power_index     : 0,
            // The starter's IVs (2026-09-17, core/logic/starterIvs.ts): `Automatic` is the Hidden
            // Power dropdowns, `Manual` the six fields. Per starter, shared across an evolution
            // family, like hidden_power_type.
            iv_mode                : IV_MODE.automatic,
            manual_ivs             : clampIvs(null),
            overlayNew             : "Chimchar",
            overlayOld             : "Chimchar",
            testStatus             : MyStorage['testStatus']           ?? false,
            wild_pokemon_display   : false,
            // Decision 30: the wild panel, off by default.
            show_wild_battles      : MyStorage['show_wild_battles']    ?? false,
            // The enemy team in the order the trainer's AI sends it out (core/logic/sendOutOrder.ts), on by default.
            send_out_order         : MyStorage['send_out_order']       ?? true,
            stats_setting          : MyStorage['stats_setting']        ?? "Automatic",
            expBarToggle           : MyStorage['expBarToggle']         ?? true,
            show_nature_changes    : MyStorage['show_nature_changes']  ?? true,
            show_tutor_moves       : MyStorage['show_tutor_moves']     ?? true,
            
            right_display          : MyStorage['right_display'] ?? "Automatic",
            hgss_trainers          : [],
            // The trainer the "Trainers" right panel previews (a trainer-table id).
            examined_trainer       : MyStorage['examined_trainer'] ?? "",
            search_trainers        : "",
            
            stat_fix_toggle        : false,
            stat_fix_lvl           : 0,
            stat_fix_hp            : 0,
            stat_fix_atk           : 0,
            stat_fix_def           : 0,
            stat_fix_spe           : 0,
            stat_fix_spa           : 0,
            stat_fix_spd           : 0,

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
            encounter_settings: [
            ],
            encounters_route_201:     MyStorage['encounters_route_201']     ?? true,
            encounters_route_202:     MyStorage['encounters_route_202']     ?? true,
            encounters_route_203:     MyStorage['encounters_route_203']     ?? true,
            encounters_oreburgh_gate: MyStorage['encounters_oreburgh_gate'] ?? true,
            encounters_oreburgh_mine: MyStorage['encounters_oreburgh_mine'] ?? true,

            // Platinum HM force flags
            hm_route_201_bidoof:      MyStorage['hm_route_201_bidoof']        ?? true,
            hm_route_201_starly:      MyStorage['hm_route_201_starly']        ?? false,
            hm_route_202_bidoof:      MyStorage['hm_route_202_bidoof']        ?? false,
            hm_route_202_starly:      MyStorage['hm_route_202_starly']        ?? false,
            hm_route_203_abra:        MyStorage['hm_route_203_abra']          ?? false,
            hm_oreburgh_gate_zubat:   MyStorage['hm_oreburgh_gate_zubat']     ?? true,
            hm_oreburgh_gate_geodude: MyStorage['hm_oreburgh_gate_geodude']   ?? true,
            hm_oreburgh_gate_psyduck: MyStorage['hm_oreburgh_gate_psyduck']   ?? true,
            hm_route_207_machop:      MyStorage['hm_route_207_machop']        ?? true,
            hm_route_207_geodude:     MyStorage['hm_route_207_geodude']       ?? false,
            hm_oreburgh_mine_geodude: MyStorage['hm_oreburgh_mine_geodude']   ?? false,
            hm_route_208_bibarel:     MyStorage['hm_route_208_bibarel']       ?? false,
            hm_route_213_buizel:      MyStorage['hm_route_213_buizel']        ?? false,

            // HeartGold HM force flags
            hm_route_29_sentret:      MyStorage['hm_route_29_sentret']        ?? false,
            hm_route_29_rattata:      MyStorage['hm_route_29_rattata']        ?? false,
            hm_route_29_pidgey:       MyStorage['hm_route_29_pidgey']         ?? false,
            hm_route_30_rattata:      MyStorage['hm_route_30_rattata']        ?? false,
            hm_route_30_pidgey:       MyStorage['hm_route_30_pidgey']         ?? false,
            hm_route_31_bellsprout:   MyStorage['hm_route_31_bellsprout']     ?? false,
            hm_route_31_rattata:      MyStorage['hm_route_31_rattata']        ?? false,
            hm_route_31_pidgey:       MyStorage['hm_route_31_pidgey']         ?? false,
            hm_route_32_rattata:      MyStorage['hm_route_32_rattata']        ?? true,
            hm_route_32_wooper:       MyStorage['hm_route_32_wooper']         ?? false,
            hm_union_cave_sandshrew:  MyStorage['hm_union_cave_sandshrew']    ?? false,
            hm_route_34_drowzee:      MyStorage['hm_route_34_drowzee']        ?? true,

            encounters_route_29:      MyStorage['encounters_route_29']     ?? true,
            encounters_route_30:      MyStorage['encounters_route_30']     ?? true,
            encounters_sprout_tower:  MyStorage['encounters_sprout_tower'] ?? true,

            shard_giver: {
                "Random Shard": 0,
                "Red Shard": 1,
                "Blue Shard": 2,
                "Yellow Shard": 3,
                "Green Shard": 4,
            },

            floaroma_berry_girl: {
                "Random Berry": 0,
                "Cheri Berry": 1,
                "Chesto Berry": 2,
                "Pecha Berry": 3,
                "Rawst Berry": 4,
                "Aspear Berry": 5,
            },

            berry_master: {
                "Random Berry": 0,
                "Cheri Berry": 1,
                "Chesto Berry": 2,
                "Pecha Berry": 3,
                "Rawst Berry": 4,
                "Aspear Berry": 5,
                "Leppa Berry": 6,
                "Oran Berry": 7,
                "Persim Berry": 8,
                "Lum Berry": 9,
                "Sitrus Berry": 10,
                "Figy Berry": 11,
                "Wiki Berry": 12,
                "Mago Berry": 13,
                "Aguav Berry": 14,
                "Iapapa Berry": 15,
                "Razz Berry": 16,
                "Bluk Berry": 17,
                "Nanab Berry": 18,
                "Wepear Berry": 19,
                "Pinap Berry": 20,
                "Pomeg Berry": 21,
                "Kelpsy Berry": 22,
                "Qualot Berry": 23,
                "Hondew Berry": 24,
                "Grepa Berry": 25,
                "Tamato Berry": 26,
                "Cornn Berry": 27,
                "Magost Berry": 28,
                "Rabuta Berry": 29,
                "Nomel Berry": 30,
            },

            pastoria_berry_woman: {
                "Random Berry": 0, 
                "Occa Berry": 1, 
                "Passho Berry": 2, 
                "Wacan Berry": 3, 
                "Rindo Berry": 4, 
                "Yache Berry": 5, 
                "Chople Berry": 6, 
                "Kebia Berry": 7, 
                "Shuca Berry": 8, 
                "Coba Berry": 9, 
                "Payapa Berry": 10, 
                "Tanga Berry": 11, 
                "Charti Berry": 12, 
                "Kasib Berry": 13, 
                "Haban Berry": 14, 
                "Colbur Berry": 15, 
                "Babiri Berry": 16,
                "Chilan Berry": 17,
            },

            // RNG modal state
            showRNGModal: false,
            rng_npcs: [
                { key: "shard_giver",          label: "Shard Giver",          map: "Great Marsh - Map 6",   bagCategory: "items",   patchProp: "stpGreatMarshShard", defaultItem: "Random Shard" },
                { key: "floaroma_berry_girl",  label: "Floaroma Berry Girl",  map: "Flower Shop - Map 1",   bagCategory: "berries", patchProp: "stpFloaromaBerry",   defaultItem: "Random Berry" },
                { key: "berry_master",         label: "Berry Master",         map: "Route 208 - Map 3",     bagCategory: "berries", patchProp: "stpBerryMaster",     defaultItem: "Random Berry" },
                { key: "pastoria_berry_woman", label: "Pastoria Berry Woman", map: "Pastoria City - Map 8", bagCategory: "berries", patchProp: "stpPastoriaBerry",   defaultItem: "Random Berry" },
            ],
            rng_config: MyStorage['rng_config'] ?? {
                shard_giver:          ["Random Shard"],
                floaroma_berry_girl:  ["Random Berry"],
                berry_master:         ["Random Berry"],
                pastoria_berry_woman: ["Random Berry"],
            },
            rng_trip_index: {
                shard_giver:          0,
                floaroma_berry_girl:  0,
                berry_master:         0,
                pastoria_berry_woman: 0,
            },

            // USER CONFIG (components) ------------------------------------------------------------------------//
            typeCalcs: true,

            //CSS styling values
            statLabelOpacityValue: 0.1, //used when a stage modifier is applied

            //DATA ---------------------------------------------------------------------------------------------//
            g4MoveData               : g4MoveData,
            g4tmhmMapping            : g4tmhmMapping,
            // g4PokemonData            : g4PokemonData,
            stageModifiersData       : stageModifiersData,
            typeEffectivenessArray   : typeEffectivenessArray,
            typeData                 : typeData,
            typeBoostingItems        : typeBoostingItems,
            platinum_trainers        : platinum_trainers,
            platinum_moves           : platinum_moves,
            hiddenPowerTypes         : hiddenPowerTypes,
            generation4_moves_new    : generation4_moves_new,
            textures                 : textures,
            default_colors           : default_colors,
            autosplitter             : autosplitter,
            post_game_moves          : post_game_moves,
            auto_save_settings       : auto_save_settings,
            natures                  : natures,
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
            hiddenpower_type_selector: hiddenpower_type_selector,
            game_variables           : game_variables,
            natural_gift             : natural_gift,
            cross_generation_moves   : cross_generation_moves,
            hiddenpowers             : hiddenpowers,
            unobtainable_moves_object: unobtainable_moves,

            // Data (New as of 2024-06-02)
            // These files contain the most up-to-date data for both trainers and pokemon.
            // The frontend is not currently using these paths and it needs to be updated so that it can.
            // This will enable game switching within generation 4 and it will allow this frontend to eventually be used for generation 5.
            pokedex_dp   : pokedex_dp,
            pokedex_plat : pokedex_plat,
            pokedex_hgss : pokedex_hgss,
            trainers_dp  : trainers_dp,
            trainers_plat: trainers_plat,
            trainers_hgss: trainers_hgss,
            tmhm         : tmhm,

            //LOOPS
            badges: [0, 1, 2, 3, 4, 5, 6, 7],
            johto_badge_indexes: [0, 1, 2, 3, 4, 5, 6, 7],
            kanto_badge_indexes: [8, 9, 10, 11, 12, 13, 14, 15],
            badgeBoosts:     ["badge1", "badge3", "badge5", "badge7"],
            moves:           ["move1","move2","move3","move4",],
            pkmnSlots:       [0, 1, 2, 3, 4, 5],
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
                {abrv: "Hp",  name: "Hp",              name_stat_exp: "Hp",      label: "HP",   vitamin: "HP Up",   path: "hp",              mod_path: "Hp",             mod_abrv: "hp",  base_stat_path: "base_hp",      object_identifier: "hp",      dv: "dvHp",      hp_spe_label_row: 1, hp_spd_label_row: 1, label_column: 1, hp_spe_value_row: 1, hp_spd_value_row: 1, value_column: 2,}, 
                {abrv: "Atk", name: "Attack",          name_stat_exp: "Attack",  label: "Atk.", vitamin: "Protein", path: "attack",          mod_path: "Attack",         mod_abrv: "atk", base_stat_path: "base_atk",     object_identifier: "atk",     dv: "dvAttack",  hp_spe_label_row: 2, hp_spd_label_row: 2, label_column: 1, hp_spe_value_row: 2, hp_spd_value_row: 2, value_column: 2,}, 
                {abrv: "Def", name: "Defense",         name_stat_exp: "Defense", label: "Def.", vitamin: "Iron",    path: "defense",         mod_path: "Defense",        mod_abrv: "def", base_stat_path: "base_def",     object_identifier: "def",     dv: "dvDefense", hp_spe_label_row: 3, hp_spd_label_row: 3, label_column: 1, hp_spe_value_row: 3, hp_spd_value_row: 3, value_column: 2,}, 
                {abrv: "SpA", name: "Special Attack",  name_stat_exp: "Special", label: "SpA.", vitamin: "Calcium", path: "special_attack",  mod_path: "SpecialAttack",  mod_abrv: "spA", base_stat_path: "base_spc_atk", object_identifier: "spc_atk", dv: "dvSpecial", hp_spe_label_row: 2, hp_spd_label_row: 2, label_column: 3, hp_spe_value_row: 2, hp_spd_value_row: 2, value_column: 4,}, 
                {abrv: "SpD", name: "Special Defense", name_stat_exp: "Special", label: "SpD.", vitamin: "Zinc",    path: "special_defense", mod_path: "SpecialDefense", mod_abrv: "spD", base_stat_path: "base_spc_def", object_identifier: "spc_def", dv: "dvSpecial", hp_spe_label_row: 3, hp_spd_label_row: 3, label_column: 3, hp_spe_value_row: 3, hp_spd_value_row: 3, value_column: 4,}, 
                {abrv: "Spe", name: "Speed",           name_stat_exp: "Speed",   label: "Spe.", vitamin: "Carbos",  path: "speed",           mod_path: "Speed",          mod_abrv: "spe", base_stat_path: "base_spd",     object_identifier: "spd",     dv: "dvSpeed",   hp_spe_label_row: 1, hp_spd_label_row: 1, label_column: 3, hp_spe_value_row: 1, hp_spd_value_row: 1, value_column: 4,}, 
            ],

            //VARIABLES THAT TRACK IN GAME PROGRESS ------------------------------------------------------------//
            playerId      : -1,
            resets        : 0,
            trainerBattles: 0,
            wildEncounters: 0,
            blackout: false,

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

            //Pokemon settings for local storage
            overlay_color: MyStorage["overlay_color"] ?? "#000000",
            imageXOffset : MyStorage["imageXOffset"]  ?? 0,
            imageYOffset : MyStorage["imageYOffset"]  ?? 0,
            imageScale   : MyStorage["imageScale"]    ?? 1,
            imageFlip    : MyStorage["imageFlip"]     ?? false,
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
            backgroundTexture    : MyStorage["backgroundTexture"]     ?? 'Bug 1',
            backgroundBrightness : MyStorage["backgroundBrightness"]  ?? 100,
            backgroundContrast   : MyStorage["backgroundContrast"]    ?? 100,
            backgroundSaturation : MyStorage["backgroundSaturation"]  ?? 100,

            kanto_badges: MyStorage["kanto_badges"] ?? false,

            //backed up pokemon specific settings
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
                "attempt_number",
                "pb_time",
                "backgroundXOffset",
                "backgroundYOffset",
                "backgroundTexture",
                "backgroundBrightness",
                "backgroundContrast",
                "backgroundSaturation",
                "backgroundFlip",
                "backgroundXFlip",
                "pkmnNature",
                "pkmn_ability",
                "hidden_power_type",
                "hidden_power_index",
                "iv_mode",
                "manual_ivs",
                "pkmn_gender",
                "finished_run_count",
                "evolution",
                "evolution_splits_label",
                "playerResets",
                "blackout_counter",
                "ui_saturation",
                "frame",
                "previous_label",
                "current_label",
                "split_type",
                "kanto_badges",
            ],
            //timer variables
            timer_startTimeOffset: MyStorage["timer_startTimeOffset"] ?? "00:00:00.00",
            timer_startTime:       MyStorage["timer_startTime"]       ?? 0,
            timer_pause:           MyStorage["timer_pause"]           ?? true,
            timer_formatted_time:  MyStorage["timer_formatted_time"]  ?? ["0", ".00"],
            timer_pause_time:      MyStorage["timer_pause_time"]      ?? 0,
            timer_frame_live:      false, // the out-of-process clock is showing (core/overlay/ClockFrame.ts)
            time_h:                MyStorage['time_h']                ?? 0,
            time_m:                MyStorage['time_m']                ?? 0,
            time_s:                MyStorage['time_s']                ?? 0,
            time_ms:               MyStorage['time_ms']               ?? 0,
            time_split_start:      MyStorage['time_split_start']      ?? "00:00:00:00",
            battle_start:          MyStorage['battle_start']          ?? 0,

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
            testRun                  : MyStorage['testRun']             ?? false,
            copy_overlay_pokemon_from: "",
            copy_overlay_pokemon_to  : "",
            run_complete             : MyStorage["run_complete"]       ?? false,

            // buffer properties
            buffer_battle_level          : 0,
            buffer_battle_exp            : 0,
            buffer_battle_attack         : 0,
            buffer_battle_defense        : 0,
            buffer_battle_speed          : 0,
            buffer_battle_special_attack : 0,
            buffer_battle_special_defense: 0,
            buffer_battle_friendship     : 0,


            track_TMHM_viability: false,

            // UI
            ui_saturation:                MyStorage["ui_saturation"]                ?? .6,
            ui_type_icons:                MyStorage["ui_type_icons"]                ?? "2024",
            ui_type_icons_modifier:       MyStorage["ui_type_icons_modifier"]       ?? "2024/",
            ui_stats_styling:             MyStorage["ui_stats_styling"]             ?? "2024",
            ui_stats_styling_modifier:    MyStorage["ui_stats_styling_modifier"]    ?? "",
            ui_stat_arrangement:          MyStorage['ui_stat_arrangement']          ?? "HP, Atk, Def, Spe, SpA, SpD",
            ui_stat_arrangement_modifier: MyStorage['ui_stat_arrangement_modifier'] ?? "hp_spe_",
        }
    },
    created() {
        if (MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`]) {
            this.overlay_color          = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`].overlay_color           ?? this.default_colors[g4PokemonData[this.starter]?.type_1];
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
            this.backgroundTexture      = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`].backgroundTexture       ?? `${this.g4PokemonData[this.starter]?.type_1 ?? ''}`
            this.pkmn_ability           = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`]?.pkmn_ability           ?? g4PokemonData[this.starter]?.abilities?.[0] ?? null
            this.attempt_number         = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`]?.attempt_number         ?? 0
            this.finished_run_count     = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`]?.finished_run_count     ?? 0
            this.playerResets           = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`]?.playerResets           ?? 0
            this.blackout_counter       = MyStorage[`${this.mapper?.properties.meta.game_name.value}_${this.starter}`]?.blackout_counter       ?? 0
            // Evolution flags live in their own non-style key; fall back to the legacy base key
            // for users whose data predates that change.
            const evoStateKey = this.getEvolutionStateStorageKey()
            const legacyKey = `${this.mapper?.properties.meta.game_name.value}_${this.starter}`
            this.evolution              = MyStorage[evoStateKey]?.evolution              ?? MyStorage[legacyKey]?.evolution              ?? 0
            this.evolution_splits_label = MyStorage[evoStateKey]?.evolution_splits_label ?? MyStorage[legacyKey]?.evolution_splits_label ?? 0
        }
        for (let i = 0; i < this.pokemon_settings.length; i++) {
            let propName = this.pokemon_settings[i];
            this.$watch(
                () => this[propName],
                (newValue) => {
                    // The evolution flag and its label are per-starter run settings, not per-species
                    // styles. They get their own dedicated non-style storage key so the style layer
                    // can't strip them in dev mode (which silently dropped the toggle, so it never
                    // persisted across refreshes). See getEvolutionStateStorageKey().
                    const baseStarterProperties = ['evolution', 'evolution_splits_label'];
                    const isBaseStarterProperty = baseStarterProperties.includes(propName);

                    // Skip saving if we're currently loading evolution styles to prevent overwriting.
                    // The per-starter flags above are exempt: toggling evolution triggers a style load
                    // (which sets is_loading_evolution_style) in the same flush as this save watcher,
                    // so skipping them here would drop the very change the user just made.
                    if (this.is_loading_evolution_style && !isBaseStarterProperty) {
                        return;
                    }

                    // Shared evolution family properties (ability, nature, gender, hidden power)
                    // should be saved to the evolution family storage key when evolution is enabled
                    // These settings apply to all members of the evolution family
                    const sharedEvolutionFamilyProperties = ['pkmnNature', 'pkmn_ability', 'pkmn_gender', 'hidden_power_type', 'hidden_power_index', 'iv_mode', 'manual_ivs'];
                    const isSharedFamilyProperty = sharedEvolutionFamilyProperties.includes(propName);

                    let storageKey;
                    if (isBaseStarterProperty) {
                        // Dedicated non-style key (e.g., "evoState_Platinum_Chimchar")
                        storageKey = this.getEvolutionStateStorageKey();
                    } else if (this.evolution && isSharedFamilyProperty) {
                        // Use evolution family storage key for shared properties (e.g., "Black_Unfezant-line")
                        storageKey = this.getEvolutionFamilyStorageKey(this.starter);
                    } else {
                        // Use the appropriate storage key based on evolution mode for other properties
                        // If evolution is enabled and selected_evolution_species is set, use evolution line storage
                        // Otherwise, use individual species storage
                        // This ensures styles are saved to the correct location (e.g., "Black_Unfezant-line-Pidove" vs "Black_Pidove")
                        storageKey = this.getCurrentStorageKey();
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
        this.hgss_trainers = this.extractTrainerInfo(this.trainers_hgss)

        for (let i = 0; i < this.encounter_settings.length; i++) {
            let propName = this.encounter_settings[i];
            this.$watch(
                () => this[propName], // Using a function to return the property's value
                (newValue) => {
                    MyStorage[`${propName}`] = newValue;
                    this.freezeEncounters();
                }
            );
        }
    },
    watch: {
        encounters_route_201(newValue) {
            MyStorage['encounters_route_201'] = newValue;
            this.disable_encounters();
        },
        encounters_route_202(newValue) {
            MyStorage['encounters_route_202'] = newValue;
            this.disable_encounters();
        },
        encounters_route_203(newValue) {
            MyStorage['encounters_route_203'] = newValue;
            this.disable_encounters();
        },
        encounters_oreburgh_gate(newValue) {
            MyStorage['encounters_oreburgh_gate'] = newValue;
            this.disable_encounters();
        },
        encounters_oreburgh_mine(newValue) {
            MyStorage['encounters_oreburgh_mine'] = newValue;
            this.disable_encounters();
        },
        encounters_route_29(newValue) {
            MyStorage['encounters_route_29'] = newValue;
            this.disable_encounters();
        },
        encounters_route_30(newValue) {
            MyStorage['encounters_route_30'] = newValue;
            this.disable_encounters();
        },
        encounters_sprout_tower(newValue) {
            MyStorage['encounters_sprout_tower'] = newValue;
            this.disable_encounters();
        },
        hm_route_201_bidoof(newValue) {
            this.game.properties.patch.FLAG_FORCE_ROUTE_201_BIDOOF?.set(newValue, false);
            MyStorage['hm_route_201_bidoof'] = newValue;
        },
        hm_route_201_starly(newValue) {
            this.game.properties.patch.FLAG_FORCE_ROUTE_201_STARLY?.set(newValue, false);
            MyStorage['hm_route_201_starly'] = newValue;
        },
        hm_route_202_bidoof(newValue) {
            this.game.properties.patch.FLAG_FORCE_ROUTE_202_BIDOOF?.set(newValue, false);
            MyStorage['hm_route_202_bidoof'] = newValue;
        },
        hm_route_202_starly(newValue) {
            this.game.properties.patch.FLAG_FORCE_ROUTE_202_STARLY?.set(newValue, false);
            MyStorage['hm_route_202_starly'] = newValue;
        },
        hm_route_203_abra(newValue) {
            this.game.properties.patch.FLAG_FORCE_ROUTE_203_ABRA?.set(newValue, false);
            MyStorage['hm_route_203_abra'] = newValue;
        },
        hm_oreburgh_gate_zubat(newValue) {
            this.game.properties.patch.FLAG_FORCE_OREBURGH_GATE_ZUBAT?.set(newValue, false);
            MyStorage['hm_oreburgh_gate_zubat'] = newValue;
        },
        hm_oreburgh_gate_geodude(newValue) {
            this.game.properties.patch.FLAG_FORCE_OREBURGH_GATE_GEODUDE?.set(newValue, false);
            MyStorage['hm_oreburgh_gate_geodude'] = newValue;
        },
        hm_oreburgh_gate_psyduck(newValue) {
            this.game.properties.patch.FLAG_FORCE_OREBURGH_GATE_PSYDUCK?.set(newValue, false);
            MyStorage['hm_oreburgh_gate_psyduck'] = newValue;
        },
        hm_route_207_machop(newValue) {
            this.game.properties.patch.FLAG_FORCE_ROUTE_207_MACHOP?.set(newValue, false);
            MyStorage['hm_route_207_machop'] = newValue;
        },
        hm_route_207_geodude(newValue) {
            this.game.properties.patch.FLAG_FORCE_ROUTE_207_GEODUDE?.set(newValue, false);
            MyStorage['hm_route_207_geodude'] = newValue;
        },
        hm_oreburgh_mine_geodude(newValue) {
            this.game.properties.patch.FLAG_FORCE_OREBURGH_MINE_GEODUDE?.set(newValue, false);
            MyStorage['hm_oreburgh_mine_geodude'] = newValue;
        },
        hm_route_208_bibarel(newValue) {
            this.game.properties.patch.FLAG_FORCE_ROUTE_208_BIBAREL?.set(newValue, false);
            MyStorage['hm_route_208_bibarel'] = newValue;
        },
        hm_route_213_buizel(newValue) {
            this.game.properties.patch.FLAG_FORCE_ROUTE_213_BUIZEL?.set(newValue, false);
            MyStorage['hm_route_213_buizel'] = newValue;
        },
        hm_route_29_sentret(newValue) {
            this.game.properties.patch.FLAG_FORCE_R29_SENTRET?.set(newValue, false);
            MyStorage['hm_route_29_sentret'] = newValue;
        },
        hm_route_29_rattata(newValue) {
            this.game.properties.patch.FLAG_FORCE_R29_RATTATA?.set(newValue, false);
            MyStorage['hm_route_29_rattata'] = newValue;
        },
        hm_route_29_pidgey(newValue) {
            this.game.properties.patch.FLAG_FORCE_R29_PIDGEY?.set(newValue, false);
            MyStorage['hm_route_29_pidgey'] = newValue;
        },
        hm_route_30_rattata(newValue) {
            this.game.properties.patch.FLAG_FORCE_R30_RATTATA?.set(newValue, false);
            MyStorage['hm_route_30_rattata'] = newValue;
        },
        hm_route_30_pidgey(newValue) {
            this.game.properties.patch.FLAG_FORCE_R30_PIDGEY?.set(newValue, false);
            MyStorage['hm_route_30_pidgey'] = newValue;
        },
        hm_route_31_bellsprout(newValue) {
            this.game.properties.patch.FLAG_FORCE_R31_BELLSPROUT?.set(newValue, false);
            MyStorage['hm_route_31_bellsprout'] = newValue;
        },
        hm_route_31_rattata(newValue) {
            this.game.properties.patch.FLAG_FORCE_R31_RATTATA?.set(newValue, false);
            MyStorage['hm_route_31_rattata'] = newValue;
        },
        hm_route_31_pidgey(newValue) {
            this.game.properties.patch.FLAG_FORCE_R31_PIDGEY?.set(newValue, false);
            MyStorage['hm_route_31_pidgey'] = newValue;
        },
        hm_route_32_rattata(newValue) {
            this.game.properties.patch.FLAG_FORCE_R32_RATTATA?.set(newValue, false);
            MyStorage['hm_route_32_rattata'] = newValue;
        },
        hm_route_32_wooper(newValue) {
            this.game.properties.patch.FLAG_FORCE_R32_WOOPER?.set(newValue, false);
            MyStorage['hm_route_32_wooper'] = newValue;
        },
        hm_union_cave_sandshrew(newValue) {
            this.game.properties.patch.FLAG_FORCE_UNION_CAVE_SANDSHREW?.set(newValue, false);
            MyStorage['hm_union_cave_sandshrew'] = newValue;
        },
        hm_route_34_drowzee(newValue) {
            this.game.properties.patch.FLAG_FORCE_R34_DROWZEE?.set(newValue, false);
            MyStorage['hm_route_34_drowzee'] = newValue;
        },
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
        catch_rate(newValue) {
            if (newValue == true) {
                this.game.properties.patch.stpCatchRate.set(1,false); 
            }
            else {
                this.game.properties.patch.stpCatchRate.set(0,false); 
            }
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
        },
        selected_evolution_species(newValue, oldValue) {
            // Prevent recursive updates
            if (this.is_validating_evolution_species) {
                return;
            }
            
            // When a different evolution family species is selected in the dropdown:
            // 1. The Pokemon art will automatically update via displayedPokemonSpecies computed property
            // 2. Load its styles from evolution line storage (e.g., "Unfezant-line-Pidove")
            // 3. If there's a transition (oldValue exists), perform a fade transition
            // 4. Save the selection to storage
            // IMPORTANT: Only allow species within the current evolution family to prevent error data
            if (newValue && this.evolution) {
                // Validate that newValue is in the evolution family
                if (this.evolution_family_list.length > 0 && !this.evolution_family_list.includes(newValue)) {
                    // Reject invalid species - revert to a valid one
                    this.is_validating_evolution_species = true;
                    let validSpecies = null;
                    if (this.evolution_family_list.includes(this.starter)) {
                        validSpecies = this.starter;
                    } else if (this.evolution_family_list.length > 0) {
                        validSpecies = this.evolution_family_list[0];
                    } else {
                        validSpecies = this.starter;
                    }
                    // Only update if different from current value to prevent infinite loop
                    if (this.selected_evolution_species !== validSpecies) {
                        this.selected_evolution_species = validSpecies;
                    }
                    this.$nextTick(() => {
                        this.is_validating_evolution_species = false;
                    });
                    return;
                }
                
                // Preserve ability slot (1→1, 2→2) across family members; family storage keeps one name
                const abilityBeforeSpeciesChange =
                    oldValue && oldValue !== newValue ? this.pkmn_ability : null;
                
                // Load evolution line styles first (before transition) to ensure styles are loaded
                // The flag in loadEvolutionStyle will prevent watchers from overwriting
                this.loadEvolutionStyle(newValue, true);
                
                const mappedAbility =
                    abilityBeforeSpeciesChange != null
                        ? this.mapAbilityByEvolutionSlot(
                              oldValue,
                              newValue,
                              abilityBeforeSpeciesChange
                          )
                        : null;
                
                // After loadEvolutionStyle clears is_loading_evolution_style, apply mapped ability so
                // the pkmn_ability watcher persists to family storage.
                this.$nextTick(() => {
                    if (mappedAbility != null) {
                        this.pkmn_ability = mappedAbility;
                    }
                });
                
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
        starter(newValue, oldValue) {
            // Prevent recursive updates
            if (this.is_validating_starter) {
                return;
            }
            
            // Prevent starter from becoming undefined
            if (!newValue || newValue === undefined || newValue === null) {
                // Fallback to stored value or default
                const fallback = MyStorage['starter'] ?? "Heatran";
                this.is_validating_starter = true;
                this.starter = fallback;
                this.$nextTick(() => {
                    this.is_validating_starter = false;
                });
                return;
            }
            
            if (oldValue !== newValue) {
                this.update_rom_starter_and_intro_mon()
            }

            // IMPORTANT: When evolution is enabled, only block programmatic changes to species outside the evolution family
            // This prevents error data from game resets from changing the displayed Pokemon
            // However, allow changes to any valid Pokemon (exists in g4PokemonData) - this covers manual user changes
            // The species change handler will still validate programmatic changes from game data
            if (this.evolution && oldValue && oldValue !== newValue) {
                // Check if the new species is a valid Pokemon (exists in the data)
                const isValidPokemon = this.g4PokemonData && this.g4PokemonData[newValue] !== undefined;
                
                // Get the evolution family of the current starter (before it changes)
                const currentEvolutionFamily = this.getEvolutionFamily(oldValue);
                
                // Only block if:
                // 1. The new species is NOT a valid Pokemon (error data), AND
                // 2. The current starter has an evolution family, AND
                // 3. The new species is not in that evolution family
                if (!isValidPokemon && currentEvolutionFamily.length > 0 && !currentEvolutionFamily.includes(newValue)) {
                    // Reject invalid species - keep the current starter
                    this.is_validating_starter = true;
                    const currentStarter = oldValue; // Save the valid starter
                    // Only update if the current value is the invalid one
                    if (this.starter === newValue && this.starter !== currentStarter) {
                        this.starter = currentStarter;
                    }
                    this.$nextTick(() => {
                        this.is_validating_starter = false;
                    });
                    return;
                }
                // If it's a valid Pokemon OR it's in the evolution family, allow the change (fall through to normal processing)
            }
            
            const starter = newValue
            const game = this.game?.properties.meta.game_name.value
            const state = this.game?.properties.meta.state.value
            MyStorage['starter'] = newValue

            this.syncFormByte(newValue);

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
            
            // Keep frame setting from individual storage for now
            this.frame = MyStorage[`${game}_${starter}`]?.frame ?? false
            
            // Load shared evolution family settings (ability, nature, gender, hidden power) if evolution is enabled
            // Otherwise, load from individual species storage
            if (this.evolution) {
                const evolutionFamilyStorageKey = this.getEvolutionFamilyStorageKey(starter);
                const familyStored = MyStorage[evolutionFamilyStorageKey] || {};
                
                // Load from evolution family storage, fallback to individual storage, then defaults
                this.pkmnNature = familyStored.pkmnNature ?? MyStorage[`${game}_${starter}`]?.pkmnNature ?? "Hardy";
                this.pkmn_ability = familyStored.pkmn_ability ?? MyStorage[`${game}_${starter}`]?.pkmn_ability ?? (this.g4PokemonData?.[starter]?.abilities?.[0]) ?? null;
                this.pkmn_gender = familyStored.pkmn_gender ?? MyStorage[`${game}_${starter}`]?.pkmn_gender ?? "Female";
                this.hidden_power_type = familyStored.hidden_power_type ?? MyStorage[`${game}_${starter}`]?.hidden_power_type ?? "Dark";
                this.hidden_power_index = familyStored.hidden_power_index ?? MyStorage[`${game}_${starter}`]?.hidden_power_index ?? 0;
                this.iv_mode = familyStored.iv_mode ?? MyStorage[`${game}_${starter}`]?.iv_mode ?? IV_MODE.automatic;
                this.load_manual_ivs(familyStored.manual_ivs ?? MyStorage[`${game}_${starter}`]?.manual_ivs);
            } else {
                // Evolution is disabled, load from individual species storage
                this.pkmnNature = MyStorage[`${game}_${starter}`]?.pkmnNature ?? "Hardy";
                this.pkmn_ability = MyStorage[`${game}_${starter}`]?.pkmn_ability ?? (this.g4PokemonData?.[starter]?.abilities?.[0]) ?? null;
                this.pkmn_gender = MyStorage[`${game}_${starter}`]?.pkmn_gender ?? "Female";
                this.hidden_power_type = MyStorage[`${game}_${starter}`]?.hidden_power_type ?? "Dark";
                this.hidden_power_index = MyStorage[`${game}_${starter}`]?.hidden_power_index ?? 0;
                this.iv_mode = MyStorage[`${game}_${starter}`]?.iv_mode ?? IV_MODE.automatic;
                this.load_manual_ivs(MyStorage[`${game}_${starter}`]?.manual_ivs);
            }
            
            //! FIX_LATER Fix this implementation later
            // this.ability           = MyStorage[`${game}_${starter}`]?.ability          ?? this.g4PokemonData[starter].abilities[0],
            this.encounters_route_1 = MyStorage[`${game}_${starter}`]?.encounters_route_1 ?? false
            this.encounters_route_2 = MyStorage[`${game}_${starter}`]?.encounters_route_2 ?? false
            
            // Evolution management
            if (this.evolution != true) {
                // Evolution flags live in their own non-style key; fall back to the legacy base key.
                const evoStateKey = this.getEvolutionStateStorageKey()
                this.evolution              = MyStorage[evoStateKey]?.evolution              ?? MyStorage[`${game}_${starter}`]?.evolution              ?? false
                this.evolution_splits_label = MyStorage[evoStateKey]?.evolution_splits_label ?? MyStorage[`${game}_${starter}`]?.evolution_splits_label ?? ""

                this.attempt_number     = MyStorage[`${game}_${starter}`]?.attempt_number     ?? 0
                this.finished_run_count = MyStorage[`${game}_${starter}`]?.finished_run_count ?? 0
                this.playerResets       = MyStorage[`${game}_${starter}`]?.playerResets       ?? 0
                this.blackout_counter   = MyStorage[`${game}_${starter}`]?.blackout_counter   ?? 0
            }
            else {

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
        emulatorStats(newProp, oldProp) {
            //console.log(newProp, oldProp) - 
            if (this.shuckie_counters == true) {
                const old_resets = oldProp?.counters?.playerResets ?? 0
                const old_blackouts = oldProp?.counters?.blackout_counter ?? 0
                const new_resets = newProp?.counters?.playerResets ?? 0
                const new_blackouts = newProp?.counters?.blackout_counter ?? 0
    
                if (old_resets != new_resets) {
                    this.playerResets = new_resets
                }
                if (old_blackouts != new_blackouts) {
                    this.blackout_counter = new_blackouts
                }
            }
        },
        playerNameChoice() {
            this.overlay_color = `lch(75% 100 ${hash(this.playerNameChoice) % 360})`
            MyStorage["playerNameChoice"] = this.playerNameChoice
            MyStorage["overlay_color"] = this.overlay_color
        },
        playerName(newName) {
            MyStorage['playerName'] = newName;
        },
        ui_stat_arrangement(newValue) {
            if (newValue == 'HP, Atk, Def, SpA, SpD, Spe') {
                this.ui_stat_arrangement_modifier = "hp_spe_"
            }
            if (newValue == 'HP, Atk, Def, Spe, SpA, SpD') {
                this.ui_stat_arrangement_modifier = "hp_spd_"
            }
        },
        // evolution(newValue) {
        //     if (this.ready == false) { return }
        //     const evolution_family = this.game_data.evolutions[this.starterString]?.evolution_family
        //     const family_length = evolution_family.length
        //     const split_label = `${evolution_family[evolution_family.length - 1]?.species}-line`
        //     // console.log(evolution_family)
        //     if (newValue == true) {
        //         this.evolution_splits_label = split_label
        //     }
        //     if (newValue == false) {
        //         this.evolution_splits_label = ""
        //     }
        //     for (let i = 0; i < family_length; i++) {
        //         MyStorage[evolution_family[i].species] = {
        //             ...MyStorage[evolution_family[i].species],
        //             evolution             : newValue,
        //             evolution_splits_label: this.evolution_splits_label,
        //             attempt_number        : this.attempt_number,
        //             finished_run_count    : this.finished_run_count,
        //         };
        //     }
        // },
    },
    computed: {
        // The settings panel's description (settingsPanel.ts). It reads nothing reactive itself, so it is
        // built once; the panel component reads the overlay through its closures as it renders.
        settingsPanel() {
            return markRaw(gen4SettingsPanel(this));
        },
        // average_median_stats() for each stat the panel shows, recomputed only when the dex changes
        average_median_by_stat() {
            const by_stat = {}
            for (const stat_label of ['hp', 'atk', 'def', 'spc_atk', 'spc_def', 'spd']) {
                by_stat[stat_label] = this.average_median_stats_of(stat_label)
            }
            return by_stat
        },
        /** What the out-of-process clock needs (core/overlay/ClockFrame.ts): the timer fields and Super Shuckie's time. */
        timer_frame_state() {
            return {
                mode: this.shuckie_timer ? 'emulator' : 'local',
                startTime: this.timer_startTime,
                pause: this.timer_pause,
                pauseTime: this.timer_pause_time,
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
            return this.getMovepool(this.g4PokemonData, this.platinum_moves, this.g4tmhmMapping, this.displayedPokemonSpecies)
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
         * What the shared movepool table (core/overlay/Movepool.vue) shows: gen4's own Hidden Power,
         * Curse, Return/Frustration and damage-class rules, built once per change instead of per row
         * per render.
         */
        movepoolView() {
            const typeColor = (x) => `var(--${this.movepoolTypeColor(x)?.toLowerCase()})`
            const dcColor = (x) => `var(--${this.getMoveCategory(x.Category, x)[1].toLowerCase()})`
            const rows = this.movepoolRows
            const struck = this.movepoolStruck
            const groups = [
                { struck: struck.everywhere, rows: rows.level.map((x, index) => ({
                    way: x.Level, move: x.Move, name: this.move_name(x.Move), type: this.movepoolType(x), typeColor: typeColor(x),
                    dc: this.getMoveCategory(x.Category)[0], dcColor: dcColor(x),
                    power: this.movepoolPower(x), accuracy: x.Accuracy, pp: x.PP, first: index === 0,
                })) },
                { struck: struck.machines, rows: rows.tmhm.map(x => ({
                    way: x.Move == 'Whirlpool' ? "HM05" : x.tmhm, move: x.Move, name: this.move_name(x.Move), type: this.movepoolType(x), typeColor: typeColor(x),
                    dc: this.getMoveCategory(x.Category)[0], dcColor: dcColor(x),
                    power: this.movepoolPower(x), accuracy: x.Accuracy, pp: x.PP,
                })) },
            ]
            if (this.show_tutor_moves == true) {
                groups.push({ struck: struck.machines, rows: rows.tutor.map(x => ({
                    way: "Tutor", move: x.Move, name: this.move_name(x.Move), type: x.Type, typeColor: `var(--${x.Type?.toLowerCase()})`,
                    dc: x.Category, dcColor: dcColor(x),
                    power: x.Power, accuracy: x.Accuracy, pp: x.PP,
                })) })
            }
            return {
                title: "Movepool",
                titleClass: "posAbs movepoolLabel",
                titleFirst: true,
                dc: true,
                headerColor: `var(--${this.starting_type_fix})`,
                // 995px of the 1000px table less the 17px header and the first row's 2px; rows at 21px/14px,
                // and a long list's font shrinks a little slower than its rows.
                fit: { containerHeight: 976, lineHeight: 21, fontSize: 14, shrinkFactor: 0.77 },
                groups,
            }
        },
        /** What the shared Splits panel (core/overlay/SplitsPanel.vue) shows in the chosen mode, if any. */
        splitsView() {
            const mode = this.split_type
            if (mode !== "First" && mode !== "Followup") return undefined
            return {
                title: { class: "posAbs movepoolLabel", text: "Splits" },
                table: { class: "splits_table", icon: { imgClass: "scaled_icon" }, headClass: "movepool_header" },
                head: splitsHead(mode, this.previous_label, this.current_label),
                headerColor: `var(--${this.starting_type_fix})`,
                rows: (this.compare_splits ?? []).map(split => ({
                    icon: `images/gen4/split_images/${this.selected_game}/${this.split_image(split.original_trainer || split.trainer)}.webp`,
                    cells: mode === "First" ? [split.trainer, "", "", split.current_time]
                        : [split.trainer, split.previous_time, split.current_time, split.difference],
                    diffStyle: mode === "First" ? undefined : splitDiffColor(split.difference),
                })),
                art: { class: "colored-image ds", style: [`filter: saturate(${this.ui_saturation})`, "--url: url(images/gen4/new_ui/splits.svg)"] },
            }
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
            
            // Check if this is HeartGold and SoulSilver
            const isHGSS = this.selected_game === "HeartGold and SoulSilver" || this.game?.properties?.meta?.game_name?.value === "HeartGold and SoulSilver"
            
            // For HGSS with "First" split type, return hardcoded default list
            if (isHGSS && this.split_type === "First") {
                const default_string = "-"
                const currentSplits = Array.isArray(this.effective_current_splits) ? this.effective_current_splits : []

                // Default list of trainers in order for HGSS
                const hgssDefaultTrainers = [
                    { displayName: "Falkner", originalTrainer: "Leader Falkner" },
                    { displayName: "Bugsy", originalTrainer: "Leader Bugsy" },
                    { displayName: "Whitney", originalTrainer: "Leader Whitney" },
                    { displayName: "Morty", originalTrainer: "Leader Morty" },
                    { displayName: "Chuck", originalTrainer: "Leader Chuck" },
                    { displayName: "Jasmine", originalTrainer: "Leader Jasmine" },
                    { displayName: "Pryce", originalTrainer: "Leader Pryce" },
                    { displayName: "Clair", originalTrainer: "Leader Clair" },
                    { displayName: "Lance", originalTrainer: "Champion Lance" },
                    { displayName: "Blue", originalTrainer: "Leader Blue" },
                    { displayName: "Lance 2", originalTrainer: "Champion Lance" },
                    { displayName: "Red", originalTrainer: "Pokemon Trainer Red" }
                ]

                const result = []
                const completedIndices = new Set()

                // Add completed splits first, in the order they were completed
                for (const cur_split of currentSplits) {
                    for (let i = 0; i < hgssDefaultTrainers.length; i++) {
                        if (completedIndices.has(i)) continue
                        if (hgssDefaultTrainers[i].originalTrainer === cur_split.trainer) {
                            completedIndices.add(i)
                            let currentTime = cur_split.time || default_string
                            if (currentTime !== default_string && currentTime.includes('.')) {
                                currentTime = currentTime.split('.')[0]
                            }
                            result.push({
                                trainer: hgssDefaultTrainers[i].displayName,
                                original_trainer: hgssDefaultTrainers[i].originalTrainer,
                                current_time: currentTime
                            })
                            break
                        }
                    }
                }

                // Add remaining uncompleted splits in default order
                for (let i = 0; i < hgssDefaultTrainers.length; i++) {
                    if (!completedIndices.has(i)) {
                        result.push({
                            trainer: hgssDefaultTrainers[i].displayName,
                            original_trainer: hgssDefaultTrainers[i].originalTrainer,
                            current_time: default_string
                        })
                    }
                }
                return result
            }
            
            // Helper function to check if trainer should be displayed (only gym leaders, elite four, champion)
            const shouldDisplayTrainer = (trainer) => {
                // For HGSS, also allow "Pokemon Trainer Red"
                if (isHGSS && trainer === "Pokemon Trainer Red") {
                    return true
                }
                return trainer.startsWith("Leader ") || trainer.startsWith("Elite Four ") || trainer.startsWith("Champion ")
            }
            
            // Helper function to check if trainer should be displayed for HeartGold and SoulSilver
            const shouldDisplayTrainerHGSS = (displayName, originalTrainer, lanceCount) => {
                // Allowed trainers for HGSS: Falkner, Bugsy, Morty, Chuck, Jasmine, Pryce, Clair, Lance, Blue, Lance 2, Red
                const allowedTrainers = ["Falkner", "Bugsy", "Morty", "Chuck", "Jasmine", "Pryce", "Clair", "Lance", "Blue", "Red"]
                
                // Check if it's a base allowed trainer
                if (allowedTrainers.includes(displayName)) {
                    // Special handling for Lance - allow both "Lance" and "Lance 2"
                    if (displayName === "Lance") {
                        return true // First Lance is allowed
                    }
                    return true
                }
                
                // Check for "Lance 2"
                if (displayName === "Lance 2") {
                    return true
                }
                
                // Check for "Pokemon Trainer Red" which formats to "Red"
                if (originalTrainer === "Pokemon Trainer Red" && displayName === "Red") {
                    return true
                }
                
                return false
            }
            
            if (this.collect_split_data == true) {
                if (debugging_mode == true) { console.log("collect_split_data == true") } 
                const result = []

                let lastPushedTrainer = null; // Keep track of the last pushed trainer
                if (debugging_mode == true) { console.log("lastPushedTrainer:", lastPushedTrainer) } 

                const trainersToSkip = ["ELITE_FOUR_LORELEI_2", "ELITE_FOUR_BRUNO_2"]; // Trainers to skip

                // First mode: use default order, no CSV needed (DPPt path — HGSS already returned above)
                if (this.split_type === 'First') {
                    if (!this.game_data || !Array.isArray(this.game_data.splits)) {
                        return result
                    }
                    const default_string = "-"
                    const currentSplits = Array.isArray(this.effective_current_splits) ? this.effective_current_splits : []
                    const completedTrainers = new Set()

                    // Add completed splits first, in the order they were completed
                    for (const cur_split of currentSplits) {
                        if (!this.game_data.splits.includes(cur_split.trainer) || !shouldDisplayTrainer(cur_split.trainer)) continue
                        if (completedTrainers.has(cur_split.trainer)) continue

                        const displayName = this.format_display_name(cur_split.trainer, 1)
                        if (displayName === null) continue

                        let currentTime = cur_split.time || default_string
                        if (currentTime !== default_string && currentTime.includes('.')) {
                            currentTime = currentTime.split('.')[0]
                        }

                        result.push({trainer: displayName, original_trainer: cur_split.trainer, current_time: currentTime})
                        completedTrainers.add(cur_split.trainer)
                    }

                    // Add remaining uncompleted splits in default order
                    for (const trainer of this.game_data.splits) {
                        if (!shouldDisplayTrainer(trainer) || trainersToSkip.includes(trainer)) continue
                        if (completedTrainers.has(trainer)) continue

                        const displayName = this.format_display_name(trainer, 1)
                        if (displayName === null) continue

                        result.push({trainer: displayName, original_trainer: trainer, current_time: default_string})
                    }
                    return result
                }

                // Track occurrences for Rival, Cyrus, and Lance
                const rivalCount = { count: 0 }
                const cyrusCount = { count: 0 }
                const lanceCount = { count: 0 }

                // If no previous splits are loaded, return default list from game.splits but populate times from current_splits
                if (!this.previous_splits || this.previous_splits.length === 0) {
                    if (!this.game_data || !Array.isArray(this.game_data.splits)) {
                        return result
                    }
                    const default_string = "-"
                    const currentSplits = Array.isArray(this.effective_current_splits) ? this.effective_current_splits : []
                    let currentRivalIndex = 0
                    let currentCyrusIndex = 0
                    
                    for (const trainer of this.game_data.splits) {
                        if (!trainersToSkip.includes(trainer) && shouldDisplayTrainer(trainer)) {
                            // Track occurrences
                            let baseName = trainer
                            if (baseName.startsWith("Leader ")) baseName = baseName.substring(7)
                            else if (baseName.startsWith("Commander ")) baseName = baseName.substring(10)
                            else if (baseName.startsWith("Galactic Boss ")) baseName = baseName.substring(14)
                            else if (baseName.startsWith("Champion ")) baseName = baseName.substring(9)
                            
                            if (baseName === "Rival") {
                                rivalCount.count++
                                const displayName = this.format_display_name(trainer, rivalCount.count)
                                if (displayName === null) continue // Skip Rival 1
                            } else if (baseName === "Cyrus") {
                                cyrusCount.count++
                            } else if (baseName === "Lance") {
                                lanceCount.count++
                            }
                            
                            const displayName = this.format_display_name(trainer, baseName === "Rival" ? rivalCount.count : (baseName === "Cyrus" ? cyrusCount.count : (baseName === "Lance" ? lanceCount.count : 1)))
                            if (displayName === null) continue // Skip if null (Rival 1)
                            
                            // For HGSS, filter to only allowed trainers
                            if (isHGSS && !shouldDisplayTrainerHGSS(displayName, trainer, lanceCount.count)) {
                                continue
                            }
                            
                            // Handle Lance 2 for HGSS
                            let finalDisplayName = displayName
                            if (isHGSS && baseName === "Lance" && lanceCount.count === 2) {
                                finalDisplayName = "Lance 2"
                            }
                            
                            // Find matching split in current_splits
                            let currentTime = default_string
                            if (trainer === "Rival") {
                                // Find the Nth Rival in current_splits based on order
                                const rivalsInCurrent = currentSplits.filter(s => s.trainer === "Rival")
                                if (currentRivalIndex < rivalsInCurrent.length) {
                                    currentTime = rivalsInCurrent[currentRivalIndex].time || default_string
                                }
                                currentRivalIndex++
                            } else if (trainer === "Cyrus") {
                                // Find the Nth Cyrus in current_splits based on order
                                const cyrusInCurrent = currentSplits.filter(s => s.trainer === "Cyrus")
                                if (currentCyrusIndex < cyrusInCurrent.length) {
                                    currentTime = cyrusInCurrent[currentCyrusIndex].time || default_string
                                }
                                currentCyrusIndex++
                            } else if (trainer === "Champion Lance" || trainer === "Pokemon Trainer Red") {
                                // For Lance and Red, find by exact name match
                                const matchingSplit = currentSplits.find(s => s.trainer === trainer)
                                if (matchingSplit) {
                                    currentTime = matchingSplit.time || default_string
                                }
                            } else {
                                // For other trainers, find by exact name match
                                const matchingSplit = currentSplits.find(s => s.trainer === trainer)
                                if (matchingSplit) {
                                    currentTime = matchingSplit.time || default_string
                                }
                            }
                            
                            // Truncate milliseconds from time display (format: "M:SS.XX" -> "M:SS")
                            if (currentTime !== default_string && currentTime.includes('.')) {
                                currentTime = currentTime.split('.')[0]
                            }
                            
                            if (this.split_type == 'First') {
                                result.push({trainer: finalDisplayName, original_trainer: trainer, current_time: currentTime})
                            } else {
                                result.push({trainer: finalDisplayName, original_trainer: trainer, previous_time: default_string, current_time: currentTime, difference: default_string})
                            }
                        }
                    }
                    return result
                }
                
                // Track current_splits indices separately for Rival, Cyrus, and Lance to match by order
                let currentRivalIndex = 0
                let currentCyrusIndex = 0
                
                for (const x of this.previous_splits) {
                    if (debugging_mode == true) { console.log("Loop X:", x.trainer) } 
                    if (Array.isArray(this.game_data?.splits) && this.game_data.splits.includes(x.trainer) && shouldDisplayTrainer(x.trainer)) {
                        const default_string = "-"
                        
                        // Track occurrences
                        let baseName = x.trainer
                        if (baseName.startsWith("Leader ")) baseName = baseName.substring(7)
                        else if (baseName.startsWith("Commander ")) baseName = baseName.substring(10)
                        else if (baseName.startsWith("Galactic Boss ")) baseName = baseName.substring(14)
                        else if (baseName.startsWith("Champion ")) baseName = baseName.substring(9)
                        
                        if (baseName === "Rival") {
                            rivalCount.count++
                        } else if (baseName === "Cyrus") {
                            cyrusCount.count++
                        } else if (baseName === "Lance") {
                            lanceCount.count++
                        }
                        
                        const displayName = this.format_display_name(x.trainer, baseName === "Rival" ? rivalCount.count : (baseName === "Cyrus" ? cyrusCount.count : (baseName === "Lance" ? lanceCount.count : 1)))
                        if (displayName === null) continue // Skip Rival 1
                        
                        // For HGSS, filter to only allowed trainers
                        if (isHGSS && !shouldDisplayTrainerHGSS(displayName, x.trainer, lanceCount.count)) {
                            continue
                        }
                        
                        // Handle Lance 2 for HGSS
                        let finalDisplayName = displayName
                        if (isHGSS && baseName === "Lance" && lanceCount.count === 2) {
                            finalDisplayName = "Lance 2"
                        }
                        
                        // Find matching split in current_splits by order for Rival/Cyrus, by name for others
                        let cur_split = undefined
                        const currentSplits = Array.isArray(this.effective_current_splits) ? this.effective_current_splits : []
                        if (x.trainer === "Rival") {
                            // Find the Nth Rival in current_splits based on order
                            const rivalsInCurrent = currentSplits.filter(s => s.trainer === "Rival")
                            if (currentRivalIndex < rivalsInCurrent.length) {
                                // Find the index in the full current_splits array
                                let found = 0
                                for (let i = 0; i < currentSplits.length; i++) {
                                    if (currentSplits[i].trainer === "Rival") {
                                        if (found === currentRivalIndex) {
                                            cur_split = currentSplits[i]
                                            break
                                        }
                                        found++
                                    }
                                }
                            }
                            currentRivalIndex++
                        } else if (x.trainer === "Cyrus") {
                            // Find the Nth Cyrus in current_splits based on order
                            const cyrusInCurrent = currentSplits.filter(s => s.trainer === "Cyrus")
                            if (currentCyrusIndex < cyrusInCurrent.length) {
                                // Find the index in the full current_splits array
                                let found = 0
                                for (let i = 0; i < currentSplits.length; i++) {
                                    if (currentSplits[i].trainer === "Cyrus") {
                                        if (found === currentCyrusIndex) {
                                            cur_split = currentSplits[i]
                                            break
                                        }
                                        found++
                                    }
                                }
                            }
                            currentCyrusIndex++
                        } else if (x.trainer === "Champion Lance" || x.trainer === "Pokemon Trainer Red") {
                            // For Lance and Red, find by exact name match
                            cur_split = currentSplits.find(y => y.trainer === x.trainer)
                        } else {
                            // For other trainers, find by exact name match
                            cur_split = currentSplits.find(y => y.trainer === x.trainer)
                        }
                        
                        const prev = this.convertDurationToSeconds(x.time)
                        
                        if (cur_split == undefined) { 
                            if (x.trainer !== lastPushedTrainer && !trainersToSkip.includes(x.trainer)) { // Check if the current trainer is the same as the last pushed one and if it should be skipped
                                result.push({trainer: finalDisplayName, original_trainer: x.trainer, previous_time: this.convertSecondsToDuration(prev), current_time: default_string, difference: default_string}) 
                                lastPushedTrainer = x.trainer; // Update the last pushed trainer
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
                        if (debugging_mode == true) { console.log({trainer: x.trainer, previous_time: this.convertSecondsToDuration(prev), current_time: this.convertSecondsToDuration(cur), difference: diff_str}) } 
                        if (x.trainer !== lastPushedTrainer && !trainersToSkip.includes(x.trainer)) { // Check if the current trainer is the same as the last pushed one and if it should be skipped
                            if (debugging_mode == true) { console.log({trainer: x.trainer, previous_time: this.convertSecondsToDuration(prev), current_time: this.convertSecondsToDuration(cur), difference: diff_str}) } 
                            
                            result.push({trainer: finalDisplayName, original_trainer: x.trainer, previous_time: this.convertSecondsToDuration(prev), current_time: this.convertSecondsToDuration(cur), difference: diff_str})
                            lastPushedTrainer = x.trainer; // Update the last pushed trainer
                        }
                    }
                }
                return result
            }
            // If collect_split_data is false, still return default list
            if (!this.game_data || !Array.isArray(this.game_data.splits)) {
                return []
            }
            
            const result = []
            const default_string = "-"
            const trainersToSkip = ["ELITE_FOUR_LORELEI_2", "ELITE_FOUR_BRUNO_2"]
            const rivalCount = { count: 0 }
            const cyrusCount = { count: 0 }
            const lanceCount = { count: 0 }
            for (const trainer of this.game_data.splits) {
                if (!trainersToSkip.includes(trainer) && shouldDisplayTrainer(trainer)) {
                    // Track occurrences
                    let baseName = trainer
                    if (baseName.startsWith("Leader ")) baseName = baseName.substring(7)
                    else if (baseName.startsWith("Commander ")) baseName = baseName.substring(10)
                    else if (baseName.startsWith("Galactic Boss ")) baseName = baseName.substring(14)
                    else if (baseName.startsWith("Champion ")) baseName = baseName.substring(9)
                    
                    if (baseName === "Rival") {
                        rivalCount.count++
                        const displayName = this.format_display_name(trainer, rivalCount.count)
                        if (displayName === null) continue // Skip Rival 1
                    } else if (baseName === "Cyrus") {
                        cyrusCount.count++
                    } else if (baseName === "Lance") {
                        lanceCount.count++
                    }
                    
                    const displayName = this.format_display_name(trainer, baseName === "Rival" ? rivalCount.count : (baseName === "Cyrus" ? cyrusCount.count : (baseName === "Lance" ? lanceCount.count : 1)))
                    if (displayName === null) continue // Skip if null (Rival 1)
                    
                    // For HGSS, filter to only allowed trainers
                    if (isHGSS && !shouldDisplayTrainerHGSS(displayName, trainer, lanceCount.count)) {
                        continue
                    }
                    
                    // Handle Lance 2 for HGSS
                    let finalDisplayName = displayName
                    if (isHGSS && baseName === "Lance" && lanceCount.count === 2) {
                        finalDisplayName = "Lance 2"
                    }
                    
                    if (this.split_type == 'First') {
                        result.push({trainer: finalDisplayName, original_trainer: trainer, current_time: default_string})
                    } else {
                        result.push({trainer: finalDisplayName, original_trainer: trainer, previous_time: default_string, current_time: default_string, difference: default_string})
                    }
                }
            }
            return result
        },
        g4PokemonData() {
            const game = this.game?.properties?.meta?.game_name?.value
            if (!game) {
                return this.pokedex_plat || {}; // Default to platinum pokedex if mapper not ready
            }
            switch (game) {
                case "Diamond"                 : return this.pokedex_dp || {}
                case "Pearl"                   : return this.pokedex_dp || {}
                case "Diamond and Pearl"       : return this.pokedex_dp || {}
                case "Platinum"                : return this.pokedex_plat || {}
                case "HeartGold"               : return this.pokedex_hgss || {}
                case "SoulSilver"              : return this.pokedex_hgss || {}
                case "HeartGold and SoulSilver": return this.pokedex_hgss || {}
                default                        : return this.pokedex_plat || {}
            }
        },
        faults() {
            if (this.shuckie_counters) {
                return (this.emulatorStats?.counters?.blackout_counter ?? 0)
                     + (this.emulatorStats?.counters?.playerResets ?? 0)
            }
            return this.blackout_counter + this.playerResets
        },
        voltorb_flip() {
            const voltorb_flip_trigger = this.game.properties.screen.voltorb_flip.activate_voltorb_flip.value
            const map = this.game.properties.overworld.map_name.value 
            if (voltorb_flip_trigger == 160 && map == 'Goldenrod City - Map 31') {
                console.log("Voltorb Flip Active")
                return true
            }
            else {
                return false
            }
        },
        examined_trainer_data() {
            var trainer_id = ""
            var inputString = this.examined_trainer
            const underscoreIndex = inputString.indexOf('_');
            trainer_id = inputString.substring(underscoreIndex + 1);
            var data = this.trainers_hgss[trainer_id] ?? { name: "Unknown"}
            return data
        },
        double_battle_team_size() {
            const opponent_2 = this.game.properties.battle.opponent_2.trainer.value
            const opponent_1_team_count = this.game.properties.battle.opponent.team_count.value
            const opponent_2_team_count = this.game.properties.battle.opponent_2.team_count.value
            if (opponent_2) {
                return opponent_1_team_count + opponent_2_team_count
            }
            else {
                return opponent_1_team_count
            }
        },
        stats_header() {
            const toggle    = true
            const stat_type = this.stats_setting
            const year      = this.ui_stats_styling_modifier
            const state     = this.game.properties.meta.state.value
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
                // if (this.selected_game == 'Platinum' && this.game.properties.flags?.got_tm27_return?.value == false && state == 'Overworld') {
                //     return `IVs`
                // }
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
                            case "Overworld":   return `Level ${this.game.properties.player.team[0].level.value}`
                            case "To Battle":   return `Level ${this.game.properties.player.team[0].level.value}`
                            case "From Battle": return `Level ${this.stat_fix_lvl}`
                            case "Battle":      return `Level ${this.game.properties.battle.player.active_pokemon.level.value}`
                        }
                    }
                    case "Badge Boosts": return `Level ${this.game.properties.player.team[0].level.value}`
                }
            }
        },
        growth_rate() {
            return this.g4PokemonData[this.starter].growth_rate
        },
        pokemon_list() {
            // Build the dropdown list from the active pokedex (canonical names), excluding
            // any legacy/ROM alias keys mirrored on by applySpeciesAliases.
            const aliasNames = new Set(Object.keys(this.speciesNameAliases()));
            return Object.keys(this.g4PokemonData || {}).filter(name => !aliasNames.has(name));
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
        gametimeSplit() {
            h = this.game.properties.game_time.hours.value
            m = this.game.properties.game_time.minutes.value
            timecode = h + ":" + m.toString().padStart(2, "0")
            return timecode
        },
        game_data() {
            const game = this.game.properties.meta.game_name.value
            if (game == 'Platinum') { return this.game_variables['Platinum']; }
            if (game == 'HeartGold and SoulSilver') { return this.game_variables['HeartGold and SoulSilver']; }
        },
        /** The enemy team panel (core/overlay/EnemyTeamPanel.ts), worked out once per change in enemyPanel.ts. */
        enemy_team_view() {
            return enemyTeamView(this)
        },
        enemy_team_layout() {
            return enemyTeamLayout
        },
        enemy_mon_static() {
            const opponent_id = this.game.properties.battle.opponent.id.value
            const object      = this.selected_game == 'Platinum' ? this.platinum_trainers[opponent_id].party : 
                this.selected_game == 'HeartGold and SoulSilver' ? this.trainers_hgss[opponent_id].party :
                this.trainers_dp[opponent_id].party
            return object
        },
        enemy_2_mon_static() {
            const opponent_id = this.game.properties.battle.opponent_2?.trainer?.bytes
            const object      = this.selected_game == 'Platinum' ? this.platinum_trainers[opponent_id].party : 
                this.selected_game == 'HeartGold and SoulSilver' ? this.trainers_hgss[opponent_id].party :
                this.trainers_dp[opponent_id].party
            return object
        },
        heldItem() {
            const state = this.game.properties.meta.state.value
            if (this.game.properties.player?.team[0]?.held_item?.value == "Never-Melt Ice") { return "NeverMeltIce"}
            const battleItem = this.game.properties.battle?.player?.active_pokemon?.held_item?.value
            const teamItem   = this.game.properties.player?.team[0]?.held_item?.value
            switch (state) {
                case "Battle":
                    return battleItem || null
                case "From Battle":
                    return battleItem || teamItem || null
                default:
                    return teamItem || null
            }
        },
        enemy_graphic() {
            const state = this.game.properties.meta.state.value
            let show = false
            let delay = false
            let trainer = this.game?.properties.battle.opponent.trainer?.value ?? "none"
            let id = this.game?.properties.battle.opponent.id.value
            if (id == 0) { 
                return false 
            }
            switch (trainer) {
                // case "School Kid Christine": delay = true; break; // test case
                case "Leader Roark":         delay = true; break;
                case "Leader Gardenia":      delay = true; break;
                case "Leader Fantina":       delay = true; break;
                case "Leader Maylene":       delay = true; break;
                case "Leader Wake":          delay = true; break;
                case "Leader Byron":         delay = true; break;
                case "Leader Candice":       delay = true; break;
                case "Leader Volkner":       delay = true; break;
                case "Commander Mars":       delay = true; break;
                case "Commander Jupiter":    delay = true; break;
                case "Commander Saturn":     delay = true; break;
                case "Galactica Boss Cyrus": delay = true; break;
                case "Elite Four Aaron":     delay = true; break;
                case "Elite Four Bertha":    delay = true; break;
                case "Elite Four Flint":     delay = true; break;
                case "Elite Four Lucian":    delay = true; break;
                case "Champion Cynthia":     delay = true; break;
                default: delay = false; break;
            }
            if (this.game.properties.battle.opponent.trainer.value != null) {
                show = true
            }
            
            // console.log(show, delay, trainer, this.game.properties.battle.opponent.trainer.value, this.game.properties.meta.state.value)
            if (delay == true && state == `Battle`) {
                return true
            }
            else if (delay == true && state == `From Battle`) {
                return true
            }
            else if (delay == false && state == `Battle`) {
                return true
            }
            else {
                return false
            }
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
            if (this.right_display == 'Trainer') {
                totalPokemon = this.examined_trainer_data?.party?.length ?? 0
                return `height: ${heights[totalPokemon]}; filter: saturate(${this.ui_saturation}) drop-shadow(0px 0px 1px #000000)`;
            }
            totalPokemon = this.game.properties.battle.opponent.team_count.value;
            let game = this.game.properties.meta.game_name.value
            let opponent_2            = this.game.properties.battle.opponent_2.trainer.value
            let opponent_team_count   = this.game.properties.battle.opponent.team_count.value;
            let opponent_2_team_count = this.game.properties.battle.opponent_2.team_count.value;
            if (opponent_2 && game != "HeartGold and SoulSilver") {
                totalPokemon = opponent_team_count + opponent_2_team_count
            }
            return `height: ${heights[totalPokemon]}; filter: saturate(${this.ui_saturation}) drop-shadow(0px 0px 1px #000000)`;
        },
        solo_mon() {
            const state = this.game.properties.meta.state.value
            if (state == `Battle` || state == `From Battle`) {
                return this.game?.properties?.battle?.player?.active_pokemon
            }
            else if (state == `No Pokemon` || this.game?.properties?.player?.team[0]?.species?.value == null || this.game?.properties?.battle?.player?.team_count?.value == 0) {
                var data = this.g4PokemonData[this.starter]
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
                // var data = this.g4PokemonData[this.starter]
                // return {
                //     species: { value: data["name"] },
                //     ...data
                // }
                return this.g4PokemonData[this.starter]
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
            debugger
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
            // if (this.game.properties.meta.state.value == `Overworld`) { return this.g4PokemonData[this.game.properties.player.team[0].species.value].type_2 }
            // if (this.game.properties.meta.state.value == `No Pokemon`) { return this.g4PokemonData[this.starter].type_2}
            // else { return }
            // else { return this.g4PokemonData[this.starter].type_2}
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
            if (this.battleWeather() != null) {
                fieldArray[4] = this.battleWeather()
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
            if (this.g4PokemonData[this.starter].growth_rate == `GROWTH_MEDIUM_SLOW`) { return "Medium Slow" }
            if (this.g4PokemonData[this.starter].growth_rate == `GROWTH_MEDIUM_FAST`) { return "Medium Fast" }
            if (this.g4PokemonData[this.starter].growth_rate == `GROWTH_SLOW`) { return "Slow" }
            if (this.g4PokemonData[this.starter].growth_rate == `GROWTH_FAST`) { return "Fast" }
            if (this.g4PokemonData[this.starter].growth_rate == `GROWTH_FLUCTUATING`) { return "Fluctuating" }
            if (this.g4PokemonData[this.starter].growth_rate == `GROWTH_ERRATIC`) { return "Erratic" }
        },
        field_effect_array() {
            var effect_array = [
                ["Reflect", false, 0,],
                ["Light Screen", false, 0,],
                ["Safeguard", false, 0,],
                [this.battleWeather(), false, 0,],
            ]
            if (this.game.properties.meta.state.value == `Battle`) {
                effect_array[0][1] = this.batt.field.player.reflect?.value
                effect_array[0][2] = this.batt.field.player.reflect_count?.value
                effect_array[1][1] = this.batt.field.player.lightscreen?.value
                effect_array[1][2] = this.batt.field.player.lightscreen_count?.value
                effect_array[2][1] = this.batt.field.player.safeguard?.value
                effect_array[2][2] = this.batt.field.player.safeguard_count?.value
                effect_array[3][1] = this.battleWeather()
                effect_array[3][2] = this.batt.field.weather_count?.value
            }
            return effect_array
        },
        starting_type_fix() {
            if (this.g4PokemonData[this.starter]?.type_1?.toLowerCase() != this.g4PokemonData[this.starter]?.type_2?.toLowerCase()) {
                return this.g4PokemonData[this.starter]?.type_1?.toLowerCase()
            }
            else {
                return this.g4PokemonData[this.starter]?.type_2?.toLowerCase()
            }
        },
        dropdownDownMenuKeys() {
            return {
                textures: Object.keys(this.textures)
            }
        },
        statsDisplaySpecies() {
            // Return the species to display stats for
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
        displayedPokemonSpecies() {
            // Return the Pokemon species to display in the art
            // When evolution is enabled, use selected_evolution_species from dropdown
            // Otherwise, use starter
            // IMPORTANT: Only return species within the current evolution family to prevent error data from slipping through
            if (this.evolution && this.selected_evolution_species) {
                // Validate that selected_evolution_species is in the evolution family
                if (this.evolution_family_list.length > 0 && this.evolution_family_list.includes(this.selected_evolution_species)) {
                    return this.selected_evolution_species;
                }
                // If invalid, fallback to starter if it's in the family, otherwise use first valid family member
                if (this.evolution_family_list.length > 0) {
                    if (this.evolution_family_list.includes(this.starter)) {
                        return this.starter;
                    }
                    return this.evolution_family_list[0];
                }
            }
            // When evolution is disabled, still validate starter is valid if evolution family exists
            if (this.evolution && this.evolution_family_list.length > 0) {
                if (this.evolution_family_list.includes(this.starter)) {
                    return this.starter;
                }
                // Fallback to first valid family member
                return this.evolution_family_list[0];
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
            const hgss = this.selected_game == "HeartGold and SoulSilver";
            checkMapperForChapterMarkerProperties(this.game, {
                [hgss ? 'variables.game_started' : 'flags.new_game_1']: 'RESET marker',
                'battle.opponent.trainer':                  'trainer IN / OUT markers',
                'meta.state':                               'BLACKOUT markers',
                'meta.menu.app_overlay_id':                 '"MENU" markers',
                'overworld.map_index':                      '"Map Change" markers',
                'battle.player.party_position':             'BLACKOUT (HGSS) markers',
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
            const storageKey = this.getCurrentStorageKey();
            StyleSettingsUtils.resetToDefaults(storageKey);
            // Reload the styles
            if (this.evolution && this.selected_evolution_species) {
                this.loadEvolutionStyle(this.selected_evolution_species, true);
            } else {
                this.loadEvolutionStyle(this.starter, false);
            }
            console.log(`[StyleSettings] Reset "${storageKey}" to defaults and reloaded`);
        },
        
        /**
         * Reset all style settings to defaults (removes all user overrides)
         */
        resetAllStyleSettingsToDefaults() {
            StyleSettingsUtils.resetAllToDefaults();
            // Reload current styles
            if (this.evolution && this.selected_evolution_species) {
                this.loadEvolutionStyle(this.selected_evolution_species, true);
            } else {
                this.loadEvolutionStyle(this.starter, false);
            }
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
            const storageKey = this.getCurrentStorageKey();
            return StyleSettingsUtils.hasUserOverrides(storageKey);
        },
        // ============ End Style Settings Management Methods ============
        
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
        get_trainer_name(trainer_name, trainer_id) {
            // console.log(trainer_name, trainer_id)
            if (this.selected_game == "HeartGold and SoulSilver") {
                return trainer_name
            }
            switch (trainer_id) {
                case 850: return 'Rival 1'
                case 851: return 'Rival 1'
                case 852: return 'Rival 1'
                case 247: return 'Rival 2'
                case 248: return 'Rival 2'
                case 249: return 'Rival 2'
                case 470: return 'Rival 3'
                case 471: return 'Rival 3'
                case 472: return 'Rival 3'
                case 473: return 'Rival 4'
                case 474: return 'Rival 4'
                case 475: return 'Rival 4'
                case 476: return 'Rival 5'
                case 477: return 'Rival 5'
                case 478: return 'Rival 5'
                case 479: return 'Rival 6'
                case 480: return 'Rival 6'
                case 481: return 'Rival 6'
                case 295: return 'Mars 1'
                case 405: return 'Mars 2'
                case 528: return 'Mars 3'
                case 926: return 'Mars 4'
                case 406: return 'Jupiter 1'
                case 407: return 'Jupiter 2'
                case 927: return 'Jupiter 3'
                case 408: return 'Saturn 1'
                case 409: return 'Saturn 2'
                // Chronological Platinum: Celestic (913) → HQ (403) → Distortion World (404)
                case 913: return 'Cyrus 1'
                case 403: return 'Cyrus 2'
                case 404: return 'Cyrus 3'
                default : return trainer_name
            }
        },
        // Evolution family helper functions
        getFullyEvolvedSpecies(species) {
            // Get the fully evolved species from the evolution family
            // This is the species with method == null and parameter == null (or the last one)
            if (!this.g4PokemonData || !species) {
                return species;
            }
            const evolution_family = this.g4PokemonData[species]?.evolution_family;
            if (!evolution_family || evolution_family.length === 0) {
                return species; // If no evolution family, return the species itself
            }
            
            // Find the fully evolved species (the one with no method/parameter, or the last one)
            let fullyEvolved = species;
            for (const member of evolution_family) {
                if (member.method == null && member.parameter == null) {
                    fullyEvolved = member.species;
                }
            }
            // If we didn't find one with null method, get the last one
            if (fullyEvolved === species && evolution_family.length > 0) {
                fullyEvolved = evolution_family[evolution_family.length - 1].species;
            }
            return fullyEvolved;
        },
        getEvolutionFamily(species) {
            // Get the list of species in the evolution family
            if (!this.g4PokemonData || !species) {
                return [species];
            }
            const evolution_family = this.g4PokemonData[species]?.evolution_family;
            if (!evolution_family || evolution_family.length === 0) {
                return [species]; // If no evolution family, return just the species
            }
            return evolution_family.map(member => member.species).filter(s => s != null);
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
        getEvolutionStateStorageKey() {
            // Storage key for the per-starter evolution toggle + label.
            // The leading "evoState_" prefix is deliberate: it keeps this key from matching
            // isStyleSettingsKey() (which only matches "Game_..." or "...-line"), so these flags
            // are written straight to localStorage instead of being routed through the style
            // layering. The style layer strips any non-style property in dev mode (see
            // style_settings_manager._saveToDefaults), which would otherwise drop the toggle.
            const game = this.game?.properties?.meta?.game_name?.value || this.selected_game;
            return `evoState_${game}_${this.starter}`;
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
        getFinishFileName() {
            // Name used for the copies written into finishes/ at the end of a playthrough.
            //
            // getSplitFileName() names the shared attempts folder after the evolution family,
            // and getFullyEvolvedSpecies() just takes the last member of that family. That is
            // fine for a single-path line (Piplup -> "Empoleon-line"), but on a branching line
            // it always picks the same branch regardless of what is actually being played: an
            // Eevee run lands in "Glaceon-line" whether it ends as Vaporeon, Umbreon or Eevee.
            //
            // A finished run is no longer ambiguous, so name it after the species in hand.
            // this.starter tracks the live team[0] species (it is updated on evolution), and
            // is already validated against the evolution family, so it is the species the user
            // actually finished with.
            const finishedSpecies = this.starter;
            if (!this.evolution) {
                return finishedSpecies;
            }
            return `${finishedSpecies}-line`;
        },
        getCurrentStorageKey() {
            // Get the current storage key based on whether evolution is enabled and which species is selected
            if (this.evolution && this.selected_evolution_species) {
                return this.getStorageKey(this.selected_evolution_species, true);
            }
            return this.getStorageKey(this.starter, false);
        },
        async transfer_metrics(previous_mon_resets, previous_mon_blackouts, previous_mon_finished_runs, previous_mon_attempt_number) {
            await this.sleep(50)
            this.playerResets = previous_mon_resets
            this.blackout_counter = previous_mon_blackouts
            this.finished_run_count = previous_mon_finished_runs
            this.attempt_number = previous_mon_attempt_number
        },
        freezeEncounters() {
            const catch_state = this.game.properties.patch.stpCatchRate.value
            // Catch rate logic is not implemented yet within generation 4
            if (catch_state == 0 && this.catch_rate == true) { 
                this.game.properties.patch.stpCatchRate.set(1,false); 
            }
            this.disable_encounters()
        },
        disable_encounters() {
            const map = this.game.properties.overworld.map_name.value
            var rate = 30
            const team_0 = this.game.properties.player.team[0].species.value
            const team_1 = this.game.properties.player.team[1].species.value
            const team_2 = this.game.properties.player.team[2].species.value
            const team_3 = this.game.properties.player.team[3].species.value
            const team_4 = this.game.properties.player.team[4].species.value
            const team_5 = this.game.properties.player.team[5].species.value
            // console.log(team_0, team_1, team_2, team_3, team_4, team_5)
            if (this.selected_game == 'Platinum') {
                if (map == 'Route 201 - Map 1') {
                    if ((this.game.properties.patch.FLAG_FORCE_ROUTE_201_BIDOOF.value || this.game.properties.patch.FLAG_FORCE_ROUTE_201_STARLY.value) && this.game.properties.flags.lab_scene_ended.value == true) {
                        this.game.properties.overworld.encounter_rates.walking.set(rate, false)
                    }
                    else if (this.encounters_route_201) {
                        this.game.properties.overworld.encounter_rates.walking.set(rate, false)
                    }
                    else {
                        this.game.properties.overworld.encounter_rates.walking.set(0, false)
                    }
                }
                else if (map == 'Route 202 - Map 1') {
                    if ((this.game.properties.patch.FLAG_FORCE_ROUTE_202_BIDOOF.value || this.game.properties.patch.FLAG_FORCE_ROUTE_202_STARLY.value) && this.game.properties.flags.lab_scene_ended.value == true) {
                        this.game.properties.overworld.encounter_rates.walking.set(rate, false)
                    }
                    else if (this.encounters_route_202) {
                        this.game.properties.overworld.encounter_rates.walking.set(rate, false)
                    }
                    else {
                        this.game.properties.overworld.encounter_rates.walking.set(0, false)
                    }
                }
                else if (map == 'Route 203 - Map 1') {
                    if (this.game.properties.patch.FLAG_FORCE_ROUTE_203_ABRA.value) {
                        this.game.properties.overworld.encounter_rates.walking.set(rate, false)
                    }
                    else if (this.encounters_route_203) {
                        this.game.properties.overworld.encounter_rates.walking.set(rate, false)
                    }
                    else {
                        this.game.properties.overworld.encounter_rates.walking.set(0, false)
                    }
                }
                else if (map == 'Oreburgh Gate - Map 1') {
                    rate = 10
                    if ((this.game.properties.patch.FLAG_FORCE_OREBURGH_GATE_ZUBAT.value || this.game.properties.patch.FLAG_FORCE_OREBURGH_GATE_GEODUDE.value || this.game.properties.patch.FLAG_FORCE_OREBURGH_GATE_PSYDUCK.value) && this.game.properties.flags.lab_scene_ended.value == true) {
                        this.game.properties.overworld.encounter_rates.walking.set(rate, false)
                    }
                    else if (this.encounters_oreburgh_gate) {
                        this.game.properties.overworld.encounter_rates.walking.set(rate, false)
                    }
                    else {
                        this.game.properties.overworld.encounter_rates.walking.set(0, false)
                    }
                }
                else if (map == 'Route 207 - Map 1') {
                    // if (this.game.properties.patch.FLAG_FORCE_ROUTE_207_MACHOP.value || this.game.properties.patch.FLAG_FORCE_ROUTE_207_GEODUDE.value) {
                    //     this.game.properties.overworld.encounter_rates.walking.set(rate, false)
                    // }
                    // else if (this.encounters_oreburgh_gate) {
                    //     this.game.properties.overworld.encounter_rates.walking.set(rate, false)
                    // }
                    // else {
                    //     this.game.properties.overworld.encounter_rates.walking.set(0, false)
                    // }
                }
                else if (map == 'Oreburgh Mine - Map 2' || map == 'Oreburgh Mine - Map 3') {
                    rate = 10
                    if (this.game.properties.patch.FLAG_FORCE_OREBURGH_MINE_GEODUDE.value && this.game.properties.flags.lab_scene_ended.value == true) {
                        this.game.properties.overworld.encounter_rates.walking.set(rate, false)
                    }
                    else if (this.encounters_oreburgh_mine) {
                        this.game.properties.overworld.encounter_rates.walking.set(rate, false)
                    }
                    else {
                        this.game.properties.overworld.encounter_rates.walking.set(0, false)
                    }
                }
            }
            else if (this.selected_game == 'HeartGold and SoulSilver') {
                encounters_on = 0
                encounters_off = 1
                if (map == 'Route 29 - Map 1') {
                    if (this.encounters_route_29) {
                        this.game.properties.patch.stpEncounterRate.set(encounters_on, false)
                    }
                    else {
                        this.game.properties.patch.stpEncounterRate.set(encounters_off, false)
                    }
                }
                else if (map == 'Route 30 - Map 1') {
                    if (this.encounters_route_30) {
                        this.game.properties.patch.stpEncounterRate.set(encounters_on, false)
                    }
                    else {
                        this.game.properties.patch.stpEncounterRate.set(encounters_off, false)
                    }
                }
                else if (map == 'Sprout Tower - Map 2' || map == 'Sprout Tower - Map 3') {
                    rate = 5
                    if (this.encounters_sprout_tower) {
                        this.game.properties.patch.stpEncounterRate.set(encounters_on, false)
                    }
                    else {
                        this.game.properties.patch.stpEncounterRate.set(encounters_off, false)
                    }
                }
            }
        },
        async update_rom_starter_and_intro_mon() {
            let starter = this.starter
            let game = this.selected_game
            if (game == "Platinum") {
                await Promise.all([
                    this.game.properties.patch.stpStarterSpecies.set(starter, true),
                ])
            }
            if (game == "HeartGold and SoulSilver") {
                await Promise.all([
                    this.game.properties.patch.stpStarterSpecies.set(starter, true),
                ])
            }
        },
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
        async update_moveset() {
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
                await this.game.properties.player.team[0].moves[0].move.set(move1, false)
                await this.game.properties.player.team[0].moves[0].pp.set(pp1["PP"], false)
            }
            if (move2 != "") {
                await this.game.properties.player.team[0].moves[1].move.set(move2, false)
                await this.game.properties.player.team[0].moves[1].pp.set(pp2["PP"], false)
            }
            if (move3 != "") {
                await this.game.properties.player.team[0].moves[2].move.set(move3, false)
                await this.game.properties.player.team[0].moves[2].pp.set(pp3["PP"], false)
            }
            if (move4 != "") {
                await this.game.properties.player.team[0].moves[3].move.set(move4, false)
                await this.game.properties.player.team[0].moves[3].pp.set(pp4["PP"], false)
            }
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
            const global_pointer = this.game.properties.meta.global_pointer.value
            // console.log(global_pointer)
            if (badge == true && state!= `No Pokemon`) {
                return true
            }
            else {
                return false
            }
        },
        // Open the folder ./splits/ in the file explorer with node.js
        openFolder(folderName) {
            // Was `start .\\<folder>\\` from the renderer; the main process opens the folder
            // under <appRoot>/splits (plan 1.6/1.7). Nothing calls this with anything but
            // `splits`, which is the splits root itself.
            revealSplitFolder(folderName === "splits" ? "" : folderName);
        },
        // Open the splits folder based on current configuration
        openCurrentSplitsFolder() {
            // Determine game name (uses same logic as logData function)
            let gameName = 'Platinum';
            const gameNameValue = this.game?.properties?.meta?.game_name?.value || this.selected_game;
            if (gameNameValue === 'HeartGold and SoulSilver') {
                gameName = 'HGSS';
            }
            
            // Get split file name based on current settings
            const splitFileName = this.getSplitFileName();
            
            // Build the path (matches the path used in logData)
            // Was `start "" ".\\splits\\..."` from the renderer; the main process creates the
            // folder under <appRoot>/splits and opens it (plan 1.6/1.7).
            let folderPath;
            if (this.refilming_mode === true) {
                folderPath = splitPath(gameName, "refilmed", splitFileName);
            } else {
                folderPath = splitPath(gameName, splitFileName);
            }

            revealSplitFolder(folderPath);
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
            
            for (let pokemon of Object.values(this.g4PokemonData)) {
                let stat = pokemon[`base_${stat_label}`];
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
            const logging = false
            const state = this.game.properties.meta.state.value
            const held_item = state == 'Battle' ? this.game.properties.battle.player.active_pokemon.held_item.value : this.game.properties.player.team[0].held_item.value
            const species = state == 'Battle' ? this.game.properties.battle.player.active_pokemon.species.value : this.game.properties.player.team[0].species.value
            var ability = this.pkmn_ability
            var status_condition = this.game.properties.player.team[0].status_condition.value

            var starter = this.evolution ? this.selected_evolution_species : this.starter

            function choice_specs(stat) {
                return Math.floor(stat * 1.5)
            }
            // Held items that scale a stat in the damage calculation (pokeplatinum BattleSystem_CalcMoveDamage);
            // Klutz switches them off. Light Ball doubles move power there, so it is in the power column instead.
            function item_stat_boosts(stats) {
                if (ability == 'Klutz') return stats
                let { Atk, Def, SpA, SpD } = stats
                if (held_item == 'Choice Band') Atk = Math.floor(Atk * 1.5)
                if (held_item == 'Thick Club' && (species == 'Cubone' || species == 'Marowak')) Atk = Atk * 2
                if ((held_item == 'Deep Sea Tooth' || held_item == 'DeepSeaTooth') && species == 'Clamperl') SpA = SpA * 2
                if ((held_item == 'Deep Sea Scale' || held_item == 'DeepSeaScale') && species == 'Clamperl') SpD = SpD * 2
                if (held_item == 'Soul Dew' && (species == 'Latios' || species == 'Latias')) {
                    SpA = Math.floor(SpA * 1.5)
                    SpD = Math.floor(SpD * 1.5)
                }
                // Transform copies the target's species, so a transformed Ditto loses it
                if (held_item == 'Metal Powder' && species == 'Ditto') Def = Def * 2
                return { Atk, Def, SpA, SpD }
            }
            let HP  = 0
            let Atk = 0
            let Def = 0
            let SpA = 0
            let SpD = 0
            let SpE = 0
            // const active_pokemonPv = this.game.properties.battle.player.active_pokemon.internals.personality_value
            // const teamPokemonPv = this.game.properties.player.team[0].internals.personality_value
            if (state == `Overworld` || state == `To Battle`) {
                if (logging) console.log("Overworld stats...")
                HP = this.game.properties.player.team[0].stats.hp_max.value
                Atk = this.game.properties.player.team[0].stats.attack.value
                if (ability == 'Hustle') {
                    Atk = Math.floor(Atk * 1.5)
                }
                else if (ability == 'Huge Power') {
                    Atk = Math.floor(Atk * 2)
                }
                else if (ability == 'Pure Power') {
                    Atk = Math.floor(Atk * 2)
                }
                else {
                    Atk = this.game.properties.player.team[0].stats.attack.value
                }

                Def = this.game.properties.player.team[0].stats.defense.value
                SpA = held_item == 'Choice Specs' ? choice_specs(this.game.properties.player.team[0].stats.special_attack.value) : this.game.properties.player.team[0].stats.special_attack.value
                SpD = this.game.properties.player.team[0].stats.special_defense.value
                ;({ Atk, Def, SpA, SpD } = item_stat_boosts({ Atk, Def, SpA, SpD }))
                // Marvel Scale: Defense x1.5 with any status
                if (status_condition && ability == 'Marvel Scale') {
                    Def = Math.floor(Def * 1.5)
                }
                // The Speed it will have on entering battle (core/logic/battleSpeed.ts): items, status, Slow Start
                SpE = gen45TurnOrderSpeed(4, {
                    speed: this.game.properties.player.team[0].stats.speed.value,
                    ability, item: held_item, species, status: status_condition,
                })
                // Guts: any status, sleep and freeze included (pokeplatinum BattleSystem_CalcMoveDamage)
                if (status_condition && ability == 'Guts') {
                    Atk = Math.floor(Atk * 1.5)
                }

                if (ability == 'Slow Start') {
                    Atk = Math.floor(Atk * 0.5)
                }
                // if (HP == 0, Atk == 0, Def == 0, SpA == 0, SpD == 0, SpE == 0) {
                //     const pokemonData = this.g4PokemonData?.[starter]
                //     const baseStats = pokemonData?.base_stats
                //     if (!pokemonData || !baseStats) {
                //         return {
                //             "Hp" : 0,
                //             "Atk": 0,
                //             "Def": 0,
                //             "SpA": 0,
                //             "SpD": 0,
                //             "Spe": 0,
                //         }
                //     }
                //     return {
                //         "Hp" : baseStats.hp,
                //         "Atk": baseStats.attack,
                //         "Def": baseStats.defense,
                //         "SpA": baseStats.special_attack,
                //         "SpD": baseStats.special_defense,
                //         "Spe": baseStats.speed,
                //     }
                // }
                return {
                    "Hp" : HP,
                    "Atk": Atk,
                    "Def": Def,
                    "SpA": SpA,
                    "SpD": SpD,
                    "Spe": SpE,
                }
            }
            else if (state == `Battle`) {
                if (logging) console.log("Battle stats...")
                var battle_overide = false
                status_condition = this.game.properties.battle.player.active_pokemon.status_condition.value
                if (
                    this.game.properties.battle.player.active_pokemon.modifiers.attack.value == "-6" &&
                    this.game.properties.battle.player.active_pokemon.modifiers.defense.value == "-6" &&
                    this.game.properties.battle.player.active_pokemon.modifiers.special_attack.value == "-6" &&
                    this.game.properties.battle.player.active_pokemon.modifiers.special_defense.value == "-6" &&
                    this.game.properties.battle.player.active_pokemon.modifiers.speed.value == "-6" &&
                    this.game.properties.battle.player.active_pokemon.modifiers.accuracy.value == "-6" &&
                    this.game.properties.battle.player.active_pokemon.modifiers.evasion.value == "-6"
                ) {
                    battle_overide = true
                }
                if (battle_overide == true) {
                    const pokemonData = this.g4PokemonData?.[starter]
                    const baseStats = pokemonData?.base_stats
                    if (!pokemonData || !baseStats) {
                        return {
                            "Hp" : 0,
                            "Atk": 0,
                            "Def": 0,
                            "SpA": 0,
                            "SpD": 0,
                            "Spe": 0,
                        }
                    }
                    return {
                        "Hp" : baseStats.hp ?? 0,
                        "Atk": baseStats.attack ?? 0,
                        "Def": baseStats.defense ?? 0,
                        "SpA": baseStats.special_attack ?? 0,
                        "SpD": baseStats.special_defense ?? 0,
                        "Spe": baseStats.speed ?? 0,
                    }
                }

                this.stat_fix_toggle = true
                ability = this.game.properties.battle.player.active_pokemon.ability.value
                const weather = this.effectiveWeather()
                // const ability = this.game.properties.battle.player.active_pokemon.ability.value

                // Simple doubles every stat stage, clamped to the -6..+6 range
                function simple_stage(modifier) {
                    let stage = Number(modifier) || 0
                    if (ability == 'Simple') {
                        stage = Math.max(-6, Math.min(6, stage * 2))
                    }
                    return stage
                }
                const mod_atk = simple_stage(this.game.properties.battle.player.active_pokemon.modifiers.attack.value)
                const mod_def = simple_stage(this.game.properties.battle.player.active_pokemon.modifiers.defense.value)
                const mod_spa = simple_stage(this.game.properties.battle.player.active_pokemon.modifiers.special_attack.value)
                const mod_spd = simple_stage(this.game.properties.battle.player.active_pokemon.modifiers.special_defense.value)
                const mod_spe = simple_stage(this.game.properties.battle.player.active_pokemon.modifiers.speed.value)
                HP  = this.game.properties.battle.player.active_pokemon.stats.hp_max.value
                Atk = this.game.properties.battle.player.active_pokemon.stats.attack.value
                Def = this.game.properties.battle.player.active_pokemon.stats.defense.value
                SpA = this.game.properties.battle.player.active_pokemon.stats.special_attack.value
                SpD = this.game.properties.battle.player.active_pokemon.stats.special_defense.value
                if (ability == 'Slow Start' && this.battleFlags('player_active')?.slow_start_ended?.value != true) {
                    Atk = Math.floor(Atk * 0.5)
                }
                // Guts: any status, sleep and freeze included (pokeplatinum BattleSystem_CalcMoveDamage)
                if (status_condition && ability == 'Guts') {
                    Atk = Math.floor(Atk * 1.5)
                }

                if (ability == 'Hustle') {
                    Atk = Math.floor(Atk * 1.5)
                }
                else if (ability == 'Huge Power') {
                    Atk = Math.floor(Atk * 2)
                }
                else if (ability == 'Pure Power') {
                    Atk = Math.floor(Atk * 2)
                }

                ;({ Atk, Def, SpA, SpD } = item_stat_boosts({ Atk, Def, SpA, SpD }))
                if (status_condition && ability == 'Marvel Scale') {
                    Def = Math.floor(Def * 1.5)
                }
                // Sun, unless Cloud Nine / Air Lock: Solar Power SpA x1.5; Flower Gift (Cherrim) Atk and SpD x1.5
                if (weather == 'Sun' && !this.weatherSuppressed()) {
                    if (ability == 'Solar Power') {
                        SpA = Math.floor(SpA * 1.5)
                    }
                    if (ability == 'Flower Gift') {
                        Atk = Math.floor(Atk * 1.5)
                        SpD = Math.floor(SpD * 1.5)
                    }
                }

                let battle_hp  = HP
                let battle_atk = Math.floor(Atk * this.stageModifiersData.stats[mod_atk]) == 0 ? 1 : Math.floor(Atk * this.stageModifiersData.stats[mod_atk])
                let battle_def = Math.floor(Def * this.stageModifiersData.stats[mod_def]) == 0 ? 1 : Math.floor(Def * this.stageModifiersData.stats[mod_def])
                let battle_spa = Math.floor(SpA * this.stageModifiersData.stats[mod_spa]) == 0 ? 1 : Math.floor(SpA * this.stageModifiersData.stats[mod_spa])
                let battle_spd = Math.floor(SpD * this.stageModifiersData.stats[mod_spd]) == 0 ? 1 : Math.floor(SpD * this.stageModifiersData.stats[mod_spd])
                // The Speed the game compares for turn order (core/logic/battleSpeed.ts)
                let battle_spe = Math.max(1, this.playerTurnOrderSpeed())
                if (weather == "Sandstorm") {
                    const type_1 = this.game.properties.battle.player.active_pokemon.type_1.value
                    const type_2 = this.game.properties.battle.player.active_pokemon.type_2.value
                    if (type_1 == "Rock" || type_2 == "Rock") {
                        battle_spd = Math.floor(battle_spd * 1.5)
                    }
                }
                if (held_item == 'Choice Specs') {
                    battle_spa = choice_specs(battle_spa)
                }
                return {
                    "Hp" : battle_hp,
                    "Atk": battle_atk,
                    "Def": battle_def,
                    "SpA": battle_spa,
                    "SpD": battle_spd,
                    "Spe": battle_spe,
                }
            }
            else if (state == `From Battle`) {
                if (logging) console.log("From Battle stats...")

                if (this.stat_fix_toggle = true) {
                    this.stat_fix_toggle = false
                    HP = this.game.properties.battle.player.active_pokemon.stats.hp_max.value
                    Atk = this.game.properties.battle.player.active_pokemon.stats.attack.value
                    if (ability == 'Hustle') {
                        Atk = Math.floor(Atk * 1.5)
                    }
                    else if (ability == 'Huge Power') {
                        Atk = Math.floor(Atk * 2)
                    }
                    else if (ability == 'Pure Power') {
                        Atk = Math.floor(Atk * 2)
                    }

                    Def = this.game.properties.battle.player.active_pokemon.stats.defense.value
                    SpA = held_item == 'Choice Specs' ? choice_specs(this.game.properties.battle.player.active_pokemon.stats.special_attack.value) : this.game.properties.battle.player.active_pokemon.stats.special_attack.value
                    SpD = this.game.properties.battle.player.active_pokemon.stats.special_defense.value
                    ;({ Atk, Def, SpA, SpD } = item_stat_boosts({ Atk, Def, SpA, SpD }))
                    SpE = this.game.properties.battle.player.active_pokemon.stats.speed.value
                    if (held_item == 'Macho Brace') {
                        SpE = Math.floor(SpE * 0.5)
                    }
                    
                    if (status_condition && ability == 'Quick Feet') {
                        SpE = Math.floor(SpE * 1.5)
                    }
                    if (status_condition == 'Paralyzed' && ability != 'Quick Feet') {
                        SpE = Math.floor(SpE / 4)
                    }
                    if (ability == 'Slow Start') {
                        Atk = Math.floor(Atk * 0.5)
                        SpE = Math.floor(SpE * 0.5)
                    }
                    if (this.game.properties.battle.player.active_pokemon.stats.defense.value < 2000) {
                        this.stat_fix_lvl = this.game.properties.battle.player.active_pokemon.level.value
                        this.stat_fix_hp  = HP
                        this.stat_fix_atk = Atk
                        this.stat_fix_def = Def
                        this.stat_fix_spa = SpA
                        this.stat_fix_spd = SpD
                        this.stat_fix_spe = SpE
                    }
                }
                return {
                    "Hp" : this.stat_fix_hp,
                    "Atk": this.stat_fix_atk,
                    "Def": this.stat_fix_def,
                    "SpA": this.stat_fix_spa,
                    "SpD": this.stat_fix_spd,
                    "Spe": this.stat_fix_spe
                }
            }
            else if (state == `No Pokemon`) {
                if (logging) console.log("No Pokemon stats...")

                const pokemonData = this.g4PokemonData?.[starter]
                const baseStats = pokemonData?.base_stats
                if (!pokemonData || !baseStats) {
                    return {
                        "Hp" : 0,
                        "Atk": 0,
                        "Def": 0,
                        "SpA": 0,
                        "SpD": 0,
                        "Spe": 0,
                    }
                }
                return {
                    "Hp" : baseStats.hp ?? 0,
                    "Atk": baseStats.attack ?? 0,
                    "Def": baseStats.defense ?? 0,
                    "SpA": baseStats.special_attack ?? 0,
                    "SpD": baseStats.special_defense ?? 0,
                    "Spe": baseStats.speed ?? 0,
                }
            }
        },
        closeRNGModal() {
            this.showRNGModal = false;
            MyStorage['rng_config'] = this.rng_config;
        },
        calculate_ev_benefit(stat_name) {
            const state = this.game.properties.meta.state.value
            if (state == 'No Pokemon') {
                return
            }

            let level = this.game.properties.player.team[0].level.value
            let species = this.evolution ? this.selected_evolution_species : this.starter
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
                    let no_ev_stat   = calculate_hp(iv_hp, 0, level, this.g4PokemonData[species]?.base_stats?.hp ?? 1)
                    let difference   = current_stat - no_ev_stat
                    return difference
                }
                case 'attack': {
                    let current_stat = this.get_stat().Atk
                    let no_ev_stat   = calculate_other_stat(iv_atk, 0, level, this.g4PokemonData[species]?.base_stats.attack, nature_modifiers?.nature_attack ?? 1)
                    let difference   = current_stat - no_ev_stat
                    return difference
                }
                case 'defense': {
                    let current_stat = this.get_stat().Def
                    let no_ev_stat   = calculate_other_stat(iv_def, 0, level, this.g4PokemonData[species]?.base_stats.defense, nature_modifiers?.nature_defense ?? 1)
                    let difference   = current_stat - no_ev_stat
                    return difference
                }
                case 'special_attack': {
                    let current_stat = this.get_stat().SpA
                    let no_ev_stat   = calculate_other_stat(iv_spa, 0, level, this.g4PokemonData[species]?.base_stats.special_attack, nature_modifiers?.nature_specialAttack ?? 1)
                    let difference   = current_stat - no_ev_stat
                    return difference
                }
                case 'special_defense': {
                    let current_stat = this.get_stat().SpD
                    let no_ev_stat   = calculate_other_stat(iv_spd, 0, level, this.g4PokemonData[species]?.base_stats.special_defense, nature_modifiers?.nature_specialDefense ?? 1)
                    let difference   = current_stat - no_ev_stat
                    return difference
                }
                case 'speed': {
                    let current_stat = this.get_stat().Spe
                    let no_ev_stat   = calculate_other_stat(iv_spe, 0, level, this.g4PokemonData[species]?.base_stats.speed, nature_modifiers?.nature_speed ?? 1)
                    let difference   = current_stat - no_ev_stat
                    return difference
                }
                default: {
                    return
                }
            }
        },
        statLabelOpacity() {
            let default_opacity = .63
            let faded_opacity = .1
            let mod_atk = this.game.properties.battle.player.active_pokemon.modifiers.attack.value != '0'          && this.game.properties.meta.state.value == 'Battle' && !this.not_valid_battle_state ? faded_opacity : default_opacity
            let mod_def = this.game.properties.battle.player.active_pokemon.modifiers.defense.value != '0'         && this.game.properties.meta.state.value == 'Battle' && !this.not_valid_battle_state ? faded_opacity : default_opacity
            let mod_spa = this.game.properties.battle.player.active_pokemon.modifiers.special_attack.value != '0'  && this.game.properties.meta.state.value == 'Battle' && !this.not_valid_battle_state ? faded_opacity : default_opacity
            let mod_spd = this.game.properties.battle.player.active_pokemon.modifiers.special_defense.value != '0' && this.game.properties.meta.state.value == 'Battle' && !this.not_valid_battle_state ? faded_opacity : default_opacity
            let mod_spe = this.game.properties.battle.player.active_pokemon.modifiers.speed.value != '0'           && this.game.properties.meta.state.value == 'Battle' && !this.not_valid_battle_state ? faded_opacity : default_opacity
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
            //! EVOLUTION_FIX needed here, recall base stats from the selected evolution species when evolution mode is enabled
            var starter = this.evolution ? this.selected_evolution_species : this.starter
            const data    = this.g4PokemonData[starter]
            if (!data?.base_stats) return 0
            const hp      = data.base_stats.hp
            const atk     = data.base_stats.attack
            const def     = data.base_stats.defense
            const spa     = data.base_stats.speed
            const spd     = data.base_stats.special_attack
            const spe     = data.base_stats.special_defense
            const total   = hp + atk + def + spa + spd + spe
            return total
        },
        get_base_stat(stat_path) {
            //! EVOLUTION_FIX needed here, recall base stats from the selected evolution species when evolution mode is enabled
            var starter = this.evolution ? this.selected_evolution_species : this.starter
            return this.g4PokemonData[starter]?.base_stats?.[stat_path]
        },
        post_game_move_style(move_object) {
            const game_name = 'Platinum' //change this to be dynamic when adding more games
            const move_name = move_object.Move
            var strikethrough_tmhm = ""
            var strikethrough_tutor = ""
            if (this.track_TMHM_viability == false) {
                return {
                    tmhm: strikethrough_tmhm,
                    tutor: strikethrough_tutor,
                }
            }
            if (this.post_game_moves[game_name].tmhm.includes(move_name)) {
                strikethrough_tmhm = "text-decoration: line-through;"
            }
            if (this.post_game_moves[game_name].tutor.includes(move_name)) {
                strikethrough_tutor = "text-decoration: line-through;"
            }
            return {
                tmhm: strikethrough_tmhm,
                tutor: strikethrough_tutor,
            }
        },
        copyCurrentStylesToAllFamilyMembers() {
            // Copy all style settings from the currently selected evolution family member
            // to all other members of the evolution family
            if (!this.evolution || !this.selected_evolution_species || this.evolution_family_list.length <= 1) {
                // console.log("Evolution mode must be enabled and you must have multiple species in the evolution family.")
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
                    // console.log(`Copied to ${targetSpecies} (key: ${targetStorageKey}):`, copiedValues[targetSpecies]);
                    // Verify what was actually saved
                    // console.log(`Verified storage for ${targetSpecies}:`, verifiedData);
                }
            });
            
            // console.log(`Successfully copied style settings from "${sourceSpecies}" (key: ${sourceStorageKey}) to ${copiedCount} other family member(s).`);
        },
        load_all_settings() {
            // Set flag to prevent watchers from saving during loading
            this.is_loading_evolution_style = true;

            const game_name                    = this.game.properties.meta.game_name.value
            const storedStarter = MyStorage["starter"]
            if (storedStarter != null) {
                const canonical = this.normalizeSpeciesName(storedStarter)
                if (canonical !== storedStarter) {
                    MyStorage["starter"] = canonical
                }
            }
            this.starter                       = MyStorage["starter"]                ?? "Heatran"
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
            this.route_101 =                  MyStorage['route_101']                  ?? true
            this.route_102 =                  MyStorage['route_102']                  ?? true
            this.route_103 =                  MyStorage['route_103']                  ?? true
            this.hm_102_zigzagoon =           MyStorage['hm_102_zigzagoon']           ?? true
            this.hm_104_marill =              MyStorage['hm_104_marill']              ?? true
            this.hm_104_taillow =             MyStorage['hm_104_taillow']             ?? true
            this.testRun =                    MyStorage['testRun']                    ?? false
            this.simple_data_str =            MyStorage['simple_data_str']            ?? ""
            this.simple_data =                MyStorage['simple_data']                ?? ""
            this.time_split_start =           MyStorage['time_split_start']           ?? "00:00:00:00"
            this.battle_start =               MyStorage['battle_start']               ?? 0
            this.encounters_route_1 =         MyStorage['encounters_route_1']         ?? false
            this.encounters_route_2 =         MyStorage['encounters_route_2']         ?? false
            this.editor =                     MyStorage['editor']                     ?? false
            this.debugging_mode =             MyStorage['debugging_mode']             ?? true
            this.held_item_replacement =      MyStorage['held_item_replacement']      ?? ""
            this.move1_replacement =          MyStorage['move1_replacement']          ?? ""
            this.move2_replacement =          MyStorage['move2_replacement']          ?? ""
            this.move3_replacement =          MyStorage['move3_replacement']          ?? ""
            this.move4_replacement =          MyStorage['move4_replacement']          ?? ""
            this.right_ui =                   readRightPanelMode(MyStorage['right_ui']).mode
            this.split_type =                 MyStorage['split_type']                 ?? "First"
            this.catch_rate =                 MyStorage['catch_rate']                 ?? false
            this.rng_config =                 MyStorage['rng_config']                 ?? this.rng_config

            const evolution_family = (this.g4PokemonData && this.starter) ? (this.g4PokemonData[this.starter]?.evolution_family ?? [ {species: null, method: null,}, {species: null, method: null,}, {species: null, method: null,}, ]) : [ {species: null, method: null,}, {species: null, method: null,}, {species: null, method: null,}, ]
            // Evolution flags live in their own non-style key; fall back to the legacy base key.
            const evoStateKey = this.getEvolutionStateStorageKey()
            this.evolution =               MyStorage[evoStateKey]?.evolution              ?? MyStorage[`${game_name}_${this.starter}`]?.evolution              ?? false
            this.evolution_splits_label =  MyStorage[evoStateKey]?.evolution_splits_label ?? MyStorage[`${game_name}_${this.starter}`]?.evolution_splits_label ?? ""
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
                this.pkmn_ability = familyStored.pkmn_ability ?? MyStorage[`${game_name}_${this.starter}`]?.pkmn_ability ?? (this.g4PokemonData?.[this.starter]?.abilities?.[0]) ?? null;
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
                this.overlay_color = MyStorage[`${game_name}_${this.starter}`]?.overlay_color ?? this.default_colors[`${this.g4PokemonData?.[this.starter]?.type_1}`] ?? this.default_colors.Normal
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
                this.backgroundTexture =     MyStorage[`${game_name}_${this.starter}`]?.backgroundTexture ?? `${this.g4PokemonData?.[this.starter]?.type_1 ?? 'Normal'}`
                this.backgroundBrightness =  MyStorage[`${game_name}_${this.starter}`]?.backgroundBrightness ?? 100
                this.backgroundContrast =    MyStorage[`${game_name}_${this.starter}`]?.backgroundContrast ?? 100
                this.backgroundSaturation =  MyStorage[`${game_name}_${this.starter}`]?.backgroundSaturation ?? 100
                this.apply_texture_look()
                
                //UI styling
                this.ui_saturation =  MyStorage[`${game_name}_${this.starter}`]?.ui_saturation ?? .6

                //main pokemon settings (only load from individual storage when evolution is disabled)
                this.pkmnNature   = MyStorage[`${game_name}_${this.starter}`]?.pkmnNature            ?? "Hardy"

                if (this.g4PokemonData?.[this.starter]?.abilities && this.g4PokemonData[this.starter].abilities.indexOf(this.pkmn_ability) == -1 && !MyStorage[`${game_name}_${this.starter}`]?.pkmn_ability) {
                    this.pkmn_ability = this.g4PokemonData[this.starter].abilities[0]
                }
                else {
                    this.pkmn_ability = MyStorage[`${game_name}_${this.starter}`]?.pkmn_ability          ?? this.g4PokemonData?.[this.starter]?.abilities?.[0] ?? null
                }
            }

            if (this.set_starter_stats_object) {
                this.set_starter_stats_object.gender = this.pkmn_gender;
                this.set_starter_stats_object.nature = this.pkmnNature;
                this.set_starter_stats_object.ability = this.pkmn_ability;
            }
            
            // Clear flag after loading is complete, use $nextTick to ensure all watchers have fired
            this.$nextTick(() => {
                this.is_loading_evolution_style = false;
            });
        },
        reset() {
            this.backgroundBlur =        0,
            this.backgroundHue =         0,
            this.backgroundScale =       100,
            this.backgroundUrl =         "",
            this.use_custom_background = false,
            this.backgroundXOffset =     0,
            this.backgroundYOffset =     0,
            this.backgroundTexture =     this.g4PokemonData[this.starter]?.type_1?.toLowerCase(),
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
            // console.log(MyStorage.entries())
        },
        set_pokemon_prop(property_name, value) {
            // Use the appropriate storage key based on evolution mode
            const storageKey = this.getCurrentStorageKey();
            MyStorage[storageKey] = {
                ...MyStorage[storageKey],
                [property_name]: value,
            }
        },
        updateEvolutionFamilyList() {
            // Update the evolution family list when starter changes
            this.evolution_family_list = this.getEvolutionFamily(this.starter);

            // Preload the family's art so a mid-run evolution cross-fades into a decoded image
            // instead of fading in a blank one. Only the family, never the full dex.
            for (const family_species of this.evolution_family_list) {
                const family_art = new Image();
                family_art.src = `images/gen4/pokemon/${family_species}.webp`;
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
        /**
         * Map an ability when switching evolution family style species: same slot index on the new species
         * (e.g. Glameow Limber slot 1 → Purugly Thick Fat slot 1).
         */
        mapAbilityByEvolutionSlot(oldSpecies, newSpecies, previousAbilityName) {
            const oldAbilities = this.g4PokemonData?.[oldSpecies]?.abilities;
            const newAbilities = this.g4PokemonData?.[newSpecies]?.abilities;
            if (!newAbilities?.length) {
                return previousAbilityName;
            }
            // Already one of the new species' abilities (e.g. the queuer's /set-ability landed
            // before /set-evolution switched the family from last run's species): keep it, as
            // gen3's mapAbilityToSpecies does, rather than sliding it to slot 0.
            if (newAbilities.includes(previousAbilityName)) {
                return previousAbilityName;
            }
            let slot = 0;
            if (oldAbilities?.length && previousAbilityName != null && previousAbilityName !== '') {
                const idx = oldAbilities.indexOf(previousAbilityName);
                if (idx >= 0) {
                    slot = idx;
                }
            }
            if (slot >= newAbilities.length) {
                slot = Math.max(0, newAbilities.length - 1);
            }
            return newAbilities[slot] ?? null;
        },
        loadEvolutionStyle(species, useEvolutionLine = false) {
            // Set flag to prevent watchers from saving during loading
            this.is_loading_evolution_style = true;
            
            // Load styles for a species, either from evolution line storage or individual storage
            const game_name = this.game?.properties?.meta?.game_name?.value || this.selected_game;
            const storageKey = useEvolutionLine ? this.getStorageKey(species, true) : this.getStorageKey(species, false);
            
            // Debug: Log what we're trying to load
            // console.log(`Loading styles for ${species} (useEvolutionLine: ${useEvolutionLine}, key: ${storageKey})`);
            // console.log(`Storage data for ${species}:`, MyStorage[storageKey]);
            
            // Load overlay and image settings
            this.overlay_color = MyStorage[storageKey]?.overlay_color ?? this.default_colors[this.g4PokemonData?.[species]?.type_1] ?? this.default_colors.Normal;
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
            
            this.backgroundTexture = 'backgroundTexture' in stored ? stored.backgroundTexture : `${this.g4PokemonData?.[species]?.type_1 ?? 'Normal'}`;
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
                    this.pkmn_ability = this.g4PokemonData?.[species]?.abilities?.[0] ?? null;
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
            
            // // Debug: Log what was actually loaded
            // console.log(`Loaded background settings for ${species}:`, {
            //     backgroundTexture: this.backgroundTexture,
            //     backgroundXOffset: this.backgroundXOffset,
            //     backgroundYOffset: this.backgroundYOffset,
            //     backgroundScale: this.backgroundScale,
            //     backgroundBrightness: this.backgroundBrightness,
            //     backgroundContrast: this.backgroundContrast,
            //     backgroundSaturation: this.backgroundSaturation,
            //     backgroundBlur: this.backgroundBlur,
            //     backgroundHue: this.backgroundHue,
            //     backgroundFlip: this.backgroundFlip
            // });
            
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
            
            const oldOverlayColor = MyStorage[oldStorageKey]?.overlay_color ?? this.default_colors[this.g4PokemonData?.[oldSpecies]?.type_1] ?? this.default_colors.Normal;
            const newOverlayColor = MyStorage[newStorageKey]?.overlay_color ?? this.default_colors[this.g4PokemonData?.[newSpecies]?.type_1] ?? this.default_colors.Normal;
            
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
        speciesNameAliases() {
            // Map from the ROM/legacy species name to the canonical pokedex key: the bare name
            // the mapper reports means the default form ("Wormadam" -> "Wormadam (Plant)").
            return DEFAULT_FORM_ALIASES;
        },
        normalizeSpeciesName(name) {
            if (name == null) return name;
            const aliases = this.speciesNameAliases();
            return aliases[name] || name;
        },
        formFromGame(rawName) {
            // The pokedex key for the form the game holds on the lead party slot, or null when
            // `rawName` has no forms, the byte isn't readable (mapper not loaded) or it names
            // a form the dex in play lacks
            const forms = POKEMON_FORMS[rawName];
            if (!forms) return null;
            const form_byte = this.game?.properties?.player?.team?.[0]?.flags?.alternate_forms?.value;
            const from_game = Object.keys(forms).find(species => forms[species] === form_byte);
            return from_game && this.g4PokemonData?.[from_game] ? from_game : null;
        },
        resolveIncomingSpecies(rawName) {
            // The emulator reports species by name and keeps the form in a separate byte, so every
            // cloaked Wormadam arrives as a bare "Wormadam". The user's Solo Pokemon selection wins
            // when it is a form of the reported species (a fresh hand-over of the starter they
            // picked; syncFormByte stamps its byte onto the game); otherwise the form byte the game
            // holds picks the entry, which is how a Burmy that evolved wearing a Sandy cloak lands
            // on "Wormadam (Sandy)" instead of Plant - the evolution toggle's family list then
            // follows the cloak the game actually produced. Species without forms pass through.
            if (rawName == null) return rawName;
            if (!POKEMON_FORMS[rawName]) return this.normalizeSpeciesName(rawName);
            if (POKEMON_FORM_INFO[this.starter]?.base === rawName) return this.starter;
            return this.formFromGame(rawName) ?? this.normalizeSpeciesName(rawName);
        },
        syncFormByte(species) {
            // Whenever the user picks a form in the dropdown, push the matching form byte to the
            // emulator so the in-game form follows the selection without waiting for
            // setStartingStats (which only fires when level becomes 5 at the starter map).
            // A byte the game already holds is left alone: after Burmy evolves, the starter lands
            // on the cloak the game chose, and re-stamping the same value would be a no-op write.
            const info = POKEMON_FORM_INFO[species];
            if (!info) return;
            const party_mon = this.game?.properties?.player?.team?.[0];
            const prop = party_mon?.flags?.alternate_forms;
            if (!prop?.set) return;
            if (party_mon.species?.value !== info.base) return;
            if (prop.value === info.form) return;
            prop.set(info.form, false);
        },
        applySpeciesAliases() {
            // Make each pokedex resolve both the legacy/ROM name and the canonical name
            // to the same entry, so any incidental lookup by the legacy name still works.
            const aliases = this.speciesNameAliases();
            const dexes = [this.pokedex_plat, this.pokedex_dp, this.pokedex_hgss];
            for (const dex of dexes) {
                if (!dex) continue;
                for (const [legacy, canonical] of Object.entries(aliases)) {
                    if (dex[canonical] && !dex[legacy]) dex[legacy] = dex[canonical];
                }
            }
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
        enemyPkmnUI(pkmnData) {
            const state = this.game.properties.meta.state.value
            if (state != `Battle` && state != `From Battle`) { return "opacity: 1" }
            if (pkmnData.stats.hp.value == 0 || state == `From Battle`) {
                return "opacity: .5;"
            }
            else {
                return "opacity: 1"
            }
        },
        //*timer methods
        //start the timer
        startTime() {
            if (this.timer_pause == false) {
                return
            }
            const timeRegex = /(\d+):(\d{2}):(\d{2})\.(\d{2})/;
            const timeOffsetArray = this.timer_startTimeOffset.match(timeRegex)?.slice(1,5).map(x => parseInt(x)) ?? [0,0,0,0];
            const timeOffset = timeOffsetArray[0] * 3600000 + timeOffsetArray[1] * 60000 + timeOffsetArray[2] * 1000 + timeOffsetArray[3] * 10;

            this.timer_startTime = Date.now() - timeOffset
            this.timer_pause = false
            this.updateTime()
        },
        //stop the timer
        stopTime() {
            this.timer_pause_time = Date.now()
            this.timer_pause = true
        },
        //animate the timer
        updateTime() {
            var time = Date.now() - this.timer_startTime
            if (this.timer_pause == true) {
                time = this.timer_pause_time - this.timer_startTime
            }
            var f = (x) => x.toString().padStart(2, "0")
            var c = (Math.floor(time / 10) % 100)
            var s = (Math.floor(time / 1000) % 60)
            var m = (Math.floor(time / 60000) % 60)
            var h = (Math.floor(time / 3600000))
            this.time_h = h
            this.time_m = m
            this.time_s = s
            this.time_ms = c
            if (h != 0) {
                this.timer_formatted_time = [ h + ":" + f(m) + ":" + f(s), "." + f(c), h + "h" + m + "m" + s + "s", ]
            }
            else if (m != 0) {
                this.timer_formatted_time = [ m + ":" + f(s), "." + f(c), h + "h" + m + "m" + s + "s", ]
            }
            else {
                this.timer_formatted_time = [ s, "." + f(c), h + "h" + m + "m" + s + "s", ]
            }
            if (this.timer_pause == false && !this._unmounted) {
                setImmediate(() => {
                    requestAnimationFrame(this.updateTime)
                })
            }
        },
        //pause the timer
        pauseUnpauseTime() {
            if (this.timer_pause == true) {
                this.timer_pause = false
                this.timer_startTime += Date.now() - this.timer_pause_time
                this.updateTime()
            }
            else {
                this.timer_pause = true
                this.timer_pause_time = Date.now()
            }
        },
        set_timer() {
            if (this.shuckie_timer == true) {
                this.sendEmulatorStart();
            }            
            else {
                const timeRegex = /(\d+):(\d{2}):(\d{2})\.(\d{2})/;
                const timeOffsetArray = this.timer_startTimeOffset.match(timeRegex)?.slice(1,5).map(x => parseInt(x)) ?? [0,0,0,0];
                const timeOffset = timeOffsetArray[0] * 3600000 + timeOffsetArray[1] * 60000 + timeOffsetArray[2] * 1000 + timeOffsetArray[3] * 10;

                this.timer_pause = true
                this.timer_startTime = Date.now() - timeOffset
                this.timer_pause_time = Date.now()
                this.timer_formatted_time = [ "0", ".00" ]
                this.finished_logs = false

                this.updateTime()
            }
        },
        newRun() {
            const timeRegex = /(\d+):(\d{2}):(\d{2})\.(\d{2})/;
            const timeOffsetArray = this.timer_startTimeOffset.match(timeRegex)?.slice(1,5).map(x => parseInt(x)) ?? [0,0,0,0];
            const timeOffset = timeOffsetArray[0] * 3600000 + timeOffsetArray[1] * 60000 + timeOffsetArray[2] * 1000 + timeOffsetArray[3] * 10;
            this.run_complete = false
            this.starter_received = false,

            this.kanto_badges = false
            this.timer_pause = true
            this.timer_startTime = Date.now() - timeOffset
            this.timer_pause_time = Date.now()
            this.timer_formatted_time = [ "0", ".00" ]
            this.playerResets = 0
            this.finished_logs = false
            this.blackout_counter = 0
            this.playerId = 0
            // this.playerName = "NINTEN"
            this.current_splits = []
            this.previous_splits = []

            this.updateTime()
            if (this.timer_formatted_time[0] == "0" && this.timer_formatted_time[1] == ".00") {
                console.log('Setting ROM starter automatically')
                this.update_rom_starter_and_intro_mon()
            }
        },
        getTrainerGraphic() {
            if (this.game.properties.meta.state == `Battle` || this.game.properties.meta.state == `From Battle`) {
                let graphic = `images/gen4/trainers/roark.webp`
                let trainer = this.game.properties.battle.opponent.trainer.value
                let bytes = this.game.properties.battle.opponent.trainer.bytes
                let id_value = this.game.properties.battle.opponent.id.value
                let displayGraphicState = this.enemy_graphic == true ? true : false
                if (this.selected_game == `Platinum` || this.selected_game == `Diamond and Pearl`) {
                    switch (trainer) {
                        case "Leader Roark":      graphic = `images/gen4/trainers/roark.webp`;       break;
                        case "Leader Gardenia":   graphic = `images/gen4/trainers/gardenia.webp`;    break;
                        case "Leader Fantina":    graphic = `images/gen4/trainers/fantina.webp`;     break;
                        case "Leader Wake":       graphic = `images/gen4/trainers/crasherwake.webp`; break;
                        case "Leader Maylene":    graphic = `images/gen4/trainers/maylene.webp`;     break;
                        case "Leader Candice":    graphic = `images/gen4/trainers/candice.webp`;     break;
                        case "Leader Volkner":    graphic = `images/gen4/trainers/volkner.webp`;     break;
                        case "Leader Byron":      graphic = `images/gen4/trainers/byron.webp`;       break;
                        case "Elite Four Aaron":  graphic = `images/gen4/trainers/aaron.webp`;       break;
                        case "Elite Four Bertha": graphic = `images/gen4/trainers/bertha.webp`;      break;
                        case "Elite Four Flint":  graphic = `images/gen4/trainers/flint.webp`;       break;
                        case "Elite Four Lucian": graphic = `images/gen4/trainers/lucian.webp`;      break;
                        case "Rival": {
                            switch (this.game.properties.battle.opponent.team_count.value) {
                                case 1: graphic = `images/gen4/trainers/rival1mon.webp`; break;
                                case 2: graphic = `images/gen4/trainers/rival1mon.webp`; break;
                                case 4: graphic = `images/gen4/trainers/rival4mon.webp`; break;
                                case 5: graphic = `images/gen4/trainers/rival5mon.webp`; break;
                                case 6: displayGraphicState = false; break;
                                default: graphic = `images/gen4/trainers/rival1mon.webp`; break;
                            }
                            break;
                        }   
                        case "Commander Mars": {
                            switch (id_value) {
                                case 295: graphic = `images/gen4/trainers/mars.webp`;  break;
                                case 405: graphic = `images/gen4/trainers/mars2.webp`; break;
                                case 528: graphic = `images/gen4/trainers/mars.webp`;  break;
                                case 926: { // TODO
                                    graphic = `images/gen4/trainers/mars.webp`;  
                                    displayGraphicState = false;
                                    break; 
                                } 
                                default:  graphic = `images/gen4/trainers/mars.webp`;  break;
                            }
                            break;
                        }           
                        case "Commander Jupiter": {
                            switch (bytes) {
                                case 406: graphic = `images/gen4/trainers/jupiter.webp`; break;
                                case 407: graphic = `images/gen4/trainers/jupiter.webp`; break;
                                case 927: { // TODO
                                    graphic = `images/gen4/trainers/jupiter.webp`; 
                                    displayGraphicState = false;
                                    break; 
                                } 
                                default:  graphic = `images/gen4/trainers/jupiter.webp`; break;
                            }
                            break;
                        }            
                        case "Commander Saturn": {
                            switch (bytes) {
                                case 408: graphic = `images/gen4/trainers/saturn.webp`; break;
                                case 409: graphic = `images/gen4/trainers/saturn.webp`; break; 
                                default:  graphic = `images/gen4/trainers/saturn.webp`; break;
                            }
                            break;
                        }            
                        case "Galactic Boss Cyrus": {
                            switch (id_value) {
                                case 403: graphic = `images/gen4/trainers/cyrus_1_2.webp`; break;
                                case 404: graphic = `images/gen4/trainers/cyrus_3.webp`; break;
                                case 913: graphic = `images/gen4/trainers/cyrus_1_2.webp`; break;
                                default:  graphic = `images/gen4/trainers/cyrus_3.webp`;   break;
                            }
                            break;
                        }            
                        default: displayGraphicState = false; break;
                    } 
                }
                if (this.selected_game == `HeartGold and SoulSilver`) {
                    switch (trainer) {
                        case "Leader Falkner":    graphic = `images/gen4/trainers/falkner.webp`; break;
                        case "Leader Bugsy":      graphic = `images/gen4/trainers/bugsy.webp`;   break;
                        case "Leader Whitney":    graphic = `images/gen4/trainers/whitney.webp`; break;
                        case "Leader Morty":      graphic = `images/gen4/trainers/morty.webp`;   break;
                        case "Leader Chuck":      graphic = `images/gen4/trainers/chuck.webp`;   break;
                        case "Leader Pryce":      graphic = `images/gen4/trainers/pryce.webp`;   break;
                        case "Leader Jasmine":    graphic = `images/gen4/trainers/jasmine.webp`; break;
                        case "Leader Clair":      graphic = `images/gen4/trainers/clair.webp`;   break;
                        case "Leader Brock":      graphic = `images/gen4/trainers/brock.webp`;   break;
                        case "Leader Misty":      graphic = `images/gen4/trainers/misty.webp`;   break;
                        case "Leader Lt. Surge":  graphic = `images/gen4/trainers/surge.webp`;   break;
                        case "Leader Erika":      graphic = `images/gen4/trainers/erika.webp`;   break;
                        case "Leader Sabrina":    graphic = `images/gen4/trainers/sabrina.webp`; break;
                        case "Leader Janine":     graphic = `images/gen4/trainers/janine.webp`;  break;
                        case "Leader Blaine":     graphic = `images/gen4/trainers/blaine.webp`;  break;
                        case "Fisherman Ralph":   graphic = `images/gen4/trainers/ralph.webp`;   break;
                        case "Hiker Anthony":     graphic = `images/gen4/trainers/anthony.webp`; break;
                        case "Fisherman Justin":  graphic = `images/gen4/trainers/justin.webp`;  break;
                        case "Black Belt Yoshi":  graphic = `images/gen4/trainers/yoshi.webp`;   break;
                        case "Black Belt Lao":    graphic = `images/gen4/trainers/lao.webp`;     break;
                        case "Black Belt Nob":    graphic = `images/gen4/trainers/nob.webp`;     break;
                        case "School Kid Chad":   graphic = `images/gen4/trainers/chad.webp`;    break;
                        case "Kimono Girl Zuki":  graphic = `images/gen4/trainers/zuki.webp`;    break;
                        case "Kimono Girl Naoko": graphic = `images/gen4/trainers/naoko.webp`;   break;
                        case "Kimono Girl Miki":  graphic = `images/gen4/trainers/miki.webp`;    break;
                        case "Kimono Girl Sayo":  graphic = `images/gen4/trainers/sayo.webp`;    break;
                        case "Kimono Girl Kuni":  graphic = `images/gen4/trainers/kuni.webp`;    break;
                        case "Elite Four Will": {
                            switch (this.game.properties.battle.opponent.trainer.bytes) {
                                case 245: graphic = `images/gen4/trainers/will.webp`; break;
                                case 702: displayGraphicState = false;          break;
                                default:  displayGraphicState = false;          break;
                            }
                            break;
                        }   
                        case "Elite Four Koga": {
                            switch (this.game.properties.battle.opponent.trainer.bytes) {
                                case 247: graphic = `images/gen4/trainers/koga.webp`; break;
                                case 703: displayGraphicState = false;          break;
                                default:  displayGraphicState = false;          break;
                            }
                            break;
                        }   
                        case "Elite Four Bruno": {
                            switch (this.game.properties.battle.opponent.trainer.bytes) {
                                case 418: graphic = `images/gen4/trainers/bruno.webp`; break;
                                case 704: displayGraphicState = false;           break;
                                default:  displayGraphicState = false;           break;
                            }
                            break;
                        }   
                        case "Elite Four Karen": {
                            switch (this.game.properties.battle.opponent.trainer.bytes) {
                                case 246: graphic = `images/gen4/trainers/karen.webp`; break;
                                case 705: displayGraphicState = false;           break;
                                default:  displayGraphicState = false;           break;
                            }
                            break;
                        }   
                        case "Passerby Boy": {
                            switch (this.game.properties.battle.opponent.trainer.bytes) {
                                case 495: graphic = `images/gen4/trainers/passerby boy.webp`; break;
                                case 496: graphic = `images/gen4/trainers/passerby boy.webp`; break;
                                case 497: graphic = `images/gen4/trainers/passerby boy.webp`; break;
                                default:  graphic = `images/gen4/trainers/passerby boy.webp`; break;
                            }
                            break;
                        }
                        case "Rival": {
                            switch (this.game.properties.battle.opponent.trainer.bytes) {
                                case 1:   graphic = `images/gen4/trainers/rival2.webp`;    break;
                                case 2:   graphic = `images/gen4/trainers/rival2.webp`;    break;
                                case 3:   graphic = `images/gen4/trainers/rival2.webp`;    break;
                                case 263: graphic = `images/gen4/trainers/rival3.webp`;    break;
                                case 264: displayGraphicState = false; break;
                                case 265: graphic = `images/gen4/trainers/rival2.webp`;    break;
                                case 266: graphic = `images/gen4/trainers/rival2.webp`;    break;
                                case 267: graphic = `images/gen4/trainers/rival3.webp`;    break;
                                case 268: displayGraphicState = false; break;
                                case 269: graphic = `images/gen4/trainers/rival2.webp`;    break;
                                case 270: graphic = `images/gen4/trainers/rival3.webp`;    break;
                                case 271: graphic = `images/gen4/trainers/rival4.webp`;    break;
                                case 272: displayGraphicState = false; break;
                                case 285: displayGraphicState = false; break;
                                case 286: displayGraphicState = false; break;
                                case 287: displayGraphicState = false; break;
                                case 288: graphic = `images/gen4/trainers/rival4.webp`;    break;
                                case 289: graphic = `images/gen4/trainers/rival4.webp`;    break;
                                default:  graphic = `images/gen4/trainers/rival1mon.webp`; break;
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
                    graphic: `images/gen4/trainers/roark.webp`,
                    name: "Error - there is no trainer graphic to display. Use 'v-if' to disable rendering of this code through the .state property of this object.",
                }
            }
        },
        get_friendship() {
            const state = this.game.properties.meta.state.value
            const battle_friendship = this.game.properties.battle.player.active_pokemon.friendship.value
            const team_friendship = this.game.properties.player.team[0].friendship.value
            var return_value = 0
            switch (state) {
                case `Battle`: 
                    this.buffer_battle_friendship = battle_friendship; 
                    return_value = battle_friendship; 
                    break;
                case `From Battle`: 
                    return_value = this.buffer_battle_friendship; 
                    break;
                case `No Pokemon`: 
                    if (this.game.properties.player.team[0].species.value != null) {
                        return_value = team_friendship; 
                    }
                    else {
                        return_value = 0; 
                    }
                    break;
                case `Overworld`: 
                    return_value = team_friendship; 
                    break;
                case `To Battle`: 
                    return_value = team_friendship; 
                    break;
            }
            return return_value + "/255"
        },
        getMoveCategory(category, move) {
            var move = move
            var categoryText = category
            if (this.ready == false) { return ["", "",]}
            if (category == "Physical") { return [category, "current_physical"] }
            if (category == "Special")  { return [category, "current_special"] }
            if (category == "Status")   { return [category, "current_status"] }
            else {return [category, "current_physical"]}
        },
        getStat(stat) { //stat = the name of the stat ie. "hp", "attack", "defense", etc.
            const state = this.game.properties.meta.state.value
            const battle_ram = this.game.properties.battle.player.active_pokemon
            var ability = this.game.properties.battle.player.active_pokemon.ability.value
            var currentStat = 0
            var modifier = 0
            var stageModification = 1
            var return_value = 0

            var starter = this.evolution ? this.selected_evolution_species : this.starter

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
                return_value = this.g4PokemonData[starter]?.base_stats?.[stat]
            }
            else if (state == `Overworld` || state == `To Battle`) {
                return_value = this.game?.properties?.player?.team[0].stats[stat].value
                if (stat == 'speed' && this.game.properties.player.team[0].status_condition.value == 'Paralyzed') {
                    return_value = Math.floor(return_value / 4)
                }
            }
            // console.log(stat, state, currentStat, modifier, stageModification, return_value) 
            return return_value
        },
        getEnemyStat(statName, statValue, slotIndex) { //stat = the name of the stat ie. "hp", "attack", "defense", etc.
            let currentStat = 0
            let modifier = this.game?.properties?.battle?.opponent?.active_pokemon?.modifiers[statName].value
            // console.log('Enemy Stat:', statValue)
            if (modifier == null) {
                return statValue
            }
            if (statName == 'speed') {
                // The Speed the game compares for turn order (core/logic/battleSpeed.ts)
                const speed = this.enemyTurnOrderSpeed(slotIndex)
                return speed == 0 || speed > 1500 ? statValue : speed
            }
            else if (this.game.properties.meta.state.value == `Battle` && this.game.properties.battle.opponent.party_position == slotIndex) {
                currentStat = this.game?.properties?.battle?.opponent?.team[slotIndex].stats[statName].value
                
                stageModification = this.stageModifiersData.stats[modifier]
                let weatherMod = 1
                if (statName == 'speed') {
                    let ability = this.enemy_mon_static[slotIndex]?.ability
                    if (this.effectiveWeather() == 'Sun' && ability == 'Chlorophyll') {
                        weatherMod = 2
                    }
                    else if (this.effectiveWeather() == 'Rain' && ability == 'Swift Swim') {
                        weatherMod = 2
                    }
                }
                if (statName == 'special_defense') {
                    let type1 = this.g4PokemonData[this.enemy_mon_static[slotIndex]?.species]?.type_1
                    let type2 = this.g4PokemonData[this.enemy_mon_static[slotIndex]?.species]?.type_2
                    if (this.effectiveWeather() == 'Sandstorm' && (type1 == 'Rock' || type2 == 'Rock')) {
                        weatherMod = 1.5
                    }
                }
                calculated_stats = Math.floor(currentStat * stageModification * weatherMod)

                if (calculated_stats == 0 || calculated_stats > 1500) { 
                    return statValue 
                } 
                else {
                    return calculated_stats
                }
            }
            else {
                let weatherMod = 1
                if (statName == 'speed') {
                    let ability = this.enemy_mon_static[slotIndex]?.ability
                    if (this.effectiveWeather() == 'Sun' && ability == 'Chlorophyll') {
                        weatherMod = 2
                    }
                    else if (this.effectiveWeather() == 'Rain' && ability == 'Swift Swim') {
                        weatherMod = 2
                    }
                }
                if (statName == 'special_defense') {
                    let type1 = this.g4PokemonData[this.enemy_mon_static[slotIndex]?.species]?.type_1
                    let type2 = this.g4PokemonData[this.enemy_mon_static[slotIndex]?.species]?.type_2
                    if (this.effectiveWeather() == 'Sandstorm' && (type1 == 'Rock' || type2 == 'Rock')) {
                        weatherMod = 1.5
                    }
                }

                return Math.floor(this.game?.properties?.battle?.opponent?.team[slotIndex].stats[statName].value * weatherMod)
            }
        },
        enemyMove(slot, moveNumber) {
            if (this.game.properties.meta.state.value == `Battle` || this.game.properties.meta.state.value == `From Battle`) {
                return this.enemy_mon_static[slot].moves[moveNumber]
            }
            else {
                return
            }
        },
        getMove(moveNumber) {
            const state = this.game.properties.meta.state.value
            const species = this.game.properties.player.team[0].species.value
            const active_pokemonPv = this.game.properties.battle.player.active_pokemon.internals.personality_value.value
            const teamPokemonPv = this.game.properties.player.team[0].internals.personality_value.value
            if (state == `Battle` || state == `From Battle` || (state == `No Pokemon` && species != null && active_pokemonPv == teamPokemonPv)) {
                // return this.game.properties.battle.player.active_pokemon?.moves[moveNumber]?.move?.value
                if (this.game.properties.battle.player.active_pokemon?.moves[moveNumber - 1]?.move.value) {
                    return this.game.properties.battle.player.active_pokemon?.moves[moveNumber - 1]?.move.value
                }
            }
            else if (state == `Overworld`) {
                // return this.game.properties.player.team[0]?.moves["move" + moveNumber]?.move.value
                if (this.game.properties.player.team[0]?.moves[moveNumber - 1]?.move.value) {
                    return this.game.properties.player.team[0]?.moves[moveNumber - 1]?.move.value
                }
            }
            else if (state == `No Pokemon`) {
                return
            }
        },
        getMoveType(x) {
            const move = this.platinum_moves[this.getMove(x)]?.Move
            if (move == 'Natural Gift') {
                return this.moveType(move)
            }
            else {
                return this.platinum_moves[this.getMove(x)]?.Type.toLowerCase()
            }
        },
        getMoveObject(moveNumber) {
            const state = this.game.properties.meta.state.value
            const species = this.game.properties.player.team[0].species.value
            const active_pokemonPv = this.game.properties.battle.player.active_pokemon.internals.personality_value.value
            const teamPokemonPv = this.game.properties.player.team[0].internals.personality_value.value
            if (state == `Battle` || state == `From Battle` || (state == `No Pokemon` && species != null && active_pokemonPv == teamPokemonPv)) {
                if (this.game.properties.battle.player.active_pokemon?.moves[moveNumber - 1]?.move.value) {
                    return this.game.properties.battle.player.active_pokemon?.moves[moveNumber - 1]
                }
            }
            else if (state == `Overworld`) {
                if (this.game.properties.player.team[0]?.moves[moveNumber - 1]?.move.value) {
                    return this.game.properties.player.team[0]?.moves[moveNumber - 1]
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
            const species = this.game.properties.player.team[0].species.value
            const active_pokemonPv = this.game.properties.battle.player.active_pokemon.internals.personality_value.value
            const teamPokemonPv = this.game.properties.player.team[0].internals.personality_value.value
            if (state == `Battle` || state == `From Battle` || (state == `No Pokemon` && species != null && active_pokemonPv == teamPokemonPv)) {
                return this.game.properties.battle.player.active_pokemon?.moves[moveNumber - 1]?.pp.value
            }
            else if (state == `Overworld`) {
                return this.game.properties.player.team[0]?.moves[moveNumber - 1]?.pp.value
            }
            else if (state == `No Pokemon`) {
                return
            }
        },
        getMoveProperty(move, property) {
            if (move) {
                return this.g4MoveData[move][property]
            }
        },
        getSoloMonType(pkmn, type) { //type == type_1 or type_2

            if (this.evolution == true) {
                return this.g4PokemonData[this.selected_evolution_species]?.[type]
            }
            // const species = pkmn
            const species = this.starter
            var held_item = ""
            if (this.starter == 'Arceus') {
                return this.arceus_plate_check()
            }
            if (this.game.properties.meta?.state?.value == `From Battle`) {
                return this.g4PokemonData[species]?.[type]
            }
            if (this.game.properties.meta?.state?.value == `From Battle`) {
                return this.g4PokemonData[species]?.[type]
            }
            if (this.game.properties.meta?.state?.value == `Battle`) {
                typeString = "type_1"
                if (type == "type_2") {
                    typeString = "type_2"
                    return this.game.properties.battle?.player?.active_pokemon[typeString]?.value
                }
                return this.game.properties.battle?.player?.active_pokemon[typeString]?.value
            }
            if (this.game.properties.meta?.state?.value == `No Pokemon` || this.game.properties.meta?.state?.value == `Overworld`) {
                return this.g4PokemonData[species]?.[type]
            }
        },
        move_name(move_string) { //converts move strings so that they are formatted correctly
            if (move_string != undefined) {
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
                if (move_string.toLowerCase() == "roar of time") { return "Roar of Time" }
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
        split_image(trainer) {
            // Convert trainer name to image filename
            // Handle both original names (with prefixes) and display names (with numbers)
            if (!trainer) return ""
            let imageName = trainer
            // Remove numbers from names like "Rival 2" -> "Rival", "Cyrus 1" -> "Cyrus", "Lance 2" -> "Lance"
            // This handles display names that have numbers added
            const numberMatch = imageName.match(/^(.+?)\s+\d+$/)
            if (numberMatch) {
                imageName = numberMatch[1]
                // If we removed a number from "Cyrus 1", add back "Galactic Boss " prefix
                // since the image file is "Galactic Boss Cyrus.webp"
                if (imageName === "Cyrus") {
                    imageName = "Galactic Boss Cyrus"
                }
            } else {
                // Remove "Leader " prefix (image files don't have this prefix)
                if (imageName.startsWith("Leader ")) {
                    imageName = imageName.substring(7)
                }
                // Remove "Elite Four " prefix (image files don't have this prefix)
                if (imageName.startsWith("Elite Four ")) {
                    imageName = imageName.substring(11)
                }
                // Remove "Commander " prefix (image files don't have this prefix)
                if (imageName.startsWith("Commander ")) {
                    imageName = imageName.substring(10)
                }
                // Remove "Champion " prefix (image files don't have this prefix)
                if (imageName.startsWith("Champion ")) {
                    imageName = imageName.substring(9)
                }
                // Remove "Pokemon Trainer " prefix (image files don't have this prefix)
                if (imageName.startsWith("Pokemon Trainer ")) {
                    imageName = imageName.substring(16)
                }
                // Keep "Galactic Boss " prefix because image file is "Galactic Boss Cyrus.webp"
                // (don't remove it)
            }
            return imageName
        },
        format_display_name(trainer, occurrenceCount) {
            // Format the display name by removing prefixes and adding numbers where needed
            if (!trainer) return ""
            let displayName = trainer
            
            // Remove prefixes
            if (displayName.startsWith("Leader ")) {
                displayName = displayName.substring(7)
            } else if (displayName.startsWith("Elite Four ")) {
                displayName = displayName.substring(11)
            } else if (displayName.startsWith("Champion ")) {
                displayName = displayName.substring(9)
            } else if (displayName.startsWith("Commander ")) {
                displayName = displayName.substring(10)
            } else if (displayName.startsWith("Galactic Boss ")) {
                displayName = displayName.substring(14)
            } else if (displayName.startsWith("Pokemon Trainer ")) {
                displayName = displayName.substring(16)
            }
            
            // Handle Rival numbering (skip first occurrence, number 2-6)
            if (displayName === "Rival") {
                if (occurrenceCount > 1) {
                    // occurrenceCount is 1-indexed, so for display we want 2-6
                    const displayNumber = occurrenceCount
                    if (displayNumber >= 2 && displayNumber <= 6) {
                        return `Rival ${displayNumber}`
                    }
                }
                // Skip first occurrence (don't display)
                return null
            }
            
            // Handle Cyrus numbering (1-3)
            if (displayName === "Cyrus") {
                if (occurrenceCount >= 1 && occurrenceCount <= 3) {
                    return `Cyrus ${occurrenceCount}`
                }
            }
            
            return displayName
        },

        //AUTOMATION MOVEPOOL GRAPHIC
        dataSearch(dataObject, pointerValue) {
            if (!pointerValue) return ""
            const key = findKeyIgnoringCase(dataObject, pointerValue)
            return dataObject[key] || "ERROR"
        },
        getMovepool(gen3PkmnData, moveData, tmhmMapping, species) {
            const pkmn = this.dataSearch(gen3PkmnData, species)
            if (!pkmn || typeof pkmn !== 'object' || pkmn === "ERROR") {
                return {
                    level: [],
                    tmhm: [],
                    tutor: []
                }
            }
            let obj = {
                level: markReminderMoves((Array.isArray(pkmn.level_up_learnset) ? pkmn.level_up_learnset : []).map(x => {
                    if (!Array.isArray(x) || x.length < 2) return null
                    return {
                        ...{Level: x[0]},
                        ...this.dataSearch(moveData, x[1]) //searching for index 1
                    }
                }).filter(x => x !== null)), 
                tmhm: (Array.isArray(pkmn.tm_hm_learnset) ? pkmn.tm_hm_learnset : []).map(x => {
                    return {
                        ...{tmhm: tmhmMapping.find(y => y.Move == x)?.tmhmIndex??"TM01"},
                        ...this.dataSearch(moveData, x)
                    }
                }),     
                tutor: (Array.isArray(pkmn.tutor_learnset) ? pkmn.tutor_learnset : []).map(x => {
                    return this.dataSearch(moveData, x)
                }),    
                // egg: pkmn.egg_moves.map(x => {
                //     return this.dataSearch(moveData, x)
                // }),    
            }
            return obj
        }, 

        // MOVE ACCURACY
        getAccuracy(accuracy, move) {
            const weather   = this.effectiveWeather()
            const state     = this.game.properties.meta.state.value
            const held_item = this.game.properties.player.team[0].held_item.value
            const move_category = this.platinum_moves[move]?.Category
            const listed_accuracy = accuracy
            let ability = this.game.properties.player.team[0].ability.value
            if (accuracy == `-`) {
                return `—`
            }
            if (accuracy == `—`) {
                return `—`
            }
            if (isOhkoMove(move)) {
                // One-hit KO moves skip the accuracy calculation: no stages, items or Compound
                // Eyes, only Sturdy, No Guard and the level difference (core/logic/ohkoAccuracy.ts).
                if (state != `Battle`) {
                    return accuracy
                }
                const player = this.game.properties.battle.player.active_pokemon
                const opponent = this.game.properties.battle.opponent.active_pokemon
                return gen45OhkoAccuracy(4, accuracy, player.level?.value, opponent.level?.value, player.ability?.value, opponent.ability?.value) ?? accuracy
            }
            if (this.game.properties.player?.team[0]?.ability?.value == 'No Guard') {
                return `—`
            }
            if (this.game.properties.player?.team[0]?.ability?.value == 'Compound Eyes') {
                accuracy = accuracy * 1.3
            }
            if (weather == 'Hail' && move == 'Blizzard' && state == 'Battle') {
                return `—`
            }
            if (state == `Overworld`) {
                let item_modifier = 1
                let ability_modifier = 1
                if (move_category == "Physical" && ability == 'Hustle') {
                    ability_modifier = 3277/4096
                }
                switch (held_item) {
                    case "Wide Lens": item_modifier = 4505/4096; break;
                    case "Zoom Lens": item_modifier = 4915/4096; break;
                    default: item_modifier = 1; break;
                }
                let calculated_accuracy = Math.floor(accuracy * item_modifier * ability_modifier) <= 100 ? Math.floor(accuracy * item_modifier * ability_modifier) : 100
                return calculated_accuracy
            }
            if (state == `Battle`) {
                if (
                    this.game.properties.battle.opponent.active_pokemon.modifiers.attack.value == "-6" &&
                    this.game.properties.battle.opponent.active_pokemon.modifiers.defense.value == "-6" &&
                    this.game.properties.battle.opponent.active_pokemon.modifiers.speed.value == "-6" &&
                    this.game.properties.battle.opponent.active_pokemon.modifiers.special_attack.value == "-6" &&
                    this.game.properties.battle.opponent.active_pokemon.modifiers.special_defense.value == "-6" &&
                    this.game.properties.battle.opponent.active_pokemon.modifiers.accuracy.value == "-6" &&
                    this.game.properties.battle.opponent.active_pokemon.modifiers.evasion.value == "-6"
                ) {
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
                    let calculated_accuracy = Math.floor(accuracy * item_modifier * ability_modifier) <= 100 ? Math.floor(accuracy * item_modifier * ability_modifier) : 100
                    return calculated_accuracy
                }
                const player = this.game.properties.battle.player.active_pokemon
                const opponent = this.game.properties.battle.opponent.active_pokemon
                const enemy_flags = this.battleFlags('enemy_active')
                const field = this.battleFlags('field')
                const weather = this.effectiveWeather()
                const suppressed = this.weatherSuppressed()
                // Moves that cannot miss: Thunder in rain, the target's No Guard (pokeplatinum BattleControllerPlayer_CheckMoveHit)
                if ((move == 'Thunder' && weather == 'Rain' && !suppressed) || opponent.ability?.value == 'No Guard') {
                    return `—`
                }
                // One combined stage, then the modifiers in the game's order (core/logic/moveAccuracy.ts)
                const enemy_moves_first = gen45TurnOrder(
                    { speed: this.get_stat().Spe, ability: player.ability?.value, item: player.held_item?.value },
                    { speed: this.enemyTurnOrderSpeed(this.game.properties.battle.opponent.party_position?.value), ability: opponent.ability?.value, item: opponent.held_item?.value },
                    field?.trick_room?.value > 0,
                ) < 0
                return calcMoveAccuracy(4, {
                    accuracy: listed_accuracy,
                    accuracyStage: player.modifiers.accuracy?.value,
                    evasionStage: opponent.modifiers.evasion?.value,
                    physical: move_category == "Physical",
                    thunder: move == 'Thunder',
                    userAbility: player.ability?.value,
                    targetAbility: opponent.ability?.value,
                    userItem: player.held_item?.value,
                    targetItem: opponent.held_item?.value,
                    weather, weatherSuppressed: suppressed,
                    targetIdentified: enemy_flags?.foresight?.value == true || enemy_flags?.miracle_eye?.value == true,
                    targetConfused: enemy_flags?.confusion_turns?.value > 0,
                    targetMovedFirst: enemy_moves_first,
                    micleBerry: this.battleFlags('player_active')?.micle_berry?.value == true,
                    gravity: field?.gravity?.value > 0,
                    fog: field?.fog?.value == true || weather == 'Fog',
                }) ?? `—`
            }
            // Any other state (e.g. 'From Battle'): no battle modifiers apply, but still floor so
            // an upstream decimal (e.g. Compound Eyes' 1.3x) never shows decimal places.
            else return Math.floor(accuracy)
        },
        
        speed_comparison(slotIndex, enemySpeedValue) {
            const state = this.game.properties.meta.state.value
            // Compare player's active pokemon speed with enemy pokemon speed
            // Use getStat to get player speed with modifiers applied
            const playerSpeed = this.get_stat().Spe || 0
            const enemySpeed = enemySpeedValue || 0
            const player = state == 'Battle' ? this.game.properties.battle.player.active_pokemon : this.game.properties.player.team[0]
            const enemy = this.enemyTurnOrderSource(slotIndex)
            // Who moves first: Lagging Tail, Stall and Trick Room as the game orders them (core/logic/battleSpeed.ts)
            const trick_room = state == 'Battle' && this.battleFlags('field')?.trick_room?.value > 0
            const order = gen45TurnOrder(
                { speed: playerSpeed, ability: player?.ability?.value, item: player?.held_item?.value },
                { speed: enemySpeed, ability: enemy.ability, item: enemy.item },
                trick_room,
            )

            // Told of the enemy, as in every generation (decision 16): "Outsped" when the player moves first (core/logic/speedLabel.ts)
            const comparison = speedLabel(order, "enemy")

            return { comparison }
        },
        // The mapper's battle flags (Platinum and HG/SS; D/P has none, so every flag reads as unset).
        battleFlags(group) {
            return this.game.properties.battle?.flags?.[group]
        },
        // The battle's weather: 'Rain', 'Sun', 'Sandstorm', 'Hail', 'Fog' or null. The mapper's `field.weather` reads
        // the whole fieldConditionsMask through a glossary, which misses the permanent weathers (Drizzle, Drought,
        // Sand Stream, Snow Warning, overworld weather) and breaks while Gravity or Uproar is up, so the weather bits
        // are read where the mapper has them (Platinum, HG/SS; pokeplatinum FIELD_CONDITION_*).
        battleWeather() {
            const field = this.battleFlags('field')
            if (field?.rain != null) {
                if (field.rain.value == true || field.rain_permanent?.value == true) return 'Rain'
                if (field.sandstorm?.value == true || field.sandstorm_permanent?.value == true) return 'Sandstorm'
                if (field.sun?.value == true || field.sun_permanent?.value == true) return 'Sun'
                if (field.hail?.value == true || field.hail_permanent?.value == true) return 'Hail'
                if (field.fog?.value == true) return 'Fog'
                return null
            }
            return this.game.properties.battle.field.weather?.value ?? null
        },
        // The weather as the damage and speed rules see it: none while Cloud Nine or Air Lock is out.
        effectiveWeather() {
            return this.weatherSuppressed() ? null : this.battleWeather()
        },
        // Cloud Nine or Air Lock on the field switches every weather effect off.
        weatherSuppressed() {
            const abilities = [this.game.properties.battle.player.active_pokemon?.ability?.value, this.game.properties.battle.opponent.active_pokemon?.ability?.value]
            return this.game.properties.meta.state.value == 'Battle' && abilities.some(a => a == 'Cloud Nine' || a == 'Air Lock')
        },
        // Platinum names the Unburden flag can_unburden, HG/SS knock_off_flag (pokeheartgold unk88.knockOffFlag).
        canUnburden(group) {
            const flags = this.battleFlags(group)
            return (flags?.can_unburden ?? flags?.knock_off_flag)?.value == true
        },
        playerTurnOrderSpeed() {
            const mon = this.game.properties.battle.player.active_pokemon
            return gen45TurnOrderSpeed(4, {
                speed: mon.stats.speed.value,
                stage: mon.modifiers.speed.value,
                ability: mon.ability.value,
                item: mon.held_item.value,
                species: mon.species.value,
                status: mon.status_condition.value,
                weather: this.effectiveWeather(),
                weatherSuppressed: this.weatherSuppressed(),
                canUnburden: this.canUnburden('player_active'),
                tailwind: this.battleFlags('player_side')?.tailwind?.value > 0,
                slowStartActive: this.battleFlags('player_active')?.slow_start_ended?.value != true,
            })
        },
        // The enemy in a slot: the battler itself while it is out, otherwise its party data and trainer entry.
        enemyTurnOrderSource(slotIndex) {
            const battle = this.game.properties.battle
            const trainer_mon = this.enemy_mon_static?.[slotIndex]
            const party = battle.opponent.team?.[slotIndex]
            if (this.game.properties.meta.state.value == 'Battle' && battle.opponent.party_position == slotIndex) {
                const mon = battle.opponent.active_pokemon
                return {
                    active: true, speed: party?.stats?.speed?.value, stage: mon?.modifiers?.speed?.value,
                    ability: mon?.ability?.value, item: mon?.held_item?.value, species: mon?.species?.value,
                    status: mon?.status_condition?.value,
                }
            }
            return {
                active: false, speed: party?.stats?.speed?.value, stage: 0,
                ability: trainer_mon?.ability, item: trainer_mon?.held_item, species: trainer_mon?.species,
                status: party?.status_condition?.value,
            }
        },
        enemyTurnOrderSpeed(slotIndex) {
            const source = this.enemyTurnOrderSource(slotIndex)
            const in_battle = this.game.properties.meta.state.value == 'Battle'
            return gen45TurnOrderSpeed(4, {
                ...source,
                weather: in_battle ? this.effectiveWeather() : null,
                weatherSuppressed: this.weatherSuppressed(),
                canUnburden: source.active && this.canUnburden('enemy_active'),
                tailwind: in_battle && this.battleFlags('enemy_side')?.tailwind?.value > 0,
                slowStartActive: !source.active || this.battleFlags('enemy_active')?.slow_start_ended?.value != true,
            })
        },
        svgColorClass(comparison, enemyPkmnData) {
            // Blue when the player moves first, yellow on a tie, red when the enemy does; a fainted slot's picture is greyed by its faint style
            return speedColorClass(speedLabelOrder(comparison, "enemy"), false)
        },
        
        // STAGE MULTIPLIERS
        enemyStatModification(activePkmn, currentSlot, statLabel, stat, modifier, pkmnData) {
            var modData = this.stageModifiersData.find(x => x.modType === "stat")
            var modified_stat = stat
            var status_paralysis = 1
            var status_burn = 1
            var mod_ability = 1
            var mod_weather = 1

            if (pkmnData.status1.value == "Paralyzed" && statLabel == "speed") { status_paralysis = .25 } // DPP/HGSS: paralyzed Speed is 25% of normal
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
            if (pkmnData.ability?.value.toLowerCase() == "chlorophyll" && statLabel == "speed" && this.effectiveWeather() == "Sun") {
                mod_weather = 2 
            }
            //Swift Swim
            if (pkmnData.ability?.value.toLowerCase() == "swift swim" && statLabel == "speed" && this.effectiveWeather() == "Rain") {
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
            else if (ability == `Chlorophyll` && this.effectiveWeather() == `Sun` && statname == `speed`) {
                return Math.floor(statValue * 1.5)
            }
            else if (ability == `Swift Swin` && this.effectiveWeather() == `Rain` && statname == `speed`) {
                return Math.floor(statValue * 1.5)
            }
            else if (ability == `Guts` && statname == `attack` && (this.s1.status_condition.value == "Paralyzed" || this.s1.status_condition.value == "Poisoned" || this.s1.status_condition.value == "Burned")) {
                return Math.floor(statValue * 1.5)
            }
            else { 
                return statValue
            }
        },

        getPokemonImageUrl: function (x) {
            if (x != null)
                return `images/gen4/overlay/${x.pokedexNumber}.webp`
        },
        getStarterArt: function () {
            return `images/gen4/pokemon/${this.starter}.webp`
        },
        getStarterImageUrl: function () {
            return `images/gen4/overlay/${this.starter}.webp`
        },
        

        //BADGE GRAPHIC RECALL
        badgeGraphic(x) {
            if (x.value == true) {
                var badge = x.path.toString().substring(14)
                return `images/gen4/badges/${badge}.webp`
            }
            else if (x.value == false) {   
                return null
            }
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
        stageModifiers(y) {
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
            var growthRate = this.g4PokemonData[this.starter].growth_rate
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
                return this.g4PokemonData[this.starter].growth_rate
            }
        },
        calcExpStats(growthRate, exp) {
            return expProgress(growthRate, exp)
        }, 

        // MOVE MANAGEMENT
        movePower(y) { //y = move1.value
            if (y) {
                const state = this.game.properties.meta.state.value
                var move = this.generation4_moves_new[y]
                if (y == "Return") {
                    if (this.game.properties.player.team[0].friendship.value < 2.5)
                        var friendshipValue = 2.5 
                    else 
                        var friendshipValue = this.game.properties.player.team[0].friendship.value
                    var specialMovePower = Math.floor(friendshipValue/2.5)
                    return specialMovePower
                }
                else if ((y == "Flail" || y == "Reversal") && state == 'Overworld') {
                    // The game's HP fractions, not rounded percentages (core/logic/movePower.ts)
                    return flailReversalPower(4, this.game.properties.player.team[0].stats.hp.value, this.game.properties.player.team[0].stats.hp_max.value) ?? "—"
                }
                else if ((y == "Flail" || y == "Reversal") && state == 'Battle') {
                    // The game's HP fractions, not rounded percentages (core/logic/movePower.ts)
                    return flailReversalPower(4, this.game.properties.battle.player.team[0].stats.hp.value, this.game.properties.battle.player.team[0].stats.hp_max.value) ?? "—"
                }
                else if ((y == "Water Spout" || y == "Eruption") && state == 'Overworld') {
                    var power = (150 * this.game.properties.player.team[0].stats.hp.value) / this.game.properties.player.team[0].stats.hp_max.value
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
                    if (this.game.properties.player.team[0].friendship.value > 252.5)
                        var friendshipValue = 252.5 
                    else 
                        var friendshipValue = this.game.properties.player.team[0].friendship.value
                    var specialMovePower = Math.floor((255-friendshipValue)/2.5)
                    return specialMovePower
                }
                else if (y == "Low Kick" || y == "Grass Knot") {
                    if (this.game.properties.meta.state.value == `Overworld` || this.game.properties.meta.state.value == `To Battle`) { return "—"}
                    if (this.g4PokemonData[this.game.properties.battle.opponent.active_pokemon.species.value]?.weight < 10) { return 20 }
                    if (this.g4PokemonData[this.game.properties.battle.opponent.active_pokemon.species.value]?.weight < 25) { return 40 }
                    if (this.g4PokemonData[this.game.properties.battle.opponent.active_pokemon.species.value]?.weight < 50) { return 60 }
                    if (this.g4PokemonData[this.game.properties.battle.opponent.active_pokemon.species.value]?.weight < 100) { return 80 }
                    if (this.g4PokemonData[this.game.properties.battle.opponent.active_pokemon.species.value]?.weight < 200) { return 100 }
                    if (this.g4PokemonData[this.game.properties.battle.opponent.active_pokemon.species.value]?.weight >= 200) { return 120 }
                }
                else if (y == "Hidden Power") {
                    return this.hiddenPowerPowerCalc(this.game.properties.player.team[0])
                }
                else if (y == "Facade" && ["Paralyzed", "Poisoned", "Burned", "Badly Poisoned"].includes(this.s1.status_condition.value)) { // toxic too
                    return move.power * 2
                }
                else if (y == "Gyro Ball") {
                    if (state != "Battle") { return "—" }
                    // Both turn-order Speeds, with stages, paralysis, items and Tailwind (BtlCmd_CalcGyroBallPower, monSpeedValues)
                    const enemy_slot = this.game.properties.battle.opponent.party_position?.value
                    return gyroBallPower(this.playerTurnOrderSpeed(), this.enemyTurnOrderSpeed(enemy_slot)) ?? "—"
                }
                else if (y == "Natural Gift") {
                    if (this.game.properties.player.team[0].held_item.value == null) { return "—" }
                    var held_item = this.game.properties.player.team[0].held_item.value
                    power = this.natural_gift[held_item]?.power ?? "—"
                    return power
                }
                else if (y == "Punishment") {
                    // 60 + 20 per stage the target has raised, all seven stats, max 200 (BtlCmd_CalcPunishmentPower)
                    const mods = this.game.properties.battle.opponent.active_pokemon.modifiers
                    return punishmentPower(['attack', 'defense', 'special_attack', 'special_defense', 'speed', 'accuracy', 'evasion'].map(stat => mods?.[stat]?.value))
                }
                else if (y == "Fling") {
                    fling_power = this.get_fling_power()
                    return fling_power
                }

                // Wise Glasses is in determineItemBoost

                // In battle, moves whose power depends on the target or on earlier turns (pokeplatinum battle_script.c)
                const battle_power = state == 'Battle' && move ? this.battleMovePower(y, move.power) : null
                if (battle_power != null) { return battle_power }

                if (move.power == "—") { return "—"}
                if (move.power == 0) { return "—"}
                if (move.power == 1) { return "—"}
                else
                    if (move) return move.power
            }
            return null
        },
        // A battler's gender, 'M', 'F' or null for a genderless species, as the game derives it from the species'
        // gender ratio and the personality value (pokeplatinum SpeciesData_GetGenderOf); the battle copies it at send-out.
        battlerGender(mon) {
            const ratio = Number(this.g4PokemonData[mon?.species?.value]?.gender_ratio)
            const pid = mon?.internals?.personality_value?.value
            if (!Number.isFinite(ratio) || pid == null || ratio == 255) return null
            if (ratio == 0) return 'M'
            if (ratio == 254) return 'F'
            return ratio > (Number(pid) & 0xff) ? 'F' : 'M'
        },
        // The in-battle power of a move that depends on the target or on earlier turns, or null to use the listed power.
        battleMovePower(move, power) {
            const battle = this.game.properties.battle
            const user = battle.player.active_pokemon
            const target = battle.opponent.active_pokemon
            const user_flags = this.battleFlags('player_active')
            const target_status = target?.status_condition?.value
            switch (move) {
                // Brine: x2 when the target is at half HP or less (effect script 221: curHP <= maxHP / 2)
                case "Brine":
                    return target?.stats?.hp?.value <= Math.floor(target?.stats?.hp_max?.value / 2) ? power * 2 : null
                // Wake-Up Slap: x2 against a sleeping target; SmellingSalt: x2 against a paralysed one
                case "Wake-Up Slap":
                    return target_status == 'Asleep' ? power * 2 : null
                case "SmellingSalt":
                case "Smelling Salt":
                    return target_status == 'Paralyzed' ? power * 2 : null
                // Wring Out / Crush Grip: 1 + 120 x the target's HP fraction (BtlCmd_CalcWringOutPower)
                case "Wring Out":
                case "Crush Grip":
                    return wringOutPower(4, target?.stats?.hp?.value, target?.stats?.hp_max?.value)
                // Trump Card: from the PP left after this use, two against Pressure (BtlCmd_CalcTrumpCardPower)
                case "Trump Card": {
                    const slot = [0, 1, 2, 3].find(i => user?.moves?.[i]?.move?.value == move)
                    const pp = slot === undefined ? null : user.moves[slot].pp?.value
                    if (pp == null) return null
                    return trumpCardPower(Math.max(0, pp - (target?.ability?.value == 'Pressure' ? 2 : 1)))
                }
                // Payback: x2 when the target moves first this turn (BtlCmd_CalcPaybackPower); a Speed tie is a coin flip
                case "Payback": {
                    const slot = battle.opponent.party_position?.value
                    const comparison = this.speed_comparison(slot, this.enemyTurnOrderSpeed(slot))?.comparison
                    return speedLabelOrder(comparison, "enemy") === -1 ? power * 2 : null
                }
                // Rollout / Ice Ball: doubles with each hit of the five-turn chain, and again after Defense Curl
                // (BtlCmd_CalcRolloutPower: the count holds the hits still to come)
                case "Rollout":
                case "Ice Ball": {
                    if (user_flags?.rollout_count == null) return null
                    const remaining = Number(user_flags.rollout_count.value) || 0
                    let next_power = remaining > 0 ? power * 2 ** (5 - remaining) : power
                    if (user_flags.defense_curl?.value == true) next_power *= 2
                    return next_power
                }
                // Fury Cutter: doubles with each consecutive hit, up to x16 (BtlCmd_CalcFuryCutterPower)
                case "Fury Cutter": {
                    if (user_flags?.fury_cutter_count == null) return null
                    const count = Math.min(5, (Number(user_flags.fury_cutter_count.value) || 0) + 1)
                    return power * 2 ** (count - 1)
                }
                // Spit Up: 100 per Stockpile; it fails with none
                case "Spit Up": {
                    if (user_flags?.stockpile == null) return null
                    const stockpile = Number(user_flags.stockpile.value) || 0
                    return stockpile > 0 ? 100 * stockpile : "—"
                }
                // Weather Ball: x2 in any weather unless Cloud Nine / Air Lock (BtlCmd_CalcWeatherBallParams)
                case "Weather Ball":
                    return this.effectiveWeather() ? power * 2 : null
            }
            return null
        },
        get_fling_power(held_item_2) {
            let pokemon_data = this.game.properties.player.team[0]
            const state = this.game.properties.meta.state.value
            if (state == 'Battle') {
                pokemon_data = this.game.properties.battle.player.active_pokemon
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
                var move = this.generation4_moves_new[move]
                if (move) return move.category
            }
            return ""
        },
        moveCategoryIcon(move) { //move = move.value
            if (move) {
                var move = this.generation4_moves_new[move]
                if (move) return `images/gen4/damageCategory/${move.category}.webp`
            }
            return ""
        },
        movepoolPower(moveObject) {
            if (this.game.properties.meta.state.value == "No Pokemon") {
                return moveObject.Power
            }
            if (moveObject.Move == `Hidden Power`) {
                return this.hiddenPowerPowerCalc(this.game.properties.player.team[0])
            }
            if (moveObject.Move == `Return`) {
                // if (this.game.properties.battle.player.team_count.value == 0) {
                //     return "-"
                // }
                return this.g3ReturnPowerCalc(this.game.properties.player.team[0])
            }
            if (moveObject.Move == `Frustration`) {
                // if (this.game.properties.battle.player.team_count.value == 0) {
                //     return "-"
                // }
                return this.g3FrustrationPowerCalc(this.game.properties.player.team[0])
            }
            else { return moveObject.Power }
        },
        movepoolTypeColor(moveObject) {
            if (moveObject.Move == `Hidden Power` && this.game.properties.meta.state.value == "No Pokemon") {
                return this.starterHiddenPowerType
            }
            if (moveObject.Move == `Hidden Power` && this.game.properties.meta.state.value != "No Pokemon") {
                return this.hiddenPowerTypeCalc(this.game.properties.player.team[0])
            }
            if (this.game.properties.meta.state.value == "No Pokemon") {
                return moveObject.Type
            }
            if (moveObject.Type == `Curse`) {
                return "Curse"
            }
            return moveObject.Type
        },
        movepoolType(moveObject) {
            if (moveObject.Move == `Hidden Power` && this.game.properties.meta.state.value == "No Pokemon") {
                return this.starterHiddenPowerType
            }
            if (moveObject.Move == `Hidden Power` && this.game.properties.meta.state.value != "No Pokemon") {
                return this.hiddenPowerTypeCalc(this.game.properties.player.team[0])
            }
            if (this.game.properties.meta.state.value == "No Pokemon") {
                return moveObject.Type
            }
            if (moveObject.Type == `Curse`) {
                return "???"
            }
            if (moveObject.Move == `Hidden Power`) {
                return this.starterHiddenPowerType
            }
            return moveObject.Type
        },
        weatherModifier(weather, move, moveType) {
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
            // SolarBeam is halved in every weather but sun (pokeplatinum FIELD_CONDITION_SOLAR_DOWN: rain, sand, hail, fog)
            else if (["Rain", "Sandstorm", "Hail", "Fog"].includes(weather) && (move == "SolarBeam" || move == "Solar Beam")) {
                return .5
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
                if (this.effectiveWeather() == `Sun`) {
                    return "Fire" }
                if (this.effectiveWeather() == `Sandstorm`) {
                    return "Rock" }
                if (this.effectiveWeather() == `Rain`) {
                    return "Water" }
                if (this.effectiveWeather() == `Hail`) {
                    return "Ice" }
                return "Normal"
            }
            else if (y == 'Natural Gift') {
                if (this.game.properties.player.team[0].held_item.value == null) { return "Normal" }
                var held_item = this.game.properties.player.team[0].held_item.value
                return this.natural_gift[held_item]?.type ?? "Normal"
            }
            else if (y) {
                var move = this.g4MoveData[y]
                if (move) return move.Type
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
            // Return early if modifier is undefined/null to prevent .bytes access error
            if (!modifier || modifier.bytes === undefined)
                return
            // console.log(modifier.bytes, slot)
            modifier_table = {
                0x00: "-6", 
                0x01: "-5", 
                0x02: "-4", 
                0x03: "-3", 
                0x04: "-2", 
                0x05: "-1", 
                0x06: "0",
                0x07: "1",
                0x08: "2",
                0x09: "3",
                0x0A: "4",
                0x0B: "5",
                0x0C: "6",
                0x0D: "6",
            }
            // console.log(slot, modifier.bytes)
            modifier = modifier_table[modifier.bytes]
            if (this.game.properties.battle.opponent.party_position.value == slot) {
                if (this.game.properties.battle.opponent.team[0].internals.personality_value.value == null)
                    return
                else if (this.game.properties.meta.state.value == "Battle") {
                    if (modifier != "0")
                        return `opacity: ${this.statLabelOpacityValue};`
                }
            }
            else
                return
        },
        enemyStatusLabelOpacity(status, slot) {
            // Return early if status is undefined/null to prevent .bytes access error
            if (!status || status.bytes === undefined)
                return
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
            ivHpBit  = this.getSecondLSB(ivHpBit)
            ivAtkBit = this.getSecondLSB(ivAtkBit)
            ivDefBit = this.getSecondLSB(ivDefBit)
            ivSpeBit = this.getSecondLSB(ivSpeBit)
            ivSpABit = this.getSecondLSB(ivSpABit)
            ivSpDBit = this.getSecondLSB(ivSpDBit)
            basePower = Math.floor((((ivHpBit + (2 * ivAtkBit) + (4 * ivDefBit) + (8 * ivSpeBit) + (16 * ivSpABit) + (32 * ivSpDBit)) * 40)/63) + 30 )
            return basePower
        },
        determineSTAB(x) { //x = move1.value
            var pkmnData = this.g4PokemonData[this.starter]
            if (!pkmnData) return 1
            var pkmnType1 = pkmnData.type_1
            var pkmnType2 = pkmnData.type_2
            if (this.starter == 'Arceus') {
                pkmnType1 = this.arceus_plate_check()
            }
            var moveType  = this.moveType(x)
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
            var moveType = this.moveType(x)
            var move_category = this.generation4_moves_new[x]?.category
            // pokeplatinum BattleSystem_CalcMoveDamage: the Orbs work only for their own legendary
            if (Array.isArray(itemType)) {
                const holder = { "Adamant Orb": "Dialga", "Lustrous Orb": "Palkia", "Griseous Orb": "Giratina" }[heldItemValue]
                return holder && pkmn_object.species.value?.startsWith(holder) && itemType.includes(moveType) ? 1.2 : 1
            }
            if (itemType == moveType) {
                return 1.2
            }
            // Muscle Band / Wise Glasses x1.1 (POWER_UP_PHYS / _SPEC); Life Orb x1.3 on the damage (battle_script.c)
            if (heldItemValue == 'Muscle Band' && move_category == 'Physical') { return 1.1 }
            if (heldItemValue == 'Wise Glasses' && move_category == 'Special') { return 1.1 }
            if (heldItemValue == 'Life Orb') { return 1.3 }
            return 1
        },
        abilityModifier(ability, attackingType, controller) {
            var healthPercentage = this.game.properties.battle[controller].active_pokemon.stats.hp / this.game.properties.battle[controller].active_pokemon.stats.hp_max
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
                    return flailReversalPower(4, enemy_mon.hp.value, enemy_mon.hp_max.value) ?? "—"
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
                    if (this.g4PokemonData[this.game.properties.battle.player.active_pokemon.species.value]?.weight < 10) { return 20 }
                    if (this.g4PokemonData[this.game.properties.battle.player.active_pokemon.species.value]?.weight < 25) { return 40 }
                    if (this.g4PokemonData[this.game.properties.battle.player.active_pokemon.species.value]?.weight < 50) { return 60 }
                    if (this.g4PokemonData[this.game.properties.battle.player.active_pokemon.species.value]?.weight < 100) { return 80 }
                    if (this.g4PokemonData[this.game.properties.battle.player.active_pokemon.species.value]?.weight < 200) { return 100 }
                    if (this.g4PokemonData[this.game.properties.battle.player.active_pokemon.species.value]?.weight >= 200) { return 120 }
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
            const user_type_1 = this.g4PokemonData[species].type_1
            const user_type_2 = this.g4PokemonData[species].type_2
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
            // Mold Breaker ignores the target's ability (pokeplatinum Battler_IgnorableAbility)
            if (this.game.properties.battle.player.active_pokemon.ability.value == 'Levitate' && move_type == 'Ground' && enemy_mon.ability?.value != 'Mold Breaker') {
                modifier_ability = 0 
            }
            var modifier_item = this.determineItemBoost(move_name, enemy_mon)
            var modifier_weather = this.weatherModifier(this.effectiveWeather(), move_name, move_type)
            var modifier_burn = 1
            if (move_category == "Physical" && enemy_mon.status_condition?.value == `Burned` && enemy_mon.ability?.value != `Guts`) {
                modifier_burn = 0.5
                }
            else {
                modifier_burn = 1
            }
            //Calculate effective power
            if (this.typeCalcs == true && this.game.properties.meta.state.value == "Battle" && this.game.properties.meta.state_enemy.value != "Battle Finished") { //Handles type effectiveness calculations in battle
                return Math.floor(move_base_power * modifier_stab * modifier_effectiveness_1 * modifier_effectiveness_2 * modifier_ability * modifier_item * modifier_weather * modifier_burn)
            }
        },
        typeEffectiveness(x) { //x = move1.value
            const state = this.game.properties.meta.state.value
            const species = this.starter
            var enemy_pokemon_data = this.game.properties.battle.opponent.active_pokemon

            if (x == "Curse") {
                return "—"
            }
            if (x == null || x == undefined) {
                return
            }
            var attackingType = this.moveType(x)
            var power = this.movePower(x)
            var defendingType1 = this.game.properties.battle.opponent.active_pokemon.type_1.value ?? "Normal"
            var defendingType2 = this.game.properties.battle.opponent.active_pokemon.type_2.value ?? "Normal"
            var defendingType1Effectiveness = 1
            var defendingType2Effectiveness = 1

            var player_ability_modifier = 1
            var player_ability = state == 'Battle' ? this.game.properties.battle.player.active_pokemon.ability.value : this.game.properties.player.team[0].ability.value
            if (player_ability == 'Normalize') {
                attackingType = 'Normal'
            }
            // Iron Fist: the game's own list (pokeplatinum sPunchingMoves), which has no Sucker Punch
            const punching_moves = ["Ice Punch", "Fire Punch", "ThunderPunch", "Thunder Punch", "Mach Punch", "Focus Punch", "Dizzy Punch", "DynamicPunch", "Dynamic Punch", "Hammer Arm", "Mega Punch", "Comet Punch", "Meteor Mash", "Shadow Punch", "Drain Punch", "Bullet Punch", "Sky Uppercut"]
            if (player_ability == "Iron Fist" && punching_moves.includes(x)) {
                player_ability_modifier = 1.2
            }
            // Outside the in-battle calculation the enemy data is left over from the last battle, so its ability does not count
            var in_battle_calc = this.typeCalcs == true && state == "Battle" && this.game.properties.meta.state_enemy.value != "Battle Finished"
            // Mold Breaker ignores the target's ability (pokeplatinum Battler_IgnorableAbility)
            var target_ability = !in_battle_calc || player_ability == 'Mold Breaker' ? null : enemy_pokemon_data?.ability.value

            var defendingType1Effectiveness = this.typeData.find(x => x.moveType == attackingType)[defendingType1]
            var pkmn_ability = this.game.properties.player.team[0].ability.value
            // if (defendingType1 && attackingType) {
            //     var defendingType1Effectiveness = this.typeEffectivenessArray[attackingType][defendingType1]
            // }
            if (state == 'Battle') {
                if (defendingType2 && attackingType && (defendingType1 != defendingType2)) {
                    var defendingType2Effectiveness = this.typeData.find(x => x.moveType == attackingType)[defendingType2]
                }

                // Filter / Solid Rock: x3/4 on the whole super-effective hit (pokeplatinum BattleSystem_ApplyTypeChart),
                // not per type -- a 4x hit is 3x, not 2.25x. Applied in the return below.
            }

            if (pkmn_ability == 'Scrappy' && (attackingType == 'Fighting' || attackingType == 'Normal')) {
                if (defendingType1 == 'Ghost') {
                    defendingType1Effectiveness = 1
                }
                if (defendingType2 == 'Ghost') {
                    defendingType2Effectiveness = 1
                }
            }

            // The target's and the field's battle flags (Platinum, HG/SS; pokeplatinum BattleSystem_ApplyTypeChart,
            // BasicTypeMulApplies): Foresight / Odor Sleuth let Normal and Fighting hit a Ghost, Miracle Eye lets Psychic
            // hit a Dark type, and Gravity lets Ground hit a Flying type
            const target_flags = in_battle_calc ? this.battleFlags('enemy_active') : null
            const gravity = in_battle_calc && this.battleFlags('field')?.gravity?.value > 0
            function lift_immunity(type, applies) {
                if (!applies) return
                if (defendingType1 == type) defendingType1Effectiveness = 1
                if (defendingType2 == type) defendingType2Effectiveness = 1
            }
            lift_immunity('Ghost', target_flags?.foresight?.value == true && (attackingType == 'Fighting' || attackingType == 'Normal'))
            lift_immunity('Dark', target_flags?.miracle_eye?.value == true && attackingType == 'Psychic')
            lift_immunity('Flying', gravity && attackingType == 'Ground')

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

            var stabModifier = this.determineSTAB(x)
            if (player_ability == "Adaptability") {
                stabModifier = 2
            }

            var ability = this.abilityModifier(this.game.properties.player.team[0].ability.value, attackingType, 'player')
            
            // Levitate, and Magnet Rise on the target, lift it out of Ground's reach -- not under Gravity
            if (target_ability == 'Levitate' && attackingType == 'Ground' && !gravity) {
                ability = 0
            }
            if (attackingType == 'Ground' && !gravity && target_flags?.magnet_rise_turns?.value > 0) {
                ability = 0
            }
            // if (enemy_pokemon_data?.ability.value == 'Storm Drain' && attackingType == 'Water') {
            //     ability = 0
            // }
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
            if (target_ability == 'Thick Fat' && (attackingType == 'Ice' || attackingType == 'Fire')) {
                ability = 0.5
            }
            // Water Absorb / Volt Absorb: immune (pokeplatinum BattleSystem_TriggerImmunityAbility)
            if ((target_ability == 'Water Absorb' && attackingType == 'Water') || (target_ability == 'Volt Absorb' && attackingType == 'Electric')) {
                ability = 0
            }
            // Dry Skin: Fire x1.25 (BattleSystem_CalcMoveDamage); its Water immunity is above
            if (target_ability == 'Dry Skin' && attackingType == 'Fire') {
                ability = 1.25
            }
            // The target's side (BattleSystem_CalcMoveDamage): Explosion and Selfdestruct halve its Defense, and its
            // Reflect / Light Screen halve the damage (2/3 in a double battle with both foes up; not modelled)
            var explode_modifier = (x == 'Explosion' || x == 'Selfdestruct') ? 2 : 1
            var screen_modifier = 1
            if (in_battle_calc) {
                const enemy_side = this.battleFlags('enemy_side')
                const category = this.generation4_moves_new[x]?.category
                if ((category == 'Physical' && enemy_side?.reflect?.value == true) || (category == 'Special' && enemy_side?.light_screen?.value == true)) {
                    screen_modifier = 0.5
                }
            }
            // The attacker's volatile effects and the field (pokeplatinum BattleSystem_CalcMoveDamage): Charge doubles
            // Electric, Mud Sport / Water Sport on any battler halve Electric / Fire, an activated Flash Fire boosts
            // Fire x1.5, and Rivalry is x1.25 against the same gender, x0.75 against the other
            var field_modifier = 1
            if (in_battle_calc) {
                const user_flags = this.battleFlags('player_active')
                const any_battler = flag => ['player_active', 'enemy_active'].some(group => this.battleFlags(group)?.[flag]?.value == true)
                if (attackingType == 'Electric' && user_flags?.charge?.value == true) field_modifier *= 2
                if (attackingType == 'Electric' && any_battler('mud_sport')) field_modifier *= 0.5
                if (attackingType == 'Fire' && any_battler('water_sport')) field_modifier *= 0.5
                if (attackingType == 'Fire' && user_flags?.flash_fire?.value == true) field_modifier *= 1.5
                if (player_ability == 'Rivalry') {
                    const user_gender = this.battlerGender(this.game.properties.battle.player.active_pokemon)
                    const target_gender = this.battlerGender(enemy_pokemon_data)
                    if (user_gender && target_gender) field_modifier *= user_gender == target_gender ? 1.25 : 0.75
                }
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
                    player_item = this.game.properties.battle.player.active_pokemon.held_item.value
                    enemy_item = this.game.properties.battle.opponent.active_pokemon.held_item.value
                    break
                }
                default: {
                    player_item = this.game.properties.player.team[0].held_item.value
                    break
                }
            }
            var itemBoost = this.determineItemBoost(x, this.game.properties.player.team[0])

            if ((target_ability == 'Levitate' || target_flags?.magnet_rise_turns?.value > 0) && attackingType == 'Ground' && enemy_item == "Iron Ball") {
                ability = 1 
            }
            if (attackingType == 'Ground' && defendingType1 == 'Flying' && enemy_item == "Iron Ball") {
                defendingType1Effectiveness = 1 
            }
            if (attackingType == 'Ground' && defendingType2 == 'Flying' && enemy_item == "Iron Ball") {
                defendingType2Effectiveness = 1 
            }

            if (species == 'Mime Jr.' && player_item == 'Odd Incense' && attackingType == "Psychic") {
                itemBoost = 1.2
            }
            else if (species == 'Bonsly' && player_item == 'Rock Incense' && attackingType == "Rock") {
                itemBoost = 1.2
            }
            else if (species == 'Budew' && player_item == 'Rose Incense' && attackingType == "Grass") {
                itemBoost = 1.2
            }
            else if (species == 'Azurill' && player_item == 'Sea Incense' && attackingType == "Water") {
                itemBoost = 1.2
            }
            else if (species == 'Mantyke' && player_item == 'Wave Incense' && attackingType == "Water") {
                itemBoost = 1.2
            }
            else if (species == 'Pikachu' && player_item == 'Light Ball') {
                itemBoost = 2
            }
            else if (player_item == null && x == 'Acrobatics') {
                itemBoost = 2
            }

            var weatherBoost = this.weatherModifier(this.effectiveWeather(), x, this.moveType(x))
            var burnModifier = this.burnModifier(x)
            // console.log("Type1:",defendingType1Effectiveness)
            // console.log("Type2:",defendingType2Effectiveness)
            if (pkmn_ability == "Tinted Lens") {
                var type_multiple = defendingType1Effectiveness * defendingType2Effectiveness
                if (type_multiple == 0) {}
                else if (type_multiple < 1) {
                    defendingType1Effectiveness = 1
                    defendingType2Effectiveness = type_multiple * 2
                }
            }
            if (power <= 60 && pkmn_ability == "Technician") {
                power = power * 1.5
            }
            // Expert Belt: x1.2 on a super-effective hit (pokeplatinum BattleSystem_ApplyTypeChart, HOLD_EFFECT_POWER_UP_SE)
            if (in_battle_calc && player_item == 'Expert Belt' && defendingType1Effectiveness * defendingType2Effectiveness > 1) {
                itemBoost = itemBoost * 1.2
            }

            // Metronome (item) - not implemented, no way to know what move was used previously. Also, the counter increments when your Pokemon uses the move, so we need to predictively assign power before the move is used.
            // var metronome_counter = this.game.properties.battle.flags.player_active.metronome_item_turns.value
            // console.log(metronome_counter)
            // if (metronome_counter > 0 && state == 'Battle') {
            //     itemBoost = 1 + (metronome_counter * 0.1)
            //     if (itemBoost > 2) {
            //         itemBoost = 2
            //     }
            // }

            // console.log("Recalculated:", defendingType2Effectiveness)
            // One-hit KO moves show "KO", or 0 when the type chart or the target's ability leaves them no effect
            // (core/logic/ohkoAccuracy.ts; pokeplatinum gives them power 1, so Wonder Guard applies)
            if (isOhkoMove(x)) {
                if (!in_battle_calc) { return ohkoPowerText() }
                if (target_ability == 'Wonder Guard' && defendingType1Effectiveness * defendingType2Effectiveness <= 1) { return 0 }
                return ohkoPowerText(defendingType1Effectiveness * defendingType2Effectiveness * ability)
            }
            if (in_battle_calc) { //Handles type effectiveness calculations in battle
                if (power == "—") { return "—" }
                if (power == "-") { return "—" }
                // Wonder Guard: only super-effective moves hit (BattleSystem_ApplyTypeChart)
                if (target_ability == 'Wonder Guard' && defendingType1Effectiveness * defendingType2Effectiveness <= 1) { return 0 }
                const filter_modifier = (target_ability == 'Filter' || target_ability == 'Solid Rock') && defendingType1Effectiveness * defendingType2Effectiveness > 1 ? 0.75 : 1
                return Math.floor(power * stabModifier * defendingType1Effectiveness * defendingType2Effectiveness * ability * itemBoost * weatherBoost * burnModifier * player_ability_modifier * multi_hit_modifier * explode_modifier * screen_modifier * filter_modifier * field_modifier)
            }
            else //handles out of battle cases
                if (power == "—") { return power }
                if (power == "-") { return "—" }
                else 
                    return Math.floor(power * stabModifier * ability * itemBoost * burnModifier * player_ability_modifier * multi_hit_modifier * explode_modifier)
        },
        convertDurationToSeconds(duration) {
            const parts = duration.split(':').map(part => parseInt(part, 10));
            if (parts.length === 1) {
                return parts[0];
            } else if (parts.length === 2) {
                return parts[0] * 60 + parts[1];
            } else if (parts.length === 3) {
                return parts[0] * 3600 + parts[1] * 60 + parts[2];
            }
        },
        async load_temp_splits() {
            const text = await loadCsvFile();
            const rows = text.split("\n").slice(1).filter(x => x !== '');
            const results = []
            for (const row of rows) {
                const columns = row.split(",");
                results.push({trainer: columns[2], time: columns[3]})
            }
            return results
        },
        async load_splits() {
            // A replay's SPLIT bookmarks or a split CSV, picked and parsed in main (2026-09-23).
            const comparison = await pickSplitComparison();
            if (!comparison) return;
            this.previous_splits = comparison.rows;
            this.previous_splits_source = comparison.name;
        },

        /* === Style Mode (dev only) ==========================================
         * See gen5/app/frontend.js for the reference implementation. Only
         * difference here is the species data source: g4PokemonData (Gen 4
         * Sinnoh/Johto pokédex) instead of g5PokemonData.
         */
        _styleModeBuildList() {
            const all = Object.keys(this.g4PokemonData || {});
            return all.filter((name) => name && name !== '—' && name !== 'Egg');
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
        if (this._devKeydown) window.removeEventListener('keydown', this._devKeydown);
        if (this._devMousedown) window.removeEventListener('mousedown', this._devMousedown, true);
    },
    mounted: async function () {
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
                    const growthRate = this.g4PokemonData[species]?.growth_rate;
                    if (growthRate == null) { return; }
                    const expStats = this.calcExpStats(growthRate, expPoints);
                    this.$refs.expBar.setWidth((expStats.percent * 100) + "%");
                    this.expBarState.species = species;
                    this.expBarState.expPoints = expPoints;
                }
            })
        }
        // The client's debounce list (`_debouceTimeout = 10`, four `deboucePath` calls)
        // is the module's `debouncePaths` in games/gen4/index.ts, applied by main.ts
        // before this component mounts; the client's default timeout is the same 10.

        // In mounted hook (around line 6897)
        // Poll for emulator stats continuously
        this.emulatorStatsInterval = setInterval(async () => {
            if (this.ready && (this.shuckie_timer || this.shuckie_counters)) { // Only poll when mapper is ready and a shuckie feature is on
                await this.fetchEmulatorStats();
            }
        }, 10); // 100ms = 10 times per second (adjust as needed)

        this.disable_encounters();
        this.updateTime()
        this.applySpeciesAliases();
        this.load_all_settings()
        // pokemon_list now derives from the active pokedex (see computed); leave the data
        // field empty so the computed takes over.

        this.update_rom_starter_and_intro_mon()

        // Initialize evolution family list
        this.updateEvolutionFamilyList();

        // Initial tracking of personality value and species
        this.last_known_personality_value = this.game.properties.player.team[0].internals.personality_value.value;
        this.last_known_species = this.resolveIncomingSpecies(this.game.properties.player.team[0].species.value);
        
        // Track personality value changes
        this.game.properties.player.team[0].internals.personality_value.change(async (newProp, oldProp) => {
            // Update tracked personality value
            this.last_known_personality_value = newProp.value;
        });

        // Species change handler - handles both normal species changes and evolution
        this.game.properties.player.team[0].species.change(async (newProp, oldProp) => {
            const currentPersonalityValue = this.game.properties.player.team[0].internals.personality_value.value;
            const state = this.game.properties.meta.state.value
            const normalizedNew = this.resolveIncomingSpecies(newProp.value);
            const normalizedOld = this.resolveIncomingSpecies(oldProp?.value);

            // Check if this is an evolution (same personality value, different species, evolution enabled)
            if (this.evolution == true && normalizedNew != normalizedOld &&
                currentPersonalityValue === this.last_known_personality_value &&
                this.last_known_personality_value != null) {

                const evolution_family_raw = this.g4PokemonData?.[this.starter]?.evolution_family;
                if (evolution_family_raw && evolution_family_raw.length > 0) {
                    const evolution_family = evolution_family_raw.map(obj => obj.species).filter(s => s != null);
                    const evolved = evolution_family.includes(normalizedNew);

                    if (evolved == true) {
                        // Store old species for transition
                        const oldSpecies = this.starter;
                        const newSpecies = normalizedNew;

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
                            evolution_family && evolution_family.includes(newSpecies)) {
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
            // Only update if newProp.value is valid (not undefined/null)
            if (newProp.value && newProp.value !== undefined && newProp.value !== null) {
                const incomingSpecies = normalizedNew;
                this.last_known_species = incomingSpecies;
                this.last_known_personality_value = currentPersonalityValue;

                // IMPORTANT: When evolution is enabled, only update starter if new species is in the current evolution family
                // This prevents error data from game resets from changing the displayed Pokemon
                let shouldUpdateStarter = false;
                if (this.evolution && this.evolution_family_list.length > 0) {
                    // Only allow update if new species is in the evolution family
                    if (this.evolution_family_list.includes(incomingSpecies)) {
                        shouldUpdateStarter = true;
                    }
                    // If not in family, don't update starter (prevents error data from slipping through)
                } else {
                    // Evolution is disabled, allow normal updates
                    shouldUpdateStarter = true;
                }
                
                // Only update starter if validation passed
                if (shouldUpdateStarter) {
                    if ((state == "Battle" || state == "From Battle") && this.game.properties.battle.player.pkmn_ram?.pokemon_0_ram?.stats.hp.value != 0) {
                        this.starter = incomingSpecies
                    }
                    else if (state == "Overworld" && this.game.properties.overworld.map_index.value == 278 && incomingSpecies == 'Reshiram') {
                        // Special handling for Reshiram
                    }
                    else if (state == "Overworld") {
                        this.starter = incomingSpecies
                    }
                }

                // Push the form byte to the emulator on every appearance of a species with forms,
                // so a fresh Wormadam (e.g. just-received starter) reflects the user's variant
                // even when this.starter didn't change. syncFormByte only writes when the
                // selection is a form of the species the game holds and the byte differs.
                if (POKEMON_FORMS[newProp.value]) {
                    this.syncFormByte(this.starter);
                }
            }
        })
        this.game.properties.player.team[0].level.change(async (newProp, oldProp) => {
            const map = this.game.properties.overworld.map_index.value
            if (newProp.value == 5 && map == 391) {
                this.write_byte_data(this.set_starter_stats_object)
            }
        })

        //EXP BAR ANIMATION FUNCTION
        /* exp bar initialization */ 
        {
            const function_logging = false
            const species = this.game.properties.player.team[0].species.value ?? this.starter;
            if (function_logging == true) { console.log(species) }
            const expPoints = (this.game.properties.meta.state.value == 'Battle' ? this.game.properties.battle.player.active_pokemon.exp.value :
                this.game.properties.player.team[0].exp.value) ?? 0;
            if (function_logging == true) { console.log(expPoints) }
            const growthRate = this.g4PokemonData[species].growth_rate;
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

        // Vitamins Display (HGSS EV training areas)
        const hgssEvBoxMaps = {
            "Route 38 - Map 1":       { x_range: [344, 317], y_range: [170, 166] },
            "Ecruteak City - Map 1":  { x_range: [405, 396], y_range: [160, 153] },
            "Route 42 - Map 1":       { x_range: [482, 442], y_range: [1000, 0] },
            "Route 43 - Map 1":       { x_range: [536, 526], y_range: [143, 104] },
            "Route 35 - Map 1":       { x_range: [370, 360], y_range: [302, 291] },
            "Route 44 - Map 1":       { x_range: [595, 583], y_range: [175, 172] },
        }
        const isInEvBox = (x, y, x_range, y_range) => {
            const xMin = Math.min(x_range[0], x_range[1])
            const xMax = Math.max(x_range[0], x_range[1])
            const yMin = Math.min(y_range[0], y_range[1])
            const yMax = Math.max(y_range[0], y_range[1])
            return x >= xMin && x <= xMax && y >= yMin && y <= yMax
        }
        const updateHgssEvBoxStats = () => {
            if (this.selected_game != "HeartGold and SoulSilver") { return }
            const map = this.game.properties.overworld.map_name.value
            const box = hgssEvBoxMaps[map]
            if (!box) { return }
            const x = this.game.properties.overworld.x.value
            const y = this.game.properties.overworld.y.value
            this.stats_setting = isInEvBox(x, y, box.x_range, box.y_range) ? "EVs" : "Automatic"
        }
        if (this.selected_game == "HeartGold and SoulSilver") {
            this.game.properties.overworld.x.change(async () => { updateHgssEvBoxStats() })
            this.game.properties.overworld.y.change(async () => { updateHgssEvBoxStats() })
            updateHgssEvBoxStats()
        }

        // Encounters
        this.game.properties.overworld.map_name.change(async (newProp) => {
            this.freezeEncounters();

            if (newProp.value == 'Veilstone Store - Map 1' || newProp.value == 'Veilstone Store - Map 2' || newProp.value == 'Veilstone Store - Map 3' || newProp.value == 'Veilstone Store - Map 4' || newProp.value == 'Veilstone Store - Map 5' || newProp.value == 'Veilstone Store - Map 6' || newProp.value == 'Veilstone Store - Map 7') {
                this.stats_setting = "Vitamins";
            }
            else if (this.selected_game == "HeartGold and SoulSilver" && hgssEvBoxMaps[newProp.value]) {
                updateHgssEvBoxStats()
            }
            else {
                this.stats_setting = "Automatic";
            }
        });
        // HeartGold and SoulSilver fix
        // if (this.selected_game == "HeartGold and SoulSilver") {
        //     this.game.properties.overworld.encounter_rates.walking.change(async (newProp) => {
        //         const map = this.game.properties.overworld.map_name.value
        //         if (map == 'Route 29 - Map 1' || map == 'Route 30 - Map 1' || map == 'Sprout Tower - Map 2' || map == 'Sprout Tower - Map 3') {
        //             this.disable_encounters();
        //         }
        //     })
        // }

        // Resets
        if (this.selected_game == "Platinum" || this.selected_game == "Diamond and Pearl") {
            this.game.properties?.flags?.new_game_1.change(async (newProp, oldProp) => {
                if (this.shuckie_timer == true) {
                    if (newProp.value == true && this.emulatorStats.time_current == null) {
                        console.log("Sending emulator start")
                        this.sendEmulatorStart();
                        this.update_rom_starter_and_intro_mon();
                        this.blackout = false;
                        this.attempt_number++
                    }
                    if (this.emulatorStats.time_current > 0 && newProp.value == false && oldProp.value == true) {
                        this.blackout = false;
                        if (this.disallow_faults == false) { this.playerResets++ }
                        this.sendObsChapterMarker("RESET")
                        if (this.shuckie_timer && this.disallow_faults == false) { this.incrementEmulatorCounter("playerResets") }
                        this.disallow_faults_function()
                    }
                }
                else {
                    // This should resolve the issue in Cynthia's chamber where the timer would restart when resetting against her
                    if (newProp.value == true && parseInt(this.timer_formatted_time[0]) == 0) {
                        this.startTime()
                        // if (this.shuckie_timer == true) { this.sendEmulatorStart(); }
                        this.update_rom_starter_and_intro_mon();
                        this.blackout = false;
                        this.attempt_number++
                    }
                    if (parseInt(this.timer_formatted_time[0]) > 0 && newProp.value == false && oldProp.value == true) {
                        this.blackout = false;
                        if (this.disallow_faults == false) { this.playerResets++ }
                        this.sendObsChapterMarker("RESET")
                        if (this.shuckie_timer && this.disallow_faults == false) { this.incrementEmulatorCounter("playerResets") }
                        this.disallow_faults_function()
                    }
                }
            })
        }
        if (this.selected_game == "HeartGold and SoulSilver") {
            this.game.properties?.variables?.game_started.change(async (newProp, oldProp) => {
                if (this.shuckie_timer == true) {
                    if (newProp.value == 56150 && this.emulatorStats.time_current == null) {
                        console.log("Sending emulator start")
                        this.sendEmulatorStart();
                        this.update_rom_starter_and_intro_mon();
                        this.blackout = false;
                        this.attempt_number++
                    }
                    if (this.emulatorStats.time_current > 0 && newProp.value != 0 && this.game.properties.overworld.map_name.value != 'Pokemon League - Map 7') {
                        this.blackout = false;
                        if (this.disallow_faults == false) { this.playerResets++ }
                        this.sendObsChapterMarker("RESET")
                        if (this.shuckie_timer && this.disallow_faults == false) { this.incrementEmulatorCounter("playerResets") }
                        this.disallow_faults_function()
                    }
                }
                else {
                    if (newProp.value == 56150 && parseInt(this.timer_formatted_time[0]) == 0) {
                        this.startTime()
                        this.update_rom_starter_and_intro_mon();
                        this.blackout = false;
                        this.attempt_number++
                    }
                    if (parseInt(this.timer_formatted_time[0]) > 0 && newProp.value != 0 && this.game.properties.overworld.map_name.value != 'Pokemon League - Map 7') { // TODO How do resets work in HGSS?
                        this.blackout = false;
                        if (this.disallow_faults == false) { this.playerResets++ }
                        this.sendObsChapterMarker("RESET")
                        if (this.shuckie_timer && this.disallow_faults == false) { this.incrementEmulatorCounter("playerResets") }
                        this.disallow_faults_function()
                    }
                }
            })
        }
        //Blackouts
        this.game.properties.battle.player.team[0].stats.hp.change((newProp, oldProp) => {
            const state = this.game.properties.meta.state.value
            if (newProp.value == 0 && (state == `Battle`) && this.game.properties.player.player_id.value != 0) {
                console.log(this.game.properties.player.player_id.value)
                console.log(newProp.value)
                console.log(state)
                this.blackout = true;
            }
        })

        // Battle-entry markers. A wild battle and a trainer battle can both fire near-simultaneously
        // (battle.mode flips to 'Wild' while battle.opponent.trainer also briefly transitions). We
        // debounce IN markers through a short queue so a 'Wild' entry pre-empts any trainer IN that
        // would otherwise overwrite it. OUT markers fire immediately — they don't conflict.
        const BATTLE_IN_DEBOUNCE_MS = 250;
        let pendingBattleIn = null; // { name, isWild, timer }
        const queueBattleInMarker = (name, isWild) => {
            if (pendingBattleIn) {
                if (isWild) {
                    clearTimeout(pendingBattleIn.timer);
                } else if (pendingBattleIn.isWild) {
                    // Wild already queued — trainer write loses.
                    return;
                } else {
                    clearTimeout(pendingBattleIn.timer);
                }
            }
            const entry = { name, isWild, timer: null };
            entry.timer = setTimeout(() => {
                pendingBattleIn = null;
                this.sendObsChapterMarker(entry.name);
            }, BATTLE_IN_DEBOUNCE_MS);
            pendingBattleIn = entry;
        };

        this.game.properties.battle.opponent.trainer.change(async (newProp, oldProp) => {
            const trainer = newProp.value == null ? oldProp.value : newProp.value
            if (newProp.value == null) {
                // OUT — fire immediately, no conflict to resolve.
                this.sendObsChapterMarker("OUT - " + trainer)
            } 
            else if (this.selected_game == "Platinum" || this.selected_game == "Diamond and Pearl") {
                queueBattleInMarker("IN - " + trainer, false)
            }
            else if (this.selected_game == "HeartGold and SoulSilver" && this.game.properties.meta.menu.app_overlay_id.value === 12) {
                queueBattleInMarker("IN - " + trainer, false)
            }
        })

        this.game.properties.battle.mode?.change?.((newProp, oldProp) => {
            if (newProp?.value === 'Wild' && oldProp?.value !== 'Wild') {
                queueBattleInMarker("IN - Wild", true)
            }
        })

        if (this.selected_game == "HeartGold and SoulSilver") {
            this.game.properties.meta.menu.app_overlay_id.change(async (newProp, oldProp) => {
                this.sendObsChapterMarker("MENU - " + newProp.value)
            })
        }

        this.game.properties.meta.state.change((newProp, oldProp) => {
            // if (newProp.value == "Overworld" && oldProp.value == "From Battle") {
            //     const trainer = this.game.properties.battle.opponent.trainer.value
            //     const state = "OUT"
            //     const stateName = state
            //     this.sendObsChapterMarker(stateName)
            // }
            // else if (newProp.value == "Battle" && oldProp.value == "Overworld") {
            //     const trainer = newProp.value
            //     const state = "IN"
            //     const stateName = state + " - " + trainer
            //     this.sendObsChapterMarker(stateName)
            // }

            if (newProp.value == "Overworld") {
                this.freezeEncounters();
            }

            const game = this.game.properties.meta.game_name.value
            if (this.blackout == true) {
                if (game == 'Platinum' || game == 'Diamond and Pearl') {
                    if (newProp.value == "Overworld" && oldProp.value == "From Battle") {
                        if (this.disallow_faults == false) { 
                            this.blackout_counter++
                            this.sendObsChapterMarker("BLACKOUT")
                            if (this.shuckie_timer) { this.incrementEmulatorCounter("blackout_counter") }
                        }
                        this.blackout = false;
                        this.disallow_faults_function()
                    }
                }
                if (game == 'HeartGold and SoulSilver') {
                    if (newProp.value == "Overworld" && oldProp.value == "From Battle") {
                        if (this.disallow_faults == false) { 
                            this.blackout_counter++ 
                            this.sendObsChapterMarker("BLACKOUT")
                            if (this.shuckie_timer) { this.incrementEmulatorCounter("blackout_counter") }
                        }
                        this.blackout = false;
                        this.disallow_faults_function()
                    }
                }
            }

            // If we're showing evolved base stats and state changes to Battle (not from Battle),
            // hide the evolved base stats display
            if (this.show_evolved_base_stats && (newProp.value == "To Battle" || newProp.value == "Battle") && oldProp.value != "From Battle") {
                this.show_evolved_base_stats = false;
                this.stats_setting = "Automatic";
                this.evolved_species_for_stats = null;
            }
        });
        // MAP CHANGE CHAPTER MARKER
        // Fires "Map Change" whenever overworld.map_index changes value.
        this.game.properties.overworld?.map_index?.change?.((newProp, oldProp) => {
            if (newProp?.value === oldProp?.value) return;
            this.sendObsChapterMarker(`Map Change - ${newProp.value}`);
        });

        this.game.properties.battle.player.party_position.change(async (newProp, oldProp) => {
            const game = this.game.properties.meta.game_name.value
            // console.log(newProp.value, oldProp.value, this.blackout)
            if (newProp.value == 255 && oldProp.value != 255 && this.blackout == true) {
                // console.log("Second step", newProp.value, oldProp.value, this.blackout)
                if (game == 'Platinum' || game == 'Diamond and Pearl') {
                    if (this.disallow_faults == false) { 
                        this.blackout_counter++ 
                        this.sendObsChapterMarker("BLACKOUT")
                        if (this.shuckie_timer) { this.incrementEmulatorCounter("blackout_counter") }
                    }
                    this.blackout = false;
                    this.disallow_faults_function()
                }
                if (game == 'HeartGold and SoulSilver') {
                    console.log("Is this blackout fix needed for HeartGold and SoulSilver?")
                    if (this.disallow_faults == false) { 
                        this.blackout_counter++ 
                        this.sendObsChapterMarker("BLACKOUT")
                        if (this.shuckie_timer) { this.incrementEmulatorCounter("blackout_counter") }
                    }
                    this.blackout = false;
                    this.disallow_faults_function()
                }
            }
        })

        // NEW MOVE LEARNED CHAPTER MARKER (ported from gen2)
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

        // ITEM ACQUISITION CHAPTER MARKERS
        // Fires "Item - <name>" whenever the total owned quantity of an item name increases
        // (across all six gen4 bag pockets and team-held slots). HMs other than HM03 Surf are
        // suppressed. Bursts within ITEM_BURST_MS for the same name collapse to a single marker,
        // so buying 5 Potions at once fires once; buying 1 then 5 more after the window fires twice.
        // Slot reshuffles and held↔bag moves don't change totals, so they don't fire.
        const allPockets = ['items', 'medicine', 'balls', 'tmhm', 'berries', 'battle_items'];
        const ITEM_BURST_MS = 1500;

        const hmBlocklist = new Set([
            'HM01', 'HM02', 'HM04', 'HM05', 'HM06', 'HM07', 'HM08',
            'Cut', 'Fly', 'Strength', 'Defog', 'Rock Smash', 'Waterfall', 'Rock Climb'
        ]);
        const isBlockedHm = (name) => {
            if (hmBlocklist.has(name)) return true;
            return /^HM(?!03)\d{2}\b/.test(String(name));
        };

        const readItemTotals = () => {
            const totals = new Map();
            const bag = this.game?.properties?.bag;
            if (bag) {
                for (const pocket of allPockets) {
                    const slots = bag[pocket];
                    if (!slots) continue;
                    for (const k of Object.keys(slots)) {
                        const slot = slots[k];
                        const name = slot?.item?.value;
                        if (name == null || name === '') continue;
                        const qty = slot?.quantity?.value ?? 1;
                        totals.set(name, (totals.get(name) || 0) + qty);
                    }
                }
            }
            const team = this.game?.properties?.player?.team;
            if (team) {
                for (let i = 0; i < 6; i++) {
                    const name = team[i]?.held_item?.value;
                    if (name == null || name === '') continue;
                    totals.set(name, (totals.get(name) || 0) + 1);
                }
            }
            return totals;
        };

        const lastItemTotals = readItemTotals();
        // Per-item "last fired" timestamp. A new fire is gated on (now - lastFired) >= ITEM_BURST_MS,
        // so a burst of quantity bumps for one name collapses to one marker.
        const lastItemFiredAt = new Map();
        let itemCheckTimer = null;

        const checkItemDeltas = () => {
            const current = readItemTotals();
            const now = Date.now();
            for (const [name, qty] of current) {
                const prev = lastItemTotals.get(name) ?? 0;
                if (qty > prev && !isBlockedHm(name)) {
                    const last = lastItemFiredAt.get(name) ?? 0;
                    if (now - last >= ITEM_BURST_MS) {
                        const chapterName = "Item - " + name;
                        console.log("Chapter Detected: " + chapterName);
                        this.sendObsChapterMarker(chapterName);
                    }
                    lastItemFiredAt.set(name, now);
                }
            }
            lastItemTotals.clear();
            for (const [k, v] of current) lastItemTotals.set(k, v);
        };

        const scheduleItemCheck = () => {
            if (itemCheckTimer) clearTimeout(itemCheckTimer);
            itemCheckTimer = setTimeout(() => {
                itemCheckTimer = null;
                checkItemDeltas();
            }, 100);
        };

        const bagRoot = this.game?.properties?.bag;
        if (bagRoot) {
            for (const pocket of allPockets) {
                const slots = bagRoot[pocket];
                if (!slots) continue;
                for (const k of Object.keys(slots)) {
                    const slot = slots[k];
                    if (slot?.item?.change) slot.item.change(() => scheduleItemCheck());
                    if (slot?.quantity?.change) slot.quantity.change(() => scheduleItemCheck());
                }
            }
        }
        for (let i = 0; i < 6; i++) {
            const heldProp = this.game.properties.player.team[i]?.held_item;
            if (heldProp && typeof heldProp.change === 'function') {
                heldProp.change(() => scheduleItemCheck());
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

        // RNG: watch bag.items (shards) and bag.berries (berries) for quantity increases.
        // When the total quantity for a category grows while on a configured NPC's map,
        // advance that NPC's trip and write the next trip's value to the PokeAByte property
        // (or 0 when the configured trip list is exhausted).
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
            if (current <= previous) return;
            const currentMap = this.game?.properties?.overworld?.map_name?.value;
            if (!currentMap) return;
            for (const npc of this.rng_npcs) {
                if (npc.bagCategory !== category) continue;
                if (npc.map !== currentMap) continue;
                this.rng_trip_index[npc.key] = (this.rng_trip_index[npc.key] ?? 0) + 1;
                const nextValue = this.rng_trip_index[npc.key] < (this.rng_config[npc.key]?.length ?? 0)
                    ? this.rngPatchValueForTrip(npc.key, this.rng_trip_index[npc.key])
                    : 0;
                const prop = this.game.properties.patch?.[npc.patchProp];
                if (prop?.set) {
                    await prop.set(nextValue, false);
                }
            }
        };

        const rngBagCheckTimers = { items: null, berries: null };
        const scheduleRNGBagCheck = (category) => {
            if (rngBagCheckTimers[category]) clearTimeout(rngBagCheckTimers[category]);
            rngBagCheckTimers[category] = setTimeout(() => {
                rngBagCheckTimers[category] = null;
                advanceRNGForCategory(category);
            }, 100);
        };

        for (const category of ['items', 'berries']) {
            const root = this.game?.properties?.bag?.[category];
            if (!root) continue;
            for (const k of Object.keys(root)) {
                const slot = root[k];
                if (slot?.quantity?.change) slot.quantity.change(() => scheduleRNGBagCheck(category));
                if (slot?.item?.change) slot.item.change(() => scheduleRNGBagCheck(category));
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

        const setStartingStats = async () => {
            //256 * 25 * 10 = 70400, gives a clean starting point where modulo 25 and modulo 256 are both 0
            //this can really be anything divisible by 256 though
            var personalityValue = 70400 + this.natures[this.pkmnNature]["modulo_value"];
            if(this.pkmn_gender == "Male") {
                //31 and 225 are the breakpoints for 87% gender ratio pokemon
                personalityValue += 225;
            }
            //the odd/evenness may need to be flipped according to the selected ability
            //this code prevents abilities from swapping when the Pokemon evolves
            if (this.g4PokemonData[this.starter]?.abilities && 
                ((personalityValue % 2 == 0 && this.pkmn_ability == this.g4PokemonData[this.starter].abilities[1]) ||
                (personalityValue % 2 == 1 && this.pkmn_ability == this.g4PokemonData[this.starter].abilities[0]))) {
            //     these checks are trying to flip the odd/even by adding an odd number multiple of 25
            //     in order to not disturb the nature calc. It's trying to maintain the gender calc too.
                if (personalityValue % 256 <= 11 && this.pkmn_gender != "Male") {
                    personalityValue += 275; //adding 275 won't make the modulo exceed 31
                }
                else if (personalityValue % 256 > 11 && this.pkmn_gender != "Male") {
                    personalityValue += 1525; //1525 keeps the modulo between 0 and 31
                }
                else if (personalityValue % 256 <= 236 && this.pkmn_gender == "Male") {
                    personalityValue += 275; //adding 275 keeps the modulo between 225 and 255
                }
                else if (personalityValue % 256 > 236 && this.pkmn_gender == "Male") {
                    personalityValue += 1525; //1525 keeps the modulo between 225 and 255
                }
            }
            
            const ability   = this.pkmn_ability
            const species   = this.starter
            const pkmnData  = this.g4PokemonData[this.starter]
            const level     = 5
            const natures   = this.natures[this.pkmnNature]
            let player_starter = this.starter_choice

            //* IV BLOCK CALCULATION (the Hidden Power dropdowns' spread, or the Manual fields')
            const starter_ivs = this.starter_ivs()
            var ivHp  = starter_ivs.hp
            var ivAtk = starter_ivs.atk
            var ivDef = starter_ivs.def
            var ivSpe = starter_ivs.spe
            var ivSpA = starter_ivs.spa
            var ivSpD = starter_ivs.spd

            //Calculates the Pokemon's starting stats with the desired DVs
            var base_stats     = pkmnData.base_stats
            var hitpoints      = Math.floor((((2 * base_stats.hp + ivHp + 0) * level)/100) + level + 10)
            var attack         = Math.floor(Math.floor(((((2 * base_stats.attack + ivAtk + 0) * level)/100) + 5)) * natures["nature_attack"])
            var defense        = Math.floor(Math.floor(((((2 * base_stats.defense + ivDef + 0) * level)/100) + 5)) * natures["nature_defense"])
            var specialAttack  = Math.floor(Math.floor(((((2 * base_stats.special_attack + ivSpA + 0) * level)/100) + 5)) * natures["nature_specialAttack"])
            var specialDefense = Math.floor(Math.floor(((((2 * base_stats.special_defense + ivSpD + 0) * level)/100) + 5)) * natures["nature_specialDefense"])
            var speed          = Math.floor(Math.floor(((((2 * base_stats.speed + ivSpe + 0) * level)/100) + 5)) * natures["nature_speed"])

            if (this.legacy_starter_assignment) { 
                this.game.properties.player.starter.set(player_starter, false) 
            } //this needs to be turned off refilming Sudowoodo
            await Promise.all([
                //Set personality value & ablity
                this.game.properties.player.team[0].internals.personality_value.set(personalityValue, false), 
                this.game.properties.player.team[0].ability.set(ability, false), 
                this.game.properties.player.team[0].stats.hp.set(hitpoints, false), 
                this.game.properties.player.team[0].stats.hp_max.set(hitpoints, false), 
                this.game.properties.player.team[0].stats.attack.set(attack, false), 
                this.game.properties.player.team[0].stats.defense.set(defense, false), 
                this.game.properties.player.team[0].stats.special_attack.set(specialAttack, false), 
                this.game.properties.player.team[0].stats.special_defense.set(specialDefense, false), 
                this.game.properties.player.team[0].stats.speed.set(speed, false), 
                this.game.setBits([
                    {path: 'player.team.0.ivs.hp',              value: ivHp,  freeze: false},
                    {path: 'player.team.0.ivs.attack',          value: ivAtk, freeze: false},
                    {path: 'player.team.0.ivs.defense',         value: ivDef, freeze: false},
                    {path: 'player.team.0.ivs.speed',           value: ivSpe, freeze: false},
                    {path: 'player.team.0.ivs.special_attack',  value: ivSpA, freeze: false},
                    {path: 'player.team.0.ivs.special_defense', value: ivSpD, freeze: false},
                ]),
            ])
            if (this.game.properties.meta.game_name.value == "Platinum") {
                await Promise.all([
                    this.game.setBits([
                        {path: 'patch.FLAG_FORCE_ROUTE_201_BIDOOF', value: this.hm_route_201_bidoof,  freeze: false},
                        {path: 'patch.FLAG_FORCE_ROUTE_201_STARLY', value: this.hm_route_201_starly,  freeze: false},
                        {path: 'patch.FLAG_FORCE_ROUTE_202_BIDOOF', value: this.hm_route_202_bidoof,  freeze: false},
                        {path: 'patch.FLAG_FORCE_ROUTE_202_STARLY', value: this.hm_route_202_starly,  freeze: false},
                        {path: 'patch.FLAG_FORCE_ROUTE_203_ABRA', value: this.hm_route_203_abra,  freeze: false},
                        {path: 'patch.FLAG_FORCE_OREBURGH_GATE_ZUBAT', value: this.hm_oreburgh_gate_zubat,  freeze: false},
                        {path: 'patch.FLAG_FORCE_OREBURGH_GATE_GEODUDE', value: this.hm_oreburgh_gate_geodude,  freeze: false},
                    ]),
                    this.game.setBits([
                        {path: 'patch.FLAG_FORCE_OREBURGH_GATE_PSYDUCK', value: this.hm_oreburgh_gate_psyduck,  freeze: false},
                        {path: 'patch.FLAG_FORCE_ROUTE_207_MACHOP', value: this.hm_route_207_machop,  freeze: false},
                        {path: 'patch.FLAG_FORCE_ROUTE_207_GEODUDE', value: this.hm_route_207_geodude,  freeze: false},
                        {path: 'patch.FLAG_FORCE_OREBURGH_MINE_GEODUDE', value: this.hm_oreburgh_mine_geodude,  freeze: false},
                        {path: 'patch.FLAG_FORCE_ROUTE_208_BIBAREL', value: this.hm_route_208_bibarel,  freeze: false},
                        {path: 'patch.FLAG_FORCE_ROUTE_213_BUIZEL', value: this.hm_route_213_buizel,  freeze: false},
                    ]),
                ])
            }
            if (this.game.properties.meta.game_name.value == "HeartGold and SoulSilver") {
                await Promise.all([
                    this.game.setBits([
                        // byte 0x160 (flag IDs 0xB00-0xB07)
                        {path: 'patch.FLAG_FORCE_R29_SENTRET',          value: this.hm_route_29_sentret,    freeze: false},
                        {path: 'patch.FLAG_FORCE_R29_RATTATA',          value: this.hm_route_29_rattata,    freeze: false},
                        {path: 'patch.FLAG_FORCE_R29_PIDGEY',           value: this.hm_route_29_pidgey,     freeze: false},
                        {path: 'patch.FLAG_FORCE_R30_RATTATA',          value: this.hm_route_30_rattata,    freeze: false},
                        {path: 'patch.FLAG_FORCE_R30_PIDGEY',           value: this.hm_route_30_pidgey,     freeze: false},
                        {path: 'patch.FLAG_FORCE_R31_BELLSPROUT',       value: this.hm_route_31_bellsprout, freeze: false},
                        {path: 'patch.FLAG_FORCE_R31_RATTATA',          value: this.hm_route_31_rattata,    freeze: false},
                        {path: 'patch.FLAG_FORCE_R31_PIDGEY',           value: this.hm_route_31_pidgey,     freeze: false},
                    ]),
                    this.game.setBits([
                        // byte 0x161 (flag IDs 0xB08-0xB0B)
                        {path: 'patch.FLAG_FORCE_R32_RATTATA',          value: this.hm_route_32_rattata,    freeze: false},
                        {path: 'patch.FLAG_FORCE_R32_WOOPER',           value: this.hm_route_32_wooper,     freeze: false},
                        {path: 'patch.FLAG_FORCE_UNION_CAVE_SANDSHREW', value: this.hm_union_cave_sandshrew,freeze: false},
                        {path: 'patch.FLAG_FORCE_R34_DROWZEE',          value: this.hm_route_34_drowzee,    freeze: false},
                    ]),
                ])
            }
            // RNG: reset trip indices and write first-trip values to PokeAByte properties.
            for (const npc of this.rng_npcs) {
                this.rng_trip_index[npc.key] = 0;
                const value = this.rngPatchValueForTrip(npc.key, 0);
                const prop = this.game.properties.patch?.[npc.patchProp];
                if (prop?.set) {
                    await prop.set(value, false);
                }
            }

            if (species == 'Regirock' || species == 'Regice' || species == 'Registeel') {
                await Promise.all([
                    await this.game.properties.player.team[0].moves[0].pp.set(0, false),
                ])
            }
            if (species == 'Shaymin' || species == 'Shaymin (Land)' || species == 'Shaymin (Sky)' || species == 'Mew' || species == 'Deoxys') {
                await Promise.all([
                    await this.game.properties.player.team[0].flags.fateful_encounter.set(true, false),
                ])
            }
            if (POKEMON_FORM_INFO[species]) {
                await Promise.all([
                    await this.game.properties.player.team[0].flags.alternate_forms.set(POKEMON_FORM_INFO[species].form, false),
                ])
            }
        }
        this.game.properties.player.team[0].level.change(async (newProp) => {
            if (this.game.properties.meta.game_name.value == "Platinum" && newProp == 5 && this.game.properties.overworld?.map_name?.value == "Route 201 - Map 1") {
                await setStartingStats()
            }
            if (this.game.properties.meta.game_name.value == "HeartGold and SoulSilver" && newProp == 5 && this.game.properties.overworld?.map_index?.value == 61) {
                await setStartingStats()
            }
        });

        this.game.properties.player.starter.change(async (newProp) => {
            if (newProp.value != this.starter_choice && this.game.properties.meta.game_name.value == "HeartGold and SoulSilver" && this.game.properties.overworld?.map_index?.value == 61 && this.legacy_starter_assignment) {
                await Promise.all([
                    await this.game.properties.player.starter.set(this.starter_choice, false),
                ])
            }
        })

        //Styling for stats in case they go above 999
        const stat_size_3_digit = "56px"
        const stat_size_4_digit = "43px"
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
        this.game.properties.battle.player.active_pokemon.modifiers.attack.change(async () => {
            const atkElement = document.getElementById("Atk")
            if (atkElement && this.get_stat()["Atk"].toString().length <= 3) { atkElement.style.fontSize = stat_size_3_digit }
            if (atkElement && this.get_stat()["Atk"].toString().length >= 4) { atkElement.style.fontSize = stat_size_4_digit }
        })
        this.game.properties.battle.player.active_pokemon.modifiers.defense.change(async () => {
            const defElement = document.getElementById("Def")
            if (defElement && this.get_stat()["Def"].toString().length <= 3) { defElement.style.fontSize = stat_size_3_digit }
            if (defElement && this.get_stat()["Def"].toString().length >= 4) { defElement.style.fontSize = stat_size_4_digit }
        })
        this.game.properties.battle.player.active_pokemon.modifiers.special_attack.change(async () => {
            const spaElement = document.getElementById("SpA")
            if (spaElement && this.get_stat()["SpA"].toString().length <= 3) { spaElement.style.fontSize = stat_size_3_digit }
            if (spaElement && this.get_stat()["SpA"].toString().length >= 4) { spaElement.style.fontSize = stat_size_4_digit }
        })
        this.game.properties.battle.player.active_pokemon.modifiers.special_defense.change(async () => {
            const spdElement = document.getElementById("SpD")
            if (spdElement && this.get_stat()["SpD"].toString().length <= 3) { spdElement.style.fontSize = stat_size_3_digit }
            if (spdElement && this.get_stat()["SpD"].toString().length >= 4) { spdElement.style.fontSize = stat_size_4_digit }
        })
        this.game.properties.battle.player.active_pokemon.modifiers.speed.change(async () => {
            const speElement = document.getElementById("Spe")
            if (speElement && this.get_stat()["Spe"].toString().length <= 3) { speElement.style.fontSize = stat_size_3_digit }
            if (speElement && this.get_stat()["Spe"].toString().length >= 4) { speElement.style.fontSize = stat_size_4_digit }
        })

        //*Autosplitter
        const log_split = (x) => console.log(`Autosplitter - Battle Ended - Split: ${this.game.properties.battle.opponent.name.value} at ${this.timer_formatted_time[0]}${this.timer_formatted_time[1]} (Gametime: ${this.gametimeSplit})`)
        const autosplitter_process = (optional_trainer_data = null) => {
            // console.log("Checking if autosplitter is on...")
            if (this.autosplitter_toggle == true) {
                // console.log("Began Autosplitter Process")
                battle_end = Date.now()
                //data to be collected with the autosplitter
                let player_name  = this.game.properties.player.name.value
                let pokemon      = this.starter
                let trainer_name = optional_trainer_data ? optional_trainer_data : this.get_trainer_name(this.game.properties.battle.opponent.name.value, this.game.properties.battle.opponent.id.value)
                let real_time_hmmss      = this.timer_formatted_time[0]
                let resets_value         = this.shuckie_counters ? (this.emulatorStats?.counters?.playerResets ?? 0)     : this.playerResets
                let blackouts_value      = this.shuckie_counters ? (this.emulatorStats?.counters?.blackout_counter ?? 0) : this.blackout_counter
                let resets               = resets_value.toString()
                let blackouts            = blackouts_value.toString()
                let level                = this.game.properties.player.team[0].level.value.toString()
                let game_time            = this.gametimeSplit.toString()
                let battle_duration      = (battle_end - this.battle_start)/1000 
                let move1     = this.game.properties.player.team[0].moves[0].move.value
                let move2     = this.game.properties.player.team[0].moves[1].move.value
                let move3     = this.game.properties.player.team[0].moves[2].move.value
                let move4     = this.game.properties.player.team[0].moves[3].move.value

                let realTime       = this.padTime(this.time_h) + ":" + this.padTime(this.time_m) + ":" + this.padTime(this.time_s) + "." + this.padTime(this.time_ms)

                let shuckie_time_hhmmss = this.formatMilliseconds(this.emulatorStats?.time_current)
                let shuckie_time_cs = this.getCentiseconds(this.emulatorStats?.time_current)
                let shuckie_rt = this.shuckie_timer ?shuckie_time_hhmmss + "." + shuckie_time_cs : realTime

                //what split data is logged to file
                let simple_data = []
                if (this.shuckie_timer == true) {
                    simple_data = [
                        player_name, pokemon, trainer_name, shuckie_rt, 
                        resets, blackouts, level, game_time, battle_duration, 
                        move1, move2, move3, move4
                    ]
                } else {
                    simple_data = [
                        player_name, pokemon, trainer_name, real_time_hmmss, 
                        resets, blackouts, level, game_time, battle_duration, 
                        move1, move2, move3, move4
                    ]
                }
                let simple_data_str = simple_data.join(",") + "\n";
                MyStorage["simple_data_str"] = simple_data_str
                MyStorage["simple_data"] = simple_data
                this.simple_data_str = simple_data_str
                this.simple_data = simple_data
                // console.log("Simple Data: ", simple_data)
            }
        }

        //write to file at the end of a key battle
        this.game.properties.meta.state.change(async (newProp, oldProp) => {
            // console.log(`State Changed to "${newProp.value}"`)
            // The post-battle Splits ends when the next battle starts (decision 27: only the override; this used to
            // reset the setting itself to Automatic).
            if (newProp.value == "Battle") {
                this.clear_right_panel_override()
            }
            if (newProp.value != 'From Battle' || this.game.properties.battle.player.team[0].stats.hp.value == 0) { return }
            autosplitter_process()
            console.log('Autosplitter Attempted to Run')
            if (newProp.value == 'From Battle') {
                // console.log('Starting split log process')
                let trainer = this.game.properties.battle.opponent.name.value
                let id = this.game.properties.battle.opponent.id.value
                let gameName = 'Platinum'
                let game_name = 'Platinum'
                if (trainer == 'Pokemon Trainer -' || trainer == null || trainer == undefined) { return }
                if (this.game.properties.meta.game_name.value == 'HeartGold and SoulSilver') {
                    gameName = 'HGSS'
                    game_name = 'HeartGold and SoulSilver'
                }
                if (this.game.properties.meta.game_name.value == 'Diamond and Pearl') {
                    gameName = 'DP'
                    game_name = 'Diamond and Pearl'
                }
                const splitFileName = this.getSplitFileName();

                //write split data
                const simpleSplit = () => {
                    log_split()
                    logData(gameName, this.simple_data_str, this.attempt_number, splitFileName, this.testRun, this.evolution, splitFileName, this.refilming_mode)
                    
                    // Ensure current_splits is an array
                    if (!Array.isArray(this.current_splits)) {
                        this.current_splits = []
                    }
                    
                    // Ensure simple_data is an array before accessing it
                    if (!Array.isArray(this.simple_data) || this.simple_data.length < 4) {
                        console.error("simpleSplit: this.simple_data is not a valid array:", this.simple_data)
                        return
                    }
                    
                    this.split_data.push(this.simple_data)
                    // split_data is no longer persisted (2026-09-17): it is only ever pushed to, the
                    // CSV split files are the record, and storing the whole history under the bare key
                    // and again inside every species' entry grew user_state.json to 324 MB, which every
                    // settings write re-serialised (docs/performance-followups.md, known-legacy-bugs.md #43).
                    // Update current_splits so the split appears in the display
                    // simple_data format: [player_name, pokemon, trainer_name, real_time_hmmss, ...]
                    // current_splits format: [{trainer: ..., time: ...}, ...]
                    const trainerName = this.simple_data[2] // trainer_name is at index 2
                    const timeStr = this.simple_data[3]     // real_time_hmmss is at index 3
                    
                    if (!trainerName || !timeStr) {
                        console.error("simpleSplit: Missing trainerName or timeStr:", {trainerName, timeStr, simple_data: this.simple_data})
                        return
                    }
                    
                    // For trainers that appear multiple times (Rival, Cyrus, and HGSS Elite Four/Champion), always add as new entry
                    // For other trainers, update if exists, otherwise add new
                    const multiInstanceTrainers = [
                        "Rival", 
                        "Cyrus",
                        // HGSS Elite Four and Champion are fought twice (Johto E4 + Kanto rematch before Red)
                        "Elite Four Will",
                        "Elite Four Koga", 
                        "Elite Four Bruno",
                        "Elite Four Karen",
                        "Champion Lance"
                    ]
                    if (multiInstanceTrainers.includes(trainerName)) {
                        // Always add as new entry to track multiple instances
                        this.current_splits.push({trainer: trainerName, time: timeStr})
                        // The same split into the replay (2026-09-23), the n-th fight of this trainer marked.
                        addSplitBookmark(trainerName, timeStr, this.current_splits.filter(s => s.trainer === trainerName).length)
                    } else {
                        // Check if this trainer already exists in current_splits and update it, or add new
                        const existingIndex = this.current_splits.findIndex(s => s.trainer === trainerName)
                        if (existingIndex >= 0) {
                            this.current_splits[existingIndex].time = timeStr
                        } else {
                            this.current_splits.push({trainer: trainerName, time: timeStr})
                        }
                        addSplitBookmark(trainerName, timeStr)
                    }
                    console.log("simpleSplit: Updated current_splits with", {trainer: trainerName, time: timeStr}, "Total splits:", this.current_splits.length)
                }
                // Use the processed trainer name from simple_data for the check, since that's what's actually in game.splits
                const trainer_name = Array.isArray(this.simple_data) && this.simple_data.length > 2 ? this.simple_data[2] : this.get_trainer_name(trainer, id)
                
                // Helper to check if trainer should be written to file (includes Rival, Cyrus, Mars, Jupiter, Saturn)
                const shouldWriteSplit = (name) => {
                    // Check exact match first
                    if (this.game_data.splits.includes(name)) {
                        return true
                    }
                    // Check base name for numbered variants (e.g., "Rival 1" -> "Rival", "Mars 1" -> "Commander Mars")
                    const baseName = name.split(' ')[0] // Get first word before number
                    if (baseName === "Rival" && this.game_data.splits.includes("Rival")) {
                        return true
                    }
                    if (baseName === "Mars" && this.game_data.splits.includes("Commander Mars")) {
                        return true
                    }
                    if (baseName === "Jupiter" && this.game_data.splits.includes("Commander Jupiter")) {
                        return true
                    }
                    if (baseName === "Saturn" && this.game_data.splits.includes("Commander Saturn")) {
                        return true
                    }
                    if (baseName === "Cyrus" && this.game_data.splits.includes("Galactic Boss Cyrus")) {
                        return true
                    }
                    return false
                }
                
                console.log("Split check:", {trainer, trainer_name, shouldWrite: shouldWriteSplit(trainer_name), notFinalBattle: !this.game_data.finalBattle.includes(trainer_name), simple_data: this.simple_data})
                if(shouldWriteSplit(trainer_name) && !this.game_data.finalBattle.includes(trainer_name)) {
                    // console.log("Simple split attempted to be collected...")
                    simpleSplit();
                    // In HGSS, don't auto-show the splits panel after the Kanto gym leaders (Blue is excluded from this list so his panel still shows)
                    const hgssKantoLeadersToSkip = ["Leader Brock", "Leader Lt. Surge", "Leader Misty", "Leader Erika", "Leader Blaine", "Leader Janine", "Leader Sabrina"]
                    const skipForHGSSKantoLeader = this.selected_game == "HeartGold and SoulSilver" && hgssKantoLeadersToSkip.includes(trainer_name)
                    if (this.automatic_post_battle_splits == true && !skipForHGSSKantoLeader &&
                        !trainer_name.startsWith("Rival") && !trainer_name.startsWith("Mars") && !trainer_name.startsWith("Jupiter") && !trainer_name.startsWith("Saturn") && !trainer_name.startsWith("Cyrus") && (trainer_name != "Passerby Boy")) {
                        this.show_post_battle_splits()
                    }
                }
        
                if (this.game_data.champion.includes(trainer)) {
                    this.hallOfFameReset = true;
                    if (this.selected_game == "HeartGold and SoulSilver") {
                        this.kanto_badges = true;
                    }
                }

                //stop timer
                if (this.game_data.finalBattle.includes(trainer)) {
                    this.stopTime()
                    // HG/SS's Hall of Fame doesn't show the play time, so the run ends here: the type badges give way to
                    // the "gametime" box (decision 24 of docs/ui-uniformity-plan.md). Platinum and D/P keep theirs.
                    if (this.selected_game == "HeartGold and SoulSilver") {
                        this.run_complete = true
                    }
                    if (this.shuckie_timer == true) { 
                        this.sendEmulatorEnd(); 
                    }
                    if (this.testRun == false) {
                        this.finished_run_count++
                    };
                    log_split();
                    
                    //use then so that logCopy doesn't touch any files until logData finishes
                    const splitFileName = this.getSplitFileName();
                    logData(gameName, this.simple_data_str, this.attempt_number, splitFileName, this.testRun, this.evolution, splitFileName, this.refilming_mode)
                    .then(() => {
                            // DPP defers the finishes/ copy until after the Hall of Fame split is recorded
                            // so the HoF entry is included. HGSS has no HoF flow, so copy now.
                            if (gameName !== 'Platinum') {
                                logCopy(gameName, this.attempt_number, splitFileName, this.finished_run_count, this.getFinishFileName());
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
                    // Update current_splits so the split appears in the display
                    // simple_data format: [player_name, pokemon, trainer_name, real_time_hmmss, ...]
                    // current_splits format: [{trainer: ..., time: ...}, ...]
                    const trainerName = this.simple_data[2] // trainer_name is at index 2
                    const timeStr = this.simple_data[3]     // real_time_hmmss is at index 3
                    // For trainers that appear multiple times (Rival, Cyrus), always add as new entry
                    // For other trainers, update if exists, otherwise add new
                    if (trainerName === "Rival" || trainerName === "Cyrus") {
                        // Always add as new entry to track multiple instances
                        this.current_splits.push({trainer: trainerName, time: timeStr})
                        // The same split into the replay (2026-09-23), the n-th fight of this trainer marked.
                        addSplitBookmark(trainerName, timeStr, this.current_splits.filter(s => s.trainer === trainerName).length)
                    } else {
                        // Check if this trainer already exists in current_splits and update it, or add new
                        const existingIndex = this.current_splits.findIndex(s => s.trainer === trainerName)
                        if (existingIndex >= 0) {
                            this.current_splits[existingIndex].time = timeStr
                        } else {
                            this.current_splits.push({trainer: trainerName, time: timeStr})
                        }
                        addSplitBookmark(trainerName, timeStr)
                    }
                    // Show splits after final battle if automatic_post_battle_splits is enabled
                    if (this.automatic_post_battle_splits == true) {
                        this.show_post_battle_splits()
                    }
                    // console.log("Data transfer finished.")
                }
            }
        });

        this.game.properties.screen.menu.cursor.flag.change(async (newProp, oldProp) => {
            if (this.game.properties.overworld.map_name.value == "Pokemon League - Map 16" && newProp.value == 156) { //magic number for Hall of Fame, may need to be updated with new versions of the patch
                console.log("Hall of Fame split.")
                const splitFileName = this.getSplitFileName();
                let gameName = 'Platinum'
                let game_name = 'Platinum'
                if (this.game.properties.meta.game_name.value == 'HeartGold and SoulSilver') {
                    gameName = 'HGSS'
                    game_name = 'HeartGold and SoulSilver'
                }
                
                autosplitter_process("Hall of Fame")

                //write split data
                let simpleP;
                const simpleSplit = () => {
                    log_split()
                    simpleP = logData(gameName, this.simple_data_str, this.attempt_number, splitFileName, this.testRun, this.evolution, splitFileName, this.refilming_mode)
                    this.split_data.push(this.simple_data)
                    // split_data is no longer persisted (2026-09-17): it is only ever pushed to, the
                    // CSV split files are the record, and storing the whole history under the bare key
                    // and again inside every species' entry grew user_state.json to 324 MB, which every
                    // settings write re-serialised (docs/performance-followups.md, known-legacy-bugs.md #43).
                    // Update current_splits so the split appears in the display
                    // simple_data format: [player_name, pokemon, trainer_name, real_time_hmmss, ...]
                    // current_splits format: [{trainer: ..., time: ...}, ...]
                    const trainerName = this.simple_data[2] // trainer_name is at index 2
                    const timeStr = this.simple_data[3]     // real_time_hmmss is at index 3
                    // For trainers that appear multiple times (Rival, Cyrus), always add as new entry
                    // For other trainers, update if exists, otherwise add new
                    if (trainerName === "Rival" || trainerName === "Cyrus") {
                        // Always add as new entry to track multiple instances
                        this.current_splits.push({trainer: trainerName, time: timeStr})
                        // The same split into the replay (2026-09-23), the n-th fight of this trainer marked.
                        addSplitBookmark(trainerName, timeStr, this.current_splits.filter(s => s.trainer === trainerName).length)
                    } else {
                        // Check if this trainer already exists in current_splits and update it, or add new
                        const existingIndex = this.current_splits.findIndex(s => s.trainer === trainerName)
                        if (existingIndex >= 0) {
                            this.current_splits[existingIndex].time = timeStr
                        } else {
                            this.current_splits.push({trainer: trainerName, time: timeStr})
                        }
                        addSplitBookmark(trainerName, timeStr)
                    }
                }
                simpleSplit()

                // DPP: now that the HoF split has been written, copy the species folder into finishes/.
                // (The final-battle handler intentionally skipped this for Platinum to wait for HoF.)
                // HGSS already copied at the final battle and doesn't reach this branch with a copy step.
                if (gameName === 'Platinum') {
                    simpleP
                        .then(() => {
                            logCopy(gameName, this.attempt_number, splitFileName, this.finished_run_count, this.getFinishFileName());
                        })
                        .catch(error => {
                            console.error("logCopy after Hall of Fame failed:", error);
                        });
                }
            }
        });

        //EXP Bar Animation
        this.game.properties.player.team[0].exp.change(async (newProp, oldProp) => {
            // console.log("State - EXP Function 1", this.game.properties.meta.state.value, this.game.properties.player.team[0].exp.value)
            if (this.expBarAnimation == true) {
                // console.log("Exp Bar function got here (1)...")
                const species = this.game.properties.player.team[0].species.value ?? this.starter;
                const growthRate = this.g4PokemonData[species]?.growth_rate ?? this.g4PokemonData[this.starter].growth_rate;
                const expPoints = newProp.value;
                const newExpStats = this.calcExpStats(growthRate, expPoints);

                this.expBarState.species = species;
                this.expBarState.expPoints = expPoints;

                // console.log("exp changed", {species, growthRate, expPoints})

                this.$refs.expBar.setWidth((newExpStats.percent * 100) + "%");
            }
        })
        this.game.properties.battle.player.active_pokemon.exp.change(async (newProp, oldProp) => {
            // console.log("State - EXP Function 2", this.game.properties.meta.state.value, this.game.properties.player.team[0].exp.value)
            if (this.game.properties.meta.state.value == "Battle") {
                if (this.expBarAnimation == true) {
                    // console.log("Exp Bar function got here (2)...")
                    const prevSpecies = this.expBarState.species;
                    const prevExpPoints = this.expBarState.expPoints;
                    const prevGrowthRate = this.g4PokemonData[prevSpecies].growth_rate;
                    const prevExpStats = this.calcExpStats(prevGrowthRate, prevExpPoints);

                    const newSpecies = this.game.properties.player.team[0].species.value;
                    const newExpPoints = newProp.value;
                    const newGrowthRate = this.g4PokemonData[newSpecies].growth_rate;
                    const newExpStats = this.calcExpStats(newGrowthRate, newExpPoints);

                    if (newExpPoints > 1640000) { return } // max exp is 1,640,000

                    this.expBarState.species = newSpecies;
                    this.expBarState.expPoints = newExpPoints;

                    // console.log("battle exp changed", 
                    //     {species: prevSpecies, expPoints: prevExpPoints, growthRate: prevGrowthRate},
                    //     {species: newSpecies, expPoints: newExpPoints, growthRate: newGrowthRate}
                    // )
    
                    // did we switch out?
                    if (prevSpecies != newSpecies) {
                        // console.log("switched out");
                        // dont animate, just set newExpStats.percent
                        this.$refs.expBar.setWidth((newExpStats.percent * 100) + "%");
                    } 
                    // same pokemon but exp changed
                    else {
                        if (prevExpPoints == newExpPoints) { 
                            // console.log("exp unchanged", {prevExpPoints, newExpPoints});
                            return
                        }

                        // animate (core/overlay/player/ExpBar.ts, timed in playerPanel.ts)
                        await this.$refs.expBar.animate(prevExpStats, newExpStats);
                    }
                    this.$refs.expBar.setTransition(null);
                }
            }
        })
        //keybinds
        this.unbindHotkeys = bindShortcuts({ actions: gen4Actions(this), namespace: "gen4", title: "Generation 4", gameLoaded: true });

        // The control server (port 30159) lives in the main process and is bound to
        // games/gen4/control.ts by main.ts; the client is main.ts's too, so the
        // beforeunload cleanup that closed both is gone with them.

        // Enemy sprite resize tool — dev mode only.
        if (this.isInDevMode) {
            window.addEventListener('keydown', this._devKeydown = (e) => {
                // Style mode owns Enter/Backspace/Escape; arrows/F1 fall through to nudge/flip.
                if (this.style_mode_active) {
                    if (e.key === 'Enter')     { e.preventDefault(); this.styleModeAdvance(); return; }
                    if (e.key === 'Backspace') { e.preventDefault(); this.styleModeBack();    return; }
                    if (e.key === 'Escape')    { e.preventDefault(); this.exitStyleMode();   return; }
                }
                if (!this.enemyResize.species) return;
                if (e.key === 'Enter')           { e.preventDefault(); this.commitEnemySpriteResize(); }
                else if (e.key === 'Escape')     { e.preventDefault(); this.cancelEnemySpriteResize(); }
                else if (e.key === 'ArrowUp')    { e.preventDefault(); this.nudgeEnemySpriteY(e.shiftKey ? -10 : -1); }
                else if (e.key === 'ArrowDown')  { e.preventDefault(); this.nudgeEnemySpriteY(e.shiftKey ?  10 :  1); }
                else if (e.key === 'ArrowLeft')  { e.preventDefault(); this.nudgeEnemySpriteX(e.shiftKey ? -10 : -1); }
                else if (e.key === 'ArrowRight') { e.preventDefault(); this.nudgeEnemySpriteX(e.shiftKey ?  10 :  1); }
                else if (e.key === 'F1')         { e.preventDefault(); this.toggleEnemySpriteFlip(); }
            });
            window.addEventListener('mousedown', this._devMousedown = (e) => {
                if (!e.ctrlKey || e.button !== 0) return;
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
