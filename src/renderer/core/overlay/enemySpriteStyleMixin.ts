// @ts-nocheck -- verbatim legacy JS lifted from the overlays (see tools/parity/drift-check.ts); type it when it is rewritten, not while it is moved.
/**
 * Enemy-sprite resize handle and dev-mode Style Mode navigation, shared by the four
 * lifted overlays (gens 2-5). Ctrl+Click an enemy team sprite to enter resize mode;
 * drag the corner handle to scale, arrow keys to move (Shift+arrow = 10 px), F1 to
 * flip; Enter commits to the generation's sprite-scale table (dev mode), Escape cancels.
 *
 * Every method here was byte-identical in `games/gen{2,3,4,5}/Overlay.vue` and was
 * moved out unchanged (tools/parity/drift-check.ts is the proof: it compares the
 * overlays' remaining members, and an overlay that overrides one of these in its own
 * `methods` is a difference it asks a reason for). The state the methods read and write
 * stays in each overlay's `data()` -- `enemyResize`, `enemyScaleVersion`,
 * `style_mode_active`, `style_mode_index`, `style_mode_species_list`,
 * `enemy_sprite_styles_enabled` -- as do the two members that differ per generation:
 * `isInDevMode` (a computed) and `_styleModeBuildList()`, which each generation builds
 * from its own species tables. The scale manager is the generation's own
 * (`games/genN/enemySprites.ts`, one table per generation), passed in by the overlay:
 * `mixins: [enemySpriteStyleMixin({ enemySpriteScaleManager })]`.
 */

import type { EnemySpriteScaleManager } from "~/core/logic/enemySpriteScales";
import type { ComponentOptionsMixin } from "vue";

export function enemySpriteStyleMixin({ enemySpriteScaleManager }: { enemySpriteScaleManager: EnemySpriteScaleManager }) {
    return {
        methods: {
            _getAppScale() {
                const el = document.getElementById('app-container');
                if (!el) return 1;
                const t = getComputedStyle(el).transform;
                if (!t || t === 'none') return 1;
                const m = t.match(/matrix\(([^)]+)\)/);
                if (m) {
                    const parts = m[1].split(',').map(s => parseFloat(s));
                    if (!Number.isNaN(parts[0]) && parts[0] > 0) return parts[0];
                }
                return 1;
            },
            onEnemyResizeHandleMouseDown(event) {
                if (!this.enemyResize.species) return;
                event.preventDefault();
                event.stopPropagation();
                const startX = event.clientX;
                const startY = event.clientY;
                const baseSize = this.enemyResize.baseSize;
                const species = this.enemyResize.species;
                const startScale = enemySpriteScaleManager.getScale(species);
                const startWidth = baseSize * startScale;
                const appScale = this._getAppScale();
                const onMove = (ev) => {
                    const dx = ev.clientX - startX;
                    const dy = ev.clientY - startY;
                    const delta = (dx + dy) / 2;
                    const designDelta = appScale > 0 ? delta / appScale : delta;
                    const newWidth = Math.max(20, startWidth + designDelta);
                    const newScale = newWidth / baseSize;
                    enemySpriteScaleManager.setLive(species, { scale: newScale });
                    this.enemyScaleVersion++;
                };
                const onUp = () => {
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
            },
            enemySpriteHandlePosition() {
                // eslint-disable-next-line no-unused-expressions
                this.enemyScaleVersion;
                const slot = this.enemyResize.slot;
                if (slot == null) return null;
                const sprite = document.querySelector(`.ePkmnSprite[data-enemy-slot="${slot}"]`);
                if (!sprite) return null;
                const rect = sprite.getBoundingClientRect();
                return { left: (rect.right - 8) + 'px', top: (rect.bottom - 8) + 'px' };
            },
            commitEnemySpriteResize() {
                if (!this.enemyResize.species) return;
                enemySpriteScaleManager.commit(this.enemyResize.species);
                this.enemyResize = { species: null, slot: null, baseSize: 108, spriteEl: null };
                this.enemyScaleVersion++;
            },
            cancelEnemySpriteResize() {
                if (!this.enemyResize.species) return;
                enemySpriteScaleManager.clearOverride(this.enemyResize.species);
                this.enemyResize = { species: null, slot: null, baseSize: 108, spriteEl: null };
                this.enemyScaleVersion++;
            },
            getEnemySpriteScale(species) {
                // eslint-disable-next-line no-unused-expressions
                this.enemyScaleVersion;
                return enemySpriteScaleManager.getScale(species);
            },
            getEnemySpriteXOffset(species) {
                // eslint-disable-next-line no-unused-expressions
                this.enemyScaleVersion;
                return enemySpriteScaleManager.getXOffset(species);
            },
            getEnemySpriteYOffset(species) {
                // eslint-disable-next-line no-unused-expressions
                this.enemyScaleVersion;
                return enemySpriteScaleManager.getYOffset(species);
            },
            getEnemySpriteFlipped(species) {
                // eslint-disable-next-line no-unused-expressions
                this.enemyScaleVersion;
                return enemySpriteScaleManager.getFlipped(species);
            },
            nudgeEnemySpriteX(deltaPx) {
                if (!this.enemyResize.species) return;
                const cur = enemySpriteScaleManager.getXOffset(this.enemyResize.species);
                enemySpriteScaleManager.setLive(this.enemyResize.species, { xOffset: cur + deltaPx });
                this.enemyScaleVersion++;
            },
            nudgeEnemySpriteY(deltaPx) {
                if (!this.enemyResize.species) return;
                const cur = enemySpriteScaleManager.getYOffset(this.enemyResize.species);
                enemySpriteScaleManager.setLive(this.enemyResize.species, { yOffset: cur + deltaPx });
                this.enemyScaleVersion++;
            },
            toggleEnemySpriteFlip() {
                if (!this.enemyResize.species) return;
                const cur = enemySpriteScaleManager.getFlipped(this.enemyResize.species);
                enemySpriteScaleManager.setLive(this.enemyResize.species, { flipped: !cur });
                this.enemyScaleVersion++;
            },
            enemyTransformFor(species) {
                // Dev-mode escape hatch: when the styles toggle is off, render at native size/position
                // so footage stays congruent with content filmed before the resize feature shipped.
                // Packaged builds ignore the toggle and always apply styles. Style Mode also overrides
                // the toggle so the user can see what they're editing.
                if (this.isInDevMode && !this.enemy_sprite_styles_enabled && !this.style_mode_active) {
                    return 'none';
                }
                const s = this.getEnemySpriteScale(species);
                const x = this.getEnemySpriteXOffset(species);
                const y = this.getEnemySpriteYOffset(species);
                const sx = this.getEnemySpriteFlipped(species) ? -s : s;
                return `translate(${x}px, ${y}px) scale(${sx}, ${s})`;
            },
            enterStyleMode() {
                if (!this.isInDevMode) return;
                const list = this._styleModeBuildList();
                if (list.length === 0) return;
                this.style_mode_species_list = list;
                this.style_mode_index = 0;
                this.style_mode_active = true;
                this.$nextTick(() => this._styleModeFocusCurrent());
            },
            exitStyleMode() {
                const species = this.styleModeCurrentSpecies();
                if (species) enemySpriteScaleManager.clearOverride(species);
                this.style_mode_active = false;
                this.style_mode_species_list = [];
                this.style_mode_index = 0;
                this.enemyResize = { species: null, slot: null, baseSize: 108, spriteEl: null };
                this.enemyScaleVersion++;
            },
            styleModeCurrentSpecies() {
                if (!this.style_mode_active) return null;
                return this.style_mode_species_list[this.style_mode_index] ?? null;
            },
            _styleModeFocusCurrent() {
                const species = this.style_mode_species_list[this.style_mode_index];
                if (!species) return;
                this.enemyResize = { species, slot: 0, baseSize: 108, spriteEl: null };
                this.enemyScaleVersion++;
            },
            styleModeAdvance() {
                if (!this.style_mode_active) return;
                const species = this.styleModeCurrentSpecies();
                if (species) {
                    enemySpriteScaleManager.commit(species);
                }
                if (this.style_mode_index + 1 >= this.style_mode_species_list.length) {
                    this.exitStyleMode();
                    return;
                }
                this.style_mode_index++;
                this.$nextTick(() => this._styleModeFocusCurrent());
            },
            styleModeBack() {
                if (!this.style_mode_active) return;
                const species = this.styleModeCurrentSpecies();
                if (species) enemySpriteScaleManager.clearOverride(species);
                if (this.style_mode_index === 0) {
                    this._styleModeFocusCurrent();
                    return;
                }
                this.style_mode_index--;
                this.$nextTick(() => this._styleModeFocusCurrent());
            },
        },
    } satisfies ComponentOptionsMixin;
}
