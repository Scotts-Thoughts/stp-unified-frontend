import PokeData from "~/logic/PokeData";
import { clampDvs, gen12Stat, hpDv, IV_MODE, type Dvs } from "~/core/logic/starterIvs";

/**
 * gen1's manual DVs (2026-09-17): what `games/gen1/hooks.ts` runs when the starter
 * arrives and the species file says `config.dvs.mode` is `Manual`.
 *
 * gen1 has no Hidden Power and no patch byte to ask for a spread, so the ROM patch's
 * starter keeps whatever DVs the patch gives it -- that is `Automatic`, and it writes
 * nothing. `Manual` does what gen3 does at its lab: once the party slot holds the
 * level-5 starter, write the four DV nibbles and the level-5 stats they imply, so the
 * stats do not wait for the first level-up to catch up with the genes. The HP DV is
 * derived from the other four, as the game derives it, and the stat experience is
 * read back rather than assumed to be zero, so a save that is reloaded in the lab
 * after the rival fight recomputes to the same numbers the game would.
 *
 * The two DV bytes are written with `setBits`, one call per byte: the mapper defines
 * each DV as a nibble, and PokeAByte's by-bits endpoint is the one that merges two
 * nibbles into one byte without one write clobbering the other.
 */

export const OAKS_LAB = "Pallet Town - Oak's Lab";

export interface Gen1DvConfig {
    mode: string;
    manual: Partial<Dvs>;
}

/** The party-slot properties the write touches; `game` is the session (`properties` + `setBits`). */
export async function applyManualStarterDvs(game: any, config: Gen1DvConfig, starter: string | null): Promise<boolean> {
    if (config?.mode !== IV_MODE.manual) return false;
    const mon = game?.properties?.player?.team?.[0];
    if (!mon) return false;
    const species = PokeData.findSpecies(mon.species?.value) ?? PokeData.findSpecies(starter);
    if (!species) {
        console.warn(`[gen1] Manual DVs: no pokedex data for ${mon.species?.value ?? starter}; nothing written`);
        return false;
    }

    const dvs = clampDvs(config.manual);
    const level = Number(mon.level?.value) || 5;
    const base = species.base_stats;
    const statExp = (path: string) => Number(mon[path]?.value) || 0;
    const hp = gen12Stat(base.hp, hpDv(dvs), statExp("statExpHp"), level, true);
    const attack = gen12Stat(base.attack, dvs.atk, statExp("statExpAttack"), level, false);
    const defense = gen12Stat(base.defense, dvs.def, statExp("statExpDefense"), level, false);
    const speed = gen12Stat(base.speed, dvs.spe, statExp("statExpSpeed"), level, false);
    const special = gen12Stat(base.special_attack, dvs.spc, statExp("statExpSpecial"), level, false);

    await game.setBits([
        { path: "player.team.0.dvAttack", value: dvs.atk, freeze: false },
        { path: "player.team.0.dvDefense", value: dvs.def, freeze: false },
    ]);
    await game.setBits([
        { path: "player.team.0.dvSpeed", value: dvs.spe, freeze: false },
        { path: "player.team.0.dvSpecial", value: dvs.spc, freeze: false },
    ]);
    // A fresh starter is at full health; keep it that way after the max changes.
    const atFullHealth = Number(mon.hp?.value) === Number(mon.maxHp?.value);
    await Promise.all([
        mon.maxHp.set(hp, false),
        atFullHealth ? mon.hp.set(hp, false) : Promise.resolve(),
        mon.attack.set(attack, false),
        mon.defense.set(defense, false),
        mon.speed.set(speed, false),
        mon.special.set(special, false),
    ]);
    console.log(`[gen1] Manual DVs written: Atk ${dvs.atk} Def ${dvs.def} Spe ${dvs.spe} Spc ${dvs.spc} (HP ${hpDv(dvs)})`);
    return true;
}
