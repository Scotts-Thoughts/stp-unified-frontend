import { appendSplitCsv, copySplitFile, splitPath } from "~/core/persistence/splitFiles";

/**
 * gen2's `logData`, `logCopy` and `transition` (the helpers above its component in
 * `frontend.js`), on the splits IPC instead of `require("fs")` (plan 2.4 / 1.6).
 *
 * Generated from the legacy source by the port script. Since 2026-10-14 only the simple
 * CSV is written, named `<letter>-<test_run_>?<Species>-<N>.csv` (no `-simple`); the full
 * and deprecated CSVs are gone. The folders are still gen2's, including known-legacy-bugs.md #2:
 * `logData` hardcodes `Crystal/` for *attempts* while `logCopy` uses the selected
 * game's folder for *finishes*, so a Gold & Silver run's attempt files land under
 * `Crystal/` and its finished copies under `Gold & Silver/`. Preserved.
 *
 * The legacy `logData` resolved after the append (or after logging an error);
 * `appendSplitCsv` does the same, through one ordered queue.
 */
export function logData(gameName, str, file_name, starter, testStatus, refilming_mode) {
        const dirPath = refilming_mode ? splitPath("Crystal", starter, "refilmed", "attempts") : splitPath("Crystal", starter, "attempts");
        const testStatusText = testStatus ? "test_run_" : "";
        const filePath = splitPath(dirPath, `${gameName}-${testStatusText}${starter}-${file_name}.csv`);
        const header = "player_name,pokemon,trainer_name,real_time_hmmss,resets,blackouts,level,game_time," +
            "battle_duration,move1,move2,move3,move4\n";
        return appendSplitCsv(filePath, header, str);
}

export function logCopy(gameName, gameName_Path, file_name, starterName, finished_run_count, refilming_mode) {
    var dirPathAttempts = refilming_mode ? splitPath(gameName_Path, starterName, "refilmed", "attempts") : splitPath(gameName_Path, starterName, "attempts")
    var dirPathFinishes = refilming_mode ? splitPath(gameName_Path, starterName, "refilmed", "finishes") : splitPath(gameName_Path, starterName, "finishes")
    return copySplitFile(
        splitPath(dirPathAttempts, `${gameName}-${starterName}-${file_name}.csv`),
        splitPath(dirPathFinishes, `${gameName}-${starterName}-${finished_run_count}.csv`));
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
