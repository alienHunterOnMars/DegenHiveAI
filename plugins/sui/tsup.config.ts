import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    outDir: 'dist',
    format: ['esm'],
    dts: {
        compilerOptions: {
            composite: false,
            incremental: false,
            tsBuildInfoFile: undefined
        }
    },
    sourcemap: true,
    clean: true,
    external: ['@hiveai/utils', '@hiveai/plugin-trustdb']
}); 