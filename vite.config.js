import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        tsushimaForest: resolve(import.meta.dirname, 'tsushima-forest.html'),
        ghibliForest: resolve(import.meta.dirname, 'ghibli_anime_forest_walking_simulator.html'),
        goldenAutumn: resolve(import.meta.dirname, 'golden-autumn-sanctuary.html'),
      },
    },
  },
})
