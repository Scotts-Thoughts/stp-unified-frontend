/**
 * gen2's enemy-sprite scale manager: the shared factory over gen2's own table
 * (`lib/enemy_sprite_scales.js`, converted to JSON by the port). Same API the
 * component called on `enemySpriteScaleManager` before.
 */
import { isPackaged } from "~/core/env";
import { createEnemySpriteScaleManager } from "~/core/logic/enemySpriteScales";
import bundledScales from "./data/enemy_sprite_scales.json";

export const enemySpriteScaleManager = createEnemySpriteScaleManager({
    bundled: bundledScales as Record<string, unknown>,
    sourceFile: "games/gen2/data/enemy_sprite_scales.json",
    devMode: () => !isPackaged(),
});
