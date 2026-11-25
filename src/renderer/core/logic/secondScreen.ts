/**
 * The Right Panel Layout setting of the DS generations (gens 4-5, Scott 2026-11-24): Historical, Webcam or Secondary
 * Screen. Gens 1-3 keep Webcam Mode as a plain switch.
 *
 * Saved as two switches, so no saved key changes: `webcam_mode` (Webcam Mode, `core/logic/webcamMode.ts`) and
 * `second_screen_mode` (gen5's old Second Screen Mode key, reused; added to gen4). The dropdown never sets both; an old
 * save with both on reads as Secondary Screen.
 *
 * Secondary Screen shortens the right panel exactly as Webcam Mode does (every panel stops at `WEBCAM_FRAME_BOTTOM`)
 * and draws a green area for the DS's second screen under it, in the game area's look
 * (`images/genN/ui/second_screen_game_area.svg`: inner edge x 1486, y 747, 420×315 on whole pixels, exactly 4:3). The movepool then
 * follows the rules below instead of Webcam Mode's "never any tutor rows".
 */

export const RIGHT_PANEL_LAYOUTS = ["Historical", "Webcam", "Secondary Screen"] as const;
export type RightPanelLayout = (typeof RIGHT_PANEL_LAYOUTS)[number];

/** The layout two saved switches stand for. */
export function rightPanelLayout(webcamMode: unknown, secondScreenMode: unknown): RightPanelLayout {
    if (secondScreenMode === true) return "Secondary Screen";
    return webcamMode === true ? "Webcam" : "Historical";
}

/** The two switches for a layout. */
export function layoutSwitches(layout: RightPanelLayout): { webcam_mode: boolean; second_screen_mode: boolean } {
    return { webcam_mode: layout === "Webcam", second_screen_mode: layout === "Secondary Screen" };
}

/** In Secondary Screen, tutor rows show (when their switch is on) only while the whole list stays this short. */
export const SECOND_SCREEN_TUTOR_LIMIT = 45;

/** In Secondary Screen, a list of more level-up and TM/HM rows than this shows one of the two (`secondScreenPart`). */
export const SECOND_SCREEN_SPLIT_LIMIT = 75;

export type MovepoolPart = "all" | "level" | "machines";

/**
 * Which rows a Secondary Screen movepool shows (Scott, 2026-11-24). With more than `SECOND_SCREEN_SPLIT_LIMIT`
 * level-up and TM/HM rows, only one list: the level-up list while the lead Pokémon is at a level it learns a move at,
 * or one level below one; the TM/HM list at any other level. An unknown level (no Pokémon yet) shows the level-up list.
 *
 * `levels` are the level-up rows' levels as the data has them (numbers or numeric strings; anything else is ignored).
 */
export function secondScreenPart(levelRows: number, machineRows: number, levels: readonly unknown[], level: unknown): MovepoolPart {
    if (levelRows + machineRows <= SECOND_SCREEN_SPLIT_LIMIT) return "all";
    const current = Number(level);
    if (!Number.isFinite(current) || current <= 0) return "level";
    const learnAt = new Set(levels.map(Number).filter((n) => Number.isFinite(n) && n > 0));
    return learnAt.has(current) || learnAt.has(current + 1) ? "level" : "machines";
}

/** The movepool's title for a part. */
export function movepoolTitle(part: MovepoolPart): string {
    return part === "level" ? "Level-Up Moves" : part === "machines" ? "TM/HM Moves" : "Movepool";
}
