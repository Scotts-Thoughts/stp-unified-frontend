import { appendSplitCsv, copySplitFile, splitPath } from "~/core/persistence/splitFiles";

/**
 * gen2's `logData`, `logCopy` and `transition` (the helpers above its component in
 * `frontend.js`), on the splits IPC instead of `require("fs")` (plan 2.4 / 1.6).
 *
 * Generated from the legacy source by the port script, so every header string and
 * file-name template is byte-for-byte gen2's. That includes known-legacy-bugs.md #2:
 * `logData` hardcodes `Crystal/` for *attempts* while `logCopy` uses the selected
 * game's folder for *finishes*, so a Gold & Silver run's attempt files land under
 * `Crystal/` and its finished copies under `Gold & Silver/`. Preserved.
 *
 * The legacy `logData` resolved after the append (or after logging an error);
 * `appendSplitCsv` does the same, through one ordered queue.
 */
export function logData(gameName, str, file_name, starter, log_type, testStatus, toggle, refilming_mode, refilmed_attempt, refilmed_finish) {
        const dirPath = refilming_mode ? splitPath("Crystal", starter, "refilmed", "attempts") : splitPath("Crystal", starter, "attempts");
        const testStatusText = testStatus ? "test_run_" : "";
        let filePath = splitPath(dirPath, `${gameName}-${testStatusText}${starter}-${file_name}-simple.csv`);
        let header = "player_name,pokemon,trainer_name,real_time_hmmss,resets,blackouts,failures,level,game_time,battle_duration,move1,move2,move3,move4\n";
        if (log_type == "Simple") {
            header = "player_name,pokemon,trainer_name,real_time_hmmss,resets,blackouts,level,game_time," +
            "battle_duration,move1,move2,move3,move4\n";
        }
        else if (log_type == "Full" && toggle == true) {
            filePath = splitPath(dirPath, `${gameName}-${testStatusText}${starter}-${file_name}-full.csv`);
            header = "player_name,pokemon,trainer_name,real_time_hmmss,resets,blackouts,level,game_time," +
            "battle_duration,move1,move2,move3,move4\n";
        }
        else if (log_type == "Full" && toggle == false) {
            filePath = splitPath(dirPath, `${gameName}-${testStatusText}${starter}-${file_name}-full.csv`);
            header = "date_string,time_string,player_name,pokemon,trainer_name,trainer_id,location,total_pokemon," +
                "real_time_total,real_time_hmmss,real_time_file_label,resets,blackouts,failures,level,game_time,battle_duration," + 
                "move1,move2,move3,move4,move1pp,move2pp,move3pp,move4pp,move1ppUp,move2ppUp,move3ppUp,move4ppUp," +
                "saves,steps,bonks,trainerBattles,wildBattles,battleTurns,playerTurns,enemyTurns," +
                "itemsInBag,money,rivalTeam," +
                "statusCondition,type1,type2,experience," +
                "ROM,Species,Trainer,Start Time,Real Time,Game Time,Level,Resets," +
                "RTHours,RTMinutes,RTSeconds,RTMilliseconds,Move 1,Move 2,Move 3,Move 4," +
                "Hp,Max HP,Attack,Defense,Sp. Attack,Sp. Defense,Speed,Attack DV,Defense DV,Speed DV,Special DV," +
                "StatExp HP,StatExp Attack,StatExp Def,StatExp Sp. Attack,StatExp Sp. Defense,StatExp Speed," +
                "Attack Stage,Defense Stage,Sp. Attack Stage,Sp. Defense Stage,Speed Stage,Accuracy Stage,Evasion Stage," +
                "Battle Attack,Battle Defense,Battle Sp. Attack,Battle Sp. Defense,Battle Speed," +
                "Frame Count,Overworld Frame Count,Battle Frame Count,Menu Frame Count,Intro Frame Count," +
                "Save Count,Reload Count,Clock Reset Count,Steps Count,Steps Count Walk,Steps Count Bike,Steps Count Surf,Bonks," + 
                "Battles,Trainer Battles,Wild Battles,Battles Fled,Failed Runs," +
                "Total Damage Dealt,Actual Damage Dealt,Total Damage Taken,Actual Damage Taken," +
                "Own Moves Hit,Own Moves Missed,Enemy Moves Hit,Enemy Moves Missed," +
                "Own Moves Super Effective,Own Moves Not Very Effective,Enemy Moves Super Effective,Enemy Moves Not Very Effective," +
                "Criticals Dealt,OHKOs Dealt,Criticals Taken,OHKOs Taken," +
                "Was Confused,Enemy Became Confused,Was Paralyzed,Enemy Was Paralyzed,Was Burned,Enemy Was Burned," +
                "Was Frozen,Enemy Was Frozen,Was Poisoned,Enemy Was Poisoned,Was Badly Poisoned,Enemy Was Badly Poisoned," +
                "Fell Asleep,Enemy Fell Asleep,Player Turns Confused,Player Turns Confused Hit Self,Player Turns Paralyzed," +
                "Player Turns Paralyzed Fully,Enemy Turns Confused,Enemy Turns Confused Hit Self,Enemy Turns Paralyzed," +
                "Enemy Turns Paralyzed Fully, Player Turns Asleep, Enemy Turns Asleep,Player HP Healed,Enemy HP Healed," +
                "Player Pokemon Fainted,Enemy Pokemon Fainted," +
                "Experience Gained,Switchouts," +
                "Money Made,Money Spent,Money Lost," +
                "Items Picked Up,Items Bought,Items Sold," +
                "Balls Thrown,Pokemon Caught In Balls,Moves Learnt," +
                "Blackouts,Attempt Number,Failures, Rival's Team\n";
        }
        else if (log_type == "Deprecated") {
            filePath = splitPath(dirPath, `${gameName}-${testStatusText}${starter}-${file_name}.csv`);
            header = "ROM,Species,Trainer,Start Time,Real Time,Game Time,Level,Resets," +
                "RTHours,RTMinutes,RTSeconds,RTMilliseconds,Move 1,Move 2,Move 3,Move 4," +
                "Attack,Defense,Sp. Attack,Sp. Defense,Speed," +
                "Attack Stage,Defense Stage,Sp. Attack Stage,Sp. Defense Stage,Speed Stage,Accuracy Stage,Evasion Stage," +
                "Battle Attack,Battle Defense,Battle Sp. Attack,Battle Sp. Defense,Battle Speed," +
                "Frame Count,Overworld Frame Count,Battle Frame Count,Menu Frame Count,Intro Frame Count," +
                "Save Count,Reload Count,Clock Reset Count,Steps Count,Steps Count Walk,Steps Count Bike,Steps Count Surf,Bonks," + 
                "Battles,Trainer Battles,Wild Battles,Battles Fled,Failed Runs," +
                "Total Damage Dealt,Actual Damage Dealt,Total Damage Taken,Actual Damage Taken," +
                "Own Moves Hit,Own Moves Missed,Enemy Moves Hit,Enemy Moves Missed," +
                "Own Moves Super Effective,Own Moves Not Very Effective,Enemy Moves Super Effective,Enemy Moves Not Very Effective," +
                "Criticals Dealt,OHKOs Dealt,Criticals Taken,OHKOs Taken," +
                "Was Confused,Enemy Became Confused,Was Paralyzed,Enemy Was Paralyzed,Was Burned,Enemy Was Burned," +
                "Was Frozen,Enemy Was Frozen,Was Poisoned,Enemy Was Poisoned,Was Badly Poisoned,Enemy Was Badly Poisoned," +
                "Fell Asleep,Enemy Fell Asleep,Player Turns Confused,Player Turns Confused Hit Self,Player Turns Paralyzed," +
                "Player Turns Paralyzed Fully,Enemy Turns Confused,Enemy Turns Confused Hit Self,Enemy Turns Paralyzed," +
                "Enemy Turns Paralyzed Fully,Player HP Healed,Enemy HP Healed," +
                "Player Pokemon Fainted,Enemy Pokemon Fainted," +
                "Experience Gained,Switchouts," +
                "Money Made,Money Spent,Money Lost," +
                "Items Picked Up,Items Bought,Items Sold," +
                "Balls Thrown,Pokemon Caught In Balls,Moves Learnt," +
                //new properties
                "Blackouts,Attempt Number,Failures, Rival's Team\n"
        }
        else if (log_type == "Battle Summary") {
            filePath = splitPath(dirPath, `${starter}-${file_name}-battleSummary.csv`);
            header = "Unknown"
        }
        return appendSplitCsv(filePath, header, str);
}

export function logCopy(gameName, gameName_Path, file_name, starterName, finished_run_count, refilming_mode) {
    var dirPathAttempts = refilming_mode ? splitPath(gameName_Path, starterName, "refilmed", "attempts") : splitPath(gameName_Path, starterName, "attempts")
    var dirPathFinishes = refilming_mode ? splitPath(gameName_Path, starterName, "refilmed", "finishes") : splitPath(gameName_Path, starterName, "finishes")
    return Promise.all([
        copySplitFile(
            splitPath(dirPathAttempts, `${gameName}-${starterName}-${file_name}-simple.csv`),
            splitPath(dirPathFinishes, `${gameName}-${starterName}-${finished_run_count}-simple.csv`)),
        copySplitFile(
            splitPath(dirPathAttempts, `${gameName}-${starterName}-${file_name}-full.csv`),
            splitPath(dirPathFinishes, `${gameName}-${starterName}-${finished_run_count}-full.csv`)),
        copySplitFile(
            splitPath(dirPathAttempts, `${gameName}-${starterName}-${file_name}.csv`),
            splitPath(dirPathFinishes, `${gameName}-${starterName}-${finished_run_count}.csv`)),
    ]);
}

export function transition(fn, ms) {
    return new Promise((resolve) => {
        const T = performance.now()
        function step() {
            const t = performance.now() - T
            fn(Math.min(t / ms, 1))
            if (t < ms) requestAnimationFrame(step)
            else resolve()
        }
        requestAnimationFrame(step)
    })
}

/**
 * The legacy `loadCsvFile` (the file picker behind "Load Splits"), verbatim: the File
 * System Access API is Chromium's, not Node's, so it needs nothing from the shell.
 */
export async function loadCsvFile() {
    const file = await window.showOpenFilePicker({
        id: "SplitsFolder",
        types: [{
            description: "Split files",
            accept: { "text/csv": [".csv"] }
        }]
    });
    const contents = await file[0].getFile();
    const text = await contents.text();
    return text;
}
