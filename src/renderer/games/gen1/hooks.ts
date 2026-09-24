import PubSub from "~/logic/PubSub";
import { logData, logCopy } from "~/autosplitter/autosplitter_functions.js";
import { autosplitter } from "~/games/gen1/data/splits";
import { addSplitBookmark, sendChapterMarker } from "~/core/logic/shuckieBookmarks";
import { gen1ChapterMarkers } from "~/games/gen1/markers";
import { applyManualStarterDvs, OAKS_LAB } from "~/games/gen1/starterDvs";
import { RightPanelMode } from "~/stores/types/RightPanelMode.js";

/**
 * gen1's run hooks: everything the overlay subscribes to on the mapper once it is
 * mounted (plan 1.1, extracted verbatim from `components/frontend.js`'s `mounted`).
 *
 * In plan order these are the reset, blackout, new-run, "NINTEN" rename, autosplitter,
 * run-finished and Alakazam-Yellow watchers. They are `GameModule.hooks.installRunHooks`; until the adapter exists they still speak raw gen1 mapper paths, and the split-trigger
 * trainer lists are still the inline `switch` statements they always were.
 *
 * `vm` is the overlay component instance, which is what `this` was; `vm.game.properties`
 * is the profile's canonical view (plan 1.4), which for gen1 spells every key the way the
 * mapper does. Keeping the instance as the context object is deliberate: the hooks write `simple_data_str`, `full_data_str`,
 * `deprecated_data_str` and `split_data` on it, and call `log_split()` and
 * `autosplitter_process()`, which are the `autosplitter_functions.js` helpers bound as
 * component methods. Untangling that is plan 1.4's job, not this move's.
 *
 * Registration order matters and is preserved: `components/state.vue` installs
 * `games/gen1/state.ts` from a child `created()` hook, so `meta.gameState` is already
 * updated by the time the blackout handler below reads it.
 */
export function installGen1RunHooks(vm: any): void {


    // RESET - Identifies when a reset occurs and publishes an event
    vm.game.properties.player.playerId.change((newProp, oldProp) => {
        if (newProp.value == 0 && oldProp.value > 0 && vm.metrics.run_finished == false) {
            PubSub.publish("@run/reset_occurred");
        }
    });
    // BLACKOUT - Identifies when a blackout might have occurred, and marks battles in the OBS recording.
    vm.game.properties.meta.state.change((newProp, oldProp) => {
        PubSub.publish("@run/check_blackout", [newProp, oldProp]);
        if (newProp.value == "To Battle" && vm.game.properties.battle.type.value == "Trainer") {
            vm.settings.clearRightPanelOverride();
            if (oldProp.value == "Overworld") {
                sendChapterMarker(gen1ChapterMarkers.battleIn(vm.game.properties.battle.trainer.class.value));
            }
        }
        else if (newProp.value == "Overworld" && oldProp.value == "From Battle") {
            sendChapterMarker(gen1ChapterMarkers.battleOut(vm.game.properties.battle.trainer.class.value));
        }
    });
    // NEW_RUN_STARTED - Determines if the player has pressed 'New Game' and started a new playthrough
    vm.game.properties.player.playerId.change((newProp) => {
        if (newProp.value > 0 && vm.metrics.run_finished == false && newProp.value != vm.metrics.player_id) {
            if (vm.runConfig.advanced.no_attempt == true) {
                return
            }
            PubSub.publish("@run/new_run_started", vm.metrics.player_id);
            // The previous run's post-battle splits (or its summary) stay up until the
            // next run starts; from here the right panel is the setting's again.
            vm.settings.clearRightPanelOverride();
            vm.metrics.update("splits_logged", false);
            if (vm.runConfig.advanced.test_run == false && vm.runConfig.advanced.refilming_mode == false) {
                vm.metrics.update("attempts", vm.metrics.attempts + 1);
            };
            if (vm.settings.shuckie.timer && vm.emulator.timeCurrent == null) {
                vm.emulator.sendStart();
            }
            vm.metrics.startTime();
            vm.metrics.update("player_id", newProp.value);
        }
    })
    // Only allow the player to reset once after the champion without resets incrementing
    vm.game.properties.player.name.change((newProp) => {
        if (vm.metrics.run_finished == true && newProp.value == "NINTEN") {
            vm.metrics.update("run_finished", false);
        }
    })

    //! Refactor into 'components/autosplitter.js' component
    //* Autosplitter
    //log the start of a battle to the console
    vm.game.properties.battle.type.change((newProp) => {
        vm.battle.startBattle(vm.game.properties, newProp.value, vm.collect_split_data);
    });
    //write to file at the end of a key battle
    //the `lowHealthAlarm` property is used to play the Red-bar sound effect
    //it is turned off as soon as "Player defeated Trainer" starts to render in the textbox
    vm.game.properties.battle.lowHealthAlarm.change((prop) => {
        //Collect battle starting metrics
        vm.autosplitter_process()
        if (prop.value == "Disabled" && vm.game.properties.battle.type.value == "Trainer") {
            let trainer = vm.game.properties.battle.trainer.class.value
            let id = vm.game.properties.battle.trainer.number.value
            let unique = `${trainer}_${id}`
            const gameName = vm.gameLetter;
            const gameName_Path = vm.gamePath; // Used for split data
            const advanced = vm.runConfig.advanced;

            vm.battle.endBattle(vm.game.properties, vm.collect_split_data);

            //write full split data (this is written for every single battle)
            logData(gameName, gameName_Path, vm.full_data_str, vm.metrics.attempts, vm.meta.starter, "Full", advanced.test_run, advanced.refilming_mode, advanced.refilmed_attempt, advanced.refilmed_finish)

            //write deprecated split data (this is written for only pre-defined trainers)
            //a list of these trainers can be found within `autosplitter.js` and inside the parent `Yellow` or `Red and Blue`
            if (autosplitter[vm.game.properties.meta.gameName.value][unique]) {
                logData(gameName, gameName_Path, vm.deprecated_data_str, vm.metrics.attempts, vm.meta.starter, "Deprecated", advanced.test_run, advanced.refilming_mode, advanced.refilmed_attempt, advanced.refilmed_finish)
            }

            //write simple split data
            //a list of these can be found within `autosplitter.js` and inside the parent `Simple`
            const simpleSplit = () => {
                vm.log_split()
                logData(gameName, gameName_Path, vm.simple_data_str, vm.metrics.attempts, vm.meta.starter, "Simple", advanced.test_run, advanced.refilming_mode, advanced.refilmed_attempt, advanced.refilmed_finish)
                vm.split_data.push(vm.simple_data)
                // The same split into the replay (2026-09-23): simple_data[2] is the trainer
                // key current_splits holds, [3] the CSV's real_time_hmmss.
                addSplitBookmark(vm.simple_data[2], vm.simple_data[3])
            }
            //log simple data for only these trainers
            switch (trainer) {
                case "RIVAL1":
                case "RIVAL2":
                case "BROCK":
                case "MISTY":
                case "LT.SURGE":
                case "ERIKA":
                case "KOGA":
                case "SABRINA":
                case "BLAINE":
                case "LORELEI":
                case "BRUNO":
                case "AGATHA":
                case "LANCE": {
                    simpleSplit()
                    if (vm.settings.right_panel.post_battle_splits == true) {
                        vm.settings.setRightPanelOverride(RightPanelMode.splits);
                    }
                }
            }
            switch (unique) {
                //this is the Giovanni fight in the 8th gym
                case "GIOVANNI_3":
                    simpleSplit()
                    if (vm.settings.right_panel.post_battle_splits === true) {
                        vm.settings.setRightPanelOverride(RightPanelMode.splits);
                    }
                    break;
                case "ROCKET_5": {
                    simpleSplit()
                    break;
                } //this is the rocket outside of Cerulean city, collecting this data allows for better comparisons for Pokemon that take different choices in Cerulean Nugget->Misty or Misty->Nugget
            }

            //stop timer
            if (trainer == "RIVAL3") { //this is the champion in gen1
                vm.log_split() //log the final split
                addSplitBookmark(vm.simple_data[2], vm.simple_data[3])
                if (vm.settings.right_panel.post_battle_splits === true) {
                    vm.settings.setRightPanelOverride(RightPanelMode.splits);
                }
                vm.metrics.stopTimer();
                if (vm.settings.shuckie.timer) {
                    vm.emulator.sendEnd();
                }
                logData(gameName, gameName_Path, vm.simple_data_str, vm.metrics.attempts, vm.meta.starter, "Simple", advanced.test_run, advanced.refilming_mode, advanced.refilmed_attempt, advanced.refilmed_finish) //log a simple split
                vm.split_data.push(vm.simple_data) //push the split data into the data variable
            }
        }
    });
    //log the final times with the final gametime
    //I am watching tile1 for a specifc tile that appears when the gametime displays on screen
    vm.game.properties.screen.tiles.column1.tile1.change((newProp) => {
        if (newProp.value == 122) {
            if (vm.game.properties.events.beatChampion.value == true && vm.game.properties.overworld.map.value == "Hall of Fame") {
                const gameName = vm.gameLetter;
                const gameName_Path = vm.gamePath; // Used for split data
                const advanced = vm.runConfig.advanced;
                const { formatted: formattedTime } = vm.metrics.getTime();
                vm.autosplitter_process()
                console.log("Run Ended - Backing up split data now...")
                logData(gameName, gameName_Path, vm.simple_data_str, vm.metrics.attempts, vm.meta.starter, "Simple", advanced.test_run, advanced.refilming_mode, advanced.refilmed_attempt, advanced.refilmed_finish)
                logData(gameName, gameName_Path, vm.deprecated_data_str, vm.metrics.attempts, vm.meta.starter, "Deprecated", advanced.test_run, advanced.refilming_mode, advanced.refilmed_attempt, advanced.refilmed_finish)
                logData(gameName, gameName_Path, vm.full_data_str, vm.metrics.attempts, vm.meta.starter, "Full", advanced.test_run, advanced.refilming_mode, advanced.refilmed_attempt, advanced.refilmed_finish)
                vm.split_data.push(vm.simple_data)
                console.log(`Autosplitter - Run Ended: Real-Time: ${formattedTime[0]}${formattedTime[1]} Resets: ${vm.metrics.resets} Blackouts: ${vm.metrics.blackouts} Level: ${vm.game.properties.player.team[0].level.value} Gametime: ${vm.gametimeSplit})`)
                vm.metrics.update("run_finished", true); //stop incrementing resets
            }
        }
    });
    //when the triangular cursor appears on the screen, copy the split files to the finishes folder
    vm.game.properties.screen.text.prompt.change((newProp, oldProp) => {
        if (vm.metrics.splits_logged == false && vm.metrics.run_finished == true && newProp.bytes == 0xEE && oldProp.bytes == 0x7F) {
            const advanced = vm.runConfig.advanced;
            logCopy(  // copy the current attempt's split data to the finished folder
                vm.gameLetter,
                vm.gamePath,
                vm.metrics.attempts,
                vm.meta.starter,
                vm.metrics.finishes,
                advanced.refilming_mode,
                advanced.refilmed_attempt,
                advanced.refilmed_finish
            );
            console.log("Run complete - moving attempt files to finished folder.")
            if (advanced.test_run == false && advanced.refilming_mode == false && advanced.no_attempt == false) {
                vm.metrics.update("finishes", vm.metrics.finishes + 1);
            }
            vm.metrics.update("splits_logged", true);
        }
    });
    //! end of autosplitter

    // Alakazam Yellow exception
    vm.game.properties?.trainers?.viridianForest?.bugcatcher2?.change((newValue, oldValue) => {
        if (vm.meta.game == "Yellow" && vm.meta.starter == "Alakazam" && newValue.value == true) {
            vm.game.properties.patch.wEarlyEncounters.set("On", false)
        }
    });

    // MANUAL DVs (2026-09-17) - the starter arriving in Oak's Lab is the party slot's level
    // going from empty to 5 there. With the species file on `Manual`, the spread it holds is
    // written then, stats included (games/gen1/starterDvs.ts); `Automatic` writes nothing.
    vm.game.properties.player.team[0].level.change(async (newProp, oldProp) => {
        if (newProp.value != 5 || (oldProp?.value ?? 0) != 0) return;
        if (vm.game.properties.overworld.map.value != OAKS_LAB) return;
        await applyManualStarterDvs(vm.game, vm.runConfig.config.dvs, vm.meta.starter);
    });
}
