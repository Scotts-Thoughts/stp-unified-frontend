import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import vue from '@vitejs/plugin-vue';

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
    ]
  }
})
