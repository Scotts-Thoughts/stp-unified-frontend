/**
 * gen1's enemy-sprite scale manager: the shared factory in
 * `core/logic/enemySpriteScales.ts` over gen1's bundled table (plan 2.4). The API and
 * the module name are unchanged so the store and the resize handle keep importing it.
 */
import { createEnemySpriteScaleManager } from "~/core/logic/enemySpriteScales";
import bundledScales from "./enemy_sprite_scales.json";

export type { EnemySpriteEntry } from "~/core/logic/enemySpriteScales";

export const enemySpriteScaleManager = createEnemySpriteScaleManager({
    bundled: bundledScales as Record<string, unknown>,
    /** Relative to `src/renderer`, the root `source:write` resolves against. */
    sourceFile: "data/enemy_sprite_scales.json",
});
