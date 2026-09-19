import { enemySpriteScaleManager } from "../data/enemy_sprite_scale_manager";

export function get_enemy_pkmn_styles(pkmnData) {
    const isFainted = pkmnData?.hp.value == 0;
    // CSS applies `filter` before `transform`, so a horizontally flipped sprite
    // mirrors the drop-shadow's X offset onto the wrong side. Negate it so the
    // shadow always falls bottom-right regardless of flip.
    const flipped = enemySpriteScaleManager.getFlipped(pkmnData?.species?.value ?? pkmnData?.species);
    const shadowX = flipped ? -2 : 2;
    return {
      faint: isFainted
        ? `filter: drop-shadow(${shadowX}px 2px 2px #000) saturate(1.3) grayscale(100%); opacity: .5;`
        : `filter: drop-shadow(${shadowX}px 2px 2px #000) saturate(1.3) grayscale(0%);`,
      faint_stats_background: isFainted
        ? "filter: grayscale(100%); opacity: .3;"
        : "filter: grayscale(0%);",
      faintStats: isFainted
        ? "filter: grayscale(100%); opacity: .4;"
        : "filter: grayscale(0%);",
      text: isFainted ? "opacity: .3" : "",
      species: isFainted ? "opacity: .3" : "opacity: .7"
    };
}
