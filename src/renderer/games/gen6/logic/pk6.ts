import type { Ivs } from "~/core/logic/starterIvs";

/**
 * A party Pokemon of gens 6 and 7 (PK6/PK7: X/Y, OR/AS, Sun/Moon, Ultra Sun/Ultra Moon) as the games keep it in
 * memory, and the one write the 3DS overlay makes: the starter's nature, ability, gender and IVs (docs/gen6-inventory.md,
 * "Writing the starter").
 *
 * Layout, the same in all four games (PKHeX's PK6/PK7, checked against the four mappers' own decryption):
 *   - 0x000-0x0E7, the stored data (232 bytes). 0x00 the encryption constant (EC), 0x06 the checksum, then four
 *     56-byte blocks from 0x08, shuffled by `(EC >> 13) & 31` and XORed with the LCRNG seeded by the EC. The checksum
 *     is the sum of the decrypted 16-bit words 0x08-0xE7. A checksum that does not add up is what makes the game
 *     show a Bad Egg, so a write always replaces these 232 bytes in one piece.
 *   - the party stats (28 bytes: status, level, current HP, the six stats), XORed with the LCRNG seeded by the EC
 *     again from its start. In the decrypted Pokemon they are 0xE8-0x103; in memory they sit at slot + 0x158, after
 *     0x70 bytes of something else (a party slot is 484 bytes apart), so they are read and written on their own.
 *
 * Decrypted offsets used here: 0x08 species, 0x14 ability, 0x15 ability number (1, 2, or 4 for the hidden one),
 * 0x1C nature, 0x1D flags (bit 0 fateful encounter, bits 1-2 gender 0/1/2, bits 3-7 form), 0x1E-0x23 EVs
 * (HP, Atk, Def, Spe, SpA, SpD), 0x74 the IVs (5 bits each in that order; bit 30 egg, bit 31 nicknamed),
 * 0xEC level, 0xF0 current HP, 0xF2-0xFC max HP, Atk, Def, Spe, SpA, SpD.
 */

export const STORED_SIZE = 0xe8;
export const PARTY_STATS_SIZE = 0x1c;
export const PARTY_SIZE = STORED_SIZE + PARTY_STATS_SIZE;
/** Where the party stats are in memory, from the start of the party slot. */
export const RAM_STATS_OFFSET = 0x158;
const BLOCK = 56;
const HEADER = 8;

/** PKHeX's block order table: decrypted block `b` is encrypted block `BLOCK_POSITION[sv * 4 + b]`. */
const BLOCK_POSITION = [
    0, 1, 2, 3, 0, 1, 3, 2, 0, 2, 1, 3, 0, 3, 1, 2, 0, 2, 3, 1, 0, 3, 2, 1,
    1, 0, 2, 3, 1, 0, 3, 2, 2, 0, 1, 3, 3, 0, 1, 2, 2, 0, 3, 1, 3, 0, 2, 1,
    1, 2, 0, 3, 1, 3, 0, 2, 2, 1, 0, 3, 3, 1, 0, 2, 2, 3, 0, 1, 3, 2, 0, 1,
    1, 2, 3, 0, 1, 3, 2, 0, 2, 1, 3, 0, 3, 1, 2, 0, 2, 3, 1, 0, 3, 2, 1, 0,
    0, 1, 2, 3, 0, 1, 3, 2, 0, 2, 1, 3, 0, 3, 1, 2, 0, 2, 3, 1, 0, 3, 2, 1,
    1, 0, 2, 3, 1, 0, 3, 2,
];

const u16 = (d: ArrayLike<number>, o: number) => (d[o] | (d[o + 1] << 8)) & 0xffff;
const u32 = (d: ArrayLike<number>, o: number) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
function put16(d: Uint8Array, o: number, v: number) {
    d[o] = v & 0xff;
    d[o + 1] = (v >>> 8) & 0xff;
}
function put32(d: Uint8Array, o: number, v: number) {
    put16(d, o, v & 0xffff);
    put16(d, o + 2, (v >>> 16) & 0xffff);
}

/** XOR 16-bit words of `data[from, to)` in place with the LCRNG seeded by `seed` (its upper halves). */
function crypt(data: Uint8Array, from: number, to: number, seed: number) {
    let s = seed >>> 0;
    for (let i = from; i < to; i += 2) {
        s = (Math.imul(s, 0x41c64e6d) + 0x6073) >>> 0;
        put16(data, i, u16(data, i) ^ (s >>> 16));
    }
}

export function encryptionConstant(data: ArrayLike<number>): number {
    return u32(data, 0);
}

/** Sum of the decrypted stored data's 16-bit words after the header. */
export function checksum(decrypted: ArrayLike<number>): number {
    let sum = 0;
    for (let i = HEADER; i < STORED_SIZE; i += 2) sum = (sum + u16(decrypted, i)) & 0xffff;
    return sum;
}

export function storedChecksum(data: ArrayLike<number>): number {
    return u16(data, 6);
}

/** Whether a decrypted Pokemon's checksum adds up (what the game checks before it shows a Bad Egg). */
export function checksumOk(decrypted: ArrayLike<number>): boolean {
    return checksum(decrypted) === storedChecksum(decrypted);
}

/**
 * The decrypted Pokemon (PARTY_SIZE bytes) from the 232 stored bytes and the 28 party-stat bytes as memory holds them.
 * `stats` may be left out for a boxed Pokemon; its party stats then read as zeroes.
 */
export function decrypt(stored: ArrayLike<number>, stats?: ArrayLike<number> | null): Uint8Array {
    if (stored.length < STORED_SIZE) throw new Error(`pk6: ${stored.length} stored bytes, need ${STORED_SIZE}`);
    const raw = Uint8Array.from(Array.prototype.slice.call(stored, 0, STORED_SIZE));
    const ec = encryptionConstant(raw);
    crypt(raw, HEADER, STORED_SIZE, ec);
    const out = new Uint8Array(PARTY_SIZE);
    out.set(raw.subarray(0, HEADER));
    const sv = (ec >>> 13) & 31;
    for (let b = 0; b < 4; b++) {
        const src = HEADER + BLOCK_POSITION[sv * 4 + b] * BLOCK;
        out.set(raw.subarray(src, src + BLOCK), HEADER + b * BLOCK);
    }
    if (stats) {
        if (stats.length < PARTY_STATS_SIZE) throw new Error(`pk6: ${stats.length} party stat bytes, need ${PARTY_STATS_SIZE}`);
        const party = Uint8Array.from(Array.prototype.slice.call(stats, 0, PARTY_STATS_SIZE));
        crypt(party, 0, PARTY_STATS_SIZE, ec);
        out.set(party, STORED_SIZE);
    }
    return out;
}

/**
 * The bytes memory should hold for a decrypted Pokemon: the stored 232 (with the checksum worked out again) and the
 * party stats' 28. The EC is kept, so the block order and the key stay the ones the game already uses.
 */
export function encrypt(decrypted: ArrayLike<number>): { stored: number[]; stats: number[] } {
    if (decrypted.length < PARTY_SIZE) throw new Error(`pk6: ${decrypted.length} bytes, need ${PARTY_SIZE}`);
    const plain = Uint8Array.from(Array.prototype.slice.call(decrypted, 0, PARTY_SIZE));
    put16(plain, 6, checksum(plain));
    const ec = encryptionConstant(plain);
    const sv = (ec >>> 13) & 31;
    const stored = new Uint8Array(STORED_SIZE);
    stored.set(plain.subarray(0, HEADER));
    for (let b = 0; b < 4; b++) {
        const dst = HEADER + BLOCK_POSITION[sv * 4 + b] * BLOCK;
        stored.set(plain.subarray(HEADER + b * BLOCK, HEADER + (b + 1) * BLOCK), dst);
    }
    crypt(stored, HEADER, STORED_SIZE, ec);
    const stats = plain.slice(STORED_SIZE, PARTY_SIZE);
    crypt(stats, 0, PARTY_STATS_SIZE, ec);
    return { stored: [...stored], stats: [...stats] };
}

// ---------------------------------------------------------------------------------------------------------------
// Reading and changing a decrypted Pokemon

export type StatBlock = { hp: number; attack: number; defense: number; speed: number; special_attack: number; special_defense: number };

export interface Pk6Fields {
    ec: number;
    species: number;
    ability: number;
    abilityNumber: number;
    nature: number;
    fateful: boolean;
    gender: number;
    form: number;
    evs: StatBlock;
    ivs: Ivs;
    isEgg: boolean;
    sanity: number;
    level: number;
    hp: number;
    stats: StatBlock;
}

const STAT_ORDER = ["hp", "attack", "defense", "speed", "special_attack", "special_defense"] as const;

export function readFields(d: ArrayLike<number>): Pk6Fields {
    const iv32 = u32(d, 0x74);
    const flags = d[0x1d];
    const evs = Object.fromEntries(STAT_ORDER.map((k, i) => [k, d[0x1e + i]])) as StatBlock;
    const stats = Object.fromEntries(STAT_ORDER.map((k, i) => [k, u16(d, 0xf2 + 2 * i)])) as StatBlock;
    return {
        ec: u32(d, 0),
        sanity: u16(d, 4),
        species: u16(d, 8),
        ability: d[0x14],
        abilityNumber: d[0x15],
        nature: d[0x1c],
        fateful: (flags & 1) === 1,
        gender: (flags >> 1) & 3,
        form: flags >> 3,
        evs,
        ivs: {
            hp: iv32 & 31,
            atk: (iv32 >>> 5) & 31,
            def: (iv32 >>> 10) & 31,
            spe: (iv32 >>> 15) & 31,
            spa: (iv32 >>> 20) & 31,
            spd: (iv32 >>> 25) & 31,
        },
        isEgg: ((iv32 >>> 30) & 1) === 1,
        level: d[0xec],
        hp: u16(d, 0xf0),
        stats,
    };
}

/** Nature multipliers as gen 5's natures table has them (`nature_attack` ...), 1 for neutral. */
export interface NatureMods {
    nature_attack: number;
    nature_defense: number;
    nature_specialAttack: number;
    nature_specialDefense: number;
    nature_speed: number;
}

/**
 * Gen 3+ stats (unchanged in gens 6 and 7): HP `floor((2B + I + floor(E/4)) * L / 100) + L + 10`, others
 * `floor((floor((2B + I + floor(E/4)) * L / 100) + 5) * nature)`. Shedinja's HP is always 1.
 */
export function calcStats(base: StatBlock, ivs: Ivs, evs: StatBlock, level: number, nature: NatureMods, shedinja = false): StatBlock {
    const core = (b: number, iv: number, ev: number) => Math.floor(((2 * b + iv + Math.floor(ev / 4)) * level) / 100);
    const other = (b: number, iv: number, ev: number, mod: number) => Math.floor((core(b, iv, ev) + 5) * mod);
    return {
        hp: shedinja ? 1 : core(base.hp, ivs.hp, evs.hp) + level + 10,
        attack: other(base.attack, ivs.atk, evs.attack, nature.nature_attack),
        defense: other(base.defense, ivs.def, evs.defense, nature.nature_defense),
        speed: other(base.speed, ivs.spe, evs.speed, nature.nature_speed),
        special_attack: other(base.special_attack, ivs.spa, evs.special_attack, nature.nature_specialAttack),
        special_defense: other(base.special_defense, ivs.spd, evs.special_defense, nature.nature_specialDefense),
    };
}

export interface StarterStamp {
    /** 0-24, the games' nature order (Hardy ... Quirky). */
    nature: number;
    natureMods: NatureMods;
    /** The ability's id and its slot: 0 and 1 the regular abilities, 2 the hidden one. */
    abilityId: number;
    abilitySlot: 0 | 1 | 2;
    /** 0 male, 1 female, 2 genderless. */
    gender: 0 | 1 | 2;
    ivs: Ivs;
    /** The species' base stats (of its form, if it has one). */
    baseStats: StatBlock;
    shedinja?: boolean;
    /** Make it another species (the Solo Pokemon), as the earlier generations' starter choice does. */
    swap?: SpeciesSwap;
}

/**
 * A new species for the Pokemon: what the game would have made had it handed this one over. Its experience is the
 * start of its current level on the new growth rate, its moves the last four it learns by that level (full PP, no
 * PP Ups, no relearn moves), its form the base one, and its name the species' unless the player nicknamed it.
 */
export interface SpeciesSwap {
    species: number;
    exp: number;
    moves: { id: number; pp: number }[];
    name: string;
}

/** The games' own codes for the gender signs in names (as the mappers read them back). */
const NAME_CODES: Record<string, number> = { "♂": 0xe08e, "♀": 0xe08f };
/** A name as the 12 UTF-16 code units at 0x40 (11 characters and the terminator). */
export function encodeName(name: string): number[] {
    const units = [...name].slice(0, 11).map((c) => NAME_CODES[c] ?? c.charCodeAt(0));
    const out = new Array(24).fill(0);
    units.forEach((u, i) => { out[2 * i] = u & 0xff; out[2 * i + 1] = (u >>> 8) & 0xff; });
    return out;
}

/**
 * A copy of the decrypted Pokemon with the starter's choices in it and its stats worked out again from them (at its
 * current level and EVs; current HP keeps the damage taken), and with `swap` its new species. Everything else (EC,
 * PID, OT, ribbons, held item, friendship, the egg and nickname bits) is kept. Call `encrypt` on the result; it works
 * out the checksum.
 */
export function stampStarter(decrypted: ArrayLike<number>, stamp: StarterStamp): Uint8Array {
    const d = Uint8Array.from(Array.prototype.slice.call(decrypted, 0, PARTY_SIZE));
    const swap = stamp.swap;
    if (swap) {
        put16(d, 0x08, swap.species);
        put32(d, 0x10, swap.exp);
        d[0x1d] &= 0x07; // base form
        for (let i = 0; i < 4; i++) {
            const move = swap.moves[i];
            put16(d, 0x5a + 2 * i, move ? move.id : 0);
            d[0x62 + i] = move ? move.pp : 0;
            d[0x66 + i] = 0;
            put16(d, 0x6a + 2 * i, 0);
        }
        if (!((u32(d, 0x74) >>> 31) & 1)) d.set(encodeName(swap.name), 0x40);
    }
    d[0x14] = stamp.abilityId & 0xff;
    d[0x15] = stamp.abilitySlot === 2 ? 4 : stamp.abilitySlot === 1 ? 2 : 1;
    d[0x1c] = stamp.nature;
    d[0x1d] = (d[0x1d] & ~0x06) | ((stamp.gender & 3) << 1);
    const iv = stamp.ivs;
    const keep = u32(d, 0x74) & 0xc0000000;
    const iv32 = ((iv.hp & 31) | ((iv.atk & 31) << 5) | ((iv.def & 31) << 10) | ((iv.spe & 31) << 15) | ((iv.spa & 31) << 20) | ((iv.spd & 31) << 25) | keep) >>> 0;
    put32(d, 0x74, iv32);
    const f = readFields(d);
    const stats = calcStats(stamp.baseStats, stamp.ivs, f.evs, f.level, stamp.natureMods, stamp.shedinja);
    // Current HP keeps the damage already taken (full stays full; a fainted Pokemon stays at 0).
    const damage = Math.max(0, f.stats.hp - f.hp);
    put16(d, 0xf0, f.hp === 0 && f.stats.hp > 0 ? 0 : Math.max(1, stats.hp - damage));
    STAT_ORDER.forEach((k, i) => put16(d, 0xf2 + 2 * i, stats[k]));
    return d;
}

/** Whether a decrypted Pokemon already holds what `stamp` would write (so there is nothing to do). */
export function matchesStamp(decrypted: ArrayLike<number>, stamp: StarterStamp): boolean {
    const f = readFields(decrypted);
    const want = readFields(stampStarter(decrypted, stamp));
    const ivs = (x: Ivs) => [x.hp, x.atk, x.def, x.spe, x.spa, x.spd].join();
    const stats = (x: StatBlock) => STAT_ORDER.map((k) => x[k]).join();
    return f.species === want.species && f.ability === want.ability && f.abilityNumber === want.abilityNumber && f.nature === want.nature && f.gender === want.gender
        && ivs(f.ivs) === ivs(want.ivs) && stats(f.stats) === stats(want.stats);
}

/** Whether a decrypted Pokemon keeps the stamp's choices (species, nature, ability, gender, IVs), whatever its stats, moves or exp now. */
export function keepsChoices(decrypted: ArrayLike<number>, stamp: StarterStamp): boolean {
    const f = readFields(decrypted);
    const want = readFields(stampStarter(decrypted, stamp));
    const ivs = (x: Ivs) => [x.hp, x.atk, x.def, x.spe, x.spa, x.spd].join();
    return f.species === want.species && f.ability === want.ability && f.abilityNumber === want.abilityNumber && f.nature === want.nature && f.gender === want.gender && ivs(f.ivs) === ivs(want.ivs);
}

/** The bytes as hex, for logs. */
export function toHex(bytes: ArrayLike<number>): string {
    return Array.prototype.map.call(bytes, (b: number) => (b & 0xff).toString(16).padStart(2, "0")).join("");
}
