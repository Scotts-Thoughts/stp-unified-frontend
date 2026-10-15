import { toDisplayString, type StyleValue } from "vue";

/**
 * What `EnemyTeamPanel.ts` draws: one plain object per generation, built by one computed in that generation
 * (gen1's `view` in `components/right_panel/enemy_graphic.vue`, gens 2-5's `enemy_team_view` in
 * `games/genN/Overlay.vue`, both from `games/genN/enemyPanel.ts`). Every game rule (stat stages, badge boosts,
 * who moves first, which data a slot reads before the battle starts) is applied there, each value once per change;
 * the generation's layout only places the values.
 *
 * Values are shown the way the old templates interpolated them (`{{ value }}`), so `undefined` prints nothing and a
 * mapper property object prints its value ("null" when it has none).
 */

/** The speed label and its picture's colour (core/logic/speedLabel.ts). */
export interface EnemySpeedView {
    label: string;
    /** `blue-svg`, `yellow-svg`, `red-svg` or `grey-svg`. */
    svgClass: string;
}

export interface EnemyMoveView {
    /** The move's name as shown. */
    name: unknown;
    /** The type icon's picture. */
    icon?: string;
    /** The move is known (its icon, or its row, is drawn). */
    known: boolean;
}

export interface EnemyStatView {
    /** The value as shown. */
    value: unknown;
    /** The label's style: its opacity shows a stat stage, the slot not being out, or a faint. */
    labelStyle?: StyleValue;
    /** The stat stage badge ("+1", "-2"), if the generation shows one for this stat. */
    stage?: { text: unknown; shown: boolean };
}

/** One Pokémon of the enemy team. */
export interface EnemySlotView {
    /** Party slot, from 0. */
    slot: number;
    species: unknown;
    level: unknown;
    /** gens 3-5. */
    ability?: unknown;
    moves: EnemyMoveView[];
    /** In the generation's label order. */
    stats: EnemyStatView[];
    speed: EnemySpeedView;
    /** The sprite: its picture, inline style, the species the resize tool reads (`data-enemy-species`), and whether
     * it is the one being resized (`ePkmnSpriteResizing`). */
    sprite: { src: string; style?: StyleValue; species?: unknown; resizing?: boolean };
}

export interface EnemyTeamView<Slot extends EnemySlotView = EnemySlotView> {
    /** The header: "Brock's Team", "Double Battle Team"... */
    trainer: unknown;
    /** The panel art's style: its height cut to the team size, and the overlay's tint. */
    crop: StyleValue;
    slots: Slot[];
    /** The speed label is shown (gens 1-3 keep a flag for it; no control sets it). */
    speedShown?: boolean;
}

// The one wording and faint look of the enemy panel in all five generations (docs/ui-uniformity-plan.md decision 26).

/** The stat labels (gen1 keeps its single "Spc." and its "Crit.": game quirks). */
export const ENEMY_STAT_LABELS = { hp: "HP", attack: "Atk.", defense: "Def.", special_attack: "SpA.", special_defense: "SpD.", speed: "Spe." } as const;

/** The level as the panel shows it: "Lv:12". */
export function enemyLevelText(level: unknown): string {
    return "Lv:" + toDisplayString(level);
}

/** A fainted Pokémon's text (its name, level, moves, stats, labels). */
export const FAINTED_TEXT = "opacity: .5";
/** A fainted Pokémon's pictures: greyscale at half opacity. */
export const FAINTED_PICTURE = "filter: grayscale(100%); opacity: .5;";
