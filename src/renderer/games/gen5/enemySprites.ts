/**
 * gen5's enemy-sprite scale manager: the shared factory over gen5's own table
 * (`lib/enemy_sprite_scales.js`, converted to JSON by tools/port/port-enemy-scales.ts).
 * Same API the component called on `enemySpriteScaleManager` before; gen5's
 * `lib/enemy_sprite_scale_manager.js` is byte-identical to gen2's.
 */
import { isPackaged } from "~/core/env";
import { createEnemySpriteScaleManager } from "~/core/logic/enemySpriteScales";
import bundledScales from "./data/enemy_sprite_scales.json";

export const enemySpriteScaleManager = createEnemySpriteScaleManager({
    bundled: bundledScales as Record<string, unknown>,
    sourceFile: "games/gen5/data/enemy_sprite_scales.json",
    devMode: () => !isPackaged(),
});
