import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm'],
  noExternalLocal: true,
  splitting: false,
  sourcemap: false,
  minify: false,
  clean: true,
})
