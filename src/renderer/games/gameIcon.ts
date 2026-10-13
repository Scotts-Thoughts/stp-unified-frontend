import type { ModuleManifest } from "~/core/game/ModuleManifest";
import type { MapperProfile } from "~/core/mapper/MapperProfile";

/**
 * The taskbar icon for the cartridge that is loaded.
 *
 * A manifest lists its mappers and its game names in the same order, so the profile
 * that matched is the game, and that game's edition names the file under
 * `resources/icons/`. Red and Blue are two editions of one mapper, so the edition
 * the user picked chooses between them. Every other game has one icon; a pair
 * (Gold & Silver, FireRed and LeafGreen, Diamond and Pearl, HeartGold and SoulSilver)
 * shares the first game's cartridge, as the old apps did.
 */
export function iconForDetection(manifest: ModuleManifest, profile: MapperProfile, editionName: string | null): string | null {
    const index = manifest.mappers.findIndex((mapper) => mapper.id === profile.id);
    const gameName = index >= 0 ? manifest.games[index] : null;
    const editions = gameName ? manifest.editions.filter((edition) => edition.game === gameName) : [];
    if (editions.length === 0) return null;
    const picked = editionName ? editions.find((edition) => edition.name === editionName) : undefined;
    return (picked ?? editions[0]).icon;
}
