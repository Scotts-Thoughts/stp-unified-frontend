import type { Ivs } from "~/core/logic/starterIvs";
import type { DexEntry, GameData } from "./data";
import { abilityId } from "./logic/abilityIds";
import { expCurve } from "~/core/logic/expCurve";
import { checksumOk, decrypt, encrypt, keepsChoices, matchesStamp, readFields, stampStarter, STORED_SIZE, PARTY_STATS_SIZE, type NatureMods, type SpeciesSwap, type StarterStamp } from "./logic/pk6";

/**
 * The starter write of the 3DS overlay (gens 6 and 7), as gens 3-5 have it: once the run's first Pokemon is in the
 * party, it becomes the Solo Pokemon (species, its moves by that level, its exp curve, its name), its nature, ability,
 * gender and IVs become the ones picked in the settings panel, and its stats are worked out again from them. The games are unpatched, so the write goes straight into the party in memory:
 *
 *   1. read the lead as memory holds it (`player.encrypted_mon_0`, 232 bytes, and `_stats`, 28 bytes; mapper 0.2.0)
 *      and decrypt it here; a checksum that does not add up stops the write (the read caught the game mid-change);
 *   2. stamp the choices into the decrypted Pokemon (logic/pk6.ts `stampStarter`);
 *   3. encrypt it again with its checksum worked out, and check the result decrypts back to the stamp;
 *   4. write each part whole, the stored bytes first (a partial or torn write is what turns a Pokemon into a Bad Egg);
 *   5. read it back until memory holds exactly the bytes written, decrypted with a good checksum, else report.
 *
 * Only out of battle: a battle keeps its own copy of the party and writes it back when it ends, so a stamp made
 * during a battle is undone (seen headlessly in Ultra Moon, tools/gen6/starter-write-test.ts). Plain TS, no Vue.
 */

export interface StarterChoice {
    nature: string;
    /** The ability's name, as the settings panel offers it (one of the species' abilities or its hidden one). */
    ability: string;
    gender: "Male" | "Female";
    ivs: Ivs;
    /**
     * The species the starter becomes (the Solo Pokemon), as the earlier generations' starter choice does; null or
     * the lead's own species keeps it. A form ("Lycanroc (Midnight)") is written as its base species.
     */
    species?: string | null;
}

export type WriteOutcome =
    | { ok: true; written: boolean; message: string }
    | { ok: false; message: string };

interface ByteProp {
    bytes?: ArrayLike<number> | null;
    setBytes?: (bytes: number[], freeze?: boolean) => Promise<unknown> | unknown;
}

/** Gender as the PK6 field stores it, from the species' ratio (0 always male, 254 always female, 255 genderless). */
export function genderValue(entry: DexEntry | null | undefined, wanted: "Male" | "Female"): 0 | 1 | 2 {
    const ratio = Number(entry?.gender_ratio);
    if (ratio === 255) return 2;
    if (ratio === 254) return 1;
    if (ratio === 0) return 0;
    return wanted === "Female" ? 1 : 0;
}

/** The ability's slot on its species: 0 or 1 for the regular ones, 2 for the hidden one. */
export function abilitySlot(entry: DexEntry | null | undefined, ability: string): 0 | 1 | 2 {
    const regular = entry?.abilities ?? [];
    const index = regular.indexOf(ability);
    if (index === 1) return 1;
    if (index === 0) return 0;
    return entry?.hidden_ability === ability ? 2 : 0;
}

/** The species' entry for a PK6 species number: the picked Solo Pokemon when it is that species (forms keep their own stats). */
export function entryForSpecies(tables: GameData, speciesId: number, preferred: string | null): DexEntry | null {
    const preferredEntry = preferred ? tables.pokedex[preferred] : undefined;
    if (preferredEntry && preferredEntry.national_dex_number === speciesId) return preferredEntry;
    // A form is its own entry named "Species (Form)"; the plain name is the base form.
    const all = Object.values(tables.pokedex).filter((e) => e.national_dex_number === speciesId);
    return all.find((e) => !e.species.includes(" (")) ?? all[0] ?? null;
}

/** The base form's entry for a species or form name ("Lycanroc (Midnight)" -> "Lycanroc"). */
function baseEntry(tables: GameData, name: string): DexEntry | null {
    const entry = tables.pokedex[name];
    if (!entry) return null;
    if (!name.includes(" (")) return entry;
    return tables.pokedex[name.slice(0, name.indexOf(" ("))] ?? entry;
}

/**
 * The species swap for a Pokemon of `level` becoming `entry`: experience at the start of the level on its growth
 * rate, the last four moves it learns by then (as a wild or gift Pokemon gets them), and its name.
 */
export function swapFor(tables: GameData, entry: DexEntry, level: number): SpeciesSwap | { error: string } {
    const curve = expCurve(entry.growth_rate);
    if (!curve) return { error: `${entry.species} has no growth rate` };
    const learned: string[] = [];
    for (const [at, move] of [...(entry.level_up_learnset ?? [])].sort((a, b) => a[0] - b[0])) {
        if (at > level) break;
        const i = learned.indexOf(move);
        if (i >= 0) learned.splice(i, 1);
        learned.push(move);
    }
    const moves = learned.slice(-4).map((name) => ({ name, move: tables.moves[name] }));
    const missing = moves.find((m) => !m.move || !Number.isFinite(m.move.rom_id));
    if (missing) return { error: `${entry.species}'s move "${missing.name}" is not in the move table` };
    if (!moves.length) return { error: `${entry.species} learns no move by level ${level}` };
    return {
        species: entry.national_dex_number,
        exp: curve[Math.max(0, level - 1)],
        moves: moves.map((m) => ({ id: m.move.rom_id, pp: m.move.pp ?? 0 })),
        name: entry.species.includes(" (") ? entry.species.slice(0, entry.species.indexOf(" (")) : entry.species,
    };
}

/** What the write will put in, for one decrypted Pokemon; null (with the reason) when it can't be worked out. */
export function stampFor(tables: GameData, natures: Record<string, NatureMods & { modulo_value: number }>, decrypted: Uint8Array, choice: StarterChoice, preferred: string | null): { stamp: StarterStamp; entry: DexEntry } | { error: string } {
    const fields = readFields(decrypted);
    const target = choice.species ? baseEntry(tables, choice.species) : null;
    if (choice.species && !target) return { error: `"${choice.species}" is not in the Pokedex` };
    let swap: SpeciesSwap | undefined;
    if (target && target.national_dex_number !== fields.species) {
        const built = swapFor(tables, target, fields.level);
        if ("error" in built) return built;
        swap = built;
    }
    const entry = swap ? target : entryForSpecies(tables, fields.species, preferred);
    if (!entry) return { error: `species ${fields.species} is not in the Pokedex` };
    const nature = natures[choice.nature];
    if (!nature) return { error: `"${choice.nature}" is not a nature` };
    // The ability must be one this species can have; otherwise keep its first.
    const abilities = [...(entry.abilities ?? []), ...(entry.hidden_ability ? [entry.hidden_ability] : [])];
    const ability = abilities.includes(choice.ability) ? choice.ability : (entry.abilities?.[0] ?? choice.ability);
    const id = abilityId(ability);
    if (id === null) return { error: `"${ability}" has no ability id` };
    return {
        entry,
        stamp: {
            nature: nature.modulo_value,
            natureMods: nature,
            abilityId: id,
            abilitySlot: abilitySlot(entry, ability),
            gender: genderValue(entry, choice.gender),
            ivs: choice.ivs,
            baseStats: entry.base_stats,
            shedinja: entry.species === "Shedinja",
            swap,
        },
    };
}

const same = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.prototype.every.call(a, (x: number, i: number) => x === b[i]);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Writes the starter into the party's lead. `force` writes even when the lead already holds the choices (the
 * settings panel's button: its stats are worked out again); without it a lead that already has them is left alone.
 */
export async function writeStarter(opts: {
    props: any;
    tables: GameData;
    natures: Record<string, NatureMods & { modulo_value: number }>;
    choice: StarterChoice;
    preferred: string | null;
    force?: boolean;
    /** How long to wait for the read-back (the mapper's poll). */
    timeoutMs?: number;
}): Promise<WriteOutcome> {
    const P = opts.props;
    const storedProp: ByteProp | undefined = P.player?.encrypted_mon_0;
    const statsProp: ByteProp | undefined = P.player?.encrypted_mon_0_stats;
    if (!storedProp?.setBytes || !statsProp?.setBytes) {
        return { ok: false, message: "the mapper has no player.encrypted_mon_0 (run tools/mappers/make-3ds-mappers.py for mapper 0.2.0)" };
    }
    if (P.battle?.in_battle?.value === true) return { ok: false, message: "in battle: the battle would undo the write" };
    const stored = storedProp.bytes ? Array.from(storedProp.bytes) : [];
    const stats = statsProp.bytes ? Array.from(statsProp.bytes) : [];
    if (stored.length < STORED_SIZE || stats.length < PARTY_STATS_SIZE) return { ok: false, message: "no lead Pokemon bytes yet" };
    if ((stored[0] | stored[1] | stored[2] | stored[3]) === 0) return { ok: false, message: "the lead slot is empty" };

    const before = decrypt(stored, stats);
    if (!checksumOk(before)) return { ok: false, message: "the lead's checksum does not add up as read (the game was changing it); nothing written" };
    const fields = readFields(before);
    if (fields.isEgg) return { ok: false, message: "the lead is an egg; nothing written" };

    const built = stampFor(opts.tables, opts.natures, before, opts.choice, opts.preferred);
    if ("error" in built) return { ok: false, message: built.error };
    // Without force, a lead that already has the species and the choices is left alone (its stats, exp and moves may
    // rightly have moved on since: EVs, a level-up, a new move).
    if (!opts.force && keepsChoices(before, built.stamp)) return { ok: true, written: false, message: `${built.entry.species} already has these values` };

    const stamped = stampStarter(before, built.stamp);
    const out = encrypt(stamped);
    // The bytes about to go out must decrypt to the stamp with a good checksum, or nothing is written.
    const check = decrypt(out.stored, out.stats);
    if (!checksumOk(check) || !matchesStamp(check, built.stamp)) return { ok: false, message: "the encrypted Pokemon did not check out; nothing written" };

    await storedProp.setBytes(out.stored, false);
    await statsProp.setBytes(out.stats, false);

    // Read back until memory holds what was written (the mapper polls), then check it once more.
    const deadline = Date.now() + (opts.timeoutMs ?? 4000);
    for (;;) {
        const nowStored = storedProp.bytes ? Array.from(storedProp.bytes) : [];
        const nowStats = statsProp.bytes ? Array.from(statsProp.bytes) : [];
        if (same(nowStored, out.stored) && same(nowStats, out.stats)) {
            const back = decrypt(nowStored, nowStats);
            if (!checksumOk(back)) return { ok: false, message: "read back with a bad checksum" };
            return { ok: true, written: true, message: `${built.entry.species}${built.stamp.swap ? " (species set)" : ""}: ${opts.choice.nature}, ${opts.choice.ability}, IVs ${[built.stamp.ivs.hp, built.stamp.ivs.atk, built.stamp.ivs.def, built.stamp.ivs.spa, built.stamp.ivs.spd, built.stamp.ivs.spe].join("/")} written and read back` };
        }
        // The game changed the Pokemon itself since (it decrypts with a good checksum and keeps the stamp): fine too.
        if (nowStored.length >= STORED_SIZE && nowStats.length >= PARTY_STATS_SIZE && !same(nowStored, stored)) {
            const back = decrypt(nowStored, nowStats);
            if (checksumOk(back) && keepsChoices(back, built.stamp)) return { ok: true, written: true, message: `${built.entry.species}: written; the game has already rewritten it with the new values` };
        }
        if (Date.now() > deadline) return { ok: false, message: "the write was sent but memory did not show it within the read-back time" };
        await sleep(50);
    }
}
