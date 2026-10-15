/**
 * The trainer preview (docs/ui-uniformity-plan.md decision 14): the right panel's "Trainers" mode shows the team of a
 * trainer the operator picks, in the generation's enemy team panel (core/overlay/EnemyTeamPanel.ts), before the
 * battle. This file reads the generations' trainer tables into one shape and builds the picker's options; each
 * generation's `games/genN/enemyPanel.ts` turns a `PreviewTrainer` into its panel's view.
 *
 * The trainer tables: gen1 `data/trainers/`, gen2 `crystal_trainers.js`, gen3 `emerald_trainers.js` /
 * `firered_leafgreen_trainers.js`, gen4 `data/trainers/` (one per edition), gen5 `trainers_black.js` (Black and White;
 * there is no table for Black 2 / White 2).
 */
import type { ChoiceOption } from "~/core/settings/types";

export interface PreviewStats {
    hp: unknown;
    attack: unknown;
    defense: unknown;
    special_attack: unknown;
    special_defense: unknown;
    speed: unknown;
}

export interface PreviewPokemon {
    species: string;
    level: unknown;
    ability?: unknown;
    moves: string[];
    stats: PreviewStats;
}

export interface PreviewTrainer {
    name: string;
    /** The panel's header as shown, in place of the one each generation builds from `name` (the wild panel's "Wild Pidgey"). */
    header?: string;
    party: PreviewPokemon[];
}

/** The table shape of gens 1, 2, 4 and gen5's Black/White table. */
export interface TrainerEntry {
    name?: string;
    trainer_class?: string;
    location?: string | null;
    party?: { species: string; level: unknown; ability?: unknown; stats?: Partial<PreviewStats>; moves?: string[] }[];
}

/** gen3's table shape (pokeemerald / pokefirered trainer parties with the stats worked out). */
export interface Gen3TrainerEntry {
    trainer_name?: string;
    trainer_location?: string | null;
    pokemon?: { species: string; level: unknown; ability?: unknown; hp: unknown; atk: unknown; def: unknown; spa: unknown; spd: unknown; spe: unknown; moves?: string[] }[];
}

const STAT_KEYS = ["hp", "attack", "defense", "special_attack", "special_defense", "speed"] as const;

/** A trainer of the common table shape; `name` overrides the table's name (gen5 builds "Youngster Jimmy"). */
export function previewOf(entry: TrainerEntry | undefined | null, name?: string): PreviewTrainer | null {
    if (!entry?.party?.length) return null;
    return {
        name: name ?? entry.name ?? "",
        party: entry.party.map((mon) => ({
            species: mon.species,
            level: mon.level,
            ability: mon.ability,
            moves: (mon.moves ?? []).filter(Boolean),
            stats: Object.fromEntries(STAT_KEYS.map((key) => [key, mon.stats?.[key]])) as unknown as PreviewStats,
        })),
    };
}

/** A gen3 trainer. */
export function gen3PreviewOf(entry: Gen3TrainerEntry | undefined | null): PreviewTrainer | null {
    if (!entry?.pokemon?.length) return null;
    return {
        name: entry.trainer_name ?? "",
        party: entry.pokemon.map((mon) => ({
            species: mon.species,
            level: mon.level,
            ability: mon.ability,
            moves: (mon.moves ?? []).filter(Boolean),
            stats: { hp: mon.hp, attack: mon.atk, defense: mon.def, special_attack: mon.spa, special_defense: mon.spd, speed: mon.spe },
        })),
    };
}

/**
 * The picker's options: every trainer with a team, in table order. The value is the table key (what is saved); the
 * label is the trainer's name, the key when it says more than the name (gen2's "Falkner 1", gen4's id), and the place.
 */
export function trainerOptions(table: Record<string, unknown> | undefined | null, name: (entry: any) => string | undefined, location: (entry: any) => string | null | undefined, hasTeam: (entry: any) => boolean): ChoiceOption[] {
    if (!table) return [];
    const options: ChoiceOption[] = [];
    for (const [key, entry] of Object.entries(table)) {
        if (!hasTeam(entry)) continue;
        const shown = name(entry) || key;
        const place = location(entry);
        options.push({ value: key, label: (shown === key ? shown : `${shown} [${key}]`) + (place ? ` (${place})` : "") });
    }
    return options;
}

/** The options whose label holds `search` (any case); all of them for an empty search. */
export function searchTrainers(options: readonly ChoiceOption[], search: string | null | undefined): ChoiceOption[] {
    const needle = (search ?? "").toLowerCase();
    if (needle === "") return [...options];
    return options.filter((option) => (option.label ?? String(option.value)).toLowerCase().includes(needle));
}
