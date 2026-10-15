import { resolve } from 'path';
import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync } from 'fs';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import vue from '@vitejs/plugin-vue';

/**
 * The image pool is not copied into `out/` on every build (plan Phase 4): it is
 * ~3 GB across the five generations, and Vite's public-dir copy would make a 12 s
 * build a multi-minute one. `copyPublicDir: false` keeps Vite off it, and this plugin
 * leaves `out/renderer/images` as a junction to `src/renderer/public/images` instead --
 * the same document-relative `images/...` URL the renderer has always used, resolving
 * to the same files. The dev server needs nothing: Vite serves `public/` itself.
 */
function imagePoolJunction() {
  return {
    name: 'stp-image-pool-junction',
    apply: 'build',
    closeBundle() {
      const link = resolve('out/renderer/images');
      const target = resolve('src/renderer/public/images');
      mkdirSync(resolve('out/renderer'), { recursive: true });
      if (existsSync(link)) {
        if (lstatSync(link).isSymbolicLink() || lstatSync(link).isDirectory()) rmSync(link, { recursive: true, force: true });
      }
      symlinkSync(target, link, 'junction');
    },
  };
}

/**
 * Files the app writes back into its own source tree in dev mode: gen2-5 style edits
 * (`games/genN/data/style/*.json`, and gen3's species file on every mount) and the
 * enemy sprite tables (every Enter in the resize tool / Style Mode). They are modules,
 * and nothing on their import chain accepts an HMR update, so each write would be a
 * full page reload (overlay -> "Please load a mapper" -> boot again) or, for the
 * sprites, a remount that leaves Style Mode with no resize handle. The writer has
 * already updated the in-memory table, so the update is dropped here.
 *
 * Don't put these paths in `server.watch.ignored` instead: Vite would then never
 * invalidate its cached copy, and every reload until the dev server restarts would get
 * the table as it was at startup -- and the next sprite commit would write that stale
 * table back over the file.
 */
const SELF_WRITTEN = /\/src\/renderer\/(?:games\/[^/]+\/data\/(?:style\/|enemy_sprite_scales\.json$)|data\/enemy_sprite_scales\.json$)/;

function suppressSelfWrittenHmr() {
  return {
    name: 'stp-suppress-self-written-hmr',
    apply: 'serve',
    enforce: 'post',
    hotUpdate({ file }) {
      if (SELF_WRITTEN.test(file.replace(/\\/g, '/'))) return [];
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    base: "/",
    assetsInclude: ['**/*.svg', '**/*.png'],
    build: {
      copyPublicDir: false,
      // Two pages: the overlay, and the Keyboard Shortcuts window (src/main/hotkeys.ts),
      // which main opens as its own BrowserWindow so it never shows up in the OBS capture.
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          shortcuts: resolve('src/renderer/shortcuts.html'),
        },
      },
    },
    resolve: {
      alias: {
        '~': resolve('src/renderer'),
      }
    },
    plugins: [
      vue({
        template: {
          compilerOptions: {},
          // The lifted gen2-5 templates carry the legacy `src="images/..."` references
          // (as `images/genN/...`, see tools/port/lift_assets.py); they resolve at
          // runtime against the document, not through the bundler. gen1's SFCs never
          // relied on the transform: every static asset there is root-absolute or a
          // binding, which the transform leaves alone.
          transformAssetUrls: false,
        },
      }),
      imagePoolJunction(),
      suppressSelfWrittenHmr(),
    ]
  }
})
