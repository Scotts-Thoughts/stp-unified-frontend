/**
 * gen4's alternate-form table, the shape of gen5's `forms.js`.
 *
 * The DS mappers report a party member by species name and keep its form in a separate byte
 * (`player.team.0.flags.alternate_forms`, byte 0x40 bits 3-7), so every cloaked Wormadam arrives
 * as a bare "Wormadam". Each form is its own pokedex entry (own base stats, types, movepool and
 * style storage key), so the overlay translates at every boundary that talks to the game: a bare
 * species name is resolved back to a form, and a form picked in the Solo Pokemon dropdown is
 * stamped onto the party's form byte. Keyed by the mapper's species name; each form maps its
 * pokedex key to the game's form index.
 *
 * Rotom, Giratina, Shaymin and Deoxys also carry a form byte and their forms are keyed in the
 * gen4 dexes ("Rotom (Heat)", "Giratina (Altered)", ...), but the overlay has neither per-form
 * art nor a bare-name alias for them, so a bare "Giratina" stays "Giratina" for now. Adding a
 * species here is a data change once its art is in place.
 */
export const POKEMON_FORMS = {
    "Wormadam": { "Wormadam (Plant)": 0, "Wormadam (Sandy)": 1, "Wormadam (Trash)": 2 },
};

// Flat pokedex key -> { base, form } lookup, so `species in POKEMON_FORM_INFO` doubles as
// "does this species have forms?" and the base species is one property away
export const POKEMON_FORM_INFO = {};
for (const [base, forms] of Object.entries(POKEMON_FORMS)) {
    for (const [species, form] of Object.entries(forms)) {
        POKEMON_FORM_INFO[species] = { base, form };
    }
}

// The pokedex key a bare species name means when the game holds the default form (byte 0):
// "Wormadam" -> "Wormadam (Plant)". Species whose default form is keyed by the bare name are
// left out (the alias would be the identity).
export const DEFAULT_FORM_ALIASES = {};
for (const [base, forms] of Object.entries(POKEMON_FORMS)) {
    const default_form = Object.keys(forms).find(species => forms[species] === 0);
    if (default_form && default_form !== base) DEFAULT_FORM_ALIASES[base] = default_form;
}
