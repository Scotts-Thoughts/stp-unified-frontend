/**
 * gen5's game -> taskbar icon table, moved out of its `main.js` (`gameIconFile`),
 * where the renderer's `set-game-icon` message was resolved (plan 3.4). The files are
 * gen5's own `.ico`s under resources/icons/gen5/; the shell's channel takes the path
 * relative to resources/icons/.
 */
export function gen5GameIcon(game: string): string {
    switch (game) {
        case 'Black':
            return 'gen5/icon-black.ico';
        case 'White':
            return 'gen5/icon-white.ico';
        case 'Black 2':
            return 'gen5/icon-black2.ico';
        case 'White 2':
            return 'gen5/icon-white2.ico';
        default:
            return 'gen5/icon-black.ico';
    }
}
