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
    ]
  }
})
