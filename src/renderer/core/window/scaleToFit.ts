/**
 * The 16:9 scaling script gen2, gen4 and gen5 carry at the bottom of their
 * `index.html`, byte-identical in all three (plan 3.4, brought forward for the
 * lifts): `#app-container` is a fixed 1920x1080 design surface, and the script scales
 * it to fit whatever the window is, from `load` and on every `resize`.
 *
 * Ported verbatim as a module presentation flag (`GameModule.scaleToFit`): the shell
 * installs it when such a module activates and removes it when the module leaves.
 * In a 1920x1080 window it sets `transform: scale(1)`, the same value the stylesheet's
 * fallback rule gives; in any other window it is what keeps the overlay 16:9, which
 * the stylesheet alone does not.
 */

const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;

let installed: (() => void) | null = null;

export function installScaleToFit(): void {
    if (installed) return;
    const appContainer = document.getElementById('app-container');

    function updateScale() {
        if (!appContainer) return;

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Calculate scale based on both dimensions, use the smaller one to maintain aspect ratio
        const scaleX = viewportWidth / DESIGN_WIDTH;
        const scaleY = viewportHeight / DESIGN_HEIGHT;
        const scale = Math.min(scaleX, scaleY);

        appContainer.style.transform = `scale(${scale})`;
    }

    // Update scale on load and resize
    window.addEventListener('load', updateScale);
    window.addEventListener('resize', updateScale);

    // Initial scale
    updateScale();

    installed = () => {
        window.removeEventListener('load', updateScale);
        window.removeEventListener('resize', updateScale);
        if (appContainer) appContainer.style.transform = "";
    };
}

export function removeScaleToFit(): void {
    installed?.();
    installed = null;
}
