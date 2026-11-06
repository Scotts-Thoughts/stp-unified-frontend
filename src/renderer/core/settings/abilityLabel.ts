/** The Ability dropdown's label: which of the species' abilities is picked, "Ability (1/2)". */
export function abilityLabel(current: unknown, abilities: readonly unknown[]): string {
    if (abilities.length === 0) return "Ability";
    const index = abilities.findIndex((ability) => String(ability) === String(current));
    return `Ability (${index === -1 ? "-" : index + 1}/${abilities.length})`;
}
