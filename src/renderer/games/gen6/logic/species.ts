import type { DexEntry, GameData } from "../data";

/**
 * Species and move names as the tables key them.
 *
 * The 3DS mappers' own tables are fixed by `tools/mappers/make-3ds-mappers.py` (mapper version 0.1.0), after which
 * a name from the mapper is the table's key. The stock 0.0.2 files spell seven species and a few dozen moves and
 * abilities the gen 4 way; those spellings are folded here too, so an unpatched mapper (a Poke-A-Byte mapper update
 * puts the stock files back) costs the names past gen 4, not the overlay.
 */
const SPECIES_ALIASES: Record<string, string> = {
    "Nidoran-F": "Nidoran♀", "Nidoran-M": "Nidoran♂", "Farfetch'd": "Farfetch’d", Qwillfish: "Qwilfish", "Ho-oh": "Ho-Oh",
    Treeko: "Treecko", Flabebe: "Flabébé",
};
const MOVE_ALIASES: Record<string, string> = {
    DoubleSlap: "Double Slap", ThunderPunch: "Thunder Punch", ViceGrip: "Vise Grip", "Vice Grip": "Vise Grip", "Sand-Attack": "Sand Attack",
    SonicBoom: "Sonic Boom", BubbleBeam: "Bubble Beam", SolarBeam: "Solar Beam", PoisonPowder: "Poison Powder",
    ThunderShock: "Thunder Shock", SmokeScreen: "Smokescreen", Selfdestruct: "Self-Destruct", Softboiled: "Soft-Boiled",
    "Hi Jump Kick": "High Jump Kick", "Faint Attack": "Feint Attack", "Lock On": "Lock-On", DynamicPunch: "Dynamic Punch",
    DragonBreath: "Dragon Breath", ExtremeSpeed: "Extreme Speed", AncientPower: "Ancient Power", SmellingSalt: "Smelling Salts",
    FeatherDance: "Feather Dance", GrassWhistle: "Grass Whistle", "Roar Of Time": "Roar of Time",
};
const ABILITY_ALIASES: Record<string, string> = { Compoundeyes: "Compound Eyes", Lightningrod: "Lightning Rod" };

const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

export function speciesName(value: unknown): string | null {
    const name = text(value);
    return name === null ? null : (SPECIES_ALIASES[name] ?? name);
}

export function moveName(value: unknown): string | null {
    const name = text(value);
    return name === null ? null : (MOVE_ALIASES[name] ?? name);
}

export function abilityName(value: unknown): string | null {
    const name = text(value);
    return name === null ? null : (ABILITY_ALIASES[name] ?? name);
}

export function dexEntry(data: GameData, species: unknown): DexEntry | null {
    const name = speciesName(species);
    return name === null ? null : (data.pokedex[name] ?? null);
}

/** The species' picture, or a transparent pixel while there is no species. */
const BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
export function speciesArtPath(data: GameData, species: unknown): string {
    const name = speciesName(species);
    return (name !== null && data.speciesArt[name]) || BLANK;
}

/** The members of the species' evolution line, base first. A species with no line is its own. */
export function evolutionFamily(data: GameData, species: unknown): string[] {
    const name = speciesName(species);
    if (name === null) return [];
    const family = data.pokedex[name]?.evolution_family?.map((member) => member.species).filter((s): s is string => !!s) ?? [];
    return family.length ? family : [name];
}

/** The last member of the species' line (what a line's split files are named after). */
export function fullyEvolved(data: GameData, species: unknown): string | null {
    const family = evolutionFamily(data, species);
    return family.length ? family[family.length - 1] : speciesName(species);
}

/** Every species and form the game's Pokedex has, for the solo picker. */
export function speciesList(data: GameData): string[] {
    return Object.keys(data.pokedex);
}

/** The first of a species' two types when they differ, else its only type: the colour the panels' headers take. */
export function headerType(entry: DexEntry | null): string {
    return (entry?.type_1 ?? "Normal").toLowerCase();
}
