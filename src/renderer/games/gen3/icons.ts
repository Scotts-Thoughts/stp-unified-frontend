/**
 * gen3's game -> taskbar icon table, moved out of its `main.js` (`gameIconFile`),
 * where the renderer's `set-game-icon` message was resolved (plan 3.4). The files are
 * gen3's own `.ico`s under resources/icons/gen3/; the shell's channel takes the path
 * relative to resources/icons/.
 */
export function gen3GameIcon(game: string): string {
    switch (game) {
        case 'Emerald':
            return 'gen3/icon-emerald.ico';
        case 'FireRed and LeafGreen':
            return 'gen3/icon-firered.ico';
        default:
            return 'gen3/icon.ico';
    }
}
