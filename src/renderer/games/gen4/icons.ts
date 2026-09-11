/**
 * gen4's game -> taskbar icon table, moved out of its `main.js` (`gameIconFile`),
 * where the renderer's `set-game-icon` message was resolved (plan 3.4). The files are
 * gen4's own `.ico`s under resources/icons/gen4/; the shell's channel takes the path
 * relative to resources/icons/.
 */
export function gen4GameIcon(game: string): string {
    switch (game) {
        case 'Platinum':
            return 'gen4/icon-platinum.ico';
        case 'Diamond and Pearl':
            return 'gen4/icon-diamond.ico';
        case 'HeartGold and SoulSilver':
            return 'gen4/icon-heartgold.ico';
        default:
            return 'gen4/icon.ico';
    }
}
