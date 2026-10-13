/**
 * The status a gen1 Pokémon carries into battle: pokered LoadBattleMonFromParty calls
 * ApplyBurnAndParalysisPenaltiesToPlayer (paralysis quarters Speed, burn halves Attack, each at
 * least 1) before ApplyBadgeStatBoosts. The out-of-battle panels preview the battle stats, so they
 * apply it the same way, before the badge boost.
 */
export function status_penalty(stat_name: string, stat: number, status: string | null | undefined): number {
    if (stat == null) return stat;
    if (stat_name === "Speed" && status === "Paralyzed") return Math.max(1, Math.floor(stat / 4));
    if (stat_name === "Attack" && status === "Burned") return Math.max(1, Math.floor(stat / 2));
    return stat;
}
