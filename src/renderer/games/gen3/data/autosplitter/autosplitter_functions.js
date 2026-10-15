// Component code, not data: lifted in place by tools/port/lift-gen3.py (step 13).
import { MyStorage } from "../../storage";
// Implicit globals of the legacy classic script, see tools/port/lift-gen3.py.
let battle_end;
import { autosplitter } from "../autosplitter.js";
export function log_split(x) {
    // console.log(this)
    const time = this.timer.formatted_time;
    // console.log(`Autosplitter - Battle Ended: Split: ${this.opponent} at ${time[0]}${time[1]} (Gametime: ${this.gametimeSplit})`)
} 
export function autosplitter_process(split_name = null) {
    // console.log("Checking if autosplitter is on...")
    // console.log("autosplitter_process called:", {
    //     autosplitter_toggle: this.autosplitter_toggle,
    //     isTrainerBattle: this.game?.properties?.battle?.type?.trainer?.value,
    //     gameSelection: this.gameSelection
    // });
    if (this.autosplitter_toggle == true && this.game.properties.battle.type.trainer.value == true) {
        // console.log("Began Autosplitter Process")
        
        // Generate a unique run identifier on the first split so attempt files have a stable name.
        if (this.unique_run_identifier === null) {
            const uniqueId = this.generateUniqueRunIdentifier();
            if (uniqueId) {
                this.unique_run_identifier = uniqueId;
            } else {
                console.warn('[Autosplitter] Could not generate unique run identifier');
            }
        }
        this.is_new_run = true;
        battle_end = Date.now()
        //data to be collected with the autosplitter
        let player_name = this.game.properties.player.name.value
        let pokemon = this.starterString
        // console.log("opponent info: "+ this.opponent)
        let trainer_name = split_name != null ? split_name : this.opponent
        // let trainer_name = this.format_trainer_name(this.game.properties.battle.trainer.class.value, this.game.properties.battle.trainer.number.value)
        const formattedTime = this.timer.formatted_time;
        let real_time_hmmss = formattedTime[0]
        let resets = this.playerResets.toString()
        let blackouts = this.blackout_counter.toString()
        let level = this.game.properties.player.team[0].level.value.toString()
        let game_time = this.gametimeSplit.toString()
        let battle_duration = (battle_end - this.battle_start)/1000 
        let move1 = this.game.properties.player.team[0].move1.value
        let move2 = this.game.properties.player.team[0].move2.value
        let move3 = this.game.properties.player.team[0].move3.value
        let move4 = this.game.properties.player.team[0].move4.value

        const time = this.timer.getTime();

        let realTime = this.padTime(time.hours) + ":" + this.padTime(time.minutes) + ":" + this.padTime(time.seconds) + "." + this.padTime(time.ms)

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
        
        // Debug logging for current_splits population
        const battleOutcome = this.game.properties.battle.turnInfo.battleOutcome.value;
        const isTrainerBattle = this.game.properties.battle.type.trainer.value;
        // Battle outcome can be "WON" (string) or 1 (number)
        const battleWon = battleOutcome == "WON" || battleOutcome == 1;
        console.log("Checking current_splits conditions:", {
            collect_split_data: this.collect_split_data,
            battleOutcome: battleOutcome,
            battleOutcomeType: typeof battleOutcome,
            battleWon: battleWon,
            isTrainerBattle: isTrainerBattle,
            trainer_name: trainer_name,
            willPush: this.collect_split_data == true && battleWon && isTrainerBattle == true
        });
        
        if (this.collect_split_data == true && battleWon && isTrainerBattle == true) {
            console.log("Adding to current_splits:", {
                trainer: trainer_name,
                time: this.shuckie_timer ? shuckie_time_hhmmss : real_time_hmmss,
                current_splits_length_before: this.current_splits?.length ?? 0
            });
            this.current_splits.push({
                trainer: trainer_name, 
                time:    this.shuckie_timer ? shuckie_time_hhmmss : real_time_hmmss,
            });
            console.log("current_splits_length_after:", this.current_splits?.length ?? 0);
        } else {
            console.log("NOT adding to current_splits - conditions failed");
        }
    }
}