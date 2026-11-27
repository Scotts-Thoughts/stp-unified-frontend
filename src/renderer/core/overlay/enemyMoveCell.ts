import type { StyleValue } from "vue";
import type { EnemyNode } from "./EnemyTeamPanel";
import type { EnemyMoveView } from "./enemyTeamView";
import { koParts } from "./player/MoveList";

/**
 * An enemy move's name cell, every generation's enemy panel: just the name, as before, or in a battle the name over
 * a small damage line, "41–49% · 3HKO" (core/damage; the KO chance smaller still). `withDamage` makes the cell a
 * two-line box (core/styles/enemyPanel.css); each generation's style.css sets its height to the row's.
 */
export function enemyMoveCell(cls: string, move: EnemyMoveView, style?: StyleValue): EnemyNode {
    const d = move.damage;
    const base: EnemyNode = style === undefined ? { class: cls } : { class: cls, style };
    if (!d || (!d.pct && !d.ko)) return { ...base, text: move.name };
    const [count, chance] = koParts(d.ko);
    const line: (EnemyNode | string)[] = [d.pct];
    if (count) line.push(d.pct ? ` · ${count}` : count);
    if (chance) line.push({ tag: "span", class: "koChance", text: ` ${chance}` });
    return { ...base, class: `${cls} withDamage`, children: [
        { class: "ePkmnMoveName", text: move.name },
        { class: "ePkmnMoveDamage", children: line },
    ] };
}

/** `MoveDamage[]` (core/damage/calc.ts) → the move views' `damage`. */
export function enemyDamageOf(list: readonly ({ short: string; ko: string } | null)[] | null, i: number): EnemyMoveView["damage"] {
    const d = list?.[i];
    return d ? { pct: d.short, ko: d.ko } : null;
}
