import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: {
        compilerOptions: {
            paths: {
                "@hiveai/*": ["../../*/src"]
            }
        }
    },
    external: ['@hiveai/utils'],
    sourcemap: true,
    clean: true
}); 