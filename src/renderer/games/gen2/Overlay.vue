<template>
<div>

            <div class="mainContainer">
            <!-- GRAPHICS -->
                <div class="graphics">
                    <img class="canvas texture" ref="background_texture" :src="textures[backgroundTexture]" :style="{ 
                        'filter': `blur(${backgroundBlur}px) hue-rotate(${backgroundHue}deg) brightness(${backgroundBrightness}%) contrast(${backgroundContrast}%) saturate(${backgroundSaturation}%)` ,
                        'transform': `scale(${backgroundScale}%) ${backgroundFlip ? 'rotateY(180deg)' : ''} ${backgroundXFlip ? 'rotateX(180deg)' : ''} translate(${backgroundXOffset}px, ${-backgroundYOffset}px)`
                    }">
                    <img class="canvas" ref="old_background_texture" style="opacity: 0">
                    <img class="canvas pokeball" :src="`images/gen2/elements/pokeball.webp`" :style="{
                            'transform': `translate(${pokeball_translateX}px, ${-pokeball_translateY}px)`}">
                    <img class="pokemon_art pokemon_offsets" ref="pokemon_art" :style="{
                        'transform': `scale(${imageScale}) ${imageFlip ? 'rotateY(180deg)' : ''} translate(${imageXOffset}px, ${-imageYOffset}px)`,
                        'filter': `saturate(${imageSat}%)
                        drop-shadow(0 0 0.4px #000)
                        drop-shadow(0 0 0.4px #000)
                        drop-shadow(0 0 0.4px #000)
                        drop-shadow(0 0 0.4px #000)
                        drop-shadow(0 0 0.4px #000)
                        drop-shadow(0 0 0.4px #000)
                        drop-shadow(${imageFlip ? '-3px' : '3px'} 3px 3px #000)
                        `
                    }" :src="`images/gen2/pokemon/${s1dynamicReset.species.value}.webp`">
                    <div class="svg-container">
                        <div v-show="blackouts_resets == 'None'" class="colored-image ds" :style="`filter: saturate(${ui_saturation}) drop-shadow(0px 0px 1px #000000)`" style="--url: url(images/gen2/ui/timer_2.svg)"></div>
                        <div v-show="blackouts_resets == 'Blackouts'" class="colored-image ds" :style="`filter: saturate(${ui_saturation}) drop-shadow(0px 0px 1px #000000)`" style="--url: url(images/gen2/ui/timer_2.svg)"></div>
                        <div v-show="blackouts_resets == 'Resets'" class="colored-image ds" :style="`filter: saturate(${ui_saturation}) drop-shadow(0px 0px 1px #000000)`" style="--url: url(images/gen2/ui/timer_2.svg)"></div>
                        <div v-show="blackouts_resets == 'Both'" class="colored-image ds" :style="`filter: saturate(${ui_saturation}) drop-shadow(0px 0px 1px #000000)`" style="--url: url(images/gen2/ui/timer.svg)"></div>
                        <div class="colored-image ds" :style="`filter: saturate(${ui_saturation}) drop-shadow(0px 0px 1px #000000)`" style="--url: url(images/gen2/ui/stats.svg)"></div>
                        <div class="colored-image ds" :style="`filter: saturate(${ui_saturation}) drop-shadow(0px 0px 1px #000000)`" style="--url: url(images/gen2/ui/moveset.svg)"></div>
                    </div>
                    <img v-if="ui_stats_styling == '2023'" class="exp_background" src="images/gen2/exp_bar/exp_bar.webp">
                    <img v-if="ui_stats_styling == '2023'" class="exp_label_box" src="images/gen2/exp_bar/exp_label.webp">
                    <div v-if="ui_stats_styling == '2023'" class="exp_growthRate">{{ growthRate(dexDataCrystal[starter].growth_rate) }}</div>
                    
                    <div v-if="shuckie_timer == true" class="gametime">
                        <live-text class="gametimeClock" source="shuckie_clock" :style="timer_frame_live ? 'visibility: hidden' : null"></live-text>
                        <live-text class="gametimeFrames" source="shuckie_frames" :style="timer_frame_live ? 'visibility: hidden' : null"></live-text>
                    </div>
                    <div v-else="" class="gametime">
                        <live-text class="gametimeClock" source="timer_clock" :style="timer_frame_live ? 'visibility: hidden' : null"></live-text>
                        <live-text class="gametimeFrames" source="timer_frames" :style="timer_frame_live ? 'visibility: hidden' : null"></live-text>
                    </div>
                    <!-- The clock in its own process (core/overlay/ClockFrame.ts); the two above show until it is up. -->
                    <clock-frame :gen="2" @live="timer_frame_live = $event"></clock-frame>
                    <div class="colored-image ds" :style="hp_tracker_style" style="--url: url(images/gen2/ui/gamearea.svg)"></div>
                    <img v-show="kanto_badges == false" class="canvas" src="images/gen2/elements/badges_johto.webp">
                    <img v-show="kanto_badges == true" class="canvas" src="images/gen2/elements/badges_kanto.webp">
                    <img v-if="ui_stats_styling == '2024'" class="posAbs" style="z-index: 0;" :src="`images/gen2/ui/${ui_type_color_modifier}${ui_stat_arrangement_modifier}stat_values.svg`">
                </div>

            <!-- DEBUGGING -->
                <div class="debugging debugging1" style="z-index: 20000;">
                    <div>Game:</div>
                    <select v-model="game_selection" class="dropdownMenu dropdown_menu_column3">
                        <option>Crystal</option>
                        <option>Gold & Silver</option>
                    </select><br>
                    <br>
                    <button class="buttonStyle" @click="newRun">New Run</button><br>
                    <div>Timer:</div>
                    <button @click="pauseUnpauseTime()" class="buttonStyle">Pause/Resume</button><br>
                    <button class="buttonStyle" @click="set_timer">Set Timer</button><input type="text" class="inputContainer" style="width: 210px; text-align: right;" v-model="timer_startTimeOffset" placeholder="00:00:00.00">
                    <div v-if="release == false">
                        <table>
                            <tbody><tr><td>Show Advanced Settings:</td><td><input class="checkBoxStyle" type="checkbox" v-model="show_advanced_settings"></td></tr>
                            <tr v-if="show_advanced_settings"><td>Test Run:</td><td><input class="checkBoxStyle" type="checkbox" v-model="testRun"></td></tr>
                            <tr v-if="show_advanced_settings"><td>No increment:</td><td><input class="checkBoxStyle" type="checkbox" v-model="no_increment"></td></tr>
                            <tr v-if="show_advanced_settings"><td>Re-filming Mode:</td><td><input class="checkBoxStyle" type="checkbox" v-model="refilming_mode"></td></tr>
                            <tr v-if="show_advanced_settings"><td>Shuckie Timer:</td><td><input class="checkBoxStyle" type="checkbox" v-model="shuckie_timer"></td></tr>
                            <tr v-if="show_advanced_settings"><td>Shuckie Counters:</td><td><input class="checkBoxStyle" type="checkbox" v-model="shuckie_counters"></td></tr>
                            <tr v-if="show_advanced_settings"><td>Shuckie Bookmarks:</td><td><input class="checkBoxStyle" type="checkbox" v-model="shuckie_bookmarks"></td></tr>
                            <tr v-if="show_advanced_settings && refilming_mode"><td>Attempt Number:</td><td><input class="inputContainer" style="width: 50px; text-align: center;" type="text" v-model="refilmed_attempt"></td></tr>
                            <tr v-if="show_advanced_settings && refilming_mode"><td>Finish Number:</td><td> <input class="inputContainer" style="width: 50px; text-align: center;" type="text" v-model="refilmed_finish"></td></tr>
                            <tr v-if="show_advanced_settings"><td>Debugging:</td><td><input class="checkBoxStyle" type="checkbox" v-model="debugging"></td></tr>
                            <tr v-if="isInDevMode && show_advanced_settings && debugging" title="Dev only. Packaged builds always apply enemy sprite styles."><td>Enemy Sprite Styles:</td><td><input class="checkBoxStyle" type="checkbox" v-model="enemy_sprite_styles_enabled"></td></tr>
                            <tr v-if="isInDevMode && show_advanced_settings && debugging">
                                <td>Style Mode:</td>
                                <td>
                                    <button v-if="!style_mode_active" class="buttonStyle" style="font-size: 11px;" @click="enterStyleMode()" title="Iterate every species: Enter saves + advances, Backspace discards + steps back, Escape exits.">Start</button>
                                    <button v-else="" class="buttonStyle" style="font-size: 11px; color: #f44;" @click="exitStyleMode()">Exit</button>
                                </td>
                            </tr>
                            <tr v-if="isInDevMode && show_advanced_settings && debugging && style_mode_active">
                                <td colspan="2" style="font-size: 11px;">{{ style_mode_index + 1 }} / {{ style_mode_species_list.length }} — <strong>{{ styleModeCurrentSpecies() }}</strong></td>
                            </tr>
                            <tr v-if="show_advanced_settings"><td>Post-Battle Splits:</td><td><input class="checkBoxStyle" type="checkbox" v-model="automatic_post_battle_splits"></td></tr>
                            <tr><td>Show Bonk Counter:</td> <td><input class="checkBoxStyle" type="checkbox" v-model="bonk"></td></tr>
                            <tr><td>Show Repel Counter:</td><td><input class="checkBoxStyle" type="checkbox" v-model="repel_counter"></td></tr>
                        </tbody></table>
                    </div>
                    <br>
                    <button class="buttonStyle" @click="openFolder(`splits`, `Crystal`, starter, 'finishes')">Open Splits Folder</button>
                    <br>
                    <br>

                    <!-- Backport Importer -->
                    <div v-if="show_advanced_settings">
                        <div>Import Backports:<input class="checkBoxStyle" type="checkbox" v-model="show_backport_import"></div>
                        <div v-if="show_backport_import" style="padding: 4px 0;">
                            <div>Backports ASM:</div>
                            <input type="file" ref="backportsFile" accept=".asm" class="inputContainer" style="width: 210px;">
                            <div>Backport Moves ASM:</div>
                            <input type="file" ref="backportMovesFile" accept=".asm" class="inputContainer" style="width: 210px;">
                            <div>Display Name:</div>
                            <input type="text" class="inputContainer" style="width: 210px;" v-model="backport_pokemon_name" placeholder="Auto-detected from ASM">
                            <br>
                            <button class="buttonStyle" @click="importBackports">Import</button>
                            <div v-if="backport_import_status" style="font-size: 11px; margin-top: 4px; white-space: pre-wrap;">{{backport_import_status}}</div>
                        </div>
                        <br>
                    </div>

                    <!-- Style Settings Management -->
                    <!-- <div v-if="show_advanced_settings" style="margin-bottom: 10px; padding: 8px; border: 1px solid #444; border-radius: 4px;">
                        <div style="margin-bottom: 5px; font-weight: bold;">Style Settings</div>
                        <div v-if="isInDevMode" style="color: #4CAF50; font-size: 11px; margin-bottom: 5px;">
                            Development Mode - Changes save to defaults
                        </div>
                        <div v-else style="color: #888; font-size: 11px; margin-bottom: 5px;">
                            Production Mode - Changes save locally
                        </div>
                        <button v-if="isInDevMode" class="buttonStyle" @click="exportStyleSettingsAsDefaults()" style="font-size: 11px;">
                            Export All Settings as Defaults
                        </button>
                        <button class="buttonStyle" @click="resetCurrentPokemonToDefaults()" style="font-size: 11px;">
                            Reset Current Pokemon to Defaults
                        </button>
                        <button class="buttonStyle" @click="resetAllStyleSettingsToDefaults()" style="font-size: 11px; color: #f44;">
                            Reset ALL to Defaults
                        </button>
                    </div> -->

                    <div>Pokemon Editor:<input class="checkBoxStyle" type="checkbox" v-model="editor"></div>
                    <div v-if="editor">
                        <div>Moveset Updating:</div>
                        <input type="text" class="inputContainer" v-model="move1_replacement" placeholder="Input move 1"><br>
                        <input type="text" class="inputContainer" v-model="move2_replacement" placeholder="Input move 2"><br>
                        <input type="text" class="inputContainer" v-model="move3_replacement" placeholder="Input move 3"><br>
                        <input type="text" class="inputContainer" v-model="move4_replacement" placeholder="Input move 4"><br>
                        <button class="buttonStyle buttonStyle_column3" @click="update_moveset">Update Party Moves</button>
                        <button class="buttonStyle buttonStyle_column3" @click="update_battle_moveset">Update Battle Moves</button>
                        <br>
                        <br>
                        <div>Pokemon Recalculator:<input class="checkBoxStyle" type="checkbox" v-model="pokemon_recalculator"></div>
                        <br>
                        <div v-if="!pokemon_recalculator">
                            <div>Item Updating:</div>
                            <input type="text" class="inputContainer" v-model="item1_replacement" placeholder="Input item 1"><br>
                            <input type="text" class="inputContainer" v-model="item2_replacement" placeholder="Input item 2"><br>
                            <input type="text" class="inputContainer" v-model="item3_replacement" placeholder="Input item 3"><br>
                            <input type="text" class="inputContainer" v-model="item4_replacement" placeholder="Input item 4"><br>
                            <button class="buttonStyle buttonStyle_column3" @click="update_items">Update</button>
                            <br>
                            <br>
                            <div>DV Updating for HP:</div>
                            <input style="width: 30px;" type="text" class="inputContainer" v-model="dv_atk_replacement" placeholder="Atk">
                            <button style="width: 80px;" class="buttonStyle buttonStyle_column3" @click="update_atk">Set Atk</button>
                            <br>
                            <input style="width: 30px;" type="text" class="inputContainer" v-model="dv_def_replacement" placeholder="Def">
                            <button style="width: 80px;" class="buttonStyle buttonStyle_column3" @click="update_def">Set Def</button>
                            <br>
                            <br>
                        </div>
                        <div v-if="pokemon_recalculator">
                            <div>Update Pokemon:</div>
                            Level:<input style="width: 40px;" type="text" class="inputContainer" v-model="recalculate_level" placeholder="Level">
                            <br>
                            <div>Stat Experience Updating:</div>
                            <input style="width: 100px;" type="text" class="inputContainer" v-model="stat_exp_hp_replacement" placeholder="HP">{{this.game.properties.player.team[0].statExpHp.value}}<br>
                            <input style="width: 100px;" type="text" class="inputContainer" v-model="stat_exp_atk_replacement" placeholder="Atk">{{this.game.properties.player.team[0].statExpAttack.value}}<br>
                            <input style="width: 100px;" type="text" class="inputContainer" v-model="stat_exp_def_replacement" placeholder="Def">{{this.game.properties.player.team[0].statExpDefense.value}}<br>
                            <input style="width: 100px;" type="text" class="inputContainer" v-model="stat_exp_spc_replacement" placeholder="Spc">{{this.game.properties.player.team[0].statExpSpecial.value}}<br>
                            <input style="width: 100px;" type="text" class="inputContainer" v-model="stat_exp_spe_replacement" placeholder="Spe">{{this.game.properties.player.team[0].statExpSpeed.value}}<br>
                            <button style="width: 80px;" class="buttonStyle buttonStyle_column3" @click="update_pokemon">Update</button><br>
                        </div>
                    </div>
                    <br>
                    <div v-if="release == false && debugging && show_advanced_settings && !editor">
                        <div>Debugging:</div>
                        <br>
                        <table>
                            <tbody><tr><td>State:</td>        <td>{{g2stateVariable}}</td></tr>
                            <tr><td>hChosenStarter:</td>  <td>{{game.properties.patch.hChosenStarter}}</td></tr>
                            <tr><td>wEarlyEncounters:</td>  <td>{{game.properties.patch.wEarlyEncounters}}</td></tr>
                            <tr><td>Held Item:</td>  <td>{{get_held_item}}</td></tr>
                            <tr><td>svgColorClass:</td>  <td>{{svgColorClass(speed_comparison(0, game.properties.battle.trainer.team[0]?.speed).comparison, game.properties.battle.trainer.team[0])}}</td></tr>
                            <tr><td>Speed Comparison:</td>  <td>{{speed_comparison(0, game.properties.battle.trainer.team[0]?.speed).comparison, game.properties.battle.trainer.team[0]}}</td></tr>
                            <tr><td>bonks:</td>  <td>{{game.properties.patch.steps.bonks.value}}</td></tr>
                            <tr><td>Enemy State:</td>  <td>{{enemyState}}</td></tr>
                            <tr><td>Run Complete:</td>  <td>{{run_complete}}</td></tr>
                            <tr><td>Kanto Badges:</td>  <td>{{kanto_badges}}</td></tr>
                            <tr><td>Move1:</td><td>{{move_name(camelCase(s1.move1.value))}}</td></tr>
                            <tr><td>Move2:</td><td>{{move_name(camelCase(s1.move2.value))}}</td></tr>
                            <tr><td>Move3:</td><td>{{move_name(camelCase(s1.move3.value))}}</td></tr>
                            <tr><td>Move4:</td><td>{{move_name(camelCase(s1.move4.value))}}</td></tr>
                            <tr><td>pokemon_gender_list:</td><td>{{pokemon_gender_list}}</td></tr>
                        </tbody></table>
                    </div>
                </div>
                <div class="debugging debugging2" style="z-index: 20000;">
                    <div>Solo Pokemon:</div>
                    <select v-model="starter" @change="load_pokemon_sprite_settings(s1dynamicReset.species.value)" class="dropdownMenu dropdown_menu_column3" style="background-color: rgb(201, 199, 100)">
                        <option disabled="" value="">Select a species</option>
                        <option v-for="key in filtered_pokemon_list" :value="`${key}`">{{key}}</option>
                    </select><br>
                    <div>Search Pokemon:</div>
                    <input type="text" class="inputContainer" v-model="search_term" placeholder="Search for a species">
                    <!-- <button class="buttonStyle" @click="set_rom_starter">Set ROM Starter</button> -->
                    <button class="buttonStyle" @click="load_splits()">Load replay / split file to compare</button><br>
                    <div v-if="previous_splits_source" style="font-size: 12px;">Comparing against: {{ previous_splits_source }}</div>
                    <table>
                        <tbody><tr>
                            <td>Previous:</td>
                            <td><input type="text" class="inputContainer" style="width: 100px;" v-model="previous_label" placeholder="Previous"></td>
                        </tr>
                        <tr>
                            <td>Current:</td>
                            <td><input type="text" class="inputContainer" style="width: 100px;" v-model="current_label" placeholder="Current"></td>
                        </tr>
                    </tbody></table>
                    <table>
                        <tbody><tr>
                            <td>Attempt Number:</td>
                            <td>{{attempt_number}}</td>
                            <td><button @click="increment('attempt_number')" class="smallButtonStyle increment">+</button></td>
                            <td><button @click="decrement('attempt_number')" class="smallButtonStyle2 decrement">-</button></td>
                        </tr>
                        <tr>
                            <td>Finish Number:</td>
                            <td>{{finished_run_count}}</td>
                            <td><button @click="increment('finished_run_count')" class="smallButtonStyle increment">+</button></td>
                            <td><button @click="decrement('finished_run_count')" class="smallButtonStyle2 decrement">-</button></td>
                        </tr>
                        <tr>
                            <td>Resets:</td>
                            <td>{{playerResets}}</td>
                            <td><button @click="increment('playerResets')" class="smallButtonStyle increment">+</button></td>
                            <td><button @click="decrement('playerResets')" class="smallButtonStyle2 decrement">-</button></td>
                        </tr>
                        <tr>
                            <td>Blackouts:</td>
                            <td>{{blackout_counter}}</td>
                            <td><button @click="increment('blackout_counter')" class="smallButtonStyle increment">+</button></td>
                            <td><button @click="decrement('blackout_counter')" class="smallButtonStyle2 decrement">-</button></td>
                        </tr>
                        <tr>
                            <td>Faults:</td>
                            <td>{{playerResets + blackout_counter}}</td>
                        </tr>
                    </tbody></table>
                    <br>
                    <div class="demo">
                        <!-- In Manual the Attack DV field decides the gender (the readout below the fields says which). -->
                        <div v-if="dv_mode == 'Automatic'">
                        <div>Gender:</div>
                        <select v-model="pokemon_gender" class="dropdownMenu dropdown_menu_column3">
                            <option v-for="key in pokemon_gender_list" :value="`${key}`">{{key}}</option>
                        </select>
                        <div style="opacity: .7;">Ratio: {{pokemon_gender_ratio}}</div>
                        <br>
                        </div>
                        <div>DVs:</div>
                        <select v-model="dv_mode" class="dropdownMenu dropdown_menu_column3">
                            <option>Automatic</option>
                            <option>Manual</option>
                        </select>
                        <div v-if="dv_mode == 'Automatic'">
                        <div>Hidden Power:</div>
                        <select v-model="hpType" class="dropdownMenu dropdown_menu_column3">
                            <option>Dark</option>
                            <option>Ice</option>
                            <option>Ground</option>
                            <option>Rock</option>
                            <option>Psychic</option>
                            <option>Flying</option>
                            <option>Fire</option>
                            <option>Electric</option>
                            <option>Water</option>
                            <option>Dragon</option>
                            <option>Ghost</option>
                            <option>Bug</option>
                            <option>Grass</option>
                            <option>Steel</option>
                            <option>Poison</option>
                            <option>Fighting</option>
                        </select>
                        <table style="opacity: .7;">
                            <tbody><tr><td>HP: </td><td style="padding-left: 3px;">{{hpDv(currentHpDVs.atk, currentHpDVs.def, 15, 15)}}</td><td style="padding-left: 18px;">Spe:</td><td style="padding-left: 3px;">15</td></tr>
                            <tr><td>Atk:</td><td style="padding-left: 3px;">{{currentHpDVs.atk}}</td>                                                      <td style="padding-left: 18px;">Spc:</td><td style="padding-left: 3px;">15</td></tr>
                            <tr><td>Def:</td><td style="padding-left: 3px;">{{currentHpDVs.def}}</td>                                                              </tr>
                        </tbody></table>
                        <div style="opacity: .7;">Base Power: {{currentHpPower}}</div>
                        </div>
                        <div v-else>
                        <table>
                            <tbody><tr><td>Atk:</td><td style="padding-left: 3px;"><input style="width: 30px;" type="text" class="inputContainer manual_dv_input" :value="manual_dvs.atk" @change="set_manual_dv('atk', $event)"></td><td style="padding-left: 18px;">Spe:</td><td style="padding-left: 3px;"><input style="width: 30px;" type="text" class="inputContainer manual_dv_input" :value="manual_dvs.spe" @change="set_manual_dv('spe', $event)"></td></tr>
                            <tr><td>Def:</td><td style="padding-left: 3px;"><input style="width: 30px;" type="text" class="inputContainer manual_dv_input" :value="manual_dvs.def" @change="set_manual_dv('def', $event)"></td><td style="padding-left: 18px;">Spc:</td><td style="padding-left: 3px;"><input style="width: 30px;" type="text" class="inputContainer manual_dv_input" :value="manual_dvs.spc" @change="set_manual_dv('spc', $event)"></td></tr>
                            <tr><td>HP: </td><td style="padding-left: 3px;">{{starterDVs.hp}}</td></tr>
                        </tbody></table>
                        <div style="opacity: .7;">Hidden Power: {{manualHiddenPower.type}} ({{manualHiddenPower.power}})</div>
                        <div style="opacity: .7;">Gender from Atk DV: {{manualGender}}</div>
                        </div>
                    </div>
                    <br>
                    <div>Encounter Settings:</div>
                    <table>
                        <tbody><tr><td>Encounters:</td><td><input class="checkBoxStyle" type="checkbox" v-model="toggle_wEarlyEncounters"></td></tr>
                        <tr><td>Guaranteed Catches:</td><td><input class="checkBoxStyle" type="checkbox" v-model="toggle_wGuaranteedCatches"></td></tr>
                    </tbody></table>
                    <table>
                        <tbody><tr><td>Route 29</td>     <td>- Sentret:</td>      <td><input class="checkBoxStyle" type="checkbox" v-model="toggle_EVENT_ENCOUNTER_ROUTE_29_SENTRET"></td></tr>
                        <tr><td>Route 31</td>     <td>- Bellsprout:</td>   <td><input class="checkBoxStyle" type="checkbox" v-model="toggle_EVENT_ENCOUNTER_ROUTE31_BELLSPROUT"></td></tr>
                        <tr><td>Route 32</td>     <td>- Bellsprout:</td>   <td><input class="checkBoxStyle" type="checkbox" v-model="toggle_EVENT_ENCOUNTER_ROUTE32_BELLSPROUT"></td></tr>
                        <tr><td>Union Cave</td>   <td>- Sandshrew:</td>    <td><input class="checkBoxStyle" type="checkbox" v-model="toggle_EVENT_ENCOUNTER_UNION_CAVE_SANDSHREW"></td></tr>
                        <tr><td>Ilex Forest</td>  <td>- Psyduck:</td>      <td><input class="checkBoxStyle" type="checkbox" v-model="toggle_EVENT_ENCOUNTER_ILEX_FOREST_PSYDUCK"></td></tr>
                        <tr><td>Ilex Forest</td>  <td>- Oddish:</td>       <td><input class="checkBoxStyle" type="checkbox" v-model="toggle_EVENT_ENCOUNTER_ILEX_FOREST_ODDISH"></td></tr>
                        <tr><td>Route 34</td>     <td>- Abra:</td>         <td><input class="checkBoxStyle" type="checkbox" v-model="toggle_EVENT_ENCOUNTER_ROUTE34_ABRA"></td></tr>
                        <tr><td>National Park</td><td>- Psyduck:</td>      <td><input class="checkBoxStyle" type="checkbox" v-model="toggle_EVENT_ENCOUNTER_NATIONAL_PARK_PSYDUCK"></td></tr>
                        <tr><td>Olivine City</td> <td>- Krabby:</td>       <td><input class="checkBoxStyle" type="checkbox" v-model="toggle_EVENT_ENCOUNTER_OLIVINE_CITY_KRABBY"></td></tr>
                        <tr><td>Violet City</td>  <td>- Poliwag:</td>      <td><input class="checkBoxStyle" type="checkbox" v-model="toggle_EVENT_ENCOUNTER_VIOLET_CITY_POLIWAG"></td></tr>
                        <tr><td>Ecruteak City</td><td>- Poliwag:</td>      <td><input class="checkBoxStyle" type="checkbox" v-model="toggle_EVENT_ENCOUNTER_ECRUTEAK_CITY_POLIWAG"></td></tr>
                    </tbody></table>
                    <br>
                    <table>
                        <tbody><tr><td>Return Base Power:</td> <td style="text-align: right;">{{g2ReturnPowerCalc(game.properties.player.team[0])}}</td></tr>
                        <tr><td>Player Party Count:</td><td style="text-align: right;">{{game.properties.player.teamCount.value > 6 ? 0 : game.properties.player.teamCount.value}}</td></tr>
                        <tr><td>Overworld HP:</td>      <td style="text-align: right;">{{game.properties.player.team[0].hp.value}} / {{game.properties.player.team[0].maxHp.value}}</td></tr>
                        <tr><td>Status:</td>            <td style="text-align: right;">{{game.properties.player.team[0].statusCondition.value == null ? 'None' : game.properties.player.team[0].statusCondition.value}}</td></tr>
                    </tbody></table>
                    <div>Stat Experience:</div>
                    <table>
                        <tbody><tr>
                            <td>HP:</td> 
                            <td style="padding-left: 5px;">{{game.properties.player.team[0].statExpHp.value}}</td>     
                            <td style="text-align: right; opacity: .7;">({{statExp(game.properties.player.team[0].statExpHp.value)}})</td>    
                            
                            <td style="padding-left: 20px;">Spe:</td>
                            <td style="padding-left: 5px;">{{game.properties.player.team[0].statExpSpeed.value}}</td>
                            <td style="padding-left: 5px; text-align: right; opacity: .7;">({{statExp(game.properties.player.team[0].statExpSpeed.value)}})</td>    
                        </tr>
                        <tr>
                            <td>Atk:</td>
                            <td style="padding-left: 5px;">{{game.properties.player.team[0].statExpAttack.value}}</td> 
                            <td style="text-align: right; opacity: .7;">({{statExp(game.properties.player.team[0].statExpAttack.value)}})</td>
                            
                            <td style="padding-left: 20px;">Spc:</td>
                            <td style="padding-left: 5px;">{{game.properties.player.team[0].statExpSpecial.value}}</td>
                            <td style="padding-left: 5px; text-align: right; opacity: .7;">({{statExp(game.properties.player.team[0].statExpSpecial.value)}})</td>
                        </tr>
                        <tr>
                            <td>Def:</td>
                            <td style="padding-left: 5px;">{{game.properties.player.team[0].statExpDefense.value}}</td>
                            <td style="padding-left: 5px; text-align: right; opacity: .7;">({{statExp(game.properties.player.team[0].statExpDefense.value)}})</td>
                        </tr>
                    </tbody></table>
                </div>
                <div class="debugging debugging3" style="z-index: 20000;">
                    <div>Stats:</div>
                    <select v-model="stats_setting" class="dropdownMenu">
                        <option>Automatic</option>
                        <option>Badge Boosts</option>
                        <option>Base Stats</option>
                        <option>DVs</option>
                        <option>EVs</option>
                        <option>Vitamins</option>
                        <option>Detailed EVs</option>
                    </select>
                    <br>
                    <br>
                    Right UI:<br>
                    <select v-model="right_panel" class="dropdownMenu">
                        <option>Battle Graphic</option>
                        <!-- <option>Inventory</option> -->
                        <option>Movepool</option>
                        <option>Splits</option>
                        <option>Trainers</option>
                    </select>
                    <br>
                    <div>Unobtainable Moves:</div>
                    <select v-model="unobtainable_moves_toggle" class="dropdownMenu">
                        <option>Never Cross Out</option>
                        <option>Cross Out When Starter is Obtained</option>
                        <option>Cross Out After First Badge</option>
                        <option>Always Cross Out</option>
                    </select><br>
                    Splits:<br>
                    <select v-model="toggle_compare_splits" class="dropdownMenu">
                        <option>First</option>
                        <option>Followup</option>
                        <option>Followup + Summary</option>
                    </select>
                    <br>
                    <br>
                    <div>UI Color:</div>
                    <button @click="color_picker" class="buttonStyle">Color Picker</button><br>
                    Saturation: <input type="range" min="0" max="2" step="0.1" v-model="ui_saturation"><br>
                    <br>
                    <div>Pokemon Image Settings</div>
                    <table>
                        <tbody><tr><td>X-Offset:   </td><td><input type="range" min="-600" max="600" v-model="imageXOffset"></td></tr>
                        <tr><td>Y-Offset:   </td><td><input type="range" min="-600" max="600" v-model="imageYOffset"></td></tr>
                        <tr><td>Scale:      </td><td><input type="range" min="0.2" max="2.5" step="0.01" v-model="imageScale"></td></tr>
                        <tr><td>Saturation: </td><td><input type="range" min="90" max="150" step="1" v-model="imageSat"></td></tr>
                        <tr><td>Flip:       </td><td><input class="checkBoxStyle" type="checkbox" v-model="imageFlip"></td></tr>
                    </tbody></table>
                    <br>
                    <div v-if="show_advanced_settings">
                        <div>Pokeball Floor:</div>
                        X-Offset: <input type="range" min="-400" max="400" v-model="pokeball_translateX"><br>
                        Y-Offset: <input type="range" min="-400" max="400" v-model="pokeball_translateY"><br>
                        <br>
                    </div>
                    <div>Background Texture:</div>
                    <select v-model="backgroundTexture" class="dropdownMenu">
                        <option v-for="key in dropdownDownMenuKeys.textures" :key="key" :value="key">
                            {{ key }}
                        </option>
                    </select><br>
                    <table>
                        <tbody><tr><td>X-Offset:   </td><td><input type="range" min="-325" max="325" v-model="backgroundXOffset"></td></tr>
                        <tr><td>Y-Offset:   </td><td><input type="range" min="-325" max="325" v-model="backgroundYOffset"></td></tr>
                        <tr><td>Scale:      </td><td><input type="range" min="100" max="200" v-model="backgroundScale"></td></tr>
                        <tr><td>Brightness: </td><td><input type="range" min="0" max="200" v-model="backgroundBrightness"></td></tr>
                        <tr><td>Contrast:   </td><td><input type="range" min="0" max="200" v-model="backgroundContrast"></td></tr>
                        <tr><td>Saturation: </td><td><input type="range" min="0" max="200" v-model="backgroundSaturation"></td></tr>
                        <tr><td>Blur:       </td><td><input type="range" min="0" max="10" v-model="backgroundBlur"></td></tr>
                        <tr><td>Hue:        </td><td><input type="range" min="0" max="358" v-model="backgroundHue"></td></tr>
                    </tbody></table>
                    <table>
                        <tbody><tr><td style="padding-right: 46px;">Flip</td><td>X:</td><td style="padding-right: 12px;"><input class="checkBoxStyle" type="checkbox" v-model="backgroundFlip"></td><td>Y:</td><td><input class="checkBoxStyle" type="checkbox" v-model="backgroundXFlip"></td></tr>
                    </tbody></table>
                    <br>
                    <div v-if="right_panel == 'Trainers'">
                        <div>Search Trainers:</div>
                        <input type="text" v-model="search_trainers" placeholder="Search for a trainer">
                        <div>Trainer:</div>
                        <select v-model="examined_trainer" class="dropdownMenu">
                            <option v-for="trainer in filtered_trainer_list" :key="trainer" :value="trainer">{{ trainer }}</option>
                        </select><br>
                    </div>
                    <br>
                </div>
                <div class="debugging debugging4" style="z-index: 20000;">
                    <div>Candies:</div>
                    <table>
                        <tbody><tr>
                            <td><span :class="rareCandyStatusClass('olivine_lighthouse_5f_rare_candy')">Lighthouse</span></td>
                        </tr>
                        <tr>
                            <td><span :class="rareCandyStatusClass('lake_of_rage_hidden_rare_candy')">Lake of Rage</span></td>
                        </tr>
                        <tr>
                            <td><span :class="rareCandyStatusClass('violet_city_rare_candy')">Violet</span></td>
                        </tr>
                        <tr>
                            <td><span :class="rareCandyStatusClass('route_34_hidden_rare_candy')">Goldenrod</span></td>
                        </tr>
                        <tr>
                            <td><span :class="rareCandyStatusClass('route_27_rare_candy')">Tohjo Falls</span></td>
                        </tr>
                        <tr>
                            <td><span :class="rareCandyStatusClass('mount_mortar_2f_inside_rare_candy')">Mt. Mortar</span></td>
                        </tr>
                        <tr>
                            <td><span :class="rareCandyStatusClass('whirl_island_b1f_hidden_rare_candy')">Whirl Islands</span></td>
                        </tr>
                        <tr>
                            <td><span :class="rareCandyStatusClass('listened_to_fan_club_president')">Fan Club</span></td>
                        </tr>
                        <tr>
                            <td><span :class="rareCandyStatusClass('cinnabar_island_hidden_rare_candy')">Cinnabar</span></td>
                        </tr>
                        <tr>
                            <td><span :class="rareCandyStatusClass('route_28_hidden_rare_candy')">Mt. Silver</span></td>
                        </tr>
                    </tbody></table>
                </div>

            <!-- Badges -->
                <div v-show="g2stateVariable != 'Base Stats'">
                    <div v-show="kanto_badges == false">
                        <div v-for="badge in progressBadges">
                            <transition name="fade"><img v-show="game.properties.player.badges[badge].value == true" :src="`images/gen2/badges/progress bar/${badge}.webp`" class="canvas"></transition>
                        </div>
                    </div>
                    <div v-show="kanto_badges == true">
                        <div v-for="badge in progressBadges2">
                            <transition name="fade"><img v-show="game.properties.player.badges[badge].value == true" :src="`images/gen2/badges/progress bar/${badge}.webp`" class="canvas"></transition>
                        </div>
                    </div>
                </div>

            <!-- TYPE ICONS -->
                <transition name="fade1">
                    <div v-if="!run_complete" class="typeIconContainer">
                        <img v-show="typeIcons == true" class="type1" :src="`images/gen2/type-icons/${ui_type_icons_modifier}${type1().toLowerCase()}.webp`">
                        <img v-show="typeIcons == true && type1() != type2()" class="type1" :src="`images/gen2/type-icons/${ui_type_icons_modifier}${type2().toLowerCase()}.webp`">
                    </div>
                </transition>
                
            <!-- BADGE ICONS -->
                <div v-if="display_badge_boosts == true" class="statsContainer">          
                    <img v-show="map.player.badges.badge1.value === true" class="badgeBoostAtk" :src="badgeGraphic(map.player.badges.badge1)">
                    <img v-show="map.player.badges.badge3.value === true" :class="`${ui_stat_arrangement_modifier}badgeBoostSpd`" :src="badgeGraphic(map.player.badges.badge3)">                    
                    <img v-show="map.player.badges.badge6.value === true" class="badgeBoostDef" :src="badgeGraphic(map.player.badges.badge6)">                    
                    <img v-show="map.player.badges.badge7.value === true" :class="`${ui_stat_arrangement_modifier}badgeBoostSpcA`" :src="badgeGraphic(map.player.badges.badge7)">      
                    <img v-show="map.player.badges.badge7.value === true && g2spcDefCheck() === `Boost`" :class="`${ui_stat_arrangement_modifier}badgeBoostSpcD`" :src="badgeGraphic(map.player.badges.badge7)">      
                </div>  

            <!-- STATS OVERLAY GRAPHIC  -->
                <div class="stats_header">{{stats_header}}</div>
                <div class="growth_rate">{{growth_rate}}</div>
                <div class="statsContainer" id="stats">
                <div v-show="expBarToggle == true" class="expBar">
                    <div v-if="g2stateVariable == `Base Stats`" class="posAbs exp_label_2024">Exp:</div>
                    <div v-if="g2stateVariable != `Base Stats`" class="posAbs exp_label_2024">{{decimalToPercentage(calcExpStats(growthRate(dexDataCrystal[starter].growth_rate), game.properties.player.team[0].expPoints.value).percent)}}%</div>
                    <div class="posAbs expMeterStyle expMeterOuter_2024"><div class="expMeterStyle expMeterInner_2024" ref="expBar"></div></div>
                </div>
                <!--  New Stats -->
                <div style="z-index: 200;">
                    <div class="stats_container"> 
                        <div v-for="stat in stat_object">
                            <div v-if="stat.name != 'Hp' && g2stateVariable == 'Battle'">
                                <div :class="`mod_style ${ui_stat_arrangement_modifier}mod_${stat.mod_abrv}`" style="font-family: play;">{{ stageModifiers(batp()[`modStage${stat.mod_path}`]) }}</div>
                            </div>
                            <div v-if="stats_setting != 'Vitamins'" :style="{ opacity: statLabelOpacity()[stat.name]}" :class="`stat_label_style stat_row_${stat[`${ui_stat_arrangement_modifier}label_row`]} stat_column_${stat.label_column}`">{{stat.label}}</div>
                            <div v-else="" :style="{ opacity: statLabelOpacity()[stat.name]}" :class="`stat_label_style stat_row_${stat[`${ui_stat_arrangement_modifier}label_row`]} stat_column_${stat.label_column}`">{{stat.vitamin}}</div>
                            
                            <div v-if="stats_setting == 'Base Stats'" :class="`stat_value_style stat_row_${stat[`${ui_stat_arrangement_modifier}value_row`]} stat_column_${stat.value_column}`">{{dexDataCrystal[starter][stat.base_stat_path]}}</div>
                            <div v-if="stats_setting == 'DVs'" :class="`stat_value_style stat_row_${stat[`${ui_stat_arrangement_modifier}value_row`]} stat_column_${stat.value_column} dv`">{{get_dv(`${stat.name}`)}}/15</div>
                            <div v-if="stats_setting == 'EVs'" :class="`stat_value_style stat_row_${stat[`${ui_stat_arrangement_modifier}value_row`]} stat_column_${stat.value_column} evs`">{{game.properties.player.team[0][`statExp${stat.name_stat_exp}`].value}}</div>
                            <div v-if="stats_setting == 'Vitamins'" :class="`stat_value_style stat_row_${stat[`${ui_stat_arrangement_modifier}value_row`]} stat_column_${stat.value_column} evs`">{{statExp(game.properties.player.team[0][`statExp${stat.name_stat_exp}`].value)}}</div>
                            <div v-if="stats_setting == 'Automatic'" :class="`stat_value_style stat_row_${stat[`${ui_stat_arrangement_modifier}value_row`]} stat_column_${stat.value_column}`">{{get_stat(`${stat.name}`)}}</div>

                            <div v-if="stats_setting == 'Hidden Power'" :class="`stat_value_style detailed_ev_stat_row_${stat[`${ui_stat_arrangement_modifier}value_row`]} stat_column_${stat.value_column} devs`">Lv60: {{calculate_stat(starter, 60)[stat.abrv]}}</div>
                            <div v-if="stats_setting == 'Hidden Power'" :class="`stat_value_style detailed_ev_stat_row_${stat[`${ui_stat_arrangement_modifier}value_row`]} stat_column_${stat.value_column} percentage_evs`">Lv70: {{calculate_stat(starter, 70)[stat.abrv]}}</div>
                            <div v-if="stats_setting == 'Hidden Power'" :class="`stat_value_style detailed_ev_stat_row_${stat[`${ui_stat_arrangement_modifier}value_row`]} stat_column_${stat.value_column} ev_stats_gained`">Lv80: {{calculate_stat(starter, 80)[stat.abrv]}}</div>
                            
                            <div v-if="stats_setting == 'Detailed EVs'" :class="`stat_value_style detailed_ev_stat_row_${stat[`${ui_stat_arrangement_modifier}value_row`]} stat_column_${stat.value_column} devs`">{{game.properties.player.team[0][`statExp${stat.name_stat_exp}`].value}}/65535</div>
                            <div v-if="stats_setting == 'Detailed EVs'" :class="`stat_value_style detailed_ev_stat_row_${stat[`${ui_stat_arrangement_modifier}value_row`]} stat_column_${stat.value_column} percentage_evs`">{{decimalToPercentage(game.properties.player.team[0][`statExp${stat.name_stat_exp}`].value / 65535) }}%</div>
                            <div v-if="stats_setting == 'Detailed EVs'" :class="`stat_value_style detailed_ev_stat_row_${stat[`${ui_stat_arrangement_modifier}value_row`]} stat_column_${stat.value_column} ev_stats_gained`">Stats: {{Math.floor(Math.sqrt(game.properties.player.team[0][`statExp${stat.name_stat_exp}`].value) / 4)}}</div>
                            
                            <div v-if="stats_setting == 'Badge Boosts'" :class="`stat_value_style detailed_ev_stat_row_${stat[`${ui_stat_arrangement_modifier}value_row`]} stat_column_${stat.value_column} devs`">Stat: {{game.properties.player.team[0][stat.path].value}}</div>
                            <div v-if="stats_setting == 'Badge Boosts'" :class="`stat_value_style detailed_ev_stat_row_${stat[`${ui_stat_arrangement_modifier}value_row`]} stat_column_${stat.value_column} percentage_evs`">Boost: {{get_bb_stat(`${stat.name}`)}}</div>
                            <div v-if="stats_setting == 'Badge Boosts'" :class="`stat_value_style detailed_ev_stat_row_${stat[`${ui_stat_arrangement_modifier}value_row`]} stat_column_${stat.value_column} ev_stats_gained`">Result: {{get_stat(`${stat.name}`)}}</div>
                        </div>
                    </div> 
                </div>
            </div>

            <!-- MOVESET -->
                <div class="movesetContainer">
                    <table>
                        <tbody><tr v-for="pkmnMove in pkmnMoves">
                            <th v-if="s1[pkmnMove].value">
                                <img v-show="g2stateVariable != `Battle` && moveTypeIcon(s1[pkmnMove].value) != null" class="movesetIcon" :src="moveTypeIcon(s1[pkmnMove].value)">
                                <img v-show="g2stateVariable == `Battle`" class="movesetIcon" :src="moveTypeIcon(batp()[pkmnMove].value)">
                            </th>
                            <th class="movesetName" v-if="s1[pkmnMove].value">
                                <div v-show="g2stateVariable != `Battle` && s1[pkmnMove].value != null">{{move_name(camelCase(s1[pkmnMove].value))}}</div>
                                <div v-show="g2stateVariable == `Battle` && game.properties.battle.yourPokemon[pkmnMove].value != null">{{move_name(camelCase(game.properties.battle.yourPokemon[pkmnMove].value))}}</div>
                            </th>
                            
                            <th v-if="s1[pkmnMove].value && damage_ranges == true">
                                <div v-show="g2stateVariable != `Battle`" class="moveset_damage_min" :key="typeEffectiveness(s1[pkmnMove].value)">N/A</div>
                                <div v-show="g2stateVariable == `Battle`" class="moveset_damage_min" :key="typeEffectiveness(game.properties.battle.yourPokemon[pkmnMove].value)">{{ damage_calculation(game.properties.battle.yourPokemon, game.properties.battle.enemyPokemon, s1[pkmnMove].value, "Player").damageMin }}-{{ damage_calculation(game.properties.battle.yourPokemon, game.properties.battle.enemyPokemon, s1[pkmnMove].value, "Player").damageMax }}</div>
                            </th>
                            <th v-if="s1[pkmnMove].value && damage_ranges == true" class="moveset_damage_min_percent">
                                <div v-show="g2stateVariable != `Battle` && s1[pkmnMove].value != null">N/A</div>
                                <div v-show="g2stateVariable == `Battle` && game.properties.battle.yourPokemon[pkmnMove].value != null">{{ damage_calculation(game.properties.battle.yourPokemon, game.properties.battle.enemyPokemon, s1[pkmnMove].value, "Player").minPercentage }}-{{ damage_calculation(game.properties.battle.yourPokemon, game.properties.battle.enemyPokemon, s1[pkmnMove].value, "Player").maxPercentage }}%</div>
                            </th>

                            <th v-if="s1[pkmnMove].value && damage_ranges == false">
                                <div v-show="g2stateVariable != `Battle`" class="movesetPower" :key="typeEffectiveness(s1[pkmnMove].value)">{{ typeEffectiveness(s1[pkmnMove].value) }}</div>
                                <div v-show="g2stateVariable == `Battle`" class="movesetPower" :key="typeEffectiveness(game.properties.battle.yourPokemon[pkmnMove].value)">{{ typeEffectiveness(game.properties.battle.yourPokemon[pkmnMove].value) }}</div>
                            </th>
                            <th v-if="s1[pkmnMove].value && damage_ranges == false" class="movesetAccuracy">
                                <div v-show="g2stateVariable != `Battle` && s1[pkmnMove].value != null">{{ moveAccuracyEvasionDynamic(s1[pkmnMove].value) }}%</div>
                                <div v-show="g2stateVariable == `Battle` && game.properties.battle.yourPokemon[pkmnMove].value != null">{{ moveAccuracyEvasionDynamic(game.properties.battle.yourPokemon[pkmnMove].value) }}%</div>
                            </th>
                            <th v-if="s1[pkmnMove].value && damage_ranges == false" class="movesetPP">
                                <div v-show="g2stateVariable != `Battle` && s1[pkmnMove].value != null">{{s1[pkmnMove + "pp"].value}}</div>
                                <div v-show="g2stateVariable == `Battle` && game.properties.battle.yourPokemon[pkmnMove].value != null">{{game.properties.battle.yourPokemon[pkmnMove.toString() + "pp"].value}}</div>
                            </th>
                        </tr>
                    </tbody></table>
                </div>

            <!--------- RIGHT BAR ---------------------------------------------------------------------------------------------------------------->
            <transition name="fade1">
                <!-- Style Mode (dev only): replaces the right panel with a dummy
                     slot-0 enemy graphic so every species can be styled. Layout
                     mirrors the live "Battle Graphic" (trainer) block below
                     (single slot) with dummy stats/moves so all surrounding
                     graphics render. -->
                <div v-if="isInDevMode && style_mode_active" key="style_mode" style="position: absolute;">
                    <div class="trainerLabel">{{ styleModeCurrentSpecies() }} {{ style_mode_index + 1 }}/{{ style_mode_species_list.length }}</div>
                    <div class="colored-image" :style="`height: 242px; filter: saturate(${ui_saturation}) drop-shadow(0px 0px 1px #000000)`" style="--url: url(images/gen2/ui/opponent.svg)"></div>
                    <img class="canvas red-svg" :src="`images/gen2/ui/speed_comp/0.svg`">
                    <div class="enemyGraphic">
                        <div class="ePkmnStyle ePkmn1">
                            <img class="ePkmnSprite ePkmnSpriteResizing" :data-enemy-slot="0" :data-enemy-species="styleModeCurrentSpecies()" :style="{ transform: enemyTransformFor(styleModeCurrentSpecies()), filter: `drop-shadow(${getEnemySpriteFlipped(styleModeCurrentSpecies()) ? -2 : 2}px 2px 2px #000) saturate(1.3)` }" :src="`images/gen2/pokemon/${styleModeCurrentSpecies()}.webp`">
                            <div class="ePkmnSpecies opacityTransition">{{ styleModeCurrentSpecies() }}</div>
                            <img class="enemyStatsArea" :src="`images/gen2/stats/0.svg`">
                            <img class="ePkmnTypeIcons ePkmnType_1 ds opacityTransition" :src="`images/gen2/type-icons-circular/${dexDataCrystal[styleModeCurrentSpecies()]?.type_1?.toLowerCase()}.webp`">
                            <img v-if="dexDataCrystal[styleModeCurrentSpecies()]?.type_1 != dexDataCrystal[styleModeCurrentSpecies()]?.type_2" class="ePkmnTypeIcons ePkmnType_2 ds opacityTransition" :src="`images/gen2/type-icons-circular/${dexDataCrystal[styleModeCurrentSpecies()]?.type_2?.toLowerCase()}.webp`">
                            <!-- Moves -->
                            <img v-for="(dummy, i) in style_mode_dummy_moves" :class="`ds eMoveIconStyle moveIcon${i + 1} opacityTransition`" :src="`images/gen2/type-icons-circular/${dummy.type}.webp`">
                            <div v-for="(dummy, i) in style_mode_dummy_moves" :class="`ePkmnMoveStyle ePkmnMove${i + 1} opacityTransition`">{{ dummy.name }}</div>
                            <!-- Level -->
                            <div class="ePkmnLevel opacityTransition">Lv:50</div>
                            <!-- Stat Labels -->
                            <div class="ePkmnStatLabelStyle ePkmnLabelHp  opacityTransition" style="opacity: .7;">HP</div>
                            <div class="ePkmnStatLabelStyle ePkmnLabelAtk opacityTransition" style="opacity: .7;">Atk.</div>
                            <div class="ePkmnStatLabelStyle ePkmnLabelDef opacityTransition" style="opacity: .7;">Def.</div>
                            <div class="ePkmnStatLabelStyle ePkmnLabelSpA opacityTransition" style="opacity: .7;">SpA.</div>
                            <div class="ePkmnStatLabelStyle ePkmnLabelSpD opacityTransition" style="opacity: .7;">SpD.</div>
                            <div class="ePkmnStatLabelStyle ePkmnLabelSpe opacityTransition" style="opacity: .7;">Spe.</div>
                            <!-- Base Stats (dummy values from dexDataCrystal) -->
                            <div class="ePkmnStatsStyle ePkmnHp  opacityTransition">{{ dexDataCrystal[styleModeCurrentSpecies()]?.base_hp      ?? 100 }}</div>
                            <div class="ePkmnStatsStyle ePkmnAtk opacityTransition">{{ dexDataCrystal[styleModeCurrentSpecies()]?.base_atk     ?? 50 }}</div>
                            <div class="ePkmnStatsStyle ePkmnDef opacityTransition">{{ dexDataCrystal[styleModeCurrentSpecies()]?.base_def     ?? 50 }}</div>
                            <div class="ePkmnStatsStyle ePkmnSpA opacityTransition">{{ dexDataCrystal[styleModeCurrentSpecies()]?.base_spc_atk ?? 50 }}</div>
                            <div class="ePkmnStatsStyle ePkmnSpD opacityTransition">{{ dexDataCrystal[styleModeCurrentSpecies()]?.base_spc_def ?? 50 }}</div>
                            <div class="ePkmnStatsStyle ePkmnSpe opacityTransition">{{ dexDataCrystal[styleModeCurrentSpecies()]?.base_spd     ?? 50 }}</div>
                        </div>
                    </div>
                </div>
                <div v-else-if="right_panel == 'Movepool'" key="1">
                    <table class="movepoolDemo" cellspacing="0" :style="customFormats()">
                        <tbody><tr :style="{'background-color': `var(--${ui_type_color_modifier}${dexDataCrystal[s1dynamicReset.species.value].type_2.toLowerCase()})`, 'outline': '2px solid #000'}">
                            <th class="movepool_header movepool_way">Way</th>
                            <th class="movepool_header movepool_move">Move</th>
                            <th class="movepool_header movepool_type">Type</th>
                            <th class="movepool_header movepool_tableC">Pwr.</th>
                            <th class="movepool_header movepool_tableC">Acc.</th>
                            <th class="movepool_header movepool_tableC">PP</th>
                        </tr>
                        <tr v-for="x in movepoolRows.level">
                            <td class="movepool_way">{{x.Level}}</td>
                            <td class="movepool_move">{{x.Move}}</td>
                            <td class="movepool_type" :style="{'background-color': `var(--${ui_type_color_modifier}${movepoolTypeColor(x)?.toLowerCase()})`}">{{movepoolType(x)}}</td>
                            <td class="movepool_tableC">{{x.Power}}</td>
                            <td class="movepool_tableC">{{x.Accuracy}}%</td>
                            <td class="movepool_tableC">{{x.PP}}</td>
                        </tr>
                        <tr v-for="x in movepoolRows.tmhm" :style="getUnobtainableMoveStyle(x, game_selection)">
                            <td class="movepool_way">{{x.tmhm}}</td>
                            <td class="movepool_move">{{x.Move}}</td>
                            <td class="movepool_type" :style="{'background-color': `var(--${ui_type_color_modifier}${movepoolTypeColor(x)?.toLowerCase()})`}">{{movepoolType(x)}}</td>
                            <td class="movepool_tableC">{{movepoolPower(x)}}</td>
                            <td class="movepool_tableC">{{x.Accuracy}}%</td>
                            <td class="movepool_tableC">{{x.PP}}</td>
                        </tr>
                        <tr v-for="x in movepoolRows.tutor">
                            <td class="movepool_way">Tutor</td>
                            <td class="movepool_move">{{x.Move}}</td>
                            <td class="movepool_type" :style="{'background-color': `var(--${ui_type_color_modifier}${x.Type?.toLowerCase()})`}">{{x.Type}}</td>
                            <td class="movepool_tableC">{{x.Power}}</td>
                            <td class="movepool_tableC">{{x.Accuracy}}%</td>
                            <td class="movepool_tableC">{{x.PP}}</td>
                        </tr>
                    </tbody></table>
                    <div class="colored-image" :style="`filter: saturate(${ui_saturation}) drop-shadow(0px 0px 1px #000000)`" style="--url: url(images/gen2/ui/movepool.svg)"></div>
                    <div class="movepoolTitle">Movepool</div>
                </div>
                <div v-else-if="right_panel == 'Splits'" key="2">
                    <div key="3">
                        <div class="split_label">Splits</div>
                        <div v-if="toggle_compare_splits === 'Followup'">
                            <table style="height: 960px;" class="splits_table" cellspacing="0">
                                <tbody><tr :style="{'background-color': `var(--${ui_type_color_modifier}${dexDataCrystal[s1dynamicReset.species.value].type_2.toLowerCase()})`, 'outline': '2px solid #000'}">
                                    <td style="font-size: 18px; padding-left: 3px">Split</td>
                                    <td style="font-size: 18px; width: 80px;  text-align: left; padding-left: 3px;"></td>
                                    <td style="font-size: 18px; width: 110px; text-align: right;">{{previous_label}}</td>
                                    <td style="font-size: 18px; width: 110px; text-align: right;">{{current_label}}</td>
                                    <td style="font-size: 18px; width: 68px;  text-align: right; padding-right: 4px;">Diff</td>
                                </tr>
                                <tr v-for="split in compare_splits">
                                    <td class="scaled_icon" style="font-size: 18px; width: 40px; padding-left: 3px; text-align: left;"><img :src="`images/gen2/split_images/${trainer_name_lookup.basic[split.trainer]?.trainer}.webp`"></td>
                                    <td style="font-size: 18px; width: 80px;  text-align: left; padding-left: 3px; white-space: nowrap;">{{trainer_name_lookup.basic[split.trainer]?.trainer}}</td>
                                    <td style="font-size: 18px; width: 110px; text-align: right;">{{split.previous_time}}</td>
                                    <td style="font-size: 18px; width: 110px; text-align: right;">{{split.current_time}}</td>
                                    <td style="font-size: 18px; width: 68px;  text-align: right; padding-right: 4px;" :style="split_diff_color(split.difference)">{{split.difference}}</td>
                                </tr>
                            </tbody></table>
                            <div class="colored-image" :style="`filter: saturate(${ui_saturation}) drop-shadow(0px 0px 1px #000000)`" style="--url: url(images/gen2/ui/movepool.svg)"></div>
                        </div>
                        <div v-else-if="toggle_compare_splits === 'First'">
                            <table class="splits_table" style="height: 960px;" cellspacing="0">
                                <tbody><tr :style="{'background-color': `var(--${ui_type_color_modifier}${dexDataCrystal[s1dynamicReset.species.value].type_2.toLowerCase()})`, 'outline': '2px solid #000'}">
                                    <td style="font-size: 18px; padding-left: 3px">Split</td>
                                    <td style="font-size: 18px; width: 180px;  text-align: left; padding-left: 3px;"></td>
                                    <td style="font-size: 18px; width: 10px;  text-align: left; padding-left: 3px;"></td>
                                    <td style="font-size: 18px; width: 10px;  text-align: left; padding-left: 3px;"></td>
                                    <td style="font-size: 18px; width: 110px; text-align: right; padding-right: 5px;">Time</td>
                                </tr>
                                <tr v-for="split in compare_splits">
                                    <td class="scaled_icon" style="font-size: 20px; width: 40px; padding-left: 3px; text-align: left;"><img :src="`images/gen2/split_images/${trainer_name_lookup.basic[split.trainer]?.trainer}.webp`"></td>
                                    <td style="font-size: 20px; width: 180px; text-align: left; padding-left: 3px;">{{trainer_name_lookup.detailed[split.trainer]?.trainer}}</td>
                                    <td style="font-size: 20px; width: 10px;  text-align: left; padding-left: 3px;"></td>
                                    <td style="font-size: 20px; width: 10px;  text-align: left; padding-left: 3px;"></td>
                                    <td style="font-size: 20px; width: 110px; text-align: right; padding-right: 5px;">{{split.current_time}}</td>
                                </tr>
                            </tbody></table>
                            <div class="colored-image" :style="`filter: saturate(${ui_saturation}) drop-shadow(0px 0px 1px #000000)`" style="--url: url(images/gen2/ui/movepool.svg)"></div>
                        </div>
                        <div v-else-if="toggle_compare_splits === 'Followup + Summary'">
                            <div class="split_label">Splits</div>
                            <table class="splits_table_old" cellspacing="0">
                                <tbody><tr :style="{'background-color': `var(--${ui_type_color_modifier}${dexDataCrystal[s1dynamicReset.species.value].type_2.toLowerCase()})`, 'outline': '2px solid #000'}">
                                    <td style="font-size: 16px; width: 80px;  text-align: left; padding-left: 3px;">Split</td>
                                    <td style="font-size: 16px; width: 110px; text-align: right;">{{previous_label}}</td>
                                    <td style="font-size: 16px; width: 110px; text-align: right;">{{current_label}}</td>
                                    <td style="font-size: 16px; width: 68px;  text-align: right; padding-right: 4px;">Diff</td>
                                </tr>
                                <tr v-for="split in compare_splits">
                                    <td style="font-size: 16px; width: 80px;  text-align: left; padding-left: 3px;">{{trainer_name_lookup[split.trainer]?.trainer}}</td>
                                    <td style="font-size: 16px; width: 110px; text-align: right;">{{split.previous_time}}</td>
                                    <td style="font-size: 16px; width: 110px; text-align: right;">{{split.current_time}}</td>
                                    <td style="font-size: 16px; width: 68px;  text-align: right; padding-right: 4px;" :style="split_diff_color(split.difference)">{{split.difference}}</td>
                                </tr>
                            </tbody></table>
                            <div class="battle_summary_label">{{battle_summary_header}}</div>
                            <table class="battle_summary_table" cellspacing="0">
                                <tbody><tr :style="{'background-color': `var(--${ui_type_color_modifier}${dexDataCrystal[s1dynamicReset.species.value].type_2.toLowerCase()})`, 'outline': '2px solid #000'}">
                                    <td style="font-size: 16px; width: 204px;  text-align: left; padding-left: 3px;">Metric</td>
                                    <td style="font-size: 16px; width: 184px; text-align: right; padding-right: 3px;">Value</td>
                                </tr>
                                <tr>
                                    <td style="font-size: 16px; width: 204px;  text-align: left; padding-left: 3px;">Battle Duration<br>(real-time)</td>
                                    <td style="font-size: 16px; width: 184px; text-align: right; padding-right: 3px;">{{this.battle_duration != 0 ? this.battle_duration : "-"}}</td>
                                </tr>
                                <tr>
                                    <td style="font-size: 16px; width: 204px;  text-align: left; padding-left: 3px;">Experience Per Second</td>
                                    <td style="font-size: 16px; width: 184px; text-align: right; padding-right: 3px;">{{this.exp_per_second != 0 ? this.exp_per_second : "-"}}</td>
                                </tr>
                                <tr v-for="stat in battle_summary.global">
                                    <td style="font-size: 16px; width: 204px;  text-align: left; padding-left: 3px;">{{stat.name}}</td>
                                    <td style="font-size: 16px; width: 184px; text-align: right; padding-right: 3px;">{{this[stat.data_name] != 0 ? this[stat.data_name] : "-"}}</td>
                                </tr>
                                <tr :style="{'background-color': `var(--${ui_type_color_modifier}${dexDataCrystal[s1dynamicReset.species.value].type_2.toLowerCase()})`, 'outline': '1px solid #000'}"><td style="font-size: 16px; width: 184px;  text-align: left; padding-left: 3px;">Player:</td><td></td></tr>
                                <tr v-for="stat in battle_summary.player">
                                    <td style="font-size: 16px; width: 204px;  text-align: left; padding-left: 3px;">{{stat.name}}</td>
                                    <td style="font-size: 16px; width: 184px; text-align: right; padding-right: 3px;">{{this[stat.data_name] != 0 ? this[stat.data_name] : "-"}}</td>
                                </tr>
                                <tr :style="{'background-color': `var(--${ui_type_color_modifier}${dexDataCrystal[s1dynamicReset.species.value].type_2.toLowerCase()})`, 'outline': '1px solid #000'}"><td style="font-size: 16px; width: 184px;  text-align: left; padding-left: 3px;">Enemy:</td><td></td></tr>
                                <tr v-for="stat in battle_summary.enemy">
                                    <td style="font-size: 16px; width: 204px;  text-align: left; padding-left: 3px;">{{stat.name}}</td>
                                    <td style="font-size: 16px; width: 184px; text-align: right; padding-right: 3px;">{{this[stat.data_name] != 0 ? this[stat.data_name] : "-"}}</td>
                                </tr>
                            </tbody></table>
                            <div class="colored-image ds" :style="`filter: saturate(${ui_saturation})`" style="--url: url(images/gen2/ui/splits.svg)"></div>
                        </div>
                    </div>
                </div> 
                <div v-else-if="right_panel == 'Battle Graphic' && (battle_fade == true && battleGraphic == true && batt.mode.value == `Trainer`)" style="position: absolute;" key="4">
                    <div class="trainerLabel">{{capitalization_format(fixTrainerName(batt.trainer.class.value, batt.trainer.id.value))}}'s Team</div>
                    <div class="colored-image" :style="battlePokemonCrop()" style="--url: url(images/gen2/ui/opponent.svg)"></div>
                    <div v-for="x in pkmnSlots">
                        <img v-show="game.properties.battle.trainer.totalPokemon.value > x" class="canvas" :class="svgColorClass(speed_comparison(x, game.properties.battle.trainer.team[x]?.speed.value).comparison, game.properties.battle.trainer.team[x])" :src="`images/gen2/ui/speed_comp/${x}.svg`">
                    </div>
                    <div v-for="x in pkmnSlots" class="enemyGraphic">
                        <div v-show="batt.trainer.team[x].species.value != null" :class="`ePkmnStyle ePkmn${x + 1}`">
                            <img v-if="batt.trainer.team[x].species.value != null" class="ePkmnSprite" :class="{ ePkmnSpriteResizing: enemyResize.slot === x }" :data-enemy-slot="x" :data-enemy-species="batt.trainer.team[x].species.value" :style="[enemyPkmnFaint(batt.trainer.team[x]), { transform: enemyTransformFor(batt.trainer.team[x].species.value) }]" :src="`images/gen2/pokemon/${batt.trainer.team[x].species.value}.webp`">
                            <div class="ePkmnSpecies opacityTransition" :style="enemyPkmnSpecies(batt.trainer.team[x])">{{batt.trainer.team[x].species.value}}</div>
                            <img class="enemyStatsArea" :style="enemyPkmnFaintStatsBackground(batt.trainer.team[x])" :src="`images/gen2/stats/${x}.svg`">
                            <img class="ePkmnTypeIcons ePkmnType_1 ds opacityTransition" :style="enemyPkmnFaintTypes(batt.trainer.team[x])" :src="`images/gen2/type-icons-circular/${enemyType1(x).toLowerCase()}.webp`">
                            <img v-if="enemyType1(x) != enemyType2(x)" :style="enemyPkmnFaintTypes(batt.trainer.team[x])" class="ePkmnTypeIcons ePkmnType_2 ds opacityTransition" :src="`images/gen2/type-icons-circular/${enemyType2(x).toLowerCase()}.webp`">
                            <!-- Moves -->
                            <div v-for="move_index in moves = [0, 1, 2, 3]">
                                <img v-if="enemy_trainer.party[x]?.moves[move_index] != null" :class="`ds eMoveIconStyle moveIcon${move_index + 1} opacityTransition`" :style="enemyPkmnFaintTypes(batt.trainer.team[x])" :src="`images/gen2/type-icons-circular/${g2MoveData[move_name(game.properties.battle.trainer.team[x][`move${move_index + 1}`]?.value)]?.Type?.toLowerCase()}.webp`">
                                <div :class="`ePkmnMoveStyle ePkmnMove${move_index + 1} opacityTransition`" :style="enemyPkmnText(batt.trainer.team[x])">
                                    {{move_name(batt.trainer.team[x][`move${move_index + 1}`]?.value)}}
                                </div>
                            </div>
                            <!-- Level -->
                            <div class="ePkmnLevel opacityTransition" :style="enemyPkmnText(batt.trainer.team[x])">Lv:{{game.properties.battle.trainer.team[x]?.level}}</div>
                            <!-- Stat Labels -->
                            <div>
                                <div class="ePkmnStatLabelStyle ePkmnLabelHp  opacityTransition" :style="stat_mod(0, x).style">HP</div>
                                <div v-for="stat in stat_object">
                                    <div v-if="stat.name != 'Hp'" :class="`ePkmnStatLabelStyle ePkmnLabel${stat.abrv} opacityTransition`" :style="stat_mod(batt.enemyPokemon[`modStage${stat.mod_path}`].value, x).style">{{stat.label}}</div>
                                </div>
                            </div>
                            <!-- Stat Exp -->
                            <div v-if="stats_setting == 'EVs' || stats_setting == 'Detailed EVs' || stats_setting == 'Base Stats'">
                                <div v-for="stat in stat_object" :class="`ePkmnStatsStyle ePkmn${stat.abrv} opacityTransition`" :style="enemyPkmnText(batt.trainer.team[x])">{{dexDataCrystal[batt.trainer.team[x].species.value]?.[stat.base_stat_path]}}</div>
                            </div>
                            <!-- DVs -->
                            <div v-else-if="stats_setting == 'DVs' || stats_setting == 'Hidden Power'">
                                <div class="ePkmnStatsStyle ePkmnHp  opacityTransition" :style="enemyPkmnText(batt.trainer.team[x])">{{hpDv(batt.trainer.team[x].dvAttack.value, batt.trainer.team[x].dvDefense.value, batt.trainer.team[x].dvSpeed.value, batt.trainer.team[x].dvSpecial.value)}}</div>
                                <div v-for="stat in stat_object">
                                    <div v-if="stat.name != 'Hp'" :class="`ePkmnStatsStyle ePkmn${stat.abrv} opacityTransition`" :style="enemyPkmnText(batt.trainer.team[x])">{{batt.trainer.team[x][stat.dv].value}}</div>
                                </div>
                            </div>
                            <!-- Stats -->
                            <div v-else="">
                                <div class="ePkmnStatsStyle ePkmnHp  opacityTransition" :style="enemyPkmnText(batt.trainer.team[x])">{{batt.trainer.team[x].maxHp.value}}</div>
                                <div v-for="stat in stat_object">
                                    <div v-if="stat.name != 'Hp'" :class="`ePkmnStatsStyle ePkmn${stat.abrv} opacityTransition`" :style="enemyPkmnText(batt.trainer.team[x])">{{activeSlot(x,batt.enemyPokemon.partyPos.value, stat.path, batt.trainer.team[x][stat.path].value, "enemyPokemon")}}</div>
                                </div>
                            </div>
                            <!-- Modifiers -->
                            <div v-for="stat in stat_object">
                                <div v-if="stat.name != 'Hp'">
                                    <div v-show="(enemyState == `Pokemon` || enemyState == `Fainting`) && batt.enemyPokemon.partyPos.value == x && batt.enemyPokemon[`modStage${stat.mod_path}`].value != `0`" :class="`ePkmnModsStyle ePkmnMod${stat.abrv}`">
                                        {{stat_mod(batt.enemyPokemon[`modStage${stat.mod_path}`].value, x).mod}}
                                    </div>
                                </div>
                            </div>
                            <div>
                                <transition name="fade">
                                    <div v-show="speed_comparison_toggle == true" :style="enemyPkmnText(batt.trainer.team[x])" class="speed_comparison">{{speed_comparison(x, game.properties.battle.trainer.team[x]?.speed).comparison}}</div>
                                </transition>
                            </div>
                        </div>
                    </div> 
                </div>
                <div v-else-if="right_panel == 'Inventory'" key="5">
                    <table class="inventory_demo" cellspacing="0">
                        <tbody><tr>
                            <th class="inventory_header movepool_way">Pocket</th>
                            <th class="inventory_header movepool_way">Slot</th>
                            <th class="inventory_header movepool_way">Item</th>
                            <th class="inventory_header movepool_move">Qty</th>
                            <th class="inventory_header movepool_type">Sale $</th>
                            <th class="inventory_header movepool_type">Total $</th>
                        </tr>
                        <tr v-for="item in items = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19]">
                            <th v-if="game.properties.player.items[item].item.value != null" class="movepool_header movepool_way">Items</th>
                            <th v-if="game.properties.player.items[item].item.value != null" class="movepool_header movepool_way">{{item + 1}}</th>
                            <th v-if="game.properties.player.items[item].item.value != null" class="movepool_header movepool_way">{{capitalization_format(game.properties.player.items[item].item.value)}}</th>
                            <th v-if="game.properties.player.items[item].item.value != null" class="movepool_header movepool_move">{{game.properties.player.items[item].quantity.value}}</th>
                            <th v-if="game.properties.player.items[item].item.value != null" class="movepool_header movepool_type">${{game.properties.player.items[item].quantity.value * 100}}</th>
                            <th v-if="game.properties.player.items[item].item.value != null" class="movepool_header movepool_type">${{game.properties.player.items[item].quantity.value * 100 * game.properties.player.items[item].quantity.value}}</th>
                        </tr>
                        <tr v-for="item in pokeballs = [0,1,2,3]">
                            <th v-if="game.properties.player.pokeBalls[item].item.value != null" class="movepool_header movepool_way">Balls</th>
                            <th v-if="game.properties.player.pokeBalls[item].item.value != null" class="movepool_header movepool_way">{{item + 1}}</th>
                            <th v-if="game.properties.player.pokeBalls[item].item.value != null" class="movepool_header movepool_way">{{capitalization_format(game.properties.player.pokeBalls[item].item.value)}}</th>
                            <th v-if="game.properties.player.pokeBalls[item].item.value != null" class="movepool_header movepool_move">{{game.properties.player.pokeBalls[item].quantity.value}}</th>
                            <th v-if="game.properties.player.pokeBalls[item].item.value != null" class="movepool_header movepool_type">${{game.properties.player.pokeBalls[item].quantity.value * 100}}</th>
                            <th v-if="game.properties.player.pokeBalls[item].item.value != null" class="movepool_header movepool_type">${{game.properties.player.pokeBalls[item].quantity.value * 100 * game.properties.player.pokeBalls[item].quantity.value}}</th>
                        </tr>
                    </tbody></table>
                    <div class="colored-image ds" :style="`filter: saturate(${ui_saturation}) drop-shadow(0px 0px 1px #000000)`" style="--url: url(images/gen2/ui/movepool.svg)"></div>
                    <div class="movepoolTitle">Inventory</div>
                </div>
                <div v-else="" key="6">
                    <table class="movepoolDemo" cellspacing="0" :style="customFormats()">
                        <tbody><tr :style="{'background-color': `var(--${ui_type_color_modifier}${dexDataCrystal[s1dynamicReset.species.value].type_2.toLowerCase()})`, 'outline': '2px solid #000'}">
                            <th class="movepool_header movepool_way">Way</th>
                            <th class="movepool_header movepool_move">Move</th>
                            <th class="movepool_header movepool_type">Type</th>
                            <th class="movepool_header movepool_tableC">Pwr.</th>
                            <th class="movepool_header movepool_tableC">Acc.</th>
                            <th class="movepool_header movepool_tableC">PP</th>
                        </tr>
                        <tr v-for="x in movepoolRows.level">
                            <td class="movepool_way">{{x.Level}}</td>
                            <td class="movepool_move">{{x.Move}}</td>
                            <td class="movepool_type" :style="{'background-color': `var(--${ui_type_color_modifier}${movepoolTypeColor(x)?.toLowerCase()})`}">{{movepoolType(x)}}</td>
                            <td class="movepool_tableC">{{x.Power}}</td>
                            <td class="movepool_tableC">{{x.Accuracy}}%</td>
                            <td class="movepool_tableC">{{x.PP}}</td>
                        </tr>
                        <tr v-for="x in movepoolRows.tmhm" :style="getUnobtainableMoveStyle(x, game_selection)">
                            <td class="movepool_way">{{x.tmhm}}</td>
                            <td class="movepool_move">{{x.Move}}</td>
                            <td class="movepool_type" :style="{'background-color': `var(--${ui_type_color_modifier}${movepoolTypeColor(x)?.toLowerCase()})`}">{{movepoolType(x)}}</td>
                            <td class="movepool_tableC">{{movepoolPower(x)}}</td>
                            <td class="movepool_tableC">{{x.Accuracy}}%</td>
                            <td class="movepool_tableC">{{x.PP}}</td>
                        </tr>
                        <tr v-for="x in movepoolRows.tutor">
                            <td class="movepool_way">Tutor</td>
                            <td class="movepool_move">{{x.Move}}</td>
                            <td class="movepool_type" :style="{'background-color': `var(--${ui_type_color_modifier}${x.Type?.toLowerCase()})`}">{{x.Type}}</td>
                            <td class="movepool_tableC">{{x.Power}}</td>
                            <td class="movepool_tableC">{{x.Accuracy}}%</td>
                            <td class="movepool_tableC">{{x.PP}}</td>
                        </tr>
                    </tbody></table>
                    <div class="colored-image" :style="`filter: saturate(${ui_saturation}) drop-shadow(0px 0px 1px #000000)`" style="--url: url(images/gen2/ui/movepool.svg)"></div>
                    <div class="movepoolTitle">Movepool</div>
                </div>
            </transition>
            <transition name="fadeDelayed">
                <div v-if="(right_panel == 'Battle Graphic' && battle_fade == true && g2trainerEnemySelector(batt.trainer.class.value) == 1) && battleGraphic == true && showSpecialTrainerGraphics == true" style="position: absolute;">
                    <img class="canvas" :src="specialTrainerGraphics()">
                </div>
            </transition>

            <!-- LABELS -->
                <div class="resetsContainer">
                    <div class="timerTitle moves_header">moves</div>
                    <div v-show="damage_ranges == true">
                        <div class="timerTitle moves_header" style="left: 225px;">dmg.</div>
                        <div class="timerTitle moves_header" style="left: 298px;">range</div>
                    </div>
                    <div v-show="damage_ranges == false">
                        <div class="timerTitle moves_header" style="left: 208px;">pwr.</div>
                        <div class="timerTitle moves_header" style="left: 278px;">acc.</div>
                        <div class="timerTitle moves_header" style="left: 328px;">pp</div>
                    </div>
                    <div v-show="blackouts_resets == 'None'">
                        <div class="genericLabels resetsLabel_1">faults</div>
                    </div>
                    <div v-show="blackouts_resets == 'Resets'">
                        <div class="genericLabels resetsLabel_1">resets</div>
                    </div>
                    <div v-show="blackouts_resets == 'Blackouts'">
                        <div class="genericLabels blackoutLabel_1">blackouts</div>
                    </div>
                    <div v-show="blackouts_resets == 'Both'">
                        <div class="genericLabels resetsLabel">resets</div>
                        <div class="genericLabels blackoutLabel">blackouts</div>
                    </div>
                </div>
                <div class="timerContainer">
                    <div class="timerTitle">time played at 4x game-speed</div>
                </div>
            <!-- EXP BAR -->
                <div v-show="expBarToggle == true" class="expBar">
                    <div v-if="ui_stats_styling == '2023'" class="posAbs exp_label">Exp:</div>
                    <div v-if="ui_stats_styling == '2023'" class="posAbs expMeterOuter"><div class="expMeterInner" ref="expBar"></div></div>
                </div>
            </div>

            <!-- BATTLE POP UPS ------------------------------------------------------------------------------------------------------------------------------>
            <div v-if="battlePopUps == true">
                <transition name="fade2">
                    <!-- ACCURACY -->
                    <div v-show="battle_fade == true && batt.yourPokemon?.modStageAccuracy?.value != 0 && (g2stateVariable == `Battle` || g2stateVariable == `From Battle`) && batt.yourPokemon?.modStageAccuracy?.bytes < 0x0E" id="accuracy">
                        <div class="colored-image ds" :style="`filter: saturate(${ui_saturation}) drop-shadow(0px 0px 1px #000000)`" style="--url: url(images/gen2/ui/accuracy.svg)"></div>
                        <div class="accEvaStyle accEvaLabel accuracyLabel">Accuracy:</div>
                        <div class="accEvaStyle accEvaMod accuracyMod">{{ batt.yourPokemon?.modStageAccuracy?.value }}</div>
                    </div>
                </transition>
                <!-- BONKS -->
                <transition name="fade2">
                    <div v-if="bonk == true && g2stateVariable == 'Overworld' && blackouts_resets != 'Both'" id="bonks">
                        <div class="colored-image" :style="`filter: saturate(${ui_saturation})`" style="--url: url(images/gen2/ui/bonks.svg)"></div>
                        <div class="genericLabels bonksLabel">bonks</div>
                        <div class="popUpsStyle bonksValue">{{ game.properties.patch.steps.bonks.value }}</div>
                    </div>
                </transition>
                <transition name="fade2">
                    <div v-if="bonk == true && g2stateVariable == 'Overworld' && blackouts_resets == 'Both'">
                        <div class="colored-image" :style="`filter: saturate(${ui_saturation})`" style="--url: url(images/gen2/ui/bonks_2.svg)"></div>
                        <div class="genericLabels bonksLabel_1">bonks</div>
                        <div class="popUpsStyle bonksValue_1">{{ game.properties.patch.steps.bonks.value }}</div>
                    </div>
                </transition>
                <!-- REPEL COUNTER -->
                <transition name="fade2">
                    <div v-if="repel_counter == true && g2stateVariable == 'Overworld' && game.properties.squidgyExtras.repelStepsRemaining?.value > 0 && blackouts_resets != 'Both'">
                        <div class="colored-image" :style="`filter: saturate(${ui_saturation})`" style="--url: url(images/gen2/ui/repel.svg)"></div>
                        <div class="genericLabels repelLabel">repel steps</div>
                        <div class="popUpsStyle repelSteps">{{ game.properties.squidgyExtras.repelStepsRemaining.value }}</div>
                    </div>
                </transition>
                <transition name="fade2">
                    <div v-if="repel_counter == true && g2stateVariable == 'Overworld' && game.properties.squidgyExtras.repelStepsRemaining?.value > 0 && blackouts_resets == 'Both'">
                        <div class="colored-image" :style="`filter: saturate(${ui_saturation})`" style="--url: url(images/gen2/ui/repel_2.svg)"></div>
                        <div class="genericLabels repelLabel_1">repel steps</div>
                        <div class="popUpsStyle repelSteps_1">{{ game.properties.squidgyExtras.repelStepsRemaining.value }}</div>
                    </div>
                </transition>


                <!-- EVASION -->
                <transition name="fade2">
                    <div v-show="battle_fade == true && batt.yourPokemon?.modStageEvasion?.value != 0 && (g2stateVariable == `Battle` || g2stateVariable == `From Battle`) && batt.yourPokemon?.modStageAccuracy?.bytes < 0x0E" id="evasion">
                        <div class="colored-image ds" :style="`filter: saturate(${ui_saturation}) drop-shadow(0px 0px 1px #000000)`" style="--url: url(images/gen2/ui/evasion.svg)"></div>
                        <div class="accEvaStyle accEvaLabel evasionLabel">Evasion:</div>
                        <div class="accEvaStyle accEvaMod evasionMod">{{ batt.yourPokemon?.modStageEvasion?.value }}</div>
                    </div>
                </transition>

                <!-- SCREENS -->
                <transition name="fade2">
                    <div v-show="(g2stateVariable == `Battle` || g2stateVariable == `From Battle`) && field_effect_first_expiring[2] != 0 && batt.yourPokemon?.modStageAccuracy?.bytes < 0x0E">
                        <div class="colored-image ds" :style="`filter: saturate(${ui_saturation}) drop-shadow(0px 0px 1px #000000)`" style="--url: url(images/gen2/ui/screens.svg)"></div>
                        <div class="accEvaStyle accEvaLabel screenLabel">Field:</div>
                        <div class="accEvaStyle accEvaMod screenTurns">{{field_effect_first_expiring[0]}}: {{field_effect_first_expiring[2]}}</div>
                    </div>
                </transition>

                <!-- Resets -->
                <div v-if="shuckie_counters == true">
                    <div v-show="blackouts_resets == 'None'">
                        <transition name="fade2">
                            <div class="faults_style resets_1"><div id="reset_counter">{{shuckie_player_resets ?? 0}}</div></div>
                        </transition>
                    </div>
                    <div v-show="blackouts_resets == 'Resets'">
                        <transition name="fade2">
                            <div class="faults_style resets_1"><div id="reset_counter">{{shuckie_player_resets ?? 0}}</div></div>
                        </transition>
                    </div>
                    <div v-show="blackouts_resets == 'Blackouts'">
                        <transition name="fade2">
                            <div class="faults_style blackouts_1" id="reset_counter">{{shuckie_blackout_counter ?? 0}}</div>
                        </transition>
                    </div>
                    <div v-show="blackouts_resets == 'Both'">
                        <transition name="fade2">
                            <div class="faults_style resets"><div id="reset_counter">{{shuckie_player_resets ?? 0}}</div></div>
                        </transition>
                        <transition name="fade2">
                            <div class="faults_style blackouts" id="reset_counter">{{shuckie_blackout_counter ?? 0}}</div>
                        </transition>
                    </div>
                </div>
                <div v-else="">    
                    <div v-show="blackouts_resets == 'None'">
                        <transition name="fade2">
                            <div class="faults_style resets_1"><div id="reset_counter">{{playerResets}}</div></div>
                        </transition>
                    </div>
                    <div v-show="blackouts_resets == 'Resets'">
                        <transition name="fade2">
                            <div class="faults_style resets_1"><div id="reset_counter">{{playerResets}}</div></div>
                        </transition>
                    </div>
                    <div v-show="blackouts_resets == 'Blackouts'">
                        <transition name="fade2">
                            <div class="faults_style blackouts_1" id="reset_counter">{{blackout_counter}}</div>
                        </transition>
                    </div>
                    <div v-show="blackouts_resets == 'Both'">
                        <transition name="fade2">
                            <div class="faults_style resets"><div id="reset_counter">{{playerResets}}</div></div>
                        </transition>
                        <transition name="fade2">
                            <div class="faults_style blackouts" id="reset_counter">{{blackout_counter}}</div>
                        </transition>
                    </div>
                </div>


                <!-- HELD ITEM -->
                <div class="heldItem">Held Item:</div>
                <transition name="fade2">
                    <div v-show="g2stateVariable != 'Base Stats'" class="item">{{get_held_item}}</div>
                </transition>

                <!-- Gametime -->
                <transition name="fade1">
                    <div v-show="run_complete" style="position: absolute; top: 250px;">
                        <div class="colored-image ds" :style="`filter: saturate(${ui_saturation}) drop-shadow(0px 1px 1px); top: -186px;`" style="--url: url(images/gen2/ui/gametime.svg)"></div>
                        <div class="genericLabels gametimeLabel">gametime</div>
                        <div id="gametime_display" style="top: 272px; font-size: 34px; width: 229px; left: 84px;" class="resets">
                            <div>{{simple_data[7]}}</div>
                        </div>
                    </div>
                </transition>
            </div>
        
<teleport to="body" v-if="isInDevMode">
            <div v-if="enemyResize.species && enemySpriteHandlePosition()" class="ePkmnSpriteResizeHandle" :style="enemySpriteHandlePosition()" @mousedown="onEnemyResizeHandleMouseDown($event)" title="Drag to resize. Arrows move (Shift = 10px). F1 flips. Enter saves, Escape cancels."></div>
        </teleport>
</div>
</template>

<script>
/**
 * gen2's overlay: Crystal, and Gold & Silver (plan 2.4, lifted 2026-09-10).
 *
 * This is the component object from the legacy `frontend.js` (6,750 lines, one
 * `Vue.createApp` call) and the `#app` markup from its `index.html`, brought in as an
 * SFC with the infrastructure swapped for the shared core and *nothing else changed*
 * (tools/port/lift-gen2.py does the swaps and asserts each one):
 *
 *   - `this.mapper.X`   -> `this.game.X`: the session main.ts builds -- the profile's
 *                          canonical view as `properties`, plus `setBits`. The
 *                          component no longer constructs or connects a client; what
 *                          was its `onMapperLoaded` callback runs at the top of
 *                          `mounted`, in the same order.
 *   - `MyStorage`       -> games/gen2/storage.ts (the file-backed layered store).
 *   - keyhook block     -> games/gen2/hotkeys.ts through core/hotkeys.
 *   - control server    -> games/gen2/control.ts, bound by main.ts (plan 1.8).
 *   - OBS marker method -> core/logic/obs.ts (the same exchange, plan 1.9).
 *   - logData/logCopy   -> games/gen2/splits.js over the splits IPC.
 *   - `<script src>`    -> imports of games/gen2/data/*.js.
 *   - openFolder        -> the splits IPC; importBackports keeps its body over the
 *                          File API, with the parser in games/gen2/backports.js and its
 *                          file appends in games/gen2/backportOverrides.ts (decision 15).
 *   - `images/...`      -> `images/gen2/...` everywhere (template, script,
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
import { computed, defineComponent } from "vue";
import { LiveText } from "~/core/overlay/LiveText";
import { ClockFrame } from "~/core/overlay/ClockFrame";
import { findKeyIgnoringCase } from "~/core/logic/caseInsensitiveLookup";
import { bindHotkeys } from "~/core/hotkeys/KeyHook";
import { addSplitBookmark, sendChapterMarker, shuckieBookmarksEnabled } from "~/core/logic/shuckieBookmarks";
import { pickSplitComparison } from "~/core/logic/splitComparison";
import { markReminderMoves } from "~/core/logic/moveReminder";
import { clampDvs, clampStat, DV_MAX, gen12Stat, gen2Gender, gen2HiddenPower, hpDv as hpDvOf, IV_MODE } from "~/core/logic/starterIvs";
import { revealSplitFolder, splitPath } from "~/core/persistence/splitFiles";
import { enemySpriteStyleMixin } from "~/core/overlay/enemySpriteStyleMixin";
import { formattersMixin } from "~/core/overlay/formattersMixin";
import { overlayCommonMixin } from "~/core/overlay/overlayCommonMixin";
import { battleMathMixin } from "~/core/overlay/battleMathMixin";
import { MyStorage, StyleSettingsUtils } from "./storage";
import { enemySpriteScaleManager } from "./enemySprites";
import { gen2Hotkeys } from "./hotkeys";
// loadCsvFile: only `load_temp_splits` (legacy, unreferenced) still uses it; the comparison picker is core's.
import { loadCsvFile, logData, logCopy, transition } from "./splits.js";
import { buildMoveLookup, parseBackportMoves, parseBackportPokemon } from "./backports.js";
import { recordBackport } from "./backportOverrides";
import { auto_save_settings } from "./data/auto_save_settings.js";
import { autosplitter } from "./data/autosplitter.js";
import { backportMoveMap } from "./data/backport_move_map.js";
import { badgeTypeBoosts } from "./data/badgeTypeBoosts.js";
import { battle_summary } from "./data/autosplitter/battle_summary.js";
import { cross_generation_moves } from "./data/cross_generation_moves.js";
import { crystal_trainers } from "./data/crystal_trainers.js";
import { default_colors } from "./data/default_colors.js";
import { default_textures } from "./data/default_textures.js";
import { dexDataCrystal } from "./data/pokemon_crystal.js";
import { g2MoveData } from "./data/g2MoveData.js";
import { g2trainers } from "./data/g2trainers-short.js";
import { g2trainersOtto } from "./data/crystal-trainers-otto.js";
import { gen2moves } from "./data/gen2moves.js";
import { hiddenPowerTypeSelector } from "./data/hiddenPowerTypeSelector.js";
import { hiddenPowerTypes } from "./data/hpTable.js";
import { split_trainers } from "./data/autosplitter/split_trainers.js";
import { stageModifiersData } from "./data/stageModifiers.js";
import { textures } from "./data/textures.js";
import { tmhmMapping } from "./data/tmhmmapping.js";
import { trainer_name_lookup } from "./data/autosplitter/trainer_name_lookup.js";
import { typeBoostingItems } from "./data/typeBoostingItems.js";
import { typeData } from "./data/type-effectiveness.js";
import { unobtainable_moves_object } from "./data/unobtainable_moves.js";

// Implicit globals of the legacy classic script, see tools/port/lift-gen2.py.
let backport_check_string, battle_end, d, damageMax, damageMin, g2HpType, g2gamestate, h, hpPower, ivAtkBit, ivDefBit, m, maxPercentage, minPercentage, newColor, part1, part2, part3, part4, starterType, string, timecode, upperZ, usableVitamins, v, vitaminsUsed, w, x, y;

export default defineComponent({
    mixins: [enemySpriteStyleMixin({ enemySpriteScaleManager }), formattersMixin, overlayCommonMixin, battleMathMixin],
            
    //DATA & DEFINITIONS
    components: { LiveText, ClockFrame },
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
            ready : false,
            isInDevMode: StyleSettingsUtils.isDevMode(),
            // Dev-only opt-out so footage stays congruent with content filmed before the resize feature shipped.
            // Packaged builds ignore this flag and always apply the styles.
            enemy_sprite_styles_enabled: MyStorage['enemy_sprite_styles_enabled'] ?? true,

            // Style Mode (dev only): iterate every species in dexDataCrystal
            // showing each in slot 0 with the resize handle active.
            // Enter commits + advances; Backspace discards + steps back.
            style_mode_active         : false,
            style_mode_index          : 0,
            style_mode_species_list   : [],
            style_mode_dummy_moves    : [
                { name: 'Tackle',     type: 'normal' },
                { name: 'Water Gun',  type: 'water'  },
                { name: 'Ember',      type: 'fire'   },
                { name: 'Vine Whip',  type: 'grass'  },
            ],
            obs   : null,
            release: false,

            // Enemy sprite resize tool (Ctrl+Click on an enemy sprite, dev-only)
            enemyResize       : { species: null, slot: null, baseSize: 108, spriteEl: null },
            enemyScaleVersion : 0,

            pokemon_list: [],
            search_term: MyStorage["this.search_term"] ?? "",
            game_selection: MyStorage["game_selection"] ?? "Crystal",

            emulatorStatsInterval        : null,
            emulatorStats                : null,

            shuckie_timer                : MyStorage['this.shuckie_timer']                ?? false,
            shuckie_counters             : MyStorage['this.shuckie_counters']             ?? false,
            shuckie_bookmarks            : shuckieBookmarksEnabled(),

        //USER CONFIG ------------------------//
            starter                : MyStorage["starter"] ?? "Aipom",
            hpType                 : MyStorage["hpType"]  ?? "Dark",
            // The starter's DVs (2026-09-17, core/logic/starterIvs.ts): `Automatic` is the Hidden
            // Power dropdown above, `Manual` the four fields. Kept once per install, as hpType is.
            dv_mode                : MyStorage["dv_mode"] ?? IV_MODE.automatic,
            manual_dvs             : clampDvs(MyStorage["manual_dvs"]),
            pokemon_gender         : MyStorage["pokemon_gender"] ?? "Male",
            scott_mode             : true,
            secondPlaythrough      : false,
            // timeOfDay_user         : MyStorage["timeOfDay_user"]      ?? "Day",
            autosplitter_toggle    : MyStorage["autosplitter_toggle"] ?? true,
            repel_counter          : MyStorage["this.repel_counter"]  ?? true,
            overlayOnly            : true,
            customMoves            : false, //if custom moves is turned off, custom trainer ID will be turned off as well
            customMove1            : 0x59,
            customMove1pp          : 0x0A,
            customMove2            : 0x28,
            customMove2pp          : 0x23,
            customMove3            : 0x44,
            customMove3pp          : 0x14,
            customMove4            : 0x11,
            customMove4pp          : 0x23,
            customTrainerID        : false, //when set to true it will ensure the Pokemon receives boosted EXP
            inventory_display      : false,
            base_stats_display     : false,
            dv_display             : false,
            stat_exp_display       : false,
            toggle_compare_splits  : 'First',
            speed_comparison_toggle: true,
            bonk                   : MyStorage['this.bonk']                 ?? true,
            automatic_ivs          : MyStorage['this.automatic_ivs']        ?? true,
            automatic_evs          : MyStorage['this.automatic_evs']        ?? true,
            stats_setting          : MyStorage['this.stats_setting']        ?? "Automatic",
            right_panel            : MyStorage['this.right_panel']          ?? "Battle Graphic",
            display_badge_boosts   : MyStorage['this.display_badge_boosts'] ?? true,
            display_run_summary    : MyStorage['this.display_run_summary']  ?? true,
            show_badge_boosts      : MyStorage['this.show_badge_boosts']    ?? true,
            damage_ranges          : MyStorage['this.damage_ranges']        ?? false,
            collect_split_data     : MyStorage['this.collect_split_data']   ?? true,
            refilming_mode         : MyStorage['this.refilming_mode']       ?? false,
            display_vitamins_automatically: MyStorage['this.display_vitamins_automatically'] ?? true,
            no_increment           : MyStorage['this.no_increment']         ?? false,
            refilmed_attempt       : 0,
            refilmed_finish        : 0,
            debugging              : MyStorage['this.debugging'] ?? false,
            editor                 : MyStorage['this.editor']    ?? false,
            show_backport_import   : false,
            backport_import_status : '',
            backport_pokemon_name  : '',
            pokemon_recalculator   : MyStorage['this.pokemon_recalculator'] ?? false,
            run_complete           : MyStorage['this.run_complete'] ?? false,
            show_advanced_settings : MyStorage['this.show_advanced_settings'] ?? false,
            unobtainable_moves_toggle: MyStorage['this.unobtainable_moves_toggle'] ?? "Never Cross Out",
            // speedrunner_steve   : false,

            // Editor
            move1_replacement: "",
            move2_replacement: "",
            move3_replacement: "",
            move4_replacement: "",
            item1_replacement: "Rare Candy",
            item2_replacement: "Pp Up",
            item3_replacement: "Full Restore",
            item4_replacement: "Max Elixer",
            dv_atk_replacement: 15,
            dv_def_replacement: 15,
            // Recalculate Pokemon
            recalculate_level: MyStorage['this.recalculate_level'] ?? 100,

            crystal_trainer_list: [],
            search_trainers     : "",
            examined_trainer    : MyStorage['examined_trainer'] ?? "",

            automatic_post_battle_splits: MyStorage['this.automatic_post_battle_splits'] ?? true,
            automatic_splits:             MyStorage['this.automatic_splits']             ?? false,
        //------------------------------------//

            customMovepool: {
                "Weavile"   : "line-height: 19px;",
                "Lugia"     : "line-height: 17px;",
                "Blastoise" : "line-height: 19px;",
                "Charizard" : "line-height: 19px;",
                "Nidoking"  : "line-height: 20px;",
                "Nidoqueen" : "line-height: 20px;",
                "Clefable"  : "line-height: 20px; font-size: 15px;",
                "Clefairy"  : "line-height: 18px;",
                "Rhydon"    : "line-height: 19px; font-size: 15px;",
                "Slowbro"   : "line-height: 18px; font-size: 14px;",
                "Slowking"  : "line-height: 18px; font-size: 15px;",
                "Chansey"   : "line-height: 18px;",
                "Lickitung" : "line-height: 18px;",
                "Kangaskhan": "line-height: 19px;",
                "Marowak"   : "line-height: 20px;",
                "Snorlax"   : "line-height: 18px;",
                "Dragonite" : "line-height: 17px; font-size: 14px;",
                "Mewtwo"    : "line-height: 18px; font-size: 15px;",
                "Mew"       : "line-height: 14px; font-size: 13px;",
                "Miltank"   : "line-height: 19px; font-size: 15px;",
                "Tyranitar" : "line-height: 19px;",
                "Ho-oh"     : "line-height: 19px;",
            },

            //LOOPS
            pkmnMoves:      ["move1","move2","move3","move4"],
            pkmnSlots:      [0, 1, 2, 3, 4, 5],
            boostingBadges: ["badge1", "badge3", "badge6", "badge7"],
            fieldStatuses:  ["reflect", "lightScreen", "safeguard"],
            badgeBoosts: ["badge1", "badge3", "badge6", "badge7"],
            progressBadges:  ["badge1","badge2","badge3","badge4", "badge5","badge6","badge7","badge8"],
            progressBadges2: ["badge9","badge10","badge11","badge12", "badge13","badge14","badge15","badge16"],
            battle_summary_header: MyStorage['this.battle_summary_header'] ?? "Battle Summary",
            previous_label:        MyStorage['this.previous_label']        ?? "Previous",
            current_label:         MyStorage['this.current_label']         ?? "Current",

            stats:          [],
            stat_object:     [
                {abrv: "Hp",  name: "Hp",              name_stat_exp: "Hp",      label: "HP",   vitamin: "HP Up",   path: "maxHp",          mod_path: "Hp",             mod_abrv: "hp",  base_stat_path: "base_hp",      dv: "dvHp",      hp_spe_label_row: 1, hp_spd_label_row: 1, label_column: 1, hp_spe_value_row: 1, hp_spd_value_row: 1, value_column: 2,}, 
                {abrv: "Atk", name: "Attack",          name_stat_exp: "Attack",  label: "Atk.", vitamin: "Protein", path: "attack",         mod_path: "Attack",         mod_abrv: "atk", base_stat_path: "base_atk",     dv: "dvAttack",  hp_spe_label_row: 2, hp_spd_label_row: 2, label_column: 1, hp_spe_value_row: 2, hp_spd_value_row: 2, value_column: 2,}, 
                {abrv: "Def", name: "Defense",         name_stat_exp: "Defense", label: "Def.", vitamin: "Iron",    path: "defense",        mod_path: "Defense",        mod_abrv: "def", base_stat_path: "base_def",     dv: "dvDefense", hp_spe_label_row: 3, hp_spd_label_row: 3, label_column: 1, hp_spe_value_row: 3, hp_spd_value_row: 3, value_column: 2,}, 
                {abrv: "SpA", name: "Special Attack",  name_stat_exp: "Special", label: "SpA.", vitamin: "Calcium", path: "specialAttack",  mod_path: "SpecialAttack",  mod_abrv: "spa", base_stat_path: "base_spc_atk", dv: "dvSpecial", hp_spe_label_row: 1, hp_spd_label_row: 2, label_column: 3, hp_spe_value_row: 1, hp_spd_value_row: 2, value_column: 4,}, 
                {abrv: "SpD", name: "Special Defense", name_stat_exp: "Special", label: "SpD.", vitamin: "Calcium", path: "specialDefense", mod_path: "SpecialDefense", mod_abrv: "spd", base_stat_path: "base_spc_def", dv: "dvSpecial", hp_spe_label_row: 2, hp_spd_label_row: 3, label_column: 3, hp_spe_value_row: 2, hp_spd_value_row: 3, value_column: 4,}, 
                {abrv: "Spe", name: "Speed",           name_stat_exp: "Speed",   label: "Spe.", vitamin: "Carbos",  path: "speed",          mod_path: "Speed",          mod_abrv: "spe", base_stat_path: "base_spd",     dv: "dvSpeed",   hp_spe_label_row: 3, hp_spd_label_row: 1, label_column: 3, hp_spe_value_row: 3, hp_spd_value_row: 1, value_column: 4,}, 
            ],

            exp_table: {
                "GROWTH_ERRATIC":     [0,15,52,122,237,406,637,942,1326,1800,2369,3041,3822,4719,5737,6881,8155,9564,11111,12800,14632,16610,18737,21012,23437,26012,28737,31610,34632,37800,41111,44564,48155,51881,55737,59719,63822,68041,72369,76800,81326,85942,90637,95406,100237,105122,110052,115015,120001,125000,131324,137795,144410,151165,158056,165079,172229,179503,186894,194400,202013,209728,217540,225443,233431,241496,249633,257834,267406,276458,286328,296358,305767,316074,326531,336255,346965,357812,367807,378880,390077,400293,411686,423190,433572,445239,457001,467489,479378,491346,501878,513934,526049,536557,548720,560922,571333,583539,591882,600000],
                "GROWTH_FAST":        [0,6,21,51,100,172,274,409,583,800,1064,1382,1757,2195,2700,3276,3930,4665,5487,6400,7408,8518,9733,11059,12500,14060,15746,17561,19511,21600,23832,26214,28749,31443,34300,37324,40522,43897,47455,51200,55136,59270,63605,68147,72900,77868,83058,88473,94119,100000,106120,112486,119101,125971,133100,140492,148154,156089,164303,172800,181584,190662,200037,209715,219700,229996,240610,251545,262807,274400,286328,298598,311213,324179,337500,351180,365226,379641,394431,409600,425152,441094,457429,474163,491300,508844,526802,545177,563975,583200,602856,622950,643485,664467,685900,707788,730138,752953,776239,800000],
                "GROWTH_MEDIUM_FAST": [0,8,27,64,125,216,343,512,729,1000,1331,1728,2197,2744,3375,4096,4913,5832,6859,8000,9261,10648,12167,13824,15625,17576,19683,21952,24389,27000,29791,32768,35937,39304,42875,46656,50653,54872,59319,64000,68921,74088,79507,85184,91125,97336,103823,110592,117649,125000,132651,140608,148877,157464,166375,175616,185193,195112,205379,216000,226981,238328,250047,262144,274625,287496,300763,314432,328509,343000,357911,373248,389017,405224,421875,438976,456533,474552,493039,512000,531441,551368,571787,592704,614125,636056,658503,681472,704969,729000,753571,778688,804357,830584,857375,884736,912673,941192,970299,1000000],
                "GROWTH_MEDIUM_SLOW": [0,9,57,96,135,179,236,314,419,560,742,973,1261,1612,2035,2535,3120,3798,4575,5460,6458,7577,8825,10208,11735,13411,15244,17242,19411,21760,24294,27021,29949,33084,36435,40007,43808,47846,52127,56660,61450,66505,71833,77440,83335,89523,96012,102810,109923,117360,125126,133229,141677,150476,159635,169159,179056,189334,199999,211060,222522,234393,246681,259392,272535,286115,300140,314618,329555,344960,360838,377197,394045,411388,429235,447591,466464,485862,505791,526260,547274,568841,590969,613664,636935,660787,685228,710266,735907,762160,789030,816525,844653,873420,902835,932903,963632,995030,1027103,1059860],
                "GROWTH_SLOW":        [0,10,33,80,156,270,428,640,911,1250,1663,2160,2746,3430,4218,5120,6141,7290,8573,10000,11576,13310,15208,17280,19531,21970,24603,27440,30486,33750,37238,40960,44921,49130,53593,58320,63316,68590,74148,80000,86151,92610,99383,106480,113906,121670,129778,138240,147061,156250,165813,175760,186096,196830,207968,219520,231491,243890,256723,270000,283726,297910,312558,327680,343281,359370,375953,393040,410636,428750,447388,466560,486271,506530,527343,548720,570666,593190,616298,640000,664301,689210,714733,740880,767656,795070,823128,851840,881211,911250,941963,973360,1005446,1038230,1071718,1105920,1140841,1176490,1212873,1250000],
                "GROWTH_FLUCTUATING": [0,4,13,32,65,112,178,276,393,540,745,967,1230,1591,1957,2457,3046,3732,4526,5440,6482,7666,9003,10506,12187,14060,16140,18439,20974,23760,26811,30146,33780,37731,42017,46656,50653,55969,60505,66560,71677,78533,84277,91998,98415,107069,114205,123863,131766,142500,151222,163105,172697,185807,196322,210739,222231,238036,250562,267840,281456,300293,315059,335544,351520,373744,390991,415050,433631,459620,479600,507617,529063,559209,582187,614566,639146,673863,700115,737280,765275,804997,834809,877201,908905,954084,987754,1035837,1071552,1122660,1160499,1214753,1254796,1312322,1354652,1415577,1460276,1524731,1571884,1640000]
            },

            //DATA
            dexDataCrystal         : dexDataCrystal,
            g2trainers             : g2trainers,
            typeData               : typeData,
            typeBoostingItems      : typeBoostingItems,
            hiddenPowerTypeSelector: hiddenPowerTypeSelector,
            hiddenPowerTypes       : hiddenPowerTypes,
            // Gender thresholds: max attack DV for female Pokemon (attack DV must be < threshold for male)
            // e.g., GENDER_F75 means 75% female, so attack DV 0-11 is female, 12-15 is male
            genderThresholds: {
                'GENDER_UNKNOWN': null,  // No gender
                'GENDER_F0':      0,     // 0% female (all male) - no valid female attack DV
                'GENDER_F12_5':   1,     // 12.5% female - max atk DV 1 for female
                'GENDER_F25':     3,     // 25% female - max atk DV 3 for female
                'GENDER_F50':     7,     // 50% female - max atk DV 7 for female
                'GENDER_F75':     11,    // 75% female - max atk DV 11 for female
                'GENDER_F100':    15,    // 100% female - all attack DVs valid for female
            },
            badgeTypeBoosts        : badgeTypeBoosts,
            g2trainersOtto         : g2trainersOtto,
            gen2moves              : gen2moves,
            stageModifiersData     : stageModifiersData,
            tmhmMapping            : tmhmMapping,
            g2MoveData             : g2MoveData,
            backportMoveMap        : backportMoveMap,
            auto_save_settings     : auto_save_settings,
            textures               : textures,
            autosplitter           : autosplitter,
            default_textures       : default_textures,
            default_colors         : default_colors,
            crystal_trainers       : crystal_trainers,
            battle_summary         : battle_summary,
            trainer_name_lookup    : trainer_name_lookup,
            split_trainers         : split_trainers,
            default_split_order    : [
                "FALKNER", "BUGSY", "WHITNEY", "MORTY", "CHUCK", "PRYCE", "JASMINE", "CLAIR",
                "WILL", "KOGA", "BRUNO", "KAREN", "CHAMPION",
                "ERIKA", "SABRINA", "MISTY", "LT. SURGE", "BROCK", "BLAINE", "JANINE",
                "BLUE", "RED",
            ],
            cross_generation_moves : cross_generation_moves,
            unobtainable_moves_object: unobtainable_moves_object,

            // TOGGLES
            typeIcons:                  true,
            pick:                       true,
            typeCalcs:                  true,
            addStabBonus:               true,
            addBadgeTypeBonus:          true,
            inventory:                  false,
            battleGraphic:              true,
            showAllTrainers:            false,
            expBarToggle:               true, //hides and shows the exp bar on and off
            battlePopUps:               true, //shows reflect, lightscreen, safeguard, weather, accuracy, evasion, etc
            showSpecialTrainerGraphics: true,

            //GAMESTATE VARIABLES (start at false for regular playthroughs)
            gameStarted:     false,
            starterReceived: false,
            inBattle:        false,

            //VARIABLES THAT STYLE ELEMENTS
            statLabelOpacityValueDefault: .75,
            statLabelOpacityValue:        .1,
            modColor:                     false,
            modRaise:                     "rgb(82, 82, 82)",
            modLower:                     "rgb(82, 82, 82)",
            modDefault:                   "rgb(0, 0, 0)",
            ppColor:                      false,
            ppHigh:                       "rgb(0, 0, 0)",
            ppMid:                        "rgb(121, 72, 0)",
            ppLow:                        "rgb(114, 0, 0)",
            rolloutCounterValue:          0,
            rolloutCounterCopy:           0,
            slotTimingFix:                false,

            //STORING DATA
            g2stateVariable:             "Base Stats",
            prevSpecies:                 undefined,
            expBarAnimation:             true,
            splitData:                   [],
            enemyModColour:              ["0", "background: #d84444;"],
            enemyState:                  "Pokemon", //"Pokemon", "Fainted"
            battleState:                 "Not In Battle",
            field_array:                 [null, 0],
            last_initiated_field_effect: "Reflect",

            //resets
            playerId:            MyStorage["playerId"] ?? 0,
            playerName:          "",
            resetCatcher:        "NINTEN",
            playerResets:        MyStorage["playerResets"] ?? 0,
            blackout_counter:    MyStorage["blackout_counter"] ?? 0,
            resetCounter:        true,
            game_over:           false,
            lance_defeated:      false,
            finished_logs:       false,
            attempt_number:      0,
            finished_run_count:  0,
            pb_time:             "None",
            most_recent_move:    "",
            split_logStr:        "",
            simple_data_str:     MyStorage["simple_data_str"]     ?? "",
            full_data_str:       MyStorage["full_data_str"]       ?? "",
            deprecated_data_str: MyStorage["deprecated_data_str"] ?? "",
            simple_data:         MyStorage["simple_data"]         ?? "",
            testRun:             MyStorage['testRun']             ?? false,

            blackouts_as_resets: MyStorage["blackouts_as_resets"] ?? false, //counts blackouts as resets
            blackout:            false,

            previous_splits: MyStorage['this.previous_splits'] ?? [],
            previous_splits_source: MyStorage['previous_splits_source'] ?? null,
            current_splits:  MyStorage['this.current_splits']  ?? [],

            stat_exp_hp_replacement: null,
            stat_exp_atk_replacement: null,
            stat_exp_def_replacement: null,
            stat_exp_spc_replacement: null,
            stat_exp_spe_replacement: null,

            //Pokemon settings for local storage
            overlay_color: MyStorage["overlay_color"] ?? "#000000",
            imageXOffset:  MyStorage["imageXOffset"]  ?? 0,
            imageYOffset:  MyStorage["imageYOffset"]  ?? 0,
            imageScale:    MyStorage["imageScale"]    ?? 1,
            imageFlip:     MyStorage["imageFlip"]     ?? false,
            imageSat:      MyStorage["imageSat"]      ?? 100,

            //background texture settings
            backgroundBlur:        MyStorage["backgroundBlur"]        ?? 0,
            backgroundScale:       MyStorage["backgroundScale"]       ?? 100,
            backgroundUrl:         MyStorage["backgroundUrl"]         ?? "",
            backgroundFlip:        MyStorage["backgroundFlip"]        ?? false,
            backgroundXFlip:       MyStorage["backgroundXFlip"]       ?? false,
            use_custom_background: MyStorage["use_custom_background"] ?? false,
            backgroundXOffset:     MyStorage["backgroundXOffset"]     ?? 0,
            backgroundYOffset:     MyStorage["backgroundYOffset"]     ?? 0,
            backgroundTexture:     MyStorage["backgroundTexture"]     ?? 'Bug 1',
            backgroundBrightness:  MyStorage["backgroundBrightness"]  ?? 100,
            backgroundContrast:    MyStorage["backgroundContrast"]    ?? 100,
            backgroundSaturation:  MyStorage["backgroundSaturation"]  ?? 100,
            backgroundHue:         MyStorage["backgroundHue"]         ?? 0,

            kanto_badges: MyStorage["kanto_badges"] ?? false,

            pokeball_translateX: MyStorage["pokeball_translateX"] ?? 0,
            pokeball_translateY: MyStorage["pokeball_translateY"] ?? 0,

            //backed up pokemon specific settings
            pokemon_settings: [
                "overlay_color",
                "imageXOffset",
                "imageYOffset",
                "imageScale",
                "imageFlip",
                "imageSat",
                "backgroundBlur",
                "backgroundScale",
                "backgroundUrl",
                "use_custom_background",
                "attempt_number",
                "finished_run_count",
                "pb_time",
                "backgroundXOffset",
                "backgroundYOffset",
                "backgroundTexture",
                "backgroundBrightness",
                "backgroundContrast",
                "backgroundSaturation",
                "backgroundHue",
                "backgroundFlip",
                "backgroundXFlip",
                "refilmed_attempt",
                "refilmed_finish",
                "toggle_compare_splits",
                "kanto_badges",
            ],

            //timer variables
            timer_startTimeOffset: MyStorage["timer_startTimeOffset"] ?? "00:00:00.00",
            timer_startTime      : MyStorage["timer_startTime"] ?? 0,
            timer_pause          : MyStorage["timer_pause"] ?? true,
            timer_formatted_time : MyStorage["timer_formatted_time"] ?? ["0", ".00"],
            timer_pause_time     : MyStorage["timer_pause_time"] ?? 0,
            timer_frame_live     : false, // the out-of-process clock is showing (core/overlay/ClockFrame.ts)
            time_h:  0,
            time_m:  0,
            time_s:  0,
            time_ms: 0,
            time_split_start: "00:00:00:00",
            battle_start:    0,
            battle_duration: MyStorage["this.battle_duration"] ?? 0,
            exp_per_second : MyStorage["this.exp_per_second"] ?? 0,
            timer_settings : MyStorage["timer_settings"] ?? "Real-Time",
            viridian_forest: MyStorage["viridian_forest"] ?? "Pidgey",

            //splits
            split_data: MyStorage["split_data"] ?? [],
            pb_splits:  MyStorage[`${this.starter}_pb_splits`] ?? [],

            //encounters
            route_29:     MyStorage["route_29"] ?? true,
            route_30:     MyStorage["route_30"] ?? true,
            route_31:     MyStorage["route_31"] ?? true,
            sprout_tower: MyStorage["sprout_tower"] ?? true,
            route_32:     MyStorage["route_32"] ?? true,
            union_cave:   MyStorage["union_cave"] ?? true,

            toggle_wEarlyEncounters                     : MyStorage["this.toggle_wEarlyEncounters"]                      ?? false,
            toggle_wGuaranteedCatches                   : MyStorage["this.toggle_wGuaranteedCatches"]                    ?? false,
            toggle_EVENT_ENCOUNTER_ROUTE29_TEST         : MyStorage["this.toggle_EVENT_ENCOUNTER_ROUTE29_TEST"]          ?? false,
            toggle_EVENT_ENCOUNTER_ROUTE31_BELLSPROUT   : MyStorage["this.toggle_EVENT_ENCOUNTER_ROUTE31_BELLSPROUT"]    ?? false,
            toggle_EVENT_ENCOUNTER_ROUTE32_BELLSPROUT   : MyStorage["this.toggle_EVENT_ENCOUNTER_ROUTE32_BELLSPROUT"]    ?? false,
            toggle_EVENT_ENCOUNTER_UNION_CAVE_SANDSHREW : MyStorage["this.toggle_EVENT_ENCOUNTER_UNION_CAVE_SANDSHREW"]  ?? false,
            toggle_EVENT_ENCOUNTER_ILEX_FOREST_PSYDUCK  : MyStorage["this.toggle_EVENT_ENCOUNTER_ILEX_FOREST_PSYDUCK"]   ?? false,
            toggle_EVENT_ENCOUNTER_ILEX_FOREST_ODDISH   : MyStorage["this.toggle_EVENT_ENCOUNTER_ILEX_FOREST_ODDISH"]    ?? false,
            toggle_EVENT_ENCOUNTER_ROUTE34_ABRA         : MyStorage["this.toggle_EVENT_ENCOUNTER_ROUTE34_ABRA"]          ?? false,
            toggle_EVENT_ENCOUNTER_NATIONAL_PARK_PSYDUCK: MyStorage["this.toggle_EVENT_ENCOUNTER_NATIONAL_PARK_PSYDUCK"] ?? false,
            toggle_EVENT_ENCOUNTER_OLIVINE_CITY_KRABBY  : MyStorage["this.toggle_EVENT_ENCOUNTER_OLIVINE_CITY_KRABBY"]   ?? false,
            toggle_EVENT_ENCOUNTER_VIOLET_CITY_POLIWAG  : MyStorage["this.toggle_EVENT_ENCOUNTER_VIOLET_CITY_POLIWAG"]   ?? false,
            toggle_EVENT_ENCOUNTER_ROUTE_29_SENTRET     : MyStorage["this.toggle_EVENT_ENCOUNTER_ROUTE_29_SENTRET"]      ?? false,
            toggle_EVENT_ENCOUNTER_ECRUTEAK_CITY_POLIWAG: MyStorage["this.toggle_EVENT_ENCOUNTER_ECRUTEAK_CITY_POLIWAG"] ?? false,
            encounter_routes: [
                "route_29",
                "route_30",
                "route_31",
                "sprout_tower",
                "route_32",
                "union_cave",
            ],

            // UI
            ui_saturation               : MyStorage["ui_saturation"]             ?? .6,
            ui_type_colors              : MyStorage["ui_type_colors"]            ?? "Bulbapedia Current",
            ui_type_color_modifier      : MyStorage["ui_type_color_modifier"]    ?? "current_",
            ui_type_icons               : MyStorage["ui_type_icons"]             ?? "2024",
            ui_type_icons_modifier      : MyStorage["ui_type_icons_modifier"]    ?? "2024/",
            ui_stats_styling            : MyStorage["ui_stats_styling"]          ?? "2024",
            ui_stats_styling_modifier   : MyStorage["ui_stats_styling_modifier"] ?? "",
            ui_stat_arrangement         : MyStorage['ui_stat_arrangement']          ?? "HP, Atk, Def, Spe, SpA, SpD",
            ui_stat_arrangement_modifier: MyStorage['ui_stat_arrangement_modifier'] ?? "hp_spe_",

            game_over_summary: MyStorage["this.game_over_summary"] ?? {
                "pokemon"  : "",
                "attempts" : 0,
                "finishes" : 0,
                "time"     : "0:00:00.00",
                "resets"   : 0,
                "blackouts": 0,
                "failures" : 0,
                "level"    : 0,
                "gametime" : "0:00",
                "bonks"    : 0,
            },

            // Battle Summary
            battle_summary_frames:        MyStorage['this.battle_summary_frames'] ?? 0,
            battle_summary_battle_number: MyStorage['this.battle_summary_battle_number'] ?? 0,
            battle_summary_exp_gained:    MyStorage['this.battle_summary_exp_gained'] ?? 0,
            battle_summary_turns:         MyStorage['this.battle_summary_turns'] ?? 0,
            battle_summary_player_turns:  MyStorage['this.battle_summary_player_turns'] ?? 0,
            battle_summary_enemy_turns:   MyStorage['this.battle_summary_enemy_turns'] ?? 0,
            battle_summary_player_hits:   MyStorage['this.battle_summary_player_hits'] ?? 0,
            battle_summary_player_misses: MyStorage['this.battle_summary_player_misses'] ?? 0,
            battle_summary_player_crits:  MyStorage['this.battle_summary_player_crits'] ?? 0,
            battle_summary_player_ohkos:  MyStorage['this.battle_summary_player_ohkos'] ?? 0,
            battle_summary_enemy_hits:    MyStorage['this.battle_summary_enemy_hits'] ?? 0,
            battle_summary_enemy_misses:  MyStorage['this.battle_summary_enemy_misses'] ?? 0,
            battle_summary_enemy_crits:   MyStorage['this.battle_summary_enemy_crits'] ?? 0,
            battle_summary_enemy_ohkos:   MyStorage['this.battle_summary_enemy_ohkos'] ?? 0,
            battle_summary_player_Sx:     MyStorage['this.battle_summary_player_Sx'] ?? 0,
            battle_summary_player_4x:     MyStorage['this.battle_summary_player_4x'] ?? 0,
            battle_summary_player_2x:     MyStorage['this.battle_summary_player_2x'] ?? 0,
            battle_summary_player_1x:     MyStorage['this.battle_summary_player_1x'] ?? 0,
            battle_summary_player_Hx:     MyStorage['this.battle_summary_player_Hx'] ?? 0,
            battle_summary_player_Qx:     MyStorage['this.battle_summary_player_Qx'] ?? 0,
            battle_summary_player_0x:     MyStorage['this.battle_summary_player_0x'] ?? 0,
            battle_summary_player_con:    MyStorage['this.battle_summary_player_con'] ?? 0,
            battle_summary_player_par:    MyStorage['this.battle_summary_player_par'] ?? 0,
            battle_summary_player_brn:    MyStorage['this.battle_summary_player_brn'] ?? 0,
            battle_summary_player_frz:    MyStorage['this.battle_summary_player_frz'] ?? 0,
            battle_summary_player_psn:    MyStorage['this.battle_summary_player_psn'] ?? 0,
            battle_summary_player_bpn:    MyStorage['this.battle_summary_player_bpn'] ?? 0,
            battle_summary_player_slp:    MyStorage['this.battle_summary_player_slp'] ?? 0,
            battle_summary_enemy_Sx:      MyStorage['this.battle_summary_enemy_Sx'] ?? 0,
            battle_summary_enemy_4x:      MyStorage['this.battle_summary_enemy_4x'] ?? 0,
            battle_summary_enemy_2x:      MyStorage['this.battle_summary_enemy_2x'] ?? 0,
            battle_summary_enemy_1x:      MyStorage['this.battle_summary_enemy_1x'] ?? 0,
            battle_summary_enemy_Hx:      MyStorage['this.battle_summary_enemy_Hx'] ?? 0,
            battle_summary_enemy_Qx:      MyStorage['this.battle_summary_enemy_Qx'] ?? 0,
            battle_summary_enemy_0x:      MyStorage['this.battle_summary_enemy_0x'] ?? 0,
            battle_summary_enemy_con:     MyStorage['this.battle_summary_enemy_con'] ?? 0,
            battle_summary_enemy_par:     MyStorage['this.battle_summary_enemy_par'] ?? 0,
            battle_summary_enemy_brn:     MyStorage['this.battle_summary_enemy_brn'] ?? 0,
            battle_summary_enemy_frz:     MyStorage['this.battle_summary_enemy_frz'] ?? 0,
            battle_summary_enemy_psn:     MyStorage['this.battle_summary_enemy_psn'] ?? 0,
            battle_summary_enemy_bpn:     MyStorage['this.battle_summary_enemy_bpn'] ?? 0,
            battle_summary_enemy_slp:     MyStorage['this.battle_summary_enemy_slp'] ?? 0,

            battle_summary_enemy_se:      MyStorage['this.battle_summary_enemy_se'] ?? 0,
            battle_summary_enemy_nve:     MyStorage['this.battle_summary_enemy_nve'] ?? 0,
            battle_summary_player_se:     MyStorage['this.battle_summary_player_se'] ?? 0,
            battle_summary_player_nve:    MyStorage['this.battle_summary_player_nve'] ?? 0,

            temp_battle_summary_frames:        MyStorage['this.temp_battle_summary_frames'] ?? 0,
            temp_battle_summary_battle_number: MyStorage['this.temp_battle_summary_battle_number'] ?? 0,
            temp_battle_summary_exp_gained:    MyStorage['this.temp_battle_summary_exp_gained'] ?? 0,
            temp_battle_summary_turns:         MyStorage['this.temp_battle_summary_turns'] ?? 0,
            temp_battle_summary_player_turns:  MyStorage['this.temp_battle_summary_player_turns'] ?? 0,
            temp_battle_summary_enemy_turns:   MyStorage['this.temp_battle_summary_enemy_turns'] ?? 0,
            temp_battle_summary_player_hits:   MyStorage['this.temp_battle_summary_player_hits'] ?? 0,
            temp_battle_summary_player_misses: MyStorage['this.temp_battle_summary_player_misses'] ?? 0,
            temp_battle_summary_player_crits:  MyStorage['this.temp_battle_summary_player_crits'] ?? 0,
            temp_battle_summary_player_ohkos:  MyStorage['this.temp_battle_summary_player_ohkos'] ?? 0,
            temp_battle_summary_enemy_hits:    MyStorage['this.temp_battle_summary_enemy_hits'] ?? 0,
            temp_battle_summary_enemy_misses:  MyStorage['this.temp_battle_summary_enemy_misses'] ?? 0,
            temp_battle_summary_enemy_crits:   MyStorage['this.temp_battle_summary_enemy_crits'] ?? 0,
            temp_battle_summary_enemy_ohkos:   MyStorage['this.temp_battle_summary_enemy_ohkos'] ?? 0,
            temp_battle_summary_player_Sx:     MyStorage['this.temp_battle_summary_player_Sx'] ?? 0,
            temp_battle_summary_player_4x:     MyStorage['this.temp_battle_summary_player_4x'] ?? 0,
            temp_battle_summary_player_2x:     MyStorage['this.temp_battle_summary_player_2x'] ?? 0,
            temp_battle_summary_player_1x:     MyStorage['this.temp_battle_summary_player_1x'] ?? 0,
            temp_battle_summary_player_Hx:     MyStorage['this.temp_battle_summary_player_Hx'] ?? 0,
            temp_battle_summary_player_Qx:     MyStorage['this.temp_battle_summary_player_Qx'] ?? 0,
            temp_battle_summary_player_0x:     MyStorage['this.temp_battle_summary_player_0x'] ?? 0,
            temp_battle_summary_player_con:    MyStorage['this.temp_battle_summary_player_con'] ?? 0,
            temp_battle_summary_player_par:    MyStorage['this.temp_battle_summary_player_par'] ?? 0,
            temp_battle_summary_player_brn:    MyStorage['this.temp_battle_summary_player_brn'] ?? 0,
            temp_battle_summary_player_frz:    MyStorage['this.temp_battle_summary_player_frz'] ?? 0,
            temp_battle_summary_player_psn:    MyStorage['this.temp_battle_summary_player_psn'] ?? 0,
            temp_battle_summary_player_bpn:    MyStorage['this.temp_battle_summary_player_bpn'] ?? 0,
            temp_battle_summary_player_slp:    MyStorage['this.temp_battle_summary_player_slp'] ?? 0,
            temp_battle_summary_enemy_Sx:      MyStorage['this.temp_battle_summary_enemy_Sx'] ?? 0,
            temp_battle_summary_enemy_4x:      MyStorage['this.temp_battle_summary_enemy_4x'] ?? 0,
            temp_battle_summary_enemy_2x:      MyStorage['this.temp_battle_summary_enemy_2x'] ?? 0,
            temp_battle_summary_enemy_1x:      MyStorage['this.temp_battle_summary_enemy_1x'] ?? 0,
            temp_battle_summary_enemy_Hx:      MyStorage['this.temp_battle_summary_enemy_Hx'] ?? 0,
            temp_battle_summary_enemy_Qx:      MyStorage['this.temp_battle_summary_enemy_Qx'] ?? 0,
            temp_battle_summary_enemy_0x:      MyStorage['this.temp_battle_summary_enemy_0x'] ?? 0,
            temp_battle_summary_enemy_con:     MyStorage['this.temp_battle_summary_enemy_con'] ?? 0,
            temp_battle_summary_enemy_par:     MyStorage['this.temp_battle_summary_enemy_par'] ?? 0,
            temp_battle_summary_enemy_brn:     MyStorage['this.temp_battle_summary_enemy_brn'] ?? 0,
            temp_battle_summary_enemy_frz:     MyStorage['this.temp_battle_summary_enemy_frz'] ?? 0,
            temp_battle_summary_enemy_psn:     MyStorage['this.temp_battle_summary_enemy_psn'] ?? 0,
            temp_battle_summary_enemy_bpn:     MyStorage['this.temp_battle_summary_enemy_bpn'] ?? 0,
            temp_battle_summary_enemy_slp:     MyStorage['this.temp_battle_summary_enemy_slp'] ?? 0,

            temp_battle_summary_enemy_se:      MyStorage['this.temp_battle_summary_enemy_se'] ?? 0,
            temp_battle_summary_enemy_nve:     MyStorage['this.temp_battle_summary_enemy_nve'] ?? 0,
            temp_battle_summary_player_se:     MyStorage['this.temp_battle_summary_player_se'] ?? 0,
            temp_battle_summary_player_nve:    MyStorage['this.temp_battle_summary_player_nve'] ?? 0,
        }
    },

    created() {
        if (MyStorage[this.starter]) {
              // this.overlay_color = MyStorage[this.starter].overlay_color ?? "#000000";
            this.imageXOffset          = MyStorage[this.starter].imageXOffset          ?? 0;
            this.imageYOffset          = MyStorage[this.starter].imageYOffset          ?? 0;
            this.imageScale            = MyStorage[this.starter].imageScale            ?? 1;
            this.imageFlip             = MyStorage[this.starter].imageFlip             ?? false;
            this.imageSat              = MyStorage[this.starter].imageSat              ?? 100
            this.backgroundBlur        = MyStorage[this.starter].backgroundBlur        ?? 0
            this.backgroundScale       = MyStorage[this.starter].backgroundScale       ?? 100
            this.backgroundUrl         = MyStorage[this.starter].backgroundUrl         ?? ""
            this.use_custom_background = MyStorage[this.starter].use_custom_background ?? false
            this.backgroundXOffset     = MyStorage[this.starter].backgroundXOffset     ?? 0
            this.backgroundYOffset     = MyStorage[this.starter].backgroundYOffset     ?? 0
            this.backgroundTexture     = MyStorage[this.starter].backgroundTexture     ?? 0
            this.refilmed_attempt      = MyStorage[this.starter].refilmed_attempt      ?? 0
            this.refilmed_finish       = MyStorage[this.starter].refilmed_finish       ?? 0
            this.toggle_compare_splits = MyStorage[this.starter].toggle_compare_splits ?? 'First'
        }
        for (let i = 0; i < this.auto_save_settings.length; i++) {
            let propName = this.auto_save_settings[i];
            this.$watch(
                () => this[propName], // Using a function to return the property's value
                (newValue) => {
                    MyStorage[`this.${propName}`] = newValue;
                }
            );
        }
        for (let i = 0; i < this.encounter_routes.length; i++) {
            let propName = this.encounter_routes[i];
            this.$watch(
                () => this[propName], // Using a function to return the property's value
                (newValue) => {
                    MyStorage[`${propName}`] = newValue;
                }
            );
        }
        for (let i = 0; i < this.pokemon_settings.length; i++) {
            let propName = this.pokemon_settings[i];
            this.$watch(
                () => this[propName],
                (newValue) => {
                    // Ensure that MyStorage[this.starter] is an object
                    if (!MyStorage[this.starter]) {
                        MyStorage[this.starter] = {};
                    }

                    // Set the new value
                    MyStorage[this.starter] = {
                            ...MyStorage[this.starter],
                            [propName]: newValue
                        };
                }
            );
        }
        this.crystal_trainer_list = this.keys_function(this.crystal_trainers)
    },

    watch: {
        toggle_wEarlyEncounters(newValue) {
            if (newValue == true) {
                this.game.properties.patch.wEarlyEncounters.set("On", false)
            }
            else {
                this.game.properties.patch.wEarlyEncounters.set("Off", false)
            }
        },
        toggle_wGuaranteedCatches(newValue) {
            this.game.properties.patch.hStpCatchRate.set(newValue, false)
        },
        toggle_EVENT_ENCOUNTER_ROUTE29_TEST(newValue) {
            this.game.properties.patch.encounter_flags.EVENT_ENCOUNTER_ROUTE29_TEST.set(newValue, false)
        },
        toggle_EVENT_ENCOUNTER_ROUTE31_BELLSPROUT(newValue) {
            this.game.properties.patch.encounter_flags.EVENT_ENCOUNTER_ROUTE31_BELLSPROUT.set(newValue, false)
        },
        toggle_EVENT_ENCOUNTER_ROUTE32_BELLSPROUT(newValue) {
            this.game.properties.patch.encounter_flags.EVENT_ENCOUNTER_ROUTE32_BELLSPROUT.set(newValue, false)
        },
        toggle_EVENT_ENCOUNTER_UNION_CAVE_SANDSHREW(newValue) {
            this.game.properties.patch.encounter_flags.EVENT_ENCOUNTER_UNION_CAVE_SANDSHREW.set(newValue, false)
        },
        toggle_EVENT_ENCOUNTER_ILEX_FOREST_PSYDUCK(newValue) {
            this.game.properties.patch.encounter_flags.EVENT_ENCOUNTER_ILEX_FOREST_PSYDUCK.set(newValue, false)
        },
        toggle_EVENT_ENCOUNTER_ILEX_FOREST_ODDISH(newValue) {
            this.game.properties.patch.encounter_flags.EVENT_ENCOUNTER_ILEX_FOREST_ODDISH.set(newValue, false)
        },
        toggle_EVENT_ENCOUNTER_ROUTE34_ABRA(newValue) {
            this.game.properties.patch.encounter_flags.EVENT_ENCOUNTER_ROUTE34_ABRA.set(newValue, false)
        },
        toggle_EVENT_ENCOUNTER_NATIONAL_PARK_PSYDUCK(newValue) {
            this.game.properties.patch.encounter_flags.EVENT_ENCOUNTER_NATIONAL_PARK_PSYDUCK.set(newValue, false)
        },
        toggle_EVENT_ENCOUNTER_OLIVINE_CITY_KRABBY(newValue) {
            this.game.properties.patch.encounter_flags.EVENT_ENCOUNTER_OLIVINE_CITY_KRABBY.set(newValue, false)
        },
        toggle_EVENT_ENCOUNTER_VIOLET_CITY_POLIWAG(newValue) {
            this.game.properties.patch.encounter_flags.EVENT_ENCOUNTER_VIOLET_CITY_POLIWAG.set(newValue, false)
        },
        toggle_EVENT_ENCOUNTER_ECRUTEAK_CITY_POLIWAG(newValue) {
            this.game.properties.patch.encounter_flags.EVENT_ENCOUNTER_ECRUTEAK_CITY_POLIWAG.set(newValue, false)
        },
        toggle_EVENT_ENCOUNTER_ROUTE_29_SENTRET(newValue) {
            this.game.properties.patch.encounter_flags.EVENT_ENCOUNTER_ROUTE_29_SENTRET.set(newValue, false)
        },
        starter(newValue, oldValue) {
            this.pokemon_gender = this.pokemon_gender_list == ['Unknown'] ? "Unknown" : MyStorage["pokemon_gender"] ?? "Male"
            this.overlay_color =         MyStorage[`${newValue}`]?.overlay_color         ?? this.default_colors[`${dexDataCrystal[newValue].type_1}`],
            this.backgroundTexture =     MyStorage[`${newValue}`]?.backgroundTexture     ?? `${this.dexDataCrystal[newValue].type_1.toLowerCase()}`
            this.backgroundBlur =        MyStorage[`${newValue}`]?.backgroundBlur        ?? 0,
            this.backgroundScale =       MyStorage[`${newValue}`]?.backgroundScale       ?? 100,
            this.backgroundUrl =         MyStorage[`${newValue}`]?.backgroundUrl         ?? "",
            this.backgroundFlip =        MyStorage[`${newValue}`]?.backgroundFlip        ?? false,
            this.backgroundXFlip =       MyStorage[`${newValue}`]?.backgroundXFlip       ?? false,
            this.use_custom_background = MyStorage[`${newValue}`]?.use_custom_background ?? false,
            this.backgroundXOffset =     MyStorage[`${newValue}`]?.backgroundXOffset     ?? 0,
            this.backgroundYOffset =     MyStorage[`${newValue}`]?.backgroundYOffset     ?? 0,
            this.backgroundBrightness =  MyStorage[`${newValue}`]?.backgroundBrightness  ?? 100,
            this.backgroundContrast =    MyStorage[`${newValue}`]?.backgroundContrast    ?? 100,
            this.backgroundSaturation =  MyStorage[`${newValue}`]?.backgroundSaturation  ?? 100,
            this.backgroundHue =         MyStorage[`${newValue}`]?.backgroundHue         ?? 100,
            this.kanto_badges =          MyStorage[`${newValue}`]?.kanto_badges          ?? false,

            this.attempt_number =        MyStorage[`${newValue}`]?.attempt_number        ?? 0,
            this.finished_run_count =    MyStorage[`${newValue}`]?.finished_run_count    ?? 0,

            MyStorage['starter'] = newValue

            // Re-apply HP DVs when starter changes (gender ratio may be different)
            this.updateHiddenPowerDVs()

            // Set the new value for hChosenStarter so that the ROM responds to the change
            this.set_rom_starter()
        },
        current_splits: {
            handler: function (newVal, oldVal) {
                MyStorage['this.current_splits'] = newVal
            },
            deep: true,
        },
        previous_splits: {
            handler: function (newVal, oldVal) {
                MyStorage['this.previous_splits'] = newVal
            },
            deep: true,
        },
        previous_splits_source(newVal) {
            MyStorage['previous_splits_source'] = newVal
        },
        ui_stat_arrangement(newValue) {
            if (newValue == 'HP, Atk, Def, SpA, SpD, Spe') {
                this.ui_stat_arrangement_modifier = "hp_spe_"
            }
            if (newValue == 'HP, Atk, Def, Spe, SpA, SpD') {
                this.ui_stat_arrangement_modifier = "hp_spd_"
            }
        },
        bonk(newValue) {
            MyStorage[`this.bonk`] = newValue;
            console.log("got here")
            // Dynamically assign bonk placement CSS class based on the changed value
            let bonks = document.getElementById("#bonks");
            if (!bonks) { return }
            let held_item = this.game.properties.player.team[0].heldItem.value;
            console.log(bonks)
            console.log(held_item)
            if (held_item) { 
                bonks.classList.add('slide-down') 
                bonks.classList.remove('slide-up') 
            }
            else { 
                bonks.classList.add('slide-up') 
                bonks.classList.remove('slide-down') 
            }
        },
        ui_stats_styling(newValue) {
            if (newValue == '2024') {
                this.ui_stats_styling_modifier = ""
            }
            if (newValue == '2023') {
                this.ui_stats_styling_modifier = "old_"
            }
        },
        ui_type_icons(newValue) {
            if (newValue == '2024') {
                this.ui_type_icons_modifier = "2024/"
            }
            if (newValue == '2023') {
                this.ui_type_icons_modifier = ""
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
        // timeOfDay_user(value) {
        //     MyStorage["timeOfDay_user"] = value
        // },
        pokemon_gender(newValue) {
            MyStorage["pokemon_gender"] = newValue
            // Re-apply HP DVs when gender changes
            this.$nextTick(() => {
                this.updateHiddenPowerDVs()
            })
        },
        hpType(newValue) {
            MyStorage["hpType"] = newValue
            // Re-apply HP DVs when HP type changes
            this.$nextTick(() => {
                this.updateHiddenPowerDVs()
            })
        },
        dv_mode(newValue) {
            MyStorage["dv_mode"] = newValue
            this.$nextTick(() => {
                this.updateHiddenPowerDVs()
            })
        },
        manual_dvs: {
            handler(newValue) {
                MyStorage["manual_dvs"] = newValue
                this.$nextTick(() => {
                    this.updateHiddenPowerDVs()
                })
            },
            deep: true,
        },
        //timer functions
        timer_formatted_time(value) {
            MyStorage["timer_formatted_time"] = value
        },
        timer_startTime(value) {
            MyStorage["timer_startTime"] = value
        },
        timer_pause(value) {
            MyStorage["timer_pause"] = value
        },
        timer_pause_time(value) {
            MyStorage["timer_pause_time"] = value
        },
        playerId(newValue) {
            MyStorage["playerId"] = newValue
            this.game_over = false;
            if(this.game.properties.player.money == 3000 && this.game.properties.gameTime.seconds == 0) {
                //check to ensure we're on the new game screen
                MyStorage["playerResets"] = 0
                this.playerResets = 0;
                this.finished_logs == false;
                MyStorage["blackout_counter"] = 0
                this.blackout_counter = 0;
            }
        },    
        playerResets(newProp) {
            // Select the div
            // let resets = document.querySelector('#resets');
            // if (newProp == 0) {
            //     resets.classList.add('push-off-to-left');
            //     resets.classList.remove('push-on-from-left');

            //     held_item.classList.add('held_item_no_resets');
            //     held_item.classList.remove('held_item_off');
            //     held_item.classList.remove('held_item_on');
            // }
            // else {
            //     resets.classList.add('push-on-from-left');
            //     resets.classList.remove('push-off-to-left');

            //     if (this.game.properties.player.team[0].heldItem.value == null) {
            //         held_item.classList.add('held_item_off');
            //         held_item.classList.remove('held_item_on');
            //         held_item.classList.remove('held_item_no_resets');
            //     }
            //     else {
            //         held_item.classList.add('held_item_on');
            //         held_item.classList.remove('held_item_off');
            //         held_item.classList.remove('held_item_no_resets');
            //     }
            // }

            if (newProp.toString().length == 1) {
                document.getElementById("reset_counter").style.fontSize = "75px"
            }
            if (newProp.toString().length == 3) {
                document.getElementById("reset_counter").style.fontSize = "54px"
            }
            if (newProp.toString().length == 4) {
                document.getElementById("reset_counter").style.fontSize = "40px"
            }
            
            if (this.playerResets < 0) {
                this.playerResets = 0;
            }
            this.blackout == false
            MyStorage["playerResets"] = this.playerResets
        },
        blackout_counter(newProp) {
            if (this.blackout_counter < 0) {
                this.blackout_counter = 0;
            }
            MyStorage["blackout_counter"] = this.blackout_counter
        },
        rockTunnelDarkness() {
            if (this.rockTunnelDarkness == true && (this.game.properties.overworld.map.value == "Rock Tunnel - 1" || this.game.properties.overworld.map.value == "Rock Tunnel")) {
                this.game.properties.overworld.mapData.palette.set(0, false)
            }
            else if (this.rockTunnelDarkness == false && (this.game.properties.overworld.map.value == "Rock Tunnel - 1" || this.game.properties.overworld.map.value == "Rock Tunnel")) {
                this.game.properties.overworld.mapData.palette.set(6, false)
            }
            else {
                return
            }
        },  
        playerNameChoice() {
            this.overlay_color = `lch(75% 100 ${hash(this.playerNameChoice) % 360})`
            MyStorage["playerNameChoice"] = this.playerNameChoice
            MyStorage["overlay_color"] = this.overlay_color
        },
        testRun(newProp) {
            MyStorage['testRun'] = newProp
        },
        playerName(newName) {
            MyStorage['playerName'] = newName;
        },
        g2stateVariable(newValue) {
            if (newValue == "To Battle" && this.automatic_splits == true && this.game.properties.battle.mode.value == "Trainer") {
                this.automatic_splits = false
                this.right_panel = 'Battle Graphic'
            }
        },
    },

    //FUNCTIONS ----------------------------------------------------------------//
    computed: {
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
        /**
         * The Super Shuckie counters as primitives (2026-09-25): the template used to read
         * `emulatorStats?.counters?.x` directly, which made every poll that replaced
         * `emulatorStats` a re-render of this whole component. A computed that yields the
         * same primitive as before triggers nothing.
         */
        shuckie_player_resets() {
            return this.emulatorStats?.counters?.playerResets
        },
        shuckie_blackout_counter() {
            return this.emulatorStats?.counters?.blackout_counter
        },
        /**
         * The movepool table's rows, computed once per displayed species. The template
         * called getMovepool() once per row group on every render, and each call resolved
         * every learnset entry against the moves table by a case-insensitive key scan
         * (docs/performance-followups.md, third pass).
         */
        movepoolRows() {
            return this.getMovepool(this.dexDataCrystal, this.g2MoveData, this.tmhmMapping, this.s1dynamicReset.species.value)
        },
        get_held_item() {
            const debugging = true
            const item = this.game.properties.player.team[0].heldItem.value
            const bytes = this.game.properties.player.team[0].heldItem.bytes
            const species = this.game.properties.player.team[0].species.value
            const starter = this.starter
            const mega_stones = {
                "Mega Abomasnow":          "Abomasite",
                "Mega Absol":              "Absolite",
                "Mega Absol Z":            "Absolite Z",
                "Mega Aerodactyl":         "Aerodactylite",
                "Mega Aggron":             "Aggronite",
                "Mega Alakazam":           "Alakazite",
                "Mega Altaria":            "Altarianite",
                "Mega Ampharos":           "Ampharosite",
                "Mega Audino":             "Audinite",
                "Mega Banette":            "Banettite",
                "Mega Barbaracle":         "Barbaracite",
                "Mega Baxcalibur":         "Baxcalibrite",
                "Mega Beedrill":           "Beedrillite",
                "Mega Blastoise":          "Blastoisinite",
                "Mega Blaziken":           "Blazikenite",
                "Mega Camerupt":           "Cameruptite",
                "Mega Chandelure":         "Chandelurite",
                "Mega Charizard X":        "Charizardite X",
                "Mega Charizard Y":        "Charizardite Y",
                "Mega Chesnaught":         "Chesnaughtite",
                "Mega Chimecho":           "Chimechite",
                "Mega Clefable":           "Clefablite",
                "Mega Crabominable":       "Crabominite",
                "Mega Darkrai":            "Darkranite",
                "Mega Delphox":            "Delphoxite",
                "Mega Diancie":            "Diancite",
                "Mega Dragalge":           "Dragalgite",
                "Mega Dragonite":          "Dragoninite",
                "Mega Drampa":             "Drampanite",
                "Mega Eelektross":         "Eelektrossite",
                "Mega Emboar":             "Emboarite",
                "Mega Excadrill":          "Excadrite",
                "Mega Falinks":            "Falinksite",
                "Mega Feraligatr":         "Feraligite",
                "Mega Floette":            "Floettite",
                "Mega Froslass":           "Froslassite",
                "Mega Gallade":            "Galladite",
                "Mega Garchomp":           "Garchompite",
                "Mega Garchomp Z":         "Garchompite Z",
                "Mega Gardevoir":          "Gardevoirite",
                "Mega Gengar":             "Gengarite",
                "Mega Glalie":             "Glalitite",
                "Mega Glimmora":           "Glimmoranite",
                "Mega Golisopod":          "Golisopite",
                "Mega Golurk":             "Golurkite",
                "Mega Greninja":           "Greninjite",
                "Mega Gyarados":           "Gyaradosite",
                "Mega Hawlucha":           "Hawluchanite",
                "Mega Heatran":            "Heatranite",
                "Mega Heracross":          "Heracronite",
                "Mega Houndoom":           "Houndoominite",
                "Mega Kangaskhan":         "Kangaskhanite",
                "Mega Latias":             "Latiasite",
                "Mega Latios":             "Latiosite",
                "Mega Lopunny":            "Lopunnite",
                "Mega Lucario":            "Lucarionite",
                "Mega Lucario Z":          "Lucarionite Z",
                "Mega Magearna":           "Magearnite",
                "Mega Malamar":            "Malamarite",
                "Mega Manectric":          "Manectite",
                "Mega Mawile":             "Mawilite",
                "Mega Medicham":           "Medichamite",
                "Mega Meganium":           "Meganiumite",
                "Mega Meowstic":           "Meowsticite",
                "Mega Metagross":          "Metagrossite",
                "Mega Mewtwo X":           "Mewtwonite X",
                "Mega Mewtwo Y":           "Mewtwonite Y",
                "Mega Pidgeot":            "Pidgeotite",
                "Mega Pinsir":             "Pinsirite",
                "Mega Pyroar":             "Pyroarite",
                "Mega Raichu X":           "Raichunite X",
                "Mega Raichu Y":           "Raichunite Y",
                "Mega Sableye":            "Sablenite",
                "Mega Salamence":          "Salamencite",
                "Mega Sceptile":           "Sceptilite",
                "Mega Scizor":             "Scizorite",
                "Mega Scolipede":          "Scolipite",
                "Mega Scovillain":         "Scovillainite",
                "Mega Scrafty":            "Scraftinite",
                "Mega Sharpedo":           "Sharpedonite",
                "Mega Skarmory":           "Skarmorite",
                "Mega Slowbro":            "Slowbronite",
                "Mega Staraptor":          "Staraptite",
                "Mega Starmie":            "Starminite",
                "Mega Steelix":            "Steelixite",
                "Mega Swampert":           "Swampertite",
                "Mega Tatsugiri Curly":    "Tatsugirinite",
                "Mega Tatsugiri Droopy":   "Tatsugirinite",
                "Mega Tatsugiri Stretchy": "Tatsugirinite",
                "Mega Tyranitar":          "Tyranitarite",
                "Mega Venusaur":           "Venusaurite",
                "Mega Victreebel":         "Victreebelite",
                "Mega Zeraora":            "Zeraorite",
                "Mega Zygarde":            "Zygardite",
            }
            console.log(item, bytes)
            if (debugging) {
            }

            if (item == null) {
                return ""
            }
            else if (bytes == 25 && species == 'Backport') {
                return mega_stones[starter]
            }
            else {
                return item
            }
        },
        pokemon_gender_ratio() {
            const starter = this.starter
            const dex_data = this.dexDataCrystal[starter].gender_ratio
            switch (dex_data) {
                case 'GENDER_UNKNOWN':
                    return "Unknown"
                case 'GENDER_F50':
                    return "50M / 50F"
                case 'GENDER_F12_5':
                    return "87.5M / 12.5F"
                case 'GENDER_F25':
                    return "75M / 25F"
                case 'GENDER_F75':
                    return "25M / 75F"
                case 'GENDER_F100':
                    return "0M / 100F"
                case 'GENDER_F0':
                    return "100M / 0F"
            }
        },
        pokemon_gender_list() {
            const starter = this.starter
            const dex_data = this.dexDataCrystal[starter].gender_ratio
            if (dex_data == 'GENDER_UNKNOWN') {
                return ["Unknown"]
            }
            return ["Male", "Female"]
        },
        // Returns the current HP DVs configuration based on selected gender and HP type
        currentHpDVs() {
            const starter = this.starter
            const genderRatio = this.dexDataCrystal[starter].gender_ratio
            return this.getHiddenPowerDVs(this.hpType, this.pokemon_gender, genderRatio)
        },
        // Returns the Hidden Power base power for the current DV configuration
        currentHpPower() {
            const dvs = this.currentHpDVs
            // HP Power formula with Speed=15, Special=15:
            // Power = ((5*v + upperZ)/2) + (5*w) + (10*x) + (20*y) + 31
            // where y = atk >> 3, x = def >> 3, v = spc >> 3 = 1, w = spe >> 3 = 1, upperZ = spc % 4 = 3
            const y = dvs.atk >> 3
            const x = dvs.def >> 3
            return 40 + (10 * x) + (20 * y)
        },
        /**
         * The DVs the starter is given (2026-09-17): the Hidden Power dropdown's Atk/Def with
         * Spe/Spc at 15 in Automatic (what the patch byte plus its fixed nibbles produce), the
         * four fields in Manual. `hp` is the derived nibble either way.
         */
        starterDVs() {
            if (this.dv_mode == IV_MODE.manual) {
                const dvs = clampDvs(this.manual_dvs)
                return { ...dvs, hp: hpDvOf(dvs) }
            }
            const auto = this.currentHpDVs
            const dvs = { atk: auto.atk, def: auto.def, spe: 15, spc: 15 }
            return { ...dvs, hp: hpDvOf(dvs) }
        },
        /** The patch byte for the starter's Atk/Def DVs: high nibble Attack, low nibble Defense. */
        starterDVByte() {
            return ((this.starterDVs.atk & 0xF) << 4) | (this.starterDVs.def & 0xF)
        },
        manualHiddenPower() {
            return gen2HiddenPower(clampDvs(this.manual_dvs))
        },
        /** The Hidden Power the starter's spread yields (the movepool row and the stats header). */
        starterHiddenPower() {
            return gen2HiddenPower(this.starterDVs)
        },
        manualGender() {
            return gen2Gender(clampDvs(this.manual_dvs).atk, this.dexDataCrystal[this.starter]?.gender_ratio)
        },
        hp_tracker_style() {
            const state = this.game.properties.meta.state.value
            const hp = this.game.properties.player.team[0].hp.value
            const hp_max = this.game.properties.player.team[0].maxHp.value
            const hp_percentage = hp / hp_max
            const status_condition = this.game.properties.player.team[0].statusCondition.value
            if (state == "Overworld" && hp_percentage != 1) {
                return "--overlay-color: rgb(255, 167, 167);"
            }
            else if (status_condition != null) {
                return "--overlay-color: rgb(98, 192, 255);"
            }
            else {
                return "--overlay-color: #39b54a;"
            }
        },
        blackouts_resets() {
            var resets = 0
            var blackouts = 0
            const allow_none = true // Toggle that allows for the UI to display no border if there are no faults
            if (this.shuckie_counters == true) {
                resets = this.emulatorStats?.counters?.playerResets ?? 0
                blackouts = this.emulatorStats?.counters?.blackout_counter ?? 0
            }
            else {
                resets = this.playerResets
                blackouts = this.blackout_counter
            }

            if (allow_none == true && blackouts == 0 && resets == 0) {
                return "None"
            }
            else if (blackouts == 0 && resets > 0) {
                return "Resets"
            }
            else if (blackouts > 0 && resets == 0) {
                return "Blackouts"
            }
            else {
                return "Both"
            }
        },
        examined_trainer_data() {
            var trainer = this.examined_trainer
            var data = this.crystal_trainers[trainer] ?? { name: "Unknown"}
            console.log(data)
            return data
        },
        filtered_trainer_list() {
            if (this.search_trainers === '') {
                return this.crystal_trainer_list;
            } else {
                return this.crystal_trainer_list.filter(pokemon => pokemon.toLowerCase().includes(this.search_trainers.toLowerCase()));
            }
        },
        filtered_pokemon_list() {
            if (this.search_term === '') {
                return this.pokemon_list;
            } else {
                return this.pokemon_list.filter(pokemon => pokemon.toLowerCase().includes(this.search_term.toLowerCase()));
            }
        },
        compare_splits() {
            if (this.collect_split_data == true) {
                // First mode: use default order, no CSV needed
                if (this.toggle_compare_splits === 'First') {
                    const result = []
                    const completedTrainers = new Set()
                    // Add completed splits first, in the order they were completed
                    for (const cur_split of this.effective_current_splits) {
                        if (this.default_split_order.includes(cur_split.trainer) && !completedTrainers.has(cur_split.trainer)) {
                            result.push({trainer: cur_split.trainer, current_time: cur_split.time})
                            completedTrainers.add(cur_split.trainer)
                        }
                    }
                    // Add remaining uncompleted splits in default order
                    for (const trainer of this.default_split_order) {
                        if (!completedTrainers.has(trainer)) {
                            result.push({trainer: trainer, current_time: "-"})
                        }
                    }
                    return result
                }
                // Followup modes: compare against loaded CSV splits
                const result = []
                const addedTrainers = new Set();
                for (const x of this.previous_splits) {
                    if (this.split_trainers.includes(x.trainer)) {
                        const default_string = "-"
                        const cur_split = this.effective_current_splits.find(y => y.trainer === x.trainer)
                        const prev = this.convertDurationToSeconds(x.time)
                        if (cur_split == undefined) {
                            if (!addedTrainers.has(x.trainer)) {
                                result.push({trainer: x.trainer, previous_time: this.convertSecondsToDuration(prev), current_time: default_string, difference: default_string})
                                addedTrainers.add(x.trainer);
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
                        if (!addedTrainers.has(x.trainer)) {
                            result.push({trainer: x.trainer, previous_time: this.convertSecondsToDuration(prev), current_time: this.convertSecondsToDuration(cur), difference: diff_str})
                            addedTrainers.add(x.trainer);
                        }
                    }
                }
                return result
            }
        },
        growth_rate() {
            return this.growthRate(dexDataCrystal[this.starter].growth_rate)
        },
        stats_header() {
            const toggle    = true
            const stat_type = this.stats_setting
            const year      = this.ui_stats_styling_modifier
            const state     = this.g2stateVariable
            if (year == '2023') {
                if (this.game.properties.events.elm_called_about_stolen_pokemon.value == false) {
                    return `DVs`
                }
                switch (state) {
                    case "Base Stats":  return `Base Stats`
                    case "Overworld":   return `Level ${this.game.properties.player.team[0].level.value}`
                    case "To Battle":   return `Level ${this.game.properties.player.team[0].level.value}`
                    case "From Battle": return `Level ${this.game.properties.battle.yourPokemon.level.value}`
                    case "Battle":      return `Level ${this.game.properties.battle.yourPokemon.level.value}`
                }
            }
            else {
                // if (this.game.properties.events.elm_called_about_stolen_pokemon.value == false && this.g2stateVariable != 'Base Stats') {
                //     return `DVs`
                // }
                switch (stat_type) {
                    case "Base Stats":   return `Base Stats`
                    case "DVs":          return `DVs`
                    case "Hidden Power": return `Hidden Power ${this.starterHiddenPower.type}`
                    case "EVs":          return `Stat Experience`
                    case "Vitamins":     return `Vitamins`
                    case "Detailed EVs": return `Stat Experience`
                    case "Automatic":    {
                        if (state == 'Base Stats') {
                            return `Base Stats`
                        }
                        return `Level ${this.game.properties.player.team[0].level.value}`
                    }
                    case "Badge Boosts": return `Level ${this.game.properties.player.team[0].level.value}`
                }
            }
        },
        enemy_trainer() {
            const trainer = this.capitalization_format(this.game.properties.battle.trainer.class.value)
            const id = this.game.properties.battle.trainer.id.value
            const identifier = `${trainer} ${id}`
            // console.log(trainer)
            // console.log(id)
            // console.log(identifier)
            if (this.g2stateVariable == 'To Battle' || this.g2stateVariable == 'Battle' || this.g2stateVariable == 'From Battle') {
                return this.crystal_trainers[identifier]
            }
        },
        gametimeSplit() {
            h = this.game.properties.gameTime.hours
            m = this.game.properties.gameTime.minutes
            timecode = h + ":" + m.toString().padStart(2, "0")
            return timecode
        },
        dropdownDownMenuKeys() {
            return {
                textures: Object.keys(this.textures)
            }
        },
        //Show the platform (GB, GBA) that the game is being played on.
        platform() {
            return this.game?.meta?.platform
        },
        //Show the version of the game (Yellow, Crystal, Emerald, FireRed, Platinum)
        version() {
            return "Pokemon Crystal"
        },
        //returns a generation tag to be used in selecting data files and objects (ie. g1PokemonData, g2MoveData, g3TypeEffectiveness)
        generation() {
            switch (this.version) {
                case "Pokemon Red and Blue":
                case "Pokemon Yellow":
                    return "g1"
                case "Pokemon Gold and Silver":
                case "Pokemon Crystal":
                    return "g2"
                case "Pokemon Ruby and Sapphire":
                case "Pokemon Emerald":
                    return "g3"
                case "Pokemon FireRed and LeafGreen":
                    return "g3Remakes"
                case "Pokemon Diamond and Pearl":
                case "Pokemon Platinum":
                case "Pokemon HeartGold and SoulSilver":
                    return "g4"
                case "Pokemon Black and White":
                case "Pokemon Black 2 and White 2":
                    return "g5"
            }
        },
        //Selects which game is being played and correctly assigns a state tracker.
        stateSelector() {
            switch (this.version) {
                case "Pokemon Red and Blue":
                case "Yellow":
                    return "g1State"
                case "Pokemon Gold and Silver":
                case "Crystal":
                    return "g2State"
                case "Pokemon Ruby and Sapphire":
                case "Emerald":
                    return "g3State"
                case "Pokemon FireRed and LeafGreen":
                    return "g3StateRemakes"
                case "Pokemon Diamond and Pearl":
                case "Pokemon Platinum":
                case "Pokemon HeartGold and SoulSilver":
                    return "g4State"
                case "Pokemon Black and White":
                case "Pokemon Black 2 and White 2":
                    return "g5State"
            }
        },
        battEn() {
            return this.game?.properties?.battle?.enemyPokemon
        },
        s1dynamic() {
            if (this.g2stateVariable == `Battle`) {
                return this.game?.properties?.battle?.yourPokemon
            }
            else {
                return this.game?.properties?.player?.team[0]
            }
        },
        s1dynamicReset() {
            if (this.batt?.yourPokemon.species.value == 'Backport' && this.g2stateVariable == `Battle`) {
                var data = this.batt?.yourPokemon
                data.species.value = this.starter
                return data
            }
            else if (this.g2stateVariable == `Battle`) {
                return this.batt?.yourPokemon
            }
            else if (this.g2stateVariable == `Base Stats` || this.game?.properties?.player?.team[0].species.value == null) {
                var data = this.dexDataCrystal[this.starter]
                return {
                    species: { value: data["name"] },
                    ...data
                }
            }
            else if (this.game?.properties?.player?.team[0].species.value == 'Backport') {
                var data = this.dexDataCrystal[this.starter]
                return {
                    species: { value: data["name"] },
                    ...data
                }
            }
            else {
                return this.map?.player?.team[0]
            }
        },
        //BATTLE FADE
        battle_fade() {
            if (
            (this.batt.trainer.class.value == "WILL" ||
            // this.batt.trainer.class.value == "CLAIR" ||
            this.batt.trainer.class.value == "KOGA" ||
            this.batt.trainer.class.value == "BRUNO" ||
            this.batt.trainer.class.value == "KAREN" ||
            this.batt.trainer.class.value == "BLUE" ||
            this.batt.trainer.class.value == "RED" ||
            this.batt.trainer.class.value == "CHAMPION") &&
            (this.g2stateVariable == "To Battle" ||
            this.g2stateVariable == "Battle" ||
            this.g2stateVariable == "From Battle")
            ) {
                return true
            }
            else if (
            this.g2stateVariable == "To Battle" ||
            this.g2stateVariable == "Battle") {
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
                fieldArray[5] = this.batt.field.weatherCount.value
                fieldArray[6] = true
            }
            if (this.batt.field.player.statusReflect.value == true) {
                fieldArray[2] = "Reflect"
                fieldArray[3] = this.batt.field.player.reflectCount.value
                fieldArray[6] = true
            }
            if (this.batt.field.player.statusLightScreen.value == true) {
                fieldArray[0] = "Light Screen"
                fieldArray[1] = this.batt.field.player.lightScreenCount.value
                fieldArray[6] = true
            }
            return fieldArray
        },
        //SELECT THE RELEVANT FIELD MOVE
        field_selector() {
            var reflect = [this.batt.field.player?.reflectCount?.value, this.batt.field?.player?.statusReflect?.value, "Reflect"]
            var lightscreen = [this.batt.field?.player?.lightScreenCount?.value, this.batt.field?.player?.statusLightScreen?.value, "Light Screen"]
            var safeguard = [this.batt.field?.player?.safeguardCount?.value, this.batt.field?.player?.statusSafeguard?.value, "Safeguard"]
            var weather = [this.batt.field?.weatherCount?.value, this.weather_boolean, this.pascalCaseSpace(this.camelCase(this.batt.field?.weather?.value?.toLowerCase()))]
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
        field_effect_array() {
            if (this.g2stateVariable == `Battle`) {
                var reflect = this.batt.field.player.statusReflect?.value
                var reflectCount = this.batt.field.player.reflectCount?.value
                var lightscreen = this.batt.field.player.statusLightScreen?.value
                var lightscreenCount = this.batt.field.player.lightScreenCount?.value
                var safeguard = this.batt.field.player.statusSafeguard?.value
                var safeguardCount = this.batt.field.player.safeguardCount?.value
                var weather = this.batt.field.weather?.value
                var weatherCount = this.batt.field.weatherCount?.value
                return [
                    ["Reflect", reflect, reflectCount,],
                    ["Light Screen", lightscreen, lightscreenCount,],
                    ["Safeguard", safeguard, safeguardCount,],
                    [weather, weather, weatherCount,],
                ]
            }
            else {
                return [
                    ["Reflect", false, 0,],
                    ["Light Screen", false, 0,],
                    ["Safeguard", false, 0,],
                    [weather, false, 0,],
                ]
            }
        },
    },

    methods: {
        rareCandyStatus(candyKey) {
            const rareCandyValue = this.game?.properties?.events?.rare_candies?.[candyKey]?.value;
            if (typeof rareCandyValue !== "boolean") {
                return null;
            }
            return rareCandyValue;
        },
        rareCandyStatusText(candyKey) {
            const status = this.rareCandyStatus(candyKey);
            if (status === true) return "Obtained";
            if (status === false) return "Not Obtained";
            return "Unknown";
        },
        rareCandyStatusClass(candyKey) {
            const status = this.rareCandyStatus(candyKey);
            if (status === true) return "candy-status candy-status--obtained";
            if (status === false) return "candy-status candy-status--missing";
            return "candy-status candy-status--unknown";
        },
        sendObsChapterMarker(chapterName) {
            // Byte-for-byte the same obs-websocket v5 exchange as gen1's; the shared
            // client reads the url/password from the same key names (plan 1.9). The same
            // marker goes to Super Shuckie as a replay bookmark (core/logic/shuckieBookmarks.ts).
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
            const storageKey = this.starter;
            StyleSettingsUtils.resetToDefaults(storageKey);
            // Reload the styles from defaults
            const defaults = MyStorage[this.starter];
            if (defaults) {
                this.overlay_color         = defaults.overlay_color         ?? this.default_colors[`${dexDataCrystal[this.starter].type_1}`];
                this.backgroundTexture     = defaults.backgroundTexture     ?? `${this.dexDataCrystal[this.starter].type_1.toLowerCase()}`;
                this.backgroundBlur        = defaults.backgroundBlur        ?? 0;
                this.backgroundScale       = defaults.backgroundScale       ?? 100;
                this.backgroundUrl         = defaults.backgroundUrl         ?? "";
                this.backgroundFlip        = defaults.backgroundFlip        ?? false;
                this.backgroundXFlip       = defaults.backgroundXFlip       ?? false;
                this.use_custom_background = defaults.use_custom_background ?? false;
                this.backgroundXOffset     = defaults.backgroundXOffset     ?? 0;
                this.backgroundYOffset     = defaults.backgroundYOffset     ?? 0;
                this.backgroundBrightness  = defaults.backgroundBrightness  ?? 100;
                this.backgroundContrast    = defaults.backgroundContrast    ?? 100;
                this.backgroundSaturation  = defaults.backgroundSaturation  ?? 100;
                this.backgroundHue         = defaults.backgroundHue         ?? 100;
                this.imageXOffset          = defaults.imageXOffset          ?? 0;
                this.imageYOffset          = defaults.imageYOffset          ?? 0;
                this.imageScale            = defaults.imageScale            ?? 1;
                this.imageFlip             = defaults.imageFlip             ?? false;
                this.imageSat              = defaults.imageSat              ?? 100;
            }
        },
        
        /**
         * Reset all style settings to defaults (removes all user overrides)
         */
        resetAllStyleSettingsToDefaults() {
            StyleSettingsUtils.resetAllToDefaults();
            // Reload current starter's styles
            this.resetCurrentPokemonToDefaults();
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
        update_pokemon() {
            const pokemon_data = this.game.properties.player.team[0]
            const species = pokemon_data.species.value
            const pokedex_data = this.dexDataCrystal[species]
            const growth_rate = pokedex_data.growth_rate
            const level = parseInt(this.recalculate_level)
            const experience = this.exp_table[growth_rate][level - 1]
            
            // The DVs the starter was given (gender-aware in Automatic, the fields' in Manual)
            const starterDVs = this.starterDVs
            const dv_hp  = starterDVs.hp
            const dv_atk = starterDVs.atk
            const dv_def = starterDVs.def
            const dv_spe = starterDVs.spe
            const dv_spc = starterDVs.spc

            const base_stat_hp  = pokedex_data.base_hp
            const base_stat_atk = pokedex_data.base_atk
            const base_stat_def = pokedex_data.base_def
            const base_stat_spa = pokedex_data.base_spc_atk
            const base_stat_spd = pokedex_data.base_spc_def
            const base_stat_spe = pokedex_data.base_spd

            const stat_exp_hp  = this.stat_exp_hp_replacement  != null ? this.stat_exp_hp_replacement  : pokemon_data.statExpHp.value
            const stat_exp_atk = this.stat_exp_atk_replacement != null ? this.stat_exp_atk_replacement : pokemon_data.statExpAttack.value
            const stat_exp_def = this.stat_exp_def_replacement != null ? this.stat_exp_def_replacement : pokemon_data.statExpDefense.value
            const stat_exp_spc = this.stat_exp_spc_replacement != null ? this.stat_exp_spc_replacement : pokemon_data.statExpSpecial.value
            const stat_exp_spe = this.stat_exp_spe_replacement != null ? this.stat_exp_spe_replacement : pokemon_data.statExpSpeed.value
            // const stat_exp_hp  = pokemon_data.statExpHp.value
            // const stat_exp_atk = pokemon_data.statExpAttack.value
            // const stat_exp_def = pokemon_data.statExpDefense.value
            // const stat_exp_spc = pokemon_data.statExpSpecial.value
            // const stat_exp_spe = pokemon_data.statExpSpeed.value

            function calculate_hp_stat(dv, base_stat, stat_exp, level) {
                return Math.floor(((base_stat + dv) * 2 + Math.floor(Math.sqrt(stat_exp) / 4)) * level / 100) + level + 10
            }
            function calculate_stat(dv, base_stat, stat_exp, level) {
                return Math.floor(((base_stat + dv) * 2 + Math.floor(Math.sqrt(stat_exp) / 4)) * level / 100) + 5
            }

            // Calculate stats and set them
            console.log(dv_hp, base_stat_hp, stat_exp_hp, level)
            let hp  = calculate_hp_stat(dv_hp, base_stat_hp,  stat_exp_hp,  level)
            let atk = calculate_stat(dv_atk, base_stat_atk, stat_exp_atk, level)
            let def = calculate_stat(dv_def, base_stat_def, stat_exp_def, level)
            let spa = calculate_stat(dv_spc, base_stat_spa, stat_exp_spc, level)
            let spd = calculate_stat(dv_spc, base_stat_spd, stat_exp_spc, level)
            let spe = calculate_stat(dv_spe, base_stat_spe, stat_exp_spe, level)

            // Set stats
            this.game.properties.player.team[0].level.set(level, false)
            this.game.properties.player.team[0].expPoints.set(experience, false)
            this.game.properties.player.team[0].hp.set(hp, false)
            this.game.properties.player.team[0].maxHp.set(hp, false)
            this.game.properties.player.team[0].attack.set(atk, false)
            this.game.properties.player.team[0].defense.set(def, false)
            this.game.properties.player.team[0].specialAttack.set(spa, false)
            this.game.properties.player.team[0].specialDefense.set(spd, false)
            this.game.properties.player.team[0].speed.set(spe, false)

            this.game.setBits([
                {path: 'player.team.0.dvAttack',  value: dv_atk, freeze: false},
                {path: 'player.team.0.dvDefense', value: dv_def, freeze: false},
            ])
            // this.game.setBits([
            //     {path: 'player.team.0.dvAttack',  value: dv_atk, freeze: false},
            //     {path: 'player.team.0.dvDefense', value: dv_def, freeze: false},
            // ])
        },
        getUnobtainableMoveStyle(move_object, type_of_move) {
            const unobtainable_moves_toggle = this.unobtainable_moves_toggle
            const state = this.g2stateVariable
            const move_name = move_object.Move
            const unobtainable_moves = this.unobtainable_moves_object[type_of_move]
            const opacity = 0.4
            const animation_duration = 1.5 // seconds
            const finish_count = this.finished_run_count
            if (move_name == "Hidden Power" && finish_count > 0) {
                return `transition: opacity ${animation_duration}s;`
            }

            if (unobtainable_moves_toggle == "Never Cross Out") {
                return `transition: opacity ${animation_duration}s;`
            }
            else if (state != "No Pokemon" && unobtainable_moves_toggle == "Cross Out When Starter is Obtained" && unobtainable_moves.includes(move_name)) {
                return `transition: opacity ${animation_duration}s; opacity: ${opacity}; text-decoration: line-through;`
            }
            else if (this.game.properties.player.badges.badge1.value == true && unobtainable_moves_toggle == "Cross Out After First Badge" && unobtainable_moves.includes(move_name)) {
                return `transition: opacity ${animation_duration}s; opacity: ${opacity}; text-decoration: line-through;`
            }
            else if (unobtainable_moves_toggle == "Always Cross Out" && unobtainable_moves.includes(move_name)) {
                return `transition: opacity ${animation_duration}s; opacity: ${opacity}; text-decoration: line-through;`
            }
            else {
                return `transition: opacity ${animation_duration}s;`
            }
        },
        openFolder(folderName, game_name, path = "", path2 = "") {
            // Was require("fs") + `start ""` from the renderer; the main process creates
            // the folder under <appRoot>/splits and opens it (plan 1.6/1.7). The only
            // caller passes `splits` as the folder name.
            const fullPath = splitPath(game_name, path, path2);
            console.log(`.\\${folderName}\\${game_name}\\${path}\\${path2}`);
            revealSplitFolder(fullPath);
        },
        async importBackports() {
            // The parser is games/gen2/backports.js (the legacy lib/backport_importer.js);
            // the file appends are games/gen2/backportOverrides.ts (decision 15).
            const backportsFileInput = this.$refs.backportsFile;
            const movesFileInput = this.$refs.backportMovesFile;

            if (!backportsFileInput?.files[0] || !movesFileInput?.files[0]) {
                this.backport_import_status = 'Please select both ASM files.';
                return;
            }

            try {
                const backportsContent = await backportsFileInput.files[0].text();
                const movesContent = await movesFileInput.files[0].text();

                // Parse moves from backport_moves.asm
                const { moves, newMoveMap } = parseBackportMoves(movesContent);

                // Build lookup from existing move data for resolving ASM constants
                const moveLookup = buildMoveLookup(g2MoveData);

                // Parse pokemon from backports.asm
                const { parsedName, data } = parseBackportPokemon(backportsContent, newMoveMap, moveLookup);

                // Use the text input for display name, fall back to parsed name
                const pokemonName = this.backport_pokemon_name.trim() || parsedName;
                this.backport_pokemon_name = pokemonName;

                // Was four appends to the shipped data files; the overrides file instead.
                const { movesAdded, pokemonAdded, moveMapAdded } = await recordBackport(pokemonName, moves, newMoveMap, data,
                    { g2MoveData, gen2moves, dexDataCrystal, backportMoveMap });

                // Update in-memory data so changes are visible immediately
                for (const move of moves) {
                    if (!g2MoveData[move.displayName]) {
                        this.g2MoveData[move.displayName] = {
                            Move: move.displayName,
                            Type: move.type,
                            Power: move.power,
                            Accuracy: move.accuracy,
                            PP: move.pp,
                            Description: move.description
                        };
                        this.gen2moves.push({
                            Move: move.displayName,
                            Type: move.type,
                            Power: move.power,
                            Accuracy: move.accuracy,
                            PP: move.pp,
                            Description: move.description
                        });
                    }
                }
                if (pokemonAdded) {
                    this.dexDataCrystal[pokemonName] = { name: pokemonName, ...data };
                }
                if (moveMapAdded) {
                    const moveMapping = {};
                    for (let i = 1; i <= 3; i++) {
                        moveMapping[`BACKPORT_MOVE_${i}`] = newMoveMap[`NEW_MOVE_${i}`] || null;
                    }
                    this.backportMoveMap[pokemonName] = moveMapping;
                }

                // Build status message
                let status = '';
                if (movesAdded > 0) status += `Added ${movesAdded} new move(s) to data files.\n`;
                else status += `No new moves to add (already exist).\n`;
                if (pokemonAdded) status += `Added "${pokemonName}" to Pokemon data.`;
                else status += `"${pokemonName}" already exists in Pokemon data (skipped).`;
                this.backport_import_status = status;

                console.log('[Backport Import]', status);
            } catch (err) {
                this.backport_import_status = `Error: ${err.message}`;
                console.error('[Backport Import] Error:', err);
            }
        },
        async set_rom_starter() {
            let starter = this.starter
            // console.log(starter)
            // This system requires a check in the case that the Pokemon is not one of the original 151, in that case it needs to get the value to "Backport" instead
            await Promise.all([
                await this.game.properties.patch.hChosenStarter.set(starter, true), 
            ])
        },
        // openFolder(folderName, game_name = "Crystal", path = "") {
        //     const fs = require('fs');
        //     const fullPath = path ? `.\\${folderName}\\${game_name}\\${path}` : `.\\${folderName}\\${game_name}\\${path}`;
        
        //     // Check if the folder exists
        //     if (!fs.existsSync(fullPath)) {
        //         // Create the folder (recursive ensures all parent directories are created)
        //         fs.mkdirSync(fullPath, { recursive: true });
        //     }
        
        //     // Open the folder
        //     require('child_process').exec(`start ${fullPath}`);
        // },
        /** One Manual DV field: whole, 0-15, an emptied field is 15; the object is replaced so the watcher sees it. */
        set_manual_dv(stat, event) {
            const value = clampStat(event.target.value, DV_MAX)
            this.manual_dvs = { ...clampDvs(this.manual_dvs), [stat]: value }
            // A rejected entry (letters, 40, -1) is shown as what was kept.
            event.target.value = String(value)
        },
        async update_atk() {
            var dv_atk = this.dv_atk_replacement
            var dv_def = this.dv_def_replacement
            console.log(dv_atk,dv_def)
            this.game.properties.player.team[0].dvAttack.set(dv_atk, false)
        },
        async update_def() {
            var dv_atk = this.dv_atk_replacement
            var dv_def = this.dv_def_replacement
            console.log(dv_atk,dv_def)
            this.game.properties.player.team[0].dvDefense.set(dv_def, false)
        },
        async update_items() {
            var item1 = this.item1_replacement
            var item2 = this.item2_replacement
            var item3 = this.item3_replacement
            var item4 = this.item4_replacement
            await this.game.properties.player.items[0].item.set(item1, false)
            await this.game.properties.player.items[0].quantity.set(99, false)
            await this.game.properties.player.items[1].item.set(item2, false)
            await this.game.properties.player.items[1].quantity.set(99, false)
            await this.game.properties.player.items[2].item.set(item3, false)
            await this.game.properties.player.items[2].quantity.set(99, false)
            await this.game.properties.player.items[3].item.set(item4, false)
            await this.game.properties.player.items[3].quantity.set(99, false)
            if (this.game.properties.player.items[4].item.value == null) {
                await this.game.properties.player.items[4].item.setBytes([0xFF], false)
                await this.game.properties.player.itemCount.set(4, false)
            }
        },
        async update_moveset() {
            const move_data = this.cross_generation_moves.g2
            var move1 = this.move_name(this.move1_replacement)
            var move2 = this.move_name(this.move2_replacement)
            var move3 = this.move_name(this.move3_replacement)
            var move4 = this.move_name(this.move4_replacement)
            var pp1   = move_data[this.move_name(move1)]
            var pp2   = move_data[this.move_name(move2)]
            var pp3   = move_data[this.move_name(move3)]
            var pp4   = move_data[this.move_name(move4)]
            if (move1 != "") {
                await this.game.properties.player.team[0].move1.set(move1, false)
                await this.game.properties.player.team[0].move1pp.set(pp1.PP, false)
            }
            if (move2 != "") {
                await this.game.properties.player.team[0].move2.set(move2, false)
                await this.game.properties.player.team[0].move2pp.set(pp2.PP, false)
            }
            if (move3 != "") {
                await this.game.properties.player.team[0].move3.set(move3, false)
                await this.game.properties.player.team[0].move3pp.set(pp3.PP, false)
            }
            if (move4 != "") {
                await this.game.properties.player.team[0].move4.set(move4, false)
                await this.game.properties.player.team[0].move4pp.set(pp4.PP, false)
            }
        },
        async update_battle_moveset() {
            if (this.g2stateVariable == "Battle") {
                const move_data = this.cross_generation_moves.g2
                var move1 = this.move_name(this.move1_replacement)
                var move2 = this.move_name(this.move2_replacement)
                var move3 = this.move_name(this.move3_replacement)
                var move4 = this.move_name(this.move4_replacement)
                var pp1   = move_data[this.move_name(move1)]
                var pp2   = move_data[this.move_name(move2)]
                var pp3   = move_data[this.move_name(move3)]
                var pp4   = move_data[this.move_name(move4)]
                if (move1 != "") {
                    await this.game.properties.battle.yourPokemon.move1.set(move1, false)
                    await this.game.properties.battle.yourPokemon.move1pp.set(pp1.PP, false)
                }
                if (move2 != "") {
                    await this.game.properties.battle.yourPokemon.move2.set(move2, false)
                    await this.game.properties.battle.yourPokemon.move2pp.set(pp2.PP, false)
                }
                if (move3 != "") {
                    await this.game.properties.battle.yourPokemon.move3.set(move3, false)
                    await this.game.properties.battle.yourPokemon.move3pp.set(pp3.PP, false)
                }
                if (move4 != "") {
                    await this.game.properties.battle.yourPokemon.move4.set(move4, false)
                    await this.game.properties.battle.yourPokemon.move4pp.set(pp4.PP, false)
                }
            }
            else { return }
        },
        speed_comparison(enemy_slot, enemy_speed_incoming) {
            let object = {
                comparison: "Outspeeds",
                color: "background-color: rgba(255, 63, 63, 0.6)",
            }
            if (this.game.properties.battle.mode.value == 'Wild') { return object }

            const state          = this.g2stateVariable
            const trainer        = this.capitalization_format(this.game.properties.battle.trainer.class.value)
            const trainer_number = this.game.properties.battle.trainer.id.value
            const badge_3        = this.game.properties.player.badges.badge3.value
            let data = this.game.properties.meta.gameName.value == 'Crystal' ? this.crystal_trainers : this.crystal_trainers
            let enemy_hp = this.game.properties.battle.trainer.team[enemy_slot]?.hp.value
            let player_speed   = this.game.properties.battle.yourPokemon.speed.value
            let enemy_speed = enemy_speed_incoming
            if (state == 'To Battle') {
                enemy_speed = data[`${trainer} ${trainer_number}`].party[enemy_slot]?.stats.speed
                player_speed = badge_3 ? Math.floor(this.game.properties.player.team[0].speed.value * 1.125) : this.game.properties.player.team[0].speed.value
            }

            // if (state == `To Battle`) {
            //     object.comparison = "Calculating..."
            //     object.color      = "background-color: rgba(28, 255, 58, 0)"
            // }
            // else if (player_speed > enemy_speed) {
            //     object.comparison = "Outsped"
            //     object.color      = "background-color: rgba(28, 255, 58, 0.4)"
            // }
            if (player_speed > enemy_speed) {
                object.comparison = "Outsped"
                object.color      = "background-color: rgba(28, 255, 58, 0.4)"
            }
            else if (player_speed == enemy_speed) {
                object.comparison = "Speed-tie"
                object.color      = "background-color: rgba(255, 255, 0, 0.5)"
            }
            if (enemy_hp == 0) {
                object.color      = "background-color: rgba(28, 255, 58, 0.5); opacity: 0.0; filter: grayscale(100%)"
            }
            return object
        },
        svgColorClass(speed_comparison, enemy_data) {
            // console.log(enemy_data)
            const isFainted = enemy_data?.hp.value
            if (isFainted == 0) {
                return 'grey-svg';
            }
            if (speed_comparison === 'Outsped') {
                return 'blue-svg';
            } 
            else if (speed_comparison === 'Speed-tie') {
                return 'yellow-svg';
            }
            return 'red-svg';
        },
        set_encounters() {
            let early_encounters_value = this.toggle_wEarlyEncounters == true ? "On" : "Off"
            console.log("Setting encounters...")
            console.log("toggle_EVENT_ENCOUNTER_ROUTE29_TEST:",          this.toggle_EVENT_ENCOUNTER_ROUTE29_TEST)
            console.log("toggle_EVENT_ENCOUNTER_ROUTE31_BELLSPROUT:",    this.toggle_EVENT_ENCOUNTER_ROUTE31_BELLSPROUT)
            console.log("toggle_EVENT_ENCOUNTER_ROUTE32_BELLSPROUT:",    this.toggle_EVENT_ENCOUNTER_ROUTE32_BELLSPROUT)
            console.log("toggle_EVENT_ENCOUNTER_UNION_CAVE_SANDSHREW:",  this.toggle_EVENT_ENCOUNTER_UNION_CAVE_SANDSHREW)
            console.log("toggle_EVENT_ENCOUNTER_ILEX_FOREST_PSYDUCK:",   this.toggle_EVENT_ENCOUNTER_ILEX_FOREST_PSYDUCK)
            console.log("toggle_EVENT_ENCOUNTER_ILEX_FOREST_ODDISH:",    this.toggle_EVENT_ENCOUNTER_ILEX_FOREST_ODDISH)
            console.log("toggle_EVENT_ENCOUNTER_ROUTE34_ABRA:",          this.toggle_EVENT_ENCOUNTER_ROUTE34_ABRA)
            console.log("toggle_EVENT_ENCOUNTER_NATIONAL_PARK_PSYDUCK:", this.toggle_EVENT_ENCOUNTER_NATIONAL_PARK_PSYDUCK)
            console.log("toggle_EVENT_ENCOUNTER_OLIVINE_CITY_KRABBY:",   this.toggle_EVENT_ENCOUNTER_OLIVINE_CITY_KRABBY)
            console.log("toggle_EVENT_ENCOUNTER_VIOLET_CITY_POLIWAG:",   this.toggle_EVENT_ENCOUNTER_VIOLET_CITY_POLIWAG)
            console.log("toggle_EVENT_ENCOUNTER_ROUTE_29_SENTRET:",      this.toggle_EVENT_ENCOUNTER_ROUTE_29_SENTRET)
            console.log("toggle_EVENT_ENCOUNTER_ECRUTEAK_CITY_POLIWAG:", this.toggle_EVENT_ENCOUNTER_ECRUTEAK_CITY_POLIWAG)
            this.game.properties.patch.wEarlyEncounters.set(early_encounters_value, false)
            this.game.setBits([ // Set bits can only be called on properties that share the same address
                {path: 'patch.encounter_flags.EVENT_ENCOUNTER_ROUTE29_TEST',          value: this.toggle_EVENT_ENCOUNTER_ROUTE29_TEST,          freeze: false},
                {path: 'patch.encounter_flags.EVENT_ENCOUNTER_ROUTE31_BELLSPROUT',    value: this.toggle_EVENT_ENCOUNTER_ROUTE31_BELLSPROUT,    freeze: false},
                {path: 'patch.encounter_flags.EVENT_ENCOUNTER_ROUTE32_BELLSPROUT',    value: this.toggle_EVENT_ENCOUNTER_ROUTE32_BELLSPROUT,    freeze: false},
            ])
            this.game.setBits([
                {path: 'patch.encounter_flags.EVENT_ENCOUNTER_UNION_CAVE_SANDSHREW',  value: this.toggle_EVENT_ENCOUNTER_UNION_CAVE_SANDSHREW,  freeze: false},
                {path: 'patch.encounter_flags.EVENT_ENCOUNTER_ILEX_FOREST_PSYDUCK',   value: this.toggle_EVENT_ENCOUNTER_ILEX_FOREST_PSYDUCK,   freeze: false},
                {path: 'patch.encounter_flags.EVENT_ENCOUNTER_ILEX_FOREST_ODDISH',    value: this.toggle_EVENT_ENCOUNTER_ILEX_FOREST_ODDISH,    freeze: false},
                {path: 'patch.encounter_flags.EVENT_ENCOUNTER_ROUTE34_ABRA',          value: this.toggle_EVENT_ENCOUNTER_ROUTE34_ABRA,          freeze: false},
                {path: 'patch.encounter_flags.EVENT_ENCOUNTER_NATIONAL_PARK_PSYDUCK', value: this.toggle_EVENT_ENCOUNTER_NATIONAL_PARK_PSYDUCK, freeze: false},
                {path: 'patch.encounter_flags.EVENT_ENCOUNTER_OLIVINE_CITY_KRABBY',   value: this.toggle_EVENT_ENCOUNTER_OLIVINE_CITY_KRABBY,   freeze: false},
                {path: 'patch.encounter_flags.EVENT_ENCOUNTER_VIOLET_CITY_POLIWAG',   value: this.toggle_EVENT_ENCOUNTER_VIOLET_CITY_POLIWAG,   freeze: false},
                {path: 'patch.encounter_flags.EVENT_ENCOUNTER_ROUTE_29_SENTRET',      value: this.toggle_EVENT_ENCOUNTER_ROUTE_29_SENTRET,      freeze: false},
            ])
            this.game.setBits([ // Set bits can only be called on properties that share the same address
                {path: 'patch.encounter_flags.EVENT_ENCOUNTER_ECRUTEAK_CITY_POLIWAG', value: this.toggle_EVENT_ENCOUNTER_ECRUTEAK_CITY_POLIWAG, freeze: false},
            ])
            console.log("Encounters should be set.")
        },
        // convertDurationToSeconds(duration) {
        //     const parts = duration.split(':').map(part => parseInt(part, 10));
        //     if (parts.length === 1) {
        //         return parts[0];
        //     } else if (parts.length === 2) {
        //         return parts[0] * 60 + parts[1];
        //     } else if (parts.length === 3) {
        //         return parts[0] * 3600 + parts[1] * 60 + parts[2];
        //     }
        // },
        convertDurationToSeconds(duration) {
            if (typeof duration !== 'string') {
                console.error("Invalid duration format:", duration);
                return 0; // Return 0 or handle the error as needed
            }
            const parts = duration.split(':').map(part => parseInt(part, 10));
            if (parts.length === 1) {
                return parts[0];
            } else if (parts.length === 2) {
                return parts[0] * 60 + parts[1];
            } else if (parts.length === 3) {
                return parts[0] * 3600 + parts[1] * 60 + parts[2];
            }
        },
        convertMSToDuration(milliseconds) {
            const seconds = milliseconds / 1000;
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const remainingSeconds = seconds % 60;
        
            if (hours > 0) {
                return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
            } else if (minutes > 0) {
                return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
            } else {
                return `${remainingSeconds}`;
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
        calculate_stat(species, level) {
            let include_badge_boost = true
            let badge_boost = 1.125
            let stat_exp = {
                granbull2: {
                    hp:  17538,
                    atk: 36200,
                    def: 20081,
                    spe: 19616,
                    spc: 27611,
                },
                perfect: 66535,
            }
            //Assign stat experience
            let stat_exp_atk = stat_exp.granbull2.atk
            let stat_exp_def = stat_exp.granbull2.def
            let stat_exp_spc = stat_exp.granbull2.spc
            let stat_exp_spe = stat_exp.granbull2.spe
            let stat_exp_hp  = stat_exp.granbull2.hp 
            //Assign base stats
            let base_atk = this.dexDataCrystal[species].base_atk
            let base_def = this.dexDataCrystal[species].base_def
            let base_spc = this.dexDataCrystal[species].base_spc_atk
            let base_spe = this.dexDataCrystal[species].base_spd
            let base_hp  = this.dexDataCrystal[species].base_hp
            //Assign DVs (gender-aware in Automatic, the fields' in Manual)
            const starterDVs = this.starterDVs
            let dv_atk = starterDVs.atk
            let dv_def = starterDVs.def
            let dv_spc = starterDVs.spc
            let dv_spe = starterDVs.spe
            let dv_hp  = starterDVs.hp
            //Calculate stats
            let atk = Math.floor(((((base_atk + dv_atk) * 2 + Math.floor(Math.ceil(Math.sqrt(stat_exp_atk)) / 4)) * level) / 100)) + 5
            let def = Math.floor(((((base_def + dv_def) * 2 + Math.floor(Math.ceil(Math.sqrt(stat_exp_def)) / 4)) * level) / 100)) + 5
            let spa = Math.floor(((((base_spc + dv_spc) * 2 + Math.floor(Math.ceil(Math.sqrt(stat_exp_spc)) / 4)) * level) / 100)) + 5
            let spd = Math.floor(((((base_spc + dv_spc) * 2 + Math.floor(Math.ceil(Math.sqrt(stat_exp_spc)) / 4)) * level) / 100)) + 5
            let spe = Math.floor(((((base_spe + dv_spe) * 2 + Math.floor(Math.ceil(Math.sqrt(stat_exp_spe)) / 4)) * level) / 100)) + 5
            let hp  = Math.floor(((((base_hp  + dv_hp)  * 2 + Math.floor(Math.ceil(Math.sqrt(stat_exp_hp))  / 4)) * level) / 100)) + level + 5
            if (include_badge_boost == true) { 
                atk = Math.floor(atk * badge_boost)
                def = Math.floor(def * badge_boost)
                spa = Math.floor(spa * badge_boost)
                spd = Math.floor(spd * badge_boost)
                spe = Math.floor(spe * badge_boost)
            }
            //Package and return stats as an object
            let object = {
                "Hp":  hp,
                "Atk": atk,
                "Def": def,
                "SpA": spa,
                "SpD": spd,
                "Spe": spe,
            }
            return object
        },
        get_stat(stat_name) {
            const state = this.g2stateVariable
            if (state == `Overworld` || state == `To Battle`) {
                switch (stat_name) {
                    case "Hp":              return this.game.properties.player.team[0].maxHp.value
                    case "Attack":          return this.badge_boost(this.game.properties.player.badges.badge1.value, this.game.properties.player.team[0].attack.value)
                    case "Defense":         return this.badge_boost(this.game.properties.player.badges.badge6.value, this.game.properties.player.team[0].defense.value)
                    case "Special Attack":  return this.badge_boost(this.game.properties.player.badges.badge7.value, this.game.properties.player.team[0].specialAttack.value)
                    case "Special Defense": return this.badge_boost(this.game.properties.player.badges.badge7.value, this.game.properties.player.team[0].specialDefense.value, "Special Defense")
                    case "Speed":           return this.badge_boost(this.game.properties.player.badges.badge3.value, this.game.properties.player.team[0].speed.value)
                }
            }
            else if (state == `Battle` || state == `From Battle`) {
                switch (stat_name) {
                    case "Hp":              return this.game.properties.battle.yourPokemon.maxHp.value
                    case "Attack":          return this.game.properties.battle.yourPokemon.attack.value
                    case "Defense":         return this.game.properties.battle.yourPokemon.defense.value
                    case "Speed":           return this.game.properties.battle.yourPokemon.speed.value
                    case "Special Attack":  return this.game.properties.battle.yourPokemon.specialAttack.value
                    case "Special Defense": return this.game.properties.battle.yourPokemon.specialDefense.value
                }
            }
            else if (state == `Base Stats`) {
                switch (stat_name) {
                    case "Hp":              return this.dexDataCrystal[this.starter].base_hp
                    case "Attack":          return this.dexDataCrystal[this.starter].base_atk
                    case "Defense":         return this.dexDataCrystal[this.starter].base_def
                    case "Special Attack":  return this.dexDataCrystal[this.starter].base_spc_atk
                    case "Special Defense": return this.dexDataCrystal[this.starter].base_spc_def
                    case "Speed":           return this.dexDataCrystal[this.starter].base_spd
                }
            }
        },
        get_bb_stat(stat_name) {
            const state = this.g2stateVariable
            let boosting_badge = false
            let badge_boost_modifier = 0.125

            // g2spcDefBoost(badge, boost, stat) { //yes, the special defense is boosted/not boosted based on the unboosted special attack value
            //     if (this.display_badge_boosts == false) { return stat }
            //     if (badge == true) {
            //         if (this.game.properties.player.team[0].specialAttack < 206
            //             ||
            //             this.game.properties.player.team[0].specialAttack > 432 &&
            //             this.game.properties.player.team[0].specialAttack < 661
            //             ) {
            //             return stat
            //         }
            //         else {
            //             return Math.floor(stat * boost)
            //         }
            //     }
            //     return stat
            // },
            //assign stats and badges
            if (state != `Base Stats`) {
                switch (stat_name) {
                    case "Hp":              return 'N/A';
                    case "Attack":          { 
                        boosting_badge = this.game.properties.player.badges.badge1.value
                        switch (boosting_badge) {
                            case true:  return Math.floor(this.game.properties.player.team[0].attack.value * badge_boost_modifier)
                            case false: return 0
                        }
                    }
                    case "Defense":         { 
                        boosting_badge = this.game.properties.player.badges.badge6.value
                        switch (boosting_badge) {
                            case true:  return Math.floor(this.game.properties.player.team[0].defense.value * badge_boost_modifier)
                            case false: return 0
                        }
                    }
                    case "Speed":           { 
                        boosting_badge = this.game.properties.player.badges.badge3.value
                        switch (boosting_badge) {
                            case true:  return Math.floor(this.game.properties.player.team[0].speed.value * badge_boost_modifier)
                            case false: return 0
                        }
                    }
                    case "Special Attack":  { 
                        boosting_badge = this.game.properties.player.badges.badge7.value
                        switch (boosting_badge) {
                            case true:  return Math.floor(this.game.properties.player.team[0].specialAttack.value * badge_boost_modifier)
                            case false: return 0
                        }
                    }
                    case "Special Defense": { 
                        boosting_badge = this.game.properties.player.badges.badge7.value
                        switch (boosting_badge) {
                            case true: {
                                if (this.game.properties.player.team[0].specialAttack < 206
                                    ||
                                    this.game.properties.player.team[0].specialAttack > 432 &&
                                    this.game.properties.player.team[0].specialAttack < 661
                                    ) {
                                    return 0
                                }
                                return Math.floor(this.game.properties.player.team[0].specialDefense.value * badge_boost_modifier)
                            }
                            case false: return 0
                        }
                    }
                }
            }
            if (state == `Base Stats`) {
                switch (stat_name) {
                    case "Hp":              return 0
                    case "Attack":          return 0
                    case "Defense":         return 0
                    case "Special Attack":  return 0
                    case "Special Defense": return 0
                    case "Speed":           return 0
                }
            }
        },
        get_dv(stat_name) {
            const state = this.g2stateVariable
            let dv_atk  = this.game.properties.player.team[0].dvAttack.value
            let dv_def  = this.game.properties.player.team[0].dvDefense.value
            let dv_spc  = this.game.properties.player.team[0].dvSpecial.value
            let dv_spe  = this.game.properties.player.team[0].dvSpeed.value
            let dv_hp   = this.hpDv(dv_atk, dv_def, dv_spc, dv_spe)
            switch (stat_name) {
                case "Hp":
                    return dv_hp
                case "Attack":
                    return dv_atk
                case "Defense":
                    return dv_def
                case "Special Attack":
                    return dv_spc
                case "Special Defense":
                    return dv_spc
                case "Speed":
                    return dv_spe
            }
        },
        get_start_exp_ev_equivalent(stat_exp) {
            return Math.floor(Math.sqrt(stat_exp))
        },
        get_stat_exp_increase(stat_exp) {
            return Math.floor(Math.sqrt(stat_exp) / 4)
        },
        stat_mod(modifer, slot) {
            let mod = modifer
            let mod_string = ""
            let style_string = ""
            if (mod == 0) {
                style_string = 'opacity: .7;'
            }
            if (mod > 0) {
                mod_string = `+${mod}`
                style_string = 'opacity: .1;'
            }
            if (mod < 0) {
                mod_string = mod
                style_string = 'opacity: .1;'
            }
            if (this.game.properties.battle.trainer.team[slot].hp.value == 0) {
                style_string = 'opacity: .3;'
            }
            if (slot != this.game.properties.battle.enemyPokemon.partyPos.value && this.game.properties.battle.trainer.team[slot].hp.value > 0) {
                style_string = 'opacity: .7;'
            }
            let object = {
                mod: mod_string,
                style: style_string,
            }
            // console.log(object)
            return object
        },
        enemyPkmnFaintTypes(pkmnData) {
            if (this.g2stateVariable == `To Battle`) {
                return "filter: grayscale(0%) drop-shadow(0px 0px 1px #000000c5);"
            }
            else if (pkmnData.hp == 0 || this.g2stateVariable == `From Battle`) {
                return "filter: grayscale(100%) drop-shadow(0px 0px 1px #000000c5); opacity: .5; "
            }
            else {
                return "filter: grayscale(0%) drop-shadow(0px 0px 1px #000000c5);"
            }
        },
        enemyType1(slotNumber) {
            const pkmn_species = this.game.properties.battle.trainer.team[slotNumber].species.value
            if (pkmn_species == null) { 
                return "Normal"
            }
            return this.dexDataCrystal[pkmn_species].type_1
        },
        enemyType2(slotNumber) {
            const pkmn_species = this.game.properties.battle.trainer.team[slotNumber].species.value
            if (pkmn_species == null) { 
                return "Normal"
            }
            return this.dexDataCrystal[pkmn_species].type_2
        },
        reset() {
            this.backgroundBlur =        0,
            this.backgroundScale =       100,
            this.backgroundUrl =         "",
            this.use_custom_background = false,
            this.backgroundXOffset =     0,
            this.backgroundYOffset =     0,
            this.backgroundTexture =     this.dexDataCrystal[this.starter]?.type_1?.toLowerCase(),
            this.backgroundBrightness =  100,
            this.backgroundContrast =    100,
            this.backgroundSaturation =  100,
            this.backgroundHue        =  100
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
        //*autosplitter methods
        //format trainer names so they can be written to csv
        format_trainer_name(trainer_class, trainer_number) {
            // const trainer = `${trainer_class}_${trainer_number}`
            // return this.capitalization_format(trainer)
            return this.capitalization_format(trainer_class)
        },
        nullCheck(x) {
            if (x == null) {
                return ""
            }
            else return x
        },
        clear_overlay_color() {
            starterType = this.dexDataCrystal[this.starter].type_1;
            newColor = getComputedStyle(document.documentElement).getPropertyValue("--"+starterType.toLowerCase());
            this.set_pokemon_prop("overlay_color", newColor)
            this.overlay_color = newColor;
            // this.load_pokemon_sprite_settings()
        },
        async color_picker() {
            var color = await this.colorPick()
            this.set_pokemon_prop("overlay_color", color)
            this.overlay_color = color
            // console.log(MyStorage.entries())
        },
        set_pokemon_prop(property_name, value) {
            MyStorage[this.starter] = {
                ...MyStorage[this.starter],
                [property_name]: value,
            }
        },
        set_setting_prop(property_name, value) {
            MyStorage[property_name] = value
        },
        load_pokemon_sprite_settings(pokemon_species) {
            this.imageXOffset = MyStorage[pokemon_species]?.imageXOffset ?? 0
            this.imageYOffset = MyStorage[pokemon_species]?.imageYOffset ?? 0
            this.imageScale = MyStorage[pokemon_species]?.imageScale ?? 1
            this.imageFlip = MyStorage[pokemon_species]?.imageFlip ?? false
            this.imageSat = MyStorage[pokemon_species]?.imageSat ?? 100
            this.backgroundBlur = MyStorage[pokemon_species]?.backgroundBlur ?? 0
            this.backgroundScale = MyStorage[pokemon_species]?.backgroundScale ?? 100
            this.backgroundUrl = MyStorage[pokemon_species]?.backgroundUrl ?? false
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
        set_timer() {
            const timeRegex = /(\d+):(\d{2}):(\d{2})\.(\d{2})/;
            const timeOffsetArray = this.timer_startTimeOffset.match(timeRegex)?.slice(1,5).map(x => parseInt(x)) ?? [0,0,0,0];
            const timeOffset = timeOffsetArray[0] * 3600000 + timeOffsetArray[1] * 60000 + timeOffsetArray[2] * 1000 + timeOffsetArray[3] * 10;

            this.timer_pause = true
            this.timer_startTime = Date.now() - timeOffset
            this.timer_pause_time = Date.now()
            this.timer_formatted_time = [ "0", ".00" ]
            this.finished_logs = false

            this.updateTime()
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
                requestAnimationFrame(this.updateTime)
            }
        },
        //pause the timer
        pauseUnpauseTime() {
            if (this.timer_pause == true) {
                this.timer_pause = false
                this.timer_startTime += Date.now() - this.timer_pause_time
                this.updateTime()
                // retro.resume()
            }
            else {
                this.timer_pause = true
                this.timer_pause_time = Date.now()
                // retro.pause()
            }
        },
        // resetTime() {
        //     this.timer_pause = true
        //     this.timer_startTime = 0
        //     this.timer_pause_time = 0
        //     this.timer_formatted_time = [ "0", ".00" ]
        // },
        async newRun() {
            const timeRegex = /(\d+):(\d{2}):(\d{2})\.(\d{2})/;
            const timeOffsetArray = this.timer_startTimeOffset.match(timeRegex)?.slice(1,5).map(x => parseInt(x)) ?? [0,0,0,0];
            const timeOffset = timeOffsetArray[0] * 3600000 + timeOffsetArray[1] * 60000 + timeOffsetArray[2] * 1000 + timeOffsetArray[3] * 10;
            this.run_complete = false

            // this.current_splits = await this.load_temp_splits()
            this.compared_splits = []
            this.current_splits  = []

            this.battle_summary_header        = "Battle Summary"
            this.battle_duration              = 0
            this.exp_per_second               = 0
            this.battle_summary_battle_number = 0
            this.battle_summary_frames        = 0
            this.battle_summary_battle_number = 0
            this.battle_summary_exp_gained    = 0
            this.battle_summary_turns         = 0
            this.battle_summary_player_turns  = 0
            this.battle_summary_enemy_turns   = 0
            this.battle_summary_player_hits   = 0
            this.battle_summary_player_misses = 0
            this.battle_summary_player_crits  = 0
            this.battle_summary_player_ohkos  = 0
            this.battle_summary_enemy_hits    = 0
            this.battle_summary_enemy_misses  = 0
            this.battle_summary_enemy_crits   = 0
            this.battle_summary_enemy_ohkos   = 0
            this.battle_summary_player_Sx     = 0
            this.battle_summary_player_4x     = 0
            this.battle_summary_player_2x     = 0
            this.battle_summary_player_1x     = 0
            this.battle_summary_player_Hx     = 0
            this.battle_summary_player_Qx     = 0
            this.battle_summary_player_0x     = 0
            this.battle_summary_player_con    = 0
            this.battle_summary_player_par    = 0
            this.battle_summary_player_brn    = 0
            this.battle_summary_player_frz    = 0
            this.battle_summary_player_psn    = 0
            this.battle_summary_player_bpn    = 0
            this.battle_summary_player_slp    = 0
            this.battle_summary_enemy_Sx      = 0
            this.battle_summary_enemy_4x      = 0
            this.battle_summary_enemy_2x      = 0
            this.battle_summary_enemy_1x      = 0
            this.battle_summary_enemy_Hx      = 0
            this.battle_summary_enemy_Qx      = 0
            this.battle_summary_enemy_0x      = 0
            this.battle_summary_enemy_con     = 0
            this.battle_summary_enemy_par     = 0
            this.battle_summary_enemy_brn     = 0
            this.battle_summary_enemy_frz     = 0
            this.battle_summary_enemy_psn     = 0
            this.battle_summary_enemy_bpn     = 0
            this.battle_summary_enemy_slp     = 0
            this.battle_summary_enemy_se      = 0
            this.battle_summary_enemy_nve     = 0
            this.battle_summary_player_se     = 0
            this.battle_summary_player_nve    = 0

            this.kanto_badges         = false
            this.timer_pause          = true
            this.game_over            = false
            this.most_recent_move     = ""
            this.timer_startTime      = 0
            this.timer_pause_time     = 0
            this.timer_formatted_time = [ "0", ".00" ]
            this.playerResets         = 0

            this.finished_logs    = false
            this.blackout_counter = 0
            this.playerId         = 0
            // this.playerName = "NINTEN"
        },
        load_all_settings() {
            // this.help_menus = MyStorage["this.help_menus"] ?? "Settings"
            this.starter =                    MyStorage["starter"]                             ?? "Aipom"
            this.options =                    MyStorage["options"]                             ?? true
            this.game_selection =             MyStorage["game_selection"]                      ?? "Crystal",
            // this.timeOfDay_user =             MyStorage["timeOfDay_user"]                      ?? "Day"
            this.gametimeDisplay =            MyStorage["gametimeDisplay"]                     ?? true
            this.resetCounter =               MyStorage["resetCounter"]                        ?? true
            this.blackouts_as_resets =        MyStorage["blackouts_as_resets"]                 ?? true
            this.blackout_counter =           MyStorage["blackout_counter"]                    ?? 0
            this.battleGraphic =              MyStorage["battleGraphic"]                       ?? true
            this.showAllTrainers =            MyStorage["showAllTrainers"]                     ?? true
            this.showSpecialTrainerGraphics = MyStorage["showSpecialTrainerGraphics"]          ?? true
            this.battlePopUps =               MyStorage["battlePopUps"]                        ?? true
            this.rockTunnelDarkness =         MyStorage["rockTunnelDarkness"]                  ?? false
            this.playerResets =               MyStorage["playerResets"]                        ?? 0
            this.viridian_forest =            MyStorage["viridian_forest"]                     ?? "Pidgey"
            this.pb_splits =                  MyStorage[`${this.starter}_pb_splits`]           ?? ["","","",""]
            this.attempt_number =             MyStorage[`${this.starter}`]?.attempt_number     ?? 0
            this.finished_run_count =         MyStorage[`${this.starter}`]?.finished_run_count ?? 0
            this.frame =                      MyStorage[`${this.starter}`]?.frame              ?? 0
            this.pb_time =                    MyStorage[`${this.starter}`]?.pb_time            ?? "None"
            this.playerId =                   MyStorage["playerId"]                            ?? 0
            this.testRun =                    MyStorage["testRun"]                             ?? false
            this.playerName =                 MyStorage["playerName"]                          ?? ""

            //Pokemon settings for local storage
            this.overlay_color = MyStorage[this.starter]?.overlay_color ?? this.default_colors[`${dexDataCrystal[this.starter].type_1}`]
            this.imageXOffset =  MyStorage[this.starter]?.imageXOffset  ?? 0
            this.imageYOffset =  MyStorage[this.starter]?.imageYOffset  ?? 0
            this.imageScale =    MyStorage[this.starter]?.imageScale    ?? 1
            this.imageFlip =     MyStorage[this.starter]?.imageFlip     ?? false
            this.imageSat =      MyStorage[this.starter]?.imageSat      ?? 100

            //background texture settings
            this.backgroundBlur =        MyStorage[this.starter]?.backgroundBlur        ?? 0
            this.backgroundScale =       MyStorage[this.starter]?.backgroundScale       ?? 100
            this.backgroundUrl =         MyStorage[this.starter]?.backgroundUrl         ?? ""
            this.backgroundFlip =        MyStorage[this.starter]?.backgroundFlip        ?? false
            this.backgroundXFlip =       MyStorage[this.starter]?.backgroundXFlip       ?? false
            this.use_custom_background = MyStorage[this.starter]?.use_custom_background ?? false
            this.backgroundXOffset =     MyStorage[this.starter]?.backgroundXOffset     ?? 0
            this.backgroundYOffset =     MyStorage[this.starter]?.backgroundYOffset     ?? 0
            this.backgroundTexture =     MyStorage[this.starter]?.backgroundTexture     ?? `${this.dexDataCrystal[this.starter].type_1.toLowerCase()}`
            this.backgroundBrightness =  MyStorage[this.starter]?.backgroundBrightness  ?? 100
            this.backgroundContrast =    MyStorage[this.starter]?.backgroundContrast    ?? 100
            this.backgroundSaturation =  MyStorage[this.starter]?.backgroundSaturation  ?? 100
            this.backgroundHue =         MyStorage[this.starter]?.backgroundHue         ?? 100
            this.kanto_badges =          MyStorage[this.starter]?.kanto_badges          ?? false

            this.pokeball_translateX =  MyStorage['this.pokeball_translateX'] ?? 0
            this.pokeball_translateY =  MyStorage['this.pokeball_translateY'] ?? 0

            //UI settings
            this.ui_saturation             = MyStorage["this.ui_saturation"]             ?? .6
            this.ui_type_colors            = MyStorage["this.ui_type_colors"]            ?? "Bulbapedia Current"
            this.ui_type_color_modifier    = MyStorage["this.ui_type_color_modifier"]    ?? "current_"
            this.ui_type_icons             = MyStorage["this.ui_type_icons"]             ?? "2024"
            this.ui_type_icons_modifier    = MyStorage["this.ui_type_icons_modifier"]    ?? "2024/"
            this.ui_stats_styling          = MyStorage["this.ui_stats_styling"]          ?? "2024"
            this.ui_stats_styling_modifier = MyStorage["this.ui_stats_styling_modifier"] ?? "2024/"
            this.ui_stat_arrangement       = MyStorage["this.ui_stat_arrangement"]       ?? "HP, Atk, Def, Spe, SpA, SpD"
            this.ui_stat_arrangement_modifier = MyStorage["this.ui_stat_arrangement_modifier"] ?? "hp_spd_"

            this.stats_setting                = MyStorage["this.stats_setting"]                ?? "Automatic"
            this.right_panel                  = MyStorage["this.right_panel"]                  ?? "Battle Graphic"
            this.game_over_summary            = MyStorage["this.game_over_summary"]            ?? {}
            this.display_run_summary          = MyStorage["this.display_run_summary"]          ?? true
            this.bonk                         = MyStorage["this.bonk"]                         ?? true
            this.repel_counter                = MyStorage["this.repel_counter"]                ?? true
            this.automatic_post_battle_splits = MyStorage["this.automatic_post_battle_splits"] ?? true

            this.current_splits  = MyStorage["this.current_splits"]  ?? []
            this.previous_splits = MyStorage["this.previous_splits"] ?? []

            // this.starter = this.game.properties.patch.hChosenStarter.value
            // this.game.properties.patch.wStarterHiddenPowerType.set(this.hpType)
            // this.game.properties.patch.wOptionsHiddenPower.set(this.hpType)

            // this.toggle_wEarlyEncounters                      = this.game.properties.patch.wEarlyEncounters.value == "On" ? true : false
            // this.toggle_EVENT_ENCOUNTER_ROUTE29_TEST          = this.game.properties.patch.encounter_flags.EVENT_ENCOUNTER_ROUTE29_TEST.value
            // this.toggle_EVENT_ENCOUNTER_ROUTE31_BELLSPROUT    = this.game.properties.patch.encounter_flags.EVENT_ENCOUNTER_ROUTE31_BELLSPROUT.value
            // this.toggle_EVENT_ENCOUNTER_ROUTE32_BELLSPROUT    = this.game.properties.patch.encounter_flags.EVENT_ENCOUNTER_ROUTE32_BELLSPROUT.value
            // this.toggle_EVENT_ENCOUNTER_UNION_CAVE_SANDSHREW  = this.game.properties.patch.encounter_flags.EVENT_ENCOUNTER_UNION_CAVE_SANDSHREW.value
            // this.toggle_EVENT_ENCOUNTER_ILEX_FOREST_PSYDUCK   = this.game.properties.patch.encounter_flags.EVENT_ENCOUNTER_ILEX_FOREST_PSYDUCK.value
            // this.toggle_EVENT_ENCOUNTER_ILEX_FOREST_ODDISH    = this.game.properties.patch.encounter_flags.EVENT_ENCOUNTER_ILEX_FOREST_ODDISH.value
            // this.toggle_EVENT_ENCOUNTER_ROUTE34_ABRA          = this.game.properties.patch.encounter_flags.EVENT_ENCOUNTER_ROUTE34_ABRA.value
            // this.toggle_EVENT_ENCOUNTER_NATIONAL_PARK_PSYDUCK = this.game.properties.patch.encounter_flags.EVENT_ENCOUNTER_NATIONAL_PARK_PSYDUCK.value
            // this.toggle_EVENT_ENCOUNTER_OLIVINE_CITY_KRABBY   = this.game.properties.patch.encounter_flags.EVENT_ENCOUNTER_OLIVINE_CITY_KRABBY.value
            // this.toggle_EVENT_ENCOUNTER_VIOLET_CITY_POLIWAG   = this.game.properties.patch.encounter_flags.EVENT_ENCOUNTER_VIOLET_CITY_POLIWAG.value
        },
        customFormats() {
            let movepoolSize = dexDataCrystal[this.starter].tm_hm_learnset.length+dexDataCrystal[this.starter].levelup_moveset.length+dexDataCrystal[this.starter].tutor_learnset.length;
            let containerHeight = 941.5;
            let startLineHeight = 21; 
            let startFontSize = 16;
            let correctedLineHeight = containerHeight / movepoolSize;
            let correctedFontSize = correctedLineHeight * (startFontSize)/startLineHeight;
            if(movepoolSize > (containerHeight/startLineHeight)){
                return "line-height: " + correctedLineHeight + "px; font-size: "+correctedFontSize+"px;";
            }
            //return this.customMovepool[this.starter]
        },
        type1() {
            if (this.g2stateVariable == "Battle") {
                return this.batt.yourPokemon.type1.value
            }
            else {
                return this.dexDataCrystal[this.starter].type_1
            }
        },
        type2() {
            if (this.g2stateVariable == "Battle") {
                return this.batt.yourPokemon.type2.value
            }
            else {
                return this.dexDataCrystal[this.starter].type_2
            }
        },
        move_name(move_string) {
            // Backported moves
            backport_check_string = move_string?.toUpperCase()
            if (backport_check_string == "BACKPORT_MOVE_1" || backport_check_string == "BACKPORT_MOVE_2" || backport_check_string == "BACKPORT_MOVE_3") {
                move_string = this.get_backport_move(backport_check_string)
                if (move_string == null) { return "" }
                return move_string
            }
            
            if (move_string == null) { return "" }
            move_string = move_string.toLowerCase()
            const moveMappings = {
                "vicegrip":      "ViceGrip",
                "double slap":   "DoubleSlap",
                "doubleslap":    "DoubleSlap",
                "double-edge":   "Double-Edge",
                "solarbeam":     "SolarBeam",
                "extremespeed":  "ExtremeSpeed",
                "dynamicpunch":  "DynamicPunch",
                "thunderpunch":  "ThunderPunch",
                "bubblebeam":    "BubbleBeam",
                "grasswhistle":  "GrassWhistle",
                "softboiled":    "Softboiled",
                "sand-attack":   "Sand-Attack",
                "mud-slap":      "Mud-Slap",
                "featherdance":  "FeatherDance",
                "poisonpowder":  "PoisonPowder",
                "dragonbreath":  "DragonBreath",
                "ancient power": "AncientPower",
                "ancientpower":  "AncientPower",
                "smellingsalt":  "SmellingSalt",
                "selfdestruct":  "Selfdestruct",
                "smokescreen":   "SmokeScreen",
                "sonicboom":     "SonicBoom",
                "conversion2":   "Conversion 2"
            };
            const formattedMove = moveMappings[move_string];
            return formattedMove || this.capitalization_format(move_string);
        },
        get_backport_move(move_string) {
            const mapping = this.backportMoveMap[this.starter];
            if (mapping && move_string in mapping) {
                return mapping[move_string];
            }
            return move_string;
        },
        //ENEMY MOD STYLING
        enemyMods(modValue) {
            if (this.g2stateVariable != "Battle") { return this.enemyModColour }
            var neutral = ["0", "background: #a1a1a1;"]
            var raised = [modValue, "background: #d84444;"]
            var lowered = [modValue, "background: #21c500"]
            if (modValue < 0) {
                this.enemyModColour = raised
                return raised
             }
            if (modValue > 0) {
                this.enemyModColour = lowered
                return lowered
            }
            return neutral;
            //return this.enemyModColour;
        },
        enemyDynamic(activePkmn, currentSlot) {
            if (activePkmn == currentSlot && this.g2stateVariable == "Battle") {
                return this.game?.properties?.battle?.enemyPokemon
            }
            else { 
                return this.game?.properties?.battle?.trainer?.team[activePkmn]
            }
        },
        movepoolTypeColor(moveObject) {
            if (moveObject.Type == `Curse`) {
                return "Curse"
            }
            if (moveObject.Move == `Hidden Power`) {
                return this.starterHiddenPower.type
            }
            return moveObject.Type
        },
        movepoolType(moveObject) {
            if (moveObject.Type == `Curse`) {
                return "???"
            }
            if (moveObject.Move == `Hidden Power`) {
                return this.starterHiddenPower.type
            }
            return moveObject.Type
        },
        movepoolPower(moveObject) {
            if (moveObject.Move == `Hidden Power`) {
                // The spread's own power (2026-09-17): 70 for a perfect Atk/Def, less for a
                // female spread or a Manual one.
                return this.starterHiddenPower.power
            }
            if (moveObject.Move == `Return`) {
                if (this.game.properties.player.teamCount.value == 0) {
                    return "-"
                }
                return this.g2ReturnPowerCalc(this.game.properties.player.team[0])
            }
            if (moveObject.Move == `Frustration`) {
                if (this.game.properties.player.teamCount.value == 0) {
                    return "-"
                }
                return this.g2FrustrationPowerCalc(this.game.properties.player.team[0])
            }
            else { return moveObject.Power }
        },
        moveAccuracyEvasionDynamic(move) {
            if (move) {
                // var moveObject = this.gen2moves.find(x => x.Move.toUpperCase() === move)
                var moveObject = this.g2MoveData[this.move_name(this.pascalCaseSpace(this.camelCase(move)))]
                if (moveObject == undefined) {
                    return
                }
                var moveAccuracy = moveObject.Accuracy
                var accuracyStageMods = this.stageModifiersData["accuracy"]
                var currentAccuracyModStage = this.batt.yourPokemon.modStageAccuracy.value
                var evasionStageMods = this.stageModifiersData["evasion"]
                var currentEvasionModStage = this.batt.enemyPokemon.modStageEvasion.value
                var weather = this.game.properties.battle.weather.weatherType.value
                // if (moveAccuracy == `-`) { //returns 100% if the move bypasses accuracy checks
                //     return `100`
                // }
                if (this.g2stateVariable == `Battle` || this.g2stateVariable == `From Battle`) {
                    if (moveAccuracy == `-`) {
                        return `-`
                    }
                    else if (this.batt.yourPokemon.modStageAccuracy.bytes > 0x0E) {
                        return moveAccuracy
                    }
                    else if (weather == 'Rain' && move == 'Thunder') {
                        return '-'
                    }
                    else {
                        return Math.floor(moveAccuracy * accuracyStageMods[currentAccuracyModStage] * evasionStageMods[currentEvasionModStage])
                    }
                }
                else {
                    return moveAccuracy
                }
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
        getMovepool(gen2PkmnData, moveData, tmhmMapping, species) {
            const pkmn = this.dataSearch(gen2PkmnData, species)
            let obj = {
                level: markReminderMoves(pkmn.levelup_moveset.map(x => {
                    return {
                        ...{Level: x[0]},
                        ...this.dataSearch(moveData, x[1]) //searching for index 1
                    }
                })),     
                tmhm: pkmn.tm_hm_learnset.map(x => {
                    return {
                        ...{tmhm: tmhmMapping.find(y => y.Move == x)?.tmhmIndex??"TM01"},
                        ...this.dataSearch(moveData, x)
                    }
                }),     
                tutor: pkmn.tutor_learnset.map(x => {
                    return this.dataSearch(moveData, x)
                }),    
                egg: pkmn.egg_moves.map(x => {
                    return this.dataSearch(moveData, x)
                }),    
            }
            return obj
        }, 


        //DAMAGE CALCULATION
        damage_calculation(userPkmnData, targetPkmnData, move, controller) { //controller should be set to either: "Player" or "AI"
            let dummy_object = {
                damageMin: 0, 
                damageMax: 0, 
                minPercentage: 0, 
                maxPercentage: 0, 
                recoilMin: 0, 
                recoilMax: 0, 
                move: move,
            }
            if (this.g2stateVariable != `Battle`) { return dummy_object }
            if (move == null) { return dummy_object }
            if (move == "Curse") { return dummy_object }
            //Setup data for calculation
            var lvl               = userPkmnData.level.value
            var userAttack        = userPkmnData.attack.value
            var userSpecialAttack = userPkmnData.specialAttack.value
            var userType1         = userPkmnData.type1.value
            var userType2         = userPkmnData.type2.value
            
            var targetDefense        = targetPkmnData.defense.value
            var targetSpecialDefense = targetPkmnData.specialDefense.value
            var targetMaxHp          = targetPkmnData.maxHp.value
            var targetType1          = targetPkmnData.type1.value
            var targetType2          = targetPkmnData.type2.value

            var moveData = this.gen2moves.find(x => x.Move.toUpperCase() === move.toUpperCase())
            var moveType = moveData.Type
            if (move == "Hidden Power") {
                moveType = this.moveType(move)
            }
            var movePower    = this.movePower(move)
            var moveCategory = "Physical"

            var defenseModification = 1
            var tripleKick = 1 //unfinished
            var weather    = 1
            var badge      = 1
            var stab       = 1
            var item      = this.determineItemBoost(move)
            var critical  = 1
            var moveMod   = 1 //unfinished
            var doubleDmg = 1 //unfinished
            var screen    = 1
            var explode   = 1
            
            var userOffensiveStat   = undefined
            var targetDefensiveStat = undefined
            
            var AttackingTypeEffectiveness = this.typeData.find(x => x.moveType === moveType)
            var type1 = AttackingTypeEffectiveness[targetType1]
            var type2 = AttackingTypeEffectiveness[targetType2]
            if (move == "Struggle" || move == "Future Sight" || move == "Beat Up") {
                type1 = 1
                type2 = 1
            }
            
            //Check values & update modifiers
            //WEATHER
            if (this.batt.weather.weatherType.value == `Sun`  && moveType == `Fire`)  { weather = 1.5 }
            if (this.batt.weather.weatherType.value == `Rain` && moveType == `Water`) { weather = 1.5 }
            if (this.batt.weather.weatherType.value == `Rain` && move == `SolarBeam`) { weather = 0.5 }
            if (this.batt.weather.weatherType.value == `Sun`  && moveType == `Water`) { weather = 0.5 }
            if (this.batt.weather.weatherType.value == `Rain` && moveType == `Fire`)  { weather = 0.5 }

            //TYPE-BASED BADGE-BOOST
            if (controller == "Player") {
                if (moveType == "Normal"   && this.game.properties.player.badges.badge3.value == true)  { badge = 1.125 }
                if (moveType == "Fighting" && this.game.properties.player.badges.badge5.value == true)  { badge = 1.125 }
                if (moveType == "Grass"    && this.game.properties.player.badges.badge12.value == true) { badge = 1.125 }
                if (moveType == "Fire"     && this.game.properties.player.badges.badge15.value == true) { badge = 1.125 }
                if (moveType == "Water"    && this.game.properties.player.badges.badge10.value == true) { badge = 1.125 }
                if (moveType == "Electric" && this.game.properties.player.badges.badge11.value == true) { badge = 1.125 }
                if (moveType == "Ground"   && this.game.properties.player.badges.badge16.value == true) { badge = 1.125 }
                if (moveType == "Rock"     && this.game.properties.player.badges.badge9.value == true)  { badge = 1.125 }
                if (moveType == "Psychic"  && this.game.properties.player.badges.badge14.value == true) { badge = 1.125 }
                if (moveType == "Poison"   && this.game.properties.player.badges.badge13.value == true) { badge = 1.125 }
                if (moveType == "Flying"   && this.game.properties.player.badges.badge1.value == true)  { badge = 1.125 }
                if (moveType == "Bug"      && this.game.properties.player.badges.badge2.value == true)  { badge = 1.125 }
                if (moveType == "Ice"      && this.game.properties.player.badges.badge7.value == true)  { badge = 1.125 }
                if (moveType == "Ghost"    && this.game.properties.player.badges.badge4.value == true)  { badge = 1.125 }
                if (moveType == "Dragon"   && this.game.properties.player.badges.badge8.value == true)  { badge = 1.125 }
                if (moveType == "Steel"    && this.game.properties.player.badges.badge6.value == true)  { badge = 1.125 }
            }

            //STAB
            if (moveType == userType1 || moveType == userType2) {
                stab = 1.5
            }

            //TRIPLE KICK CHECK (unfinished)
            //MOVEMOD (Rollout, Defense Curl, Fury Cutter, Rage) (unfinished)
            //DOUBLE DAMAGE (Pursuit) (unfinished)
            //Damage Category Selection
            let physical_types = ["Normal", "Fighting", "Ground", "Rock", "Bug", "Flying", "Poison", "Ghost", "Steel"]
            let special_types  = ["Grass", "Water", "Fire", "Electric", "Dragon", "Psychic", "Ice", "Dark"]
            if (movePower > 0) {
                if (physical_types.includes(moveType)) {
                    userOffensiveStat = userAttack
                    targetDefensiveStat = targetDefense
                    moveCategory = "Physical"
                }
                else if (special_types.includes(moveType)) {
                    userOffensiveStat = userSpecialAttack
                    targetDefensiveStat = targetSpecialDefense
                    moveCategory = "Special"
                }
            }
            if (movePower == "-") {
                return dummy_object
            }

            //SCREENS (Reflect & Light Screen) (unfinished)
            if (moveCategory = "Physical" && this.batt.field.player.statusReflect.value == true) {
                screen = 2
            }
            if (moveCategory = "Special" && this.batt.field.player.statusLightScreen.value == true) {
                screen = 2
            }

            if (move == "Selfdestruct" || move == "Explosion") { 
                explode = 0.5
            }
            defenseModification = screen * explode

            //Run damage calculation
            part1 = Math.floor(((2 * lvl)/5 + 2) * movePower * userOffensiveStat)
            part2 = Math.floor(part1/(targetDefensiveStat * defenseModification))
            part3 = Math.floor(part2/50) * item * critical + 2
            part4 = undefined
            if (targetType1 == targetType2) {
                part4 = Math.floor(Math.floor(Math.floor(Math.floor(Math.floor(Math.floor(Math.floor(Math.floor(part3 * tripleKick) * weather) * badge) * stab) * type1) * moveMod) * doubleDmg) * screen)
            }
            else {
                part4 = Math.floor(Math.floor(Math.floor(Math.floor(Math.floor(Math.floor(Math.floor(Math.floor(Math.floor(part3 * tripleKick) * weather) * badge) * stab) * type1) * type2) * moveMod) * doubleDmg) * screen)
            }
            //Results to return
            damageMin = Math.floor(part4 * (217/255))
            damageMax = part4

            //UNIQUE MOVES & FIXED DAMAGE
            if (move == "Guillotine") { return ["OHKO", "OHKO", 100, 100, 0, 0, move] }
            if (move == "Fissure") { return ["OHKO", "OHKO", 100, 100, 0, 0, move] }
            // if (move == "JUMP KICK") { return ["OHKO", "OHKO", 100, 100, 0, 0, move] }
            // if (move == "HI JUMP KICK") { return ["OHKO", "OHKO", 100, 100, 0, 0, move] }
            // if (move == "TRIPLE KICK") { return ["OHKO", "OHKO", 100, 100, 0, 0, move] }
            // if (move == "MAGNITUDE") { return ["OHKO", "OHKO", 100, 100, 0, 0, move] }
            if (move == "Dragon Rage") { 
                damageMin = 40
                damageMax = 40
            }
            if (move == "SonicBoom") { 
                damageMin = 20
                damageMax = 20
            }
            if (move == "Night Shade") { 
                damageMin = userPkmnData.level
                damageMax = userPkmnData.level
            }
            if (move == "Psywave") { 
                damageMin = 1
                damageMax = Math.floor(userPkmnData.level * 1.5)
            }
            // if (move == "RAGE") { 
            //     damageMin = 1
            //     damageMax = Math.floor(userPkmnData.level * 1.5)
            // }
            // if (move == "FURY CUTTER") { 
            //     damageMin = 1
            //     damageMax = Math.floor(userPkmnData.level * 1.5)
            // }
            // if (move == "ROLLOUT") { 
            //     damageMin = 1
            //     damageMax = Math.floor(userPkmnData.level * 1.5)
            // }
            if (move == "DoubleSlap" || 
            move == "Pin Missile" || 
            move == "Comet Punch" || 
            move == "Fury Swipes" || 
            move == "Spike Cannon" || 
            move == "Barrage" || 
            move == "Fury Attack") { 
                damageMin = damageMin * 2
                damageMax = damageMax * 5
            }
            if (move == "Bonemerang" || 
            move == "Double Kick" || 
            move == "Twineedle") { 
                damageMin = damageMin * 2
                damageMax = damageMax * 2
            }
            if (move == "Flail" || 
            move == "Reversal") { 
                damageMin = damageMax
                damageMax = damageMax
            }
            // if (move == "BEAT UP") { 
            //     damageMin = damageMin * this.game.properties.player.teamCount
            //     damageMax = damageMax * 2
            // }

            minPercentage = Math.round((damageMin/targetMaxHp) * 100)
            maxPercentage = Math.round((damageMax/targetMaxHp) * 100)
            if (minPercentage > 100) { minPercentage = 100 }
            if (maxPercentage > 100) { maxPercentage = 100 }
            var recoilMin = 0
            var recoilMax = 0
            if (move == "Take Down" || move == "Submission" || move == "Double-Edge") {
                recoilMin = Math.floor(damageMin * 0.25)
                recoilMax = Math.floor(damageMax * 0.25)
            }
            return {
                damageMin: damageMin, 
                damageMax: damageMax, 
                minPercentage: minPercentage, 
                maxPercentage: maxPercentage, 
                recoilMin: recoilMin, 
                recoilMax: recoilMax, 
                move: move,
            }
        },
        enemyPkmnFaint(pkmnData) {
            // The sprite's flip lives in `transform: scale(-x, y)`, which CSS applies *after* the
            // filter — so a flipped sprite mirrors the drop-shadow's X offset onto the wrong side.
            // Pre-negate the shadow's X here so it reads the same in screen space whether flipped or not.
            const shadowX = this.getEnemySpriteFlipped(pkmnData.species?.value) ? -2 : 2;
            if (pkmnData.hp == 0) {
                return `filter: drop-shadow(${shadowX}px 2px 2px #000) saturate(1.3) grayscale(100%); opacity: .5;`
            }
            else {
                return `filter: drop-shadow(${shadowX}px 2px 2px #000) saturate(1.3) grayscale(0%);`
            }
        },
        enemyPkmnFaintStatsBackground(pkmnData) {
            if (pkmnData.hp == 0) {
                return "filter: grayscale(100%); opacity: .5;"
            }
            else {
                return "filter: grayscale(0%);"
            }
        },
        enemyPkmnText(pkmnData) {
            if (pkmnData.hp == 0) {
                return "opacity: .3"
            }
            else {
                return "opacity: 1"
            }
        },
        enemyPkmnSpecies(pkmnData) {
            if (pkmnData.hp == 0) {
                return "opacity: .3"
            }
            else {
                return "opacity: .7"
            }
        },
        enemyPkmnFaintStats(pkmnData) {
            if (pkmnData.hp == 0) {
                return "filter: grayscale(100%); opacity: .4;"
            }
            else {
                return "filter: grayscale(0%);"
            }
        },

        // STAGE MULTIPLIERS
        activeSlot(activePkmn, currentSlot, statLabel, stat, side) {
            if (this.enemyState == "Fainted" || this.g2stateVariable == "From Battle") {
                return stat 
            }
            else if (this.enemyState == "Pokemon" || this.enemyState == "Fainting") {
                if (activePkmn == currentSlot && this.g2stateVariable == "Battle") {
                    return this.game.properties.battle[side][statLabel].value
                }
                else { 
                    return stat
                }
            }
            else {
                return stat
            }
        },
        // activeSlot(activePkmn, currentSlot, statLabel, stat, side) {
        //     if (this.slotTimingFix == true) {
        //         return stat 
        //     }
        //     else {
        //         if (activePkmn == currentSlot && this.g2stateVariable == "Battle") {
        //             return this.game.properties.battle[side][statLabel].value
        //         }
        //         else { 
        //             return stat
        //         }
        //     }
        // },

        //STATE MANAGEMENT
        g2state() {
            if (this.gameStarted == false && this.game.properties.player.playerId == 0) {
                string = "New Game"
                g2gamestate = string
                return string
            }
            else if (this.gameStarted == false && this.game.properties.player.playerId > 0 && this.game.properties.player.name.value != 0) {
                this.gameStarted = true
                string = "Character Named"
                g2gamestate = string
                return string
            }
            else if (this.gameStarted == true && this.game.properties.player.teamCount == 0) {
                string = "Pre-Starter"
                g2gamestate = string
                this.inBattle = false
                return string
            }
            else if (this.gameStarted == false && this.game.properties.player.playerId > 0) {
                string = "New Game Started"
                g2gamestate = string
                return string
            }
            else if (this.gameStarted == true && 
                this.game.properties.player.teamCount > 0 && 
                this.game.properties.battle.mode.bytes == 0) {
                this.starterReceived = true
                this.inBattle = false
                string = "Overworld"
                g2gamestate = string
                return string
            }
            else if (this.gameStarted == true && this.inBattle == false &&
                this.game.properties.battle.mode.bytes > 0 && 
                this.game.properties.battle.info.lowHealthAlarm.bytes == 0 && 
                this.game.properties.battle.result.value == "DRAW") {
                this.inBattle = false
                string = "From Battle - Ran"
                g2gamestate = string
                return string
            }
            else if (this.gameStarted == true && 
                this.game.properties.battle.mode.bytes > 0 && 
                this.game.properties.battle.info.lowHealthAlarm.bytes == 1 && 
                this.game.properties.battle.result.value == "WIN") {
                this.inBattle = false
                string = "From Battle - Won"
                g2gamestate = string
                return string
            }
            else if (
                (this.gameStarted == true && this.starterReceived == true && 
                this.game.properties.battle.mode.bytes > 0 && 
                this.game.properties.battle.battleStart.bytes == 1 &&
                this.game.properties.battle.info.lowHealthAlarm.bytes == 0)
                ) {
                this.inBattle = true
                string = "To Battle"
                g2gamestate = string
                return string
            }
            else if ((this.gameStarted == true && this.inBattle == false &&
                this.game.properties.battle.mode.bytes > 0 && 
                this.game.properties.battle.info.lowHealthAlarm.bytes == 47 && 
                this.game.properties.battle.yourPokemon.move1.bytes == 0
                )) {                
                string = "To Battle"
                g2gamestate = string
                return string
            }
            else if ((this.gameStarted == true && this.inBattle == false &&
                this.game.properties.battle.mode.bytes > 0 && 
                this.game.properties.battle.info.lowHealthAlarm.bytes == 0 && 
                this.game.properties.battle.result.value == "WIN" && 
                this.game.properties.battle.yourPokemon.move1.bytes == 0
                )) {                
                string = "To Battle"
                g2gamestate = string
                return string
            }
            else if ((this.gameStarted == true && this.inBattle == false &&
                this.game.properties.battle.mode.bytes > 0 && 
                this.game.properties.battle.info.lowHealthAlarm.bytes > 1 && 
                this.game.properties.battle.result.value == "DRAW" && 
                this.game.properties.battle.yourPokemon.move1.bytes == 0
                )) {                
                string = "To Battle"
                g2gamestate = string
                return string
            }
            else if ((this.gameStarted == true && this.inBattle == false &&
                this.game.properties.battle.mode.bytes > 0 && 
                this.game.properties.battle.info.lowHealthAlarm.bytes > 1 && 
                this.game.properties.battle.result.value == "WIN"
                )) {                
                string = "To Battle"
                g2gamestate = string
                return string
            }
            else if (this.gameStarted == true && this.inBattle == true &&
            // else if (
                this.game.properties.battle.mode.bytes > 0 && 
                this.game.properties.battle.info.lowHealthAlarm.bytes == 0 && 
                this.game.properties.battle.result.value == "WIN") {
                string = "Battle"
                g2gamestate = string
                return string
            }
            else if (this.gameStarted == true && this.starterReceived == true && 
                this.game.properties.player.teamCount == 0) {
                this.inBattle = false
                string = "Reset"
                g2gamestate = string
                return string
            }
            else {
                string = "Error, the gamestate could not be determined."
                this.inBattle = false
                g2gamestate = string
                return string
            }
        },
        setStartTime(day, hrs, min, sec) {
            sec -= this.game.properties.time.rtc.second.value;
            min -= this.game.properties.time.rtc.minute.value;
            hrs -= this.game.properties.time.rtc.hour.value;
            day -= this.game.properties.time.rtc.day.value;
            if (day < 0) { day += 7; }
            if (hrs < 0) { hrs += 24; day -= 1; }
            if (min < 0) { min += 60; hrs -= 1; }
            if (sec < 0) { sec += 60; min -= 1; }
            this.game.properties.time.start.second.setBytes([sec], false);
            this.game.properties.time.start.minute.setBytes([min], false);
            this.game.properties.time.start.hour.setBytes([hrs], false);
            this.game.properties.time.start.day.setBytes([day], false);
        },
        //SHORTHANDS
        // s1() {
        //     return this.game?.properties?.player?.team[0]
        // },
        q1() { //player recall
            return this.game?.properties?.player
        },
        bat() { //player battle
            return this.game?.properties?.battle
        },
        batp() { //player battle
            return this.game?.properties?.battle?.yourPokemon
        },
        starterProp(property) {
            return this.dexDataCrystal[this.starter][property]
        },

        //Pokemon Data Search
        pokemon(PokemonPokedexNumber) {
            if (PokemonPokedexNumber != null)
            PokemonPokedexNumber = parseInt(y)
            return this.dexDataCrystal.find(x => x.dexNumber === y)
        },

        //EXPERIENCE FUNCTIONS

        growthRateCheck() { //checks the starter Pokemon's growth rate
            return this.dexDataCrystal[this.starter]["growth_rate"]
        },
        growthRate(growthRate) {
            if (growthRate == "GROWTH_SLOW") {
                return "Slow"
            }
            else if (growthRate == "GROWTH_MEDIUM_SLOW") {
                return "Medium Slow"
            }
            else if (growthRate == "GROWTH_MEDIUM_FAST") {
                return "Medium Fast"
            }
            else if (growthRate == "GROWTH_FAST") {
                return "Fast"
            }
            else if (growthRate == "GROWTH_FLUCTUATING") {
                return "Fluctuating"
            }
            else if (growthRate == "GROWTH_ERRATIC") {
                return "Erratic"
            }
            else    
                return 0         
        },
        calcExpStats(growthRate, exp) {
            switch (growthRate) {
                case "Erratic":     growthRate = "GROWTH_ERRATIC";     break;
                case "Fast":        growthRate = "GROWTH_FAST";        break;
                case "Medium Fast": growthRate = "GROWTH_MEDIUM_FAST"; break;
                case "Medium Slow": growthRate = "GROWTH_MEDIUM_SLOW"; break;
                case "Slow":        growthRate = "GROWTH_SLOW";        break;
                case "Fluctuating": growthRate = "GROWTH_FLUCTUATING"; break;
            }
            const expTable = this.exp_table

            // makes searching a bit easiser
            expTable["GROWTH_ERRATIC"][100]     = expTable["GROWTH_ERRATIC"][99] + 1;
            expTable["GROWTH_FAST"][100]        = expTable["GROWTH_FAST"][99] + 1;
            expTable["GROWTH_MEDIUM_FAST"][100] = expTable["GROWTH_MEDIUM_FAST"][99] + 1;
            expTable["GROWTH_MEDIUM_SLOW"][100] = expTable["GROWTH_MEDIUM_SLOW"][99] + 1;
            expTable["GROWTH_SLOW"][100]        = expTable["GROWTH_SLOW"][99] + 1;
            expTable["GROWTH_FLUCTUATING"][100] = expTable["GROWTH_FLUCTUATING"][99] + 1;
        
            const index = expTable[growthRate].findIndex(x => x > exp);
            const currLvlExp = expTable[growthRate][index - 1];
            const nextLvlExp = expTable[growthRate][index];
            return {
                level: index,
                percent: (exp - currLvlExp) / (nextLvlExp - currLvlExp),
            };
        }, 

        //ENEMY GRAPHIC MANAGEMENT
        g2trainer(x, y) {
            return (x + " " + y)
        },


        fixTrainerName(trainerName, trainerNumber) {
            const rival1Teams = [
              "rival1",
              "rival1",
              "rival1",
              "rival2",
              "rival2",
              "rival2",
              "rival3",
              "rival3",
              "rival3",
              "rival4",
              "rival4",
              "rival4",
              "rival5",
              "rival5",
              "rival5",
              "rival6",
              "rival6",
              "rival6",
            ];
            if (trainerName == "RIVAL1") {
                return rival1Teams[trainerNumber - 1];
            }
            else {
                return trainerName
            }
        },

        //Functional with all generations
        battlePokemonCrop() {
            let totalPokemon = 0;
            let height = ""
            const heights = {
                1: "242px",
                2: "402px",
                3: "562px",
                4: "726px",
                5: "886px",
                6: "1080px"
            };
            if (this.right_panel == 'Trainers') {
                totalPokemon = this.examined_trainer_data?.party?.length ?? 0
                height = heights[totalPokemon];
                return `height: ${height}; filter: saturate(${this.ui_saturation}) drop-shadow(0px 0px 1px #000000)`;
            }
            totalPokemon = this.game.properties.battle.trainer.totalPokemon.value;
            height = heights[totalPokemon];
            return `height: ${height}; filter: saturate(${this.ui_saturation}) drop-shadow(0px 0px 1px #000000)`;
        },

        //BADGE GRAPHIC RECALL
        badgeGraphic(x) {
            if (x.value == true) {
                var badge = x.path.toString().substring(14)
                return `images/gen2/gen2-badges/${badge}.webp`
            }
            else if (x.value == false) {   
                return null
            }
        },

        // TYPE ICONS
        getStarterType1() {
            if (this.pick == true)
                var type = this.dexDataCrystal[this.starter].type_1
                return `images/gen2/type-icons/${type}.webp`
        },
        getStarterType2() {
            if (this.pick == true)
                var type = this.dexDataCrystal[this.starter].type_2
                return `images/gen2/type-icons/${type}.webp`
        },
        getRolloutCounter() {
            if (this.game.properties.patch.patchPresent!= null) {
                if (this.game.properties.patch.patchPresent.value == 1) {
                    return this.rolloutCounterCopy;
                }
            }
            return this.game.properties.battle.yourPokemon.counters.rollout.value;
        },

        //MOVESET
        moveTypeIcon(y) { //y = move1.value
            const moveType = this.moveType(y)?.toLowerCase()
            if (moveType) {
                return `images/gen2/type-icons-circular/${moveType}.webp`
            }
        },
        movePower(y) { //y = move1.value
            if (y) { y = y.toUpperCase() }
            if (y) {
                var move = this.gen2moves.find(x => x.Move.toUpperCase() === y)
                if (y == "RETURN") { return this.g2ReturnPowerCalc(this.game.properties.player.team[0]) }
                else if (y == "FRUSTRATION") { return this.g2FrustrationPowerCalc(this.game.properties.player.team[0]) }
                else if (y == "HIDDEN POWER") { return this.g2HiddenpowerPowerCalc(this.game.properties.player.team[0]) }
                else if (y == "FUTURE SIGHT") { return 80 }
                else if (y == "ROLLOUT") { return this.g2RolloutPowerCalc() }
                else if (y == "FURY CUTTER") { return this.g2FuryCutterPowerCalc() }
                else if (y == "REVERSAL" || y == "FLAIL") { return this.g2FlailReversalCalc() }
                else { if (move) return move.Power }
            }
            return null
        },
        g2FlailReversalCalc() {
            var hpPercentage = 0
            // if (this.g2stateVariable == `Battle`) { hpPercentage = (this.batt.yourPokemon.hp / this.batt.yourPokemon.maxHp) }
            if (this.g2stateVariable == `Battle`) { hpPercentage = (this.s1.hp / this.s1.maxHp) }
            if (this.g2stateVariable != `Battle`) { hpPercentage = (this.s1.hp / this.s1.maxHp) }
            if ( hpPercentage >= .6875 ) { return 20 }
            if ( hpPercentage >= .3542 ) { return 40 }
            if ( hpPercentage >= .2083 ) { return 80 }
            if ( hpPercentage >= .1042 ) { return 100 }
            if ( hpPercentage >= .0417 ) { return 150 }
            return 200
        },
        g2ReturnPowerCalc(slotNumber) {
            if (this.g2stateVariable == "Base Stats") { return "-"}
            if (slotNumber.friendship.value < 2.5) { var friendshipValue = 2.5 }
            else { var friendshipValue = slotNumber.friendship.value }
            var specialMovePower = Math.floor(friendshipValue/2.5)
            return specialMovePower
        },
        g2FrustrationPowerCalc(slotNumber) {
            var friendshipValue = slotNumber.friendship.value
            var specialMovePower = Math.floor((255 - friendshipValue)/2.5)
            if (specialMovePower == 0) {
                specialMovePower = 1
            }
            return specialMovePower
        },
        g2FuryCutterPowerCalc() {
            if (this.g2stateVariable == "Battle") {
                if ((10*(Math.pow(2, this.game.properties.battle.yourPokemon.counters.furyCutter.value)) > 160)) { return 160 }
                else { return 10*(Math.pow(2, this.game.properties.battle.yourPokemon.counters.furyCutter.value)) }
            } else { return 10 }
        },
        g2RolloutPowerCalc() {
            if (this.g2stateVariable == "Battle" && this.game.properties.battle.yourPokemon.status.curled.value == false) {
                return 30*(Math.pow(2, this.getRolloutCounter()))
            } else if (this.g2stateVariable == "Battle" && this.game.properties.battle.yourPokemon.status.curled.value == true) {
                return 30*(Math.pow(2, this.getRolloutCounter() + 1))
            } else { return 30 }
        },
        g2HiddenpowerTypeCalc(slot) { //x = slot number
            ivAtkBit = slot.dvAttack.value % 4
            ivDefBit = slot.dvDefense.value % 4
            g2HpType = (4 * ivAtkBit) + ivDefBit
            return this.hiddenPowerTypes[g2HpType]
        },
        g2HiddenpowerPowerCalc(slot) { //x = slot number
            y = slot.dvAttack.value >> 3
            v = slot.dvSpecial.value >> 3
            w = slot.dvSpeed.value >> 3
            x = slot.dvDefense.value >> 3
            upperZ = slot.dvSpecial.value % 4
            hpPower = ((5 * v + upperZ)/2) + (5 * w) + (10 * x) + (20 * y) + 31
            return hpPower
        },
        moveType(y) { //y = move1.value
            if (y) { y = this.move_name(y).toUpperCase() }
            if (y == `HIDDEN POWER`) {
                return this.g2HiddenpowerTypeCalc(this.game.properties.player.team[0])
            }
            else if (y) {
                var move = this.gen2moves.find(x => x.Move.toUpperCase() === y)
                if (move) return move.Type
            }
            return null
        },
        weatherModifier(weather, move, moveType) {
            if (move) { move = move.toUpperCase() }
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
            else if (weather == "Rain" && move == "SOLARBEAM") {
                return .5
            }
            else if (weather == "Sandstorm") {
                return 1
            }
            else {
                return 1
            }
        },

        determineSTAB(x) { //x = move1.value
            if (x) { x = x.toUpperCase() }
            if (this.addStabBonus == true) {
                var hpType = this.g2HiddenpowerTypeCalc(this.game.properties.player.team[0])
                var moveTypeVar = this.moveType(x)
                // var pkmnType1 = "Psychic"
                // var pkmnType2 = "Psychic"
                var pkmnType1 = this.starterProp("type_1")
                var pkmnType2 = this.starterProp("type_2")
                if (x == `HIDDEN POWER`) {
                    if (pkmnType1 == hpType || pkmnType2 == hpType) {
                        return 1.5
                    }
                    else {
                        return 1
                    }
                }
                else if (pkmnType1 == moveTypeVar || pkmnType2 == moveTypeVar) {
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
        determineItemBoost(x) { //x - move1.value
            if (x) { x = x.toUpperCase() }
            var heldItemValue = this.game.properties.player.team[0].heldItem?.value?.toUpperCase()
            var itemType = this.typeBoostingItems[heldItemValue]
            if (x == "HIDDEN POWER") {
                if (itemType == this.g2HiddenpowerTypeCalc(this.game.properties.player.team[0])) {
                    return 1.1
                }
                else {
                    return 1
                }
            }
            if (itemType == this.moveType(x)) {
                return 1.1
            }
            else   
                return 1
        },

        badgeBoostType(move) { //move1.value
            if (move) { move = move.toUpperCase() }
            var moveType = this.moveType(move)
            var typeBoostBadge = this.badgeTypeBoosts[moveType]
            var badge = this.game.properties.player?.badges[typeBoostBadge]?.value
            if (this.addBadgeTypeBonus == true) {
                if (badge == true) {
                    return 1.125
                }
                else {
                    return 1
                }
            }
            else {
                return 1
            }
        },
        moveDynamic(slot) {
            if (this.g2stateVariable == `Battle`) {
                return this.game?.properties?.battle?.yourPokemon[`move${slot}`].value
            }
            else {
                return this.game?.properties?.player?.team[0][`move${slot}`].value
            }
        },
        typeEffectivenessCheck(moveType) {
            return this.typeData.find(x => x.moveType === moveType)
        },
        typeEffectiveness(x) { //x = move1.value
            console.log(x)
            if (x) { x = this.move_name(x).toUpperCase() }
            let typeOfMove = this.moveType(x);
            if(typeOfMove == null || typeOfMove == undefined) {
                return "";
            }
            var stab = this.determineSTAB(x)
            var itemBoost = this.determineItemBoost(x)
            var weatherBoost = this.weatherModifier(this.game.properties.battle.weather.weatherType.value, x, this.moveType(x))
            var typeBoost = this.badgeBoostType(x) 

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
            if (double_hit_moves.map(m => m.toUpperCase()).includes(x) == true) {
                multi_hit_modifier = 2;
            }
            if (triple_hit_moves.map(m => m.toUpperCase()).includes(x) == true) {
                multi_hit_modifier = 3;
            }

            var movePowerFunction = this.movePower(x)
            if (x == "FUTURE SIGHT") { return 80 }
            if (x != null) {
                if (this.typeCalcs == true && this.g2stateVariable == "Battle") { //calculates effective power when in battle
                    var attackingType = this.moveType(x)
                    var defendingTypeMono = this.game.properties.battle.enemyPokemon.type1.value
                    var defendingType1 = this.game.properties.battle.enemyPokemon.type1.value
                    var defendingType2 = this.game.properties.battle.enemyPokemon.type2.value
                    var multipliers = this.typeData.find(x => x.moveType === attackingType)
                    //NO MOVE POWER (STATUS MOVE)
                    if (this.movePower(x) == "-")
                        return this.movePower(x)
                    //NO ENEMY DATA (HAVEN'T BATTLED SINCE RELOADING ROM OR SAVE)
                    else if (this.game.properties.battle.enemyPokemon.type1 == null) {
                        return Math.floor(this.movePower(x) * stab * itemBoost * typeBoost * multi_hit_modifier)
                    }
                    //ATTACKING A MONO-TYPE POKEMON
                    else if (this.game.properties.battle.enemyPokemon.type1.value === this.game.properties.battle.enemyPokemon.type2.value) {
                        var multiplier1 = multipliers[defendingTypeMono]
                        return Math.floor(this.movePower(x) * multiplier1 * stab * itemBoost * weatherBoost * typeBoost * multi_hit_modifier)
                    }
                    //ATTACKING A DUAL-TYPE POKEMON
                    else if (this.game.properties.battle.enemyPokemon.type1 != this.game.properties.battle.enemyPokemon.type2) {
                        var multipliers = this.typeData.find(x => x.moveType === attackingType)
                        var multiplier1 = multipliers[defendingType1]
                        var multiplier2 = multipliers[defendingType2]
                        return Math.floor(this.movePower(x) * multiplier1 * multiplier2 * stab * itemBoost * weatherBoost * typeBoost * multi_hit_modifier)
                    }
                    //RETURN THE MOVES POWER IF NOTHING ELSE WORKS
                    else
                        return this.movePower(x) //returns the move's base power if not in battle
                }
                //RETURN THE MOVE'S POWER IF NOT IN BATTLE
                else {
                    if (this.movePower(x) == "-") { return this.movePower(x) }
                    else { return Math.floor(this.movePower(x) * stab * itemBoost * typeBoost * multi_hit_modifier) } //returns the move's base power if not in battle
                } 
            }
            else { return "" }
        },

        enemy_move_power(move_name) {
            var move_power = this.g2MoveData[this.move_name(move_name)].Power ?? 0
            if (move_power == 0) { return "—" }
            if (move_power == 1) { return "—" }
            if (move_power == "—") { return "—" }
            if (move_power == "-") { return "—" }
            if (move_power == "") { return "—" }
            else return move_power
        },
        enemy_effective_power(move_name, enemy_mon, slot) {
            const state = this.g2stateVariable
            const enemy_state = this.enemyState
            const move = this.move_name(move_name)
            if (state == 'To Battle' || state == 'Battle' || state == 'From Battle') { 
                const species = enemy_mon.species.value
                const move_data = this.g2MoveData[move]
                const move_type = move_data.Type
                const move_base_power = this.enemy_move_power(move) ?? move_data.Power
                const move_category = move_data.Category
                const user_type_1 = this.dexDataCrystal[species].type_1
                const user_type_2 = this.dexDataCrystal[species].type_2
                const target_type_1 = state == 'To Battle' ? this.dexDataCrystal[this.game.properties.player.team[0].species.value].type_1 : this.game.properties.battle.yourPokemon.type1.value
                const target_type_2 = state == 'To Battle' ? this.dexDataCrystal[this.game.properties.player.team[0].species.value].type_2 : this.game.properties.battle.yourPokemon.type2.value
                if (move_base_power == "—" || move_base_power == "-") { return "—" }
                var move_effective_power = move_base_power
                var modifier_effectiveness_1 = this.typeData.find(x => x.moveType == move_type)[target_type_1]
                var modifier_effectiveness_2 = target_type_2 && move_type && (target_type_1 != target_type_2) ? this.typeData.find(x => x.moveType == move_type)[target_type_2]
                    : 1
                var modifier_stab = move_type == user_type_1 ? 1.5 
                    : move_type == user_type_2 ? 1.5 
                    : 1
    
                //Calculate effective power
                if (this.typeCalcs == true) { //Handles type effectiveness calculations in battle
                    return Math.floor(move_base_power * modifier_stab * modifier_effectiveness_1 * modifier_effectiveness_2)
                }
            }
        },

        type_effectiveness(pkmnData, moveNumber, enemyData) { //pkmnData = team[0] etc
            if (this.typeCalcs == true) {
                var move_name          = move_name(pkmnData["move" + moveNumber].value)
                if (move_name == null) { return "" } //stop the function if there is no move in that slot
                
                var move_type          = this.g2MoveData[move_name].Type
                var move_info          = this.typeData.find(x => x.moveType === move_type)
                var move_power         = this.movePower(move_name)
                var move_category      = "Status"
                var attacker_type1     = pkmnData.type1.value
                var attacker_type2     = pkmnData.type2.value
                var defender_type1     = enemyData.type1.value
                var defender_type2     = enemyData.type2.value
                var multiplier_stab    = 1
                var multiplier_type1   = move_info[defender_type1]
                var multiplier_type2   = 1
                var screen_reflect     = 1
                var screen_lightscreen = 1
                var held_item          = this.determineItemBoost(move_name)
                var field_weather      = this.weatherModifier(this.game.properties.battle.weather.weatherType.value, move_name, this.moveType(move_name))
                var type_boost         = this.badgeBoostType(move_name)
                
                //update variables
                if (move_type == attacker_type1 || move_type == attacker_type2)                { multiplier_stab = 1.5 }
                if (defender_type1 != defender_type2)                                          { multiplier_type2 = this.typeData.find(x => x.moveType === move_type)[defender_type2] }
                if (move_type == "Normal" || move_type == "Fighting" || move_type == "Flying" || move_type == "Bug" || move_type == "Poison" || move_type == "Ghost" || move_type == "Ground" || move_type == "Rock" || move_type == "Steel") {
                    move_category = "Physical" }
                if (move_type == "Fire" || move_type == "Water" || move_type == "Grass" || move_type == "Electric" || move_type == "Psychic" || move_type == "Ice" || move_type == "Dragon" || move_type == "Dark") {
                    move_category = "Special" }
                if (enemyData.effects.reflect.value == true && move_category == "Physical")    { screen_reflect = 0.5 }
                if (enemyData.effects.lightScreen.value == true && move_category == "Special") { screen_lightscreen = 0.5 }

                //return if further updates aren't required
                if (move_power == "-")                { return move_power } //returns "-" if the move has no power
                if (this.g1stateVariable != `Battle`) { return Math.floor(move_power * multiplier_stab * held_item * type_boost) } //returns the move's base power if not in battle

                //calculate the move's effective power
                return Math.floor(move_power * multiplier_stab * multiplier_type1 * multiplier_type2 * screen_reflect * screen_lightscreen * held_item * field_weather * type_boost)
            }
            else { return this.movePower(pkmnData[moveNumber].value) }
        },


        //STATS
        statLabelOpacity() {
            let default_opacity = .63
            let faded_opacity = .1
            let mod_atk = this.game.properties.battle.yourPokemon.modStageAttack.value != '0'         && this.g2stateVariable == 'Battle' ? faded_opacity : default_opacity
            let mod_def = this.game.properties.battle.yourPokemon.modStageDefense.value != '0'        && this.g2stateVariable == 'Battle' ? faded_opacity : default_opacity
            let mod_spa = this.game.properties.battle.yourPokemon.modStageSpecialAttack.value != '0'  && this.g2stateVariable == 'Battle' ? faded_opacity : default_opacity
            let mod_spd = this.game.properties.battle.yourPokemon.modStageSpecialDefense.value != '0' && this.g2stateVariable == 'Battle' ? faded_opacity : default_opacity
            let mod_spe = this.game.properties.battle.yourPokemon.modStageSpeed.value != '0'          && this.g2stateVariable == 'Battle' ? faded_opacity : default_opacity
            let object = {
                "Hp":              default_opacity,
                "Attack":          mod_atk,
                "Defense":         mod_def,
                "Speed":           mod_spe,
                "Special Attack":  mod_spa,
                "Special Defense": mod_spd,
            }
            return object
        },
        stageModifiers(y) {
            if (y === null) {
                return " "
            }
            else
                if (y > 0) {
                    return "+" + y.toString()
                }
                else
                    if (y < 0) {
                        return y.toString()
                    }
                    else
                        return " "
        },
        badge_boost(badge, stat, stat_name) {
            let boost = 1.125
            if (this.display_badge_boosts == false) { return stat }
            if (badge == true) {
                if (stat_name == "Special Defense") {
                    if (this.game.properties.player.team[0].specialAttack < 206
                        ||
                        this.game.properties.player.team[0].specialAttack > 432 &&
                        this.game.properties.player.team[0].specialAttack < 661
                        ) {
                        return stat
                    }
                    else {
                        return Math.floor(stat * boost)
                    }
                }
                else {
                    return Math.floor(stat * boost)
                }
            }
            else {
                return stat
            }
        },
        badgeBoost(badge, boost, stat) {
            if (this.display_badge_boosts == false) { return stat }
            if (badge == true) {
                return Math.floor(stat * boost)
            }
            else {
                return stat
            }
        },
        // g2spcDefBoost(badge, boost, stat) { //yes, the special defense is boosted/not boosted based on the unboosted special attack value
        //     if (this.display_badge_boosts == false) { return stat }
        //     if (badge == true) {
        //         if (this.game.properties.player.team[0].specialAttack < 206
        //             ||
        //             this.game.properties.player.team[0].specialAttack > 432 &&
        //             this.game.properties.player.team[0].specialAttack < 661
        //             ) {
        //             return stat
        //         }
        //         else {
        //             return Math.floor(stat * boost)
        //         }
        //     }
        //     return stat
        // },
        g2spcDefCheck() {
            const state = this.g2stateVariable
            let special_attack = this.game.properties.player.team[0].specialAttack.value
            let battle_special_attack = this.game.properties.battle.yourPokemon.specialAttack.value / 1.125
            let spa = state == "Battle" || state == "From Battle" ? battle_special_attack : special_attack
            if (spa < 206
                ||
                spa > 432 && spa < 661
                ) {
                return "No boost"
            }
            else {
                return "Boost"
            }
        },
        maxStat(stat) {
            if (stat > 999)
                return 999
            else
                return stat
        },
        statExp(statExp, label) { //statExp = mapper.properties.player.team[0].statExpAttack.value
            vitaminsUsed = (statExp / 2560)
            usableVitamins = Math.ceil(10 - vitaminsUsed)
            if (usableVitamins < 0) {
                return 0
            }
            else {
                return usableVitamins
            }
        },
        specialTrainerGraphics() {
            if (this.showSpecialTrainerGraphics == true) {
                if (this.batt.trainer.class.value == "CLAIR") { return `images/gen2/trainers/${this.batt.trainer.class.value}.webp` }
                // else if (this.game.properties.battle.trainer.class == "POKEMANIAC" && this.game.properties.battle.trainer.number == 7) return `images/gen2/trainers/${this.game.properties.battle.trainer.class.value}_${this.game.properties.battle.trainer.number}.webp`
                else if (this.game.properties.battle.trainer.class == "FISHER"     && this.game.properties.battle.trainer.id == 2)  return `images/gen2/trainers/RALPH.webp`
                else if (this.game.properties.battle.trainer.class == "BLACKBELT"  && this.game.properties.battle.trainer.id == 2)  return `images/gen2/trainers/YOSHI.webp`
                else if (this.game.properties.battle.trainer.class == "BLACKBELT"  && this.game.properties.battle.trainer.id == 4)  return `images/gen2/trainers/LAO.webp`
                else if (this.game.properties.battle.trainer.class == "BLACKBELT"  && this.game.properties.battle.trainer.id == 5)  return `images/gen2/trainers/NOB.webp`
                else if (this.game.properties.battle.trainer.class == "HIKER"      && this.game.properties.battle.trainer.id == 5)  return `images/gen2/trainers/ANTHONY.webp`
                else if (this.game.properties.battle.trainer.class == "SCHOOLBOY"  && this.game.properties.battle.trainer.id == 10) return `images/gen2/trainers/CHAD.webp`
                //RIVAL1
                else if (this.game.properties.battle.trainer.class == "RIVAL1" && this.game.properties.battle.trainer.id == 1) return `images/gen2/trainers/SILVER1.webp`
                else if (this.game.properties.battle.trainer.class == "RIVAL1" && this.game.properties.battle.trainer.id == 2) return `images/gen2/trainers/SILVER1.webp`
                else if (this.game.properties.battle.trainer.class == "RIVAL1" && this.game.properties.battle.trainer.id == 3) return `images/gen2/trainers/SILVER1.webp`
                else if (this.game.properties.battle.trainer.class == "RIVAL1" && this.game.properties.battle.trainer.id == 4) return `images/gen2/trainers/SILVER2.webp`
                else if (this.game.properties.battle.trainer.class == "RIVAL1" && this.game.properties.battle.trainer.id == 5) return `images/gen2/trainers/SILVER2.webp`
                else if (this.game.properties.battle.trainer.class == "RIVAL1" && this.game.properties.battle.trainer.id == 6) return `images/gen2/trainers/SILVER2.webp`
                else if (this.game.properties.battle.trainer.class == "RIVAL1" && this.game.properties.battle.trainer.id == 7) return `images/gen2/trainers/SILVER3.webp`
                else if (this.game.properties.battle.trainer.class == "RIVAL1" && this.game.properties.battle.trainer.id == 8) return `images/gen2/trainers/SILVER3.webp`
                else if (this.game.properties.battle.trainer.class == "RIVAL1" && this.game.properties.battle.trainer.id == 9) return `images/gen2/trainers/SILVER3.webp`
                //KIMONO GIRLS
                else if (this.game.properties.battle.trainer.class == "KIMONO GIRL" && this.game.properties.battle.trainer.id == 4) return `images/gen2/trainers/KIMONO_ZUKI.webp`
                else if (this.game.properties.battle.trainer.class == "KIMONO GIRL" && this.game.properties.battle.trainer.id == 3) return `images/gen2/trainers/KIMONO_NAOKO.webp`
                else if (this.game.properties.battle.trainer.class == "KIMONO GIRL" && this.game.properties.battle.trainer.id == 2) return `images/gen2/trainers/KIMONO_MIKI.webp`
                else if (this.game.properties.battle.trainer.class == "KIMONO GIRL" && this.game.properties.battle.trainer.id == 6) return `images/gen2/trainers/KIMONO_SAYO.webp`
                else if (this.game.properties.battle.trainer.class == "KIMONO GIRL" && this.game.properties.battle.trainer.id == 5) return `images/gen2/trainers/KIMONO_KUNI.webp`
                //CATCH ALL FOR GYM LEADERS
                else return `images/gen2/trainers/${this.batt.trainer.class.value}.webp`
            }
        },
        g2trainerEnemySelector(trainerClass) {
            if (
            trainerClass == "FALKNER" || //JOHTO GYMS
            trainerClass == "BUGSY" ||
            trainerClass == "WHITNEY" ||
            trainerClass == "MORTY" ||
            trainerClass == "CHUCK" ||
            trainerClass == "JASMINE" ||
            trainerClass == "PRYCE" ||
            trainerClass == "CLAIR" ||
            // trainerClass == "BROCK" || //KANTO GYMS
            trainerClass == "MISTY" ||
            // trainerClass == "LT. SURGE" ||
            trainerClass == "ERIKA" ||
            // trainerClass == "JANINE" ||
            trainerClass == "BLAINE" ||
            trainerClass == "SABRINA" ||
            trainerClass == "KIMONO GIRL" ||
            (trainerClass == "FISHER" && this.game.properties.battle.trainer.id == 2) ||
            (trainerClass == "BLACKBELT" && this.game.properties.battle.trainer.id == 2) ||
            (trainerClass == "BLACKBELT" && this.game.properties.battle.trainer.id == 4) ||
            (trainerClass == "HIKER" && this.game.properties.battle.trainer.id == 5) ||
            (trainerClass == "RIVAL1" && this.game.properties.battle.trainer.id == 1) ||
            (trainerClass == "RIVAL1" && this.game.properties.battle.trainer.id == 2) ||
            (trainerClass == "RIVAL1" && this.game.properties.battle.trainer.id == 3) ||
            (trainerClass == "RIVAL1" && this.game.properties.battle.trainer.id == 4) ||
            (trainerClass == "RIVAL1" && this.game.properties.battle.trainer.id == 5) ||
            (trainerClass == "RIVAL1" && this.game.properties.battle.trainer.id == 6) ||
            (trainerClass == "RIVAL1" && this.game.properties.battle.trainer.id == 7) ||
            (trainerClass == "RIVAL1" && this.game.properties.battle.trainer.id == 8) ||
            (trainerClass == "RIVAL1" && this.game.properties.battle.trainer.id == 9) ||
            (trainerClass == "SCHOOLBOY" && this.game.properties.battle.trainer.id == 10) ||
            (trainerClass == "BLACKBELT" && this.game.properties.battle.trainer.id == 5))
            {
                return 1
            }
            else
                return 0
        },

        g2martSelector(mapGroup, mapNumber) { //map value
            // if (this.inventory == false) {
            //     return "Overworld"
            // }
            if (
            mapGroup == "CHERRYGROVE" && mapNumber == 4 ||
            mapGroup == "VIOLET" && mapNumber == 6 ||
            mapGroup == "AZALEA" && mapNumber == 3 ||
            mapGroup == "ECRUTEAK" && mapNumber == 6 ||
            mapGroup == "OLIVINE" && mapNumber == 8 ||
            mapGroup == "BLACKTHORN" && mapNumber == 5 ||
            mapGroup == "VIRIDIAN" && mapNumber == 8 ||
            mapGroup == "PEWTER" && mapNumber == 5 ||
            mapGroup == "VERMILION" && mapNumber == 9 ||
            mapGroup == "CERULEAN" && mapNumber == 7 ||
            mapGroup == "LAVENDER" && mapNumber == 10 ||
            mapGroup == "SAFFRON" && mapNumber == 5 ||
            mapGroup == "FUCHSIA" && mapNumber == 6
            ) {
                return "Mart"
            }
            else if (
            mapGroup == "GOLDENROD" && mapNumber == 11 ||
            mapGroup == "GOLDENROD" && mapNumber == 12 ||
            mapGroup == "GOLDENROD" && mapNumber == 13 ||
            mapGroup == "GOLDENROD" && mapNumber == 14 ||
            mapGroup == "GOLDENROD" && mapNumber == 15 ||
            mapGroup == "GOLDENROD" && mapNumber == 16 ||
            mapGroup == "GOLDENROD" && mapNumber == 17 ||
            mapGroup == "CELADON" && mapNumber == 5 ||
            mapGroup == "CELADON" && mapNumber == 6 ||
            mapGroup == "CELADON" && mapNumber == 7 ||
            mapGroup == "CELADON" && mapNumber == 8 ||
            mapGroup == "CELADON" && mapNumber == 9 ||
            mapGroup == "CELADON" && mapNumber == 10 ||
            mapGroup == "DUNGEONS" && mapNumber == 51 || // Rocket Hideout Vitamins
            mapGroup == "DUNGEONS" && mapNumber == 61 || // Ice Path Vitamins
            // mapGroup == "CHERRYGROVE" && mapNumber == 4 ||
            mapGroup == "CELADON" && mapNumber == 11) {
                return "Department"
            }
            else {
                return "Overworld"
            }
        },
        statLabelMartOpacity() {
            // if (this.g2martSelector(this.game.properties.overworld.mapGroup.value, this.game.properties.overworld.mapNumber) == `Department`) {
            //     return 0
            // }
            // else return this.statLabelOpacityValueDefault
            return this.statLabelOpacityValueDefault
        },
        hpDvCalculation() {
            return (((this.game.properties.player.team[0].dvAttack.value % 2) * 8) + ((this.game.properties.player.team[0].dvDefense.value % 2) * 4) + ((this.game.properties.player.team[0].dvSpeed.value % 2) * 2) + ((this.game.properties.player.team[0].dvSpecial.value % 2) * 1))
        },
        hpDv(atk, def, spd, spc) {
            return (((atk % 2) * 8) + ((def % 2) * 4) + ((spd % 2) * 2) + ((spc % 2) * 1))
        },
        /**
         * Manual mode's party write (2026-09-17): all four DV nibbles -- two setBits calls, one
         * per byte, because the nibbles share bytes -- and the stats they imply at the current
         * level, computed as update_pokemon computes them. The game only recomputes stats on a
         * level-up, so without this the Spe/Spc fields would not show until level 6.
         */
        async write_manual_starter_dvs() {
            if (this.dv_mode != IV_MODE.manual) return
            const mon = this.game.properties.player.team[0]
            // A backported species reads as "Backport"; its data is under the starter's name.
            const pokedex_data = this.dexDataCrystal[mon.species.value] ?? this.dexDataCrystal[this.starter]
            if (!pokedex_data) {
                console.warn(`Manual DVs: no pokedex data for ${mon.species.value} / ${this.starter}; nothing written`)
                return
            }
            const dvs = this.starterDVs
            const level = Number(mon.level.value) || 5
            const statExp = (prop) => Number(prop?.value) || 0
            const hp  = gen12Stat(pokedex_data.base_hp,      dvs.hp,  statExp(mon.statExpHp),      level, true)
            const atk = gen12Stat(pokedex_data.base_atk,     dvs.atk, statExp(mon.statExpAttack),  level, false)
            const def = gen12Stat(pokedex_data.base_def,     dvs.def, statExp(mon.statExpDefense), level, false)
            const spa = gen12Stat(pokedex_data.base_spc_atk, dvs.spc, statExp(mon.statExpSpecial), level, false)
            const spd = gen12Stat(pokedex_data.base_spc_def, dvs.spc, statExp(mon.statExpSpecial), level, false)
            const spe = gen12Stat(pokedex_data.base_spd,     dvs.spe, statExp(mon.statExpSpeed),   level, false)
            await this.game.setBits([
                {path: 'player.team.0.dvAttack',  value: dvs.atk, freeze: false},
                {path: 'player.team.0.dvDefense', value: dvs.def, freeze: false},
            ])
            await this.game.setBits([
                {path: 'player.team.0.dvSpeed',   value: dvs.spe, freeze: false},
                {path: 'player.team.0.dvSpecial', value: dvs.spc, freeze: false},
            ])
            // A fresh starter is at full health; keep it there after the max changes.
            const atFullHealth = mon.hp.value == mon.maxHp.value
            await Promise.all([
                mon.maxHp.set(hp, false),
                atFullHealth ? mon.hp.set(hp, false) : Promise.resolve(),
                mon.attack.set(atk, false),
                mon.defense.set(def, false),
                mon.specialAttack.set(spa, false),
                mon.specialDefense.set(spd, false),
                mon.speed.set(spe, false),
            ])
            console.log(`Manual DVs written: Atk ${dvs.atk} Def ${dvs.def} Spe ${dvs.spe} Spc ${dvs.spc} (HP ${dvs.hp})`)
        },
        /**
         * Update Hidden Power DVs in the game based on current HP type and gender selection.
         * This writes the appropriate byte value to the patch properties.
         */
        updateHiddenPowerDVs() {
            // Ensure mapper is available
            if (!this.game || !this.game.properties || !this.game.properties.patch) {
                return
            }

            // Manual: the fields' Atk/Def go into the byte the patch reads (the female path's
            // route); Spe/Spc cannot ride on it and are written to the party slot when the
            // starter arrives (write_manual_starter_dvs).
            if (this.dv_mode == IV_MODE.manual) {
                const byteValue = this.starterDVByte & 0xFF
                this.game.properties.patch.wStarterHiddenPowerType.setBytes([byteValue], false)
                this.game.properties.patch.wOptionsHiddenPower.setBytes([byteValue], false)
                return
            }

            // Calculate DVs directly to avoid reactivity timing issues
            const starter = this.starter
            const genderRatio = this.dexDataCrystal[starter]?.gender_ratio
            if (!genderRatio) {
                return
            }
            
            const hpDVs = this.getHiddenPowerDVs(this.hpType, this.pokemon_gender, genderRatio)
            if (!hpDVs || hpDVs.byte === undefined) {
                return
            }
            
            // For Male/Unknown, use the type name (which the property expects)
            // For Female, use setBytes to set the byte value directly
            if (this.pokemon_gender === 'Female' && genderRatio !== 'GENDER_UNKNOWN' && genderRatio !== 'GENDER_F0') {
                // Set the byte value directly using setBytes - ensure it's treated as a byte (0-255)
                const byteValue = hpDVs.byte & 0xFF // Ensure it's a valid byte
                this.game.properties.patch.wStarterHiddenPowerType.setBytes([byteValue], false)
                this.game.properties.patch.wOptionsHiddenPower.setBytes([byteValue], false)
            } else {
                // For Male/Unknown, use the type name (standard behavior)
                this.game.properties.patch.wStarterHiddenPowerType.set(this.hpType, false)
                this.game.properties.patch.wOptionsHiddenPower.set(this.hpType, false)
            }
        },
        /**
         * Get optimal Attack and Defense DVs for Hidden Power type based on gender selection.
         * For Male/Unknown: returns max DVs (from hiddenPowerTypeSelector)
         * For Female: calculates highest DVs within female attack threshold that give the target HP type
         * @param {string} hpTypeName - The Hidden Power type name (e.g., "Ice", "Fire")
         * @param {string} gender - "Male", "Female", or "Unknown"
         * @param {string} genderRatio - The Pokemon's gender ratio (e.g., "GENDER_F75")
         * @returns {object} - { atk: number, def: number, byte: number }
         */
        getHiddenPowerDVs(hpTypeName, gender, genderRatio) {
            // For Male or Unknown gender, use the standard max DVs
            if (gender !== 'Female' || genderRatio === 'GENDER_UNKNOWN' || genderRatio === 'GENDER_F0') {
                const byte = this.hiddenPowerTypeSelector[hpTypeName]
                return {
                    atk: (byte & 0xF0) >>> 4,
                    def: byte & 0x0F,
                    byte: byte
                }
            }

            // For Female, calculate optimal DVs within the gender threshold
            const maxAtkForFemale = this.genderThresholds[genderRatio]
            if (maxAtkForFemale === null || maxAtkForFemale === undefined) {
                // Fallback to standard behavior
                const byte = this.hiddenPowerTypeSelector[hpTypeName]
                return {
                    atk: (byte & 0xF0) >>> 4,
                    def: byte & 0x0F,
                    byte: byte
                }
            }

            // Find the HP type index from the type name
            let targetTypeIndex = null
            for (const [index, typeName] of Object.entries(this.hiddenPowerTypes)) {
                if (typeName === hpTypeName) {
                    targetTypeIndex = parseInt(index)
                    break
                }
            }

            if (targetTypeIndex === null) {
                // Type not found, fallback
                const byte = this.hiddenPowerTypeSelector[hpTypeName]
                return {
                    atk: (byte & 0xF0) >>> 4,
                    def: byte & 0x0F,
                    byte: byte
                }
            }

            // HP Type formula: typeIndex = (4 * (atk % 4)) + (def % 4)
            // So: atk % 4 = typeIndex // 4 (integer division)
            //     def % 4 = typeIndex % 4
            const requiredAtkMod = Math.floor(targetTypeIndex / 4)  // 0, 1, 2, or 3
            const requiredDefMod = targetTypeIndex % 4              // 0, 1, 2, or 3

            // HP Power formula (with Speed=15, Special=15):
            // Power = ((5*1 + 3)/2) + (5*1) + (10 * (def >= 8)) + (20 * (atk >= 8)) + 31
            //       = 4 + 5 + 10*(def>=8) + 20*(atk>=8) + 31 = 40 + 10*(def>=8) + 20*(atk>=8)
            // To maximize power: prioritize atk >= 8, then def >= 8

            // Find valid attack DVs (0-15) that are <= maxAtkForFemale AND have the right atk % 4
            const validAtkDVs = []
            for (let atk = 0; atk <= maxAtkForFemale; atk++) {
                if (atk % 4 === requiredAtkMod) {
                    validAtkDVs.push(atk)
                }
            }

            // Find valid defense DVs (0-15) that have the right def % 4 (no restriction)
            const validDefDVs = []
            for (let def = 0; def <= 15; def++) {
                if (def % 4 === requiredDefMod) {
                    validDefDVs.push(def)
                }
            }

            if (validAtkDVs.length === 0 || validDefDVs.length === 0) {
                // No valid combination exists, fallback to standard (shouldn't happen)
                const byte = this.hiddenPowerTypeSelector[hpTypeName]
                return {
                    atk: (byte & 0xF0) >>> 4,
                    def: byte & 0x0F,
                    byte: byte
                }
            }

            // Find the combination that maximizes power
            // Power contribution: 20 if atk >= 8, 10 if def >= 8
            let bestAtk = 0
            let bestDef = 0
            let bestPower = -1

            for (const atk of validAtkDVs) {
                for (const def of validDefDVs) {
                    const power = 40 + (atk >= 8 ? 20 : 0) + (def >= 8 ? 10 : 0)
                    // If power is equal, prefer higher attack, then higher defense
                    if (power > bestPower || (power === bestPower && atk > bestAtk) || 
                        (power === bestPower && atk === bestAtk && def > bestDef)) {
                        bestPower = power
                        bestAtk = atk
                        bestDef = def
                    }
                }
            }

            return {
                atk: bestAtk,
                def: bestDef,
                byte: (bestAtk << 4) | bestDef
            }
        },
        soloPkmn() {
            if (this.game.properties.player.team[0].species.value != null) {
                // string = this.game.properties.player.team[0].species.value
                // return string.toLowerCase()
                return this.game.properties.player.team[0].species.value.toLowerCase()
            }
            else {
                return this.starter.toLowerCase()
            }
        },
        // sanitizeName(target) {
        //     //gamehook sets some bytes in ways that don't match the game, ie 00 for space instead of 7F
        //     //this function makes an array of characters that match a target character
        //     let swapSet = [];
        //     for (let i = 0; i < this.playerName.length; i++) {
        //       if (this.playerName.substring(i, i + 1) === target) {
        //         swapSet.push(i);
        //       }
        //     }
        //     return swapSet;
        // },
          
        // setPlayerName() {
        //     this.game.properties.player.name.change(async (x) => {
        //         if(this.playerName!=null && this.playerName != '' && this.game.properties.player.money.value == 3000) {
        //             swaps = this.sanitizeName(" ");
        //             this.game.properties.player.name.set(this.playerName,false);
        //             // console.log("bytes: "+this.game.properties.player.name.bytes)
        //             bytes = this.game.properties.player.name.bytes;
        //             // console.log(swaps)
        //             newBytes = bytes;
        //             swapBytes = 0x7F; //0x7F for space. //TODO add other punctuation to make sure it works
        //             swaps.forEach(element => {
        //                 newBytes[element] = swapBytes;
        //             })
        //             this.game.properties.player.name.setBytes(newBytes)
        //         }
        //     })
        // },

        /* === Style Mode (dev only) ==========================================
         * See gen5/app/frontend.js for the reference implementation. Gen 2
         * differs in two ways:
         *   - species source: dexDataCrystal (Crystal pokédex).
         *   - dummy slot uses class `ePkmn1` (1-indexed) instead of `ePkmn0`.
         */
        _styleModeBuildList() {
            const all = Object.keys(this.dexDataCrystal || {});
            return all.filter((name) => name && name !== '—' && name !== 'Egg');
        },
    },

//--------- PROGRAM MOUNTED ----------------------------------------------------//
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
            this.$nextTick(() => {
                if (this.$refs.expBar) {
                    var species = this.starter
                    if (this.g2stateVariable != "Overworld" || this.g2stateVariable != "Battle") {
                        species = this.s1dynamicReset.species.value;
                    }
                    var growthRate = this.dexDataCrystal[species].growth_rate
                    var expStats = this.calcExpStats(growthRate, this.game.properties.player.team[0].expPoints.value);
                    this.$refs.expBar.style.width = (expStats.percent * 100) + "%";
                    this.prevSpecies = species
                }
                // Sync guaranteed catches toggle state to the game on load
                this.game.properties.patch.hStpCatchRate.set(this.toggle_wGuaranteedCatches, false)
                // Sync solo pokemon dropdown to the game on load
                this.set_rom_starter()
            })
        }

        this.pokemon_list = this.keys_function(this.dexDataCrystal)

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

        this.updateTime()
        this.load_all_settings()

        //Load data on startup
        if (this.generation == "g1") { this.stats = [ "hp", "atk", "def", "crit", "spc", "spd" ] }
        if (this.generation == "g2" || this.generation == "g3" || this.generation == "g3remakes") { this.stats = [ "hp", "atk", "def", "spc_atk", "spc_def", "spd" ] }

        // GAMESTATE
        // set initial gamestate value when the layout is loaded
        if (this.game.properties.player.team[0].level.value == 0)  this.g2stateVariable = "Base Stats";
        else if (this.game.properties.battle.mode.value == null) this.g2stateVariable = "Overworld";
        else if (this.game.properties.battle.battleStart.value > 0) this.g2stateVariable = "To Battle";
        else if (this.game.properties.battle.info.lowHealthAlarm.value ==  "Disabled") this.g2stateVariable = "From Battle";
        else this.g2stateVariable = "Battle";

        // wait for events to change the state
        this.game.properties.player.playerId.change((prop) => {
            if (prop.value == 0) {
                this.g2stateVariable = "Base Stats";
            }
        });
        this.game.properties.overworld.mapNumber.change((newProp, oldProp) => {
            if (oldProp.value == 5 && newProp.value == 4 && this.game.properties.overworld.mapGroup.value == "NEW BARK" && this.g2stateVariable == "Base Stats") {
                this.g2stateVariable = "Overworld";
            }
            if (this.display_vitamins_automatically == true && (this.stats_setting == "Automatic" || this.stats_setting == "Vitamins")) {
                if (this.game.properties.overworld.mapGroup.value == "GOLDENROD") {
                    let goldenrod_department_4f = 14
                    if (newProp.value == goldenrod_department_4f) {
                        this.stats_setting = "Vitamins";
                    }
                    else if (newProp.value != goldenrod_department_4f) {
                        this.stats_setting = "Automatic";
                    }
                }
                else if (this.game.properties.overworld.mapGroup.value == "CELADON") {
                    let celadon_deparrtment_1f = 5
                    let celadon_deparrtment_2f = 6
                    let celadon_deparrtment_3f = 7
                    let celadon_deparrtment_4f = 8
                    let celadon_deparrtment_5f = 9
                    let celadon_deparrtment_6f = 10
                    if (newProp.value == celadon_deparrtment_1f || newProp.value == celadon_deparrtment_2f || newProp.value == celadon_deparrtment_3f || newProp.value == celadon_deparrtment_4f || newProp.value == celadon_deparrtment_5f || newProp.value == celadon_deparrtment_6f) {
                        this.stats_setting = "Vitamins";
                    }
                    else if (newProp.value != celadon_deparrtment_1f && newProp.value != celadon_deparrtment_2f && newProp.value != celadon_deparrtment_3f && newProp.value != celadon_deparrtment_4f && newProp.value != celadon_deparrtment_5f && newProp.value != celadon_deparrtment_6f) {
                        this.stats_setting = "Automatic";
                    }
                }
                else if (this.game.properties.overworld.mapGroup.value == "DUNGEONS") {
                    let ice_path = 61
                    let dragons_den = 81
                    if (newProp.value == ice_path || newProp.value == dragons_den) {
                        this.stats_setting = "Vitamins";
                    }
                    else if (newProp.value != ice_path && newProp.value != dragons_den) {
                        this.stats_setting = "Automatic";
                    }
                }
                else {
                    this.stats_setting = "Automatic";
                }
            }

        });

        // RARE CANDY USED CHAPTER MARKER
        // Fires "Rare Candy Used" when (in Overworld) a Rare Candy is consumed: the total Rare
        // Candy count decrements and, shortly after, the lead's level increments by 1.
        //
        // The two RAM writes are causally ordered but NOT simultaneous: the item count drops the
        // instant the candy is used, but the level only ticks up after the "grew to level N" /
        // EXP-bar animation finishes (often >1s later). The previous implementation paired them
        // with a single 750ms two-sided window anchored on "now"; the animation lag blew past it,
        // so each level-up ended up pairing with the PREVIOUS candy's decrement -- dropping the
        // very first candy and offsetting every one after it. Instead we queue each decrement and
        // let a later level-up consume the oldest decrement still inside a generous look-back
        // window, which keeps the pairing 1:1 regardless of animation lag.
        const pendingCandyDecrements = []; // timestamps of decrements awaiting their level-up
        let recentLeadLevelUpAt = 0;       // for the rare case the level-up is reported first
        const CANDY_LOOKBACK_MS = 5000;    // a level-up may lag its decrement by the animation
        const CANDY_REVERSE_GRACE_MS = 750; // ...or, rarely, be reported just before it

        const fireCandyUsed = () => {
            console.log("Chapter Detected: Rare Candy Used");
            this.sendObsChapterMarker("Rare Candy Used");
        };

        // The leading edge of a use. If a lead level-up was just reported with nothing to pair
        // (reverse RAM-write order), match it now; otherwise queue this decrement for the level-up
        // that will follow once the animation finishes.
        const onCandyDecrement = (amount) => {
            const now = Date.now();
            if (recentLeadLevelUpAt && now - recentLeadLevelUpAt <= CANDY_REVERSE_GRACE_MS
                && this.game?.properties?.meta?.state?.value === 'Overworld') {
                recentLeadLevelUpAt = 0;
                amount -= 1;
                fireCandyUsed();
            }
            for (let k = 0; k < amount; k++) pendingCandyDecrements.push(now);
        };

        // The trailing edge of a use. Consume the oldest decrement still within the look-back
        // window; if none, remember the level-up briefly in case its decrement is reported a
        // moment later.
        const onLeadLevelUp = () => {
            if (this.game?.properties?.meta?.state?.value !== 'Overworld') return;
            const now = Date.now();
            while (pendingCandyDecrements.length && now - pendingCandyDecrements[0] > CANDY_LOOKBACK_MS) {
                pendingCandyDecrements.shift();
            }
            if (pendingCandyDecrements.length) {
                pendingCandyDecrements.shift();
                fireCandyUsed();
            } else {
                recentLeadLevelUpAt = now;
            }
        };

        // Watch the total Rare Candy count across all bag slots. A decrement is queued via
        // onCandyDecrement so a later lead level-up can pair with it. Summing quantity over every slot
        // whose item is "Rare Candy" is robust to slot reshuffles (using the last candy empties its
        // slot and shifts other items up, but the summed count still goes N -> N-1). Debounced 100 ms
        // for the same cascading-slot-shift reason as the critical-item watcher.
        const readRareCandyCount = () => {
            let total = 0;
            const bag = this.game?.properties?.player?.items;
            if (bag) {
                for (let i = 0; i < 21; i++) {
                    if (bag[i]?.item?.value === 'Rare Candy') {
                        total += (bag[i]?.quantity?.value ?? 0);
                    }
                }
            }
            return total;
        };
        let lastRareCandyCount = readRareCandyCount();
        let candyCheckTimer = null;
        const checkCandyCount = () => {
            const current = readRareCandyCount();
            if (current < lastRareCandyCount) {
                onCandyDecrement(lastRareCandyCount - current);
            }
            lastRareCandyCount = current;
        };
        const scheduleCandyCheck = () => {
            if (candyCheckTimer) clearTimeout(candyCheckTimer);
            candyCheckTimer = setTimeout(() => {
                candyCheckTimer = null;
                checkCandyCount();
            }, 100);
        };
        for (let i = 0; i < 21; i++) {
            this.game.properties.player.items[i]?.item?.change(() => scheduleCandyCheck());
            this.game.properties.player.items[i]?.quantity?.change(() => scheduleCandyCheck());
        }

        this.game.properties.player.team[0].level?.change(async (newProp, oldProp) => {
            if ((newProp?.value ?? 0) === (oldProp?.value ?? 0) + 1) {
                onLeadLevelUp();
            }

            if (newProp.value == 0 || this.game.properties.player.name == 99999999) {
                this.g2stateVariable = "Base Stats";
            }
            else if (this.g2stateVariable == "Base Stats" && this.game.properties.overworld.mapGroup.value == "NEW BARK" && this.game.properties.overworld.mapNumber == 5) {
                this.g2stateVariable = "Base Stats";
            }
            else if (this.g2stateVariable == "Base Stats") {
                this.g2stateVariable = "Overworld";
            }
        });

        this.game.properties.battle.yourPokemon.level?.change(async (newProp, oldProp) => {
            const state = this.game.properties.meta.state.value
            if (newProp?.value != 0 && state == 'Battle') {
                this.sendObsChapterMarker("Battle Level Up");
            }
            if ((newProp?.value ?? 0) === (oldProp?.value ?? 0) + 1 && (state == 'Battle' || state == 'From Battle')) {
                this.sendObsChapterMarker(`Level Up - ${newProp.value}`);
            }
        });

        this.game.properties.battle.battleStart.change((newProp, oldProp) => {
            if (this.g2stateVariable == "Base Stats") return; // ignore everything if we still dont have a pokemon

            if (oldProp.value == 1 && newProp.value == 0 && this.g2stateVariable == `To Battle`) {
                this.g2stateVariable = "Battle";
            }
            if (oldProp.value == 1 && newProp.value == 0) {
                this.g2stateVariable = "Battle";
            }
        });

        this.game.properties.screen.menu.wMenuCursorPosition.change((newProp, oldProp) => {
            if (this.g2stateVariable == `To Battle` && this.game.properties.battle.mode.value == `Trainer` && newProp.value == 0 && oldProp.value == 1) {
                this.g2stateVariable = "Battle";
            }
        });

        this.game.properties.battle.lowHealthAlarm.change((prop) => {
            if (this.g2stateVariable == "Base Stats") return; // ignore everything if we still dont have a pokemon

            if (prop.value == "Disabled" && this.g2stateVariable == `Battle`) {
                this.g2stateVariable = "From Battle";
            }
        });

        this.game.properties.battle.mode.change((prop) => {
            if (this.g2stateVariable == "Base Stats") return; // ignore everything if we still dont have a pokemon

            if (prop.value == "Trainer" && (this.g2stateVariable != `To Battle` || this.g2stateVariable != `Battle` || this.g2stateVariable != `From Battle`)) {
                this.g2stateVariable = "To Battle";
                // const trainer = this.game.properties.battle.trainer.class.value
                // console.log('IN', prop.value)
                // this.sendObsChapterMarker("IN - " + trainer)
            } 
            else if (prop.value == "Wild" && (this.g2stateVariable != `To Battle` || this.g2stateVariable != `Battle` || this.g2stateVariable != `From Battle`)) {
                this.g2stateVariable = "To Battle";
                const trainer = this.game.properties.battle.trainer.class.value
                console.log('IN - WILD', prop.value)
                this.sendObsChapterMarker("IN - Wild")
            } 
            else if (prop.value == null) {
                this.g2stateVariable = "Overworld";
                // const trainer = this.game.properties.battle.trainer.class.value
                // console.log('OUT', prop.value)
                // this.sendObsChapterMarker("OUT - " + trainer)
            }
        });

        // Map Based Markers
        this.game.properties.overworld.mapIndex.change((newProp) => {
            const map = newProp.value
            this.sendObsChapterMarker(`Map Change - ${map}`)
        });
        this.game.properties.overworld.x.change((newProp) => {
            const map = this.game.properties.overworld.mapIndex.value
            const x_coordinate = newProp.value
            const y_coordinate = this.game.properties.overworld.y.value
            if (map == 820) {
                if (x_coordinate == 21 && y_coordinate == 16) {
                    this.sendObsChapterMarker("Special - G2_Headbutt")
                }
            }
            else if (map == 6657) {
                if (x_coordinate == 8 && (y_coordinate >= 28 || y_coordinate <= 33)) {
                    this.sendObsChapterMarker("Special - G2_PreVioletTraining")
                }
            }
        });
        this.game.properties.overworld.y.change((newProp) => {
            const map = this.game.properties.overworld.mapIndex.value
            const x_coordinate = this.game.properties.overworld.x.value
            const y_coordinate = newProp.value
            // if (map == 820) {
            //     if (x_coordinate == 21 && y_coordinate == 16) {
            //         this.sendObsChapterMarker("OUT - " + trainer)
            //     }
            // }
        });

        // Text Box Markers
        this.game.properties.screen.vRamState.text_box.change((newProp) => {
            const text_box_state = newProp.value
            this.sendObsChapterMarker(`Text Box - ${text_box_state}`)
        });

        //ENEMY STATE MANAGER
        // "Pokemon", "Fainted"
        if (this.game.properties.player.team[0].level.value == 0)  this.enemyState = "Not In Battle";
        else if (this.game.properties.battle.mode.value == null) this.enemyState = "Not In Battle";
        else if (this.game.properties.battle.battleStart.value == 0) this.enemyState = "Battle Starting";
        else if (this.game.properties.battle.lowHealthAlarm.value ==  "Disabled") this.enemyState = "Battle Finished";
        else if (this.game.properties.battle.enemyPokemon.hp.value == 0) this.enemyState = "Fainted";
        else if (this.game.properties.battle.enemyPokemon.hp.value > 0 && this.game.properties.screen.menu.wMenuFlags.value == 64) this.enemyState = "Pokemon Sent Out";
        else if (this.game.properties.battle.enemyPokemon.hp.value > 0 && this.game.properties.screen.menu.wMenuFlags.value > 64) this.enemyState = "Pokemon";

        this.game.properties.battle.enemyPokemon.hp.change(async (newProp, oldProp) => {
            if (this.g2stateVariable == "Overworld" || this.g2stateVariable == "Base Stats") { this.enemyState = "Not In Battle"; return }
            if (newProp == 0) {
                this.enemyState = "Fainting"
            }
        });
        this.game.properties.battle.lowHealthAlarm.change((prop) => {
            if (this.g2stateVariable == "Overworld" || this.g2stateVariable == "Base Stats") { this.enemyState = "Not In Battle"; return }
            if (prop.value == "Disabled" && (this.g2stateVariable == `Battle` || this.g2stateVariable == `From Battle`)) {
                this.enemyState = "Battle Finished";
            }
        });
        this.game.properties.battle.mode.change((prop) => {
            if (prop.value == "Wild" || prop.value == "Trainer" && (this.g2stateVariable != `To Battle` || this.g2stateVariable != `Battle` || this.g2stateVariable != `From Battle`)) {
                this.enemyState = "Battle Starting";
            }
        });
        this.game.properties.screen.menu.wMenuFlags.change(async (newProp, oldProp) => {
            if (this.g2stateVariable == "Overworld" || this.g2stateVariable == "Base Stats") { this.enemyState = "Not In Battle"; return }
            if (newProp == 64 && this.enemyState != "Pokemon") {
                this.enemyState = "Pokemon Sent Out"
            }
            if ((this.enemyState == "Pokemon Sent Out") && newProp > 64) {
                this.enemyState = "Pokemon"
            }
        });
        this.game.properties.screen.tiles.column1.tile7.change((prop) => {
            if (prop == 127 && 
                this.game.properties.screen.tiles.column1.tile6 == 127 && 
                this.game.properties.screen.tiles.column1.tile5 == 127 && 
                this.game.properties.screen.tiles.column1.tile4 == 127 && 
                this.game.properties.screen.tiles.column1.tile3 == 127 && 
                this.game.properties.screen.tiles.column1.tile2 == 127 && 
                this.game.properties.screen.tiles.column1.tile1 == 127 &&
                this.enemyState == "Fainting") {
                    this.enemyState = "Fainted"
                }
        });

        this.game.properties.overworld.y.change((prop) => {
            if (prop.value < 18 && this.game.properties.overworld.mapName.value == 'Ilex Forest') {
                this.right_panel = 'Battle Graphic'
            }
        });

        //MOST RECENT FIELD STATUS
        //resets the field status at the start of battle
        // update main array with new status
        this.game.properties.battle.field?.player?.statusReflect.change(async (prop) => { 
            if (prop.value == true) {
                this.last_initiated_field_effect = "Reflect"
            }
        });
        this.game.properties.battle.field?.player?.statusLightScreen.change(async (prop) => { 
            if (prop.value == true) {
                this.last_initiated_field_effect = "Light Screen"
            }
        });
        this.game.properties.battle.field?.player?.statusSafeguard.change(async (prop) => { 9
            if (prop.value == true) {
                this.last_initiated_field_effect = "Safeguard"
            }
        });
        this.game.properties.battle.field?.weather.change(async (prop) => { 
            if (prop.value != null) {
                this.last_initiated_field_effect = prop.value
            }
        });

        // reset tracking
        this.game.properties.player.playerId.change(async (newProp,oldProp) => {
            if (this.lance_defeated == true) {
                this.lance_defeated = false
            }
            else if (newProp.value == 0 && oldProp.value > 0 && this.game_over == false) {
                this.lastBattleResetTime = Date.now(); // reset/load boundary — suppress battle markers during reload
                this.blackout = false;
                if (this.no_increment == false) { this.playerResets++ };
                this.sendObsChapterMarker("RESET")
                if (this.shuckie_counters) { this.incrementEmulatorCounter("playerResets") }
            }
            if (newProp.value > 0 && oldProp.value == 0 && this.game_over == false) {
                this.lastBattleResetTime = Date.now(); // save reloaded — battle struct repopulating, suppress markers
                if (newProp.value != this.playerId) {
                    this.playerResets = 0;

                    this.blackout_counter = 0;
                    this.finished_logs = false;
                    if (this.testRun == false && this.refilming_mode == false) {
                        if (this.no_increment == false) { this.attempt_number++ }
                    };
                    this.most_recent_move = "";
                    MyStorage[`${this.starter}`] = {
                        ...MyStorage[`${this.starter}`],
                        attempt_number: this.attempt_number
                    }
                    // this.newRun(); // enable this to reset the timer once we're confident it's safe
                    if (this.shuckie_timer == true) {
                        if (this.emulatorStats.time_current == null) {
                            console.log("Sending emulator start")
                            this.sendEmulatorStart();
                        }
                    }
                    this.startTime();

                    this.playerId = newProp.value;
                }
            }
            if(newProp.value > 0 && oldProp.value > 0 && (newProp.value - oldProp.value < 256 ) ) {
                //gamehook only read the first byte of the playerId (ie 0x2500 instead of 0x25AE)
                //the second byte will add 1-255 if it changes
                this.playerId = newProp.value;
            }
        })
        this.game.properties.player.name.change((newProp) => {
            if (this.game_over == true && newProp.value == "NINTEN") {
                this.game_over = false;
            }
        })

        //HM Encounters
        this.game.properties.overworld.mapNumber.change((newProp, oldProp) => {
            if (this.game.properties.overworld.mapGroup.value == "NEW BARK" && oldProp.value == 5 && newProp.value == 4 && this.game.properties.player.teamCount.value == 1 && this.game.properties.player.team[0].level.value == 5) {
                console.log("Called set_encounters()")
                this.set_encounters()
            }
        })

        // Manual DVs (2026-09-17): the patch byte carries Atk/Def only, so once the starter is in
        // the party (the slot's level going from empty to 5 in Elm's Lab, NEW BARK map 5) the
        // fields' Spe/Spc are written to the slot with the stats the whole spread implies.
        // Automatic writes nothing here; the patch has already done its part.
        this.game.properties.player.team[0].level?.change(async (newProp, oldProp) => {
            if (newProp.value != 5 || (oldProp?.value ?? 0) != 0) return
            if (this.game.properties.overworld.mapGroup.value != "NEW BARK" || this.game.properties.overworld.mapNumber.value != 5) return
            await this.write_manual_starter_dvs()
        })

        //Hidden Power
        //Sets hidden power to the type indicated by the overlay so that it is set correctly when the player receives their starter
        //Now uses gender-aware byte values for female Pokemon
        this.game.properties.patch.wStarterHiddenPowerType.change((newValue) => {
            if (this.dv_mode == IV_MODE.manual) {
                const expectedByte = this.starterDVByte & 0xFF
                if ((newValue.bytes?.[0] ?? newValue.value) != expectedByte) {
                    this.game.properties.patch.wStarterHiddenPowerType.setBytes([expectedByte], false)
                    this.game.properties.patch.wOptionsHiddenPower.setBytes([expectedByte], false)
                }
                return
            }
            const starter = this.starter
            const genderRatio = this.dexDataCrystal[starter]?.gender_ratio
            const hpDVs = this.getHiddenPowerDVs(this.hpType, this.pokemon_gender, genderRatio)

            if (this.pokemon_gender === 'Female' && genderRatio !== 'GENDER_UNKNOWN' && genderRatio !== 'GENDER_F0') {
                // For female, use setBytes with the byte value
                const expectedByte = hpDVs.byte & 0xFF
                if (newValue.value != expectedByte) {
                    this.game.properties.patch.wStarterHiddenPowerType.setBytes([expectedByte], false)
                    this.game.properties.patch.wOptionsHiddenPower.setBytes([expectedByte], false)
                }
            } else {
                // For male/unknown, use type name
                if (newValue.value != this.hpType) {
                    this.game.properties.patch.wStarterHiddenPowerType.set(this.hpType, false)
                    this.game.properties.patch.wOptionsHiddenPower.set(this.hpType, false)
                }
            }
        })

        //Guaranteed Catches
        //Sets guaranteed catches to the state indicated by the overlay so that it is set correctly on load
        this.game.properties.patch.hStpCatchRate.change((newValue) => {
            if (newValue.value != this.toggle_wGuaranteedCatches) {
                this.game.properties.patch.hStpCatchRate.set(this.toggle_wGuaranteedCatches, false)
            }
        })

        //*Autosplitter
        //log the start of a battle
        this.game.properties.battle.mode.change((newProp) => {
            var logStr = `Autosplitter - Battle Started: ${this.game.properties.battle.trainer.class.value} started at ${this.timer_formatted_time[0]}${this.timer_formatted_time[1]} (Gametime: ${this.gametimeSplit})`
            var log_start = (x) => console.log(logStr)
            if (newProp.value == "Trainer") {
                if (this.collect_split_data == true) {
                    // Define the function outside the loop
                    function findDataByName(data_name, battle_summary) {
                        for (let key in battle_summary) {
                            if (Array.isArray(battle_summary[key])) {
                                for (let obj of battle_summary[key]) {
                                    if (obj.data_name === data_name) {
                                        return obj;
                                    }
                                }
                            }
                        }
                        return null; // return null if no matching data_name is found
                    }
                    // Use for...of loop to iterate over the array
                    for (let property of this.battle_summary["global_stats"]) {
                        // usage
                        if (property !== null) {
                            let data = this.get_nested_property(this.game.properties, property.path)
                            this[`temp_${property.data_name}`] = data
                        } else {
                            console.error(`Property ${property.data_name} not found in battle_summary`);
                            continue
                        }
                    }
                }

                this.split_logStr = logStr
                this.battle_start = Date.now()
                this.time_split_start = this.padTime(this.time_h) + ":" + this.padTime(this.time_m) + ":" + this.padTime(this.time_s) + "." + this.padTime(this.time_ms)
                log_start()
            }
        });

        const log_split = (x) => console.log(`Autosplitter - Battle Ended: Split: ${this.game.properties.battle.trainer.class.value} at ${this.timer_formatted_time[0]}${this.timer_formatted_time[1]} (Gametime: ${this.gametimeSplit})`)
        const autosplitter_process = () => {
            if (this.autosplitter_toggle == true) {
                d = new Date()
                battle_end = Date.now()
                //values
                let gameTimeH = this.game.properties.gameTime?.hours?.value
                let gameTimeM = this.game.properties.gameTime?.minutes?.value
                let gameTimeS = this.game.properties.gameTime?.seconds?.value
                let gameTimeF = this.game.properties.gameTime?.frames?.value
                
                //data to be collected with the autosplitter
                let date_string  = (d.getMonth() + 1) + "-" + d.getDate().toString().padStart(2, "0")
                let time_string  = d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0") + ":" + d.getSeconds().toString().padStart(2, "0")
                let player_name  = this.game.properties.player.name.value
                let pokemon      = this.starter
                let trainer_name = this.game.properties.battle.trainer.class.value
                  // let trainer_name = this.format_trainer_name(this.game.properties.battle.trainer.class.value, this.game.properties.battle.trainer.number.value)
                let trainer_id           = this.game.properties.battle.trainer.id.value
                let location             = `${this.game.properties.overworld.mapGroup.value}_${this.game.properties.overworld.mapNumber.value}`
                let total_pokemon        = this.game.properties.battle.trainer.totalPokemon
                let real_time_total      = this.timer_formatted_time[0] + this.timer_formatted_time[1]
                let real_time_hmmss      = this.timer_formatted_time[0]
                let real_time_file_label = this.timer_formatted_time[2]
                let resets               = this.playerResets.toString()
                let blackouts            = this.blackout_counter.toString()
                let failures             = this.playerResets + this.blackout_counter
                let level                = this.game.properties.player.team[0].level.value.toString()
                let game_time            = this.gametimeSplit.toString()

                let battle_duration = (battle_end - this.battle_start)/1000
                let move1           = this.game.properties.player.team[0].move1.value
                let move2           = this.game.properties.player.team[0].move2.value
                let move3           = this.game.properties.player.team[0].move3.value
                let move4           = this.game.properties.player.team[0].move4.value
                let move1pp         = this.game.properties.player.team[0].move1pp.value
                let move2pp         = this.game.properties.player.team[0].move2pp.value
                let move3pp         = this.game.properties.player.team[0].move3pp.value
                let move4pp         = this.game.properties.player.team[0].move4pp.value
                let move1ppUp       = this.game.properties.player.team[0].move1ppUp.value
                let move2ppUp       = this.game.properties.player.team[0].move2ppUp.value
                let move3ppUp       = this.game.properties.player.team[0].move3ppUp.value
                let move4ppUp       = this.game.properties.player.team[0].move4ppUp.value
                let saves           = this.game.properties.patch.saves.saveCount.value
                let steps           = this.game.properties.patch.steps.stepCount.value
                let bonks           = this.game.properties.patch.steps.bonks.value
                let trainerBattles  = this.game.properties.patch.battles.trainerBattles.value
                let wildBattles     = this.game.properties.patch.battles.wildBattles.value
                let battleTurns     = null
                let playerTurns     = null
                let enemyTurns      = null
                let itemsInBag      = this.game.properties.player.itemCount.value
                let money           = this.game.properties.player.money.value
                let rivalTeam       = null
                let statusCondition = this.game.properties.player.team[0].statusCondition.value
                let type1           = null
                let type2           = null
                let experience      = this.game.properties.player.team[0].expPoints.value
                
                //deprecated properties
                let incremented_finished_run_count = this.finished_run_count + 1
                let runIdentifier = this.starter.toString() + " " + incremented_finished_run_count.toString()
                const trainerNameFormat = () => {
                    const trainer = this.game.properties.battle.trainer.class.value
                    const number = this.game.properties.battle.trainer.id.value
                    const unique_id = trainer + "_" + number
                    const majorBattles = this.autosplitter["Crystal"][unique_id] ?? this.capitalization_format(unique_id)
                    return majorBattles
                }
                let trainerName = trainerNameFormat()
                let RTHours        = this.time_h
                let RTMinutes      = this.time_m
                let RTSeconds      = this.time_s
                let RTMilliseconds = this.time_ms

                let startTime      = this.time_split_start
                let realTime       = this.padTime(this.time_h) + ":" + this.padTime(this.time_m) + ":" + this.padTime(this.time_s) + "." + this.padTime(this.time_ms)
                let gameTime       = this.padTime(gameTimeH) + ":" + this.padTime(gameTimeM) + ":" + this.padTime(gameTimeS) + "." + this.padTime(gameTimeF)
                
                let shuckie_time_hhmmss = this.formatMilliseconds(this.emulatorStats?.time_current)
                let shuckie_time_cs = this.getCentiseconds(this.emulatorStats?.time_current)
                let shuckie_rt = this.shuckie_timer ? shuckie_time_hhmmss + "." + shuckie_time_cs : realTime

                let hp             = this.game.properties.player.team[0].hp.value
                let maxHp          = this.game.properties.player.team[0].maxHp.value
                let atk            = this.game.properties.player.team[0].attack.value
                let def            = this.game.properties.player.team[0].defense.value
                let spA            = this.game.properties.player.team[0].specialAttack.value
                let spD            = this.game.properties.player.team[0].specialDefense.value
                let spe            = this.game.properties.player.team[0].speed.value
                let statExp_hp     = this.game.properties.player.team[0].statExpHp.value
                let statExp_atk    = this.game.properties.player.team[0].statExpAttack.value
                let statExp_def    = this.game.properties.player.team[0].statExpDefense.value
                let statExp_spA    = this.game.properties.player.team[0].statExpSpecial.value
                let statExp_spD    = this.game.properties.player.team[0].statExpSpecial.value
                let statExp_spe    = this.game.properties.player.team[0].statExpSpeed.value
                let dvAttack       = this.game.properties.player.team[0].dvAttack.value
                let dvDefense      = this.game.properties.player.team[0].dvDefense.value
                let dvSpeed        = this.game.properties.player.team[0].dvSpeed.value
                let dvSpecial      = this.game.properties.player.team[0].dvSpecial.value
                let mod_atk        = this.game.properties.battle.yourPokemon.modStageAttack.value
                let mod_def        = this.game.properties.battle.yourPokemon.modStageDefense.value
                let mod_spA        = this.game.properties.battle.yourPokemon.modStageSpecialAttack.value
                let mod_spD        = this.game.properties.battle.yourPokemon.modStageSpecialDefense.value
                let mod_spe        = this.game.properties.battle.yourPokemon.modStageSpeed.value
                let mod_acc        = this.game.properties.battle.yourPokemon.modStageAccuracy.value
                let mod_eva        = this.game.properties.battle.yourPokemon.modStageEvasion.value
                let battle_atk     = this.game.properties.battle.yourPokemon.attack.value
                let battle_def     = this.game.properties.battle.yourPokemon.defense.value
                let battle_spA     = this.game.properties.battle.yourPokemon.specialAttack.value
                let battle_spD     = this.game.properties.battle.yourPokemon.specialDefense.value
                let battle_spe     = this.game.properties.battle.yourPokemon.speed.value
                
                //patch properties
                let patch_frameCount                 = this.game.properties.patch.time?.frameCount?.value ?? 0
                let patch_oWFrameCount               = this.game.properties.patch.time?.oWFrameCount?.value ?? 0
                let patch_battleFrameCount           = this.game.properties.patch.time?.battleFrameCount?.value ?? 0
                let patch_menuFrameCount             = this.game.properties.patch.time?.menuFrameCount?.value ?? 0
                let patch_introsFrameCount           = this.game.properties.patch.time?.introsFrameCount?.value ?? 0
                let patch_saveCount                  = this.game.properties.patch.saves?.saveCount?.value ?? 0
                let patch_reloadCount                = this.game.properties.patch.saves?.reloadCount?.value ?? 0
                let patch_clockResetCount            = this.game.properties.patch.saves?.clockResetCount?.value ?? 0
                let patch_stepsCount                 = this.game.properties.patch.steps?.stepCount.value ?? 0
                let patch_stepsCountWalk             = this.game.properties.patch.steps?.stepCountWalk.value ?? 0
                let patch_stepsCountBike             = this.game.properties.patch.steps?.stepCountBike.value ?? 0
                let patch_stepsCountSurf             = this.game.properties.patch.steps?.stepCountSurf.value ?? 0
                let patch_bonks                      = this.game.properties.patch.steps?.bonks.value ?? 0
                let patch_battles                    = this.game.properties.patch.battles?.trainerBattles.value + this.game.properties.patch.battles?.wildBattles.value ?? 0
                let patch_trainerBattles             = this.game.properties.patch.battles?.trainerBattles.value ?? 0
                let patch_wildBattles                = this.game.properties.patch.battles?.wildBattles.value ?? 0
                let patch_battlesFled                = this.game.properties.patch.battles?.battlesFled.value ?? 0
                let patch_failedRuns                 = this.game.properties.patch.battles?.failedRuns.value ?? 0
                let patch_totalDamageDealt           = this.game.properties.patch.battle_info.damage?.totalDamageDealt?.value ?? 0
                let patch_actualDamageDealt          = this.game.properties.patch.battle_info.damage?.actualDamageDealt?.value ?? 0
                let patch_totalDamageTaken           = this.game.properties.patch.battle_info.damage?.totalDamageTaken?.value ?? 0
                let patch_actualDamageTaken          = this.game.properties.patch.battle_info.damage?.actualDamageTaken?.value ?? 0
                let patch_ownMovesHit                = this.game.properties.patch.battle_info.hits?.ownMovesHit?.value ?? 0
                let patch_ownMovesMissed             = this.game.properties.patch.battle_info.hits?.ownMovesMissed?.value ?? 0
                let patch_enemyMovesHit              = this.game.properties.patch.battle_info.hits?.enemyMovesHit?.value ?? 0
                let patch_enemyMovesMissed           = this.game.properties.patch.battle_info.hits?.enemyMovesMissed?.value ?? 0
                let patch_ownMovesSE                 = this.game.properties.patch.battle_info.hits?.ownMovesSE?.value ?? 0
                let patch_ownMovesNVE                = this.game.properties.patch.battle_info.hits?.ownMovesNVE?.value ?? 0
                let patch_enemyMovesSE               = this.game.properties.patch.battle_info.hits?.enemyMovesSE?.value ?? 0
                let patch_enemyMovesNVE              = this.game.properties.patch.battle_info.hits?.enemyMovesNVE?.value ?? 0
                let patch_criticalsDealt             = this.game.properties.patch.battle_info.hits?.criticalsDealt?.value ?? 0
                let patch_oHKOsDealt                 = this.game.properties.patch.battle_info.hits?.oHKOsDealt?.value ?? 0
                let patch_criticalsTaken             = this.game.properties.patch.battle_info.hits?.criticalsTaken?.value ?? 0
                let patch_oHKOsTaken                 = this.game.properties.patch.battle_info.hits?.oHKOsTaken?.value ?? 0
                let patch_wasConfused                = this.game.properties.patch.battle_info.status?.wasConfused?.value ?? 0
                let patch_enemyBecameConfused        = this.game.properties.patch.battle_info.status?.enemyBecameConfused?.value ?? 0
                let patch_wasParalyzed               = this.game.properties.patch.battle_info.status?.wasParalyzed?.value ?? 0
                let patch_enemyWasParalyzed          = this.game.properties.patch.battle_info.status?.enemyWasParalyzed?.value ?? 0
                let patch_wasBurned                  = this.game.properties.patch.battle_info.status?.wasBurned?.value ?? 0
                let patch_enemyWasBurned             = this.game.properties.patch.battle_info.status?.enemyWasBurned?.value ?? 0
                let patch_wasFrozen                  = this.game.properties.patch.battle_info.status?.wasFrozen?.value ?? 0
                let patch_enemyWasFrozen             = this.game.properties.patch.battle_info.status?.enemyWasFrozen?.value ?? 0
                let patch_wasPoisoned                = this.game.properties.patch.battle_info.status?.wasPoisoned?.value ?? 0
                let patch_enemyWasPoisoned           = this.game.properties.patch.battle_info.status?.enemyWasPoisoned?.value ?? 0
                let patch_wasPoisonedBadly           = this.game.properties.patch.battle_info.status?.wasPoisonedBadly?.value ?? 0
                let patch_enemyWasPoisonedBadly      = this.game.properties.patch.battle_info.status?.enemyWasPoisonedBadly?.value ?? 0
                let patch_fellAsleep                 = this.game.properties.patch.battle_info.status?.fellAsleep?.value ?? 0
                let patch_enemyFellAsleep            = this.game.properties.patch.battle_info.status?.enemyFellAsleep?.value ?? 0
                let patch_playerTurnsConfused        = this.game.properties.patch.battle_info.status?.playerTurnsConfused?.value ?? 0
                let patch_enemyTurnsConfused         = this.game.properties.patch.battle_info.status?.enemyTurnsConfused?.value ?? 0
                let patch_playerTurnsConfusedHitSelf = this.game.properties.patch.battle_info.status?.playerTurnsConfusedHitSelf?.value ?? 0
                let patch_enemyTurnsConfusedHitSelf  = this.game.properties.patch.battle_info.status?.enemyTurnsConfusedHitSelf?.value ?? 0
                let patch_playerTurnsParalyzed       = this.game.properties.patch.battle_info.status?.playerTurnsParalyzed?.value ?? 0
                let patch_enemyTurnsParalyzed        = this.game.properties.patch.battle_info.status?.enemyTurnsParalyzed?.value ?? 0
                let patch_playerTurnsParalyzedFully  = this.game.properties.patch.battle_info.status?.playerTurnsParalyzedFully?.value ?? 0
                let patch_enemyTurnsParalyzedFully   = this.game.properties.patch.battle_info.status?.enemyTurnsParalyzedFully?.value ?? 0
                let patch_PlayerTurnsAsleep          = 0
                let patch_EnemyTurnsAsleep           = 0
                let patch_playerHpHealed             = 0                                                                                                                          //not working in yellow
                let patch_enemyHpHealed              = 0                                                                                                                          //not working in yellow
                let patch_playerPokemonFainted       = this.game.properties.patch.battle_info?.playerPokemonFainted?.value ?? 0
                let patch_enemyPokemonFainted        = this.game.properties.patch.battle_info?.enemyPokemonFainted?.value ?? 0
                let patch_experienceGained           = this.game.properties.patch.battle_info?.experienceGained?.value ?? 0
                let patch_switchout                  = this.game.properties.patch.battle_info?.switchout?.value ?? 0
                let patch_moneyMade                  = this.game.properties.patch.money?.moneyMade?.value ?? 0
                let patch_moneySpent                 = this.game.properties.patch.money?.moneySpent?.value ?? 0
                let patch_moneyLost                  = this.game.properties.patch.money?.moneyLost?.value ?? 0
                let patch_itemsPickedUp              = this.game.properties.patch.items?.itemsPickedUp?.value ?? 0
                let patch_itemsBought                = this.game.properties.patch.items?.itemsBought?.value ?? 0
                let patch_itemsSold                  = this.game.properties.patch.items?.itemsSold?.value ?? 0
                let patch_ballsThrown                = this.game.properties.patch.catching?.ballsThrown?.value ?? 0
                let patch_pokemonCaughtInBalls       = this.game.properties.patch.catching?.pokemonCaughtInBalls ?? 0
                let patch_movesLearnt                = this.game.properties.patch.movesLearnt ?? 0

                //definitions for what split data is logged to file
                let simple_data = [
                    player_name, pokemon, trainer_name, shuckie_rt, 
                    resets, blackouts, level, game_time, battle_duration, 
                    move1, move2, move3, move4
                ]
                let full_data = simple_data
                if (this.scott_mode == true) {
                    full_data = [
                        date_string, time_string, player_name, pokemon, trainer_name, 
                        trainer_id, location, total_pokemon, shuckie_rt, 
                        real_time_hmmss, real_time_file_label, resets, blackouts, failures, 
                        level, game_time, battle_duration, move1, move2, move3, move4, 
                        saves, steps, bonks, trainerBattles, wildBattles, battleTurns, 
                        playerTurns, enemyTurns, itemsInBag, money, rivalTeam,
                        statusCondition, type1, type2, experience,
                        runIdentifier, this.starter, trainerName,
                        startTime, realTime, gameTime, level, this.playerResets,
                        RTHours, RTMinutes, RTSeconds, RTMilliseconds,
                        move1, move2, move3, move4, move1pp, move2pp, move3pp, move4pp, move1ppUp, move2ppUp, move3ppUp, move4ppUp,
                        hp, maxHp, atk, def, spA, spD, spe,
                        statExp_hp, statExp_atk, statExp_def, statExp_spA, statExp_spD, statExp_spe,
                        dvAttack, dvDefense, dvSpeed, dvSpecial,
                        mod_atk, mod_def, mod_spA, mod_spD, mod_spe, mod_acc, mod_eva,
                        battle_atk, battle_def, battle_spA, battle_spD, battle_spe,
                        patch_frameCount, patch_oWFrameCount, patch_battleFrameCount, patch_menuFrameCount, patch_introsFrameCount,
                        patch_saveCount, patch_reloadCount, patch_clockResetCount,
                        patch_stepsCount, patch_stepsCountWalk, patch_stepsCountBike, patch_stepsCountSurf, patch_bonks,
                        patch_battles, patch_trainerBattles, patch_wildBattles, patch_battlesFled, patch_failedRuns,
                        patch_totalDamageDealt, patch_actualDamageDealt, patch_totalDamageTaken, patch_actualDamageTaken,
                        patch_ownMovesHit, patch_ownMovesMissed, patch_enemyMovesHit, patch_enemyMovesMissed, 
                        patch_ownMovesSE, patch_ownMovesNVE, patch_enemyMovesSE, patch_enemyMovesNVE, 
                        patch_criticalsDealt, patch_oHKOsDealt, patch_criticalsTaken, patch_oHKOsTaken,
                        patch_wasConfused, patch_enemyBecameConfused, patch_wasParalyzed, patch_enemyWasParalyzed, 
                        patch_wasBurned, patch_enemyWasBurned, patch_wasFrozen, patch_enemyWasFrozen,
                        patch_wasPoisoned, patch_enemyWasPoisoned, patch_wasPoisonedBadly, patch_enemyWasPoisonedBadly,
                        patch_fellAsleep, patch_enemyFellAsleep, patch_playerTurnsConfused, patch_playerTurnsConfusedHitSelf, 
                        patch_playerTurnsParalyzed, patch_playerTurnsParalyzedFully, patch_enemyTurnsConfused, patch_enemyTurnsConfusedHitSelf, 
                        patch_enemyTurnsParalyzed, patch_enemyTurnsParalyzedFully, patch_PlayerTurnsAsleep, patch_EnemyTurnsAsleep,
                        patch_playerHpHealed, patch_enemyHpHealed, 
                        patch_playerPokemonFainted, patch_enemyPokemonFainted, patch_experienceGained, patch_switchout,
                        patch_moneyMade, patch_moneySpent, patch_moneyLost,
                        patch_itemsPickedUp, patch_itemsBought, patch_itemsSold,
                        patch_ballsThrown, patch_pokemonCaughtInBalls,
                        patch_movesLearnt,
                        //new properties
                        blackouts, this.attempt_number, failures, rivalTeam
                    ]
                }

                let deprecated_data = []
                if (this.scott_mode == true) {
                    deprecated_data = [
                        runIdentifier, this.starter, trainerName,
                        startTime, shuckie_rt, gameTime, level, this.playerResets,
                        RTHours, RTMinutes, RTSeconds, RTMilliseconds,
                        move1, move2, move3, move4,
                        atk, def, spA, spD, spe,
                        mod_atk, mod_def, mod_spA, mod_spD, mod_spe, mod_acc, mod_eva,
                        battle_atk, battle_def, battle_spA, battle_spD, battle_spe,
                        patch_frameCount, patch_oWFrameCount, patch_battleFrameCount, patch_menuFrameCount, patch_introsFrameCount,
                        patch_saveCount, patch_reloadCount, patch_clockResetCount,
                        patch_stepsCount, patch_stepsCountWalk, patch_stepsCountBike, patch_stepsCountSurf, patch_bonks,
                        patch_battles, patch_trainerBattles, patch_wildBattles, patch_battlesFled, patch_failedRuns,
                        patch_totalDamageDealt, patch_actualDamageDealt, patch_totalDamageTaken, patch_actualDamageTaken,
                        patch_ownMovesHit, patch_ownMovesMissed, patch_enemyMovesHit, patch_enemyMovesMissed, 
                        patch_ownMovesSE, patch_ownMovesNVE, patch_enemyMovesSE, patch_enemyMovesNVE, 
                        patch_criticalsDealt, patch_oHKOsDealt, patch_criticalsTaken, patch_oHKOsTaken,
                        patch_wasConfused, patch_enemyBecameConfused, patch_wasParalyzed, patch_enemyWasParalyzed, 
                        patch_wasBurned, patch_enemyWasBurned, patch_wasFrozen, patch_enemyWasFrozen,
                        patch_wasPoisoned, patch_enemyWasPoisoned, patch_wasPoisonedBadly, patch_enemyWasPoisonedBadly,
                        patch_fellAsleep, patch_enemyFellAsleep, patch_playerTurnsConfused, patch_playerTurnsConfusedHitSelf, 
                        patch_playerTurnsParalyzed, patch_playerTurnsParalyzedFully, patch_enemyTurnsConfused, patch_enemyTurnsConfusedHitSelf, 
                        patch_enemyTurnsParalyzed, patch_enemyTurnsParalyzedFully,
                        patch_playerHpHealed, patch_enemyHpHealed, 
                        patch_playerPokemonFainted, patch_enemyPokemonFainted, patch_experienceGained, patch_switchout,
                        patch_moneyMade, patch_moneySpent, patch_moneyLost,
                        patch_itemsPickedUp, patch_itemsBought, patch_itemsSold,
                        patch_ballsThrown, patch_pokemonCaughtInBalls,
                        patch_movesLearnt,
                        //new properties
                        blackouts, this.attempt_number, failures, rivalTeam
                    ]
                }
                
                let simple_data_str = simple_data.join(",") + "\n";
                let full_data_str = full_data.join(",") + "\n";
                MyStorage["simple_data_str"] = simple_data_str
                MyStorage["full_data_str"] = full_data_str
                MyStorage["simple_data"] = simple_data
                this.simple_data_str = simple_data_str
                this.full_data_str = full_data_str
                this.simple_data = simple_data
                if (this.scott_mode == true) {
                    let deprecated_data_str = deprecated_data.join(",") + "\n";
                    MyStorage["deprecated_data_str"] = deprecated_data_str
                    this.deprecated_data_str = deprecated_data_str
                }
                if (this.collect_split_data == true && this.game.properties.battle.lowHealthAlarm.value == "Disabled" && this.game.properties.battle.mode.value == "Trainer") {
                    // When shuckie_timer is enabled, use emulator time so splits panel matches the displayed timer
                    const hasEmulatorTime = this.shuckie_timer && this.emulatorStats?.time_current != null;
                    const splitTime = hasEmulatorTime ? shuckie_time_hhmmss : real_time_hmmss;
                    this.current_splits.push({
                        trainer: trainer_name, 
                        time:    splitTime,
                    })
                }
            }
        }

        //write to file at the end of a key battle
        this.game.properties.battle.lowHealthAlarm.change(async (prop) => {
            autosplitter_process()
            if (prop.value == "Disabled" && this.game.properties.battle.mode.value == "Trainer") {
                let trainer = this.game.properties.battle.trainer.class.value
                let id = this.game.properties.battle.trainer.id.value
                let unique = `${trainer}_${id}`
                let gameName = this.game_selection == 'Crystal' ? 'C' : 'GS' // Used for split data
                let gameName_Path = this.game_selection == 'Crystal' ? 'Crystal' : 'Gold & Silver' // Used for split data
                
                if (this.collect_split_data == true) {
                    // Use for...of loop to iterate over the array
                    for (let property of this.battle_summary["global_stats"]) {
                        // usage
                        if (property !== null) {
                            let data = this.get_nested_property(this.game.properties, property.path)
                            this[property.data_name] = data - this[`temp_${property.data_name}`]
                            // if (trainer == "RED") {
                            //     this[property.data_name] = data
                            // }
                            // else {
                            //     this[property.data_name] = data - this[`temp_${property.data_name}`]
                            // }
                        } else {
                            console.error(`Property ${property.data_name} not found in battle_summary`);
                            continue
                        }
                    }
                    this.battle_duration = this.convertMSToDuration(Date.now() - this.battle_start)
                    this.exp_per_second = Math.round(this.battle_summary_exp_gained / this.battle_duration)
                    this.battle_summary_battle_number = this.game.properties.patch?.battles?.trainerBattles?.value
                }

                //write full split data
                logData(gameName, this.full_data_str, this.attempt_number, this.starter, "Full", this.testRun, this.scott_mode, this.refilming_mode)
                
                //write deprecated split data
                if (this.autosplitter["Crystal"][unique]) {
                    logData(gameName, this.deprecated_data_str, this.attempt_number, this.starter, "Deprecated", this.testRun, this.scott_mode, this.refilming_mode)
                }
                
                //write simple split data
                const simpleSplit = () => {
                    log_split()
                    // The same split into the replay (2026-09-23): simple_data[2] is the trainer key, [3] real_time_hmmss.
                    addSplitBookmark(this.simple_data[2], this.simple_data[3])
                    logData(gameName, this.simple_data_str, this.attempt_number, this.starter, "Simple", this.testRun, this.scott_mode, this.refilming_mode)
                    this.split_data.push(this.simple_data)
                    // split_data is no longer persisted (2026-09-17): it is only ever pushed to, the
                    // CSV split files are the record, and storing the whole history under the bare key
                    // and again inside every species' entry grew user_state.json to 324 MB, which every
                    // settings write re-serialised (docs/performance-followups.md, known-legacy-bugs.md #43).
                }
                switch (trainer) {
                    case "RIVAL1":  
                    case "RIVAL2":  
                    case "FALKNER":  
                    case "BUGSY":  
                    case "WHITNEY":   
                    case "MORTY":   
                    case "CHUCK":
                    case "PRYCE":   
                    case "JASMINE":    
                    case "CLAIR": 
                    case "WILL":  
                    case "KOGA": 
                    case "BRUNO":   
                    case "KAREN":  
                    case "CHAMPION":
                    case "BROCK":
                    case "MISTY":
                    case "ERIKA":
                    case "LT. SURGE":
                    case "JANINE":
                    case "BLAINE":
                    case "SABRINA":
                    case "BLUE": { 
                        simpleSplit() 
                        if (this.automatic_post_battle_splits == true) {
                            this.battle_summary_header = `${this.capitalization_format(trainer)} Summary`
                            this.right_panel = "Splits" 
                            this.automatic_splits = true
                        }
                    }
                }
                
                if (trainer == "CHAMPION") {
                    this.lance_defeated = true
                }

                //stop timer
                if (trainer == "RED") {
                    log_split()
                    addSplitBookmark(this.simple_data[2], this.simple_data[3])
                    if (this.testRun == false && this.refilming_mode == false) {
                        if (this.no_increment == false) { this.finished_run_count++ }
                    };
                    if (this.automatic_post_battle_splits == true) {
                        this.battle_summary_header = `${this.capitalization_format(trainer)} Summary`
                        this.right_panel = "Splits"
                        this.automatic_splits = true
                    }
                    this.stopTime()
                    if (this.shuckie_timer == true) { this.sendEmulatorEnd(); }
                    this.run_complete = true
                    //use then so that logCopy doesn't touch any files until logData finishes
                    logData(gameName, this.simple_data_str, this.attempt_number, this.starter, "Simple", this.testRun, this.scott_mode, this.refilming_mode)
                    .then(() => {
                            console.log("Run complete - moving attempt files to finished folder.")
                            logCopy(gameName, gameName_Path, this.attempt_number, this.starter, this.finished_run_count, this.refilming_mode);
                        })
                        .catch(error => {
                            console.error("Error:", error);
                        });
                    this.split_data.push(this.simple_data)
                    // split_data is no longer persisted (2026-09-17): it is only ever pushed to, the
                    // CSV split files are the record, and storing the whole history under the bare key
                    // and again inside every species' entry grew user_state.json to 324 MB, which every
                    // settings write re-serialised (docs/performance-followups.md, known-legacy-bugs.md #43).
                    console.log("Data transfer finished.")
                }
            }   
        });

        //ROLLOUT
        this.game.properties.patch.turnCounter.change(() => {
            this.rolloutCounterCopy = this.game.properties.battle.yourPokemon.counters.rollout.value;
            if (this.rolloutCounterCopy == 5) {
                this.rolloutCounterCopy = 0
            }
            else if (this.game.properties.battle.yourPokemon.status.rollout.value == false) {
                this.rolloutCounterCopy = 0
            }
        })
        this.game.properties.battle.yourPokemon.counters.rollout.change(() => {
            if (this.g2stateVariable == `Overworld`) {
                this.rolloutCounterCopy = 0
            }
        })

        this.game.properties.events.beat_elite_four.change((prop) => {
            if (prop.value == true && this.lance_defeated == true) {
                this.kanto_badges = true
            }
        })

        //*blackout tracking
        //track when the player has a blackout
        this.game.properties.player.team[0].hp.change((newProp, oldProp) => {
            if (newProp.value == 0 && this.g2stateVariable == `Battle`) {
                console.log("HP fell to 0 - possible blackout detected...")
                this.blackout = true;
            }
            if (newProp.value > 0) {
                if (this.blackout) {
                    console.log("HP recovered from 0 - blackout confirmed.")
                    if (this.no_increment == false) { this.blackout_counter++; }
                    this.sendObsChapterMarker("BLACKOUT")
                    if (this.shuckie_counters) { this.incrementEmulatorCounter("blackout_counter") }
                    this.blackout = false;
                }
            }
        })

        //FIX OF ENEMY BATTLE STATS
        this.game.properties.battle.enemyPokemon.hp.change(async (newProp, oldProp) => {
            if ((newProp == 0 || newProp == 255) && this.g2stateVariable == "Battle") { 
                this.slotTimingFix = true 
                this.game.properties.battle.enemyPokemon.hp.change(async (newProp, oldProp) => {
                    this.slotTimingFix = false
                })
            }
        })

        // A hard reset / save-state load mid-battle tears down and repopulates the battle RAM,
        // which looks identical to leaving and re-entering a battle: trainer.class flips
        // RED→NOBODY→RED and meta.state churns through No Pokemon / To Battle, firing spurious
        // IN/OUT (and the item watchers re-fire as the bag reloads from 0). Suppress all
        // battle/item markers for a grace window after the last playerId reset or reload. No
        // genuine battle boundary can occur this soon after a reset, so nothing real is lost.
        // Observed reload flicker lands ~1.6–4.8 s after the reset, so the window must clear it.
        const RESET_MARKER_GRACE_MS = 6000;
        const withinResetGrace = () => (Date.now() - (this.lastBattleResetTime ?? 0)) < RESET_MARKER_GRACE_MS;

        var waiting_for_state = false;
        var stateName = 'OUT';
        var trainerName = this.game.properties.battle.trainer.class.value;

        this.game.properties.battle.trainer.class.change((newProp, oldProp) => {
            if (newProp.value == 'NOBODY' && oldProp.value != 'NOBODY') {
                stateName = 'OUT';
                trainerName = oldProp.value
                waiting_for_state = true;
            }
            else if (newProp.value != 'NOBODY' && oldProp.value == 'NOBODY') {
                stateName = 'IN';
                trainerName = newProp.value
                waiting_for_state = true;
            }
        })
        this.game.properties.meta.state.change((newProp, oldProp) => {
            if (waiting_for_state == true && ((stateName == 'IN' && newProp.value == 'To Battle') || (stateName == 'OUT' && (newProp.value == 'Overworld' || newProp.value == 'No Pokemon')))) {
                // Suppress only the teardown OUT a reset/load produces: the RESET marker already
                // delimits that boundary, and the reload's re-entry IN is the real attempt start.
                // A genuine battle-end OUT can't happen within the grace window (you just reloaded),
                // so a real OUT is never lost. The re-entry IN is always kept so each reloaded
                // attempt is marked.
                if (stateName == 'OUT' && withinResetGrace()) { waiting_for_state = false; return; }
                const chapterName = stateName + " - " + trainerName;
                console.log("Chapter Detected: " + chapterName)
                waiting_for_state = false;
                this.sendObsChapterMarker(chapterName);
            }
        })

        // NEW MOVE LEARNED CHAPTER MARKER
        // In Battle state we read from battle.yourPokemon; otherwise from player.team[0].
        // A new move is detected when the multiset diff has exactly one move added AND the previous
        // set had at least one move — this filters out game resets, lead swaps, and the first starter.
        const readMoveContext = () => {
            const state = this.game?.properties?.meta?.state?.value;
            const source = (state == 'Battle')
                ? this.game?.properties?.battle?.yourPokemon
                : this.game?.properties?.player?.team?.[0];
            if (!source) return { species: null, moves: [null, null, null, null] };
            return {
                species: source.species?.value ?? null,
                moves: [
                    source.move1?.value ?? null,
                    source.move2?.value ?? null,
                    source.move3?.value ?? null,
                    source.move4?.value ?? null
                ]
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

        // Debounce so 4 simultaneous slot changes (e.g. battle struct populating, lead swap)
        // collapse into a single diff against the pre-burst snapshot.
        const scheduleMoveCheck = () => {
            if (moveCheckTimer) clearTimeout(moveCheckTimer);
            moveCheckTimer = setTimeout(() => {
                moveCheckTimer = null;
                checkForNewMove();
            }, 100);
        };

        this.game.properties.player.team[0].move1.change(() => scheduleMoveCheck());
        this.game.properties.player.team[0].move2.change(() => scheduleMoveCheck());
        this.game.properties.player.team[0].move3.change(() => scheduleMoveCheck());
        this.game.properties.player.team[0].move4.change(() => scheduleMoveCheck());
        this.game.properties.battle.yourPokemon.move1.change(() => scheduleMoveCheck());
        this.game.properties.battle.yourPokemon.move2.change(() => scheduleMoveCheck());
        this.game.properties.battle.yourPokemon.move3.change(() => scheduleMoveCheck());
        this.game.properties.battle.yourPokemon.move4.change(() => scheduleMoveCheck());

        // CRITICAL ITEM CHAPTER MARKERS
        // Fires "Item - <name>" when the player obtains: vitamins, type-boosting damage held items,
        // berries (all watched via player.items bag), TMs (player.tms.*), or HM03-Surf.
        // Item names use the mapper's exact casing (see localhost:8085/mapper glossary).
        const vitaminItems = new Set([
            'Hp Up', 'Protein', 'Iron', 'Carbos', 'Calcium', 'Pp Up', 'Rare Candy'
        ]);
        const damageHeldItems = new Set([
            'BlackBelt', 'BlackGlasses', 'Charcoal', 'Dragon Fang', 'Hard Stone',
            'Magnet', 'Metal Coat', 'Miracle Seed', 'Mystic Water', 'NeverMeltIce',
            'Pink Bow', 'Poison Barb', 'Polkadot Bow', 'Sharp Beak', 'SilverPowder',
            'Soft Sand', 'Spell Tag', 'TwistedSpoon'
        ]);
        const berryItems = new Set([
            'Berry', 'Berry Juice', 'Bitter Berry', 'BurntBerry', 'Gold Berry',
            'Ice Berry', 'Mint Berry', 'MiracleBerry', 'MysteryBerry',
            'Przcureberry', 'Psncureberry'
        ]);
        const isCriticalBagItem = (name) =>
            vitaminItems.has(name) || damageHeldItems.has(name) || berryItems.has(name);

        // Total owned count of each item = summed bag quantities + team-held copies. Counting by
        // quantity (not just name presence) means a restock fires too: Rare Candy ×3 → ×4 is a
        // gain, not just the first candy you ever pick up. Held items count as 1 each.
        const readOwnedItemCounts = () => {
            const counts = new Map();
            const add = (name, n) => {
                if (name == null || name === '' || n <= 0) return;
                counts.set(name, (counts.get(name) ?? 0) + n);
            };
            const bag = this.game?.properties?.player?.items;
            if (bag) {
                for (let i = 0; i < 21; i++) {
                    add(bag[i]?.item?.value, bag[i]?.quantity?.value ?? 0);
                }
            }
            const team = this.game?.properties?.player?.team;
            if (team) {
                for (let i = 0; i < 6; i++) add(team[i]?.heldItem?.value, 1);
            }
            return counts;
        };

        // Moving an item between the bag and a Pokemon's hands fires two RAM writes — one source
        // loses a copy, the other gains one — so the grand total is unchanged. The 100 ms debounce
        // coalesces a same-action move into a net-zero diff. If the two writes straddle the window
        // we briefly bank the decremented quantity here and net it against the matching increment,
        // so a held↔bag move never reads as a fresh acquisition. A real pickup has no offsetting
        // decrement to cancel it, so it still fires.
        const MOVE_GRACE_MS = 2000;
        const decrementCredit = new Map(); // name -> [{ qty, at }] of recent unmatched losses

        let lastOwnedCounts = readOwnedItemCounts();
        let ownedCheckTimer = null;
        const checkForNewOwnedItems = () => {
            const now = Date.now();
            const current = readOwnedItemCounts();
            // After a reset/load the bag reloads from 0 → full, which would fire every item as
            // a "fresh" pickup. Re-baseline against the reloaded bag and don't fire during grace.
            if (withinResetGrace()) { lastOwnedCounts = current; return; }
            const names = new Set([...current.keys(), ...lastOwnedCounts.keys()]);
            for (const name of names) {
                if (!isCriticalBagItem(name)) continue;
                const delta = (current.get(name) ?? 0) - (lastOwnedCounts.get(name) ?? 0);
                if (delta === 0) continue;
                if (delta < 0) {
                    // Bank the loss so a paired increment (held↔bag move, or sell-then-rebuy
                    // within the window) can cancel it instead of looking like an acquisition.
                    const credits = decrementCredit.get(name) ?? [];
                    credits.push({ qty: -delta, at: now });
                    decrementCredit.set(name, credits);
                    continue;
                }
                // Net the gain against any non-expired banked losses before deciding to fire.
                let gain = delta;
                const credits = decrementCredit.get(name);
                if (credits) {
                    while (credits.length && gain > 0) {
                        if (now - credits[0].at > MOVE_GRACE_MS) { credits.shift(); continue; }
                        const used = Math.min(gain, credits[0].qty);
                        gain -= used;
                        credits[0].qty -= used;
                        if (credits[0].qty === 0) credits.shift();
                    }
                    if (!credits.length) decrementCredit.delete(name);
                }
                if (gain > 0) {
                    const chapterName = "Item - " + name;
                    console.log("Chapter Detected: " + chapterName);
                    this.sendObsChapterMarker(chapterName);
                }
            }
            lastOwnedCounts = current;
        };
        const scheduleOwnedCheck = () => {
            if (ownedCheckTimer) clearTimeout(ownedCheckTimer);
            ownedCheckTimer = setTimeout(() => {
                ownedCheckTimer = null;
                checkForNewOwnedItems();
            }, 100);
        };
        for (let i = 0; i < 21; i++) {
            this.game.properties.player.items[i]?.item?.change(() => scheduleOwnedCheck());
            this.game.properties.player.items[i]?.quantity?.change(() => scheduleOwnedCheck());
        }
        for (let i = 0; i < 6; i++) {
            this.game.properties.player.team[i]?.heldItem?.change(() => scheduleOwnedCheck());
        }

        // TMs: each TMxx-Name is an int quantity. 0 → >0 means newly obtained.
        // Re-acquiring after selling fires again; buying duplicates does not.
        const tmsRoot = this.game.properties.player.tms;
        if (tmsRoot) {
            for (const tmKey of Object.keys(tmsRoot)) {
                const tmProp = tmsRoot[tmKey];
                if (!tmProp || typeof tmProp.change !== 'function') continue;
                tmProp.change((newProp, oldProp) => {
                    if (withinResetGrace()) return; // bag reloading from 0 after a reset, not a pickup
                    if ((oldProp?.value ?? 0) <= 0 && (newProp?.value ?? 0) > 0) {
                        const chapterName = "Item - " + tmKey.replace('-', ' ');
                        console.log("Chapter Detected: " + chapterName);
                        this.sendObsChapterMarker(chapterName);
                    }
                });
            }
        }

        // HM03-Surf only (skipping the other HMs per spec). Bool false → true.
        this.game.properties.player.hms?.['HM03-Surf']?.change((newProp, oldProp) => {
            if (withinResetGrace()) return; // HMs repopulating after a reset, not a fresh acquisition
            if (newProp?.value === true && oldProp?.value !== true) {
                const chapterName = "Item - HM03 Surf";
                console.log("Chapter Detected: " + chapterName);
                this.sendObsChapterMarker(chapterName);
            }
        });

        // HELD ITEM CHAPTER MARKER
        // Fires "Held Item - <item>" whenever the lead's held item changes to a non-null value.
        // Item-removal transitions (value → null) are ignored.
        this.game.properties.player.team[0].heldItem.change((newProp, oldProp) => {
            if (withinResetGrace()) return; // team repopulating after a reset, not a real held-item change
            const newVal = newProp?.value;
            if (newVal == null || newVal === '') return;
            if (newVal === oldProp?.value) return;
            const chapterName = "Held Item - " + newVal;
            console.log("Chapter Detected: " + chapterName);
            this.sendObsChapterMarker(chapterName);
        });

        // TURN CHAPTER MARKER (Battle only)
        // Fires "Turn" whenever battle.info.playerTurnTaken or enemyTurnTaken increments while
        // the game is in the Battle state. Counter resets between battles produce a decrement,
        // not an increment, so they don't fire.
        const fireTurnMarker = (newProp, oldProp) => {
            if (this.game?.properties?.meta?.state?.value !== 'Battle') return;
            if ((newProp?.value ?? 0) <= (oldProp?.value ?? 0)) return;
            console.log("Chapter Detected: Turn");
            this.sendObsChapterMarker("Turn");
        };
        this.game.properties.battle.info.playerTurnTaken.change(fireTurnMarker);
        this.game.properties.battle.info.enemyTurnTaken.change(fireTurnMarker);

        // NEXT POKEMON CHAPTER MARKER (Battle only)
        // Fires "Next Pokemon" whenever battle.enemyPokemon.partyPos updates while in Battle.
        this.game.properties.battle.enemyPokemon.partyPos.change((newProp, oldProp) => {
            if (this.game?.properties?.meta?.state?.value !== 'Battle') return;
            if (newProp?.value === oldProp?.value) return;
            console.log("Chapter Detected: Next Pokemon");
            this.sendObsChapterMarker("Next Pokemon");
        });

        // ENEMY FAINTED CHAPTER MARKER (Battle only)
        // Fires "Enemy Fainted" when battle.enemyPokemon.hp transitions to 0 during Battle.
        this.game.properties.battle.enemyPokemon.hp.change((newProp, oldProp) => {
            if (this.game?.properties?.meta?.state?.value !== 'Battle') return;
            if (newProp?.value !== 0) return;
            if (oldProp?.value === 0) return;
            console.log("Chapter Detected: Enemy Fainted");
            this.sendObsChapterMarker("Enemy Fainted");
        });


        // EXP BAR ANIMATION FUNCTION
        var species = this.starter
        if (this.g2stateVariable != "Overworld" || this.g2stateVariable != "Battle") {
            var species = this.s1dynamicReset.species.value;
        }
        var growthRate = this.dexDataCrystal[species].growth_rate
        var expStats = this.calcExpStats(growthRate, this.game.properties.player.team[0].expPoints.value);
        this.$refs.expBar.style.width = (expStats.percent * 100) + "%";
        this.prevSpecies = species

        this.game.properties.player.team[0].expPoints.change(async (newProp, oldProp) => {
            if (this.expBarAnimation == true) {
                const currSpecies = this.s1dynamicReset.species.value;
                const growthRate = this.dexDataCrystal[currSpecies].growth_rate
                const oldExpStats = this.calcExpStats(growthRate, oldProp.value);
                const newExpStats = this.calcExpStats(growthRate, newProp.value);
                const animationMaxDuration = 650
    
                if (oldProp.value == newProp.value) { return }
                // did we switch out?
                // there is still a bug here. what if we changed to the same species?
                if (this.g2stateVariable == `Overworld` || this.g2stateVariable == "Base Stats") {
                    this.$refs.expBar.style.width = (newExpStats.percent * 100) + "%";
                }
                else if (this.prevSpecies != currSpecies) {
                    // update prevSpecies

                    this.prevSpecies = currSpecies; 
                    // dont animate, just set newExpStats.percent
                    this.$refs.expBar.style.width = (newExpStats.percent * 100) + "%";
                } 
                // same pokemon but exp changed
                else {
                    if (oldExpStats.level == newExpStats.level) {
                        var diffExp = newExpStats.percent - oldExpStats.percent
                        var animationDuration = Math.ceil(diffExp * animationMaxDuration)
                        // animate width to newExpStats.percent
                        this.$refs.expBar.style.transition = `width ${animationDuration}ms ease-in-out`;
                        this.$refs.expBar.style.width = (newExpStats.percent * 100) + "%";
                        await this.sleep(animationDuration + 50);
                    } else {
                        var diffExp1 = 1 - oldExpStats.percent
                        var animationDuration = Math.ceil(diffExp * animationMaxDuration)
                        var animationDuration1 = Math.ceil(diffExp1 * animationMaxDuration)
                        var diffExp2 = newExpStats.percent
                        var animationDuration2 = Math.ceil(diffExp2 * animationMaxDuration)
                        // animate width to 100%
                        this.$refs.expBar.style.transition = `width ${animationDuration1}ms ease-in`; //MIGHT NEED ANIMATION DURATION 2
                        this.$refs.expBar.style.width = "100%";
                        await this.sleep(250);
                        // dont animate, set width to 0%
                        this.$refs.expBar.style.transition = null;
                        this.$refs.expBar.style.width = "0%";
                        await this.sleep(50);
                        // animate width from 0% to newExpStats.percent
                        this.$refs.expBar.style.transition = `width ${animationDuration2}ms ease-out`;
                        this.$refs.expBar.style.width = (newExpStats.percent * 100) + "%";
                        await this.sleep(animationDuration2 + 50);
                    }
                }
                this.$refs.expBar.style.transition = null;
            }
        })

        //keybinds
        this.unbindHotkeys = bindHotkeys(gen2Hotkeys(this));

        // The control server (port 30159) lives in the main process and is bound to
        // games/gen2/control.ts by main.ts; the client is main.ts's too, so the
        // beforeunload cleanup that closed both is gone with them.

        // Enemy sprite resize tool — dev mode only. Packaged builds just read
        // enemy_sprite_scales.js and don't expose any resize UI.
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
