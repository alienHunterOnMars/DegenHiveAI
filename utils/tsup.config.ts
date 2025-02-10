import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm'],
  dts: {
    entry: {
      index: 'src/index.ts',
      parsing: 'src/parsing.ts'
    },
    compilerOptions: {
      moduleResolution: "node",
      composite: false,
      incremental: false
    }
  },
  clean: true,
  sourcemap: true,
  treeshake: true
});
