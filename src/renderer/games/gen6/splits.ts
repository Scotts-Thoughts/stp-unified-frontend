import { appendSplitCsv, copySplitFile, splitPath } from "~/core/persistence/splitFiles";

/**
 * The 3DS overlay's split files: one simple CSV per run, in gen 5's layout and with its header
 * (docs/external-contracts.md §5):
 *
 *   splits/<Game>/<Species or Line>/<Species or Line>-<attempt>.csv
 *   splits/<Game>/refilmed/<...>/...            re-filming mode
 *   splits/<Game>/<...>/test_runs/...           test runs
 *   .../finishes/<finish name>-<finished run>.csv   a copy when the run ends
 *
 * `<Game>` is the mapper's game name ("X and Y"), as gen 5's folders are its game names.
 */
export const SPLIT_HEADER = "player_name,pokemon,trainer_name,real_time_hmmss,resets,blackouts,level,game_time,battle_duration,move1,move2,move3,move4,\n";

export interface SplitTarget {
    game: string;
    /** The species, or "<FullyEvolved>-line" with Evolution on. */
    fileName: string;
    attempt: number | string;
    testRun: boolean;
    refilming: boolean;
}

function attemptsFolder(target: SplitTarget): string {
    return target.refilming ? splitPath(target.game, "refilmed", target.fileName) : splitPath(target.game, target.fileName);
}

/** Appends one row to the run's split file. */
export function logData(target: SplitTarget, row: string): Promise<void> {
    const dir = target.testRun ? splitPath(target.game, target.fileName, "test_runs") : attemptsFolder(target);
    return appendSplitCsv(splitPath(dir, `${target.fileName}-${target.attempt}.csv`), SPLIT_HEADER, row);
}

/** Copies the finished run's file into `finishes/`, named after the species in hand. */
export function logCopy(target: SplitTarget, finishedRunCount: number | string, finishName: string): Promise<void> {
    const dir = attemptsFolder(target);
    return copySplitFile(
        splitPath(dir, `${target.fileName}-${target.attempt}.csv`),
        splitPath(dir, "finishes", `${finishName || target.fileName}-${finishedRunCount}.csv`));
}

/** The file picker behind "Load Splits" is core's (`core/logic/splitComparison.ts`). */
