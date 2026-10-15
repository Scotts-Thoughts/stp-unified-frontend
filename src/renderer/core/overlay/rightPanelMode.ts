/**
 * The right panel's mode (docs/ui-uniformity-plan.md decision 27, plan step 5.2): gen1's model in all five generations.
 *
 * - A saved **preference**: Automatic, Movepool, Splits or Trainers (the same four, in that order, everywhere).
 *   Automatic shows the enemy team in trainer battles (and the wild panel in wild battles when "Show Wild Battles" is
 *   on, decision 30), else the movepool; Movepool and Splits always show that; Trainers previews a trainer's team
 *   outside a trainer battle (decision 14).
 * - A transient **override**: the post-battle Splits switch ("Automatic Post-Battle Splits"). It is shown over the
 *   preference until the generation's own moment to end it (the next trainer battle, mostly), and is never saved:
 *   a restart opens on the preference again.
 *
 * Each generation keeps its saved key (gen1 `visualization.right_panel.mode` in its settings store, gens 2-3
 * `right_panel`, gens 4-5 `right_ui`); values saved by the old apps are read through `readRightPanelMode`.
 * gen1 holds the model in `stores/useOverlaySettingsStore.ts`; gens 2-5 use `rightPanelModeMixin`.
 */

export const RIGHT_PANEL_MODES = ["Automatic", "Movepool", "Splits", "Trainers"] as const;
export type RightPanelModeName = typeof RIGHT_PANEL_MODES[number];

/**
 * A saved or sent value as a mode. Old values: "Battle Graphic" (gens 2-3), "Inventory" and "Movepool+" (gen3, gen2's
 * F18) are Automatic; "Wild" (gen3, written at each wild battle while "Show Wild Battles" was on) is Automatic with the
 * wild panel on (`wild: true`). Anything else unknown is Automatic too.
 */
export function readRightPanelMode(value: unknown): { mode: RightPanelModeName; wild: boolean } {
    if ((RIGHT_PANEL_MODES as readonly unknown[]).includes(value)) return { mode: value as RightPanelModeName, wild: false };
    return { mode: "Automatic", wild: value === "Wild" };
}

/** The mode shows the battle panels (enemy team, wild panel) during a battle. */
export function showsBattle(mode: unknown): boolean {
    return mode === "Automatic" || mode === "Trainers";
}

/**
 * The model for the lifted overlays (gens 2-5). `key` is the overlay's saved preference field (`right_panel` or
 * `right_ui`); the overlay keeps it in its `data()` and its saving as before, and the wild-panel switch in
 * `show_wild_battles`.
 * - `right_panel_mode`: what the panel shows now (the override, else the preference). Templates test this.
 * - `set_right_panel(value)`: the operator's pick (settings panel, shortcut, `/set-right-panel`): the mapped value
 *   becomes the preference and a post-battle Splits gives way, as the old apps' overwrite did.
 * - `show_post_battle_splits()` / `clear_right_panel_override()`: the post-battle switch and its end.
 */
export function rightPanelModeMixin(key: "right_panel" | "right_ui") {
    return {
        data() {
            return { right_panel_override: null as RightPanelModeName | null };
        },
        computed: {
            right_panel_mode(this: any): string {
                return this.right_panel_override ?? this[key];
            },
        },
        methods: {
            set_right_panel(this: any, value: unknown): RightPanelModeName {
                const { mode, wild } = readRightPanelMode(value);
                if (wild) this.show_wild_battles = true;
                this.right_panel_override = null;
                this[key] = mode;
                return mode;
            },
            show_post_battle_splits(this: any) {
                this.right_panel_override = "Splits";
            },
            clear_right_panel_override(this: any) {
                this.right_panel_override = null;
            },
        },
    };
}
