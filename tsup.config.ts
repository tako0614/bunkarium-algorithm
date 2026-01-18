import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  target: 'es2022',
  outDir: 'dist',
  // Bundle everything into a single file
  noExternal: [/.*/],
})
