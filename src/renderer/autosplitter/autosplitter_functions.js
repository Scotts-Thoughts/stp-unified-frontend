import { capitalize_words } from "../methods/text_functions";
import { formatShuckieTime } from "~/core/stores/useEmulatorStatsStore";
import { splitMilliseconds } from "~/logic/Timer";
import { convertSecondsToDuration } from "~/utils/timehelpers";

import { appendSplitCsv, copySplitFile, splitPath } from "~/core/persistence/splitFiles";
export function log_split() {
    const {formatted: time } = this.metrics.getTime();
    const opponent = this.game.properties.battle.trainer.class.value;
    const shuckieEnabled = this.settings.shuckie.timer
        && this.emulator?.stats?.time_current != null;
    const [t0, t1] = shuckieEnabled
        ? formatShuckieTime(this.emulator.stats.time_current)
        : [time[0], time[1]];
    console.log(`Autosplitter - Battle Ended: Split: ${opponent} at ${t0}${t1} (Gametime: ${this.gametimeSplit})`)
}

export function autosplitter_process() {
    if (this.autosplitter_toggle == true && this.runConfig.advanced.no_attempt == false) {
        const battle_end = Date.now()
        //data to be collected with the autosplitter
        let player_name = this.game.properties.player.name.value
        let pokemon = this.meta.starter;
        let trainer_name = this.format_trainer_name(this.game.properties.battle.trainer.class.value, this.game.properties.battle.trainer.number.value)
        let { raw: time } = this.metrics.getTime();
        // When the Shuckie timer is enabled, every time field uses the emulator's timer instead of the local one,
        // so on-disk logs and the splits panel match the displayed overlay time.
        const shuckieEnabled = this.settings.shuckie.timer
            && this.emulator?.stats?.time_current != null;
        if (shuckieEnabled) {
            time = splitMilliseconds(this.emulator.stats.time_current);
        }
        // Splits always display as [h:]m:ss (minutes shown even when 0, never centiseconds).
        let real_time_hmmss = convertSecondsToDuration(time.hours * 3600 + time.minutes * 60 + time.seconds)
        // With the Shuckie Counters switch on the rows carry the emulator's counters, which
        // are what the overlay shows (gen4 logs the same way).
        const resets_value = this.settings.shuckie.counters ? this.emulator.playerResets : this.metrics.resets
        const blackouts_value = this.settings.shuckie.counters ? this.emulator.blackoutCounter : this.metrics.blackouts
        let resets = resets_value.toString()
        let blackouts = blackouts_value.toString()
        let level = this.game.properties.player.team[0].level.value.toString()
        let game_time = this.gametimeSplit.toString()
        let battle_duration = (battle_end - this.battle.statistics.battle_start)/1000
        let move1 = this.game.properties.player.team[0].move1.value
        let move2 = this.game.properties.player.team[0].move2.value
        let move3 = this.game.properties.player.team[0].move3.value
        let move4 = this.game.properties.player.team[0].move4.value

        //what split data is logged to file
        let simple_data = [
            player_name, pokemon, trainer_name, real_time_hmmss,
            resets, blackouts, level, game_time, battle_duration,
            move1, move2, move3, move4
        ]

        let simple_data_str = simple_data.join(",") + "\n";
        this.simple_data_str = simple_data_str // assign within Data so it can be recalled on future loops
        this.simple_data = simple_data // assign within Data so it can be recalled on future loops
        if (this.collect_split_data == true && (this.game.properties.meta.state.value == "Battle" || this.game.properties.meta.state.value == "From Battle")) {
            this.current_splits.push({
                trainer: trainer_name, 
                time:    real_time_hmmss,
            })
        }
    }
}

export function format_trainer_name(trainer_class, trainer_number) {
    const game = this.game.properties.meta.gameName.value
    if (game == 'Red and Blue') {
        //rivals
        if (trainer_class == "RIVAL1" && trainer_number == 1)  { return "Rival1-Lab" }
        if (trainer_class == "RIVAL1" && trainer_number == 2)  { return "Rival1-Lab" }
        if (trainer_class == "RIVAL1" && trainer_number == 3)  { return "Rival1-Lab" }
        if (trainer_class == "RIVAL1" && trainer_number == 4)  { return "Rival1a-Route 22" }
        if (trainer_class == "RIVAL1" && trainer_number == 5)  { return "Rival1a-Route 22" }
        if (trainer_class == "RIVAL1" && trainer_number == 6)  { return "Rival1a-Route 22" }
        if (trainer_class == "RIVAL1" && trainer_number == 7)  { return "Rival2-Nugget Bridge" }
        if (trainer_class == "RIVAL1" && trainer_number == 8)  { return "Rival2-Nugget Bridge" }
        if (trainer_class == "RIVAL1" && trainer_number == 9)  { return "Rival2-Nugget Bridge" }
        if (trainer_class == "RIVAL2" && trainer_number == 1)  { return "Rival3-SS Anne" }
        if (trainer_class == "RIVAL2" && trainer_number == 2)  { return "Rival3-SS Anne"  }
        if (trainer_class == "RIVAL2" && trainer_number == 3)  { return "Rival3-SS Anne"  }
        if (trainer_class == "RIVAL2" && trainer_number == 4)  { return "Rival4-Pkmn Tower" }
        if (trainer_class == "RIVAL2" && trainer_number == 5)  { return "Rival4-Pkmn Tower" }
        if (trainer_class == "RIVAL2" && trainer_number == 6)  { return "Rival4-Pkmn Tower" }
        if (trainer_class == "RIVAL2" && trainer_number == 7)  { return "Rival5-Silph" }
        if (trainer_class == "RIVAL2" && trainer_number == 8)  { return "Rival5-Silph" }
        if (trainer_class == "RIVAL2" && trainer_number == 9)  { return "Rival5-Silph" }
        if (trainer_class == "RIVAL2" && trainer_number == 10) { return "Rival6-Route 22" }
        if (trainer_class == "RIVAL2" && trainer_number == 11) { return "Rival6-Route 22" }
        if (trainer_class == "RIVAL2" && trainer_number == 12) { return "Rival6-Route 22" }
        if (trainer_class == "RIVAL3" && trainer_number == 1)  { return "Champion" }
        if (trainer_class == "RIVAL3" && trainer_number == 2)  { return "Champion" }
        if (trainer_class == "RIVAL3" && trainer_number == 3)  { return "Champion" }
    }
    if (game == 'Yellow') {
        //rivals
        if (trainer_class == "RIVAL1" && trainer_number == 1)  { return "Rival1-Lab" }
        if (trainer_class == "RIVAL1" && trainer_number == 2)  { return "Rival1a-Route 22" }
        if (trainer_class == "RIVAL1" && trainer_number == 3)  { return "Rival2-Nugget Bridge" }
        if (trainer_class == "RIVAL2" && trainer_number == 1)  { return "Rival3-SS Anne" }
        if (trainer_class == "RIVAL2" && trainer_number == 2)  { return "Rival4-Pkmn Tower" }
        if (trainer_class == "RIVAL2" && trainer_number == 3)  { return "Rival4-Pkmn Tower" }
        if (trainer_class == "RIVAL2" && trainer_number == 4)  { return "Rival4-Pkmn Tower" }
        if (trainer_class == "RIVAL2" && trainer_number == 5)  { return "Rival5-Silph" }
        if (trainer_class == "RIVAL2" && trainer_number == 6)  { return "Rival5-Silph" }
        if (trainer_class == "RIVAL2" && trainer_number == 7)  { return "Rival5-Silph" }
        if (trainer_class == "RIVAL2" && trainer_number == 8)  { return "Rival6-Route 22" }
        if (trainer_class == "RIVAL2" && trainer_number == 9)  { return "Rival6-Route 22" }
        if (trainer_class == "RIVAL2" && trainer_number == 10) { return "Rival6-Route 22" }
        if (trainer_class == "RIVAL3" && trainer_number == 1) { return "Champion" }
        if (trainer_class == "RIVAL3" && trainer_number == 2) { return "Champion" }
        if (trainer_class == "RIVAL3" && trainer_number == 3) { return "Champion" }
    }
    //gym leaders
    if (trainer_class == "BROCK")    { return "Brock" }
    if (trainer_class == "MISTY")    { return "Misty" }
    if (trainer_class == "LT.SURGE") { return "Surge" }
    if (trainer_class == "ERIKA")    { return "Erika" }
    if (trainer_class == "KOGA")     { return "Koga" }
    if (trainer_class == "SARINA")   { return "Sabrina" }
    if (trainer_class == "BLAINE")   { return "Blaine" }
    //giovanni
    if (trainer_class == "GIOVANNI" && trainer_number == 1) { return "Giovanni-Hideout" }
    if (trainer_class == "GIOVANNI" && trainer_number == 2) { return "Giovanni-Silph" }
    if (trainer_class == "GIOVANNI" && trainer_number == 3) { return "Giovanni" }
    //elite4 members
    if (trainer_class == "LORELEI") { return "Lorelei" }
    if (trainer_class == "BRUNO")   { return "Bruno" }
    if (trainer_class == "AGATHA")  { return "Agatha" }
    if (trainer_class == "LANCE")   { return "Lance" }
    //notable npcs
    if (trainer_class == "ROCKET"       && this.game.properties.battle.trainer.number == 5)   { return "Cerulean Rocket" }
    if (trainer_class == "YOUNGSTER"    && this.game.properties.battle.trainer.number == 1)   { return "Youngster Ben" }
    if (trainer_class == "LASS"         && this.game.properties.battle.trainer.number == 10)  { return "Oddish Lass" } 
    if (trainer_class == "JR TRAINER F" && this.game.properties.battle.trainer.number == 1)   { return "Pecking Lass" } 
    if (trainer_class == "JR TRAINER F" && this.game.properties.battle.trainer.number == 3)   { return "Sandy" } 
    if (trainer_class == "JR TRAINER F" && this.game.properties.battle.trainer.number == 5)   { return "Wrapping Lass" } 
    if (trainer_class == "SUPER NERD"   && this.game.properties.battle.trainer.number == 2)   { return "Fossil Nerd" }
    if (trainer_class == "POKEMANIAC"   && this.game.properties.battle.trainer.number == 7)   { return "Slowbone" }
    if (trainer_class == "JR TRAINER F" && this.game.properties.battle.trainer.number == 10)  { return "Status-Condition-Jr-Trainer" }
    if (trainer_class == "HIKER"        && this.game.properties.battle.trainer.number == 9)   { return "Selfdestructing Hiker" }
    if (trainer_class == "JR TRAINER F" && this.game.properties.battle.trainer.number == 18)  { return "Finisher" }
    if (trainer_class == "ROCKET"       && this.game.properties.battle.trainer.number == 38)  { return "Hypno Rocket" }
    if (trainer_class == "CHANNELER"    && this.game.properties.battle.trainer.number == 10)  { return "Agatha Jr" }
    else return capitalize_words(trainer_class)
}

// TODO: the `refilmed_finish` parameter is unused.
export function logData(gameName, gameName_Path, str, file_name, starterName, testStatus, refilming_mode, refilmed_attempt, refilmed_finish) {
    // Relative to <appRoot>/splits (plan 1.7); the legacy code built "./splits/..." and
    // let it resolve against the working directory.
    const dirPath = refilming_mode
        ? splitPath(gameName_Path, starterName, "refilmed", "attempts")
        : splitPath(gameName_Path, starterName, "attempts");
    const testStatusText = testStatus ? "test_run_" : "";
    let attempt_number = refilming_mode ? refilmed_attempt : file_name;
    const filePath = splitPath(dirPath, `${gameName}-${testStatusText}${starterName}-${attempt_number}.csv`);
    const header = "player_name,pokemon,trainer_name,real_time_hmmss,resets,blackouts,level,game_time," +
        "battle_duration,move1,move2,move3,move4\n";
    return appendSplitCsv(filePath, header, str);
}

// TODO: the `refilmed_finish` parameter is unused.
export function logCopy(gameName, gameName_Path, file_name, starterName, finished_run_count, refilming_mode, refilmed_attempt, refilmed_finish) {
    var dirPathAttempts = refilming_mode
        ? splitPath(gameName_Path, starterName, "refilmed", "attempts")
        : splitPath(gameName_Path, starterName, "attempts")
    var dirPathFinishes = refilming_mode
        ? splitPath(gameName_Path, starterName, "refilmed", "finishes")
        : splitPath(gameName_Path, starterName, "finishes")
    let attempt_number = refilming_mode ? refilmed_attempt : file_name;
    let finish_number = refilming_mode ? refilmed_attempt : finished_run_count;
    console.log("LogCopy Variables", gameName, gameName_Path, file_name, starterName, finished_run_count, dirPathAttempts, dirPathFinishes, attempt_number, finish_number)
    // The queue in splitFiles.ts guarantees every logData write has landed before the copy.
    return copySplitFile(
        splitPath(dirPathAttempts, `${gameName}-${starterName}-${attempt_number}.csv`),
        splitPath(dirPathFinishes, `${gameName}-${starterName}-${finish_number}.csv`));
}
