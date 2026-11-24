/**
 * Type colours for the move-stats screen: the overlay's default type palette
 * (`games/gen4/data/default_colors.js`), copied here because `core/` doesn't import a
 * generation and the start screen has no generation loaded.
 */
const TYPE_COLOURS: Record<string, string> = {
    Normal: "#a8a878",
    Fighting: "#c03028",
    Grass: "#78c850",
    Fire: "#f08030",
    Water: "#6890f0",
    Electric: "#f3d230",
    Ground: "#e0c068",
    Rock: "#b8a038",
    Psychic: "#f85888",
    Poison: "#a040a0",
    Flying: "#a890f0",
    Bug: "#a8b820",
    Ice: "#98d8d8",
    Ghost: "#705898",
    Dragon: "#7038f8",
    Steel: "#b8b8d0",
    Dark: "#705848",
    Fairy: "#ee99ac",
    Curse: "#2e9fa3",
};

export function typeColour(type: string | null | undefined): string {
    if (!type) return "#68686a";
    const key = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
    return TYPE_COLOURS[key] ?? "#68686a";
}
