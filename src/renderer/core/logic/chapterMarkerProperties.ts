/**
 * The OBS chapter markers hook mapper properties by path when the overlay mounts. If the
 * mapper PokeAByte has loaded is missing one of them, that marker silently never fires
 * for the whole session (e.g. pokemon_emerald_ne.xml without battle.trainer.party_position
 * => no "Next Pokemon" markers). Shout about it.
 *
 * Lifted from gen3's `checkMapperForChapterMarkerProperties` (its 2026-09 working tree,
 * on top of `d3b7648`); the mapper-client walk is shared, the table of required paths is
 * each generation's own -- gens 3-5 hook different properties (see each Overlay.vue's
 * `checkMapperForChapterMarkerProperties`).
 *
 * @param game     the GameHookMapperClient (`this.game` in the overlays)
 * @param required mapper path => what stops working without it
 */
export function checkMapperForChapterMarkerProperties(game: any, required: Record<string, string>): void {
    const meta = game?.meta || {};
    // PokeAByte reports the file path too - the two "deprecated" Emerald mappers share a name and id.
    console.log(`[OBS chapter marker] Mapper loaded: ${meta.path ?? '?'} - ${meta.gameName ?? '?'} (${meta.id ?? 'no id'})`);
    for (const [path, purpose] of Object.entries(required)) {
        if (!game?._propertiesMap?.has(path)) {
            console.error(`[OBS chapter marker] Loaded mapper has no "${path}" property - ${purpose} will NOT be recorded this session. Load the current STP mapper in PokeAByte.`);
        }
    }
}
